/**
 * `<datos>/ajustes.json` en disco: leer tolerante, escribir atomico, vigilar cambios. La logica
 * (esquema, validacion, migracion, precedencia) vive en `../ajustes.ts` y aqui solo se le pone
 * el archivo. Reglas:
 *
 *  - **Nunca se cae por el archivo**: roto, ajeno o ilegible → defectos + aviso, y NO se pisa
 *    (el siguiente `pon` escribe encima solo lo que entendio; lo desconocido se conserva).
 *  - **Escritura atomica**: temporal + `rename`, para que dos escrituras a la vez o un corte
 *    dejen siempre un archivo entero.
 *  - **Ningun secreto**: el token no pasa por aqui; `describe` no imprime nada que no sea un ajuste.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, watchFile, unwatchFile, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migra, serializa, type Ajustes, type Medicion, type Migracion } from '../ajustes.js';

export const NOMBRE_ARCHIVO = 'ajustes.json';
export const rutaAjustes = (datos: string): string => join(datos, NOMBRE_ARCHIVO);

export interface ArchivoAjustes extends Migracion {
  ruta: string;
  existe: boolean;
  /** Para saber si cambio sin releerlo: tamano + mtime. */
  huella: string;
}

const huellaDe = (ruta: string): string => {
  try {
    const st = statSync(ruta);
    return `${st.size}:${st.mtimeMs}`;
  } catch {
    return 'no-existe';
  }
};

/** Lee y migra. Si no existe, contenido vacio (todo por defecto) sin aviso: es lo normal la primera vez. */
export function leeArchivoAjustes(datos: string): ArchivoAjustes {
  const ruta = rutaAjustes(datos);
  if (!existsSync(ruta)) return { ruta, existe: false, huella: 'no-existe', valores: {}, desconocidas: {}, version: 0, avisos: [] };
  let texto: string;
  try {
    texto = readFileSync(ruta, 'utf8');
  } catch (e) {
    return { ruta, existe: true, huella: huellaDe(ruta), valores: {}, desconocidas: {}, version: 0, avisos: [`no se pudo leer ${ruta} (${e instanceof Error ? e.message : String(e)}): se usan los defectos`] };
  }
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return { ruta, existe: true, huella: huellaDe(ruta), valores: {}, desconocidas: {}, version: 0, avisos: [`${ruta} no es JSON valido: se usan los defectos y el archivo NO se toca (arreglalo o borralo; «dictado ajustes restablece --si» lo reescribe)`] };
  }
  return { ruta, existe: true, huella: huellaDe(ruta), ...migra(crudo) };
}

/**
 * Escribe entero y atomico. Falla con un error claro (carpeta de solo lectura, disco lleno):
 * quien llama decide si es fatal (`pon`) o un aviso (`instala`).
 */
export function escribeArchivoAjustes(datos: string, valores: Partial<Ajustes>, desconocidas: Record<string, unknown> = {}): string {
  const ruta = rutaAjustes(datos);
  mkdirSync(datos, { recursive: true });
  const temporal = `${ruta}.${process.pid}.${Date.now().toString(36)}.tmp`;
  try {
    writeFileSync(temporal, serializa(valores, desconocidas), { encoding: 'utf8', mode: 0o600 });
    renameSync(temporal, ruta);
  } catch (e) {
    try {
      unlinkSync(temporal);
    } catch {
      /* no llego a crearse */
    }
    throw new Error(`no se pudo escribir ${ruta}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return ruta;
}

/**
 * Avisa cuando el archivo cambia (cada segundo se mira su stat: barato, y funciona igual en
 * ext4 y en /mnt/c). Devuelve como dejar de vigilar. Solo dispara si la huella cambio de verdad.
 */
export function vigilaArchivoAjustes(datos: string, alCambiar: (archivo: ArchivoAjustes) => void, intervaloMs = 1000): () => void {
  const ruta = rutaAjustes(datos);
  let ultima = huellaDe(ruta);
  const escucha = () => {
    const ahora = huellaDe(ruta);
    if (ahora === ultima) return;
    ultima = ahora;
    alCambiar(leeArchivoAjustes(datos));
  };
  watchFile(ruta, { interval: intervaloMs, persistent: false }, escucha);
  return () => unwatchFile(ruta, escucha);
}

const RAIZ_PAQUETE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** La medicion de ESTA maquina, si la hay (`npm run mide` la deja). Sin ella, el catalogo dice «sin medir». */
export function leeMedicion(raiz = RAIZ_PAQUETE): Medicion | undefined {
  const ruta = join(raiz, 'medicion', 'ultima-medicion-cpu.json');
  if (!existsSync(ruta)) return undefined;
  try {
    const m = JSON.parse(readFileSync(ruta, 'utf8')) as Medicion;
    return Array.isArray(m.motores) ? m : undefined;
  } catch {
    return undefined;
  }
}
