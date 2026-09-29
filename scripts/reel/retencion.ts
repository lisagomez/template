/**
 * JOB DE PLATAFORMA (respuesta 7 firmada): a los 30 días de aprobado un reel se borran el bruto y su
 * transcripción; se conservan el máster, el registro y los consentimientos. Opera sobre el ALMACÉN LOCAL
 * (donde vive el video); no toca Supabase ni usa llaves. El reloj se inyecta: `--ahora 2026-10-28T12:00:00Z`.
 * Uso: node scripts/reel/retencion.ts [--ahora ISO] [--seco]
 */
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { BRUTO, porBorrar, venceEl } from '../../tools/reel/dist/index.js';

const DATOS = resolve(process.env['REEL_DATOS'] ?? join(homedir(), '.reel', 'datos'));
const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const ahora = new Date(arg('--ahora') ?? new Date().toISOString());
const seco = process.argv.includes('--seco');
const dirs = (d: string) => { try { return readdirSync(d).filter((n) => statSync(join(d, n)).isDirectory()); } catch { return []; } };

const proyectos = dirs(DATOS).flatMap((dueno) => dirs(join(DATOS, dueno)).map((id) => ({ id, carpeta: join(DATOS, dueno, id) })));
const estados = proyectos.map((p) => {
  let r = { aprobadoEn: null as string | null, brutoBorradoEn: null as string | null };
  try { r = JSON.parse(readFileSync(join(p.carpeta, 'registro.json'), 'utf8')); } catch { /* sin registro: no aprobado */ }
  return { ...p, ...r };
});
const vencidos = new Set(porBorrar(estados, ahora));
const contenido = (c: string) => readdirSync(c).sort().join(', ');
for (const p of estados.filter((x) => vencidos.has(x.id))) {
  const antes = contenido(p.carpeta);
  if (!seco) {
    for (const n of BRUTO) rmSync(join(p.carpeta, n), { recursive: true, force: true });
    writeFileSync(join(p.carpeta, 'registro.json'), JSON.stringify({ aprobadoEn: p.aprobadoEn, brutoBorradoEn: ahora.toISOString() }));
  }
  console.log(`${p.id.slice(0, 8)}… aprobado ${p.aprobadoEn} · vencía ${venceEl(p.aprobadoEn!).toISOString()}\n  antes:   ${antes}\n  después: ${seco ? '(en seco: nada se borró)' : contenido(p.carpeta)}`);
}
console.log(`${proyectos.length} proyecto(s) en el almacén · ${vencidos.size} vencido(s) al ${ahora.toISOString()}${seco ? ' · en seco' : ''}`);
