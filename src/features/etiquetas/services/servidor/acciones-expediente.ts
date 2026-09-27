/**
 * Acciones del expediente: salidas, transferencias, correcciones, el agente de riesgo, las
 * decisiones humanas y el anclaje; y las lecturas (lotes, expediente de un lote, integridad,
 * riesgo). Toda escritura pasa por la transaccion del almacen y termina avisando la cabeza de la
 * cadena al central. Quien opera entra a la cadena como seudonimo, nunca con su nombre.
 */
import {
  apertura, cadenaDe, corrige, corridaAgente, decide, evaluaRiesgo, expedienteDe, idLote, pruebaDeEvento, recomendaciones, salida, semaforoDe, transfiere,
  verificaCadena, verificaPruebaEvento, verificaTransferencias, type ClaveLote, type EstadoAlmacen, type Evento, type Paso,
} from '../nucleo.ts';
import type { AccionEtiquetas } from '../esquemas.ts';
import { fotosDelServidor } from './fotos.ts';
import { almacenDelServidor, hoyIso } from './almacen.ts';
import { anclaSitios, auditoria, avisaCabezas, centralDelServidor, integridadParaActuar, seudonimosDelServidor, siembraCentral, ventasDelServidor } from './expediente.ts';

type Respuesta = { status: number; cuerpo: unknown };
const ok = (cuerpo: unknown): Respuesta => ({ status: 200, cuerpo });

/** Un almacen anterior al expediente abre sus cadenas; con la semilla, el central trae sus anclas. */
export async function aseguraExpediente(): Promise<EstadoAlmacen> {
  const almacen = almacenDelServidor();
  let e = await almacen.lee();
  if (!e.eventos && e.existencias.length > 0) {
    e = await almacen.transaccion((x) => { const estado = apertura(x, new Date().toISOString(), 'op-apertura'); return { estado, resultado: estado }; });
  }
  await siembraCentral(e, hoyIso());
  return e;
}

/** Aplica un paso del nucleo y avisa la cabeza de los sitios que tocó. */
async function escribe<T>(cambia: (e: EstadoAlmacen) => Paso<T>): Promise<Respuesta> {
  const almacen = almacenDelServidor();
  const r = await almacen.transaccion((e) => { const p = cambia(e); return { estado: p.estado, resultado: { paso: p.resultado, estado: p.estado } }; });
  if (!r.paso.ok) return ok({ ok: false, motivo: r.paso.motivo });
  await avisaCabezas(r.estado, r.paso.eventos.map((x) => x.sitio));
  return ok({ ok: true, valor: r.paso.valor, eventos: r.paso.eventos.map(resumen) });
}

const resumen = (x: Evento) => ({ sitio: x.sitio, seq: x.seq, tipo: x.tipo, hash: x.hash });
const lote = (a: { gtin: string; lote: string; caducidad: string }): ClaveLote => ({ gtin: a.gtin, lote: a.lote, caducidad: a.caducidad });

/** Los lotes que tienen expediente, con su ultimo evento. */
function lotes(e: EstadoAlmacen) {
  const m = new Map<string, { lote: ClaveLote; sku: string; descripcion: string; sitios: Set<string>; eventos: number; ultimo: Evento }>();
  for (const ev of Object.values(e.eventos ?? {}).flat()) {
    // Una revision por confirmar no es un lote todavia (su clave es el folio): vive en la bandeja.
    if (ev.lote.caducidad === '') continue;
    const k = idLote(ev.lote);
    const sku = String(ev.datos['sku'] ?? m.get(k)?.sku ?? '');
    const g = m.get(k) ?? { lote: ev.lote, sku, descripcion: e.articulos[sku]?.descripcion ?? sku, sitios: new Set<string>(), eventos: 0, ultimo: ev };
    g.sitios.add(ev.sitio);
    g.eventos++;
    if (ev.fecha >= g.ultimo.fecha) g.ultimo = ev;
    m.set(k, g);
  }
  return [...m.values()].map((g) => ({ ...g, sitios: [...g.sitios], ultimo: resumen(g.ultimo), ultimaFecha: g.ultimo.fecha })).sort((a, b) => b.ultimaFecha.localeCompare(a.ultimaFecha));
}

/** El expediente de un lote con su prueba: cadena de cada sitio, inclusion en la raiz anclada y enlaces. */
async function expediente(e: EstadoAlmacen, l: ClaveLote) {
  const c = await centralDelServidor().lee();
  const eventos = expedienteDe(e.eventos ?? {}, l);
  const sitios = [...new Set(eventos.map((x) => x.sitio))];
  const cadenas = Object.fromEntries(sitios.map((s) => [s, verificaCadena(s, cadenaDe(e, s))]));
  const enlaces = verificaTransferencias(e.eventos ?? {}).filter((f) => eventos.some((x) => x.sitio === f.sitio && x.seq === f.seq));
  const conPrueba = eventos.map((x) => {
    const p = pruebaDeEvento(x, cadenaDe(e, x.sitio), c.anclas[x.sitio] ?? []);
    return { evento: x, anclado: p ? { periodo: p.periodo, verificado: verificaPruebaEvento(x, p), indice: p.indice, tamano: p.tamano, ruta: p.ruta, raiz: p.raiz } : null };
  });
  const existencias = e.existencias.filter((x) => x.gtin === l.gtin && x.lote === l.lote);
  const sku = existencias[0]?.sku ?? String(eventos.find((x) => x.datos['sku'])?.datos['sku'] ?? '');
  const devoluciones = (e.devoluciones ?? []).filter((d) => d.gtin === l.gtin && d.lote === l.lote);
  return {
    lote: l, sku, descripcion: e.articulos[sku]?.descripcion ?? sku, semaforo: sku ? semaforoDe(e, sku, l.caducidad, hoyIso()) : null,
    eventos: conPrueba, cadenas, enlaces, existencias, devoluciones, ok: Object.values(cadenas).every((v) => v.ok) && enlaces.length === 0 && conPrueba.every((x) => !x.anclado || x.anclado.verificado),
  };
}

type AccionExpediente = Extract<AccionEtiquetas, { accion: 'lotes' | 'expediente' | 'integridad' | 'riesgo' | 'salida' | 'transferencia' | 'correccion' | 'agente' | 'decision' | 'ancla' }>;

export async function ejecutaExpediente(a: AccionExpediente, operador: string): Promise<Respuesta> {
  const e = await aseguraExpediente();
  const hoy = hoyIso();
  const ahora = new Date().toISOString();
  const op = () => seudonimosDelServidor().de(operador);
  switch (a.accion) {
    case 'lotes':
      return ok({ lotes: lotes(e) });
    case 'expediente':
      return ok(await expediente(e, lote(a)));
    case 'integridad':
      return ok(await auditoria(e));
    case 'riesgo': {
      const ventas = ventasDelServidor();
      const sitios = e.configuracion.sitios.map((s) => s.clave);
      return ok({
        fuente: ventas.nombre, hoy,
        riesgos: sitios.flatMap((s) => evaluaRiesgo(e, s, hoy, ventas)),
        recomendaciones: sitios.flatMap((s) => recomendaciones(e, s)).sort((x, y) => y.evento.fecha.localeCompare(x.evento.fecha)),
      });
    }
    case 'salida': {
      const autoriza = a.autoriza ? await seudonimosDelServidor().de(a.autoriza) : undefined;
      const quien = await op();
      return escribe((x) => salida(x, { sitio: a.sitio, tipo: a.tipo, lote: lote(a), cajas: a.cajas, ...(a.canal ? { canal: a.canal } : {}), ...(autoriza ? { autoriza } : {}), ...(a.motivo ? { motivo: a.motivo } : {}) }, hoy, ahora, quien));
    }
    case 'transferencia': {
      const quien = await op();
      return escribe((x) => transfiere(x, { origen: a.origen, destino: a.destino, lote: lote(a), cajas: a.cajas }, hoy, ahora, `tr-${Date.now()}`, quien));
    }
    case 'correccion': {
      const quien = await op();
      if (a.foto && !(await fotosDelServidor().lee(a.foto))) return { status: 404, cuerpo: { error: 'la foto de la corrección no se subió a este servidor' } };
      const evidencia = a.foto ? { evidencia: { fotos: { completa: a.foto, recortes: [] }, ...(a.textoFoto ? { texto: a.textoFoto } : {}) } } : {};
      return escribe((x) => corrige(x, { sitio: a.sitio, corrige: a.corrige, motivo: a.motivo, ...(a.ajuste ? { ajuste: a.ajuste } : {}), ...(a.caducidad ? { caducidad: a.caducidad } : {}), ...evidencia }, ahora, `cor-${Date.now()}`, quien));
    }
    case 'agente': {
      const ventas = ventasDelServidor();
      const sitios = a.sitio ? [a.sitio] : e.configuracion.sitios.map((s) => s.clave);
      const informe: { sitio: string; emitidas: number; riesgos: number; bloqueo?: string }[] = [];
      for (const s of sitios) {
        const actual = await almacenDelServidor().lee();
        const integridad = await integridadParaActuar(actual, s);
        const r = await almacenDelServidor().transaccion((x) => { const c = corridaAgente(x, s, hoy, ventas, ahora, integridad); return { estado: c.estado, resultado: c }; });
        if (r.emitidas.length) await avisaCabezas(r.estado, [s]);
        informe.push({ sitio: s, emitidas: r.emitidas.length, riesgos: r.riesgos.length, ...(r.bloqueo ? { bloqueo: r.bloqueo } : {}) });
      }
      return ok({ fuente: ventas.nombre, informe });
    }
    case 'decision': {
      const integridad = await integridadParaActuar(e, a.sitio);
      const persona = await op();
      return escribe((x) => decide(x, { sitio: a.sitio, recomendacion: a.recomendacion, decision: a.decision, persona, ...(a.motivo ? { motivo: a.motivo } : {}) }, hoy, ahora, `dec-${Date.now()}`, integridad));
    }
    case 'ancla':
      return ok({ anclas: await anclaSitios(e, e.configuracion.sitios.map((s) => s.clave), hoy) });
  }
}
