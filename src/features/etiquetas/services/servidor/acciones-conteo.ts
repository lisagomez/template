/**
 * Acciones del inventario fisico. El servidor guarda el conteo CIEGO: mientras se cuenta no sale
 * lo esperado (en la ronda 2 tampoco lo que conto la ronda 1); la conciliacion se ve hasta cerrar
 * las rondas, y a un dispositivo de CONTEO no le llega nunca (`roles.ts`). Abrir y aplicar
 * exigen la integridad COMPLETA del sitio (cadena, proyeccion, anclas y testigos); si falla, se
 * abre incidente y no se cuenta. Quien cuenta, recuenta y autoriza entra
 * como seudonimo.
 */
import {
  abreConteo, aplicaConteo, cancelaConteo, cierraRonda, conteoDe, esErrorLectura, faltantesRepetidos, interpreta, leeEnConteo, leeUbicacion, parseaLectura,
  abreIncidente, type EstadoAlmacen, type Paso,
} from '../nucleo.ts';
import { vistaConteo as vistaSegun, type Rol } from './roles.ts';
import type { AccionEtiquetas } from '../esquemas.ts';
import { almacenDelServidor, hoyIso } from './almacen.ts';
import { avisaCabezas, centralDelServidor, integridadParaActuar, seudonimosDelServidor } from './expediente.ts';

type Respuesta = { status: number; cuerpo: unknown };
const ok = (cuerpo: unknown): Respuesta => ({ status: 200, cuerpo });

async function escribe<T>(cambia: (e: EstadoAlmacen) => Paso<T>): Promise<{ ok: true; valor: T; estado: EstadoAlmacen } | { ok: false; motivo: string }> {
  const r = await almacenDelServidor().transaccion((e) => { const p = cambia(e); return { estado: p.estado, resultado: { paso: p.resultado, estado: p.estado } }; });
  if (!r.paso.ok) return { ok: false, motivo: r.paso.motivo };
  if (r.paso.eventos.length) await avisaCabezas(r.estado, [...new Set(r.paso.eventos.map((x) => x.sitio))]);
  return { ok: true, valor: r.paso.valor, estado: r.estado };
}

type AccionConteo = Extract<AccionEtiquetas, { accion: 'conteos' | 'conteo-abre' | 'conteo-lee' | 'conteo-cierra' | 'conteo-aplica' | 'conteo-cancela' }>;

export async function ejecutaConteo(a: AccionConteo, operador: string, rol: Rol): Promise<Respuesta> {
  const vista = (e: EstadoAlmacen, c: Parameters<typeof vistaSegun>[1]) => vistaSegun(e, c, rol);
  const ahora = new Date().toISOString();
  const op = () => seudonimosDelServidor().de(operador);
  const e = await almacenDelServidor().lee();
  switch (a.accion) {
    case 'conteos':
      return ok({
        conteos: [...(e.conteos ?? [])].reverse().map((c) => vista(e, c)),
        patrones: rol === 'conteo' ? [] : e.configuracion.sitios.map((s) => ({ sitio: s.clave, faltantes: faltantesRepetidos(e, s.clave) })).filter((x) => x.faltantes.length),
      });
    case 'conteo-abre': {
      const integridad = await integridadParaActuar(e, a.sitio, 'auditoria', 'no se abrió el conteo');
      const quien = await op();
      const folio = `CNT-${a.sitio}-${ahora.replace(/\D/g, '').slice(0, 14)}`;
      const r = await escribe((x) => abreConteo(x, { sitio: a.sitio, zonas: a.zonas, tolerancia: a.tolerancia }, folio, ahora, quien, integridad));
      return ok(r.ok ? { ok: true, conteo: vista(r.estado, r.valor) } : r);
    }
    case 'conteo-lee': {
      const lectura = parseaLectura(a.texto);
      if (esErrorLectura(lectura)) return ok({ ok: false, motivo: lectura.mensaje });
      const u = leeUbicacion(lectura.elementos, e.configuracion.sitios);
      if (u) return ok('error' in u ? { ok: false, motivo: u.error } : { ok: true, ubicacion: { sitio: u.sitio.clave, zona: u.zona, ...(u.posicion ? { posicion: u.posicion } : {}) } });
      const quien = await op();
      const r = await escribe((x) => leeEnConteo(x, a.folio, { zona: a.zona, ...(a.posicion ? { posicion: a.posicion } : {}), lectura: interpreta(lectura.elementos, x, hoyIso()), veces: a.veces }, ahora, quien));
      // Una tarima leida solo por su SSCC toma la cantidad del registro: al contador no se le dice.
      const cajas = rol === 'conteo' && r.ok && r.valor.porRegistro ? null : r.ok ? r.valor.cajas : null;
      return ok(r.ok ? { ok: true, leido: { lote: r.valor.lote, sku: r.valor.sku, cajas, zona: r.valor.zona, posicion: r.valor.posicion ?? null, sscc: r.valor.sscc ?? null } } : r);
    }
    case 'conteo-cierra': {
      const r = await escribe((x) => cierraRonda(x, a.folio));
      return ok(r.ok ? { ok: true, conteo: vista(r.estado, conteoDe(r.estado, a.folio)!) } : r);
    }
    case 'conteo-cancela': {
      const quien = await op();
      const r = await escribe((x) => cancelaConteo(x, a.folio, a.motivo, ahora, quien));
      return ok(r.ok ? { ok: true } : r);
    }
    case 'conteo-aplica': {
      const c = conteoDe(e, a.folio);
      if (!c) return ok({ ok: false, motivo: 'ese conteo no existe' });
      const integridad = await integridadParaActuar(e, c.sitio, 'auditoria', 'no se aplicó el conteo');
      const quien = await op();
      const autoriza = a.autoriza ? await seudonimosDelServidor().de(a.autoriza) : undefined;
      const r = await escribe((x) => aplicaConteo(x, a.folio, autoriza, ahora, quien, integridad));
      if (!r.ok) return ok(r);
      const patrones = faltantesRepetidos(r.estado, c.sitio);
      if (patrones.length) {
        await centralDelServidor().transaccion((x) => {
          let y = x;
          for (const f of patrones) y = abreIncidente(y, { fecha: ahora, sitio: c.sitio, origen: 'auditoria', motivo: `faltantes repetidos en ${f.ubicacion}: ${f.cajas} caja(s) en ${f.folios.length} conteos (${f.folios.join(', ')})` });
          return { central: y, resultado: null };
        });
      }
      return ok({ ok: true, acta: r.valor.acta, conteo: vista(r.estado, conteoDe(r.estado, a.folio)!), patrones });
    }
  }
}
