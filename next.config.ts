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

/**
 * La vitrina de Soporte SAP en Vercel (`docs/goals/soporte-sap-vitrina.md`). Con `VITRINA_SOPORTE_SAP=1` en el build,
 * el despliegue sirve SOLO la vitrina: cualquier otra página lleva a ella y cualquier otra API no existe (404). Las
 * reglas se hornean en el build, así que no dependen de que nadie se acuerde de nada en el servidor.
 */
export const INICIO_DE_LA_VITRINA = '/vitrina/soporte-sap'
type Entorno = Readonly<Record<string, string | undefined>>
export const esVitrina = (env: Entorno): boolean => env['VITRINA_SOPORTE_SAP'] === '1'

/**
 * Lo que va a Vercel no lleva el laboratorio: con `SOPORTE_SAP_LABORATORIO` puesta (con cualquier valor), el build de
 * Vercel o de la vitrina falla. El runtime de laboratorio (identidades elegibles, estado en memoria) solo corre en la
 * máquina del laboratorio; en Vercel, lo en vivo pasa a ella firmado.
 */
export function compruebaDespliegue(env: Entorno): void {
  if ((env['VERCEL'] === '1' || esVitrina(env)) && env['SOPORTE_SAP_LABORATORIO'] !== undefined) {
    throw new Error('SOPORTE_SAP_LABORATORIO no va a Vercel ni a la vitrina: el laboratorio corre solo en su máquina. Quítala del entorno del proyecto.')
  }
}

export function reglasDeLaVitrina(env: Entorno) {
  if (!esVitrina(env)) return { redirects: [], rewrites: [] }
  return {
    redirects: [{ source: '/:ruta((?!vitrina(?:/|$)|api/|_next/|manifest\\.json$|sw\\.js$|icons/|favicon\\.ico$).*)', destination: INICIO_DE_LA_VITRINA, permanent: false }],
    // Un destino que no existe da el 404 de Next: en la vitrina, la única API es la suya.
    rewrites: [{ source: '/api/:ruta((?!vitrina/).*)', destination: '/vitrina/no-existe' }],
  }
}

/**
 * El laboratorio ALOJADO: la mesa del experto en Cloudflare (`docs/goals/soporte-sap-experto.md`). Con
 * `LABORATORIO_ALOJADO=1` en el build, la imagen sirve SOLO la mesa: cualquier otra página lleva a ella y cualquier otra
 * API no existe (404), también `/api/soporte-sap`, la de las identidades elegibles. Se hornea en el build, como la vitrina.
 */
export const INICIO_DE_LA_MESA = '/mesa/soporte-sap'
export const esAlojado = (env: Entorno): boolean => env['LABORATORIO_ALOJADO'] === '1'

export function reglasDelAlojado(env: Entorno) {
  if (!esAlojado(env)) return { redirects: [], rewrites: [] }
  return {
    redirects: [{ source: '/:ruta((?!mesa(?:/|$)|api/|_next/|manifest\\.json$|sw\\.js$|icons/|favicon\\.ico$).*)', destination: INICIO_DE_LA_MESA, permanent: false }],
    rewrites: [{ source: '/api/:ruta((?!mesa/).*)', destination: '/mesa/no-existe' }],
  }
}

/** El laboratorio alojado no es la vitrina ni va a Vercel: son dos despliegues con reglas distintas. */
export function compruebaAlojado(env: Entorno): void {
  if (esAlojado(env) && (esVitrina(env) || env['VERCEL'] === '1')) throw new Error('LABORATORIO_ALOJADO no va con la vitrina ni a Vercel: la mesa se construye en su imagen (scripts/laboratorio-alojado).')
}

compruebaDespliegue(process.env)
compruebaAlojado(process.env)

const nextConfig: NextConfig = {
  async redirects() { return [...reglasDeLaVitrina(process.env).redirects, ...reglasDelAlojado(process.env).redirects] },
  async rewrites() { return { beforeFiles: [...reglasDeLaVitrina(process.env).rewrites, ...reglasDelAlojado(process.env).rewrites], afterFiles: [], fallback: [] } },

  // En desarrollo, Next 16 imprime cada server function CON SUS ARGUMENTOS: el registro de un paciente dejaba su
  // nombre, correo y celular en el log de la terminal (medido el 2026-10-16, goal clinica-dental). Los argumentos de
  // una acción son datos de usuario: no se imprimen nunca.
  logging: { serverFunctions: false },

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
