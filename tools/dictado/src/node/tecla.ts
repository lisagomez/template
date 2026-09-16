/**
 * La tecla global viene del lado Windows: `windows/tecla-global.ps1` sondea una tecla y avisa
 * por TCP a 127.0.0.1. Aqui se escucha ese socket y se traduce a los dos gestos de sflow:
 * MANTENER (pulsar-para-hablar) y DOS TOQUES (manos libres, hasta el siguiente toque).
 *
 * Por que TCP y no un pipe: Windows llega a los puertos de WSL2 por localhost sin configurar
 * nada; un named pipe o un archivo compartido pide permisos y rutas `\\wsl$` que cambian.
 * Solo se escucha en 127.0.0.1 y solo se aceptan dos palabras: no es una superficie.
 */
import { createServer, type Server, type Socket } from 'node:net';

export interface OpcionesTecla {
  puerto?: number;
  /** Un toque dura menos que esto (ms); mas largo es «mantener». */
  msToque?: number;
  /** Dos toques separados por menos de esto (ms) activan manos libres. */
  msEntreToques?: number;
  alMantener: () => void;
  alSoltar: () => void;
  alManosLibres: (activo: boolean) => void;
  alConectar?: () => void;
  alDesconectar?: () => void;
  ahora?: () => number;
}

export interface EscuchaTecla {
  readonly puerto: number;
  cierra(): Promise<void>;
}

/** Interpreta abajo/arriba con tiempos. Separado del socket para poder probarlo sin red. */
export function creaGestosDeTecla(opciones: Omit<OpcionesTecla, 'puerto' | 'alConectar' | 'alDesconectar'>): { abajo(): void; arriba(): void } {
  const ahora = opciones.ahora ?? (() => performance.now());
  const msToque = opciones.msToque ?? 250;
  const msEntreToques = opciones.msEntreToques ?? 400;
  let bajadaMs = 0;
  let ultimoToqueMs = -Infinity;
  let manteniendo = false;
  let manosLibres = false;
  return {
    abajo() {
      bajadaMs = ahora();
      if (manosLibres) return;
      // Se decide al soltar si fue toque o mantener; pero para no perder el principio de la
      // frase, se empieza a escuchar YA y si resulta ser un toque se descarta.
      manteniendo = true;
      opciones.alMantener();
    },
    arriba() {
      const duracion = ahora() - bajadaMs;
      if (manosLibres) {
        if (duracion <= msToque) {
          manosLibres = false;
          opciones.alManosLibres(false);
        }
        return;
      }
      if (manteniendo) {
        manteniendo = false;
        opciones.alSoltar();
      }
      if (duracion <= msToque) {
        const t = ahora();
        if (t - ultimoToqueMs <= msEntreToques) {
          ultimoToqueMs = -Infinity;
          manosLibres = true;
          opciones.alManosLibres(true);
        } else {
          ultimoToqueMs = t;
        }
      }
    },
  };
}

export function escuchaTecla(opciones: OpcionesTecla): Promise<EscuchaTecla> {
  const gestos = creaGestosDeTecla(opciones);
  const clientes = new Set<Socket>();
  const servidor: Server = createServer((socket) => {
    clientes.add(socket);
    opciones.alConectar?.();
    let resto = '';
    socket.setEncoding('utf8');
    socket.on('data', (d: string) => {
      resto += d;
      let corte = resto.indexOf('\n');
      while (corte !== -1) {
        const palabra = resto.slice(0, corte).trim();
        resto = resto.slice(corte + 1);
        corte = resto.indexOf('\n');
        if (palabra === 'abajo') gestos.abajo();
        else if (palabra === 'arriba') gestos.arriba();
        else socket.destroy(); // solo dos palabras: cualquier otra cosa no es el ayudante
      }
    });
    socket.on('close', () => {
      clientes.delete(socket);
      opciones.alDesconectar?.();
    });
    socket.on('error', () => undefined);
  });
  return new Promise((resuelve, rechaza) => {
    servidor.on('error', rechaza);
    servidor.listen(opciones.puerto ?? 47_123, '127.0.0.1', () => {
      const direccion = servidor.address();
      const puerto = typeof direccion === 'object' && direccion ? direccion.port : (opciones.puerto ?? 47_123);
      resuelve({
        puerto,
        cierra: () =>
          new Promise<void>((r) => {
            for (const c of clientes) c.destroy();
            servidor.close(() => r());
          }),
      });
    });
  });
}
