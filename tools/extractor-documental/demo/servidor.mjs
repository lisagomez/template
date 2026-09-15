#!/usr/bin/env node
/**
 * Banco de pruebas de `@tu-scope/extractor-documental` en el navegador.
 *
 * Sirve el `dist/` RECIEN CONSTRUIDO, no una copia. Es la razon que da el de `tools/voz`, y vale
 * igual aqui: asi la pagina prueba **el mismo artefacto que se instala**, no una version paralela
 * que puede desviarse sin que nadie lo note.
 *
 * Mas simple que el de voz por una razon que dice algo del paquete: el nucleo tiene **cero
 * dependencias**, asi que el navegador importa el ESM directo. No hay `node_modules` que instalar,
 * ni pesos que bajar, ni paso de build en el medio.
 *
 * Y hace una cosa que el de voz no: **fabrica el corpus**. Cada correccion que hagas a mano se
 * guarda como una muestra etiquetada, y `npm run mide` la lee. §8 de INVESTIGACION-OCR-MISTRAL
 * llama a eso «el trabajo aburrido, y el unico que hace que el resto signifique algo»; esto lo
 * convierte en subproducto de probar la herramienta en vez de en un proyecto aparte.
 *
 * Uso:  npm run demo        (en tools/extractor-documental)
 * Luego: npm run mide       (cuando tengas muestras que medir)
 */
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..');
const corpus = join(aqui, 'corpus');

const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json',
};

/** Cada prefijo de URL apunta a una carpeta real. Nada se copia a la carpeta del demo. */
const RUTAS = [['/extractor/', join(raiz, 'dist')]];

/**
 * El servicio OCR (spec 010), para la seccion «por caso de uso» de la pagina.
 *
 * La pagina NO le habla directo: el servicio vive en la red interna del compose, no publica
 * CORS, y un navegador no puede mandarle un `POST` con cabeceras propias desde otro origen. Este
 * servidor reenvia, y SOLO a la URL configurada — no es un proxy abierto: la pagina no elige el
 * destino. Misma variable que usa `app` en el compose, para no inventar otra.
 */
const SERVICIO = (process.env.EXTRACTOR_SERVICIO_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const PROYECTO_DEL_SERVICIO = process.env.EXTRACTOR_PROYECTO ?? join(raiz, 'servicio', 'proyecto-ejemplo.json');
/** El tope del servicio por defecto (EXTRACTOR_BYTES_MAXIMOS): aqui se corta igual, antes de reenviar. */
const BYTES_MAXIMOS_SERVICIO = 20 * 1024 * 1024;

/** Los dos ficheros del corpus. Son exactamente los tipos que `calibracion.ts` ya consume. */
const DESTINOS = {
  '/api/corpus/campos': join(corpus, 'campos.jsonl'),
  '/api/corpus/similitud': join(corpus, 'similitud.jsonl'),
};

function comprueba() {
  // Se prueba el paquete CONSTRUIDO: es lo que acaba en el proyecto de destino.
  try {
    execFileSync('npm', ['run', 'build'], { cwd: raiz, stdio: 'ignore' });
  } catch {
    console.log(rojo('\nNo se pudo construir dist/. Corre `npm run build` a mano para ver el error.\n'));
    process.exit(1);
  }
  if (!existsSync(join(raiz, 'dist', 'index.js'))) {
    console.log(rojo('\ndist/index.js no existe tras el build. Algo va mal en tsconfig.\n'));
    process.exit(1);
  }
  mkdirSync(corpus, { recursive: true });
}

function cuentaLineas(archivo) {
  if (!existsSync(archivo)) return 0;
  return readFileSync(archivo, 'utf8').split('\n').filter((l) => l.trim().length > 0).length;
}

/**
 * Valida una muestra ANTES de escribirla.
 *
 * Un corpus con basura dentro es peor que un corpus vacio: `mide` promediaria sobre lo que no
 * debe y el numero saldria con aire de medicion. Aqui se rechaza y se dice, en vez de guardar y
 * que el problema aparezca tres pasos mas tarde.
 */
function valida(destino, muestra) {
  const texto = (v) => typeof v === 'string' && v.length > 0;
  if (destino.endsWith('campos.jsonl')) {
    if (!texto(muestra.clave)) return 'falta `clave`';
    if (typeof muestra.obtenido !== 'string') return '`obtenido` tiene que ser texto';
    if (!texto(muestra.referencia)) return 'falta `referencia`: sin la correccion a mano no hay nada que medir';
    const c = muestra.confianza;
    if (typeof c !== 'number' || !Number.isFinite(c) || c < 0 || c > 1) {
      return '`confianza` tiene que ser un numero entre 0 y 1 — y tiene que venir del motor, no inventada';
    }
    return null;
  }
  if (!texto(muestra.valor)) return 'falta `valor`';
  if (!texto(muestra.candidato)) return 'falta `candidato`';
  const s = muestra.similitud;
  if (typeof s !== 'number' || !Number.isFinite(s) || s < 0 || s > 1) return '`similitud` va entre 0 y 1';
  if (typeof muestra.esLaMisma !== 'boolean') return '`esLaMisma` tiene que ser true o false: es la etiqueta';
  return null;
}

function leeCuerpo(peticion) {
  return new Promise((resuelve, rechaza) => {
    const trozos = [];
    let bytes = 0;
    peticion.on('data', (t) => {
      bytes += t.length;
      // Tope: esto es un banco local, no un endpoint. Un cuerpo enorme aqui es un error, no un uso.
      if (bytes > 1_000_000) rechaza(new Error('cuerpo demasiado grande'));
      else trozos.push(t);
    });
    peticion.on('end', () => resuelve(Buffer.concat(trozos).toString('utf8')));
    peticion.on('error', rechaza);
  });
}

async function guardaMuestra(peticion, respuesta, destino) {
  let muestra;
  try {
    muestra = JSON.parse(await leeCuerpo(peticion));
  } catch (e) {
    respuesta.writeHead(400, { 'content-type': MIME['.json'] });
    return respuesta.end(JSON.stringify({ error: `cuerpo ilegible: ${e.message}` }));
  }
  const problema = valida(destino, muestra);
  if (problema !== null) {
    respuesta.writeHead(400, { 'content-type': MIME['.json'] });
    return respuesta.end(JSON.stringify({ error: problema }));
  }
  // Append-only: una correccion registrada no se reescribe. Si te corriges dos veces, quedan las
  // dos, y eso es informacion — cambiar de opinion sobre una etiqueta es un dato del corpus.
  appendFileSync(destino, `${JSON.stringify({ ...muestra, en: new Date().toISOString() })}\n`);
  respuesta.writeHead(200, { 'content-type': MIME['.json'] });
  respuesta.end(JSON.stringify({ guardadas: cuentaLineas(destino) }));
}

function estadoDelCorpus() {
  return {
    campos: cuentaLineas(DESTINOS['/api/corpus/campos']),
    similitud: cuentaLineas(DESTINOS['/api/corpus/similitud']),
  };
}

// ── El servicio OCR, por caso de uso ─────────────────────────────────────────

const json = (respuesta, codigo, cuerpo) => {
  respuesta.writeHead(codigo, { 'content-type': MIME['.json'] });
  respuesta.end(JSON.stringify(cuerpo));
};

/**
 * Lo que la pagina necesita para pintar una tarjeta por clase: las clases con su patron de
 * titulo (para que quien prueba sepa POR QUE un documento cae en una), los esquemas con sus
 * claves, y que identificadores llevan validador. Se lee del mismo JSON que monta el servicio.
 */
function proyectoDelServicio() {
  const p = JSON.parse(readFileSync(PROYECTO_DEL_SERVICIO, 'utf8'));
  return {
    servicio: SERVICIO,
    clases: (p.clases ?? []).map((c) => ({ clase: c.clase, titulo: c.titulo })),
    esquemas: (p.esquemas ?? []).map((e) => ({ clase: e.clase, claves: e.claves })),
    validadores: Object.keys(p.validadores ?? {}),
  };
}

async function saludDelServicio() {
  try {
    const r = await fetch(`${SERVICIO}/health`, { signal: AbortSignal.timeout(4000) });
    const cuerpo = await r.text();
    if (r.ok && cuerpo.trim() === '{"status":"ok"}') return { ok: true, servicio: SERVICIO };
    return { ok: false, servicio: SERVICIO, explicacion: `contesto ${r.status} en /health, pero no con {"status":"ok"}: hay algo escuchando que no es el servicio del extractor` };
  } catch (e) {
    const porTiempo = e?.name === 'TimeoutError';
    return {
      ok: false, servicio: SERVICIO,
      explicacion: porTiempo ? 'nadie contesto en 4 segundos' : 'no se pudo conectar: no hay nadie escuchando ahi',
    };
  }
}

function leeCuerpoBinario(peticion, maximo) {
  const declarado = Number(peticion.headers['content-length'] ?? 0);
  if (Number.isFinite(declarado) && declarado > maximo) return Promise.reject(new Error('demasiado grande'));
  return new Promise((resuelve, rechaza) => {
    const trozos = [];
    let bytes = 0;
    peticion.on('data', (t) => {
      bytes += t.length;
      if (bytes > maximo) { rechaza(new Error('demasiado grande')); peticion.destroy(); return; }
      trozos.push(t);
    });
    peticion.on('end', () => resuelve(Buffer.concat(trozos)));
    peticion.on('error', rechaza);
  });
}

/** Reenvia UN documento en crudo a `POST /extraer` del servicio, con sus dos cabeceras, tal cual. */
async function extraeConElServicio(peticion, respuesta) {
  let bytes;
  try {
    bytes = await leeCuerpoBinario(peticion, BYTES_MAXIMOS_SERVICIO);
  } catch (e) {
    return json(respuesta, e.message === 'demasiado grande' ? 413 : 400, { error: e.message === 'demasiado grande' ? 'el documento supera los 20 MB del servicio' : 'cuerpo ilegible' });
  }
  if (bytes.length === 0) return json(respuesta, 400, { error: 'el cuerpo esta vacio' });
  const cabeceras = { 'content-type': 'application/octet-stream' };
  for (const c of ['x-nombre', 'x-tipo-documento']) if (peticion.headers[c]) cabeceras[c] = String(peticion.headers[c]);
  try {
    // Sin tope corto: Tesseract sobre una pagina densa en CPU puede tardar decenas de segundos.
    const r = await fetch(`${SERVICIO}/extraer`, { method: 'POST', headers: cabeceras, body: bytes, signal: AbortSignal.timeout(300000) });
    const cuerpo = await r.text();
    respuesta.writeHead(r.status, { 'content-type': MIME['.json'] });
    return respuesta.end(cuerpo);
  } catch (e) {
    return json(respuesta, 502, { error: e?.name === 'TimeoutError' ? 'el servicio no contesto en 5 minutos' : 'no se pudo contactar con el servicio', servicio: SERVICIO });
  }
}

async function sirve(peticion, respuesta) {
  const url = new URL(peticion.url, 'http://localhost');
  const ruta = decodeURIComponent(url.pathname);

  if (ruta === '/' || ruta === '/index.html') {
    respuesta.writeHead(200, { 'content-type': MIME['.html'] });
    return respuesta.end(readFileSync(join(aqui, 'index.html')));
  }
  if (ruta === '/api/corpus' && peticion.method === 'GET') {
    respuesta.writeHead(200, { 'content-type': MIME['.json'] });
    return respuesta.end(JSON.stringify(estadoDelCorpus()));
  }
  if (DESTINOS[ruta] !== undefined && peticion.method === 'POST') {
    return guardaMuestra(peticion, respuesta, DESTINOS[ruta]);
  }
  if (ruta === '/api/servicio/proyecto' && peticion.method === 'GET') {
    try { return json(respuesta, 200, proyectoDelServicio()); } catch (e) { return json(respuesta, 500, { error: `no se pudo leer el proyecto del servicio: ${e.message}` }); }
  }
  if (ruta === '/api/servicio/salud' && peticion.method === 'GET') {
    return json(respuesta, 200, await saludDelServicio());
  }
  if (ruta === '/api/servicio/extraer' && peticion.method === 'POST') {
    return extraeConElServicio(peticion, respuesta);
  }

  for (const [prefijo, base] of RUTAS) {
    if (!ruta.startsWith(prefijo)) continue;
    // `normalize` + comprobacion de prefijo: sin esto, `..%2f..%2fetc/passwd` sale del arbol.
    const destino = normalize(join(base, ruta.slice(prefijo.length)));
    if (!destino.startsWith(base) || !existsSync(destino) || statSync(destino).isDirectory()) break;
    respuesta.writeHead(200, {
      'content-type': MIME[extname(destino)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    return respuesta.end(readFileSync(destino));
  }

  respuesta.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  respuesta.end(`no encontrado: ${ruta}`);
}

comprueba();
const puerto = Number(process.env.PUERTO ?? 4321);
// Solo 127.0.0.1, y a proposito: esto sirve documentos reales de un negocio y no tiene ni
// autenticacion ni control de acceso. Escuchar en 0.0.0.0 lo dejaria abierto a la red local.
createServer(sirve).listen(puerto, '127.0.0.1', () => {
  const { campos, similitud } = estadoDelCorpus();
  console.log(`\n${verde('▸')} banco de pruebas de @tu-scope/extractor-documental`);
  console.log(gris('  sirve dist/ recien construido — el mismo artefacto que se instala'));
  console.log(gris(`  corpus: ${campos} muestra(s) de campos · ${similitud} de similitud`));
  console.log(`\n  ${verde(`http://localhost:${puerto}`)}\n`);
  console.log(gris('  Sin clave de OCR funciona todo menos la extraccion real: capa 0, ingesta,'));
  console.log(gris('  revision, reconciliacion, modelo E-R y codigos. Ctrl+C para parar.\n'));
});
