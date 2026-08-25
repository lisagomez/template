#!/usr/bin/env node
/**
 * Prueba del nucleo de la imprenta. Corre dentro de `npm run validate`.
 *
 * **Cada caso de aqui es un bug que el proyecto de origen ya pago, con fecha.** El valor de
 * `cli-audit.py` (Hermes OS) nunca fue su codigo —Python, yaml, docker, ssh: nada de eso
 * viaja a un boilerplate Node— sino que documentaba en comentarios ocho fallos reales. Un
 * bug ajeno del que solo copias la conclusion se te repite; uno que conviertes en caso, no.
 *
 * Van aqui y NO en la capa B (casos-trampa) porque son fallos de CODIGO, deterministas: la
 * capa B prueba si el AGENTE obedece una regla, y eso exige invocar al modelo en sesion
 * fria. Mezclarlos haria la capa B mas lenta y esto menos frecuente. Cada uno a su gate.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  normalizaSlug, casa, heredaGrados, escaneaLibreria, localizaLibreria, clasifica, sinDeclarar,
  normalizaGrado,
} from './lib/imprenta.mjs';

const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;

let fallos = 0;
const comprueba = (descripcion, condicion, detalle = '') => {
  console.log(`  ${condicion ? verde('✓') : rojo('✗')} ${descripcion}${detalle ? gris(`  ${detalle}`) : ''}`);
  if (!condicion) fallos++;
};

console.log('Nucleo de la imprenta — cada caso es un fallo que el origen ya pago\n');

// --- 1. Slug desde URL: el "FALTA" perpetuo de hetzner ---------------------
// docs.hetzner.cloud -> "docs" no casaba con nada. Impreso desde el 2026-07-04 y reportado
// como faltante en CADA corrida.
comprueba('un subdominio generico no se come el nombre de la API',
  normalizaSlug('https://docs.hetzner.cloud/v1') === 'hetzner', normalizaSlug('https://docs.hetzner.cloud/v1'));
comprueba('developers.circle.com -> circle, no "developers"',
  normalizaSlug('https://developers.circle.com') === 'circle', normalizaSlug('https://developers.circle.com'));
comprueba('el puerto no forma parte del slug',
  normalizaSlug('http://grafo:3000/api') === 'grafo', normalizaSlug('http://grafo:3000/api'));
comprueba('un nombre literal se respeta (no toda entrada es URL)',
  normalizaSlug('Notion') === 'notion');
// Si TODO fuera generico no debe quedar cadena vacia: peor que un slug raro es ninguno.
comprueba('si todo el host es generico, devuelve algo y no cadena vacia',
  normalizaSlug('https://docs.api.dev').length > 0, normalizaSlug('https://docs.api.dev'));

// --- 2. Sufijo descriptivo: telegram vs telegram-bot -----------------------
const impresos = { 'telegram-bot': { grade: 'A', medicion: 'scorecard' } };
comprueba('casa `telegram` con el directorio `telegram-bot`',
  casa('telegram', impresos)?.grade === 'A');
comprueba('no casa con algo que solo comparte prefijo de palabra',
  casa('tele', impresos) === null);

// --- 3. Herencia de grados: la regeneracion que borro A/87 -----------------
// El 2026-07-26 un --emit-index ingenuo degrado grados ya medidos a null.
const deLibreria = { supabase: { grade: null, medicion: 'no_disponible' } };
const heredado = heredaGrados(deLibreria, { supabase: { grade: 'A', score: 87 } });
comprueba('un grado no medible se hereda del indice',
  heredado.supabase.grade === 'A' && heredado.supabase.score === 87);
comprueba('y se MARCA como heredado, no se hace pasar por medido',
  heredado.supabase.medicion === 'heredado_del_indice');

const medido = heredaGrados({ x: { grade: 'B', medicion: 'scorecard' } }, { x: { grade: 'A' } });
comprueba('lo medido AHORA manda: el indice no pisa un grado real',
  medido.x.grade === 'B' && medido.x.medicion === 'scorecard');

// --- 4. El bug del `or` encadenado ----------------------------------------
// Un objeto con grade:null es truthy: un `or` lo elegiria y nunca alcanzaria el alias.
const conAlias = heredaGrados(
  { 'telegram-bot': { grade: null, medicion: 'no_disponible' } },
  { 'telegram-bot': { grade: null }, telegram: { grade: 'A', score: 83 } },
);
comprueba('elige el candidato que TIENE grado, no el primero que existe',
  conAlias['telegram-bot'].grade === 'A', `grade=${conAlias['telegram-bot'].grade}`);

// --- 5. "No medido != aprobado" -------------------------------------------
const servicios = [{ servicio: 'x', slug: 'x', estado: 'cli-impreso' }];
const sinGrado = clasifica(servicios, { x: { grade: null, medicion: 'dogfood' } }, 'A');
comprueba('impreso SIN grado no cuenta como aprobado: va a `sinGrado`',
  sinGrado.sinGrado.length === 1 && sinGrado.desactualizados.length === 0);
comprueba('y NO se cuela como faltante (existe, solo que no se sabe su grado)',
  sinGrado.faltantes.length === 0);

const bajo = clasifica(servicios, { x: { grade: 'C', medicion: 'scorecard' } }, 'A');
comprueba('grado C por debajo del minimo A se reporta como desactualizado',
  bajo.desactualizados.length === 1);
const cumple = clasifica(servicios, { x: { grade: 'A', medicion: 'scorecard' } }, 'A');
comprueba('grado A cumple el minimo A y no genera ruido',
  cumple.desactualizados.length === 0 && cumple.sinGrado.length === 0);

// --- 6. Degradar, no morir: los 13 dias de silencio ------------------------
// Una clave rara lanzo ValueError y el auditor nocturno murio sin que nadie se enterara
// del 2026-07-26 al 08-08.
let sobrevivio = true;
let r;
try {
  r = clasifica([null, 'basura', { sinServicio: true }, { servicio: 'ok', slug: 'ok', estado: 'cli-impreso' }], {}, 'A');
} catch {
  sobrevivio = false;
}
comprueba('una entrada malformada NO mata la auditoria', sobrevivio);
comprueba('las malformadas se reportan, no se ignoran en silencio',
  sobrevivio && r.malformados.length === 3, sobrevivio ? `${r.malformados.length} reportadas` : '');
comprueba('y las entradas buenas se siguen auditando despues de una mala',
  sobrevivio && r.faltantes.length === 1);

// --- 7. Lo que NO se audita -----------------------------------------------
comprueba('un `mcp` no se audita como CLI impreso',
  clasifica([{ servicio: 'm', estado: 'mcp' }], {}, 'A').faltantes.length === 0);
comprueba('un `cli-oficial` tampoco: existe upstream, no en la libreria',
  clasifica([{ servicio: 'playwright', estado: 'cli-oficial' }], {}, 'A').faltantes.length === 0);
comprueba('un `deprecated` no se audita ni cuenta',
  clasifica([{ servicio: 'd', estado: 'cli-impreso', deprecated: true }], {}, 'A').faltantes.length === 0);
comprueba('un `sin-asignar` SI se reporta: nadie lo decidio',
  clasifica([{ servicio: 's', estado: 'sin-asignar' }], {}, 'A').sinAsignar.length === 1);

// --- 8. La libreria se lee del disco, y "sin scorecard" se dice -----------
const tmp = mkdtempSync(join(tmpdir(), 'imprenta-'));
try {
  mkdirSync(join(tmp, 'conscorecard'));
  writeFileSync(join(tmp, 'conscorecard', 'scorecard.json'), '{"grade":"A","score":91}');
  mkdirSync(join(tmp, 'solodogfood'));
  writeFileSync(join(tmp, 'solodogfood', 'dogfood-results.json'), '{"verdict":"PASS"}');
  mkdirSync(join(tmp, 'pelado'));
  mkdirSync(join(tmp, 'dogfoodroto'));
  writeFileSync(join(tmp, 'dogfoodroto', 'dogfood-results.json'), '{ no es json');

  const leido = escaneaLibreria(tmp);
  comprueba('con scorecard: grado leido y `medicion: scorecard`',
    leido.conscorecard.grade === 'A' && leido.conscorecard.medicion === 'scorecard');
  comprueba('sin scorecard pero con dogfood: `medicion: dogfood`, grado null',
    leido.solodogfood.medicion === 'dogfood' && leido.solodogfood.grade === null);
  comprueba('sin nada: `no_disponible` — que es la verdad, no un cero',
    leido.pelado.medicion === 'no_disponible' && leido.pelado.grade === null);
  comprueba('un dogfood ilegible no revienta el escaneo ni inventa un verdict',
    leido.dogfoodroto.medicion === 'no_disponible' && leido.dogfoodroto.verdict === null);

  comprueba('CLI_PRESS_LIBRARY tiene prioridad sobre ~/printing-press/library',
    localizaLibreria({ CLI_PRESS_LIBRARY: tmp, HOME: '/no/existe' }) === tmp);
  comprueba('sin libreria en ningun candidato, devuelve null (no una ruta inventada)',
    localizaLibreria({ CLI_PRESS_LIBRARY: '', HOME: '/no/existe' }) === null);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// --- 9. Los fallos que pago ESTE proyecto (2026-08-25, alineacion con la imprenta real) ---
const tmp2 = mkdtempSync(join(tmpdir(), 'imprenta2-'));
try {
  // 9a. El lector de scorecards era una casualidad. El JSON real de la press envuelve todo
  // en `scorecard` y el grado vive en `overall_grade`; la regex `\b[A-F]\b` sobre los
  // primeros 2000 caracteres acertaba solo porque ninguna clave anterior tenia una letra
  // suelta A-F. Este caso pone una delante a proposito.
  mkdirSync(join(tmp2, 'press'));
  writeFileSync(join(tmp2, 'press', 'scorecard.json'), JSON.stringify({
    scorecard: {
      region: 'E',
      overall_grade: 'A',
      steinberger: { total: 96 },
      unscored_dimensions: ['auth_protocol', 'live_api_verification'],
    },
  }));
  writeFileSync(join(tmp2, 'press', '.printing-press.json'), '{"printing_press_version":"4.27.0"}');
  const leido2 = escaneaLibreria(tmp2);
  comprueba('el scorecard de la press se PARSEA, no se adivina con una regex',
    leido2.press.grade === 'A', `grade=${leido2.press.grade}`);
  comprueba('una letra suelta anterior al grado ya no se cuela como grado',
    leido2.press.grade !== 'E');
  comprueba('las dimensiones sin puntuar viajan: un "A" parcial no se lee como completo',
    leido2.press.sinPuntuar.length === 2);
  comprueba('se lee la version de la press con la que se imprimio',
    leido2.press.pressVersion === '4.27.0');

  // 9b. Nombres de entorno upstream. Conocer solo `CLI_PRESS_LIBRARY` era no encontrar la
  // libreria de una maquina configurada como manda la imprenta de verdad.
  comprueba('se respeta PRESS_LIBRARY (el nombre de upstream)',
    localizaLibreria({ PRESS_LIBRARY: tmp2, HOME: '/no/existe' }) === tmp2);
  comprueba('CLI_PRESS_LIBRARY sigue mandando sobre PRESS_LIBRARY (compatibilidad)',
    localizaLibreria({ CLI_PRESS_LIBRARY: tmp2, PRESS_LIBRARY: '/no/existe', HOME: '/no' }) === tmp2);
} finally {
  rmSync(tmp2, { recursive: true, force: true });
}

// 9c. El verde-en-vacio. `audita-imprenta` decia "todo CLI del manifiesto esta impreso"
// con CERO declarados y cuatro en el disco: verdadero sobre el conjunto vacio e inutil.
const enDisco = { hcloud: { grade: 'A' }, 'telegram-bot': { grade: 'A' } };
comprueba('lo impreso que el manifiesto no declara se reporta, no se calla',
  sinDeclarar([{ servicio: 'otro', slug: 'otro', estado: 'mcp' }], enDisco).length === 2);
comprueba('lo que SI esta declarado no se reporta como sin declarar',
  sinDeclarar([{ servicio: 'hetzner', slug: 'hcloud', estado: 'cli-impreso' }], enDisco)
    .join() === 'telegram-bot');
comprueba('con el disco vacio no inventa faltantes',
  sinDeclarar([{ servicio: 'x', slug: 'x', estado: 'cli-impreso' }], {}).length === 0);

// 9d. Deriva de version: el mismo riesgo que `@latest` en `.mcp.json`, un nivel mas abajo.
const decl = [{ servicio: 'h', slug: 'h', estado: 'cli-impreso', press_version: '4.27.0' }];
comprueba('declarar una version que el disco desmiente es FALLO, no matiz',
  clasifica(decl, { h: { grade: 'A', pressVersion: '4.28.0' } }, 'A').divergentes.length === 1);
comprueba('coincidir no genera ruido',
  clasifica(decl, { h: { grade: 'A', pressVersion: '4.27.0' } }, 'A').divergentes.length === 0);
// Sin dato en disco NO hay divergencia: "no se" nunca se pinta como "no coincide".
comprueba('sin version en disco no se inventa una divergencia',
  clasifica(decl, { h: { grade: 'A', pressVersion: null } }, 'A').divergentes.length === 0);

// 9f. El grado dejo de ser una letra. La press 4.31.1 escribe
// `"A (1 of 25 dimensions unverified: live_api_verification)"` en `overall_grade`, y la
// comparacion contra `min_grade` es de cadenas: sin normalizar, un CLI recien impreso con
// grado A salia como "REVISA: grado < minimo A". Detectado imprimiendo `polar`.
comprueba('el grado se extrae aunque venga con el sufijo de dimensiones sin verificar',
  normalizaGrado('A (1 of 25 dimensions unverified: live_api_verification)') === 'A');
comprueba('una letra pelada sigue funcionando',
  normalizaGrado('B') === 'B' && normalizaGrado('A+') === 'A+');
comprueba('lo que no empieza por un grado da null, no una cadena rara',
  normalizaGrado('sin datos') === null && normalizaGrado(null) === null);
const svcG = [{ servicio: 'g', slug: 'g', estado: 'cli-impreso' }];
comprueba('y por tanto un A con sufijo NO se reporta como desactualizado',
  clasifica(svcG, { g: { grade: normalizaGrado('A (1 of 25 dimensions unverified: x)') } }, 'A')
    .desactualizados.length === 0);

// 9g. Dogfood en rojo. `verdict` se leia y no se usaba: un CLI medido Y FALLANDO pasaba como
// conforme, que es peor que uno sin medir — el sin medir al menos se declara. Reconocerlo en
// el manifiesto lo convierte en defecto conocido; callarlo lo deja en defecto escondido.
const svcD = [{ servicio: 'd', slug: 'd', estado: 'cli-impreso' }];
const rojoEscondido = clasifica(svcD, { d: { grade: 'A', verdict: 'FAIL' } }, 'A').dogfoodEnRojo;
comprueba('un dogfood FAIL no declarado se reporta como ESCONDIDO',
  rojoEscondido.length === 1 && rojoEscondido[0].reconocido === false);
const svcDR = [{ servicio: 'd', slug: 'd', estado: 'cli-impreso', dogfood_conocido: 'FAIL' }];
comprueba('reconocerlo en el manifiesto lo convierte en defecto CONOCIDO',
  clasifica(svcDR, { d: { grade: 'A', verdict: 'FAIL' } }, 'A').dogfoodEnRojo[0].reconocido === true);
comprueba('un dogfood PASS no genera ruido',
  clasifica(svcD, { d: { grade: 'A', verdict: 'PASS' } }, 'A').dogfoodEnRojo.length === 0);
// WARN no es FAIL: dos de los CLIs de la libreria real estan en WARN y convertirlos en
// hallazgo seria ruido que se aprende a ignorar.
comprueba('un WARN no se cuenta como rojo',
  clasifica(svcD, { d: { grade: 'A', verdict: 'WARN' } }, 'A').dogfoodEnRojo.length === 0);

// 9e. Grado parcial: suficiente en lo medido, con dimensiones sin puntuar.
const svcP = [{ servicio: 'p', slug: 'p', estado: 'cli-impreso' }];
comprueba('un grado A con dimensiones sin puntuar se marca PARCIAL',
  clasifica(svcP, { p: { grade: 'A', sinPuntuar: ['auth_protocol'] } }, 'A').parciales.length === 1);
comprueba('un grado A completo no se marca parcial',
  clasifica(svcP, { p: { grade: 'A', sinPuntuar: [] } }, 'A').parciales.length === 0);

if (fallos > 0) {
  console.log(rojo(`\n✗ ${fallos} caso(s) en rojo. Cada uno es un bug que el origen ya pago:`));
  console.log('  volver a pagarlo es la definicion de no haber aprendido nada.');
  process.exit(1);
}
console.log(verde('\n✓ Nucleo de la imprenta correcto.'));
