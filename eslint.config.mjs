// ESLint 9 flat config. `next lint` fue retirado en Next 16: se usa el CLI de ESLint
// directamente (`npm run lint`). eslint-config-next@16 exporta flat config nativo, asi que
// no hace falta FlatCompat ni @eslint/eslintrc.
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // `.claude/worktrees/**`: un worktree de git es un CHECKOUT ANIDADO del propio repo. Si
  // alguien instala dependencias ahi (hace falta para correr los gates en una rama), ESLint
  // se pone a lintear una copia entera del proyecto y su node_modules, y el gate sale en
  // rojo por codigo que no es el que se esta cambiando. Ya estan en .gitignore; aqui se
  // declara lo mismo para la herramienta que no lo lee.
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'tools/**/dist/**',
    '.claude/worktrees/**',
  ]),
])
