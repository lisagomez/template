/**
 * El token de emparejamiento que llega en el ENLACE (QR o link): `#t=…` (lo normal: el hash no viaja al servidor
 * ni a los logs) o `?t=…`. Hash y búsqueda se leen POR SEPARADO: concatenados (`hash + search`) y con otra búsqueda
 * en la URL (`?caso=6`, `?medicion=1`), el token arrastraba «?caso=6» y el emparejamiento fallaba con «ese token no
 * es» (cazado el 2026-10-16 en el centro de mando; el patrón estaba copiado en cuatro páginas).
 *
 * Devuelve también la URL limpia, sin el token y conservando el resto de la búsqueda, para `history.replaceState`.
 */
export interface TokenDelEnlace {
  token: string;
  urlLimpia: string;
}

export function tokenDelEnlace(ubicacion: Pick<Location, 'hash' | 'search' | 'pathname'>): TokenDelEnlace | undefined {
  const hash = new URLSearchParams(ubicacion.hash.replace(/^#/, ''));
  const busqueda = new URLSearchParams(ubicacion.search);
  const token = hash.get('t') ?? busqueda.get('t');
  if (!token) return undefined;
  busqueda.delete('t');
  const resto = busqueda.toString();
  return { token, urlLimpia: `${ubicacion.pathname}${resto ? `?${resto}` : ''}` };
}
