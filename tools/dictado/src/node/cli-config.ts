/**
 * Configuracion del CLI: entorno + argumentos. Nada de secretos en pantalla: `describe()`
 * enmascara el token del servicio remoto.
 *
 *   DICTADO_DATOS     carpeta de historial, diccionario y snippets   (~/.dictado)
 *   DICTADO_MODELOS   carpeta con los modelos (pesos NO viajan)      (~/.dictado/modelos)
 *   DICTADO_RUNTIME   carpeta cuyo node_modules trae sherpa-onnx-node y onnxruntime-node
 *   DICTADO_PYTHON    python con faster-whisper instalado            (python3)
 *   DICTADO_REMOTO_URL / DICTADO_REMOTO_TOKEN   el servicio de `servicio/`
 */
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface Argumentos {
  orden: string;
  posicionales: string[];
  opciones: Record<string, string | boolean>;
}

/** `--clave valor`, `--clave=valor`, `--bandera`. Sin dependencias. */
export function parseaArgumentos(argv: readonly string[]): Argumentos {
  const posicionales: string[] = [];
  const opciones: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (!a.startsWith('--')) {
      posicionales.push(a);
      continue;
    }
    const igual = a.indexOf('=');
    if (igual !== -1) {
      opciones[a.slice(2, igual)] = a.slice(igual + 1);
      continue;
    }
    const siguiente = argv[i + 1];
    if (siguiente !== undefined && !siguiente.startsWith('--')) {
      opciones[a.slice(2)] = siguiente;
      i++;
    } else {
      opciones[a.slice(2)] = true;
    }
  }
  return { orden: posicionales[0] ?? 'ayuda', posicionales: posicionales.slice(1), opciones };
}

export interface Configuracion {
  datos: string;
  modelos: string;
  runtime: string | undefined;
  python: string;
  remoto: { url: string | undefined; token: string | undefined };
  hilos: number;
  describe(): string;
}

const entorno = (nombre: string): string | undefined => {
  const v = process.env[nombre];
  return v === undefined || v === '' ? undefined : v;
};

export function leeConfiguracion(opciones: Record<string, string | boolean>): Configuracion {
  const texto = (clave: string, variable: string, porDefecto?: string): string | undefined => {
    const v = opciones[clave];
    return typeof v === 'string' ? resolve(v) : (entorno(variable) ?? porDefecto);
  };
  const datos = texto('datos', 'DICTADO_DATOS', join(homedir(), '.dictado')) as string;
  const modelos = texto('modelos', 'DICTADO_MODELOS', join(datos, 'modelos')) as string;
  const runtime = texto('runtime', 'DICTADO_RUNTIME');
  const python = texto('python', 'DICTADO_PYTHON', 'python3') as string;
  const hilos = Number(opciones['hilos'] ?? entorno('DICTADO_HILOS') ?? 8);
  const remoto = { url: texto('url', 'DICTADO_REMOTO_URL'), token: entorno('DICTADO_REMOTO_TOKEN') };
  return {
    datos,
    modelos,
    runtime,
    python,
    remoto,
    hilos: Number.isFinite(hilos) && hilos > 0 ? hilos : 8,
    describe() {
      const token = remoto.token ? `presente (largo ${remoto.token.length})` : 'ausente';
      return `datos=${datos} modelos=${modelos} runtime=${runtime ?? '(node_modules del paquete)'} python=${python} hilos=${hilos} remoto=${remoto.url ?? '(sin url)'} token=${token}`;
    },
  };
}

export const AYUDA = `dictado — hablar y que el texto aparezca donde esta el cursor (WSL2 → Windows)

  dictado dictar [--modo alternar|manos-libres|pulsar] [--motor parakeet|whisper-turbo|whisper-base|faster-whisper:small|remoto]
                 [--pegar portapapeles|teclear|ninguno] [--tecla [0xA3]] [--silencio-ms 700] [--idioma es]
  dictado archivo <audio> [--motor ...]                        transcribe un archivo y mide (modo archivo)
  dictado lote <audio> [--hablantes N] [--motor ...]           reunion: turnos por voz + texto por dictado
  dictado historial [--busca texto] [--n 20]
  dictado diccionario lista | agrega <termino...> | quita <termino>
  dictado snippets lista | agrega "<disparador>" "<expansion>" | quita "<disparador>"
  dictado motores                                              que motores hay en la carpeta de modelos
  dictado config                                               que configuracion se esta usando (sin secretos)

Entorno: DICTADO_DATOS, DICTADO_MODELOS, DICTADO_RUNTIME, DICTADO_PYTHON, DICTADO_REMOTO_URL, DICTADO_REMOTO_TOKEN, DICTADO_HILOS
`;
