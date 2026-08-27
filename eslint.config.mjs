// ESLint 9 flat config. `next lint` fue retirado en Next 16: se usa el CLI de ESLint
// directamente (`npm run lint`). eslint-config-next@16 exporta flat config nativo, asi que
// no hace falta FlatCompat ni @eslint/eslintrc.
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'tools/**/dist/**']),
])
