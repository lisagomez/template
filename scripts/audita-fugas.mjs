#!/usr/bin/env node
/**
 * Auditor de fugas del corpus — mide si una entrada de caso-trampa es RECONOCIBLE leyendo
 * el arbol de trabajo.
 *
 * Por que existe, y por que NO esta en `validate` todavia (medido el 2026-08-30):
 *
 * La comprobacion 3i del verificador caza la copia literal (ventanas de 8 palabras) y se le
 * escapa la parafrasis, que es como se escriben las fugas de verdad: nadie copia y pega una
 * peticion, la cuenta con sus palabras. Se intento cerrar el hueco por el lado del arbol
 * —"que ningun documento se parezca a una entrada"— y **la medicion lo tumbo**: las entradas
 * estan escritas con el vocabulario del propio producto, asi que cualquier umbral que cace la
 * fuga real cara tambien al skill que legitimamente habla de lo mismo. Ejemplo medido: el
 * tramo "correos transaccionales resend" pesa MAS que la fuga real, y vive en el skill de
 * emails, donde tiene que estar.
 *
 * De ahi la inversion: el sujeto de la auditoria es la ENTRADA, no la documentacion. Si una
 * entrada reutiliza el vocabulario del arbol, el caso no mide conducta —mide lectura— y lo
 * barato es reescribir la entrada, que vive fuera del repo, en vez de mutilar documentacion
 * que tiene que decir lo que dice.
 *
 * Metodo: se buscan tramos de >=K palabras de contenido del arbol que aparezcan EN ORDEN
 * dentro de la entrada admitiendo huecos (asi "corremos validate a mano" casa con
 * "corremos npm run validate a mano", que es justo lo que rompia la contigüidad exacta), y se
 * pesan por rareza (idf) para que el vocabulario comun no dispare.
 *
 * Salida: informe ordenado. Exit 0 siempre — es un instrumento de medida, no un gate. Cuando
 * el corpus este limpio, el umbral se fija con estos numeros y se promueve a comprobacion.
 *
 * Uso:  node scripts/audita-fugas.mjs [--ref <git-ref del corpus>] [--k N] [--hueco N]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i === -1 ? porDefecto : process.argv[i + 1];
};
const K = Number(arg('--k', 3));
const HUECO = Number(arg('--hueco', 3));

const VACIAS = new Set(
  ('a al ante antes aqui asi aun aunque cada como con contra cual cuando de del desde donde dos e el ella ellas ellos en entre era eran es esa ese eso esta estan este esto ha hace hasta hay la las le les lo los mas me mi mientras muy no nos o para pero por porque que se sea segun si sin sobre solo son su sus tan te todo tu un una uno unos y ya yo').split(' '),
);
const norm = (t) =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9n ]+/gi, ' ').replace(/\s+/g, ' ').trim();
const cont = (t) => norm(t).split(' ').filter((p) => p && !VACIAS.has(p) && p.length > 1);

// --- el arbol -------------------------------------------------------------
const versionados = execFileSync('git', ['ls-files'], { cwd: raiz, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && /\.(md|mjs|ts|tsx|json)$/.test(f) && !/package-lock\.json$/.test(f));

const docs = new Map();
for (const f of versionados) {
  try { docs.set(f, cont(readFileSync(join(raiz, f), 'utf8'))); } catch { /* ilegible: se salta */ }
}
if (docs.size === 0) {
  console.error('no se pudo leer el arbol versionado');
  process.exit(0);
}

const df = new Map();
for (const toks of docs.values()) for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
const N = docs.size;
const idf = (t) => Math.log(N / (1 + (df.get(t) ?? 0)));

// --- el corpus, que vive fuera del arbol ----------------------------------
const REF = arg('--ref', null);
let corpus = null;
for (const ref of REF ? [REF] : ['golden-sets:casos-trampa.md', 'origin/golden-sets:casos-trampa.md']) {
  try { corpus = execFileSync('git', ['show', ref], { cwd: raiz, encoding: 'utf8' }); break; } catch { /* siguiente */ }
}
if (corpus === null) {
  console.log('Sin la rama golden-sets no hay corpus que auditar.');
  console.log('Traela con: git fetch origin golden-sets:golden-sets');
  process.exit(0);
}

// Un caso puede DECLARAR su eco: hay entradas cuyo vocabulario es el del propio producto y
// no se pueden plantear de otra forma (la llave que miden, el script que tocan, el modulo en
// el que estan ancladas). Ese eco no delata nada — lo que delata es la frase distintiva que
// coincide con una narracion publicada. La declaracion se revisa UNA vez, al escribir el
// caso, en vez de exigir juicio en cada corrida del gate.
const casos = [];
for (const bloque of corpus.split(/^## /m).slice(1)) {
  const id = (bloque.match(/^(T\d{1,2})/) ?? [])[1];
  const entrada = (bloque.match(/\*\*Entrada:\*\*([\s\S]*?)\n\s*\n/) ?? [])[1];
  const declarado = (bloque.match(/\*\*Eco aceptado:\*\*\s*([\s\S]*?)\n\s*\n/) ?? [])[1];
  if (id && entrada) casos.push({ id, E: cont(entrada), declarado: declarado?.replace(/\s+/g, ' ').trim() ?? null });
}

/** ¿`tramo` aparece en orden dentro de `E`, saltando como mucho HUECO palabras? */
function enOrden(tramo, E) {
  for (let inicio = 0; inicio < E.length; inicio++) {
    if (E[inicio] !== tramo[0]) continue;
    let i = inicio, k = 0, huecos = 0;
    while (k < tramo.length && i < E.length) {
      if (E[i] === tramo[k]) { k++; i++; } else { huecos++; i++; if (huecos > HUECO) break; }
    }
    if (k === tramo.length) return true;
  }
  return false;
}

const filas = [];
for (const c of casos) {
  const enE = new Set(c.E);
  let peor = { peso: 0 };
  for (const [f, D] of docs) {
    for (let i = 0; i + K <= D.length; i++) {
      const tramo = D.slice(i, i + K);
      if (!tramo.every((t) => enE.has(t))) continue;
      if (!enOrden(tramo, c.E)) continue;
      const peso = tramo.reduce((s, t) => s + idf(t), 0);
      if (peso > peor.peso) peor = { peso, texto: tramo.join(' '), archivo: f };
    }
  }
  filas.push({ id: c.id, declarado: c.declarado, ...peor });
}

filas.sort((a, b) => b.peso - a.peso);
const conEco = filas.filter((f) => f.peso > 0);
const sinDeclarar = conEco.filter((f) => !f.declarado);
const declarados = conEco.filter((f) => f.declarado);

const linea = (f) => `  ${f.peso.toFixed(2).padStart(5)}  ${f.id.padEnd(4)}  ${f.texto.padEnd(42)}  ${f.archivo}`;

console.log(`\nAuditoria de fugas del corpus — K=${K}, huecos<=${HUECO}, ${N} ficheros, ${casos.length} casos\n`);

console.log('SIN DECLARAR — cada una es trabajo pendiente:');
if (sinDeclarar.length === 0) {
  console.log('  ninguna.');
} else {
  console.log('   peso  caso  tramo del arbol que la entrada repite       donde');
  for (const f of sinDeclarar) console.log(linea(f));
  console.log('\n  Peso alto = el sujeto puede reconocer el caso leyendo el repo, y entonces el');
  console.log('  caso mide lectura, no conducta. Se arregla REESCRIBIENDO LA ENTRADA en la rama');
  console.log('  golden-sets, o DECLARANDO el eco si el vocabulario es inherente al caso — no');
  console.log('  retirando documentacion que tiene que decir lo que dice.');
}

if (declarados.length) {
  console.log('\nDECLARADOS — eco inherente, revisado al escribir el caso:');
  for (const f of declarados) console.log(linea(f));
}

console.log(`\n  ${sinDeclarar.length} sin declarar · ${declarados.length} declarados · ` +
  `${casos.length - conEco.length} sin eco.`);

// El corte NO es por peso — ese umbral no se pudo fijar, y ese fue el hallazgo del
// 2026-08-30: cualquier corte que cace la fuga cara tambien a la documentacion legitima. El
// corte es BINARIO: un eco o no existe, o esta declarado. Sin juicio en tiempo de gate.
if (sinDeclarar.length > 0) {
  console.log(`\n  ${sinDeclarar.length} entrada(s) hacen eco del arbol SIN declararlo.`);
  console.log('  Reescribe la entrada, o declara el eco con "**Eco aceptado:** <razon>" si el');
  console.log('  vocabulario es inherente al caso.\n');
  process.exit(1);
}
console.log('  Todo eco esta declarado.\n');
