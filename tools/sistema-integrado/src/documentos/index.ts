/**
 * Documentos del sistema: DOCX y PDF SIN dependencias, huella SHA-256 de la versión exacta, y el detector de
 * documento genérico (L7). Un documento que no habla de la empresa no pasa a revisión: el auditor lo detecta al
 * instante y la pyme pierde la auditoría.
 */
import { zip } from './zip.js';
import { pdfDeTexto } from './pdf.js';

export interface SeccionDoc { readonly titulo: string; readonly parrafos: readonly string[] }

export interface DocumentoFuente {
  readonly titulo: string;
  readonly organizacion: string;
  /** Número de versión (1, 2, 3…). */
  readonly version: number;
  readonly estado: 'borrador' | 'en_revision' | 'aprobado' | 'rechazado';
  readonly secciones: readonly SeccionDoc[];
  /** IDs del catálogo que este documento atiende. */
  readonly requisitos: readonly string[];
  /** Quién aprobó y cuándo (solo si `estado = aprobado`). */
  readonly aprobacion?: { readonly rol: string; readonly cuando: string; readonly huella: string };
}

const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function parrafoXml(texto: string, opts: { negrita?: boolean; tam?: number } = {}): string {
  const rpr = `${opts.negrita ? '<w:b/>' : ''}${opts.tam ? `<w:sz w:val="${opts.tam}"/>` : ''}`;
  return `<w:p><w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${escXml(texto)}</w:t></w:r></w:p>`;
}

/** Pie común: identidad, versión, estado, requisitos y la advertencia que nunca falta. */
export function pieDe(d: DocumentoFuente): string[] {
  return [
    `${d.organizacion} · ${d.titulo} · versión ${d.version} · ${d.estado.replace('_', ' ')}`,
    d.aprobacion ? `Aprobado por ${d.aprobacion.rol} el ${d.aprobacion.cuando} · ${d.aprobacion.huella}` : 'Sin aprobar: no es un documento vigente.',
    `Requisitos atendidos (catálogo propio): ${d.requisitos.join(', ') || 'ninguno'}`,
    'Este documento prepara a la organización para la auditoría de un organismo de certificación acreditado; no certifica nada por sí mismo.',
  ];
}

/** DOCX mínimo válido (Office Open XML): [Content_Types].xml, _rels/.rels y word/document.xml. */
export function docx(d: DocumentoFuente): Uint8Array {
  const cuerpo = [
    parrafoXml(d.titulo, { negrita: true, tam: 36 }),
    parrafoXml(d.organizacion, { tam: 24 }),
    ...d.secciones.flatMap((s) => [parrafoXml(s.titulo, { negrita: true, tam: 28 }), ...s.parrafos.map((p) => parrafoXml(p))]),
    parrafoXml(''),
    ...pieDe(d).map((p) => parrafoXml(p, { tam: 16 })),
  ].join('');
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const tipos = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  const enc = new TextEncoder();
  return zip([
    { nombre: '[Content_Types].xml', datos: enc.encode(tipos) },
    { nombre: '_rels/.rels', datos: enc.encode(rels) },
    { nombre: 'word/document.xml', datos: enc.encode(documento) },
  ]);
}

/** PDF carta con Helvetica: título, secciones y pie. */
export function pdf(d: DocumentoFuente): Uint8Array {
  const bloques: { texto: string; estilo: 'titulo' | 'subtitulo' | 'normal' | 'pie' }[] = [
    { texto: d.titulo, estilo: 'titulo' },
    { texto: d.organizacion, estilo: 'normal' },
    ...d.secciones.flatMap((s) => [{ texto: s.titulo, estilo: 'subtitulo' as const }, ...s.parrafos.map((p) => ({ texto: p, estilo: 'normal' as const }))]),
    ...pieDe(d).map((p) => ({ texto: p, estilo: 'pie' as const })),
  ];
  return pdfDeTexto(bloques, `${d.titulo} — ${d.organizacion} v${d.version}`);
}

/** Huella `sha256:<hex>` de bytes o texto (Web Crypto: igual en Node y en el navegador). */
export async function huella(datos: Uint8Array | string): Promise<string> {
  const bytes = typeof datos === 'string' ? new TextEncoder().encode(datos) : datos;
  const copia = new Uint8Array(bytes.byteLength);
  copia.set(bytes);
  const h = await globalThis.crypto.subtle.digest('SHA-256', copia.buffer);
  return `sha256:${[...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** El texto plano de un documento (para huellas, el detector y búsquedas). */
export const textoDe = (d: Pick<DocumentoFuente, 'titulo' | 'secciones'>): string =>
  [d.titulo, ...d.secciones.flatMap((s) => [s.titulo, ...s.parrafos])].join('\n');

// ───────────────────────── L7 · documento genérico ─────────────────────────

export interface DatosOrganizacion {
  readonly nombre: string;
  /** Lo que solo esta empresa tiene: procesos, productos, sitios, sistemas de IA, clientes tipo, puestos. */
  readonly terminos: readonly string[];
}

export interface Genericidad {
  readonly generico: boolean;
  readonly nombrePresente: boolean;
  readonly presentes: readonly string[];
  readonly marcadores: readonly string[];
  readonly motivo: string;
}

const MARCADORES = [
  /\[[^\]]{2,40}\]/g, /\{\{[^}]+\}\}/g, /<[A-ZÁÉÍÓÚ_ ]{3,}>/g, /\bX{3,}\b/g, /lorem ipsum/gi,
  /\b(nombre de la (empresa|organizaci[oó]n)|su empresa aqu[ií]|la empresa x)\b/gi,
];

const sinAcentos = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/**
 * Genérico si: tiene marcadores de plantilla sin llenar, o no nombra a la organización, o menciona menos de 3
 * términos propios distintos. La regla es fija y se explica sola (el `motivo`), para que la persona sepa qué agregar.
 */
export function detectaGenerico(texto: string, org: DatosOrganizacion, minimoTerminos = 3): Genericidad {
  const plano = sinAcentos(texto);
  const marcadores = MARCADORES.flatMap((re) => texto.match(re) ?? []);
  const nombrePresente = plano.includes(sinAcentos(org.nombre));
  const presentes = [...new Set(org.terminos.filter((t) => t.trim().length > 2 && plano.includes(sinAcentos(t))))];
  const motivos: string[] = [];
  if (marcadores.length) motivos.push(`tiene ${marcadores.length} hueco(s) de plantilla sin llenar`);
  if (!nombrePresente) motivos.push(`no menciona a «${org.nombre}»`);
  if (presentes.length < minimoTerminos) motivos.push(`solo nombra ${presentes.length} elemento(s) propio(s) de la empresa (mínimo ${minimoTerminos})`);
  return {
    generico: motivos.length > 0, nombrePresente, presentes, marcadores,
    motivo: motivos.length ? `Documento genérico: ${motivos.join('; ')}.` : `Habla de la empresa: ${presentes.slice(0, 6).join(', ')}.`,
  };
}
