/**
 * El bucle de punta a punta con puertos falsos y reloj controlado: turnos, cancelación,
 * interrupción, especulación, rutas (orden / cerebro / escritura) y telemetría.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latencia, creaActivacion } from '../dist/index.js';
import { audioDe, fraseFalsa, habla, monta, vacia } from './banco.ts';

test('turno viejo: su transcripción, su cerebro y su voz que llegan tarde NUNCA suenan en el turno nuevo', async () => {
  const m = monta();
  m.vozInmediata = false;
  await habla(m);
  const t1 = m.transcripciones[0];
  assert.ok(t1);
  t1.d.resuelve(['Explícame qué es un balance general']);
  await vacia();
  assert.equal(m.pensadas.length, 1, 'el primer turno llegó al cerebro');
  assert.ok(m.sintesis.length > 0, 'y pidió voz');
  const vozVieja = m.sintesis.slice();
  // Llega otro turno de la persona antes de que suene nada del primero.
  await habla(m);
  assert.equal(m.pensadas[0]?.senal.aborted, true, 'el cerebro del turno viejo quedó abortado');
  for (const s of vozVieja) assert.equal(s.senal.aborted, true, 'la voz del turno viejo quedó abortada');
  // La voz vieja llega tarde: no debe sonar.
  for (const s of vozVieja) s.d.resuelve(fraseFalsa(s.frase));
  await vacia();
  assert.equal(m.rep.recibidas.length, 0, 'nada del turno viejo llegó al reproductor');
  // El turno nuevo sí suena, y solo él.
  m.transcripciones[1]?.d.resuelve(['¿Qué hora es?']);
  await vacia();
  for (const s of m.sintesis.slice(vozVieja.length)) s.d.resuelve(fraseFalsa(s.frase));
  await vacia();
  const turnos = new Set(m.rep.recibidas.map((p) => p.turno));
  assert.deepEqual([...turnos], [2]);
});

test('una transcripción vieja que llega después del turno nuevo se tira', async () => {
  const m = monta();
  await habla(m);
  await habla(m);
  m.transcripciones[0]?.d.resuelve(['¿Qué hora es?']);
  await vacia();
  assert.equal(m.lecturas.length, 0, 'el turno viejo no ejecutó su orden');
  assert.equal(m.transcripciones[0]?.senal.aborted, true);
});

test('interrumpir cancela el cerebro y la voz en vuelo, para el audio y guarda solo lo oído', async () => {
  const m = monta();
  m.respuestaCerebro = ['Un balance general resume la empresa. ', 'Tiene activos. ', 'Y también pasivos y capital.'];
  await habla(m);
  m.transcripciones[0]?.d.resuelve(['¿Qué es un balance general?']);
  await vacia();
  assert.equal(m.bucle.estado, 'hablando');
  m.vozInmediata = false;
  const primera = m.rep.recibidas[0];
  assert.ok(primera);
  m.rep.progreso(primera, 0.5);
  const detencionesAntes = m.rep.detenciones;
  m.bucle.interrumpe(m.reloj.ahora());
  await vacia();
  assert.equal(m.pensadas[0]?.senal.aborted, true, 'cerebro abortado');
  for (const s of m.sintesis) assert.equal(s.senal.aborted, true, 'voz en vuelo abortada');
  assert.equal(m.rep.detenciones, detencionesAntes + 1, 'el audio se para');
  assert.equal(m.bucle.estado, 'escuchando');
  const recibidasTras = m.rep.recibidas.length;
  for (const s of m.sintesis) s.d.resuelve(fraseFalsa(s.frase));
  await vacia();
  assert.equal(m.rep.recibidas.length, recibidasTras, 'nada suena después de interrumpir');
  const ultimo = m.bucle.historial.at(-1);
  assert.match(ultimo?.texto ?? '', /\[interrumpido\]$/);
  assert.ok(!(ultimo?.texto ?? '').includes('capital'), 'el historial solo guarda lo que se alcanzó a oír');
  const registro = m.bucle.telemetria.turno(1);
  assert.equal(registro?.estado, 'interrumpido');
});

test('desactivar (ESC) durante la transcripción la aborta y no deja nada sonando', async () => {
  const m = monta();
  await habla(m);
  const t = m.transcripciones[0];
  m.bucle.desactiva();
  assert.equal(t?.senal.aborted, true, 'la transcripción en vuelo recibe la señal');
  t?.d.resuelve(['¿Qué hora es?']);
  await vacia();
  assert.equal(m.lecturas.length, 0);
  assert.equal(m.rep.recibidas.length, 0);
  assert.equal(m.bucle.estado, 'reposo');
});

test('las frases se piden en paralelo y suenan en orden aunque la segunda llegue antes', async () => {
  const m = monta();
  m.vozInmediata = false;
  m.respuestaCerebro = ['Primera frase completa. ', 'Segunda frase completa. ', 'Tercera.'];
  await habla(m);
  m.transcripciones[0]?.d.resuelve(['Cuéntame algo']);
  await vacia();
  assert.ok(m.sintesis.length >= 2, 'al menos dos a la vez');
  m.sintesis[1]?.d.resuelve(fraseFalsa('2'));
  await vacia();
  assert.equal(m.rep.recibidas.length, 0, 'la segunda espera a la primera');
  m.sintesis[0]?.d.resuelve(fraseFalsa('1'));
  await vacia();
  m.sintesis[2]?.d.resuelve(fraseFalsa('3'));
  await vacia();
  assert.deepEqual(m.rep.recibidas.map((p) => p.indice), [0, 1, 2]);
});

test('una frase cuya voz falla dos veces se avisa y la cola sigue (sin pérdida silenciosa)', async () => {
  const m = monta();
  m.vozInmediata = false;
  m.respuestaCerebro = ['Uno dos tres. ', 'Cuatro cinco seis.'];
  await habla(m);
  m.transcripciones[0]?.d.resuelve(['Cuenta']);
  await vacia();
  m.sintesis[0]?.d.rechaza(new Error('demonio caído'));
  await vacia();
  m.sintesis.find((s, i) => i > 0 && s.frase.startsWith('Uno'))?.d.rechaza(new Error('demonio caído'));
  m.sintesis.find((s) => s.frase.startsWith('Cuatro'))?.d.resuelve(fraseFalsa('x'));
  await vacia();
  const avisos = m.eventos.filter((e) => e.tipo === 'aviso');
  assert.ok(avisos.some((a) => a.tipo === 'aviso' && a.mensaje.includes('Uno dos tres')), 'el fallo se avisa con la frase');
  assert.deepEqual(m.rep.recibidas.map((p) => p.texto), ['Cuatro cinco seis.']);
});

test('una orden de lectura se resuelve sin cerebro; la conversación y lo dudoso van al cerebro', async () => {
  const m = monta();
  await habla(m);
  m.transcripciones[0]?.d.resuelve(['¿Qué hora es?']);
  await vacia();
  assert.deepEqual(m.lecturas, ['hora']);
  assert.equal(m.pensadas.length, 0, 'la orden no tocó el cerebro');
  m.rep.terminaTodo();
  await vacia();
  await habla(m);
  m.transcripciones[1]?.d.resuelve(['¿Qué diferencia hay entre utilidad y flujo de caja?']);
  await vacia();
  assert.equal(m.pensadas.length, 1, 'la conversación sí');
  m.rep.terminaTodo();
  await vacia();
  await habla(m);
  m.transcripciones[2]?.d.resuelve(['dime la hora exacta']);
  await vacia();
  const decision = m.eventos.filter((e) => e.tipo === 'decision').at(-1);
  assert.ok(decision?.tipo === 'decision' && decision.decision.tipo === 'llm' && decision.decision.motivo === 'dudoso');
  assert.equal(m.pensadas.length, 2, 'lo dudoso va al cerebro');
});

test('una petición de escritura queda en dry-run: ni cerebro ni lector, pide «confirmo» y aun así no escribe', async () => {
  const m = monta();
  await habla(m);
  m.transcripciones[0]?.d.resuelve(['Agenda una reunión con Juan mañana a las cinco']);
  await vacia();
  assert.equal(m.pensadas.length, 0);
  assert.equal(m.lecturas.length, 0);
  const dicho = m.rep.recibidas.map((p) => p.texto).join(' ');
  assert.match(dicho, /borrador/);
  assert.match(dicho, /confirmo/);
  m.rep.terminaTodo();
  await m.reloj.avanza(400); // tiempo de reacción humano: quien contesta no empieza en el mismo ms
  await habla(m);
  m.transcripciones[1]?.d.resuelve(['Confirmo']);
  await vacia();
  const turnoFinal = m.rep.recibidas.at(-1)?.turno;
  const respuesta = m.rep.recibidas.filter((p) => p.turno === turnoFinal).map((p) => p.texto).join(' ');
  assert.match(respuesta, /solo lee/);
  assert.match(respuesta, /no tengo permiso de escritura/);
  assert.equal(m.pensadas.length + m.lecturas.length, 0, 'confirmar tampoco toca nada');
});

test('especulación: en la pausa se transcribe y se prepara; si el VAD cierra igual, no se transcribe otra vez', async () => {
  const m = monta();
  m.bucle.vozInicia(m.reloj.ahora());
  await m.reloj.avanza(700);
  const finReal = m.reloj.ahora();
  await m.reloj.avanza(250);
  m.bucle.pausa(audioDe(700), finReal);
  m.transcripciones[0]?.d.resuelve(['¿Qué hora es?']);
  await vacia();
  assert.equal(m.rep.recibidas.length, 0, 'retenida: no suena antes de confirmar');
  assert.deepEqual(m.lecturas, ['hora'], 'la respuesta ya está preparada');
  await m.reloj.avanza(350);
  m.bucle.vozTermina(audioDe(700), finReal, m.reloj.ahora());
  await vacia();
  assert.equal(m.transcripciones.length, 1);
  assert.equal(m.rep.recibidas.length, 1, 'suena al confirmar');
  assert.equal(m.bucle.telemetria.turno(1)?.especulativo, true);
});

test('especulación: si la voz sigue tras la pausa, se aborta lo preparado y no suena', async () => {
  const m = monta();
  m.bucle.vozInicia(m.reloj.ahora());
  await m.reloj.avanza(500);
  m.bucle.pausa(audioDe(500), m.reloj.ahora());
  m.bucle.vozReanuda();
  assert.equal(m.transcripciones[0]?.senal.aborted, true);
  m.transcripciones[0]?.d.resuelve(['¿Qué hora es?']);
  await vacia();
  assert.equal(m.lecturas.length, 0);
  assert.equal(m.bucle.telemetria.turno(1)?.estado, 'descartado');
});

test('cierre por sentido: una orden segura confirma antes del silencio entero del VAD', async () => {
  const m = monta();
  m.bucle.vozInicia(m.reloj.ahora());
  await m.reloj.avanza(600);
  const finReal = m.reloj.ahora();
  await m.reloj.avanza(250);
  m.bucle.pausa(audioDe(600), finReal);
  m.transcripciones[0]?.d.resuelve(['¿Qué hora es?']);
  await vacia();
  await m.reloj.avanza(60);
  assert.equal(m.rep.recibidas.length, 1, 'sonó sin esperar al VAD');
  const r = m.bucle.telemetria.turno(1);
  assert.equal(r?.cierreAnticipado, true);
  assert.ok((r?.marcas.cierre ?? 0) - finReal <= 310, `cerró a los ${(r?.marcas.cierre ?? 0) - finReal} ms`);
  // El VAD cierra después: no abre otro turno.
  m.bucle.vozTermina(audioDe(600), finReal, finReal + 600);
  await vacia();
  assert.equal(m.transcripciones.length, 1);
});

test('cierre por sentido: una frase que acaba en «y» espera; si vuelve la voz, se transcribe junta', async () => {
  const m = monta();
  m.bucle.vozInicia(m.reloj.ahora());
  await m.reloj.avanza(800);
  const finReal = m.reloj.ahora();
  await m.reloj.avanza(250);
  m.bucle.pausa(audioDe(800), finReal);
  m.transcripciones[0]?.d.resuelve(['Quiero saber el saldo y']);
  await vacia();
  await m.reloj.avanza(350);
  m.bucle.vozTermina(audioDe(800), finReal, m.reloj.ahora());
  await m.reloj.avanza(300);
  assert.equal(m.pensadas.length + m.rep.recibidas.length, 0, 'todavía espera, sin cerebro preventivo');
  m.bucle.vozInicia(m.reloj.ahora());
  await m.reloj.avanza(500);
  const fin2 = m.reloj.ahora();
  await m.reloj.avanza(600);
  m.bucle.vozTermina(audioDe(500), fin2, m.reloj.ahora());
  await vacia();
  const ultima = m.transcripciones.at(-1);
  assert.ok(ultima && Math.abs(ultima.ms - 1300) < 2, `el audio va junto (${ultima?.ms} ms)`);
});

test('telemetría: la latencia cuenta desde el fin real del habla, con el cierre del VAD dentro', async () => {
  const m = monta();
  const { finReal } = await habla(m, 800, 600);
  await m.reloj.avanza(150);
  m.transcripciones[0]?.d.resuelve(['¿Qué hora es?']);
  await vacia();
  const r = m.bucle.telemetria.turno(1);
  assert.ok(r);
  assert.equal(r.marcas.finReal, finReal);
  assert.equal(r.marcas.cierre, finReal + 600);
  assert.equal(latencia(r), 750, 'fin real → suena incluye los 600 ms del VAD y los 150 del motor');
  m.rep.terminaTodo();
  await vacia();
  assert.equal(m.bucle.telemetria.turno(1)?.estado, 'completo');
});

test('la voz que empieza mientras la máquina habla, sin interrupción confirmada, no abre turno (eco)', async () => {
  const m = monta();
  await habla(m);
  m.transcripciones[0]?.d.resuelve(['Cuéntame algo largo']);
  await vacia();
  assert.equal(m.bucle.estado, 'hablando');
  await habla(m, 400, 600);
  assert.equal(m.transcripciones.length, 1, 'el eco no llegó al motor');
});

test('modo palabra: sin la palabra no hace nada; con ella y la orden en la misma frase, contesta', async () => {
  const m = monta({ modo: 'palabra', activacion: creaActivacion({ frases: ['oye mando'] }) });
  assert.equal(m.bucle.estado, 'reposo');
  await habla(m);
  m.transcripciones[0]?.d.resuelve(['¿Qué hora es?']);
  await vacia();
  assert.equal(m.lecturas.length, 0);
  assert.ok(m.eventos.some((e) => e.tipo === 'descartado' && e.motivo.includes('activación')));
  await habla(m);
  m.transcripciones[1]?.d.resuelve(['Oye, mando, ¿qué hora es?']);
  await vacia();
  assert.deepEqual(m.lecturas, ['hora']);
  m.rep.terminaTodo();
  await vacia();
  assert.equal(m.bucle.estado, 'escuchando', 'ventana de seguimiento sin repetir la palabra');
  await m.reloj.avanza(6100);
  assert.equal(m.bucle.estado, 'reposo');
});

test('activar dos veces no abre dos escuchas; «repite» reutiliza el audio sin volver a sintetizar', async () => {
  const m = monta({ modo: 'toque' });
  m.bucle.activa();
  m.bucle.activa();
  assert.equal(m.eventos.filter((e) => e.tipo === 'estado' && e.estado === 'escuchando').length, 1);
  await habla(m);
  m.transcripciones[0]?.d.resuelve(['¿Qué hora es?']);
  await vacia();
  m.rep.terminaTodo();
  await vacia();
  assert.equal(m.bucle.estado, 'reposo', 'modo toque: un turno por activación');
  const sintesisAntes = m.sintesis.length;
  m.bucle.activa();
  await habla(m);
  m.transcripciones[1]?.d.resuelve(['Repite']);
  await vacia();
  assert.equal(m.sintesis.length, sintesisAntes, 'repetir no pide voz nueva');
  assert.equal(m.rep.recibidas.at(-1)?.texto, 'Son las cinco y veinte de la tarde.');
});

test('«más despacio» cambia la velocidad del reproductor solo cuando el turno se confirma', async () => {
  const m = monta();
  m.bucle.vozInicia(m.reloj.ahora());
  await m.reloj.avanza(600);
  m.bucle.pausa(audioDe(600), m.reloj.ahora());
  m.transcripciones[0]?.d.resuelve(['más despacio']);
  await vacia();
  m.bucle.vozReanuda();
  await vacia();
  assert.deepEqual(m.rep.velocidades, [], 'especulación abortada: sin efecto');
  await habla(m);
  m.transcripciones[1]?.d.resuelve(['más despacio']);
  await vacia();
  assert.deepEqual(m.rep.velocidades, [0.85]);
});

test('un error del cerebro no se queda mudo: se avisa y se dice', async () => {
  const m = monta({
    cerebro: {
      async *piensa() {
        yield* [];
        throw new Error('presupuesto agotado');
      },
    },
  });
  await habla(m);
  m.transcripciones[0]?.d.resuelve(['Cuéntame un chiste']);
  await vacia();
  assert.ok(m.eventos.some((e) => e.tipo === 'aviso' && e.mensaje.includes('presupuesto')));
  assert.match(m.rep.recibidas.at(-1)?.texto ?? '', /no pude contestar/i);
});

test('un turno nuevo y firme calla el audio que quedaba del anterior (pregunta escrita mientras habla)', async () => {
  const m = monta();
  await habla(m);
  m.transcripciones[0]?.d.resuelve(['Cuéntame algo largo']);
  await vacia();
  assert.equal(m.bucle.estado, 'hablando');
  const antes = m.rep.detenciones;
  m.bucle.dice('¿Qué hora es?');
  await vacia();
  assert.equal(m.rep.detenciones, antes + 1, 'el audio viejo se para al confirmarse el turno nuevo');
  assert.ok(m.rep.recibidas.at(-1)?.turno === 2);
});

test('si la transcripción falla: la especulación se descarta en silencio; el turno firme lo DICE', async () => {
  const m = monta();
  m.bucle.vozInicia(m.reloj.ahora());
  await m.reloj.avanza(500);
  m.bucle.pausa(audioDe(500), m.reloj.ahora());
  m.transcripciones[0]?.d.rechaza(new Error('el motor local no responde'));
  await vacia();
  assert.equal(m.bucle.telemetria.turno(1)?.estado, 'descartado');
  assert.equal(m.rep.recibidas.length, 0);
  await habla(m);
  m.transcripciones[1]?.d.rechaza(new Error('el motor local no responde'));
  await vacia();
  assert.ok(m.eventos.some((e) => e.tipo === 'aviso' && e.mensaje.includes('motor local')));
  assert.match(m.rep.recibidas.at(-1)?.texto ?? '', /no pude contestar/i, 'el error se oye, no solo se pinta');
});

test('una orden cerrada por sentido que acaba antes del VAD («Para.») no se repite cuando el VAD cierra', async () => {
  const m = monta();
  m.bucle.vozInicia(m.reloj.ahora());
  await m.reloj.avanza(500);
  const finReal = m.reloj.ahora();
  await m.reloj.avanza(220);
  m.bucle.pausa(audioDe(500), finReal);
  m.transcripciones[0]?.d.resuelve(['Para.']);
  await vacia();
  await m.reloj.avanza(100);
  assert.equal(m.bucle.telemetria.turno(1)?.estado, 'completo', 'cerró por sentido y terminó (no dice nada)');
  m.bucle.vozTermina(audioDe(500), finReal, finReal + 600);
  await vacia();
  assert.equal(m.transcripciones.length, 1, 'el cierre del VAD del mismo tramo no abre otro turno');
});

test('una interrupción corta que no se entiende («But») se toma como «para»: la máquina no vuelve a hablar', async () => {
  const m = monta();
  await habla(m);
  m.transcripciones[0]?.d.resuelve(['Cuéntame algo largo']);
  await vacia();
  assert.equal(m.bucle.estado, 'hablando');
  m.bucle.vozInicia(m.reloj.ahora());
  m.bucle.interrumpe(m.reloj.ahora() + 150);
  await m.reloj.avanza(300);
  const fin = m.reloj.ahora();
  await m.reloj.avanza(600);
  m.bucle.vozTermina(audioDe(300), fin, m.reloj.ahora());
  await vacia();
  const recibidas = m.rep.recibidas.length;
  m.transcripciones.at(-1)?.d.resuelve(['But']);
  await vacia();
  assert.equal(m.pensadas.length, 1, 'no se llamó otra vez al cerebro');
  assert.equal(m.rep.recibidas.length, recibidas, 'y no sonó nada nuevo');
  const d = m.eventos.filter((e) => e.tipo === 'decision').at(-1);
  assert.ok(d?.tipo === 'decision' && d.decision.tipo === 'orden' && d.decision.orden === 'para');
});
