/** Ayudas de las pruebas: el lector de CFDI del extractor (construido por `prepara:gate`) y las pymes listas. */
import * as xml from '../../extractor-documental/dist/xml/index.js';
import { preparaPyme } from '../dist/laboratorio/index.js';

export const XML = xml;
export const distribuidora = () => preparaPyme(XML, 'distribuidora');
export const tienda = () => preparaPyme(XML, 'tienda');
