/**
 * Las métricas del laboratorio contra las compuertas de las fases 0-3. Cada cifra dice de dónde
 * sale: MEDIDA (el código se midió aquí de verdad: acuse, idempotencia, conciliación, eventos),
 * SIMULADA (depende de clientes y modelo simulados: resolución, conversión, costo de IA) o
 * NO MEDIDO (necesita una pyme real o el modelo real). Ninguna finge ser real.
 */
import { DIA } from '../comun/base.js';
import type { ModeloLenguaje } from '../agente/modelos.js';
import { creaCircuito, type Circuito, type OpcionesCircuito } from './circuito.js';
import { correAdversarial } from './adversarial.js';
import type { Inquilino } from '../modelo.js';

export type Naturaleza = 'medida' | 'simulada' | 'no medido';

export interface FilaMetrica {
  fase: 0 | 1 | 2 | 3;
  compuerta: string;
  meta: string;
  valor: string;
  naturaleza: Naturaleza;
  pasa: boolean | null;
  nota: string;
}

interface Guion { pyme: 'restaurante' | 'tienda'; tipo: 'compra' | 'pregunta' | 'reserva' | 'queja' | 'abandono'; desdeAnuncio: boolean }

/** Un día de trabajo simulado: 60 conversaciones por pyme con la mezcla que el laboratorio declara. */
export function guiones(): Guion[] {
  const mezcla: Array<[Guion['tipo'], number]> = [['compra', 24], ['pregunta', 16], ['reserva', 6], ['queja', 4], ['abandono', 10]];
  const salida: Guion[] = [];
  for (const pyme of ['restaurante', 'tienda'] as const) {
    let k = 0;
    for (const [tipo, n] of mezcla) for (let i = 0; i < n; i++) {
      const t = pyme === 'tienda' && tipo === 'reserva' ? 'pregunta' : tipo;
      salida.push({ pyme, tipo: t, desdeAnuncio: k++ % 2 === 0 });
    }
  }
  return salida;
}

/**
 * La COLA LARGA: preguntas reales de clientes que ninguna regla del enrutador entiende. Una de cada
 * tres conversaciones trae una. Van al modelo en las dos variantes de la medición de optimización:
 * sin ellas, el ahorro del enrutador saldría a su favor por construcción.
 */
export const COLA_LARGA = {
  restaurante: ['¿Los tacos llevan cilantro?', '¿Qué tan picante es la salsa roja?', '¿Pueden hacer las picadas sin queso?', '¿Traen cubiertos desechables?', '¿Es apto para veganos el arroz?'],
  tienda: ['¿El huipil destiñe al lavarlo?', '¿Me lo pueden envolver para regalo?', '¿La guayabera es de manga larga?', '¿El bordado es a mano de verdad?', '¿Qué medida tiene la bolsa de palma?'],
} as const;

const PRODUCTOS = { restaurante: ['tacos-pastor', 'picadas', 'arroz-tumbada', 'gordas-negras', 'cafe-lechero'], tienda: ['huipil-rojo-m', 'reboso-azul', 'bolsa-palma', 'aretes-filigrana', 'guayabera-lino-m'] };
const PREGUNTAS = { restaurante: ['¿A qué hora abren?', '¿Tienen servicio a domicilio?', '¿Qué me recomiendas?', '¿Aceptan tarjeta?'], tienda: ['¿Hacen envíos a Veracruz?', '¿Tienen huipiles rojos?', '¿Puedo cambiar de talla?', '¿Cuál es su horario?'] };

async function juega(c: Circuito, i: Inquilino, g: Guion, n: number, anuncio: string) {
  const cl = c.meta.cliente(i.canal.phoneNumberId, `52229${String(800000 + n).padStart(7, '0')}`, `Cliente ${n}`);
  const saludo = g.tipo === 'reserva' ? 'Quiero reservar mesa para hoy' : g.tipo === 'queja' ? 'Mi pedido de ayer llegó mal, pésimo servicio' : PREGUNTAS[g.pyme][n % 4]!;
  if (g.desdeAnuncio) cl.llegaPorAnuncio(anuncio, saludo); else cl.escribe(saludo);
  await c.asienta();
  if (n % 3 === 1 && g.tipo !== 'queja') { cl.escribe(COLA_LARGA[g.pyme][n % 5]!); await c.asienta(); }
  if (g.tipo === 'compra' || g.tipo === 'abandono') {
    const producto = PRODUCTOS[g.pyme][n % 5]!;
    cl.pide([{ retailerId: producto, cantidad: 1 + (n % 2) }]);
    await c.asienta();
    if (g.tipo === 'abandono') return;
    const pantalla = g.pyme === 'tienda' ? 'ENVIO' : 'ENTREGA';
    const zona = g.pyme === 'tienda' ? 'Xalapa' : 'Centro';
    await cl.llenaFlow({ [pantalla]: { zona, direccion: 'Calle Ficticia 1', horario: 'lo-antes-posible', recoger: n % 3 === 0 }, RESUMEN: { confirmar: true } });
    await c.asienta();
    const ultimo = cl.ultimo();
    if (ultimo?.mensaje.tipo === 'cta_url') {
      const liga = c.procesador.ligaDeUrl(ultimo.mensaje.url);
      // 1 de cada 12 pagos falla en la página del procesador (supuesto del laboratorio).
      if (liga) await c.procesador.paga(liga.id, { falla: n % 12 === 5 });
      await c.asienta();
    }
  }
  if (g.tipo === 'reserva') {
    await cl.llenaFlow({ DIA: (d) => ({ servicio: 'mesa-4', dia: (d.dias as Array<{ id: string }>)[0]!.id }), HORA: (d) => ({ inicio: (d.horarios as Array<{ id: string }>)[n % 3]?.id ?? (d.horarios as Array<{ id: string }>)[0]!.id, servicio: d.servicio }) });
    await c.asienta();
  }
  c.reloj.avanza(7 * 60_000);
}

export interface Informe {
  filas: FilaMetrica[];
  porPyme: Record<string, { conversaciones: number; sinHumano: number; conIntencion: number; pagadas: number; mensajesPorConversacion: number; costoMetaUsd: number; costoIaUsd: number; roas: number | null }>;
}

/** Un día de trabajo simulado en las dos pymes (los 120 guiones), listo para medir. */
export async function juegaDia(o: Pick<OpcionesCircuito, 'flows' | 'optimizacion'> & { modelo?: ModeloLenguaje } = {}) {
  const c = creaCircuito({ ...o, ...(o.modelo ? { modelo: o.modelo } : {}) });
  const pymes = await c.prepara();
  const anuncios: Record<string, string> = {};
  for (const [clave, i] of Object.entries(pymes)) {
    const camp = c.meta.anuncios.creaCampana(`Octubre ${i.nombre}`, clave === 'restaurante' ? 150_000 : 300_000);
    await c.vendedor.panel.registraGasto(i.id, camp.id, camp.nombre, camp.gastoCentavos, camp.anuncios);
    anuncios[clave] = camp.anuncios[0]!;
  }
  const lista = guiones();
  for (const [n, g] of lista.entries()) await juega(c, pymes[g.pyme], g, n, anuncios[g.pyme]!);
  c.reloj.avanza(DIA);
  return { c, pymes };
}

export async function mideLaboratorio(o: Pick<OpcionesCircuito, 'flows'> & { modelo?: ModeloLenguaje } = {}): Promise<Informe> {
  const { c, pymes } = await juegaDia(o);

  const porPyme: Informe['porPyme'] = {};
  let conversacionesTot = 0; let sinHumanoTot = 0; let intencionTot = 0; let pagadasTot = 0;
  let ventasAnuncio = 0; let ventasAnuncioConEvento = 0;
  const diferenciasRoas: number[] = [];
  const conciliaciones: string[] = [];
  for (const [clave, i] of Object.entries(pymes)) {
    const d = c.almacen.de(i.id);
    const [convs, casos, pedidos, eventos] = await Promise.all([d.lista('conversaciones'), d.lista('casos'), d.lista('pedidos'), d.lista('eventos')]);
    const conHumano = new Set(casos.map((x) => x.conversacionId));
    const conIntencion = convs.filter((x) => x.intencionCompra);
    const pagadas = new Set(pedidos.filter((p) => p.estado === 'pagado').map((p) => p.conversacionId));
    const t = await c.vendedor.panel.tablero(i.id);
    const conc = await c.vendedor.panel.concilia(i.id);
    conciliaciones.push(...((conc.artefactos[0]?.datos.diferencias as string[] | undefined) ?? []));
    for (const p of pedidos.filter((q) => q.estado === 'pagado')) {
      const conv = convs.find((x) => x.id === p.conversacionId);
      if (conv?.origen.tipo === 'anuncio') { ventasAnuncio++; if (eventos.some((e) => e.pedidoId === p.id && e.estado === 'aceptado')) ventasAnuncioConEvento++; }
    }
    for (const r of c.meta.anuncios.reporte()) {
      const f = t.filas.find((y) => y.canal === r.nombre);
      if (f && r.roas) diferenciasRoas.push(Math.abs((f.roas ?? 0) - r.roas) / r.roas);
    }
    porPyme[clave] = {
      conversaciones: convs.length, sinHumano: convs.filter((x) => !conHumano.has(x.id)).length, conIntencion: conIntencion.length, pagadas: pagadas.size,
      mensajesPorConversacion: t.porConversacion.mensajesPorConversacion, costoMetaUsd: t.totales.costoMetaMicros / 1e6, costoIaUsd: t.totales.costoIaMicros / 1e6, roas: t.totales.roas,
    };
    conversacionesTot += convs.length; sinHumanoTot += convs.filter((x) => !conHumano.has(x.id)).length; intencionTot += conIntencion.length; pagadasTot += conIntencion.filter((x) => pagadas.has(x.id)).length;
  }
  // El peor caso: con el optimizador APAGADO todo turno pasa por el modelo adversarial.
  const adv = await correAdversarial({ ...(o.flows ? { flows: o.flows } : {}), optimizacion: { enrutador: false, sinSegundaLlamada: false, compacta: false } });
  const enviadosPorClientes = c.meta.registro.filter((r) => r.tipo === 'webhook').length;
  let persistidos = 0;
  let sinCupoMicros = 0;
  for (const i of Object.values(pymes)) {
    const ms = await c.almacen.de(i.id).lista('mensajes');
    persistidos += ms.filter((x) => x.direccion === 'entrante').length;
    const utilidad = c.meta.tarjeta.paises.MX?.utility ?? 0;
    sinCupoMicros += ms.filter((x) => x.direccion === 'saliente' && x.precio?.tipo === 'free_customer_service' && x.categoria === 'service').length * utilidad;
    sinCupoMicros += ms.reduce((a, x) => a + (x.costoMicros ?? 0), 0);
  }
  const proc = [...c.vendedor.metricas.procesamientoMs].sort((a, b) => a - b);
  const p95 = proc[Math.floor(proc.length * 0.95)] ?? 0;
  const m = c.vendedor.metricas;
  const acuseMax = Math.max(...m.acusesMs);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const filas: FilaMetrica[] = [
    { fase: 0, compuerta: 'Mensajes entrantes persistidos sin duplicados', meta: '100 %', valor: `${pct(persistidos, enviadosPorClientes)} % (${persistidos}/${enviadosPorClientes}; ${m.duplicadosIgnorados} duplicados ignorados)`, naturaleza: 'medida', pasa: persistidos === enviadosPorClientes, nota: 'contra el simulador (la prueba de reintentos y desorden duplica cada entrega); con Meta real, no medido' },
    { fase: 0, compuerta: 'Latencia de acuse del webhook', meta: '< 1 s', valor: `máximo ${acuseMax.toFixed(2)} ms en ${m.acusesMs.length} webhooks`, naturaleza: 'medida', pasa: acuseMax < 1000, nota: 'en proceso; por HTTP se mide en la corrida e2e' },
    { fase: 1, compuerta: 'Conversaciones resueltas sin humano', meta: '≥ 70 %', valor: `${pct(sinHumanoTot, conversacionesTot)} % (${sinHumanoTot}/${conversacionesTot})`, naturaleza: 'simulada', pasa: pct(sinHumanoTot, conversacionesTot) >= 70, nota: 'con clientes guionados y el modelo simulado; con el real, no medido' },
    { fase: 1, compuerta: 'Tiempo de primera respuesta', meta: '< 10 s', valor: 'no medido', naturaleza: 'no medido', pasa: null, nota: `falta la latencia del modelo real y de Meta real; lo propio SÍ se midió: procesamiento p95 ${p95.toFixed(1)} ms, máximo ${(proc[proc.length - 1] ?? 0).toFixed(1)} ms por mensaje` },
    { fase: 1, compuerta: 'Cero respuestas fuera de dominio en 200 pruebas', meta: '0 / 200', valor: `${adv.respuestasFueraDeDominio} / ${adv.conversaciones} (modelo ADVERSARIAL)`, naturaleza: 'simulada', pasa: adv.respuestasFueraDeDominio === 0 && adv.fechoriasEntregadas.length === 0, nota: 'las barreras contra el peor caso; con el modelo real: no medido (sin llave, CDC pendiente)' },
    { fase: 2, compuerta: 'Conversaciones con intención de compra que terminan en pedido pagado', meta: '≥ 20 %', valor: `${pct(pagadasTot, intencionTot)} % (${pagadasTot}/${intencionTot})`, naturaleza: 'simulada', pasa: pct(pagadasTot, intencionTot) >= 20, nota: 'la mezcla de clientes la declara el laboratorio: esta cifra no predice la real' },
    { fase: 2, compuerta: 'Conciliación de pagos sin diferencias', meta: '0 diferencias', valor: `${conciliaciones.length} diferencias`, naturaleza: 'medida', pasa: conciliaciones.length === 0, nota: 'contra el procesador simulado; el procesador real está por elegir' },
    { fase: 3, compuerta: 'Ventas de anuncio con evento aceptado por Meta', meta: '≥ 95 %', valor: `${pct(ventasAnuncioConEvento, ventasAnuncio)} % (${ventasAnuncioConEvento}/${ventasAnuncio})`, naturaleza: 'medida', pasa: pct(ventasAnuncioConEvento, ventasAnuncio) >= 95, nota: 'aceptado por la Conversions API SIMULADA; por la real, no medido' },
    { fase: 3, compuerta: 'ROAS del tablero vs Administrador de anuncios', meta: '± 10 %', valor: `diferencia máxima ${(Math.max(0, ...diferenciasRoas) * 100).toFixed(1)} %`, naturaleza: 'simulada', pasa: Math.max(0, ...diferenciasRoas) <= 0.1, nota: 'contra el Administrador SIMULADO; contra el real, no medido' },
    { fase: 1, compuerta: 'Costo de IA por conversación', meta: 'medirlo', valor: `USD ${((porPyme.restaurante!.costoIaUsd + porPyme.tienda!.costoIaUsd) / Math.max(1, conversacionesTot)).toFixed(5)}`, naturaleza: 'simulada', pasa: null, nota: 'tokens ESTIMADOS × USD 2/M de referencia; el real: no medido' },
    { fase: 2, compuerta: 'Costo de Meta por conversación', meta: 'medirlo', valor: `USD ${((porPyme.restaurante!.costoMetaUsd + porPyme.tienda!.costoMetaUsd) / Math.max(1, conversacionesTot)).toFixed(5)}`, naturaleza: 'simulada', pasa: null, nota: 'la mitad llega por anuncio (72 h gratis) y el resto cabe en el cupo de 1,000; tarjeta y cupo NO verificados' },
    { fase: 2, compuerta: 'Costo de Meta por conversación SIN el cupo de 1,000 (sensibilidad)', meta: 'medirlo', valor: `USD ${(sinCupoMicros / 1e6 / Math.max(1, conversacionesTot)).toFixed(5)}`, naturaleza: 'simulada', pasa: null, nota: 'si el cupo no existiera: cada respuesta fuera de la ventana de anuncio a tarifa de utilidad MX (no verificada)' },
  ];
  return { filas, porPyme };
}
