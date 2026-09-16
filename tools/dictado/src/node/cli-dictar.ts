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
import { creaDictado, type Dictado, type EventoDictado, type Modo } from '../dictado.js';
import { creaPosproceso } from '../posproceso.js';
import type { Pegador } from '../types.js';
import { capturaMicrofono, nivelDb } from './audio.js';
import type { Configuracion } from './cli-config.js';
import { cargaDatos } from './cli-datos.js';
import { creaDetector, creaMotor } from './cli-motores.js';
import { creaPegadorWindows } from './pegado-windows.js';
import { escuchaTecla, type EscuchaTecla } from './tecla.js';
import { DEFECTOS_DICTADO } from './vad.js';

const RUTA_TECLA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'windows', 'tecla-global.ps1');
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
function lanzaTeclaGlobal(puerto: number, vk: string): () => void {
  console.log(`\nVoy a lanzar powershell.exe (del lado Windows, en esta misma terminal) con ${RUTA_TECLA}:`);
  console.log(`  sondea la tecla ${vk} (por defecto Ctrl DERECHO) y avisa a este proceso por 127.0.0.1:${puerto}. No lee otras teclas ni escribe nada.`);
  console.log('  Mantenla para dictar; dos toques seguidos = manos libres (otro toque lo apaga). q aqui para parar.\n');
  const cuerpo = readFileSync(RUTA_TECLA, 'utf8').replace(/param\([^)]*\)/, '');
  const script = `$Puerto = ${puerto}; $Tecla = ${Number(vk)}\n${cuerpo}`;
  const hijo = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { stdio: ['ignore', 'inherit', 'inherit'] });
  return () => hijo.kill();
}

export async function ordenDictar(config: Configuracion, opciones: Record<string, string | boolean>): Promise<void> {
  const modoPedido = String(opciones['modo'] ?? 'alternar');
  const modo: Modo = modoPedido === 'manos-libres' ? 'manosLibres' : modoPedido === 'pulsar' ? 'pulsar' : 'alternar';
  const idioma = typeof opciones['idioma'] === 'string' ? opciones['idioma'] : 'es';
  const pegar = String(opciones['pegar'] ?? 'portapapeles');
  const silencioMs = typeof opciones['silencio-ms'] === 'string' ? Number(opciones['silencio-ms']) : DEFECTOS_DICTADO.msSilencioParaCerrar;

  console.log(gris(config.describe()));
  const datos = cargaDatos(config, { corrigePorSimilitud: opciones['corrige-similitud'] === true });
  const motor = await creaMotor(String(opciones['motor'] ?? 'parakeet'), config, idioma);
  const detector = await creaDetector(config, { msSilencioParaCerrar: silencioMs });
  const pegador = pegar === 'ninguno' ? pegadorDePantalla() : creaPegadorWindows({ metodo: pegar === 'teclear' ? 'teclear' : 'portapapeles' });
  const t0 = performance.now();
  await motor.calienta?.();
  console.log(gris(`motor ${motor.id} listo en ${(performance.now() - t0).toFixed(0)} ms · VAD Silero, cierre a ${silencioMs} ms · pegar=${pegar} · modo=${modo}`));

  const dictado = creaDictado({
    detector,
    transcriptor: motor,
    frecuenciaHz: detector.frecuenciaHz,
    modo,
    idioma,
    pista: () => datos.diccionario.comoPista() || undefined,
    posproceso: creaPosproceso({ snippets: datos.snippets, diccionario: datos.diccionario }),
    pegador,
    almacen: datos.historial,
    motorId: motor.id,
    alEvento: pinta,
  });
  const control = controlador(dictado);

  let picoDb = -Infinity;
  let muestrasVistas = 0;
  const captura = capturaMicrofono({
    frecuenciaHz: detector.frecuenciaHz,
    alRecibir: (m) => {
      if (muestrasVistas < detector.frecuenciaHz * 2) {
        picoDb = Math.max(picoDb, nivelDb(m));
        muestrasVistas += m.length;
        if (muestrasVistas >= detector.frecuenciaHz * 2) {
          console.log(gris(`microfono vivo: pico ${picoDb.toFixed(1)} dBFS en los primeros 2 s${picoDb < -60 ? ' — MUY bajo: revisa el microfono de Windows' : ''}`));
        }
      }
      void dictado.alimenta(m);
    },
    alError: (e) => console.error(`ffmpeg: ${e}`),
  });

  let tecla: EscuchaTecla | undefined;
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
    captura.detiene();
    await control.esperar();
    if (dictado.estado !== 'inactivo') await dictado.termina().catch(() => undefined);
    await motor.cierra?.();
    if ('cierra' in pegador && typeof pegador.cierra === 'function') await (pegador as { cierra(): Promise<void> }).cierra();
    datos.guardaSnippets();
    // Sin `process.exit` inmediato: con stdout en un pipe, lo ultimo escrito se perderia. Se
    // deja que el bucle se vacie, y si algo nativo lo mantiene vivo, se sale al segundo y medio.
    process.exitCode = 0;
    setTimeout(() => process.exit(0), 1_500).unref();
  };

  if (opciones['tecla'] !== undefined) {
    const vk = typeof opciones['tecla'] === 'string' ? opciones['tecla'] : '0xA3';
    tecla = await escuchaTecla({
      alMantener: () => void control.empieza('pulsar'),
      alSoltar: () => void control.termina(),
      alManosLibres: (activo) => {
        console.log(activo ? verde('manos libres: ON (un toque lo apaga)') : gris('manos libres: OFF'));
        void (activo ? control.empieza('manosLibres') : control.termina());
      },
      alConectar: () => console.log(verde('tecla global conectada')),
      alDesconectar: () => console.log(gris('tecla global desconectada')),
    });
    cierraTeclaGlobal = lanzaTeclaGlobal(tecla.puerto, vk);
  }
  console.log(`\nESPACIO en esta terminal: ${modo === 'manosLibres' ? 'enciende/apaga manos libres' : 'empieza/termina el dictado'} · q: salir`);
  quitaTeclas = teclasDeTerminal(() => void control.alterna(modo), () => void salir());
  process.on('SIGINT', () => void salir());
  await captura.terminada.catch((e: Error) => {
    console.error(e.message);
    return salir();
  });
}
