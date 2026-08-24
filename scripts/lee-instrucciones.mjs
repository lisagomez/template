/**
 * Resuelve los imports `@ruta` de un archivo de instrucciones, como hace Claude Code al
 * cargarlo.
 *
 * Existe porque `AGENTS.md` es la fuente unica —la que leen los otros arneses— y
 * `CLAUDE.md` la importa. Sin esta expansion, dos cosas mentirian a la vez:
 *
 *   - el **verificador** buscaria las reglas en un `CLAUDE.md` de 17 lineas y las daria por
 *     desaparecidas;
 *   - el **presupuesto de contexto** reportaria una caida de ~6700 tokens que no existe.
 *     Mover contenido a un archivo importado no ahorra nada: el import se expande y se carga
 *     igual. Presentar eso como ahorro seria justo la clase de cifra inventada que esta capa
 *     persigue.
 *
 * Profundidad maxima 4, igual que el limite documentado de Claude Code.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const MAX_SALTOS = 4;

/**
 * @param {string} rutaAbsoluta archivo de instrucciones a leer
 * @param {number} profundidad uso interno de la recursion
 * @returns {string|null} el contenido con los imports ya expandidos, o null si no existe
 */
export function leeConImports(rutaAbsoluta, profundidad = 0) {
  if (!existsSync(rutaAbsoluta)) return null;
  const contenido = readFileSync(rutaAbsoluta, 'utf8');
  if (profundidad >= MAX_SALTOS) return contenido;

  const base = dirname(rutaAbsoluta);
  let dentroDeBloque = false;
  return contenido
    .split('\n')
    .map((linea) => {
      // Un import dentro de un bloque de codigo es texto, no un import. Igual que arriba:
      // el parser de Claude Code se salta los bloques cercados.
      if (/^\s*```/.test(linea)) dentroDeBloque = !dentroDeBloque;
      if (dentroDeBloque) return linea;
      const m = linea.match(/^\s*@([^\s`]+)\s*$/);
      if (!m) return linea;
      const importado = leeConImports(resolve(join(base, m[1])), profundidad + 1);
      // Un import roto se deja tal cual: que se vea el `@ruta` en vez de desaparecer en
      // silencio, que es como un documento se pudre sin que nadie lo note.
      return importado === null ? linea : importado;
    })
    .join('\n');
}
