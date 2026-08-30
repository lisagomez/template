#!/usr/bin/env node
/**
 * Verificador de integridad de las specs — vigila lo que NINGUN otro gate mira.
 *
 * El verificador de gobernanza vigila el CABLEADO entre documentos: que un documento
 * exista, que el decision tree lo apunte. Nadie miraba DENTRO de una spec. El 2026-08-30
 * eso costo caro: al reexpresar la spec 005 al formato del protocolo se perdio un criterio
 * de finalizacion entero —la trazabilidad del destilado— junto con su tabla de descartes, y
 * los 136 checks siguieron en verde. Lo cazo una comparacion contra git hecha a mano.
 *
 * Reformatear un documento puede tirar requisitos en silencio. Este script existe para que
 * la proxima vez no dependa de que alguien se acuerde de comparar.
 *
 * Que comprueba:
 *   1. Estructura: cada `NNN-<nombre>/` trae `spec.md`, `plan.md` y `tareas.md`.
 *   2. Numeracion: tres digitos, correlativa desde 001, sin saltos ni repetidos.
 *   3. Secciones: las diez de `spec-template.md` estan en cada spec. Añadir mas es legal
 *      (la plantilla exige no SALTARSE secciones, no prohibe agregarlas); faltar, no.
 *   4. EARS: cada requisito numerado usa uno de los cinco patrones y nombra al sistema.
 *      Un requisito sin patron no es verificable, que es justo lo que la notacion evita.
 *   5. Huecos en el sitio correcto: un `[NECESITA ACLARACION]` en "Dudas abiertas" es
 *      legitimo SIEMPRE, tambien en una spec ya construida — un hueco visible es
 *      informacion, y prohibirlo solo empuja a borrarlo para pasar el gate. Dentro de los
 *      requisitos, no: ahi significa un requisito que no se puede verificar.
 *      (La primera version de este script prohibia el hueco en specs construidas y marco
 *      en rojo cuatro dudas legitimas. El gate estaba mal, no las specs.)
 *
 * Corre sin red, sin credenciales y sin dependencias instaladas, como el resto de gates
 * de este repo. Exit 0 conforme · 1 divergente.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(raiz, '.claude/specs');

const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;

let fallos = 0;
let total = 0;
const comprueba = (etiqueta, ok, detalle = '') => {
  total += 1;
  if (ok) {
    console.log(`  ${verde('✓')} ${etiqueta}`);
  } else {
    fallos += 1;
    console.log(`  ${rojo('✗')} ${etiqueta}${detalle ? gris(` — ${detalle}`) : ''}`);
  }
};

// Las diez de `spec-template.md`. Se comparan por prefijo: el titulo real puede llevar
// coletilla ("Requisitos funcionales (criterios de aceptacion en EARS)") sin dejar de serlo.
const SECCIONES = [
  'Contexto y objetivo',
  'Usuarios / actores',
  'Historias de usuario',
  'Requisitos funcionales',
  'Requisitos no funcionales',
  'Casos límite',
  // Cableado del control C4 a esta ruta. Existe porque `prp-base.md` obliga a preguntar
  // "¿a quien dañamos sin atacante?" y la ruta spec -> plan -> tareas no lo hacia: dos
  // caminos para planificar y solo uno pasando por el control. Un control fuera del camino
  // de quien decide no dispara — medido en este repo el 2026-08-23.
  'Impacto sobre terceros',
  'Fuera de alcance',
  'Criterios de finalización',
  'Dudas abiertas',
];

// Los cinco patrones de la notacion. El ubicuo va al final: es el mas laxo y se usa como
// ultimo recurso, para que un requisito con patron propio no se cuele por el.
const PATRONES = [
  /^CUANDO .+, EL SISTEMA /,
  /^SI .+, ENTONCES EL SISTEMA /,
  /^MIENTRAS .+, EL SISTEMA /,
  /^DONDE .+, EL SISTEMA /,
  /^EL SISTEMA /,
];

if (!existsSync(DIR)) {
  console.error(rojo('No existe .claude/specs/ — no hay nada que verificar.'));
  process.exit(1);
}

const carpetas = readdirSync(DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

console.log(gris(`\nIntegridad de las specs — ${carpetas.length} carpetas en .claude/specs/\n`));

// --- 2. Numeracion correlativa -----------------------------------------------------------
const numeros = [];
for (const nombre of carpetas) {
  const m = /^(\d{3})-[a-z0-9]+(-[a-z0-9]+)*$/.exec(nombre);
  comprueba(
    `${nombre}: nombre con tres digitos y kebab-case`,
    m !== null,
    m === null ? 'se espera NNN-<nombre-en-kebab-case>' : '',
  );
  if (m) numeros.push(Number(m[1]));
}
const esperados = numeros.map((_, i) => i + 1);
comprueba(
  'la numeracion es correlativa desde 001, sin saltos ni repetidos',
  numeros.length > 0 && numeros.every((n, i) => n === esperados[i]),
  numeros.length ? `hay ${numeros.join(', ')}` : 'no hay ninguna spec',
);

// --- 1, 3, 4, 5 --------------------------------------------------------------------------
for (const nombre of carpetas) {
  const dir = join(DIR, nombre);

  for (const archivo of ['spec.md', 'plan.md', 'tareas.md']) {
    comprueba(`${nombre}: existe ${archivo}`, existsSync(join(dir, archivo)));
  }

  const rutaSpec = join(dir, 'spec.md');
  if (!existsSync(rutaSpec)) continue;
  const spec = readFileSync(rutaSpec, 'utf8');

  const titulos = [...spec.matchAll(/^##\s+(.+)$/gm)].map(([, t]) => t.trim());
  const faltantes = SECCIONES.filter((s) => !titulos.some((t) => t.startsWith(s)));
  comprueba(
    `${nombre}: las diez secciones de la plantilla`,
    faltantes.length === 0,
    faltantes.length ? `falta: ${faltantes.join(' · ')}` : '',
  );

  // Requisitos numerados. Un requisito ocupa varias lineas: la continuacion va indentada,
  // asi que se pega antes de buscar el patron. Sin esto el verificador marca en rojo
  // requisitos correctos solo por haberse partido — un falso positivo entrena a ignorarlo.
  const plano = spec.replace(/\n[ \t]+(?=\S)/g, ' ');
  const requisitos = [...plano.matchAll(/^-\s+RF-(\d+):\s*(.+)$/gm)];
  comprueba(`${nombre}: tiene requisitos funcionales numerados`, requisitos.length > 0);

  const sinPatron = requisitos
    .filter(([, , texto]) => !PATRONES.some((p) => p.test(texto.trim())))
    .map(([, n]) => `RF-${n}`);
  comprueba(
    `${nombre}: los ${requisitos.length} requisitos usan notacion EARS`,
    sinPatron.length === 0,
    sinPatron.length ? `sin patron: ${sinPatron.join(', ')}` : '',
  );

  const numerosRf = requisitos.map(([, n]) => Number(n));
  comprueba(
    `${nombre}: los requisitos van numerados sin saltos`,
    numerosRf.every((n, i) => n === i + 1),
    numerosRf.length ? `hay ${numerosRf.join(', ')}` : '',
  );

  // El hueco es legitimo donde se declara como tal; en un requisito significa que ese
  // requisito no se puede comprobar, que es lo contrario de para lo que sirve numerarlo.
  const bloqueRf = /^##\s+Requisitos funcionales[\s\S]*?(?=^##\s)/m.exec(spec)?.[0] ?? '';
  const huecosEnRf = (bloqueRf.match(/\[NECESITA ACLARACIÓN/g) || []).length;
  comprueba(
    `${nombre}: sin aclaraciones pendientes dentro de los requisitos`,
    huecosEnRf === 0,
    huecosEnRf ? `${huecosEnRf} en requisitos; su sitio es "Dudas abiertas"` : '',
  );
}

console.log('');
if (fallos === 0) {
  console.log(verde(`Specs integras: ${total}/${total} comprobaciones en verde.`));
  process.exit(0);
}
console.log(rojo(`Specs DIVERGENTES: ${fallos} de ${total} comprobaciones fallaron.`));
console.log(gris('  Una spec puede perder un requisito al reformatearse y no romper nada visible.'));
process.exit(1);
