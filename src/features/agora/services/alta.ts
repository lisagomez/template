/**
 * El alta de la organización, leída con la sesión de quien mira: las cinco decisiones del primer arranque y lo que hoy
 * dice la base de cada una. Ninguna se cambia desde aquí: cada paso enseña la vía controlada (propuesta, freno o
 * doble firma) que la base exige.
 */
import { yo } from '../../../../tools/agora/dist/index.js';
import composicion from '../../../../productos/composiciones/agora.json' with { type: 'json' };
import { conSesion } from './datos';

export interface PasoDelAlta { id: string; decision: string; hecho: boolean; vigente: string[]; como: string; ir: string | null }

export async function leeAlta() {
  return conSesion(async (s, persona): Promise<PasoDelAlta[]> => {
    const y = await yo(s, persona);
    if (!y) throw new Error('no perteneces a ninguna organización');
    const ws = await s.consulta<{ nombre: string; dominios: string | null }>(`select w.nombre, string_agg(d.nombre, ', ' order by d.orden) dominios
        from agora.nodo w left join agora.nodo d on d.padre_id = w.id and d.tipo = 'dominio' where w.tipo = 'workspace' group by w.id, w.nombre, w.orden order by w.orden`);
    const finanzas = await s.consulta<{ nombre: string }>(`select distinct p.nombre from agora.membresia m join agora.persona p on p.id = m.persona_id where m.rol = 'finanzas' order by 1`);
    const [regla] = await s.consulta<{ firmas: string[][] }>(`select firmas from agora.matriz_regla where clase = 'crear_item' and condicion = 'monto_sobre_umbral'`);
    const internos = await s.consulta<{ nombre: string; estado: string; autonomia_max: string; tope_mensajes_hora: number; tope_propuestas_dia: number; tope_gasto_mes_mxn: string; firmas: string }>(
      `select a.nombre, a.estado, a.autonomia_max, a.tope_mensajes_hora, a.tope_propuestas_dia, a.tope_gasto_mes_mxn::text, (select count(*) from agora.agente_firma f where f.agente_id = a.id and f.version = a.version)::text firmas
         from agora.agente a where a.origen = 'interno' order by a.nombre limit 3`);
    const marca = composicion.marca as { nombre: string; asistente: string; acento: string };
    return [
      { id: 'marca', decision: '¿Cómo se llama la organización y con qué marca la ve su gente?', hecho: true,
        vigente: [`${y.org.nombre} (${y.org.slug})`, `Producto: ${marca.nombre}, con su asistente ${marca.asistente} y su acento ${marca.acento}`],
        como: 'El nombre lo fija quien da de alta la organización; la marca es de la composición del producto, no de un módulo.', ir: null },
      { id: 'workspace', decision: '¿Con qué plan empiezan: el primer workspace y sus dominios?', hecho: ws.length > 0,
        vigente: ws.map((w) => `${w.nombre}: ${w.dominios ?? 'sin dominios todavía'}`),
        como: 'Crear o mover un workspace, un dominio o una categoría es un cambio de estructura: va como propuesta y lo aprueba la Propietaria.', ir: '/agora' },
      { id: 'finanzas', decision: '¿Quién aprueba en Finanzas y desde qué monto?', hecho: finanzas.length > 0,
        vigente: [`Finanzas: ${finanzas.map((f) => f.nombre).join(', ') || 'nadie todavía'}`, `Umbral: desde ${Number(y.config.umbral).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} firma Finanzas${regla ? ` (${regla.firmas.map((r) => r.join(' o ')).join(' + ')})` : ''}`],
        como: 'Mover el umbral o la matriz cambia quién firma el dinero de la organización: es decisión de la Propietaria, por propuesta, nunca de un agente.', ir: '/agora/costos' },
      { id: 'segregacion', decision: '¿Quien pide un gasto puede aprobarlo también?', hecho: true,
        vigente: [y.config.segregacion ? 'No: la segregación de funciones está PUESTA (quien pide no aprueba; quien aprueba o cierra no acepta la póliza).' : 'Sí: la segregación está QUITADA, como decisión registrada de la organización.'],
        como: 'Quitarla va por el freno: lo escribes tú en la conversación («quita la segregación de funciones») y lo confirmas con tu clic; queda con tu cita.', ir: null },
      { id: 'agente', decision: '¿Qué agente interno trabaja primero, y con qué topes?', hecho: internos.some((a) => a.estado === 'aprobado'),
        vigente: internos.map((a) => `${a.nombre}: ${a.estado}, hasta ${a.autonomia_max}; ${a.tope_mensajes_hora} mensajes/hora, ${a.tope_propuestas_dia} propuestas/día, ${Number(a.tope_gasto_mes_mxn).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} de modelo al mes (${a.firmas} firma(s))`),
        como: 'Un agente entra con DOS firmas humanas (Propietaria y un Aprobador) sobre su idCard; subir un tope es una propuesta, y el de gasto lleva también a Finanzas.', ir: '/agora/agentes' },
    ];
  });
}
