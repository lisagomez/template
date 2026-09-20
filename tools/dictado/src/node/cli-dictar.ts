/**
 * `dictado dictar`: el microfono de WSLg, el VAD de `voz`, un motor, el posproceso y el
 * pegador de Windows, atados a la maquina de estados del nucleo.
 *
 * Como se dispara, en orden de lo que exige:
 *  - **espacio en esta terminal**: alterna escuchar/parar (o, en manos libres, enciende/apaga).
 *    No instala nada, pero el texto se pega donde este el cursor de Windows: cambia de ventana
 *    despues de pulsar.
 *  - **`--tecla`**: lanza A LA VISTA `windows/tecla-global.ps1` con `powershell.exe` (interop,
 *    en esta misma terminal; te lo dice antes). Mantener la tecla = hablar; dos toques = manos libres. Es lo que sflow
 *    hacia con Ctrl+Shift, hecho desde el unico lado que ve el teclado global en WSL2.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creaDictado, type Dictado, type Estado, type EventoDictado, type Modo } from '../dictado.js';
import { creaPosproceso } from '../posproceso.js';
import { pareceOtroIdioma } from '../texto/idioma.js';
import { normalizaParaComparar } from '../texto/normaliza.js';
import type { Motor, Pegador } from '../types.js';
import { capturaMicrofono, escribeWav, nivelDb, type Captura } from './audio.js';
import { ajustaGanancia, factorDe } from './ganancia.js';
import type { Configuracion } from './cli-config.js';
import { cargaDatos } from './cli-datos.js';
import { creaDetector, creaMotor } from './cli-motores.js';
import { creaPegadorWindows } from './pegado-windows.js';
import { copiaIconoAWindows } from './cli-icono.js';
import { escuchaIcono, PUERTO_ICONO, type EscuchaIcono } from './icono.js';
import { escuchaTecla, type EscuchaTecla } from './tecla.js';
import { DEFECTOS_DICTADO } from './vad.js';
import { construyeTrayectoria, creaContadores, escribeTrayectoria, type ContadoresSesion } from './trayectoria.js';

const RUTA_TECLA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'windows', 'tecla-global.ps1');
const RUTA_ICONO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'windows', 'icono-barra.ps1');
/** Donde queda la trayectoria de cada sesion (forma, sin contenido); `DICTADO_TRAYECTORIAS` la cambia. */
const CARPETA_CORPUS = process.env['DICTADO_TRAYECTORIAS'] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'corpus');
const ESC = String.fromCharCode(27);
const gris = (s: string) => `${ESC}[2m${s}${ESC}[0m`;
const verde = (s: string) => `${ESC}[32m${s}${ESC}[0m`;
const CTRL_C = String.fromCharCode(3);

function pinta(evento: EventoDictado): void {
  switch (evento.tipo) {
    case 'estado':
      if (evento.estado === 'escuchando') console.log(verde('▶ escuchando'));
      else if (evento.estado === 'transcribiendo') console.log(gris('… transcribiendo'));
      else if (evento.estado === 'inactivo') console.log(gris('■ en espera'));
      break;
    case 'texto':
      console.log(`${verde('✓')} ${evento.texto}${evento.acciones.length ? gris(` [${evento.acciones.join(', ')}]`) : ''}`);
      console.log(gris(`  latencia fin-de-habla→pegado ${evento.latenciaMs.toFixed(0)} ms · motor ${evento.msMotor.toFixed(0)} ms · audio ${(evento.duracionMs / 1000).toFixed(1)} s`));
      break;
    case 'sinVoz':
      console.log(gris('  (sin voz)'));
      break;
    case 'error':
      console.error(`✗ ${evento.mensaje}`);
      break;
    default:
      break;
  }
}

/**
 * Parakeet detecta el idioma solo y con audio corto o flojo toma el espanol por ingles («Probably.»,
 * «No you can only gorda», vivo el 2026-09-16). Si el principal declara OTRO idioma que el pedido, se
 * repite con el respaldo (faster-whisper con el idioma forzado): mas lento, pero solo cuando hizo falta.
 */
function conRespaldo(principal: Motor, respaldo: Motor, idioma: string, contadores: ContadoresSesion): Motor {
  return {
    id: `${principal.id}+${respaldo.id}`,
    admitePista: principal.admitePista || respaldo.admitePista,
    async transcribe(muestras, hz, o) {
      const r = await principal.transcribe(muestras, hz, o);
      if (r.texto.length === 0) return r;
      const otro = r.idioma ? r.idioma !== idioma : pareceOtroIdioma(r.texto, idioma);
      if (!otro) return r;
      console.log(gris(`  el motor principal sacó ${JSON.stringify(r.texto)} (${r.idioma ?? 'parece otro idioma'}): repito con ${respaldo.id} en ${idioma}`));
      contadores.respaldo += 1;
      return respaldo.transcribe(muestras, hz, { ...o, idioma });
    },
    async calienta() {
      await principal.calienta?.();
      await respaldo.calienta?.();
    },
    async cierra() {
      await principal.cierra?.();
      await respaldo.cierra?.();
    },
  };
}

/**
 * La calibracion se vigila por el pico de cada escucha, en las dos puntas: flojo el motor no
 * te oye, saturado (medido en vivo el 2026-09-19: picos a -0,7 dBFS con +12 dB de ganancia
 * sobre un microfono ya fuerte) rompe las palabras en CUALQUIER motor. Sano: -20 a -6 dBFS.
 */
function avisoPico(picoDb: number): string {
  if (picoDb < -45) return ' — el microfono apenas te oye: acercalo o sube su nivel en Windows';
  if (picoDb > -3) return ' — SATURANDO: baja el nivel del microfono en Windows (y desactiva sus «mejoras»/ganancia automatica) o quita --ganancia-db';
  return '';
}

/**
 * Puerta de energia: el VAD a veces abre un turno sobre ruido de fondo casi inaudible, y
 * TODO motor alucina texto sobre la nada (medido en vivo el 2026-09-19: «All means» sobre un
 * turno con pico -86,5 dBFS). Si ninguna ventana de 30 ms del turno llega al umbral, no hay
 * voz que transcribir: se descarta antes del motor y sale como «sin voz».
 */
const MULETILLAS = new Set(['uh', 'um', 'eh', 'ah', 'mm', 'mmm', 'hmm', 'aja', 'ajá']);

function conPuertaDeEnergia(motor: Motor, frecuenciaHz: number, umbralDb: number, contadores: ContadoresSesion): Motor {
  const ventana = Math.max(1, Math.round(frecuenciaHz * 0.03));
  const pico = (m: Float32Array) => {
    let max = -Infinity;
    for (let i = 0; i < m.length; i += ventana) max = Math.max(max, nivelDb(m.subarray(i, i + ventana)));
    return max;
  };
  return {
    id: motor.id,
    admitePista: motor.admitePista,
    async transcribe(muestras, hz, o) {
      const db = pico(muestras);
      if (db < umbralDb) {
        console.log(gris(`  (turno descartado sin transcribir: pico ${db.toFixed(1)} dBFS < ${umbralDb} dBFS, no es voz)`));
        contadores.descartadosEnergia += 1;
        return { texto: '' };
      }
      const r = await motor.transcribe(muestras, hz, o);
      // Un turno que es SOLO muletilla no se pega: en sala se dictan ideas, no carraspeos
      // (medido en vivo el 2026-09-19: un «Uh» de 0,3 s pegado en medio de dos instrucciones).
      const palabras = normalizaParaComparar(r.texto).split(' ').filter(Boolean);
      if (palabras.length > 0 && palabras.length <= 2 && palabras.every((p) => MULETILLAS.has(p))) {
        console.log(gris(`  (muletilla descartada: ${JSON.stringify(r.texto)})`));
        contadores.muletillas += 1;
        return { texto: '' };
      }
      return r;
    },
    async calienta() {
      await motor.calienta?.();
    },
    async cierra() {
      await motor.cierra?.();
    },
  };
}

function pegadorDePantalla(): Pegador {
  return {
    async pega(texto) {
      console.log(`  [pegar=ninguno] ${JSON.stringify(texto)}`);
    },
  };
}

/**
 * Serializa empieza/termina: un toque corto tras mantener puede llegar antes de que
 * `termina()` acabe de transcribir, y el modo solo se cambia con el dictado inactivo.
 */
function controlador(dictado: Dictado) {
  let pendiente: Promise<void> = Promise.resolve();
  const encadena = (paso: () => void | Promise<void>) => (pendiente = pendiente.then(paso).catch((e: unknown) => console.error(`✗ ${e instanceof Error ? e.message : String(e)}`)));
  const empiezaEn = (modo?: Modo) => {
    if (modo && dictado.estado === 'inactivo' && dictado.modo !== modo) dictado.cambiaModo(modo);
    dictado.empieza();
  };
  return {
    empieza: (modo?: Modo) => encadena(() => empiezaEn(modo)),
    termina: () => encadena(() => dictado.termina()),
    alterna: (modo: Modo) => encadena(() => (dictado.estado === 'inactivo' ? empiezaEn(modo) : dictado.termina())),
    esperar: () => pendiente,
  };
}

function teclasDeTerminal(alEspacio: () => void, alSalir: () => void): () => void {
  if (!process.stdin.isTTY) return () => undefined;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  const escucha = (tecla: string) => {
    if (tecla === ' ' || tecla === '\r' || tecla === '\n') alEspacio();
    else if (tecla === 'q' || tecla === CTRL_C) alSalir();
  };
  process.stdin.on('data', escucha);
  return () => {
    process.stdin.off('data', escucha);
    process.stdin.setRawMode(false);
    process.stdin.pause();
  };
}

/**
 * El script viaja por `-EncodedCommand` con sus parametros ya puestos: PowerShell no siempre
 * acepta un `-File` en `\\wsl.localhost\...`. El archivo sigue ahi para leerlo; es el mismo.
 */
function lanzaTeclaGlobal(puerto: number, vk: string, alterna: boolean): () => void {
  console.log(`\nVoy a lanzar powershell.exe (del lado Windows, en esta misma terminal) con ${RUTA_TECLA}:`);
  console.log(`  sondea la tecla ${vk} (por defecto Ctrl DERECHO) y avisa a este proceso por 127.0.0.1:${puerto}. No lee otras teclas ni escribe nada.`);
  console.log(`  ${alterna ? 'Un toque EMPIEZA a escuchar y el siguiente TERMINA (no hace falta mantenerla).' : 'Mantenla para dictar; dos toques seguidos = manos libres (otro toque lo apaga).'} q aqui para parar.\n`);
  const cuerpo = readFileSync(RUTA_TECLA, 'utf8').replace(/param\([^)]*\)/, '');
  const script = `$Puerto = ${puerto}; $Tecla = ${Number(vk)}\n${cuerpo}`;
  const hijo = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { stdio: ['ignore', 'inherit', 'inherit'] });
  return () => hijo.kill();
}

/**
 * El icono se lanza SUELTO (`cmd /c start`): no es hijo de este proceso —ni un `/init` de
 * interop—, asi que sobrevive a que el dictado pare (y a `en-vivo --parar`) y se queda en la
 * barra en gris, listo para rearrancarlo con un click. Su Mutex garantiza que lanzarlo con
 * uno ya puesto no duplica nada. Va por `-File` sobre una copia en `%LOCALAPPDATA%\dictado\`
 * (la misma que usa `dictado icono instala`, refrescada aqui en cada lanzamiento): el script
 * entero por `-EncodedCommand` revienta el limite de 8191 caracteres de cmd.exe.
 */
function lanzaIconoBarra(puerto: number): void {
  console.log(`\nVoy a lanzar (suelto, con cmd.exe start) powershell.exe con ${RUTA_ICONO}:`);
  console.log(`  pone un icono en el area de notificacion que muestra el estado y manda 'alternar' a 127.0.0.1:${puerto} al hacerle click. No lee el teclado ni escribe nada.`);
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const distro = process.env['WSL_DISTRO_NAME'] ?? '';
  const copia = copiaIconoAWindows();
  const argumentos = ['/c', 'start', '/b', 'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', copia.windows, '-Puerto', String(puerto), '-RaizWsl', raiz];
  if (distro) argumentos.push('-Distro', distro);
  const hijo = spawn('cmd.exe', argumentos, { cwd: '/mnt/c', stdio: 'ignore' });
  hijo.unref();
}

export async function ordenDictar(config: Configuracion, opciones: Record<string, string | boolean>): Promise<void> {
  const modoPedido = String(opciones['modo'] ?? 'alternar');
  const modo: Modo = modoPedido === 'manos-libres' ? 'manosLibres' : modoPedido === 'pulsar' ? 'pulsar' : 'alternar';
  const idioma = typeof opciones['idioma'] === 'string' ? opciones['idioma'] : 'es';
  const pegar = String(opciones['pegar'] ?? 'portapapeles');
  const silencioMs = typeof opciones['silencio-ms'] === 'string' ? Number(opciones['silencio-ms']) : DEFECTOS_DICTADO.msSilencioParaCerrar;
  /** `--ganancia-db auto`: se ajusta sola por el pico de cada escucha (ver ganancia.ts); un numero la fija. */
  const gananciaAuto = opciones['ganancia-db'] === 'auto';
  let gananciaDb = typeof opciones['ganancia-db'] === 'string' && !gananciaAuto ? Number(opciones['ganancia-db']) : 0;
  if (!Number.isFinite(gananciaDb)) gananciaDb = 0;
  /**
   * `--mic-en-espera cerrado` (por defecto): en espera el microfono NO esta abierto; se abre al
   * escuchar (~100 ms medidos por PulseAudio de WSLg) y se cierra 1,5 s despues de parar. Con
   * `abierto` se queda capturando y descartando, como antes. Con `--entrada` siempre abierto.
   */
  const micEnEspera = String(opciones['mic-en-espera'] ?? 'cerrado');
  /** `--alterna-cada <ms>`: SOLO pruebas; alterna escuchar/parar cada N ms como si alguien tocara la tecla. */
  const alternaCadaMs = typeof opciones['alterna-cada'] === 'string' ? Number(opciones['alterna-cada']) : 0;
  /** Con `--tecla-alternar` la tecla no se mantiene: un toque empieza, el siguiente termina. */
  const teclaAlterna = opciones['tecla-alternar'] === true;
  /** `--graba <carpeta>`: guarda el audio de cada escucha como WAV. SOLO diagnostico; por defecto nada se graba. */
  const graba = typeof opciones['graba'] === 'string' ? opciones['graba'] : undefined;
  /** `--entrada <audio>`: SOLO pruebas y calibracion; el archivo hace de microfono, a tiempo real. */
  const entrada = typeof opciones['entrada'] === 'string' ? opciones['entrada'] : undefined;
  /** `--empieza`: escucha desde el arranque (con `--entrada`, lo normal: nadie pulsa espacio). */
  const empiezaYa = opciones['empieza'] === true || entrada !== undefined;
  const conTrayectoria = opciones['sin-trayectoria'] !== true;
  const contadores = creaContadores();
  const inicioSesion = new Date();

  console.log(gris(config.describe()));
  const datos = cargaDatos(config, { corrigePorSimilitud: opciones['corrige-similitud'] === true });
  const principal = await creaMotor(String(opciones['motor'] ?? 'parakeet'), config, idioma);
  const respaldo = typeof opciones['respaldo'] === 'string' ? await creaMotor(opciones['respaldo'], config, idioma) : undefined;
  const motor = respaldo ? conRespaldo(principal, respaldo, idioma, contadores) : principal;
  const detector = await creaDetector(config, { msSilencioParaCerrar: silencioMs });
  /** `--umbral-voz-db -45`: por debajo de este pico el turno se descarta sin motor. */
  const umbralVozDb = typeof opciones['umbral-voz-db'] === 'string' ? Number(opciones['umbral-voz-db']) : -45;
  const transcriptor = conPuertaDeEnergia(motor, detector.frecuenciaHz, umbralVozDb, contadores);
  const pegadorBase = pegar === 'ninguno' ? pegadorDePantalla() : creaPegadorWindows({ metodo: pegar === 'teclear' ? 'teclear' : 'portapapeles' });
  // En manos libres las frases se pegan una tras otra en la misma caja: sin separador se juntan.
  let msPegado = 0;
  const pegaMedido = async (t: string) => {
    const t0 = performance.now();
    await pegadorBase.pega(modo === 'manosLibres' ? t + ' ' : t);
    msPegado = performance.now() - t0;
  };
  const pegador: Pegador = { ...pegadorBase, pega: pegaMedido };
  const t0 = performance.now();
  await motor.calienta?.();
  console.log(gris(`motor ${motor.id} listo en ${(performance.now() - t0).toFixed(0)} ms · VAD Silero, cierre a ${silencioMs} ms · pegar=${pegar} · modo=${modo} · ganancia ${gananciaAuto ? 'auto' : `${gananciaDb} dB`} · mic en espera ${entrada ? 'abierto (entrada por archivo)' : micEnEspera}`));

  /** El icono de la barra, si esta puesto, se pinta con los mismos eventos que la TUI. */
  let publicaIcono: (estado: Estado) => void = () => undefined;
  const dictado = creaDictado({
    detector,
    transcriptor,
    frecuenciaHz: detector.frecuenciaHz,
    modo,
    idioma,
    pista: () => datos.diccionario.comoPista() || undefined,
    posproceso: creaPosproceso({ snippets: datos.snippets, diccionario: datos.diccionario }),
    pegador,
    almacen: datos.historial,
    motorId: motor.id,
    alEvento: (e) => {
      if (e.tipo === 'estado') publicaIcono(e.estado);
      if (e.tipo === 'estado' && e.estado === 'escuchando') {
        picoEscucha = -Infinity;
        picoRawEscucha = -Infinity;
        trozosEscucha = [];
        abreMic();
      }
      if (e.tipo === 'estado' && e.estado === 'inactivo' && micCerradoEnEspera) {
        setTimeout(() => {
          if (dictado.estado === 'inactivo') cierraMic();
        }, 1_500).unref();
      }
      pinta(e);
      if (e.tipo === 'error') contadores.errores += 1;
      if (e.tipo === 'texto') {
        console.log(gris(`  pegado ${msPegado.toFixed(0)} ms`));
        contadores.turnos += 1;
        contadores.pegados += 1;
        contadores.latenciasMs.push(e.latenciaMs);
        contadores.msMotor.push(e.msMotor);
        contadores.msPegado.push(msPegado);
        contadores.duracionesMs.push(e.duracionMs);
      }
      if (e.tipo === 'sinVoz') contadores.sinVoz += 1;
      if (e.tipo === 'sinVoz' || e.tipo === 'texto') {
        if (Number.isFinite(picoEscucha)) contadores.picosDb.push(picoEscucha);
        console.log(gris(`  pico durante la escucha: ${picoEscucha.toFixed(1)} dBFS${avisoPico(picoEscucha)}`));
        if (gananciaAuto) {
          const ajuste = ajustaGanancia({ actualDb: gananciaDb, picoRawDb: picoRawEscucha, picoConGananciaDb: picoEscucha, huboTexto: e.tipo === 'texto' });
          if (ajuste.nuevaDb !== gananciaDb) {
            gananciaDb = ajuste.nuevaDb;
            console.log(gris(`  ganancia ajustada a ${gananciaDb > 0 ? '+' : ''}${gananciaDb} dB (${ajuste.motivo})`));
          } else if (ajuste.motivo === 'microfono-satura-solo') {
            console.log(gris('  el microfono satura por si solo: baja su nivel en Windows y quita sus «mejoras»'));
          }
        }
        if (graba && trozosEscucha.length > 0) {
          const largo = trozosEscucha.reduce((n, t) => n + t.length, 0);
          const todo = new Float32Array(largo);
          let pos = 0;
          for (const t of trozosEscucha) { todo.set(t, pos); pos += t.length; }
          const ruta = `${graba}/escucha-${new Date().toISOString().replace(/[:.]/g, '-')}.wav`;
          void escribeWav(ruta, todo, detector.frecuenciaHz).then(() => console.log(gris(`  grabado ${ruta} (${(largo / detector.frecuenciaHz).toFixed(1)} s)`)));
        }
      }
    },
  });
  const control = controlador(dictado);

  let picoDb = -Infinity;
  let muestrasVistas = 0;
  /** Pico durante cada escucha: cuando sale «sin voz», la primera sospecha es el micrófono. */
  let picoEscucha = -Infinity;
  let picoRawEscucha = -Infinity;
  let trozosEscucha: Float32Array[] = [];
  const micCerradoEnEspera = micEnEspera === 'cerrado' && entrada === undefined;

  const alimenta = (crudo: Float32Array, msDesdeApertura: () => number, primera: { valor: boolean }) => {
    if (primera.valor) {
      primera.valor = false;
      console.log(gris(`microfono abierto en ${msDesdeApertura().toFixed(0)} ms`));
    }
    const picoRaw = nivelDb(crudo);
    const factor = factorDe(gananciaDb);
    const m = factor === 1 ? crudo : crudo.map((x) => Math.max(-1, Math.min(1, x * factor)));
    if (dictado.estado === 'escuchando') {
      picoRawEscucha = Math.max(picoRawEscucha, picoRaw);
      picoEscucha = Math.max(picoEscucha, factor === 1 ? picoRaw : nivelDb(m));
      if (graba) trozosEscucha.push(m);
    }
    if (muestrasVistas < detector.frecuenciaHz * 2) {
      picoDb = Math.max(picoDb, picoRaw);
      muestrasVistas += m.length;
      if (muestrasVistas >= detector.frecuenciaHz * 2) {
        console.log(gris(`microfono vivo: pico ${picoDb.toFixed(1)} dBFS en los primeros 2 s${picoDb < -75 ? ' — MUY bajo: revisa el microfono de Windows' : ''}`));
      }
    }
    void dictado.alimenta(m);
  };

  /**
   * La captura se abre y se cierra con el estado: en espera no hay microfono abierto (salvo
   * `--mic-en-espera abierto` o entrada por archivo). Si la captura muere por su cuenta (ffmpeg
   * termino sin que lo pidieramos), el dictado se apaga entero: seguir «escuchando» seria mentir
   * (vivido el 2026-09-19).
   */
  let captura: Captura | undefined;
  let cierrePedido = false;
  let resolverFin: (e?: Error) => void = () => undefined;
  const finDeCaptura = new Promise<Error | undefined>((r) => (resolverFin = r));
  const abreMic = () => {
    if (captura) return;
    cierrePedido = false;
    const desde = performance.now();
    const primera = { valor: true };
    const c = capturaMicrofono({
      frecuenciaHz: detector.frecuenciaHz,
      gananciaDb: 0, // la ganancia se aplica aqui (puede cambiar en caliente), no en la captura
      ...(entrada ? { entrada } : {}),
      alRecibir: (m) => alimenta(m, () => performance.now() - desde, primera),
      alError: (e) => console.error(`ffmpeg: ${e}`),
    });
    captura = c;
    c.terminada.then(
      () => { if (captura === c) captura = undefined; if (!cierrePedido) resolverFin(undefined); },
      (e: Error) => { if (captura === c) captura = undefined; if (!cierrePedido) resolverFin(e); },
    );
  };
  const cierraMic = () => {
    if (!captura) return;
    cierrePedido = true;
    captura.detiene();
    console.log(gris('microfono cerrado (en espera no se captura nada)'));
  };
  if (!micCerradoEnEspera) abreMic();
  // Con el microfono cerrado en espera puede no quedar NINGUN handle vivo (sin tecla ni icono):
  // Node saldria en silencio. Un latido con referencia mantiene el proceso hasta `salir()`.
  const latido = setInterval(() => undefined, 60_000);

  let alternador: ReturnType<typeof setInterval> | undefined;
  let tecla: EscuchaTecla | undefined;
  let icono: EscuchaIcono | undefined;
  let cierraTeclaGlobal: (() => void) | undefined;
  let quitaTeclas: () => void = () => undefined;
  let saliendo = false;
  const salir = async () => {
    if (saliendo) return;
    saliendo = true;
    console.log(gris('\ncerrando…'));
    quitaTeclas();
    clearInterval(latido);
    if (alternador) clearInterval(alternador);
    cierraTeclaGlobal?.();
    await tecla?.cierra();
    await icono?.cierra(); // el icono de la barra queda vivo y en gris: un click rearranca
    cierrePedido = true;
    captura?.detiene();
    resolverFin(undefined);
    await control.esperar();
    if (dictado.estado !== 'inactivo') await dictado.termina().catch(() => undefined);
    await motor.cierra?.();
    if ('cierra' in pegadorBase && typeof pegadorBase.cierra === 'function') await (pegadorBase as { cierra(): Promise<void> }).cierra();
    datos.guardaSnippets();
    if (conTrayectoria) {
      try {
        const ruta = escribeTrayectoria(CARPETA_CORPUS, construyeTrayectoria(contadores, { motorId: motor.id, modo, silencioMs, gananciaDb, umbralVozDb, inicio: inicioSesion, fin: new Date() }));
        console.log(gris(`trayectoria de la sesion (forma, sin contenido): ${ruta}`));
      } catch (e) {
        console.error(`✗ no se pudo escribir la trayectoria: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // Sin `process.exit` inmediato: con stdout en un pipe, lo ultimo escrito se perderia. Se
    // deja que el bucle se vacie, y si algo nativo lo mantiene vivo, se sale al segundo y medio.
    process.exitCode = 0;
    setTimeout(() => process.exit(0), 1_500).unref();
  };

  if (opciones['tecla'] !== undefined) {
    const vk = typeof opciones['tecla'] === 'string' ? opciones['tecla'] : '0xA3';
    tecla = await escuchaTecla({
      alMantener: () => (teclaAlterna ? undefined : void control.empieza('pulsar')),
      alSoltar: () => (teclaAlterna ? void control.alterna('alternar') : void control.termina()),
      alManosLibres: (activo) => {
        if (teclaAlterna) return; // con toques que alternan, el doble toque no es un gesto aparte
        console.log(activo ? verde('manos libres: ON (un toque lo apaga)') : gris('manos libres: OFF'));
        void (activo ? control.empieza('manosLibres') : control.termina());
      },
      alConectar: () => console.log(verde('tecla global conectada')),
      alDesconectar: () => console.log(gris('tecla global desconectada')),
    });
    cierraTeclaGlobal = lanzaTeclaGlobal(tecla.puerto, vk, teclaAlterna);
  }
  if (opciones['icono'] !== undefined) {
    const puertoIcono = typeof opciones['icono-puerto'] === 'string' ? Number(opciones['icono-puerto']) : PUERTO_ICONO;
    icono = await escuchaIcono({
      puerto: puertoIcono,
      alAlternar: () => {
        console.log(dictado.estado === 'inactivo' ? verde('icono: dictado ON') : gris('icono: dictado OFF'));
        void control.alterna(modo);
      },
      alConectar: () => console.log(verde('icono conectado')),
      alDesconectar: () => console.log(gris('icono desconectado')),
    });
    publicaIcono = (estado) => icono?.publicaEstado(estado);
    if (opciones['icono-sin-ayudante'] !== true) lanzaIconoBarra(icono.puerto);
  }
  console.log(`\nESPACIO en esta terminal: ${modo === 'manosLibres' ? 'enciende/apaga manos libres' : 'empieza/termina el dictado'} · q: salir`);
  quitaTeclas = teclasDeTerminal(() => void control.alterna(modo), () => void salir());
  process.on('SIGINT', () => void salir());
  if (empiezaYa) {
    console.log(gris(entrada ? `entrada por archivo (${modo}): escuchando desde ya` : 'escuchando desde ya (--empieza)'));
    void control.empieza(modo);
  }
  if (alternaCadaMs > 0) {
    console.log(gris(`(prueba) alterno escuchar/parar cada ${alternaCadaMs} ms`));
    alternador = setInterval(() => void control.alterna(modo), alternaCadaMs);
  }
  // Si la captura TERMINA —con o sin error—, el dictado esta sordo: seguir «escuchando» seria
  // mentir (vivido el 2026-09-19: ffmpeg murio con «Error during demuxing» del pulse de WSLg y
  // el proceso quedo vivo y sordo). Se sale: el icono pasa a gris y un click lo rearranca todo.
  const muerte = await finDeCaptura;
  if (muerte) {
    contadores.muertesCaptura += 1;
    console.error(muerte.message);
  }
  if (!saliendo) console.log(gris(entrada ? 'la entrada por archivo termino: apago el dictado' : 'el microfono se cerro (ffmpeg termino): apago el dictado — un click al icono lo rearranca'));
  await salir();
}
