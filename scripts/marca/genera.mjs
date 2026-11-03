#!/usr/bin/env node
/**
 * Generador de la marca Turno 25: UNA fuente (`.claude/design-systems/turno-25/tokens.json`) y sus
 * proyecciones a cada runtime del repo.
 *
 *   src/app/marca.generada.css        las variables de shadcn (HSL sin función) y las de la marca,
 *                                     en claro (`:root`) y en oscuro (`.dark`)
 *   src/shared/marca/tokens.generado.ts  lo que Tailwind y el código TS leen (familias, curvas,
 *                                     duraciones, radios, paleta)
 *
 * Es el patrón de `GEMINI.md` y del diccionario GS1: una fuente, una función que la proyecta y un
 * `--comprueba` que regenera en memoria y compara. Lo generado no se edita: se regenera.
 *
 * Uso:  node scripts/marca/genera.mjs               escribe las salidas
 *       node scripts/marca/genera.mjs --comprueba   exit 1 si alguna salida no coincide con la fuente
 *       node scripts/marca/genera.mjs --contraste   tabla WCAG de los pares texto/fondo, claro y oscuro
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FUENTE = '.claude/design-systems/turno-25/tokens.json';
const SALIDA_CSS = 'src/app/marca.generada.css';
const SALIDA_TS = 'src/shared/marca/tokens.generado.ts';
const MARCA = 'ALTO: ARTEFACTO AUTOGENERADO';
const AVISO = `por scripts/marca/genera.mjs desde ${FUENTE}. No lo edites: cambia los tokens y corre \`npm run marca:genera\`.`;

// ---------------------------------------------------------------- resolver colores
const MEZCLA = /^mezcla\(\s*([\w.]+)\s*,\s*([\w.]+)\s*,\s*([\d.]+)\s*\)$/;

/** `naranja.500` → hex de la paleta; `#3A1E0E` tal cual; `mezcla(a, b, t)` = a·t + b·(1−t). */
export function resuelve(ref, tokens) {
  if (ref.startsWith('#')) return ref.toUpperCase();
  const m = MEZCLA.exec(ref);
  if (m) {
    const [a, b] = [resuelve(m[1], tokens), resuelve(m[2], tokens)].map(rgbDe);
    const t = Number(m[3]);
    return hexDe(a.map((v, i) => Math.round(v * t + b[i] * (1 - t))));
  }
  const [familia, tono] = ref.split('.');
  const hex = tokens.paleta[familia]?.[tono];
  if (!hex) throw new Error(`token desconocido: «${ref}»`);
  return hex.toUpperCase();
}

const rgbDe = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hexDe = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** `#F26419` → `21 89% 52.4%` (el formato que shadcn envuelve con `hsl(var(--x))`). */
export function hslSinFuncion(hex) {
  const [r, g, b] = rgbDe(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0, s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  const f = (n) => Number(n.toFixed(1)).toString();
  return `${f(h)} ${f(s * 100)}% ${f(l * 100)}%`;
}

/** El tema completo: `oscuro` hereda de `claro` lo que no declara. Devuelve alias → hex. */
export function tema(tokens, nombre) {
  const alias = nombre === 'claro' ? tokens.temas.claro : { ...tokens.temas.claro, ...tokens.temas.oscuro };
  return Object.fromEntries(Object.entries(alias).map(([k, v]) => [k, resuelve(v, tokens)]));
}

function estados(tokens, nombre) {
  const fila = tokens.estados[nombre];
  return Object.fromEntries(Object.keys(fila).filter((k) => !k.startsWith('_')).map((k) => [
    k, Object.fromEntries(Object.entries(fila[k]).map(([p, v]) => [p, resuelve(v, tokens)])),
  ]));
}

// ---------------------------------------------------------------- variables por tema
/** Alias de la marca que la app usa con nombre propio (además de los de shadcn). */
const PROPIAS = {
  marca: 'accent', 'marca-hover': 'accent-hover', 'marca-press': 'accent-press', 'marca-fg': 'accent-fg',
  'marca-suave': 'accent-subtle', 'marca-suave-fg': 'accent-subtle-fg', 'marca-borde': 'accent-border',
  'texto-sutil': 'fg-3', 'superficie-muda': 'bg-muted', 'superficie-inversa': 'bg-inverse',
  'texto-inverso': 'fg-inverse', 'borde-fuerte': 'border-strong',
};

export function variablesDeTema(tokens, nombre) {
  const t = tema(tokens, nombre);
  const valor = (ref) => (t[ref] ?? resuelve(ref, tokens));
  const vars = [];
  for (const [k, ref] of Object.entries(tokens.shadcn)) if (!k.startsWith('_')) vars.push([k, hslSinFuncion(valor(ref))]);
  for (const [k, ref] of Object.entries(PROPIAS)) vars.push([k, hslSinFuncion(t[ref])]);
  for (const [estado, partes] of Object.entries(estados(tokens, nombre))) {
    vars.push([estado, hslSinFuncion(partes.base)], [`${estado}-suave`, hslSinFuncion(partes.suave)], [`${estado}-texto`, hslSinFuncion(partes.texto)]);
  }
  return vars;
}

function constantes(tokens) {
  const vars = [['radius', `${parseInt(tokens.radio.md, 10) / 16}rem`]];
  for (const [familia, tonos] of Object.entries(tokens.paleta)) {
    for (const [tono, hex] of Object.entries(tonos)) vars.push([`t25-${familia}-${tono}`, hex.toUpperCase()]);
  }
  for (const [k, v] of Object.entries(tokens.movimiento.curvas)) vars.push([`t25-ease-${k}`, v]);
  for (const [k, v] of Object.entries(tokens.movimiento.duraciones)) vars.push([`t25-dur-${k}`, v]);
  for (const [k, v] of Object.entries(tokens.sombra)) vars.push([`t25-sombra-${k}`, v]);
  for (const [k, v] of Object.entries(tokens.tipografia.tracking)) vars.push([`t25-tracking-${k}`, v]);
  return vars;
}

// ---------------------------------------------------------------- salidas
export function css(tokens) {
  const bloque = (sel, vars) => `${sel} {\n${vars.map(([k, v]) => `  --${k}: ${v};`).join('\n')}\n}\n`;
  return [
    `/* ${MARCA} ${AVISO} */`,
    '/* Va FUERA de @layer base a propósito: Tailwind v3 purga de ahí `.dark` si nadie lo usa (aprendizajes-stack). */',
    '',
    bloque(':root', [...variablesDeTema(tokens, 'claro'), ...constantes(tokens)]),
    bloque('.dark', variablesDeTema(tokens, 'oscuro')),
  ].join('\n');
}

export function ts(tokens) {
  const datos = {
    version: tokens.version,
    tipografia: { sans: tokens.tipografia.sans, mono: tokens.tipografia.mono, tamanos: tokens.tipografia.tamanos },
    movimiento: tokens.movimiento.curvas && { curvas: tokens.movimiento.curvas, duraciones: tokens.movimiento.duraciones },
    radio: tokens.radio,
    paleta: tokens.paleta,
  };
  return [
    `// ${MARCA} ${AVISO}`,
    '',
    '/** La marca Turno 25 para el código TS y para `tailwind.config.ts`. Los colores de tema van por CSS (`marca.generada.css`). */',
    `export const MARCA = ${JSON.stringify(datos, null, 2)} as const;`,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------- contraste WCAG
const luminancia = (hex) => {
  const c = rgbDe(hex).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contraste = (a, b) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** Pares texto/fondo que emiten los tokens, con dónde se usan. `prohibido` = referencia de la regla. */
const PARES = [
  ['fg-1', 'bg-page', 'texto principal sobre papel'], ['fg-1', 'bg-surface', 'texto en tarjeta'],
  ['fg-2', 'bg-page', 'texto secundario'], ['fg-2', 'bg-surface', 'texto secundario en tarjeta'],
  ['fg-3', 'bg-page', 'texto sutil (solo ≥ 18 px o no esencial)'], ['fg-1', 'bg-subtle', 'texto sobre fondo apagado'],
  ['accent-fg', 'accent', 'botón primario (tinta sobre naranja)'], ['accent-fg', 'accent-hover', 'botón primario en hover'],
  ['accent-subtle-fg', 'accent-subtle', 'bloque de resultado'], ['gris.0', 'accent', 'blanco sobre naranja (PROHIBIDO por la guía)'],
];

export function filasDeContraste(tokens) {
  const filas = [];
  for (const nombre of ['claro', 'oscuro']) {
    const t = tema(tokens, nombre);
    const v = (ref) => t[ref] ?? resuelve(ref, tokens);
    for (const [fg, bg, uso] of PARES) filas.push({ tema: nombre, fg, bg, uso, ratio: contraste(v(fg), v(bg)) });
    for (const [estado, p] of Object.entries(estados(tokens, nombre))) {
      filas.push({ tema: nombre, fg: `${estado}-texto`, bg: `${estado}-suave`, uso: `estado «${estado}»`, ratio: contraste(p.texto, p.suave) });
    }
    const d = (ref) => v(tokens.shadcn[ref]);
    filas.push({ tema: nombre, fg: 'destructive-foreground', bg: 'destructive', uso: 'botón destructivo', ratio: contraste(d('destructive-foreground'), d('destructive')) });
  }
  return filas;
}

// ---------------------------------------------------------------- main
const cargaTokens = () => JSON.parse(readFileSync(join(raiz, FUENTE), 'utf8'));
const salidas = (tokens) => [[SALIDA_CSS, css(tokens)], [SALIDA_TS, ts(tokens)]];

function comprueba(tokens) {
  let mal = 0;
  for (const [ruta, esperado] of salidas(tokens)) {
    const actual = existsSync(join(raiz, ruta)) ? readFileSync(join(raiz, ruta), 'utf8') : null;
    const ok = actual === esperado;
    if (!ok) mal++;
    console.log(`${ok ? '✓' : '✗'} ${ruta} ${ok ? 'coincide con su fuente' : 'NO coincide con la fuente: no se edita a mano, se regenera con `npm run marca:genera`'}`);
  }
  return mal === 0 ? 0 : 1;
}

function imprimeContraste(tokens) {
  console.log('| tema | texto / fondo | uso | contraste | AA texto (4.5) | AA grande (3.0) |');
  console.log('|---|---|---|---|---|---|');
  for (const f of filasDeContraste(tokens)) {
    const r = f.ratio.toFixed(2);
    console.log(`| ${f.tema} | ${f.fg} / ${f.bg} | ${f.uso} | ${r}:1 | ${f.ratio >= 4.5 ? 'sí' : 'NO'} | ${f.ratio >= 3 ? 'sí' : 'NO'} |`);
  }
}

const esPrincipal = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const tokens = cargaTokens();
  if (process.argv.includes('--comprueba')) process.exit(comprueba(tokens));
  if (process.argv.includes('--contraste')) { imprimeContraste(tokens); process.exit(0); }
  for (const [ruta, texto] of salidas(tokens)) {
    mkdirSync(dirname(join(raiz, ruta)), { recursive: true });
    writeFileSync(join(raiz, ruta), texto);
    console.log(`✓ escrito ${ruta}`);
  }
}
