/** Lo que el servidor le pasa a la ventana de Ágora (todo plano y serializable). */
import type { NodoArbol, Pendiente, Yo } from '../../../tools/agora/dist/index.js';

export interface PersonaVisible { clave: string; nombre: string; titulo: string }

export type DatosDeAgora =
  | { apagada: true; motivo: string }
  | { apagada: false; yo: Yo; arbol: NodoArbol[]; espera: Pendiente[]; personas: PersonaVisible[]; persona: string; periodo: string; hoy: string;
      fechas: Array<{ id: string; nombre: string; fin: string; categoria: string; version: number }>; cierres: string[] };

export type Resultado<T = unknown> = { ok: true; valor: T } | { ok: false; motivo: string };
