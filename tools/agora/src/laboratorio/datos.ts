/**
 * Los datos FICTICIOS del laboratorio: Distribuidora Golfo Norte (la empresa del prototipo) y una segunda
 * organización, Comercializadora Bajío, que existe para probar que nada cruza de una a otra. Ninguna persona,
 * empresa, RFC, UUID ni monto es real. Los valores del prototipo son ejemplo, no decisiones.
 */
import { uid } from './ids.js'

export const HOY_DEL_PROTOTIPO = '2026-10-26'

export const ORGS = [
  { id: uid('org:golfo-norte'), slug: 'golfo-norte', nombre: 'Distribuidora Golfo Norte', umbral: 100000, topeOrg: 8000 },
  { id: uid('org:bajio'), slug: 'bajio', nombre: 'Comercializadora Bajío', umbral: 50000, topeOrg: 2000 },
] as const
export const GOLFO = ORGS[0].id
export const BAJIO = ORGS[1].id

export interface Nodo { clave: string; org: string; tipo: 'workspace' | 'dominio' | 'categoria'; padre?: string; slug: string; nombre: string; inicio?: string; fin?: string }

export const NODOS: Nodo[] = [
  { clave: 'mty', org: GOLFO, tipo: 'workspace', slug: 'expansion-monterrey-2027', nombre: 'Expansión Monterrey 2027', inicio: '2026-09-01', fin: '2027-01-29' },
  { clave: 'com', org: GOLFO, tipo: 'dominio', padre: 'mty', slug: 'comercial', nombre: 'Comercial' },
  { clave: 'pipeline', org: GOLFO, tipo: 'categoria', padre: 'com', slug: 'pipeline', nombre: 'Pipeline' },
  { clave: 'campanas', org: GOLFO, tipo: 'categoria', padre: 'com', slug: 'campanas', nombre: 'Campañas' },
  { clave: 'ops', org: GOLFO, tipo: 'dominio', padre: 'mty', slug: 'operaciones', nombre: 'Operaciones' },
  { clave: 'logistica', org: GOLFO, tipo: 'categoria', padre: 'ops', slug: 'logistica', nombre: 'Logística' },
  { clave: 'compras', org: GOLFO, tipo: 'categoria', padre: 'ops', slug: 'compras', nombre: 'Compras' },
  { clave: 'fin', org: GOLFO, tipo: 'dominio', padre: 'mty', slug: 'finanzas', nombre: 'Finanzas' },
  { clave: 'presupuesto', org: GOLFO, tipo: 'categoria', padre: 'fin', slug: 'presupuesto', nombre: 'Presupuesto' },
  { clave: 'q4', org: GOLFO, tipo: 'workspace', slug: 'operacion-q4-2026', nombre: 'Operación Q4 2026', inicio: '2026-10-01', fin: '2026-12-31' },
  { clave: 'ops2', org: GOLFO, tipo: 'dominio', padre: 'q4', slug: 'operaciones', nombre: 'Operaciones' },
  { clave: 'inventario', org: GOLFO, tipo: 'categoria', padre: 'ops2', slug: 'inventario', nombre: 'Inventario' },
  { clave: 'fin2', org: GOLFO, tipo: 'dominio', padre: 'q4', slug: 'finanzas', nombre: 'Finanzas' },
  { clave: 'cierre', org: GOLFO, tipo: 'categoria', padre: 'fin2', slug: 'cierre-anual', nombre: 'Cierre anual' },
  // La otra organización: lo mínimo para probar el aislamiento (y que tenga dinero propio que no debe verse).
  { clave: 'bj', org: BAJIO, tipo: 'workspace', slug: 'temporada-2027', nombre: 'Temporada 2027', inicio: '2026-10-01', fin: '2027-03-31' },
  { clave: 'bj-ven', org: BAJIO, tipo: 'dominio', padre: 'bj', slug: 'ventas', nombre: 'Ventas' },
  { clave: 'bj-ruta', org: BAJIO, tipo: 'categoria', padre: 'bj-ven', slug: 'rutas', nombre: 'Rutas' },
]
export const nodo = (clave: string): string => uid(`nodo:${clave}`)

export interface Persona { clave: string; org: string; nombre: string; ini: string; titulo: string; roles: Array<[rol: string, alcance: string | null]> }

export const PERSONAS: Persona[] = [
  { clave: 'paula', org: GOLFO, nombre: 'Paula Herrera', ini: 'PH', titulo: 'Propietaria', roles: [['propietario', null]] },
  { clave: 'luis', org: GOLFO, nombre: 'Luis Ortega', ini: 'LO', titulo: 'Administrador', roles: [['administrador', null]] },
  { clave: 'daniel', org: GOLFO, nombre: 'Daniel Ruiz', ini: 'DR', titulo: 'Aprobador · Comercial', roles: [['aprobador', 'com']] },
  { clave: 'mariana', org: GOLFO, nombre: 'Mariana Treviño', ini: 'MT', titulo: 'Aprobadora de Finanzas (montos de toda la organización)', roles: [['finanzas', null], ['aprobador', 'fin'], ['aprobador', 'fin2']] },
  { clave: 'jorge', org: GOLFO, nombre: 'Jorge Salinas', ini: 'JS', titulo: 'Editor · Operaciones', roles: [['editor', 'ops'], ['editor', 'ops2']] },
  { clave: 'ana', org: GOLFO, nombre: 'Ana Cantú', ini: 'AC', titulo: 'Colaboradora · Comercial', roles: [['colaborador', 'com']] },
  { clave: 'roberto', org: GOLFO, nombre: 'Roberto Garza', ini: 'RG', titulo: 'Lector', roles: [['lector', null]] },
  { clave: 'sofia', org: GOLFO, nombre: 'Sofía Leal', ini: 'SL', titulo: 'Contadora (departamento contable)', roles: [['contabilidad', null]] },
  { clave: 'carla', org: BAJIO, nombre: 'Carla Ibarra', ini: 'CI', titulo: 'Propietaria', roles: [['propietario', null], ['finanzas', null]] },
  { clave: 'tomas', org: BAJIO, nombre: 'Tomás Rangel', ini: 'TR', titulo: 'Editor · Ventas', roles: [['editor', 'bj-ven']] },
]
export const persona = (clave: string): string => uid(`persona:${clave}`)

export interface Agente {
  clave: string; org: string; nombre: string; ini: string; origen: 'interno' | 'externo'; responsable: string
  rol: 'coordinador' | 'supervisor' | 'analista' | 'especialista' | 'observador' | 'vigia'; autonomia: 'A0' | 'A1' | 'A2' | 'A3'
  estado: 'solicitado' | 'en_revision' | 'prueba' | 'aprobado' | 'suspendido' | 'revocado'; version: number; vence: string
  alcance: Array<[nodo: string, skills: string[]]>; topes: [mensajesHora: number, propuestasDia: number, gastoMes: number]
  sinModelo?: boolean; url?: string; kid?: string; descripcion: string; firmas: string[]
}

export const AGENTES: Agente[] = [
  { clave: 'coordinador', org: GOLFO, nombre: 'Coordinador de planeación', ini: 'CP', origen: 'interno', responsable: 'Golfo Norte (casa)', rol: 'coordinador', autonomia: 'A2',
    estado: 'aprobado', version: 4, vence: '2027-03-31', alcance: [['mty', ['planear', 'reprogramar', 'asignar']], ['q4', ['planear', 'reprogramar', 'asignar']]], topes: [600, 80, 3000],
    descripcion: 'Despliega planes y propone ajustes; nunca aprueba.', firmas: ['paula', 'luis'] },
  { clave: 'supervisor', org: GOLFO, nombre: 'Supervisor de reglas', ini: 'SR', origen: 'interno', responsable: 'Golfo Norte (casa)', rol: 'supervisor', autonomia: 'A0',
    estado: 'aprobado', version: 2, vence: '2027-03-31', alcance: [['mty', ['validar']], ['q4', ['validar']]], topes: [2000, 0, 0], sinModelo: true,
    descripcion: 'Valida reglas de forma determinista, sin modelo. Dice cuál falló.', firmas: ['paula', 'luis'] },
  { clave: 'supervisor-financiero', org: GOLFO, nombre: 'Supervisor financiero', ini: 'SF', origen: 'interno', responsable: 'Golfo Norte (Finanzas)', rol: 'supervisor', autonomia: 'A0',
    estado: 'aprobado', version: 1, vence: '2027-03-31', alcance: [['mty', ['validar_montos']], ['q4', ['validar_montos']]], topes: [2000, 0, 0], sinModelo: true,
    descripcion: 'Valida montos contra presupuesto, umbral y evidencia, sin modelo. Nunca aprueba.', firmas: ['paula', 'mariana'] },
  { clave: 'analista', org: GOLFO, nombre: 'Analista de métricas', ini: 'AB', origen: 'interno', responsable: 'Golfo Norte (casa)', rol: 'analista', autonomia: 'A1',
    estado: 'aprobado', version: 1, vence: '2027-03-31', alcance: [['mty', ['reporte', 'escenarios']], ['q4', ['reporte', 'escenarios']]], topes: [120, 20, 800],
    descripcion: 'Propone análisis y escenarios con las cifras ya calculadas, nunca las cifras.', firmas: ['paula', 'mariana'] },
  { clave: 'vigia', org: GOLFO, nombre: 'Vigía', ini: 'VG', origen: 'interno', responsable: 'Golfo Norte (casa)', rol: 'vigia', autonomia: 'A1',
    estado: 'aprobado', version: 1, vence: '2027-03-31', alcance: [['mty', ['vigilar']], ['q4', ['vigilar']]], topes: [2000, 10, 0], sinModelo: true,
    descripcion: 'Sigue fechas, recordatorios y topes; avisa al 80 %; suspende al agente cuya tarjeta cambió de huella.', firmas: ['paula', 'luis'] },
  { clave: 'medios-norte', org: GOLFO, nombre: 'Medios Norte', ini: 'MN', origen: 'externo', responsable: 'Medios Norte, S.A. de C.V. (ficticia)', rol: 'especialista', autonomia: 'A1',
    estado: 'aprobado', version: 3, vence: '2027-01-31', alcance: [['campanas', ['proponer_campana', 'reporte_roas']]], topes: [60, 10, 300],
    url: 'https://agentes.medios-norte.example/.well-known/agent-card.json', kid: 'mn-2026-10', descripcion: 'Planea pautas de medios locales.', firmas: ['paula', 'daniel'] },
  { clave: 'fletes-golfo', org: GOLFO, nombre: 'Fletes del Golfo', ini: 'FG', origen: 'externo', responsable: 'Fletes del Golfo (ficticia)', rol: 'especialista', autonomia: 'A1',
    estado: 'aprobado', version: 2, vence: '2027-02-28', alcance: [['logistica', ['cotizar_envio', 'proponer_ruta']]], topes: [60, 10, 300],
    url: 'https://a2a.fletes-golfo.example/.well-known/agent-card.json', kid: 'fg-2026-09', descripcion: 'Rutas y cotizaciones de reparto.', firmas: ['paula', 'luis'] },
  { clave: 'empaques-regio', org: GOLFO, nombre: 'Empaques Regio', ini: 'ER', origen: 'externo', responsable: 'Empaques Regio (ficticia)', rol: 'especialista', autonomia: 'A1',
    estado: 'suspendido', version: 1, vence: '2026-12-31', alcance: [['compras', ['cotizar', 'proponer_proveedor']]], topes: [30, 5, 100],
    url: 'https://agentes.empaques-regio.example/.well-known/agent-card.json', kid: 'er-2026-08', descripcion: 'Cotiza empaques.', firmas: ['paula', 'luis'] },
  { clave: 'fiscal-sierra', org: GOLFO, nombre: 'Despacho Fiscal Sierra', ini: 'FS', origen: 'externo', responsable: 'Despacho Fiscal Sierra (ficticio)', rol: 'observador', autonomia: 'A0',
    estado: 'en_revision', version: 1, vence: '2027-06-30', alcance: [['presupuesto', ['revisar_presupuesto']]], topes: [20, 0, 100],
    url: 'https://a2a.fiscal-sierra.example/.well-known/agent-card.json', kid: 'fs-2026-10', descripcion: 'Revisa presupuestos; solo lectura. Qué ve lo decide el C4.', firmas: ['paula'] },
  { clave: 'bj-coordinador', org: BAJIO, nombre: 'Coordinador Bajío', ini: 'CB', origen: 'interno', responsable: 'Bajío (casa)', rol: 'coordinador', autonomia: 'A1',
    estado: 'aprobado', version: 1, vence: '2027-03-31', alcance: [['bj', ['planear']]], topes: [100, 20, 500], descripcion: 'El coordinador de la otra organización.', firmas: ['carla'] },
]
export const agente = (clave: string): string => uid(`agente:${clave}`)

/** Ítems: los del prototipo (octubre en adelante) más los de septiembre, que tienen costos y entran al cierre. */
export interface Item { clave: string; cat: string; nombre: string; estado: 'todo' | 'doing' | 'review' | 'block' | 'done'; resp: string | null; prio: 'alta' | 'media' | 'baja'
  ini: string; fin: string; monto: number | null; prog: number; dep?: string; tags: string[]; grupo?: string
  /** Lo cerrado: el día en que de verdad se terminó (ficticio), para medir «a tiempo» contra la fecha comprometida. */
  real?: string }

export const ITEMS: Item[] = [
  { clave: 'it-0a', cat: 'pipeline', nombre: 'Estudio de mercado de abarrotes en Monterrey', estado: 'done', real: '2026-09-24', resp: 'ana', prio: 'alta', ini: '2026-09-01', fin: '2026-09-25', monto: 15000, prog: 100, tags: ['prospección'], grupo: 'Arranque' },
  { clave: 'it-0b', cat: 'campanas', nombre: 'Estudio de audiencia en radio local', estado: 'done', real: '2026-09-29', resp: 'medios-norte', prio: 'media', ini: '2026-09-08', fin: '2026-09-26', monto: 48000, prog: 100, tags: ['medios'], grupo: 'Arranque' },
  { clave: 'it-0c', cat: 'logistica', nombre: 'Cotización de bodegas en Apodaca', estado: 'done', real: '2026-09-30', resp: 'jorge', prio: 'media', ini: '2026-09-10', fin: '2026-09-30', monto: 9000, prog: 100, tags: ['bodega'], grupo: 'Arranque' },
  { clave: 'it-1', cat: 'pipeline', nombre: 'Mapear 40 cuentas de abarrotes en San Nicolás', estado: 'doing', resp: 'ana', prio: 'alta', ini: '2026-10-12', fin: '2026-10-30', monto: 18000, prog: 55, tags: ['prospección'] },
  { clave: 'it-2', cat: 'pipeline', nombre: 'Visitas a 12 cadenas regionales', estado: 'todo', resp: 'daniel', prio: 'media', ini: '2026-11-02', fin: '2026-11-20', monto: 35000, prog: 0, dep: 'it-1', tags: ['visitas'] },
  { clave: 'it-3', cat: 'pipeline', nombre: 'Propuesta para Súper Cumbres', estado: 'todo', resp: 'daniel', prio: 'alta', ini: '2026-11-23', fin: '2026-11-27', monto: 8000, prog: 0, dep: 'it-2', tags: ['visitas'] },
  { clave: 'it-4', cat: 'pipeline', nombre: 'Lista de precios zona norte', estado: 'done', real: '2026-10-14', resp: 'ana', prio: 'media', ini: '2026-10-01', fin: '2026-10-15', monto: 5000, prog: 100, tags: ['prospección'] },
  { clave: 'it-5', cat: 'campanas', nombre: 'Campaña de lanzamiento en radio local', estado: 'doing', resp: 'medios-norte', prio: 'alta', ini: '2026-10-20', fin: '2026-11-10', monto: 120000, prog: 30, tags: ['medios'] },
  { clave: 'it-6', cat: 'campanas', nombre: 'Material POP para 25 tiendas', estado: 'block', resp: 'ana', prio: 'media', ini: '2026-10-29', fin: '2026-11-06', monto: 45000, prog: 10, dep: 'it-10', tags: ['tiendas'] },
  { clave: 'it-7', cat: 'logistica', nombre: 'Ruta de reparto Apodaca–Escobedo', estado: 'doing', resp: 'fletes-golfo', prio: 'alta', ini: '2026-10-19', fin: '2026-11-03', monto: 60000, prog: 40, tags: ['ruta'] },
  { clave: 'it-8', cat: 'logistica', nombre: 'Contrato de bodega en Apodaca', estado: 'review', resp: 'jorge', prio: 'alta', ini: '2026-10-05', fin: '2026-10-23', monto: 250000, prog: 80, tags: ['bodega'] },
  { clave: 'it-9', cat: 'logistica', nombre: 'Alta de 2 camiones refrigerados', estado: 'todo', resp: 'jorge', prio: 'media', ini: '2026-11-04', fin: '2026-11-25', monto: 90000, prog: 0, dep: 'it-8', tags: ['flota'] },
  { clave: 'it-10', cat: 'compras', nombre: 'Cotizar empaques biodegradables', estado: 'block', resp: 'jorge', prio: 'media', ini: '2026-10-14', fin: '2026-10-28', monto: 30000, prog: 20, tags: ['proveedores'] },
  { clave: 'it-11', cat: 'compras', nombre: 'Pedido inicial de inventario', estado: 'todo', resp: 'jorge', prio: 'alta', ini: '2026-11-09', fin: '2026-11-18', monto: 480000, prog: 0, dep: 'it-8', tags: ['inventario'] },
  { clave: 'it-12', cat: 'presupuesto', nombre: 'Presupuesto de apertura Q1', estado: 'doing', resp: 'mariana', prio: 'alta', ini: '2026-10-13', fin: '2026-11-06', monto: null, prog: 45, tags: ['flujo'] },
  { clave: 'it-13', cat: 'presupuesto', nombre: 'Escenarios de flujo a 13 semanas', estado: 'todo', resp: 'analista', prio: 'media', ini: '2026-11-09', fin: '2026-11-13', monto: null, prog: 0, dep: 'it-12', tags: ['flujo'] },
  { clave: 'it-14', cat: 'inventario', nombre: 'Conteo cíclico de noviembre', estado: 'todo', resp: 'jorge', prio: 'media', ini: '2026-11-03', fin: '2026-11-06', monto: 6000, prog: 0, tags: ['inventario'] },
  { clave: 'it-15', cat: 'inventario', nombre: 'Depurar inventario sin rotación', estado: 'doing', resp: 'jorge', prio: 'baja', ini: '2026-10-20', fin: '2026-10-30', monto: null, prog: 35, tags: ['inventario'] },
  { clave: 'it-16', cat: 'cierre', nombre: 'Cierre de temporada de fin de año', estado: 'todo', resp: 'mariana', prio: 'alta', ini: '2026-12-01', fin: '2026-12-18', monto: null, prog: 0, tags: ['cierre'] },
  { clave: 'bj-1', cat: 'bj-ruta', nombre: 'Ruta Celaya–Irapuato', estado: 'doing', resp: 'tomas', prio: 'alta', ini: '2026-10-15', fin: '2026-11-15', monto: 22000, prog: 30, tags: ['ruta'] },
]
export const item = (clave: string): string => uid(`item:${clave}`)

/** Presupuesto por categoría y mes (versión 1, aprobada por Finanzas). MXN. */
export const PRESUPUESTOS: Array<[cat: string, periodo: string, importe: number]> = [
  ['pipeline', '2026-09', 20000], ['campanas', '2026-09', 50000], ['logistica', '2026-09', 15000], ['presupuesto', '2026-09', 5000],
  ['pipeline', '2026-10', 30000], ['campanas', '2026-10', 20000], ['logistica', '2026-10', 300000], ['compras', '2026-10', 40000], ['presupuesto', '2026-10', 8000], ['inventario', '2026-10', 10000],
  ['pipeline', '2026-11', 60000], ['campanas', '2026-11', 180000], ['logistica', '2026-11', 170000], ['compras', '2026-11', 500000], ['presupuesto', '2026-11', 8000], ['inventario', '2026-11', 12000],
  ['cierre', '2026-12', 15000], ['pipeline', '2026-12', 30000], ['campanas', '2026-12', 60000],
  ['bj-ruta', '2026-11', 40000],
]

/** El tipo de cambio del laboratorio: FICTICIO, con su fuente declarada (la serie del FIX de Banxico) y su fecha. */
export const FUENTE_TC = { fuente: 'Banxico FIX (serie SF43718) — valor FICTICIO del laboratorio', serie: 'SF43718', url: 'https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos' }
/** Un FIX por día hábil (lo publica Banxico cada día hábil bancario; aquí los valores son FICTICIOS). */
export const TIPOS_DE_CAMBIO: Array<[fecha: string, valor: number]> = [
  ['2026-08-31', 18.4000], ['2026-09-01', 18.4316], ['2026-09-02', 18.4611], ['2026-09-03', 18.4865], ['2026-09-04', 18.5063],
  ['2026-09-07', 18.5197], ['2026-09-08', 18.5266], ['2026-09-09', 18.5274], ['2026-09-10', 18.5234], ['2026-09-11', 18.5165],
  ['2026-09-14', 18.5086], ['2026-09-15', 18.5019], ['2026-09-16', 18.4986], ['2026-09-17', 18.5003], ['2026-09-18', 18.5081],
  ['2026-09-21', 18.5225], ['2026-09-22', 18.5432], ['2026-09-23', 18.5693], ['2026-09-24', 18.5992], ['2026-09-25', 18.6310],
  ['2026-09-28', 18.6624], ['2026-09-29', 18.6914], ['2026-09-30', 18.7160], ['2026-10-01', 18.7350], ['2026-10-02', 18.7474],
  ['2026-10-05', 18.7532], ['2026-10-06', 18.7533], ['2026-10-07', 18.7487], ['2026-10-08', 18.7415], ['2026-10-09', 18.7336],
  ['2026-10-12', 18.7274], ['2026-10-13', 18.7247], ['2026-10-14', 18.7272], ['2026-10-15', 18.7360], ['2026-10-16', 18.7514],
  ['2026-10-19', 18.7730], ['2026-10-20', 18.7998], ['2026-10-21', 18.8301], ['2026-10-22', 18.8620], ['2026-10-23', 18.8932],
  ['2026-10-26', 18.9216], ['2026-10-27', 18.9455], ['2026-10-28', 18.9634],
]

/** Costos ejercidos con evidencia de septiembre (CFDI ficticios; RFC ficticios con forma válida). */
export const COSTOS_SEPTIEMBRE: Array<{ clave: string; item: string; importe: number; concepto: string; tipo: 'cfdi' | 'comprobante'; proveedor: string; rfc?: string; fecha: string }> = [
  { clave: 'c-1', item: 'it-0a', importe: 14500, concepto: 'Estudio de mercado (honorarios)', tipo: 'cfdi', proveedor: 'Investigación Regia, S.C. (ficticia)', rfc: 'IRE190312AB1', fecha: '2026-09-24' },
  { clave: 'c-2', item: 'it-0b', importe: 46400, concepto: 'Estudio de audiencia en radio', tipo: 'cfdi', proveedor: 'Medios Norte, S.A. de C.V. (ficticia)', rfc: 'MNO150101XY2', fecha: '2026-09-26' },
  { clave: 'c-3', item: 'it-0c', importe: 8700, concepto: 'Visitas técnicas a bodegas', tipo: 'comprobante', proveedor: 'Viáticos del equipo', fecha: '2026-09-30' },
]

/** El catálogo de cuentas de ejemplo y sus plantillas: CONFIGURACIÓN que revisa el contador (Anexo 24, RMF 2024). */
export const ANEXO = 'Anexo 24 RMF 2024 (DOF 22-01-2024): verificar contra el vigente antes de producción'
export const CUENTAS: Array<[codigo: string, nombre: string, naturaleza: 'deudora' | 'acreedora', agrupador: string]> = [
  ['102-001', 'Bancos nacionales', 'deudora', '102.01'],
  ['201-001', 'Proveedores nacionales', 'acreedora', '201.01'],
  ['205-002', 'Acreedores diversos nacionales', 'acreedora', '205.02'],
  ['205-003', 'Acreedores diversos extranjeros (proveedores de modelo)', 'acreedora', '205.03'],
  ['602-038', 'Honorarios a personas morales (ventas)', 'deudora', '602.38'],
  ['602-061', 'Propaganda y publicidad', 'deudora', '602.61'],
  ['602-072', 'Fletes y acarreos', 'deudora', '602.72'],
  ['602-084', 'Otros gastos de venta', 'deudora', '602.84'],
  ['603-082', 'Otros gastos de administración', 'deudora', '603.82'],
  ['603-083', 'Servicios de modelos de IA (gasto de agentes)', 'deudora', '603.82'],
]
export const PLANTILLAS: Array<[origen: 'cfdi' | 'comprobante' | 'gasto_modelo', categoria: string | null, cargo: string, abono: string]> = [
  ['cfdi', null, '603-082', '201-001'],
  ['cfdi', 'pipeline', '602-038', '201-001'],
  ['cfdi', 'campanas', '602-061', '201-001'],
  ['cfdi', 'logistica', '602-072', '201-001'],
  ['comprobante', null, '603-082', '205-002'],
  ['comprobante', 'pipeline', '602-084', '205-002'],
  ['comprobante', 'logistica', '602-072', '205-002'],
  ['gasto_modelo', null, '603-083', '205-003'],
]

/** La matriz de aprobación de ejemplo (diseño, «matriz de privilegios»): ranuras de firma por clase y condición. */
export const MATRIZ: Array<[clase: string, condicion: string, firmas: string[][]]> = [
  ['editar', 'siempre', [['propietario', 'aprobador', 'editor']]],
  ['crear_item', 'siempre', [['propietario', 'aprobador', 'editor']]],
  ['crear_item', 'monto_hasta_umbral', [['propietario', 'aprobador', 'finanzas']]],
  ['crear_item', 'monto_sobre_umbral', [['finanzas']]],
  ['mover_fecha', 'siempre', [['propietario', 'aprobador', 'editor']]],
  ['reprogramar', 'siempre', [['propietario', 'aprobador', 'editor']]],
  ['asignar', 'siempre', [['propietario', 'aprobador', 'editor']]],
  ['asignar_externo', 'siempre', [['propietario', 'aprobador']]],
  ['cambiar_monto', 'monto_hasta_umbral', [['propietario', 'aprobador', 'finanzas']]],
  ['cambiar_monto', 'monto_sobre_umbral', [['finanzas']]],
  ['presupuesto', 'siempre', [['finanzas']]],
  ['presupuesto', 'monto_hasta_umbral', [['finanzas']]],
  ['presupuesto', 'monto_sobre_umbral', [['finanzas']]],
  ['tope_gasto', 'siempre', [['propietario'], ['finanzas']]],
  ['tope_gasto', 'monto_hasta_umbral', [['propietario'], ['finanzas']]],
  ['tope_cuota', 'siempre', [['propietario']]],
  ['tope_cuota', 'monto_hasta_umbral', [['propietario']]],
]

export const COLUMNAS: Array<[clave: string, nombre: string, tipo: string, config: Record<string, unknown>]> = [
  ['nombre', 'Ítem', 'texto', { max: 200 }],
  ['estado', 'Estado', 'estado', { opciones: ['todo', 'doing', 'review', 'block', 'done'], listo_exige_dependencias: true }],
  ['responsable', 'Responsable', 'persona', { insignias: ['humano', 'interno', 'externo'], externo_pide_aprobador: true }],
  ['prioridad', 'Prioridad', 'prioridad', { opciones: ['alta', 'media', 'baja'], alerta_dias: 3 }],
  ['cronograma', 'Cronograma', 'cronograma', { mover_propone_sucesores: true }],
  ['fin', 'Fecha', 'fecha', { dias_habiles: true, no_antes_de_predecesores: true }],
  ['monto', 'Monto', 'moneda', { moneda: 'MXN', tope: 'presupuesto de la categoría', sobre_umbral: 'finanzas' }],
  ['progreso', 'Progreso', 'progreso', { min: 0, max: 100, cien_propone_listo: true }],
  ['dependencia', 'Depende de', 'dependencia', { sin_ciclos: true }],
  ['etiquetas', 'Etiquetas', 'etiquetas', { catalogo: ['prospección', 'visitas', 'medios', 'tiendas', 'ruta', 'bodega', 'flota', 'proveedores', 'inventario', 'flujo', 'cierre', 'permisos'] }],
  ['vinculo', 'Vínculo', 'vinculo', { dominios: ['golfo-norte.example', 'drive.example', 'docs.example'] }],
  ['archivo', 'Archivo', 'archivo', { tipos: ['application/pdf', 'image/png', 'image/jpeg', 'text/xml'], max_bytes: 10485760 }],
  ['hilo', 'Hilo', 'hilo', {}],
  ['por_ejercer', 'Por ejercer', 'formula', { formula: 'comprometido − ejercido', solo_lectura: true }],
]
