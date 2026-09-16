/**
 * El pegador de WSL2: el texto acaba donde este el cursor de WINDOWS.
 *
 * Desde WSL no hay `/dev/input` del teclado ni acceso al portapapeles de Windows; lo que si hay
 * es interop: `powershell.exe` arranca desde aqui. Se lanza UNA vez, con `windows/pegador.ps1`
 * (un archivo que el humano puede leer), y se le habla por stdin: cada arranque de PowerShell
 * cuesta 200-400 ms, y esa es justo la latencia que un dictado no puede pagar en cada frase.
 * Medido el 2026-09-15: 1 312 ms el arranque, 2 ms cada orden despues.
 *
 * Dos metodos, como en sflow: `portapapeles` (Set-Clipboard + Ctrl+V; rapido y fiel con
 * cualquier texto; restaura lo que hubiera) y `teclear` (SendKeys letra a letra; no toca el
 * portapapeles pero es lento y algunos terminales se comen teclas rapidas).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Accion, Pegador } from '../types.js';
import { creaHijoPorLineas, type MensajeHijo } from './hijo-por-lineas.js';

export interface OpcionesPegadorWindows {
  metodo?: 'portapapeles' | 'teclear';
  powershell?: string;
  /** Con `portapapeles`, devolver lo que hubiera antes. Por defecto si. */
  restauraPortapapeles?: boolean;
  msEspera?: number;
  /** Ruta al script; por defecto el `windows/pegador.ps1` del paquete. */
  rutaScript?: string;
}

export interface PegadorWindows extends Pegador {
  readonly metodo: 'portapapeles' | 'teclear';
  /** Lo que hay ahora en el portapapeles de Windows. Es la evidencia de maquina de que se pego. */
  lee(): Promise<string>;
  cierra(): Promise<void>;
}

interface Respuesta extends MensajeHijo {
  b64?: string;
}

const RUTA_SCRIPT_PAQUETE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'windows', 'pegador.ps1');
const b64 = (texto: string) => Buffer.from(texto, 'utf8').toString('base64');

export function creaPegadorWindows(opciones: OpcionesPegadorWindows = {}): PegadorWindows {
  const metodo = opciones.metodo ?? 'portapapeles';
  const script = readFileSync(opciones.rutaScript ?? RUTA_SCRIPT_PAQUETE, 'utf8');
  const hijo = creaHijoPorLineas<Respuesta>({
    nombre: 'pegador de Windows',
    comando: opciones.powershell ?? 'powershell.exe',
    // -EncodedCommand: el script viaja entero en el argumento, sin depender de que Windows vea la ruta de WSL.
    argumentos: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    msEspera: opciones.msEspera ?? 10_000,
    msEsperaArranque: opciones.msEspera ?? 10_000,
    despedida: null,
  });

  return {
    metodo,
    async pega(texto) {
      if (metodo === 'teclear') await hijo.pide({ op: 'teclea', b64: b64(texto) });
      else await hijo.pide({ op: 'pega', b64: b64(texto), restaura: opciones.restauraPortapapeles ?? true });
    },
    async ejecuta(acciones: readonly Accion[]) {
      for (const accion of acciones) if (accion === 'enter') await hijo.pide({ op: 'enter' });
    },
    async lee() {
      const r = await hijo.pide({ op: 'lee' });
      return Buffer.from(r.b64 ?? '', 'base64').toString('utf8');
    },
    cierra: () => hijo.cierra(),
  };
}
