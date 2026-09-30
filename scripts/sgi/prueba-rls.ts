/**
 * MEDICIÓN del aislamiento y de la matriz de roles (L3) contra la Supabase LOCAL, con cuentas sintéticas reales.
 * Escribe public/laboratorio-sgi/rls.json (lo lee el laboratorio). Fuera de `validate`: necesita Docker.
 * Uso: npm run sgi:rls
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { altaCuenta, clienteAnonimo, entornoLocal } from './local.ts';
import { puedeAprobar, APROBADORES, ROLES, FASES, type Rol, type TipoAprobable } from '../../tools/sistema-integrado/dist/index.js';
import { CATALOGO } from '../../tools/sistema-integrado/dist/catalogo/index.js';

const e = entornoLocal();
const filas: [string, string, boolean][] = [];
const anota = (que: string, esperado: string, ok: boolean) => { filas.push([que, esperado, ok]); };
const rechazado = (r: { error: unknown; data?: unknown }) => !!r.error || (Array.isArray(r.data) && r.data.length === 0);

const [aAdmin, aDir, aDueno, aAud, bAdmin, cons, cons2] = await Promise.all(
  ['a-admin', 'a-direccion', 'a-dueno', 'a-auditor', 'b-admin', 'consultor', 'consultor2'].map((x) => altaCuenta(x, e)));

// Despacho del consultor y organizaciones
const d = await cons.c.from('sgi_despacho').insert({ nombre: 'Despacho RLS', marca: { nombre_corto: 'RLS', color_primario: '#0f766e' } }).select().single();
anota('el consultor da de alta su despacho (queda como miembro)', 'se crea', !d.error);
await cons.c.from('sgi_despacho_miembro').insert({ despacho_id: d.data!.id, user_id: cons2.id });
const orgA = await aAdmin.c.from('sgi_organizacion').insert({ nombre: 'Org A (RLS)', sector: 'metalmecánica', empleados: 45 }).select().single();
anota('la admin de A da de alta su organización', 'se crea y queda como admin_pyme', !orgA.error);
const A = orgA.data!.id;
await aAdmin.c.from('sgi_organizacion').update({ despacho_id: d.data!.id }).eq('id', A);
const miembros = await aAdmin.c.from('sgi_membresia').insert([
  { organizacion_id: A, user_id: aDir.id, rol: 'alta_direccion' }, { organizacion_id: A, user_id: aDueno.id, rol: 'dueno_proceso' },
  { organizacion_id: A, user_id: aAud.id, rol: 'auditor_interno' }, { organizacion_id: A, user_id: cons.id, rol: 'consultor' }]);
anota('la admin de A agrega dirección, dueño de proceso, auditor y consultor', 'se agregan', !miembros.error);
const orgB = await bAdmin.c.from('sgi_organizacion').insert({ nombre: 'Org B (RLS)' }).select().single();
const B = orgB.data!.id;
const orgZ = await cons2.c.from('sgi_organizacion').insert({ nombre: 'Org Z del mismo despacho (RLS)', despacho_id: d.data!.id }).select().single();
anota('otro consultor del despacho da de alta un cliente suyo (Z)', 'se crea', !orgZ.error);

// Proyecto, política en revisión y evidencia en A
const p = await aAdmin.c.from('sgi_proyecto').insert({ organizacion_id: A, nombre: 'SGI A', ediciones: ['iso-9001:2015+a1:2024', 'iso-iec-42001:2023'], usa_ia: true }).select().single();
const P = p.data!.id;
const doc = await cons.c.from('sgi_documento').insert({ organizacion_id: A, proyecto_id: P, tipo: 'politica', titulo: 'Política de IA', requisitos: ['SGI-C-5.2-01', 'SGI-IA-5.2-03', 'SGI-A-2.2-01'] }).select().single();
anota('el consultor propone un documento en A', 'se crea (propone)', !doc.error);
const ver = await cons.c.from('sgi_documento_version').insert({ documento_id: doc.data!.id, organizacion_id: A, numero: 1, contenido: { secciones: [{ titulo: 'Uso', parrafos: ['Org A usa IA para cotizar.'] }] } }).select().single();
anota('la base calcula la huella de la versión', 'sha256 de 64 hex', /^sha256:[0-9a-f]{64}$/.test(ver.data?.huella ?? ''));
await cons.c.from('sgi_documento_version').update({ estado: 'en_revision' }).eq('id', ver.data!.id);
const V = ver.data!.id, HV = ver.data!.huella as string;

// B no ve ni toca nada de A
anota('B lee la organización de A', '0 filas', rechazado(await bAdmin.c.from('sgi_organizacion').select('id').eq('id', A)));
anota('B lee el proyecto de A', '0 filas', rechazado(await bAdmin.c.from('sgi_proyecto').select('id').eq('id', P)));
anota('B lee documentos y versiones de A', '0 filas', rechazado(await bAdmin.c.from('sgi_documento_version').select('id').eq('organizacion_id', A)));
anota('B cambia el proyecto de A', '0 filas', rechazado(await bAdmin.c.from('sgi_proyecto').update({ nombre: 'hackeado' }).eq('id', P).select()));
anota('B mete un riesgo con organizacion_id de A', 'rechazado', rechazado(await bAdmin.c.from('sgi_riesgo').insert({ organizacion_id: A, proyecto_id: P, tipo: 'riesgo', descripcion: 'x', probabilidad: 1, impacto: 1 }).select()));
const pB = await bAdmin.c.from('sgi_proyecto').insert({ organizacion_id: B, nombre: 'SGI B', ediciones: ['iso-9001:2026'] }).select().single();
anota('B cuelga un riesgo SUYO del proyecto de A', 'rechazado (misma organización)', rechazado(await bAdmin.c.from('sgi_riesgo').insert({ organizacion_id: B, proyecto_id: P, tipo: 'riesgo', descripcion: 'x', probabilidad: 1, impacto: 1 }).select()));
anota('B se agrega como alta dirección de A', 'rechazado', rechazado(await bAdmin.c.from('sgi_membresia').insert({ organizacion_id: A, user_id: bAdmin.id, rol: 'alta_direccion' }).select()));
anota('B aprueba la política de A', 'rechazado', rechazado(await bAdmin.c.from('sgi_aprobacion').insert({ organizacion_id: A, objeto_tipo: 'politica', objeto_id: V, huella: HV, decision: 'aprobado', rol: 'alta_direccion' }).select()));
const bPuerta = await bAdmin.c.rpc('sgi_faltantes_puerta', { p_proyecto: P, p_fase: 2 });
anota('B pregunta qué le falta al proyecto de A (función de la base)', 'rechazado: sin acceso', !!bPuerta.error && !!pB.data);
const bFases = await bAdmin.c.rpc('sgi_fases_cerradas', { p_proyecto: P });
anota('B pregunta qué fases cerró A', 'nada', !bFases.error && Array.isArray(bFases.data) && bFases.data.length === 0);

// Consultor: solo sus clientes asignados y nunca aprueba
anota('el consultor ve a su cliente A', '1 fila', (await cons.c.from('sgi_organizacion').select('id').eq('id', A)).data?.length === 1);
anota('el consultor ve a Z (del mismo despacho, no asignado)', '0 filas', rechazado(await cons.c.from('sgi_organizacion').select('id').eq('id', orgZ.data!.id)));
anota('el consultor ve a B', '0 filas', rechazado(await cons.c.from('sgi_organizacion').select('id').eq('id', B)));
anota('el consultor aprueba la política como consultor', 'rechazado', rechazado(await cons.c.from('sgi_aprobacion').insert({ organizacion_id: A, objeto_tipo: 'politica', objeto_id: V, huella: HV, decision: 'aprobado', rol: 'consultor' }).select()));
anota('el consultor se da el rol de alta dirección', 'rechazado', rechazado(await cons.c.from('sgi_membresia').insert({ organizacion_id: A, user_id: cons.id, rol: 'alta_direccion' }).select()));

// Matriz de roles sobre la política
anota('el dueño de proceso aprueba la política de IA', 'rechazado (rol)', rechazado(await aDueno.c.from('sgi_aprobacion').insert({ organizacion_id: A, objeto_tipo: 'politica', objeto_id: V, huella: HV, decision: 'aprobado', rol: 'dueno_proceso' }).select()));
anota('el dueño de proceso se hace pasar por alta dirección', 'rechazado (no tiene el rol)', rechazado(await aDueno.c.from('sgi_aprobacion').insert({ organizacion_id: A, objeto_tipo: 'politica', objeto_id: V, huella: HV, decision: 'aprobado', rol: 'alta_direccion' }).select()));
anota('alta dirección aprueba con una huella distinta', 'rechazado (O3)', rechazado(await aDir.c.from('sgi_aprobacion').insert({ organizacion_id: A, objeto_tipo: 'politica', objeto_id: V, huella: `sha256:${'0'.repeat(64)}`, decision: 'aprobado', rol: 'alta_direccion' }).select()));
anota('alguien pone la versión en «aprobado» sin aprobación', 'rechazado', rechazado(await aAdmin.c.from('sgi_documento_version').update({ estado: 'aprobado' }).eq('id', V).select()));
anota('alguien da de alta una versión ya «aprobada»', 'rechazado', rechazado(await aAdmin.c.from('sgi_documento_version').insert({ documento_id: doc.data!.id, organizacion_id: A, numero: 9, contenido: { secciones: [] }, estado: 'aprobado' }).select()));
anota('alguien da de alta una NC ya «cerrada»', 'rechazado', rechazado(await aAdmin.c.from('sgi_no_conformidad').insert({ organizacion_id: A, proyecto_id: P, descripcion: 'NC que nace cerrada', estado: 'cerrada' }).select()));
const ap = await aDir.c.from('sgi_aprobacion').insert({ organizacion_id: A, objeto_tipo: 'politica', objeto_id: V, huella: HV, decision: 'aprobado', rol: 'alta_direccion' }).select().single();
anota('alta dirección aprueba la versión exacta', 'se registra (quién, cuándo, rol, huella, versión)', !ap.error && ap.data?.aprobado_por === aDir.id && ap.data?.version === 1);
const est = await aAdmin.c.from('sgi_documento_version').select('estado').eq('id', V).single();
const evs = await aAdmin.c.from('sgi_evidencia_estado').select('aprobada, id').eq('proyecto_id', P);
anota('aprobar crea la evidencia aprobada que cubre sus requisitos', 'versión aprobada + evidencia', est.data?.estado === 'aprobado' && evs.data?.some((x) => x.aprobada) === true);
anota('alta dirección reescribe la huella de su aprobación', 'rechazado (inmutable)', rechazado(await aDir.c.from('sgi_aprobacion').update({ huella: `sha256:${'1'.repeat(64)}` }).eq('id', ap.data!.id).select()));
anota('la admin borra la aprobación', 'rechazado', rechazado(await aAdmin.c.from('sgi_aprobacion').delete().eq('id', ap.data!.id).select()));

// Hallazgo: solo lo firma el auditor
const au = await aAdmin.c.from('sgi_auditoria').insert({ organizacion_id: A, proyecto_id: P, tipo: 'interna', alcance: 'Todo', fecha: '2026-10-01' }).select().single();
const h = await aAud.c.from('sgi_hallazgo').insert({ auditoria_id: au.data!.id, organizacion_id: A, requisito_id: 'SGI-C-7.5-03', clasificacion: 'no_conformidad_menor', descripcion: 'Versión vieja del instructivo en el torno 3.' }).select().single();
anota('la dirección firma el hallazgo', 'rechazado (solo auditor)', rechazado(await aDir.c.from('sgi_aprobacion').insert({ organizacion_id: A, objeto_tipo: 'hallazgo', objeto_id: h.data!.id, huella: h.data!.huella, decision: 'aprobado', rol: 'alta_direccion' }).select()));
const firma = await aAud.c.from('sgi_aprobacion').insert({ organizacion_id: A, objeto_tipo: 'hallazgo', objeto_id: h.data!.id, huella: h.data!.huella, decision: 'aprobado', rol: 'auditor_interno' }).select().single();
anota('el auditor interno firma el hallazgo', 'se firma', !firma.error && (await aAdmin.c.from('sgi_hallazgo').select('estado').eq('id', h.data!.id).single()).data?.estado === 'firmado');
anota('alguien edita el hallazgo firmado', 'rechazado', rechazado(await aAdmin.c.from('sgi_hallazgo').update({ descripcion: 'otra cosa distinta' }).eq('id', h.data!.id).select()));

// Puerta en SQL
const cierre = await aDir.c.from('sgi_aprobacion').insert({ organizacion_id: A, proyecto_id: P, objeto_tipo: 'cierre_fase', fase: 2, decision: 'aprobado', rol: 'alta_direccion' }).select();
anota('alta dirección cierra la fase 2 sin cerrar las anteriores ni cubrir lo obligatorio', 'rechazado por la puerta en SQL', rechazado(cierre));
const faltan = await aDir.c.rpc('sgi_faltantes_puerta', { p_proyecto: P, p_fase: 2 });
anota('la puerta en SQL dice qué falta', 'lista con fase-1 y requisitos', Array.isArray(faltan.data) && (faltan.data as string[]).includes('fase-1'));

// Traza inmutable y anónimo
const t = await cons.c.from('sgi_traza').insert({ organizacion_id: A, proyecto_id: P, agente: 'documental', version_prompt: 'x', modelo: 'anthropic/claude-sonnet-5', ok: true, creado_por: cons.id }).select().single();
anota('el consultor registra una traza', 'se registra', !t.error);
anota('alguien edita la traza', '0 filas', rechazado(await aAdmin.c.from('sgi_traza').update({ ok: false }).eq('id', t.data!.id).select()));
anota('una traza con modelo «latest»', 'rechazado (C1)', rechazado(await cons.c.from('sgi_traza').insert({ organizacion_id: A, agente: 'documental', version_prompt: 'x', modelo: 'openrouter/latest', ok: true, creado_por: cons.id }).select()));
const anon = await clienteAnonimo(e).from('sgi_organizacion').select('id');
anota('sin sesión, alguien lista organizaciones', 'rechazado o vacío', !!anon.error || anon.data.length === 0);

// La base y el motor dicen lo mismo: quién aprueba qué (115 combinaciones) y el espejo del catálogo.
const combos: [string, number | null, Rol][] = [
  ...Object.keys(APROBADORES).flatMap((t) => ROLES.map((r) => [t, null, r] as [string, null, Rol])),
  ...FASES.flatMap((f) => ROLES.map((r) => ['cierre_fase', f, r] as [string, number, Rol])),
];
let difieren = 0;
for (const [tipo, fase, rol] of combos) {
  const db = await aAdmin.c.rpc('sgi_rol_aprueba', { p_tipo: tipo, p_fase: fase, p_rol: rol });
  const ts = puedeAprobar(tipo as TipoAprobable, rol, (fase ?? undefined) as never);
  if (db.error || Boolean(db.data) !== ts) difieren++;
}
anota(`quién aprueba qué: la base (sgi_rol_aprueba) contra el motor (APROBADORES/ROL_CIERRE), ${combos.length} combinaciones`, '0 diferencias', difieren === 0);
const req = await aAdmin.c.from('sgi_requisito').select('id, fase, obligatorio, familia');
const mapa = new Map((req.data ?? []).map((r) => [String(r.id), r]));
const deriva = CATALOGO.requisitos.filter((r) => { const x = mapa.get(r.id); return !x || x.fase !== r.fase || x.obligatorio !== (r.doc !== null) || x.familia !== r.familia; }).length + Math.max(0, mapa.size - CATALOGO.requisitos.length);
anota(`espejo del catálogo en la base (${mapa.size} filas) contra el catálogo (${CATALOGO.requisitos.length})`, 'sin deriva', deriva === 0);

console.log('| Comprobación | Esperado | Resultado |\n|---|---|---|');
for (const [q, esp, ok] of filas) console.log(`| ${q} | ${esp} | ${ok ? '✓' : '✗'} |`);
const fallas = filas.filter((f) => !f[2]).length;
mkdirSync('public/laboratorio-sgi', { recursive: true });
writeFileSync('public/laboratorio-sgi/rls.json', JSON.stringify({ cuando: new Date().toISOString(), base: 'supabase local (Docker)', filas }, null, 1));
console.log(`\n${filas.length - fallas}/${filas.length} en verde · 7 cuentas sintéticas @example.com, entrando con la llave anónima (sin service_role)`);
process.exit(fallas ? 1 : 0);
