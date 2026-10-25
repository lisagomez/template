/**
 * `./metricflow`: el puerto semántico sobre un MetricFlow caliente (proceso Python con el entorno pineado).
 *
 * Subpath aparte porque importarlo COMPROMETE a algo: lanzar un proceso y leer un proyecto dbt del disco. El núcleo
 * no lo importa. Sirve para cualquier proyecto dbt con capa semántica (DuckDB o Postgres con el lock de aquí):
 * Golfo Norte en el laboratorio, soporte-sap o clinica-dental como segundo catálogo.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { FallaDeCapa, type CatalogoCrudo, type ConsultaSemantica, type PuertoSemantico, type ResultadoSemantico } from '../puerto.js'
import { dirEntorno, SERVIDOR, SIN_TELEMETRIA } from './entorno.js'
import { dondeMetricFlow, ordenMetricFlow } from './filtros.js'

export { aseguraEntorno, dirEntorno, huellaLock, SIN_TELEMETRIA } from './entorno.js'
export { dondeMetricFlow, filtroMetricFlow } from './filtros.js'

export interface OpcionesMetricFlow {
  /** Directorio del proyecto dbt, con `target/` ya construido (`dbt build` o `dbt parse`). */
  readonly proyecto: string
  /** Directorio de `profiles.yml`. */
  readonly perfiles: string
  /** Variables que el perfil necesita (rutas, credenciales). Se pasan al proceso; nunca se imprimen. */
  readonly entorno?: Readonly<Record<string, string>>
  /** Python del entorno; por defecto el del lock. */
  readonly python?: string
  /** Tope por petición. */
  readonly tiempoMs?: number
  /** Ruta de `servidor_mf.py`; por defecto la del paquete (explícita si este módulo corre empaquetado). */
  readonly servidor?: string
  /**
   * Procesos en paralelo (por defecto 1). Cada uno atiende una petición a la vez; con varios, las consultas de un
   * tablero salen juntas. Solo con un perfil de SOLO LECTURA: DuckDB admite varios lectores, no varios escritores.
   */
  readonly procesos?: number
}

interface Pendiente { ok: (v: Record<string, unknown>) => void; mal: (e: Error) => void; reloj: NodeJS.Timeout }

type Pide = (cuerpo: Record<string, unknown>) => Promise<Record<string, unknown>>
interface Proceso { readonly listo: Promise<number>; readonly pide: Pide; readonly enCurso: () => number; readonly cierra: () => void }

export function puertoMetricFlow(o: OpcionesMetricFlow): PuertoSemantico & { listo: Promise<number> } {
  const procesos = Array.from({ length: Math.max(1, Math.floor(o.procesos ?? 1)) }, () => proceso(o))
  // Cada petición al proceso con menos trabajo en curso (el primero si empatan).
  const pide: Pide = (cuerpo) => procesos.reduce((a, b) => (b.enCurso() < a.enCurso() ? b : a)).pide(cuerpo)
  return {
    listo: Promise.all(procesos.map((p) => p.listo)).then((ms) => Math.max(...ms)),
    async catalogo() { return (await pide({ op: 'catalogo' })) as unknown as CatalogoCrudo },
    async valores(metrica, dimension) { return (await pide({ op: 'valores', metricas: [metrica], dimension }))['valores'] as string[] },
    async consulta(c: ConsultaSemantica) {
      const r = await pide({ op: 'consulta', metricas: c.metricas, agrupar: c.agrupar ?? [], donde: dondeMetricFlow(c), orden: ordenMetricFlow(c), limite: c.limite })
      return { columnas: r['columnas'], filas: r['filas'], sql: r['sql'] ?? null, truncada: Boolean(r['truncada']), ms: Number(r['ms']) } as ResultadoSemantico
    },
    async cierra() { for (const p of procesos) p.cierra() },
  }
}

function proceso(o: OpcionesMetricFlow): Proceso {
  const python = o.python ?? join(dirEntorno(), 'bin', 'python')
  const hijo: ChildProcessWithoutNullStreams = spawn(python, ['-I', o.servidor ?? SERVIDOR, o.proyecto, o.perfiles], {
    // Entorno MÍNIMO a propósito (sin heredar secretos del proceso): ruta, home, sin telemetría y lo que pide el perfil.
    env: { NODE_ENV: process.env['NODE_ENV'] ?? 'production', PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', ...SIN_TELEMETRIA, ...o.entorno },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const pendientes = new Map<number, Pendiente>()
  let siguiente = 1
  let errorStderr = ''
  hijo.stderr.on('data', (b: Buffer) => { errorStderr = (errorStderr + b.toString()).slice(-4000) })
  let resolverListo: (ms: number) => void = () => {}
  let rechazarListo: (e: Error) => void = () => {}
  const listo = new Promise<number>((ok, mal) => { resolverListo = ok; rechazarListo = mal })
  const muere = (e: Error) => { rechazarListo(e); for (const p of pendientes.values()) { clearTimeout(p.reloj); p.mal(e) } pendientes.clear() }
  hijo.on('error', (e) => muere(new FallaDeCapa(`no se pudo lanzar MetricFlow: ${e.message}`)))
  hijo.on('exit', (c) => muere(new FallaDeCapa(`MetricFlow terminó (código ${c}): ${errorStderr.slice(-800)}`)))
  createInterface({ input: hijo.stdout }).on('line', (linea) => {
    let m: Record<string, unknown>
    try { m = JSON.parse(linea) as Record<string, unknown> } catch { return }
    if (m['listo']) return resolverListo(Number(m['ms']))
    const p = pendientes.get(Number(m['id']))
    if (!p) return
    pendientes.delete(Number(m['id'])); clearTimeout(p.reloj)
    if (m['ok']) p.ok(m); else p.mal(new FallaDeCapa(String(m['error'] ?? 'error sin mensaje')))
  })
  // Asignadas cuenta también las que esperan a que el proceso arranque: así el reparto no las amontona en uno.
  let asignadas = 0
  const pide: Pide = async (cuerpo) => {
    asignadas++
    try {
      await listo
      const id = siguiente++
      return await new Promise((ok, mal) => {
        const reloj = setTimeout(() => { pendientes.delete(id); mal(new FallaDeCapa(`MetricFlow no respondió en ${o.tiempoMs ?? 60_000} ms`)) }, o.tiempoMs ?? 60_000)
        pendientes.set(id, { ok, mal, reloj })
        hijo.stdin.write(`${JSON.stringify({ id, ...cuerpo })}\n`)
      })
    } finally { asignadas-- }
  }
  return { listo, pide, enCurso: () => asignadas, cierra: () => { hijo.stdin.end(); hijo.kill() } }
}
