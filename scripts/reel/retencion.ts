/**
 * JOB DE PLATAFORMA (respuesta 7 firmada): a los 30 días de aprobado un reel se borran el bruto y su
 * transcripción; se conservan el máster, el registro y los consentimientos. Opera sobre el ALMACÉN LOCAL
 * (donde vive el video); no toca Supabase ni usa llaves. El reloj se inyecta: `--ahora 2026-10-28T12:00:00Z`.
 * También borra, al vencer su vigencia, la transcripción íntegra guardada con los consentimientos (riesgo 5) y el
 * documento firmado de cada consentimiento (queda su archivo de vigencia con la fecha de borrado, como constancia).
 * Uso: node scripts/reel/retencion.ts [--ahora ISO] [--seco]
 */
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { BRUTO, documentoDeConsentimiento, documentoVencido, porBorrar, transcripcionVencida, venceEl, TRANSCRIPCION_CONSERVADA, type VigenciaDeDocumento } from '../../tools/reel/dist/index.js';

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
// La transcripción conservada con el consentimiento vence con él (la vigencia incluye su último día).
const hoy = new Date(ahora.getTime() - 6 * 3600_000).toISOString().slice(0, 10);
let transcripciones = 0;
for (const p of proyectos) {
  const ruta = join(p.carpeta, TRANSCRIPCION_CONSERVADA);
  let t: { conservarHasta: string } | null = null;
  try { t = JSON.parse(readFileSync(ruta, 'utf8')); } catch { /* no hay */ }
  if (!t || !transcripcionVencida(t, hoy)) continue;
  transcripciones++;
  if (!seco) rmSync(ruta, { force: true });
  console.log(`${p.id.slice(0, 8)}… transcripción conservada vencida (hasta ${t.conservarHasta})${seco ? ': en seco, no se borró' : ': borrada'}`);
}
// Documentos de consentimientos: se conservan mientras dura su vigencia. Los registrados antes de que existiera el
// archivo de vigencia (2026-10-02) no tienen fecha local: se reportan y NO se borran a ciegas.
let documentos = 0, sinVigencia = 0;
for (const p of proyectos) {
  const dir = join(p.carpeta, 'consentimientos');
  let nombres: string[] = [];
  try { nombres = readdirSync(dir); } catch { continue; }
  for (const n of nombres.filter((x) => x.endsWith('.bin'))) if (!nombres.includes(n.replace(/\.bin$/, '.vigencia.json'))) sinVigencia++;
  for (const n of nombres.filter((x) => x.endsWith('.vigencia.json'))) {
    const v = JSON.parse(readFileSync(join(dir, n), 'utf8')) as VigenciaDeDocumento;
    if (!documentoVencido(v, hoy)) continue;
    documentos++;
    if (!seco) {
      rmSync(join(p.carpeta, documentoDeConsentimiento(v.consentimiento)), { force: true });
      writeFileSync(join(dir, n), JSON.stringify({ ...v, documentoBorradoEn: ahora.toISOString() }));
    }
    console.log(`${p.id.slice(0, 8)}… documento del consentimiento ${v.consentimiento.slice(0, 8)}… vencido (hasta ${v.vigenteHasta})${seco ? ': en seco, no se borró' : ': borrado'}`);
  }
}
if (sinVigencia) console.log(`${sinVigencia} documento(s) sin archivo de vigencia (anteriores al 2026-10-02): no se borran solos; revísalos contra Supabase`);
console.log(`${proyectos.length} proyecto(s) en el almacén · ${vencidos.size} vencido(s) · ${transcripciones} transcripción(es) conservada(s) y ${documentos} documento(s) vencido(s) al ${ahora.toISOString()}${seco ? ' · en seco' : ''}`);
