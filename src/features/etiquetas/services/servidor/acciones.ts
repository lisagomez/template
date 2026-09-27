/**
 * Lo que hace el servidor con cada accion ya validada. Todo cambio pasa por una transaccion del
 * almacen; el plan de importacion se RECALCULA dentro de la transaccion al aplicar (nunca se
 * confia en el plan que muestra el navegador: entre que se ve y se aplica pudo cambiar el estado).
 */
import { emiteTicket, secretoValido } from '../../../../../tools/etiquetas-gs1/dist/agente/index.js';
import {
  altaConExpediente, aplicaImportacion, CONSUMIBLES_VACIOS, formatoDe, fotoVigente, revisionesAbiertas, emiteSscc, esEmision, esErrorLectura, interpreta, leeFilas, leeUbicacion, mueveConExpediente, parseaLectura, planificaImportacion,
  recibeConExpediente, revisaPrefijoEmpresa, revisaZpl, type Consumibles, type EstadoAlmacen, type Paso, type PlanImportacion,
} from '../nucleo.ts';
import type { AccionEtiquetas } from '../esquemas.ts';
import { almacenDelServidor, hoyIso } from './almacen.ts';
import { aseguraExpediente, ejecutaExpediente } from './acciones-expediente.ts';
import { ejecutaConteo } from './acciones-conteo.ts';
import { ejecutaRecepcion } from './acciones-recepcion.ts';
import { ejecutaZona } from './acciones-zona.ts';
import { motorDelServidor } from './fotos.ts';
import { cuentaACiegas, type Rol } from './roles.ts';
import { avisaCabezas, seudonimosDelServidor } from './expediente.ts';

export type Respuesta = { status: number; cuerpo: unknown };
const ok = (cuerpo: unknown): Respuesta => ({ status: 200, cuerpo });
const mal = (status: number, error: string): Respuesta => ({ status, cuerpo: { error } });

/**
 * Los lotes que hay, SIN cantidad: lo que necesita el almacenista (que lote, donde, cuando caduca)
 * para trabajar sin saber cuantas cajas dice el sistema.
 */
function lotesSinCantidad(e: EstadoAlmacen) {
  const vistos = new Set<string>();
  return e.existencias.filter((x) => x.cantidad > 0).map((x) => ({ sitio: x.sitio, sku: x.sku, gtin: x.gtin, lote: x.lote, caducidad: x.caducidad, zona: x.zona ?? 'recibo', ...(x.posicion ? { posicion: x.posicion } : {}) }))
    .filter((x) => { const k = JSON.stringify(x); if (vistos.has(k)) return false; vistos.add(k); return true; });
}

export async function leeEstado(rol: Rol = 'operacion'): Promise<Respuesta> {
  const e = await aseguraExpediente();
  if (cuentaACiegas(rol)) {
    // Quien cuenta a ciegas (dispositivo de conteo o ALMACENISTA) recibe el catalogo, los sitios y
    // los lotes, pero NINGUNA cantidad: sin existencias, movimientos, consumo, devoluciones ni la
    // bandeja (que dice cuantas cajas esperan).
    return ok({
      hoy: hoyIso(), version: e.version, rol, configuracion: e.configuracion, articulos: Object.values(e.articulos), impresoras: [], existencias: [], movimientos: [],
      importaciones: [], asignaciones: [], contadores: e.contadores, agenteConSecreto: false, consumibles: CONSUMIBLES_VACIOS, devoluciones: [],
      ...fichas(e), revisiones: [], motor: rol === 'almacenista' ? motorDelServidor()?.modelo ?? null : null, ...(rol === 'almacenista' ? { lotes: lotesSinCantidad(e) } : {}),
    });
  }
  return ok({
    rol,
    hoy: hoyIso(), version: e.version, configuracion: e.configuracion, articulos: Object.values(e.articulos), impresoras: e.impresoras,
    existencias: e.existencias, movimientos: (e.movimientos ?? []).slice(-30), importaciones: e.importaciones.slice(-10), asignaciones: e.asignaciones.slice(-50), contadores: e.contadores,
    agenteConSecreto: secretoValido(process.env['ETIQUETAS_AGENTE_SECRETO']),
    consumibles: e.consumibles ?? CONSUMIBLES_VACIOS,
    devoluciones: (e.devoluciones ?? []).slice(-20),
    ...fichas(e),
    revisiones: revisionesAbiertas(e).map((r) => ({ sitio: r.sitio, folio: r.folio, sku: r.sku, cajas: r.cajas, desde: r.desde, revision: r.evento.hash })),
    motor: motorDelServidor()?.modelo ?? null,
  });
}

/** Las fotos VIGENTES de cada articulo y su formato de fecha aprendido (no el historial entero). */
function fichas(e: EstadoAlmacen) {
  const fotos = VISTAS.flatMap((v) => Object.keys(e.articulos).map((sku) => fotoVigente(e, sku, v)).filter((f) => f !== undefined));
  const formatosFecha = Object.keys(e.articulos).map((sku) => formatoDe(e, sku)).filter((f) => f !== undefined);
  return { fotos, formatosFecha };
}
const VISTAS = ['principal', 'frente', 'etiqueta', 'caja', 'caducidad'] as const;

/** Una operacion de inventario con su evento: la transaccion, y la cabeza nueva al central. */
async function conExpediente<T>(cambia: (e: EstadoAlmacen) => Paso<T>): Promise<Respuesta> {
  const r = await almacenDelServidor().transaccion((e) => { const p = cambia(e); return { estado: p.estado, resultado: { paso: p.resultado, estado: p.estado } }; });
  if (!r.paso.ok) return ok({ ok: false, motivo: r.paso.motivo });
  await avisaCabezas(r.estado, r.paso.eventos.map((x) => x.sitio));
  return ok({ ok: true, ...r.paso.valor, eventos: r.paso.eventos.map((x) => ({ sitio: x.sitio, seq: x.seq, tipo: x.tipo, hash: x.hash })) });
}

/** Cambio sobre los consumibles del estado (que un almacen anterior puede no traer). */
function conConsumibles(e: EstadoAlmacen, cambia: (c: Consumibles) => Consumibles): EstadoAlmacen {
  return { ...e, version: e.version + 1, consumibles: cambia(e.consumibles ?? CONSUMIBLES_VACIOS) };
}

function planDe(e: EstadoAlmacen, registros: Record<string, string>[]): PlanImportacion {
  const { filas, errores } = leeFilas(registros, e.configuracion.categorias.map((c) => c.id));
  return planificaImportacion(filas, errores, e);
}

export async function ejecuta(a: AccionEtiquetas, operador: string, rol: Rol = 'operacion'): Promise<Respuesta> {
  const almacen = almacenDelServidor();
  const ahora = new Date().toISOString();
  switch (a.accion) {
    case 'catalogo-plan':
      return ok(planDe(await almacen.lee(), a.registros));
    case 'catalogo-aplica':
      return ok(await almacen.transaccion((e) => {
        const plan = planDe(e, a.registros);
        const estado = aplicaImportacion(e, plan, { id: `imp-${Date.now()}`, archivo: a.archivo, huella: a.huella, operador, fecha: ahora });
        return { estado, resultado: plan };
      }));
    case 'config': {
      if (a.prefijoEmpresa !== undefined) {
        const r = revisaPrefijoEmpresa(a.prefijoEmpresa);
        if (!r.ok) return mal(422, r.mensaje);
      }
      const { accion: _accion, ...cambios } = a;
      void _accion;
      return ok(await almacen.transaccion((e) => {
        const categoriasDeEjemplo = cambios.categorias ? false : e.configuracion.categoriasDeEjemplo;
        const estado = { ...e, version: e.version + 1, configuracion: { ...e.configuracion, ...cambios, categoriasDeEjemplo } };
        return { estado, resultado: estado.configuracion };
      }));
    }
    case 'impresora':
      return ok(await almacen.transaccion<unknown>((e) => {
        if (!e.configuracion.sitios.some((s) => s.clave === a.perfil.sitio)) return { estado: e, resultado: { error: `el sitio ${a.perfil.sitio} no existe` } };
        const impresoras = [...e.impresoras.filter((p) => p.id !== a.perfil.id), a.perfil];
        return { estado: { ...e, version: e.version + 1, impresoras }, resultado: a.perfil };
      }));
    case 'sscc':
      return ok(await almacen.transaccion<unknown>((e) => {
        const r = emiteSscc(e.configuracion.prefijoEmpresa, e.configuracion.extensionSscc, e.contadores.sscc, new Set(e.emitidos));
        if (!esEmision(r)) return { estado: e, resultado: { error: r.error } };
        return { estado: { ...e, version: e.version + 1, contadores: { ...e.contadores, sscc: r.siguiente }, emitidos: [...e.emitidos, r.numero] }, resultado: { sscc: r.numero } };
      }));
    case 'etiquetado': {
      const op = await seudonimosDelServidor().de(operador);
      return conExpediente((e) => {
        const art = e.articulos[a.sku];
        if (!art?.gtinCaja) return { estado: e, resultado: { ok: false, motivo: `el artículo ${a.sku} no tiene GTIN de caja` } };
        return altaConExpediente(e, { sitio: a.sitio, sku: a.sku, gtin: art.gtinCaja, lote: a.lote, caducidad: a.caducidad, cantidad: a.cantidad, ...(a.sscc ? { sscc: a.sscc } : {}) }, 'etiquetado', ahora, `eti-${Date.now()}`, op);
      });
    }
    case 'recepcion': {
      const lectura = parseaLectura(a.texto);
      if (esErrorLectura(lectura)) return mal(422, lectura.mensaje);
      const op = await seudonimosDelServidor().de(operador);
      return conExpediente((e) => recibeConExpediente(e, interpreta(lectura.elementos, e, hoyIso()), a.sitio, ahora, `rec-${Date.now()}`, op, a.texto));
    }
    case 'movimiento': {
      const lectura = parseaLectura(a.texto);
      if (esErrorLectura(lectura)) return mal(422, lectura.mensaje);
      const op = await seudonimosDelServidor().de(operador);
      return conExpediente((e) => {
        if (leeUbicacion(lectura.elementos, e.configuracion.sitios)) return { estado: e, resultado: { ok: false, motivo: 'eso es una etiqueta de ubicación: sirve para elegir a dónde se mueve, no se mueve ella' } };
        return mueveConExpediente(e, { sitio: a.sitio, destino: a.destino, lectura: interpreta(lectura.elementos, e, hoyIso()), veces: a.veces, operador: op }, ahora, `mov-${Date.now()}`, hoyIso(), a.posicion);
      });
    }
    case 'consumo':
      return ok(await almacen.transaccion<unknown>((e) => {
        if (!e.impresoras.some((p) => p.id === a.impresora && p.sitio === a.sitio)) return { estado: e, resultado: { error: `la impresora ${a.impresora} no es del sitio ${a.sitio}` } };
        const rollo = e.consumibles?.rolloPorImpresora[a.impresora];
        const consumo = { id: `con-${Date.now()}`, fecha: ahora, sitio: a.sitio, impresora: a.impresora, etiquetas: a.etiquetas, origen: a.origen, operador, ...(rollo ? { rollo } : {}) };
        return { estado: conConsumibles(e, (c) => ({ ...c, consumos: [...c.consumos, consumo] })), resultado: consumo };
      }));
    case 'rollo':
      return ok(await almacen.transaccion((e) => ({ estado: conConsumibles(e, (c) => ({ ...c, rollos: [...c.rollos.filter((r) => r.id !== a.rollo.id), a.rollo] })), resultado: a.rollo })));
    case 'rollo-impresora':
      return ok(await almacen.transaccion<unknown>((e) => {
        if (a.rollo && !(e.consumibles?.rollos ?? []).some((r) => r.id === a.rollo)) return { estado: e, resultado: { error: `el rollo ${a.rollo} no está en el catálogo` } };
        const estado = conConsumibles(e, (c) => {
          const rolloPorImpresora = { ...c.rolloPorImpresora };
          if (a.rollo) rolloPorImpresora[a.impresora] = a.rollo; else delete rolloPorImpresora[a.impresora];
          return { ...c, rolloPorImpresora };
        });
        return { estado, resultado: { impresora: a.impresora, rollo: a.rollo } };
      }));
    case 'presupuesto':
      return ok(await almacen.transaccion((e) => ({
        estado: conConsumibles(e, (c) => ({ ...c, presupuestos: [...c.presupuestos.filter((p) => !(p.sitio === a.sitio && p.mes === a.mes)), { sitio: a.sitio, mes: a.mes, monto: a.monto }] })),
        resultado: { sitio: a.sitio, mes: a.mes, monto: a.monto },
      })));
    case 'compra':
      return ok(await almacen.transaccion<unknown>((e) => {
        if (!(e.consumibles?.rollos ?? []).some((r) => r.id === a.rollo)) return { estado: e, resultado: { error: `el rollo ${a.rollo} no está en el catálogo` } };
        const compra = { id: `com-${Date.now()}`, fecha: ahora, sitio: a.sitio, rollo: a.rollo, rollos: a.rollos, costoTotal: a.costoTotal, operador };
        return { estado: conConsumibles(e, (c) => ({ ...c, compras: [...c.compras, compra] })), resultado: compra };
      }));
    case 'lotes': case 'expediente': case 'integridad': case 'riesgo': case 'salida': case 'transferencia': case 'correccion': case 'agente': case 'decision': case 'ancla':
      return ejecutaExpediente(a, operador);
    case 'conteos': case 'conteo-abre': case 'conteo-lee': case 'conteo-cierra': case 'conteo-aplica': case 'conteo-cancela':
      await aseguraExpediente();
      return ejecutaConteo(a, operador, rol);
    case 'escanea': case 'deshaz': case 'ronda': case 'dia': case 'identifica-pieza': case 'registra-hallazgo':
      await aseguraExpediente();
      return ejecutaZona(a, operador, rol);
    case 'lee-caducidad': case 'revision-confirma': case 'revision-descarta': case 'revisiones': case 'vincula-gtin': case 'foto-articulo':
      await aseguraExpediente();
      return ejecutaRecepcion(a, operador);
    case 'ticket': {
      const secreto = process.env['ETIQUETAS_AGENTE_SECRETO'];
      if (!secretoValido(secreto)) return mal(503, 'no hay agente de impresión configurado en el servidor (falta ETIQUETAS_AGENTE_SECRETO)');
      const e = await almacen.lee();
      const imp = e.impresoras.find((p) => p.id === a.impresora && p.sitio === a.sitio);
      if (!imp) return mal(403, `la impresora ${a.impresora} no es del sitio ${a.sitio}`);
      const revision = revisaZpl(a.zpl);
      if (!revision.ok) return mal(422, revision.motivo);
      return ok({ ticket: emiteTicket({ impresora: a.impresora, sitio: a.sitio, zpl: a.zpl, copias: a.copias, operador }, secreto), agente: e.configuracion.sitios.find((s) => s.clave === a.sitio)?.agente });
    }
  }
}
