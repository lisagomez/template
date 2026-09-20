import type { Piezas, VeredictoNuevo } from '../../types/index.ts';

/** Lo que todo panel recibe: el token (si el navegador esta emparejado), las voces y las piezas de la maquina. */
export interface ContextoPanel {
  token: string | undefined;
  voces: string[];
  piezas: Piezas | undefined;
  guardaVeredicto: (v: VeredictoNuevo) => Promise<boolean>;
}
