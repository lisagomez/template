/**
 * El roadmap de costos y el presupuesto del laboratorio. TODO ES FICTICIO salvo lo marcado como
 * «medido en el laboratorio»: sirve para ver la FORMA de los costos por fase (qué pesa cuándo y qué
 * palanca importa), no para fijar precios. Los precios se fijan midiendo en el piloto (la fuente lo
 * dice: «precio y volumen incluidos quedan abiertos hasta medir el costo real de IA»).
 *
 * El costo de Meta se calcula con las MISMAS reglas que el simulador (`decidePrecio` y la tarjeta):
 * entrada gratis por anuncio, cupo de 1,000 de servicio por número al mes, utilidad y marketing.
 */
import { TARJETA_LABORATORIO, type TarjetaDeTarifas } from '../meta/tarifas.js';

export type NaturalezaSupuesto = 'medido' | 'ficticio' | 'fuente';
export interface Supuesto<T = number> { valor: T; naturaleza: NaturalezaSupuesto; nota: string }

export interface Supuestos {
  tipoDeCambio: Supuesto;
  pymesPorMes: Supuesto<number[]>;
  conversacionesPorPymeMes: Supuesto;
  fraccionDesdeAnuncio: Supuesto;
  mensajesPorConversacion: Supuesto;
  llamadasModeloPorConversacion: Supuesto;
  tokensPorLlamada: Supuesto;
  precioModeloUsdPorMillon: Supuesto;
  pedidosPorConversacion: Supuesto;
  plantillasUtilidadPorPedido: Supuesto;
  marketingPorPymeMesF5: Supuesto;
  infraUsdPorFase: Supuesto<Record<string, number>>;
  soporteHorasPorPymeMes: Supuesto<Record<string, number>>;
  costoHoraSoporteMxn: Supuesto;
  planMensualMxn: Supuesto<Record<string, number>>;
  kapsoUsdMes: Supuesto<{ hasta3: number; hasta50: number; porNumeroExtra: number }>;
  numeros: Supuesto<{ sinNumeroPropio: number; fraccionRenta: number; altaVentaMxn: number; costoAltaVentaMxn: number; administracionMxn: number; rentaMxn: number; costoRentaMxn: number; colchonPool: number }>;
  bsp: Supuesto<{ solutionPartnerDesdeMes: number; margenSobreMeta: number; desarrolloHoras: number; costoHoraDesarrolloMxn: number }>;
}

/** Los valores «medido» salen de `mideOptimizacion` (30/09/2026, con el optimizador encendido). */
export const SUPUESTOS_LABORATORIO: Supuestos = {
  tipoDeCambio: { valor: 18.5, naturaleza: 'ficticio', nota: 'MXN por USD, fijo para el ejercicio' },
  pymesPorMes: { valor: [1, 1, 3, 3, 10, 40, 100, 130, 160, 190, 220, 250], naturaleza: 'ficticio', nota: 'meses 1-4: piloto (fases 0-3); 5-7: multi-pyme (fase 4); 8-12: escala (fase 5)' },
  conversacionesPorPymeMes: { valor: 600, naturaleza: 'ficticio', nota: '20 al día: una pyme de comida o boutique local' },
  fraccionDesdeAnuncio: { valor: 0.4, naturaleza: 'ficticio', nota: 'conversaciones que nacen de un anuncio Click-to-WhatsApp (72 h gratis)' },
  mensajesPorConversacion: { valor: 2.72, naturaleza: 'medido', nota: 'mensajes del negocio por conversación, laboratorio con cola larga' },
  llamadasModeloPorConversacion: { valor: 0.3, naturaleza: 'medido', nota: 'con el enrutador determinista (sin él: 2.12)' },
  tokensPorLlamada: { valor: 210, naturaleza: 'medido', nota: 'tokens ESTIMADOS del modelo simulado; el real: no medido' },
  precioModeloUsdPorMillon: { valor: 3.2, naturaleza: 'ficticio', nota: 'mezcla 85 % entrada / 15 % salida de un nivel «capaz» (2 y 10 USD/M): referencial hasta el CDC' },
  pedidosPorConversacion: { valor: 0.12, naturaleza: 'ficticio', nota: 'intención × conversión reales: se miden en el piloto' },
  plantillasUtilidadPorPedido: { valor: 0.25, naturaleza: 'ficticio', nota: 'avisos de pedido que caen fuera de la ventana (plantilla de utilidad cobrada)' },
  marketingPorPymeMesF5: { valor: 150, naturaleza: 'ficticio', nota: 'reactivación con opt-in, solo en la fase 5' },
  infraUsdPorFase: { valor: { piloto: 20, multipyme: 90, escala: 450 }, naturaleza: 'ficticio', nota: 'VPS y base de datos; la fase 5 con trabajadores horizontales y alta disponibilidad' },
  soporteHorasPorPymeMes: { valor: { piloto: 4, multipyme: 1, escala: 0.5 }, naturaleza: 'ficticio', nota: 'horas nuestras por pyme (llave en mano → autoservicio)' },
  costoHoraSoporteMxn: { valor: 250, naturaleza: 'ficticio', nota: 'hora de soporte y operación' },
  planMensualMxn: { valor: { piloto: 2500, multipyme: 1490, escala: 1490 }, naturaleza: 'ficticio', nota: 'llave en mano en el piloto; SaaS vertical después' },
  kapsoUsdMes: { valor: { hasta3: 25, hasta50: 299, porNumeroExtra: 5 }, naturaleza: 'fuente', nota: 'planes publicados de Kapso (fuente §Kapso): lo que costaría COMPRAR el BSP en vez de construirlo (N-02)' },
  numeros: { valor: { sinNumeroPropio: 0.35, fraccionRenta: 0.4, altaVentaMxn: 600, costoAltaVentaMxn: 250, administracionMxn: 99, rentaMxn: 249, costoRentaMxn: 70, colchonPool: 0.2 }, naturaleza: 'ficticio', nota: 'línea N-01: pymes que no traen número; venta (SIM a su nombre) o renta (pool nuestro, con 20 % de colchón y cuarentena). Precios y costo del proveedor: P-09' },
  bsp: { valor: { solutionPartnerDesdeMes: 8, margenSobreMeta: 0.12, desarrolloHoras: 240, costoHoraDesarrolloMxn: 450 }, naturaleza: 'ficticio', nota: 'línea N-02: Tech Provider desde el mes 1 (Meta le cobra a la pyme); Solution Partner desde la escala, con margen sobre lo que cobra Meta' },
};

export interface MesDeCostos {
  mes: number;
  fase: 'piloto' | 'multipyme' | 'escala';
  pymes: number;
  conversaciones: number;
  metaUsd: number;
  iaUsd: number;
  infraUsd: number;
  soporteMxn: number;
  totalMxn: number;
  porPymeMxn: number;
  porConversacionMxn: number;
  ingresoMxn: number;
  margenPct: number;
  /** Sensibilidades. */
  metaSinCupoUsd: number;
  bspKapsoUsd: number;
  /** Líneas de negocio N-01 (números) y N-02 (BSP propio). */
  pymesConNumero: number;
  numerosIngresoMxn: number;
  numerosCostoMxn: number;
  bspModalidad: 'tech_provider' | 'solution_partner';
  bspMargenMxn: number;
  /** Margen con las tres líneas: SaaS + números + BSP. */
  margenTotalPct: number;
}

const fase = (mes: number): MesDeCostos['fase'] => (mes <= 4 ? 'piloto' : mes <= 7 ? 'multipyme' : 'escala');
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Costo de Meta de UNA pyme en un mes, con las reglas de la tarjeta (en USD). */
export function metaPorPymeMes(s: Supuestos, t: TarjetaDeTarifas, conCupo: boolean, conMarketing: boolean): number {
  const mx = t.paises.MX!;
  const conversaciones = s.conversacionesPorPymeMes.valor;
  const organicas = conversaciones * (1 - s.fraccionDesdeAnuncio.valor);
  // Lo de anuncio cae en la entrada gratis (72 h); lo orgánico es servicio: gratis hasta el cupo.
  const servicio = organicas * s.mensajesPorConversacion.valor;
  const cupo = conCupo ? t.cupoServicioMensual.cantidad : 0;
  const servicioCobrado = Math.max(0, servicio - cupo);
  const utilidad = conversaciones * s.pedidosPorConversacion.valor * s.plantillasUtilidadPorPedido.valor;
  const marketing = conMarketing ? s.marketingPorPymeMesF5.valor : 0;
  return (servicioCobrado * mx.utility + utilidad * mx.utility + marketing * mx.marketing) / 1e6;
}

export function kapsoMes(s: Supuestos, pymes: number): number {
  const k = s.kapsoUsdMes.valor;
  if (pymes <= 3) return k.hasta3;
  return k.hasta50 + Math.max(0, pymes - 50) * k.porNumeroExtra;
}

/** La línea de números en un mes: venta (alta + administración) y renta (con el pool entero pagado). */
export function numerosDelMes(s: Supuestos, pymes: number, pymesMesAnterior: number): { conNumero: number; ingresoMxn: number; costoMxn: number } {
  const n = s.numeros.valor;
  const conNumero = Math.round(pymes * n.sinNumeroPropio);
  const nuevas = Math.max(0, conNumero - Math.round(pymesMesAnterior * n.sinNumeroPropio));
  const renta = Math.round(conNumero * n.fraccionRenta);
  const venta = conNumero - renta;
  const nuevasVenta = Math.round(nuevas * (1 - n.fraccionRenta));
  const ingresoMxn = nuevasVenta * n.altaVentaMxn + venta * n.administracionMxn + renta * n.rentaMxn;
  const costoMxn = nuevasVenta * n.costoAltaVentaMxn + Math.ceil(renta * (1 + n.colchonPool)) * n.costoRentaMxn;
  return { conNumero, ingresoMxn, costoMxn };
}

export function roadmapDeCostos(s: Supuestos = SUPUESTOS_LABORATORIO, t: TarjetaDeTarifas = TARJETA_LABORATORIO): MesDeCostos[] {
  return s.pymesPorMes.valor.map((pymes, i) => {
    const mes = i + 1;
    const f = fase(mes);
    const conversaciones = pymes * s.conversacionesPorPymeMes.valor;
    const metaUsd = pymes * metaPorPymeMes(s, t, true, f === 'escala');
    const metaSinCupoUsd = pymes * metaPorPymeMes(s, t, false, f === 'escala');
    const iaUsd = (conversaciones * s.llamadasModeloPorConversacion.valor * s.tokensPorLlamada.valor * s.precioModeloUsdPorMillon.valor) / 1e6;
    const infraUsd = s.infraUsdPorFase.valor[f] ?? 0;
    const soporteMxn = pymes * (s.soporteHorasPorPymeMes.valor[f] ?? 0) * s.costoHoraSoporteMxn.valor;
    const totalMxn = (metaUsd + iaUsd + infraUsd) * s.tipoDeCambio.valor + soporteMxn;
    const ingresoMxn = pymes * (s.planMensualMxn.valor[f] ?? 0);
    const num = numerosDelMes(s, pymes, s.pymesPorMes.valor[i - 1] ?? 0);
    const bspModalidad = mes >= s.bsp.valor.solutionPartnerDesdeMes ? 'solution_partner' as const : 'tech_provider' as const;
    // Solution Partner: lo que cobra Meta pasa por nosotros (no es ingreso); el margen sí.
    const bspMargenMxn = bspModalidad === 'solution_partner' ? metaUsd * s.bsp.valor.margenSobreMeta * s.tipoDeCambio.valor : 0;
    const ingresos = ingresoMxn + num.ingresoMxn + bspMargenMxn;
    return {
      mes, fase: f, pymes, conversaciones, metaUsd: r2(metaUsd), iaUsd: r2(iaUsd), infraUsd, soporteMxn: r2(soporteMxn), totalMxn: r2(totalMxn),
      porPymeMxn: r2(totalMxn / pymes), porConversacionMxn: r2(totalMxn / conversaciones), ingresoMxn,
      margenPct: ingresoMxn ? Math.round(((ingresoMxn - totalMxn) / ingresoMxn) * 1000) / 10 : 0,
      metaSinCupoUsd: r2(metaSinCupoUsd), bspKapsoUsd: kapsoMes(s, pymes),
      pymesConNumero: num.conNumero, numerosIngresoMxn: r2(num.ingresoMxn), numerosCostoMxn: r2(num.costoMxn), bspModalidad, bspMargenMxn: r2(bspMargenMxn),
      margenTotalPct: ingresos ? Math.round(((ingresos - totalMxn - num.costoMxn) / ingresos) * 1000) / 10 : 0,
    };
  });
}

export interface PartidaPresupuesto { concepto: string; montoMxn: number; naturaleza: NaturalezaSupuesto; nota: string }

/** El presupuesto del laboratorio y del piloto (una vez, antes y durante las semanas 1-13). */
export function presupuestoLaboratorio(s: Supuestos = SUPUESTOS_LABORATORIO): PartidaPresupuesto[] {
  const fx = s.tipoDeCambio.valor;
  const arnesTokens = 200 * 2 * 2.12 * 800 * 2; // 200 conversaciones × 2 niveles × llamadas sin optimizar × tokens por llamada con prompt real × margen
  return [
    { concepto: 'Corrida real del arnés (200 conversaciones, niveles capaz y ligero)', montoMxn: r2((arnesTokens * s.precioModeloUsdPorMillon.valor / 1e6) * fx), naturaleza: 'ficticio', nota: 'tokens estimados con un prompt real (~800 por llamada); el primer gasto de IA, con CDC y firma' },
    { concepto: 'Campaña Click-to-WhatsApp de prueba (semana 11-13)', montoMxn: 3000, naturaleza: 'ficticio', nota: 'la paga la pyme piloto; sin ella no se mide la compuerta de la fase 3' },
    { concepto: 'SIM dedicada o coexistencia', montoMxn: 150, naturaleza: 'ficticio', nota: 'la pyme piloto trae su número; si no, lo compra con nosotros (N-01)' },
    { concepto: 'Números de prueba de la línea N-01 (uno en venta y uno en renta, 4 meses)', montoMxn: s.numeros.valor.costoAltaVentaMxn + 4 * s.numeros.valor.costoRentaMxn, naturaleza: 'ficticio', nota: 'para probar alta, cuarentena y portabilidad con un proveedor real (P-09)' },
    { concepto: 'Desarrollo del BSP propio y alta como Tech Provider (N-02)', montoMxn: s.bsp.valor.desarrolloHoras * s.bsp.valor.costoHoraDesarrolloMxn, naturaleza: 'ficticio', nota: 'Embedded Signup, bóveda de tokens, cobro y conciliación, revisión de la app de Meta; lo ya construido en el laboratorio no cuenta' },
    { concepto: 'Revisión legal: aviso de privacidad y contrato con la pyme', montoMxn: 8000, naturaleza: 'ficticio', nota: 'requisito de la AISIA antes del piloto' },
    { concepto: 'Infraestructura del piloto (4 meses)', montoMxn: r2(4 * (s.infraUsdPorFase.valor.piloto ?? 0) * fx), naturaleza: 'ficticio', nota: 'VPS y base de datos' },
    { concepto: 'Soporte y operación del piloto (4 meses, 1 pyme)', montoMxn: 4 * (s.soporteHorasPorPymeMes.valor.piloto ?? 0) * s.costoHoraSoporteMxn.valor, naturaleza: 'ficticio', nota: 'llave en mano: configuración, catálogo, bandeja' },
    { concepto: 'Mensajes de Meta en el piloto (4 meses, 1 pyme)', montoMxn: r2(4 * metaPorPymeMes(s, TARJETA_LABORATORIO, true, false) * fx), naturaleza: 'ficticio', nota: 'con el cupo de 1,000 (NO verificado) y 40 % por anuncio' },
  ];
}
