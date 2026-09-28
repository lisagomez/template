/**
 * Un dato que puede faltar. **Ausente no es cero** (regla `absent-is-not-zero` de la fuente):
 * una fuente que no llegó se declara «sin datos» con su motivo, nunca se suma como 0 ni se
 * omite en silencio. Todas las herramientas de la familia devuelven sus métricas así.
 */
export type Dato<T> =
  | { readonly estado: 'ok'; readonly valor: T }
  | { readonly estado: 'sin-datos'; readonly motivo: string };

export function ok<T>(valor: T): Dato<T> {
  return { estado: 'ok', valor };
}

export function sinDatos<T = never>(motivo: string): Dato<T> {
  return { estado: 'sin-datos', motivo };
}

export function esOk<T>(dato: Dato<T>): dato is { readonly estado: 'ok'; readonly valor: T } {
  return dato.estado === 'ok';
}
