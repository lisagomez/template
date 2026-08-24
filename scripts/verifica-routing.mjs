#!/usr/bin/env node
/**
 * Gate del routing por nivel de tarea.
 *
 * La leccion que lo origina (PRP-001 de Hermes): un solo modelo caro para todo es tirar
 * dinero, y bajarlo todo a barato es tirar calidad. El ahorro esta en el REPARTO. Y el modo
 * en que ese ahorro se pierde no es dramatico: **una clase de tarea que nadie asigno**
 * hereda el default y nadie se entera nunca.
 *
 * Comprueba, sin tocar la red:
 *   1. Cada nivel declara un modelo PINEADO — nada de `latest` ni alias flotantes (C1).
 *   2. Cada nivel declara precio de entrada, salida y lectura de cache.
 *   3. Ninguna clase de tarea apunta a un nivel que no existe.
 *   4. Las clases que NO se abaratan estan en el nivel de razonamiento. Bajarlas no es
 *      ahorrar: es mover el riesgo a donde no se ve.
 *   5. Los precios no han caducado (el catalogo declara su vigencia).
 *   6. El modelo pineado de la fabrica aparece en el catalogo, o el routing habla de
 *      modelos que este proyecto no usa.
 *
 * Exit 0 = coherente · 1 = incoherente · 2 = no pude comprobar.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ruta = (p) => join(raiz, p);
const CATALOGO = '.claude/routing-modelos.json';

const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const ambar = (s) => `\x1b[33m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;

if (!existsSync(ruta(CATALOGO))) {
  console.error(rojo(`✗ NO PUDE COMPROBAR: falta ${CATALOGO}`));
  process.exit(2);
}
let cat;
try {
  cat = JSON.parse(readFileSync(ruta(CATALOGO), 'utf8'));
} catch (e) {
  console.error(rojo(`✗ NO PUDE COMPROBAR: ${CATALOGO} no es JSON valido (${e.message})`));
  process.exit(2);
}

const fallos = [];
const avisos = [];
const niveles = Object.entries(cat.niveles ?? {}).filter(([k]) => !k.startsWith('_'));
if (niveles.length === 0) fallos.push('el catalogo no declara ningun nivel');

const ALIAS_FLOTANTE = /(^|[/@:-])(latest|preview|nightly|edge)$/i;
for (const [nivel, cfg] of niveles) {
  if (!cfg.modelo) fallos.push(`el nivel \`${nivel}\` no declara modelo`);
  else if (ALIAS_FLOTANTE.test(cfg.modelo)) {
    fallos.push(`el nivel \`${nivel}\` usa un alias flotante (\`${cfg.modelo}\`): C1 lo prohibe — un modelo que cambia solo es un cambio de comportamiento sin diff ni firma`);
  }
  for (const campo of ['entrada', 'salida', 'lectura_cache']) {
    if (typeof cfg.precio?.[campo] !== 'number') {
      fallos.push(`el nivel \`${nivel}\` no declara precio de ${campo}: sin precio no se puede decidir el reparto, y una cifra inventada es peor que un hueco`);
    }
  }
}

const tareas = Object.entries(cat.tareas ?? {}).filter(([k]) => !k.startsWith('_'));
if (tareas.length === 0) fallos.push('el catalogo no asigna ninguna clase de tarea');
const nombresNivel = new Set(niveles.map(([n]) => n));
for (const [tarea, nivel] of tareas) {
  if (!nombresNivel.has(nivel)) {
    fallos.push(`la tarea \`${tarea}\` apunta al nivel \`${nivel}\`, que no existe`);
  }
}

// El limite de la regla: lo que decide sobre riesgo no se abarata.
const caro = niveles.find(([, c]) => c.precio && Math.max(...niveles.map(([, x]) => x.precio?.entrada ?? 0)) === c.precio.entrada)?.[0];
for (const clase of cat.no_se_abaratan?.clases ?? []) {
  const asignado = cat.tareas?.[clase];
  if (!asignado) fallos.push(`\`${clase}\` esta en "no se abaratan" pero no tiene nivel asignado`);
  else if (asignado !== caro) {
    fallos.push(`\`${clase}\` esta en "no se abaratan" y quedo en el nivel \`${asignado}\` en vez de \`${caro}\`: ${cat.no_se_abaratan?.motivo ?? 'decide sobre riesgo'}`);
  }
}

// Precios caducados: no falla el gate, avisa. Un precio viejo sigue sirviendo para repartir;
// lo que no sirve es creerselo para presupuestar.
const consultado = cat.precios?.consultado;
const vigencia = cat.precios?.vigencia_dias ?? 90;
if (!consultado || !cat.precios?.fuente) {
  fallos.push('los precios no declaran fuente y fecha: sin eso son numeros sin procedencia');
} else {
  const dias = Math.floor((Date.now() - new Date(consultado).getTime()) / 86400000);
  if (dias > vigencia) {
    avisos.push(`los precios se consultaron hace ${dias} dias (vigencia declarada: ${vigencia}). Re-consulta ${cat.precios.fuente} antes de usarlos para presupuestar.`);
  }
}

// Coherencia con el modelo que la fabrica declara pineado.
const bitacora = existsSync(ruta('.claude/gobernanza/BITACORA-CDC.md'))
  ? readFileSync(ruta('.claude/gobernanza/BITACORA-CDC.md'), 'utf8')
  : '';
const pineado = bitacora.match(/\|\s*Agente de la f[aá]brica\s*\|\s*`([^`]+)`/)?.[1];
if (pineado) {
  const enCatalogo = niveles.some(([, c]) => String(c.modelo ?? '').endsWith(pineado));
  if (!enCatalogo) {
    avisos.push(`el modelo pineado de la fabrica (\`${pineado}\`) no aparece en ningun nivel del catalogo: o el routing habla de modelos que no se usan, o el pineo cambio sin actualizar esto`);
  }
}

// --- Salida ----------------------------------------------------------------
console.log(gris(`Catalogo: ${niveles.length} niveles · ${tareas.length} clases de tarea`));
console.log(gris(`Precios: ${cat.precios?.fuente ?? '?'} (consultados el ${consultado ?? '?'})\n`));
for (const [nivel, cfg] of niveles) {
  const n = tareas.filter(([, v]) => v === nivel).length;
  console.log(`  ${nivel.padEnd(14)} ${String(cfg.modelo).padEnd(30)} $${cfg.precio?.entrada}/M in · $${cfg.precio?.salida}/M out · $${cfg.precio?.lectura_cache}/M cache  ${gris(`${n} clase(s)`)}`);
}
if (cat.cache_de_prefijo) {
  console.log(gris(`\n  Cache de prefijo: ${cat.cache_de_prefijo.ahorro_si_el_prefijo_aguanta} si el prefijo aguanta.`));
}
for (const a of avisos) console.log(ambar(`\naviso: ${a}`));

if (fallos.length === 0) {
  console.log(verde('\n✓ Routing coherente: cada clase con su nivel, cada nivel pineado y con precio.'));
  process.exit(0);
}
console.log(rojo(`\n${fallos.length} incoherencia(s):`));
for (const f of fallos) console.log(`  · ${f}`);
process.exit(1);
