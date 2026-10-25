/**
 * Utilidades de prueba.mjs: correr comandos sin shell, hablar con los contenedores por `docker compose exec`,
 * imprimir con sangría y llevar la cuenta de lo comprobado. Sin dependencias.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AQUI = dirname(fileURLToPath(import.meta.url));
export const COMPOSE = join(AQUI, 'compose.yml');
export const ENTORNO = { ...process.env };
const COLOR = process.stdout.isTTY;
const tinta = (c) => (s) => (COLOR ? `\x1b[${c}m${s}\x1b[0m` : s);
export const verde = tinta(32), rojo = tinta(31), gris = tinta(2), negrita = tinta(1);

export const sh = (cmd, args, opciones = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: ENTORNO, ...opciones });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '', salida: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};
export const dc = (args, opciones) => sh('docker', ['compose', '-f', COMPOSE, ...args], opciones);

/** Corre algo dentro de un servicio como «arbrain». `bash -c` solo con textos fijos de la prueba. */
export const en = (servicio, args, opciones) => dc(['exec', '-T', '-u', 'arbrain', servicio, ...args], opciones);
export const bash = (servicio, guion) => en(servicio, ['bash', '-c', guion]);
export const nodeEn = (servicio, ...args) => en(servicio, ['node', ...args]);

export function titulo(t) { console.log(`\n${negrita(`═══ ${t} ═══`)}`); }
export function linea(t = '') { console.log(t); }
export function bloque(texto, prefijo = '    │ ') {
  const l = String(texto).replace(/\x1b\[[0-9;]*m/g, '').trimEnd().split('\n').filter((x) => x.trim() !== '');
  for (const x of l) console.log(gris(prefijo) + x);
}

const resultados = new Map();
/** Anota una comprobación de un punto (a)…(g). El punto queda en verde solo si TODAS sus comprobaciones lo están. */
export function comprueba(punto, ok, texto) {
  if (!resultados.has(punto)) resultados.set(punto, []);
  resultados.get(punto).push(Boolean(ok));
  console.log(`  ${ok ? verde('✓') : rojo('✗')} ${texto}`);
  return Boolean(ok);
}
const ORDEN = ['0', 'app', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export const resumen = () => [...resultados].sort(([x], [y]) => ORDEN.indexOf(x) - ORDEN.indexOf(y))
  .map(([punto, oks]) => ({ punto, ok: oks.every(Boolean), n: oks.length, bien: oks.filter(Boolean).length }));

export const corto = (h) => (h ? String(h).replace(/^sha256:/, '').slice(0, 12) : '(no existe)');
export const json = (r) => { try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return null; } };
export const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
