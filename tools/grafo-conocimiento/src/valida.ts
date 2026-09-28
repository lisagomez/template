/**
 * Validación del conocimiento completo: el esquema (contrato.ts) y lo que cruza reglas.
 *
 * Devuelve problemas TIPADOS en vez de lanzar, para poder comparar la validación de un seed
 * real contra las divergencias declaradas (pruebas/paridad/divergencias.json): lo que falla
 * tiene que ser exactamente lo que se sabe que falla, ni más ni menos.
 *
 * Lo que aquí NO se valida, y dónde vive:
 * - colisiones de keywords por contención («drones» dentro de «seguro de drones»): gate de
 *   siembra, Fase 4;
 * - que un cambio respete el historial (nada borrado ni editado en su sitio frente a la versión
 *   anterior): gate de siembra, Fase 4. Aquí solo se ve una foto, y en una foto se puede exigir
 *   la FORMA de solo-añadir (sin `_bajas`, reemplazos cerrados), no su historia.
 */
import { Conocimiento, type Impacto, type Regla } from './contrato.js'

export type TipoProblema =
  | 'esquema'
  | 'baja_por_borrado'
  | 'duplicado'
  | 'referencia_rota'
  | 'veredicto_fuera_de_vocabulario'
  | 'reemplazo_abierto'
  | 'conflicto_de_veredicto'
  | 'keyword_repetida'
  | 'monto_sin_verificar'
  | 'categoria_sin_dominio'

export interface Problema {
  tipo: TipoProblema
  /** Qué entidad falla: clave de regla, categoría, dominio o ruta del esquema. */
  clave: string
  detalle: string
}

export interface Validacion {
  ok: boolean
  conocimiento: Conocimiento | null
  problemas: Problema[]
}

export function validaConocimiento(entrada: unknown): Validacion {
  const problemas: Problema[] = []
  const limpia = retiraBajas(entrada, problemas)
  const r = Conocimiento.safeParse(limpia)
  if (!r.success) {
    for (const issue of r.error.issues) {
      problemas.push({ tipo: 'esquema', clave: issue.path.join('.') || '(raíz)', detalle: issue.message })
    }
    return { ok: false, conocimiento: null, problemas }
  }
  const c = r.data
  problemas.push(
    ...duplicados(c),
    ...referencias(c),
    ...vocabulario(c),
    ...reemplazos(c),
    ...conflictos(c),
    ...keywordsRepetidas(c),
    ...montosSinVerificar(c),
    ...categoriasSinDominio(c),
  )
  return { ok: problemas.length === 0, conocimiento: c, problemas }
}

/** `_bajas` es borrar reglas: el patrón que reescribió el pasado en Hermes (RF-14). */
function retiraBajas(entrada: unknown, problemas: Problema[]): unknown {
  if (typeof entrada !== 'object' || entrada === null || !('_bajas' in entrada)) return entrada
  const { _bajas, ...resto } = entrada as Record<string, unknown>
  for (const clave of Array.isArray(_bajas) ? _bajas : []) {
    problemas.push({
      tipo: 'baja_por_borrado',
      clave: String(clave),
      detalle: 'retirada borrándola: aquí se retira cerrando vigente_hasta, y el pasado la sigue encontrando',
    })
  }
  return resto
}

function repetidas(claves: string[]): string[] {
  const vistas = new Set<string>()
  return claves.filter((k) => (vistas.has(k) ? true : (vistas.add(k), false)))
}

function duplicados(c: Conocimiento): Problema[] {
  const grupos: [string, string[]][] = [
    ['jurisdicción', c.jurisdicciones.map((j) => j.codigo)],
    ['dimensión', c.dimensiones.map((d) => d.codigo)],
    ['dominio', c.dominios.map((d) => d.clave)],
    ['categoría', c.categorias.map((x) => x.clave)],
    ['regla', c.reglas.map((x) => x.clave)],
  ]
  return grupos.flatMap(([que, claves]) =>
    repetidas(claves).map((clave) => ({ tipo: 'duplicado' as const, clave, detalle: `${que} repetida` })),
  )
}

function referencias(c: Conocimiento): Problema[] {
  const jur = new Set(c.jurisdicciones.map((j) => j.codigo))
  const dim = new Set(c.dimensiones.map((d) => d.codigo))
  const cat = new Set(c.categorias.map((x) => x.clave))
  const reglas = new Set(c.reglas.map((x) => x.clave))
  const rota = (clave: string, detalle: string): Problema => ({ tipo: 'referencia_rota', clave, detalle })
  const out: Problema[] = []
  for (const r of c.reglas) {
    if (!jur.has(r.jurisdiccion)) out.push(rota(r.clave, `jurisdicción desconocida ${r.jurisdiccion}`))
    if (!dim.has(r.dimension)) out.push(rota(r.clave, `dimensión desconocida ${r.dimension}`))
    if (r.reemplaza && !reglas.has(r.reemplaza)) out.push(rota(r.clave, `reemplaza a ${r.reemplaza}, que no existe`))
    for (const i of r.impactos) {
      if (i.categoria !== null && !cat.has(i.categoria)) out.push(rota(r.clave, `categoría desconocida ${i.categoria}`))
    }
  }
  for (const d of c.dominios) {
    if (!jur.has(d.jurisdiccion)) out.push(rota(d.clave, `jurisdicción desconocida ${d.jurisdiccion}`))
    if (!dim.has(d.dimension)) out.push(rota(d.clave, `dimensión desconocida ${d.dimension}`))
    for (const k of d.categorias) if (!cat.has(k)) out.push(rota(d.clave, `categoría desconocida ${k}`))
  }
  return out
}

function vocabulario(c: Conocimiento): Problema[] {
  const voc = new Map(c.dimensiones.map((d) => [d.codigo, new Set(d.vocabulario)]))
  return c.reglas.flatMap((r) =>
    r.impactos
      .filter((i) => i.veredicto_base !== null && voc.has(r.dimension) && !voc.get(r.dimension)!.has(i.veredicto_base))
      .map((i) => ({
        tipo: 'veredicto_fuera_de_vocabulario' as const,
        clave: r.clave,
        detalle: `«${i.veredicto_base}» no está en el vocabulario de ${r.dimension}`,
      })),
  )
}

/** Un reemplazo deja cerrada la versión anterior antes de que empiece la nueva. */
function reemplazos(c: Conocimiento): Problema[] {
  const porClave = new Map(c.reglas.map((r) => [r.clave, r]))
  const out: Problema[] = []
  for (const r of c.reglas) {
    const anterior = r.reemplaza ? porClave.get(r.reemplaza) : undefined
    if (!anterior) continue
    if (anterior.vigente_hasta === null || anterior.vigente_hasta >= r.vigente_desde) {
      out.push({
        tipo: 'reemplazo_abierto',
        clave: r.clave,
        detalle: `reemplaza a ${anterior.clave}, que sigue vigente el ${r.vigente_desde}: vivirían las dos`,
      })
    }
  }
  return out
}

function seSolapan(a: Regla, b: Regla): boolean {
  return a.vigente_desde <= (b.vigente_hasta ?? '9999-12-31') && b.vigente_desde <= (a.vigente_hasta ?? '9999-12-31')
}

function regimenesCompatibles(a: Impacto, b: Impacto): boolean {
  return a.regimen === b.regimen || a.regimen === 'GENERAL' || b.regimen === 'GENERAL'
}

/**
 * RF-8/RF-12: dos reglas vivas a la vez que dictan veredictos distintos sobre la misma categoría
 * del mismo ámbito. El motor lo degradaría a fail-safe con bandera; aquí se caza ANTES de sembrar.
 * En Hermes lo evitaban a mano («una sola rectora por categoría»), y su gate no lo veía.
 */
function conflictos(c: Conocimiento): Problema[] {
  type Par = { regla: Regla; impacto: Impacto }
  const grupos = new Map<string, Par[]>()
  for (const regla of c.reglas) {
    for (const impacto of regla.impactos) {
      if (impacto.categoria === null || impacto.veredicto_base === null) continue
      const llave = `${regla.jurisdiccion}/${regla.dimension}/${impacto.categoria}`
      grupos.set(llave, [...(grupos.get(llave) ?? []), { regla, impacto }])
    }
  }
  const out: Problema[] = []
  for (const [llave, pares] of grupos) {
    for (let i = 0; i < pares.length; i++) {
      for (let j = i + 1; j < pares.length; j++) {
        const a = pares[i]!
        const b = pares[j]!
        if (a.impacto.veredicto_base === b.impacto.veredicto_base) continue
        if (!regimenesCompatibles(a.impacto, b.impacto) || !seSolapan(a.regla, b.regla)) continue
        out.push({
          tipo: 'conflicto_de_veredicto',
          clave: llave,
          detalle: `${a.regla.clave}=${a.impacto.veredicto_base} y ${b.regla.clave}=${b.impacto.veredicto_base} vigentes a la vez`,
        })
      }
    }
  }
  return out
}

/** La misma keyword en dos categorías hace ambigua la clasificación (el gate de Hermes ya lo cazaba). */
function keywordsRepetidas(c: Conocimiento): Problema[] {
  const categoriaDe = new Map<string, string>()
  const out: Problema[] = []
  for (const cat of c.categorias) {
    for (const kw of cat.keywords) {
      const otra = categoriaDe.get(kw)
      if (otra !== undefined && otra !== cat.clave) {
        out.push({ tipo: 'keyword_repetida', clave: kw, detalle: `en ${otra} y en ${cat.clave}` })
      } else categoriaDe.set(kw, cat.clave)
    }
  }
  return out
}

/** Un tope o umbral numérico sin `verificar: true` es una cifra que nadie cotejó contra la fuente. */
function montosSinVerificar(c: Conocimiento): Problema[] {
  return c.reglas.flatMap((r) =>
    r.impactos
      .filter((i) => {
        const numerico =
          i.tope_monto != null ||
          i.tope_pct != null ||
          Object.values(i.parametros).some((v) => typeof v === 'number')
        return numerico && i.parametros['verificar'] !== true
      })
      .map(() => ({
        tipo: 'monto_sin_verificar' as const,
        clave: r.clave,
        detalle: 'tope o umbral numérico sin parametros.verificar = true',
      })),
  )
}

/** Registrar un dominio tiene que traer todas las reglas de sus categorías (RF-15). */
function categoriasSinDominio(c: Conocimiento): Problema[] {
  const cubiertas = new Set(c.dominios.flatMap((d) => d.categorias.map((k) => `${d.jurisdiccion}/${d.dimension}/${k}`)))
  const vistas = new Set<string>()
  const out: Problema[] = []
  for (const r of c.reglas) {
    for (const i of r.impactos) {
      const llave = `${r.jurisdiccion}/${r.dimension}/${i.categoria}`
      if (i.categoria === null || cubiertas.has(llave) || vistas.has(llave)) continue
      vistas.add(llave)
      out.push({ tipo: 'categoria_sin_dominio', clave: llave, detalle: 'ningún dominio de ese ámbito la incluye' })
    }
  }
  return out
}
