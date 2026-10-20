/**
 * La entrada del Worker del laboratorio alojado. Toda la lógica de la puerta vive en `puerta.ts` (probada en Node); aquí
 * solo está lo que es de Cloudflare: la clase del contenedor y a qué instancia se manda cada petición.
 *
 * El contenedor recibe solo las variables que nombra `PASAN`. Su salida a internet queda como viene (abierta): cerrarla a
 * las llaves de Access y al almacén pide interceptar el TLS (`interceptHttps`, con el CA de Cloudflare en la imagen), y
 * esa conducta no está documentada para `allowedHosts` solo. Es una brecha declarada en el C3; no hay modelo (D7).
 */
import { Container, getContainer } from '@cloudflare/containers'
import { atiende } from './puerta.ts'

const PASAN = ['ACCESS_EQUIPO', 'ACCESS_AUD', 'MESA_EXPERTOS', 'MESA_LABORATORIO', 'MESA_TOKENS', 'MESA_ALMACEN', 'MESA_S3_ENDPOINT', 'MESA_S3_BUCKET', 'MESA_S3_REGION', 'MESA_S3_LLAVE', 'MESA_S3_SECRETO', 'MESA_RETENCION_DIAS']

export class Laboratorio extends Container {
  defaultPort = 8080
  // Sin sesiones, se duerme: no se paga, y al despertar el laboratorio sintético se vuelve a sembrar.
  sleepAfter = '30m'

  constructor(ctx, env) {
    super(ctx, env)
    this.envVars = Object.fromEntries(PASAN.filter((k) => env[k]).map((k) => [k, env[k]]))
  }
}

const puerta = {
  fetch(req, env) {
    return atiende(req, env, (r) => getContainer(env.LABORATORIO, 'laboratorio').fetch(r))
  },
}
export default puerta
