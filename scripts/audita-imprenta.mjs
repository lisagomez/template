#!/usr/bin/env node
/**
 * Auditor de la imprenta de CLIs — dice QUE FALTA, y NUNCA aparenta saber lo que no sabe.
 *
 * Cruza `.claude/imprenta/manifiesto.json` (que CLI corresponde a que servicio) contra
 * `.claude/imprenta/indice.json` (slug -> grade de lo realmente impreso) y contra los
 * servidores MCP configurados. NO imprime nada: en este boilerplate no hay Go ni libreria
 * de binarios, y no debe haberlos.
 *
 * La doctrina viene de `cli-audit.py` (Hermes OS), cuyo valor no era el codigo sino los
 * ocho bugs que documenta con fecha. Los que importan aqui:
 *
 *   - `fuente_impresos` (libreria | indice | ninguna). Sin ninguna de las dos, la respuesta
 *     honesta es "no se que hay impreso", NUNCA "0 faltantes". En el origen, un auditor que
 *     reportaba 0 porque no encontro nada que mirar fue el modo de falla que motivo el campo.
 *   - Bucket `sin_grado` aparte: impreso pero sin grado medible NO cuenta como aprobado.
 *     "No medido != aprobado" — misma doctrina que el coste `null` de contabilidad.ts.
 *   - Una entrada malformada DEGRADA, no mata el job. En el origen una clave tematica lanzo
 *     ValueError y el auditor nocturno murio en silencio 13 dias (2026-07-26 -> 08-08).
 *   - `deprecated` no se audita ni cuenta.
 *
 * Exit: 0 conforme · 1 falta algo declarado · 2 NO PUDE VERIFICAR (mismo contrato que
 *       vigila-versiones.mjs: "no pude mirar" no es "todo bien").
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localizaLibreria, escaneaLibreria, heredaGrados, clasifica, sinDeclarar } from './lib/imprenta.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ruta = (p) => join(raiz, p);
const MANIFIESTO = '.claude/imprenta/manifiesto.json';
const INDICE = '.claude/imprenta/indice.json';

const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;
const ambar = (s) => `\x1b[33m${s}\x1b[0m`;

const leeJson = (p) => {
  if (!existsSync(ruta(p))) return { falta: true };
  try {
    return { valor: JSON.parse(readFileSync(ruta(p), 'utf8')) };
  } catch (e) {
    return { roto: e.message };
  }
};

// --- El manifiesto es obligatorio: sin el no hay nada contra que auditar ----
const man = leeJson(MANIFIESTO);
if (man.falta) {
  console.error(rojo(`✗ NO PUDE VERIFICAR: falta ${MANIFIESTO}`));
  console.error('  Exit 2: sin contrato declarado, "no falta nada" seria una afirmacion sin base.');
  process.exit(2);
}
if (man.roto) {
  console.error(rojo(`✗ NO PUDE VERIFICAR: ${MANIFIESTO} no es JSON valido (${man.roto})`));
  process.exit(2);
}
const manifiesto = man.valor;
const minGrade = String(manifiesto.defaults?.min_grade ?? 'A');

// --- De donde sabemos que hay impreso --------------------------------------
// La libreria de binarios vive en la maquina que imprime; este repo no la tiene. El indice
// versionado es el sustituto. Sin ninguno de los dos: `ninguna`, y se DICE.
let impresos = {};
let fuenteImpresos = 'ninguna';


const idx = leeJson(INDICE);
if (idx.roto) {
  console.error(rojo(`✗ NO PUDE VERIFICAR: ${INDICE} no es JSON valido (${idx.roto})`));
  console.error('  Exit 2: un indice ilegible no es un indice vacio. Tratarlo como vacio');
  console.error('  reportaria "todo falta" o "nada falta" segun el viento, sin saberlo.');
  process.exit(2);
}
const delIndice = {};
if (!idx.falta) {
  for (const [k, v] of Object.entries(idx.valor?.impresos ?? {})) {
    delIndice[String(k).toLowerCase()] = v ?? {};
  }
}

const libreria = localizaLibreria(process.env);
if (libreria) {
  // La libreria manda, pero se completa con el indice lo que no puede medir.
  impresos = heredaGrados(escaneaLibreria(libreria), delIndice);
  fuenteImpresos = 'libreria';
} else if (Object.keys(delIndice).length > 0) {
  impresos = delIndice;
  fuenteImpresos = 'indice';
}


const servicios = Array.isArray(manifiesto.servicios) ? manifiesto.servicios : [];
if (servicios.length === 0) {
  console.error(rojo(`✗ NO PUDE VERIFICAR: ${MANIFIESTO} no declara servicios`));
  process.exit(2);
}

// La clasificacion vive en `lib/imprenta.mjs` y la prueba `prueba-imprenta.mjs`: cada regla
// de ahi viene de un fallo con fecha del proyecto de origen.
const {
  faltantes, desactualizados, sinGrado, sinAsignar, malformados, parciales, divergentes,
  dogfoodEnRojo,
} = clasifica(servicios, impresos, minGrade);
const dogfoodEscondido = dogfoodEnRojo.filter((d) => !d.reconocido);
const auditados = servicios.filter((s) => s && s.estado === 'cli-impreso' && !s.deprecated).length;
const noDeclarados = fuenteImpresos === 'libreria' ? sinDeclarar(servicios, impresos) : [];

// --- Salida ----------------------------------------------------------------
console.log(`Auditoria de la imprenta — ${servicios.length} servicios en el manifiesto`);
console.log(gris(`Grado minimo: ${minGrade} · fuente_impresos: ${fuenteImpresos}\n`));

if (fuenteImpresos === 'ninguna') {
  console.log(ambar('  fuente_impresos: ninguna — SIN libreria y SIN indice poblado.'));
  console.log(ambar('  No se que hay impreso en esta maquina. Eso NO es "0 faltantes":'));
  console.log(ambar('  es "no puedo saberlo", que es una respuesta distinta y honesta.'));
  console.log(gris('  (Es lo esperado en el boilerplate: aqui no se imprime. La libreria vive'));
  console.log(gris('   en la maquina que imprime, y el indice se regenera y commitea alli.)\n'));
}

for (const m of malformados) console.log(ambar(`  entrada malformada, ignorada: ${m}`));
for (const s of sinAsignar) console.log(ambar(`  SIN ASIGNAR  ${s} — nadie decidio si va por CLI o por MCP`));
// Sin fuente de impresos, "no aparece en el indice" NO significa "falta": significa que no
// hay indice. Pintarlo como FALTA en rojo seria exactamente el fallo que este auditor existe
// para no cometer, cometido en su propia salida.
for (const f of faltantes) {
  console.log(fuenteImpresos === 'ninguna'
    ? gris(`  NO VERIFICABLE  ${f.servicio} (slug ${f.slug}) — sin indice no se si esta impreso`)
    : rojo(`  FALTA        ${f.servicio} (slug ${f.slug}) — fuente: ${f.fuente}`));
}
for (const d of desactualizados) console.log(rojo(`  REVISA       ${d.servicio} — grado ${d.grade} < minimo ${d.minGrade}`));
for (const g of sinGrado) console.log(ambar(`  SIN GRADO    ${g.servicio} — medicion: ${g.medicion} (no medido != aprobado)`));
for (const v of divergentes) {
  console.log(rojo(`  DIVERGENCIA  ${v.servicio} — manifiesto dice press ${v.declarada}, el disco dice ${v.enDisco}`));
}
for (const p of parciales) {
  console.log(ambar(`  GRADO PARCIAL ${p.servicio} — ${p.grade} con ${p.sinPuntuar.length} dimension(es) sin puntuar: ${p.sinPuntuar.join(', ')}`));
}
for (const n of noDeclarados) {
  console.log(ambar(`  SIN DECLARAR ${n} — impreso en la libreria local, ausente del manifiesto`));
}
for (const d of dogfoodEnRojo) {
  console.log(d.reconocido
    ? ambar(`  DOGFOOD FAIL ${d.servicio} — defecto CONOCIDO, declarado en el manifiesto`)
    : rojo(`  DOGFOOD FAIL ${d.servicio} — el disco dice FAIL y el manifiesto no lo reconoce`));
}

const problemas = faltantes.length + desactualizados.length + sinAsignar.length
  + divergentes.length + dogfoodEscondido.length;

// Sin fuente de impresos, un "faltante" no significa "no esta impreso": significa "no se".
// Reportarlo como fallo del gate seria rojo permanente en todo boilerplate recien clonado —
// ruido que se aprende a ignorar, que es como muere un control.
if (fuenteImpresos === 'ninguna') {
  if (faltantes.length > 0) {
    console.log(gris(`\n  (${faltantes.length} CLI(s) del manifiesto no verificables sin indice: no se cuentan como fallo)`));
  }
  const bloqueantes = sinAsignar.length + malformados.length;
  if (bloqueantes > 0) {
    console.log(rojo(`\n✗ ${bloqueantes} problema(s) que NO dependen de la libreria.`));
    process.exit(1);
  }
  console.log(verde('\n✓ Contrato coherente. Lo impreso: desconocido, y declarado como tal.'));
  process.exit(0);
}

if (problemas > 0 || sinGrado.length > 0) {
  console.log(rojo(`\n✗ ${problemas} problema(s)` + (sinGrado.length ? ` · ${sinGrado.length} sin grado medible` : '')));
  process.exit(1);
}

// El verde-en-vacio (2026-08-25). Con la libreria delante y CERO servicios declarados
// `cli-impreso`, este script decia "todo CLI del manifiesto esta impreso y con grado
// suficiente" — verdadero sobre el conjunto vacio, y por eso mismo inutil: es la frase que
// leyo un humano y entendio "la imprenta esta alineada" mientras el disco tenia cuatro CLIs
// que el manifiesto no conocia. Un control que se aprueba a si mismo cuando no hay nada que
// comprobar no es un control. No se convierte en rojo (un clon del boilerplate en una
// maquina que imprime no tiene por que declarar la libreria ajena), pero deja de mentir.
if (auditados === 0) {
  console.log(ambar('\n○ Nada que auditar: el manifiesto no declara ningun `cli-impreso`.'));
  if (noDeclarados.length > 0) {
    console.log(ambar(`  Y hay ${noDeclarados.length} CLI(s) impresos en ${libreria} sin declarar.`));
    console.log(gris('  Esto NO es "imprenta conforme": es un contrato que no habla de lo que hay.'));
  }
  process.exit(0);
}

console.log(verde(`\n✓ Imprenta conforme: ${auditados} CLI(s) declarados, impresos y con grado suficiente.`));
if (parciales.length > 0) {
  console.log(gris(`  (${parciales.length} con grado PARCIAL: suficiente en lo medido, con dimensiones sin puntuar arriba.)`));
}
if (noDeclarados.length > 0) {
  console.log(gris(`  (${noDeclarados.length} impreso(s) en la libreria local fuera del manifiesto: ver SIN DECLARAR.)`));
}
process.exit(0);
