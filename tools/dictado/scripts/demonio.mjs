#!/usr/bin/env node
/**
 * El demonio LOCAL de transcripcion: `servicio/servidor.mjs` escuchando solo en 127.0.0.1, con
 * el modelo cargado una vez. Existe porque cada peticion web (`/api/dictado/movil`,
 * `/api/laboratorio/*`) arrancaba el CLI y cargaba el modelo: ~3 s fijos por frase (medido el
 * 2026-09-20: p50 2 940 ms con el motor en 260 ms). Con el demonio, la ruta paga solo el motor.
 *
 *   npm run demonio            arranca (o dice que ya esta) y espera /health
 *   npm run demonio -- --parar  lo para por PID (nunca pkill -f sin anclar)
 *   npm run demonio -- --estado  vivo o no, y las ultimas lineas del log
 *
 * C3: el Bearer es el MISMO token del celular (`DICTADO_MOVIL_TOKEN`, 32 hex), leido del entorno
 * o del `.env.local` de la raiz; sin token no arranca. Loopback: no se publica a la red. C4: el
 * servicio no escribe audio ni texto. Lo importa `en-vivo.mjs` para levantarlo junto al dictado.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const banco = join(raiz, 'medicion', 'banco');
const log = join(banco, 'demonio.log');
const pidArchivo = join(banco, 'demonio.pid');
export const PUERTO_DEMONIO = Number(process.env.DICTADO_DEMONIO_PUERTO ?? 47125);
export const URL_DEMONIO = `http://127.0.0.1:${PUERTO_DEMONIO}`;

/** El token nunca se imprime: solo «presente (largo N)». */
function tokenDeEmparejamiento() {
  if (process.env.DICTADO_MOVIL_TOKEN) return process.env.DICTADO_MOVIL_TOKEN;
  const envLocal = resolve(raiz, '..', '..', '.env.local');
  if (!existsSync(envLocal)) return undefined;
  return /^DICTADO_MOVIL_TOKEN=(.+)$/m.exec(readFileSync(envLocal, 'utf8'))?.[1]?.trim();
}

export async function saludDemonio(msEspera = 800) {
  try {
    const r = await fetch(`${URL_DEMONIO}/health`, { signal: AbortSignal.timeout(msEspera) });
    return r.ok;
  } catch {
    return false;
  }
}

function pidGuardado() {
  try {
    const pid = Number(readFileSync(pidArchivo, 'utf8').trim());
    if (!Number.isInteger(pid) || pid <= 0) return null;
    process.kill(pid, 0); // existe?
    return pid;
  } catch {
    return null;
  }
}

export async function arrancaDemonio({ silencioso = false } = {}) {
  const di = (m) => { if (!silencioso) console.log(m); };
  if (await saludDemonio()) {
    di(`el demonio ya responde en ${URL_DEMONIO}/health`);
    return true;
  }
  const token = tokenDeEmparejamiento();
  if (!token || token.length < 32) {
    console.error('demonio: sin DICTADO_MOVIL_TOKEN (>= 32 caracteres) no arranca: es su Bearer (C3). Esta en el .env.local de la raiz.');
    return false;
  }
  mkdirSync(banco, { recursive: true });
  const env = {
    ...process.env,
    DICTADO_TOKEN: token,
    DICTADO_MODELOS: process.env.DICTADO_MODELOS ?? join(banco, 'modelos'),
    DICTADO_RUNTIME: process.env.DICTADO_RUNTIME ?? banco,
    DICTADO_HILOS: process.env.DICTADO_HILOS ?? '8',
    DICTADO_MOTOR: process.env.DICTADO_DEMONIO_MOTOR ?? 'parakeet',
    DICTADO_PUERTO: String(PUERTO_DEMONIO),
    DICTADO_ESCUCHA: '127.0.0.1',
    DICTADO_EN_VUELO: process.env.DICTADO_EN_VUELO ?? '2',
  };
  const fd = openSync(log, 'w');
  const hijo = spawn(process.execPath, [join(raiz, 'servicio', 'servidor.mjs')], { cwd: raiz, env, detached: true, stdio: ['ignore', fd, fd] });
  hijo.unref();
  writeFileSync(pidArchivo, String(hijo.pid));
  const inicio = Date.now();
  while (Date.now() - inicio < 30_000) {
    await new Promise((r) => setTimeout(r, 250));
    if (await saludDemonio(400)) {
      di(`demonio de transcripcion escuchando en ${URL_DEMONIO} (pid ${hijo.pid}, token presente largo ${token.length}); log: ${log}`);
      return true;
    }
    if (hijo.exitCode !== null) break;
  }
  console.error('el demonio no respondio en 30 s. Ultimas lineas del log:');
  for (const l of ultimasLineas()) console.error('  ' + l);
  return false;
}

export function paraDemonio({ silencioso = false } = {}) {
  const pid = pidGuardado();
  if (pid) {
    try { process.kill(pid, 'SIGTERM'); } catch { /* ya no estaba */ }
    try { unlinkSync(pidArchivo); } catch { /* nada */ }
    if (!silencioso) console.log(`demonio parado (pid ${pid})`);
    return true;
  }
  if (!silencioso) console.log('el demonio no estaba corriendo');
  return false;
}

const ultimasLineas = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').slice(-6) : []);

const esPrincipal = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const argv = process.argv.slice(2);
  if (argv.includes('--parar')) paraDemonio();
  else if (argv.includes('--estado')) {
    console.log((await saludDemonio()) ? `vivo en ${URL_DEMONIO} (pid ${pidGuardado() ?? '?'})` : 'parado');
    for (const l of ultimasLineas()) console.log('  ' + l);
  } else process.exit((await arrancaDemonio()) ? 0 : 1);
}
