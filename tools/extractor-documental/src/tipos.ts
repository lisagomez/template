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

/**
 * De donde salio un dato. NO es metadato de adorno: decide como se trata.
 *
 * Un campo de `codigo` llega con confianza 1 porque un QR decodifica o no decodifica — no hay
 * 0,87. Sin esta marca, un campo de codigo y uno de OCR con confianza alta son indistinguibles, y
 * el campo de codigo **se saltaria la cola de revision** por el mero hecho de venir de un
 * decodificador determinista. Que es justo lo contrario de lo que conviene: decodificar bien no
 * dice nada sobre si el contenido es cierto (§2.11 del SDD).
 *
 * `xml` existe por el mismo argumento, aplicado a la tercera fuente: un XML analiza o no analiza,
 * asi que sus campos llegan tambien con confianza 1.
 *
 * QUE HACE LA MARCA, medido y no supuesto. Exime al campo de exigir region, porque un XML no tiene
 * coordenadas que citar. Marcado `ocr` y sin region, ese mismo campo NO se auto-valida; marcado
 * `xml`, si. O sea que la marca es lo que PERMITE promover un comprobante entero sin que nadie lo
 * mire, no lo que lo impide. (Una version anterior de este comentario afirmaba lo contrario; lo
 * desmintio la corrida `node banco/cli.mjs xml`, que es para lo que existe el banco.)
 *
 * Y esta bien que sea asi **para el dato**: no hay lectura que revisar, es una transcripcion.
 * Exigirle region seria mandarlo a la cola por una razon que no existe, y una cola llena de cosas
 * que no hay que decidir deja de leerse.
 *
 * Lo que la marca NO dice, y conviene tener presente: confianza 1 aqui significa **el XML dice
 * esto**, jamas **esto es cierto**. Lo segundo depende del sello, que el lector declara SIEMPRE
 * como no verificado — un comprobante inventado analiza igual de limpio. Lo que cierra ese hueco
 * no es la marca: es cotejar contra una segunda fuente (`corroboracion.ts`), y eso lo cablea el
 * proyecto porque depende de que segunda fuente tenga.
 */
export type Procedencia = 'ocr' | 'codigo' | 'humano' | 'xml'

/**
 * Que clase de cosa es lo que se leyo. Cambia la IDENTIDAD, y por tanto si se deduplica.
 *
 *   documento → un fichero con campos. Dos veces el mismo fichero es el mismo documento.
 *   etiqueta  → un item de inventario. Identidad por GTIN + lote + serie.
 *   evento    → un HECHO con hora y lugar. Escanear la misma guia dos veces son DOS eventos.
 *
 * Meter las tres en la misma regla de idempotencia es como se pierden eventos de trazabilidad en
 * silencio (§2.9 del SDD).
 */
export type ClaseDeFuente = 'documento' | 'etiqueta' | 'evento'

/**
 * Como se compara un valor contra un catalogo.
 *
 *   texto         → nombres de gente y de empresas: se resuelven por PARECIDO.
 *   identificador → GTIN, SSCC, RFC, guia: se resuelven por IGUALDAD EXACTA, jamas por parecido.
 *
 * Dos GTIN que difieren en un digito son productos distintos y se parecen un 95%. Emparejar
 * identificadores por similitud es como se mete stock en el SKU equivocado.
 */
export type FormatoDeCampo = 'texto' | 'identificador'

/** Un dato extraido, con su confianza y su origen. */
export interface CampoExtraido {
  clave: string
  valor: string
  /** 0 a 1. Quien la use tiene que comparar contra un umbral explicito, nunca contra un default. */
  confianza: number
  procedencia: Procedencia
  /** Por defecto se trata como `texto`. Marcarlo `identificador` PROHIBE la comparacion difusa. */
  formato?: FormatoDeCampo
  /**
   * Region del documento de la que salio.
   *
   * Opcional **solo** porque un escaner HID no produce ninguna: teclea una cadena y no hay imagen
   * que recortar. Para todo lo que venga de una imagen sigue siendo obligatoria de hecho — un dato
   * de OCR sin region no se puede auditar despues, que es la regla que sostiene la trazabilidad
   * del dato.
   */
  region?: Region
}

export interface PaginaExtraida {
  indice: number
  markdown: string
  campos: CampoExtraido[]
}

/**
 * Que clase de fichero entro.
 *
 * `xml` no es "otro formato de documento": es el documento FISCAL, mientras que el PDF de la misma
 * factura es su representacion impresa. De ahi salen datos exactos sin motor de por medio, asi que
 * el camino que sigue dentro de la herramienta no es el mismo.
 */
export type TipoDeArchivo = 'pdf' | 'imagen' | 'xml'

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
