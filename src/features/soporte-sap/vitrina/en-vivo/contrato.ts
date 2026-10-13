/**
 * Lo que comparten la ruta de Vercel y el portero: qué ruta del laboratorio se alcanza, con qué consulta y con qué
 * tamaño de cuerpo. Lo demás no pasa, ni de un lado ni del otro.
 */
export const RUTA_DEL_LABORATORIO = '/api/soporte-sap'
export const CUERPO_MAXIMO = 64_000
const ROLES = new Set(['cliente', 'consultor', 'superadmin', 'experto'])
const EXPORT = /^[a-z0-9-]{1,60}$/

/** Solo `rol` y `export`, validados y en ese orden; `null` si la consulta trae cualquier otra cosa. */
export function consultaValida(q: URLSearchParams): string | null {
  if ([...q.keys()].some((k) => k !== 'rol' && k !== 'export')) return null
  const rol = q.get('rol') ?? 'cliente', exp = q.get('export')
  if (!ROLES.has(rol) || (exp !== null && !EXPORT.test(exp))) return null
  return exp === null ? `rol=${rol}` : `rol=${rol}&export=${exp}`
}
