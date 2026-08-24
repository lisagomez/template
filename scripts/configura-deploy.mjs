#!/usr/bin/env node
/**
 * Configurador del deploy self-hosted. **Se corre EN EL SERVIDOR**, antes del primer
 * `npm run deploy`.
 *
 * Hace dos cosas que nadie deberia hacer a mano:
 *
 *   1. **Dimensiona el stack contra la maquina real.** No hay tabla de planes de Hetzner
 *      aqui a proposito: los nombres y las specs cambian, y una tabla copiada envejece sin
 *      que nadie lo note — este repo ya se llevo esa leccion con otra cosa. `nproc` y
 *      `/proc/meminfo` no envejecen. Si mañana mueves la app a un servidor mas grande, se
 *      vuelve a correr y ya.
 *   2. **Valida `.env.production` antes de que falle el deploy.** Variables ausentes, con
 *      placeholder sin tocar, o incoherentes entre si (el caso clasico: `NEXT_PUBLIC_SITE_URL`
 *      apuntando a un dominio distinto de `DOMAIN`, que rompe los redirects de OAuth **sin
 *      dar error** — el build pasa, el TLS pasa, y el login no vuelve).
 *
 * NUNCA imprime el valor de un secreto: presencia, largo y a lo sumo 4 caracteres.
 *
 * Uso:
 *   node scripts/configura-deploy.mjs              # diagnostica y propone
 *   node scripts/configura-deploy.mjs --escribir   # ademas escribe el bloque de tamaño
 *
 * Exit 0 = listo para desplegar · 1 = hay que arreglar algo · 2 = no pude medir.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ruta = (p) => join(raiz, p);
const ENV = process.env.ENV_PRODUCCION ?? '.env.production';
const ESCRIBIR = process.argv.includes('--escribir');

const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;

const problemas = [];
const avisos = [];

// --- 1. La maquina real -----------------------------------------------------
let vcpu;
let ramMB;
let swapMB;
try {
  vcpu = Number(execFileSync('nproc', { encoding: 'utf8' }).trim());
  const meminfo = readFileSync('/proc/meminfo', 'utf8');
  const kb = (clave) => Number((meminfo.match(new RegExp(`^${clave}:\\s+(\\d+) kB`, 'm')) ?? [])[1] ?? 0);
  ramMB = Math.round(kb('MemTotal') / 1024);
  swapMB = Math.round(kb('SwapTotal') / 1024);
  if (!vcpu || !ramMB) throw new Error('nproc o /proc/meminfo no dieron numeros');
} catch (e) {
  console.error(rojo(`✗ NO PUDE MEDIR LA MAQUINA: ${e.message}`));
  console.error('  Exit 2: sin saber cuanta RAM hay, cualquier limite que escribiera seria inventado.');
  console.error('  Esto se corre EN EL SERVIDOR (Linux). En macOS/Windows no aplica.');
  process.exit(2);
}

// --- 2. Reparto ------------------------------------------------------------
// Caddy y el SO no son opcionales: si la app se queda con toda la RAM, el OOM killer
// elige por ti y suele elegir mal. Se reserva antes de repartir.
const RESERVA_SO_MB = 768;
const CADDY_MEM_MB = 512;
// En un servidor de 1 vCPU, medio nucleo para Caddy es la mitad de la maquina; en uno
// grande sobra. Tampoco esto puede ser una constante.
const caddyCpus = 0.5;
const appMemMB = Math.max(1024, ramMB - RESERVA_SO_MB - CADDY_MEM_MB);
// El pico de memoria es el BUILD, no el runtime. 75% del limite deja aire al resto del
// contenedor; el tope de 6 GB evita que un servidor grande pida un heap absurdo.
const heapMB = Math.min(Math.floor(appMemMB * 0.75), 6144);
const appCpus = Math.max(1, Math.round((vcpu - 0.5) * 10) / 10);

console.log(`Servidor: ${vcpu} vCPU · ${ramMB} MB RAM · ${swapMB} MB swap`);
console.log(gris(`Reparto: SO ${RESERVA_SO_MB} MB · Caddy ${CADDY_MEM_MB} MB · app ${appMemMB} MB\n`));

if (ramMB < 2048) {
  problemas.push(`Con ${ramMB} MB de RAM el build de Next.js no cabe. Menos de 2 GB no es un servidor de app.`);
} else if (ramMB < 4096) {
  avisos.push(`${ramMB} MB es justo: el build es el pico. Si falla con OOM, construye la imagen fuera y sube solo el resultado.`);
}
if (swapMB < 1024 && ramMB <= 8192) {
  problemas.push(`Swap = ${swapMB} MB. En 8 GB o menos es obligatorio (ver §3 del runbook): sin swap, el build muere por OOM sin avisar.`);
}

// --- 3. `.env.production` ---------------------------------------------------
const REQUERIDAS = [
  ['DOMAIN', /^[a-z0-9.-]+\.[a-z]{2,}$/i, 'un dominio real, sin http:// ni barra final'],
  ['TLS_EMAIL', /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i, 'el correo con el que Let\'s Encrypt te avisa'],
  ['NEXT_PUBLIC_SUPABASE_URL', /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i, 'la URL del proyecto Supabase'],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', /^.{40,}$/, 'la anon key completa'],
  ['NEXT_PUBLIC_SITE_URL', /^https:\/\/[a-z0-9.-]+$/i, 'https:// + tu dominio'],
];
const PLACEHOLDER = /(tuapp\.com|tu@email|your_|tu[-_]|xxxxx|eyJhbGci\.\.\.|\.\.\.$|cambiame|changeme)/i;

if (!existsSync(ruta(ENV))) {
  problemas.push(`No existe ${ENV}. Copialo de .env.production.example y rellenalo (no se commitea: esta en .gitignore).`);
} else {
  const texto = readFileSync(ruta(ENV), 'utf8');
  const valores = new Map();
  for (const linea of texto.split('\n')) {
    const m = linea.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) valores.set(m[1], m[2].trim().replace(/^["']|["']$/g, ''));
  }
  for (const [clave, forma, que] of REQUERIDAS) {
    const v = valores.get(clave);
    if (v === undefined || v === '') problemas.push(`${clave} falta o esta vacia — ${que}.`);
    else if (PLACEHOLDER.test(v)) problemas.push(`${clave} sigue con el placeholder del ejemplo — ${que}.`);
    else if (!forma.test(v)) problemas.push(`${clave} no tiene forma de ${que} (valor de ${v.length} car., empieza por "${v.slice(0, 4)}").`);
  }
  // El fallo silencioso: TLS y build pasan, y el login no vuelve nunca.
  const dominio = valores.get('DOMAIN');
  const site = valores.get('NEXT_PUBLIC_SITE_URL');
  if (dominio && site && !site.replace(/^https?:\/\//, '').replace(/\/$/, '').endsWith(dominio)) {
    problemas.push(`NEXT_PUBLIC_SITE_URL no apunta a DOMAIN (${dominio}). Los redirects de OAuth se rompen SIN dar error: ` +
      'el build pasa, el certificado pasa, y el usuario no vuelve del login.');
  }
  // Secretos: solo presencia, nunca valor.
  for (const clave of ['SUPABASE_SERVICE_ROLE_KEY', 'OPENROUTER_API_KEY']) {
    const v = valores.get(clave);
    console.log(`${clave}: ${v ? verde(`presente (${v.length} car.)`) : gris('ausente')}`);
  }
  if (valores.get('SUPABASE_SERVICE_ROLE_KEY')?.startsWith('NEXT_PUBLIC')) {
    problemas.push('SUPABASE_SERVICE_ROLE_KEY no lleva NUNCA prefijo NEXT_PUBLIC_: se inlinearia en el bundle del navegador (C7).');
  }
}

// --- 4. El bloque de tamaño -------------------------------------------------
const bloque = [
  '',
  '# --- Tamaño del stack (generado por scripts/configura-deploy.mjs) ---',
  `# Medido en este servidor: ${vcpu} vCPU, ${ramMB} MB RAM, ${swapMB} MB swap.`,
  '# Se regenera al cambiar de maquina: no lo copies de otro servidor.',
  `APP_NAME=${process.env.APP_NAME ?? 'saas-factory-app'}`,
  `APP_CPUS=${appCpus}`,
  `APP_MEM=${appMemMB}M`,
  `CADDY_MEM=${CADDY_MEM_MB}M`,
  `CADDY_CPUS=${vcpu <= 2 ? 0.25 : caddyCpus}`,
  `NODE_HEAP_MB=${heapMB}`,
  '',
].join('\n');

console.log(`\n${gris('Bloque de tamaño derivado:')}\n${bloque.trim()}\n`);

if (ESCRIBIR && existsSync(ruta(ENV))) {
  const actual = readFileSync(ruta(ENV), 'utf8');
  const limpio = actual.replace(/\n?# --- Tamaño del stack[\s\S]*?NODE_HEAP_MB=\d+\n/, '\n');
  writeFileSync(ruta(ENV), `${limpio.replace(/\n+$/, '')}\n${bloque}`);
  console.log(verde(`✓ Bloque escrito en ${ENV} (reemplaza el anterior si lo habia).`));
} else if (ESCRIBIR) {
  console.log(rojo(`✗ No puedo escribir: ${ENV} no existe.`));
}

// --- 5. Veredicto -----------------------------------------------------------
for (const a of avisos) console.log(`${gris('aviso:')} ${a}`);
if (problemas.length === 0) {
  console.log(verde('\n✓ Listo para desplegar. Siguiente: npm run deploy'));
  if (!ESCRIBIR) console.log(gris('  (con --escribir se guarda el bloque de tamaño en el .env)'));
  process.exit(0);
}
console.log(rojo(`\n${problemas.length} cosa(s) que arreglar antes de desplegar:`));
for (const p of problemas) console.log(`  · ${p}`);
process.exit(1);
