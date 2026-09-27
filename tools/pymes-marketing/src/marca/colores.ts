/** Color en hex «#rrggbb», contraste WCAG y ajustes de luz. Sin dependencias. */
export type Hex = string;

export function leeHex(texto: string): Hex | null {
  const t = texto.trim().toLowerCase();
  const corto = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
  if (corto) return `#${corto[1]}${corto[1]}${corto[2]}${corto[2]}${corto[3]}${corto[3]}`;
  return /^#[0-9a-f]{6}$/.test(t) ? t : null;
}

function rgb(hex: Hex): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function aHex(r: number, g: number, b: number): Hex {
  return `#${[r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`;
}

/** Luminancia relativa WCAG 2.x. */
export function luminancia(hex: Hex): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste (1 a 21). AA pide 4.5 para texto normal y 3 para texto grande. */
export function contraste(a: Hex, b: Hex): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Mezcla hacia negro (factor < 0) o hacia blanco (factor > 0). */
export function aclara(hex: Hex, factor: number): Hex {
  const [r, g, b] = rgb(hex);
  const destino = factor >= 0 ? 255 : 0, f = Math.abs(factor);
  return aHex(r + (destino - r) * f, g + (destino - g) * f, b + (destino - b) * f);
}

/** Oscurece o aclara `frente` hasta alcanzar `minimo` de contraste contra `fondo`. */
export function asegurarContraste(frente: Hex, fondo: Hex, minimo: number): Hex {
  const haciaNegro = luminancia(fondo) > 0.4;
  let c = frente;
  for (let i = 0; i < 20 && contraste(c, fondo) < minimo; i++) c = aclara(c, haciaNegro ? -0.12 : 0.12);
  return c;
}

/** ¿Es casi blanco, casi negro o gris? (no sirve como color de marca). */
export function esNeutro(hex: Hex): boolean {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max - min < 24 || max > 245 || max < 20;
}

/** Colores nombrados en español de México, con sus variantes habituales. */
export const COLORES_ES: Readonly<Record<string, Hex>> = {
  'verde bosque': '#1f4d3a', 'verde olivo': '#5b6b2f', 'verde menta': '#8fd3b6', 'verde': '#2e7d4f', 'menta': '#8fd3b6',
  'azul marino': '#1b2a4a', 'azul rey': '#1f4fbf', 'azul cielo': '#7fb8e6', 'azul': '#2563a8', 'turquesa': '#1aa5a5', 'aqua': '#3cc4c4',
  'rosa mexicano': '#e4007c', 'rosa palo': '#e8b4b8', 'rosa': '#e07a9a', 'fucsia': '#d6247f', 'coral': '#f0735a',
  'rojo': '#c62828', 'vino': '#6d1f33', 'guinda': '#7a1f3d', 'terracota': '#c0643c', 'naranja': '#ef7d22', 'mostaza': '#d4a017',
  'amarillo': '#f2c230', 'dorado': '#b8913a', 'oro': '#b8913a', 'cafe': '#6b4428', 'chocolate': '#4a2c1d', 'arena': '#d9c7a3',
  'beige': '#e8dcc4', 'crema': '#f6efe2', 'hueso': '#f3eee4', 'blanco': '#ffffff', 'gris calido': '#8a817c', 'gris': '#6b7280',
  'negro': '#1a1a1a', 'morado': '#6b3fa0', 'lavanda': '#b6a4d9', 'lila': '#b58fd1', 'plata': '#b8bcc2',
};

/** Estilos descritos con palabras («como un despacho moderno») → par de colores. */
export const ESTILOS_ES: readonly (readonly [RegExp, readonly [Hex, Hex]])[] = [
  [/(despacho|abogad|legal|contab|financier|corporativ)/, ['#1b2a4a', '#8a817c']],
  [/(rustic|artesan|campo|madera|tradicional)/, ['#6b4428', '#f6efe2']],
  [/(elegante|lujo|premium|joyer)/, ['#1a1a1a', '#b8913a']],
  [/(fresco|natural|organic|saludable|verde)/, ['#2e7d4f', '#f6efe2']],
  [/(infantil|divertid|ninos|jugueter|alegre)/, ['#f2c230', '#1aa5a5']],
  [/(mexican|tradicion mexicana|fiesta|colorid)/, ['#e4007c', '#ef7d22']],
  [/(moderno|minimal|tecnolog)/, ['#1a1a1a', '#2563a8']],
];
