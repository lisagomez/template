#!/usr/bin/env node
/**
 * Lo que el laboratorio necesita saber o guardar EN DISCO, fuera del bundle de Next: que piezas
 * hay (presencia, nunca valores), que voces estan descargadas, y los veredictos (JSONL local).
 *
 * Existe como proceso aparte a proposito: Turbopack rastrea como assets cualquier carpeta que
 * el codigo bundleado toque con `fs` y tropieza con el symlink del venv del banco (medido el
 * 2026-09-20; la ruta movil ya lo documentaba para `path.join`). Las rutas lo invocan por
 * `execFile`, como al CLI de dictado.
 *
 *   node scripts/laboratorio-voz/maquina.mjs piezas             → {"piezas":{…},"voces":[…]}
 *   node scripts/laboratorio-voz/maquina.mjs veredictos-lee     → [ … ]
 *   echo '{…}' | node scripts/laboratorio-voz/maquina.mjs veredictos-agrega → { … guardado }
 *   node scripts/laboratorio-voz/maquina.mjs datos-lee          → diccionario, snippets e historial
 *   echo '{…}' | … diccionario-agrega | diccionario-quita | snippets-agrega | snippets-quita | historial-corrige
 *   echo '{filtros, desde, cuantos}' | … historial-lee   → la pagina /historial: filtrados, ordenados, paginados
 *   echo '{id}' | … historial-borra-uno · echo '{antesDe}' | … historial-borra-rango · historial-trayectorias
 *   node scripts/laboratorio-voz/maquina.mjs ajustes-lee     → la pagina /ajustes: valores con origen, esquema, catalogo medido
 *   echo '{clave, valor}' | … ajustes-pon · echo '{clave}' | … ajustes-quita · … ajustes-restablece
 *
 * Medido el 2026-09-20: leer y buscar sobre 20 000 dictados (3,9 MB) cuesta ~56 ms en total, y sobre
 * el historial real (188) menos de 1 ms. No hay indice: el archivo se lee entero en cada orden y lo
 * que manda es el arranque de este proceso (~100 ms), el mismo precio que ya paga el laboratorio.
 *
 * Los datos personales se leen y escriben con las MISMAS piezas del CLI (`cargaDatos` de
 * tools/dictado): un termino anadido aqui lo ve el proximo `dictar`.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { filtra, huellaDe } from '../../src/features/historial/services/busqueda.ts';

const raiz = process.env.DICTADO_RAIZ ?? join(process.cwd(), 'tools', 'dictado');
const banco = join(raiz, 'medicion', 'banco');
const modelos = process.env.DICTADO_MODELOS ?? join(banco, 'modelos');
const runtime = process.env.DICTADO_RUNTIME ?? banco;
const datos = process.env.DICTADO_DATOS ?? join(banco, 'datos');
const archivoVeredictos = join(datos, 'laboratorio', 'veredictos.jsonl');

const presente = (v) => typeof v === 'string' && v.length > 0;

function voces() {
  if (!existsSync(modelos)) return [];
  // La voz medida (es_MX «claude») va primera: es la de defecto en la pagina.
  const preferida = 'es_MX-claude-high';
  return readdirSync(modelos)
    .filter((n) => n.startsWith('vits-piper-'))
    .map((n) => n.replace('vits-piper-', ''))
    .sort((a, b) => (a === preferida ? -1 : b === preferida ? 1 : a.localeCompare(b)));
}

function piezas() {
  const hay = (...p) => existsSync(join(modelos, ...p));
  const token = process.env.DICTADO_MOVIL_TOKEN;
  return {
    parakeet: hay('sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8'),
    silero: hay('silero_vad.onnx'),
    embedding: hay('embedding.onnx'),
    piper: voces().length > 0,
    ffmpeg: ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg'].some((p) => existsSync(p)),
    runtime: existsSync(join(runtime, 'node_modules', 'sherpa-onnx-node')) && existsSync(join(runtime, 'node_modules', 'onnxruntime-node')),
    tokenServidor: typeof token === 'string' && token.length >= 16,
    llaveLlm: presente(process.env.OPENROUTER_API_KEY),
    supabase: presente(process.env.NEXT_PUBLIC_SUPABASE_URL),
  };
}

function leeVeredictos() {
  if (!existsSync(archivoVeredictos)) return [];
  return readFileSync(archivoVeredictos, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

function agregaVeredicto(nuevo) {
  const v = { id: randomUUID(), fecha: new Date().toISOString(), ...nuevo };
  mkdirSync(dirname(archivoVeredictos), { recursive: true });
  appendFileSync(archivoVeredictos, `${JSON.stringify(v)}\n`, 'utf8');
  return v;
}

/** Diccionario, snippets e historial por las piezas del propio CLI: misma carpeta, mismos archivos. */
async function cargaDatosPersonales() {
  const { cargaDatos } = await import(pathToFileURL(join(raiz, 'dist', 'node', 'cli-datos.js')).href);
  return cargaDatos({ datos, modelos, runtime, python: 'python3', remoto: { url: undefined, token: undefined }, hilos: 8, describe: () => '' });
}

const entradaJson = () => JSON.parse(readFileSync(0, 'utf8') || '{}');
const limpia = (s) => String(s ?? '').trim().slice(0, 200);

async function datosLee() {
  const d = await cargaDatosPersonales();
  const recientes = await d.historial.recientes(30);
  return {
    diccionario: d.diccionario.terminos(),
    snippets: d.snippets.lista(),
    historial: recientes.map((e) => ({ id: e.id, fecha: e.fecha, texto: e.texto, motor: e.motor, duracionMs: e.duracionMs, latenciaMs: e.latenciaMs ?? null })),
    total: await d.historial.cuenta(),
  };
}

async function ordenDatos(orden) {
  const d = await cargaDatosPersonales();
  const cuerpo = entradaJson();
  if (orden === 'diccionario-agrega') {
    const terminos = (Array.isArray(cuerpo.terminos) ? cuerpo.terminos : [cuerpo.termino]).map(limpia).filter(Boolean);
    const anadidos = d.diccionario.agrega(terminos);
    d.guardaDiccionario();
    return { anadidos };
  }
  if (orden === 'diccionario-quita') {
    const quitado = d.diccionario.quita(limpia(cuerpo.termino));
    d.guardaDiccionario();
    return { quitado };
  }
  if (orden === 'snippets-agrega') {
    const s = d.snippets.agrega(limpia(cuerpo.disparador), String(cuerpo.expansion ?? '').slice(0, 2000));
    d.guardaSnippets();
    return { snippet: s };
  }
  if (orden === 'snippets-quita') {
    const quitado = d.snippets.quita(limpia(cuerpo.disparador));
    d.guardaSnippets();
    return { quitado };
  }
  if (orden === 'historial-corrige') {
    const r = await d.historial.corrige(limpia(cuerpo.id), String(cuerpo.texto ?? '').slice(0, 5000));
    return { corregida: Boolean(r.entrada), candidatos: r.candidatos };
  }
  throw new Error('orden de datos desconocida');
}

/** Un dictado tal como lo ve la pagina: `latenciaMs` siempre presente (null si no se midio). */
const aDictado = (e) => ({ id: e.id, fecha: e.fecha, texto: e.texto, ...(e.textoCrudo ? { textoCrudo: e.textoCrudo } : {}), motor: e.motor, duracionMs: e.duracionMs, latenciaMs: e.latenciaMs ?? null });

/** Todo el historial, filtrado y ordenado en el servidor (el JSONL se lee entero: ver la cabecera), y una ventana. */
async function historialLee() {
  const d = await cargaDatosPersonales();
  const cuerpo = entradaJson();
  const todas = (await d.historial.recientes(Number.MAX_SAFE_INTEGER)).map(aDictado);
  const filtros = cuerpo.filtros ?? {};
  const coinciden = filtra(todas, filtros);
  const desde = Math.max(0, Number(cuerpo.desde ?? 0) || 0);
  const cuantos = Math.min(500, Math.max(1, Number(cuerpo.cuantos ?? 100) || 100));
  return { entradas: coinciden.slice(desde, desde + cuantos), coinciden: coinciden.length, total: todas.length, huella: huellaDe(todas), motores: [...new Set(todas.map((e) => e.motor))].sort() };
}

/** Todas las que coinciden (sin ventana), para exportar. */
async function historialTodo() {
  const d = await cargaDatosPersonales();
  const cuerpo = entradaJson();
  const todas = (await d.historial.recientes(Number.MAX_SAFE_INTEGER)).map(aDictado);
  return { entradas: filtra(todas, cuerpo.filtros ?? {}) };
}

async function historialBorraUno() {
  const d = await cargaDatosPersonales();
  const id = limpia(entradaJson().id);
  const borrados = await d.historial.borraUno(id);
  return { borrados, quedan: await d.historial.cuenta() };
}

async function historialBorraRango() {
  const d = await cargaDatosPersonales();
  const antesDe = limpia(entradaJson().antesDe);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(antesDe)) throw new Error('antesDe debe ser YYYY-MM-DD');
  // «Anterior al dia D» = todo lo que empezo antes de la medianoche local de D.
  const [anio, mes, dia] = antesDe.split('-').map(Number);
  const corte = new Date(anio, mes - 1, dia, 0, 0, 0).toISOString();
  const borrados = await d.historial.borra({ antesDe: corte });
  return { borrados, quedan: await d.historial.cuenta() };
}

/** Las trayectorias de forma de `dictar` (sin contenido): solo lo que la pagina de estadisticas necesita. */
function historialTrayectorias() {
  const carpeta = join(raiz, 'corpus');
  if (!existsSync(carpeta)) return { trayectorias: [] };
  const trayectorias = [];
  for (const nombre of readdirSync(carpeta).filter((n) => n.startsWith('salida-dictar-')).sort()) {
    const ruta = join(carpeta, nombre, 'trayectoria.json');
    if (!existsSync(ruta)) continue;
    try {
      const t = JSON.parse(readFileSync(ruta, 'utf8'));
      const h = t.acciones?.herramientas ?? {};
      const m = t.resultado?.metricas ?? {};
      trayectorias.push({ inicio: t.cuando?.inicio ?? '', fin: t.cuando?.fin ?? '', turnos: h.turnos ?? 0, sinVoz: h.sinVoz ?? 0, respaldo: h.respaldo ?? 0, muertesCaptura: m.muertesCaptura ?? 0, latenciaP50Ms: m.latenciaP50Ms ?? null, picoDbMax: m.picoDbMax ?? null, picoDbMin: m.picoDbMin ?? null });
    } catch {
      // una trayectoria rota no tumba la pagina
    }
  }
  return { trayectorias };
}

/**
 * Los ajustes de la persona, por las MISMAS piezas del CLI (`leeConfiguracion` + `cli-ajustes`):
 * un `pon` desde la pagina es identico a `dictado ajustes pon`. El entorno con el que corre este
 * proceso (DICTADO_DATOS, DICTADO_MODELOS…) es el que la app le pasa, asi que resuelve igual.
 */
async function ajustes(orden) {
  const { leeConfiguracion } = await import(pathToFileURL(join(raiz, 'dist', 'node', 'cli-config.js')).href);
  const { estadoAjustes, ponAjuste, quitaAjuste, restableceAjustes } = await import(pathToFileURL(join(raiz, 'dist', 'node', 'cli-ajustes.js')).href);
  const config = leeConfiguracion({});
  if (orden === 'ajustes-lee') return estadoAjustes(config);
  if (orden === 'ajustes-restablece') return { ruta: restableceAjustes(config), estado: estadoAjustes(config) };
  const cuerpo = entradaJson();
  const clave = limpia(cuerpo.clave);
  if (orden === 'ajustes-quita') {
    const r = quitaAjuste(config, clave);
    return r.ok ? { ok: true, estado: estadoAjustes(config) } : { ok: false, error: r.error };
  }
  const r = ponAjuste(config, clave, cuerpo.valor);
  return r.ok ? { ok: true, valor: r.valor, estado: estadoAjustes(config) } : { ok: false, error: r.error };
}

const orden = process.argv[2];
if (orden === 'datos-lee') process.stdout.write(JSON.stringify(await datosLee()));
else if (orden === 'historial-lee') process.stdout.write(JSON.stringify(await historialLee()));
else if (orden === 'historial-todo') process.stdout.write(JSON.stringify(await historialTodo()));
else if (orden === 'historial-borra-uno') process.stdout.write(JSON.stringify(await historialBorraUno()));
else if (orden === 'historial-borra-rango') process.stdout.write(JSON.stringify(await historialBorraRango()));
else if (orden === 'historial-trayectorias') process.stdout.write(JSON.stringify(historialTrayectorias()));
else if (['diccionario-agrega', 'diccionario-quita', 'snippets-agrega', 'snippets-quita', 'historial-corrige'].includes(orden)) process.stdout.write(JSON.stringify(await ordenDatos(orden)));
else if (['ajustes-lee', 'ajustes-pon', 'ajustes-quita', 'ajustes-restablece'].includes(orden)) process.stdout.write(JSON.stringify(await ajustes(orden)));
else if (orden === 'piezas') process.stdout.write(JSON.stringify({ piezas: piezas(), voces: voces() }));
else if (orden === 'veredictos-lee') process.stdout.write(JSON.stringify(leeVeredictos()));
else if (orden === 'veredictos-agrega') process.stdout.write(JSON.stringify(agregaVeredicto(JSON.parse(readFileSync(0, 'utf8')))));
else {
  console.error('uso: maquina.mjs piezas | veredictos-lee | veredictos-agrega');
  process.exit(2);
}
