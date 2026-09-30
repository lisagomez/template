/**
 * La optimización de respuestas y costos, MEDIDA: el mismo día simulado (120 conversaciones en
 * las dos pymes) con las palancas apagadas y encendidas. Si ahorra y a la vez baja la resolución o
 * la conversión, no es optimización: es recorte. Por eso las dos cosas se miden juntas.
 */
import type { ModeloLenguaje } from '../agente/modelos.js';
import type { Optimizacion } from '../agente/orquestador.js';
import type { OpcionesCircuito } from './circuito.js';
import { juegaDia } from './metricas.js';

export interface MedidaVariante {
  variante: string;
  conversaciones: number;
  llamadasModelo: number;
  llamadasPorConversacion: number;
  tokensPorConversacion: number;
  turnosSinModelo: number;
  mensajesPorConversacion: number;
  costoIaMicrosPorConversacion: number;
  costoMetaMicrosPorConversacion: number;
  resueltasSinHumanoPct: number;
  conversionPct: number;
}

export const SIN_OPTIMIZAR: Optimizacion = { enrutador: false, sinSegundaLlamada: false, compacta: false };

async function mide(variante: string, o: Pick<OpcionesCircuito, 'flows'> & { optimizacion: Partial<Optimizacion>; modelo?: ModeloLenguaje }): Promise<MedidaVariante> {
  const { c, pymes } = await juegaDia(o);
  let conv = 0; let llamadas = 0; let tokens = 0; let sinModelo = 0; let salientes = 0; let ia = 0; let meta = 0; let sinHumano = 0; let intencion = 0; let pagadas = 0;
  for (const i of Object.values(pymes)) {
    const d = c.almacen.de(i.id);
    const [convs, usos, bit, mensajes, casos, pedidos] = await Promise.all([d.lista('conversaciones'), d.lista('usoIa'), d.lista('bitacora'), d.lista('mensajes'), d.lista('casos'), d.lista('pedidos')]);
    conv += convs.length;
    llamadas += usos.length;
    tokens += usos.reduce((a, u) => a + (u.tokensEntrada ?? 0) + (u.tokensSalida ?? 0), 0);
    ia += usos.reduce((a, u) => a + (u.costoMicros ?? 0), 0);
    sinModelo += bit.filter((b) => b.tipo === 'sin_modelo').length;
    salientes += mensajes.filter((m) => m.direccion === 'saliente').length;
    meta += mensajes.reduce((a, m) => a + (m.costoMicros ?? 0), 0);
    const conCaso = new Set(casos.map((k) => k.conversacionId));
    sinHumano += convs.filter((x) => !conCaso.has(x.id)).length;
    const pagadasSet = new Set(pedidos.filter((p) => p.estado === 'pagado').map((p) => p.conversacionId));
    const conIntencion = convs.filter((x) => x.intencionCompra);
    intencion += conIntencion.length;
    pagadas += conIntencion.filter((x) => pagadasSet.has(x.id)).length;
  }
  const por = (n: number) => (conv ? Math.round((n / conv) * 100) / 100 : 0);
  return {
    variante, conversaciones: conv, llamadasModelo: llamadas, llamadasPorConversacion: por(llamadas), tokensPorConversacion: Math.round(tokens / Math.max(1, conv)),
    turnosSinModelo: sinModelo, mensajesPorConversacion: por(salientes), costoIaMicrosPorConversacion: Math.round(ia / Math.max(1, conv)),
    costoMetaMicrosPorConversacion: Math.round(meta / Math.max(1, conv)), resueltasSinHumanoPct: Math.round((sinHumano / Math.max(1, conv)) * 1000) / 10,
    conversionPct: Math.round((pagadas / Math.max(1, intencion)) * 1000) / 10,
  };
}

export async function mideOptimizacion(o: Pick<OpcionesCircuito, 'flows'> & { modelo?: ModeloLenguaje } = {}) {
  const antes = await mide('sin optimizar', { ...o, optimizacion: SIN_OPTIMIZAR });
  const despues = await mide('optimizado', { ...o, optimizacion: {} });
  const ahorro = (a: number, b: number) => (a ? Math.round((1 - b / a) * 1000) / 10 : 0);
  return {
    antes, despues,
    ahorroTokensPct: ahorro(antes.tokensPorConversacion, despues.tokensPorConversacion),
    ahorroLlamadasPct: ahorro(antes.llamadasPorConversacion, despues.llamadasPorConversacion),
    ahorroMensajesPct: ahorro(antes.mensajesPorConversacion, despues.mensajesPorConversacion),
  };
}
