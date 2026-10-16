#!/usr/bin/env node
/**
 * Mide `@tu-scope/voz` contra PESOS REALES y audio real. No es la suite de pruebas.
 *
 * Por que existe, y por que esta separado de `pruebas/`:
 *
 * Las 90 pruebas corren sin red y sin modelos, con embeddings falsos, y eso es deliberado:
 * lo que miden es la contabilidad del algoritmo, que es donde vive casi todo el riesgo. Pero
 * hay una clase de fallo que un modelo falso NO puede tener — el convenio de llamada del
 * `.onnx` de verdad. El 2026-09-01, la primera vez que esto corrio contra pesos reales,
 * aparecio: `creaModeloSilero` le daba a Silero v5 marcos de 512 muestras cuando v5 espera
 * 64 de contexto por delante, 576. El grafo tiene dimensiones dinamicas, asi que no fallaba:
 * devolvia 0,0006 sobre habla limpia y el VAD entero estaba mudo. Llevaba asi desde el
 * tramo 1.
 *
 * De ahi la regla que este archivo encarna: **lo que no se ha medido contra pesos reales no
 * esta aprobado, esta sin medir.** Los umbrales por defecto, en particular, no se heredan de
 * un tutorial — salen de aqui, con su fecha, su modelo y su corpus escritos al lado.
 *
 * Uso:  npm run mide          (en tools/voz; descarga lo que falte la primera vez)
 * Necesita: red la primera vez, ~35 MB de modelos y ~15 MB de audio en `medicion/banco/`.
 *
 * Que NO es: una prueba de regresion. No devuelve exit 1 por un decimal — imprime numeros
 * para que los lea una persona, los deja en `medicion/ultima-medicion.json` (fecha, maquina,
 * corpus y cifras: la misma forma que `@tu-scope/dictado`) y siembra el bloque
 * `<!-- MEDICION -->` del README desde ahi. Los numeros de referencia del README se copiaban a
 * mano hasta 0.4; desde 0.5.0 el bloque se escribe solo y el resto del README lo comenta.
 */
import { execFileSync } from 'node:child_process';
import { cpus, totalmem } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..');
const banco = join(aqui, 'banco');
const modelos = join(banco, 'modelos');
const audio = join(banco, 'audio');

const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;
const paso = (s) => console.log(`\n${verde('▸')} ${s}`);

/**
 * Los pesos NO viajan en el paquete y se pinean por URL exacta en `src/node/pesos.ts` (una sola
 * lista para medir, para la demo y para el diagnostico): `latest` es anti-patron. Se leen del
 * `dist/` construido, que es lo que se instala.
 */
function construye() {
  execFileSync('npm', ['run', 'build'], { cwd: raiz, stdio: 'ignore' });
}
construye();
const { PESOS, RUNTIMES, verificaHuella } = await import(pathToFileURL(join(raiz, 'dist', 'node', 'pesos.js')).href);

/** LibriSpeech dev-clean: lectura limpia, con `speaker_id` — la verdad que hace falta. */
const CORPUS = 'openslr/librispeech_asr';
const HABLANTES = 5;
const TOMAS = 12;

/** Baja a un parcial, comprueba la huella pineada y solo entonces lo deja en su sitio. */
function baja(url, destino, sha256 = null) {
  execFileSync('curl', ['-sSL', '--fail', '-o', `${destino}.parcial`, url], { stdio: ['ignore', 'ignore', 'inherit'] });
  verificaHuella(`${destino}.parcial`, sha256);
  execFileSync('mv', [`${destino}.parcial`, destino]);
}

async function preparaModelos() {
  mkdirSync(modelos, { recursive: true });
  for (const p of PESOS) {
    const destino = join(modelos, p.archivo);
    if (existsSync(destino)) {
      console.log(gris(`  ya esta: ${p.archivo}`));
      continue;
    }
    console.log(gris(`  bajando ${p.archivo} (~${p.mb} MB) — ${p.que}`));
    baja(p.url, destino, p.sha256);
  }
}

async function preparaAudio() {
  mkdirSync(audio, { recursive: true });
  const manifiesto = join(banco, 'manifiesto.json');
  if (existsSync(manifiesto)) {
    console.log(gris(`  ya esta: ${JSON.parse(readFileSync(manifiesto, 'utf8')).length} tomas`));
    return;
  }
  const filas = async (offset, length) => {
    const q = new URLSearchParams({ dataset: CORPUS, config: 'clean', split: 'validation', offset, length });
    const r = await fetch(`https://datasets-server.huggingface.co/rows?${q}`);
    if (!r.ok) throw new Error(`datasets-server ${r.status}`);
    return (await r.json()).rows ?? [];
  };

  // dev-clean viene ordenado por hablante: se barre a saltos para cruzar sus fronteras.
  const vistos = new Map();
  for (let offset = 0; offset < 2700; offset += 180) {
    for (const { row } of await filas(offset, 40)) {
      const lista = vistos.get(String(row.speaker_id)) ?? [];
      lista.push({ id: row.id, src: row.audio[0].src });
      vistos.set(String(row.speaker_id), lista);
    }
  }
  const elegidos = [...vistos.entries()].filter(([, u]) => u.length >= TOMAS).sort().slice(0, HABLANTES);
  if (elegidos.length < HABLANTES) throw new Error(`solo ${elegidos.length} hablantes con ${TOMAS}+ tomas`);

  const salida = [];
  for (const [hablante, tomas] of elegidos) {
    for (const [i, t] of tomas.slice(0, TOMAS).entries()) {
      const destino = join(audio, `${hablante}-${String(i).padStart(2, '0')}.wav`);
      const crudo = Buffer.from(await (await fetch(t.src)).arrayBuffer());
      const temporal = join(banco, '.toma');
      writeFileSync(temporal, crudo);
      // A 16 kHz mono PCM16, que es lo que comen Silero y el embedding.
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', temporal,
        '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', destino]);
      salida.push({ hablante, archivo: destino, id: t.id });
    }
  }
  writeFileSync(manifiesto, JSON.stringify(salida, null, 1));
  console.log(gris(`  ${salida.length} tomas de ${elegidos.length} hablantes`));
}

function preparaEntorno() {
  const pkg = join(banco, 'package.json');
  if (!existsSync(pkg)) writeFileSync(pkg, JSON.stringify({ name: 'banco-voz', private: true, type: 'module' }, null, 1));
  const version = RUNTIMES['onnxruntime-node'];
  const instalado = join(banco, 'node_modules', 'onnxruntime-node', 'package.json');
  if (existsSync(instalado) && JSON.parse(readFileSync(instalado, 'utf8')).version === version) {
    console.log(gris(`  onnxruntime-node@${version} ya instalado`));
  } else {
    console.log(gris(`  instalando onnxruntime-node@${version} (el peer opcional, pineado; ~100 MB)`));
    execFileSync('npm', ['install', '--no-audit', '--no-fund', `onnxruntime-node@${version}`], { cwd: banco, stdio: 'inherit' });
  }
  // El paquete ya esta CONSTRUIDO (arriba, antes de leer los pesos): se mide `dist/`, lo que se instala.
}

/** Fecha, maquina y corpus junto a cada cifra: sin eso, un numero no se puede volver a medir. */
const maquinaDeMedicion = () => ({ cpu: cpus()[0]?.model ?? 'desconocida', nucleos: cpus().length, ramGb: Math.round(totalmem() / 1073741824), node: process.version, dispositivo: 'cpu' });

/** Reescribe el bloque `<!-- MEDICION -->…<!-- /MEDICION -->` del README con lo medido. Sin bloque, lo anade al final. */
function siembraReadme(r) {
  const ruta = join(raiz, 'README.md');
  const f = (n, d = 3) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d).replace('.', ',') : '—');
  const filasRegistro = r.registro.map((x) => `| ${f(x.umbral, 2)} | ${x.acierta} | ${x.equivoca} | ${x.abstiene} | ${x.impostorConNombre} / ${x.impostorTomas} |`).join('\n');
  const bloque = [
    '<!-- MEDICION -->',
    `**Ultima medicion en esta maquina** (\`npm run mide\`, ${r.fecha} · ${r.maquina.cpu}, ${r.maquina.nucleos} hilos, ${r.maquina.ramGb} GB, Node ${r.maquina.node} · ${r.corpus.nombre}, ${r.corpus.hablantes} hablantes × ${r.corpus.tomasPorHablante} tomas). Este bloque lo escribe la medicion; el resto del README lo comenta.`,
    '',
    '| Que | Medido |',
    '|---|---|',
    `| Silero sobre la primera toma | ${r.silero.turnos} turnos, ${f(r.silero.segundosHabla, 1)} s de habla en ${f(r.silero.segundosAudio, 1)} s |`,
    `| Distancia coseno, mismo hablante | p50 ${f(r.distancias.mismo.p50)} · p95 ${f(r.distancias.mismo.p95)} · max ${f(r.distancias.mismo.max)} |`,
    `| Distancia coseno, hablantes distintos | min ${f(r.distancias.distinto.min)} · p50 ${f(r.distancias.distinto.p50)} |`,
    `| \`calibraUmbral\` | ${f(r.calibracion.umbral, 2)} con ${f(r.calibracion.aciertoPct, 1)} % de acierto por pares (defecto de \`agrupa()\`: 0,55) |`,
    `| Reunion sintetica | ${r.reunion.intervenciones} intervenciones de ${r.reunion.hablantes} hablantes en ${f(r.reunion.segundos, 1)} s · VAD ${r.reunion.turnosVad} turnos (verdad ${r.reunion.turnosVerdad}) · nombres ${r.reunion.nombresCorrectos} bien, ${r.reunion.nombresIncorrectos} mal |`,
    '',
    `Registro (${r.registroMontaje.enrolados} enrolados con ${r.registroMontaje.tomasEnrol} tomas, un impostor sin registrar):`,
    '',
    '| umbral | acierta | se equivoca | se abstiene | al impostor le pone nombre |',
    '|---|---|---|---|---|',
    filasRegistro,
    '<!-- /MEDICION -->',
  ].join('\n');
  const texto = existsSync(ruta) ? readFileSync(ruta, 'utf8') : '';
  const nuevo = /<!-- MEDICION -->[\s\S]*?<!-- \/MEDICION -->/.test(texto) ? texto.replace(/<!-- MEDICION -->[\s\S]*?<!-- \/MEDICION -->/, bloque) : `${texto.trimEnd()}\n\n${bloque}\n`;
  writeFileSync(ruta, nuevo);
  return ruta;
}

async function mide() {
  const manifiestoCorpus = JSON.parse(readFileSync(join(banco, 'manifiesto.json'), 'utf8'));
  const resultado = { version: 1, fecha: new Date().toISOString().slice(0, 10), maquina: maquinaDeMedicion(), corpus: { nombre: 'LibriSpeech dev-clean', hablantes: HABLANTES, tomasPorHablante: TOMAS, tomas: manifiestoCorpus.length }, silero: {}, distancias: {}, calibracion: {}, registroMontaje: {}, registro: [], reunion: {} };
  const ort = await import(join(banco, 'node_modules', 'onnxruntime-node', 'dist', 'index.js'));
  const voz = await import(join(raiz, 'dist', 'index.js'));
  const nodo = await import(join(raiz, 'dist', 'node', 'index.js'));
  const { calibraUmbral, agrupa, distanciaCoseno, creaRegistroHablantes, creaDetectorVoz, creaDiarizador } = voz;
  const { creaModeloSilero, creaModeloHablante, creaModeloSegmentacion, leeWav, preparaParaModelo } = nodo;

  const manifiesto = JSON.parse(readFileSync(join(banco, 'manifiesto.json'), 'utf8'));
  const lee = (f) => {
    const b = readFileSync(f);
    return leeWav(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  };

  paso('Los tres envoltorios contra pesos reales');
  const vad = await creaModeloSilero({ ort, modelo: join(modelos, 'silero_vad.onnx') });
  const primera = preparaParaModelo(lee(manifiesto[0].archivo), vad.frecuenciaHz);
  const det = creaDetectorVoz({ modelo: vad, conservaAudio: true });
  const eventos = [...(await det.procesa(primera)), ...(await det.cierra())];
  const turnos = eventos.flatMap((e) => (e.tipo === 'finHabla' ? [e.turno] : []));
  const habla = turnos.reduce((s, t) => s + (t.finMs - t.inicioMs), 0) / 1000;
  console.log(`  silero      : ${turnos.length} turnos, ${habla.toFixed(1)}s de habla en ${(primera.length / 16000).toFixed(1)}s`);
  resultado.silero = { turnos: turnos.length, segundosHabla: habla, segundosAudio: primera.length / 16000 };
  if (turnos.length === 0) console.log('  ⚠ CERO turnos sobre habla limpia: revisa el convenio de llamada (ver cabecera de silero.ts)');

  const hablante = await creaModeloHablante({ ort, modelo: join(modelos, 'embedding.onnx') });
  const v0 = await hablante.vector(turnos[0].audio);
  console.log(`  embedding   : ${v0.length} dims, norma L2 ${Math.sqrt([...v0].reduce((s, x) => s + x * x, 0)).toFixed(4)}`);

  const seg = await creaModeloSegmentacion({ ort, modelo: join(modelos, 'segmentation-3.0.onnx') });
  console.log(`  segmentacion: ventana ${seg.muestrasVentana} muestras, ${seg.hablantesLocales} hablantes locales (powerset deducido de la salida real)`);

  paso('Distancias reales entre vectores de hablante');
  const datos = [];
  for (const m of manifiesto) {
    const vector = await hablante.vector(preparaParaModelo(lee(m.archivo), hablante.frecuenciaHz));
    datos.push({ hablante: m.hablante, vector });
  }
  const mismo = [], distinto = [];
  for (let i = 0; i < datos.length; i++)
    for (let j = i + 1; j < datos.length; j++)
      (datos[i].hablante === datos[j].hablante ? mismo : distinto)
        .push(distanciaCoseno(datos[i].vector, datos[j].vector));
  const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)];
  console.log(`  mismo hablante   : p50 ${pct(mismo, 0.5).toFixed(3)}  p95 ${pct(mismo, 0.95).toFixed(3)}  max ${Math.max(...mismo).toFixed(3)}`);
  console.log(`  hablante distinto: min ${Math.min(...distinto).toFixed(3)}  p50 ${pct(distinto, 0.5).toFixed(3)}`);
  resultado.distancias = { mismo: { p50: pct(mismo, 0.5), p95: pct(mismo, 0.95), max: Math.max(...mismo) }, distinto: { min: Math.min(...distinto), p50: pct(distinto, 0.5) } };

  paso('calibraUmbral: el umbral de agrupamiento, medido en vez de heredado');
  const cal = calibraUmbral(datos.map((d) => d.vector), datos.map((d) => d.hablante));
  const hablantes = [...new Set(datos.map((d) => d.hablante))];
  console.log(`  umbral ${cal.umbral} con acierto por pares ${(cal.acierto * 100).toFixed(1)}%  ${gris('(el defecto de agrupa() es 0.55)')}`);
  resultado.calibracion = { umbral: cal.umbral, aciertoPct: cal.acierto * 100 };
  for (const u of [0.4, 0.5, 0.55, 0.7]) {
    const g = new Set(agrupa(datos.map((d) => d.vector), { umbral: u })).size;
    console.log(`  ${gris(`umbral ${u}: ${g} grupos para ${hablantes.length} hablantes reales`)}`);
  }

  paso('El registro: enrolar a unos, dejar a otro fuera como impostor');
  const enrolados = hablantes.slice(0, hablantes.length - 1);
  const impostor = hablantes[hablantes.length - 1];
  const ENROL = 3;
  console.log(gris(`  enrolados ${enrolados.join(', ')} con ${ENROL} tomas · impostor ${impostor}, no registrado`));
  resultado.registroMontaje = { enrolados: enrolados.length, tomasEnrol: ENROL };
  console.log('  umbral | acierto error abstiene | impostor: calla  le pone nombre');
  for (const u of [0.3, 0.4, 0.45, 0.5, 0.6, 0.7]) {
    const reg = creaRegistroHablantes({ umbral: u });
    for (const h of enrolados) reg.registra(h, datos.filter((d) => d.hablante === h).slice(0, ENROL).map((d) => d.vector));
    let ok = 0, mal = 0, calla = 0, impCalla = 0, impNombre = 0;
    for (const d of datos) {
      const esImpostor = d.hablante === impostor;
      if (!esImpostor && datos.filter((x) => x.hablante === d.hablante).indexOf(d) < ENROL) continue;
      const r = reg.identifica(d.vector);
      if (esImpostor) {
        if (r) impNombre++;
        else impCalla++;
      } else if (!r) calla++;
      else if (r.nombre === d.hablante) ok++;
      else mal++;
    }
    console.log(`   ${u.toFixed(2)}  |   ${String(ok).padStart(2)}     ${String(mal).padStart(2)}     ${String(calla).padStart(2)}    |          ${String(impCalla).padStart(2)}       ${String(impNombre).padStart(2)}`);
    resultado.registro.push({ umbral: u, acierta: ok, equivoca: mal, abstiene: calla, impostorCalla: impCalla, impostorConNombre: impNombre, impostorTomas: impCalla + impNombre });
  }

  paso('Reunion sintetica de extremo a extremo, con verdad conocida');
  const trio = hablantes.slice(0, 3);
  const piezas = [];
  for (let ronda = 0; ronda < 3; ronda++)
    for (const h of trio) {
      const f = manifiesto.filter((m) => m.hablante === h)[5 + ronda];
      if (f) piezas.push({ hablante: h, audio: preparaParaModelo(lee(f.archivo), 16000) });
    }
  const hueco = Math.round(0.8 * 16000);
  const largo = piezas.reduce((s, p) => s + p.audio.length + hueco, 0);
  const pista = new Float32Array(largo);
  const verdad = [];
  let cursor = 0;
  for (const p of piezas) {
    verdad.push({ hablante: p.hablante, inicioMs: cursor / 16, finMs: (cursor + p.audio.length) / 16 });
    pista.set(p.audio, cursor);
    cursor += p.audio.length + hueco;
  }
  vad.reinicia();
  const d2 = creaDetectorVoz({ modelo: vad, conservaAudio: true });
  const ev2 = [...(await d2.procesa(pista)), ...(await d2.cierra())];
  const turnos2 = ev2.flatMap((e) => (e.tipo === 'finHabla' ? [e.turno] : []));
  const reg = creaRegistroHablantes({ umbral: 0.5 });
  for (const h of trio) reg.registra(`voz-${h}`, datos.filter((d) => d.hablante === h).slice(0, 3).map((d) => d.vector));
  const acta = await creaDiarizador({ modelo: hablante, hablantes: trio.length, registro: reg }).asigna(turnos2);
  const real = (t) => {
    let mejor = null, s = 0;
    for (const v of verdad) {
      const x = Math.min(t.finMs, v.finMs) - Math.max(t.inicioMs, v.inicioMs);
      if (x > s) { s = x; mejor = v.hablante; }
    }
    return mejor;
  };
  let bien = 0, mal = 0;
  for (const t of acta) {
    const r = real(t);
    if (!r || !t.hablante) continue;
    if (t.hablante === `voz-${r}`) bien++;
    else mal++;
  }
  console.log(`  ${piezas.length} intervenciones de ${trio.length} hablantes en ${(largo / 16000).toFixed(1)}s`);
  console.log(`  VAD detecto ${turnos2.length} turnos ${gris(`(verdad: ${verdad.length})`)}`);
  console.log(`  nombres correctos ${bien}, incorrectos ${mal}`);
  resultado.reunion = { intervenciones: piezas.length, hablantes: trio.length, segundos: largo / 16000, turnosVad: turnos2.length, turnosVerdad: verdad.length, nombresCorrectos: bien, nombresIncorrectos: mal };

  const salida = join(aqui, 'ultima-medicion.json');
  writeFileSync(salida, JSON.stringify(resultado, null, 1) + '\n');
  console.log(gris(`\nescrito en ${salida}`));
  console.log(gris(`README sembrado: ${siembraReadme(resultado)} (bloque MEDICION)`));
}

paso('Pesos (no viajan en el paquete: se pinean por URL)');
await preparaModelos();
paso('Audio con hablantes etiquetados (LibriSpeech dev-clean)');
await preparaAudio();
paso('Entorno de medicion');
preparaEntorno();
await mide();
console.log(`\n${verde('✓')} medido. El bloque MEDICION del README lleva las cifras de esta maquina con su fecha y su corpus; el resto del README las comenta.\n`);
