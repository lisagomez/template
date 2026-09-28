/**
 * Recepcion con foto de la caducidad (servidor). La lectura (lenta: el motor tarda segundos) se
 * hace FUERA de la transaccion; lo que entra a la cadena, dentro. La propuesta se registra
 * (EN_REVISION) ANTES de que la persona decida, y lo confirmado se compara con ella AQUI.
 */
import {
  abreRevision, antiguedad, confirmaRevision, descartaRevision, formatoDe, leeYPropone, medicionEnUso, registraFoto, revisionesAbiertas, vinculaGtin,
  type EstadoAlmacen, type Propuesta,
} from '../nucleo.ts';
import type { AccionEtiquetas } from '../esquemas.ts';
import { almacenDelServidor, hoyIso } from './almacen.ts';
import { avisaCabezas, seudonimosDelServidor } from './expediente.ts';
import { fotoGuardada, fotosDelServidor, imagenes, motorDelServidor } from './fotos.ts';
import { motorAprobado } from './laboratorio.ts';

type Respuesta = { status: number; cuerpo: unknown };
const ok = (cuerpo: unknown): Respuesta => ({ status: 200, cuerpo });
const mal = (status: number, error: string): Respuesta => ({ status, cuerpo: { error } });
type Accion<N extends string> = Extract<AccionEtiquetas, { accion: N }>;

export const ACCIONES_RECEPCION: ReadonlySet<string> = new Set(['lee-caducidad', 'revision-confirma', 'revision-descarta', 'revisiones', 'vincula-gtin', 'foto-articulo']);

const SIN_MOTOR = (hoy: string): Propuesta => ({
  estado: 'sin-fecha', mensaje: 'No hay motor de lectura instalado en este servidor: teclea la fecha. La foto queda igual como evidencia.',
  opciones: [], lotesPosibles: [], textoLeido: [], avisos: [], motor: `ninguno (${hoy})`, ms: [],
});

/** Recorta la guia de cada toma, lee con el motor local y abre la revision en la cadena. */
async function leeCaducidad(a: Accion<'lee-caducidad'>, operador: string): Promise<Respuesta> {
  const fotos = await Promise.all([a.foto, ...a.tomas].map(fotoGuardada));
  if (fotos.some((f) => !f)) return mal(404, 'falta una de las fotos: vuelve a tomarla');
  const recortes = await Promise.all(fotos.map((f) => imagenes.recorta(f!.bytes, a.zona, f!)));
  const huellas = await Promise.all(recortes.map((r) => fotosDelServidor().guarda(r, 'png')));
  const e0 = await almacenDelServidor().lee();
  const art = e0.articulos[a.sku];
  if (!art) return mal(422, `el artículo ${a.sku} no está en el catálogo`);
  const aprendido = formatoDe(e0, a.sku);
  const ctx = { hoy: hoyIso(), ...(art.vidaUtilDias ? { vidaUtilDias: art.vidaUtilDias } : {}), ...(aprendido ? { aprendido: { formato: aprendido.formato, tipo: aprendido.tipo } } : {}) };
  // Solo si «Fecha por foto» pasa su laboratorio (si no, se teclea: la foto queda como evidencia).
  const { motor, motivo } = await motorAprobado();
  let propuesta: Propuesta
  try {
    propuesta = motor ? await leeYPropone(motor, recortes.slice(0, 2), ctx, fotos[0]!.bytes) : { ...SIN_MOTOR(ctx.hoy), ...(motivo ? { mensaje: motivo } : {}) };
  } catch (err) {
    propuesta = { ...SIN_MOTOR(ctx.hoy), mensaje: `El motor de lectura falló (${err instanceof Error ? err.message : 'error'}): teclea la fecha. La foto queda como evidencia.`, motor: motor?.modelo ?? 'ninguno' };
  }
  const op = await seudonimosDelServidor().de(operador);
  const folio = `REV-${Date.now().toString(36).toUpperCase()}`;
  const r = await almacenDelServidor().transaccion((e) => {
    const p = abreRevision(e, { sitio: a.sitio, sku: a.sku, cajas: a.cajas, codigo: a.codigo, fotos: { completa: a.foto, recortes: huellas }, propuesta, ...(a.reemplaza ? { reemplaza: a.reemplaza } : {}) }, new Date().toISOString(), folio, op);
    return { estado: p.estado, resultado: p };
  });
  if (!r.resultado.ok) return ok({ ok: false, motivo: r.resultado.motivo });
  await avisaCabezas(r.estado, [a.sitio]);
  const ev = r.resultado.eventos[0]!;
  return ok({ ok: true, folio, revision: ev.hash, evento: { sitio: ev.sitio, seq: ev.seq, hash: ev.hash }, propuesta, recortes: huellas, aprendido: aprendido ?? null });
}

async function conCadena<T extends { ok: boolean }>(sitio: string, cambia: (e: EstadoAlmacen) => { estado: EstadoAlmacen; resultado: { ok: true; valor: unknown; eventos: readonly { sitio: string; seq: number; tipo: string; hash: string }[] } | { ok: false; motivo: string } }): Promise<Respuesta> {
  const r = await almacenDelServidor().transaccion((e) => { const p = cambia(e); return { estado: p.estado, resultado: { p: p.resultado, estado: p.estado } }; });
  if (!r.p.ok) return ok({ ok: false, motivo: r.p.motivo } as unknown as T);
  await avisaCabezas(r.estado, [sitio]);
  return ok({ ok: true, ...(r.p.valor as object), eventos: r.p.eventos.map((x) => ({ sitio: x.sitio, seq: x.seq, tipo: x.tipo, hash: x.hash })) });
}

/** La bandeja: lo abierto de todos los sitios, con su antiguedad y si es MIO (lo confirmo yo). */
async function bandeja(operador: string): Promise<Respuesta> {
  const e = await almacenDelServidor().lee();
  const yo = await seudonimosDelServidor().de(operador);
  const ahora = new Date().toISOString();
  const abiertas = revisionesAbiertas(e).map((r) => ({
    sitio: r.sitio, folio: r.folio, sku: r.sku, descripcion: e.articulos[r.sku]?.descripcion ?? r.sku, cajas: r.cajas, desde: r.desde, antiguedad: antiguedad(r.desde, ahora),
    mia: r.operador === yo, revision: r.evento.hash, fotos: r.evento.datos['fotos'], propuesta: r.evento.datos['propuesta'], codigo: r.evento.datos['codigo'],
  }));
  return ok({ abiertas, medicion: medicionEnUso(e), motor: motorDelServidor()?.modelo ?? null });
}

export async function ejecutaRecepcion(a: AccionEtiquetas, operador: string): Promise<Respuesta> {
  const ahora = new Date().toISOString();
  switch (a.accion) {
    case 'lee-caducidad': return leeCaducidad(a, operador);
    case 'revision-confirma': {
      const op = await seudonimosDelServidor().de(operador);
      const { accion: _a, ...c } = a;
      void _a;
      return conCadena(a.sitio, (e) => confirmaRevision(e, c, hoyIso(), ahora, `rev-${Date.now()}`, op));
    }
    case 'revision-descarta': {
      const op = await seudonimosDelServidor().de(operador);
      return conCadena(a.sitio, (e) => { const p = descartaRevision(e, { sitio: a.sitio, revision: a.revision, motivo: a.motivo }, ahora, op); return p.resultado.ok ? { estado: p.estado, resultado: { ok: true, valor: {}, eventos: p.resultado.eventos } } : p; });
    }
    case 'revisiones': return bandeja(operador);
    case 'vincula-gtin':
      return ok(await almacenDelServidor().transaccion((e) => {
        const r = vinculaGtin(e, { sku: a.sku, gtin: a.gtin, nivel: a.nivel }, operador, ahora, String(Date.now()));
        return { estado: r.estado, resultado: r.resultado.ok ? { ok: true, articulo: r.resultado.articulo } : { ok: false, motivo: r.resultado.motivo } };
      }));
    case 'foto-articulo': {
      for (const h of [a.huella, a.miniatura]) if (h && !(await fotosDelServidor().lee(h))) return mal(404, 'esa foto no se subió a este servidor');
      const op = await seudonimosDelServidor().de(operador);
      return ok(await almacenDelServidor().transaccion((e) => {
        const r = registraFoto(e, { sku: a.sku, vista: a.vista, huella: a.retirada ? '' : a.huella!, ...(a.miniatura ? { miniatura: a.miniatura } : {}), ...(a.ancho ? { ancho: a.ancho } : {}), ...(a.alto ? { alto: a.alto } : {}), ...(a.nota ? { nota: a.nota } : {}), ...(a.retirada ? { retirada: true } : {}), operador: op, fecha: ahora });
        return { estado: r.estado, resultado: r.resultado.ok ? { ok: true, foto: r.resultado.foto } : { ok: false, motivo: r.resultado.motivo } };
      }));
    }
    default: return mal(400, 'acción desconocida');
  }
}
