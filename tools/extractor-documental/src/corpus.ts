/**
 * Inferencia de modelo desde el CORPUS, no desde un documento.
 *
 * `proponeModelo` proyecta una plantilla a una tabla y deja las relaciones en manos del revisor.
 * Este modulo mira N extracciones a la vez y descubre lo que solo se ve en conjunto: un RFC que
 * aparece en trescientas facturas es una entidad con existencia propia; un folio que nunca se
 * repite es un atributo del documento; el nombre que siempre acompana al mismo RFC es un atributo
 * de esa entidad y no de la factura.
 *
 * TRES REGLAS que gobiernan todo lo de abajo, y ninguna lleva umbral:
 *
 * 1. Solo un campo marcado `formato: 'identificador'` funda una entidad, y solo si su valor se
 *    repite EXACTAMENTE en dos documentos distintos. Un identificador se compara por igualdad,
 *    nunca por parecido: un parecido funda una entidad que no existe.
 * 2. Un campo es atributo de una entidad si depende funcionalmente de su identificador en TODOS
 *    los grupos donde se pudo comprobar. Si depende en unos y en otros no, es una DUDA que se
 *    declara con los documentos que la rompen, y el campo se queda en el documento.
 * 3. Nada se aplica. La salida es una `PropuestaDeModelo`: pasa por la misma barrera `revisaSql`
 *    y por el mismo lienzo que la propuesta de una plantilla, sin tocar ninguno de los dos.
 *
 * Contra la entidad alucinada: un motor de vision que inventa un valor no lo inventa dos veces
 * igual en dos documentos distintos. Lo que SI copia igual es una plantilla —un `...` literal—,
 * y por eso los valores que no parecen un identificador se declaran y no fundan nada.
 *
 * Nucleo puro: sin red, sin base, sin navegador. Lo vigila `pruebas/contrato.ts`.
 */
import type { CampoExtraido } from './tipos.js'
import type { DescriptorDeEsquema, TablaDescrita } from './esquema.js'
import type { ColumnaPropuesta, EntidadPropuesta, RelacionPropuesta, PropuestaDeModelo } from './modelo.js'
import { aNombreDeColumna, tipoSqlDe, revisaSql, sqlDeEntidad, CABECERA } from './modelo.js'
import { fusionaCopias } from './corpus-copias.js'
import type { Fusion } from './corpus-copias.js'

export interface OpcionesDeInferencia {
  /**
   * La clave que identifica al DOCUMENTO (el `uuid` de un CFDI). Los documentos que comparten su
   * valor son copias del mismo —XML y PDF, dos escaneos— y se funden antes de inferir. Sin esto,
   * un documento que llega dos veces funda una entidad con su propio folio.
   */
  readonly claveDeDocumento?: string
}

export interface DocumentoDelCorpus {
  /** Unico dentro del corpus. Dos documentos con el mismo id son un error de quien llama. */
  readonly documentoId: string
  /** Que ES el documento (factura, pago, minuta). Cada tipo se propone como su propia tabla. */
  readonly tipoDocumento: string
  readonly campos: readonly CampoExtraido[]
}

export interface AtributoInferido {
  readonly clave: string
  readonly columna: string
  readonly tipo: string
  /** Grupos de dos o mas documentos en los que se comprobo la dependencia. La evidencia, contada. */
  readonly grupos: number
}

export interface EntidadInferida {
  readonly tabla: string
  /** La clave de campo que la funda. */
  readonly clave: string
  /** Documentos en los que aparece, y valores distintos que toma. */
  readonly documentos: number
  readonly distintos: number
  /**
   * Valores que aparecen en UN solo documento. No fundan nada por si mismos; se cuentan porque un
   * identificador mal leido por el motor (una O por un 0) no se repite y acaba aqui, y un recuento
   * alto de unicos en un corpus que deberia repetirse es la senal de que algo se leyo mal.
   */
  readonly unicos: number
  /**
   * Otras claves identificadoras que particionan el corpus IGUAL que esta (dependencia funcional
   * en las dos direcciones): un certificado que siempre va con el mismo RFC y al reves. Son la
   * misma cosa vista dos veces, y entran como atributos en vez de fundar una entidad cada una.
   */
  readonly equivalentes: readonly string[]
  readonly atributos: readonly AtributoInferido[]
  /** Tipos de documento desde los que se la referencia. */
  readonly desde: readonly string[]
}

export interface DudaDeInferencia {
  readonly sobre: string
  readonly motivo: string
  readonly documentos: readonly string[]
}

export interface DocumentoContado {
  readonly documentoId: string
  readonly tipoDocumento: string
  readonly campos: number
  /** Si era copia de otro documento (misma `claveDeDocumento`), en cual quedo fundido. */
  readonly fusionadoEn?: string
}

export interface InferenciaDeCorpus {
  readonly propuesta: PropuestaDeModelo
  readonly entidades: readonly EntidadInferida[]
  readonly dudas: readonly DudaDeInferencia[]
  /** Todos los documentos que entraron, con cuantos campos aportaron. Ninguno desaparece. */
  readonly documentos: readonly DocumentoContado[]
  readonly fusiones: readonly Fusion[]
}

// --- Indice de valores ---------------------------------------------------------------------------

/** Por clave, por documento, los valores DISTINTOS que toma (ya recortados, sin vacios). */
type Indice = Map<string, Map<string, string[]>>

function indexa(corpus: readonly DocumentoDelCorpus[]): Indice {
  const indice: Indice = new Map()
  for (const documento of corpus) {
    for (const campo of documento.campos) {
      const valor = campo.valor.trim()
      if (valor.length === 0) continue
      let porDocumento = indice.get(campo.clave)
      if (porDocumento === undefined) indice.set(campo.clave, (porDocumento = new Map()))
      const valores = porDocumento.get(documento.documentoId) ?? []
      if (!valores.includes(valor)) valores.push(valor)
      porDocumento.set(documento.documentoId, valores)
    }
  }
  return indice
}

/** Las claves que ALGUN documento marco como identificador. Marcarla una vez basta para probarla. */
function clavesIdentificadoras(corpus: readonly DocumentoDelCorpus[]): Set<string> {
  const salida = new Set<string>()
  for (const d of corpus) for (const c of d.campos) if (c.formato === 'identificador') salida.add(c.clave)
  return salida
}

/**
 * Un valor de plantilla copiada no es un identificador. Es la unica heuristica del modulo, y es
 * de forma, no de umbral: sin letra ni digito no identifica nada.
 */
const PARECE_IDENTIFICADOR = /[\p{L}\p{N}]/u

/** Valor → documentos en los que aparece. Solo cuenta el primer valor de cada documento. */
function agrupa(porDocumento: Map<string, string[]>): Map<string, string[]> {
  const grupos = new Map<string, string[]>()
  for (const [documentoId, valores] of porDocumento) {
    const valor = valores[0]
    if (!PARECE_IDENTIFICADOR.test(valor)) continue
    grupos.set(valor, [...(grupos.get(valor) ?? []), documentoId])
  }
  return grupos
}

// --- Entidades y dependencias --------------------------------------------------------------------

const PREFIJOS = /^(rfc|id|clave|codigo|numero|num|no|curp|cuenta)_/
const SUFIJOS = /_(id|rfc|clave|codigo)$/

/** `rfc_emisor` → `emisor`, `proveedor_id` → `proveedor`. Si no queda nada, la clave tal cual. */
export function nombreDeEntidad(clave: string): string {
  const base = aNombreDeColumna(clave)
  const recortado = base.replace(PREFIJOS, '').replace(SUFIJOS, '')
  return recortado.length > 0 ? recortado : base
}

interface Candidata {
  readonly clave: string
  readonly grupos: Map<string, string[]>
  readonly documentos: number
  readonly multivaluados: readonly string[]
  readonly equivalentes: string[]
}

/** Regla 1: identificador que se repite EXACTAMENTE en dos documentos distintos. */
function candidatas(indice: Indice, identificadoras: ReadonlySet<string>): Candidata[] {
  const salida: Candidata[] = []
  for (const clave of identificadoras) {
    const porDocumento = indice.get(clave)
    if (porDocumento === undefined) continue
    const grupos = agrupa(porDocumento)
    const seRepite = [...grupos.values()].some((docs) => docs.length >= 2)
    if (!seRepite) continue
    const multivaluados = [...porDocumento].filter(([, v]) => v.length > 1).map(([id]) => id)
    salida.push({ clave, grupos, documentos: porDocumento.size, multivaluados, equivalentes: [] })
  }
  return fusionaEquivalentes(salida, indice)
}

const sostiene = (grupos: Map<string, string[]>, porDocumento: Map<string, string[]> | undefined): boolean => {
  if (porDocumento === undefined) return false
  const { sostenida, rotaEn } = dependencia(grupos, porDocumento)
  return sostenida > 0 && rotaEn.length === 0
}

/**
 * Dos identificadores que se determinan mutuamente son la misma entidad vista dos veces: el
 * numero de certificado siempre va con el mismo RFC y ese RFC siempre con ese certificado. Se
 * queda el que aparece en mas documentos; el otro pasa a ser su atributo. Sin esto, cada clave
 * del sello de un CFDI fundaba su propia tabla (medido en la primera corrida).
 */
function fusionaEquivalentes(candidatas: Candidata[], indice: Indice): Candidata[] {
  const ordenadas = [...candidatas].sort((a, b) => b.documentos - a.documentos)
  const salida: Candidata[] = []
  for (const candidata of ordenadas) {
    const dueno = salida.find(
      (d) => sostiene(d.grupos, indice.get(candidata.clave)) && sostiene(candidata.grupos, indice.get(d.clave)),
    )
    if (dueno === undefined) salida.push(candidata)
    else dueno.equivalentes.push(candidata.clave)
  }
  return salida
}

interface Dependencia {
  readonly sostenida: number
  readonly rotaEn: readonly string[]
}

/**
 * Regla 2: ¿C depende funcionalmente de K? Se mira grupo a grupo (documentos con el mismo valor de
 * K) y se cuenta en cuantos se COMPROBO —dos o mas documentos con C presente— y en cuales se rompe.
 */
function dependencia(grupos: Map<string, string[]>, porDocumento: Map<string, string[]>): Dependencia {
  let sostenida = 0
  const rotaEn: string[] = []
  for (const documentos of grupos.values()) {
    const presentes = documentos.filter((id) => porDocumento.has(id))
    if (presentes.length < 2) continue
    const valores = new Set(presentes.flatMap((id) => porDocumento.get(id) ?? []))
    if (valores.size === 1) sostenida++
    else rotaEn.push(...presentes)
  }
  return { sostenida, rotaEn }
}

function esConstante(porDocumento: Map<string, string[]>): boolean {
  if (porDocumento.size < 2) return false
  return new Set([...porDocumento.values()].flat()).size === 1
}

function muestrasDe(porDocumento: Map<string, string[]> | undefined): string[] {
  return porDocumento === undefined ? [] : [...porDocumento.values()].flat()
}

interface EntidadResuelta {
  readonly inferida: EntidadInferida
  readonly candidata: Candidata
  /** Claves que se mudan del documento a la entidad (la propia y sus atributos). */
  readonly absorbidas: ReadonlySet<string>
}

function resuelveEntidad(
  candidata: Candidata,
  indice: Indice,
  entidades: ReadonlySet<string>,
  corpus: readonly DocumentoDelCorpus[],
  dudas: DudaDeInferencia[],
): EntidadResuelta {
  const atributos: AtributoInferido[] = []
  const absorbidas = new Set<string>([candidata.clave])
  for (const [clave, porDocumento] of indice) {
    if (clave === candidata.clave || entidades.has(clave) || esConstante(porDocumento)) continue
    const { sostenida, rotaEn } = dependencia(candidata.grupos, porDocumento)
    if (sostenida === 0) continue
    if (rotaEn.length > 0) {
      dudas.push({
        sobre: `${clave} → ${nombreDeEntidad(candidata.clave)}`,
        motivo:
          `"${clave}" acompana siempre al mismo "${candidata.clave}" en ${sostenida} grupo(s), pero no en ` +
          'todos: se deja en el documento hasta que alguien decida. Puede ser un dato que cambia con el ' +
          'tiempo, o un error de lectura en los documentos listados',
        documentos: rotaEn,
      })
      continue
    }
    absorbidas.add(clave)
    atributos.push({ clave, columna: aNombreDeColumna(clave), tipo: tipoSqlDe(muestrasDe(porDocumento)), grupos: sostenida })
  }
  const desde = [...new Set(corpus.filter((d) => d.campos.some((c) => c.clave === candidata.clave)).map((d) => d.tipoDocumento))]
  const inferida: EntidadInferida = {
    tabla: nombreDeEntidad(candidata.clave),
    clave: candidata.clave,
    documentos: candidata.documentos,
    distintos: candidata.grupos.size,
    unicos: [...candidata.grupos.values()].filter((docs) => docs.length === 1).length,
    equivalentes: candidata.equivalentes,
    atributos,
    desde,
  }
  return { inferida, candidata, absorbidas }
}

// --- Dudas de forma ------------------------------------------------------------------------------

function dudasDeForma(
  corpus: readonly DocumentoDelCorpus[],
  indice: Indice,
  identificadoras: ReadonlySet<string>,
  resueltas: readonly EntidadResuelta[],
): DudaDeInferencia[] {
  const dudas: DudaDeInferencia[] = []
  for (const { candidata, inferida } of resueltas) {
    if (candidata.multivaluados.length > 0) {
      dudas.push({
        sobre: inferida.tabla,
        motivo:
          `"${candidata.clave}" toma varios valores dentro de un mismo documento: la relacion documento → ` +
          `${inferida.tabla} no es N:1 de manera uniforme. Se propone N:1 y se declara`,
        documentos: candidata.multivaluados,
      })
    }
    if (candidata.grupos.size === 1) {
      dudas.push({
        sobre: inferida.tabla,
        motivo:
          `"${candidata.clave}" toma UN solo valor en todo el corpus: puede ser una entidad de un miembro ` +
          'o una constante del negocio. Con mas documentos se sabra',
        documentos: [],
      })
    } else if (inferida.unicos * 2 > inferida.distintos) {
      dudas.push({
        sobre: inferida.tabla,
        motivo:
          `"${candidata.clave}": ${inferida.unicos} de ${inferida.distintos} valores aparecen en un solo documento. ` +
          'Puede ser el identificador del propio documento, y la repeticion venir de copias del mismo: si es asi, ' +
          'pasalo como `claveDeDocumento`',
        documentos: [],
      })
    }
  }
  for (const [clave, porDocumento] of indice) {
    if (identificadoras.has(clave)) continue
    const grupos = agrupa(porDocumento)
    const repetidos = [...grupos.values()].filter((docs) => docs.length >= 2)
    if (repetidos.length === 0 || resueltas.some((r) => r.absorbidas.has(clave))) continue
    dudas.push({
      sobre: clave,
      motivo:
        `"${clave}" se repite exacto entre documentos pero no esta marcado \`identificador\`: si lo es, ` +
        'marcalo y fundara una entidad; si es texto libre, la coincidencia no significa nada',
      documentos: repetidos.flat(),
    })
  }
  for (const d of corpus) {
    if (d.campos.length === 0) dudas.push({ sobre: d.documentoId, motivo: 'documento sin campos: no aporta al modelo y se declara', documentos: [d.documentoId] })
  }
  return dudas
}

// --- Proyeccion a PropuestaDeModelo --------------------------------------------------------------

function tablaDeEntidad(resuelta: EntidadResuelta, indice: Indice): EntidadPropuesta {
  const { inferida, candidata } = resuelta
  const columnas: ColumnaPropuesta[] = [
    { nombre: aNombreDeColumna(candidata.clave), tipo: tipoSqlDe(muestrasDe(indice.get(candidata.clave))), nulable: false },
    ...inferida.atributos.map((a) => ({ nombre: a.columna, tipo: a.tipo, nulable: true })),
  ]
  return { tabla: inferida.tabla, columnas }
}

function clavePrimariaDe(tabla: TablaDescrita | undefined): string {
  return tabla?.columnas.find((c) => c.esClavePrimaria)?.nombre ?? 'id'
}

function tablaDeDocumento(
  tipoDocumento: string,
  documentos: readonly DocumentoDelCorpus[],
  resueltas: readonly EntidadResuelta[],
  descriptor: DescriptorDeEsquema,
  relaciones: RelacionPropuesta[],
): EntidadPropuesta {
  const tabla = aNombreDeColumna(tipoDocumento)
  const claves = [...new Set(documentos.flatMap((d) => d.campos.map((c) => c.clave)))]
  const propio = indexa(documentos)
  const columnas: ColumnaPropuesta[] = []
  for (const clave of claves) {
    const entidad = resueltas.find((r) => r.absorbidas.has(clave))
    if (entidad === undefined) {
      columnas.push({ nombre: aNombreDeColumna(clave), tipo: tipoSqlDe(muestrasDe(propio.get(clave))), nulable: true })
      continue
    }
    if (clave !== entidad.candidata.clave) continue
    const preexistente = descriptor.tablas.find((t) => t.nombre === entidad.inferida.tabla)
    const referencia = { tabla: entidad.inferida.tabla, columna: clavePrimariaDe(preexistente) }
    columnas.push({ nombre: `${entidad.inferida.tabla}_id`, tipo: 'bigint', nulable: true, referencia })
    relaciones.push({
      desde: tabla,
      columna: `${entidad.inferida.tabla}_id`,
      hacia: referencia.tabla,
      hastaColumna: referencia.columna,
      cardinalidad: '*',
      haciaPreexistente: preexistente !== undefined,
    })
  }
  return { tabla, columnas }
}

function porTipo(corpus: readonly DocumentoDelCorpus[]): Map<string, DocumentoDelCorpus[]> {
  const salida = new Map<string, DocumentoDelCorpus[]>()
  for (const d of corpus) salida.set(d.tipoDocumento, [...(salida.get(d.tipoDocumento) ?? []), d])
  return salida
}

function exigeIdsUnicos(corpus: readonly DocumentoDelCorpus[]): void {
  const vistos = new Set<string>()
  for (const d of corpus) {
    if (vistos.has(d.documentoId)) throw new Error(`documentoId repetido en el corpus: "${d.documentoId}"`)
    vistos.add(d.documentoId)
  }
}

/**
 * Infiere el modelo del corpus entero y lo devuelve como propuesta.
 *
 * El orden del SQL importa: primero las entidades, porque las tablas de documento las referencian.
 * Lo que ya existe en el descriptor no se crea (RF-31): se referencia y se avisa.
 */
export function infiereModelo(
  entrada: readonly DocumentoDelCorpus[],
  descriptor: DescriptorDeEsquema,
  opciones: OpcionesDeInferencia = {},
): InferenciaDeCorpus {
  exigeIdsUnicos(entrada)
  const dudas: DudaDeInferencia[] = []
  const { corpus, fusiones } =
    opciones.claveDeDocumento === undefined ? { corpus: entrada, fusiones: [] } : fusionaCopias(entrada, opciones.claveDeDocumento, dudas)
  const indice = indexa(corpus)
  const identificadoras = clavesIdentificadoras(corpus)
  const candidatasDeEntidad = candidatas(indice, identificadoras)
  const clavesDeEntidad = new Set(candidatasDeEntidad.map((c) => c.clave))
  const resueltas = candidatasDeEntidad.map((c) => resuelveEntidad(c, indice, clavesDeEntidad, corpus, dudas))
  dudas.push(...dudasDeForma(corpus, indice, identificadoras, resueltas))

  const avisos: string[] = []
  const entidades: EntidadPropuesta[] = []
  const relaciones: RelacionPropuesta[] = []
  for (const resuelta of resueltas) {
    if (descriptor.tablas.some((t) => t.nombre === resuelta.inferida.tabla)) {
      avisos.push(`"${resuelta.inferida.tabla}" ya existe en tu proyecto: se referencia y no se crea (RF-31). Comprueba que sea la misma cosa`)
      continue
    }
    entidades.push(tablaDeEntidad(resuelta, indice))
  }
  for (const [tipo, documentos] of porTipo(corpus)) {
    const tabla = tablaDeDocumento(tipo, documentos, resueltas, descriptor, relaciones)
    if (descriptor.tablas.some((t) => t.nombre === tabla.tabla)) {
      avisos.push(`"${tabla.tabla}" ya existe en tu proyecto: no se propone ninguna sentencia sobre ella (RF-31)`)
      continue
    }
    entidades.push(tabla)
  }
  for (const [clave, porDocumento] of indice) {
    if (esConstante(porDocumento)) avisos.push(`"${clave}" vale lo mismo en todos los documentos: se deja en el documento, sin decidir si es constante del negocio`)
  }

  const catalogos: TablaDescrita[] = [
    ...descriptor.tablas,
    ...entidades.map((e) => ({ nombre: e.tabla, columnas: e.columnas.map((c) => ({ nombre: c.nombre, tipo: c.tipo, nulable: c.nulable })) })),
  ]
  const cuerpo = entidades.flatMap((e) => [...sqlDeEntidad(e, catalogos), ''])
  const sql = [...CABECERA, '', ...cuerpo].join('\n') + (cuerpo.length > 0 ? '' : '-- Nada que crear.\n')
  revisaSql(sql, descriptor, new Set(entidades.map((e) => e.tabla)))

  const propuesta: PropuestaDeModelo = {
    entidades,
    relaciones,
    catalogosDerivados: resueltas.map((r) => r.inferida.tabla),
    sql,
    avisos,
  }
  const fundidoEn = new Map(fusiones.flatMap((f) => f.copias.map((c) => [c, f.documentoId] as const)))
  const documentos = entrada.map((d) => {
    const destino = fundidoEn.get(d.documentoId)
    return { documentoId: d.documentoId, tipoDocumento: d.tipoDocumento, campos: d.campos.length, ...(destino === undefined ? {} : { fusionadoEn: destino }) }
  })
  return { propuesta, entidades: resueltas.map((r) => r.inferida), dudas, documentos, fusiones }
}
