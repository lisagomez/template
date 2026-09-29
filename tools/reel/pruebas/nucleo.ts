/** Pruebas del núcleo del reel: cortes, precios, subtítulos, privacidad, QA, retención y sala. Sin motores. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRUTO, SE_CONSERVA, propone, edlDesde, aEditado, aOriginal, cotejaPrecios, preciosDichos, rotulos, archivoAss, rotulosFueraDeZona, enLineas, pistasDeCaras, sujeto, desenfoquesDeCaras, datosEnTexto, agrupaHallazgos, carasSinCubrir, revisaMaster, porBorrar, validaAprobacion, aplicaCortes, sonidoEnPausas, argumentosDelMaster, type Palabra } from '../dist/index.js';
import { palabrasDeTokens, lineasDeTsv } from '../dist/node/index.js';

const P = (texto: string, inicio: number, fin: number): Palabra => ({ texto, inicio, fin });
const frase = (s: string, paso = 0.4) => s.split(' ').map((w, i) => P(w, i * paso, i * paso + paso - 0.1));

test('retoma verdadera se corta; una frase repetida dentro de otra no', () => {
  const edl = propone(frase('Hoy sacamos el pan. Hoy sacamos el pan de muerto recién horneado el pan de muerto cuesta'), 8);
  assert.deepEqual(edl.descartes.filter((d) => d.motivo === 'retoma').map((d) => [d.inicio, d.fin]), [[0, 1.6]]);
});

test('silencios largos se cortan dejando respiro; tiempos editado ↔ original', () => {
  const edl = propone([P('hola', 0, 0.5), P('pan', 3, 3.4)], 4);
  assert.equal(edl.descartes.some((d) => d.motivo === 'silencio'), true);
  assert.equal(aEditado(1.5, edl), null);
  assert.equal(aOriginal(aEditado(3.1, edl) ?? -1, edl).toFixed(2), '3.10');
});

test('precios: cifras, palabras y producto truncado por el transcriptor', () => {
  assert.deepEqual(preciosDichos(['cuesta', 'cuarenta', 'y', 'cinco', 'pesos.']).map((p) => p.valor), [45]);
  assert.deepEqual(preciosDichos(['a', '$45.50']).map((p) => p.valor), [45.5]);
  const obs = cotejaPrecios(frase('el pan de muer cuesta 50 pesos'), [{ nombre: 'pan de muerto', precio: 45 }]);
  assert.equal(obs[0]?.regla, 'precio-no-coincide');
  assert.equal(cotejaPrecios(frase('el pan de muerto cuesta 45 pesos'), [{ nombre: 'pan de muerto', precio: 45 }])[0]?.nivel, 'aviso');
});

test('subtítulos: sin etiquetas ASS inyectadas, líneas partidas y dentro de la zona segura', () => {
  const rs = rotulos([P('{\\b1}Gratisgratisgratisgratisgratis', 0, 0.5), P('hoy.', 0.6, 0.9)], edlDesde([], 1));
  const ass = archivoAss(rs, { nombre: 'x', colores: { primario: '#000000', texto: '#ffffff' }, tipografia: 'sans' });
  assert.equal(/Dialogue:.*\{\\/.test(ass), false);
  assert.equal(rotulosFueraDeZona(rs).length, 0);
  assert.ok(enLineas('a'.repeat(50)).every((l) => l.length <= 22));
});

test('caras: el sujeto no se desenfoca; las demás sí, y la re-detección las encuentra si quedaron al aire', () => {
  const dets = [0, 0.5, 1, 1.5].flatMap((t) => [{ t, x: 300, y: 600, ancho: 300, alto: 360, confianza: 1 }, { t, x: 900, y: 200, ancho: 60, alto: 70, confianza: 0.95 }]);
  const ps = pistasDeCaras(dets, 4);
  const s = sujeto(ps);
  assert.equal(ps.length, 2);
  assert.equal(desenfoquesDeCaras(ps, s?.id ?? null, new Set()).length, 4);
  assert.equal(desenfoquesDeCaras(ps, s?.id ?? null, new Set([2])).length, 0);
  assert.equal(carasSinCubrir(dets, s?.detecciones ?? []).length, 4);
});

test('datos en pantalla: teléfono, RFC y tarjeta (Luhn), enmascarados a 4 caracteres y agrupados', () => {
  assert.deepEqual(datosEnTexto('Tel. 55 0000 1234'), [{ tipo: 'telefono', muestra: '55 0…' }]);
  assert.equal(datosEnTexto('RFC GOML800101AB1')[0]?.tipo, 'rfc');
  assert.equal(datosEnTexto('4111 1111 1111 1111')[0]?.tipo, 'tarjeta');
  assert.equal(datosEnTexto('Total $45.00').length, 0);
  const g = agrupaHallazgos([0, 1, 2].map((t) => ({ t, tipo: 'telefono' as const, muestra: '55 0…', caja: { x: 10, y: 10, ancho: 100, alto: 20 } })));
  assert.equal(g.length, 1); assert.equal(g[0]?.hasta, 2);
});

test('sonido en las pausas: el silencio digital no cuenta, un tono sí', () => {
  const hz = 16_000, m = new Float32Array(hz * 2);
  assert.equal(sonidoEnPausas(m, hz, [P('hola', 0, 0.3)]).fraccion, 0);
  for (let i = 0; i < m.length; i++) m[i] = 0.1 * Math.sin((2 * Math.PI * 220 * i) / hz);
  assert.ok(sonidoEnPausas(m, hz, [P('hola', 0, 0.3)]).fraccion > 0.9);
});

test('QA: formato, volumen y lo que quedó al aire bloquean', () => {
  const ok = { medidas: { ancho: 1080, alto: 1920, fps: 30, duracion: 20, audioHz: 48000, codecVideo: 'h264', codecAudio: 'aac' }, lufs: -14.2, carasSinCubrir: 0, datosEnPantalla: 0, rotulosFueraDeZona: 0 };
  assert.equal(revisaMaster(ok).length, 0);
  assert.deepEqual(revisaMaster({ ...ok, lufs: -18, carasSinCubrir: 1 }).map((o) => o.regla), ['volumen', 'cara-sin-cubrir']);
});

test('retención: 30 días exactos tras aprobar, con reloj inyectado', () => {
  const ps = [{ id: 'a', aprobadoEn: '2026-08-28T12:00:00Z', brutoBorradoEn: null }];
  assert.deepEqual(porBorrar(ps, new Date('2026-09-27T11:59:59Z')), []);
  assert.deepEqual(porBorrar(ps, new Date('2026-09-27T12:00:00Z')), ['a']);
  // Regresión: la copia normalizada del video y el resultado (lleva la transcripción) se quedaban.
  for (const n of ['bruto.mp4', 'normalizado.mov', 'transcripcion.json', 'resultado.json']) assert.ok((BRUTO as readonly string[]).includes(n), n);
  assert.ok((SE_CONSERVA as readonly string[]).includes('master.mp4'));
});

test('sala: huella exacta, versión vigente, nota obligatoria, sin bloqueos; las marcas se aplican en el original', () => {
  const h = `sha256:${'ab'.repeat(32)}`, v = { numero: 2, huella: h, bloqueos: [] };
  assert.equal(validaAprobacion(v, { version: 2, huella: h, decision: 'aprobada' }), null);
  assert.ok(validaAprobacion(v, { version: 1, huella: h, decision: 'aprobada' }));
  assert.ok(validaAprobacion(v, { version: 2, huella: `sha256:${'cd'.repeat(32)}`, decision: 'aprobada' }));
  assert.ok(validaAprobacion(v, { version: 2, huella: h, decision: 'cambio-pedido', nota: ' ' }));
  const edl = aplicaCortes(edlDesde([], 10), [{ tipo: 'corte', segundo: 2, hasta: 3 }]);
  assert.deepEqual(edl.conservar, [{ inicio: 0, fin: 2 }, { inicio: 3, fin: 10 }]);
});

test('máster determinista: libx264 de un hilo, bitexact y sin metadatos', () => {
  const m = { version: 1 as const, edl: edlDesde([], 10), desenfoques: [], rotulos: [], marca: { nombre: 'x', colores: { primario: '#000000', texto: '#ffffff' }, tipografia: 'sans' as const }, lufs: -14 };
  const a = argumentosDelMaster(m, { entrada: 'e', ass: null, salida: 's.mp4' }, { input_i: '-20', input_tp: '-3', input_lra: '5', input_thresh: '-30', target_offset: '0' });
  for (const x of ['-threads', '+bitexact', '-map_metadata']) assert.ok(a.includes(x), x);
});

test('adaptadores puros: tokens → palabras y TSV de Tesseract → líneas', () => {
  const ps = palabrasDeTokens({ text: 'Hoy sacamos', tokens: [' Ho', 'y', ' sa', 'camos'], timestamps: [0, 0.16, 0.32, 0.48], durations: [0.16, 0.16, 0.16, 0.16] });
  assert.deepEqual(ps.map((p) => p.texto), ['Hoy', 'sacamos']);
  assert.equal(ps[1]?.fin, 0.64);
  const tsv = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t1\t10\t20\t40\t30\t95\tTel.\n5\t1\t1\t1\t1\t2\t60\t20\t30\t30\t96\t55';
  assert.deepEqual(lineasDeTsv(tsv), [{ texto: 'Tel. 55', x: 10, y: 20, ancho: 80, alto: 30 }]);
});
