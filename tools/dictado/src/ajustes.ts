/**
 * Los ajustes del dictado: lo que la persona decide UNA vez y la maquina recuerda. Aqui vive lo
 * puro —defectos, esquema, validacion, migracion, precedencia y catalogo— sin tocar el disco;
 * `node/ajustes-archivo.ts` lee y escribe `<datos>/ajustes.json`.
 *
 * Lo que trae de `config.py` de sflow (MIT, © Daniel Carreon): un archivo con defectos en un
 * solo sitio, que se cambia en caliente desde la UI, con migracion por version y un catalogo de
 * motores con cifras. Lo que cambia aqui: la precedencia es explicita y VISIBLE
 * (argumento > entorno > ajustes > defecto, y cada valor dice de donde salio), el archivo no
 * lleva NUNCA un secreto (el token sigue en el entorno), y las cifras del catalogo son las de
 * ESTA maquina (`medicion/ultima-medicion-cpu.json`), no la tabla de otra.
 *
 * Que NO es un ajuste: las rutas (`DICTADO_DATOS`, `DICTADO_MODELOS`, `DICTADO_RUNTIME`,
 * `DICTADO_PYTHON`) y el servicio remoto (url + token). Son de la maquina o secretos: siguen por
 * entorno y argumento, fuera de este archivo.
 */

import { DEFECTOS_ENVIO } from './envio.js';
import { VELOCIDAD_POR_DEFECTO, VOCES, VOZ_POR_DEFECTO } from './voces.js';

export const VERSION_AJUSTES = 1;

export type Grupo = 'motor' | 'tecla' | 'pegado' | 'audio' | 'texto' | 'conversacion' | 'sonidos' | 'historial' | 'sin-proveedor';

export const GRUPOS: ReadonlyArray<{ id: Grupo; titulo: string; nota?: string }> = [
  { id: 'motor', titulo: 'Motor', nota: 'Que motor transcribe. Las cifras son las medidas en esta maquina.' },
  { id: 'tecla', titulo: 'Tecla y modo' },
  { id: 'pegado', titulo: 'Pegado' },
  { id: 'audio', titulo: 'Audio' },
  { id: 'texto', titulo: 'Texto' },
  { id: 'conversacion', titulo: 'Conversar con el agente', nota: 'En manos libres: lo pegado se envia solo al callar, el agente contesta en voz y el microfono se calla mientras habla. Cifras de la medicion del PRP-003.' },
  { id: 'sonidos', titulo: 'Sonidos' },
  { id: 'historial', titulo: 'Historial' },
  { id: 'sin-proveedor', titulo: 'Sin proveedor', nota: 'Exigen un modelo de lenguaje. No hay ninguno local ni ninguno declarado: no se pueden encender. El texto dictado no sale de esta maquina.' },
];

/** Los valores tal como se guardan y se usan. Un solo tipo, un solo sitio de defectos. */
export interface Ajustes {
  /** Motor principal: uno de los instalados en la carpeta de modelos. */
  motor: string;
  /** `auto` = faster-whisper:small si esta instalado, si no ninguno · `ninguno` · o un motor. */
  respaldo: string;
  idioma: string;
  modo: 'alternar' | 'manos-libres' | 'pulsar';
  /** Codigo de tecla virtual de Windows (hex): 0xA3 = Ctrl derecho. Solo cuenta con `--tecla`. */
  tecla: string;
  /** Con `--tecla`: un toque empieza y el siguiente termina, en vez de mantenerla. */
  teclaAlternar: boolean;
  pegar: 'portapapeles' | 'teclear' | 'ninguno';
  /** dB fijos, o `auto` (se ajusta por el pico de cada escucha). */
  gananciaDb: number | 'auto';
  silencioMs: number;
  umbralVozDb: number;
  micEnEspera: 'cerrado' | 'abierto';
  comandos: boolean;
  /** Quitar «mm», «eh» donde esten y «este», «o sea»… solo cuando van aislados por puntuacion. */
  muletillas: boolean;
  snippets: boolean;
  diccionario: boolean;
  correccionPorSimilitud: boolean;
  /** Modo conversacion con el agente (exige manos libres). */
  conversacion: boolean;
  /** Milisegundos sin voz nueva desde el ultimo pegado para pulsar Enter. Lo fija la medicion A. */
  envioMs: number;
  /** Voz con la que el dictado dice las respuestas del agente (una de `VOCES`). */
  vozAgente: string;
  velocidadVoz: number;
  /** Mientras suena la voz del agente: `cerrado` (half-duplex, por defecto) o `abierto` (barge-in con auriculares). */
  micDuranteVoz: 'cerrado' | 'abierto';
  sonidoAlEmpezar: boolean;
  sonidoAlTerminar: boolean;
  retencionDias: number;
  hilos: number;
  limpiezaLlm: boolean;
  modoComando: boolean;
}

export type Clave = keyof Ajustes;

export const DEFECTOS: Readonly<Ajustes> = Object.freeze({
  motor: 'parakeet',
  respaldo: 'auto',
  idioma: 'es',
  modo: 'alternar',
  tecla: '0xA3',
  teclaAlternar: false,
  pegar: 'portapapeles',
  gananciaDb: 0,
  silencioMs: 1000,
  umbralVozDb: -45,
  micEnEspera: 'cerrado',
  comandos: true,
  muletillas: true,
  snippets: true,
  diccionario: true,
  correccionPorSimilitud: false,
  conversacion: false,
  envioMs: DEFECTOS_ENVIO.msEnvio,
  vozAgente: VOZ_POR_DEFECTO,
  velocidadVoz: VELOCIDAD_POR_DEFECTO,
  micDuranteVoz: 'cerrado',
  sonidoAlEmpezar: false,
  sonidoAlTerminar: false,
  retencionDias: 365,
  hilos: 8,
  limpiezaLlm: false,
  modoComando: false,
});

export type Tipo = 'booleano' | 'entero' | 'numero' | 'texto' | 'eleccion' | 'ganancia' | 'motor' | 'respaldo';

export interface Campo {
  clave: Clave;
  grupo: Grupo;
  etiqueta: string;
  ayuda: string;
  tipo: Tipo;
  opciones?: readonly string[];
  min?: number;
  max?: number;
  /** `--bandera valor` en el CLI. */
  bandera?: string;
  /** Variable de entorno que lo fija (solo las que ya existian). */
  variable?: string;
  /** Un `dictar` en marcha lo toma sin reiniciar. Si no, se aplica en la siguiente sesion. */
  enCaliente: boolean;
  /** Por que no se puede encender. Presente solo en el grupo `sin-proveedor`. */
  sinProveedor?: string;
}

export const ESQUEMA: ReadonlyArray<Campo> = [
  { clave: 'motor', grupo: 'motor', etiqueta: 'Motor principal', ayuda: 'El que transcribe cada frase. El defecto es el medido con mejor latencia por precision en esta CPU.', tipo: 'motor', bandera: 'motor', enCaliente: false },
  { clave: 'respaldo', grupo: 'motor', etiqueta: 'Motor de respaldo', ayuda: 'Repite la frase cuando el principal la oyo en otro idioma. «auto» usa faster-whisper:small si esta instalado (con el motor remoto no hace falta: el demonio trae el suyo).', tipo: 'respaldo', bandera: 'respaldo', enCaliente: false },
  { clave: 'idioma', grupo: 'motor', etiqueta: 'Idioma', ayuda: 'Codigo de dos letras (es, en, pt…).', tipo: 'texto', bandera: 'idioma', enCaliente: false },
  { clave: 'hilos', grupo: 'motor', etiqueta: 'Hilos de CPU', ayuda: 'Cuantos nucleos usa el motor.', tipo: 'entero', min: 1, max: 64, bandera: 'hilos', variable: 'DICTADO_HILOS', enCaliente: false },
  { clave: 'modo', grupo: 'tecla', etiqueta: 'Modo', ayuda: 'alternar: un toque empieza y otro termina · manos-libres: cada silencio cierra una frase · pulsar: mientras se mantiene.', tipo: 'eleccion', opciones: ['alternar', 'manos-libres', 'pulsar'], bandera: 'modo', enCaliente: false },
  { clave: 'tecla', grupo: 'tecla', etiqueta: 'Tecla global', ayuda: 'Codigo de tecla de Windows, en hexadecimal: 0xA3 = Ctrl derecho, 0xA2 = Ctrl izquierdo, 0xA1 = Shift derecho.', tipo: 'texto', bandera: 'tecla', enCaliente: false },
  { clave: 'teclaAlternar', grupo: 'tecla', etiqueta: 'La tecla alterna', ayuda: 'Un toque empieza y el siguiente termina, en vez de mantenerla apretada.', tipo: 'booleano', bandera: 'tecla-alternar', enCaliente: false },
  { clave: 'pegar', grupo: 'pegado', etiqueta: 'Como se pega', ayuda: 'portapapeles: copia y Ctrl+V, restaurando lo que habia · teclear: letra a letra, sin tocar el portapapeles · ninguno: solo se muestra.', tipo: 'eleccion', opciones: ['portapapeles', 'teclear', 'ninguno'], bandera: 'pegar', enCaliente: true },
  { clave: 'gananciaDb', grupo: 'audio', etiqueta: 'Ganancia', ayuda: 'dB que se suman al microfono (−20 a 30), o «auto». Medido: auto no cambia el WER; sirve si el microfono entra flojo.', tipo: 'ganancia', min: -20, max: 30, bandera: 'ganancia-db', enCaliente: true },
  { clave: 'silencioMs', grupo: 'audio', etiqueta: 'Silencio que cierra la frase', ayuda: 'Milisegundos sin voz para dar la frase por terminada. Medido: 700 parte el 6,7 % de las frases; 1000 el 0,7 %.', tipo: 'entero', min: 300, max: 5000, bandera: 'silencio-ms', enCaliente: false },
  { clave: 'umbralVozDb', grupo: 'audio', etiqueta: 'Umbral de voz', ayuda: 'Por debajo de este pico (dBFS) el turno se descarta sin transcribir: no es voz.', tipo: 'numero', min: -90, max: 0, bandera: 'umbral-voz-db', enCaliente: true },
  { clave: 'micEnEspera', grupo: 'audio', etiqueta: 'Microfono en espera', ayuda: 'cerrado: solo se abre al escuchar (~100 ms) · abierto: se queda capturando y descartando.', tipo: 'eleccion', opciones: ['cerrado', 'abierto'], bandera: 'mic-en-espera', enCaliente: false },
  { clave: 'comandos', grupo: 'texto', etiqueta: 'Comandos de voz', ayuda: '«punto y aparte», «coma», «dale enter»…', tipo: 'booleano', bandera: 'comandos', enCaliente: true },
  { clave: 'muletillas', grupo: 'texto', etiqueta: 'Quitar muletillas', ayuda: '«mm», «eh», «ah» donde esten; «este», «o sea», «bueno», «pues»… solo cuando van entre comas o abren la frase. Lo dicho tal cual queda en el historial como texto original.', tipo: 'booleano', bandera: 'muletillas', enCaliente: true },
  { clave: 'snippets', grupo: 'texto', etiqueta: 'Snippets', ayuda: 'Un disparador dicho se cambia por su expansion.', tipo: 'booleano', bandera: 'snippets', enCaliente: true },
  { clave: 'diccionario', grupo: 'texto', etiqueta: 'Diccionario personal', ayuda: 'Tus terminos como pista al motor y como correccion.', tipo: 'booleano', bandera: 'diccionario', enCaliente: true },
  { clave: 'correccionPorSimilitud', grupo: 'texto', etiqueta: 'Correccion por similitud', ayuda: 'Para motores sin pista (Parakeet): una palabra parecida a un termino tuyo se cambia por el termino. Apagado por defecto: puede corregir de mas.', tipo: 'booleano', bandera: 'corrige-similitud', enCaliente: false },
  { clave: 'conversacion', grupo: 'conversacion', etiqueta: 'Conversar con el agente', ayuda: 'Encendido y en manos libres: lo pegado se envia solo al callar `envioMs`, y las respuestas del agente se oyen. Apagado: como siempre («dale enter» sigue valiendo).', tipo: 'booleano', bandera: 'conversacion', enCaliente: true },
  { clave: 'envioMs', grupo: 'conversacion', etiqueta: 'Silencio que envia el turno', ayuda: 'Milisegundos sin volver a hablar desde el ultimo pegado para pulsar Enter. Si vuelves a hablar, el reloj se cancela. El defecto lo fija la medicion A del PRP-003.', tipo: 'entero', min: 500, max: 10000, bandera: 'envio-ms', enCaliente: true },
  { clave: 'vozAgente', grupo: 'conversacion', etiqueta: 'Voz del agente', ayuda: 'Con que voz se dicen sus respuestas. Se descarga una vez, pineada por URL.', tipo: 'eleccion', opciones: Object.keys(VOCES), bandera: 'voz', enCaliente: false },
  { clave: 'velocidadVoz', grupo: 'conversacion', etiqueta: 'Velocidad de la voz', ayuda: '1 es la del modelo; 0,9 se entiende mejor (elegida de oido el 2026-09-22).', tipo: 'numero', min: 0.5, max: 2, bandera: 'velocidad', enCaliente: true },
  { clave: 'micDuranteVoz', grupo: 'conversacion', etiqueta: 'Microfono mientras habla el agente', ayuda: 'cerrado: se calla mientras suena la voz (sin cancelacion de eco en WSLg, con altavoces es lo unico seguro) · abierto: sigue escuchando y la voz se corta si hablas encima (solo con auriculares).', tipo: 'eleccion', opciones: ['cerrado', 'abierto'], bandera: 'mic-durante-voz', enCaliente: true },
  { clave: 'sonidoAlEmpezar', grupo: 'sonidos', etiqueta: 'Sonido al empezar a escuchar', ayuda: 'Un tono corto por el altavoz.', tipo: 'booleano', enCaliente: true },
  { clave: 'sonidoAlTerminar', grupo: 'sonidos', etiqueta: 'Sonido al pegar', ayuda: 'Un tono corto cuando el texto ya esta pegado.', tipo: 'booleano', enCaliente: true },
  { clave: 'retencionDias', grupo: 'historial', etiqueta: 'Retencion del historial (dias)', ayuda: 'Lo anterior se borra al arrancar. 0 = no borrar nunca. 365 es lo firmado en la AISIA de Fase 0.', tipo: 'entero', min: 0, max: 3650, variable: 'DICTADO_RETENCION_DIAS', enCaliente: true },
  { clave: 'limpiezaLlm', grupo: 'sin-proveedor', etiqueta: 'Limpieza por modelo de lenguaje', ayuda: 'Puntuar y ordenar el texto con un modelo.', tipo: 'booleano', enCaliente: false, sinProveedor: 'no hay modelo de lenguaje local ni proveedor declarado; encenderlo mandaria lo dictado a un tercero (C4)' },
  { clave: 'modoComando', grupo: 'sin-proveedor', etiqueta: 'Modo comando y transformaciones', ayuda: 'Seleccionar texto, dictar una orden («mas formal») y que un modelo lo transforme.', tipo: 'booleano', enCaliente: false, sinProveedor: 'misma razon: exige un modelo de texto que no existe aqui' },
];

const CAMPO_POR_CLAVE = new Map(ESQUEMA.map((c) => [c.clave, c]));
export const campo = (clave: string): Campo | undefined => CAMPO_POR_CLAVE.get(clave as Clave);
export const CLAVES: ReadonlyArray<Clave> = ESQUEMA.map((c) => c.clave);

/** Lo que la validacion necesita saber del entorno: que motores hay. Sin lista, el motor no se comprueba. */
export interface ContextoValidacion {
  motoresInstalados?: readonly string[];
}

export type Validacion = { ok: true; valor: Ajustes[Clave] } | { ok: false; error: string };

const VERDADEROS = new Set(['true', 'si', 'sí', '1', 'on', 'yes']);
const FALSOS = new Set(['false', 'no', '0', 'off']);

function aBooleano(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (VERDADEROS.has(s)) return true;
    if (FALSOS.has(s)) return false;
  }
  return undefined;
}

function aNumero(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Un valor (de la pagina, del CLI, del archivo o del entorno) contra el esquema. Devuelve el valor ya tipado. */
export function valida(clave: string, valor: unknown, contexto: ContextoValidacion = {}): Validacion {
  const c = campo(clave);
  if (!c) return { ok: false, error: `no existe el ajuste «${clave}». Los que hay: ${CLAVES.join(', ')}` };
  if (c.sinProveedor) {
    const b = aBooleano(valor);
    if (b === true) return { ok: false, error: `«${clave}» no se puede encender: ${c.sinProveedor}` };
    if (b === false) return { ok: true, valor: false };
    return { ok: false, error: `«${clave}» solo admite false` };
  }
  switch (c.tipo) {
    case 'booleano': {
      const b = aBooleano(valor);
      return b === undefined ? { ok: false, error: `«${clave}» espera true o false` } : { ok: true, valor: b };
    }
    case 'entero':
    case 'numero': {
      const n = aNumero(valor);
      if (n === undefined || (c.tipo === 'entero' && !Number.isInteger(n))) return { ok: false, error: `«${clave}» espera un ${c.tipo}${c.min !== undefined ? ` entre ${c.min} y ${c.max}` : ''}` };
      if ((c.min !== undefined && n < c.min) || (c.max !== undefined && n > c.max)) return { ok: false, error: `«${clave}» tiene que estar entre ${c.min} y ${c.max} (diste ${n})` };
      return { ok: true, valor: n };
    }
    case 'ganancia': {
      if (typeof valor === 'string' && valor.trim().toLowerCase() === 'auto') return { ok: true, valor: 'auto' };
      const n = aNumero(valor);
      if (n === undefined) return { ok: false, error: `«${clave}» espera dB (${c.min} a ${c.max}) o «auto»` };
      if ((c.min !== undefined && n < c.min) || (c.max !== undefined && n > c.max)) return { ok: false, error: `«${clave}» tiene que estar entre ${c.min} y ${c.max} dB (diste ${n})` };
      return { ok: true, valor: n };
    }
    case 'eleccion': {
      const s = typeof valor === 'string' ? valor.trim() : '';
      return c.opciones?.includes(s) ? { ok: true, valor: s as Ajustes['modo'] } : { ok: false, error: `«${clave}» tiene que ser uno de: ${(c.opciones ?? []).join(', ')}` };
    }
    case 'texto': {
      const s = typeof valor === 'string' ? valor.trim() : '';
      if (clave === 'idioma' && !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(s)) return { ok: false, error: '«idioma» espera un codigo como es, en o pt-BR' };
      if (clave === 'tecla' && !/^0x[0-9A-Fa-f]{1,2}$/.test(s)) return { ok: false, error: '«tecla» espera un codigo de tecla virtual en hexadecimal, como 0xA3' };
      if (s.length === 0 || s.length > 40) return { ok: false, error: `«${clave}» espera un texto corto` };
      return { ok: true, valor: s };
    }
    case 'motor': {
      const s = typeof valor === 'string' ? valor.trim() : '';
      if (s.length === 0) return { ok: false, error: '«motor» espera el nombre de un motor' };
      const hay = contexto.motoresInstalados;
      if (hay && !hay.includes(s) && !(s.startsWith('faster-whisper') && hay.some((m) => m.startsWith('faster-whisper')))) {
        return { ok: false, error: `el motor «${s}» no esta en la carpeta de modelos. Instalados: ${hay.join(', ') || '(ninguno)'}` };
      }
      return { ok: true, valor: s };
    }
    case 'respaldo': {
      const s = typeof valor === 'string' ? valor.trim() : '';
      if (s === 'auto' || s === 'ninguno' || s === '') return { ok: true, valor: s === '' ? 'ninguno' : s };
      const r = valida('motor', s, contexto);
      return r.ok ? { ok: true, valor: s } : { ok: false, error: r.error.replace('el motor', 'el respaldo') };
    }
  }
}

export type Origen = 'argumento' | 'entorno' | 'ajustes' | 'defecto';

export interface ValorResuelto<T = Ajustes[Clave]> {
  valor: T;
  origen: Origen;
}

export type AjustesResueltos = { [K in Clave]: ValorResuelto<Ajustes[K]> };

export interface FuentesAjustes {
  /** `--bandera valor` ya parseado (como lo da `parseaArgumentos`). */
  argumentos?: Readonly<Record<string, string | boolean>>;
  entorno?: Readonly<Record<string, string | undefined>>;
  /** Lo leido del archivo, ya migrado (`migra`): crudo, porque aqui se valida. */
  archivo?: Readonly<Partial<Record<Clave, unknown>>>;
  contexto?: ContextoValidacion;
}

export interface Resolucion {
  ajustes: AjustesResueltos;
  /** Valores que se descartaron por invalidos, con su origen: se avisa, nunca se cae. */
  avisos: string[];
}

/**
 * Precedencia: argumento > entorno > ajustes > defecto. Un valor invalido en una capa se descarta
 * con aviso y se sigue con la siguiente: `--silencio-ms abc` no tumba el dictado, lo dice.
 */
export function resuelve(fuentes: FuentesAjustes): Resolucion {
  const avisos: string[] = [];
  const salida: Partial<AjustesResueltos> = {};
  for (const c of ESQUEMA) {
    const capas: Array<[Origen, unknown]> = [];
    if (c.bandera && fuentes.argumentos && fuentes.argumentos[c.bandera] !== undefined) capas.push(['argumento', fuentes.argumentos[c.bandera]]);
    if (c.variable && fuentes.entorno && fuentes.entorno[c.variable] !== undefined && fuentes.entorno[c.variable] !== '') capas.push(['entorno', fuentes.entorno[c.variable]]);
    if (fuentes.archivo && fuentes.archivo[c.clave] !== undefined) capas.push(['ajustes', fuentes.archivo[c.clave]]);
    let elegido: ValorResuelto | undefined;
    for (const [origen, crudo] of capas) {
      // `--tecla` a secas (sin valor) es presencia, no un valor: pasa a la capa siguiente sin aviso.
      if (origen === 'argumento' && crudo === true && c.tipo !== 'booleano') continue;
      const v = valida(c.clave, crudo, fuentes.contexto);
      if (v.ok) {
        elegido = { valor: v.valor, origen };
        break;
      }
      avisos.push(`${origen === 'argumento' ? `--${c.bandera}` : origen === 'entorno' ? c.variable : `ajustes.${c.clave}`}: ${v.error}; se ignora`);
    }
    (salida as Record<string, ValorResuelto>)[c.clave] = elegido ?? { valor: DEFECTOS[c.clave], origen: 'defecto' };
  }
  return { ajustes: salida as AjustesResueltos, avisos };
}

/** Solo los valores, sin origen: lo que consume el codigo. */
export function valoresDe(r: AjustesResueltos): Ajustes {
  return Object.fromEntries(CLAVES.map((k) => [k, r[k].valor])) as unknown as Ajustes;
}

export interface Migracion {
  /** Claves conocidas con su valor tal cual (la validacion viene despues, en `resuelve`). */
  valores: Partial<Record<Clave, unknown>>;
  /** Claves que este programa no conoce: se conservan al escribir (pueden ser de una version mas nueva). */
  desconocidas: Record<string, unknown>;
  version: number;
  avisos: string[];
}

const BANDERA_A_CLAVE = new Map(ESQUEMA.filter((c) => c.bandera).map((c) => [c.bandera as string, c.clave]));

/**
 * Del JSON crudo al contenido tipado. Version 0 (sin `version`): se aceptan las claves con el
 * nombre de la bandera del CLI («silencio-ms», «ganancia-db»…), que es como alguien las escribe
 * a mano la primera vez, y se renombran. Una version mas nueva que esta: sus claves desconocidas
 * se conservan y se avisa.
 */
export function migra(crudo: unknown): Migracion {
  const avisos: string[] = [];
  if (crudo === null || typeof crudo !== 'object' || Array.isArray(crudo)) {
    return { valores: {}, desconocidas: {}, version: VERSION_AJUSTES, avisos: ['el archivo no es un objeto JSON: se usan los defectos'] };
  }
  const o = { ...(crudo as Record<string, unknown>) };
  const version = typeof o['version'] === 'number' ? o['version'] : 0;
  delete o['version'];
  if (version > VERSION_AJUSTES) avisos.push(`el archivo es de la version ${version} y este dictado entiende hasta la ${VERSION_AJUSTES}: lo que no conozco se conserva sin usar`);
  if (version === 0 && Object.keys(o).length > 0) {
    for (const [k, v] of Object.entries(o)) {
      const clave = BANDERA_A_CLAVE.get(k);
      if (clave && clave !== k && o[clave] === undefined) {
        o[clave] = v;
        delete o[k];
        avisos.push(`«${k}» pasa a llamarse «${clave}» (version 0 → ${VERSION_AJUSTES})`);
      }
    }
  }
  const valores: Partial<Record<Clave, unknown>> = {};
  const desconocidas: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (campo(k)) valores[k as Clave] = v;
    else desconocidas[k] = v;
  }
  if (Object.keys(desconocidas).length > 0 && version <= VERSION_AJUSTES) avisos.push(`claves que no conozco y conservo: ${Object.keys(desconocidas).join(', ')}`);
  return { valores, desconocidas, version, avisos };
}

/** El texto que va al disco: solo lo que difiere del defecto, mas lo desconocido, con version. Estable y legible. */
export function serializa(valores: Partial<Ajustes>, desconocidas: Record<string, unknown> = {}): string {
  const cuerpo: Record<string, unknown> = { version: VERSION_AJUSTES };
  for (const k of CLAVES) {
    if (valores[k] !== undefined && valores[k] !== DEFECTOS[k]) cuerpo[k] = valores[k];
  }
  for (const [k, v] of Object.entries(desconocidas)) cuerpo[k] = v;
  return JSON.stringify(cuerpo, null, 2) + '\n';
}

/** `dictado ajustes pon`: lo mismo que la pantalla, un solo camino. Devuelve el nuevo contenido a escribir. */
export function pon(actual: Partial<Ajustes>, clave: string, valor: unknown, contexto: ContextoValidacion = {}): { ok: true; valores: Partial<Ajustes>; valor: Ajustes[Clave] } | { ok: false; error: string } {
  const v = valida(clave, valor, contexto);
  if (!v.ok) return v;
  return { ok: true, valores: { ...actual, [clave]: v.valor }, valor: v.valor };
}

export function quita(actual: Partial<Ajustes>, clave: string): { ok: true; valores: Partial<Ajustes> } | { ok: false; error: string } {
  if (!campo(clave)) return { ok: false, error: `no existe el ajuste «${clave}»` };
  const copia = { ...actual };
  delete copia[clave as Clave];
  return { ok: true, valores: copia };
}

// ---------- catalogo de motores, cruzado con la medicion de ESTA maquina ----------

export interface MotorMedido {
  motor: string;
  wer: number;
  latenciaP50Ms: number;
  latenciaP95Ms: number;
  latenciaCortasP50Ms?: number;
  cargaMs?: number;
  ramMb?: number;
}

export interface Medicion {
  fecha: string;
  maquina?: { cpu?: string; nucleos?: number; ramGb?: number; dispositivo?: string };
  corpus?: { nombre?: string; tomas?: number; minutos?: number };
  motores: MotorMedido[];
}

export interface EntradaCatalogo {
  nombre: string;
  instalado: boolean;
  medido: boolean;
  wer?: number;
  latenciaP50Ms?: number;
  latenciaP95Ms?: number;
  latenciaCortasP50Ms?: number;
  cargaMs?: number;
  ramMb?: number;
  /** Por que conviene o no, en una linea; sale de la medicion, no de una opinion. */
  nota?: string;
}

/** Nombre del CLI → id con el que aparece en `ultima-medicion-cpu.json`. */
export const ID_MEDIDO: Readonly<Record<string, string>> = {
  parakeet: 'sherpa:nemo-parakeet-tdt-0.6b-v3-int8',
  'whisper-turbo': 'sherpa:whisper-turbo-int8',
  'whisper-base': 'sherpa:whisper-base-int8',
  'whisper-small': 'sherpa:whisper-small-int8',
  'faster-whisper:small': 'faster-whisper-small-int8-cpu',
  'faster-whisper:large-v3-turbo': 'faster-whisper-large-v3-turbo-int8-cpu',
};

/**
 * Los motores instalados con sus cifras de esta maquina. Los que no estan en la medicion salen
 * «sin medir»: nunca se rellena con la tabla de otra maquina. Orden: el defecto primero, luego
 * por latencia p50 (los medidos), luego los sin medir.
 */
export function catalogo(instalados: readonly string[], medicion: Medicion | undefined): EntradaCatalogo[] {
  const porId = new Map((medicion?.motores ?? []).map((m) => [m.motor, m]));
  const entradas = instalados.map((nombre): EntradaCatalogo => {
    const m = porId.get(ID_MEDIDO[nombre] ?? '');
    if (!m) return { nombre, instalado: true, medido: false, nota: 'sin medir en esta maquina (npm run mide)' };
    return {
      nombre,
      instalado: true,
      medido: true,
      wer: m.wer,
      latenciaP50Ms: m.latenciaP50Ms,
      latenciaP95Ms: m.latenciaP95Ms,
      ...(m.latenciaCortasP50Ms !== undefined ? { latenciaCortasP50Ms: m.latenciaCortasP50Ms } : {}),
      ...(m.cargaMs !== undefined ? { cargaMs: m.cargaMs } : {}),
      ...(m.ramMb !== undefined ? { ramMb: m.ramMb } : {}),
      nota: notaDe(nombre, m),
    };
  });
  return entradas.sort((a, b) => {
    if (a.nombre === DEFECTOS.motor) return -1;
    if (b.nombre === DEFECTOS.motor) return 1;
    if (a.medido !== b.medido) return a.medido ? -1 : 1;
    return (a.latenciaP50Ms ?? Infinity) - (b.latenciaP50Ms ?? Infinity);
  });
}

function notaDe(nombre: string, m: MotorMedido): string {
  if (nombre === DEFECTOS.motor) return 'el defecto: mejor latencia por precision medida';
  if (m.latenciaP50Ms > 3000) return 'demasiado lento para dictar frase a frase; vale para lote';
  if (m.wer > 0.1) return 'una de cada diez palabras mal: no vale para espanol';
  return 'mas lento que el defecto';
}
