/**
 * A dónde se vuelve después de entrar. Solo rutas internas del reel y del sistema integrado (`/sgi`): un `siguiente` que apunte a otro
 * sitio (`//evil.com`, `https://…`, `/\evil`) se ignora y se va a `/reel`. Sin esto el formulario de
 * cuentas sería una redirección abierta.
 */
export const DESTINO_POR_DEFECTO = '/reel';

export function destinoSeguro(siguiente: unknown): string {
  if (typeof siguiente !== 'string' || siguiente.length > 200) return DESTINO_POR_DEFECTO;
  if (!siguiente.startsWith('/') || siguiente.startsWith('//') || siguiente.includes('\\')) return DESTINO_POR_DEFECTO;
  return /^\/(reel|cuenta|buzon|sgi)(\/|\?|$)/.test(siguiente) ? siguiente : DESTINO_POR_DEFECTO;
}

/** Rutas que exigen sesión. Todo lo demás del template sigue como estaba. */
export const esRutaProtegida = (ruta: string): boolean => /^\/(reel|cuenta|buzon|sgi)(\/|$)/.test(ruta);
export const esApiProtegida = (ruta: string): boolean => /^\/api\/(reel|sgi)(\/|$)/.test(ruta);
export const esRutaDeCuentas = (ruta: string): boolean => /^\/(login|signup)(\/|$)/.test(ruta);
