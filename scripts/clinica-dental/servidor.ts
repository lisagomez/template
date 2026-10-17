/**
 * El laboratorio desde cero: tira el estado (portal, libro, buzón, Telegram, reloj, llaves), deja el reel, el
 * entorno y el LIBRO DE GASTO (el tope de US$1 es del goal entero: si el reinicio lo borrara, cada corrida
 * empezaría de cero y el tope no detendría nada; se borraba hasta el 16/10), vacía las cuentas del Supabase LOCAL del laboratorio (`db reset`: es su base efímera, no la
 * compartida) y arranca la app con `CLINICA_LABORATORIO=1` en el puerto 3011. El servidor queda escribiendo su
 * log en `CLINICA_DATOS/servidor.log` (se revisa luego: cero PII sembrada en los logs).
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, openSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DATOS } from './rutas.ts';

export const BASE = process.env['CLINICA_BASE'] ?? 'http://localhost:3011';
const PUERTO = new URL(BASE).port || '3011';
const CONSERVA = new Set(['reel', 'entorno.env', 'gasto.jsonl']);
export const LOG_SERVIDOR = join(DATOS, 'servidor.log');

function pidEnPuerto(puerto: string): number | null {
  const s = execFileSync('ss', ['-ltnp'], { encoding: 'utf8' });
  const l = s.split('\n').find((x) => new RegExp(`:${puerto}\\b`).test(x));
  const m = l ? /pid=(\d+)/.exec(l) : null;
  return m ? Number(m[1]) : null;
}

export async function detieneServidor(): Promise<void> {
  const pid = pidEnPuerto(PUERTO);
  if (!pid) return;
  // Matar el GRUPO (npm → next → next-server): matar solo al padre deja a next-server con el puerto.
  // Solo si el LÍDER del grupo es el `npm run dev` que arrancó este script: un servidor lanzado a mano comparte el
  // grupo con la shell que lo lanzó, y matar ese grupo tumbaría la shell.
  const grupo = Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).trim());
  const lider = execFileSync('ps', ['-o', 'args=', '-p', String(grupo)], { encoding: 'utf8' }).trim();
  const objetivo = /npm run dev|next dev/.test(lider) ? -grupo : pid;
  try { process.kill(objetivo, 'SIGTERM'); } catch { /* ya no estaba */ }
  for (let i = 0; i < 50 && pidEnPuerto(PUERTO); i++) await new Promise((r) => setTimeout(r, 200));
}

function entorno(): Record<string, string> {
  const ruta = join(DATOS, 'entorno.env');
  if (!existsSync(ruta)) throw new Error(`falta ${ruta}: lo escribe el arranque del laboratorio (sin imprimir llaves)`);
  return Object.fromEntries(readFileSync(ruta, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}

export function limpiaEstado(): void {
  if (!existsSync(DATOS)) return;
  for (const n of readdirSync(DATOS)) if (!CONSERVA.has(n)) rmSync(join(DATOS, n), { recursive: true, force: true });
}

export function vaciaCuentas(): void {
  execFileSync('npx', ['-y', 'supabase@2.118.0', 'db', 'reset', '--local', '--workdir', 'tools/clinica-dental/laboratorio'], { stdio: 'ignore' });
}

export async function arrancaServidor(): Promise<void> {
  const log = openSync(LOG_SERVIDOR, 'a', 0o600);
  const hijo = spawn('npm', ['run', 'dev'], { env: { ...process.env, ...entorno(), PORT: PUERTO }, stdio: ['ignore', log, log], detached: true });
  hijo.unref();
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/clinica/maguey`)).ok) return;
    } catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('la app no arrancó en 120 s');
}

/** Calienta las rutas (el modo desarrollo compila al primer golpe): las latencias medidas no llevan la compilación. */
export async function calienta(): Promise<void> {
  for (const c of ['maguey', 'colibri']) for (const r of ['', '/registro', '/agenda', '/entrar', '/mis-citas', '/privacidad']) await fetch(`${BASE}/clinica/${c}${r}`).catch(() => undefined);
  for (const r of ['/laboratorio-clinica-dental', '/laboratorio-clinica-dental/buzon', '/laboratorio-clinica-dental/telegram']) await fetch(`${BASE}${r}`).catch(() => undefined);
  await fetch(`${BASE}/api/clinica-dental/huecos?clinica=maguey&servicio=limpieza&dias=2`).catch(() => undefined);
}

export async function reiniciaLaboratorio(): Promise<void> {
  await detieneServidor();
  limpiaEstado();
  vaciaCuentas();
  await arrancaServidor();
  await calienta();
}

export async function laboratorio(cuerpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch(`${BASE}/api/clinica-dental/laboratorio`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify(cuerpo) });
  if (!r.ok) throw new Error(`laboratorio ${String(cuerpo['accion'])}: ${r.status}`);
  return (await r.json()) as Record<string, unknown>;
}
