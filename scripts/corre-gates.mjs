#!/usr/bin/env node
/**
 * Runner del gate: corre el perfil que se le pida DERIVANDOLO de `.claude/gates.json`.
 *
 * Sustituye a las dos cadenas que se mantenian a mano en `package.json`: `validate` (21 `&&`
 * en 599 caracteres) y el subconjunto de `predeploy` (12 pasos copiados de la primera). Dos
 * listas de lo mismo, sin nada que las comparara: exactamente la divergencia que este repo ya
 * pago con `GEMINI.md` y con las cifras de los README.
 *
 * Tres estados por gate, heredados del motor del Supervisor de `hermes-os-a2a`:
 *   paso           exit 0
 *   fallo          exit != 0
 *   no_ejecutable  no se pudo correr (binario ausente, timeout) → RECHAZO, jamas "asumido"
 *
 * Y la regla que da sentido a todo: un gate INACTIVO no se cuenta como uno que paso. Se
 * reporta aparte, con su motivo, en cada corrida. Si se mezclaran, el padron se leeria como
 * cobertura que no existe.
 *
 * Uso:  node scripts/corre-gates.mjs validate     (lo llama `npm run validate`)
 *       node scripts/corre-gates.mjs predeploy    (lo llama `npm run predeploy`)
 *       node scripts/corre-gates.mjs cdc          (lo que exige un CDC y no se paga siempre)
 *       node scripts/corre-gates.mjs <perfil> --sigue   (no para en el primer rojo)
 *       node scripts/corre-gates.mjs <perfil> --lista    (solo enumera, no corre nada)
 * Exit: 0 si todo lo activo del perfil paso; 1 en cuanto algo falla o no se puede correr.
 */
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargaManifiesto, gatesDelPerfil, inactivos, ManifiestoInvalido } from './lib/gates.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const ambar = (s) => `\x1b[33m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;

const argv = process.argv.slice(2);
const perfil = argv.find((a) => !a.startsWith('-'));
const sigue = argv.includes('--sigue');
const soloLista = argv.includes('--lista');

if (!perfil) {
  console.error('Uso: node scripts/corre-gates.mjs <perfil> [--sigue] [--lista]');
  process.exit(2);
}

let manifiesto;
try {
  manifiesto = cargaManifiesto(raiz);
} catch (e) {
  if (!(e instanceof ManifiestoInvalido)) throw e;
  // Fail-closed: un manifiesto invalido NO corre "los gates que si valen". No arranca.
  console.error(rojo(`Manifiesto de gates INVALIDO: ${e.message}`));
  console.error(gris('  El runner no arranca: es imposible por diseno correr un padron que no se sostiene.'));
  process.exit(1);
}

let gates;
try {
  gates = gatesDelPerfil(manifiesto, perfil);
} catch (e) {
  console.error(rojo(`${e.message}`));
  process.exit(2);
}

const cfg = manifiesto.perfiles[perfil];
const siempre = cfg.siempre ?? [];
const enSuOrden = [
  ...gates.filter((g) => siempre.includes(g.nombre)),
  ...gates.filter((g) => !siempre.includes(g.nombre)),
];

if (soloLista) {
  for (const g of enSuOrden) console.log(`${g.nombre}\t${g.comando}`);
  process.exit(0);
}

console.log(`\nGate \x1b[1m${perfil}\x1b[0m — ${cfg.descripcion}`);
console.log(gris(`  ${enSuOrden.length} gate(s) activos, derivados de .claude/gates.json\n`));

/** Corre un gate y devuelve su estado. La salida del comando se hereda: se ve en vivo. */
function corre(gate) {
  console.log(`\x1b[1m▸ ${gate.nombre}\x1b[0m ${gris(`$ ${gate.comando}`)}`);
  const r = spawnSync(gate.comando, {
    cwd: raiz,
    shell: true,
    stdio: 'inherit',
    timeout: gate.timeout_s * 1000,
  });
  if (r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM') {
    return { estado: 'no_ejecutable', evidencia: `timeout tras ${gate.timeout_s}s` };
  }
  if (r.error) return { estado: 'no_ejecutable', evidencia: `${r.error.code ?? r.error.name}: ${r.error.message}` };
  if (r.status === 0) return { estado: 'paso', evidencia: 'exit 0' };
  return { estado: 'fallo', evidencia: `exit ${r.status}` };
}

// El atajo del sello: `predeploy` no repite el gate sobre un arbol que YA paso entero.
// Los gates `siempre` corren ANTES del atajo: la visibilidad del repo puede cambiar sin
// que cambie el arbol, asi que el sello no puede hablar por ella.
const resultados = [];
let corta = false;

for (const gate of enSuOrden.filter((g) => siempre.includes(g.nombre))) {
  const r = corre(gate);
  resultados.push({ gate, ...r });
  if (r.estado !== 'paso' && !sigue) corta = true;
  if (corta) break;
}

if (!corta && cfg.atajo === 'sello') {
  const sello = spawnSync('node', ['scripts/sello-validate.mjs', '--verifica'], { cwd: raiz, stdio: 'inherit' });
  if (sello.status === 0) {
    console.log(verde(`\n✓ Gate ${perfil}: atajo por sello vigente, nada que repetir.`));
    process.exit(0);
  }
}

if (!corta) {
  for (const gate of enSuOrden.filter((g) => !siempre.includes(g.nombre))) {
    const r = corre(gate);
    resultados.push({ gate, ...r });
    if (r.estado !== 'paso' && !sigue) break;
  }
}

// --- Reporte: TRES poblaciones, contadas aparte -------------------------------
const pasaron = resultados.filter((r) => r.estado === 'paso');
const rojos = resultados.filter((r) => r.estado !== 'paso');
const apagados = inactivos(manifiesto);
const pendientes = enSuOrden.length - resultados.length;

console.log(`\n${'─'.repeat(72)}`);
for (const r of pasaron) console.log(`  ${verde('✓')} ${r.gate.nombre} ${gris(r.evidencia)}`);
for (const r of rojos) {
  console.log(`  ${rojo(r.estado === 'no_ejecutable' ? '✗ NO EJECUTABLE' : '✗')} ${r.gate.nombre} ${gris(r.evidencia)}`);
  console.log(gris(`      ↳ guarda: ${r.gate.guarda}`));
}
if (pendientes > 0) console.log(gris(`  · ${pendientes} gate(s) sin correr: se paro en el primer rojo (--sigue los corre todos)`));

console.log('');
console.log(`  ${verde(`pasaron: ${pasaron.length}`)}   ${ambar(`inactivos declarados: ${apagados.length}`)}   ${rojos.length ? rojo(`rojos: ${rojos.length}`) : `rojos: 0`}`);
if (apagados.length) {
  console.log(ambar(`\n  Los ${apagados.length} inactivos NO cuentan como pasados. Estan declarados con motivo:`));
  for (const g of apagados) console.log(gris(`    · ${g.nombre} — ${g.motivo.split('.')[0]}.`));
}

if (rojos.length > 0) {
  console.log(rojo(`\nGate ${perfil} EN ROJO: ${rojos.length} gate(s) no pasaron.`));
  process.exit(1);
}

if (cfg.cierre === 'sella') {
  console.log('');
  const s = spawnSync('node', ['scripts/sello-validate.mjs', '--sella'], { cwd: raiz, stdio: 'inherit' });
  if (s.status !== 0) {
    console.log(rojo('el sello no se pudo escribir'));
    process.exit(1);
  }
}

console.log(verde(`\nGate ${perfil} en VERDE: ${pasaron.length}/${pasaron.length} gates activos pasaron.`));
process.exit(0);
