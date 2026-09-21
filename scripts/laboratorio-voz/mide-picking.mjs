#!/usr/bin/env node
/**
 * Confirmaciones de picking, sinteticas: por cada linea del pedido de muestra, varias formas de
 * decirlo (canonica, con unidad, colectivo si aplica, «son N», «si», «no, faltan», y un distractor
 * N±2) con las dos voces Piper, en `limpio` y en `almacen` (babble + eco, de `condiciones.mjs`):
 * voz → demonio /sintetizar → ffmpeg (condicion) → demonio /transcribir → evaluaConfirmacion.
 * Sale la matriz esperado × obtenido. La cifra que manda: confirmaciones ERRONEAS (se dijo otra
 * cosa y la maquina confirmo) = 0. Rechazos falsos (se dijo bien y no confirmo) ≤ 5 % en limpio.
 *
 *   node scripts/laboratorio-voz/mide-picking.mjs [--voces es_MX-claude-high,es_ES-davefx-medium] [--condiciones limpio,almacen] [--salida tools/dictado/medicion/corpus-propio]
 *
 * Exige el demonio vivo (npm run demonio en tools/dictado). Medir sin otra carga.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { evaluaConfirmacion, PEDIDO_MUESTRA } from '../../src/features/laboratorio-voz/services/picking.ts';
import { CONDICIONES, nivelMedioDb } from '../../tools/dictado/medicion/condiciones.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const VOCES = arg('voces', 'es_MX-claude-high,es_ES-davefx-medium').split(',');
const CONDS = arg('condiciones', 'limpio,almacen').split(',');
const SALIDA = resolve(arg('salida', 'tools/dictado/medicion/corpus-propio'));
const DEMONIO = `http://127.0.0.1:${process.env.DICTADO_DEMONIO_PUERTO ?? 47125}`;
const token = /^DICTADO_MOVIL_TOKEN=(.+)$/m.exec(readFileSync('.env.local', 'utf8'))?.[1]?.trim();
if (!token) throw new Error('falta DICTADO_MOVIL_TOKEN en .env.local');
console.log(`token: presente (largo ${token.length})`);
if (!(await fetch(`${DEMONIO}/health`).then((r) => r.ok).catch(() => false))) throw new Error('el demonio no responde: npm run demonio en tools/dictado');
const carpeta = join(tmpdir(), `mide-picking-${Date.now()}`);
mkdirSync(carpeta, { recursive: true });

/** Numero → palabras (0-999), para que el distractor tambien se DIGA y no se lea en cifras. */
const U = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DEC = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CEN = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
function enPalabras(n) {
  if (n < 30) return U[n];
  if (n < 100) return DEC[Math.floor(n / 10)] + (n % 10 ? ` y ${U[n % 10]}` : '');
  if (n === 100) return 'cien';
  return CEN[Math.floor(n / 100)] + (n % 100 ? ` ${enPalabras(n % 100)}` : '');
}
const plural = { unidad: 'unidades', caja: 'cajas', par: 'pares', metro: 'metros', litro: 'litros', kilo: 'kilos', tramo: 'tramos', botella: 'botellas', paquete: 'paquetes', saco: 'sacos', tarima: 'tarimas', lata: 'latas', rollo: 'rollos' };
const conUnidad = (n, u = 'unidad') => `${enPalabras(n)} ${n === 1 ? u : plural[u] ?? `${u}s`}`;
const colectivo = (n) => (n === 12 ? 'una docena' : n === 24 ? 'dos docenas' : n === 6 ? 'media docena' : n === 10 ? 'una decena' : n === 100 ? 'cien' : undefined);

/** Las formas habladas por linea, con el veredicto ESPERADO. */
function formasDe(linea) {
  const n = linea.cantidad;
  const u = linea.unidad ?? 'unidad';
  const formas = [
    { dicho: enPalabras(n), espera: 'ok' },
    { dicho: conUnidad(n, u), espera: 'ok' },
    { dicho: `son ${enPalabras(n)}`, espera: 'ok' },
    { dicho: `sí, ${enPalabras(n)}`, espera: 'ok' },
    // «sí» a secas NO confirma por diseño (se oye «seis» como «sí»): se mide que nunca confirme.
    { dicho: 'sí', espera: 'sin-cantidad' },
    { dicho: `no, faltan ${enPalabras(Math.max(1, Math.min(9, n - 1)))}`, espera: 'no' },
    { dicho: enPalabras(n + 2), espera: 'cantidad-distinta' },
  ];
  const c = colectivo(n);
  if (c) formas.push({ dicho: c, espera: 'ok' });
  else formas.push({ dicho: enPalabras(n - 2 >= 1 ? n - 2 : n + 3), espera: 'cantidad-distinta' }); // nunca igual a n
  return formas;
}

const cabeceras = { authorization: `Bearer ${token}` };
async function sintetiza(texto, voz, ruta) {
  const r = await fetch(`${DEMONIO}/sintetizar`, { method: 'POST', headers: { ...cabeceras, 'content-type': 'application/json' }, body: JSON.stringify({ texto, voz }) });
  if (!r.ok) throw new Error(`sintetizar ${r.status}`);
  const pcm = Buffer.from(await r.arrayBuffer());
  const hz = Number(r.headers.get('x-frecuencia-hz'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', String(hz), '-ac', '1', '-i', 'pipe:0', ruta], { input: pcm });
}
const aplicaCondicion = (entrada, salida, condicion, vozDb, babble) => {
  if (condicion === 'limpio') return execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', entrada, '-ar', '16000', '-ac', '1', salida]);
  const filtro = CONDICIONES[condicion](vozDb, { babbleDb: babble?.db });
  const args = ['-y', '-loglevel', 'error', '-i', entrada, ...(condicion === 'almacen' ? ['-stream_loop', '-1', '-i', babble.ruta] : []), '-filter_complex', filtro, '-ar', '16000', '-ac', '1', '-t', '12', salida];
  return execFileSync('ffmpeg', args);
};
async function transcribe(rutaWav16k, motor = 'principal') {
  const pcm = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', rutaWav16k, '-f', 's16le', '-ar', '16000', '-ac', '1', 'pipe:1'], { maxBuffer: 64 * 1024 * 1024 });
  const t0 = performance.now();
  const r = await fetch(`${DEMONIO}/transcribir`, { method: 'POST', headers: { ...cabeceras, 'content-type': 'application/octet-stream', 'x-frecuencia-hz': '16000', 'x-idioma': 'es', 'x-motor': motor }, body: new Uint8Array(pcm) });
  const j = await r.json();
  if (!r.ok) throw new Error(`transcribir ${r.status} ${j.error ?? ''}`);
  return { texto: j.texto ?? '', ms: Math.round(performance.now() - t0) };
}

// Babble para el almacen: frases del corpus leidas por la otra voz, encadenadas.
let babble;
if (CONDS.includes('almacen')) {
  const frases = readFileSync('tools/dictado/medicion/corpus-propio/frases.txt', 'utf8').split('\n').filter(Boolean).slice(0, 6).join(' ');
  const ruta = join(carpeta, 'babble.wav');
  await sintetiza(frases, VOCES[1] ?? VOCES[0], ruta);
  babble = { ruta, db: nivelMedioDb(ruta) };
  console.log(`babble de almacen: ${frases.length} caracteres, nivel medio ${babble.db.toFixed(1)} dB`);
}

const filas = [];
const t0 = performance.now();
let k = 0;
for (const condicion of CONDS) {
  for (const voz of VOCES) {
    for (const [i, linea] of PEDIDO_MUESTRA.entries()) {
      for (const f of formasDe(linea)) {
        const crudo = join(carpeta, `${k}-crudo.wav`);
        const listo = join(carpeta, `${k}.wav`);
        k++;
        await sintetiza(f.dicho, voz, crudo);
        const vozDb = condicion === 'limpio' ? 0 : nivelMedioDb(crudo);
        aplicaCondicion(crudo, listo, condicion, vozDb, babble);
        // La misma politica que el panel: principal, y si no hay cantidad, segundo pase con el respaldo (idioma forzado).
        const r1 = await transcribe(listo);
        let texto = r1.texto;
        let v = evaluaConfirmacion(texto, linea);
        let pases = 1;
        let msRespaldo = 0;
        if (v.tipo === 'no-entendi') {
          const r2 = await transcribe(listo, 'respaldo');
          pases = 2;
          msRespaldo = r2.ms;
          if (r2.texto) { texto = r2.texto; v = evaluaConfirmacion(texto, linea); }
        }
        filas.push({ condicion, voz, linea: i + 1, cantidad: linea.cantidad, unidad: linea.unidad ?? 'unidad', dicho: f.dicho, espera: f.espera, oido: texto, oidoPrincipal: r1.texto, obtenido: v.tipo, pases, msPrincipal: r1.ms, msRespaldo });
      }
    }
    const parcial = filas.filter((x) => x.condicion === condicion && x.voz === voz);
    console.log(`${condicion} · ${voz}: ${parcial.length} locuciones · aciertos ${parcial.filter((x) => x.espera === x.obtenido).length} · confirmaciones erroneas ${parcial.filter((x) => x.espera !== 'ok' && x.obtenido === 'ok').length} · rechazos falsos ${parcial.filter((x) => x.espera === 'ok' && x.obtenido !== 'ok').length} · segundo pase en ${parcial.filter((x) => x.pases === 2).length}`);
  }
}
const ms = Math.round(performance.now() - t0);

// matriz esperado × obtenido por condicion
const TIPOS = ['ok', 'no', 'cantidad-distinta', 'unidad-distinta', 'repetir', 'no-entendi', 'sin-cantidad'];
const resumen = {};
for (const condicion of CONDS) {
  const de = filas.filter((x) => x.condicion === condicion);
  const matriz = Object.fromEntries(['ok', 'no', 'cantidad-distinta', 'sin-cantidad'].map((e) => [e, Object.fromEntries(TIPOS.map((o) => [o, de.filter((x) => x.espera === e && x.obtenido === o).length]))]));
  const esperadasOk = de.filter((x) => x.espera === 'ok');
  const unaPalabra = esperadasOk.filter((x) => x.dicho.split(' ').length === 1);
  const variasPalabras = esperadasOk.filter((x) => x.dicho.split(' ').length > 1);
  resumen[condicion] = {
    rechazosFalsosUnaPalabra: { n: unaPalabra.length, rechazos: unaPalabra.filter((x) => x.obtenido !== 'ok').length },
    rechazosFalsosVariasPalabras: { n: variasPalabras.length, rechazos: variasPalabras.filter((x) => x.obtenido !== 'ok').length },
    n: de.length,
    confirmacionesErroneas: de.filter((x) => x.espera !== 'ok' && x.obtenido === 'ok').length,
    rechazosFalsos: esperadasOk.filter((x) => x.obtenido !== 'ok').length,
    rechazosFalsosFraccion: +(esperadasOk.filter((x) => x.obtenido !== 'ok').length / Math.max(1, esperadasOk.length)).toFixed(3),
    aciertos: de.filter((x) => x.espera === x.obtenido).length,
    segundoPase: de.filter((x) => x.pases === 2).length,
    msPrincipalP50: [...de.map((x) => x.msPrincipal)].sort((a, b) => a - b)[Math.floor(de.length / 2)] ?? null,
    msRespaldoP50: (() => { const r = de.filter((x) => x.pases === 2).map((x) => x.msRespaldo).sort((a, b) => a - b); return r[Math.floor(r.length / 2)] ?? null; })(),
    matriz,
    porVoz: Object.fromEntries(VOCES.map((v) => { const d = de.filter((x) => x.voz === v); const ok = d.filter((x) => x.espera === 'ok'); return [v, { n: d.length, confirmacionesErroneas: d.filter((x) => x.espera !== 'ok' && x.obtenido === 'ok').length, rechazosFalsos: ok.filter((x) => x.obtenido !== 'ok').length, aciertos: d.filter((x) => x.espera === x.obtenido).length }]; })),
  };
}
const fecha = new Date().toISOString().slice(0, 10);
mkdirSync(SALIDA, { recursive: true });
writeFileSync(join(SALIDA, `picking-${fecha}.json`), JSON.stringify({ fecha, voces: VOCES, condiciones: CONDS, ms, umbrales: { confirmacionesErroneas: 0, rechazosFalsosLimpio: 0.05 }, resumen, filas }, null, 1));
const md = [`# Picking sintético — medición ${fecha}`, '', `${filas.length} locuciones (${PEDIDO_MUESTRA.length} líneas × ${formasDe(PEDIDO_MUESTRA[0]).length} formas × ${VOCES.length} voces × ${CONDS.length} condiciones; la forma «sí» a secas se mide para comprobar que NUNCA confirma) en ${(ms / 1000).toFixed(0)} s, todo por el demonio. Voces sintéticas: mide la gramática y el motor, no a una persona con casco.`, '', '| condición | n | confirmaciones erróneas | rechazos falsos | aciertos | segundo pase (respaldo) | motor p50 · respaldo p50 |', '|---|---|---|---|---|---|---|', ...CONDS.map((c) => `| ${c} | ${resumen[c].n} | **${resumen[c].confirmacionesErroneas}** | ${resumen[c].rechazosFalsos} (${(resumen[c].rechazosFalsosFraccion * 100).toFixed(1)} %) | ${resumen[c].aciertos} (${((resumen[c].aciertos / resumen[c].n) * 100).toFixed(1)} %) | ${resumen[c].segundoPase} (${((resumen[c].segundoPase / resumen[c].n) * 100).toFixed(0)} %) | ${resumen[c].msPrincipalP50} ms · ${resumen[c].msRespaldoP50 ?? '—'} ms |`), '', 'Política, la misma que el panel: primero el motor principal (Parakeet); si no se entiende una cantidad, segundo pase con el respaldo (faster-whisper small, idioma forzado). Medido el 2026-09-20 sin respaldo: 0 confirmaciones erróneas pero 22 % de rechazos falsos en limpio, casi todos «sí» y números sueltos oídos en inglés («Sir», «Six»).', '', '| condición | rechazos falsos con UNA palabra («sí», «tres») | con dos o más («son tres», «tres unidades») |', '|---|---|---|', ...CONDS.map((c) => `| ${c} | ${resumen[c].rechazosFalsosUnaPalabra.rechazos}/${resumen[c].rechazosFalsosUnaPalabra.n} (${((resumen[c].rechazosFalsosUnaPalabra.rechazos / Math.max(1, resumen[c].rechazosFalsosUnaPalabra.n)) * 100).toFixed(1)} %) | ${resumen[c].rechazosFalsosVariasPalabras.rechazos}/${resumen[c].rechazosFalsosVariasPalabras.n} (${((resumen[c].rechazosFalsosVariasPalabras.rechazos / Math.max(1, resumen[c].rechazosFalsosVariasPalabras.n)) * 100).toFixed(1)} %) |`), '', 'Un monosílabo sintético aislado («sí», «tres» de 0,6 s) no es un «sí» humano: los dos motores lo oyen en inglés o como otra cosa, y rellenar con silencio no lo arregla (probado). Por eso el panel pide la cantidad con su unidad o con «son».', ''];
for (const c of CONDS) {
  md.push(`## Matriz esperado × obtenido · ${c}`, '', `| esperado \\ obtenido | ${TIPOS.join(' | ')} |`, `|---|${TIPOS.map(() => '---').join('|')}|`, ...Object.entries(resumen[c].matriz).map(([e, fila]) => `| ${e} | ${TIPOS.map((o) => fila[o]).join(' | ')} |`), '');
  const fallos = filas.filter((x) => x.condicion === c && x.espera !== x.obtenido);
  if (fallos.length) md.push(`Fallos en ${c} (${fallos.length}):`, '', ...fallos.slice(0, 40).map((x) => `- línea ${x.linea} (${x.cantidad} ${x.unidad}) · ${x.voz} · dijo «${x.dicho}» · oyó «${x.oido}»${x.pases === 2 ? ` (principal: «${x.oidoPrincipal}»)` : ''} · esperado ${x.espera}, obtenido ${x.obtenido}`), '');
}
md.push('Umbrales: confirmaciones erróneas = 0 (la única falla que no se perdona) · rechazos falsos ≤ 5 % en limpio. Un rechazo falso cuesta un intento; una confirmación errónea cuesta un pedido mal servido.', '');
writeFileSync(join(SALIDA, `picking-${fecha}.md`), md.join('\n'));
console.log(`escrito ${join(SALIDA, `picking-${fecha}.md`)} · ${filas.length} locuciones en ${(ms / 1000).toFixed(0)} s`);
