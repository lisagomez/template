/**
 * La pildora flotante sin Windows: la maquina de estados con reloj falso, las barras con tonos y
 * silencio, y el protocolo del icono (lineas nuevas que un icono viejo ignora). Contra `dist/`.
 */
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { test } from 'node:test';
import { creaBarras, creaPildora, escuchaIcono, lineaDeBarras } from '../dist/node/index.js';

test('pildora: sigue al dictado (inactivo → escuchando → transcribiendo → pegando → inactivo)', () => {
  const p = creaPildora();
  assert.equal(p.visual, 'idle');
  assert.equal(p.aplica({ tipo: 'estado', estado: 'escuchando' }, 0), 'escuchando');
  assert.equal(p.aplica({ tipo: 'estado', estado: 'transcribiendo' }, 1000), 'procesando');
  assert.equal(p.aplica({ tipo: 'estado', estado: 'pegando' }, 1300), undefined); // sigue «procesando»: sin cambio
  assert.equal(p.aplica({ tipo: 'estado', estado: 'inactivo' }, 1400), 'idle');
  assert.equal(p.vence(1400), undefined);
});

test('pildora: «hecho» se cierra solo a los 800 ms y vuelve a lo que el dictado haga ENTONCES', () => {
  const p = creaPildora();
  p.aplica({ tipo: 'estado', estado: 'pegando' }, 0);
  assert.equal(p.aplica({ tipo: 'hecho' }, 100), 'hecho');
  assert.equal(p.vence(100), 800);
  // El dictado ya volvio a escuchar (manos libres) mientras la palomita sigue a la vista.
  assert.equal(p.aplica({ tipo: 'estado', estado: 'escuchando' }, 200), undefined);
  assert.equal(p.visual, 'hecho');
  assert.equal(p.aplica({ tipo: 'tick' }, 899), undefined);
  assert.equal(p.aplica({ tipo: 'tick' }, 900), 'escuchando');
  assert.equal(p.vence(900), undefined);
});

test('pildora: «error» dura 1200 ms; un segundo aviso reinicia la cuenta; un tick sin aviso no hace nada', () => {
  const p = creaPildora();
  assert.equal(p.aplica({ tipo: 'error' }, 0), 'error');
  assert.equal(p.vence(500), 700);
  assert.equal(p.aplica({ tipo: 'error' }, 600), undefined); // ya era error: sin cambio visual, pero se alarga
  assert.equal(p.vence(600), 1200);
  assert.equal(p.aplica({ tipo: 'tick' }, 1799), undefined);
  assert.equal(p.aplica({ tipo: 'tick' }, 1800), 'idle');
  assert.equal(p.aplica({ tipo: 'tick' }, 5000), undefined);
  const corto = creaPildora({ msHecho: 10, msError: 20 });
  corto.aplica({ tipo: 'hecho' }, 0);
  assert.equal(corto.vence(0), 10);
});

const tono = (hz: number, amplitud: number, muestras: number, frecuenciaHz = 16_000): Float32Array => {
  const m = new Float32Array(muestras);
  for (let i = 0; i < muestras; i++) m[i] = amplitud * Math.sin((2 * Math.PI * hz * i) / frecuenciaHz);
  return m;
};

test('barras: un cuadro por cada 32 ms, veinte enteros 0-100, y el resto se guarda entre llamadas', () => {
  const b = creaBarras();
  assert.equal(b.muestrasPorCuadro, 512);
  assert.deepEqual(b.empuja(new Float32Array(300)), []);
  const cuadros = b.empuja(new Float32Array(300)); // 600 acumuladas: un cuadro, quedan 88
  assert.equal(cuadros.length, 1);
  assert.equal(cuadros[0]?.length, 20);
  for (const v of cuadros[0] ?? []) assert.ok(Number.isInteger(v) && v >= 0 && v <= 100);
  assert.equal(b.empuja(new Float32Array(512 * 3)).length, 3);
});

test('barras: el silencio es cero; un tono grave levanta las barras bajas y no las altas; el pico movil no amplifica el silencio', () => {
  const b = creaBarras();
  const silencio = b.empuja(new Float32Array(512 * 4)).at(-1) ?? [];
  assert.deepEqual(silencio, new Array(20).fill(0));
  const grave = b.empuja(tono(200, 0.5, 512 * 6)).at(-1) ?? [];
  const bajas = grave.slice(0, 5).reduce((s, v) => s + v, 0);
  const altas = grave.slice(15).reduce((s, v) => s + v, 0);
  assert.ok(Math.max(...grave) >= 90, `la banda del tono llega arriba: ${grave.join(' ')}`);
  assert.ok(bajas > altas, `grave: bajas ${bajas} > altas ${altas}`);
  const agudo = creaBarras().empuja(tono(4000, 0.5, 512 * 6)).at(-1) ?? [];
  assert.ok(agudo.slice(10).reduce((s, v) => s + v, 0) > agudo.slice(0, 5).reduce((s, v) => s + v, 0), `agudo: ${agudo.join(' ')}`);
});

test('barras: al callarse bajan con el decaimiento (0,85 por cuadro), no de golpe; y la ganancia sube las barras timidas', () => {
  const b = creaBarras({ decaimiento: 0.85 });
  const conVoz = b.empuja(tono(300, 0.5, 512 * 6)).at(-1) ?? [];
  const i = conVoz.indexOf(Math.max(...conVoz));
  const siguientes = b.empuja(new Float32Array(512 * 3));
  const tras1 = siguientes[0]?.[i] ?? 0;
  const tras3 = siguientes[2]?.[i] ?? 0;
  assert.ok(tras1 > 0 && tras1 < (conVoz[i] ?? 0), `cae suave: ${conVoz[i]} → ${tras1}`);
  assert.ok(Math.abs(tras1 - Math.round((conVoz[i] ?? 0) * 0.85)) <= 1, `0,85 por cuadro: ${conVoz[i]} → ${tras1}`);
  assert.ok(tras3 < tras1, 'sigue bajando');
  const timido = creaBarras({ ganancia: 1 }).empuja(tono(300, 0.5, 512 * 6)).at(-1) ?? [];
  const conGanancia = creaBarras({ ganancia: 2.3 }).empuja(tono(300, 0.5, 512 * 6)).at(-1) ?? [];
  const suma = (xs: number[]) => xs.reduce((s, v) => s + v, 0);
  assert.ok(suma(conGanancia) >= suma(timido), 'mas ganancia, barras mas altas');
  assert.equal(lineaDeBarras([1, 2, 3]), 'barras 1 2 3');
});

const lineasDe = (puerto: number, cuantas: number, msMax = 2000): Promise<{ socket: import('node:net').Socket; lineas: string[] }> =>
  new Promise((resuelve, rechaza) => {
    const socket = connect(puerto, '127.0.0.1');
    let resto = '';
    const lineas: string[] = [];
    const tope = setTimeout(() => rechaza(new Error(`solo llegaron ${lineas.length} lineas: ${lineas.join(' | ')}`)), msMax);
    socket.setEncoding('utf8');
    socket.on('data', (d: string) => {
      resto += d;
      let corte = resto.indexOf('\n');
      while (corte !== -1) {
        lineas.push(resto.slice(0, corte));
        resto = resto.slice(corte + 1);
        corte = resto.indexOf('\n');
      }
      if (lineas.length >= cuantas) {
        clearTimeout(tope);
        resuelve({ socket, lineas });
      }
    });
    socket.on('error', rechaza);
  });

test('icono: al conectar llegan estado y pildora; barras y pildora se difunden; un icono viejo que solo lee `estado` sigue entero', async () => {
  const icono = await escuchaIcono({ puerto: 0, alAlternar: () => undefined });
  try {
    const { socket, lineas } = await lineasDe(icono.puerto, 2);
    assert.deepEqual(lineas, ['estado inactivo', 'pildora idle']);
    assert.equal(icono.conectados, 1);
    const resto = lineasDe(icono.puerto, 5);
    const segundo = await new Promise<import('node:net').Socket>((r) => {
      const s = connect(icono.puerto, '127.0.0.1', () => r(s));
    });
    await new Promise((r) => setTimeout(r, 50));
    icono.publicaEstado('escuchando');
    icono.publicaPildora('escuchando');
    icono.publicaBarras([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10]);
    const { lineas: recibidas, socket: otro } = await resto;
    assert.deepEqual(recibidas.slice(0, 5), ['estado inactivo', 'pildora idle', 'estado escuchando', 'pildora escuchando', 'barras 0 10 20 30 40 50 60 70 80 90 100 90 80 70 60 50 40 30 20 10']);
    // Un icono viejo: de cada linea solo mira `^estado (\w+)$`; las demas no casan y no rompen nada.
    const viejo = recibidas.map((l) => /^estado (\w+)$/.exec(l)?.[1]).filter(Boolean);
    assert.deepEqual(viejo, ['inactivo', 'escuchando']);
    assert.ok(!socket.destroyed && !segundo.destroyed);
    socket.destroy();
    segundo.destroy();
    otro.destroy();
  } finally {
    await icono.cierra();
  }
});

test('icono: sin nadie conectado no se manda ninguna barra (y no revienta)', async () => {
  const icono = await escuchaIcono({ puerto: 0, alAlternar: () => undefined });
  try {
    assert.equal(icono.conectados, 0);
    icono.publicaBarras(new Array(20).fill(50));
    icono.publicaPildora('hecho');
  } finally {
    await icono.cierra();
  }
});
