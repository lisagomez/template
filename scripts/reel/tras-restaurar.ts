/**
 * JOB DE PLATAFORMA DECLARADO (C7): después de RESTAURAR una copia del almacén del reel, vuelve a borrar lo que
 * pertenece a consentimientos retirados DESPUÉS de esa copia (derecho a borrar, AISIA §7): su documento, su
 * archivo de vigencia y la transcripción conservada aprobada antes del retiro. Sin esto, restaurar resucita el
 * documento de alguien que se retiró.
 *
 * Los retiros viven en Supabase (`revocado_en`), que no se restaura con el almacén, y son de TODOS los dueños: por
 * eso lee con `SUPABASE_SERVICE_ROLE_KEY` (BYPASSRLS). Es la única pieza que usa esa llave; ninguna superficie de la
 * app la lee. Solo consulta (`select` de id, proyecto, dueño y fecha de retiro: ni alias ni documento), nunca
 * escribe en Supabase, y la llave no se imprime. Sin llave no hace nada (exit 2): no poder mirar no es estar en verde.
 *
 * Para simulacros sin llave, `--retiros archivo.json` (lista de { consentimiento, proyecto, dueno, revocadoEn }).
 * Los vencimientos los reaplica `npm run reel:retencion`, que se corre DESPUÉS de este.
 * Uso: node scripts/reel/tras-restaurar.ts [--seco] [--retiros archivo.json]
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { rutasTrasRestaurar, TRANSCRIPCION_CONSERVADA, type RetiroRegistrado } from '../../tools/reel/dist/index.js';

const DATOS = resolve(process.env['REEL_DATOS'] ?? join(homedir(), '.reel', 'datos'));
const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const seco = process.argv.includes('--seco');
const dirs = (d: string) => { try { return readdirSync(d).filter((n) => statSync(join(d, n)).isDirectory()); } catch { return []; } };

function entorno(nombre: string): string | undefined {
  if (process.env[nombre]) return process.env[nombre];
  try {
    const linea = readFileSync('.env.local', 'utf8').split('\n').find((l) => l.startsWith(`${nombre}=`));
    return linea?.slice(nombre.length + 1).trim().replace(/^["']|["']$/g, '') || undefined;
  } catch { return undefined; }
}

async function retirosDeSupabase(): Promise<RetiroRegistrado[] | null> {
  const url = entorno('NEXT_PUBLIC_SUPABASE_URL'), llave = entorno('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !llave) return null;
  const supabase = createClient(url, llave, { auth: { persistSession: false, autoRefreshToken: false } });
  const salida: RetiroRegistrado[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from('reel_consentimientos').select('id, proyecto_id, dueno_id, revocado_en').not('revocado_en', 'is', null).range(desde, desde + 999);
    if (error) throw new Error(`no se pudieron leer los retiros (${error.code ?? 'sin código'})`);
    salida.push(...(data ?? []).map((r) => ({ consentimiento: String(r.id), proyecto: String(r.proyecto_id), dueno: String(r.dueno_id), revocadoEn: String(r.revocado_en) })));
    if (!data || data.length < 1000) return salida;
  }
}

const archivo = arg('--retiros');
let retiros: RetiroRegistrado[] | null;
try {
  retiros = archivo ? JSON.parse(readFileSync(archivo, 'utf8')) as RetiroRegistrado[] : await retirosDeSupabase();
} catch (e) {
  console.error(`${e instanceof Error ? e.message : 'error al leer los retiros'}. No se borró nada.`);
  process.exit(1);
}
if (retiros === null) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (o pasa --retiros archivo.json). No se borró nada.');
  process.exit(2);
}

// Los ids terminan en rutas del disco: solo letras, cifras y guiones (un `../` en un archivo de retiros no pasa).
const SEGURO = /^[A-Za-z0-9-]+$/;
const invalidos = retiros.filter((r) => ![r.consentimiento, r.proyecto, r.dueno].every((x) => SEGURO.test(String(x))));
if (invalidos.length) { console.error(`${invalidos.length} retiro(s) con identificadores inválidos. No se borró nada.`); process.exit(1); }

const aprobadasEn: Record<string, string> = {};
for (const dueno of dirs(DATOS)) for (const proyecto of dirs(join(DATOS, dueno))) {
  try {
    const t = JSON.parse(readFileSync(join(DATOS, dueno, proyecto, TRANSCRIPCION_CONSERVADA), 'utf8')) as { aprobadoEn: string };
    aprobadasEn[`${dueno}/${proyecto}`] = t.aprobadoEn;
  } catch { /* sin transcripción conservada */ }
}

let borradas = 0;
for (const rel of rutasTrasRestaurar(retiros, aprobadasEn)) {
  const ruta = resolve(DATOS, rel);
  if (!ruta.startsWith(DATOS + sep) || !existsSync(ruta)) continue;
  borradas++;
  if (!seco) rmSync(ruta, { force: true });
  console.log(`${seco ? 'se borraría' : 'borrado'}: ${rel.split('/').map((s, i) => (i < 2 ? `${s.slice(0, 8)}…` : s)).join('/')}`);
}
console.log(`${retiros.length} retiro(s) registrados · ${borradas} archivo(s) ${seco ? 'por borrar (en seco)' : 'borrados'}. Corre ahora npm run reel:retencion para reaplicar los vencimientos.`);
