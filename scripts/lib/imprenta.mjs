/**
 * Nucleo de la auditoria de la imprenta de CLIs — la logica PURA, importable y probada.
 *
 * Vive aparte de `audita-imprenta.mjs` por la misma razon que `contabilidad.ts` vive aparte
 * de su prueba: lo que se prueba tiene que ser **el modulo real** que corre en el gate, no
 * una copia en la suite que se desincroniza al primer cambio.
 *
 * Cada funcion de aqui existe porque en el proyecto de origen fallo, con fecha. Los
 * comentarios nombran el fallo: son la unica forma de que el proximo que "simplifique" esto
 * sepa lo que esta desarmando. Lo prueba `scripts/prueba-imprenta.mjs`, dentro de
 * `npm run validate`.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Subdominios que NO identifican a la API. Sin esto `docs.hetzner.cloud` -> `docs`, que no
 * casa con nada impreso: en el origen, hetzner salio como "FALTA" en cada corrida desde el
 * 2026-07-04 estando impreso.
 */
const SUBDOMINIOS_GENERICOS = new Set(['docs', 'doc', 'api', 'developer', 'developers', 'dev']);
const TLDS = new Set(['www', 'com', 'sh', 'io', 'org', 'dev', 'net', 'cloud', 'ai', 'co']);

/** Nombre -> slug. Un nombre literal se minuscula; una URL se reduce al host significativo. */
export function normalizaSlug(nombre) {
  const s = String(nombre ?? '');
  if (!s.includes('://')) return s.toLowerCase();
  let host = s.replace(/^https?:\/\//, '').split('/')[0].split(':')[0]; // el puerto no identifica
  const partes = host.split('.').filter((p) => !TLDS.has(p));
  const significativas = partes.filter((p) => !SUBDOMINIOS_GENERICOS.has(p));
  const elegidas = significativas.length > 0 ? significativas : partes;
  return (elegidas[0] ?? host).toLowerCase();
}

/**
 * Entrada impresa que corresponde a un slug, o `null`. Tolera el sufijo descriptivo que la
 * imprenta agrega desde el display name (`telegram` -> directorio `telegram-bot`).
 */
export function casa(slug, impresos) {
  if (slug in impresos) return impresos[slug];
  for (const [nombre, info] of Object.entries(impresos)) {
    if (nombre.startsWith(slug + '-') || slug.startsWith(nombre + '-')) return info;
  }
  return null;
}

/**
 * Completa con el indice el grado que la libreria no puede medir. Lo medido AHORA manda; lo
 * no medible se hereda MARCADO como tal y **nunca se degrada a null en silencio**: en el
 * origen una regeneracion ingenua borro grados ya medidos (A/87 -> null, 2026-07-26).
 */
export function heredaGrados(deLibreria, delIndice) {
  for (const [slug, datos] of Object.entries(deLibreria)) {
    if (datos.grade !== null && datos.grade !== undefined) continue;
    // Se elige el candidato que TENGA grado, no el primero que exista: un objeto con
    // `grade: null` es truthy, asi que un `or` encadenado nunca alcanzaria el alias.
    const candidatos = [delIndice[slug], delIndice[slug.replace(/-bot$/, '')]];
    const anterior = candidatos.find((c) => c && c.grade) ?? null;
    if (!anterior) continue;
    datos.grade = anterior.grade;
    datos.score = anterior.score;
    datos.medicion = 'heredado_del_indice';
  }
  return deLibreria;
}

/**
 * Lee la libreria de binarios. `medicion` dice DE DONDE sale el grado — es la pieza que
 * impide leer "sin grado" como "aprobado": publicar no deja `scorecard.json`, asi que el
 * grado sale null a menudo y sin este campo la comparacion contra `min_grade` no se
 * evaluaria nunca, reportando "0 desactualizados" cuando la verdad es "no se".
 */
export function escaneaLibreria(dir) {
  const encontrados = {};
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    let grade = null;
    let medicion = 'no_disponible';
    let verdict = null;
    for (const nombre of ['scorecard.json', 'scorecard.md']) {
      const p = join(dir, e.name, nombre);
      if (!existsSync(p)) continue;
      const m = readFileSync(p, 'utf8').slice(0, 2000).match(/\b([A-F][+-]?)\b/);
      grade = m ? m[1] : null;
      medicion = 'scorecard';
      break;
    }
    const df = join(dir, e.name, 'dogfood-results.json');
    if (existsSync(df)) {
      try {
        verdict = JSON.parse(readFileSync(df, 'utf8')).verdict ?? null;
        if (medicion === 'no_disponible' && verdict) medicion = 'dogfood';
      } catch { /* ilegible: se queda no_disponible, que es la verdad */ }
    }
    encontrados[e.name.toLowerCase()] = { grade, medicion, verdict };
  }
  return encontrados;
}

/** La libreria real, si esta maquina imprime. Fuente de MAXIMA fidelidad: lee el disco. */
export function localizaLibreria(env = process.env) {
  const candidatos = [env.CLI_PRESS_LIBRARY, join(env.HOME ?? '', 'printing-press', 'library')];
  for (const c of candidatos) {
    if (!c) continue;
    try {
      if (readdirSync(c, { withFileTypes: true }).some((e) => e.isDirectory())) return c;
    } catch { /* no existe o no se puede leer: siguiente candidato */ }
  }
  return null;
}

/**
 * Clasifica los servicios del manifiesto en buckets. NO imprime ni sale del proceso: eso es
 * del script. Devolver datos en vez de escribir es lo que hace esto probable.
 */
export function clasifica(servicios, impresos, minGrade = 'A') {
  const faltantes = [];
  const desactualizados = [];
  const sinGrado = [];
  const sinAsignar = [];
  const malformados = [];

  for (const s of servicios) {
    // Degradar, no morir: en el origen una entrada rara lanzo ValueError y el auditor
    // nocturno murio EN SILENCIO 13 dias (2026-07-26 -> 08-08). Una entrada malformada es
    // un dato malo, no el fin de la auditoria.
    if (!s || typeof s !== 'object' || !s.servicio) {
      malformados.push(JSON.stringify(s ?? null).slice(0, 60));
      continue;
    }
    if (s.deprecated) continue; // superseded: no se audita ni cuenta
    if (s.estado === 'sin-asignar') {
      sinAsignar.push(s.servicio);
      continue;
    }
    // Solo se audita lo IMPRESO. Un `mcp` no es un CLI, y un `cli-oficial` (npx playwright,
    // gog) existe upstream: exigirle aparecer en la libreria seria pedirle estar donde nunca
    // va a estar, y el gate quedaria rojo para siempre por una verdad mal modelada.
    if (s.estado !== 'cli-impreso') continue;

    const slug = normalizaSlug(s.slug || s.servicio);
    const pr = casa(slug, impresos);
    if (pr === null) {
      faltantes.push({ servicio: s.servicio, slug, fuente: s.fuente_de_verdad ?? 'sin declarar' });
      continue;
    }
    const grade = pr.grade ?? null;
    if (!grade) {
      sinGrado.push({ servicio: s.servicio, medicion: pr.medicion ?? 'no_disponible' });
    } else if (grade.replace(/[+-]/g, '') > String(minGrade).replace(/[+-]/g, '')) {
      desactualizados.push({ servicio: s.servicio, grade, minGrade });
    }
  }
  return { faltantes, desactualizados, sinGrado, sinAsignar, malformados };
}
