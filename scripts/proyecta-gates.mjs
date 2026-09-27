#!/usr/bin/env node
/**
 * Proyecta el manifiesto de gates al formato que consume el Supervisor de `hermes-os-a2a`
 * (`businessos/supervisor-a2a/reglas/software.toml`).
 *
 * POR QUE EXISTE. Medido el 2026-09-26: ese `software.toml` transcribe A MANO los gates de
 * este repo — `npm run build`, `npm run typecheck`, `npm run lint`, `sin_any`,
 * `sin_secretos`, `archivos_max_500`, `rls_en_migraciones`. Son las reglas de AGENTS.md,
 * copiadas en otro repositorio, sin nada que compare las dos copias. Dos verdades que
 * divergen: exactamente el patron que este repo ya pago con `GEMINI.md` (mantenido a mano
 * hasta que se GENERO) y con las cifras de los README.
 *
 * El arreglo es el mismo que el del 2026-09-21 entre `voz` y `dictado` (PR #140): **una sola
 * duena del contrato**. Este repo es el departamento de software de ese tri­o —su
 * `departamentos/desarrollo-software.md` §1 mapea las tareas del Ejecutor una a una sobre
 * los skills de aqui—, asi que los gates de software nacen aqui y alla se CONSUMEN.
 *
 * QUE NO HACE. No escribe nada en `hermes-os-a2a`: es otro repositorio, fuera del alcance de
 * escritura, igual que declararon los dos SDD que auditaron sus Fases 6 y 7 («este documento
 * es la auditoria, no el CDC»). Emite el artefacto por stdout o a un archivo; adoptarlo alla
 * es un CDC de ese proyecto, y lo firma su duena.
 *
 * Uso:  node scripts/proyecta-gates.mjs                 (el TOML por stdout)
 *       node scripts/proyecta-gates.mjs --salida <ruta>  (lo escribe)
 *       node scripts/proyecta-gates.mjs --diff <ruta-al-software.toml>  (compara con el suyo)
 * Exit: 0 siempre que el manifiesto cargue; con `--diff`, 1 si hay divergencia.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargaManifiesto, gatesDelPerfil, inactivos, ManifiestoInvalido, MANIFIESTO } from './lib/gates.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const ambar = (s) => `\x1b[33m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;

/**
 * Los gates del perfil `validate` que tienen sentido para un Supervisor que juzga un
 * worktree ajeno. Se EXCLUYEN los que verifican la fabrica misma (el padron, las specs, la
 * gobernanza, la imprenta, el inventario, la marca blanca, el corpus): no existen en el repo
 * del cliente, y un gate activo que no puede correr alla seria `no_ejecutable` = rechazo de
 * todo. Excluirlos es una decision declarada, no un olvido.
 */
const SOLO_DE_LA_FABRICA = /^(verifica:gates|verifica:specs|verify:gobernanza|regresion|audita:secretos|audita:fugas|audita:imprenta|prueba:imprenta|mide:contexto|verifica:routing|verifica:inventario|verifica:marca-blanca|prueba:inventario|prueba:contabilidad|prueba:laboratorio|prueba:historial|prueba:ajustes|prueba:trayectorias|verifica:trayectorias|prueba:tools)$/;

/** Los chequeos estaticos que el Supervisor implementa el mismo (chequeos_*.py). */
const ESTATICOS_DEL_SUPERVISOR = ['sin_any', 'sin_secretos', 'archivos_max_500', 'rls_en_migraciones'];

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

function proyecta(manifiesto) {
  const portables = gatesDelPerfil(manifiesto, 'validate').filter((g) => !SOLO_DE_LA_FABRICA.test(g.nombre));
  const l = [];
  l.push('# reglas/software.toml — GENERADO. No editar a mano.');
  l.push('#');
  l.push(`# Fuente: \`${MANIFIESTO}\` del template (SaaS Factory), perfil \`validate\`.`);
  l.push('# Generado por `npm run proyecta:gates` alla. El template es la duena del contrato:');
  l.push('# los gates del departamento de software nacen ahi y aqui se CONSUMEN. Editar este');
  l.push('# archivo a mano reintroduce la divergencia que la generacion vino a cerrar (el mismo');
  l.push('# patron que GEMINI.md ya pago en el template: copia a mano hasta que se genero).');
  l.push('#');
  l.push('# Adoptarlo es un CDC de ESTE proyecto: el template emite, no escribe.');
  l.push('');
  l.push('departamento = "software"');
  l.push('');
  l.push('# --- gates de comando: se re-ejecutan sobre el worktree, exit 0 = paso ---');
  for (const g of portables) {
    l.push('');
    l.push('[[gate]]');
    l.push(`regla = "${esc(g.nombre.replace(/:/g, '_'))}"`);
    l.push('runner = "comando"');
    l.push(`comando = "${esc(g.comando)}"`);
    l.push(`timeout_s = ${g.timeout_s}`);
    l.push(`# guarda: ${g.guarda.split('.')[0]}`);
  }
  l.push('');
  l.push('# --- chequeos estaticos deterministas: los implementa el Supervisor ---');
  l.push('# No salen del manifiesto del template porque alla los cubren `lint` y `typecheck`');
  l.push('# sobre TODO el arbol; aqui corren sobre los archivos cambiados del worktree.');
  for (const chequeo of ESTATICOS_DEL_SUPERVISOR) {
    l.push('');
    l.push('[[gate]]');
    l.push(`regla = "${chequeo}"`);
    l.push('runner = "estatico"');
    l.push(`chequeo = "${chequeo}"`);
  }
  const apagados = inactivos(manifiesto);
  if (apagados.length) {
    l.push('');
    l.push('# --- inactivos en el template, con su motivo (NO se cuentan como pasados) ---');
    l.push('# Se proyectan a proposito: alla `software.toml` apaga dos gates sin decir por que,');
    l.push('# y un gate apagado sin razon escrita se lee, meses despues, como uno que pasa.');
    for (const g of apagados) {
      l.push(`#   ${g.nombre}: ${g.motivo.split('.')[0]}.`);
    }
  }
  return l.join('\n') + '\n';
}

let manifiesto;
try {
  manifiesto = cargaManifiesto(raiz);
} catch (e) {
  if (!(e instanceof ManifiestoInvalido)) throw e;
  console.error(rojo(`Manifiesto invalido, no hay nada que proyectar: ${e.message}`));
  process.exit(1);
}

const toml = proyecta(manifiesto);
const argv = process.argv.slice(2);
const salida = argv[argv.indexOf('--salida') + 1];
const suyo = argv[argv.indexOf('--diff') + 1];

if (argv.includes('--salida') && salida) {
  writeFileSync(resolve(salida), toml);
  console.log(verde(`✓ proyeccion escrita en ${salida}`));
  process.exit(0);
}

if (argv.includes('--diff') && suyo) {
  if (!existsSync(suyo)) {
    console.error(rojo(`no existe el archivo a comparar: ${suyo}`));
    process.exit(1);
  }
  const texto = readFileSync(suyo, 'utf8');
  const reglasSuyas = [...texto.matchAll(/^regla\s*=\s*"([^"]+)"/gm)].map((m) => m[1]);
  const inactivosSuyos = [...texto.matchAll(/^\[\[gate\]\]\nregla = "([^"]+)"\nrunner = "modelo"\nactivo = false/gm)].map((m) => m[1]);
  const mias = [...proyecta(manifiesto).matchAll(/^regla\s*=\s*"([^"]+)"/gm)].map((m) => m[1]);
  const soloSuyas = reglasSuyas.filter((r) => !mias.includes(r));
  const soloMias = mias.filter((r) => !reglasSuyas.includes(r));
  const comandosSuyos = new Map([...texto.matchAll(/^regla = "([^"]+)"\nrunner = "comando"\ncomando = "([^"]+)"/gm)].map((m) => [m[1], m[2]]));

  console.log(`\nDiff de la proyeccion contra ${suyo}\n${'─'.repeat(72)}`);
  console.log(`  reglas alla: ${reglasSuyas.length}   ·   reglas en la proyeccion: ${mias.length}`);
  console.log(`\n  ${ambar('solo alla')} (${soloSuyas.length}): ${soloSuyas.join(', ') || '—'}`);
  for (const r of soloSuyas) {
    if (inactivosSuyos.includes(r)) console.log(gris(`      ${r}: declarado inactivo alla, SIN motivo escrito`));
  }
  console.log(`  ${ambar('solo en la proyeccion')} (${soloMias.length}): ${soloMias.join(', ') || '—'}`);
  const distintos = [...comandosSuyos.entries()].filter(([r, c]) => {
    const g = manifiesto.gates.find((x) => x.nombre.replace(/:/g, '_') === r);
    return g && g.comando !== c;
  });
  console.log(`  ${ambar('mismo nombre, comando distinto')} (${distintos.length}):`);
  for (const [r, c] of distintos) {
    const g = manifiesto.gates.find((x) => x.nombre.replace(/:/g, '_') === r);
    console.log(`      ${r}: alla \`${c}\`  ·  aqui \`${g.comando}\``);
  }
  const divergencias = soloSuyas.length + soloMias.length + distintos.length;
  console.log('');
  if (divergencias === 0) {
    console.log(verde('sin divergencia: la copia de alla coincide con la proyeccion.'));
    process.exit(0);
  }
  console.log(rojo(`${divergencias} divergencia(s): la copia a mano y el contrato no dicen lo mismo.`));
  process.exit(1);
}

process.stdout.write(toml);
