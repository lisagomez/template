/**
 * Pruebas del nucleo. Contra `dist/`, no contra `src/`: lo que se prueba es lo que se instala.
 *
 *   npm run prueba   (en tools/dictado; requiere `npm run build`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  almacenEnMemoria,
  aplicaComandos,
  capitalizaInicio,
  cer,
  creaDiccionario,
  creaHistorial,
  creaPosproceso,
  creaSnippets,
  distanciaEdicion,
  extraeAcciones,
  formateaActa,
  formateaTiempo,
  normalizaParaComparar,
  pareceOtroIdioma,
  percentil,
  quitaAcentos,
  regexDePalabra,
  tokeniza,
  transcribeLote,
  wer,
  werAcumulado,
  type Transcriptor,
  type Turno,
} from '../dist/index.js';

// --- texto ---------------------------------------------------------------------------------

test('normalizaParaComparar: minusculas, sin puntuacion, un espacio, conserva acentos', () => {
  assert.equal(normalizaParaComparar('  ¡Hola,  Camión!  ¿Qué tal? '), 'hola camión qué tal');
  assert.deepEqual(tokeniza('Año 2026: dos-puntos'), ['año', '2026', 'dos', 'puntos']);
  assert.equal(quitaAcentos('camión añejo Ñandú'), 'camion anejo Nandu');
});

test('regexDePalabra respeta fronteras Unicode: «año» no casa dentro de «años»', () => {
  const r = regexDePalabra('año');
  assert.equal(r.test('hace un año'), true);
  assert.equal(regexDePalabra('año').test('hace dos años'), false);
  assert.equal(regexDePalabra('casa').test('un casamiento'), false);
  assert.equal(regexDePalabra('mi correo').test('Mándalo a MI  CORREO por favor'), true);
});

test('capitalizaInicio respeta los signos de apertura', () => {
  assert.equal(capitalizaInicio('¿qué tal?'), '¿Qué tal?');
  assert.equal(capitalizaInicio('hola'), 'Hola');
  assert.equal(capitalizaInicio('Hola'), 'Hola');
  assert.equal(capitalizaInicio('123 ok'), '123 ok');
});

test('pareceOtroIdioma: ingles colado por Parakeet se detecta; espanol y empates no', () => {
  assert.equal(pareceOtroIdioma('Probably.', 'es'), true);
  assert.equal(pareceOtroIdioma('No you can only gorda.', 'es'), true);
  assert.equal(pareceOtroIdioma('Yeah, just go to', 'es'), true);
  assert.equal(pareceOtroIdioma('Aún no me escuchas con claridad.', 'es'), false);
  assert.equal(pareceOtroIdioma('Puedes revisarlo.', 'es'), false);
  assert.equal(pareceOtroIdioma('Kubernetes', 'es'), false); // sin funcionales: se asume el pedido
  assert.equal(pareceOtroIdioma('the deploy de la app', 'es'), false); // empate 1-1: no se repite por nada
  assert.equal(pareceOtroIdioma('hola', 'xx'), false); // idioma sin lista: nunca repite
});

// --- WER -----------------------------------------------------------------------------------

test('distanciaEdicion y WER: identico 0, un cambio por palabra, acumulado pesa por palabras', () => {
  assert.equal(distanciaEdicion(['a', 'b', 'c'], ['a', 'b', 'c']), 0);
  assert.equal(distanciaEdicion(['a', 'b', 'c'], ['a', 'x', 'c', 'd']), 2);
  assert.equal(wer('hola qué tal', 'Hola, ¿qué tal?').wer, 0);
  const r = wer('el perro come pan', 'el gato come');
  assert.equal(r.errores, 2);
  assert.equal(r.palabras, 4);
  assert.equal(r.wer, 0.5);
  assert.equal(wer('', 'algo').wer, Infinity);
  assert.equal(wer('', '').wer, 0);
  // Acumulado: 1 error en 2 palabras + 0 en 8 = 1/10, no el promedio 0,25.
  const acumulado = werAcumulado([
    { referencia: 'uno dos', hipotesis: 'uno tres' },
    { referencia: 'a b c d e f g h', hipotesis: 'a b c d e f g h' },
  ]);
  assert.equal(acumulado.wer, 0.1);
  assert.equal(cer('casa', 'caza').wer, 0.25);
});

test('percentil: vecino superior, sin interpolar', () => {
  assert.equal(percentil([5, 1, 3, 2, 4], 50), 3);
  assert.equal(percentil([5, 1, 3, 2, 4], 95), 5);
  assert.equal(percentil([7], 50), 7);
  assert.ok(Number.isNaN(percentil([], 50)));
});

// --- diccionario ---------------------------------------------------------------------------

test('diccionario: dedupe sin acentos ni mayusculas, pista recortada por coma, comentarios fuera', () => {
  const d = creaDiccionario({ terminos: ['Levy', '# comentario', 'SaaS Factory', 'levy', 'Levý'] });
  assert.deepEqual(d.terminos(), ['Levy', 'SaaS Factory']);
  assert.deepEqual(d.agrega(['Hermes', 'hermes']), ['Hermes']);
  assert.equal(d.comoPista(), 'Levy, SaaS Factory, Hermes');
  assert.equal(d.comoPista(12), 'Levy');
  assert.equal(d.quita('LEVY'), true);
  assert.equal(d.quita('nadie'), false);
});

test('diccionario.corrige: apagado por defecto; encendido, solo a distancia tolerada y sin tocar cortas', () => {
  const apagado = creaDiccionario({ terminos: ['Kubernetes'] });
  assert.equal(apagado.corrige('kubernetas mola'), 'kubernetas mola');
  const d = creaDiccionario({ terminos: ['Kubernetes', 'Levy', 'SaaS Factory'], corrigePorSimilitud: true });
  assert.equal(d.corrige('el kubernetas mola'), 'el Kubernetes mola');
  assert.equal(d.corrige('lo dijo Levi ayer'), 'lo dijo Levi ayer'); // 4 letras: tolerancia 0
  assert.equal(d.corrige('leva de tropas'), 'leva de tropas'); // a UNA letra de «Levy»: por eso la tolerancia a 4 es 0
  assert.equal(d.corrige('nada que ver'), 'nada que ver');
  assert.equal(d.corrige('sas factory'), 'sas factory'); // los terminos de varias palabras no corrigen
});

test('diccionario.candidatos: palabras nuevas con mayuscula o guion, sin paradas ni cortas', () => {
  const d = creaDiccionario();
  const c = d.candidatos('fui a ver a daniel en la fabrica', 'Fui a ver a Daniel Carreón en la SaaS-Factory de Hermes');
  // «daniel» ya estaba (sin distinguir mayusculas): corregirle la mayuscula no lo hace candidato.
  assert.deepEqual(c, ['Carreón', 'SaaS-Factory', 'Hermes']);
  assert.deepEqual(d.candidatos('hola', 'hola mundo bonito'), []);
});

// --- snippets ------------------------------------------------------------------------------

test('snippets: el mas largo gana, sin distinguir mayusculas, por palabra completa, cuenta usos', () => {
  const s = creaSnippets([
    { disparador: 'mi firma', expansion: 'Saludos,\nL' },
    { disparador: 'firma larga', expansion: 'Saludos cordiales,\nL. Gómez' },
    { disparador: 'firma', expansion: 'F' },
  ]);
  const r = s.aplica('Va con Firma Larga y tambien mi firma, firmamos.');
  assert.equal(r.texto, 'Va con Saludos cordiales,\nL. Gómez y tambien Saludos,\nL, firmamos.');
  assert.deepEqual(r.usados, ['firma larga', 'mi firma']);
  assert.equal(s.lista()[0]?.disparador, 'firma larga');
  assert.equal(s.aplica('nada').usados.length, 0);
  assert.equal(s.quita('firma'), true);
  assert.equal(s.quita('firma'), false);
  assert.throws(() => s.agrega('  ', 'x'));
});

// --- comandos ------------------------------------------------------------------------------

test('comandos de texto: signos con palabra delante, saltos sin ella, limpieza de espacios', () => {
  const r = aplicaComandos('hola coma como estas signo de interrogación punto y aparte nueva línea segunda parte punto final');
  assert.equal(r.texto, 'hola, como estas?\n\nsegunda parte.');
  assert.deepEqual(r.acciones, []);
  assert.equal(aplicaComandos('nuevo párrafo empieza aquí').texto, 'empieza aquí');
  assert.equal(aplicaComandos('lista dos puntos pan punto y coma leche').texto, 'lista: pan; leche');
  assert.equal(aplicaComandos('new line then new paragraph end').texto, 'then\n\nend');
});

test('acciones verbales: «dale enter» al final se recorta y vuelve como accion; en medio no', () => {
  assert.deepEqual(extraeAcciones('manda el mensaje y dale enter.'), { texto: 'manda el mensaje', acciones: ['enter'] });
  assert.deepEqual(extraeAcciones('press enter'), { texto: '', acciones: ['enter'] });
  assert.deepEqual(extraeAcciones('dale enter a la cosa'), { texto: 'dale enter a la cosa', acciones: [] });
  const r = aplicaComandos('hola coma mundo presiona enter');
  assert.equal(r.texto, 'hola, mundo');
  assert.deepEqual(r.acciones, ['enter']);
});

// --- posproceso ----------------------------------------------------------------------------

test('posproceso: snippets → comandos → diccionario → limpiador, y dice que hizo cada paso', async () => {
  const snippets = creaSnippets([{ disparador: 'mi correo', expansion: 'l@ejemplo.mx' }]);
  const diccionario = creaDiccionario({ terminos: ['Hermes'], corrigePorSimilitud: true });
  const p = creaPosproceso({
    snippets,
    diccionario,
    limpiador: { async limpia(t) { return t.replace('hola', 'Hola'); } },
    capitaliza: true,
  });
  const r = await p.procesa(' hola coma escribe a mi correo sobre hermas y dale enter ');
  assert.equal(r.texto, 'Hola, escribe a l@ejemplo.mx sobre Hermes');
  assert.deepEqual(r.acciones, ['enter']);
  assert.deepEqual(r.pasos, { snippetsUsados: ['mi correo'], comandosAplicados: true, diccionarioCambio: true, limpiezaCambio: true });
});

test('posproceso: un limpiador que devuelve vacio se ignora; sin opciones solo recorta', async () => {
  const borra = creaPosproceso({ limpiador: { async limpia() { return '   '; } } });
  assert.equal((await borra.procesa('texto intacto')).texto, 'texto intacto');
  const simple = creaPosproceso({ comandos: false });
  const r = await simple.procesa('  hola coma  ');
  assert.equal(r.texto, 'hola coma');
  assert.equal(r.pasos.comandosAplicados, false);
});

// --- historial -----------------------------------------------------------------------------

test('historial en memoria: recientes en orden inverso, busqueda, correccion con candidatos', async () => {
  const diccionario = creaDiccionario();
  const h = creaHistorial(almacenEnMemoria(), diccionario);
  const a = await h.agrega({ texto: 'primer dictado', motor: 'falso', duracionMs: 1000, fecha: '2026-09-15T10:00:00.000Z' });
  await h.agrega({ texto: 'segundo dictado', motor: 'falso', duracionMs: 900, fecha: '2026-09-15T10:01:00.000Z' });
  assert.equal(await h.cuenta(), 2);
  assert.deepEqual((await h.recientes(5)).map((e) => e.texto), ['segundo dictado', 'primer dictado']);
  assert.equal((await h.busca('PRIMER', 5)).length, 1);
  const c = await h.corrige(a.id, 'primer dictado con Hermes');
  assert.equal(c.entrada?.texto, 'primer dictado con Hermes');
  assert.deepEqual(c.candidatos, ['Hermes']);
  assert.deepEqual(await h.corrige('999', 'x'), { candidatos: [] });
});

// --- lote ----------------------------------------------------------------------------------

test('transcribeLote: en serie, con tiempos por turno, sigue si un turno falla', async () => {
  let llamadas = 0;
  const transcriptor: Transcriptor = {
    async transcribe(audio) {
      llamadas += 1;
      if (audio.length === 3) throw new Error('motor caido');
      return { texto: ` texto ${audio.length} ` };
    },
  };
  const turnos: Turno[] = [
    { inicioMs: 0, finMs: 1200, hablante: 'Hablante 1', audio: new Float32Array(2) },
    { inicioMs: 1500, finMs: 2000, hablante: 'Hablante 2', audio: new Float32Array(3) },
    { inicioMs: 2500, finMs: 2600 },
  ];
  let t = 0;
  const r = await transcribeLote(turnos, transcriptor, { frecuenciaHz: 16_000, ahora: () => (t += 10) });
  assert.equal(llamadas, 2);
  assert.equal(r.fallos, 1);
  assert.deepEqual(r.turnos.map((x) => x.texto), ['texto 2', undefined, undefined]);
  assert.deepEqual(r.ms.porTurno, [10, 10, 0]);
  assert.equal(formateaTiempo(3_723_400), '01:02:03.4');
  assert.equal(
    formateaActa(r.turnos),
    '[00:00:00.0 → 00:00:01.2] Hablante 1: texto 2\n[00:00:01.5 → 00:00:02.0] Hablante 2: (sin texto)\n[00:00:02.5 → 00:00:02.6] ?: (sin texto)',
  );
  await assert.rejects(transcribeLote(turnos, transcriptor, { frecuenciaHz: 16_000, continuaSiFalla: false }), /motor caido/);
});
