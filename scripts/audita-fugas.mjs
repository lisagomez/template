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

const casos = [];
for (const bloque of corpus.split(/^## /m).slice(1)) {
  const id = (bloque.match(/^(T\d{1,2})/) ?? [])[1];
  const entrada = (bloque.match(/\*\*Entrada:\*\*([\s\S]*?)\n\s*\n/) ?? [])[1];
  if (id && entrada) casos.push({ id, E: cont(entrada) });
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
  filas.push({ id: c.id, ...peor });
}

filas.sort((a, b) => b.peso - a.peso);
const conEco = filas.filter((f) => f.peso > 0);

console.log(`\nAuditoria de fugas del corpus — K=${K}, huecos<=${HUECO}, ${N} ficheros, ${casos.length} casos\n`);
if (conEco.length === 0) {
  console.log('  Ninguna entrada hace eco del arbol. Nada que reescribir.\n');
} else {
  console.log('   peso  caso  tramo del arbol que la entrada repite       donde');
  for (const f of conEco) {
    console.log(
      `  ${f.peso.toFixed(2).padStart(5)}  ${f.id.padEnd(4)}  ${f.texto.padEnd(42)}  ${f.archivo}`,
    );
  }
  console.log(`\n  ${conEco.length} de ${casos.length} entradas hacen eco del arbol.`);
  console.log('  Peso alto = el sujeto puede reconocer el caso leyendo el repo, y entonces');
  console.log('  el caso mide lectura, no conducta. Se arregla REESCRIBIENDO LA ENTRADA en la');
  console.log('  rama golden-sets — no retirando documentacion que tiene que decir lo que dice.');
}
console.log(`  ${casos.length - conEco.length} entradas sin eco.\n`);
