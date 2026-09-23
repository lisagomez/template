/**
 * La conversacion con el agente sin Windows ni modelos: el hablante con voz y altavoz falsos, la
 * puerta logica del audio cerrada mientras suena, la espera a que la persona termine su frase, el
 * envio pausado, y el socket local con su cliente. Contra `dist/`.
 */
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { test } from 'node:test';
import { creaEnvioPorSilencio, type EventoDictado } from '../dist/index.js';
import { creaConversacion, creaHablante, escuchaConversacion, pideDi, type Altavoz, type Hablante, type VozSintetica } from '../dist/node/index.js';

const tic = () => new Promise<void>((r) => setTimeout(r, 0));

/** Una voz que entrega N trozos, uno por vuelta del bucle, y respeta el `false` de corte. */
function vozFalsa(trozos = 3): VozSintetica & { emitidos: number } {
  const v = {
    id: 'voz-falsa',
    frecuenciaHz: 16_000,
    emitidos: 0,
    async sintetiza(_texto: string, alTrozo?: (m: Float32Array) => boolean | void) {
      for (let i = 0; i < trozos; i++) {
        await tic();
        if (alTrozo?.(new Float32Array(160).fill(0.1)) === false) break;
        v.emitidos += 1;
      }
      return { muestras: new Float32Array(160 * v.emitidos), frecuenciaHz: 16_000, ms: 1 };
    },
  };
  return v;
}

function altavozFalso(): Altavoz & { escritos: number; esperas: number; cerrado: boolean } {
  const a = {
    escritos: 0,
    esperas: 0,
    cerrado: false,
    escribe: () => { a.escritos += 1; },
    espera: async () => { a.esperas += 1; },
    termina: async () => { a.cerrado = true; },
  };
  return a;
}

test('hablante: abre el altavoz una vez, dice en serie, mide el primer audio, y calla() corta la sintesis', async () => {
  const voz = vozFalsa(3);
  const altavoz = altavozFalso();
  let aperturas = 0;
  const h = creaHablante({ voz, abreAltavoz: () => { aperturas += 1; return altavoz; }, velocidad: () => 0.9 });
  assert.equal(h.hablando, false);
  const r = await h.di('Hola. Que tal. Bien.');
  assert.equal(aperturas, 1);
  assert.equal(altavoz.escritos, 3);
  assert.equal(altavoz.esperas, 1, 'espera a que suene sin cerrar el altavoz');
  assert.equal(r.cortado, false);
  assert.ok(r.msPrimerAudio > 0 && r.msPrimerAudio <= r.msTotal);
  // Dos peticiones: la segunda espera a la primera; callar corta la que suena.
  const voz2 = vozFalsa(5);
  const h2 = creaHablante({ voz: voz2, abreAltavoz: () => altavoz });
  const primera = h2.di('uno');
  const segunda = h2.di('dos');
  await tic();
  assert.equal(h2.hablando, true);
  h2.calla();
  const r1 = await primera;
  assert.equal(r1.cortado, true);
  assert.ok(voz2.emitidos < 10, 'tras callar no se sintetiza lo que faltaba');
  const r2 = await segunda;
  assert.equal(r2.cortado, false, 'la siguiente peticion suena entera');
  await h2.cierra();
  assert.equal(altavoz.cerrado, true);
});

interface Espia { orden: string[]; detector: { hablando: boolean; reinicia(): void }; hablante: Hablante }

function montaje(o: { hablando?: boolean } = {}) {
  const orden: string[] = [];
  const detector = { hablando: o.hablando ?? false, reinicia: () => { orden.push('reinicia'); } };
  const voz = vozFalsa(2);
  const altavoz = altavozFalso();
  const escribeOriginal = altavoz.escribe;
  altavoz.escribe = (m) => { orden.push('trozo'); escribeOriginal(m); };
  const hablante = creaHablante({ voz, abreAltavoz: () => altavoz });
  const envio = creaEnvioPorSilencio({ msEnvio: 1000 });
  const enviados: number[] = [];
  const programados: Array<{ ms: number; fn: () => void }> = [];
  let ahora = 0;
  const c = creaConversacion({
    envio,
    alEnviar: () => { enviados.push(ahora); },
    estado: () => 'escuchando',
    hablante: async () => hablante,
    detector,
    msMargen: 0,
    msEsperaTurno: 5000,
    ahora: () => ahora,
    // El margen y los ticks se disparan solos (0 ms) para no esperar; los demas se apuntan.
    programa: (ms, fn) => { if (ms === 0) { setTimeout(fn, 0); return () => undefined; } const p = { ms, fn }; programados.push(p); return () => { const i = programados.indexOf(p); if (i >= 0) programados.splice(i, 1); }; },
    log: () => undefined,
  });
  const espia: Espia = { orden, detector, hablante };
  return { c, envio, enviados, programados, espia, avanza: (ms: number) => { ahora += ms; } };
}

const textoEvento = (t: string): EventoDictado => ({ tipo: 'texto', texto: t, textoCrudo: t, acciones: [], duracionMs: 1000, latenciaMs: 300, msMotor: 200 });

test('conversacion.di: cierra la puerta del audio antes del primer trozo, no admite audio mientras suena, reinicia el detector y reabre; el envio se pausa y rearma', async () => {
  const m = montaje();
  m.c.activa = true;
  m.c.alEvento(textoEvento('hola')); // texto pendiente: el plazo esta armado
  assert.equal(m.programados.length, 1);
  assert.equal(m.c.admiteAudio(), true);
  const promesa = m.c.di('Te escucho.');
  await tic();
  assert.equal(m.c.admiteAudio(), false, 'la puerta se cierra en cuanto llega el texto');
  assert.equal(m.envio.vence(0), undefined, 'mientras habla el agente no hay plazo de envio');
  const r = await promesa;
  assert.equal(r.tipo, 'hecho');
  assert.deepEqual(m.espia.orden, ['trozo', 'trozo', 'reinicia'], 'suena con la puerta cerrada; al terminar, detector limpio');
  assert.equal(m.c.admiteAudio(), true);
  assert.equal(m.envio.vence(0), 1000, 'al callar el agente, lo pendiente vuelve a tener plazo');
  assert.equal(m.c.saludo(), 'on escuchando');
});

test('conversacion.di: con la persona a media frase espera al fin de su turno (tope 5 s) antes de sonar', async () => {
  const m = montaje({ hablando: true });
  const promesa = m.c.di('espera a que termines');
  await tic();
  await tic();
  assert.equal(m.espia.orden.length, 0, 'no ha sonado nada: la persona sigue hablando');
  assert.equal(m.c.admiteAudio(), true, 'y su audio sigue entrando');
  assert.equal(m.programados.some((p) => p.ms === 5000), true, 'con tope de 5 s');
  m.espia.detector.hablando = false;
  m.c.alEvento({ tipo: 'finHabla', duracionMs: 900 });
  const r2 = await promesa;
  assert.equal(r2.tipo, 'hecho');
  assert.equal(m.espia.orden[0], 'trozo');
  await m.c.cierra();
});

test('conversacion: sin hablante, di se omite; calla() corta la voz en curso', async () => {
  const sin = creaConversacion({ envio: creaEnvioPorSilencio(), alEnviar: () => undefined, log: () => undefined });
  assert.deepEqual(await sin.di('hola'), { tipo: 'omitido', motivo: 'sin-voz' });
  assert.equal(sin.saludo(), 'off inactivo');
  const m = montaje();
  const voz = vozFalsa(6);
  const h = creaHablante({ voz, abreAltavoz: () => altavozFalso() });
  const c = creaConversacion({ envio: creaEnvioPorSilencio(), alEnviar: () => undefined, hablante: async () => h, msMargen: 0, programa: (ms, fn) => { setTimeout(fn, ms); return () => undefined; }, log: () => undefined });
  const promesa = c.di('uno dos tres cuatro cinco seis');
  await tic();
  await tic();
  c.calla();
  const r = await promesa;
  assert.equal(r.tipo, 'cortado');
  assert.ok(voz.emitidos < 6);
  await c.cierra();
  await m.c.cierra();
});

test('socket 47126: saluda, di → ok → hecho, estado, calla, texto largo omitido, palabra rara cierra; el cliente pideDi', async () => {
  const dichos: string[] = [];
  let callado = 0;
  const s = await escuchaConversacion({
    puerto: 0,
    saludo: () => 'on escuchando',
    alDi: async (t) => { dichos.push(t); return { tipo: 'hecho', msPrimerAudio: 120.4, msTotal: 900.6 }; },
    alCalla: () => { callado += 1; },
  });
  const lineas: string[] = [];
  const socket = connect({ host: '127.0.0.1', port: s.puerto });
  socket.setEncoding('utf8');
  socket.on('data', (d: string) => lineas.push(...d.split('\n').filter(Boolean)));
  const espera = async (n: number) => { for (let i = 0; i < 50 && lineas.length < n; i++) await new Promise((r) => setTimeout(r, 5)); };
  await espera(1);
  assert.deepEqual(lineas, ['dictar on escuchando']);
  socket.write(`di ${Buffer.from('Hola, ¿me oyes?', 'utf8').toString('base64')}\n`);
  await espera(3);
  assert.deepEqual(lineas.slice(1), ['ok', 'hecho 120 901']);
  assert.deepEqual(dichos, ['Hola, ¿me oyes?']);
  socket.write('estado\ncalla\n');
  await espera(5);
  assert.deepEqual(lineas.slice(3), ['dictar on escuchando', 'ok']);
  assert.equal(callado, 1);
  socket.write(`di ${Buffer.from('x'.repeat(4001)).toString('base64')}\n`);
  await espera(6);
  assert.equal(lineas[5], 'omitido texto-demasiado-largo');
  const cerrado = new Promise<void>((r) => socket.on('close', () => r()));
  socket.write('hola que tal\n');
  await cerrado;

  const r = await pideDi('por el cliente', { puerto: s.puerto });
  assert.deepEqual(r, { modo: 'dictar', tipo: 'hecho', msPrimerAudio: 120, msTotal: 901 });
  assert.equal(dichos[1], 'por el cliente');
  await s.cierra();

  const apagado = await escuchaConversacion({ puerto: 0, saludo: () => 'off inactivo', alDi: async () => ({ tipo: 'cortado' }), alCalla: () => undefined });
  assert.deepEqual(await pideDi('x', { puerto: apagado.puerto, soloEncendido: true }), { modo: 'apagado', estado: 'off inactivo' });
  assert.deepEqual(await pideDi('x', { puerto: apagado.puerto }), { modo: 'dictar', tipo: 'cortado' }, 'sin soloEncendido, un dictado apagado tambien habla');
  await apagado.cierra();

  const t0 = performance.now();
  assert.deepEqual(await pideDi('nadie', { puerto: apagado.puerto, msConexion: 300 }), { modo: 'sin-dictar' });
  assert.ok(performance.now() - t0 < 300, 'sin dictado, rehusado al instante');
});
