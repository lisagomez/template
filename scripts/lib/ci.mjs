/**
 * El CI de GitHub Actions como PROYECCION del padron de gates (D-SS-8, decidida el 2026-10-22).
 *
 * El workflow no lleva la lista de gates: llama al mismo runner que `npm run validate`
 * (`corre-gates.mjs validate --sigue`), que la deriva de `.claude/gates.json` al correr. Lo que
 * se proyecta es lo que el padron y `package.json` ya dicen: el perfil, la version minima de
 * Node (`engines`), el tope de tiempo (la suma de los timeouts del perfil) y los inactivos, que
 * van a la vista para que nadie lea el CI como cobertura que no hay.
 *
 * Se genera con `npm run proyecta:gates -- --ci github --salida .github/workflows/gates.yml` y
 * `verifica:gates` compara el archivo con la proyeccion: editarlo a mano pone el gate en rojo,
 * igual que con `GEMINI.md`. Cambiar las actions, el runner o esta funcion es un CDC (C1).
 *
 * Todo va fijado: las actions por SHA de commit (la etiqueta solo va de comentario), Node por
 * version exacta. El runner `ubuntu-24.04` es una etiqueta de version, no `latest`; GitHub
 * renueva la imagen cada semana y no deja fijarla por digest.
 */
import { gatesDelPerfil, inactivos, MANIFIESTO } from './gates.mjs';

export const RUTA_GITHUB = '.github/workflows/gates.yml';

/** Comprobadas con `git ls-remote` el 2026-10-22: las etiquetas son ligeras y apuntan a estos commits. */
export const ACCIONES = {
  checkout: { uso: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', version: 'v7.0.1' },
  setupNode: { uso: 'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1', version: 'v7.1.0' },
};
export const RUNNER = 'ubuntu-24.04';

/** `engines.node` (`>=22.18`) como version exacta: el CI prueba el minimo que el repo promete. */
export function nodeDelMinimo(engines) {
  const m = /^>=\s*(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(engines ?? '').trim());
  if (!m) throw new Error(`engines.node tiene que ser «>=X.Y»: es «${engines}»`);
  return `${m[1]}.${m[2]}.${m[3] ?? 0}`;
}

const comentario = (s) => s.replace(/\s+/g, ' ').trim();

/** El workflow, como texto. Puro: mismo padron y mismo package.json, mismo archivo. */
export function proyectaGithub(manifiesto, paquete, perfil = 'validate') {
  const gates = gatesDelPerfil(manifiesto, perfil);
  const minutos = Math.ceil(gates.reduce((s, g) => s + g.timeout_s, 0) / 60);
  const l = [
    `# ALTO: ARTEFACTO AUTOGENERADO desde ${MANIFIESTO} y package.json. No lo edites a mano.`,
    `# Se regenera con: npm run proyecta:gates -- --ci github --salida ${RUTA_GITHUB}`,
    '# `verifica:gates` lo compara con la proyeccion y se pone rojo si divergen. Cambiar las actions,',
    '# el runner o la proyeccion (scripts/lib/ci.mjs) es un CDC (C1).',
    '#',
    `# Corre el perfil \`${perfil}\` (${gates.length} gates activos) con el mismo runner que \`npm run ${perfil}\`.`,
    '# Inactivos declarados en el padron: NO se corren y NO cuentan como pasados.',
    ...inactivos(manifiesto).map((g) => `#   ${g.nombre}: ${comentario(g.motivo).split('. ')[0].replace(/\.$/, '')}.`),
    'name: gates',
    'on:',
    '  pull_request:',
    '    branches: [main]',
    '  workflow_dispatch:',
    'permissions:',
    '  contents: read',
    'concurrency:',
    '  group: gates-${{ github.ref }}',
    '  cancel-in-progress: true',
    'jobs:',
    `  ${perfil}:`,
    `    runs-on: ${RUNNER}`,
    `    # La suma de los timeouts del perfil: cada gate ya se corta en el suyo.`,
    `    timeout-minutes: ${minutos}`,
    '    steps:',
    `      - uses: ${ACCIONES.checkout.uso} # ${ACCIONES.checkout.version}`,
    '        # Historial y ramas completos: `prueba:analista` busca el commit que analizo, y',
    '        # `verify:gobernanza` lee el corpus de `origin/golden-sets` (medido en un clon limpio).',
    '        with:',
    '          fetch-depth: 0',
    '          persist-credentials: false',
    `      - uses: ${ACCIONES.setupNode.uso} # ${ACCIONES.setupNode.version}`,
    '        with:',
    `          node-version: ${nodeDelMinimo(paquete.engines?.node)}`,
    '          cache: npm',
    '      - run: npm ci --no-audit --no-fund',
    `      - run: node scripts/corre-gates.mjs ${perfil} --sigue`,
  ];
  return `${l.join('\n')}\n`;
}
