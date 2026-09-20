#!/usr/bin/env node
/**
 * Calibracion sobre un corpus PROPIO (grabaciones con referencia): lo que FLEURS no mide.
 *
 *   node medicion/calibra.mjs [--corpus medicion/corpus-propio/sintetico] [--frases medicion/corpus-propio/frases.txt] [--salida medicion/corpus-propio]
 *
 * Los archivos se llaman `<condicion>-NN.wav` (limpio-01.wav, ruido-01.wav, celular-01.wav) y la
 * frase NN de `frases.txt` es su referencia. Mide, por condicion:
 *   A) WER/CER y latencia del motor (lo que un usuario vive);
 *   B) el VAD: con cada cierre por silencio y relleno, cuantas frases se parten, cuantas quedan sin
 *      voz, y si el corte se come palabras (WER de los turnos cortados vs. el archivo entero);
 *      y la puerta de energia: cuantos turnos «fantasma» abre el VAD sobre ruido sin voz por umbral;
 *   C) la correccion por similitud del diccionario: sustituciones que arreglan vs. que rompen.
 * Deja `calibracion-<fecha>.json` y `.md`. Los valores por defecto se cambian con bitacora, no aqui.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const corpus = resolve(arg('corpus', join(raiz, 'medicion', 'corpus-propio', 'sintetico')));
const frases = readFileSync(resolve(arg('frases', join(raiz, 'medicion', 'corpus-propio', 'frases.txt'))), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
const salida = resolve(arg('salida', join(raiz, 'medicion', 'corpus-propio')));
const banco = join(raiz, 'medicion', 'banco');
const config = { datos: process.env.DICTADO_DATOS ?? join(banco, 'datos'), modelos: process.env.DICTADO_MODELOS ?? join(banco, 'modelos'), runtime: process.env.DICTADO_RUNTIME ?? banco, python: 'python3', hilos: 8, remoto: { url: undefined, token: undefined }, describe: () => '' };

const nucleo = await import(pathToFileURL(join(raiz, 'dist', 'index.js')).href);
const nodo = await import(pathToFileURL(join(raiz, 'dist', 'node', 'index.js')).href);
const motores = await import(pathToFileURL(join(raiz, 'dist', 'node', 'cli-motores.js')).href);
const { wer: werCrudo, cer, percentil, creaDiccionario, normalizaParaComparar } = nucleo;

/**
 * El motor escribe cifras («3412», «12 %») y las referencias dictadas las llevan en palabras
 * («tres mil cuatrocientos doce»): sin igualarlas, el WER cuenta como error lo que un lector no
 * notaria. Se comparan las dos formas: crudo (como sale) y con numeros en cifras.
 */
const UNIDADES = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29 };
const DECENAS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
const CENTENAS = { cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 };
const sinAcentos = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function numerosACifras(texto) {
  const tokens = sinAcentos(texto.toLowerCase()).replace(/[^a-z0-9ñ%\s]/g, ' ').split(/\s+/).filter(Boolean);
  const salida = [];
  let i = 0;
  while (i < tokens.length) {
    let j = i, total = 0, parcial = 0, visto = false;
    while (j < tokens.length) {
      const t = tokens[j];
      if (t === 'mil' && (visto || j === i)) { total += (parcial || 1) * 1000; parcial = 0; visto = true; j++; continue; }
      if (CENTENAS[t] !== undefined) { parcial += CENTENAS[t]; visto = true; j++; continue; }
      if (DECENAS[t] !== undefined) { parcial += DECENAS[t]; visto = true; j++; if (tokens[j] === 'y' && UNIDADES[tokens[j + 1]] !== undefined) { parcial += UNIDADES[tokens[j + 1]]; j += 2; } continue; }
      if (UNIDADES[t] !== undefined && !(t === 'un' || t === 'una' || t === 'uno')) { parcial += UNIDADES[t]; visto = true; j++; continue; }
      break;
    }
    if (visto) { salida.push(String(total + parcial)); i = j; } else { salida.push(tokens[i]); i++; }
  }
  return salida.join(' ').replace(/(\d+) por ciento/g, '$1 %').replace(/(\d+)\s*%/g, '$1 %');
}
const werCifras = (ref, hip) => werCrudo(numerosACifras(ref), numerosACifras(hip));

const archivos = readdirSync(corpus).filter((n) => /^[a-z]+-\d+\.wav$/.test(n)).sort();
const condiciones = [...new Set(archivos.map((n) => n.split('-')[0]))];
const referenciaDe = (nombre) => frases[Number(nombre.match(/-(\d+)\.wav$/)[1]) - 1];
console.log(`corpus: ${archivos.length} archivos · condiciones: ${condiciones.join(', ')} · ${frases.length} frases de referencia`);

const motor = await motores.creaMotor(arg('motor', 'parakeet'), config, 'es');
await motor.calienta?.();
const audios = new Map();
for (const n of archivos) audios.set(n, await nodo.leeAudio(join(corpus, n)));

// ---------- A) WER y latencia por condicion ----------
const A = {};
const transcripciones = new Map();
for (const c of condiciones) {
  const pares = []; const ms = [];
  for (const n of archivos.filter((x) => x.startsWith(`${c}-`))) {
    const a = audios.get(n);
    const t0 = performance.now();
    const r = await motor.transcribe(a.muestras, a.frecuenciaHz, { idioma: 'es' });
    ms.push(performance.now() - t0);
    transcripciones.set(n, r.texto);
    pares.push({ referencia: referenciaDe(n), hipotesis: r.texto });
  }
  const w = nucleo.werAcumulado(pares);
  const wc = nucleo.werAcumulado(pares.map((p) => ({ referencia: numerosACifras(p.referencia), hipotesis: numerosACifras(p.hipotesis) })));
  const cs = pares.map((p) => cer(p.referencia, p.hipotesis));
  A[c] = { n: pares.length, wer: +w.wer.toFixed(4), werCifras: +wc.wer.toFixed(4), cer: +(cs.reduce((s, x) => s + x.errores, 0) / Math.max(1, cs.reduce((s, x) => s + x.palabras, 0))).toFixed(4), p50Ms: Math.round(percentil(ms, 50)), p95Ms: Math.round(percentil(ms, 95)) };
  console.log(`A ${c}: WER ${(A[c].wer * 100).toFixed(1)} % (con cifras igualadas ${(A[c].werCifras * 100).toFixed(1)} %) · CER ${(A[c].cer * 100).toFixed(1)} % · p50 ${A[c].p50Ms} ms`);
}

// ---------- B) VAD: cierre por silencio y relleno; puerta de energia ----------
const ort = await motores.cargaOrt(config);
const rutaVad = join(config.modelos, 'silero_vad.onnx');
const B = [];
const picoDb = (m) => { let max = -Infinity; const v = Math.max(1, Math.round(16000 * 0.03)); for (let i = 0; i < m.length; i += v) max = Math.max(max, nodo.nivelDb(m.subarray(i, i + v))); return max; };
for (const silencioMs of [500, 700, 1000, 1500]) {
  for (const msRelleno of [100, 250, 400]) {
    let partidas = 0, sinVoz = 0, comidas = 0, total = 0;
    for (const c of ['limpio', 'ruido']) {
      for (const n of archivos.filter((x) => x.startsWith(`${c}-`))) {
        const a = audios.get(n);
        const det = await nodo.creaDetectorSilero({ ort, rutaModelo: rutaVad, msSilencioParaCerrar: silencioMs, msRelleno });
        const eventos = [...(await det.procesa(a.muestras)), ...(await det.cierra())];
        const turnos = eventos.filter((e) => e.tipo === 'finHabla').map((e) => e.turno);
        total += 1;
        if (turnos.length === 0) { sinVoz += 1; continue; }
        if (turnos.length > 1) partidas += 1;
        // ¿el corte se comio palabras? transcribir los turnos cortados y comparar con el archivo entero
        const largo = turnos.reduce((s, t) => s + t.audio.length, 0);
        const junto = new Float32Array(largo); let pos = 0;
        for (const t of turnos) { junto.set(t.audio, pos); pos += t.audio.length; }
        const r = await motor.transcribe(junto, 16000, { idioma: 'es' });
        const werCorte = werCifras(referenciaDe(n), r.texto).wer;
        const werEntero = werCifras(referenciaDe(n), transcripciones.get(n) ?? '').wer;
        if (werCorte > werEntero + 1e-9) comidas += 1;
      }
    }
    B.push({ silencioMs, msRelleno, n: total, partidas, sinVoz, comidas, fraccionPartidas: +(partidas / total).toFixed(3), fraccionComidas: +(comidas / total).toFixed(3) });
    console.log(`B cierre ${silencioMs} ms · relleno ${msRelleno} ms: partidas ${partidas}/${total} · sin voz ${sinVoz} · con palabras comidas ${comidas}`);
  }
}
// puerta de energia: turnos fantasma sobre ruido sin voz (ruido rosa a varios niveles, 6 s)
const fantasmas = [];
const ruidoA = (db) => { const m = new Float32Array(16000 * 6); const amp = 10 ** (db / 20); let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < m.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.997 * b0 + 0.029591 * w; b1 = 0.985 * b1 + 0.032534 * w; b2 = 0.95 * b2 + 0.048056 * w; m[i] = (b0 + b1 + b2 + w * 0.1848) * amp * 0.3; } return m; };
for (const nivelDb of [-60, -50, -45, -40, -35]) {
  const det = await nodo.creaDetectorSilero({ ort, rutaModelo: rutaVad, msSilencioParaCerrar: 1000 });
  const eventos = [...(await det.procesa(ruidoA(nivelDb))), ...(await det.cierra())];
  const turnos = eventos.filter((e) => e.tipo === 'finHabla').map((e) => e.turno);
  const porUmbral = {};
  for (const umbral of [-60, -50, -45, -40]) porUmbral[umbral] = turnos.filter((t) => picoDb(t.audio) >= umbral).length;
  fantasmas.push({ ruidoDb: nivelDb, turnosVad: turnos.length, pasanPorUmbral: porUmbral });
  console.log(`B energia: ruido a ${nivelDb} dBFS → el VAD abre ${turnos.length} turno(s); pasan la puerta: ${JSON.stringify(porUmbral)}`);
}

// ---------- C) correccion por similitud del diccionario ----------
const terminos = ['Luis Fernando Ramírez', 'Aceros del Norte', 'Monterrey', 'Supabase', 'Hermes', 'SaaS Factory', 'Guadalajara', 'Ana Martínez', 'Pedro Aguilar', 'Carla', 'Cotizapp'];
const C = {};
for (const c of condiciones) {
  const dic = creaDiccionario({ terminos, corrigePorSimilitud: true });
  let mejora = 0, empeora = 0, igual = 0, sustituciones = 0;
  for (const n of archivos.filter((x) => x.startsWith(`${c}-`))) {
    const antes = transcripciones.get(n) ?? '';
    const despues = dic.corrige(antes);
    if (normalizaParaComparar(antes) !== normalizaParaComparar(despues)) sustituciones += 1;
    const wa = werCifras(referenciaDe(n), antes).errores, wd = werCifras(referenciaDe(n), despues).errores;
    if (wd < wa) mejora += 1; else if (wd > wa) empeora += 1; else igual += 1;
  }
  C[c] = { archivosConSustitucion: sustituciones, mejora, empeora, igual };
  console.log(`C ${c}: sustituyo en ${sustituciones} archivos → mejora ${mejora} · empeora ${empeora} · igual ${igual}`);
}
await motor.cierra?.();

const fecha = new Date().toISOString().slice(0, 10);
const resultado = { fecha, corpus: corpus.replace(raiz, '.'), motor: motor.id, A, B, fantasmas, C, terminos };
writeFileSync(join(salida, `calibracion-${fecha}.json`), JSON.stringify(resultado, null, 1));
const md = [`# Calibración sobre corpus propio — ${fecha}`, '', `Corpus: \`${resultado.corpus}\` (${archivos.length} archivos, ${condiciones.length} condiciones) · motor \`${motor.id}\``, '', '## A · Precisión y latencia por condición', '', '| condición | n | WER crudo | WER con cifras igualadas | CER | p50 | p95 |', '|---|---|---|---|---|---|---|', ...condiciones.map((c) => `| ${c} | ${A[c].n} | ${(A[c].wer * 100).toFixed(1)} % | ${(A[c].werCifras * 100).toFixed(1)} % | ${(A[c].cer * 100).toFixed(1)} % | ${A[c].p50Ms} ms | ${A[c].p95Ms} ms |`), '', 'WER crudo compara palabra a palabra tal como sale del motor; «con cifras igualadas» convierte los números en palabras de ambas partes a cifras («tres mil cuatrocientos doce» = «3412»), que es lo que un lector considera correcto. El resto de errores son nombres propios y jerga (los términos del diccionario).', '', '## B · VAD: cierre por silencio y relleno (limpio + ruido)', '', '| cierre | relleno | frases partidas | sin voz | con palabras comidas |', '|---|---|---|---|---|', ...B.map((b) => `| ${b.silencioMs} ms | ${b.msRelleno} ms | ${b.partidas}/${b.n} (${(b.fraccionPartidas * 100).toFixed(1)} %) | ${b.sinVoz} | ${b.comidas} (${(b.fraccionComidas * 100).toFixed(1)} %) |`), '', '### Puerta de energía: turnos fantasma sobre ruido sin voz (6 s de ruido rosa)', '', '| ruido | turnos que abre el VAD | pasan −60 | pasan −50 | pasan −45 | pasan −40 |', '|---|---|---|---|---|---|', ...fantasmas.map((f) => `| ${f.ruidoDb} dBFS | ${f.turnosVad} | ${f.pasanPorUmbral[-60]} | ${f.pasanPorUmbral[-50]} | ${f.pasanPorUmbral[-45]} | ${f.pasanPorUmbral[-40]} |`), '', '## C · Corrección por similitud del diccionario', '', `Términos: ${terminos.join(', ')}`, '', '| condición | archivos con sustitución | mejora | empeora | igual |', '|---|---|---|---|---|', ...condiciones.map((c) => `| ${c} | ${C[c].archivosConSustitucion} | ${C[c].mejora} | ${C[c].empeora} | ${C[c].igual} |`), ''].join('\n');
writeFileSync(join(salida, `calibracion-${fecha}.md`), md);
console.log(`\nescrito ${join(salida, `calibracion-${fecha}.md`)}`);
