/**
 * SIEMBRA MÍNIMA del recorrido de la capa (`scripts/capa/recorrido.ts`, lazo `l-adopcion`). Las rutas dinámicas con
 * sesión (`/sgi/[org]/…`, `/buzon/[pyme]`, `/reel/[id]`) solo pintan su pantalla si la cuenta tiene algo que enseñar,
 * y la cuenta sintética NUEVA del recorrido no tiene nada. Esto le da lo mínimo POR LAS MISMAS PUERTAS que la app: la
 * sesión de esa cuenta con la llave anónima, así que pasan las políticas RLS, las huellas y los disparadores de verdad
 * (si una regla estuviera mal, la siembra revienta). Nunca service_role (C7), no aplica migraciones, no reinicia la
 * base y no borra ni toca filas de nadie más (la RLS no la deja). Todo lo que crea lleva «(recorrido de la capa)».
 *
 *   · SGI: una organización de la que la cuenta es administradora, con su proyecto y unas pocas filas en cada pantalla
 *     (diagnóstico, documentos —uno aprobado y otro en revisión—, contexto e inventario de IA, evidencias, riesgos e
 *     impacto, SoA, objetivos e indicadores con sus mediciones, auditoría con su NC y su acción, calendario).
 *   · Reel: un proyecto SIN versión. El video vive en el disco del servidor (REEL_DATOS), no en la base: una versión
 *     sin archivo haría que la sala pidiera un video que no existe (404 en la consola del recorrido).
 *   · Buzón: solo si la cuenta YA es miembro del despacho. Ser miembro lo da el operador con SQL directo (ninguna
 *     política deja que alguien se dé de alta), así que una cuenta nueva nunca lo es; y la base local puede no tener ni
 *     las tablas. En ese caso NO se siembra y se dice por qué (`sinSembrar`).
 *
 * Idempotente por cuenta: si ya ve su organización / su reel / su pyme marcados, los reutiliza en vez de duplicarlos.
 * Las contraseñas nunca se imprimen ni salen de aquí; solo conteos e ids.
 *
 * Uso suelto: node scripts/capa/siembra-recorrido.ts [--cuentas <json> [--cuenta <nombre>]]
 *   Sin --cuentas crea una cuenta sintética nueva (sirve para probar la siembra; su clave no se guarda).
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';
import { controlesAnexoA, type IdEdicion } from '../../tools/sistema-integrado/dist/catalogo/index.js';
import { preguntasDiagnostico, type Respuesta } from '../../tools/sistema-integrado/dist/motor/index.js';
import type { Cuenta } from '../sgi/local.ts';

const MARCA = '(recorrido de la capa)';
const ORGANIZACION = `Organización sintética ${MARCA}`;
const REEL = `Reel sintético ${MARCA}`;
const PYME = `Pyme sintética ${MARCA}`;
const Q15: IdEdicion = 'iso-9001:2015+a1:2024';
const IA: IdEdicion = 'iso-iec-42001:2023';

export interface SiembraDelRecorrido {
  /** Ids concretos de lo sembrado: de ahí salen las rutas dinámicas. */
  readonly org: string;
  readonly version: string;
  readonly reel: string;
  readonly pyme: string | null;
  /** Filas creadas por tabla (vacío si todo se reutilizó de una siembra anterior de la misma cuenta). */
  readonly filas: Readonly<Record<string, number>>;
  /** Rutas dinámicas que una sesión de usuario no puede sembrar, y el motivo. */
  readonly sinSembrar: Readonly<Record<string, string>>;
}

const falla = (paso: string, r: { error: { message: string } | null }) => {
  if (r.error) throw new Error(`siembra del recorrido: ${paso}: ${r.error.message}`);
};

const dia = (desdeHoy: number) => new Date(Date.now() + desdeHoy * 86_400_000).toISOString().slice(0, 10);
/** `YYYY-MM` de hace `n` meses (mes y día juntos: el 31 de marzo no se desborda a marzo). */
const periodo = (n: number) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - n, 1); return d.toISOString().slice(0, 7); };

function escritor(c: SupabaseClient) {
  const filas: Record<string, number> = {};
  const cuenta = (tabla: string, n: number) => { filas[tabla] = (filas[tabla] ?? 0) + n; };
  /** Inserta una o varias filas y no pide nada de vuelta. */
  const mete = async (tabla: string, datos: object | object[]) => {
    falla(tabla, await c.from(tabla).insert(datos)); cuenta(tabla, Array.isArray(datos) ? datos.length : 1);
  };
  /** Inserta UNA fila y devuelve las columnas pedidas, como lo hace la app. */
  const crea = async <T>(tabla: string, fila: object, columnas = 'id'): Promise<T> => {
    const r = await c.from(tabla).insert(fila).select(columnas).single();
    falla(tabla, r); cuenta(tabla, 1); return r.data as unknown as T;
  };
  return { filas, mete, crea };
}

/** Un documento con su primera versión ya en revisión: lo que `/documentos` lista y `/documentos/[version]` abre. */
async function documento(w: ReturnType<typeof escritor>, c: SupabaseClient, org: string, proyecto: string, d: { tipo: string; titulo: string; requisitos: string[]; secciones: { titulo: string; parrafos: string[] }[] }) {
  const doc = await w.crea<{ id: string }>('sgi_documento', { organizacion_id: org, proyecto_id: proyecto, tipo: d.tipo, titulo: d.titulo, requisitos: d.requisitos });
  const v = await w.crea<{ id: string; huella: string }>('sgi_documento_version', { documento_id: doc.id, organizacion_id: org, numero: 1, contenido: { secciones: d.secciones } }, 'id, huella');
  falla(`revisión de ${d.titulo}`, await c.from('sgi_documento_version').update({ estado: 'en_revision' }).eq('id', v.id));
  return { docId: doc.id, verId: v.id, huella: v.huella };
}

/** SGI: organización, proyecto y unas pocas filas en cada pantalla. */
async function sembrarSgi(c: SupabaseClient, w: ReturnType<typeof escritor>, userId: string): Promise<{ org: string; version: string }> {
  const org = (await w.crea<{ id: string }>('sgi_organizacion', {
    nombre: ORGANIZACION, sector: 'Metalmecánica (sintética)', empleados: 12, ubicacion: 'Querétaro, Qro.',
    perfil: {
      procesos: ['Recepción de material', 'Maquinado', 'Inspección final', 'Embarque'], productos: ['Piezas maquinadas a plano'],
      puestos: ['Director', 'Operador CNC', 'Inspector de calidad'], clientesTipo: ['Fabricantes de maquinaria (sintéticos)'], proveedoresClave: ['Proveedor de acero (sintético)'],
    },
  })).id; // el disparador de alta la deja como administradora (admin_pyme)
  const ediciones = [Q15, IA];
  const diagnostico = Object.fromEntries(preguntasDiagnostico({ ediciones, usaIA: true, disena: false }).slice(0, 8)
    .map((p, i): [string, Respuesta] => [p.id, (['si', 'parcial', 'no', 'si'] as const)[i % 4]!]));
  const proyecto = (await w.crea<{ id: string }>('sgi_proyecto', { organizacion_id: org, nombre: `Sistema integrado ${MARCA}`, ediciones, usa_ia: true, disena: false, diagnostico })).id;
  const pk = { organizacion_id: org, proyecto_id: proyecto };

  // Contexto: inventario de IA, asuntos y partes interesadas.
  const ia = await w.crea<{ id: string }>('sgi_sistema_ia', { organizacion_id: org, nombre: 'Asistente de cotización (sintético)', proposito: 'Armar cotizaciones preliminares a partir de los mensajes de los clientes', papel: 'usa', proveedor: 'Proveedor de IA en la nube (sintético)', datos: 'Mensajes de clientes (sintéticos)' });
  await w.mete('sgi_asunto', [
    { ...pk, tipo: 'interno', categoria: 'Recursos', descripcion: 'Un solo torno CNC concentra la producción', efecto: 'negativo', requisitos: ['SGI-C-4.1-01'] },
    { ...pk, tipo: 'externo', categoria: 'Mercado', descripcion: 'Los clientes agrícolas piden lotes pequeños', efecto: 'positivo', requisitos: ['SGI-C-4.1-01'] },
  ]);
  await w.mete('sgi_parte_interesada', { ...pk, nombre: 'Clientes de maquinaria (sintéticos)', necesidades: 'Entregas a tiempo y a plano', requisitos: ['SGI-C-4.2-01'] });
  await w.mete('sgi_tarea', [
    { ...pk, fase: 2, titulo: 'Revisar la política de calidad', responsable_puesto: 'Director', vence: dia(-5), requisitos: ['SGI-C-5.2-01'] },
    { ...pk, fase: 3, titulo: 'Actualizar la matriz de riesgos', responsable_puesto: 'Inspector de calidad', vence: dia(10), requisitos: ['SGI-C-6.1-01'] },
  ]);

  // Documentos: un procedimiento aprobado (crea su evidencia) y una política que espera a la alta dirección.
  const proc = await documento(w, c, org, proyecto, {
    tipo: 'procedimiento', titulo: `Control de documentos ${MARCA}`, requisitos: ['SGI-C-7.5-01', 'SGI-C-7.5-02', 'SGI-C-7.5-03'],
    secciones: [
      { titulo: 'Propósito', parrafos: ['Que la versión vigente de cada documento esté donde se usa. Documento sintético del recorrido de la capa.'] },
      { titulo: 'Cómo se controla', parrafos: ['Cada documento lleva su versión y su fecha; una versión nueva reemplaza a la anterior el mismo día y la anterior se retira del punto de uso.'] },
    ],
  });
  await w.mete('sgi_aprobacion', { organizacion_id: org, objeto_tipo: 'procedimiento', objeto_id: proc.verId, huella: proc.huella, decision: 'aprobado', rol: 'admin_pyme' });
  await documento(w, c, org, proyecto, {
    tipo: 'politica', titulo: `Política de calidad ${MARCA}`, requisitos: ['SGI-C-5.2-01', 'SGI-Q-5.2-02'],
    secciones: [{ titulo: 'Compromiso', parrafos: ['Entregamos a plano y a tiempo. Texto sintético del recorrido de la capa.'] }],
  });

  // Evidencia propuesta (la aprobada ya la creó el procedimiento).
  const ev = await w.crea<{ id: string }>('sgi_evidencia', { ...pk, titulo: `Hoja de control de la línea 1 ${MARCA}`, tipo: 'registro', contenido: 'Hoja de control dimensional de la línea 1, firmada por el operador. Registro sintético.' });
  await w.mete('sgi_evidencia_requisito', ['SGI-Q-4.4-03', 'SGI-C-8.1-01'].map((r) => ({ evidencia_id: ev.id, requisito_id: r, organizacion_id: org })));

  // Riesgos, impacto de IA y SoA.
  await w.mete('sgi_riesgo', [
    { ...pk, tipo: 'riesgo', descripcion: 'Falla del torno principal sin respaldo', probabilidad: 3, impacto: 4, tratamiento: 'Mantenimiento preventivo mensual', requisitos: ['SGI-C-6.1-01', 'SGI-C-6.1-02'] },
    { ...pk, tipo: 'riesgo_ia', descripcion: 'El asistente inventa un precio en una cotización', probabilidad: 2, impacto: 4, tratamiento: 'Una persona revisa cada cotización antes de enviarla', sistema_ia_id: ia.id, requisitos: ['SGI-IA-6.1-06'] },
  ]);
  await w.mete('sgi_evaluacion_impacto', { ...pk, sistema_ia_id: ia.id, afectados: 'Clientes que reciben la cotización', descripcion: 'Un precio equivocado puede comprometer a la empresa con el cliente', severidad: 'media', medidas: 'Revisión humana de cada cotización', requisitos: ['SGI-IA-6.1-10'] });
  await w.mete('sgi_control_soa', controlesAnexoA().slice(0, 2).map((x, i) => ({
    ...pk, control: x.refs[0]!.clausula, requisito_id: x.id, aplica: true, justificacion: 'Aplica: la empresa usa un asistente de IA (sintético).', estado_impl: i === 0 ? 'implementado' : 'en_curso',
  })));

  // Objetivos e indicadores con su serie.
  const objetivo = await w.crea<{ id: string }>('sgi_objetivo', { ...pk, descripcion: 'Bajar el rechazo interno', meta: '2 %', plazo: dia(180), requisitos: ['SGI-C-6.2-01'] });
  const indicador = await w.crea<{ id: string }>('sgi_indicador', { ...pk, objetivo_id: objetivo.id, nombre: 'Índice de rechazo interno (sintético)', formula: 'piezas rechazadas / piezas inspeccionadas × 100', meta: 2, unidad: '%', sentido: 'menor', frecuencia: 'mensual', requisitos: ['SGI-C-9.1-01', 'SGI-C-6.2-01'] });
  await w.mete('sgi_medicion', [2.6, 2.1, 1.8].map((valor, i) => ({ indicador_id: indicador.id, organizacion_id: org, periodo: periodo(2 - i), valor })));

  // Proveedor y auditoría con su no conformidad y su acción (el calendario junta las fechas de todo).
  await w.mete('sgi_proveedor', { organizacion_id: org, nombre: 'Proveedor de acero (sintético)', tipo: 'material', suministra: 'Barra de acero', puntaje: 80, recomendacion: 'aprobar', reevaluar_en: dia(90) });
  const auditoria = await w.crea<{ id: string }>('sgi_auditoria', { ...pk, tipo: 'interna', alcance: 'Maquinado e inspección final (sintético)', fecha: dia(30), auditor_id: userId });
  await w.mete('sgi_hallazgo', { auditoria_id: auditoria.id, organizacion_id: org, requisito_id: 'SGI-C-7.5-03', clasificacion: 'observacion', descripcion: 'Un instructivo sin fecha de revisión en el punto de uso', evidencia_observada: 'Instructivo del torno 1, sin fecha (observación sintética).' });
  const nc = await w.crea<{ id: string }>('sgi_no_conformidad', { ...pk, requisito_id: 'SGI-C-7.5-03', descripcion: 'Instructivo sin control de versión en el torno 1', correccion: 'Se le puso fecha y versión el mismo día.', causa: 'No había lista maestra de instructivos.', estado: 'en_tratamiento' });
  await w.mete('sgi_accion_correctiva', { no_conformidad_id: nc.id, organizacion_id: org, accion: 'Lista maestra de instructivos con su ubicación', responsable_puesto: 'Inspector de calidad', vence: dia(15) });

  return { org, version: proc.verId };
}

/** El reel: un proyecto sin versión (ver la nota de arriba). Lo mismo que hace `/api/reel/proyectos`, sin el clip. */
async function sembrarReel(w: ReturnType<typeof escritor>): Promise<string> {
  return (await w.crea<{ id: string }>('reel_proyectos', { titulo: REEL, estado: 'bloqueado', motivo_bloqueo: 'Proyecto sintético del recorrido de la capa: no tiene clip ni máster.' })).id;
}

/** Por qué el buzón no se puede sembrar con una sesión de usuario; `null` si la cuenta ya es miembro y sí se puede. */
async function motivoSinBuzon(c: SupabaseClient): Promise<string | null> {
  const r = await c.rpc('buzon_soy_miembro');
  if (r.error?.code === 'PGRST202') return 'la Supabase local no tiene el buzón: sus 5 migraciones (20261007…) no están aplicadas, y esta siembra no aplica migraciones ni reinicia la base';
  if (r.error) return `no se pudo preguntar si la cuenta es miembro del despacho: ${r.error.message}`;
  if (r.data !== true) return 'la cuenta no es miembro del despacho (public.buzon_miembros): las altas las hace el operador con SQL directo, ninguna política deja que alguien se dé de alta, y esta siembra no usa service_role (C7)';
  return null;
}

/** Lo que la cuenta ya ve de una siembra anterior suya (por su marca), o `null`. Sin orden: no todas las tablas
 *  llaman igual a su fecha (`buzon_pymes.creada_en`), y de dos filas con la misma marca da igual cuál. */
async function previa(c: SupabaseClient, tabla: string, columna: string, valor: string): Promise<string | null> {
  const r = await c.from(tabla).select('id').eq(columna, valor).limit(1);
  falla(`leer ${tabla}`, r);
  return (r.data?.[0] as { id: string } | undefined)?.id ?? null;
}

export async function siembraDelRecorrido(cuenta: Cuenta): Promise<SiembraDelRecorrido> {
  const c = cuenta.c;
  const w = escritor(c);
  const sinSembrar: Record<string, string> = {};

  let org = await previa(c, 'sgi_organizacion', 'nombre', ORGANIZACION);
  let version: string;
  if (org) {
    const v = await c.from('sgi_documento_version').select('id').eq('organizacion_id', org).order('creado_en', { ascending: true }).limit(1);
    falla('leer la versión sembrada', v);
    const id = (v.data?.[0] as { id: string } | undefined)?.id;
    if (!id) throw new Error('siembra del recorrido: la organización sembrada antes quedó a medias (sin documentos); usa otra cuenta');
    version = id;
  } else ({ org, version } = await sembrarSgi(c, w, cuenta.id));

  const reel = (await previa(c, 'reel_proyectos', 'titulo', REEL)) ?? await sembrarReel(w);

  let pyme: string | null = null;
  const motivo = await motivoSinBuzon(c);
  if (motivo) sinSembrar['/buzon/[pyme]'] = motivo;
  else {
    // La cuenta es miembro: la pyme entra por la puerta del buzón (RFC genérico de prueba, único en el despacho).
    pyme = (await previa(c, 'buzon_pymes', 'nombre', PYME)) ?? (await w.crea<{ id: string }>('buzon_pymes', { rfc: 'SIN010101AB1', nombre: PYME })).id;
  }
  return { org, version, reel, pyme, filas: w.filas, sinSembrar };
}

/** Una línea para el registro del recorrido: ids y conteos, nunca claves. */
export function resumenDeSiembra(s: SiembraDelRecorrido): string {
  const filas = Object.entries(s.filas);
  const total = filas.reduce((n, [, k]) => n + k, 0);
  return [
    `Siembra del recorrido: org ${s.org} · versión ${s.version} · reel ${s.reel} · pyme ${s.pyme ?? '—'}`,
    filas.length ? `${total} fila(s): ${filas.map(([t, k]) => `${t}×${k}`).join(', ')}` : 'reutilizada de una siembra anterior de la misma cuenta (0 filas nuevas)',
    ...Object.entries(s.sinSembrar).map(([ruta, why]) => `sin sembrar ${ruta}: ${why}`),
  ].join('\n  ');
}

// Uso suelto: sembrar una cuenta y ver qué quedó.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const { altaCuenta } = await import('../sgi/local.ts');
  const archivo = arg('cuentas');
  const cuentas = archivo ? JSON.parse(readFileSync(archivo, 'utf8')) as Record<string, { correo: string; clave: string }> : null;
  const k = cuentas ? cuentas[arg('cuenta') ?? 'consultora'] : null;
  if (cuentas && !k) throw new Error(`esa cuenta no está en ${archivo}`);
  console.log(resumenDeSiembra(await siembraDelRecorrido(k ? await altaCuenta('capa-recorrido', undefined, k.correo, k.clave) : await altaCuenta('capa-recorrido'))));
}
