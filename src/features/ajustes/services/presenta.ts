/** Logica pura de la pagina /ajustes: agrupar, etiquetar origenes y formatear cifras. Sin React, sin red. */
import type { Campo, EntradaCatalogo, GrupoInfo, Origen, Valor } from './tipos.ts';

export interface GrupoConCampos {
  grupo: GrupoInfo;
  campos: Campo[];
}

/** Los campos en el orden de los grupos del esquema; un grupo sin campos no aparece. */
export function agrupaCampos(esquema: Campo[], grupos: GrupoInfo[]): GrupoConCampos[] {
  return grupos.map((grupo) => ({ grupo, campos: esquema.filter((c) => c.grupo === grupo.id) })).filter((g) => g.campos.length > 0);
}

/** De donde sale el valor, en palabras: lo que la persona ve junto a cada campo. */
export function etiquetaOrigen(origen: Origen, campo: Campo): string {
  switch (origen) {
    case 'defecto':
      return 'por defecto';
    case 'ajustes':
      return 'guardado';
    case 'argumento':
      return `lo fija la bandera --${campo.bandera ?? campo.clave} de esta sesión`;
    case 'entorno':
      return `lo fija ${campo.variable ?? 'el entorno'}`;
  }
}

/** Si una capa por encima del archivo manda, guardar no cambia nada hasta quitarla: se dice. */
export function avisoDeCapa(origen: Origen, campo: Campo): string | undefined {
  if (origen === 'argumento') return `Se guarda, pero mientras el dictado corra con --${campo.bandera ?? campo.clave} manda la bandera.`;
  if (origen === 'entorno') return `Se guarda, pero mientras exista ${campo.variable ?? 'la variable'} en el entorno manda el entorno.`;
  return undefined;
}

export const avisoDeAplicacion = (campo: Campo): string => (campo.enCaliente ? 'Un dictado en marcha lo toma sin reiniciar.' : 'Se aplica en la siguiente sesión de dictado.');

/** Lo que se teclea en una caja: siempre texto. */
export const valorParaEditar = (v: Valor): string => String(v);

/** Las opciones de un desplegable segun el tipo: elecciones fijas, motores instalados, o respaldo (auto, ninguno y los motores). */
export function opcionesDe(campo: Campo, motoresInstalados: string[]): string[] {
  if (campo.tipo === 'motor') return motoresInstalados;
  if (campo.tipo === 'respaldo') return ['auto', 'ninguno', ...motoresInstalados.filter((m) => m !== 'remoto')];
  return campo.opciones ?? [];
}

const coma = (n: number, decimales = 1): string => n.toFixed(decimales).replace('.', ',');

export interface CifrasCatalogo {
  wer: string;
  p50: string;
  p95: string;
  carga: string;
}

/** «3,3 %», «532 ms»…; sin medir, guiones: nunca una cifra inventada. */
export function formateaCifras(e: EntradaCatalogo): CifrasCatalogo {
  if (!e.medido) return { wer: '—', p50: '—', p95: '—', carga: '—' };
  return {
    wer: `${coma((e.wer ?? 0) * 100)} %`,
    p50: `${Math.round(e.latenciaP50Ms ?? 0)} ms`,
    p95: `${Math.round(e.latenciaP95Ms ?? 0)} ms`,
    carga: e.cargaMs !== undefined ? `${Math.round(e.cargaMs)} ms` : '—',
  };
}

/** Cuantos ajustes no estan en su defecto: el resumen de la cabecera. */
export const cuentaCambiados = (ajustes: Record<string, { origen: Origen }>): number => Object.values(ajustes).filter((v) => v.origen !== 'defecto').length;
