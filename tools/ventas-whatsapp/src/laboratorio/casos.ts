/**
 * Los casos del laboratorio del agente, en la línea de `/laboratorio-pymes`: cada uno corre DE
 * VERDAD contra el circuito, y declara el estado que espera. `pasa` y `falla` se ganan corriendo;
 * `no-medido` dice por qué no se puede medir aquí (y qué haría falta). Un caso que declara «pasa»
 * y falla deja al laboratorio en rojo.
 */
import type { ModeloLenguaje } from '../agente/modelos.js';
import { creaCircuito, type OpcionesCircuito } from './circuito.js';

export type EstadoCaso = 'pasa' | 'falla' | 'no-medido';

export interface CasoLaboratorio {
  id: string;
  vertical: 'restaurante' | 'tienda' | 'ambas';
  fase: 0 | 1 | 2 | 3;
  titulo: string;
  declara: EstadoCaso;
  /** Si es `no-medido`: por qué y qué falta. */
  porQue?: string;
  corre?: (c: ReturnType<typeof creaCircuito>, p: Awaited<ReturnType<ReturnType<typeof creaCircuito>['prepara']>>) => Promise<{ ok: boolean; evidencia: string }>;
}

export interface ResultadoCaso {
  id: string;
  vertical: string;
  fase: number;
  titulo: string;
  declara: EstadoCaso;
  estado: EstadoCaso;
  evidencia: string;
  cuadra: boolean;
}

const cliente = (c: ReturnType<typeof creaCircuito>, pn: string, n: number) => c.meta.cliente(pn, `52229${String(900000 + n).padStart(7, '0')}`, `Caso ${n}`);

export const CASOS: CasoLaboratorio[] = [
  {
    id: 'saludo-catalogo', vertical: 'restaurante', fase: 1, titulo: '«¿Qué tienen?» → carrusel del menú en UN mensaje, con aviso de privacidad', declara: 'pasa',
    corre: async (c, p) => { const cl = cliente(c, p.restaurante.canal.phoneNumberId, 1); cl.escribe('Hola, ¿qué tienen?'); await c.asienta(); const r = cl.ultimo(); return { ok: cl.recibidos.length === 1 && r?.mensaje.tipo === 'carrusel' && /PRIVACIDAD/.test(r.resumen), evidencia: r?.resumen.slice(0, 120) ?? 'sin respuesta' }; },
  },
  {
    id: 'precio-del-catalogo', vertical: 'tienda', fase: 1, titulo: 'El precio de la guayabera sale del catálogo, no del modelo', declara: 'pasa',
    corre: async (c, p) => { const cl = cliente(c, p.tienda.canal.phoneNumberId, 2); cl.escribe('¿Cuánto cuesta la guayabera de lino?'); await c.asienta(); const r = cl.ultimo(); return { ok: !!r && /\$1,250\.00/.test(r.resumen), evidencia: r?.resumen.slice(0, 120) ?? '' }; },
  },
  {
    id: 'politica-envios', vertical: 'tienda', fase: 1, titulo: 'Envíos: la respuesta sale de la FAQ del negocio', declara: 'pasa',
    corre: async (c, p) => { const cl = cliente(c, p.tienda.canal.phoneNumberId, 3); cl.escribe('¿Hacen envíos a Veracruz?'); await c.asienta(); const r = cl.ultimo(); return { ok: !!r && /Veracruz \(\$120\.00/.test(r.resumen), evidencia: r?.resumen.slice(0, 120) ?? '' }; },
  },
  {
    id: 'fuera-de-dominio', vertical: 'ambas', fase: 1, titulo: 'Pregunta ajena (política) → declina y ofrece el menú, sin llamar al modelo', declara: 'pasa',
    corre: async (c, p) => { const cl = cliente(c, p.restaurante.canal.phoneNumberId, 4); cl.escribe('¿Por quién voto en las elecciones para presidente?'); await c.asienta(); const usos = await c.almacen.de(p.restaurante.id).lista('usoIa'); return { ok: cl.ultimo()?.mensaje.tipo === 'botones' && usos.length === 0, evidencia: cl.ultimo()?.resumen.slice(0, 120) ?? '' }; },
  },
  {
    id: 'alcohol-restringido', vertical: 'restaurante', fase: 1, titulo: 'Alcohol: tema restringido del giro, no se vende por chat', declara: 'pasa',
    corre: async (c, p) => { const cl = cliente(c, p.restaurante.canal.phoneNumberId, 5); cl.escribe('¿Me mandas unas cervezas?'); await c.asienta(); return { ok: /Solo puedo ayudarte/.test(cl.ultimo()?.resumen ?? ''), evidencia: cl.ultimo()?.resumen.slice(0, 120) ?? '' }; },
  },
  {
    id: 'queja-traspaso', vertical: 'restaurante', fase: 1, titulo: 'Queja → pasa a Doña Chela sin gastar tokens', declara: 'pasa',
    corre: async (c, p) => { const cl = cliente(c, p.restaurante.canal.phoneNumberId, 6); cl.escribe('Esto es una estafa, quiero mi reembolso'); await c.asienta(); const casos = await c.almacen.de(p.restaurante.id).lista('casos'); return { ok: casos.some((k) => k.motivo === 'queja'), evidencia: cl.ultimo()?.resumen ?? '' }; },
  },
  {
    id: 'compra-completa', vertical: 'tienda', fase: 2, titulo: 'Carrito → checkout con RFC → liga → pago → aviso', declara: 'pasa',
    corre: async (c, p) => {
      const cl = cliente(c, p.tienda.canal.phoneNumberId, 7); cl.pide([{ retailerId: 'reboso-azul', cantidad: 1 }]); await c.asienta();
      await cl.llenaFlow({ ENVIO: { zona: 'Coatepec', direccion: 'x', rfc: 'XAXX010101000', razon_social: 'Público', recoger: false }, RESUMEN: { confirmar: true } }); await c.asienta();
      const u = cl.ultimo(); const liga = u?.mensaje.tipo === 'cta_url' ? c.procesador.ligaDeUrl(u.mensaje.url) : undefined;
      if (liga) { await c.procesador.paga(liga.id); await c.asienta(); }
      return { ok: /Pago recibido/.test(cl.ultimo()?.resumen ?? ''), evidencia: `${u?.resumen.slice(0, 80)} → ${cl.ultimo()?.resumen.slice(0, 60)}` };
    },
  },
  {
    id: 'reserva-mesa', vertical: 'restaurante', fase: 2, titulo: 'Reserva de mesa por Flow dinámico (endpoint cifrado)', declara: 'pasa',
    corre: async (c, p) => {
      const cl = cliente(c, p.restaurante.canal.phoneNumberId, 8); cl.escribe('Quiero reservar mesa'); await c.asienta();
      const r = await cl.llenaFlow({ DIA: (d) => ({ servicio: 'mesa-2', dia: (d.dias as Array<{ id: string }>)[0]!.id }), HORA: (d) => ({ inicio: (d.horarios as Array<{ id: string }>)[0]!.id, servicio: d.servicio }) }); await c.asienta();
      return { ok: !r.errores.length && /Reservación confirmada/.test(cl.ultimo()?.resumen ?? ''), evidencia: cl.ultimo()?.resumen ?? r.errores.join('; ') };
    },
  },
  {
    id: 'purchase-una-vez', vertical: 'restaurante', fase: 3, titulo: 'Anuncio → compra → Purchase a Meta UNA vez aunque el pago llegue dos', declara: 'pasa',
    corre: async (c, p) => {
      const camp = c.meta.anuncios.creaCampana('Caso', 10_000); await c.vendedor.panel.registraGasto(p.restaurante.id, camp.id, camp.nombre, camp.gastoCentavos, camp.anuncios);
      const cl = cliente(c, p.restaurante.canal.phoneNumberId, 9); cl.llegaPorAnuncio(camp.anuncios[0]!, 'Hola'); await c.asienta();
      cl.pide([{ retailerId: 'tacos-bistec', cantidad: 1 }]); await c.asienta();
      await cl.llenaFlow({ ENTREGA: { zona: 'Centro', direccion: 'x', horario: 'lo-antes-posible', recoger: false }, RESUMEN: { confirmar: true } }); await c.asienta();
      const u = cl.ultimo(); const liga = u?.mensaje.tipo === 'cta_url' ? c.procesador.ligaDeUrl(u.mensaje.url) : undefined;
      if (liga) { await c.procesador.paga(liga.id, { duplicaWebhook: true }); await c.asienta(); }
      const n = c.meta.capi.aceptados.filter((e) => e.event_name === 'Purchase').length;
      return { ok: n === 1 && c.meta.capi.duplicados === 0, evidencia: `${n} Purchase aceptado, ${c.meta.capi.duplicados} duplicados` };
    },
  },
  { id: 'modelo-real-200', vertical: 'ambas', fase: 1, titulo: '200 conversaciones con el MODELO REAL: cero fuera de dominio', declara: 'no-medido', porQue: 'Sin llave del proveedor y sin la clase del agente en routing-modelos.json (CDC pendiente). El arnés está listo: corre con `modeloCompatibleOpenAI` y la firma del laboratorio.' },
  { id: 'latencia-real', vertical: 'ambas', fase: 1, titulo: 'Primera respuesta < 10 s con Meta y el modelo reales', declara: 'no-medido', porQue: 'Necesita el número conectado (C3 + C4 firmados, gate humano) y el modelo real.' },
  { id: 'conversion-real', vertical: 'ambas', fase: 2, titulo: '≥ 20 % de conversaciones con intención terminan en pedido pagado', declara: 'no-medido', porQue: 'Solo lo dice una pyme piloto real: la mezcla de clientes simulados la pone el laboratorio.' },
  { id: 'roas-real', vertical: 'ambas', fase: 3, titulo: 'ROAS del tablero ±10 % contra el Administrador de anuncios REAL', declara: 'no-medido', porQue: 'Necesita campaña CTWA real y dataset real: se mide en la semana 13 del piloto.' },
];

export async function correCasos(o: Pick<OpcionesCircuito, 'flows'> & { modelo?: ModeloLenguaje } = {}): Promise<ResultadoCaso[]> {
  const salida: ResultadoCaso[] = [];
  for (const caso of CASOS) {
    const base = { id: caso.id, vertical: caso.vertical, fase: caso.fase, titulo: caso.titulo, declara: caso.declara };
    if (!caso.corre) { salida.push({ ...base, estado: 'no-medido', evidencia: caso.porQue ?? '', cuadra: caso.declara === 'no-medido' }); continue; }
    const c = creaCircuito({ ...o });
    const p = await c.prepara();
    try {
      const r = await caso.corre(c, p);
      const estado: EstadoCaso = r.ok ? 'pasa' : 'falla';
      salida.push({ ...base, estado, evidencia: r.evidencia, cuadra: estado === caso.declara });
    } catch (e) {
      salida.push({ ...base, estado: 'falla', evidencia: (e as Error).message, cuadra: caso.declara === 'falla' });
    }
  }
  return salida;
}
