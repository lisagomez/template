/**
 * El contrato A2A del analista de producto (PRP-009, SDD §3.10): su Agent Card, el ciclo de estados
 * de sus tareas y el catalogo cerrado de rechazos, con los TIPOS del SDK instalado. Es contrato, no
 * superficie: NINGUNA ruta lo sirve, y `prueba-analista.ts` lo comprueba enumerando `src/app`.
 * Servirlo es la fase 2 del PRP-009, con gate humano (C3, C4, C8 y la decision de flujo de datos).
 *
 * Una capacidad y no tres (`add-a2a`: una skill por Card para empezar). Separar la deteccion de la
 * propuesta dejaria pedir propuestas sin ver los grados de evidencia en que se apoyan, y eso es la
 * regla de oro: un consumidor tiene que poder distinguir un dolor citado y verificado de una
 * hipotesis. Perder esa marca convierte una conjetura en un hallazgo en casa de otro.
 *
 * Lo que la Card NO dice, a proposito: que modelo corre detras, que medidores hay ni donde escribe.
 */
import { A2A_PROTOCOL_VERSION, TaskState } from '@a2a-js/sdk'
import type { AgentCard, AgentSkill } from '@a2a-js/sdk'

export const NOMBRE_DE_LA_CLAVE = 'clave-api'
export const CABECERA_DE_LA_CLAVE = 'X-API-Key'

const ENTRADAS = ['text/plain']
export const SALIDAS = ['text/markdown', 'application/json']

const analisis: AgentSkill = {
  id: 'analisis-de-producto',
  name: 'Encontrar donde duele un repositorio y proponer productos',
  description:
    'Repositorio → dolores con su cita y su GRADO de evidencia (medida, registrada o declarada), hipotesis aparte, ' +
    'casos de uso por categoria y propuestas product first que recombinan lo que ya existe. Un dolor sin cita ' +
    'verificada es una hipotesis, nunca un hallazgo.',
  tags: ['producto', 'descubrimiento', 'evidencia', 'casos-de-uso'],
  examples: [
    'Donde duele este repositorio y que producto lo resolveria?',
    'Analiza solo los activos del extractor documental y su puente',
  ],
  inputModes: ENTRADAS,
  outputModes: SALIDAS,
  securityRequirements: [],
}

/**
 * `base` es donde se serviria (fase 2), por ejemplo `http://app:3000` en la red interna. La clave
 * no es opcional: el rol lee el repo privado entero, asi que una Card sin autenticacion no se
 * publica nunca. OAuth2, OIDC, mTLS y multi-partner quedan como residual explicito (spec 005 RF-9).
 */
export function tarjetaDelAnalista(base: string): AgentCard {
  const raiz = base.replace(/\/$/, '')
  return {
    name: 'analista-producto',
    description:
      'Dolores con evidencia citada y propuestas de producto sobre un repositorio. Solo lectura. ' +
      'No esta servido: ofrecerlo, incluso en la red interna, es gate humano.',
    supportedInterfaces: [{ url: `${raiz}/a2a/analista`, protocolBinding: 'JSONRPC', tenant: '', protocolVersion: A2A_PROTOCOL_VERSION }],
    provider: undefined,
    version: '0.1.0',
    capabilities: { streaming: false, pushNotifications: false, extensions: [] },
    securitySchemes: {
      [NOMBRE_DE_LA_CLAVE]: {
        scheme: {
          $case: 'apiKeySecurityScheme',
          value: { description: 'Clave de API por cabecera. OAuth2, OIDC, mTLS y multi-partner: residual explicito.', location: 'header', name: CABECERA_DE_LA_CLAVE },
        },
      },
    },
    securityRequirements: [{ schemes: { [NOMBRE_DE_LA_CLAVE]: { list: [] } } }],
    defaultInputModes: ENTRADAS,
    defaultOutputModes: SALIDAS,
    skills: [analisis],
    signatures: [],
  }
}

export const ESTADO_INICIAL = TaskState.TASK_STATE_SUBMITTED

/**
 * Las transiciones validas. Las hipotesis NO llevan a INPUT_REQUIRED: una hipotesis es un
 * resultado, y si cada una interrumpiera la tarea ninguna corrida terminaria. INPUT_REQUIRED es
 * solo para lo que impide terminar (por ejemplo, un alcance que nombra un activo que no existe).
 * REJECTED solo desde SUBMITTED: se rechaza antes de trabajar, por el catalogo de abajo.
 */
export const TRANSICIONES: ReadonlyMap<TaskState, readonly TaskState[]> = new Map([
  [TaskState.TASK_STATE_SUBMITTED, [TaskState.TASK_STATE_WORKING, TaskState.TASK_STATE_REJECTED]],
  [TaskState.TASK_STATE_WORKING, [TaskState.TASK_STATE_COMPLETED, TaskState.TASK_STATE_INPUT_REQUIRED, TaskState.TASK_STATE_FAILED]],
  [TaskState.TASK_STATE_INPUT_REQUIRED, [TaskState.TASK_STATE_WORKING, TaskState.TASK_STATE_CANCELED]],
  [TaskState.TASK_STATE_COMPLETED, []],
  [TaskState.TASK_STATE_FAILED, []],
  [TaskState.TASK_STATE_REJECTED, []],
  [TaskState.TASK_STATE_CANCELED, []],
])

export function puedePasar(de: TaskState, a: TaskState): boolean {
  return TRANSICIONES.get(de)?.includes(a) ?? false
}

/**
 * Catalogo CERRADO de rechazos: la razon publica de un REJECTED sale de aqui y de ningun otro
 * sitio. No nombra rutas, ramas ni archivos del interior.
 */
export const MOTIVOS_DE_RECHAZO = {
  'escritura-fuera-del-informe': 'El analista solo escribe su informe: no modifica el repositorio.',
  'exponer-el-rol': 'Servir o exponer el analista es una decision humana con gate, no una peticion.',
  'lectura-vedada': 'Hay fuentes que el analista no lee: el corpus de pruebas ciegas y los secretos.',
  'veredicto-sin-evidencia': 'El analista no afirma un dolor sin la cita que lo prueba.',
} as const

export type MotivoDeRechazo = keyof typeof MOTIVOS_DE_RECHAZO
