#!/usr/bin/env node
/**
 * Revisor de interfaz: la parte COMPROBABLE de los skills de Emil Kowalski (emilkowalski/skills, commit
 * f1090bec) y de la marca Turno 25, vuelta gate. El juicio («¿esto debería animarse?») se queda en los
 * skills del estante; aquí solo lo que se decide sin modelo. De solo lectura: señala, no corrige.
 *
 * Familias y su regla de origen:
 *   movimiento  review-animations/STANDARDS.md (Easing, Physicality, Accessibility) y animation-performance
 *   movil       mobile-native/SKILL.md (fixes 1-5: hover pegado, destello al tocar, 100vh, zoom en inputs)
 *   color       guía Turno 25 §03: los colores salen de tokens; una clase de paleta o un hex en src/ no
 *
 * TRINQUETE. Lo que ya existía y no cumple está en `.claude/design-systems/turno-25/inventario-interfaz.json`
 * (archivo → regla → cuántos), con el motivo por módulo: es la agenda. El gate falla si un archivo SUBE su
 * cuenta o si aparece uno nuevo con hallazgos. Bajar es libre: `--inventario` reescribe la línea base, y
 * rechaza hacerlo si algo sube.
 *
 * Uso:  node scripts/marca/revisa-interfaz.mjs               el gate
 *       node scripts/marca/revisa-interfaz.mjs --inventario  reescribe la línea base (solo si nada sube)
 *       node scripts/marca/revisa-interfaz.mjs --prueba      la prueba de la prueba: cada siembra debe caer
 * Exit: 0 conforme · 1 algo subió, algo nuevo no cumple, o una siembra no se cazó.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const INVENTARIO = '.claude/design-systems/turno-25/inventario-interfaz.json';
const TOKENS = JSON.parse(readFileSync(join(RAIZ, '.claude/design-systems/turno-25/tokens.json'), 'utf8'));
const EMIL = 'emilkowalski/skills@f1090bec';
const CURVAS = new Set(Object.values(TOKENS.movimiento.curvas).map((c) => c.replace(/\s+/g, '')));
const MS = new Set(Object.values(TOKENS.movimiento.duraciones).map((d) => parseInt(d, 10)));
const PALETA = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';

/** Cada regla: id, familia, patrón (global) y su origen. `filtra` descarta coincidencias que sí cumplen. */
export const REGLAS = [
  { id: 'transicion-all', familia: 'movimiento', patron: /\btransition-all\b|transition\s*:\s*all\b/g, origen: `${EMIL} review-animations: anima propiedades exactas, nunca \`all\`` },
  { id: 'ease-in', familia: 'movimiento', patron: /\bease-in(?!-out)\b/g, origen: `${EMIL} review-animations/STANDARDS.md §Easing: nunca ease-in en UI` },
  { id: 'scale-0', familia: 'movimiento', patron: /\bscale-0\b|scale\(\s*0\s*\)/g, origen: `${EMIL} STANDARDS.md §Physicality: nunca desde scale(0)` },
  { id: 'anima-layout', familia: 'movimiento', patron: /transition(?:-property)?\s*:\s*[^;"'`]*\b(width|height|top|left|right|bottom|margin|padding)\b|transition-\[(?:width|height|top|left|margin|padding)/g, origen: `${EMIL} animation-performance: solo transform y opacity` },
  { id: 'duracion-fuera', familia: 'movimiento', patron: /\bduration-(\d+)\b/g, filtra: (m) => MS.has(Number(m[1])), origen: 'marca Turno 25 §movimiento: 120, 200 o 320 ms (duration-rapida/base/lenta)' },
  { id: 'curva-fuera', familia: 'movimiento', patron: /cubic-bezier\(([^)]*)\)/g, filtra: (m) => CURVAS.has(`cubic-bezier(${m[1]})`.replace(/\s+/g, '')), origen: 'marca Turno 25 §movimiento: solo las curvas de los tokens (las de Emil son propuesta v1.1)' },
  { id: 'cien-vh', familia: 'movil', patron: /\b100vh\b|\b(?:min-|max-)?h-screen\b/g, origen: `${EMIL} mobile-native fix 3: 100vh miente en el móvil, usa dvh` },
  { id: 'input-chico', familia: 'movil', patron: /<(?:input|textarea|select)\b[^>]*className=["'{`][^>]*\btext-(?:xs|sm)\b/g, origen: `${EMIL} mobile-native fix 4: un input de menos de 16 px hace zoom en iOS` },
  { id: 'paleta', familia: 'color', patron: new RegExp(`\\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|decoration|divide|placeholder|accent|caret|shadow)-(?:${PALETA})-\\d{2,3}\\b|\\b(?:bg|text|border)-(?:white|black)\\b`, 'g'), origen: 'marca Turno 25 §03: el color sale de tokens (primary, marca, exito, aviso, peligro, info, muted…)' },
  { id: 'hex', familia: 'color', patron: /(?<![\w&-])#[0-9a-fA-F]{6}\b|(?<![\w&-])#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g, origen: 'marca Turno 25 §03: un hex suelto no sigue al tema claro ni al oscuro' },
];

/** Reglas de proyecto: se comprueban una vez, sobre archivos concretos. */
const PROYECTO = [
  { id: 'movimiento-reducido', familia: 'movimiento', archivo: 'src/app/globals.css', exige: /prefers-reduced-motion:\s*reduce/, origen: `${EMIL} STANDARDS.md §Accessibility` },
  { id: 'hover-solo-con-puntero', familia: 'movil', archivo: 'tailwind.config.ts', exige: /hoverOnlyWhenSupported:\s*true/, origen: `${EMIL} mobile-native fix 1: hover pegado tras tocar` },
  { id: 'destello-al-tocar', familia: 'movil', archivo: 'src/app/globals.css', exige: /-webkit-tap-highlight-color/, origen: `${EMIL} mobile-native fix 2` },
  { id: 'viewport-fit', familia: 'movil', archivo: 'src/app/layout.tsx', exige: /viewportFit:\s*'cover'/, origen: `${EMIL} mobile-native fix 7: el contenido bajo el notch` },
];

/** No se revisan: lo generado, las fuentes, el propio revisor y lo que no es interfaz. */
const EXCLUYE = /^(src\/app\/marca\.generada\.css|src\/shared\/marca\/tokens\.generado\.ts|src\/app\/fuentes\/)|\/(pruebas|__tests__)\/|\.test\.tsx?$/;

export function hallazgosDe(texto) {
  const cuenta = {};
  for (const r of REGLAS) {
    for (const m of texto.matchAll(r.patron)) {
      if (r.filtra?.(m)) continue;
      cuenta[r.id] = (cuenta[r.id] ?? 0) + 1;
    }
  }
  return cuenta;
}

function archivos() {
  const lista = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src', 'tailwind.config.ts'], { cwd: RAIZ, encoding: 'utf8' }).split('\n');
  return lista.filter((a) => /\.(tsx?|css)$/.test(a) && !EXCLUYE.test(a) && existsSync(join(RAIZ, a)));
}

export function revisa(lector, rutas, base) {
  const actual = {};
  const errores = [];
  for (const ruta of rutas) {
    const h = hallazgosDe(lector(ruta));
    if (Object.keys(h).length) actual[ruta] = h;
    for (const [regla, n] of Object.entries(h)) {
      const tope = base[ruta]?.[regla] ?? 0;
      if (n > tope) errores.push({ ruta, regla, n, tope });
    }
  }
  return { actual, errores };
}

function proyecto(lector) {
  return PROYECTO.filter((p) => !p.exige.test(lector(p.archivo) ?? '')).map((p) => ({ ruta: p.archivo, regla: p.id, n: 1, tope: 0 }));
}

const origenDe = (id) => [...REGLAS, ...PROYECTO].find((r) => r.id === id)?.origen ?? '';
const familiaDe = (id) => [...REGLAS, ...PROYECTO].find((r) => r.id === id)?.familia ?? '';

function informa(errores) {
  for (const e of errores) {
    console.log(`✗ [${familiaDe(e.regla)}] ${e.ruta}: «${e.regla}» ${e.n} (tope ${e.tope}) — ${origenDe(e.regla)}`);
  }
}

function prueba() {
  const SIEMBRAS = {
    movimiento: ['<div className="transition-all duration-500 ease-in scale-0" />', 'a { transition: width 300ms cubic-bezier(.1,.2,.3,.4) }'],
    movil: ['<main className="min-h-screen" />', '<input className="text-sm px-2" />'],
    color: ['<p className="text-emerald-700 bg-white">x</p>', 'const c = "#0f766e";'],
  };
  const limpio = '<button className="bg-primary text-primary-foreground transition-colors duration-rapida ease-out hover:bg-marca-hover" />';
  let mal = 0;
  for (const [familia, textos] of Object.entries(SIEMBRAS)) {
    const reglas = new Set(textos.flatMap((t) => Object.keys(hallazgosDe(t))));
    const cazadas = [...reglas].filter((r) => familiaDe(r) === familia);
    const ok = cazadas.length > 0;
    if (!ok) mal++;
    console.log(`${ok ? '✓' : '✗'} siembra «${familia}» cazada por: ${cazadas.join(', ') || 'NADIE'}`);
  }
  const falsos = Object.keys(hallazgosDe(limpio));
  if (falsos.length) mal++;
  console.log(`${falsos.length ? '✗' : '✓'} un botón con tokens no da falsos positivos${falsos.length ? `: ${falsos.join(', ')}` : ''}`);
  return mal;
}

const esPrincipal = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  if (process.argv.includes('--prueba')) process.exit(prueba() ? 1 : 0);
  const lee = (r) => (existsSync(join(RAIZ, r)) ? readFileSync(join(RAIZ, r), 'utf8') : null);
  const inventario = existsSync(join(RAIZ, INVENTARIO)) ? JSON.parse(readFileSync(join(RAIZ, INVENTARIO), 'utf8')) : { archivos: {} };
  const rutas = archivos();
  const { actual, errores } = revisa(lee, rutas, inventario.archivos);
  const deProyecto = proyecto(lee);
  if (process.argv.includes('--inventario')) {
    const primeraVez = Object.keys(inventario.archivos ?? {}).length === 0;
    if (errores.length && !primeraVez) { informa(errores); console.log('✗ no reescribo la línea base: algo SUBIÓ. Arréglalo primero.'); process.exit(1); }
    writeFileSync(join(RAIZ, INVENTARIO), `${JSON.stringify({ ...inventario, archivos: actual }, null, 1)}\n`);
    console.log(`✓ línea base reescrita: ${Object.keys(actual).length} archivos con hallazgos heredados`);
    process.exit(0);
  }
  const total = (fam) => Object.values(actual).reduce((s, h) => s + Object.entries(h).filter(([r]) => familiaDe(r) === fam).reduce((a, [, n]) => a + n, 0), 0);
  informa([...errores, ...deProyecto]);
  console.log(`${rutas.length} archivos revisados · heredado en inventario: movimiento ${total('movimiento')}, móvil ${total('movil')}, color ${total('color')}`);
  const mal = errores.length + deProyecto.length;
  console.log(mal ? `✗ ${mal} hallazgo(s) nuevos o que suben` : '✓ interfaz conforme: nada nuevo ni nada que suba');
  process.exit(mal ? 1 : 0);
}
