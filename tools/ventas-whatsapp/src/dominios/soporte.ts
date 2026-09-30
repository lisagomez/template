/**
 * Dominio `soporte`: responde políticas desde las FAQ del negocio (nunca inventa una) y abre el
 * caso cuando una conversación pasa al dueño. Único dueño de los casos.
 */
import { pliega } from '../comun/base.js';
import { tarea, type AgenteDominio } from '../agente/a2a-modelo.js';
import type { Caso, Faq, MotivoTraspaso } from '../modelo.js';

/** La FAQ con más claves presentes en la pregunta; ninguna si no hay coincidencia. */
export function buscaFaq(faqs: Faq[], pregunta: string): Faq | undefined {
  const p = ` ${pliega(pregunta).replace(/[^a-z0-9ñ]+/g, ' ')} `;
  const palabras = p.trim().split(' ');
  // Una clave de una palabra casa con la palabra o su plural (envio/envios); una de varias, como frase.
  const casa = (c: string) => (c.includes(' ') ? p.includes(` ${c} `) : palabras.some((w) => w === c || (c.length >= 4 && w.startsWith(c) && w.length - c.length <= 2)));
  let mejor: { f: Faq; n: number } | undefined;
  for (const f of faqs) {
    const n = f.claves.filter(casa).length;
    if (n > 0 && (!mejor || n > mejor.n)) mejor = { f, n };
  }
  return mejor?.f;
}

export const agenteSoporte: AgenteDominio = {
  nombre: 'soporte',
  descripcion: 'Responde políticas del negocio y abre, toma y libera casos de traspaso al dueño.',
  skills: [
    { id: 'responder_politica', nombre: 'Responder política', descripcion: 'Horario, envíos, pagos, devoluciones: desde las FAQ del negocio' },
    { id: 'abrir_caso', nombre: 'Pasar a humano', descripcion: 'Abre el caso y deja la conversación al dueño' },
    { id: 'tomar_caso', nombre: 'Tomar caso', descripcion: 'El dueño toma la conversación' },
    { id: 'liberar_caso', nombre: 'Liberar caso', descripcion: 'El dueño devuelve la conversación al agente' },
  ],
  async atiende(s, ctx) {
    const ahora = ctx.reloj();
    switch (s.skill) {
      case 'responder_politica': {
        const faq = buscaFaq(ctx.inquilino.faqs, String(s.datos.pregunta ?? ''));
        return faq
          ? tarea(s, 'soporte', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'politica', datos: { id: faq.id, pregunta: faq.pregunta, respuesta: faq.respuesta } }])
          : tarea(s, 'soporte', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'politica', datos: { id: null } }]);
      }
      case 'abrir_caso': {
        const conversacionId = String(s.datos.conversacionId ?? '');
        const abierto = (await ctx.datos.lista('casos')).find((c) => c.conversacionId === conversacionId && c.estado !== 'liberado');
        if (abierto) return tarea(s, 'soporte', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'caso', datos: { ...abierto } }]);
        const caso: Caso = {
          id: ctx.ids('caso'), conversacionId, waId: String(s.datos.waId ?? ''), motivo: String(s.datos.motivo ?? 'solicitud') as MotivoTraspaso,
          detalle: String(s.datos.detalle ?? ''), abiertoEn: ahora, estado: 'abierto',
        };
        await ctx.datos.guarda('casos', caso.id, caso);
        return tarea(s, 'soporte', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'caso', datos: { ...caso } }]);
      }
      case 'tomar_caso':
      case 'liberar_caso': {
        const caso = await ctx.datos.lee('casos', String(s.datos.casoId ?? ''));
        if (!caso) return tarea(s, 'soporte', 'TASK_STATE_REJECTED', ahora, ctx.ids, [], 'caso no existe');
        const nuevo: Caso = s.skill === 'tomar_caso' ? { ...caso, estado: 'tomado', tomadoEn: ahora } : { ...caso, estado: 'liberado', liberadoEn: ahora };
        await ctx.datos.guarda('casos', caso.id, nuevo);
        return tarea(s, 'soporte', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'caso', datos: { ...nuevo } }]);
      }
      default:
        return tarea(s, 'soporte', 'TASK_STATE_REJECTED', ahora, ctx.ids, [], `skill desconocida: ${s.skill}`);
    }
  },
};
