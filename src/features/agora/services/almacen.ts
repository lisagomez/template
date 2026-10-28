/**
 * Dónde guarda la capa lo de Ágora en el navegador. Persisten SOLO las preferencias (las de `PREFERENCIAS` y el
 * primer arranque con «cuánto pregunta»); la conversación y los recuerdos libres viven en la memoria de la pestaña y
 * se van al cerrarla: en Ágora una respuesta puede traer una cifra del libro, y la memoria no guarda cifras ni hilos.
 */
import { AlmacenEnMemoria, type Almacen } from '../../../../tools/capa/dist/index.js';
import { AlmacenNavegador } from '../../../../tools/capa/dist/react/index.js';
import { PREFERENCIAS } from './preferencias';

const PERSISTE = new RegExp(`/(agora/(${Object.keys(PREFERENCIAS).join('|')})|capa/primer-arranque)$`);

export class AlmacenDeAgora implements Almacen {
  private readonly disco: Almacen;
  private readonly pestana = new AlmacenEnMemoria();
  constructor(disco: Almacen = new AlmacenNavegador('capa:agora:')) { this.disco = disco; }
  persiste(clave: string): boolean { return PERSISTE.test(clave); }
  lee(clave: string) { return this.persiste(clave) ? this.disco.lee(clave) : this.pestana.lee(clave); }
  escribe(clave: string, valor: string) { return this.persiste(clave) ? this.disco.escribe(clave, valor) : this.pestana.escribe(clave, valor); }
  borra(clave: string) { return this.persiste(clave) ? this.disco.borra(clave) : this.pestana.borra(clave); }
  async claves(prefijo: string) { return [...new Set([...(await this.disco.claves(prefijo)), ...(await this.pestana.claves(prefijo))])].sort(); }
}
