/**
 * PASO 5b del job, solo en el VPS: lleva a la agenda del cerebro el RESUMEN de cada producto (fase «resumen» del grafo
 * `docs/goals/capa-arbrain-grafo.json`). Un resumen es solo conteos y enlaces: «3 citas hoy, 1 mañana · /recepcion».
 *
 * Tres puertas, y por las tres se rechaza el archivo ENTERO (no se rescata nada de él):
 *   1. el producto está en la lista que decide el laboratorio (`resumenes-permitidos.json`): un producto no se
 *      autoriza solo;
 *   2. pasa `validaResumen` de `@tu-scope/capa`, el MISMO esquema que usa el producto, con las claves que su
 *      composición declara: un campo de más, una clave inventada, un texto en un conteo o una consulta en un enlace
 *      tumban el archivo;
 *   3. el texto de la tarea lo escribe este job con `lineaDeAgenda` (números y nombres de clave declarados), nunca
 *      con un texto del producto.
 *
 * Lo aceptado se escribe como una tarea con id estable `resumen-<producto>-<fecha>` en `.claude/plan/calendario.json`
 * (se une por registro entre los dos lados, como todo el calendario). Lo rechazado se queda en la cuarentena del VPS,
 * fuera del cerebro, con su motivo. Nada de esto toca la carpeta de datos de la app.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const CALENDARIO = '.claude/plan/calendario.json';
const ZONA = process.env.TZ || 'America/Mexico_City';

/** La capa empaquetada: en la imagen, `@tu-scope/capa` instalado junto al job; en el repo, su `dist`. */
export async function cargaCapa() {
  try {
    return await import('@tu-scope/capa');
  } catch {
    return import(new URL('../../../tools/capa/dist/index.js', import.meta.url).href);
  }
}

/** Los productos que el laboratorio deja informar, con lo que cada uno declara en su composición. */
export function leePermitidos(dir = AQUI) {
  const lista = JSON.parse(readFileSync(join(dir, 'resumenes-permitidos.json'), 'utf8')).productos ?? [];
  const declarados = new Map();
  for (const slug of lista) {
    const ruta = join(dir, 'composiciones', `${slug}.json`);
    if (!existsSync(ruta)) continue;
    const c = JSON.parse(readFileSync(ruta, 'utf8'));
    if (c?.resumen) declarados.set(slug, { conteos: c.resumen.conteos, enlaces: c.resumen.enlaces });
  }
  return declarados;
}

const fechaDe = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

/** Escribe (o actualiza) la tarea del resumen en el calendario del cerebro. Devuelve su id. */
function anotaEnAgenda(arbrain, r, linea) {
  const ruta = join(arbrain, CALENDARIO);
  const cal = existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : { version: 1, eventos: [], tareas: [], recibos: {} };
  cal.tareas ??= [];
  const fecha = fechaDe(r.generado);
  const id = `resumen-${r.producto}-${fecha}`;
  const tarea = { id, titulo: linea, descripcion: 'Resumen de producto: solo conteos y enlaces.', fecha, duracionMin: 0, prioridad: 4, hecha: false, hechaEn: null, etiquetas: ['resumen-de-producto'] };
  const i = cal.tareas.findIndex((t) => t.id === id);
  if (i >= 0) cal.tareas[i] = tarea; else cal.tareas.push(tarea);
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, `${JSON.stringify(cal, null, 2)}\n`);
  return id;
}

/**
 * Procesa la carpeta de entrada. Nunca lanza por un archivo malo: lo aparta con su motivo y sigue.
 * @returns {{ aceptados: Array<{archivo:string,id:string}>, rechazados: Array<{archivo:string,motivos:string[]}> }}
 */
export async function procesaResumenes({ entrada, arbrain, permitidos = leePermitidos() }) {
  const salida = { aceptados: [], rechazados: [] };
  if (!existsSync(entrada)) return salida;
  const { validaResumen, lineaDeAgenda } = await cargaCapa();
  const aparta = (archivo, carpeta, motivos) => {
    mkdirSync(join(entrada, carpeta), { recursive: true, mode: 0o700 });
    renameSync(join(entrada, archivo), join(entrada, carpeta, archivo));
    if (motivos) writeFileSync(join(entrada, carpeta, `${archivo}.motivo.json`), `${JSON.stringify({ motivos }, null, 2)}\n`);
  };
  for (const archivo of readdirSync(entrada).filter((f) => f.endsWith('.json')).sort()) {
    let x;
    try { x = JSON.parse(readFileSync(join(entrada, archivo), 'utf8')); } catch { aparta(archivo, 'rechazados', ['no es JSON']); salida.rechazados.push({ archivo, motivos: ['no es JSON'] }); continue; }
    const declaracion = typeof x?.producto === 'string' ? permitidos.get(x.producto) : undefined;
    const r = declaracion ? validaResumen(x, declaracion) : { ok: false, motivos: ['producto que el laboratorio no deja informar'] };
    if (!r.ok) { aparta(archivo, 'rechazados', r.motivos); salida.rechazados.push({ archivo, motivos: r.motivos }); continue; }
    const id = anotaEnAgenda(arbrain, r.resumen, lineaDeAgenda(r.resumen));
    aparta(archivo, 'procesados');
    salida.aceptados.push({ archivo, id });
  }
  return salida;
}
