/**
 * Las piezas de `dictado dictar` que no dependen del estado de la sesion: como se pinta un
 * evento, los envoltorios del motor (respaldo por idioma, puerta de energia), el pegador de
 * pantalla, el controlador que serializa empieza/termina, las teclas de la terminal y el
 * lanzamiento de los ayudantes de Windows. Salieron de `cli-dictar.ts` tal cual el 2026-09-22
 * para que ese archivo quepa en las 500 lineas antes de anadirle la conversacion.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { picoDb } from '@tu-scope/voz';
import type { Dictado, EventoDictado, Modo } from '../dictado.js';
import { esSoloMuletilla } from '../muletillas.js';
import { pareceOtroIdioma } from '../texto/idioma.js';
import type { Motor, Pegador } from '../types.js';
import type { Configuracion } from './cli-config.js';
import { copiaIconoAWindows } from './cli-icono.js';
import type { ContadoresSesion } from './trayectoria.js';

const RUTA_TECLA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'windows', 'tecla-global.ps1');
const RUTA_ICONO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'windows', 'icono-barra.ps1');
const ESC = String.fromCharCode(27);
export const gris = (s: string) => `${ESC}[2m${s}${ESC}[0m`;
export const verde = (s: string) => `${ESC}[32m${s}${ESC}[0m`;
const CTRL_C = String.fromCharCode(3);

export function pinta(evento: EventoDictado): void {
  switch (evento.tipo) {
    case 'estado':
      if (evento.estado === 'escuchando') console.log(verde('▶ escuchando'));
      else if (evento.estado === 'transcribiendo') console.log(gris('… transcribiendo'));
      else if (evento.estado === 'inactivo') console.log(gris('■ en espera'));
      break;
    case 'texto':
      console.log(`${verde('✓')} ${[{ texto: evento.texto, acciones: evento.acciones }, ...(evento.siguientes ?? [])].map((p) => `${p.texto}${p.acciones.length ? gris(` [${p.acciones.join(', ')}]`) : ''}`).join(' ')}`);
      console.log(gris(`  latencia fin-de-habla→pegado ${evento.latenciaMs.toFixed(0)} ms · motor ${evento.msMotor.toFixed(0)} ms · audio ${(evento.duracionMs / 1000).toFixed(1)} s`));
      break;
    case 'sinVoz':
      console.log(gris('  (sin voz)'));
      break;
    case 'soloMuletillas':
      console.log(gris(`  (solo muletillas, nada que pegar: ${JSON.stringify(evento.textoCrudo)})`));
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
export function conRespaldo(principal: Motor, respaldo: Motor, idioma: string, contadores: ContadoresSesion): Motor {
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
export function avisoPico(picoDb: number): string {
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
export function conPuertaDeEnergia(motor: Motor, frecuenciaHz: number, umbral: () => number, contadores: ContadoresSesion): Motor {
  // El pico por ventanas de 30 ms es el `picoDb` de `voz`: la misma aritmetica que el medidor del microfono.
  const ventana = Math.max(1, Math.round(frecuenciaHz * 0.03));
  return {
    id: motor.id,
    admitePista: motor.admitePista,
    async transcribe(muestras, hz, o) {
      const db = picoDb(muestras, ventana);
      const umbralDb = umbral();
      if (db < umbralDb) {
        console.log(gris(`  (turno descartado sin transcribir: pico ${db.toFixed(1)} dBFS < ${umbralDb} dBFS, no es voz)`));
        contadores.descartadosEnergia += 1;
        return { texto: '' };
      }
      const r = await motor.transcribe(muestras, hz, o);
      // Un turno que es SOLO muletilla no se pega: en sala se dictan ideas, no carraspeos
      // (medido en vivo el 2026-09-19: un «Uh» de 0,3 s pegado en medio de dos instrucciones).
      if (esSoloMuletilla(r.texto)) {
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

export function pegadorDePantalla(): Pegador {
  return {
    async pega(texto) {
      console.log(`  [pegar=ninguno] ${JSON.stringify(texto)}`);
    },
    async ejecuta(acciones) {
      for (const a of acciones) console.log(`  [pegar=ninguno] [${a}]`);
    },
  };
}

/**
 * Serializa empieza/termina: un toque corto tras mantener puede llegar antes de que
 * `termina()` acabe de transcribir, y el modo solo se cambia con el dictado inactivo.
 */
export function controlador(dictado: Dictado) {
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

/**
 * Lo que hace cada gesto de la tecla global. Con toques que alternan, el toque abre el MODO DE
 * LA SESION, el mismo que el icono: si abriera 'alternar', en manos libres el segundo toque
 * dejaria el dictado inactivo, el modo conversacion no enviaria y el hook `Stop` callaria
 * (2026-09-23, PR #146).
 */
export function gestosDeTeclaGlobal(control: Pick<ReturnType<typeof controlador>, 'empieza' | 'termina' | 'alterna'>, modo: Modo, teclaAlterna: boolean) {
  return {
    alMantener: () => (teclaAlterna ? undefined : void control.empieza('pulsar')),
    alSoltar: () => (teclaAlterna ? void control.alterna(modo) : void control.termina()),
    alManosLibres: (activo: boolean) => {
      if (teclaAlterna) return; // con toques que alternan, el doble toque no es un gesto aparte
      console.log(activo ? verde('manos libres: ON (un toque lo apaga)') : gris('manos libres: OFF'));
      void (activo ? control.empieza('manosLibres') : control.termina());
    },
  };
}

export function teclasDeTerminal(alEspacio: () => void, alSalir: () => void): () => void {
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
export function lanzaTeclaGlobal(puerto: number, vk: string, alterna: boolean): () => void {
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
export function lanzaIconoBarra(puerto: number): void {
  console.log(`\nVoy a lanzar (suelto, con cmd.exe start) powershell.exe con ${RUTA_ICONO}:`);
  console.log(`  pone un icono en el area de notificacion que muestra el estado y manda 'alternar' a 127.0.0.1:${puerto} al hacerle click. No lee el teclado ni escribe nada.`);
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const distro = process.env['WSL_DISTRO_NAME'] ?? '';
  const copia = copiaIconoAWindows();
  console.log(gris(copia.refrescado ? `  icono actualizado en Windows (version ${copia.version})` : `  icono al dia (version ${copia.version})`));
  // Un icono viejo que ya corre no se entera del refresco (mutex de instancia unica): se cierra
  // aqui y el nuevo arranca con la version nueva. Solo procesos cuya linea de comando es ESTE script.
  if (copia.refrescado) {
    const cierre = `Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*icono-barra.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`;
    try {
      // -EncodedCommand: las comillas de -Command las come el propio Windows al partir la linea.
      execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(cierre, 'utf16le').toString('base64')], { stdio: 'ignore', timeout: 15_000 });
      console.log(gris('  el icono anterior se cerro para que arranque la version nueva'));
    } catch {
      console.log(gris('  no se pudo cerrar el icono anterior; cierralo desde su menu para ver la version nueva'));
    }
  }
  const argumentos = ['/c', 'start', '/b', 'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', copia.windows, '-Puerto', String(puerto), '-RaizWsl', raiz];
  if (distro) argumentos.push('-Distro', distro);
  // «Abrir historial» del menu: la pagina /historial de la app (DICTADO_HISTORIAL_URL si la app no esta en :3000).
  const historial = process.env['DICTADO_HISTORIAL_URL'] ?? 'http://localhost:3000/historial';
  argumentos.push('-Historial', historial);
  console.log(gris(`  «Abrir historial» del icono → ${historial}`));
  // Solo para medir la pildora (fps, CPU, capturas de si misma): nunca por defecto.
  if (process.env['DICTADO_ICONO_MEDIR'] === '1') argumentos.push('-Medir');
  const hijo = spawn('cmd.exe', argumentos, { cwd: '/mnt/c', stdio: 'ignore' });
  hijo.unref();
}

/**
 * Con `respaldo: auto`, faster-whisper:small si esta en la carpeta de modelos; si no, ninguno.
 * Con el motor `remoto` no aplica: el demonio ya lleva su propio respaldo (`x-motor: respaldo`),
 * y los guiones de medicion que dictan contra el no cambian de forma por este ajuste.
 */
export function eleccionDeRespaldo(config: Configuracion): string | undefined {
  const r = config.valores.respaldo;
  if (r === 'ninguno') return undefined;
  if (r !== 'auto') return r;
  if (config.valores.motor === 'remoto') return undefined;
  return existsSync(join(config.modelos, 'faster-whisper', 'models--Systran--faster-whisper-small')) ? 'faster-whisper:small' : undefined;
}
