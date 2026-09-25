/**
 * Costeo y clasificacion propuesta por activo (spec 014, RF-9 a RF-12; SDD §2.7-2.9).
 * Solo corre al exportar: nada de lo que calcula se escribe en git.
 *
 * Regla que no se negocia: lo que no tiene medicion detras es `null` con su razon, nunca 0.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { activoDeArchivo } from './nucleo.mjs';

/** Trayectorias de una linea (`fabrica`, `aplicacion`, `herramientas`), de todos los meses. */
export function leeTrayectorias(raiz, linea) {
  const base = join(raiz, 'trayectorias/datos', linea);
  if (!existsSync(base)) return [];
  return readdirSync(base).flatMap((mes) => readdirSync(join(base, mes))
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(base, mes, f), 'utf8'))));
}

/** Commits sin merges con fecha de autor y archivos tocados. */
export function leeCommits(raiz) {
  const out = execFileSync('git', ['-C', raiz, 'log', '--all', '--no-merges',
    '--format=@@%H|%aI', '--name-only'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const commits = new Map();
  let actual = null;
  for (const linea of out.split('\n')) {
    if (linea.startsWith('@@')) {
      const [hash, fecha] = linea.slice(2).split('|');
      actual = commits.get(hash) ?? { hash, fecha: Date.parse(fecha), archivos: [] };
      commits.set(hash, actual);
    } else if (linea && actual) actual.archivos.push(linea);
  }
  return [...commits.values()];
}

const vacio = () => ({ usd: 0, conUsd: 0, sinUsd: 0, tokensIn: 0, tokensOut: 0 });

/**
 * Construccion: cada sesion registrada reparte sus tokens y su costo entre los activos
 * cuyos archivos se commitearon dentro de su ventana, en proporcion a los archivos tocados.
 * Es un PROXY (una sesion en otro repo a la misma hora sumaria aqui) y se declara.
 */
export function construccion(porActivo, commits, sesiones) {
  const acum = new Map();
  const commitsDe = new Map();
  const enSesion = new Map();
  for (const c of commits) {
    for (const id of new Set(c.archivos.map((a) => activoDeArchivo(a, porActivo)).filter(Boolean))) {
      commitsDe.set(id, (commitsDe.get(id) ?? 0) + 1);
    }
  }
  for (const s of sesiones) {
    const ini = Date.parse(s.cuando?.inicio);
    const fin = Date.parse(s.cuando?.fin);
    const dentro = commits.filter((c) => c.fecha >= ini && c.fecha <= fin);
    const pesos = pesosPorActivo(dentro, porActivo, enSesion);
    const total = [...pesos.values()].reduce((a, b) => a + b, 0);
    for (const [id, n] of pesos) sumaSesion(acum, id, s, n / total);
  }
  return { acum, commitsDe, enSesion };
}

function pesosPorActivo(commits, porActivo, enSesion) {
  const pesos = new Map();
  for (const c of commits) {
    const ids = new Set();
    for (const a of c.archivos) {
      const id = activoDeArchivo(a, porActivo);
      if (!id) continue;
      pesos.set(id, (pesos.get(id) ?? 0) + 1);
      ids.add(id);
    }
    for (const id of ids) enSesion.set(id, (enSesion.get(id) ?? new Set()).add(c.hash));
  }
  return pesos;
}

function sumaSesion(acum, id, s, peso) {
  const a = acum.get(id) ?? vacio();
  const u = s.uso ?? {};
  a.tokensIn += Math.round(((u.entrada ?? 0) + (u.cacheCreacion ?? 0) + (u.cacheLectura ?? 0)) * peso);
  a.tokensOut += Math.round((u.salida ?? 0) * peso);
  if (typeof s.costoUsd === 'number') { a.usd += s.costoUsd * peso; a.conUsd += 1; } else a.sinUsd += 1;
  acum.set(id, a);
}

const redondea = (n) => Math.round(n * 100) / 100;

/** Componente de construccion con fuente, cobertura y la razon cuando no hay dato. */
export function componenteConstruccion(id, { acum, commitsDe, enSesion }) {
  const total = commitsDe.get(id) ?? 0;
  const dentro = enSesion.get(id)?.size ?? 0;
  const cobertura = { commits: total, commitsEnSesionRegistrada: dentro };
  const a = acum.get(id);
  const metodo = 'proxy: sesiones de trayectorias/fabrica repartidas por archivos commiteados en su ventana';
  if (!a) {
    return { usd: null, cobertura,
      fuente: `no_medido: ninguno de los ${total} commits cae en una sesion registrada (captura desde 2026-08)` };
  }
  const tokens = { in: a.tokensIn, out: a.tokensOut };
  if (a.conUsd === 0) {
    return { usd: null, tokens, cobertura,
      fuente: `${metodo}; ${a.sinUsd} sesion(es) sin costoUsd (modelo sin precio en routing): USD no_medido, tokens medidos` };
  }
  const parcial = a.sinUsd > 0 || dentro < total ? ' — PARCIAL (minimo medido, no total)' : '';
  return { usd: redondea(a.usd), tokens, cobertura, parcial: parcial !== '',
    fuente: `${metodo}; ${a.conUsd} sesion(es) con costoUsd, ${a.sinUsd} sin el; ${dentro}/${total} commits cubiertos${parcial}` };
}

/** Operacion mensual desde las trayectorias de aplicacion y herramientas del activo. */
export function componenteOperacion(activo, aplicacion, herramientas) {
  const slug = activo.ubicacion.split('/').pop();
  const corridas = [
    ...aplicacion.filter((t) => t.actor?.feature === slug),
    ...herramientas.filter((t) => t.actor?.herramienta === slug),
  ];
  if (corridas.length === 0) {
    return { usd_mes: null, fuente: 'no_medido: sin trayectorias de operacion; corre en la infra del consumidor' };
  }
  const conCosto = corridas.filter((t) => typeof t.costoUsd === 'number');
  if (conCosto.length === 0) {
    return { usd_mes: null,
      fuente: `no_medido: ${corridas.length} corrida(s) registradas sin costo de tokens (motor local o uso no reportado)` };
  }
  const meses = new Map();
  for (const t of conCosto) {
    const mes = t.cuando.inicio.slice(0, 7);
    meses.set(mes, (meses.get(mes) ?? 0) + t.costoUsd);
  }
  const ultimo = [...meses.keys()].sort().pop();
  return { usd_mes: redondea(meses.get(ultimo)), periodo: ultimo,
    fuente: `trayectorias aplicacion/herramientas: ${conCosto.length} de ${corridas.length} corridas con costo; mes ${ultimo}` };
}

/** Trayectorias de operacion que ningun activo reclama: se reportan, no se tiran. */
export function operacionSinActivo(activos, aplicacion, herramientas) {
  const slugs = new Set(activos.map((a) => a.ubicacion.split('/').pop()));
  const huerfanas = new Map();
  for (const t of [...aplicacion, ...herramientas]) {
    const quien = t.actor?.feature ?? t.actor?.herramienta ?? '(sin actor)';
    if (!slugs.has(quien)) huerfanas.set(quien, (huerfanas.get(quien) ?? 0) + 1);
  }
  return [...huerfanas].map(([quien, n]) => `${quien} (${n})`);
}

/** Clasificacion SIEMPRE propuesta (D-10: ratificar es humano). */
export function clasificacionPropuesta(activo) {
  const conOrigen = [activo.origen ?? []].flat().length > 0;
  const di = !conOrigen && activo.estado === 'blueprint' ? 'investigacion' : 'desarrollo';
  const porQueDi = conOrigen
    ? 'origen declarado (spec/PRP): beneficio identificable'
    : di === 'investigacion' ? 'blueprint sin origen declarado: exploracion'
      : `sin origen declarado; en ${activo.estado}: se propone desarrollo`;
  return {
    di,
    defensibilidad: 'reemplazable',
    estado: 'propuesta',
    nota: `D+I: ${porQueDi}. Defensibilidad: heuristica D-12 por ubicacion — vive en un repo publico, `
      + 'sin medidas razonables demostrables de secreto; un competidor con Claude Code lo reproduce. '
      + 'Ratificacion humana pendiente (ERP-MAESTRO §1.7; D+I lo valida el contador).',
  };
}

/** Costeo completo de un activo en el formato del catalogo (`activos/activos.jsonl`). */
export function costeaActivo(activo, datos) {
  return {
    construccion: componenteConstruccion(activo.id, datos.construccion),
    operacion: componenteOperacion(activo, datos.aplicacion, datos.herramientas),
    replica: { usd_est: null, fuente: 'no_estimado: no hay dogfood de instalacion o instancia medido' },
    reposicion: { usd_est: null, fuente: 'no_estimado: no hay reconstruccion medida con la fabrica' },
    horasHumanas: { usd: null, fuente: 'no_medido: se declaran en el ERP (cosechar-activos.py ajustar)' },
  };
}
