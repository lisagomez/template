/**
 * La API del banco, cerrada por defecto (fail-closed, como el puente A2A del #210): solo responde con
 * `BANCO_LABORATORIO=1` y FUERA de producción. En un despliegue (`next start`, NODE_ENV=production) no
 * existe: 404, aunque alguien ponga la variable.
 */
import { creaApi } from '../../../../../tools/banco-motores/dist/index.js';
import { FUNCIONES } from './funciones';

export function bancoHabilitado(): boolean {
  return process.env['BANCO_LABORATORIO'] === '1' && process.env.NODE_ENV !== 'production';
}

export const API_BANCO = creaApi(FUNCIONES, { habilitado: bancoHabilitado, maxBytes: 8 * 1024 * 1024 });
