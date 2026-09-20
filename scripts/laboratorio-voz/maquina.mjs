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
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

const orden = process.argv[2];
if (orden === 'piezas') process.stdout.write(JSON.stringify({ piezas: piezas(), voces: voces() }));
else if (orden === 'veredictos-lee') process.stdout.write(JSON.stringify(leeVeredictos()));
else if (orden === 'veredictos-agrega') process.stdout.write(JSON.stringify(agregaVeredicto(JSON.parse(readFileSync(0, 'utf8')))));
else {
  console.error('uso: maquina.mjs piezas | veredictos-lee | veredictos-agrega');
  process.exit(2);
}
