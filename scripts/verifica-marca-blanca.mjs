#!/usr/bin/env node
/**
 * Frontera de marca blanca del ERP (PRP-004, Fase 3B). Tres reglas, todas sobre `erp/`:
 *
 *   1. Todo archivo de `erp/` cae en EXACTAMENTE una clase de `erp/entrega.json`
 *      (entrega | defendible | casa | fabrica). Un archivo nuevo sin clase pone el gate en
 *      rojo: sin decidir si sale, no se entrega (mismo espíritu que el inventario, white-label §5).
 *   2. Todo lo listado en «entrega» existe, y nada defendible ni de la casa cae dentro.
 *   3. Ninguna huella de la casa (`erp/casa/huellas.txt`: tenant, ref de producción, IDs de
 *      Slack, sistemas, personas, correos) aparece en lo que se entrega.
 *
 * Además vigila la lista de huellas: una huella que ya no aparece en NINGÚN archivo de la casa
 * se reporta como «muerta» (aviso, no error): o se retiró el dato, o la expresión se desfasó.
 *
 * Sin red ni Docker: corre en `validate`.
 * Uso:  node scripts/verifica-marca-blanca.mjs            (el gate)
 *       node scripts/verifica-marca-blanca.mjs --prueba   (la prueba de la prueba: siembra una
 *       huella, un archivo sin clase y un defendible en la entrega, y exige que los tres caigan)
 *       node scripts/verifica-marca-blanca.mjs --lista    (solo los entregables, uno por línea, si el
 *       gate está en verde: `tar czf erp.tgz $(node scripts/verifica-marca-blanca.mjs --lista)`)
 * Exit: 0 en verde · 1 en rojo.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const ambar = (s) => `\x1b[33m${s}\x1b[0m`;

/** Clases a las que pertenece un archivo: ruta exacta o prefijo que termina en `/`. */
export function clasesDe(archivo, clases) {
  return Object.entries(clases)
    .filter(([, c]) => c.rutas.some((r) => (r.endsWith('/') ? archivo.startsWith(r) : archivo === r)))
    .map(([nombre]) => nombre);
}

/**
 * Expresiones de huellas desde el texto de huellas.txt (una por línea, `#` comenta). Un `?`
 * al inicio marca una huella PREVENTIVA: vigila la entrega, pero no se exige que esté viva
 * (p. ej. correos: hoy no hay ninguno y no debe entrar ninguno).
 */
export function leeHuellas(texto) {
  return texto.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const preventiva = l.startsWith('?');
      const fuente = preventiva ? l.slice(1).trim() : l;
      return { fuente, preventiva, re: new RegExp(fuente, 'iu') };
    });
}

/** Líneas de `texto` donde aparece alguna huella: [{ linea, fuente }]. */
export function huellasEn(texto, huellas) {
  const hallazgos = [];
  texto.split('\n').forEach((l, i) => {
    for (const h of huellas) if (h.re.test(l)) hallazgos.push({ linea: i + 1, fuente: h.fuente });
  });
  return hallazgos;
}

/** Aplica las tres reglas. `leer(ruta)` devuelve el texto de un archivo. */
export function verifica({ archivos, manifiesto, huellas, leer }) {
  const errores = [];
  const avisos = [];
  const { clases } = manifiesto;

  for (const a of archivos) {
    const cs = clasesDe(a, clases);
    if (cs.length === 0) errores.push(`${a}: sin clase en erp/entrega.json (¿se entrega o no?)`);
    if (cs.length > 1) errores.push(`${a}: en ${cs.length} clases a la vez (${cs.join(', ')})`);
  }
  const entregables = archivos.filter((a) => clasesDe(a, clases).length === 1
    && clasesDe(a, clases)[0] === 'entrega');
  for (const r of clases.entrega.rutas) {
    if (!r.endsWith('/') && !archivos.includes(r)) errores.push(`${r}: listado en la entrega y no existe`);
  }
  for (const a of entregables) {
    for (const h of huellasEn(leer(a), huellas)) {
      errores.push(`${a}:${h.linea}: huella de la casa en lo que se entrega (/${h.fuente}/)`);
    }
  }
  const noEntregables = archivos.filter((a) => !entregables.includes(a) && a !== manifiesto.huellas);
  for (const h of huellas.filter((x) => !x.preventiva)) {
    if (!noEntregables.some((a) => h.re.test(leer(a)))) {
      avisos.push(`huella muerta: /${h.fuente}/ no aparece en ningún archivo de la casa`);
    }
  }
  return { errores, avisos, entregables };
}

function archivosDeErp() {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'erp/'], { cwd: RAIZ, encoding: 'utf8' })
    .split('\n').filter(Boolean).filter((a) => existsSync(join(RAIZ, a)));
}

function prueba(manifiesto, huellas, archivos, leer) {
  const uno = manifiesto.clases.entrega.rutas[0];
  const siembra = huellas[0].fuente.replace(/\\b/g, '');
  const casos = [
    ['huella en la entrega', { archivos, leer: (a) => (a === uno ? `${leer(a)}\n-- ${siembra}` : leer(a)) }],
    ['archivo sin clase', { archivos: [...archivos, 'erp/nuevo-sin-clase.md'], leer: (a) => (a.endsWith('sin-clase.md') ? '' : leer(a)) }],
    ['defendible en la entrega', {
      archivos,
      leer,
      manifiesto: { ...manifiesto, clases: { ...manifiesto.clases, entrega: { rutas: [...manifiesto.clases.entrega.rutas, 'erp/ERP-MAESTRO.md'] } } },
    }],
  ];
  let cazadas = 0;
  for (const [nombre, caso] of casos) {
    const { errores } = verifica({ manifiesto, huellas, ...caso });
    if (errores.length) { cazadas += 1; console.log(`CAZADA ${nombre} — ${errores[0]}`); }
    else console.log(rojo(`VIVA   ${nombre} — el gate no la vio`));
  }
  console.log(`\nprueba de la prueba: ${cazadas} de ${casos.length} siembras cazadas`);
  process.exit(cazadas === casos.length ? 0 : 1);
}

function main() {
  const manifiesto = JSON.parse(readFileSync(join(RAIZ, 'erp/entrega.json'), 'utf8'));
  const huellas = leeHuellas(readFileSync(join(RAIZ, manifiesto.huellas), 'utf8'));
  const archivos = archivosDeErp();
  const cache = new Map();
  const leer = (a) => {
    if (!cache.has(a)) cache.set(a, readFileSync(join(RAIZ, a), 'utf8'));
    return cache.get(a);
  };
  if (process.argv.includes('--prueba')) return prueba(manifiesto, huellas, archivos, leer);

  const { errores, avisos, entregables } = verifica({ archivos, manifiesto, huellas, leer });
  if (process.argv.includes('--lista')) {
    if (errores.length) { for (const e of errores) console.error(e); process.exit(1); }
    console.log(entregables.join('\n'));
    return;
  }
  for (const a of avisos) console.log(ambar(`  aviso: ${a}`));
  if (errores.length) {
    for (const e of errores) console.log(rojo(`  ✗ ${e}`));
    console.log(rojo(`Marca blanca ROTA: ${errores.length} problema(s). Frontera: erp/FRONTERA-DE-ENTREGA.md`));
    process.exit(1);
  }
  const porClase = Object.keys(manifiesto.clases)
    .map((c) => `${c} ${archivos.filter((a) => clasesDe(a, manifiesto.clases)[0] === c).length}`).join(' · ');
  console.log(verde(`Marca blanca al día: ${archivos.length} archivos de erp/ clasificados (${porClase}); `
    + `${entregables.length} entregables sin ninguna de las ${huellas.length} huellas de la casa.`));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
