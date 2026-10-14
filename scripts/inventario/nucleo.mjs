/**
 * Nucleo del inventario de activos (spec 014). Funciones puras sobre una lista de archivos:
 * el CLI les pasa lo que dice git y las pruebas un repo de juguete. Nada aqui escribe.
 *
 * Dos conceptos (SDD §2.2):
 *   - unidad: algo que existe en el repo y que una fuente declarada descubre
 *     (`tools/voz`, `scripts/audita-fugas.mjs`, `cli:polar`).
 *   - activo: la fila del indice. Cubre unidades con patrones; cada unidad, exactamente una.
 */
import { createHash } from 'node:crypto';

// Valores permitidos: copia de los `check` de `erp.act_activo` (005_activos.sql) y de las
// clases/estados de `activos/CATALOGO.md`. Si el ERP los cambia, las pruebas lo delatan.
export const TIPOS = ['software', 'config_agentica', 'datos', 'documento', 'infraestructura', 'licencia_suscripcion'];
export const CLASES = ['PRODUCTO', 'FABRICA', 'CONOCIMIENTO', 'DISEÑO', 'COMERCIAL', 'INFRA'];
export const ESTADOS = ['produccion', 'beta', 'blueprint'];
// El grado de un CLI (la nota de la imprenta) o «no medido»: sin grado no es aprobado, es no medido.
export const GRADOS = ['A', 'B', 'C', 'D', 'F', 'no medido'];

// El repo es publico: costo y clasificacion estrategica viajan al ERP, nunca a git (SDD §2.1).
const PROHIBIDO = /(costo|usd|monto|tokens|eje_?dei|defensib|clasificacion|capitaliz)/i;
// `producto`: el DUEÑO de la pieza, el producto que la mantiene (a lo sumo uno; productos/CONCEPTO.md §2); `grado`: el de un CLI.
const CAMPOS = ['id', 'nombre', 'tipo', 'clase', 'estado', 'ubicacion', 'responsable', 'origen',
  'descripcion', 'cubre', 'externo', 'producto', 'grado'];

/** Glob minimo: `*` no cruza `/`; el resto es literal. */
export function coincide(patron, texto) {
  const re = patron.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*');
  return new RegExp(`^${re}$`).test(texto);
}

/**
 * Unidades que una fuente descubre en la lista de archivos.
 * `dir/*\/` → cada subdirectorio · `dir/` → el directorio entero · otro → archivos por glob.
 */
export function unidadesDeFuente(fuente, archivos) {
  const { patron } = fuente;
  const out = new Set();
  if (patron.endsWith('*/')) {
    const base = patron.slice(0, -2);
    for (const a of archivos) {
      if (!a.startsWith(base)) continue;
      const resto = a.slice(base.length).split('/');
      if (resto.length > 1) out.add(base + resto[0]);
    }
  } else if (patron.endsWith('/')) {
    if (archivos.some((a) => a.startsWith(patron))) out.add(patron.slice(0, -1));
  } else {
    for (const a of archivos) if (coincide(patron, a)) out.add(a);
  }
  return out;
}

/** Todas las unidades: las de archivos y las de CLIs impresos del manifiesto. */
export function descubre(indice, archivos, clisImpresos = []) {
  const unidades = new Set();
  for (const f of indice.fuentes ?? []) {
    if (f.patron === 'cli-impreso') clisImpresos.forEach((s) => unidades.add(`cli:${s}`));
    else unidadesDeFuente(f, archivos).forEach((u) => unidades.add(u));
  }
  return [...unidades].sort();
}

/** Campos que no pueden estar en el indice, con su ruta (`activos[3].costo`). */
export function camposProhibidos(valor, ruta = '') {
  if (Array.isArray(valor)) return valor.flatMap((v, i) => camposProhibidos(v, `${ruta}[${i}]`));
  if (valor === null || typeof valor !== 'object') return [];
  return Object.entries(valor).flatMap(([k, v]) => {
    const aqui = ruta ? `${ruta}.${k}` : k;
    return [...(PROHIBIDO.test(k) ? [aqui] : []), ...camposProhibidos(v, aqui)];
  });
}

/** Errores de forma de cada asiento: campos, enums, ids unicos, origen existente. */
export function validaAsientos(indice, existe) {
  const errores = [];
  const vistos = new Set();
  for (const a of indice.activos ?? []) {
    const id = a.id ?? '(sin id)';
    const mal = (m) => errores.push(`${id}: ${m}`);
    if (!/^TPL-[a-z0-9-]+$/.test(a.id ?? '')) mal('id debe ser TPL-<slug-en-kebab-case>');
    if (vistos.has(a.id)) mal('id repetido');
    vistos.add(a.id);
    for (const k of Object.keys(a)) if (!CAMPOS.includes(k)) mal(`campo desconocido «${k}»`);
    for (const k of ['nombre', 'ubicacion', 'responsable']) if (!a[k]) mal(`falta ${k}`);
    if (!TIPOS.includes(a.tipo)) mal(`tipo «${a.tipo}» no es uno de ${TIPOS.join('|')}`);
    if (!CLASES.includes(a.clase)) mal(`clase «${a.clase}» no es una de ${CLASES.join('|')}`);
    if (!ESTADOS.includes(a.estado)) mal(`estado «${a.estado}» no es uno de ${ESTADOS.join('|')}`);
    if (!Array.isArray(a.cubre) || a.cubre.length === 0) mal('cubre debe listar al menos un patron');
    for (const o of [a.origen ?? []].flat()) if (!existe(o)) mal(`origen «${o}» no existe`);
    if (a.producto !== undefined && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.producto)) mal(`producto «${a.producto}» debe ser un slug en kebab-case`);
    if (a.grado !== undefined && !GRADOS.includes(a.grado)) mal(`grado «${a.grado}» no es uno de ${GRADOS.join('|')}`);
    if ((a.cubre ?? []).some((p) => /\/clis\//.test(p)) && a.grado === undefined) mal('un CLI declara su grado (o «no medido»): sin grado no es aprobado');
  }
  return errores;
}

/**
 * Cruza unidades con activos. Devuelve la cobertura y los hallazgos que ponen el gate en rojo:
 * NUEVO (unidad sin activo), AMBIGUO (unidad con dos) y HUERFANO (activo sin unidades o
 * con ubicacion inexistente).
 */
export function cruza(indice, unidades, existe) {
  const porActivo = new Map((indice.activos ?? []).map((a) => [a.id, []]));
  const disputados = new Set(); // dueno de una unidad AMBIGUA: no es ademas HUERFANO (ruido)
  const hallazgos = [];
  for (const u of unidades) {
    const duenos = (indice.activos ?? []).filter((a) => (a.cubre ?? []).some((p) => coincide(p, u)));
    if (duenos.length === 0) hallazgos.push({ tipo: 'NUEVO', unidad: u });
    else if (duenos.length > 1) {
      hallazgos.push({ tipo: 'AMBIGUO', unidad: u, activos: duenos.map((a) => a.id) });
      duenos.forEach((a) => disputados.add(a.id));
    }
    else porActivo.get(duenos[0].id).push(u);
  }
  for (const a of indice.activos ?? []) {
    const sinUnidades = porActivo.get(a.id).length === 0 && !disputados.has(a.id);
    const ubicacionRota = !a.externo && !existe(a.ubicacion);
    if (sinUnidades || ubicacionRota) {
      hallazgos.push({ tipo: 'HUERFANO', activo: a.id,
        motivo: ubicacionRota ? `la ubicacion ${a.ubicacion} no existe` : 'no cubre ninguna unidad' });
    }
  }
  return { porActivo, hallazgos };
}

/** Archivos que pertenecen a una unidad (la unidad es un archivo o un prefijo de directorio). */
export function archivosDeUnidad(unidad, archivos) {
  if (unidad.startsWith('cli:')) return [];
  return archivos.filter((a) => a === unidad || a.startsWith(`${unidad}/`));
}

/** Hash de contenido de un activo: sha256 de (ruta, sha256 del archivo), en orden. */
export function hashDeActivo(unidades, archivos, leeBytes) {
  const propios = unidades.flatMap((u) => archivosDeUnidad(u, archivos)).sort();
  if (propios.length === 0) return null;
  const h = createHash('sha256');
  for (const a of propios) {
    const bytes = leeBytes(a);
    if (bytes === null) continue; // listado por git pero borrado en el arbol
    h.update(`${a}\0${createHash('sha256').update(bytes).digest('hex')}\n`);
  }
  return h.digest('hex');
}

/** Activo al que pertenece un archivo, o null. Para atribuir commits (costeo). */
export function activoDeArchivo(archivo, porActivo) {
  for (const [id, unidades] of porActivo) {
    if (unidades.some((u) => archivo === u || archivo.startsWith(`${u}/`))) return id;
  }
  return null;
}
