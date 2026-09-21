/**
 * Configuracion del CLI: rutas por entorno + argumentos, y los AJUSTES de la persona
 * (`<datos>/ajustes.json`, ver `../ajustes.ts`) resueltos con precedencia
 * argumento > entorno > ajustes > defecto; cada valor sabe de donde salio y `dictado config`
 * lo ensena. Nada de secretos en pantalla: `describe()` enmascara el token del servicio remoto,
 * y el token nunca entra en `ajustes.json`.
 *
 *   DICTADO_DATOS     carpeta de historial, diccionario, snippets y ajustes.json (~/.dictado)
 *   DICTADO_MODELOS   carpeta con los modelos (pesos NO viajan)      (~/.dictado/modelos)
 *   DICTADO_RUNTIME   carpeta cuyo node_modules trae sherpa-onnx-node y onnxruntime-node
 *   DICTADO_PYTHON    python con faster-whisper instalado            (python3)
 *   DICTADO_REMOTO_URL / DICTADO_REMOTO_TOKEN   el servicio de `servicio/`
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { ESQUEMA, resuelve, valoresDe, type Ajustes, type AjustesResueltos, type Clave } from '../ajustes.js';
import { leeArchivoAjustes, type ArchivoAjustes } from './ajustes-archivo.js';
import { motoresDisponibles } from './cli-motores.js';

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
  /** Cada ajuste con su valor y su origen (argumento, entorno, ajustes, defecto). */
  ajustes: AjustesResueltos;
  /** Solo los valores: lo que consume el codigo. */
  valores: Ajustes;
  /** Lo que se leyo del archivo (o por que no), para `ajustes` y `diagnostico`. */
  archivoAjustes: ArchivoAjustes;
  /** Avisos de lectura y de valores invalidos descartados: se imprimen una vez, nunca tumban nada. */
  avisosAjustes: string[];
  /** Los argumentos con los que se resolvio, para volver a resolver cuando el archivo cambie en caliente. */
  opciones: Readonly<Record<string, string | boolean>>;
  /** Vuelve a resolver con un archivo nuevo (misma precedencia) sin tocar `this`. */
  resuelveCon(archivo: ArchivoAjustes): { ajustes: AjustesResueltos; avisos: string[] };
  /** Solo las rutas y el servicio remoto (token enmascarado): una linea. */
  describeRutas(): string;
  /** Los ajustes que NO estan en su defecto, con su origen: una linea. */
  describeCambiados(): string;
  /** Rutas + todos los ajustes con origen: lo de `dictado config`. */
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
  // Sin DICTADO_RUNTIME, los runtimes que dejo `dictado instala` en <datos>/runtime valen: si no,
  // una maquina recien instalada no encontraba sherpa-onnx (visto al medir en limpio el 2026-09-20).
  const runtimeInstalado = join(datos, 'runtime');
  const runtime = texto('runtime', 'DICTADO_RUNTIME') ?? (existsSync(join(runtimeInstalado, 'node_modules')) ? runtimeInstalado : undefined);
  const python = texto('python', 'DICTADO_PYTHON', 'python3') as string;
  const remoto = { url: texto('url', 'DICTADO_REMOTO_URL'), token: entorno('DICTADO_REMOTO_TOKEN') };
  const contexto = { motoresInstalados: motoresDisponibles({ modelos, remoto }) };
  const resuelveCon = (archivo: ArchivoAjustes) => {
    const r = resuelve({ argumentos: opciones, entorno: process.env, archivo: archivo.valores, contexto });
    return { ajustes: r.ajustes, avisos: [...archivo.avisos, ...r.avisos] };
  };
  const archivoAjustes = leeArchivoAjustes(datos);
  const { ajustes, avisos } = resuelveCon(archivoAjustes);
  const valores = valoresDe(ajustes);
  return {
    datos,
    modelos,
    runtime,
    python,
    remoto,
    hilos: valores.hilos,
    ajustes,
    valores,
    archivoAjustes,
    avisosAjustes: avisos,
    opciones,
    resuelveCon,
    describeRutas() {
      const token = remoto.token ? `presente (largo ${remoto.token.length})` : 'ausente';
      return `datos=${datos} modelos=${modelos} runtime=${runtime ?? '(node_modules del paquete)'} python=${python} remoto=${remoto.url ?? '(sin url)'} token=${token}`;
    },
    describeCambiados() {
      const cambiados = ESQUEMA.filter((c) => ajustes[c.clave].origen !== 'defecto').map((c) => `${c.clave}=${String(ajustes[c.clave].valor)} (${ajustes[c.clave].origen})`);
      return `ajustes: ${archivoAjustes.existe ? archivoAjustes.ruta : 'sin archivo'} · ${cambiados.length > 0 ? cambiados.join(' · ') : 'todo por defecto'}`;
    },
    describe() {
      return `${this.describeRutas()}\najustes: ${archivoAjustes.existe ? `${archivoAjustes.ruta} (version ${archivoAjustes.version})` : `${archivoAjustes.ruta} (no existe: todo por defecto)`}\n${describeAjustes(ajustes)}`;
    },
  };
}

/** Una linea por ajuste: `clave = valor (origen)`. Lo que `dictado config` y `dictado ajustes` ensenan. */
export function describeAjustes(ajustes: AjustesResueltos, claves: readonly Clave[] = ESQUEMA.map((c) => c.clave)): string {
  const ancho = Math.max(...claves.map((k) => k.length));
  return claves.map((k) => `  ${k.padEnd(ancho)}  ${String(ajustes[k].valor).padEnd(22)} (${ajustes[k].origen})`).join('\n');
}

export const AYUDA = `dictado — hablar y que el texto aparezca donde esta el cursor (WSL2 → Windows)

  dictado dictar [--modo alternar|manos-libres|pulsar] [--motor parakeet|whisper-turbo|whisper-base|faster-whisper:small|remoto]
                 [--pegar portapapeles|teclear|ninguno] [--tecla [0xA3]] [--tecla-alternar] [--icono] [--icono-puerto 47124] [--respaldo faster-whisper:small] [--ganancia-db 12] [--silencio-ms 1000] [--idioma es]
  dictado instala [--app <ruta-de-la-app>] [--sin-icono]      maquina nueva en un paso: comprueba, pesos pineados, runtimes, token, icono, diagnostico
  dictado diagnostico [--json] [--sin-microfono]              version, piezas, microfono, demonio, log y sesiones — sin secretos ni texto dictado
  dictado icono instala | quita                                icono en la barra de Windows que arranca solo al iniciar sesion
  dictado archivo <audio> [--motor ...]                        transcribe un archivo y mide (modo archivo)
  dictado lote <audio> [--hablantes N] [--motor ...]           reunion: turnos por voz + texto por dictado
  dictado di "<texto>" [--voz es_MX-claude-high] [--velocidad 1.1] [--guarda voz.wav] [--altavoz windows|pulse] [--sin-sonido]   el agente habla (Piper local)
  dictado historial [--busca texto] [--n 20] | --borra [--antes YYYY-MM-DD] --si   (retencion por defecto: DICTADO_RETENCION_DIAS=365)
  dictado diccionario lista | agrega <termino...> | quita <termino>
  dictado snippets lista | agrega "<disparador>" "<expansion>" | quita "<disparador>"
  dictado pega "<texto>"                                       pega un texto donde este el cursor de Windows (o texto por stdin)
  dictado motores                                              que motores hay en la carpeta de modelos
  dictado config                                               rutas y ajustes en uso, cada uno con su origen (sin secretos)
  dictado ajustes [--json]                                     los ajustes con su origen (argumento > entorno > ajustes > defecto)
  dictado ajustes pon <clave> <valor> | quita <clave> | restablece --si | catalogo   se guardan en <datos>/ajustes.json; la pagina /ajustes hace lo mismo

Entorno: DICTADO_DATOS, DICTADO_MODELOS, DICTADO_RUNTIME, DICTADO_PYTHON, DICTADO_REMOTO_URL, DICTADO_REMOTO_TOKEN, DICTADO_HILOS, DICTADO_RETENCION_DIAS
Toda bandera de dictar tiene su ajuste; sin bandera manda ajustes.json, y sin el, el defecto.
`;
