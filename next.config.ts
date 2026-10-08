import type { NextConfig } from 'next'

/**
 * Lo que NUNCA viaja en la imagen, venga de la ruta que venga (PRP-010 H-31). El file tracing convierte
 * un `fs` con camino dinamico en un glob por extension sobre TODO el repo (`*.json`, `*.txt`, `*.png`):
 * la imagen llevaba `erp/`, `trayectorias/`, `src/` y `docs/`, y en el despacho vive en la maquina de un
 * tercero. Ninguna ruta lee esto en tiempo de ejecucion: lo que importa la app ya va en el bundle, y de
 * `tools/` basta su `dist/`. Lo vigila `prueba:buzon` (`scripts/buzon/prueba-imagen.mjs`).
 */
export const NUNCA_EN_LA_IMAGEN = [
  'erp/**', 'trayectorias/**', 'inventario/**', 'productos/**', 'docs/**', '.claude/**', 'scripts/**', 'src/**',
  'tools/*/src/**', 'tools/*/pruebas/**', 'tools/*/manual/**', 'tools/*/medicion/**',
  // Configuracion de la raiz que arrastra el glob de `*.json` (el `package.json` si viaja: lo necesita el servidor).
  'opencode.json', 'components.json', 'tsconfig.json', 'package-lock.json',
]

const nextConfig: NextConfig = {
  // Activa el MCP server en /_next/mcp (Next.js 16+)
  experimental: {
    mcpServer: true,
  },

  // Deploy self-hosted (Hetzner cx33): empaqueta server + deps minimas
  // en .next/standalone. Sin esto la imagen Docker arrastra node_modules
  // completo (~400 MB extra). No afecta `npm run dev`.
  output: 'standalone',

  // La ruta /api/dictado/movil invoca el CLI de tools/dictado por RUTA (no lo importa):
  // el file-tracing NO debe seguir ese arbol (trae el symlink roto del venv de Python del
  // banco de medicion, que apunta fuera del root). El CLI se instala/corre aparte.
  outputFileTracingExcludes: {
    '/api/dictado/movil': ['tools/dictado/**'],
    // Todas las rutas (`/**`: Next compara con picomatch y une las claves que casan).
    '/**': NUNCA_EN_LA_IMAGEN,
  },
}

export default nextConfig
