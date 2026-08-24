#!/usr/bin/env node
/**
 * Vigilante de frescura de TODO lo pineado — la generalizacion del que vigila la imagen
 * del agente (`verifica-hermes.mjs`, capa A del SDD).
 *
 * La idea es la misma que resuelve Context7 en su terreno: un agente que trabaja contra
 * documentacion vieja alucina APIs que ya no existen, y eso se paga dos veces — en tokens
 * de reintento y en codigo que no compila. Aqui el equivalente es el pineo: da estabilidad
 * y **quita noticias**. Sin sensor, el rezago no se nota hasta que duele.
 *
 * Los tres principios, heredados del SDD y no negociables:
 *   1. **NUNCA actualiza nada.** Mover un pineo es un CDC (C1): diff, regresion, aprobacion
 *      y firma. Un vigilante que actualiza solo es el anti-patron que C1 existe para impedir.
 *   2. **Reporta el CAMBIO, no el estado.** Un informe que repite "14 paquetes por detras"
 *      cada semana deja de leerse a la tercera — eso es fatiga de aprobacion, y es el modo
 *      de falla mas probable de este mecanismo. El silencio es la señal de que nada cambio.
 *   3. **Falla ruidosa.** Sin red o con la API cambiada devuelve exit 2. "No pude mirar" no
 *      es "todo bien".
 *
 * Fuera de `validate` a proposito: usa red, y un gate que depende de la red se cae por
 * causas que no son el codigo.
 *
 * Exit 0 = sin novedades · 1 = hay deriva nueva · 2 = no pude verificar.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ruta = (p) => join(raiz, p);
const ESTADO = '.versiones-estado.json'; // runtime, no versionado
const REGISTRO = process.argv.find((a) => a.startsWith('--registro='))?.slice(11) ?? 'https://registry.npmjs.org';

const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const ambar = (s) => `\x1b[33m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;

class NoVerificable extends Error {}

const leeJson = (p) => (existsSync(ruta(p)) ? JSON.parse(readFileSync(ruta(p), 'utf8')) : null);
const partes = (v) => String(v).replace(/^[\^~>=<\s]*/, '').split('.').map((n) => parseInt(n, 10) || 0);

/** Distancia entre lo pineado y lo publicado. No opina sobre si hay que actualizar: eso
 *  lo decide una persona. Solo dice de que tamaño es el salto. */
function salto(pineado, ultimo) {
  const [aM, am, ap] = partes(pineado);
  const [bM, bm, bp] = partes(ultimo);
  if (bM > aM) return { nivel: 'MAYOR', detalle: `${aM}.x → ${bM}.x` };
  if (bM === aM && bm > am) return { nivel: 'menor', detalle: `${aM}.${am} → ${bM}.${bm}` };
  if (bM === aM && bm === am && bp > ap) return { nivel: 'parche', detalle: `${pineado} → ${ultimo}` };
  return null;
}

// --- Que se vigila ---------------------------------------------------------
const objetivos = [];
const pkg = leeJson('package.json');
if (!pkg) throw new NoVerificable('no encuentro package.json');
// Contra el LOCKFILE, no contra el suelo del rango. `^16.0.0` con 16.3.2 instalado no es
// deriva: es el rango haciendo su trabajo. Comparar contra el suelo inflaba el informe de
// 4 derivas reales a 14, y un informe que exagera se deja de leer igual que uno que se
// queda corto — que es justo el modo de falla que este vigilante existe para no tener.
const lock = leeJson('package-lock.json');
const resuelto = (nombre) => lock?.packages?.[`node_modules/${nombre}`]?.version ?? null;
for (const [nombre, rango] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
  const instalado = resuelto(nombre);
  objetivos.push({
    nombre,
    pineado: instalado ?? rango,
    origen: instalado ? 'package.json (lockfile)' : 'package.json (SIN lockfile: se compara el suelo del rango)',
  });
}
const mcp = leeJson('.claude/example.mcp.json');
for (const [servidor, cfg] of Object.entries(mcp?.mcpServers ?? {})) {
  for (const arg of cfg?.args ?? []) {
    // `@scope/paquete@1.2.3` o `paquete@1.2.3`
    const m = String(arg).match(/^(@?[a-z0-9._-]+(?:\/[a-z0-9._-]+)?)@(\d+\.\d+\.\d+)$/i);
    if (m) objetivos.push({ nombre: m[1], pineado: m[2], origen: `MCP ${servidor}` });
    else if (/^[a-z0-9.\-/]+:[\d.]+$/i.test(String(arg)) && String(arg).includes('/')) {
      objetivos.push({ nombre: String(arg), pineado: null, origen: `MCP ${servidor}`, imagen: true });
    }
  }
}

// --- Consulta al registro ---------------------------------------------------
async function ultimaVersion(nombre) {
  const url = `${REGISTRO}/${nombre.replace('/', '%2F')}/latest`;
  let r;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new NoVerificable(`sin respuesta del registro para ${nombre}: ${e.message}`);
  }
  if (r.status === 404) return null; // el paquete no existe con ese nombre
  if (!r.ok) throw new NoVerificable(`HTTP ${r.status} consultando ${nombre}`);
  try {
    return (await r.json()).version ?? null;
  } catch {
    throw new NoVerificable(`respuesta no-JSON para ${nombre}: el registro pudo cambiar`);
  }
}

const hoy = new Date().toISOString().slice(0, 10);
const estado = leeJson(ESTADO) ?? { avisados: {} };
const derivas = [];
const inexistentes = [];
const sinVerificar = [];

try {
  const npmObjetivos = objetivos.filter((o) => !o.imagen);
  const resultados = await Promise.all(
    npmObjetivos.map(async (o) => ({ ...o, ultimo: await ultimaVersion(o.nombre) })),
  );
  for (const o of resultados) {
    if (o.ultimo === null) {
      inexistentes.push(`${o.nombre} (${o.origen}) no existe en el registro — nombre mal escrito o paquete retirado`);
      continue;
    }
    const s = salto(o.pineado, o.ultimo);
    if (s) derivas.push({ ...o, ...s });
  }
} catch (e) {
  if (e instanceof NoVerificable) {
    console.error(rojo(`✗ NO PUDE VERIFICAR: ${e.message}`));
    console.error('  Exit 2 a proposito: ausencia de respuesta NO es ausencia de deriva.');
    process.exit(2);
  }
  throw e;
}
for (const o of objetivos.filter((x) => x.imagen)) {
  sinVerificar.push(`${o.nombre} (${o.origen}) es una imagen de contenedor: la vigila \`npm run vigila:hermes\`, no este script`);
}
// El modelo pineado no tiene registro publico que consultar sin credenciales.
const bitacora = existsSync(ruta('.claude/gobernanza/BITACORA-CDC.md'))
  ? readFileSync(ruta('.claude/gobernanza/BITACORA-CDC.md'), 'utf8')
  : '';
const modelo = bitacora.match(/\|\s*Agente de la f[aá]brica\s*\|\s*`([^`]+)`/)?.[1];
if (modelo) {
  sinVerificar.push(`modelo \`${modelo}\` (BITACORA-CDC.md): no hay registro publico que consultar sin credenciales — se revisa a mano en cada CDC de radio sistema`);
}

// --- Se reporta el CAMBIO, no el estado ------------------------------------
const nuevas = derivas.filter((d) => estado.avisados?.[d.nombre] !== d.ultimo);
const nuevoEstado = {
  ultimaCorrida: hoy,
  avisados: Object.fromEntries(derivas.map((d) => [d.nombre, d.ultimo])),
};
writeFileSync(ruta(ESTADO), `${JSON.stringify(nuevoEstado, null, 2)}\n`);

console.log(gris(`Vigilados: ${objetivos.length} pineados · registro: ${REGISTRO}\n`));
for (const s of sinVerificar) console.log(gris(`· ${s}`));
if (inexistentes.length > 0) {
  console.log(rojo('\nNo existen en el registro:'));
  for (const i of inexistentes) console.log(`  ✗ ${i}`);
}

if (derivas.length === 0 && inexistentes.length === 0) {
  console.log(verde('\n✓ Todo lo pineado sigue siendo lo ultimo publicado.'));
  process.exit(0);
}
if (nuevas.length === 0 && inexistentes.length === 0) {
  console.log(verde(`\n✓ Sin novedades: las ${derivas.length} derivas ya estaban avisadas.`));
  console.log(gris('  El silencio es la señal. Se vuelve a avisar solo cuando aparezca algo nuevo.'));
  process.exit(0);
}

console.log(ambar(`\n${nuevas.length} deriva(s) nueva(s) de ${derivas.length} en total:\n`));
const orden = { MAYOR: 0, menor: 1, parche: 2 };
for (const d of [...nuevas].sort((a, b) => orden[a.nivel] - orden[b.nivel])) {
  const etiqueta = d.nivel === 'MAYOR' ? rojo(d.nivel) : d.nivel === 'menor' ? ambar(d.nivel) : gris(d.nivel);
  console.log(`  ${etiqueta.padEnd(16)} ${d.nombre.padEnd(34)} ${d.pineado} → ${d.ultimo}  ${gris(d.origen)}`);
}
console.log(gris('\nEsto PROPONE, no aplica. Mover un pineo es un CDC (C1): diff, regresion, aprobacion'));
console.log(gris('y entrada firmada. Estar al dia no es el objetivo — decidir a sabiendas, si.'));
process.exit(1);
