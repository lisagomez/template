/**
 * El almacen de la app: un archivo JSON local (adaptador inyectado del nucleo). La base de
 * datos compartida NO se toca: integrarlo al ERP es una propuesta aparte, validada en un
 * Postgres efimero (ver tools/etiquetas-gs1/migraciones/).
 *
 * ETIQUETAS_DATOS: carpeta del archivo (por defecto .datos/etiquetas, fuera de git).
 * ETIQUETAS_SEMILLA=ficticia: si el archivo no existe, arranca con datos de demostracion.
 */
import { join, resolve } from 'node:path';
import { almacenEnArchivo } from '../../../../../tools/etiquetas-gs1/dist/almacenes/archivo.js';
import { estadoVacio, type AlmacenEtiquetas } from '../nucleo.ts';
import { semillaFicticia } from './semilla.ts';

let almacen: AlmacenEtiquetas | undefined;

/** Fecha de hoy en la zona de la operacion (Mexico por defecto), como AAAA-MM-DD. */
export function hoyIso(zona = process.env['ETIQUETAS_ZONA'] || 'America/Mexico_City'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function almacenDelServidor(): AlmacenEtiquetas {
  if (!almacen) {
    // turbopackIgnore: la carpeta de datos se decide en tiempo de ejecucion; sin esto Turbopack
    // rastrea el proyecto entero como assets del servidor (aprendizaje del 2026-09-20).
    const carpeta = resolve(/*turbopackIgnore: true*/ process.env['ETIQUETAS_DATOS'] || '.datos/etiquetas');
    const semilla = process.env['ETIQUETAS_SEMILLA'] === 'ficticia';
    almacen = almacenEnArchivo(join(/*turbopackIgnore: true*/ carpeta, 'estado.json'), () => (semilla ? semillaFicticia(hoyIso()) : estadoVacio()));
  }
  return almacen;
}
