/**
 * La guardia de red de la corrida de punta a punta: se precarga (`--import`) en cada proceso de Node y anota en
 * `GUARDIA_RED_LOG` cada conexión TCP saliente, marcando AJENA la que no va a la máquina local. La corrida falla si
 * hay una sola. Cubre `fetch` (undici), `http`, `https` y `net`: todos terminan en `Socket.prototype.connect`.
 */
import net from 'node:net';
import { appendFileSync } from 'node:fs';

const LOG = process.env.GUARDIA_RED_LOG;
const LOCALES = new Set(['127.0.0.1', 'localhost', '::1', '::ffff:127.0.0.1']);
const conecta = net.Socket.prototype.connect;

net.Socket.prototype.connect = function (...args) {
  const primero = Array.isArray(args[0]) ? args[0][0] : args[0];
  const o = primero && typeof primero === 'object' ? primero : { port: primero, host: typeof args[1] === 'string' ? args[1] : 'localhost' };
  if (LOG && o.path === undefined) {
    const host = String(o.host ?? 'localhost');
    appendFileSync(LOG, `${LOCALES.has(host) ? 'local' : 'AJENA'} ${host}:${o.port} pid=${process.pid}\n`);
  }
  return conecta.apply(this, args);
};
