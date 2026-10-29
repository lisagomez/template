/** Lo que pinta el buzón de una categoría, leído con la sesión de quien mira. */
import { mensajesDe, propuestasDe, type Mensaje, type Propuesta } from '../../../../tools/agora/dist/index.js';
import { conSesion } from '@/features/agora/services/datos';

export interface DatosDelBuzon {
  categoria: { id: string; nombre: string; dominio: string; workspace: string } | null
  categorias: Array<{ id: string; nombre: string; dominio: string; workspace: string; pendientes: number; mensajes: number }>
  mensajes: Mensaje[]
  propuestas: Propuesta[]
  participantes: Array<{ tipo: 'humano' | 'interno' | 'externo'; nombre: string; iniciales: string; rol: string; huella: string | null }>
  nombres: Record<string, string>
}

export async function leeBuzon(categoria: string | null) {
  return conSesion(async (s): Promise<DatosDelBuzon> => {
    const categorias = await s.consulta<DatosDelBuzon['categorias'][number]>(
      `select c.id, c.nombre, d.nombre dominio, w.nombre workspace,
              (select count(*)::int from agora.propuesta p where p.categoria_id = c.id and p.estado = 'pendiente') pendientes,
              (select count(*)::int from agora.mensaje m join agora.canal k on k.id = m.canal_id where k.categoria_id = c.id) mensajes
         from agora.nodo c join agora.nodo d on d.id = c.padre_id join agora.nodo w on w.id = d.padre_id where c.tipo = 'categoria' order by w.orden, d.orden, c.orden`)
    const cat = categorias.find((c) => c.id === categoria) ?? categorias.find((c) => c.mensajes > 0) ?? categorias[0] ?? null
    const nombres = Object.fromEntries((await s.consulta<{ id: string; nombre: string }>(
      `select id, nombre from agora.item union all select id, nombre from agora.persona union all select id, nombre from agora.agente`)).map((x) => [x.id, x.nombre]))
    if (!cat) return { categoria: null, categorias, mensajes: [], propuestas: [], participantes: [], nombres }
    const mensajes = await mensajesDe(s, cat.id)
    const propuestas = await propuestasDe(s, [cat.id], ['pendiente', 'aprobada', 'aplicada', 'rechazada', 'a_revision', 'congelada', 'retirada'])
    const participantes = await s.consulta<DatosDelBuzon['participantes'][number]>(
      `select 'humano' tipo, p.nombre, p.iniciales, string_agg(distinct m.rol, ', ') rol, null huella from agora.persona p join agora.membresia m on m.persona_id = p.id
        where m.nodo_id is null or m.nodo_id = any (agora_priv.linaje($1)) group by p.id
       union all
       select a.origen, a.nombre, a.iniciales, a.rol || ' · ' || a.estado, a.card_sha256 from agora.agente a join agora.agente_alcance x on x.agente_id = a.id
        where x.nodo_id = any (agora_priv.linaje($1)) and a.estado <> 'revocado'`, [cat.id])
    return { categoria: { id: cat.id, nombre: cat.nombre, dominio: cat.dominio, workspace: cat.workspace }, categorias, mensajes, propuestas, participantes, nombres }
  })
}
