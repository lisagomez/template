/**
 * Las piezas de REFERENCIA del laboratorio visual: una caja, una tarima y una etiqueta de ubicación,
 * en SVG (lo que se ve) y en ZPL (lo que recibe la Zebra). Su huella vive en `datos/referencias.json`
 * y su imagen en `public/laboratorio-etiquetas/referencias/`. Un cambio visual rompe la huella A
 * PROPÓSITO: se aprueba regenerando (`npm run etiquetas:referencias`) y enseñando el diff, no
 * ajustando la prueba.
 */
import bwipjs from 'bwip-js/node';
import { aZpl, completaClave, disenaDesdeDatos, disenaUbicacion, PERFIL_EJEMPLO, type DatosEtiqueta } from '../../../../tools/etiquetas-gs1/dist/index.js';
import { aSvg } from '../../../../tools/etiquetas-gs1/dist/svg.js';
import { G, SITIOS } from './datos.ts';

const ANIO = 2026;
export const CAJA: DatosEtiqueta = { tipo: 'caja', producto: 'Yogurt natural 1 kg', gtin: '09521234000020', caducidad: '2026-11-30', lote: 'L4471', sitio: 'CEDIS-NTE', unidades: 12 };
export const TARIMA: DatosEtiqueta = { tipo: 'tarima', producto: 'Gomitas surtidas 1 kg', sscc: completaClave('39521234000000001'), gtinContenido: G.DUL, cantidad: 60, caducidad: '2027-02-28', lote: 'G0302', sitio: 'CEDIS-NTE' };
const PERFIL_TARIMA = { ...PERFIL_EJEMPLO, altoMm: 152.4 };

export interface PiezaDeReferencia { readonly id: string; readonly titulo: string; readonly svg: string; readonly zpl: string }

export function piezasDeReferencia(): PiezaDeReferencia[] {
  const caja = disenaDesdeDatos(CAJA, PERFIL_EJEMPLO, ANIO);
  const tarima = disenaDesdeDatos(TARIMA, PERFIL_TARIMA, ANIO);
  const rack = disenaUbicacion(SITIOS[1]!, 'almacen', PERFIL_EJEMPLO, 'B-04-2');
  return [
    { id: 'caja', titulo: 'Caja (01)(17)(10), 4×2 in a 203 dpi', svg: aSvg(caja, bwipjs), zpl: aZpl(caja, PERFIL_EJEMPLO, { copias: 1 }) },
    { id: 'tarima', titulo: 'Tarima (02)(37)(17)(10) + SSCC (00), 4×6 in', svg: aSvg(tarima, bwipjs), zpl: aZpl(tarima, PERFIL_TARIMA, { copias: 1 }) },
    { id: 'ubicacion', titulo: 'Ubicación (414) GLN + (254) ALMACEN-B-04-2', svg: aSvg(rack, bwipjs), zpl: aZpl(rack, PERFIL_EJEMPLO, { copias: 1 }) },
  ];
}

/** Huella SHA-256 en hex (WebCrypto: sirve en Node y en el servidor de Next). */
export async function sha256(texto: string): Promise<string> {
  const d = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const rutaReferencia = (id: string) => `/laboratorio-etiquetas/referencias/${id}.svg`;
