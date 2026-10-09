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
 *      vuelve a correr y ya. **La GPU se mide como un recurso mas del VPS** (spec 010):
 *      `nvidia-smi` si existe, y si el runtime de contenedores la expone. Sin GPU no es un
 *      error: es «ninguna», y el perfil `ocr-gpu` no se levanta.
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
import { readFileSync, writeFileSync, existsSync, mkdirSync, statfsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { revisaDespacho, RESERVA_SUPABASE_MB } from './despacho/reglas.mjs';
import { revisaPerfil } from './despliegue/perfil.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ruta = (p) => resolve(raiz, p);
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

// --- 1c. `.env.production`, leido una vez ------------------------------------
// Antes del reparto: con DESPLIEGUE=despacho (spec 015) el Supabase vive en esta misma maquina, y lo
// que se le reserva ya no lo tiene la app.
const valores = new Map();
if (existsSync(ruta(ENV))) {
  for (const linea of readFileSync(ruta(ENV), 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) valores.set(m[1], m[2].trim().replace(/^["']|["']$/g, ''));
  }
}
const DESPACHO = valores.get('DESPLIEGUE') === 'despacho';

// --- 2. Reparto ------------------------------------------------------------
// Caddy y el SO no son opcionales: si la app se queda con toda la RAM, el OOM killer
// elige por ti y suele elegir mal. Se reserva antes de repartir.
const RESERVA_SO_MB = 768;
const CADDY_MEM_MB = 512;
// En un servidor de 1 vCPU, medio nucleo para Caddy es la mitad de la maquina; en uno
// grande sobra. Tampoco esto puede ser una constante.
const caddyCpus = 0.5;
const appMemMB = Math.max(1024, ramMB - RESERVA_SO_MB - CADDY_MEM_MB - (DESPACHO ? RESERVA_SUPABASE_MB : 0));
// El pico de memoria es el BUILD, no el runtime. 75% del limite deja aire al resto del
// contenedor; el tope de 6 GB evita que un servidor grande pida un heap absurdo.
const heapMB = Math.min(Math.floor(appMemMB * 0.75), 6144);
const appCpus = Math.max(1, Math.round((vcpu - 0.5) * 10) / 10);

// --- 1b. La GPU, como un recurso mas ---------------------------------------
// Se mide, no se supone. Tres cosas distintas y se dicen por separado: hay driver, hay
// tarjeta (nombre y memoria), y el runtime de Docker la expone a los contenedores. Con
// las tres, `ocr-gpu` puede arrancar; con menos, se declara cual falta.
function mideGpu() {
  const gpu = { presente: false, nombre: null, vramMB: null, driver: null, runtimeDocker: false, motivo: '' };
  if (!existsSync('/proc/driver/nvidia/version')) { gpu.motivo = 'sin driver NVIDIA cargado'; return gpu; }
  gpu.driver = readFileSync('/proc/driver/nvidia/version', 'utf8').split('\n')[0].trim();
  try {
    const salida = execFileSync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { encoding: 'utf8' }).trim().split('\n')[0];
    const [nombre, vram] = salida.split(',').map((t) => t.trim());
    gpu.presente = true; gpu.nombre = nombre; gpu.vramMB = Number(vram) || null;
  } catch { gpu.motivo = 'hay driver pero nvidia-smi no responde'; return gpu; }
  try {
    const runtimes = execFileSync('docker', ['info', '--format', '{{json .Runtimes}}'], { encoding: 'utf8' });
    gpu.runtimeDocker = runtimes.includes('nvidia');
    if (!gpu.runtimeDocker) gpu.motivo = 'la GPU existe pero Docker no la expone: instala el NVIDIA Container Toolkit';
  } catch { gpu.motivo = 'no pude preguntar a Docker por sus runtimes'; }
  return gpu;
}
const gpu = mideGpu();

console.log(`Servidor: ${vcpu} vCPU · ${ramMB} MB RAM · ${swapMB} MB swap`);
console.log(gpu.presente
  ? `GPU: ${gpu.nombre} · ${gpu.vramMB} MB · ${gpu.runtimeDocker ? verde('expuesta a Docker') : rojo(gpu.motivo)}`
  : gris(`GPU: ninguna (${gpu.motivo}). El perfil ocr-gpu no se levanta; la cola de OCR va en CPU.`));
if (DESPACHO) console.log('Modo despacho (spec 015): Supabase autohospedado en esta máquina, ningún documento sale de ella.');
console.log(gris(`Reparto: SO ${RESERVA_SO_MB} MB · Caddy ${CADDY_MEM_MB} MB${DESPACHO ? ` · Supabase ${RESERVA_SUPABASE_MB} MB` : ''} · app ${appMemMB} MB\n`));

if (ramMB < 2048) {
  problemas.push(`Con ${ramMB} MB de RAM el build de Next.js no cabe. Menos de 2 GB no es un servidor de app.`);
} else if (ramMB < 4096) {
  avisos.push(`${ramMB} MB es justo: el build es el pico. Si falla con OOM, construye la imagen fuera y sube solo el resultado.`);
}
if (swapMB < 1024 && ramMB <= 8192) {
  problemas.push(`Swap = ${swapMB} MB. En 8 GB o menos es obligatorio (ver §3 del runbook): sin swap, el build muere por OOM sin avisar.`);
}

// --- 3. `.env.production` ---------------------------------------------------
/** El `role` de un JWT de Supabase, o null si el valor no es un JWT legible. */
function rolDelJwt(valor) {
  const partes = valor.split('.');
  if (partes.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8')).role ?? null;
  } catch {
    return null;
  }
}

/** Una NEXT_PUBLIC_* que es secreta por su nombre o por lo que lleva dentro (JWT service_role o sb_secret_). */
function secretoPublico(clave, valor) {
  if (!clave.startsWith('NEXT_PUBLIC_')) return false;
  return /SERVICE_ROLE|SECRET|PRIVATE/.test(clave) || valor.startsWith('sb_secret_') || rolDelJwt(valor) === 'service_role';
}

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
  // En el despacho la URL de Supabase NO es la de un proyecto gestionado: la revisa revisaDespacho.
  const requeridas = DESPACHO ? REQUERIDAS.filter(([clave]) => clave !== 'NEXT_PUBLIC_SUPABASE_URL') : REQUERIDAS;
  for (const [clave, forma, que] of requeridas) {
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
  // El extractor: Mistral solo con decision C4 escrita; ocr-gpu solo con modelo pineado y GPU expuesta.
  if (!DESPACHO && valores.get('OCR_RESPALDO') === 'mistral') {
    const decision = valores.get('OCR_DECISION_C4_ARCHIVO');
    if (!decision || !existsSync(decision)) problemas.push('OCR_RESPALDO=mistral manda el documento a un tercero: exige OCR_DECISION_C4_ARCHIVO apuntando a la decision C4 firmada. Sin ella, el servicio lo deja apagado (y con datos de terceros ninguna firma lo autoriza).');
  }
  const modeloGpu = valores.get('OCR_GPU_MODELO');
  if (modeloGpu && /(^|[-:@/])(latest|stable|current|default|head)$/i.test(modeloGpu)) problemas.push(`OCR_GPU_MODELO="${modeloGpu}" es un alias autoactualizable: el modelo va pineado (C1).`);
  if (modeloGpu && !gpu.runtimeDocker) avisos.push(`OCR_GPU_MODELO esta puesto pero esta maquina no expone GPU a Docker (${gpu.motivo}): no levantes el perfil ocr-gpu aqui.`);
  // El puente A2A del extractor: en produccion, sin clave queda APAGADO (503) y Caddy no lo deja entrar
  // desde fuera. Una clave corta es peor que ninguna: abre el puente con algo adivinable. En el despacho
  // no aplica: su compose no le pasa la clave a la app (ni corre puente-hermes), asi que el puente queda
  // apagado igual, y una clave suya no deberia frenar el deploy.
  if (!DESPACHO) {
    const claveA2a = valores.get('A2A_API_KEY') ?? '';
    if (claveA2a === '') avisos.push('A2A_API_KEY vacia: el puente A2A del extractor queda apagado (503). Solo hace falta si corre el perfil hermes.');
    else if (claveA2a.length < 32) problemas.push(`A2A_API_KEY tiene ${claveA2a.length} caracteres: con menos de 32 se adivina. Genera una con \`openssl rand -hex 32\`.`);
  }
  // Soporte SAP: el runtime de LABORATORIO (estado en memoria, identidades elegibles) no se despliega.
  if (valores.get('SOPORTE_SAP_LABORATORIO') === '1') {
    problemas.push('SOPORTE_SAP_LABORATORIO=1 enciende el laboratorio de Soporte SAP: identidades de laboratorio que cualquiera elige y ' +
      'estado sintético en memoria. No va a producción: quítala de .env.production (el producto real usa auth.uid() y la RLS del esquema).');
  }
  // Soporte SAP, perfil `semantica`: con base declarada, el usuario del job y su contraseña (solo presencia).
  if (valores.get('SS_PG_HOST') && (!valores.get('SS_PG_USER') || !valores.get('SS_PG_PASSWORD'))) {
    problemas.push('SS_PG_HOST está puesto pero falta SS_PG_USER o SS_PG_PASSWORD: el job de la capa semántica entra con un usuario que solo es miembro de soporte_sap_metricas.');
  }
  if (DESPACHO) {
    const despacho = revisaDespacho(valores, { ramMB });
    problemas.push(...despacho.problemas);
    avisos.push(...despacho.avisos);
  }
  // Secretos: solo presencia, nunca valor.
  const secretos = ['SUPABASE_SERVICE_ROLE_KEY', 'OPENROUTER_API_KEY', 'A2A_API_KEY', 'MISTRAL_API_KEY', 'SS_PG_PASSWORD'];
  if (DESPACHO) secretos.push('POSTGRES_PASSWORD', 'JWT_SECRET', 'SERVICE_ROLE_KEY');
  for (const clave of secretos) {
    const v = valores.get(clave);
    console.log(`${clave}: ${v ? verde(`presente (${v.length} car.)`) : gris('ausente')}`);
  }
  // C7: una llave que se salta RLS con prefijo NEXT_PUBLIC_ viaja en el bundle del navegador. Se mira
  // el NOMBRE y el VALOR: el chequeo anterior miraba si el valor de SUPABASE_SERVICE_ROLE_KEY empezaba
  // por "NEXT_PUBLIC", cosa que un JWT nunca hace, y dejo pasar una NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
  // real (2026-09-29). Nunca se imprime el valor.
  for (const [clave, v] of valores) {
    if (secretoPublico(clave, v)) {
      problemas.push(`${clave} lleva prefijo NEXT_PUBLIC_ y es una llave secreta: se inlinearia en el bundle del ` +
        'navegador y se salta RLS (C7). Quitale el prefijo (SUPABASE_SERVICE_ROLE_KEY) o borrala si la app no la usa.');
    }
  }
}

// --- 3b. El perfil de despliegue del producto (PRP-010, fase 3) ------------
// El producto declara REQUISITOS (`productos/<slug>.json`, bloque `despliegue`); aquí se mide la instalación contra
// ellos: el tamaño contratado, la región frente a su decisión, el destino de respaldo y los secretos del producto.
const mideDisco = () => { try { const f = statfsSync('/'); return Math.floor((f.blocks * f.bsize) / 1e9); } catch { return null; } };
let medicionDelPerfil = null;
const producto = valores.get('PRODUCTO');
if (!producto) {
  avisos.push('sin PRODUCTO en .env.production: no se mide contra el perfil de despliegue de un producto (productos/<slug>.json)');
} else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(producto) || !existsSync(ruta(`productos/${producto}.json`))) {
  problemas.push(`PRODUCTO=${producto}: no existe productos/${producto}.json`);
} else {
  const manifiesto = JSON.parse(readFileSync(ruta(`productos/${producto}.json`), 'utf8'));
  const perfil = revisaPerfil(manifiesto, valores, { vcpu, ramMB, discoGb: mideDisco() }, new Date().toISOString());
  problemas.push(...perfil.problemas);
  avisos.push(...perfil.avisos);
  medicionDelPerfil = perfil.medicion;
  const m = perfil.medicion;
  if (m) console.log(`Perfil de ${producto}: modo ${m.modo} · tamaño ${m.tamano ?? '—'} (${m.cabe === null ? 'sin comparar' : m.cabe ? 'cabe' : 'NO cabe'}) · región: ${m.region_estado} · respaldo: ${m.respaldo}`);
  // Los secretos del producto: solo presencia y largo, nunca el valor.
  for (const clave of manifiesto.despliegue?.secretos ?? []) {
    const v = valores.get(clave);
    console.log(`${clave}: ${v ? verde(`presente (${v.length} car.)`) : gris('ausente')}`);
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
  `# GPU medida: ${gpu.presente ? `${gpu.nombre}, ${gpu.vramMB} MB, ${gpu.runtimeDocker ? 'expuesta a Docker' : gpu.motivo}` : `ninguna (${gpu.motivo})`}`,
  `OCR_GPU=${gpu.presente && gpu.runtimeDocker ? 'presente' : 'ninguna'}`,
  `OCR_GPU_VRAM_MB=${gpu.vramMB ?? 0}`,
  `OCR_CPUS=${Math.max(1, Math.min(4, vcpu - 1))}`,
  `OCR_MEM=${Math.max(1024, Math.min(4096, Math.floor(appMemMB / 2)))}M`,
  `OCR_EN_VUELO=${Math.max(1, Math.min(4, vcpu - 1))}`,
  '',
].join('\n');

console.log(`\n${gris('Bloque de tamaño derivado:')}\n${bloque.trim()}\n`);

if (ESCRIBIR && existsSync(ruta(ENV))) {
  const actual = readFileSync(ruta(ENV), 'utf8');
  const limpio = actual.replace(/\n?# --- Tamaño del stack[\s\S]*?OCR_EN_VUELO=\d+\n/, '\n').replace(/\n?# --- Tamaño del stack[\s\S]*?NODE_HEAP_MB=\d+\n/, '\n');
  writeFileSync(ruta(ENV), `${limpio.replace(/\n+$/, '')}\n${bloque}`);
  console.log(verde(`✓ Bloque escrito en ${ENV} (reemplaza el anterior si lo habia).`));
} else if (ESCRIBIR) {
  console.log(rojo(`✗ No puedo escribir: ${ENV} no existe.`));
}
// La medición del perfil, sin un solo secreto: la lee la ficha de servidor (PRP-010, fase 3). No entra a git ni a la
// imagen (`.gitignore`, `.dockerignore`).
if (ESCRIBIR && medicionDelPerfil) {
  mkdirSync(ruta('.despliegue'), { recursive: true });
  writeFileSync(ruta('.despliegue/medicion.json'), `${JSON.stringify(medicionDelPerfil, null, 1)}\n`);
  console.log(verde('✓ Medición del perfil escrita en .despliegue/medicion.json (sin secretos).'));
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
