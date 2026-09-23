/**
 * El socket por el que OTROS le piden al dictado que hable: `dictado di` cuando hay un `dictar`
 * en marcha, y el hook `Stop` de Claude Code con la respuesta del agente. Un solo proceso toca
 * microfono y altavoz, asi que callar el microfono mientras suena la voz es una llamada local.
 *
 * Protocolo por lineas UTF-8, en 127.0.0.1 (RF-41), mismo patron que la tecla (47123) y el
 * icono (47124); el demonio usa el 47125. Cualquier otra palabra cierra el socket: no es una
 * superficie, no ejecuta nada, y el texto va acotado.
 *
 *   servidor → cliente al conectar   `dictar <on|off> <inactivo|escuchando|transcribiendo|pegando>`
 *   cliente → servidor               `di <base64 utf8>` | `calla` | `estado`
 *   servidor → cliente               `ok` | `omitido <motivo>` | `hablando` | `hecho <msPrimerAudio> <msTotal>` | `cortado`
 */
import { connect, createServer, type Server, type Socket } from 'node:net';

export const PUERTO_CONVERSACION = 47_126;
/** Caracteres decodificados como mucho por peticion: una respuesta hablable cabe de sobra. */
export const MAX_CARACTERES_DI = 4_000;

export type RespuestaDi = { tipo: 'hecho'; msPrimerAudio: number; msTotal: number } | { tipo: 'cortado' } | { tipo: 'omitido'; motivo: string };

export interface OpcionesSocketConversacion {
  puerto?: number;
  /** `on|off <estado>`: lo que se saluda al conectar y se contesta a `estado`. */
  saludo: () => string;
  /** Recibe el texto ya decodificado; resuelve cuando termino de sonar (o se corto u omitio). */
  alDi: (texto: string) => Promise<RespuestaDi>;
  alCalla: () => void;
}

export interface EscuchaConversacion {
  readonly puerto: number;
  cierra(): Promise<void>;
}

const formatea = (r: RespuestaDi): string => (r.tipo === 'hecho' ? `hecho ${Math.round(r.msPrimerAudio)} ${Math.round(r.msTotal)}` : r.tipo === 'cortado' ? 'cortado' : `omitido ${r.motivo}`);

export function escuchaConversacion(o: OpcionesSocketConversacion): Promise<EscuchaConversacion> {
  const clientes = new Set<Socket>();
  const servidor: Server = createServer((socket) => {
    clientes.add(socket);
    socket.setEncoding('utf8');
    socket.write(`dictar ${o.saludo()}\n`);
    let resto = '';
    const atiende = (linea: string) => {
      if (linea === 'estado') return socket.write(`dictar ${o.saludo()}\n`);
      if (linea === 'calla') {
        o.alCalla();
        return socket.write('ok\n');
      }
      if (linea.startsWith('di ')) {
        const texto = Buffer.from(linea.slice(3), 'base64').toString('utf8').trim();
        if (texto.length === 0 || texto.length > MAX_CARACTERES_DI) return socket.write(`omitido ${texto.length === 0 ? 'texto-vacio' : 'texto-demasiado-largo'}\n`);
        socket.write('ok\n');
        void o
          .alDi(texto)
          .then((r) => socket.write(`${formatea(r)}\n`))
          .catch((e: unknown) => socket.write(`omitido ${(e instanceof Error ? e.message : String(e)).replace(/\s+/g, '-').slice(0, 80)}\n`));
        return true;
      }
      socket.destroy(); // no es un cliente de este protocolo
      return false;
    };
    socket.on('data', (d: string) => {
      resto += d;
      let corte = resto.indexOf('\n');
      while (corte >= 0) {
        const linea = resto.slice(0, corte).trim();
        resto = resto.slice(corte + 1);
        if (linea.length > 0 && atiende(linea) === false) return;
        corte = resto.indexOf('\n');
      }
    });
    socket.on('error', () => undefined);
    socket.on('close', () => clientes.delete(socket));
  });
  return new Promise((resuelve, rechaza) => {
    servidor.once('error', rechaza);
    servidor.listen(o.puerto ?? PUERTO_CONVERSACION, '127.0.0.1', () => {
      const direccion = servidor.address();
      resuelve({
        puerto: typeof direccion === 'object' && direccion ? direccion.port : (o.puerto ?? PUERTO_CONVERSACION),
        cierra: () =>
          new Promise((r) => {
            for (const c of clientes) c.destroy();
            servidor.close(() => r());
          }),
      });
    });
  });
}

export type ResultadoPideDi =
  | { modo: 'sin-dictar' }
  | { modo: 'apagado'; estado: string }
  | ({ modo: 'dictar' } & RespuestaDi);

/**
 * El cliente: conecta, lee el saludo y, si hay dictado, le manda el texto y espera a que termine
 * de sonar. Sin `dictar` (conexion rehusada o sin saludo en `msConexion`) devuelve `sin-dictar`
 * en ese plazo: el que llama sintetiza en local. Con `soloEncendido`, un dictado con la
 * conversacion apagada o sin escuchar devuelve `apagado` sin mandar nada (lo que exige el hook).
 */
export function pideDi(texto: string, opciones: { puerto?: number; msConexion?: number; msRespuesta?: number; soloEncendido?: boolean } = {}): Promise<ResultadoPideDi> {
  const puerto = opciones.puerto ?? PUERTO_CONVERSACION;
  return new Promise((resuelve) => {
    let resto = '';
    let saludado = false;
    let terminado = false;
    const socket = connect({ host: '127.0.0.1', port: puerto });
    const acaba = (r: ResultadoPideDi) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(plazoConexion);
      clearTimeout(plazoRespuesta);
      socket.destroy();
      resuelve(r);
    };
    const plazoConexion = setTimeout(() => acaba({ modo: 'sin-dictar' }), opciones.msConexion ?? 300);
    let plazoRespuesta: ReturnType<typeof setTimeout> | undefined;
    socket.setEncoding('utf8');
    socket.on('error', () => acaba({ modo: 'sin-dictar' }));
    socket.on('close', () => acaba({ modo: 'sin-dictar' }));
    socket.on('data', (d: string) => {
      resto += d;
      let corte = resto.indexOf('\n');
      while (corte >= 0) {
        const linea = resto.slice(0, corte).trim();
        resto = resto.slice(corte + 1);
        corte = resto.indexOf('\n');
        if (!saludado) {
          if (!linea.startsWith('dictar ')) return acaba({ modo: 'sin-dictar' });
          saludado = true;
          clearTimeout(plazoConexion);
          const [encendido, estado] = linea.slice(7).split(' ');
          if (opciones.soloEncendido && (encendido !== 'on' || estado !== 'escuchando')) return acaba({ modo: 'apagado', estado: `${encendido ?? '?'} ${estado ?? '?'}` });
          socket.write(`di ${Buffer.from(texto, 'utf8').toString('base64')}\n`);
          plazoRespuesta = setTimeout(() => acaba({ modo: 'dictar', tipo: 'omitido', motivo: 'sin-respuesta' }), opciones.msRespuesta ?? 180_000);
          continue;
        }
        if (linea === 'ok' || linea === 'hablando') continue;
        if (linea.startsWith('hecho ')) {
          const [a, b] = linea.slice(6).split(' ').map(Number);
          return acaba({ modo: 'dictar', tipo: 'hecho', msPrimerAudio: a ?? 0, msTotal: b ?? 0 });
        }
        if (linea === 'cortado') return acaba({ modo: 'dictar', tipo: 'cortado' });
        if (linea.startsWith('omitido')) return acaba({ modo: 'dictar', tipo: 'omitido', motivo: linea.slice(8) || 'sin-motivo' });
      }
    });
  });
}
