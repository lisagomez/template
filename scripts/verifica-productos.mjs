#!/usr/bin/env node
/**
 * Los productos del portafolio (concepto: `productos/CONCEPTO.md`; plantilla: `productos/PLANTILLA.md`).
 * Cada manifiesto `productos/<slug>.json` se cruza con lo que ya existe y nadie mantiene a mano:
 *
 *   - el índice del portafolio (`BUSINESS_LOGIC.md` raíz): su fila, su contrato y los activos que cita;
 *   - el inventario (`inventario/activos.json`): que lo que compone exista, que sus propios lo tengan de
 *     dueño (`producto`) y que ningún activo de ese dueño quede fuera;
 *   - las reglas que no se negocian: ningún precio sin plan comercial (ERP-7), RPO y RTO desconocidos
 *     hasta GATE 3, un canal externo exige C3 y C4, un tercero que recibe datos personales exige AISIA,
 *     ningún agente aprueba, y el producto no está más avanzado que sus piezas;
 *   - los huecos (v2): un campo en null dice lo que falta, una sección que no aplica dice por qué, y lo
 *     que el producto tiene y la plantilla no recoge se escribe en `noCupo` con su propuesta;
 *   - la retención (v4): sale de una decisión y, decidida, dice cómo sale un tenant, cómo no lo resucita una
 *     restauración y hasta cuándo llega el borrado a las copias (el tope que `configura:deploy` compara).
 *
 * Una fila del índice sin manifiesto es PENDIENTE (se lista, no pone rojo), como un contrato pendiente.
 * Después de verificar, siembra cada defecto sobre una copia del manifiesto de referencia y exige que su
 * comprobación caiga: un gate que no se pone rojo cuando debe no cuenta.
 *
 * Uso: node scripts/verifica-productos.mjs            (verifica y siembra)
 *      node scripts/verifica-productos.mjs --sin-siembras
 * Exit: 0 en verde · 1 en rojo.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIR = 'productos';
const REFERENCIA = 'soporte-sap';
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const ambar = (s) => `\x1b[33m${s}\x1b[0m`;

/** La versión vigente de la plantilla (su historia, en `productos/PLANTILLA.md`). */
export const PLANTILLA = 4;
export const ESTADOS = ['blueprint', 'beta', 'produccion'];
export const ENTREGAS = ['A', 'B', 'mixto', 'por decidir'];
/** La naturaleza de una cifra: el vocabulario común de los dos productos («ficticio» del vendedor es «supuesto»). */
export const NATURALEZAS = ['medido', 'supuesto', 'fuente', 'por decidir'];
/** Los campos de la plantilla. Un campo que no aplica se declara con su motivo, no se omite. */
export const CAMPOS = ['plantilla', 'slug', 'nombre', 'version', 'estado', 'indice', 'contrato', 'modeloDeNegocio', 'niveles', 'tenencia',
  'roles', 'activos', 'canales', 'terceros', 'pricing', 'metricas', 'sla', 'entrega', 'respaldo', 'retencion', 'despliegue', 'reuso', 'fde', 'fuera', 'noCupo'];
/** Lo que no puede quedar en null sin decir qué falta (`<sección>.falta`). */
export const REQUERIDOS = [['tenencia', 'aislamiento.prueba'], ['metricas', 'fuente'], ['sla', 'contratos'], ['respaldo', 'inventario'],
  ['retencion', 'plazos'], ['despliegue', 'tamanos'], ['pricing', 'fuente'], ['reuso', 'matriz'], ['fde', 'registro']];
/** Cómo se despliega (v3, PRP-010 DP-5): en la infraestructura que opera el laboratorio o en la máquina de quien la pone. */
export const MODOS = ['gestionado', 'despacho'];
/** El archivo legal de la casa (FASE0 §9.3 y §9.4): el anual va con un bloqueo de 2555 días (7 años). */
export const ARCHIVO_LEGAL_DIAS = 2555;
/** Las secciones que pueden declararse `{ "aplica": false, "motivo": … }`: solo las que un producto ya necesitó. */
export const PUEDEN_NO_APLICAR = ['sla'];

const lee = (p) => { try { return readFileSync(join(RAIZ, p), 'utf8'); } catch { return null; } };
const existe = (p) => typeof p === 'string' && p.length > 0 && existsSync(join(RAIZ, p.split('#')[0]));
const texto = (x) => typeof x === 'string' && x.trim().length > 0;
const en = (obj, ruta) => ruta.split('.').reduce((o, k) => (o === null || o === undefined ? o : o[k]), obj);

/** Las filas del §n del índice como celdas (la misma lectura que `verify:gobernanza`). */
export function filasDeSeccion(indice, n) {
  const seccion = indice.split(/^## /m).find((s) => s.startsWith(`${n}.`)) ?? '';
  return seccion.split('\n').filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l)).slice(1)
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
}
const ids = (celda = '') => celda.match(/TPL-[a-z0-9-]+/g) ?? [];
const enlace = (celda = '') => celda.replace(/`[^`]*`/g, (s) => (s.includes('](') ? '' : s)).match(/\]\(([^)]+)\)/)?.[1] ?? null;

/** Lo que el gate necesita del repo, en un objeto que las siembras pueden alterar sin tocar el disco. */
export function contexto() {
  const indice = lee('BUSINESS_LOGIC.md') ?? '';
  const productos = filasDeSeccion(indice, 1).map(([nombre, contrato, activos, estado]) => ({ nombre, contrato: enlace(contrato), activos: ids(activos), estado: estado ?? '' }));
  const base = filasDeSeccion(indice, 2).flatMap(([activos]) => ids(activos));
  let inventario = [];
  try { inventario = JSON.parse(lee('inventario/activos.json')).activos; } catch { inventario = []; }
  return { productos, base, inventario, existe };
}

const lista = (x) => (Array.isArray(x) ? x : []);
const idDe = (x) => (typeof x === 'string' ? x : x?.id);
const noAplica = (m, s) => m?.[s]?.aplica === false;

/** Las rutas que un manifiesto cita: todas tienen que existir. */
function rutas(m) {
  return [m.contrato?.ruta, m.contrato?.c3, m.contrato?.aisia, m.tenencia?.aislamiento?.prueba, m.metricas?.fuente, m.metricas?.catalogo,
    m.sla?.contratos, m.sla?.plantilla, m.respaldo?.inventario, m.respaldo?.evidenciaGate3, m.pricing?.fuente, m.pricing?.planComercial,
    m.fde?.registro, m.retencion?.plazos, m.despliegue?.tamanos?.fuente, m.reuso?.matriz?.comando?.split(/\s+/).find((t) => /\.(m?js|ts)$/.test(t)),
    ...lista(m.terceros).map((t) => t?.costo?.fuente)].filter((r) => r !== null && r !== undefined);
}

/** Su fila en el índice y su contrato. */
function verificaIndice(m, ctx, comprueba) {
  const fila = ctx.productos.find((p) => p.nombre === m.indice);
  comprueba('tiene su fila en el índice del portafolio', fila, `no hay fila «${m.indice}» en el §1 de BUSINESS_LOGIC.md`);
  if (fila) {
    const coincide = m.contrato?.ruta ? fila.contrato === m.contrato.ruta : fila.contrato === null && texto(m.contrato?.falta);
    comprueba('su contrato es el que enlaza su fila (o ambos lo declaran pendiente con lo que falta)', coincide, `fila: ${fila.contrato ?? 'pendiente'} · manifiesto: ${m.contrato?.ruta ?? `pendiente (falta: ${m.contrato?.falta ?? '¿?'})`}`);
  }
  return fila;
}

/** Lo que compone: existe, no se solapa, y cada pieza está en la lista que le toca según su dueño. */
function verificaComposicion(m, ctx, fila, comprueba) {
  const propios = lista(m.activos.propios).map(idDe), componentes = lista(m.activos.componentes).map(idDe), base = lista(m.activos.base).map(idDe);
  const todos = [...propios, ...componentes, ...base];
  const inv = new Map(ctx.inventario.map((a) => [a.id, a]));
  const inexistentes = todos.filter((id) => !inv.has(id));
  comprueba('todo activo que compone existe en el inventario', inexistentes.length === 0, `no existen: ${inexistentes.join(', ')}`);
  const repetidos = todos.filter((id, k) => todos.indexOf(id) !== k);
  comprueba('propios, componentes y base no se solapan', repetidos.length === 0, `en dos listas: ${[...new Set(repetidos)].join(', ')}`);
  const ajenos = propios.filter((id) => inv.has(id) && inv.get(id).producto !== m.slug);
  comprueba('cada propio tiene a este producto de dueño en el inventario', ajenos.length === 0, `${ajenos.join(', ')}: su «producto» no es «${m.slug}»`);
  const fuera = ctx.inventario.filter((a) => a.producto === m.slug && !propios.includes(a.id)).map((a) => a.id);
  comprueba('todo activo de este dueño está en el manifiesto', fuera.length === 0, `con producto «${m.slug}» y fuera de los propios: ${fuera.join(', ')}`);
  const deOtros = new Set(ctx.productos.filter((p) => p.nombre !== m.indice).flatMap((p) => p.activos));
  const sinDueno = componentes.filter((id) => !deOtros.has(id));
  comprueba('cada componente es propio de otro producto del índice', sinDueno.length === 0, `${sinDueno.join(', ')}: no está en la fila de otro producto (¿es base?)`);
  const enFilas = new Set(ctx.productos.flatMap((p) => p.activos));
  const baseConDueno = base.filter((id) => enFilas.has(id));
  comprueba('la base no es de ningún producto', baseConDueno.length === 0, `${baseConDueno.join(', ')}: está en una fila del §1 (es componente)`);
  if (fila) {
    const noCompuestos = fila.activos.filter((id) => !propios.includes(id));
    comprueba('la fila del índice solo cita propios del manifiesto', noCompuestos.length === 0, `la fila cita ${noCompuestos.join(', ')} y el manifiesto no los tiene de propios`);
  }
  const orden = (e) => ESTADOS.indexOf(e);
  const piezas = propios.filter((id) => inv.has(id)).map((id) => inv.get(id).estado);
  const menor = piezas.reduce((a, e) => (orden(e) < orden(a) ? e : a), 'produccion');
  comprueba('el producto no está más avanzado que sus piezas', piezas.length === 0 || orden(m.estado) <= orden(menor), `producto en «${m.estado}» con un propio en «${menor}»`);
}

/** Lo que no se negocia: canales, terceros, agentes, precio, respaldo y entrega. */
function verificaReglas(m, ctx, comprueba) {
  const faltanRutas = rutas(m).filter((r) => !ctx.existe(r));
  comprueba('cada ruta que cita existe', faltanRutas.length === 0, `no existen: ${faltanRutas.join(', ')}`);
  const externos = lista(m.canales).filter((k) => k.tipo === 'externo');
  comprueba('un canal externo exige C3 y C4 declarados', externos.length === 0 || (m.contrato?.c3 && m.contrato?.aisia), `canales externos ${externos.map((k) => k.id).join(', ')} sin C3 y AISIA`);
  const conDatos = lista(m.terceros).filter((t) => t?.datosPersonales === true);
  comprueba('un tercero que recibe datos personales exige AISIA', conDatos.length === 0 || m.contrato?.aisia, `${conDatos.map((t) => t.quien).join(', ')} reciben datos personales y no hay AISIA (C4)`);
  const agentesQueAprueban = lista(m.roles).filter((r) => r.tipo === 'agente' && r.aprueba !== false).map((r) => r.id);
  comprueba('ningún agente aprueba', agentesQueAprueban.length === 0, `${agentesQueAprueban.join(', ')}: un agente propone, una persona aprueba`);
  const p = m.pricing ?? {};
  const precioSinPlan = (p.precio !== null || p.modeloDeCobro !== null) && !p.planComercial;
  comprueba('ningún precio sin plan comercial (ERP-7)', !precioSinPlan, 'precio o modelo de cobro sin plan comercial: van en null y «por decidir»');
  const r = m.respaldo ?? {};
  comprueba('RPO y RTO desconocidos hasta GATE 3', r.rpoRto === 'desconocidos' || (r.gate3 === true && r.evidenciaGate3), `rpoRto «${r.rpoRto}» sin GATE 3 cerrado`);
  comprueba('la frontera de entrega es A, B, mixto o por decidir', ENTREGAS.includes(m.entrega?.modelo), `entrega «${m.entrega?.modelo}»`);
  const f = m.fde ?? {};
  comprueba('declara su frontera FDE (a medida y núcleo)', lista(f.aMedida).length > 0 && lista(f.nucleo).length > 0 && typeof f.vuelta === 'string', 'aMedida y nucleo con al menos una pieza, y cómo vuelve lo a medida al núcleo');
  comprueba('dice lo que no hace', lista(m.fuera).length > 0, 'un producto sin «qué no hace» promete de más');
}

/**
 * El despliegue (v3): REQUISITOS, no proveedores. La tabla de planes de un proveedor envejece sin que nadie lo note; el
 * proveedor y la región de una instalación son un dato de su `.env.production`, y la máquina se mide (`configura:deploy`).
 */
function verificaDespliegue(m, ctx, comprueba) {
  const d = m.despliegue;
  if (!d || noAplica(m, 'despliegue')) return;
  const deProveedor = Object.keys(d).filter((k) => /proveedor|planes|precio/i.test(k));
  comprueba('el despliegue declara requisitos, no proveedores', deProveedor.length === 0, `${deProveedor.join(', ')}: el proveedor y la región de una instalación van en su .env.production, no en el producto`);
  comprueba('los modos de despliegue son gestionado o despacho', lista(d.modos).length > 0 && lista(d.modos).every((x) => MODOS.includes(x)), `modos ${JSON.stringify(d.modos)}`);
  const maquina = (x) => x && [x.vcpu, x.ramGb, x.discoGb].every((n) => typeof n === 'number' && n > 0);
  const t = d.tamanos;
  comprueba('cada tamaño declara su máquina (vCPU, RAM y disco) y su fuente', t === null || (['S', 'M', 'L'].every((k) => maquina(t?.[k])) && ctx.existe(t?.fuente)), 'S, M y L con vcpu, ramGb y discoGb mayores que cero, y la fuente que los mide');
  comprueba('el despliegue exige respaldo inmutable fuera de sitio', d.exige?.respaldo === 'inmutable-fuera-de-sitio', `respaldo «${d.exige?.respaldo}»: no hay respaldo implícito (FASE0 §9)`);
  const r = d.exige?.region;
  comprueba('la región sale de una decisión, abierta o decidida con sus regiones', texto(r?.decision) && (r?.estado === 'abierta' || (r?.estado === 'decidida' && lista(r?.regiones).length > 0)), 'region { decision, estado: abierta, o decidida con sus regiones }');
  comprueba('dice quién lo opera y qué decisión lo fija', texto(d.opera?.quien) && texto(d.opera?.decision), 'opera { quien, decision }');
  const malos = lista(d.secretos).filter((x) => typeof x !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(x) || x.startsWith('NEXT_PUBLIC_'));
  comprueba('los secretos del producto son variables de servidor', Array.isArray(d.secretos) && malos.length === 0, `${malos.join(', ')}: un secreto con NEXT_PUBLIC_ se inlinea en el bundle del navegador`);
}

/**
 * La retención (v4, PRP-012 DP-1): cuánto viven los datos y cuándo deja de haberlos, también en las copias. Decidida,
 * dice cómo sale un tenant, cómo no lo resucita una restauración y el tope del bloqueo de respaldo, y ese tope no puede
 * prometer menos de lo que dura el archivo legal si los datos entran a él. Nunca «no aplica»: todo producto guarda algo.
 */
function verificaRetencion(m, comprueba) {
  const r = m.retencion;
  if (!r || noAplica(m, 'retencion')) return;
  comprueba('la retención sale de una decisión', texto(r.decision), 'retencion.decision: la decisión que fija los plazos, abierta o tomada');
  if (r.plazos === null || r.plazos === undefined) return;
  const tope = r.bloqueoMaximoDias;
  comprueba('una retención decidida dice cómo sale un tenant, cómo no lo resucita una restauración y hasta cuándo llega el borrado a las copias',
    texto(r.salida) && texto(r.restauracion) && Number.isInteger(tope) && tope >= 1 && typeof r.archivoLegal === 'boolean',
    'salida y restauracion con texto, bloqueoMaximoDias entero ≥ 1 y archivoLegal true o false');
  comprueba('el tope del bloqueo cubre el archivo legal', r.archivoLegal !== true || tope >= ARCHIVO_LEGAL_DIAS,
    `archivoLegal con un tope de ${tope} días: el archivo legal guarda ${ARCHIVO_LEGAL_DIAS}, y el borrado no llega antes`);
}

/** Los huecos (v2): nulls con lo que falta, secciones que no aplican con su motivo, terceros completos, lo que no cupo. */
function verificaHuecos(m, ctx, comprueba) {
  comprueba('sigue la versión vigente de la plantilla', m.plantilla === PLANTILLA, `plantilla v${m.plantilla}: migra a la v${PLANTILLA} (productos/PLANTILLA.md, «Historia de la plantilla»)`);
  const declaradas = CAMPOS.filter((s) => noAplica(m, s));
  const malDeclaradas = declaradas.filter((s) => !PUEDEN_NO_APLICAR.includes(s) || !texto(m[s].motivo));
  comprueba('una sección que no aplica dice por qué, y solo si puede no aplicar', malDeclaradas.length === 0, `${malDeclaradas.join(', ')}: solo ${PUEDEN_NO_APLICAR.join(', ')} puede no aplicar, y con su «motivo»`);
  const callados = REQUERIDOS.filter(([s, campo]) => !(noAplica(m, s) && PUEDEN_NO_APLICAR.includes(s)) && (en(m[s], campo) === null || en(m[s], campo) === undefined) && !texto(m[s]?.falta)).map(([s, campo]) => `${s}.${campo}`);
  comprueba('cada campo en null dice lo que falta', callados.length === 0, `${callados.join(', ')} en null sin «falta» en su sección: un null no es un dato`);
  const incompletos = lista(m.terceros).filter((t) => !texto(t?.quien) || !texto(t?.recibe) || !texto(t?.decision) || typeof t?.datosPersonales !== 'boolean' || !NATURALEZAS.includes(t?.costo?.naturaleza) || !texto(t?.costo?.fuente));
  comprueba('cada tercero dice qué recibe, qué decisión lo fija y qué cuesta', Array.isArray(m.terceros) && incompletos.length === 0, `${incompletos.map((t) => t?.quien ?? '¿?').join(', ')}: quien, recibe, datosPersonales, decision y costo { naturaleza (${NATURALEZAS.join(' · ')}), fuente }`);
  const sinEvidencia = lista(m.noCupo).filter((n) => !texto(n?.que) || !texto(n?.propuesta) || !ctx.existe(n?.donde));
  comprueba('lo que no cupo dice qué, dónde y qué se propone', Array.isArray(m.noCupo) && sinEvidencia.length === 0, `${sinEvidencia.map((n) => n?.que ?? '¿?').join(', ')}: que, donde (una ruta que existe) y propuesta`);
}

/** Las comprobaciones de un manifiesto. Cada una: [nombre, ok, pista]. */
export function verifica(m, ctx, archivo = `${m?.slug}.json`) {
  const c = [];
  const comprueba = (nombre, ok, pista) => c.push([nombre, Boolean(ok), ok ? '' : pista]);
  const faltan = CAMPOS.filter((k) => m?.[k] === undefined || m?.[k] === null);
  comprueba('el manifiesto tiene todos los campos de la plantilla', faltan.length === 0, `faltan: ${faltan.join(', ')} (un campo que no aplica se declara con su motivo)`);
  if (faltan.includes('activos') || faltan.includes('slug')) return c;
  comprueba('el slug es kebab-case y es el nombre del archivo', /^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.slug) && archivo === `${m.slug}.json`, `slug «${m.slug}» en ${archivo}`);
  comprueba('el estado es blueprint, beta o produccion', ESTADOS.includes(m.estado), `estado «${m.estado}»`);
  const fila = verificaIndice(m, ctx, comprueba);
  verificaComposicion(m, ctx, fila, comprueba);
  verificaReglas(m, ctx, comprueba);
  verificaHuecos(m, ctx, comprueba);
  verificaRetencion(m, comprueba);
  verificaDespliegue(m, ctx, comprueba);
  return c;
}

/** Lo que el manifiesto declara pendiente: campos con «falta», secciones que no aplican y lo que no cupo. */
export function pendientesDe(m) {
  const faltas = [...new Set(REQUERIDOS.map(([s]) => s))].filter((s) => texto(m?.[s]?.falta)).map((s) => `falta (${s}): ${m[s].falta}`);
  const noAplican = CAMPOS.filter((s) => noAplica(m, s)).map((s) => `no aplica (${s}): ${m[s].motivo}`);
  const noCupo = lista(m?.noCupo).map((n) => `no cupo: ${n.que} → ${n.propuesta}`);
  return [...faltas, ...noAplican, ...noCupo];
}

/** El reuso de composición: cuánto de lo que compone ya existía como pieza (componentes + base). */
export function reusoDeComposicion(m) {
  const n = (k) => lista(m.activos?.[k]).length;
  const total = n('propios') + n('componentes') + n('base');
  return total ? Math.round(((n('componentes') + n('base')) / total) * 1000) / 10 : null;
}

const tercero = (cambios) => ({ quien: 'un tercero', recibe: 'algo', datosPersonales: false, decision: 'D0', costo: { naturaleza: 'por decidir', fuente: 'tools/soporte-sap/src/pricing.ts' }, ...cambios });

/** Las siembras: cada defecto sobre una copia del manifiesto de referencia, con la comprobación que debe caer. */
export const SIEMBRAS = [
  ['falta un campo de la plantilla (pricing)', (m) => { delete m.pricing; }, 'el manifiesto tiene todos los campos de la plantilla'],
  ['un precio inventado sin plan comercial', (m) => { m.pricing.precio = 1500; }, 'ningún precio sin plan comercial (ERP-7)'],
  ['un activo que no existe', (m) => { m.activos.propios.push('TPL-no-existe'); }, 'todo activo que compone existe en el inventario'],
  ['un propio de otro dueño', (m) => { m.activos.propios.push('TPL-reel'); }, 'cada propio tiene a este producto de dueño en el inventario'],
  ['un CLI del producto fuera del manifiesto', (m) => { m.activos.propios = m.activos.propios.filter((id) => !/^TPL-cli-/.test(id)); }, 'todo activo de este dueño está en el manifiesto'],
  ['un componente que no es de nadie', (m) => { m.activos.componentes.push({ id: 'TPL-motor-ia', para: 'x' }); }, 'cada componente es propio de otro producto del índice'],
  ['una base que es de un producto', (m) => { m.activos.base.push({ id: 'TPL-reel', para: 'x' }); }, 'la base no es de ningún producto'],
  ['el mismo activo propio y componente', (m) => { m.activos.componentes.push({ id: m.activos.propios[0], para: 'x' }); }, 'propios, componentes y base no se solapan'],
  ['un canal externo sin C3', (m) => { m.canales.push({ id: 'whatsapp', tipo: 'externo', que: 'x' }); m.contrato.c3 = null; }, 'un canal externo exige C3 y C4 declarados'],
  ['RPO y RTO con cifra antes de GATE 3', (m) => { m.respaldo.rpoRto = 'RPO 15 min · RTO 4 h'; }, 'RPO y RTO desconocidos hasta GATE 3'],
  ['un contrato que no existe', (m) => { m.contrato.aisia = 'docs/no-existe.md'; }, 'cada ruta que cita existe'],
  ['una fila del índice que no existe', (m) => { m.indice = 'Soporte SAP Plus'; }, 'tiene su fila en el índice del portafolio'],
  ['un agente que aprueba', (m) => { m.roles.push({ id: 'agente-x', tipo: 'agente', nivel: 'N1', aprueba: true }); }, 'ningún agente aprueba'],
  ['el producto en producción con piezas en blueprint', (m) => { m.estado = 'produccion'; }, 'el producto no está más avanzado que sus piezas'],
  ['una frontera de entrega que no existe', (m) => { m.entrega.modelo = 'híbrido'; }, 'la frontera de entrega es A, B, mixto o por decidir'],
  ['sin frontera FDE', (m) => { m.fde.nucleo = []; }, 'declara su frontera FDE (a medida y núcleo)'],
  ['sin «qué no hace»', (m) => { m.fuera = []; }, 'dice lo que no hace'],
  ['un slug que no es el del archivo', (m) => { m.slug = 'soporte-sap-2'; }, 'el slug es kebab-case y es el nombre del archivo'],
  // v2: lo que el segundo producto (el vendedor en WhatsApp) destapó
  ['un manifiesto de la plantilla v1', (m) => { m.plantilla = 1; }, 'sigue la versión vigente de la plantilla'],
  ['el inventario de respaldo en null sin decir qué falta', (m) => { m.respaldo.inventario = null; }, 'cada campo en null dice lo que falta'],
  ['el respaldo declarado «no aplica»', (m) => { m.respaldo = { aplica: false, motivo: 'no guardamos nada' }; }, 'una sección que no aplica dice por qué, y solo si puede no aplicar'],
  ['un SLA que no aplica sin motivo', (m) => { m.sla = { aplica: false }; }, 'una sección que no aplica dice por qué, y solo si puede no aplicar'],
  ['un tercero con datos personales sin AISIA', (m) => { m.contrato.aisia = null; m.terceros.push(tercero({ quien: 'un proveedor de LLM', datosPersonales: true })); }, 'un tercero que recibe datos personales exige AISIA'],
  ['un tercero sin la decisión que lo fija', (m) => { m.terceros.push(tercero({ decision: '' })); }, 'cada tercero dice qué recibe, qué decisión lo fija y qué cuesta'],
  ['un costo con la naturaleza de otro vocabulario («ficticio»)', (m) => { m.terceros[0].costo.naturaleza = 'ficticio'; }, 'cada tercero dice qué recibe, qué decisión lo fija y qué cuesta'],
  ['algo que no cupo sin evidencia', (m) => { m.noCupo.push({ que: 'x', donde: 'docs/no-existe.md', propuesta: 'y' }); }, 'lo que no cupo dice qué, dónde y qué se propone'],
  // v3: el despliegue (PRP-010 DP-5)
  ['un manifiesto sin despliegue', (m) => { delete m.despliegue; }, 'el manifiesto tiene todos los campos de la plantilla'],
  ['un despliegue que nombra a su proveedor', (m) => { m.despliegue.proveedor = 'el de siempre'; }, 'el despliegue declara requisitos, no proveedores'],
  ['un modo de despliegue que no existe', (m) => { m.despliegue.modos.push('kubernetes'); }, 'los modos de despliegue son gestionado o despacho'],
  ['un tamaño sin su máquina', (m) => { delete m.despliegue.tamanos.L; }, 'cada tamaño declara su máquina (vCPU, RAM y disco) y su fuente'],
  ['los tamaños en null sin decir qué falta', (m) => { m.despliegue.tamanos = null; }, 'cada campo en null dice lo que falta'],
  ['un respaldo que no es inmutable fuera de sitio', (m) => { m.despliegue.exige.respaldo = 'snapshot del proveedor'; }, 'el despliegue exige respaldo inmutable fuera de sitio'],
  ['una región «decidida» sin regiones', (m) => { m.despliegue.exige.region.estado = 'decidida'; }, 'la región sale de una decisión, abierta o decidida con sus regiones'],
  ['sin la decisión de quién lo opera', (m) => { m.despliegue.opera.decision = ''; }, 'dice quién lo opera y qué decisión lo fija'],
  ['un secreto con NEXT_PUBLIC_', (m) => { m.despliegue.secretos.push('NEXT_PUBLIC_SS_SECRETO_TAREAS'); }, 'los secretos del producto son variables de servidor'],
  // v4: la retención (PRP-012 DP-1)
  ['un manifiesto sin retención', (m) => { delete m.retencion; }, 'el manifiesto tiene todos los campos de la plantilla'],
  ['la retención declarada «no aplica»', (m) => { m.retencion = { aplica: false, motivo: 'no guardamos nada' }; }, 'una sección que no aplica dice por qué, y solo si puede no aplicar'],
  ['los plazos de retención en null sin decir qué falta', (m) => { m.retencion.plazos = null; }, 'cada campo en null dice lo que falta'],
  ['unos plazos en una ruta que no existe', (m) => { m.retencion.plazos = 'tools/no-existe.ts'; }, 'cada ruta que cita existe'],
  ['una retención sin la decisión que la fija', (m) => { m.retencion.decision = ''; }, 'la retención sale de una decisión'],
  ['una retención decidida sin tope de bloqueo', (m) => { m.retencion.bloqueoMaximoDias = null; }, 'una retención decidida dice cómo sale un tenant, cómo no lo resucita una restauración y hasta cuándo llega el borrado a las copias'],
  ['una retención decidida que no dice cómo no resucita', (m) => { m.retencion.restauracion = ''; }, 'una retención decidida dice cómo sale un tenant, cómo no lo resucita una restauración y hasta cuándo llega el borrado a las copias'],
  ['los datos en el archivo legal con un tope de un año', (m) => { m.retencion.archivoLegal = true; }, 'el tope del bloqueo cubre el archivo legal'],
];

function siembra(ctx) {
  const base = JSON.parse(lee(`${DIR}/${REFERENCIA}.json`));
  let malas = 0;
  console.log(`\nSiembras sobre ${DIR}/${REFERENCIA}.json (cada defecto debe tumbar su comprobación):`);
  for (const [que, rompe, caza] of SIEMBRAS) {
    const m = structuredClone(base);
    rompe(m);
    const c = verifica(m, ctx, `${REFERENCIA}.json`).find(([n]) => n === caza);
    const cae = c !== undefined && c[1] === false;
    if (!cae) malas++;
    console.log(`  ${cae ? verde('✓ cae') : rojo('✗ NO cae')}  ${que} → «${caza}»`);
  }
  console.log(malas ? rojo(`${malas} siembra(s) no cayeron: el gate no muerde`) : verde(`${SIEMBRAS.length}/${SIEMBRAS.length} siembras cazadas`));
  return malas;
}

function corre() {
  const ctx = contexto();
  const archivos = existsSync(join(RAIZ, DIR)) ? readdirSync(join(RAIZ, DIR)).filter((f) => f.endsWith('.json')).sort() : [];
  let rojas = 0, noCupieron = 0;
  const declarados = new Set();
  if (!archivos.length) { console.log(rojo(`✗ no hay manifiestos en ${DIR}/`)); rojas++; }
  for (const a of archivos) {
    let m;
    try { m = JSON.parse(lee(`${DIR}/${a}`)); } catch (e) { console.log(rojo(`✗ ${a}: no es JSON (${e.message})`)); rojas++; continue; }
    declarados.add(m.indice);
    const c = verifica(m, ctx, a);
    const n = (k) => lista(m.activos?.[k]).length;
    console.log(`\n${m.nombre} (${DIR}/${a}) · plantilla v${m.plantilla} · ${m.estado} · propios ${n('propios')} · componentes ${n('componentes')} · base ${n('base')} · terceros ${lista(m.terceros).length} · reuso de composición ${reusoDeComposicion(m)} %${m.reuso?.matriz ? ` · matriz ${m.reuso.matriz.amplio} % amplio / ${m.reuso.matriz.estricto} % estricto` : ''}`);
    for (const [nombre, ok, pista] of c) { console.log(`  ${ok ? verde('✓') : rojo('✗')} ${nombre}${ok ? '' : ` — ${pista}`}`); if (!ok) rojas++; }
    for (const p of pendientesDe(m)) console.log(ambar(`  · ${p}`));
    noCupieron += lista(m.noCupo).length;
  }
  const pendientes = ctx.productos.filter((p) => !declarados.has(p.nombre)).map((p) => p.nombre);
  if (pendientes.length) console.log(ambar(`\n${pendientes.length} producto(s) del índice sin manifiesto (pendientes, no cuentan como verde): ${pendientes.join(', ')}`));
  const malas = process.argv.includes('--sin-siembras') ? 0 : siembra(ctx);
  console.log(rojas || malas ? rojo(`\nProductos EN ROJO: ${rojas} comprobación(es) y ${malas} siembra(s).`) : verde(`\nProductos en verde (plantilla v${PLANTILLA}): ${archivos.length} manifiesto(s), ${pendientes.length} pendiente(s) declarados, ${noCupieron} cosa(s) que no cupieron, propuestas.`));
  process.exit(rojas || malas ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) corre();
