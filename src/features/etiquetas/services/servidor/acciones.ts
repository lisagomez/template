/**
 * Lo que hace el servidor con cada accion ya validada. Todo cambio pasa por una transaccion del
 * almacen; el plan de importacion se RECALCULA dentro de la transaccion al aplicar (nunca se
 * confia en el plan que muestra el navegador: entre que se ve y se aplica pudo cambiar el estado).
 */
import { emiteTicket, secretoValido } from '../../../../../tools/etiquetas-gs1/dist/agente/index.js';
import {
  altaDeLote, aplicaImportacion, emiteSscc, esEmision, esErrorLectura, interpreta, leeFilas, parseaLectura, planificaImportacion, recibe, revisaPrefijoEmpresa,
  revisaZpl, type EstadoAlmacen, type PlanImportacion,
} from '../nucleo.ts';
import type { AccionEtiquetas } from '../esquemas.ts';
import { almacenDelServidor, hoyIso } from './almacen.ts';

export type Respuesta = { status: number; cuerpo: unknown };
const ok = (cuerpo: unknown): Respuesta => ({ status: 200, cuerpo });
const mal = (status: number, error: string): Respuesta => ({ status, cuerpo: { error } });

export async function leeEstado(): Promise<Respuesta> {
  const e = await almacenDelServidor().lee();
  return ok({
    hoy: hoyIso(), version: e.version, configuracion: e.configuracion, articulos: Object.values(e.articulos), impresoras: e.impresoras,
    existencias: e.existencias, importaciones: e.importaciones.slice(-10), asignaciones: e.asignaciones.slice(-50), contadores: e.contadores,
    agenteConSecreto: secretoValido(process.env['ETIQUETAS_AGENTE_SECRETO']),
  });
}

function planDe(e: EstadoAlmacen, registros: Record<string, string>[]): PlanImportacion {
  const { filas, errores } = leeFilas(registros, e.configuracion.categorias.map((c) => c.id));
  return planificaImportacion(filas, errores, e);
}

export async function ejecuta(a: AccionEtiquetas, operador: string): Promise<Respuesta> {
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
    case 'etiquetado':
      return ok(await almacen.transaccion<unknown>((e) => {
        const art = e.articulos[a.sku];
        if (!art?.gtinCaja) return { estado: e, resultado: { error: `el artículo ${a.sku} no tiene GTIN de caja` } };
        return altaDeLote(e, { sitio: a.sitio, sku: a.sku, gtin: art.gtinCaja, lote: a.lote, caducidad: a.caducidad, cantidad: a.cantidad, ...(a.sscc ? { sscc: a.sscc } : {}) }, 'etiquetado', ahora, `eti-${Date.now()}`);
      }));
    case 'recepcion': {
      const lectura = parseaLectura(a.texto);
      if (esErrorLectura(lectura)) return mal(422, lectura.mensaje);
      return ok(await almacen.transaccion((e) => recibe(e, interpreta(lectura.elementos, e, hoyIso()), a.sitio, ahora, `rec-${Date.now()}`)));
    }
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
