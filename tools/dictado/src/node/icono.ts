/**
 * El icono de la barra viene del lado Windows: `windows/icono-barra.ps1` pone un NotifyIcon
 * en el area de notificacion y habla por TCP a 127.0.0.1, igual que la tecla global. Aqui se
 * escucha ese socket. El protocolo es minimo y va en los dos sentidos:
 *
 *   icono → dictado   `alternar`            un click: enciende o apaga el dictado
 *   dictado → icono   `estado <nombre>`     para que el icono SE VEA como esta el dictado
 *   dictado → icono   `pildora <visual>`    lo que pinta la pildora flotante (idle, escuchando,
 *                                           procesando, hecho, error), decidido en `pildora.ts`
 *   dictado → icono   `barras <20 enteros>` un cuadro del visualizador mientras escucha (~30/s)
 *
 * Al conectar, el icono recibe el estado y el visual actuales sin pedirlos; cualquier otra
 * palabra que mande cierra su socket: no es el ayudante. Un icono viejo que solo entienda
 * `estado` ignora el resto (sus lineas empiezan por otra palabra), asi que sigue funcionando. Puerto FIJO por defecto (47124, el de la tecla mas uno)
 * para que un icono lanzado desde Windows —arranque de sesion, doble click— encuentre al
 * dictado sin coordinarse con nadie.
 */
import { createServer, type Server, type Socket } from 'node:net';
import type { Estado } from '../dictado.js';
import { lineaDeBarras } from './barras.js';
import type { Visual } from './pildora.js';

export const PUERTO_ICONO = 47_124;

export interface OpcionesIcono {
  puerto?: number;
  alAlternar: () => void;
  alConectar?: () => void;
  alDesconectar?: () => void;
}

export interface EscuchaIcono {
  readonly puerto: number;
  /** Iconos conectados ahora mismo: sin ninguno no vale la pena calcular barras. */
  readonly conectados: number;
  /** Publica el estado a todos los iconos conectados; el ultimo se repite a quien conecte despues. */
  publicaEstado(estado: Estado): void;
  /** Publica lo que debe pintar la pildora; el ultimo se repite a quien conecte despues. */
  publicaPildora(visual: Visual): void;
  /** Un cuadro de barras (20 enteros 0-100). No se guarda: solo vale ahora. */
  publicaBarras(valores: readonly number[]): void;
  cierra(): Promise<void>;
}

export function escuchaIcono(opciones: OpcionesIcono): Promise<EscuchaIcono> {
  const clientes = new Set<Socket>();
  let ultimo: Estado = 'inactivo';
  let ultimoVisual: Visual = 'idle';
  const manda = (socket: Socket, estado: Estado) => socket.write(`estado ${estado}\n`);
  const mandaLinea = (linea: string) => {
    for (const c of clientes) c.write(`${linea}\n`);
  };
  const servidor: Server = createServer((socket) => {
    clientes.add(socket);
    socket.setEncoding('utf8');
    manda(socket, ultimo);
    socket.write(`pildora ${ultimoVisual}\n`);
    opciones.alConectar?.();
    let resto = '';
    socket.on('data', (d: string) => {
      resto += d;
      let corte = resto.indexOf('\n');
      while (corte !== -1) {
        const palabra = resto.slice(0, corte).trim();
        resto = resto.slice(corte + 1);
        corte = resto.indexOf('\n');
        if (palabra === 'alternar') opciones.alAlternar();
        else socket.destroy(); // una sola palabra: cualquier otra cosa no es el icono
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
    servidor.listen(opciones.puerto ?? PUERTO_ICONO, '127.0.0.1', () => {
      const direccion = servidor.address();
      const puerto = typeof direccion === 'object' && direccion ? direccion.port : (opciones.puerto ?? PUERTO_ICONO);
      resuelve({
        puerto,
        get conectados() {
          return clientes.size;
        },
        publicaPildora(visual) {
          ultimoVisual = visual;
          mandaLinea(`pildora ${visual}`);
        },
        publicaBarras(valores) {
          if (clientes.size > 0) mandaLinea(lineaDeBarras(valores));
        },
        publicaEstado(estado) {
          ultimo = estado;
          // Traza para medir la latencia estado → pintado (el icono anota su reloj al recibirla).
          if (process.env['DICTADO_ICONO_TRAZA'] === '1') console.log(`traza icono ${Date.now()} estado ${estado}`);
          for (const c of clientes) manda(c, estado);
        },
        cierra: () =>
          new Promise<void>((r) => {
            for (const c of clientes) c.destroy();
            servidor.close(() => r());
          }),
      });
    });
  });
}
