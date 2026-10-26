/**
 * La huella de una carpeta por CONTENIDO: sha256 de cada archivo con su ruta y su modo, en orden. Dos huellas
 * iguales = ni un byte cambió (ni un archivo nuevo, ni uno borrado, ni un objeto suelto de git). Sirve para probar
 * que una lectura no escribió: la del espejo de Arbrain cuando una firma FALLA, y la del espejo del cerebro.
 *
 * Los enlaces simbólicos no se siguen (se anota a dónde apuntan). Las fechas no cuentan: leer cambia el atime.
 */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';

const sha = (b) => createHash('sha256').update(b).digest('hex');

/** @param {string} dir @param {{ excluye?: string[] }} [opciones] rutas relativas que no cuentan (p. ej. `.git`) */
export function huellaDirectorio(dir, { excluye = [] } = {}) {
  const h = createHash('sha256');
  let archivos = 0;
  let bytes = 0;
  const anda = (rel) => {
    const nombres = readdirSync(join(dir, rel)).sort();
    for (const nombre of nombres) {
      const r = rel ? `${rel}/${nombre}` : nombre;
      if (excluye.includes(r)) continue;
      const abs = join(dir, r);
      const st = lstatSync(abs);
      if (st.isSymbolicLink()) h.update(`l ${r} -> ${readlinkSync(abs)}\n`);
      else if (st.isDirectory()) {
        h.update(`d ${r}\n`);
        anda(r);
      } else if (st.isFile()) {
        const contenido = readFileSync(abs);
        h.update(`f ${r} ${(st.mode & 0o777).toString(8)} ${sha(contenido)}\n`);
        archivos += 1;
        bytes += contenido.length;
      }
    }
  };
  if (existsSync(dir)) anda('');
  return { sha256: h.digest('hex'), archivos, bytes };
}
