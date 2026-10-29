/**
 * Dónde guarda la capa lo de Ágora en el navegador. Persisten SOLO las preferencias (las de `PREFERENCIAS` y el
 * primer arranque con «cuánto pregunta»); la conversación y los recuerdos libres viven en la memoria de la pestaña y
 * se van al cerrarla: en Ágora una respuesta puede traer una cifra del libro, y la memoria no guarda cifras ni hilos.
 *
 * Lo que la PERSONA escribe o dicta en la conversación, además, se atestigua en la base (su huella, no el texto):
 * así el freno de lo irreversible se comprueba también en el servidor, no solo con el clic del navegador.
 */
import { AlmacenEnMemoria, type Almacen } from '../../../../tools/capa/dist/index.js';
import { AlmacenNavegador } from '../../../../tools/capa/dist/react/index.js';
import { PREFERENCIAS } from './preferencias';
import { atestiguaLoDicho } from './acciones';

const PERSISTE = new RegExp(`/(agora/(${Object.keys(PREFERENCIAS).join('|')})|capa/primer-arranque)$`);
const CONVERSACION = /\/capa\/conversacion$/;
type Dicho = { id: string; de: string; texto: string };
const esDicho = (m: unknown): m is Dicho => typeof m === 'object' && m !== null && typeof (m as Dicho).id === 'string' && typeof (m as Dicho).texto === 'string' && (m as Dicho).de === 'persona';

export class AlmacenDeAgora implements Almacen {
  private readonly disco: Almacen;
  private readonly pestana = new AlmacenEnMemoria();
  private readonly atestiguados = new Set<string>();
  private readonly testigo: (textos: string[]) => Promise<unknown>;
  constructor(disco: Almacen = new AlmacenNavegador('capa:agora:'), testigo: (textos: string[]) => Promise<unknown> = (textos) => atestiguaLoDicho({ textos })) {
    this.disco = disco;
    this.testigo = testigo;
  }
  persiste(clave: string): boolean { return PERSISTE.test(clave); }
  lee(clave: string) { return this.persiste(clave) ? this.disco.lee(clave) : this.pestana.lee(clave); }
  async escribe(clave: string, valor: string) {
    if (CONVERSACION.test(clave)) await this.atestigua(valor);
    return this.persiste(clave) ? this.disco.escribe(clave, valor) : this.pestana.escribe(clave, valor);
  }
  /** Los mensajes NUEVOS de la persona (nunca los del asistente) van a la base antes de que la capa siga. */
  private async atestigua(valor: string) {
    let lista: unknown;
    try { lista = JSON.parse(valor); } catch { return; }
    const nuevos = (Array.isArray(lista) ? lista : []).filter(esDicho).filter((m) => !this.atestiguados.has(m.id));
    if (!nuevos.length) return;
    for (const m of nuevos) this.atestiguados.add(m.id);
    // Si la base no lo recibe, la conversación sigue; lo irreversible fallará cerrado («la cita no es tuya»).
    await this.testigo(nuevos.slice(-10).map((m) => m.texto)).catch(() => undefined);
  }
  borra(clave: string) { return this.persiste(clave) ? this.disco.borra(clave) : this.pestana.borra(clave); }
  async claves(prefijo: string) { return [...new Set([...(await this.disco.claves(prefijo)), ...(await this.pestana.claves(prefijo))])].sort(); }
}
