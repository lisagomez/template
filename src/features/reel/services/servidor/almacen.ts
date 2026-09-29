import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

/**
 * El almacén del reel vive en el SERVIDOR (respuesta 2): bruto, transcripción, máster y documentos de
 * consentimiento. Supabase no ve nada de esto. Las rutas salen de UUIDs validados, nunca del cliente.
 *
 * turbopackIgnore: las rutas se deciden en tiempo de ejecución; sin esto Turbopack rastrea la raíz entera y
 * revienta con el symlink del venv del banco de medición, que apunta fuera del root (como en etiquetas).
 */
export const DATOS = resolve(/*turbopackIgnore: true*/ process.env['REEL_DATOS'] ?? join(homedir(), '.reel', 'datos'));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function carpetaDe(duenoId: string, proyectoId: string): string {
  if (!UUID.test(duenoId) || !UUID.test(proyectoId)) throw new Error('identificador inválido');
  const c = resolve(/*turbopackIgnore: true*/ DATOS, duenoId, proyectoId);
  if (!c.startsWith(DATOS + sep)) throw new Error('ruta fuera del almacén');
  return c;
}

export async function guarda(carpeta: string, nombre: string, datos: Uint8Array | string): Promise<string> {
  await mkdir(carpeta, { recursive: true });
  const ruta = join(carpeta, nombre);
  await writeFile(ruta, datos);
  return ruta;
}

export async function leeJson<T>(ruta: string): Promise<T | null> {
  try { return JSON.parse(await readFile(ruta, 'utf8')) as T; } catch { return null; }
}

/** Lo que hay en la carpeta (para enseñar el antes y el después de borrar). */
export async function lista(carpeta: string): Promise<string[]> {
  try { return (await readdir(carpeta, { recursive: true })).map(String).sort(); } catch { return []; }
}

export async function borraCarpeta(carpeta: string): Promise<void> {
  if (!resolve(/*turbopackIgnore: true*/ carpeta).startsWith(DATOS + sep)) throw new Error('ruta fuera del almacén');
  await rm(carpeta, { recursive: true, force: true });
}

export const existe = async (ruta: string): Promise<boolean> => stat(ruta).then(() => true, () => false);

/** Corre el proceso del reel en un hijo; un proceso a la vez por servidor (O4: el CPU no se reparte a ciegas). */
let enCurso: Promise<unknown> | null = null;
export async function procesaEnHijo(peticion: object): Promise<{ estado: string; huella: string | null; duracion: number | null }> {
  if (enCurso) throw new Error('ocupado');
  const trabajo = new Promise<{ estado: string; huella: string | null; duracion: number | null }>((resolver, rechazar) => {
    const h = spawn(process.execPath, [join(/*turbopackIgnore: true*/ process.cwd(), 'scripts', 'reel', 'procesa-proyecto.ts')], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    h.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    h.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    h.on('close', (c) => (c === 0 ? resolver(JSON.parse(out)) : rechazar(new Error(err.slice(-800) || `salió con ${c}`))));
    h.stdin.end(JSON.stringify(peticion));
  });
  enCurso = trabajo;
  try { return await trabajo; } finally { enCurso = null; }
}
