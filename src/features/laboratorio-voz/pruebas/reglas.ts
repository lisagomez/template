/**
 * Pruebas de las reglas del laboratorio: sin red, sin modelos, sin navegador.
 * `node --test src/features/laboratorio-voz/pruebas/*.ts`
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { metricasDeSintesis, metricasDeTranscripcion, parseaActa } from '../services/acta.ts';
import { CASOS, SALAS } from '../services/casos.ts';
import { cuentaMuletillas, evaluaCompetencias } from '../services/competencias.ts';
import { calculaEstado, resumenEstados } from '../services/estado-casos.ts';
import { parseaFaq, respondeFaq } from '../services/faq.ts';
import { detectaIntencion, detectaIntenciones, fechaDe } from '../services/intenciones.ts';
import { evaluaConfirmacion, PEDIDO_MUESTRA } from '../services/picking.ts';
import { analizaSentimiento } from '../services/sentimiento.ts';
import { primerNumero } from '../services/texto.ts';
import { escribeWavPcm16, leeWavPcm16, mezclaEstereo } from '../services/wav.ts';
import type { Piezas } from '../types/index.ts';
import { enlaceDeEmparejar } from '../../dictado/services/enlace-emparejar.ts';

const TODO: Piezas = { parakeet: true, silero: true, embedding: true, piper: true, ffmpeg: true, runtime: true, tokenServidor: true, llaveLlm: false, supabase: false };

test('catalogo: 20 casos, 4 salas, ids unicos y cada caso en una sala existente', () => {
  assert.equal(CASOS.length, 20);
  assert.equal(SALAS.length, 4);
  assert.equal(new Set(CASOS.map((c) => c.id)).size, 20);
  for (const c of CASOS) {
    assert.ok(SALAS.some((s) => s.id === c.sala), `sala de ${c.slug}`);
    assert.equal(c.pasos.length, 3, `tres pasos en ${c.slug}`);
    if (c.estadoBase === 'puerta') assert.ok(c.razonPuerta, `razon de puerta en ${c.slug}`);
  }
});

test('estado real: sin el peso de voces, los casos de reunion caen a PUERTA y dicen que falta', () => {
  const sinEmbedding = { ...TODO, embedding: false };
  const callCenter = CASOS.find((c) => c.slug === 'call-center')!;
  assert.equal(calculaEstado(callCenter, TODO).estado, 'listo');
  const caido = calculaEstado(callCenter, sinEmbedding);
  assert.equal(caido.estado, 'puerta');
  assert.match(caido.razon, /WeSpeaker/);
  assert.equal(calculaEstado(CASOS.find((c) => c.slug === 'role-playing')!, TODO).estado, 'puerta');
  const r = resumenEstados(CASOS, TODO);
  assert.equal(r.listo + r.reglas + r.puerta, 20);
  assert.equal(r.puerta, 2);
});

test('acta del CLI: se leen tiempos, hablante y texto; «(sin texto)» queda vacio', () => {
  const acta = '[00:00:01.2 → 00:00:13.9] Hablante 1: Hola, ¿qué tal?\n[00:01:00.0 → 00:01:02.5] Hablante 2: (sin texto)\nbasura';
  const s = parseaActa(acta);
  assert.equal(s.length, 2);
  assert.deepEqual(s[0], { inicioMs: 1200, finMs: 13900, hablante: 'Hablante 1', texto: 'Hola, ¿qué tal?' });
  assert.equal(s[1]?.texto, '');
  assert.equal(s[1]?.inicioMs, 60000);
});

test('metricas del CLI: se leen de la ultima linea con claves', () => {
  const m = metricasDeTranscripcion('  transcribiendo 1/1\naudio=5.6s turnos=1 hablantes=1 motor=sherpa:x vad=207ms diarizacion=70ms transcripcion=351ms fallos=0');
  assert.equal(m.segundosAudio, 5.6);
  assert.equal(m.msMotor, 351);
  assert.equal(m.hablantes, 1);
  const s = metricasDeSintesis('voz=sherpa-tts:es_MX carga=786ms primer-audio=213ms sintesis=324ms total=324ms audio=5.6s rtf=0.058 guardado=/x.wav', 900);
  assert.equal(s.msPrimerAudio, 213);
  assert.equal(s.segundosAudio, 5.6);
  assert.equal(s.ms, 900);
});

test('numeros dichos: cifras y palabras, incluidas compuestas', () => {
  assert.equal(primerNumero('tres unidades'), 3);
  assert.equal(primerNumero('son treinta y cinco'), 35);
  assert.equal(primerNumero('a las 10 y media'), 10);
  assert.equal(primerNumero('ciento dos piezas'), 102);
  assert.equal(primerNumero('nada'), undefined);
});

test('sentimiento por reglas: negacion invierte, refuerzo multiplica, y las palabras se citan', () => {
  const r = analizaSentimiento('La atención fue excelente. El envío no llegó bien y estoy muy molesto.');
  assert.equal(r.frases[0]?.tono, 'positivo');
  assert.equal(r.frases[1]?.tono, 'negativo');
  assert.ok(r.frases[1]?.palabras.some((p) => p.palabra === 'no bien' && p.peso < 0));
  assert.ok(r.frases[1]?.palabras.some((p) => p.palabra === 'molest' || p.palabra.startsWith('molest')));
  assert.equal(r.global.negativas, 1);
});

test('intenciones: evento con dia y hora, recordatorio con tarea, busqueda, correo, y ninguna', () => {
  const ahora = new Date('2026-09-20T12:00:00'); // domingo
  const ev = detectaIntencion('Agenda reunión con Ana el martes a las diez de la mañana', ahora);
  assert.equal(ev.tipo, 'evento');
  assert.equal(ev.detalles.persona, 'Ana');
  const f = new Date(ev.fecha!);
  assert.equal(f.getDay(), 2);
  assert.equal(f.getHours(), 10);
  const rec = detectaIntencion('Recuérdame llamar a Luis mañana a las cuatro de la tarde', ahora);
  assert.equal(rec.tipo, 'recordatorio');
  assert.equal(new Date(rec.fecha!).getHours(), 16);
  assert.equal(new Date(rec.fecha!).getDate(), 21);
  assert.match(rec.detalles.tarea ?? '', /llamar a Luis/);
  assert.equal(detectaIntencion('busca el contrato de Acero del Norte', ahora).tipo, 'busqueda');
  assert.equal(detectaIntencion('manda un correo a Pedro sobre la factura', ahora).tipo, 'correo');
  assert.equal(detectaIntencion('hoy comí tacos', ahora).tipo, 'ninguna');
  assert.equal(fechaDe('en dos horas', ahora)?.fecha.getHours(), 14);
  const varias = detectaIntenciones('Agenda reunión con Ana el martes a las diez de la mañana.\nbusca el contrato de Acero del Norte', ahora);
  assert.deepEqual(varias.map((i) => i.tipo), ['evento', 'busqueda']);
  assert.equal(detectaIntenciones('hoy comí tacos', ahora).length, 1);
  assert.equal(fechaDe('el 3 de octubre', ahora)?.fecha.getMonth(), 9);
});

test('competencias: palabras por minuto, muletillas y pausas largas sobre segmentos', () => {
  const segmentos = [
    { inicioMs: 0, finMs: 30_000, hablante: 'Yo', texto: 'este bueno hoy vamos a ver la fotosíntesis o sea el proceso' },
    { inicioMs: 32_000, finMs: 60_000, hablante: 'Yo', texto: 'las plantas toman luz agua y dióxido de carbono' },
  ];
  const c = evaluaCompetencias(segmentos, 60_000);
  assert.equal(c.palabras, 21);
  assert.equal(c.palabrasPorMinuto, Math.round(21 / (58 / 60)));
  assert.equal(c.pausasLargas.length, 1);
  assert.equal(c.pausasLargas[0]?.ms, 2000);
  assert.ok(cuentaMuletillas('este este o sea pues').find((m) => m.palabra === 'este')?.veces === 2);
});

test('faq: gana la mas parecida y por debajo del umbral no responde', () => {
  const entradas = parseaFaq('¿Cuál es el horario de atención? | De nueve a seis.\n¿Cuánto tarda el envío? | Dos a cuatro días.');
  assert.equal(entradas.length, 2);
  const r = respondeFaq('a qué hora atienden, cuál es su horario', entradas);
  assert.equal(r.mejor?.entrada.respuesta, 'De nueve a seis.');
  assert.equal(respondeFaq('quiero comprar un elefante', entradas).mejor, undefined);
});

test('picking: confirma con la cantidad correcta, distingue otra cantidad y «repite»', () => {
  const linea = PEDIDO_MUESTRA[0]!;
  assert.deepEqual(evaluaConfirmacion('tres', linea), { tipo: 'ok', oido: 3 });
  assert.deepEqual(evaluaConfirmacion('son cuatro', linea), { tipo: 'cantidad-distinta', oido: 4 });
  assert.deepEqual(evaluaConfirmacion('repite por favor', linea), { tipo: 'repetir' });
  assert.deepEqual(evaluaConfirmacion('eh', linea), { tipo: 'no-entendi' });
});

test('wav: escribir, leer y mezclar en estereo deja cada voz en su canal', () => {
  const a = new Int16Array([1000, 1000]);
  const b = new Int16Array([-500, -500, -500]);
  const estereo = mezclaEstereo([{ canal: 'izquierdo', muestras: a }, { canal: 'derecho', muestras: b }], 1000, 1);
  // 2 muestras + 1 de hueco, luego 3 + 1: 7 marcos × 2 canales
  assert.equal(estereo.length, 14);
  assert.equal(estereo[0], 1000);
  assert.equal(estereo[1], 0);
  assert.equal(estereo[7], -500); // marco 3 (indice 6 → 3*2=6 es izquierdo, 7 derecho)
  const bytes = escribeWavPcm16(estereo, 1000, 2);
  const leido = leeWavPcm16(bytes);
  assert.equal(leido.canales, 2);
  assert.equal(leido.frecuenciaHz, 1000);
  assert.deepEqual([...leido.muestras], [...estereo]);
});

test('enlace de emparejar: el token va en el fragmento, codificado, y la ruta se normaliza', () => {
  assert.equal(enlaceDeEmparejar('https://kyara.example/', 'laboratorio-voz', 'a b&c'), 'https://kyara.example/laboratorio-voz#t=a%20b%26c');
  assert.equal(enlaceDeEmparejar('http://localhost:3000', '/dictar', 'x'), 'http://localhost:3000/dictar#t=x');
  assert.ok(!enlaceDeEmparejar('http://localhost:3000', '/dictar', 'x').includes('?t='));
});
