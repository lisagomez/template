/**
 * SIEMBRA sintética de la Supabase LOCAL (PRP-008): despacho, tres pymes y la casa. Entra con CUENTAS y SESIONES reales
 * (llave anónima), así que pasa por las mismas políticas RLS, huellas y puertas que la app: si una regla está mal,
 * la siembra revienta. Sin LLM: lo que redactan los agentes se genera después, en la app o en el laboratorio.
 * Las contraseñas (aleatorias) quedan en supabase/.temp/sgi-cuentas.json (ignorado por git, permisos 600); nunca se
 * imprimen. Requiere la base recién reiniciada: npm run sgi:local:reinicia
 */
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CATALOGO } from '../../tools/sistema-integrado/dist/catalogo/index.js';
import { preguntasDiagnostico, type Respuesta } from '../../tools/sistema-integrado/dist/motor/index.js';
import { AGENTES } from '../../tools/sistema-integrado/dist/agentes/index.js';
import { altaCuenta, entornoLocal, type Cuenta } from './local.ts';

const Q15 = 'iso-9001:2015+a1:2024', Q26 = 'iso-9001:2026', IA = 'iso-iec-42001:2023';
const e = entornoLocal();
const falla = (paso: string, r: { error: { message: string } | null }) => { if (r.error) throw new Error(`siembra: ${paso}: ${r.error.message}`); };

const NOMBRES = ['consultora', 'maquinados.admin', 'maquinados.direccion', 'maquinados.produccion', 'maquinados.auditoria',
  'panificadora.admin', 'panificadora.direccion', 'clinica.admin', 'casa.admin', 'casa.direccion'] as const;
type Nombre = typeof NOMBRES[number];
const cuentas = {} as Record<Nombre, Cuenta>;
for (const n of NOMBRES) cuentas[n] = await altaCuenta(n, e, `${n.replace('.', '-')}@example.com`);
mkdirSync('supabase/.temp', { recursive: true });
writeFileSync('supabase/.temp/sgi-cuentas.json', JSON.stringify(Object.fromEntries(NOMBRES.map((n) => [n, { correo: cuentas[n].correo, clave: cuentas[n].clave }])), null, 1));
chmodSync('supabase/.temp/sgi-cuentas.json', 0o600);

async function uno<T>(paso: string, p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const r = await p; falla(paso, r); return r.data as T;
}
async function documento(c: Cuenta, org: string, proyecto: string, tipo: string, titulo: string, requisitos: string[], secciones: { titulo: string; parrafos: string[] }[]) {
  const d = await uno<{ id: string }>(`documento ${titulo}`, c.c.from('sgi_documento').insert({ organizacion_id: org, proyecto_id: proyecto, tipo, titulo, requisitos }).select('id').single());
  const v = await uno<{ id: string; huella: string }>(`versión ${titulo}`, c.c.from('sgi_documento_version').insert({ documento_id: d.id, organizacion_id: org, numero: 1, contenido: { secciones } }).select('id, huella').single());
  falla(`revisión ${titulo}`, await c.c.from('sgi_documento_version').update({ estado: 'en_revision' }).eq('id', v.id));
  return { docId: d.id, verId: v.id, huella: v.huella };
}
async function aprueba(c: Cuenta, org: string, tipo: string, objeto: string, huella: string, rol: string) {
  falla(`aprobar ${tipo}`, await c.c.from('sgi_aprobacion').insert({ organizacion_id: org, objeto_tipo: tipo, objeto_id: objeto, huella, decision: 'aprobado', rol }));
}
async function evidencia(c: Cuenta, org: string, proyecto: string, titulo: string, tipo: string, contenido: string, requisitos: string[]) {
  const ev = await uno<{ id: string; huella: string }>(`evidencia ${titulo}`, c.c.from('sgi_evidencia').insert({ organizacion_id: org, proyecto_id: proyecto, titulo, tipo, contenido }).select('id, huella').single());
  falla(`vínculo ${titulo}`, await c.c.from('sgi_evidencia_requisito').insert(requisitos.map((r) => ({ evidencia_id: ev.id, requisito_id: r, organizacion_id: org }))));
  return ev;
}
async function cierra(c: Cuenta, org: string, proyecto: string, fase: number, rol: string) {
  falla(`cerrar fase ${fase}`, await c.c.from('sgi_aprobacion').insert({ organizacion_id: org, proyecto_id: proyecto, objeto_tipo: 'cierre_fase', fase, decision: 'aprobado', rol }));
}
async function miembros(admin: SupabaseClient, org: string, lista: [Cuenta, string, string | null][]) {
  falla('membresías', await admin.from('sgi_membresia').insert(lista.map(([c, rol, puesto]) => ({ organizacion_id: org, user_id: c.id, rol, puesto }))));
}
/** Respuestas del diagnóstico, deterministas: más madurez en lo básico, casi nada en el Anexo A. */
function respuestas(ediciones: string[], usaIA: boolean, disena: boolean, madurez: number): Record<string, Respuesta> {
  const out: Record<string, Respuesta> = {};
  for (const [i, r] of preguntasDiagnostico({ ediciones: ediciones as never, usaIA, disena }).entries()) {
    const base = r.familia === 'A' ? madurez - 0.35 : r.fase <= 2 ? madurez + 0.2 : madurez;
    const x = ((i * 37) % 100) / 100;
    out[r.id] = x < base - 0.25 ? 'si' : x < base + 0.1 ? 'parcial' : x < 0.93 ? 'no' : 'no-se';
  }
  return out;
}

// ───────── Despacho del consultor ─────────
const C = cuentas.consultora;
const despacho = await uno<{ id: string }>('despacho', C.c.from('sgi_despacho').insert({
  nombre: 'Calidad Norte Consultores',
  marca: { nombre_corto: 'Calidad Norte', color_primario: '#0f766e', color_acento: '#b45309', lema: 'Sistemas que se usan, no que se archivan' },
}).select('id').single());
falla('plantillas', await C.c.from('sgi_plantilla').insert([
  { despacho_id: despacho.id, tipo: 'procedimiento', titulo: 'Control de documentos (plantilla del despacho)', contenido: { secciones: [{ titulo: 'Propósito', parrafos: ['Que la versión vigente esté donde se usa.'] }] } },
  { despacho_id: despacho.id, tipo: 'formato', titulo: 'Acta de revisión por la dirección (formato)', contenido: { secciones: [{ titulo: 'Temas', parrafos: ['Clientes · operación · proveedores, recursos y riesgos · IA'] }] } },
]));

async function pyme(admin: Cuenta, datos: Record<string, unknown>) {
  const org = await uno<{ id: string }>(`org ${datos.nombre}`, admin.c.from('sgi_organizacion').insert(datos).select('id').single());
  falla('vincular despacho', await admin.c.from('sgi_organizacion').update({ despacho_id: despacho.id }).eq('id', org.id));
  return org.id;
}

// ───────── Maquinados del Bajío ─────────
const MA = cuentas['maquinados.admin'], MD = cuentas['maquinados.direccion'], MP = cuentas['maquinados.produccion'], MU = cuentas['maquinados.auditoria'];
const perfilMaquinados = {
  procesos: ['Cotización', 'Compras', 'Torneado CNC', 'Fresado CNC', 'Inspección final', 'Embarque', 'Mantenimiento'],
  productos: ['Flechas y ejes a plano', 'Bujes de bronce', 'Engranes rectos'],
  puestos: ['Director general', 'Gerente de producción', 'Operador CNC', 'Inspector de calidad', 'Comprador', 'Vendedor', 'Técnico de mantenimiento'],
  clientesTipo: ['Proveedores automotrices Tier 2 del Bajío', 'Fabricantes de maquinaria agrícola'],
  proveedoresClave: ['Aceros del Centro', 'Tratamientos Térmicos Querétaro', 'ChatCotiza (IA en la nube)', 'VisionPieza (IA de inspección)'],
  notas: 'Maquila sobre planos del cliente: no diseña producto. Tolerancias típicas de ±0.01 mm.',
};
const M = await pyme(MA, { nombre: 'Maquinados del Bajío', sector: 'Metalmecánica de precisión', empleados: 45, ubicacion: 'Querétaro, Qro.', perfil: perfilMaquinados });
await miembros(MA.c, M, [[MD, 'alta_direccion', 'Director general'], [MP, 'dueno_proceso', 'Gerente de producción'], [MU, 'auditor_interno', 'Inspector de calidad'], [C, 'consultor', null]]);
falla('sistemas IA', await MA.c.from('sgi_sistema_ia').insert([
  { organizacion_id: M, nombre: 'Cotizador con chatbot', proposito: 'Responder consultas y armar cotizaciones preliminares desde los planos que suben los clientes', papel: 'usa', proveedor: 'ChatCotiza (servicio en la nube)', datos: 'Planos y mensajes de clientes' },
  { organizacion_id: M, nombre: 'Inspección visual de piezas', proposito: 'Detectar rebabas y marcas en flechas antes del embarque', papel: 'integra', proveedor: 'VisionPieza', datos: 'Fotos de piezas tomadas en la línea' },
]));
const noAplica = Object.fromEntries(['SGI-Q-8.3-01', 'SGI-Q-8.3-02', 'SGI-Q-8.3-03', 'SGI-Q-8.3-04', 'SGI-Q-8.3-05', 'SGI-Q-8.3-06']
  .map((id) => [id, 'No diseñamos producto: maquilamos sobre planos del cliente (ver alcance).']));
const PM = (await uno<{ id: string }>('proyecto maquinados', MA.c.from('sgi_proyecto').insert({
  organizacion_id: M, nombre: 'Sistema integrado 9001 + 42001', ediciones: [Q15, IA], usa_ia: true, disena: false,
  diagnostico: respuestas([Q15, IA], true, false, 0.55), diagnostico_completo: true, no_aplica: noAplica,
}).select('id').single())).id;
// Fase 0: plan del proyecto aprobado → se cierra.
const plan = await documento(C, M, PM, 'plan_proyecto', 'Plan del proyecto del sistema integrado', ['SGI-C-4.4-01'], [
  { titulo: 'Objetivo', parrafos: ['Maquinados del Bajío implementa un solo sistema de gestión para ISO 9001:2015 e ISO/IEC 42001:2023 en 9 meses.'] },
  { titulo: 'Fases y responsables', parrafos: ['Contexto y alcance: Gerente de producción. Liderazgo: Director general. Riesgos e IA: Director general con el consultor.'] },
]);
await aprueba(MA, M, 'plan_proyecto', plan.verId, plan.huella, 'admin_pyme');
await cierra(MA, M, PM, 0, 'admin_pyme');
// Fase 1: alcance + registros de producción → se cierra.
const alcance = await documento(C, M, PM, 'alcance', 'Alcance del sistema integrado', ['SGI-C-4.3-01', 'SGI-Q-4.3-02'], [
  { titulo: 'Qué abarca', parrafos: ['Cotización, compras, torneado CNC, fresado CNC, inspección final y embarque de flechas, bujes y engranes a plano en la planta de Querétaro, y los dos sistemas de IA: el cotizador con chatbot y la inspección visual de piezas.'] },
  { titulo: 'Lo que no aplica', parrafos: ['Maquinados del Bajío no diseña producto: fabrica sobre planos del cliente. Por eso los requisitos de diseño no aplican y esto no afecta lo que recibe el cliente.'] },
  { titulo: 'De quién dependemos', parrafos: ['ChatCotiza (servicio en la nube) y VisionPieza (modelo de inspección) son terceros de los que dependen los sistemas de IA.'] },
]);
await aprueba(MA, M, 'documento_general', alcance.verId, alcance.huella, 'admin_pyme');
const regs = await evidencia(MP, M, PM, 'Órdenes de trabajo y hojas de control de septiembre 2026', 'registro', 'Órdenes de trabajo 2026-0901 a 2026-0958 con hoja de control dimensional firmada por el operador CNC.', ['SGI-Q-4.4-03', 'SGI-C-8.1-01']);
await aprueba(MP, M, 'evidencia', regs.id, regs.huella, 'dueno_proceso');
await cierra(MA, M, PM, 1, 'admin_pyme');
// Fase 2: política de calidad aprobada; la de IA la redacta el agente documental (la puerta queda abierta).
const polCalidad = await documento(C, M, PM, 'politica', 'Política de calidad', ['SGI-C-5.2-01', 'SGI-Q-5.2-02'], [
  { titulo: 'Compromiso', parrafos: ['En Maquinados del Bajío entregamos flechas, bujes y engranes a plano con las tolerancias que pide cada cliente automotriz y agrícola, a tiempo, y cumplimos lo que marca la ley.'] },
  { titulo: 'Cómo lo cumplimos', parrafos: ['Cada orden de trabajo pasa por inspección final antes del embarque; medimos el índice de rechazo y el cumplimiento de entregas cada mes, y el Director general revisa los resultados con el Gerente de producción.'] },
  { titulo: 'Mejora', parrafos: ['Cada año bajamos el índice de rechazo interno; las quejas de clientes se atienden con análisis de causa.'] },
]);
await aprueba(MD, M, 'politica', polCalidad.verId, polCalidad.huella, 'alta_direccion');
const roles = await evidencia(MA, M, PM, 'Organigrama y descripciones de puesto', 'documento', 'Organigrama 2026 con responsabilidades del sistema: Gerente de producción reporta el desempeño mensual al Director general.', ['SGI-C-5.3-01']);
await aprueba(MA, M, 'evidencia', roles.id, roles.huella, 'admin_pyme');
// Acta de revisión por la dirección: cubre ambas normas. Se deja PROPUESTA: la aprueba la dirección en la app.
await evidencia(C, M, PM, 'Acta de revisión por la dirección — septiembre 2026', 'acta',
  'Asistentes: Director general, Gerente de producción, Inspector de calidad y el consultor. Temas: clientes (2 quejas de Tier 2 cerradas), operación (índice de rechazo 1.8 %, auditoría interna de julio), proveedores y recursos (reevaluación de Aceros del Centro), desempeño de los sistemas de IA (el cotizador respondió 312 consultas; 4 escaladas a ventas). Acuerdos: comprar un segundo micrómetro calibrado; revisar la política de IA antes de noviembre. Responsables y fechas en el anexo.',
  ['SGI-C-9.3-01', 'SGI-C-9.3-02', 'SGI-C-9.3-05', 'SGI-Q-9.3-03', 'SGI-IA-9.3-04']);
// Trabajo de otras fases (filas propuestas o registradas por personas).
falla('riesgos', await MA.c.from('sgi_riesgo').insert([
  { organizacion_id: M, proyecto_id: PM, tipo: 'riesgo', descripcion: 'Falla del torno CNC principal sin respaldo', probabilidad: 3, impacto: 4, tratamiento: 'Mantenimiento preventivo mensual y acuerdo con taller vecino', requisitos: ['SGI-C-6.1-01', 'SGI-C-6.1-02'] },
  { organizacion_id: M, proyecto_id: PM, tipo: 'oportunidad', descripcion: 'Clientes agrícolas piden bujes de bronce en lotes pequeños', probabilidad: 4, impacto: 3, tratamiento: 'Ofrecer lote mínimo de 50 piezas', requisitos: ['SGI-C-6.1-01'] },
]));
falla('indicadores', await MA.c.from('sgi_indicador').insert([
  { organizacion_id: M, proyecto_id: PM, nombre: 'Índice de rechazo interno', formula: 'piezas rechazadas / piezas inspeccionadas × 100', meta: 2, unidad: '%', sentido: 'menor', frecuencia: 'mensual', requisitos: ['SGI-C-9.1-01', 'SGI-C-6.2-01'] },
  { organizacion_id: M, proyecto_id: PM, nombre: 'Entregas a tiempo', formula: 'órdenes entregadas en fecha / órdenes entregadas × 100', meta: 95, unidad: '%', sentido: 'mayor', frecuencia: 'mensual', requisitos: ['SGI-C-9.1-01'] },
]));
const inds = await uno<{ id: string; nombre: string }[]>('leer indicadores', MA.c.from('sgi_indicador').select('id, nombre').eq('proyecto_id', PM));
const valores: Record<string, number[]> = { 'Índice de rechazo interno': [2.6, 2.3, 2.1, 1.9, 1.8], 'Entregas a tiempo': [91, 93, 92, 95, 96] };
falla('mediciones', await MA.c.from('sgi_medicion').insert(inds.flatMap((i) => (valores[i.nombre] ?? []).map((v, k) => ({ indicador_id: i.id, organizacion_id: M, periodo: `2026-0${5 + k}`, valor: v })))));
falla('proveedores', await MA.c.from('sgi_proveedor').insert([
  { organizacion_id: M, nombre: 'Aceros del Centro', tipo: 'material', suministra: 'Barra de acero 4140 y 1045', puntaje: 86, recomendacion: 'aprobar', reevaluar_en: '2027-03-31' },
  { organizacion_id: M, nombre: 'ChatCotiza', tipo: 'ia', suministra: 'Chatbot de cotización en la nube', reevaluar_en: '2026-12-15' },
]));
const acero = await uno<{ id: string; huella: string }>('leer proveedor', MA.c.from('sgi_proveedor').select('id, huella').eq('organizacion_id', M).eq('nombre', 'Aceros del Centro').single());
await aprueba(MA, M, 'proveedor', acero.id, acero.huella, 'admin_pyme');
falla('tareas', await MA.c.from('sgi_tarea').insert([
  { organizacion_id: M, proyecto_id: PM, fase: 2, titulo: 'Aprobar la política de IA', responsable_puesto: 'Director general', vence: '2026-10-10', requisitos: ['SGI-IA-5.2-03', 'SGI-A-2.2-01'] },
  { organizacion_id: M, proyecto_id: PM, fase: 4, titulo: 'Calibrar el micrómetro de exteriores 0-25 mm', responsable_puesto: 'Inspector de calidad', vence: '2026-09-25', requisitos: ['SGI-Q-7.1-06'] },
  { organizacion_id: M, proyecto_id: PM, fase: 6, titulo: 'Auditoría interna del segundo semestre', responsable_puesto: 'Inspector de calidad', vence: '2026-11-20', requisitos: ['SGI-C-9.2-01'] },
]));
// Auditoría interna realizada con un hallazgo firmado, su NC y una acción hecha (la eficacia la verifica el auditor en la app).
const aud = await uno<{ id: string }>('auditoría', MU.c.from('sgi_auditoria').insert({ organizacion_id: M, proyecto_id: PM, tipo: 'interna', alcance: 'Torneado CNC e inspección final', fecha: '2026-07-15', auditor_id: MU.id, estado: 'realizada' }).select('id').single());
const hall = await uno<{ id: string; huella: string }>('hallazgo', MU.c.from('sgi_hallazgo').insert({ auditoria_id: aud.id, organizacion_id: M, requisito_id: 'SGI-C-7.5-03', clasificacion: 'no_conformidad_menor', descripcion: 'En el torno 3 se usaba la versión 2 del instructivo de montaje; la vigente es la 3.', evidencia_observada: 'Instructivo IT-TOR-03 v2 pegado en la máquina el 15-jul.' }).select('id, huella').single());
await aprueba(MU, M, 'hallazgo', hall.id, hall.huella, 'auditor_interno');
const nc = await uno<{ id: string }>('NC', MU.c.from('sgi_no_conformidad').insert({ organizacion_id: M, proyecto_id: PM, hallazgo_id: hall.id, requisito_id: 'SGI-C-7.5-03', descripcion: 'Instructivo obsoleto en el punto de uso (torno 3).', correccion: 'Se retiró la v2 y se colocó la v3 el mismo día.', causa: 'No había lista de dónde está pegado cada instructivo.', estado: 'en_tratamiento' }).select('id').single());
const acc = await uno<{ id: string }>('acción', MA.c.from('sgi_accion_correctiva').insert({ no_conformidad_id: nc.id, organizacion_id: M, accion: 'Lista maestra de instructivos con su ubicación física y revisión mensual por el Inspector de calidad.', responsable_puesto: 'Inspector de calidad', vence: '2026-09-30' }).select('id').single());
falla('acción hecha', await MP.c.from('sgi_accion_correctiva').update({ estado: 'hecha' }).eq('id', acc.id));

// ───────── Panificadora Santa Rita (solo 9001:2026) ─────────
const PA = cuentas['panificadora.admin'];
const P = await pyme(PA, { nombre: 'Panificadora Santa Rita', sector: 'Panadería industrial', empleados: 18, ubicacion: 'Puebla, Pue.', perfil: { procesos: ['Recepción de harinas', 'Amasado y horneado', 'Empaque', 'Reparto'], productos: ['Pan de caja', 'Bolillo', 'Conchas'], puestos: ['Dueña', 'Maestro panadero', 'Repartidor'] } });
await miembros(PA.c, P, [[cuentas['panificadora.direccion'], 'alta_direccion', 'Dueña'], [C, 'consultor', null]]);
const PP = (await uno<{ id: string }>('proyecto panificadora', PA.c.from('sgi_proyecto').insert({ organizacion_id: P, nombre: 'Calidad 9001:2026', ediciones: [Q26], usa_ia: false, disena: false, diagnostico: respuestas([Q26], false, false, 0.35) }).select('id').single())).id;
const hig = await evidencia(PA, P, PP, 'Bitácora de limpieza de hornos', 'registro', 'Bitácora diaria de limpieza de los 3 hornos, firmada por el Maestro panadero.', ['SGI-C-8.1-01']);
await aprueba(PA, P, 'evidencia', hig.id, hig.huella, 'admin_pyme');

// ───────── Clínica Dental Sonrisa ─────────
const CA = cuentas['clinica.admin'];
const CL = await pyme(CA, { nombre: 'Clínica Dental Sonrisa', sector: 'Salud dental', empleados: 12, ubicacion: 'Monterrey, N.L.', perfil: { procesos: ['Agenda', 'Consulta', 'Esterilización', 'Cobranza'], productos: ['Limpieza dental', 'Ortodoncia'], puestos: ['Directora', 'Odontólogo', 'Asistente dental', 'Recepcionista'] } });
await miembros(CA.c, CL, [[C, 'consultor', null]]);
falla('IA clínica', await CA.c.from('sgi_sistema_ia').insert({ organizacion_id: CL, nombre: 'Asistente de agenda', proposito: 'Sugerir horarios y recordar citas a pacientes', papel: 'usa', proveedor: 'Proveedor de agenda en la nube', datos: 'Nombre y teléfono de pacientes, horarios' }));
falla('proyecto clínica', await CA.c.from('sgi_proyecto').insert({ organizacion_id: CL, nombre: 'Sistema integrado', ediciones: [Q15, IA], usa_ia: true, disena: false }));

// ───────── La casa: la app misma, primer inquilino 42001 ─────────
const KA = cuentas['casa.admin'];
const K = await uno<{ id: string }>('la casa', KA.c.from('sgi_organizacion').insert({
  nombre: 'Sistema Integrado ISO (la casa)', sector: 'Software para sistemas de gestión', empleados: 3, ubicacion: 'Laboratorio del template', es_casa: true,
  perfil: { procesos: ['Desarrollo de la app', 'Operación de agentes', 'Soporte a pymes y consultores'], productos: ['App de sistema integrado ISO 9001 + ISO/IEC 42001'], puestos: ['Laboratorio (dirección)', 'Desarrollo', 'Soporte'], proveedoresClave: ['OpenRouter (proveedor de modelos)', 'Supabase'] },
}).select('id').single());
await miembros(KA.c, K.id, [[cuentas['casa.direccion'], 'alta_direccion', 'Laboratorio (dirección)']]);
falla('inventario de IA de la casa', await KA.c.from('sgi_sistema_ia').insert(Object.values(AGENTES).filter((a) => !a.determinista).map((a) => ({
  organizacion_id: K.id, nombre: `Agente ${a.nombre}`, proposito: a.descripcion, papel: 'desarrolla', proveedor: 'Modelo por OpenRouter, pineado en routing-modelos.json',
  datos: 'Perfil de la organización, catálogo propio, evidencias minimizadas y delimitadas', estado_ciclo: 'pruebas',
}))));
falla('proyecto de la casa', await KA.c.from('sgi_proyecto').insert({ organizacion_id: K.id, nombre: 'Sistema de gestión de IA de la app', ediciones: [IA], usa_ia: true, disena: true }));

console.log(`Siembra lista: despacho con marca y 2 plantillas · Maquinados del Bajío (fases 0 y 1 cerradas, fase 2 abierta) · Panificadora (9001:2026) · Clínica · la casa (${Object.values(AGENTES).filter((a) => !a.determinista).length} agentes en su inventario). ${NOMBRES.length} cuentas sintéticas; claves en supabase/.temp/sgi-cuentas.json. Catálogo ${CATALOGO.version}.`);
