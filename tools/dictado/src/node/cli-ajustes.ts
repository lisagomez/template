/**
 * `dictado ajustes`: los ajustes de la persona desde la terminal, por el MISMO camino que la
 * pagina /ajustes (`pon`/`quita` de `../ajustes.ts` + escritura atomica). Sin argumentos lista
 * cada ajuste con su valor y su origen; `--json` da lo que la pagina consume.
 *
 *   dictado ajustes                       lista con origen
 *   dictado ajustes pon <clave> <valor>   valida (un motor que no esta instalado se rechaza con la lista) y guarda
 *   dictado ajustes quita <clave>         vuelve al defecto (o a lo que diga el entorno)
 *   dictado ajustes restablece --si       reescribe el archivo solo con la version
 *   dictado ajustes catalogo              los motores instalados con las cifras medidas en esta maquina
 */
import { catalogo, ESQUEMA, GRUPOS, pon, quita, resuelve, type Ajustes, type ContextoValidacion, type EntradaCatalogo } from '../ajustes.js';
import { escribeArchivoAjustes, leeArchivoAjustes, leeMedicion } from './ajustes-archivo.js';
import { describeAjustes, type Configuracion } from './cli-config.js';
import { motoresDisponibles } from './cli-motores.js';

const ESC = String.fromCharCode(27);
const gris = (s: string) => `${ESC}[2m${s}${ESC}[0m`;

/** Lo que la pagina /ajustes pide de una vez: valores con origen, esquema, grupos, catalogo y de donde sale todo. */
export function estadoAjustes(config: Configuracion) {
  const archivo = leeArchivoAjustes(config.datos);
  const contexto: ContextoValidacion = { motoresInstalados: motoresDisponibles(config) };
  const r = resuelve({ argumentos: config.opciones, entorno: process.env, archivo: archivo.valores, contexto });
  const medicion = leeMedicion();
  return {
    ruta: archivo.ruta,
    existe: archivo.existe,
    version: archivo.version,
    ajustes: r.ajustes,
    avisos: [...archivo.avisos, ...r.avisos],
    esquema: ESQUEMA,
    grupos: GRUPOS,
    motoresInstalados: contexto.motoresInstalados ?? [],
    catalogo: catalogo(contexto.motoresInstalados ?? [], medicion),
    medicion: medicion ? { fecha: medicion.fecha, maquina: medicion.maquina, corpus: medicion.corpus } : undefined,
  };
}

/** Un `pon` completo: leer, validar, escribir. Lo usan el CLI y `maquina.mjs` (la pagina). */
export function ponAjuste(config: Configuracion, clave: string, valor: unknown): { ok: true; valor: Ajustes[keyof Ajustes]; ruta: string } | { ok: false; error: string } {
  const archivo = leeArchivoAjustes(config.datos);
  const r = pon(archivo.valores as Partial<Ajustes>, clave, valor, { motoresInstalados: motoresDisponibles(config) });
  if (!r.ok) return r;
  try {
    return { ok: true, valor: r.valor, ruta: escribeArchivoAjustes(config.datos, r.valores, archivo.desconocidas) };
  } catch (e) {
    // Carpeta de solo lectura o disco lleno: un error con la ruta, no una caida (la pagina lo ensena junto al campo).
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function quitaAjuste(config: Configuracion, clave: string): { ok: true; ruta: string } | { ok: false; error: string } {
  const archivo = leeArchivoAjustes(config.datos);
  const r = quita(archivo.valores as Partial<Ajustes>, clave);
  if (!r.ok) return r;
  try {
    return { ok: true, ruta: escribeArchivoAjustes(config.datos, r.valores, archivo.desconocidas) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function restableceAjustes(config: Configuracion): string {
  return escribeArchivoAjustes(config.datos, {}, {});
}

export function lineaCatalogo(e: EntradaCatalogo): string {
  if (!e.medido) return `${e.nombre.padEnd(30)} sin medir en esta maquina`;
  const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`;
  return `${e.nombre.padEnd(30)} WER ${pct(e.wer ?? 0).padStart(7)} · p50 ${String(Math.round(e.latenciaP50Ms ?? 0)).padStart(5)} ms · p95 ${String(Math.round(e.latenciaP95Ms ?? 0)).padStart(5)} ms${e.cargaMs !== undefined ? ` · carga ${Math.round(e.cargaMs)} ms` : ''}  ${e.nota ?? ''}`;
}

export async function ordenAjustes(config: Configuracion, posicionales: string[], opciones: Record<string, string | boolean>): Promise<void> {
  const [sub, clave, ...resto] = posicionales;
  if (sub === 'pon') {
    if (!clave || resto.length === 0) throw new Error('uso: dictado ajustes pon <clave> <valor>');
    const r = ponAjuste(config, clave, resto.join(' '));
    if (!r.ok) throw new Error(r.error);
    const c = ESQUEMA.find((x) => x.clave === clave);
    console.log(`${clave} = ${String(r.valor)} guardado en ${r.ruta}`);
    if (config.ajustes[clave as keyof Ajustes]?.origen === 'argumento' || config.ajustes[clave as keyof Ajustes]?.origen === 'entorno') {
      console.log(gris(`  ojo: ahora mismo lo fija ${config.ajustes[clave as keyof Ajustes].origen === 'entorno' ? c?.variable : `--${c?.bandera}`}, que manda sobre el archivo`));
    }
    console.log(gris(c?.enCaliente ? '  un dictado en marcha lo toma sin reiniciar' : '  se aplica en la siguiente sesion de dictado'));
    return;
  }
  if (sub === 'quita') {
    if (!clave) throw new Error('uso: dictado ajustes quita <clave>');
    const r = quitaAjuste(config, clave);
    if (!r.ok) throw new Error(r.error);
    console.log(`${clave} vuelve a su defecto (${r.ruta})`);
    return;
  }
  if (sub === 'restablece') {
    if (opciones['si'] !== true) {
      console.log(`esto dejaria ${config.archivoAjustes.ruta} solo con la version (todo por defecto). Para hacerlo: dictado ajustes restablece --si`);
      return;
    }
    console.log(`restablecido: ${restableceAjustes(config)}`);
    return;
  }
  if (sub === 'catalogo') {
    const e = estadoAjustes(config);
    console.log(e.medicion ? `medido el ${e.medicion.fecha} en ${e.medicion.maquina?.cpu ?? 'esta maquina'} (${e.medicion.corpus?.nombre ?? 'corpus'}, ${e.medicion.corpus?.tomas ?? '?'} tomas)` : 'sin medicion en esta maquina (npm run mide la deja)');
    for (const m of e.catalogo) console.log('  ' + lineaCatalogo(m));
    return;
  }
  if (sub !== undefined) throw new Error(`no conozco «${sub}». Uso: dictado ajustes [pon <clave> <valor> | quita <clave> | restablece --si | catalogo] [--json]`);
  const e = estadoAjustes(config);
  if (opciones['json'] === true) {
    console.log(JSON.stringify(e, null, 1));
    return;
  }
  console.log(`${e.existe ? e.ruta : `${e.ruta} (no existe todavia: todo por defecto)`}${e.existe ? ` · version ${e.version}` : ''}`);
  for (const a of e.avisos) console.log(gris(`  aviso: ${a}`));
  for (const g of GRUPOS) {
    const claves = ESQUEMA.filter((c) => c.grupo === g.id).map((c) => c.clave);
    console.log(`\n${g.titulo}${g.id === 'sin-proveedor' ? gris(' — apagado: sin modelo de lenguaje') : ''}`);
    console.log(describeAjustes(e.ajustes, claves));
  }
  console.log(gris('\norigen: argumento > entorno > ajustes > defecto. Cambia uno con: dictado ajustes pon <clave> <valor>'));
}
