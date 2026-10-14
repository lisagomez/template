/**
 * Exportes SUCIOS de dos herramientas de tickets, generados desde el corpus: «MesaUno» (estilo
 * ServiceNow, CSV con fechas locales sin zona) para Andina, y «TicketeraDos» (estilo Jira, JSON
 * aplanado con fechas con zona) para Boreal. La suciedad es deliberada y está CONTADA en `verdad`
 * para que la prueba sepa qué tiene que salir: duplicados, tickets de prueba, filas sin cliente,
 * prioridades fuera de vocabulario y nombres de personas en el asignado.
 */
import { azar } from './aleatorio.js'
import type { CorpusLab, IncidenciaLab } from './corpus.js'

export interface Exporte {
  readonly herramienta: 'mesauno' | 'ticketerados'
  readonly consultora: string
  readonly columnas: readonly string[]
  readonly filas: ReadonlyArray<Readonly<Record<string, string>>>
  readonly verdad: {
    readonly duplicadas: readonly number[]
    readonly deprueba: readonly number[]
    readonly sinCliente: readonly number[]
    readonly prioridadRara: readonly number[]
  }
}

const ASIGNADOS = ['Laura Méndez Ruiz', 'Óscar Villalobos', 'Paola Ibarra', 'Héctor Salinas']
const MODULO_MESA: Readonly<Record<string, readonly string[]>> = {
  FI: ['Finanzas', 'Contabilidad', 'fi-gl'], MM: ['Materiales', 'Compras'], SD: ['Ventas', 'Facturacion'],
  HCM: ['Nómina', 'Recursos Humanos'], BASIS: ['Basis'], 'FI-LOC': ['Facturación electrónica', 'CFDI'], ABAP: ['Desarrollo'],
}
const PRIORIDAD_MESA: Readonly<Record<string, string>> = { P1: '1 - Critical', P2: '2 - High', P3: '3 - Moderate', P4: '4 - Low' }
const PRIORIDAD_TICKETERA: Readonly<Record<string, string>> = { P1: 'Highest', P2: 'High', P3: 'Medium', P4: 'Low' }

const local = (iso: string, desfaseMin: number): string => new Date(Date.parse(iso) + desfaseMin * 60_000).toISOString().slice(0, 19).replace('T', ' ')
const resuelta = (i: IncidenciaLab): string | null => [...i.eventos].reverse().find((e) => e.tipo === 'RESUELTA')?.fecha ?? null
const nombreCliente = (c: CorpusLab, id: string): string => `${c.clientes.find((x) => x.id === id)?.nombre ?? id} S.A. de C.V.`

function filaMesa(c: CorpusLab, i: IncidenciaLab, n: number, a: ReturnType<typeof azar>): Record<string, string> {
  const r = resuelta(i)
  return {
    number: `INC${String(100000 + n)}`, company: nombreCliente(c, i.cliente), short_description: i.titulo, description: i.descripcion,
    priority: PRIORIDAD_MESA[i.prioridad]!, state: r ? 'Resolved' : 'In Progress', sys_created_on: local(i.creada, -360),
    resolved_at: r ? local(r, -360) : '', u_sap_module: a.elige(MODULO_MESA[i.modulo ?? 'BASIS'] ?? ['Basis']),
    u_sap_system: i.sistema === 'S4HANA' ? 'S4H 2023' : 'ECC6', assigned_to: a.elige(ASIGNADOS), u_transaction: '',
  }
}

function filaTicketera(c: CorpusLab, i: IncidenciaLab, n: number, a: ReturnType<typeof azar>): Record<string, string> {
  const r = resuelta(i)
  const conZona = (iso: string) => new Date(Date.parse(iso) - 360 * 60_000).toISOString().replace('Z', '-0600').replace(/\.\d{3}/, '.000')
  return {
    key: `BOR-${n}`, 'fields.customfield_cliente': nombreCliente(c, i.cliente), 'fields.summary': i.titulo, 'fields.description': i.descripcion,
    'fields.priority.name': PRIORIDAD_TICKETERA[i.prioridad]!, 'fields.status.name': r ? 'Done' : 'In Progress',
    'fields.created': conZona(i.creada), 'fields.resolutiondate': r ? conZona(r) : '',
    'fields.labels': `sap-${(i.modulo ?? 'basis').toLowerCase()}`, 'fields.customfield_sistema': i.sistema === 'S4HANA' ? 'S/4HANA' : 'ECC 6.0',
    'fields.assignee.displayName': a.elige(ASIGNADOS), 'fields.customfield_tcode': '',
  }
}

/** Genera el exporte sucio de una consultora (Andina → MesaUno, Boreal → TicketeraDos). */
export function exporteSucio(c: CorpusLab, consultora: 'andina' | 'boreal', semilla = 404): Exporte {
  const a = azar(semilla)
  const mesa = consultora === 'andina'
  const fuente = c.incidencias.filter((i) => i.consultora === consultora && !i.conDatosPersonales)
  const filas: Array<Record<string, string>> = []
  const verdad = { duplicadas: [] as number[], deprueba: [] as number[], sinCliente: [] as number[], prioridadRara: [] as number[] }
  fuente.forEach((i, n) => {
    const f = mesa ? filaMesa(c, i, n, a) : filaTicketera(c, i, n, a)
    const cli = mesa ? 'company' : 'fields.customfield_cliente'
    const pri = mesa ? 'priority' : 'fields.priority.name'
    if (a.prob(0.02)) { f[cli] = ''; verdad.sinCliente.push(filas.length) }
    else if (a.prob(0.02)) { f[pri] = a.elige(['Urgentísimo', 'Alta-ish', '???']); verdad.prioridadRara.push(filas.length) }
    filas.push(f)
    if (a.prob(0.03)) { filas.push({ ...f }); verdad.duplicadas.push(filas.length - 1) }
    if (a.prob(0.015)) {
      const t = mesa ? filaMesa(c, i, n + 90000, a) : filaTicketera(c, i, n + 90000, a)
      t[mesa ? 'short_description' : 'fields.summary'] = 'PRUEBA - no atender'
      filas.push(t); verdad.deprueba.push(filas.length - 1)
    }
  })
  return { herramienta: mesa ? 'mesauno' : 'ticketerados', consultora, columnas: Object.keys(filas[0] ?? {}), filas, verdad }
}
