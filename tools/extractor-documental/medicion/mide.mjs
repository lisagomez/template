#!/usr/bin/env node
/**
 * Mide el extractor contra TU corpus. No es la suite de pruebas.
 *
 * Las 372 pruebas corren sin red, sin base de datos y sin navegador, y eso es deliberado: lo que
 * miden es la contabilidad del algoritmo, que es donde vive casi todo el riesgo del codigo. Pero
 * hay tres numeros que ningun dato falso puede dar —el umbral de confianza, el de similitud y los
 * de la rafaga— porque no son propiedades del codigo: son propiedades de TUS documentos.
 *
 * De ahi la regla que este archivo encarna, la misma que `tools/voz/medicion/mide.mjs`:
 * **lo que no se ha medido contra datos reales no esta aprobado, esta sin medir.**
 *
 * QUE NO ES: una prueba de regresion. No devuelve exit 1 por un decimal. Imprime numeros para que
 * los lea una persona y decida — porque elegir un umbral exige saber cuanto cuesta un error que se
 * cuela frente a una hora de revision humana, y eso no esta en los datos.
 *
 * Y por lo mismo NO recomienda ningun umbral. `calibracion.ts` tiene una prueba que falla si
 * alguien añade una funcion que lo haga.
 *
 * De donde sale el corpus: de `npm run demo`. Cada correccion que haces a mano se guarda ahi.
 *
 * Uso:  npm run mide          (en tools/extractor-documental)
 * Exit: 0 siempre que pueda leer. 2 si no pudo — que NO es lo mismo que "todo bien".
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..');
const corpus = join(raiz, 'demo', 'corpus');

const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const amarillo = (s) => `\x1b[33m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;
const paso = (s) => console.log(`\n${verde('▸')} ${s}`);

/** §8 pide 100-200 paginas. Por debajo, un numero es una anecdota con formato de medicion. */
const MINIMO_CONCLUYENTE = 100;

function leeJsonl(archivo) {
  if (!existsSync(archivo)) return [];
  const salida = [];
  for (const [n, linea] of readFileSync(archivo, 'utf8').split('\n').entries()) {
    if (linea.trim().length === 0) continue;
    try {
      salida.push(JSON.parse(linea));
    } catch {
      // Una linea rota no invalida el corpus, pero se DICE: callarla la promediaria fuera sin
      // que nadie sepa que falta.
      console.log(amarillo(`  · linea ${n + 1} de ${archivo.replace(raiz, '.')} ilegible, se salta`));
    }
  }
  return salida;
}

function comoTabla(filas, columnas) {
  const anchos = columnas.map((c) => Math.max(c.titulo.length, ...filas.map((f) => String(c.valor(f)).length)));
  const linea = (celdas) => `  ${celdas.map((c, i) => String(c).padStart(anchos[i])).join('  ')}`;
  console.log(gris(linea(columnas.map((c) => c.titulo))));
  for (const fila of filas) console.log(linea(columnas.map((c) => c.valor(fila))));
}

// --- Arranque -------------------------------------------------------------------------------

let cal;
try {
  execFileSync('npm', ['run', 'build'], { cwd: raiz, stdio: 'ignore' });
  cal = await import(join(raiz, 'dist', 'calibracion.js'));
} catch (e) {
  console.error(`\n✗ NO PUDE MEDIR: ${e.message}`);
  console.error('  Exit 2 a proposito: no haber podido medir NO es haber medido y no ver nada.\n');
  process.exit(2);
}

const campos = leeJsonl(join(corpus, 'campos.jsonl'));
const similitud = leeJsonl(join(corpus, 'similitud.jsonl'));

if (campos.length === 0 && similitud.length === 0) {
  console.log(`\n${amarillo('No hay corpus todavia.')}`);
  console.log('\nSe fabrica probando la herramienta:');
  console.log(`  ${verde('npm run demo')}   ${gris('y corriges campos a mano; cada correccion es una muestra')}`);
  console.log('\nLos dos corpus NO cuestan lo mismo:');
  console.log(gris('  similitud  — solo tu catalogo y tu criterio. Cero claves.        Desbloquea TAR-25'));
  console.log(gris('  confianza  — necesita un motor de OCR real con su clave.         Desbloquea TAR-17'));
  console.log(gris('\n  La capa 0 da texto exacto pero SIN confianza por campo: no hay score que'));
  console.log(gris('  correlacionar. Por eso el de confianza no se puede fabricar sin motor.\n'));
  process.exit(0);
}

// --- Confianza (TAR-17) ----------------------------------------------------------------------

if (campos.length > 0) {
  paso(`Corpus de confianza — ${campos.length} muestra(s)`);
  if (campos.length < MINIMO_CONCLUYENTE) {
    console.log(amarillo(`  NO CONCLUYENTE: §8 pide 100-200 paginas y aqui hay ${campos.length}.`));
    console.log(gris('  Los numeros de abajo son reales, pero no bastan para fijar un umbral.'));
  }

  const conTexto = campos.filter((m) => typeof m.referencia === 'string' && m.referencia.length > 0);
  const cers = conTexto.map((m) => cal.cer(m.referencia, m.obtenido)).filter((v) => v !== null);
  const wers = conTexto.map((m) => cal.wer(m.referencia, m.obtenido)).filter((v) => v !== null);
  const media = (xs) => (xs.length === 0 ? null : xs.reduce((s, x) => s + x, 0) / xs.length);
  const pinta = (v) => (v === null ? gris('sin datos') : v.toFixed(4));

  console.log(`  CER medio          : ${pinta(media(cers))}`);
  console.log(`  WER medio          : ${pinta(media(wers))}`);
  const precision = cal.precisionDeCampos(campos);
  console.log(`  campos correctos   : ${precision === null ? gris('sin datos') : `${(precision * 100).toFixed(1)} %`}`);
  console.log(gris('  (§8 los separa a proposito: el CER puede ser bueno y el campo estar mal)'));

  paso('Correlacion confianza-error — la medicion que decide el umbral');
  const c = cal.correlacionConfianzaError(campos);
  console.log(`  aciertos ${c.aciertos} · fallos ${c.fallos}`);
  if (c.confianzaMediaAciertos !== null) {
    console.log(`  confianza media en aciertos: ${c.confianzaMediaAciertos.toFixed(3)}`);
  }
  if (c.confianzaMediaFallos !== null) {
    console.log(`  confianza media en fallos  : ${c.confianzaMediaFallos.toFixed(3)}`);
  }
  console.log(`\n  ${c.r === null ? amarillo(c.lectura) : c.lectura}`);

  if (c.r !== null) {
    paso('Curva de umbral — el intercambio, para que lo decidas tu');
    comoTabla(cal.curvaDeUmbral(campos, 10), [
      { titulo: 'umbral', valor: (p) => p.umbral.toFixed(2) },
      { titulo: 'aceptados', valor: (p) => p.aceptados },
      { titulo: 'errores colados', valor: (p) => p.erroresColados },
      { titulo: 'a cola', valor: (p) => p.aCola },
      { titulo: 'revision de mas', valor: (p) => p.revisionInnecesaria },
    ]);
    console.log(gris('\n  Aqui no hay fila recomendada, y es deliberado: elegir exige saber cuanto cuesta'));
    console.log(gris('  un error colado frente a una hora de revision, y eso no esta en los datos.'));
  }
}

// --- Similitud (TAR-25) ----------------------------------------------------------------------

if (similitud.length > 0) {
  paso(`Corpus de similitud — ${similitud.length} muestra(s)`);
  if (similitud.length < MINIMO_CONCLUYENTE) {
    console.log(amarillo(`  NO CONCLUYENTE: ${similitud.length} muestra(s). Sirve para ver la forma, no para fijar nada.`));
  }
  comoTabla(cal.curvaDeSimilitud(similitud, 10), [
    { titulo: 'umbral', valor: (p) => p.umbral.toFixed(2) },
    { titulo: 'emparejados', valor: (p) => p.emparejados },
    { titulo: 'falsos positivos', valor: (p) => p.falsosPositivos },
    { titulo: 'falsos negativos', valor: (p) => p.falsosNegativos },
  ]);
  console.log(gris('\n  Los dos errores NO son simetricos: un falso positivo FUSIONA dos entidades'));
  console.log(gris('  distintas —deshacerlo despues es arqueologia— y un falso negativo crea un'));
  console.log(gris('  duplicado, que es feo pero se limpia. Cual duele mas depende de tu catalogo.'));
}

console.log(`\n${gris('Cuando estos numeros basten, TAR-17 y TAR-25 se cierran citando ESTA corrida:')}`);
console.log(gris('fecha, motor, tamaño del corpus y el umbral elegido, escritos al lado del numero.\n'));
