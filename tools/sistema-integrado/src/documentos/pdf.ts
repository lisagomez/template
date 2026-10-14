/**
 * PDF mínimo escrito a mano: tamaño carta, Helvetica y Helvetica-Bold (fuentes base, sin incrustar), codificación
 * WinAnsi (cubre á é í ó ú ñ ü ¿ ¡ « » — –). Salto de línea por ancho real de cada carácter y varias páginas.
 * Determinista: sin fecha de creación, para que el mismo documento dé la misma huella.
 */

// Anchos de Helvetica (unidades de 1/1000) para ASCII 32..126.
const ANCHOS_ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
  556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const ESPECIALES: Record<string, number> = {
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99,
};
const SUSTITUTOS: Record<string, string> = { '≥': '>=', '≤': '<=', '→': '->', '←': '<-', '✓': 'si', '✗': 'no', '×': 'x' };

/** Texto → bytes WinAnsi (lo que no existe en WinAnsi se sustituye o se vuelve «?»). */
export function aWinAnsi(texto: string): number[] {
  const bytes: number[] = [];
  for (const ch of texto.normalize('NFC')) {
    const sust = SUSTITUTOS[ch];
    if (sust) { bytes.push(...aWinAnsi(sust)); continue; }
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x20 && cp <= 0x7e) bytes.push(cp);
    else if (cp >= 0xa0 && cp <= 0xff) bytes.push(cp);
    else if (ESPECIALES[ch] !== undefined) bytes.push(ESPECIALES[ch]);
    else bytes.push(0x3f);
  }
  return bytes;
}

function anchoByte(b: number): number {
  if (b >= 32 && b <= 126) return ANCHOS_ASCII[b - 32]!;
  if (b === 0x96) return 556; if (b === 0x97) return 1000; if (b === 0x95) return 350; if (b === 0x85) return 1000;
  if (b >= 0x91 && b <= 0x94) return 333;
  if (b >= 0xc0 && b <= 0xc6) return 667; if (b === 0xc7) return 722; if (b >= 0xc8 && b <= 0xcb) return 667;
  if (b >= 0xcc && b <= 0xcf) return 278; if (b === 0xd1) return 722; if (b >= 0xd2 && b <= 0xd6) return 778;
  if (b >= 0xd9 && b <= 0xdc) return 722; if (b >= 0xe0 && b <= 0xe6) return 556; if (b === 0xe7) return 500;
  if (b >= 0xe8 && b <= 0xeb) return 556; if (b >= 0xec && b <= 0xef) return 278; if (b >= 0xf1 && b <= 0xf6) return 556;
  if (b >= 0xf9 && b <= 0xfc) return 556; if (b === 0xbf) return 611; if (b === 0xa1) return 333; if (b === 0xab || b === 0xbb) return 556;
  if (b === 0xb7) return 278;
  return 556;
}

const ancho = (bytes: number[], tam: number, negrita: boolean) =>
  (bytes.reduce((s, b) => s + anchoByte(b), 0) * tam * (negrita ? 1.06 : 1)) / 1000;

const ESTILOS = {
  titulo: { tam: 18, negrita: true, antes: 0, despues: 10 },
  subtitulo: { tam: 13, negrita: true, antes: 10, despues: 4 },
  normal: { tam: 11, negrita: false, antes: 0, despues: 6 },
  pie: { tam: 8, negrita: false, antes: 2, despues: 1 },
} as const;

const CARTA = { ancho: 612, alto: 792, margen: 72 };

function envuelve(texto: string, tam: number, negrita: boolean, maximo: number): number[][] {
  const lineas: number[][] = [];
  let actual: number[] = [];
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const p = aWinAnsi(palabra);
    const candidata = actual.length ? [...actual, 0x20, ...p] : p;
    if (ancho(candidata, tam, negrita) <= maximo || !actual.length) actual = candidata;
    else { lineas.push(actual); actual = p; }
  }
  if (actual.length) lineas.push(actual);
  return lineas.length ? lineas : [[]];
}

const hex = (bytes: number[]) => `<${bytes.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()}>`;

export function pdfDeTexto(bloques: readonly { texto: string; estilo: keyof typeof ESTILOS }[], titulo: string): Uint8Array {
  const util = CARTA.ancho - 2 * CARTA.margen;
  const paginas: string[][] = [[]];
  let y = CARTA.alto - CARTA.margen;
  for (const b of bloques) {
    const e = ESTILOS[b.estilo];
    const interlinea = e.tam * 1.35;
    y -= e.antes;
    for (const linea of envuelve(b.texto, e.tam, e.negrita, util)) {
      if (y - interlinea < CARTA.margen) { paginas.push([]); y = CARTA.alto - CARTA.margen; }
      y -= interlinea;
      paginas[paginas.length - 1]!.push(`BT /${e.negrita ? 'F2' : 'F1'} ${e.tam} Tf 1 0 0 1 ${CARTA.margen} ${y.toFixed(2)} Tm ${hex(linea)} Tj ET`);
    }
    y -= e.despues;
  }
  const objetos: string[] = [];
  const idPaginas = paginas.map((_, i) => 5 + i * 2);
  objetos[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objetos[2] = `<< /Type /Pages /Kids [${idPaginas.map((id) => `${id} 0 R`).join(' ')}] /Count ${paginas.length} >>`;
  objetos[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objetos[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  paginas.forEach((lineas, i) => {
    const contenido = lineas.join('\n');
    objetos[5 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${CARTA.ancho} ${CARTA.alto}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`;
    objetos[6 + i * 2] = `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`;
  });
  const idInfo = objetos.length;
  objetos[idInfo] = `<< /Title ${hex(aWinAnsi(titulo))} /Producer (sistema-integrado) >>`;
  let salida = '%PDF-1.4\n';
  const desplazamientos: number[] = [];
  for (let i = 1; i < objetos.length; i++) {
    desplazamientos[i] = salida.length;
    salida += `${i} 0 obj\n${objetos[i]}\nendobj\n`;
  }
  const xref = salida.length;
  salida += `xref\n0 ${objetos.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objetos.length; i++) salida += `${String(desplazamientos[i]).padStart(10, '0')} 00000 n \n`;
  salida += `trailer\n<< /Size ${objetos.length} /Root 1 0 R /Info ${idInfo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(salida); // todo el archivo es ASCII: el texto va en hexadecimal
}
