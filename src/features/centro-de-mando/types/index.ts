import type { EstadoBucle, ModoBucle, RegistroTurno } from '../../../../tools/bucle-voz/dist/index.js';
import type { EstadoDetector } from '../services/detector.ts';

export interface EstadoServidor {
  demonio: boolean;
  modelo: string;
  prompt: string;
  llave: boolean;
  gasto: { gastadoUsd: number; topeUsd: number; nivel: 'ok' | 'aviso' | 'excedido'; filasSinCosto: number };
  agenda: boolean;
}

/** Una línea del registro de la conversación. */
export interface Entrada {
  id: string;
  turno: number;
  quien: 'persona' | 'maquina' | 'sistema';
  texto: string;
  /** Por dónde se resolvió: orden local, cerebro, o nada. */
  ruta?: 'orden' | 'llm';
  orden?: string;
  interrumpida?: boolean;
  especulativo?: boolean;
}

export interface FraseKaraoke {
  indice: number;
  texto: string;
  fraccion: number;
  /** El acuse inmediato (la frase fija mientras piensa), no parte de la respuesta. */
  acuse?: boolean;
}

export interface VistaCentro {
  estado: EstadoBucle;
  modo: ModoBucle;
  encendido: boolean;
  velocidad: number;
  entradas: Entrada[];
  /** La respuesta en curso, frase a frase, con lo que ya sonó. */
  frases: FraseKaraoke[];
  turnoFrases: number | undefined;
  oyendo: string;
  turnos: RegistroTurno[];
  avisos: string[];
  error: string | undefined;
  /** Qué detector de voz corre (se sabe al encender). */
  detector: EstadoDetector | undefined;
}
