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
 * para que los lea una persona y los compare con los que hay escritos en el README.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..');
const banco = join(aqui, 'banco');
const modelos = join(banco, 'modelos');
const audio = join(banco, 'audio');

const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;
const paso = (s) => console.log(`\n${verde('▸')} ${s}`);

/** Los pesos NO viajan en el paquete y se pinean por URL exacta: `latest` es anti-patron. */
const PESOS = [
  {
    archivo: 'silero_vad.onnx',
    url: 'https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx',
    que: 'Silero VAD v5',
  },
  {
    archivo: 'embedding.onnx',
    url: 'https://huggingface.co/Wespeaker/wespeaker-voxceleb-resnet34-LM/resolve/main/voxceleb_resnet34_LM.onnx',
    que: 'WeSpeaker ResNet34-LM (embeddings, come fbank de 80 bandas)',
  },
  {
    archivo: 'segmentation-3.0.onnx',
    url: 'https://huggingface.co/onnx-community/pyannote-segmentation-3.0/resolve/main/onnx/model.onnx',
    que: 'pyannote segmentation-3.0 (mirror sin gate de onnx-community)',
  },
];

/** LibriSpeech dev-clean: lectura limpia, con `speaker_id` — la verdad que hace falta. */
const CORPUS = 'openslr/librispeech_asr';
const HABLANTES = 5;
const TOMAS = 12;

function baja(url, destino) {
  execFileSync('curl', ['-sSL', '--fail', '-o', destino, url], { stdio: ['ignore', 'ignore', 'inherit'] });
}

async function preparaModelos() {
  mkdirSync(modelos, { recursive: true });
  for (const p of PESOS) {
    const destino = join(modelos, p.archivo);
    if (existsSync(destino)) {
      console.log(gris(`  ya esta: ${p.archivo}`));
      continue;
    }
    console.log(gris(`  bajando ${p.archivo} — ${p.que}`));
    baja(p.url, destino);
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
  if (existsSync(join(banco, 'node_modules', 'onnxruntime-node'))) {
    console.log(gris('  onnxruntime-node ya instalado'));
  } else {
    console.log(gris('  instalando onnxruntime-node (el peer opcional; ~100 MB)'));
    execFileSync('npm', ['install', '--no-audit', '--no-fund', 'onnxruntime-node'], { cwd: banco, stdio: 'inherit' });
  }
  // Se mide el paquete CONSTRUIDO, no `src/`: es lo que se instala en el proyecto de destino.
  execFileSync('npm', ['run', 'build'], { cwd: raiz, stdio: 'ignore' });
}

async function mide() {
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

  paso('calibraUmbral: el umbral de agrupamiento, medido en vez de heredado');
  const cal = calibraUmbral(datos.map((d) => d.vector), datos.map((d) => d.hablante));
  const hablantes = [...new Set(datos.map((d) => d.hablante))];
  console.log(`  umbral ${cal.umbral} con acierto por pares ${(cal.acierto * 100).toFixed(1)}%  ${gris('(el defecto de agrupa() es 0.55)')}`);
  for (const u of [0.4, 0.5, 0.55, 0.7]) {
    const g = new Set(agrupa(datos.map((d) => d.vector), { umbral: u })).size;
    console.log(`  ${gris(`umbral ${u}: ${g} grupos para ${hablantes.length} hablantes reales`)}`);
  }

  paso('El registro: enrolar a unos, dejar a otro fuera como impostor');
  const enrolados = hablantes.slice(0, hablantes.length - 1);
  const impostor = hablantes[hablantes.length - 1];
  const ENROL = 3;
  console.log(gris(`  enrolados ${enrolados.join(', ')} con ${ENROL} tomas · impostor ${impostor}, no registrado`));
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
}

paso('Pesos (no viajan en el paquete: se pinean por URL)');
await preparaModelos();
paso('Audio con hablantes etiquetados (LibriSpeech dev-clean)');
await preparaAudio();
paso('Entorno de medicion');
preparaEntorno();
await mide();
console.log(`\n${verde('✓')} medido. Los numeros de referencia estan en el README, con su fecha y su corpus.\n`);
