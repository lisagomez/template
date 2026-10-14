/**
 * El CORTE semántico: los valores que produjo MetricFlow, tal cual (en el producto, la tabla
 * `ss_metrica`; en el laboratorio, `semantica/corte.json`). Es lo ÚNICO de donde una superficie saca
 * una métrica: aquí no se suma, no se promedia y no se divide nada. Quién lee qué sigue la misma regla
 * que la RLS de `ss_metrica`: el laboratorio, agregados; la consultora, lo suyo y lo de sus clientes;
 * el cliente, solo lo suyo y solo lo que la métrica declara visible al cliente.
 */

export type Alcance = 'total' | 'tamano' | 'consultora' | 'cliente'

export interface MetricaDelCatalogo {
  readonly nombre: string
  readonly etiqueta: string
  readonly descripcion: string
  readonly tipo: string
  readonly unidad: string | null
  readonly visibleAlCliente: boolean
  readonly etapa: string | null
  readonly supuestos: string | null
  readonly auxiliar: boolean
}

export interface FilaDelCorte {
  readonly metrica: string
  /** `AAAA-MM`. */
  readonly periodo: string
  readonly alcance: Alcance
  readonly tamano: string | null
  readonly consultora: string | null
  readonly cliente: string | null
  readonly etapa: string | null
  /** `null` = sin dato en ese periodo (p. ej., sin SLA medido): nunca un cero inventado. */
  readonly valor: number | null
  /**
   * D14: si el laboratorio ve este agregado. Lo decide quien genera el corte (`semantica/grupo-minimo.ts`; en la base,
   * `ss_priv.grupo_visible_al_laboratorio`), no la superficie. Sin la marca, no lo ve.
   */
  readonly visibleAlLaboratorio?: boolean
}

export interface Corte {
  /** La huella de las entradas: dos cortes con la misma versión salieron de los mismos datos. */
  readonly version: string
  readonly corte: string
  readonly generadoCon: Readonly<Record<string, string>>
  readonly metricas: readonly MetricaDelCatalogo[]
  readonly filas: readonly FilaDelCorte[]
}

/** Quién pregunta. El N2 y el N3 traen su organización; el N1 es el laboratorio. */
export type Lector =
  | { readonly nivel: 'N1' }
  | { readonly nivel: 'N2'; readonly consultora: string }
  | { readonly nivel: 'N3'; readonly consultora: string; readonly cliente: string }

export interface Consulta {
  readonly metrica: string
  readonly periodo: string
  readonly alcance: Alcance
  readonly tamano?: string
  readonly consultora?: string
  readonly cliente?: string
  readonly etapa?: string
}

export interface Lectura {
  readonly valor: number | null
  readonly metrica: MetricaDelCatalogo
  /** De dónde sale el número: lo que cita una pantalla o el chat. */
  readonly fuente: string
  /** D14: el laboratorio no ve el agregado de un grupo chico; el valor es null por eso, no porque falte. */
  readonly suprimida?: boolean
}

export class SinAcceso extends Error {
  constructor(motivo: string) { super(motivo); this.name = 'SinAcceso' }
}

/** ¿Puede este lector ver esta fila? La misma regla que `ss_metrica_lee`. */
export function puedeVer(l: Lector, f: Pick<FilaDelCorte, 'alcance' | 'consultora' | 'cliente'>, m: MetricaDelCatalogo): boolean {
  if (l.nivel === 'N1') return f.alcance !== 'cliente'
  if (l.nivel === 'N2') return (f.alcance === 'consultora' || f.alcance === 'cliente') && f.consultora === l.consultora
  return f.alcance === 'cliente' && f.cliente === l.cliente && m.visibleAlCliente
}

/** D14: cuántos clientes tiene que tener un grupo para que el laboratorio vea su agregado. */
export const GRUPO_MINIMO = 3
/** D14: un agregado que el laboratorio no ve porque su grupo es chico (la marca la pone quien genera el corte). */
const suprimidaAlLaboratorio = (l: Lector, f: Pick<FilaDelCorte, 'alcance' | 'visibleAlLaboratorio'>) =>
  l.nivel === 'N1' && f.alcance !== 'cliente' && f.visibleAlLaboratorio !== true

/** Lee UN valor del corte. Si la métrica no existe o el lector no la puede ver, lo dice; no inventa. */
export function leeMetrica(corte: Corte, lector: Lector, q: Consulta): Lectura {
  const metrica = corte.metricas.find((m) => m.nombre === q.metrica)
  if (!metrica) throw new SinAcceso(`la métrica «${q.metrica}» no está en el catálogo de la capa semántica`)
  const fila = corte.filas.find((f) => f.metrica === q.metrica && f.periodo === q.periodo && f.alcance === q.alcance
    && f.tamano === (q.tamano ?? null) && f.consultora === (q.consultora ?? (q.alcance === 'cliente' ? f.consultora : null))
    && f.cliente === (q.cliente ?? null) && f.etapa === (q.etapa ?? null))
  const destino = fila ?? { alcance: q.alcance, consultora: q.consultora ?? null, cliente: q.cliente ?? null }
  if (!puedeVer(lector, destino, metrica)) throw new SinAcceso(`${lector.nivel} no ve «${q.metrica}» con alcance ${q.alcance}`)
  const fuente = `capa semántica · ${q.metrica} · ${q.periodo} · ${q.alcance}${q.cliente ? `:${q.cliente}` : q.consultora ? `:${q.consultora}` : q.tamano ? `:${q.tamano}` : ''}${q.etapa ? ` · etapa ${q.etapa}` : ''} · versión ${corte.version.replace(/^sha256:/, '').slice(0, 12)}`
  if (fila && suprimidaAlLaboratorio(lector, fila)) {
    return { valor: null, metrica, suprimida: true, fuente: `${fuente} · suprimido para el laboratorio (D14): su grupo tiene menos de ${GRUPO_MINIMO} clientes, o se despejaría restando` }
  }
  return { valor: fila?.valor ?? null, metrica, fuente }
}

/** Las filas que un lector puede ver de una métrica (para series y tablas), sin transformarlas. */
export function filasVisibles(corte: Corte, lector: Lector, metrica: string): readonly FilaDelCorte[] {
  const m = corte.metricas.find((x) => x.nombre === metrica)
  if (!m) return []
  return corte.filas.filter((f) => f.metrica === metrica && puedeVer(lector, f, m) && !suprimidaAlLaboratorio(lector, f))
}
