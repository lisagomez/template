import type { NextConfig } from 'next'

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
  },
}

export default nextConfig
