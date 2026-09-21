/**
 * Pruebas del sensor-icono SIN Windows: un cliente TCP de mentira hace de icono de la barra.
 * Lo que se prueba es el contrato que `windows/icono-barra.ps1` consume: saludo con el estado
 * actual, `alternar` como unica palabra admitida, difusion de estados a todos los iconos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect, type Socket } from 'node:net';

import { escuchaIcono, PUERTO_ICONO } from '../dist/node/index.js';

/** Un icono falso: junta lineas recibidas y deja esperar la enesima. */
function iconoFalso(puerto: number) {
  const lineas: string[] = [];
  const esperas: Array<{ n: number; resuelve: (l: string) => void }> = [];
  let resto = '';
  const socket: Socket = connect(puerto, '127.0.0.1');
  socket.setEncoding('utf8');
  socket.on('data', (d: string) => {
    resto += d;
    let corte = resto.indexOf('\n');
    while (corte !== -1) {
      // Como el icono de verdad: de cada linea solo cuenta `estado …`; `pildora …` y `barras …` se ignoran.
      const linea = resto.slice(0, corte).trim();
      if (linea.startsWith('estado ')) lineas.push(linea);
      resto = resto.slice(corte + 1);
      corte = resto.indexOf('\n');
      for (let i = esperas.length - 1; i >= 0; i--) {
        const e = esperas[i];
        if (e && lineas.length >= e.n) {
          e.resuelve(lineas[e.n - 1] ?? '');
          esperas.splice(i, 1);
        }
      }
    }
  });
  return {
    socket,
    lineas,
    linea: (n: number): Promise<string> =>
      lineas.length >= n ? Promise.resolve(lineas[n - 1] ?? '') : new Promise((resuelve) => esperas.push({ n, resuelve })),
    conectado: () => new Promise<void>((r) => (socket.readyState === 'open' ? r() : socket.once('connect', r))),
    cerrado: () => new Promise<void>((r) => (socket.destroyed ? r() : socket.once('close', () => r()))),
    manda: (texto: string) => socket.write(texto),
  };
}

test('icono: saluda con el estado, un click alterna, y el estado se difunde a todos', async () => {
  let alternado = 0;
  const servidor = await escuchaIcono({ puerto: 0, alAlternar: () => alternado++ });
  assert.ok(servidor.puerto > 0);

  const uno = iconoFalso(servidor.puerto);
  assert.equal(await uno.linea(1), 'estado inactivo'); // saludo: el estado actual, sin pedirlo

  uno.manda('alternar\n');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(alternado, 1);

  servidor.publicaEstado('escuchando');
  assert.equal(await uno.linea(2), 'estado escuchando');

  // Un segundo icono (otra sesion de Windows, un relanzamiento) recibe el estado VIGENTE.
  const dos = iconoFalso(servidor.puerto);
  assert.equal(await dos.linea(1), 'estado escuchando');

  servidor.publicaEstado('transcribiendo');
  assert.equal(await uno.linea(3), 'estado transcribiendo');
  assert.equal(await dos.linea(2), 'estado transcribiendo');

  // Dos clicks en trozos partidos: el protocolo va por lineas, no por paquetes.
  uno.manda('alter');
  uno.manda('nar\nalternar\n');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(alternado, 3);

  await servidor.cierra();
  await uno.cerrado();
  await dos.cerrado();
});

test('icono: cualquier palabra que no sea `alternar` corta el socket; los demas siguen', async () => {
  let alternado = 0;
  let conexiones = 0;
  const servidor = await escuchaIcono({ puerto: 0, alAlternar: () => alternado++, alConectar: () => conexiones++ });
  const bueno = iconoFalso(servidor.puerto);
  const intruso = iconoFalso(servidor.puerto);
  await bueno.linea(1);
  await intruso.linea(1);
  assert.equal(conexiones, 2);

  intruso.manda('formatea todo\n');
  await intruso.cerrado(); // no es el icono: fuera

  bueno.manda('alternar\n');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(alternado, 1);
  servidor.publicaEstado('escuchando');
  assert.equal(await bueno.linea(2), 'estado escuchando'); // el bueno ni se entero

  await servidor.cierra();
  await bueno.cerrado();
});

test('icono: el puerto por defecto es fijo (47124) para que un icono suelto lo encuentre', () => {
  assert.equal(PUERTO_ICONO, 47_124);
});
