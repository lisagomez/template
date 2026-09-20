/**
 * El enlace que empareja OTRO dispositivo: la pagina de destino con el token en el FRAGMENTO
 * (`#t=`), que el navegador nunca manda al servidor. `/dictar` y `/laboratorio-voz` lo leen al
 * abrir, guardan el token y lo borran de la barra. Puro: se prueba sin navegador.
 */
export function enlaceDeEmparejar(origen: string, ruta: string, token: string): string {
  const base = origen.replace(/\/+$/, '');
  const camino = ruta.startsWith('/') ? ruta : `/${ruta}`;
  return `${base}${camino}#t=${encodeURIComponent(token)}`;
}
