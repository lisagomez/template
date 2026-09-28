/**
 * MEDICIÓN del aislamiento (RLS) contra la base REAL con dos cuentas (C7, regla 5: la prueba vive del lado
 * de la app). Escribe public/laboratorio-pymes/reel/rls.json, que verifica el caso sala-7 del laboratorio
 * (dentro de `validate`). Fuera de `validate` a propósito: necesita red y crea dos cuentas por corrida.
 * Cuentas sintéticas en @example.com (dominio reservado: ningún correo llega a nadie) con contraseña
 * aleatoria que no se imprime. La cuenta B intenta leer, cambiar, borrar y suplantar lo de la A.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim())).filter((m): m is RegExpExecArray => m !== null).map((m) => [m[1], (m[2] ?? '').replace(/^["']|["']$/g, '')]));
const URL_ = env['NEXT_PUBLIC_SUPABASE_URL'] ?? '', LLAVE = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '';
const nuevo = () => createClient(URL_, LLAVE, { auth: { persistSession: false, autoRefreshToken: false } });
const HUELLA = `sha256:${'ab'.repeat(32)}`;

async function cuenta(etiqueta: string): Promise<{ c: SupabaseClient; id: string }> {
  const c = nuevo();
  const correo = `reel-rls-${etiqueta}-${Date.now()}-${randomBytes(3).toString('hex')}@example.com`;
  const { data, error } = await c.auth.signUp({ email: correo, password: randomBytes(18).toString('base64url') });
  if (error || !data.session || !data.user) throw new Error(`no se pudo crear la cuenta ${etiqueta}: ${error?.message ?? 'sin sesión (¿confirmación por correo encendida?)'}`);
  return { c, id: data.user.id };
}

const filas: Array<[string, string, boolean]> = [];
const anota = (que: string, esperado: string, ok: boolean) => { filas.push([que, esperado, ok]); };

const A = await cuenta('a'), B = await cuenta('b');
const p = await A.c.from('reel_proyectos').insert({ titulo: 'Pan de muerto (prueba RLS)' }).select().single();
anota('A crea su proyecto', 'se crea', !p.error && p.data?.dueno_id === A.id);
const v = await A.c.from('reel_versiones').insert({ proyecto_id: p.data?.id, numero: 1, huella: HUELLA, duracion_s: 20 }).select().single();
const ap = await A.c.from('reel_aprobaciones').insert({ proyecto_id: p.data?.id, version_id: v.data?.id, decision: 'aprobada', huella: HUELLA, version: 1 }).select().single();
anota('A registra su aprobación (quién, cuándo, huella, versión)', 'se registra', !ap.error && ap.data?.aprobado_por === A.id);
const perfil = await A.c.from('profiles').select('id').eq('id', A.id);
anota('el alta creó el perfil de A (disparador)', '1 fila', perfil.data?.length === 1);

const bLee = await B.c.from('reel_proyectos').select('id').eq('id', p.data?.id);
anota('B lee el proyecto de A', '0 filas', !bLee.error && bLee.data.length === 0);
const bTodo = await B.c.from('reel_aprobaciones').select('id');
anota('B lista aprobaciones', 'ninguna de A', !bTodo.error && bTodo.data.length === 0);
const bCambia = await B.c.from('reel_proyectos').update({ titulo: 'hackeado' }).eq('id', p.data?.id).select();
anota('B cambia el título del proyecto de A', '0 filas cambiadas', !bCambia.error && bCambia.data.length === 0);
const bBorra = await B.c.from('reel_proyectos').delete().eq('id', p.data?.id).select();
anota('B borra el proyecto de A', '0 filas borradas', !bBorra.error && bBorra.data.length === 0);
const bSuplanta = await B.c.from('reel_proyectos').insert({ titulo: 'suplantado', dueno_id: A.id }).select();
anota('B crea un proyecto a nombre de A', 'rechazado', !!bSuplanta.error);
const bAprueba = await B.c.from('reel_aprobaciones').insert({ proyecto_id: p.data?.id, version_id: v.data?.id, decision: 'aprobada', huella: HUELLA, version: 1, dueno_id: A.id, aprobado_por: A.id }).select();
anota('B aprueba en nombre de A', 'rechazado', !!bAprueba.error);
const bPerfil = await B.c.from('profiles').select('id').eq('id', A.id);
anota('B lee el perfil de A', '0 filas', !bPerfil.error && bPerfil.data.length === 0);
const aReescribe = await A.c.from('reel_aprobaciones').update({ huella: `sha256:${'cd'.repeat(32)}` }).eq('id', ap.data?.id).select();
anota('A reescribe la huella de su aprobación', 'rechazado (inmutable)', !!aReescribe.error);
const aRevoca = await A.c.from('reel_aprobaciones').update({ revocada_en: new Date().toISOString() }).eq('id', ap.data?.id).select();
anota('A revoca su aprobación', 'se revoca', !aRevoca.error && aRevoca.data.length === 1);
const anon = await nuevo().from('reel_proyectos').select('id');
anota('sin sesión, alguien lista proyectos', 'rechazado o vacío', !!anon.error || anon.data.length === 0);
const aBorra = await A.c.from('reel_proyectos').delete().eq('id', p.data?.id).select();
anota('A borra su proyecto (en cascada)', 'se borra', !aBorra.error && aBorra.data.length === 1);

console.log('| Comprobación | Esperado | Resultado |\n|---|---|---|');
for (const [q, e, ok] of filas) console.log(`| ${q} | ${e} | ${ok ? '✓' : '✗'} |`);
const fallas = filas.filter((f) => !f[2]).length;
writeFileSync('public/laboratorio-pymes/reel/rls.json', JSON.stringify({ cuando: new Date().toISOString(), filas }, null, 1));
console.log(`\n${filas.length - fallas}/${filas.length} en verde · 2 cuentas sintéticas @example.com (sin correo enviado)`);
process.exit(fallas ? 1 : 0);
