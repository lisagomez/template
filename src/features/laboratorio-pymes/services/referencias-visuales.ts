/**
 * Las piezas de REFERENCIA del laboratorio visual (datos sintéticos de la panadería de ejemplo).
 * Su huella vive en `datos/referencias.json` y su imagen en public/laboratorio-pymes/referencias/.
 * Un cambio visual rompe la huella a propósito: se aprueba regenerando las referencias
 * (`npm run contenido:referencias`) y enseñando el diff, no ajustando la prueba.
 */
import { capturaDeSitio, confirmaMarca } from '../../../../tools/pymes-marketing/dist/marca/index.js';
import { ventasDesdeCfdi, resumeVentas } from '../../../../tools/pymes-marketing/dist/ventas/index.js';
import { estrategiaDe30Dias, piezaSvg, carruselDeTemporada } from '../../../../tools/pymes-marketing/dist/contenido/index.js';
import { escenaDePromo, cuadroSvg, hojaDeCuadrosSvg, sonidoDeEscena, wavDe } from '../../../../tools/pymes-marketing/dist/video/index.js';
import { demoPanaderia, RFC_DEMO } from '../datos/cfdi-sinteticos.ts';
import { NEGOCIO_DEMO, SITIO_DEMO } from '../datos/demo.ts';
import { leeXml } from './casos-marca-ventas.ts';

export const marcaDeReferencia = () => confirmaMarca(capturaDeSitio(SITIO_DEMO, NEGOCIO_DEMO.sitio));
export const PIEZA = { titular: 'Día de Muertos', apoyo: 'Pan de muerto', precio: '$45.00', etiqueta: 'Temporada' } as const;
export const escenaDeReferencia = () => escenaDePromo(marcaDeReferencia(), { ...PIEZA, semilla: 'promo-dia-de-muertos' });
export const briefDeReferencia = () => estrategiaDe30Dias(resumeVentas(ventasDesdeCfdi(demoPanaderia().map(leeXml), { rfcPropio: RFC_DEMO })), '2026-10-19');

export interface PiezaDeReferencia {
  readonly id: string;
  readonly titulo: string;
  readonly svg: string;
}

export function piezasDeReferencia(): PiezaDeReferencia[] {
  const m = marcaDeReferencia(), e = escenaDeReferencia();
  const carrusel = carruselDeTemporada(briefDeReferencia(), m, { precios: { 'pan de muerto': 45 }, contacto: NEGOCIO_DEMO.contacto });
  const laminas = carrusel?.laminas ?? [];
  return [
    { id: 'pieza-vertical', titulo: 'Publicación 4:5 de temporada', svg: piezaSvg(m, { ...PIEZA, formato: 'vertical', semilla: 'ref-vertical' }) },
    { id: 'pieza-historia', titulo: 'Historia 9:16 de temporada', svg: piezaSvg(m, { ...PIEZA, formato: 'historia', semilla: 'ref-historia' }) },
    { id: 'pieza-horizontal', titulo: 'Facebook 1200×630', svg: piezaSvg(m, { ...PIEZA, formato: 'horizontal', semilla: 'ref-horizontal' }) },
    ...laminas.map((l) => ({ id: `carrusel-lamina-${l.indice}`, titulo: `Carrusel de temporada, lámina ${l.indice}`, svg: l.svg })),
    { id: 'video-cuadro-inicio', titulo: 'Promo: cuadro del segundo 0.5', svg: cuadroSvg(e, 0.5) },
    { id: 'video-cuadro-final', titulo: 'Promo: último cuadro', svg: cuadroSvg(e, e.duracion - 1 / e.fps) },
    { id: 'video-hoja', titulo: 'Promo: hoja de cuadros (SVG)', svg: hojaDeCuadrosSvg(e) },
  ];
}

export const sonidoDeReferencia = () => wavDe(sonidoDeEscena(escenaDeReferencia()));

/** Huella SHA-256 en hex (WebCrypto: sirve en Node y en el navegador). */
export async function sha256(datos: string | Uint8Array): Promise<string> {
  const bytes = typeof datos === 'string' ? new TextEncoder().encode(datos) : datos;
  const copia = new Uint8Array(bytes.byteLength);
  copia.set(bytes);
  return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', copia.buffer))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
