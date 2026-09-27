/**
 * Contrato del conocimiento (spec 004, PRP-005 Fase 1).
 *
 * Los nombres de campo son los del seed de Hermes (`veredicto_base`, `fuente_cita`,
 * `vigente_desde`…) a propósito: este paquete es la fuente única de la que Hermes leerá
 * después, y su `gen_seed_sql.py` tiene que seguir entendiéndolo. Lo que se AÑADE es lo que
 * decidió la Fase 0 del PRP-005:
 *
 * - **vocabulario por dimensión** (RF-1): cada dimensión declara sus veredictos, y una regla
 *   con un veredicto ajeno no siembra. En Hermes el enum era global y el gate aceptaba
 *   `deducible` en una regla regulatoria.
 * - **cita por dominio** (RF-5): un dominio de fuente pública cita, uno de reglas internas no.
 * - **solo se añade** (RF-14): no existe `_bajas`. Retirar una regla es cerrar su
 *   `vigente_hasta`, y cambiar un significado es una regla nueva que declara `reemplaza`.
 *
 * El esquema valida la forma; `validaConocimiento` (valida.ts) valida lo que cruza reglas.
 */
import { z } from 'zod'

/** Clave de regla, categoría o dominio: `MX-LISR-28-XXXII`, `DRONES_DELIVERY`, `MX-fiscal`. */
export const Clave = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'clave con caracteres no válidos')

/** Fecha ISO `YYYY-MM-DD`. La vigencia se compara como texto, que en este formato ordena bien. */
export const Fecha = z.iso.date()

/** Un veredicto es vocabulario cerrado, nunca texto libre: `deducible`, `no_permitido`, `dudoso`… */
export const TextoVeredicto = z.string().regex(/^[a-z][a-z0-9_]*$/, 'veredicto en minúsculas y sin espacios')

/** Keyword normalizada: en minúsculas, sin espacios en los extremos. El motor casa sin acentos. */
const Keyword = z
  .string()
  .min(1)
  .refine((k) => k === k.toLowerCase().trim(), 'keyword en minúsculas y sin espacios extremos')

const TextoNoVacio = z.string().trim().min(1)

export const Jurisdiccion = z.strictObject({ codigo: z.string().regex(/^[A-Z]{2}$/), nombre: TextoNoVacio })

export const Dimension = z.strictObject({
  codigo: Clave,
  nombre: TextoNoVacio,
  /** Los únicos veredictos que una regla de esta dimensión puede dictar (RF-1). */
  vocabulario: z
    .array(TextoVeredicto)
    .min(1)
    .refine((v) => new Set(v).size === v.length, 'vocabulario con veredictos repetidos'),
})

export const Categoria = z.strictObject({
  clave: Clave,
  nombre: TextoNoVacio,
  descripcion: z.string().optional(),
  keywords: z.array(Keyword).min(1),
  /** Si el texto casa alguna, la categoría se descarta aunque casen sus keywords (RF-7). */
  exclusiones: z.array(Keyword).default([]),
})

/** Valores de un parámetro de norma. Un número exige `verificar: true` (cotejo contra fuente). */
const Parametros = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))

export const Impacto = z.strictObject({
  /** `null` = aplica a todas las categorías del ámbito (requisitos generales). */
  categoria: Clave.nullable(),
  /** Explícito siempre: `GENERAL` es comodín; el adaptador de Hermes rellena su default. */
  regimen: TextoNoVacio,
  /** `null` = la regla no dicta veredicto, solo aporta requisitos y banderas. */
  veredicto_base: TextoVeredicto.nullable(),
  tope_monto: z.number().nonnegative().nullable().optional(),
  tope_pct: z.number().min(0).max(100).nullable().optional(),
  requisitos: z.array(TextoNoVacio),
  banderas: z.array(TextoNoVacio),
  parametros: Parametros,
})

export const Regla = z.strictObject({
  clave: Clave,
  jurisdiccion: z.string().regex(/^[A-Z]{2}$/),
  dimension: Clave,
  titulo: TextoNoVacio,
  texto_resumen: TextoNoVacio,
  fuente_cita: TextoNoVacio,
  fuente_url: z.string().regex(/^https?:\/\/\S+$/, 'fuente_url http(s)'),
  vigente_desde: Fecha,
  /** `null` = sigue vigente. Retirar una regla es poner esta fecha, no borrarla (RF-14). */
  vigente_hasta: Fecha.nullable(),
  /** Clave de la versión anterior de este mismo significado, que debe estar cerrada. */
  reemplaza: Clave.optional(),
  impactos: z.array(Impacto).min(1),
})

export const Dominio = z.strictObject({
  clave: Clave,
  nombre: TextoNoVacio,
  jurisdiccion: z.string().regex(/^[A-Z]{2}$/),
  dimension: Clave,
  /** `publica`: la respuesta cita la fuente. `interna`: no la expone (RF-5). */
  cita: z.enum(['publica', 'interna']),
  /** Fecha de corte del conocimiento de este dominio: va visible en la respuesta. */
  corte: Fecha,
  categorias: z.array(Clave).min(1),
})

export const Conocimiento = z.strictObject({
  /** Semver del paquete: parche = cita · menor = regla nueva · mayor = significado o vocabulario. */
  version: z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/),
  /** De dónde sale el conocimiento, con qué textos y en qué fecha (la procedencia de Hermes). */
  procedencia: TextoNoVacio,
  jurisdicciones: z.array(Jurisdiccion).min(1),
  dimensiones: z.array(Dimension).min(1),
  dominios: z.array(Dominio).min(1),
  categorias: z.array(Categoria).min(1),
  reglas: z.array(Regla).min(1),
})

export type Conocimiento = z.infer<typeof Conocimiento>
export type Regla = z.infer<typeof Regla>
export type Impacto = z.infer<typeof Impacto>
export type Categoria = z.infer<typeof Categoria>
export type Dominio = z.infer<typeof Dominio>
export type Dimension = z.infer<typeof Dimension>

// --- El resultado de evaluar (lo que devolverá el motor de la Fase 3) --------------------------

/**
 * Por qué salió este veredicto. RF-6: «sin regla», «conflicto» y «la regla dice dudoso» son
 * TIPOS distintos, no textos distintos del mismo `dudoso` como en Hermes.
 */
export const Motivo = z.enum(['regla', 'sin_regla', 'conflicto', 'tope_excedido'])

export const Fuente = z.strictObject({
  clave: Clave,
  cita: TextoNoVacio,
  url: z.string(),
  vigencia: z.strictObject({ desde: Fecha, hasta: Fecha.nullable() }),
})

export const ConceptoEvaluado = z
  .strictObject({
    descripcion: TextoNoVacio,
    categoria: Clave.nullable(),
    motivo: Motivo,
    /** `null` solo cuando no hay regla: el sistema no afirma nada (fail-safe). */
    veredicto: TextoVeredicto.nullable(),
    razon: TextoNoVacio,
    fuente: Fuente.nullable(),
    banderas: z.array(z.string()),
    checklist: z.array(z.string()),
  })
  .refine((c) => (c.motivo === 'sin_regla') === (c.veredicto === null), {
    message: 'sin_regla ⇔ sin veredicto: un fail-safe nunca lleva la forma de una respuesta real',
  })

export const Resultado = z.strictObject({
  contexto: z.strictObject({
    jurisdiccion: z.string(),
    dimension: Clave,
    regimen: TextoNoVacio,
    fecha: Fecha,
    /** RF-13: el hecho no traía fecha y se juzgó con la de la consulta. La respuesta lo dice. */
    fecha_supuesta: z.boolean(),
  }),
  conceptos: z.array(ConceptoEvaluado).min(1),
  /** Fecha de corte del conocimiento usado: siempre visible. */
  corte: Fecha,
  disclaimer: TextoNoVacio,
})

/**
 * Cuando no se puede calcular un veredicto. NO es un Resultado: no trae nada con forma de
 * respuesta, y por eso no puede confundirse con «no hay regla» (duda del parser, TAR-10).
 */
export const FalloSinVeredicto = z.strictObject({
  tipo: z.enum(['conocimiento_no_disponible', 'parser_no_disponible']),
  detalle: TextoNoVacio,
})

export type Resultado = z.infer<typeof Resultado>
export type ConceptoEvaluado = z.infer<typeof ConceptoEvaluado>
export type FalloSinVeredicto = z.infer<typeof FalloSinVeredicto>
