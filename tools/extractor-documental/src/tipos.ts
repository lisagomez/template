/**
 * Tipos del dominio. Sin dependencias y sin nada del DOM: este archivo tiene que poder
 * importarse desde un worker, desde el navegador y desde una prueba sin navegador.
 *
 * La decision que gobierna todo lo demas: `region` es OBLIGATORIA en un campo extraido. Un
 * dato sin su coordenada de origen no se puede auditar despues, y a los seis meses nadie sabra
 * de donde salio. El markdown es para leer; la region es para citar.
 */

/**
 * Estados por los que pasa un documento.
 *
 * `revision_humana` NO es un error: es la salida normal cuando la confianza queda por debajo del
 * umbral. Tratarla como fallo es lo que empuja a subir el umbral hasta que la cola desaparece, y
 * con ella el control.
 */
export type EstadoDocumento =
  | 'pendiente'
  | 'en_cola'
  | 'procesando'
  | 'extraido'
  | 'en_revision'
  | 'revision_humana'
  | 'validado'
  | 'rechazado'
  | 'fallido'

/** Coordenadas dentro de una pagina, normalizadas a [0,1] para no depender del DPI. */
export interface Region {
  pagina: number
  x: number
  y: number
  ancho: number
  alto: number
}

/** Un dato extraido, con su confianza y su origen. Los tres campos son obligatorios a proposito. */
export interface CampoExtraido {
  clave: string
  valor: string
  /** 0 a 1. Quien la use tiene que comparar contra un umbral explicito, nunca contra un default. */
  confianza: number
  region: Region
}

export interface PaginaExtraida {
  indice: number
  markdown: string
  campos: CampoExtraido[]
}

export type TipoDeArchivo = 'pdf' | 'imagen'

export interface ArchivoEntrante {
  nombre: string
  /** Puede faltar: el navegador no siempre lo sabe al arrastrar. Por eso tambien se mira la extension. */
  tipoMime?: string
  bytes: number
}

export interface ArchivoAceptado extends ArchivoEntrante {
  aceptado: true
  tipo: TipoDeArchivo
}

export interface ArchivoRechazado extends ArchivoEntrante {
  aceptado: false
  /** En espanol y nombrando el archivo: el rechazo silencioso es como se pierden documentos. */
  motivo: string
}

export type Clasificacion = ArchivoAceptado | ArchivoRechazado

/**
 * Limites del motor configurado. Se declaran porque cambian con el adaptador: la API de Mistral
 * tope a 50 MB y 1000 paginas, y a 8 paginas cuando se piden anotaciones de documento.
 */
export interface LimitesDelMotor {
  bytesMaximos: number
  paginasMaximas: number
  /** Tope de paginas por peticion CUANDO se piden anotaciones. Obliga a trocear. */
  paginasPorAnotacion: number
}
