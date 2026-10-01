/**
 * Dominio `ventas`: recomienda (preguntando al catálogo), califica leads y es el único dueño de
 * ellos. Un lead calificado se reporta como `LeadSubmitted` a través de `atribucion`.
 */
import { tarea, artefacto, type AgenteDominio } from '../agente/a2a-modelo.js';
import type { Lead } from '../modelo.js';

/**
 * Puntaje explicable del Flow de calificación: presupuesto declarado, cuándo lo quiere y si la
 * zona tiene cobertura. ≥ 2 = calificado.
 */
export function puntuaLead(r: Record<string, string>, zonasConCobertura: string[]): { puntaje: number; razones: string[] } {
  const razones: string[] = [];
  let puntaje = 0;
  if (r.presupuesto && r.presupuesto !== 'no_se') { puntaje++; razones.push('declaró presupuesto'); }
  if (r.cuando === 'hoy' || r.cuando === 'esta_semana') { puntaje++; razones.push('lo quiere pronto'); }
  if (r.zona && zonasConCobertura.includes(r.zona)) { puntaje++; razones.push('zona con cobertura'); }
  return { puntaje, razones };
}

export const agenteVentas: AgenteDominio = {
  nombre: 'ventas',
  descripcion: 'Recomienda productos, cotiza y califica leads. Único dueño de los leads.',
  skills: [
    { id: 'recomendar', nombre: 'Recomendar producto', descripcion: 'Productos con existencias que coinciden con lo que busca el cliente' },
    { id: 'cotizar', nombre: 'Cotizar', descripcion: 'Total de una lista de productos con precios vigentes' },
    { id: 'calificar_lead', nombre: 'Calificar lead', descripcion: 'Puntúa las respuestas del Flow de calificación' },
  ],
  async atiende(s, ctx) {
    const ahora = ctx.reloj();
    if (s.skill === 'recomendar') {
      const t = await ctx.bus.envia('catalogo', { tenant: s.tenant, contextId: s.contextId, skill: 'buscar_producto', datos: { consulta: s.datos.consulta }, messageId: `${s.messageId}:buscar` });
      const a = artefacto(t, 'productos') as { productos: Array<{ existencias: number }> } | undefined;
      const productos = (a?.productos ?? []).filter((p) => p.existencias > 0);
      return tarea(s, 'ventas', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'productos', datos: { consulta: s.datos.consulta, productos } }]);
    }
    if (s.skill === 'cotizar') {
      const items = Array.isArray(s.datos.items) ? s.datos.items as Array<{ retailerId: string; cantidad: number }> : [];
      const t = await ctx.bus.envia('catalogo', { tenant: s.tenant, contextId: s.contextId, skill: 'consultar_existencias', datos: { retailerIds: items.map((i) => i.retailerId) }, messageId: `${s.messageId}:precios` });
      const a = artefacto(t, 'productos') as { productos: Array<{ retailerId: string; precioCentavos: number }> } | undefined;
      const total = items.reduce((acc, i) => acc + (a?.productos.find((p) => p.retailerId === i.retailerId)?.precioCentavos ?? 0) * i.cantidad, 0);
      return tarea(s, 'ventas', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'cotizacion', datos: { items, totalCentavos: total } }]);
    }
    if (s.skill === 'calificar_lead') {
      const conversacionId = String(s.datos.conversacionId ?? '');
      const respuestas = (s.datos.respuestas ?? {}) as Record<string, string>;
      const zonas = (ctx.inquilino.politicas.cobertura ?? []).map((c) => c.zona);
      const { puntaje, razones } = puntuaLead(respuestas, zonas);
      const lead: Lead = { conversacionId, waId: String(s.datos.waId ?? ''), respuestas, puntaje, calificado: puntaje >= 2, instante: ahora };
      await ctx.datos.guarda('leads', conversacionId, lead);
      if (lead.calificado) {
        await ctx.bus.envia('atribucion', {
          tenant: s.tenant, contextId: s.contextId, skill: 'reportar_conversion',
          datos: { nombre: 'LeadSubmitted', conversacionId }, messageId: `${conversacionId}:lead`,
        });
      }
      return tarea(s, 'ventas', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'lead', datos: { ...lead, razones } }]);
    }
    return tarea(s, 'ventas', 'TASK_STATE_REJECTED', ahora, ctx.ids, [], `skill desconocida: ${s.skill}`);
  },
};
