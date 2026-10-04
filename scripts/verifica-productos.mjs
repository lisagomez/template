#!/usr/bin/env node
/**
 * Los productos del portafolio (concepto: `productos/CONCEPTO.md`; plantilla: `productos/PLANTILLA.md`).
 * Cada manifiesto `productos/<slug>.json` se cruza con lo que ya existe y nadie mantiene a mano:
 *
 *   - el índice del portafolio (`BUSINESS_LOGIC.md` raíz): su fila, su contrato y los activos que cita;
 *   - el inventario (`inventario/activos.json`): que lo que compone exista, que sus propios lo tengan de
 *     dueño (`producto`) y que ningún activo de ese dueño quede fuera;
 *   - las reglas que no se negocian: ningún precio sin plan comercial (ERP-7), RPO y RTO desconocidos
 *     hasta GATE 3, un canal externo exige C3 y C4, ningún agente aprueba, y el producto no está más
 *     avanzado que sus piezas.
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

export const ESTADOS = ['blueprint', 'beta', 'produccion'];
export const ENTREGAS = ['A', 'B', 'mixto', 'por decidir'];
/** Los campos de la plantilla (v1, de Soporte SAP). Un campo que no aplica se declara con su motivo, no se omite. */
export const CAMPOS = ['slug', 'nombre', 'version', 'estado', 'indice', 'contrato', 'modeloDeNegocio', 'niveles', 'tenencia', 'roles',
  'activos', 'canales', 'pricing', 'metricas', 'sla', 'entrega', 'respaldo', 'reuso', 'fde', 'fuera'];

const lee = (p) => { try { return readFileSync(join(RAIZ, p), 'utf8'); } catch { return null; } };
const existe = (p) => typeof p === 'string' && p.length > 0 && existsSync(join(RAIZ, p.split('#')[0]));

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

/** Las rutas que un manifiesto cita: todas tienen que existir. */
function rutas(m) {
  return [m.contrato?.ruta, m.contrato?.c3, m.contrato?.aisia, m.tenencia?.aislamiento?.prueba, m.metricas?.fuente, m.metricas?.catalogo,
    m.sla?.contratos, m.sla?.plantilla, m.respaldo?.inventario, m.respaldo?.evidenciaGate3, m.pricing?.fuente, m.pricing?.planComercial,
    m.fde?.registro, m.reuso?.matriz?.comando?.split(/\s+/).find((t) => /\.(m?js|ts)$/.test(t))].filter((r) => r !== null && r !== undefined);
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

  const fila = ctx.productos.find((p) => p.nombre === m.indice);
  comprueba('tiene su fila en el índice del portafolio', fila, `no hay fila «${m.indice}» en el §1 de BUSINESS_LOGIC.md`);
  if (fila) {
    const coincide = m.contrato?.ruta ? fila.contrato === m.contrato.ruta : fila.contrato === null && typeof m.contrato?.falta === 'string' && m.contrato.falta.length > 0;
    comprueba('su contrato es el que enlaza su fila (o ambos lo declaran pendiente con lo que falta)', coincide, `fila: ${fila.contrato ?? 'pendiente'} · manifiesto: ${m.contrato?.ruta ?? `pendiente (falta: ${m.contrato?.falta ?? '¿?'})`}`);
  }

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

  const faltanRutas = rutas(m).filter((r) => !ctx.existe(r));
  comprueba('cada ruta que cita existe', faltanRutas.length === 0, `no existen: ${faltanRutas.join(', ')}`);
  const externos = lista(m.canales).filter((k) => k.tipo === 'externo');
  comprueba('un canal externo exige C3 y C4 declarados', externos.length === 0 || (m.contrato?.c3 && m.contrato?.aisia), `canales externos ${externos.map((k) => k.id).join(', ')} sin C3 y AISIA`);
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
  return c;
}

/** El reuso de composición: cuánto de lo que compone ya existía como pieza (componentes + base). */
export function reusoDeComposicion(m) {
  const n = (k) => lista(m.activos?.[k]).length;
  const total = n('propios') + n('componentes') + n('base');
  return total ? Math.round(((n('componentes') + n('base')) / total) * 1000) / 10 : null;
}

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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ctx = contexto();
  const archivos = existsSync(join(RAIZ, DIR)) ? readdirSync(join(RAIZ, DIR)).filter((f) => f.endsWith('.json')).sort() : [];
  let rojas = 0;
  const declarados = new Set();
  if (!archivos.length) { console.log(rojo(`✗ no hay manifiestos en ${DIR}/`)); rojas++; }
  for (const a of archivos) {
    let m;
    try { m = JSON.parse(lee(`${DIR}/${a}`)); } catch (e) { console.log(rojo(`✗ ${a}: no es JSON (${e.message})`)); rojas++; continue; }
    declarados.add(m.indice);
    const c = verifica(m, ctx, a);
    const n = (k) => lista(m.activos?.[k]).length;
    console.log(`\n${m.nombre} (${DIR}/${a}) · ${m.estado} · propios ${n('propios')} · componentes ${n('componentes')} · base ${n('base')} · reuso de composición ${reusoDeComposicion(m)} %${m.reuso?.matriz ? ` · matriz ${m.reuso.matriz.amplio} % amplio / ${m.reuso.matriz.estricto} % estricto` : ''}`);
    for (const [nombre, ok, pista] of c) { console.log(`  ${ok ? verde('✓') : rojo('✗')} ${nombre}${ok ? '' : ` — ${pista}`}`); if (!ok) rojas++; }
  }
  const pendientes = ctx.productos.filter((p) => !declarados.has(p.nombre)).map((p) => p.nombre);
  if (pendientes.length) console.log(ambar(`\n${pendientes.length} producto(s) del índice sin manifiesto (pendientes, no cuentan como verde): ${pendientes.join(', ')}`));
  const malas = process.argv.includes('--sin-siembras') ? 0 : siembra(ctx);
  console.log(rojas || malas ? rojo(`\nProductos EN ROJO: ${rojas} comprobación(es) y ${malas} siembra(s).`) : verde(`\nProductos en verde: ${archivos.length} manifiesto(s), ${pendientes.length} pendiente(s) declarados.`));
  process.exit(rojas || malas ? 1 : 0);
}
