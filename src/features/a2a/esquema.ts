/**
 * La frontera: lo que el servicio OCR devuelve se valida con Zod ANTES de salir por A2A (spec 010
 * RF-14). El nucleo del extractor no importa Zod (cero dependencias); aqui si, porque esto ya es la
 * app. Un JSON que «encaja por casualidad» se para aqui, no en casa del consumidor.
 */
import { z } from 'zod'

const region = z.object({ pagina: z.number().int().min(0), x: z.number().min(0).max(1), y: z.number().min(0).max(1), ancho: z.number().min(0).max(1), alto: z.number().min(0).max(1) })

export const campoConEvidencia = z.object({
  clave: z.string().min(1),
  valor: z.string(),
  confianza: z.number().min(0).max(1),
  procedencia: z.enum(['ocr', 'codigo', 'humano', 'xml']),
  formato: z.enum(['texto', 'identificador']).optional(),
  region: region.optional(),
  evidencia: z.enum(['codigo', 'exacto', 'corroboracion', 'checksum', 'motor']),
  revisionHumana: z.boolean(),
})

export const documentoDelServicio = z.object({
  documentoId: z.string(),
  nombre: z.string(),
  ruta: z.enum(['capa-cero', 'xml', 'motor', 'ninguna']),
  motivo: z.string(),
  paginas: z.number().int().min(0),
  campos: z.array(campoConEvidencia),
  evidencia: z.object({ codigo: z.number(), exacto: z.number(), corroboracion: z.number(), checksum: z.number(), motor: z.number() }),
  revisionHumana: z.number().int().min(0),
  estructura: z.object({
    clase: z.string(),
    sinClase: z.boolean(),
    campos: z.record(z.string(), z.array(campoConEvidencia)),
    faltantes: z.array(z.string()),
    noPrevistos: z.array(campoConEvidencia),
  }),
  identificadoresInvalidos: z.array(z.object({ clave: z.string(), valor: z.string(), procedencia: z.string(), pagina: z.number(), motivo: z.string() })),
  tiempos: z.object({ codigos: z.number(), motor: z.number(), respaldo: z.number(), total: z.number() }),
})

export type DocumentoDelServicio = z.infer<typeof documentoDelServicio>

/** Lo que viaja en el artefacto A2A: la regla de oro es que confianza, evidencia y revisionHumana lleguen intactas (RF-21). */
export interface ResultadoDeExtraccion {
  readonly ruta: DocumentoDelServicio['ruta']
  readonly motivo: string
  readonly clase: string
  readonly sinClase: boolean
  readonly campos: DocumentoDelServicio['campos']
  readonly faltantes: readonly string[]
  readonly identificadoresInvalidos: DocumentoDelServicio['identificadoresInvalidos']
  readonly evidencia: DocumentoDelServicio['evidencia']
  readonly revisionHumana: number
  readonly tiempos: DocumentoDelServicio['tiempos']
  /** Siempre `false`: leer bien no es autenticar. Se dice en cada respuesta, no solo en la Card. */
  readonly selloVerificado: false
}

/**
 * El `motivo` del servicio se compone dentro del perimetro con mensajes de excepcion, avisos y
 * lineas de stderr del motor: sirve al operador y NO puede salir tal cual (revision de opacidad,
 * 2026-09-13: un PNG truncado devolvia «el proceso local salio con codigo 2 — extractor: zonas por
 * defecto…»). Aqui se traduce a un catalogo CERRADO por prefijo; lo que no encaja sale generico.
 */
const MOTIVOS_PUBLICOS: readonly (readonly [RegExp, string])[] = [
  [/^los bytes no son PDF, imagen ni XML/, 'el documento no es un PDF, una imagen ni un XML'],
  [/^PDF sin capa de texto/, 'el PDF no trae texto ni imagen extraible'],
  [/^XML que no es un CFDI 4\.0/, 'el XML no es un CFDI 4.0'],
  [/^PDF con capa de texto/, 'PDF con texto nativo, leido sin motor'],
  [/^CFDI 4\.0 leido.*sin lector/, 'CFDI 4.0 leido exacto; hay complementos sin lector, declarados'],
  [/^CFDI 4\.0 leido/, 'CFDI 4.0 leido exacto'],
  [/^PDF escaneado/, 'PDF escaneado, leido por el motor'],
  [/^imagen /, 'imagen leida por el motor'],
]

export function motivoPublico(motivo: string, ruta: DocumentoDelServicio['ruta']): string {
  for (const [forma, publico] of MOTIVOS_PUBLICOS) if (forma.test(motivo)) return publico
  return ruta === 'ninguna' ? 'no se pudo leer el documento' : 'documento leido'
}

export function aResultado(d: DocumentoDelServicio): ResultadoDeExtraccion {
  return {
    ruta: d.ruta, motivo: motivoPublico(d.motivo, d.ruta), clase: d.estructura.clase, sinClase: d.estructura.sinClase,
    campos: d.campos, faltantes: d.estructura.faltantes, identificadoresInvalidos: d.identificadoresInvalidos,
    evidencia: d.evidencia, revisionHumana: d.revisionHumana, tiempos: d.tiempos, selloVerificado: false,
  }
}
