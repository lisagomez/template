/**
 * El tablero del dueño: una PROYECCIÓN de solo lectura sobre los datos de su inquilino (no
 * escribe nada). Por canal —cada campaña, cada etiqueta orgánica y lo directo—: conversaciones,
 * pedidos pagados, ingresos, gasto, costo por venta, ROAS, y el costo real por conversación en
 * Meta (del `pricing` de cada estado y la tarjeta) y en IA (con los huecos declarados, no sumados
 * como cero).
 */
import type { AlmacenInquilino } from '../almacen/almacen.js';
import type { TarjetaDeTarifas } from '../meta/tarifas.js';

export interface FilaCanal {
  canal: string;
  tipo: 'anuncio' | 'organico' | 'directo';
  conversaciones: number;
  pedidosPagados: number;
  ingresosCentavos: number;
  /** Solo campañas; `null` en lo orgánico. */
  gastoCentavos: number | null;
  costoPorVentaCentavos: number | null;
  roas: number | null;
  costoMetaMicros: number;
  costoIaMicros: number;
  eventosAceptados: number;
}

export interface Tablero {
  filas: FilaCanal[];
  totales: Omit<FilaCanal, 'canal' | 'tipo'>;
  porConversacion: { conversaciones: number; metaMicros: number; iaMicros: number; mensajesSalientes: number; mensajesPorConversacion: number };
  /** Llamadas de IA sin datos de uso: el costo de IA NO está completo mientras sea > 0. */
  llamadasIaSinCosto: number;
  iaSimulada: boolean;
  tarjeta: { id: string; verificada: boolean };
}

export async function tableroDelDueno(datos: AlmacenInquilino, tarjeta: TarjetaDeTarifas): Promise<Tablero> {
  const [conversaciones, origenes, pedidos, gastos, mensajes, usos, eventos] = await Promise.all([
    datos.lista('conversaciones'), datos.lista('origenes'), datos.lista('pedidos'), datos.lista('gastoAnuncios'),
    datos.lista('mensajes'), datos.lista('usoIa'), datos.lista('eventos'),
  ]);
  const filas = new Map<string, FilaCanal>();
  const fila = (canal: string, tipo: FilaCanal['tipo']): FilaCanal => {
    let f = filas.get(canal);
    if (!f) {
      f = { canal, tipo, conversaciones: 0, pedidosPagados: 0, ingresosCentavos: 0, gastoCentavos: null, costoPorVentaCentavos: null, roas: null, costoMetaMicros: 0, costoIaMicros: 0, eventosAceptados: 0 };
      filas.set(canal, f);
    }
    return f;
  };
  const filaDe = (o: { tipo: string; campanaId?: string; anuncioId?: string; etiqueta?: string }): FilaCanal => {
    if (o.tipo === 'anuncio') {
      const g = gastos.find((x) => x.campanaId === o.campanaId || (o.anuncioId !== undefined && x.anuncios.includes(o.anuncioId)));
      return fila(g ? g.nombre : `anuncio ${o.anuncioId ?? 'sin id'}`, 'anuncio');
    }
    if (o.tipo === 'organico') return fila(o.etiqueta ?? 'orgánico', 'organico');
    return fila('directo', 'directo');
  };
  const canalDe = new Map<string, FilaCanal>();
  for (const c of conversaciones) {
    const f = filaDe(origenes.find((x) => x.conversacionId === c.id) ?? c.origen);
    f.conversaciones++;
    canalDe.set(c.id, f);
  }
  for (const p of pedidos) {
    if (p.estado !== 'pagado') continue;
    // El pedido cuenta para el origen VIGENTE cuando se hizo (no para el de hoy).
    const c = conversaciones.find((x) => x.id === p.conversacionId);
    const alPedir = c ? [...c.historialOrigenes].reverse().find((o) => o.registradoEn <= p.creadoEn) : undefined;
    const f = alPedir ? filaDe(alPedir) : canalDe.get(p.conversacionId);
    if (!f) continue;
    f.pedidosPagados++;
    f.ingresosCentavos += p.totalCentavos;
  }
  let salientes = 0;
  for (const m of mensajes) {
    if (m.direccion === 'saliente') salientes++;
    const f = canalDe.get(m.conversacionId);
    if (f && m.costoMicros) f.costoMetaMicros += m.costoMicros;
  }
  let sinCosto = 0;
  let iaSimulada = false;
  for (const u of usos) {
    if (u.simulado) iaSimulada = true;
    if (u.costoMicros === null) { sinCosto++; continue; }
    const f = canalDe.get(u.conversacionId);
    if (f) f.costoIaMicros += u.costoMicros;
  }
  for (const e of eventos) {
    const f = canalDe.get(e.conversacionId);
    if (f && e.estado === 'aceptado') f.eventosAceptados++;
  }
  for (const g of gastos) {
    const f = fila(g.nombre, 'anuncio');
    f.gastoCentavos = g.gastoCentavos;
  }
  for (const f of filas.values()) {
    if (f.gastoCentavos !== null) {
      f.roas = f.gastoCentavos > 0 ? Math.round((f.ingresosCentavos / f.gastoCentavos) * 100) / 100 : null;
      f.costoPorVentaCentavos = f.pedidosPagados > 0 ? Math.round(f.gastoCentavos / f.pedidosPagados) : null;
    }
  }
  const lista = [...filas.values()].sort((a, b) => b.ingresosCentavos - a.ingresosCentavos);
  const suma = (k: 'conversaciones' | 'pedidosPagados' | 'ingresosCentavos' | 'costoMetaMicros' | 'costoIaMicros' | 'eventosAceptados') => lista.reduce((a, f) => a + f[k], 0);
  const gastoTotal = lista.reduce((a, f) => a + (f.gastoCentavos ?? 0), 0);
  const ingresosAnuncios = lista.filter((f) => f.tipo === 'anuncio').reduce((a, f) => a + f.ingresosCentavos, 0);
  const ventasAnuncios = lista.filter((f) => f.tipo === 'anuncio').reduce((a, f) => a + f.pedidosPagados, 0);
  const n = conversaciones.length;
  return {
    filas: lista,
    totales: {
      conversaciones: suma('conversaciones'), pedidosPagados: suma('pedidosPagados'), ingresosCentavos: suma('ingresosCentavos'),
      gastoCentavos: gastoTotal, costoPorVentaCentavos: ventasAnuncios ? Math.round(gastoTotal / ventasAnuncios) : null,
      roas: gastoTotal ? Math.round((ingresosAnuncios / gastoTotal) * 100) / 100 : null,
      costoMetaMicros: suma('costoMetaMicros'), costoIaMicros: suma('costoIaMicros'), eventosAceptados: suma('eventosAceptados'),
    },
    porConversacion: {
      conversaciones: n,
      metaMicros: n ? Math.round(suma('costoMetaMicros') / n) : 0,
      iaMicros: n ? Math.round(suma('costoIaMicros') / n) : 0,
      mensajesSalientes: salientes,
      mensajesPorConversacion: n ? Math.round((salientes / n) * 10) / 10 : 0,
    },
    llamadasIaSinCosto: sinCosto,
    iaSimulada,
    tarjeta: { id: tarjeta.id, verificada: tarjeta.verificada },
  };
}
