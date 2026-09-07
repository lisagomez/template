#!/usr/bin/env node
/**
 * Banco de pruebas de `@tu-scope/voz` en el navegador.
 *
 * Sirve cuatro cosas y ninguna la copia: el `dist/` recien construido, el runtime de ONNX
 * del `node_modules` de esta carpeta, y los pesos y el audio que ya bajo `npm run mide`.
 * Asi la pagina prueba EL MISMO artefacto que se instala, no una copia que puede desviarse.
 *
 * Por que un servidor y no abrir el HTML a pelo: un `file://` no puede cargar modulos ESM ni
 * instanciar WebAssembly, y el AudioWorklet del microfono exige origen seguro. `localhost`
 * cuenta como seguro, `file://` no.
 *
 * Uso:  npm run demo        (en tools/voz)
 * Antes: npm run mide       (una vez, para tener los pesos y el audio)
 */
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..');
const banco = join(raiz, 'medicion', 'banco');

const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.wav': 'audio/wav',
  '.map': 'application/json',
};

/** Cada prefijo de URL apunta a una carpeta real. Nada se copia a la carpeta del demo. */
const RUTAS = [
  ['/voz/', join(raiz, 'dist')],
  ['/ort/', join(aqui, 'node_modules', 'onnxruntime-web', 'dist')],
  ['/modelos/', join(banco, 'modelos')],
  ['/audio/', join(banco, 'audio')],
];

function comprueba() {
  const faltan = [];
  if (!existsSync(join(aqui, 'node_modules', 'onnxruntime-web'))) {
    console.log(gris('  instalando onnxruntime-web (el peer opcional del navegador)'));
    execFileSync('npm', ['install', '--no-audit', '--no-fund', 'onnxruntime-web@1.29.0'], {
      cwd: aqui,
      stdio: 'inherit',
    });
  }
  // Se prueba el paquete CONSTRUIDO: es lo que acaba en el proyecto de destino.
  execFileSync('npm', ['run', 'build'], { cwd: raiz, stdio: 'ignore' });
  for (const nombre of ['silero_vad.onnx', 'embedding.onnx', 'segmentation-3.0.onnx']) {
    if (!existsSync(join(banco, 'modelos', nombre))) faltan.push(`modelos/${nombre}`);
  }
  if (!existsSync(join(banco, 'manifiesto.json'))) faltan.push('audio de LibriSpeech');
  if (faltan.length > 0) {
    console.log(rojo('\nFalta el material de prueba:'));
    for (const f of faltan) console.log(rojo(`  · ${f}`));
    console.log(`\nSe baja entero con:  ${verde('npm run mide')}   ${gris('(~35 MB de pesos + ~15 MB de audio)')}\n`);
    process.exit(1);
  }
}

/** El catalogo de audio con su VERDAD: el nombre del archivo lleva el hablante real. */
function catalogo() {
  const archivos = readdirSync(join(banco, 'audio')).filter((f) => f.endsWith('.wav')).sort();
  return archivos.map((archivo) => {
    const [hablante, toma] = archivo.replace('.wav', '').split('-');
    const bytes = statSync(join(banco, 'audio', archivo)).size;
    return { archivo, hablante, toma, segundos: +((bytes - 44) / 2 / 16000).toFixed(1) };
  });
}

function sirve(peticion, respuesta) {
  const url = new URL(peticion.url, 'http://localhost');
  const ruta = decodeURIComponent(url.pathname);

  if (ruta === '/' || ruta === '/index.html') {
    respuesta.writeHead(200, { 'content-type': MIME['.html'] });
    return respuesta.end(readFileSync(join(aqui, 'index.html')));
  }
  if (ruta === '/api/catalogo') {
    respuesta.writeHead(200, { 'content-type': MIME['.json'] });
    return respuesta.end(JSON.stringify(catalogo()));
  }

  for (const [prefijo, base] of RUTAS) {
    if (!ruta.startsWith(prefijo)) continue;
    // `normalize` + comprobacion de prefijo: sin esto, `..%2f..%2fetc/passwd` sale del arbol.
    const destino = normalize(join(base, ruta.slice(prefijo.length)));
    if (!destino.startsWith(base) || !existsSync(destino) || statSync(destino).isDirectory()) break;
    respuesta.writeHead(200, {
      'content-type': MIME[extname(destino)] ?? 'application/octet-stream',
      // Los .wasm y los .onnx pesan; en un banco local no interesa revalidarlos en cada recarga.
      'cache-control': extname(destino) === '.onnx' ? 'max-age=3600' : 'no-cache',
    });
    return respuesta.end(readFileSync(destino));
  }

  respuesta.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  respuesta.end(`no encontrado: ${ruta}`);
}

comprueba();
const puerto = Number(process.env.PUERTO ?? 4321);
createServer(sirve).listen(puerto, () => {
  const n = catalogo();
  const hablantes = new Set(n.map((a) => a.hablante)).size;
  console.log(`\n${verde('▸')} banco de pruebas de @tu-scope/voz`);
  console.log(gris(`  ${n.length} tomas de ${hablantes} hablantes · 3 modelos · dist/ recien construido`));
  console.log(`\n  ${verde(`http://localhost:${puerto}`)}\n`);
  console.log(gris('  El microfono necesita que lo abras en localhost (origen seguro). Ctrl+C para parar.\n'));
});
