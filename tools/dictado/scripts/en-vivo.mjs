#!/usr/bin/env node
/**
 * Deja el dictado ESCUCHANDO durante toda la sesion, desatendido, con los flags que funcionaron
 * en vivo el 2026-09-16 en esta WSL2. Es lo que corre `/dictado` (skill) y `npm run en-vivo`.
 *
 *   npm run en-vivo            arranca (o dice que ya esta) y espera a que la tecla de Windows conecte
 *   npm run en-vivo -- --parar  para el dictado, su motor Python y el ayudante de Windows
 *   npm run en-vivo -- --estado  ultimas lineas utiles del log
 *
 * No pega nada hasta que se toque Ctrl derecho o el icono de la barra (un toque/click enciende
 * manos libres, otro lo apaga). Los flags se cambian con DICTADO_FLAGS; los modelos y runtimes
 * salen del banco de medicion salvo que DICTADO_MODELOS / DICTADO_RUNTIME / DICTADO_PYTHON
 * digan otra cosa.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const banco = join(raiz, 'medicion', 'banco');
const log = join(banco, 'en-vivo.log');
const pidArchivo = join(banco, 'en-vivo.pid');
/**
 * Motor: parakeet manda (WER 3,3 %, p50 532 ms en la tabla del README; en vivo el 2026-09-19
 * faster-whisper:small solo daba 1,4-6,9 s por frase y alucinaba «¡Suscríbete!» en turnos con
 * ruido) y faster-whisper:small queda de RESPALDO para las frases cortas que Parakeet oye en
 * ingles — la combinacion que el README ya documentaba.
 *
 * Ganancia 0 y silencio 1000: los +12 dB eran para el microfono flojo de la maquina del
 * 2026-09-16; en la del 2026-09-19 el microfono entra fuerte y con ellos SATURABA (picos a
 * -0,7 dBFS: palabras rotas en los dos motores). Y 700 ms de silencio parte el 6,7 % de las
 * frases (tabla del VAD); 1000 ms, el 0,7 %. Si tu microfono entra flojo (pico < -45 dBFS en
 * el log), devuelve la ganancia con DICTADO_FLAGS.
 */
const FLAGS = (process.env.DICTADO_FLAGS ?? '--modo manos-libres --silencio-ms 1000 --tecla --tecla-alternar --icono --motor parakeet --respaldo faster-whisper:small --ganancia-db 0').split(/\s+/).filter(Boolean);

const limpio = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const utiles = () => (existsSync(log) ? limpio(readFileSync(log, 'utf8')).split('\n').filter((l) => /motor |microfono|conectada|desconectada|icono|✓|✗|latencia|pegado |sin voz|pico durante|escuchando|en espera|EADDRINUSE/.test(l)) : []);

function vivo() {
  try {
    const salida = execFileSync('pgrep', ['-f', '^[^ ]*node [^ ]*dist/node/cli.js dictar'], { encoding: 'utf8' }).trim();
    return salida ? Number(salida.split('\n')[0]) : null;
  } catch {
    return null;
  }
}

/** Patrones ANCLADOS: `pkill -f` sin anclar mata la shell que lo lanza (aprendizaje del 2026-09-13). */
function parar() {
  for (const patron of ['^[^ ]*node [^ ]*dist/node/cli.js dictar', `^${banco}/venv/bin/python`, '^/init /mnt/c/WINDOWS/System32/WindowsPowerShell']) {
    try { execFileSync('pkill', ['-9', '-f', patron], { stdio: 'ignore' }); } catch { /* no habia */ }
  }
  console.log('dictado parado');
}

async function arranca() {
  const previo = vivo();
  if (previo) {
    console.log(`el dictado ya esta escuchando (pid ${previo}). Un toque de Ctrl derecho o un click al icono de la barra enciende manos libres; otro lo apaga.`);
    return;
  }
  parar(); // por si quedo un ayudante huerfano ocupando el puerto
  mkdirSync(banco, { recursive: true });
  const env = {
    ...process.env,
    DICTADO_MODELOS: process.env.DICTADO_MODELOS ?? join(banco, 'modelos'),
    DICTADO_RUNTIME: process.env.DICTADO_RUNTIME ?? banco,
    DICTADO_PYTHON: process.env.DICTADO_PYTHON ?? join(banco, 'venv', 'bin', 'python'),
    DICTADO_DATOS: process.env.DICTADO_DATOS ?? join(banco, 'datos'),
  };
  const fd = openSync(log, 'w');
  const hijo = spawn(process.execPath, [join(raiz, 'dist', 'node', 'cli.js'), 'dictar', ...FLAGS], { cwd: raiz, env, detached: true, stdio: ['ignore', fd, fd] });
  hijo.unref();
  writeFileSync(pidArchivo, String(hijo.pid));
  const inicio = Date.now();
  while (Date.now() - inicio < 40_000) {
    await new Promise((r) => setTimeout(r, 1000));
    const lineas = utiles();
    if (lineas.some((l) => l.includes('tecla global conectada') || l.includes('icono conectado'))) {
      for (const l of lineas.filter((x) => /motor |microfono|conectada|icono conectado/.test(x))) console.log(l.trim());
      console.log(`escuchando (pid ${hijo.pid}). Un toque de Ctrl derecho o un click al icono de la barra enciende manos libres; otro lo apaga. Log: ${log}`);
      return;
    }
    if (lineas.some((l) => l.includes('✗') || l.includes('EADDRINUSE'))) break;
  }
  console.error('el dictado no llego a conectar la tecla en 40 s. Ultimas lineas:');
  for (const l of utiles().slice(-6)) console.error('  ' + l.trim());
  process.exit(1);
}

const argv = process.argv.slice(2);
if (argv.includes('--parar')) parar();
else if (argv.includes('--estado')) {
  const pid = vivo();
  console.log(pid ? `escuchando (pid ${pid})` : 'parado');
  for (const l of utiles().slice(-12)) console.log('  ' + l.trim());
} else await arranca();
