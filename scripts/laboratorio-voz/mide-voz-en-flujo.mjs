#!/usr/bin/env node
/**
 * Mide «la maquina habla en tiempo real» (Etapa 3, mejora 3.2):
 *
 *   http          10 textos al demonio (/sintetizar) y a la ruta de la app: p50/p95 del PRIMER
 *                 trozo (cuando empieza a existir voz) y del total.
 *   faq           Chromium con microfono falso (la pregunta a los 2 s): manos libres → transcribe →
 *                 responde en voz; lee `metricas-voz` (primera frase desde el clic) y `vuelta`.
 *   interrupcion  N navegadores por microfono falso (silencio, voz limpia, voz + ruido): la maquina
 *                 lee un texto largo con la escucha encendida; se cuenta si se callo y cuando.
 *   picking       caso 16 con microfono falso que dice «tres unidades»: debe llegar a la linea 2.
 *
 *   node scripts/laboratorio-voz/mide-voz-en-flujo.mjs [--pasos http,faq,interrupcion,picking] [--url http://localhost:3000] [--n 10]
 *
 * El token se lee de .env.local y no se imprime. Los WAV del microfono falso salen de
 * capturas-laboratorio/mic/ (los fabrica este mismo script si faltan). Medir sin otra carga.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const URL_BASE = arg('url', 'http://localhost:3000');
const N = Number(arg('n', 10));
const PASOS = arg('pasos', 'http,faq,interrupcion,picking').split(',');
const SALIDA = resolve(arg('salida', 'capturas-laboratorio'));
const MIC = join(SALIDA, 'mic');
mkdirSync(MIC, { recursive: true });
const token = /^DICTADO_MOVIL_TOKEN=(.+)$/m.exec(readFileSync('.env.local', 'utf8'))?.[1]?.trim();
if (!token) throw new Error('falta DICTADO_MOVIL_TOKEN en .env.local');
console.log(`token: presente (largo ${token.length})`);
const DEMONIO = `http://127.0.0.1:${process.env.DICTADO_DEMONIO_PUERTO ?? 47125}`;
const percentil = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const resultados = existsSync(join(SALIDA, 'voz-en-flujo.json')) ? JSON.parse(readFileSync(join(SALIDA, 'voz-en-flujo.json'), 'utf8')) : {};
const guarda = () => writeFileSync(join(SALIDA, 'voz-en-flujo.json'), JSON.stringify(resultados, null, 1));

// ---------- microfonos falsos ----------
const raiz = process.cwd();
const banco = join(raiz, 'tools/dictado/medicion/banco');
const di = (texto, voz, salida) => execFileSync(process.execPath, [join(raiz, 'tools/dictado/dist/node/cli.js'), 'di', texto, '--voz', voz, '--guarda', salida, '--sin-sonido'], { env: { ...process.env, DICTADO_MODELOS: join(banco, 'modelos'), DICTADO_RUNTIME: banco, DICTADO_DATOS: join(banco, 'datos') }, cwd: join(raiz, 'tools/dictado'), stdio: 'ignore' });
const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'ignore' });
function fabricaMicrofonos() {
  const silencio = join(MIC, 'silencio.wav');
  if (!existsSync(silencio)) ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '14', '-c:a', 'pcm_s16le', silencio]);
  const conVoz = (nombre, texto, aLosSegundos) => {
    const salida = join(MIC, `${nombre}.wav`);
    if (existsSync(salida)) return;
    const crudo = join(MIC, `${nombre}-crudo.wav`);
    di(texto, 'es_ES-davefx-medium', crudo);
    ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-i', crudo, '-filter_complex', `[0:a]atrim=0:${aLosSegundos}[s];[1:a]aformat=sample_rates=48000:channel_layouts=mono[v];[s][v]concat=n=2:v=0:a=1,apad=whole_dur=14[out]`, '-map', '[out]', '-c:a', 'pcm_s16le', salida]);
  };
  conVoz('voz-limpia', '¿Cuál es el horario de atención?', 2);
  conVoz('tres-unidades', 'Tres unidades.', 4);
  for (const [nombre, amplitud] of [['voz-ruido', '0.1'], ['voz-ruido-fuerte', '0.3']]) {
    const salida = join(MIC, `${nombre}.wav`);
    if (!existsSync(salida)) ffmpeg(['-i', join(MIC, 'voz-limpia.wav'), '-filter_complex', `anoisesrc=color=pink:amplitude=${amplitud}:sample_rate=48000:duration=14[n];[0:a][n]amix=inputs=2:duration=first:normalize=0[out]`, '-map', '[out]', '-c:a', 'pcm_s16le', salida]);
  }
}
fabricaMicrofonos();

// ---------- http ----------
const TEXTOS = [
  'Atendemos de lunes a viernes de nueve de la mañana a seis de la tarde.',
  'El envío tarda de dos a cuatro días hábiles en toda la república.',
  'Sí, tienes treinta días para devolverlo si está sin usar y con su empaque.',
  'Aceptamos tarjeta de crédito, débito y transferencia bancaria.',
  'Estamos en la avenida Reforma ciento veinte, en Monterrey.',
  'Línea uno de veinte. Pasillo A, estante doce. Tornillos M8. Tres unidades. Confirma la cantidad.',
  'Confirmado: tres. Siguiente línea. Pasillo B, estante cuatro. Cinta aislante negra. Doce unidades.',
  'No entendí una cantidad. Di solo el número, por ejemplo: doce.',
  'Buenas tardes. Gracias por llamar. ¿En qué le puedo ayudar hoy?',
  'La reunión queda para el martes a las diez de la mañana. Le mando la cotización por correo.',
];
async function midePrimerTrozo(url, cabeceras, texto) {
  const t0 = performance.now();
  const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...cabeceras }, body: JSON.stringify({ texto }) });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const lector = r.body.getReader();
  let primero; let bytes = 0; let trozos = 0;
  for (;;) { const { done, value } = await lector.read(); if (done) break; if (primero === undefined) primero = performance.now() - t0; bytes += value.length; trozos++; }
  const hz = Number(r.headers.get('x-frecuencia-hz'));
  return { msPrimerTrozo: Math.round(primero), msTotal: Math.round(performance.now() - t0), segundosAudio: +(bytes / 2 / hz).toFixed(2), trozos, via: r.headers.get('x-via') ?? 'demonio directo', voz: r.headers.get('x-voz') };
}
if (PASOS.includes('http')) {
  console.log('http) 10 textos, primer trozo');
  const filas = {};
  for (const [nombre, url] of [['demonio /sintetizar', `${DEMONIO}/sintetizar`], ['app /api/laboratorio/sintetizar-flujo', `${URL_BASE}/api/laboratorio/sintetizar-flujo`]]) {
    await midePrimerTrozo(url, {}, 'Calentando.'); // la primera peticion paga el primer uso; no cuenta
    const medidas = [];
    for (const texto of TEXTOS) medidas.push(await midePrimerTrozo(url, {}, texto));
    const primeros = medidas.map((m) => m.msPrimerTrozo); const totales = medidas.map((m) => m.msTotal);
    filas[nombre] = { n: medidas.length, primerTrozoP50: percentil(primeros, 0.5), primerTrozoP95: percentil(primeros, 0.95), totalP50: percentil(totales, 0.5), totalP95: percentil(totales, 0.95), segundosAudioTotal: +medidas.reduce((s, m) => s + m.segundosAudio, 0).toFixed(1), via: medidas[0].via, medidas };
    console.log(`  ${nombre}: primer trozo p50 ${filas[nombre].primerTrozoP50} ms · p95 ${filas[nombre].primerTrozoP95} ms · total p50 ${filas[nombre].totalP50} ms · ${filas[nombre].segundosAudioTotal} s de voz · via ${filas[nombre].via}`);
  }
  resultados.http = filas;
  guarda();
}

// ---------- navegador ----------
async function abreNavegador(micWav) {
  const navegador = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${micWav}%noloop`, '--autoplay-policy=no-user-gesture-required'] });
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-MX', permissions: ['microphone'] });
  await contexto.addInitScript((t) => localStorage.setItem('dictado.token', t), token);
  const pagina = await contexto.newPage();
  const consola = [];
  pagina.on('console', (m) => { if (m.type() === 'error') consola.push(m.text()); });
  pagina.on('pageerror', (e) => consola.push(String(e)));
  return { navegador, pagina, consola };
}
const abreCaso = async (pagina, caso) => {
  await pagina.goto(`${URL_BASE}/laboratorio-voz?caso=${caso}`, { waitUntil: 'networkidle' });
  await pagina.waitForFunction(() => document.querySelectorAll('[data-prueba^="caso-"]').length === 20, null, { polling: 200 });
};
const json = async (loc) => JSON.parse((await loc.getAttribute('data-json')) ?? 'null');
const panel = (pagina, n) => pagina.locator(`[data-prueba="panel-${n}"]`);

if (PASOS.includes('faq')) {
  console.log('faq) caso 12: primera frase desde el clic y vuelta con microfono falso');
  const { navegador, pagina, consola } = await abreNavegador(join(MIC, 'voz-limpia.wav'));
  await abreCaso(pagina, 12);
  const p = panel(pagina, 12);
  // (1) pregunta tecleada: primera frase audible desde el clic
  await p.locator('[data-prueba="pregunta"]').fill('¿Cuánto tarda el envío?');
  const t0 = Date.now();
  await p.getByRole('button', { name: 'Preguntar' }).click();
  await p.locator('[data-prueba="metricas-voz"]').waitFor({ timeout: 60_000 });
  const metricasClic = await json(p.locator('[data-prueba="metricas-voz"]'));
  console.log(`  clic → primera frase ${metricasClic.msPrimerAudio} ms · ${metricasClic.segundosAudio} s en ${metricasClic.trozos} trozos · via ${metricasClic.via} (reloj del script: ${Date.now() - t0} ms hasta ver la cifra)`);
  await pagina.waitForFunction(() => !document.querySelector('[data-prueba="panel-12"]')?.textContent?.includes('La máquina habla…'), null, { timeout: 30_000, polling: 200 });
  // (2) manos libres: la pregunta del microfono falso a los 2 s → transcribe → responde
  await p.locator('[data-prueba="manos-libres"]').click();
  await p.locator('[data-prueba="vuelta"]').waitFor({ timeout: 60_000 });
  const vuelta = await json(p.locator('[data-prueba="vuelta"]'));
  const eventos = await json(p.locator('[data-prueba="interrupcion"]'));
  console.log(`  manos libres → dijo «${vuelta.dicho}» · vuelta ${vuelta.msVuelta} ms (transcribir ${vuelta.msTranscripcion} + primer audio ${vuelta.msPrimerAudio}) · via ${vuelta.via}`);
  await pagina.waitForTimeout(1500);
  await pagina.locator('#caso-12').screenshot({ path: join(SALIDA, '20-faq-voz-en-flujo.png') });
  resultados.faq = { metricasClic, vuelta, eventos, consola };
  guarda();
  await navegador.close();
}

if (PASOS.includes('interrupcion')) {
  console.log('interrupcion) tres microfonos falsos');
  const condiciones = [['silencio', 'silencio.wav', 3], ['voz limpia', 'voz-limpia.wav', N], ['voz + ruido rosa (SNR ~18 dB)', 'voz-ruido.wav', N], ['voz + ruido rosa fuerte (SNR ~8 dB)', 'voz-ruido-fuerte.wav', N]];
  resultados.interrupcion = {};
  for (const [nombre, wav, veces] of condiciones) {
    const corridas = [];
    for (let i = 0; i < veces; i++) {
      const { navegador, pagina, consola } = await abreNavegador(join(MIC, wav));
      await abreCaso(pagina, 12);
      const p = panel(pagina, 12);
      await p.locator('[data-prueba="prueba-interrupcion"]').click();
      // La lectura dura ~14 s si nadie la corta; el evento «interrumpir» aparece en cuanto ocurre.
      await pagina.waitForFunction(() => { const e = document.querySelector('[data-prueba="interrupcion"]'); return (e && JSON.parse(e.getAttribute('data-json') ?? '[]').some((x) => x.tipo === 'interrumpir')) || !document.querySelector('[data-prueba="panel-12"]')?.textContent?.includes('La máquina habla…'); }, null, { timeout: 40_000, polling: 200 });
      const eventos = (await p.locator('[data-prueba="interrupcion"]').count()) ? await json(p.locator('[data-prueba="interrupcion"]')) : [];
      const interrumpir = eventos.find((e) => e.tipo === 'interrumpir');
      const inicio = eventos.find((e) => e.tipo === 'inicioHabla');
      corridas.push({ interrumpio: Boolean(interrumpir), msDesdeInicioHabla: interrumpir?.msDesdeInicioHabla, msRelojInterrupcion: interrumpir?.msReloj, msAudioInicioHabla: inicio?.msAudio, msRelojInicioHabla: inicio?.msReloj, eventos: eventos.map((e) => e.tipo), consola });
      if (i === 0) await pagina.locator('#caso-12').screenshot({ path: join(SALIDA, `21-interrupcion-${wav.replace('.wav', '')}.png`) });
      await navegador.close();
    }
    const detectadas = corridas.filter((c) => c.interrumpio).length;
    const reacciones = corridas.filter((c) => c.interrumpio).map((c) => c.msDesdeInicioHabla);
    // La voz del archivo empieza a los 2000 ms: reaccion desde esa marca = reloj de la interrupcion − 2000
    const desdeMarca = corridas.filter((c) => c.interrumpio).map((c) => c.msRelojInterrupcion - 2000);
    resultados.interrupcion[nombre] = { corridas: veces, interrumpio: detectadas, reaccionP50: reacciones.length ? percentil(reacciones, 0.5) : null, reaccionMax: reacciones.length ? Math.max(...reacciones) : null, desdeMarca2sP50: desdeMarca.length ? percentil(desdeMarca, 0.5) : null, detalle: corridas };
    console.log(`  ${nombre}: se callo ${detectadas}/${veces} · reaccion desde el inicio de la voz p50 ${resultados.interrupcion[nombre].reaccionP50 ?? '—'} ms · desde la marca de 2 s p50 ${resultados.interrupcion[nombre].desdeMarca2sP50 ?? '—'} ms`);
    guarda();
  }
}

if (PASOS.includes('picking')) {
  console.log('picking) caso 16: manos libres con «tres unidades» a los 4 s');
  const { navegador, pagina, consola } = await abreNavegador(join(MIC, 'tres-unidades.wav'));
  await abreCaso(pagina, 16);
  const p = panel(pagina, 16);
  await p.locator('[data-prueba="manos-libres"]').click();
  await p.locator('[data-prueba="leer-linea"]').click();
  await p.locator('[data-prueba="metricas-voz"]').waitFor({ timeout: 60_000 });
  const metricasClic = await json(p.locator('[data-prueba="metricas-voz"]'));
  await pagina.waitForFunction(() => document.querySelector('[data-prueba="linea-actual"]')?.getAttribute('data-linea') === '2', null, { timeout: 60_000, polling: 200 });
  const vuelta = (await p.locator('[data-prueba="vuelta"]').count()) ? await json(p.locator('[data-prueba="vuelta"]')) : null;
  const sesion = await json(p.locator('[data-prueba="linea-actual"]'));
  console.log(`  linea 1 leida: primera frase ${metricasClic.msPrimerAudio} ms via ${metricasClic.via} · confirmo «${vuelta?.dicho}» · vuelta ${vuelta?.msVuelta} ms · ahora en linea ${sesion?.linea}`);
  await pagina.waitForTimeout(1500);
  await pagina.locator('#caso-16').screenshot({ path: join(SALIDA, '22-picking-manos-libres.png') });
  resultados.picking = { metricasClic, vuelta, sesion, consola };
  guarda();
  await navegador.close();
}
console.log(`escrito ${join(SALIDA, 'voz-en-flujo.json')}`);
