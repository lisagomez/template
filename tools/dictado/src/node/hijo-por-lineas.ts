/**
 * Un proceso hijo que habla JSON por lineas: una peticion por linea en su stdin, una respuesta
 * por linea en su stdout, cada una con el `id` de la peticion. Lo comparten el motor por
 * proceso (Python con faster-whisper) y el pegador de Windows (PowerShell): el mismo arranque
 * con tope, el mismo reparto por `id`, el mismo cierre con paciencia y luego sin ella.
 *
 * Escrito una vez a proposito: dos copias de esta contabilidad son dos sitios donde un mensaje
 * partido en dos trozos, o un hijo que muere a medias, se manejan distinto.
 */
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

export interface MensajeHijo {
  id?: number;
  listo?: boolean;
  error?: string;
  ok?: boolean;
}

export interface OpcionesHijo {
  nombre: string;
  comando: string;
  argumentos?: readonly string[];
  entorno?: Record<string, string>;
  cwd?: string;
  /** Tope por peticion. */
  msEspera: number;
  /** Tope hasta que el hijo diga `listo` (cargar un modelo tarda). */
  msEsperaArranque: number;
  /** Con que se despide: un mensaje (el hijo sale al leerlo) o `null` para cerrar su stdin. */
  despedida: Record<string, unknown> | null;
}

export interface HijoPorLineas<R extends MensajeHijo> {
  pide(mensaje: Record<string, unknown>): Promise<R>;
  cierra(): Promise<void>;
  readonly vivo: boolean;
}

type Hijo = ChildProcessByStdio<Writable, Readable, Readable>;
interface Pendiente<R> {
  resuelve: (r: R) => void;
  rechaza: (e: Error) => void;
  temporizador: NodeJS.Timeout;
}

/** Reparte un flujo de texto en lineas JSON, tolerando trozos partidos y lineas que no son JSON. */
export function escuchaLineas<R>(flujo: Readable, alMensaje: (m: R) => void): void {
  let resto = '';
  flujo.setEncoding('utf8');
  flujo.on('data', (trozo: string) => {
    resto += trozo;
    let corte = resto.indexOf('\n');
    while (corte !== -1) {
      const linea = resto.slice(0, corte).trim();
      resto = resto.slice(corte + 1);
      corte = resto.indexOf('\n');
      if (!linea.startsWith('{')) continue;
      try {
        alMensaje(JSON.parse(linea) as R);
      } catch {
        // una linea de log que empieza por `{` no es un mensaje
      }
    }
  });
}

/** Espera a que el proceso cierre; pasado el tope lo mata. */
function esperaCierre(proceso: Hijo, msTope: number): Promise<void> {
  return new Promise<void>((resuelve) => {
    const tope = setTimeout(() => {
      proceso.kill('SIGKILL');
      resuelve();
    }, msTope);
    proceso.on('close', () => {
      clearTimeout(tope);
      resuelve();
    });
  });
}

export function creaHijoPorLineas<R extends MensajeHijo>(opciones: OpcionesHijo): HijoPorLineas<R> {
  const pendientes = new Map<number, Pendiente<R>>();
  let siguiente = 1;
  let hijo: Hijo | undefined;
  let arranque: Promise<void> | undefined;
  let stderr = '';

  const fallaTodo = (mensaje: string) => {
    for (const [id, p] of pendientes) {
      clearTimeout(p.temporizador);
      p.rechaza(new Error(mensaje));
      pendientes.delete(id);
    }
  };

  const reparte = (m: R) => {
    if (m.id === undefined) return;
    const p = pendientes.get(m.id);
    if (!p) return;
    pendientes.delete(m.id);
    clearTimeout(p.temporizador);
    if (m.error !== undefined || m.ok === false) p.rechaza(new Error(`${opciones.nombre}: ${m.error ?? 'fallo'}`));
    else p.resuelve(m);
  };

  const arranca = (): Promise<void> => {
    if (arranque) return arranque;
    arranque = new Promise<void>((resuelve, rechaza) => {
      const proceso = spawn(opciones.comando, [...(opciones.argumentos ?? [])], { cwd: opciones.cwd, env: { ...process.env, ...opciones.entorno }, stdio: ['pipe', 'pipe', 'pipe'] });
      hijo = proceso;
      const tope = setTimeout(() => rechaza(new Error(`${opciones.nombre}: no dijo «listo» en ${opciones.msEsperaArranque} ms`)), opciones.msEsperaArranque);
      proceso.stderr.setEncoding('utf8');
      proceso.stderr.on('data', (d: string) => (stderr = (stderr + d).slice(-4000)));
      proceso.on('error', (e) => {
        clearTimeout(tope);
        rechaza(new Error(`${opciones.nombre}: no se pudo lanzar ${opciones.comando}: ${e.message}`));
      });
      proceso.on('close', (codigo) => {
        hijo = undefined;
        arranque = undefined;
        clearTimeout(tope);
        const motivo = `${opciones.nombre}: termino con ${codigo}. ${stderr.trim().split('\n').slice(-3).join(' | ')}`;
        // Si murio antes de decir «listo», quien espera el arranque se entera YA, no al tope.
        rechaza(new Error(motivo));
        fallaTodo(motivo);
      });
      escuchaLineas<R>(proceso.stdout, (m) => {
        if (m.listo) {
          clearTimeout(tope);
          resuelve();
        } else reparte(m);
      });
    });
    return arranque;
  };

  return {
    get vivo() {
      return hijo !== undefined;
    },
    async pide(mensaje) {
      await arranca();
      const id = siguiente++;
      return new Promise<R>((resuelve, rechaza) => {
        const temporizador = setTimeout(() => {
          pendientes.delete(id);
          rechaza(new Error(`${opciones.nombre}: sin respuesta en ${opciones.msEspera} ms`));
        }, opciones.msEspera);
        pendientes.set(id, { resuelve, rechaza, temporizador });
        hijo?.stdin.write(JSON.stringify({ id, ...mensaje }) + '\n');
      });
    },
    async cierra() {
      if (!hijo) return;
      const proceso = hijo;
      if (opciones.despedida) proceso.stdin.write(JSON.stringify(opciones.despedida) + '\n');
      else proceso.stdin.end();
      await esperaCierre(proceso, 5_000);
    },
  };
}
