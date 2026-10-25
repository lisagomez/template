/**
 * El acuse inmediato (importado de Arbrain v0.2.10, `capa-rapida.ts`): suena primero cuando el turno va al cerebro,
 * nunca con una orden ni con un saludo, se retiene con la especulación, lo corta la interrupción, no entra al
 * historial ni a «repite», y con `msGracia` sobra si el cerebro ya habló. Más el juez que cierra una pregunta
 * completa y la marca de «cerebro simulado» en la telemetría.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaAcuse, esTrivial, FRASES_ACUSE, juzgaCierreConPregunta, latencia, latenciaRespuesta, juezConPregunta, REPERTORIO_ACUSE, type PiezaCerebro } from '../dist/index.js';
import { audioDe, diferido, fraseFalsa, habla, monta, vacia } from './banco.ts';

const fijo = () => 0;

test('una conversación: el acuse suena primero (frase 0) y después la respuesta; la telemetría separa los dos', async () => {
  const m = monta({ acuse: creaAcuse({ azar: fijo }) });
  const { finReal } = await habla(m);
  await m.reloj.avanza(120);
  m.transcripciones[0]?.d.resuelve(['¿Qué es un balance general?']);
  await vacia();
  const textos = m.rep.recibidas.map((p) => p.texto);
  assert.equal(textos[0], 'Buena pregunta, déjame pensarlo.', 'lo primero que suena es el acuse');
  assert.ok(textos.slice(1).join(' ').includes('Un balance'), 'y después la respuesta');
  const r = m.bucle.telemetria.turno(1);
  assert.equal(r?.acuse, 'Buena pregunta, déjame pensarlo.');
  assert.ok(r?.marcas.acuse !== undefined, 'marca de acuse');
  assert.equal(latencia(r!), (r?.marcas.suena ?? 0) - finReal);
  assert.ok(latenciaRespuesta(r!) !== undefined, 'la respuesta también sonó');
  const frase0 = m.eventos.find((e) => e.tipo === 'frase' && e.indice === 0);
  assert.ok(frase0?.tipo === 'frase' && frase0.acuse === true, 'el evento marca el acuse');
  m.rep.terminaTodo();
  await vacia();
  const respuesta = m.bucle.historial.at(-1)?.texto ?? '';
  assert.ok(!respuesta.includes('pensarlo'), `el acuse no entra al historial del cerebro: «${respuesta}»`);
});

test('una orden local y un saludo no llevan acuse', async () => {
  const m = monta({ acuse: creaAcuse({ azar: fijo }) });
  await habla(m);
  m.transcripciones[0]?.d.resuelve(['¿Qué hora es?']);
  await vacia();
  assert.equal(m.rep.recibidas[0]?.texto, 'Son las cinco y veinte de la tarde.');
  assert.equal(m.bucle.telemetria.turno(1)?.acuse, undefined);
  m.rep.terminaTodo();
  await vacia();
  await m.reloj.avanza(400);
  await habla(m);
  m.transcripciones[1]?.d.resuelve(['¡Muchas gracias!']);
  await vacia();
  assert.equal(m.pensadas.length, 1, 'el saludo sí va al cerebro');
  assert.ok(!m.rep.recibidas.some((p) => FRASES_ACUSE.includes(p.texto)), 'pero sin acuse');
});

test('especulación: el acuse se retiene con el turno; si la voz sigue, nunca suena', async () => {
  const m = monta({ acuse: creaAcuse({ azar: fijo }) });
  m.bucle.vozInicia(m.reloj.ahora());
  await m.reloj.avanza(900);
  const finReal = m.reloj.ahora();
  await m.reloj.avanza(220);
  m.bucle.pausa(audioDe(900), finReal);
  m.transcripciones[0]?.d.resuelve(['Explícame cómo armar un presupuesto']);
  await vacia();
  assert.equal(m.rep.recibidas.length, 0, 'retenido: la persona puede seguir hablando');
  m.bucle.vozReanuda();
  await vacia();
  await m.reloj.avanza(2000);
  assert.equal(m.rep.recibidas.length, 0, 'la especulación murió con su acuse');
});

test('con el juez de pregunta, una pregunta completa cierra por sentido y el acuse suena sin esperar al VAD', async () => {
  const m = monta({ acuse: creaAcuse({ azar: fijo }), juezCierre: juezConPregunta });
  m.bucle.vozInicia(m.reloj.ahora());
  await m.reloj.avanza(1200);
  const finReal = m.reloj.ahora();
  await m.reloj.avanza(220);
  m.bucle.pausa(audioDe(1200), finReal);
  m.transcripciones[0]?.d.resuelve(['¿Qué es el capital de trabajo?']);
  await vacia();
  await m.reloj.avanza(100);
  const r = m.bucle.telemetria.turno(1);
  assert.equal(r?.cierreAnticipado, true, 'cerró por sentido');
  assert.equal(m.rep.recibidas[0]?.texto, 'Buena pregunta, déjame pensarlo.');
  assert.ok((r?.marcas.suena ?? Infinity) - finReal <= 320, `el acuse sonó a los ${(r?.marcas.suena ?? 0) - finReal} ms del fin real`);
  m.bucle.vozTermina(audioDe(1200), finReal, finReal + 600);
  await vacia();
  assert.equal(m.transcripciones.length, 1, 'el cierre del VAD del mismo tramo no abre otro turno');
});

test('interrumpir durante el acuse lo corta, aborta el cerebro y no deja el acuse en el historial', async () => {
  const m = monta({ acuse: creaAcuse({ azar: fijo }) });
  m.pausaCerebro = diferido<void>();
  await habla(m);
  m.transcripciones[0]?.d.resuelve(['¿Qué es la depreciación?']);
  await vacia();
  assert.equal(m.bucle.estado, 'hablando', 'el acuse ya suena aunque el cerebro no haya dicho nada');
  assert.equal(m.rep.recibidas.length, 1);
  const antes = m.rep.detenciones;
  m.bucle.interrumpe(m.reloj.ahora());
  await vacia();
  assert.equal(m.rep.detenciones, antes + 1, 'el acuse se calla como cualquier frase');
  assert.equal(m.pensadas[0]?.senal.aborted, true, 'el cerebro en vuelo se aborta');
  m.pausaCerebro.resuelve();
  await vacia();
  assert.equal(m.rep.recibidas.length, 1, 'nada del turno interrumpido suena después');
  assert.equal(m.bucle.historial.at(-1)?.texto, '[interrumpido]', 'el cerebro no se entera del acuse');
  assert.equal(m.bucle.telemetria.turno(1)?.estado, 'interrumpido');
});

test('«para» dicho encima del acuse corta y no vuelve a hablar', async () => {
  const m = monta({ acuse: creaAcuse({ azar: fijo }) });
  m.pausaCerebro = diferido<void>();
  await habla(m);
  m.transcripciones[0]?.d.resuelve(['¿Cómo le hago para cobrar a tiempo?']);
  await vacia();
  m.bucle.vozInicia(m.reloj.ahora());
  m.bucle.interrumpe(m.reloj.ahora() + 120);
  await m.reloj.avanza(300);
  const fin = m.reloj.ahora();
  await m.reloj.avanza(600);
  m.bucle.vozTermina(audioDe(300), fin, m.reloj.ahora());
  await vacia();
  m.transcripciones.at(-1)?.d.resuelve(['Para.']);
  await vacia();
  m.pausaCerebro.resuelve();
  await vacia();
  assert.equal(m.rep.recibidas.length, 1, 'solo sonó el acuse, cortado');
  const d = m.eventos.filter((e) => e.tipo === 'decision').at(-1);
  assert.ok(d?.tipo === 'decision' && d.decision.tipo === 'orden' && d.decision.orden === 'para');
});

test('msGracia: si el cerebro dice su primera frase antes del plazo, el acuse sobra; si tarda, suena', async () => {
  const rapido = monta({ acuse: creaAcuse({ azar: fijo, msGracia: 300 }) });
  await habla(rapido);
  rapido.transcripciones[0]?.d.resuelve(['¿Qué es un CFDI?']);
  await vacia();
  await rapido.reloj.avanza(400);
  assert.ok(!rapido.rep.recibidas.some((p) => FRASES_ACUSE.includes(p.texto)), 'cerebro rápido: sin acuse');
  assert.equal(rapido.bucle.telemetria.turno(1)?.acuse, undefined);

  const lento = monta({ acuse: creaAcuse({ azar: fijo, msGracia: 300 }) });
  lento.pausaCerebro = diferido<void>();
  await habla(lento);
  lento.transcripciones[0]?.d.resuelve(['¿Qué es un CFDI?']);
  await vacia();
  assert.equal(lento.rep.recibidas.length, 0, 'dentro del plazo todavía no suena');
  await lento.reloj.avanza(300);
  assert.equal(lento.rep.recibidas[0]?.texto, 'Buena pregunta, déjame pensarlo.', 'cerebro lento: suena el acuse');
  lento.pausaCerebro.resuelve();
  await vacia();
  assert.ok(lento.rep.recibidas.length > 1, 'y después la respuesta');
});

test('«repite» repite la respuesta, no el acuse', async () => {
  const m = monta({ acuse: creaAcuse({ azar: fijo }) });
  m.respuestaCerebro = ['El punto de equilibrio es donde no ganas ni pierdes.'];
  await habla(m);
  m.transcripciones[0]?.d.resuelve(['¿Qué significa punto de equilibrio?']);
  await vacia();
  m.rep.terminaTodo();
  await vacia();
  await m.reloj.avanza(400);
  await habla(m);
  m.transcripciones[1]?.d.resuelve(['Repite']);
  await vacia();
  const turno2 = m.rep.recibidas.filter((p) => p.turno === 2).map((p) => p.texto);
  assert.deepEqual(turno2, ['El punto de equilibrio es donde no ganas ni pierdes.']);
});

test('si el cerebro falla después del acuse, igual se dice que no se pudo', async () => {
  const m = monta({
    acuse: creaAcuse({ azar: fijo }),
    cerebro: {
      async *piensa(): AsyncGenerator<PiezaCerebro> {
        yield* [];
        throw new Error('sin presupuesto');
      },
    },
  });
  await habla(m);
  m.transcripciones[0]?.d.resuelve(['¿Qué es la depreciación?']);
  await vacia();
  const textos = m.rep.recibidas.map((p) => p.texto);
  assert.equal(textos[0], 'Buena pregunta, déjame pensarlo.');
  assert.match(textos.at(-1) ?? '', /no pude contestar/i);
});

test('el cerebro simulado queda marcado en la telemetría', async () => {
  const m = monta({
    cerebro: {
      async *piensa(): AsyncGenerator<PiezaCerebro> {
        yield { tipo: 'meta', simulado: true };
        yield { tipo: 'token', texto: 'Respuesta fija.' };
        yield { tipo: 'uso', costoUsd: 0 };
      },
    },
  });
  await habla(m);
  m.transcripciones[0]?.d.resuelve(['¿Qué es un balance general?']);
  await vacia();
  assert.equal(m.bucle.telemetria.turno(1)?.cerebro, 'simulado');
  assert.equal(m.rep.recibidas[0]?.texto, 'Respuesta fija.', 'la pieza meta no se dice');
});

test('el repertorio: sin cifras ni nombres, no repite la última frase seguida, y lo trivial no lleva', () => {
  for (const f of FRASES_ACUSE) assert.ok(!/\d/.test(f) && f.length <= 40, `«${f}» es corta y sin datos`);
  assert.equal(new Set(FRASES_ACUSE).size, FRASES_ACUSE.length);
  const a = creaAcuse({ azar: fijo });
  const d = { tipo: 'llm' as const, motivo: 'conversacion' as const, confianza: 0, texto: '¿Qué es un balance?' };
  const vistas = [a.elige(d)?.texto, a.elige(d)?.texto, a.elige(d)?.texto];
  for (let i = 1; i < vistas.length; i++) assert.notEqual(vistas[i], vistas[i - 1]);
  assert.ok(REPERTORIO_ACUSE.pregunta.includes(vistas[0] ?? ''));
  assert.equal(a.elige({ ...d, motivo: 'dudoso', texto: 'dime la hora exacta' })?.clase, 'duda');
  assert.equal(a.elige({ ...d, texto: 'Dame una idea para vender más' })?.clase, 'peticion');
  for (const t of ['Gracias.', 'Hola, ¿qué tal?', 'Muy bien, gracias', 'ok']) assert.ok(esTrivial(t), t);
  for (const t of ['¿Qué es un balance general?', 'Hola, explícame el flujo de caja']) assert.ok(!esTrivial(t), t);
  assert.equal(a.frases.length, FRASES_ACUSE.length, 'todas se pueden calentar');
});

test('juez de pregunta: cierra lo que acaba en «?», espera lo abierto, y deja lo demás al VAD', () => {
  const j = (t: string) => juzgaCierreConPregunta(t, { esOrdenSegura: false });
  assert.equal(j('¿Qué es un balance general?'), 'ya');
  assert.equal(j('¿Para qué sirve el flujo de caja?'), 'ya');
  assert.equal(j('Quiero saber el saldo y'), 'espera');
  assert.equal(j('¿Qué?'), 'normal', 'muy corta: pide repetir, no se cierra');
  assert.equal(j('Explícame el flujo de caja.'), 'normal');
  assert.equal(juzgaCierreConPregunta('¿Qué hora es?', { esOrdenSegura: true }), 'ya');
});

test('fraseFalsa del banco sigue sirviendo con el acuse (sanidad del montaje)', () => {
  assert.ok(fraseFalsa('Va, déjame ver.').muestras.length > 0);
});
