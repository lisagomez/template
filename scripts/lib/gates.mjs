/**
 * Cargador del manifiesto de gates (`.claude/gates.json`) — la mitad fail-closed.
 *
 * Lo comparten el runner (`corre-gates.mjs`) y el verificador (`verifica-gates.mjs`): una
 * sola implementacion, no dos que deriven. Es el mismo principio que el manifiesto aplica a
 * los gates, aplicado al propio cargador.
 *
 * Las cinco invariantes que se validan ANTES de aceptar un solo gate (si una falla, el
 * manifiesto es invalido y el runner NO arranca — no corre "los demas"):
 *
 *   1. Runner desconocido (un typo) = invalido AUNQUE el gate este inactivo. Un typo en un
 *      gate apagado es una bomba de relojeria: el dia que alguien lo active, no existe.
 *   2. Gate activo con runner `modelo` = invalido: esta declarado sin implementacion.
 *   3. Gate activo cuyo comando no se puede resolver (script npm inexistente, archivo que no
 *      esta en disco) = invalido. Es imposible por diseno activar una regla incomprobable.
 *   4. Gate inactivo sin `motivo` y sin `falta` = invalido. Un gate apagado sin razon escrita
 *      se lee, meses despues, como uno que pasa (anti-sello-de-goma).
 *   5. Gate activo sin perfil = invalido (nadie lo correria); gate inactivo CON perfil =
 *      invalido (se contaria en un perfil sin correr).
 *
 * Origen del diseno: `businessos/supervisor-a2a/gates.py` de `hermes-os-a2a`, leido el
 * 2026-09-26. De ahi vienen los tres estados (`paso`/`fallo`/`no_ejecutable`) y la regla de
 * oro: no correr NO es pasar. Lo que se anade aqui es `motivo`/`falta` obligatorios en los
 * inactivos, que alla no existen: `software.toml` apaga `code_review` y `security_review` sin
 * decir por que.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const MANIFIESTO = '.claude/gates.json';
export const RUNNERS_EJECUTABLES = ['comando'];
export const RUNNERS_DECLARADOS = [...RUNNERS_EJECUTABLES, 'modelo'];
export const TIMEOUT_DEFAULT_S = 600;

export class ManifiestoInvalido extends Error {}

const exige = (condicion, mensaje) => {
  if (!condicion) throw new ManifiestoInvalido(mensaje);
};

const noVacio = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * Resuelve si un comando se puede ejecutar de verdad, sin ejecutarlo.
 * Devuelve null si se puede; si no, la razon por la que no.
 */
export function razonNoEjecutable(comando, raiz, scriptsNpm) {
  const partes = comando.trim().split(/\s+/);
  if (partes[0] === 'npm' && partes[1] === 'run') {
    const script = partes[2];
    if (!noVacio(script)) return '`npm run` sin nombre de script';
    if (!(script in scriptsNpm)) return `el script npm \`${script}\` no existe en package.json`;
    return null;
  }
  if (partes[0] === 'node' || partes[0] === 'bash' || partes[0] === 'npx') {
    const archivo = partes.slice(1).find((p) => !p.startsWith('-') && /[/.]/.test(p));
    if (!archivo) return `no se pudo identificar el archivo que ejecuta \`${comando}\``;
    if (!existsSync(join(raiz, archivo))) return `el archivo \`${archivo}\` no esta en disco`;
    return null;
  }
  return `forma de comando no reconocida: \`${partes[0]}\` (se esperaba npm/node/bash/npx)`;
}

/** Valida un gate crudo y lo devuelve normalizado. Lanza si el manifiesto es invalido. */
function validaGate(crudo, indice, vistos, perfilesDeclarados, raiz, scriptsNpm) {
  const donde = `gate #${indice + 1}`;
  const nombre = crudo.nombre;
  exige(noVacio(nombre), `${donde}: sin \`nombre\``);
  exige(!vistos.has(nombre), `gate \`${nombre}\`: nombre duplicado`);
  vistos.add(nombre);

  // Invariante 1: el runner se valida SIEMPRE, activo o no.
  exige(
    RUNNERS_DECLARADOS.includes(crudo.runner),
    `gate \`${nombre}\`: runner desconocido ${JSON.stringify(crudo.runner)} ` +
      `(declarados: ${RUNNERS_DECLARADOS.join(', ')}) — un typo en un gate apagado es una bomba de relojeria`,
  );
  exige(noVacio(crudo.guarda), `gate \`${nombre}\`: sin \`guarda\` (que superficie protege)`);
  exige(noVacio(crudo.evidencia), `gate \`${nombre}\`: sin \`evidencia\` (que deja al correr)`);
  exige(typeof crudo.activo === 'boolean', `gate \`${nombre}\`: \`activo\` tiene que ser booleano`);
  exige(Array.isArray(crudo.perfiles), `gate \`${nombre}\`: \`perfiles\` tiene que ser una lista`);
  // `cubre` es opcional: declara que archivos alcanza este gate cuando no se deducen de su
  // comando (p. ej. un runner que delega en las suites de `tools/`). Declararlo es lo que
  // permite a la comprobacion de huerfanos saber que ya estan cubiertos.
  exige(
    crudo.cubre === undefined || (Array.isArray(crudo.cubre) && crudo.cubre.every(noVacio)),
    `gate \`${nombre}\`: \`cubre\` tiene que ser una lista de patrones no vacios`,
  );
  for (const p of crudo.perfiles) {
    exige(
      perfilesDeclarados.includes(p),
      `gate \`${nombre}\`: perfil ${JSON.stringify(p)} no declarado en \`perfiles\``,
    );
  }

  if (crudo.activo) {
    // Invariante 2: `modelo` no tiene implementacion, no se puede activar.
    exige(
      crudo.runner !== 'modelo',
      `gate \`${nombre}\`: runner 'modelo' esta declarado SIN implementacion — no puede estar activo`,
    );
    exige(noVacio(crudo.comando), `gate \`${nombre}\`: runner 'comando' sin \`comando\``);
    // Invariante 3: activar una regla incomprobable es imposible por diseno.
    const razon = razonNoEjecutable(crudo.comando, raiz, scriptsNpm);
    exige(razon === null, `gate \`${nombre}\` esta ACTIVO y no se puede ejecutar: ${razon}`);
    // Invariante 5a.
    exige(crudo.perfiles.length > 0, `gate \`${nombre}\`: activo y sin perfil — nadie lo correria`);
  } else {
    // Invariante 4: un inactivo sin razon escrita se lee como uno que pasa.
    exige(noVacio(crudo.motivo), `gate \`${nombre}\`: inactivo SIN \`motivo\` — un gate apagado sin razon escrita se lee como uno que pasa`);
    exige(noVacio(crudo.falta), `gate \`${nombre}\`: inactivo SIN \`falta\` (que hace falta para activarlo)`);
    // Invariante 5b.
    exige(crudo.perfiles.length === 0, `gate \`${nombre}\`: inactivo pero listado en perfiles [${crudo.perfiles.join(', ')}] — se contaria sin correr`);
  }

  return {
    nombre,
    runner: crudo.runner,
    comando: crudo.comando ?? null,
    guarda: crudo.guarda,
    evidencia: crudo.evidencia,
    perfiles: crudo.perfiles,
    cubre: crudo.cubre ?? [],
    activo: crudo.activo,
    motivo: crudo.motivo ?? null,
    falta: crudo.falta ?? null,
    timeout_s: Number(crudo.timeout_s ?? TIMEOUT_DEFAULT_S),
  };
}

/**
 * Carga y valida el manifiesto ENTERO antes de devolver un solo gate.
 * `texto` permite validar un manifiesto que no esta en disco (lo usa `--prueba`).
 */
export function cargaManifiesto(raiz, texto = null) {
  const ruta = join(raiz, MANIFIESTO);
  if (texto === null) {
    exige(existsSync(ruta), `no existe ${MANIFIESTO}: sin manifiesto no hay gate que derivar`);
    texto = readFileSync(ruta, 'utf8');
  }
  let data;
  try {
    data = JSON.parse(texto);
  } catch (e) {
    throw new ManifiestoInvalido(`${MANIFIESTO} no es JSON valido: ${e.message}`);
  }
  const scriptsNpm = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).scripts ?? {};

  exige(data.perfiles && typeof data.perfiles === 'object', `${MANIFIESTO}: sin \`perfiles\``);
  const perfilesDeclarados = Object.keys(data.perfiles);
  exige(perfilesDeclarados.length > 0, `${MANIFIESTO}: \`perfiles\` vacio`);
  exige(Array.isArray(data.gates) && data.gates.length > 0, `${MANIFIESTO}: sin gates — un gate sin reglas no verifica nada`);

  const vistos = new Set();
  const gates = data.gates.map((g, i) => validaGate(g, i, vistos, perfilesDeclarados, raiz, scriptsNpm));

  for (const [perfil, cfg] of Object.entries(data.perfiles)) {
    for (const nombre of cfg.siempre ?? []) {
      const gate = gates.find((g) => g.nombre === nombre);
      exige(gate, `perfil \`${perfil}\`: \`siempre\` nombra un gate inexistente: \`${nombre}\``);
      exige(gate.perfiles.includes(perfil), `perfil \`${perfil}\`: \`siempre\` nombra \`${nombre}\`, que no pertenece al perfil`);
    }
  }
  return { perfiles: data.perfiles, gates, runners: data.runners ?? {} };
}

/** Los gates ACTIVOS de un perfil, en el orden del manifiesto. */
export function gatesDelPerfil(manifiesto, perfil) {
  exige(perfil in manifiesto.perfiles, `perfil desconocido: \`${perfil}\` (declarados: ${Object.keys(manifiesto.perfiles).join(', ')})`);
  return manifiesto.gates.filter((g) => g.activo && g.perfiles.includes(perfil));
}

/** Los gates declarados pero apagados, con su motivo. Nunca se cuentan como pasados. */
export function inactivos(manifiesto) {
  return manifiesto.gates.filter((g) => !g.activo);
}
