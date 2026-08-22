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
}

export default nextConfig
