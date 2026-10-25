#!/usr/bin/env node
/**
 * Verificador del manifiesto de gates (`.claude/gates.json`). Corre dentro de `npm run validate`.
 *
 * Que vigila, y por que cada cosa:
 *
 *   1. El manifiesto carga fail-closed (las cinco invariantes de `lib/gates.mjs`). Si no
 *      carga, todo lo demas es ruido: se reporta eso y se para.
 *   2. `validate` y `predeploy` DERIVAN del manifiesto y no vuelven a llevar la lista a mano.
 *      Es la comprobacion que impide reintroducir la divergencia que este trabajo cerro: dos
 *      cadenas de `&&` copiadas una de otra, sin nada que las comparase.
 *   3. Todo script de package.json con forma de gate esta declarado en el manifiesto. Anadir
 *      un verificador nuevo y olvidar declararlo lo dejaria fuera del padron en silencio.
 *   4. Todo archivo de pruebas en disco lo alcanza algun gate (activo o declarado inactivo).
 *      Esta es la comprobacion que habria cazado `scripts/prueba-a2a.ts`: existia, probaba la
 *      opacidad del puente A2A, y NINGUN script lo corria — asi que se podrio sin testigos.
 *      Un archivo de pruebas que nada ejecuta no es cobertura: es decoracion.
 *   5. El CI de GitHub (`.github/workflows/gates.yml`) es la proyeccion del padron (D-SS-8,
 *      `lib/ci.mjs`). Editado a mano, borrado, o con el padron cambiado sin regenerarlo: rojo.
 *      Es el patron de `GEMINI.md`: lo generado no se toca, se regenera.
 *
 * Uso:  node scripts/verifica-gates.mjs             (el gate)
 *       node scripts/verifica-gates.mjs --prueba    (la prueba de la prueba: siembra nueve
 *         violaciones —runner sin implementacion activo, typo de runner en un gate APAGADO,
 *         gate activo que no se puede ejecutar, `validate` con la cadena a mano de vuelta,
 *         inactivo sin motivo, un archivo de pruebas huerfano, el CI editado a mano, el CI
 *         borrado y el padron cambiado sin regenerar el CI— y exige que las nueve caigan)
 *       node scripts/verifica-gates.mjs --lista     (el padron entero, legible)
 * Exit: 0 en verde · 1 en rojo.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargaManifiesto, gatesDelPerfil, inactivos, ManifiestoInvalido, MANIFIESTO } from './lib/gates.mjs';
import { proyectaGithub, RUTA_GITHUB } from './lib/ci.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const ambar = (s) => `\x1b[33m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;

/** Scripts de package.json con forma de gate: verifican algo y pueden ponerse rojos. */
const FORMA_DE_GATE = /^(verifica|verify|prueba|audita|vigila|mide|erp|revisa):|^(regresion|typecheck|lint|build)$/;
/**
 * Escotilla declarada: un script con forma de gate que NO lo es (genera, exporta, mide a
 * mano). Hoy esta VACIA a proposito — los 35 scripts con esta forma estan los 35 en el
 * padron. Excusar uno aqui es una decision visible, que es justo lo contrario de olvidarlo.
 */
const NO_SON_GATE = new Set([]);

/** Archivos de pruebas en disco: los que algun gate deberia alcanzar. */
function pruebasEnDisco(base = raiz) {
  const salida = [];
  const anda = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', '.next', 'dist', '.claude'].includes(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) anda(p);
      else if (/^prueba[-.].*\.(ts|mjs)$/.test(e.name) || /\/pruebas\/[^/]+\.ts$/.test(p.replace(/\\/g, '/'))) {
        salida.push(relative(base, p).replace(/\\/g, '/'));
      }
    }
  };
  anda(base);
  return salida.sort();
}

/** Resuelve un comando a los caminos que toca, expandiendo `npm run X` un nivel. */
function caminosDelComando(comando, scripts) {
  const partes = comando.trim().split(/\s+/);
  const texto = partes[0] === 'npm' && partes[1] === 'run' ? (scripts[partes[2]] ?? '') : comando;
  return texto.split(/\s+/).filter((t) => !t.startsWith('-') && /[/]/.test(t));
}

const comoRegex = (glob) =>
  new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');

/**
 * Un archivo esta cubierto si algun gate (activo o inactivo) lo alcanza: por los caminos que
 * se deducen de su comando, o por los que declara en `cubre` cuando no se deducen.
 */
function cubierto(archivo, manifiesto, scripts) {
  for (const gate of manifiesto.gates) {
    const caminos = [...gate.cubre, ...(gate.comando ? caminosDelComando(gate.comando, scripts) : [])];
    for (const camino of caminos) {
      if (camino === archivo || comoRegex(camino).test(archivo)) return gate.nombre;
    }
  }
  return null;
}

/** Las comprobaciones, puras sobre sus entradas: `--prueba` las llama con entradas mutadas. */
function comprobaciones({ manifiestoTexto, scripts, pruebas, paquete, ci }) {
  const fallos = [];
  const ok = [];
  const mete = (d, cond, pista) => (cond ? ok.push(d) : fallos.push({ descripcion: d, pista }));

  let manifiesto;
  try {
    manifiesto = cargaManifiesto(raiz, manifiestoTexto);
    ok.push(`${MANIFIESTO} carga: las cinco invariantes fail-closed se sostienen`);
  } catch (e) {
    if (!(e instanceof ManifiestoInvalido)) throw e;
    return { ok, fallos: [{ descripcion: `${MANIFIESTO} INVALIDO`, pista: e.message }], manifiesto: null };
  }

  // 2. Las dos cadenas derivan del runner y no vuelven a llevar la lista a mano.
  for (const perfil of ['validate', 'predeploy']) {
    const texto = scripts[perfil] ?? '';
    mete(
      `el script \`${perfil}\` deriva del manifiesto (corre-gates.mjs ${perfil})`,
      new RegExp(`corre-gates\\.mjs\\s+${perfil}\\b`).test(texto),
      `\`${perfil}\` dejo de derivar del padron: sin esto vuelve la lista a mano que este manifiesto vino a matar`,
    );
    const aMano = (texto.match(/npm run /g) ?? []).length;
    mete(
      `el script \`${perfil}\` no reintroduce una cadena de gates a mano`,
      aMano === 0,
      `lleva ${aMano} \`npm run\` inline: la lista volvio a vivir en package.json, donde nadie la difea`,
    );
  }

  // 3. Todo script con forma de gate esta en el padron.
  const declarados = new Set(manifiesto.gates.map((g) => g.nombre));
  const conFormaDeGate = Object.keys(scripts).filter((s) => FORMA_DE_GATE.test(s) && !NO_SON_GATE.has(s));
  const sinDeclarar = conFormaDeGate.filter((s) => !declarados.has(s));
  mete(
    `todo script con forma de gate esta declarado en el manifiesto (${conFormaDeGate.length} revisados)`,
    sinDeclarar.length === 0,
    `sin declarar: ${sinDeclarar.join(', ')} — un gate fuera del padron no lo corre ningun perfil y nadie lo nota`,
  );

  // 4. Ningun archivo de pruebas huerfano: la comprobacion que habria cazado prueba-a2a.ts.
  const huerfanos = pruebas.filter((p) => cubierto(p, manifiesto, scripts) === null);
  mete(
    `ningun archivo de pruebas queda huerfano (${pruebas.length} revisados)`,
    huerfanos.length === 0,
    `nadie los corre: ${huerfanos.join(', ')} — un archivo de pruebas que ningun gate alcanza se podre sin testigos (paso con scripts/prueba-a2a.ts)`,
  );

  // 5. Cada perfil declarado tiene al menos un gate activo: un perfil vacio es papel.
  for (const perfil of Object.keys(manifiesto.perfiles)) {
    mete(
      `el perfil \`${perfil}\` tiene gates activos`,
      gatesDelPerfil(manifiesto, perfil).length > 0,
      'un perfil sin gates activos se invoca y no verifica nada',
    );
  }

  // 6. `validate` sella al cerrar: sin sello, `predeploy` repite el gate entero en el servidor.
  mete(
    'el perfil `validate` declara su cierre con sello',
    manifiesto.perfiles.validate?.cierre === 'sella',
    'sin cierre, `predeploy` no puede atajar y el gate se paga dos veces',
  );

  // 7. El CI de GitHub es la proyeccion del padron (D-SS-8): editado a mano o borrado, rojo.
  const regenera = `npm run proyecta:gates -- --ci github --salida ${RUTA_GITHUB}`;
  mete(
    `el CI de GitHub (\`${RUTA_GITHUB}\`) es la proyeccion del padron`,
    ci === proyectaGithub(manifiesto, paquete),
    ci === null
      ? `no existe: sin el, nadie re-ejecuta los gates fuera de la maquina de quien los corrio. ${regenera}`
      : `difiere de la proyeccion: se edito a mano, o el padron cambio sin regenerarlo. ${regenera}`,
  );

  return { ok, fallos, manifiesto };
}

// --- La prueba de la prueba ---------------------------------------------------
/** Muta el manifiesto crudo y devuelve el texto sembrado. */
function siembra(crudo, f) {
  const copia = JSON.parse(crudo);
  f(copia);
  return JSON.stringify(copia);
}

function prueba(crudo, scripts, pruebas, paquete, ci) {
  // Linea base: si el manifiesto real ya estuviera en rojo, cada siembra "caeria" por el
  // error de base y la prueba no probaria nada (leccion del 2026-09-25, marca-blanca).
  const base = comprobaciones({ manifiestoTexto: crudo, scripts, pruebas, paquete, ci });
  if (base.fallos.length) {
    console.log(rojo(`la linea base ya tiene ${base.fallos.length} fallo(s): la prueba no probaria nada`));
    for (const f of base.fallos) console.log(gris(`    ${f.descripcion} — ${f.pista}`));
    process.exit(1);
  }
  const casos = [
    ['runner sin implementacion, ACTIVO', {
      manifiestoTexto: siembra(crudo, (m) => { m.gates[0].runner = 'modelo'; }),
    }],
    ['typo de runner en un gate APAGADO', {
      manifiestoTexto: siembra(crudo, (m) => { m.gates.find((g) => !g.activo).runner = 'comanddo'; }),
    }],
    ['gate ACTIVO que no se puede ejecutar', {
      manifiestoTexto: siembra(crudo, (m) => { m.gates[0].comando = 'npm run script-que-no-existe'; }),
    }],
    ['`validate` con la cadena a mano de vuelta', {
      scripts: { ...scripts, validate: 'npm run typecheck && npm run lint && npm run build' },
    }],
    ['gate inactivo SIN motivo', {
      manifiestoTexto: siembra(crudo, (m) => { delete m.gates.find((g) => !g.activo).motivo; }),
    }],
    ['archivo de pruebas huerfano', {
      pruebas: [...pruebas, 'scripts/prueba-inventada-que-nadie-corre.ts'],
    }],
    ['el CI editado a mano (solo lint)', {
      ci: (ci ?? '').replace('node scripts/corre-gates.mjs validate --sigue', 'npm run lint'),
    }],
    ['el CI borrado', { ci: null }],
    ['el padron cambia y el CI no se regenera', {
      manifiestoTexto: siembra(crudo, (m) => { m.gates.find((g) => g.activo && g.perfiles.includes('validate')).timeout_s += 600; }),
    }],
  ];
  let cazadas = 0;
  for (const [nombre, override] of casos) {
    const r = comprobaciones({ manifiestoTexto: crudo, scripts, pruebas, paquete, ci, ...override });
    if (r.fallos.length > 0) {
      cazadas += 1;
      console.log(`${verde('CAZADA')} ${nombre}`);
      console.log(gris(`       ↳ ${r.fallos[0].descripcion}: ${r.fallos[0].pista.slice(0, 140)}`));
    } else {
      console.log(`${rojo('VIVA  ')} ${nombre} — el verificador no la vio`);
    }
  }
  console.log(`\nprueba de la prueba: ${cazadas} de ${casos.length} siembras cazadas`);
  process.exit(cazadas === casos.length ? 0 : 1);
}

// --- Entrada -----------------------------------------------------------------
const paquete = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'));
const scripts = paquete.scripts ?? {};
const crudo = existsSync(join(raiz, MANIFIESTO)) ? readFileSync(join(raiz, MANIFIESTO), 'utf8') : '{}';
const pruebas = pruebasEnDisco();
const ci = existsSync(join(raiz, RUTA_GITHUB)) ? readFileSync(join(raiz, RUTA_GITHUB), 'utf8') : null;

if (process.argv.includes('--prueba')) prueba(crudo, scripts, pruebas, paquete, ci);

const { ok, fallos, manifiesto } = comprobaciones({ manifiestoTexto: crudo, scripts, pruebas, paquete, ci });

if (process.argv.includes('--lista') && manifiesto) {
  for (const perfil of Object.keys(manifiesto.perfiles)) {
    const gs = gatesDelPerfil(manifiesto, perfil);
    console.log(`\n\x1b[1m${perfil}\x1b[0m (${gs.length} activos) — ${manifiesto.perfiles[perfil].descripcion}`);
    for (const g of gs) console.log(`  ${verde('●')} ${g.nombre.padEnd(24)} ${gris(g.comando)}`);
  }
  console.log(`\n\x1b[1minactivos declarados\x1b[0m (${inactivos(manifiesto).length}) — no cuentan como pasados`);
  for (const g of inactivos(manifiesto)) {
    console.log(`  ${ambar('○')} ${g.nombre.padEnd(24)} ${gris(g.comando)}`);
    console.log(gris(`      motivo: ${g.motivo}`));
    console.log(gris(`      falta:  ${g.falta}`));
  }
  console.log('');
  process.exit(fallos.length === 0 ? 0 : 1);
}

for (const linea of ok) console.log(`  ${verde('✓')} ${linea}`);
for (const f of fallos) {
  console.log(`  ${rojo('✗')} ${f.descripcion}`);
  console.log(gris(`      ↳ ${f.pista}`));
}
console.log('');
if (fallos.length === 0) {
  const activos = manifiesto.gates.filter((g) => g.activo).length;
  console.log(verde(`Manifiesto de gates coherente: ${ok.length} comprobaciones en verde.`));
  console.log(gris(`  ${activos} gates activos, ${inactivos(manifiesto).length} declarados inactivos con motivo, ${Object.keys(manifiesto.perfiles).length} perfiles.`));
  process.exit(0);
}
console.log(rojo(`Manifiesto de gates DIVERGENTE: ${fallos.length} de ${ok.length + fallos.length} comprobaciones fallaron.`));
process.exit(1);
