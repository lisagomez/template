/**
 * La API del banco, cerrada por defecto (fail-closed, como el puente A2A del #210): solo responde con
 * `BANCO_LABORATORIO=1`, FUERA de producción y a una petición hecha en ESTA máquina. En un despliegue
 * (`next start`, NODE_ENV=production) no existe: 404, aunque alguien ponga la variable.
 *
 * «Esta máquina» se lee de las cabeceras: Host local y, si hay `x-forwarded-for`, que sea loopback. Next lo
 * rellena con la dirección del socket cuando el cliente no lo manda (`base-server.js`: `??=`), así que quien
 * abre la URL desde otro equipo de la red cae en 404. Quien FALSEA las dos cabeceras a propósito pasa: esa
 * barrera es la red (WSL2 en NAT no expone el puerto a la LAN), no este chequeo. Dicho en la nota C3.
 */
import { creaApi } from '../../../../../tools/banco-motores/dist/index.js';
import { FUNCIONES } from './funciones';

const HOST_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{2,5})?$/;
const LOOPBACK = /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/;

export function esDeEstaMaquina(h: Headers): boolean {
  const reenviada = h.get('x-forwarded-for');
  return HOST_LOCAL.test(h.get('host') ?? '') && (reenviada === null || LOOPBACK.test(reenviada.trim())) && !h.get('forwarded');
}

export function bancoHabilitado(h: Headers): boolean {
  return process.env['BANCO_LABORATORIO'] === '1' && process.env.NODE_ENV !== 'production' && esDeEstaMaquina(h);
}

export const API_BANCO = creaApi(FUNCIONES, { habilitado: (peticion) => bancoHabilitado(peticion.headers), maxBytes: 8 * 1024 * 1024 });
