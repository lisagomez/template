/**
 * Estado global del dictado (Zustand como hook directo: sin Provider ni boilerplate). Vive en
 * `shared/stores` porque el dictado se controla desde varias partes de la app: cualquier
 * componente hace `const { estado, alterna } = useDictado()` y ve lo mismo.
 *
 * La fuente de verdad es el pipeline de `tools/dictado` via `/api/dictado` (el mismo
 * protocolo del icono de la barra); este store solo lo refleja y lo acciona.
 */
import { create } from 'zustand';
import { z } from 'zod';

export const esquemaEstadoDictado = z.object({
  estado: z.enum(['desconectado', 'inactivo', 'escuchando', 'transcribiendo', 'pegando']),
});
export type EstadoDictado = z.infer<typeof esquemaEstadoDictado>['estado'];

interface DictadoStore {
  estado: EstadoDictado;
  /** true mientras hay una llamada en vuelo: el boton se deshabilita para no dobletear. */
  ocupado: boolean;
  /** Lee el estado actual del pipeline (para el sondeo periodico del boton). */
  sondea: () => Promise<void>;
  /** Un click: enciende o apaga el dictado, y refleja el estado que quedo. */
  alterna: () => Promise<void>;
}

async function llama(metodo: 'GET' | 'POST'): Promise<EstadoDictado> {
  try {
    const respuesta = await fetch('/api/dictado', { method: metodo });
    return esquemaEstadoDictado.parse(await respuesta.json()).estado;
  } catch {
    return 'desconectado';
  }
}

export const useDictado = create<DictadoStore>((set, get) => ({
  estado: 'desconectado',
  ocupado: false,
  sondea: async () => {
    if (get().ocupado) return;
    set({ estado: await llama('GET') });
  },
  alterna: async () => {
    if (get().ocupado) return;
    set({ ocupado: true });
    try {
      set({ estado: await llama('POST') });
    } finally {
      set({ ocupado: false });
    }
  },
}));
