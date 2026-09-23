#!/usr/bin/env node
/**
 * Mide la CONVERSACION con el agente (PRP-003) contra pesos reales y sin persona. Dos bloques:
 *
 *   A  Envio por silencio (RF-38, RF-45): fija `envioMs`. Un WAV sintetico hace de microfono
 *      (`dictar --entrada`, a tiempo real) con 10 turnos; cada turno es UNA frase partida por
 *      una pausa de pensamiento de 1 a 3 s. Falso envio = Enter entre las dos mitades. Primero
 *      se mide el HUECO real pegado → voz nueva por pausa (con el plazo al maximo, nada se envia)
 *      y despues se verifica cada candidato de punta a punta.
 *   B  Half-duplex (RF-39, RF-40): `dictar` con el MICROFONO y el altavoz de Windows reales;
 *      10 respuestas por el socket local por cada margen tras la voz (`--margenes 0,50,100,150`);
 *      fuga = texto transcrito tras reabrir la puerta; latencias de primer audio y de reapertura.
 *      CONTROL: la misma voz por `dictado di --local` con un `dictar` SIN conversacion: si el
 *      microfono oye el altavoz, aqui se transcribe; si tampoco, la sala no oye y B no demuestra
 *      nada (auriculares o microfono mudo).
 *      Decidido con las dos primeras corridas del 2026-09-23: parar y rearrancar la captura de
 *      pulse mientras suena la voz no anadia seguridad (0 fugas de la voz con la puerta sola) y
 *      costaba ~210 ms mas de primer audio y ~100 ms mas de reapertura; queda solo la puerta logica.
 *      Un texto transcrito tras reabrir solo es FUGA si se parece a la frase del agente: la sala
 *      puede tener otra fuente (un video), y la medicion las separa por palabras en comun.
 *   C  Hook `Stop` (RF-42, RF-43): `scripts/habla-respuesta.sh` con el JSON del arnes por stdin,
 *      10 veces en cada situacion, contra un socket falso (sin audio): sin dictado, con la
 *      conversacion apagada, y encendida (el texto llega y el hook sale sin esperar a la voz).
 *   B' (barge-in, fase 4): todavia no.
 *
 *   node medicion/mide-conversacion.mjs [--bloque a|b|c|abc|informe] [--candidatos 1000,1500,2000] [--margenes 0,50,100,150] [--respuestas 10]
 *   (un bloque que no se corre se toma del JSON del dia, si existe; `informe` solo reescribe el .md)
 *
 * Deja `medicion/corpus-propio/conversacion-<fecha>.{json,md}`; los WAV van a `conversacion/` (ignorados).
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const banco = join(raiz, 'medicion', 'banco');
const salida = join(raiz, 'medicion', 'corpus-propio', 'conversacion');
mkdirSync(salida, { recursive: true });
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const BLOQUE = arg('bloque', 'ab');
const CANDIDATOS = arg('candidatos', '1000,1500,2000').split(',').map(Number);
const RESPUESTAS = Number(arg('respuestas', '10'));
const MARGENES = arg('margenes', '0,50,100,150').split(',').map(Number);
const VOZ = 'es_MX-claude-high';
const VELOCIDAD = '0.9';
const PUERTO = 47_136; // no el 47126 de un dictado en vivo
const env = { ...process.env, DICTADO_MODELOS: process.env.DICTADO_MODELOS ?? join(banco, 'modelos'), DICTADO_RUNTIME: process.env.DICTADO_RUNTIME ?? banco, DICTADO_PYTHON: process.env.DICTADO_PYTHON ?? join(banco, 'venv', 'bin', 'python'), DICTADO_DATOS: process.env.DICTADO_DATOS ?? join(banco, 'datos'), DICTADO_CONVERSACION_TRAZA: '1', NO_COLOR: '1' };
const cli = join(raiz, 'dist', 'node', 'cli.js');
const { pideDi } = await import(pathToFileURL(join(raiz, 'dist', 'node', 'conversacion-socket.js')).href);

const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
const duracionMs = (f) => Math.round(1000 * Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim()));
const percentil = (xs, p) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const p50 = (xs) => percentil(xs, 0.5);
const limpia = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** `dictado di --guarda`: la voz del agente, a 16 kHz mono PCM16 (lo que el dictado captura). */
function sintetiza(texto, ruta) {
  if (existsSync(ruta)) return ruta;
  const crudo = `${ruta}.crudo.wav`;
  execFileSync(process.execPath, [cli, 'di', texto, '--voz', VOZ, '--velocidad', VELOCIDAD, '--guarda', crudo, '--sin-sonido'], { env, cwd: raiz, stdio: 'ignore' });
  ffmpeg(['-i', crudo, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', ruta]);
  return ruta;
}
function silencio(ms, ruta) {
  if (!existsSync(ruta)) ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', String(ms / 1000), '-c:a', 'pcm_s16le', ruta]);
  return ruta;
}
function concatena(partes, ruta) {
  const lista = join(salida, 'lista.txt');
  writeFileSync(lista, partes.map((p) => `file '${p}'`).join('\n'));
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', ruta]);
  unlinkSync(lista);
  return ruta;
}

/** Lanza `dictado dictar` y recoge sus lineas (sin color); `termina()` manda Ctrl+C y espera. */
function lanzaDictar(args, msTope, masEnv = {}) {
  const hijo = spawn(process.execPath, [cli, 'dictar', ...args], { cwd: raiz, env: { ...env, ...masEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
  const lineas = [];
  let resto = '';
  const traga = (d) => { resto += d; const partes = resto.split('\n'); resto = partes.pop() ?? ''; for (const l of partes) lineas.push(limpia(l)); };
  hijo.stdout.setEncoding('utf8'); hijo.stdout.on('data', traga);
  hijo.stderr.setEncoding('utf8'); hijo.stderr.on('data', traga);
  const fin = new Promise((r) => hijo.on('close', (c) => { if (resto) lineas.push(limpia(resto)); r(c); }));
  const tope = setTimeout(() => hijo.kill('SIGKILL'), msTope);
  tope.unref();
  return {
    lineas,
    fin: fin.then((c) => { clearTimeout(tope); return c; }),
    async hasta(patron, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (lineas.some((l) => patron.test(l))) return true; await espera(200); } return false; },
    async termina() { hijo.kill('SIGINT'); return fin; },
  };
}

/** Las trazas `traza conversacion <ms> <etiqueta>`, con el texto del ultimo `✓` para cada pegado. */
function trazas(lineas) {
  const salidas = [];
  let ultimoTexto = '';
  lineas.forEach((l, i) => {
    const t = l.trim();
    if (t.startsWith('✓ ')) ultimoTexto = t.slice(2).replace(/\s*\[[^\]]*\]\s*$/, '');
    const m = /^traza conversacion (\d+) (.+)$/.exec(t);
    if (m) salidas.push({ i, ms: Number(m[1]), etiqueta: m[2], ...(m[2].startsWith('pegado') ? { texto: ultimoTexto } : {}) });
  });
  return salidas;
}

// ─── A · envio por silencio ───────────────────────────────────────────────────────────────────

/** Frases con una pausa de pensamiento natural en medio: la primera mitad no cierra la idea. */
const FRASES_A = [
  ['Recuérdame mandar la cotización a Luis', 'el jueves por la mañana, antes de la junta.'],
  ['Agenda una reunión con Ana Martínez', 'el martes a las diez y media.'],
  ['El cliente dijo que le parece caro', 'y que no sabe si tiene presupuesto este trimestre.'],
  ['Necesitamos veinte horas al mes menos de retrabajo', 'en cotizaciones y en seguimiento.'],
  ['El pedido de tornillos de la planta de Monterrey', 'va con urgencia para el viernes.'],
];
const PAUSAS = [1000, 1500, 2000, 2500, 3000];
const LEAD = 1000;
const COLA = 6000;
const PLAZO_MAXIMO = 10_000; // el tope del ajuste: ningun turno se envia, solo se miden los huecos

function fabricaSesionA() {
  const turnos = PAUSAS.flatMap((pausa, i) => [FRASES_A[(2 * i) % 5], FRASES_A[(2 * i + 1) % 5]].map((f) => ({ pausa, mitades: f })));
  const partes = [];
  let desde = 0;
  for (const [k, t] of turnos.entries()) {
    const h1 = sintetiza(t.mitades[0], join(salida, `a-${String(k + 1).padStart(2, '0')}-1.wav`));
    const h2 = sintetiza(t.mitades[1], join(salida, `a-${String(k + 1).padStart(2, '0')}-2.wav`));
    const d1 = duracionMs(h1);
    const d2 = duracionMs(h2);
    t.desdeMs = desde;
    t.finMitad1Ms = desde + LEAD + d1;
    t.finMitad2Ms = t.finMitad1Ms + t.pausa + d2;
    t.duracionMs = LEAD + d1 + t.pausa + d2 + COLA;
    partes.push(silencio(LEAD, join(salida, `s-${LEAD}.wav`)), h1, silencio(t.pausa, join(salida, `s-${t.pausa}.wav`)), h2, silencio(COLA, join(salida, `s-${COLA}.wav`)));
    desde += t.duracionMs;
  }
  return { wav: concatena(partes, join(salida, 'a-sesion.wav')), turnos, totalMs: desde };
}

/** Un pase de la sesion con un plazo; devuelve por turno: pegados, huecos, envios buenos y falsos. */
async function paseA(sesion, envioMs) {
  const d = lanzaDictar(['--entrada', sesion.wav, '--modo', 'manos-libres', '--conversacion', '--envio-ms', String(envioMs), '--pegar', 'ninguno', '--sin-trayectoria', '--conversacion-puerto', String(PUERTO)], sesion.totalMs + 60_000);
  const codigo = await d.fin;
  const ev = trazas(d.lineas);
  const primera = ev.find((e) => e.etiqueta === 'inicio-habla');
  if (!primera) throw new Error(`pase ${envioMs}: ninguna voz detectada (codigo ${codigo}). Ultimas lineas:\n${d.lineas.slice(-8).join('\n')}`);
  // El reloj del WAV: la primera voz entra a LEAD + arranque del VAD; el resto va a tiempo real.
  const origen = primera.ms - LEAD;
  const porTurno = sesion.turnos.map((t, k) => {
    const dentro = ev.filter((e) => e.ms - origen >= t.desdeMs && e.ms - origen < t.desdeMs + t.duracionMs);
    const pegados = dentro.filter((e) => e.etiqueta.startsWith('pegado'));
    const inicios = dentro.filter((e) => e.etiqueta === 'inicio-habla');
    const envios = dentro.filter((e) => e.etiqueta === 'enviado');
    const ultimoPegado = pegados.at(-1);
    const ultimoFin = dentro.filter((e) => e.etiqueta === 'fin-habla').at(-1);
    const falsos = ultimoPegado ? envios.filter((e) => e.ms < ultimoPegado.ms).length : 0;
    const buenos = ultimoPegado ? envios.filter((e) => e.ms >= ultimoPegado.ms).length : 0;
    // Hueco real entre el pegado de la primera mitad y la voz de la segunda: lo que el plazo debe superar.
    const hueco = pegados.length >= 2 && inicios.length >= 2 ? inicios[1].ms - pegados[0].ms : null;
    const finAEnvio = buenos && ultimoFin ? envios.find((e) => e.ms >= ultimoPegado.ms).ms - ultimoFin.ms : null;
    return { turno: k + 1, pausa: t.pausa, partida: pegados.length >= 2, pegados: pegados.length, textos: pegados.map((p) => p.texto), hueco, falsos, buenos, finAEnvio };
  });
  return { envioMs, codigo, porTurno };
}

async function bloqueA() {
  console.log('A · fabricando la sesion (10 turnos, pausas 1-3 s)…');
  const sesion = fabricaSesionA();
  console.log(`  ${sesion.wav} · ${(sesion.totalMs / 1000).toFixed(0)} s`);
  console.log(`A · huecos reales con el plazo al maximo (${PLAZO_MAXIMO} ms)…`);
  const huecos = await paseA(sesion, PLAZO_MAXIMO);
  for (const t of huecos.porTurno) console.log(`  turno ${t.turno} pausa ${t.pausa}: ${t.partida ? `partida, hueco ${t.hueco} ms` : `NO partida (${t.pegados} pegado)`}${t.falsos ? ` · ${t.falsos} FALSO` : ''}`);
  const huecoMax2s = Math.max(...huecos.porTurno.filter((t) => t.pausa <= 2000 && t.hueco !== null).map((t) => t.hueco), 0);
  const pases = [];
  for (const c of CANDIDATOS) {
    console.log(`A · verificando envioMs=${c}…`);
    const r = await paseA(sesion, c);
    pases.push(r);
    for (const t of r.porTurno) console.log(`  turno ${t.turno} pausa ${t.pausa}: ${t.partida ? 'partida' : 'no partida'} · falsos ${t.falsos} · buenos ${t.buenos}${t.finAEnvio !== null ? ` · fin de habla → Enter ${t.finAEnvio} ms` : ''}`);
  }
  // El margen no es opinion: la latencia del motor oscila p95-p50 ≈ 400 ms (tabla de motores del README).
  const MARGEN = 400;
  const resumen = pases.map((r) => ({ envioMs: r.envioMs, falsosHasta2s: r.porTurno.filter((t) => t.pausa <= 2000).reduce((n, t) => n + t.falsos, 0), falsosMasDe2s: r.porTurno.filter((t) => t.pausa > 2000).reduce((n, t) => n + t.falsos, 0), turnosEnviados: r.porTurno.filter((t) => t.buenos > 0).length, finAEnvioP50: p50(r.porTurno.map((t) => t.finAEnvio)) }));
  const elegido = resumen.find((r) => r.falsosHasta2s === 0 && r.turnosEnviados === PAUSAS.length * 2 && r.envioMs >= huecoMax2s + MARGEN)?.envioMs ?? null;
  return { huecoMax2s, margenMs: MARGEN, elegido, huecos: huecos.porTurno, pases: resumen, detalle: pases.map((r) => r.porTurno) };
}

// ─── B · half-duplex ──────────────────────────────────────────────────────────────────────────

/** Respuestas como las que el hook mandara: un primer parrafo hablable, de una a tres frases. */
const RESPUESTAS_B = [
  'Listo. El envío por silencio ya está medido.',
  'Te escucho. Cuando termines de hablar, el turno se envía solo.',
  'Hecho. Cambié el valor por defecto y las pruebas siguen en verde. ¿Sigo con la siguiente fase?',
  'El micrófono se calla mientras hablo y se reabre en cuanto termino.',
  'Encontré dos cosas. La primera es un fallo en el reloj de envío, y la segunda es una prueba que faltaba.',
  'Sí. Nada sale de esta máquina: la voz y la transcripción son locales.',
  'No lo hice todavía. Falta la aprobación del cambio de configuración, que es tuya.',
  'La medición terminó. Cero fugas en diez respuestas, y el primer audio tarda menos de medio segundo.',
  'Vale.',
  'Antes de seguir, una pregunta corta. ¿Quieres que lo documente en el README o solo en el registro de la medición?',
];

/** Una sesion de `dictar` con conversacion y un margen, N respuestas por el socket, y las trazas de cada una. */
async function paseB(margenMs) {
  const d = lanzaDictar(['--modo', 'manos-libres', '--conversacion', '--empieza', '--pegar', 'ninguno', '--sin-trayectoria', '--conversacion-puerto', String(PUERTO)], 10 * 60_000, { DICTADO_CONVERSACION_MARGEN_MS: String(margenMs) });
  if (!(await d.hasta(/voz del agente: .* lista/, 60_000)) || !(await d.hasta(/microfono abierto en/, 30_000))) { await d.termina(); throw new Error(`B (margen ${margenMs}): el dictado no llego a escuchar con la voz cargada:\n${d.lineas.slice(-8).join('\n')}`); }
  await espera(1500);
  const respuestas = [];
  for (const texto of RESPUESTAS_B.slice(0, RESPUESTAS)) {
    const r = await pideDi(texto, { puerto: PUERTO, msRespuesta: 60_000 });
    respuestas.push({ texto, ...r });
    await espera(4000); // ventana en la que una fuga se transcribiria
  }
  await d.termina();
  const ev = trazas(d.lineas);
  const recibidos = ev.filter((e) => e.etiqueta === 'di-recibido');
  const porRespuesta = recibidos.map((rec, k) => {
    const hastaI = recibidos[k + 1]?.i ?? d.lineas.length;
    const tramo = ev.filter((e) => e.i >= rec.i && e.i < hastaI);
    const cerrado = tramo.find((e) => e.etiqueta === 'puerta-cerrada');
    const primero = tramo.find((e) => e.etiqueta === 'primer-audio');
    const fin = tramo.find((e) => e.etiqueta === 'voz-fin');
    const abierto = tramo.find((e) => e.etiqueta === 'puerta-abierta');
    const lineasTras = abierto ? d.lineas.slice(abierto.i, hastaI) : [];
    const fugas = lineasTras.filter((l) => l.trim().startsWith('✓ ')).map((l) => l.trim().slice(2));
    return {
      n: k + 1,
      cierreMs: cerrado ? cerrado.ms - rec.ms : null,
      primerAudioDesdePeticionMs: primero ? primero.ms - rec.ms : null,
      primerAudioSintesisMs: respuestas[k]?.tipo === 'hecho' ? respuestas[k].msPrimerAudio : null,
      vozMs: primero && fin ? fin.ms - primero.ms : null,
      reaperturaMs: abierto && fin ? abierto.ms - fin.ms : null,
      fugas,
      // Voz que el VAD ve tras reabrir: cuanto despues de pedir la reapertura (≈ 250 ms es el primer cuadro del microfono nuevo) y con que pico.
      vozDetectadaTras: tramo.filter((e) => e.etiqueta === 'inicio-habla' && abierto && e.i > abierto.i).map((e) => e.ms - abierto.ms),
      picosTras: lineasTras.map((l) => /pico durante la escucha: (-?[\d.]+) dBFS/.exec(l)).filter(Boolean).map((m) => Number(m[1])),
      sinVozTras: lineasTras.filter((l) => l.includes('(sin voz)')).length,
    };
  });
  return { margenMs, respuestas: respuestas.length, porRespuesta, fugas: porRespuesta.reduce((n, r) => n + r.fugas.length, 0), cierreP50: p50(porRespuesta.map((r) => r.cierreMs)), primerAudioDesdePeticionP50: p50(porRespuesta.map((r) => r.primerAudioDesdePeticionMs)), primerAudioSintesisP50: p50(porRespuesta.map((r) => r.primerAudioSintesisMs)), reaperturaP50: p50(porRespuesta.map((r) => r.reaperturaMs)), reaperturaMax: Math.max(...porRespuesta.map((r) => r.reaperturaMs ?? 0)), socket: respuestas.map((r) => r.tipo) };
}

/** Control: la voz suena por OTRO proceso con el microfono abierto. Si la sala oye, aqui se transcribe. */
async function controlB() {
  const d = lanzaDictar(['--modo', 'manos-libres', '--empieza', '--pegar', 'ninguno', '--sin-trayectoria', '--conversacion-puerto', String(PUERTO)], 10 * 60_000);
  if (!(await d.hasta(/microfono abierto en/, 60_000))) { await d.termina(); throw new Error(`control: el dictado no llego a escuchar:\n${d.lineas.slice(-8).join('\n')}`); }
  await espera(1500);
  for (const texto of RESPUESTAS_B.slice(0, RESPUESTAS)) {
    execFileSync(process.execPath, [cli, 'di', texto, '--local', '--voz', VOZ, '--velocidad', VELOCIDAD], { env, cwd: raiz, stdio: 'ignore' });
    await espera(4000);
  }
  await d.termina();
  const textos = d.lineas.filter((l) => l.trim().startsWith('✓ ')).map((l) => l.trim().slice(2));
  const picos = d.lineas.map((l) => /pico durante la escucha: (-?[\d.]+) dBFS/.exec(l)).filter(Boolean).map((m) => Number(m[1]));
  return { transcritos: textos.length, sinVoz: d.lineas.filter((l) => l.includes('(sin voz)')).length, textos, picoP50: p50(picos), picos };
}

async function bloqueB() {
  const r = { margenes: [] };
  for (const margen of MARGENES) {
    console.log(`B · ${RESPUESTAS} respuestas con margen ${margen} ms tras la voz (suena en el altavoz de Windows)…`);
    const pase = await paseB(margen);
    r.margenes.push(pase);
    console.log(`  fugas ${pase.fugas}/${pase.respuestas} · primer audio p50 ${pase.primerAudioDesdePeticionP50} ms desde la peticion (${pase.primerAudioSintesisP50} ms desde que el hablante arranca) · reapertura p50 ${pase.reaperturaP50} ms · voz tras reabrir ${pase.porRespuesta.reduce((n, x) => n + x.vozDetectadaTras.length, 0)}`);
  }
  console.log('B · control: la misma voz por otro proceso con el microfono abierto…');
  r.control = await controlB();
  console.log(`  transcritos ${r.control.transcritos}/${RESPUESTAS} · sin voz ${r.control.sinVoz}`);
  return r;
}

// ─── C · hook Stop ────────────────────────────────────────────────────────────────────────────

const { escuchaConversacion } = await import(pathToFileURL(join(raiz, 'dist', 'node', 'conversacion-socket.js')).href);
const HOOK = join(raiz, 'scripts', 'habla-respuesta.sh');
const ENTRADA_HOOK = JSON.stringify({ session_id: 'medicion', hook_event_name: 'Stop', last_assistant_message: 'Listo. El envío por silencio ya está medido y el valor por defecto sale de la medición.\n\n- detalle uno\n- detalle dos\n\n¿Sigo con la siguiente fase?' });

function corrreHook(puerto) {
  return new Promise((resuelve) => {
    const t0 = performance.now();
    const hijo = spawn('bash', [HOOK], { env: { ...process.env, DICTADO_CONVERSACION_PUERTO: String(puerto) }, stdio: ['pipe', 'pipe', 'ignore'] });
    let stdout = '';
    hijo.stdout.setEncoding('utf8'); hijo.stdout.on('data', (d) => (stdout += d));
    hijo.on('close', (codigo) => resuelve({ codigo, stdout, ms: performance.now() - t0 }));
    hijo.stdin.end(ENTRADA_HOOK);
  });
}

async function situacionC(nombre, saludo, n = 10) {
  const recibidos = [];
  const servidor = saludo ? await escuchaConversacion({ puerto: 0, saludo: () => saludo, alDi: (t) => { recibidos.push(t); return new Promise((r) => setTimeout(() => r({ tipo: 'hecho', msPrimerAudio: 60, msTotal: 4000 }), 4000)); }, alCalla: () => undefined }) : null;
  let puerto = servidor?.puerto;
  if (!servidor) { const libre = await escuchaConversacion({ puerto: 0, saludo: () => 'off inactivo', alDi: async () => ({ tipo: 'cortado' }), alCalla: () => undefined }); puerto = libre.puerto; await libre.cierra(); }
  const corridas = [];
  for (let i = 0; i < n; i++) corridas.push(await corrreHook(puerto));
  await servidor?.cierra();
  const ms = corridas.map((c) => c.ms);
  return { nombre, saludo: saludo ?? '(sin dictado)', n, msP50: p50(ms), msMax: Math.max(...ms), salidasNoCero: corridas.filter((c) => c.codigo !== 0).length, conStdout: corridas.filter((c) => c.stdout.length > 0).length, textosRecibidos: recibidos.length, textoEjemplo: recibidos[0] ?? null };
}

async function bloqueC() {
  const r = [];
  for (const [nombre, saludo] of [['sin dictado', null], ['conversación apagada', 'off escuchando'], ['dictado inactivo', 'on inactivo'], ['conversación encendida', 'on escuchando'], ['encendida, a media frase', 'on transcribiendo']]) {
    console.log(`C · hook ×10 ${nombre}…`);
    const s = await situacionC(nombre, saludo);
    r.push(s);
    console.log(`  p50 ${s.msP50.toFixed(0)} ms · máx ${s.msMax.toFixed(0)} ms · textos recibidos ${s.textosRecibidos}/10 · salidas ≠ 0: ${s.salidasNoCero} · con stdout: ${s.conStdout}`);
  }
  return r;
}

// ─── informe ──────────────────────────────────────────────────────────────────────────────────

const palabras = (t) => new Set(t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zñ0-9 ]/g, ' ').split(/\s+/).filter((p) => p.length > 2));
/** Un texto transcrito «se parece» a una frase si comparten al menos dos palabras de mas de dos letras, o la mitad de las suyas. */
function separaFugas(textos, frases) {
  const voz = [];
  const sala = [];
  for (const t of textos) {
    const mias = palabras(t);
    const comunes = Math.max(...frases.map((f) => { const suyas = palabras(f); return [...mias].filter((p) => suyas.has(p)).length; }), 0);
    (comunes >= 2 || (mias.size > 0 && comunes >= mias.size / 2) ? voz : sala).push(t);
  }
  return { voz, sala };
}

function informe(fecha, a, b, c) {
  const md = [`# Conversación con el agente — medición ${fecha}`, ''];
  if (a) {
    md.push('## A · Envío por silencio (`envioMs`)', '', `Sesión sintética de 10 turnos por \`dictar --entrada\` a tiempo real: cada turno es una frase partida por una pausa de pensamiento (2 turnos por pausa), con ${COLA / 1000} s de cola. Voz ${VOZ} a ${VELOCIDAD}, motor y respaldo por defecto, VAD a 1000 ms.`, '', '| pausa | turno | ¿la partió el VAD? | hueco pegado → voz nueva |', '|---|---|---|---|');
    for (const t of a.huecos) md.push(`| ${t.pausa} ms | ${t.turno} | ${t.partida ? 'sí' : 'no'} | ${t.hueco === null ? '—' : `${t.hueco} ms`} |`);
    md.push('', `Hueco máximo con pausas ≤ 2 s: **${a.huecoMax2s} ms**; margen ${a.margenMs} ms (p95 − p50 de la latencia del motor en la tabla de motores).`, '', '| envioMs | falsos envíos (pausa ≤ 2 s) | falsos (2,5-3 s) | turnos enviados | fin de habla → Enter p50 |', '|---|---|---|---|---|');
    for (const p of a.pases) md.push(`| ${p.envioMs} | ${p.falsosHasta2s} | ${p.falsosMasDe2s} | ${p.turnosEnviados}/10 | ${p.finAEnvioP50 ?? '—'} ms |`);
    md.push('', a.elegido === null ? '**Ningún candidato cumple**: el defecto no se cambia.' : `**Elegido: \`envioMs\` = ${a.elegido} ms** (el menor con 0 falsos envíos hasta 2 s, 10/10 turnos enviados y por encima del hueco máximo más el margen).`, '');
  }
  if (b) {
    md.push('## B · Half-duplex: la puerta del micrófono cerrada mientras habla el agente', '', `${RESPUESTAS} respuestas por el socket local por cada margen, micrófono de WSLg y altavoz de Windows reales. La captura no se para: se cierra la puerta lógica (nada entra al detector) y se reabre tras la voz más el margen. Fuga = texto transcrito tras reabrir.`, '', '| margen tras la voz | fugas (texto parecido a la frase del agente) | primer audio p50 desde la petición (desde que el hablante arranca) | reapertura p50 / máx | voz detectada tras reabrir (ms desde la reapertura; pico) |', '|---|---|---|---|---|');
    for (const r of b.margenes) { const f = separaFugas(r.porRespuesta.flatMap((x) => x.fugas), RESPUESTAS_B); md.push(`| ${r.margenMs} ms | **${f.voz.length}/${r.respuestas}** de la voz del agente (${f.sala.length === 0 ? 'ningún texto ajeno' : `${f.sala.length} texto${f.sala.length === 1 ? '' : 's'} ajeno${f.sala.length === 1 ? '' : 's'} de la sala: ${f.sala.map((t) => `«${t}»`).join(', ')}`}) | ${r.primerAudioDesdePeticionP50} ms (${r.primerAudioSintesisP50} ms) | ${r.reaperturaP50} / ${r.reaperturaMax} ms | ${r.porRespuesta.reduce((n, x) => n + x.vozDetectadaTras.length, 0)} (${r.porRespuesta.flatMap((x) => x.vozDetectadaTras).map((ms) => `${ms} ms`).join(', ') || '—'}; ${r.porRespuesta.flatMap((x) => x.picosTras).map((p) => `${p} dBFS`).join(', ') || '—'}) |`); }
    const fc = separaFugas(b.control.textos, RESPUESTAS_B);
    md.push('', `**Control** (misma voz por otro proceso, micrófono abierto, sin conversación): ${fc.voz.length}/${RESPUESTAS} respuestas transcritas como la frase del agente${fc.sala.length ? ` (+${fc.sala.length} textos ajenos)` : ''}, ${b.control.sinVoz} «sin voz» (el VAD abrió y el motor no sacó texto), pico p50 ${b.control.picoP50 ?? '—'} dBFS. ${fc.voz.length + b.control.sinVoz > 0 ? 'La sala **sí oye** el altavoz: los ceros de arriba son mérito del half-duplex.' : 'La sala **no oye** el altavoz (auriculares o micrófono mudo): los ceros de arriba no demuestran nada; repetir con altavoces.'}`, '', '**Corridas previas del mismo día (2026-09-23), con el código que aún paraba la captura:** micrófono `cerrado` (ffmpeg parado y rearrancado) frente a solo la puerta lógica, 10 respuestas cada uno, sala en silencio: fugas de la voz 0/10 y 0/10 (un texto ajeno, «Documental.»); primer audio p50 267 ms (esperando al cierre de ffmpeg; la síntesis ya se solapaba) frente a 56 ms; reapertura p50 249 ms frente a 151 ms; el VAD se abrió tras reabrir 1 vez frente a 0. Por eso la captura ya no se para.', '', 'La «voz detectada tras reabrir» que no coincide con la frase del agente y llega a instantes sueltos del hueco de 4 s es la sala (otra fuente sonando), no la cola de la voz: cuenta igual, porque con la sala sonando el agente espera al cierre de ese «turno» (RF-40, tope 5 s) antes de hablar, y eso es lo que infla el «primer audio desde la petición». Subir `umbralVozDb` es el mando para una sala con ruido.', '');
  }
  if (c) {
    md.push('## C · Hook `Stop`: el agente habla sin que se lo pidan', '', '`scripts/habla-respuesta.sh` con el JSON del arnés por stdin, 10 veces por situación, contra un socket falso que tarda 4 s en «sonar» (sin audio). RF-43 exige < 100 ms sin dictado o con la conversación apagada; RF-42, que el texto llegue y el hook no espere a la voz.', '', '| situación (saludo del dictado) | salida p50 / máx | textos recibidos | salidas ≠ 0 | con stdout |', '|---|---|---|---|---|');
    for (const s of c) md.push(`| ${s.nombre}${s.saludo.startsWith('(') ? '' : ` (${s.saludo})`} | ${s.msP50.toFixed(0)} / ${s.msMax.toFixed(0)} ms | ${s.textosRecibidos}/${s.n} | ${s.salidasNoCero} | ${s.conStdout} |`);
    const ejemplo = c.find((s) => s.textoEjemplo);
    if (ejemplo) md.push('', `Lo que llega al socket con la respuesta de prueba (lista y pregunta final incluidas en el markdown): «${ejemplo.textoEjemplo}».`);
    md.push('');
  }
  return md.join('\n');
}

const fecha = new Date().toISOString().slice(0, 10);
const rutaJson = join(raiz, 'medicion', 'corpus-propio', `conversacion-${fecha}.json`);
const previo = existsSync(rutaJson) ? JSON.parse(readFileSync(rutaJson, 'utf8')) : {};
const a = BLOQUE.includes('a') ? await bloqueA() : (previo.a ?? null);
const b = BLOQUE.includes('b') ? await bloqueB() : (previo.b ?? null);
const c = BLOQUE.includes('c') ? await bloqueC() : (previo.c ?? null);
const md = informe(fecha, a, b, c);
writeFileSync(rutaJson, JSON.stringify({ fecha, voz: VOZ, velocidad: Number(VELOCIDAD), a, b, c }, null, 1));
writeFileSync(join(raiz, 'medicion', 'corpus-propio', `conversacion-${fecha}.md`), md);
console.log(`\n${md}`);
