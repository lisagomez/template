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
import { capturaMicrofono, escribeWav, nivelDb } from './audio.js';
import type { Configuracion } from './cli-config.js';
import { cargaDatos } from './cli-datos.js';
import { creaDetector, creaMotor } from './cli-motores.js';
import { creaPegadorWindows } from './pegado-windows.js';
import { copiaIconoAWindows } from './cli-icono.js';
import { escuchaIcono, PUERTO_ICONO, type EscuchaIcono } from './icono.js';
import { escuchaTecla, type EscuchaTecla } from './tecla.js';
import { DEFECTOS_DICTADO } from './vad.js';

const RUTA_TECLA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'windows', 'tecla-global.ps1');
const RUTA_ICONO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'windows', 'icono-barra.ps1');
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
function conRespaldo(principal: Motor, respaldo: Motor, idioma: string): Motor {
  return {
    id: `${principal.id}+${respaldo.id}`,
    admitePista: principal.admitePista || respaldo.admitePista,
    async transcribe(muestras, hz, o) {
      const r = await principal.transcribe(muestras, hz, o);
      if (r.texto.length === 0) return r;
      const otro = r.idioma ? r.idioma !== idioma : pareceOtroIdioma(r.texto, idioma);
      if (!otro) return r;
      console.log(gris(`  el motor principal sacó ${JSON.stringify(r.texto)} (${r.idioma ?? 'parece otro idioma'}): repito con ${respaldo.id} en ${idioma}`));
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

function conPuertaDeEnergia(motor: Motor, frecuenciaHz: number, umbralDb: number): Motor {
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
        return { texto: '' };
      }
      const r = await motor.transcribe(muestras, hz, o);
      // Un turno que es SOLO muletilla no se pega: en sala se dictan ideas, no carraspeos
      // (medido en vivo el 2026-09-19: un «Uh» de 0,3 s pegado en medio de dos instrucciones).
      const palabras = normalizaParaComparar(r.texto).split(' ').filter(Boolean);
      if (palabras.length > 0 && palabras.length <= 2 && palabras.every((p) => MULETILLAS.has(p))) {
        console.log(gris(`  (muletilla descartada: ${JSON.stringify(r.texto)})`));
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
  const gananciaDb = typeof opciones['ganancia-db'] === 'string' ? Number(opciones['ganancia-db']) : 0;
  /** Con `--tecla-alternar` la tecla no se mantiene: un toque empieza, el siguiente termina. */
  const teclaAlterna = opciones['tecla-alternar'] === true;
  /** `--graba <carpeta>`: guarda el audio de cada escucha como WAV. SOLO diagnostico; por defecto nada se graba. */
  const graba = typeof opciones['graba'] === 'string' ? opciones['graba'] : undefined;

  console.log(gris(config.describe()));
  const datos = cargaDatos(config, { corrigePorSimilitud: opciones['corrige-similitud'] === true });
  const principal = await creaMotor(String(opciones['motor'] ?? 'parakeet'), config, idioma);
  const respaldo = typeof opciones['respaldo'] === 'string' ? await creaMotor(opciones['respaldo'], config, idioma) : undefined;
  const motor = respaldo ? conRespaldo(principal, respaldo, idioma) : principal;
  const detector = await creaDetector(config, { msSilencioParaCerrar: silencioMs });
  /** `--umbral-voz-db -45`: por debajo de este pico el turno se descarta sin motor. */
  const umbralVozDb = typeof opciones['umbral-voz-db'] === 'string' ? Number(opciones['umbral-voz-db']) : -45;
  const transcriptor = conPuertaDeEnergia(motor, detector.frecuenciaHz, umbralVozDb);
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
  console.log(gris(`motor ${motor.id} listo en ${(performance.now() - t0).toFixed(0)} ms · VAD Silero, cierre a ${silencioMs} ms · pegar=${pegar} · modo=${modo} · ganancia ${gananciaDb} dB`));

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
        trozosEscucha = [];
      }
      pinta(e);
      if (e.tipo === 'texto') console.log(gris(`  pegado ${msPegado.toFixed(0)} ms`));
      if (e.tipo === 'sinVoz' || e.tipo === 'texto') {
        console.log(gris(`  pico durante la escucha: ${picoEscucha.toFixed(1)} dBFS${avisoPico(picoEscucha)}`));
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
  let trozosEscucha: Float32Array[] = [];
  const captura = capturaMicrofono({
    frecuenciaHz: detector.frecuenciaHz,
    gananciaDb,
    alRecibir: (m) => {
      if (dictado.estado === 'escuchando') {
        picoEscucha = Math.max(picoEscucha, nivelDb(m));
        if (graba) trozosEscucha.push(m);
      }
      if (muestrasVistas < detector.frecuenciaHz * 2) {
        picoDb = Math.max(picoDb, nivelDb(m));
        muestrasVistas += m.length;
        if (muestrasVistas >= detector.frecuenciaHz * 2) {
          console.log(gris(`microfono vivo: pico ${picoDb.toFixed(1)} dBFS en los primeros 2 s${picoDb < -75 ? ' — MUY bajo: revisa el microfono de Windows' : ''}`));
        }
      }
      void dictado.alimenta(m);
    },
    alError: (e) => console.error(`ffmpeg: ${e}`),
  });

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
    cierraTeclaGlobal?.();
    await tecla?.cierra();
    await icono?.cierra(); // el icono de la barra queda vivo y en gris: un click rearranca
    captura.detiene();
    await control.esperar();
    if (dictado.estado !== 'inactivo') await dictado.termina().catch(() => undefined);
    await motor.cierra?.();
    if ('cierra' in pegadorBase && typeof pegadorBase.cierra === 'function') await (pegadorBase as { cierra(): Promise<void> }).cierra();
    datos.guardaSnippets();
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
  // Si la captura TERMINA —con o sin error—, el dictado esta sordo: seguir «escuchando» seria
  // mentir (vivido el 2026-09-19: ffmpeg murio con «Error during demuxing» del pulse de WSLg y
  // el proceso quedo vivo y sordo). Se sale: el icono pasa a gris y un click lo rearranca todo.
  await captura.terminada.catch((e: Error) => console.error(e.message));
  if (!saliendo) console.log(gris('el microfono se cerro (ffmpeg termino): apago el dictado — un click al icono lo rearranca'));
  await salir();
}
