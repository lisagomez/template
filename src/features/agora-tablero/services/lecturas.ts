/** Lo que pinta el tablero de un workspace, leído con la sesión de quien mira. */
import { itemsDe, propuestasDe, type ItemTablero, type Propuesta } from '../../../../tools/agora/dist/index.js';
import { conSesion } from '@/features/agora/services/datos';

export type Modo = 'editor' | 'colaborador' | 'lector';
export interface Categoria { id: string; nombre: string; dominio: string; presupuesto: string | null; disponible: string | null; modo: Modo }
export interface Asignable { id: string; tipo: 'humano' | 'interno' | 'externo'; nombre: string; iniciales: string; categorias: string[] | null }
export interface Columna { clave: string; nombre: string; tipo: string; config: Record<string, unknown> }

export interface DatosDelTablero {
  workspace: { id: string; nombre: string; inicio: string | null; fin: string | null }
  workspaces: Array<{ id: string; nombre: string }>
  categorias: Categoria[]
  items: ItemTablero[]
  propuestas: Propuesta[]
  asignables: Asignable[]
  columnas: Columna[]
  umbral: string
  hoy: string
  yo: string
  nombres: Record<string, string>
}

export async function leeTablero(ws: string | null) {
  return conSesion(async (s, persona): Promise<DatosDelTablero | null> => {
    const workspaces = await s.consulta<{ id: string; nombre: string; inicio: string | null; fin: string | null }>(
      `select id, nombre, inicio::text, fin::text from agora.nodo where tipo = 'workspace' order by orden`);
    const w = workspaces.find((x) => x.id === ws) ?? workspaces[0];
    if (!w) return null;
    const categorias = await s.consulta<Categoria>(
      `select c.id, c.nombre, d.nombre dominio, v.presupuesto_mxn::text presupuesto, v.disponible_mxn::text disponible,
              case when agora_priv.tiene_rol(c.org_id, c.id, array['propietario', 'administrador', 'aprobador', 'editor']) then 'editor'
                   when agora_priv.tiene_rol(c.org_id, c.id, array['colaborador']) then 'colaborador' else 'lector' end modo
         from agora.nodo c join agora.nodo d on d.id = c.padre_id
         left join agora.v_centro_periodo v on v.categoria_id = c.id and v.periodo = to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM')
        where c.tipo = 'categoria' and $1::uuid = any (c.ancestros) order by d.orden, c.orden`, [w.id]);
    const items = await itemsDe(s, w.id);
    const propuestas = await propuestasDe(s, categorias.map((c) => c.id), ['pendiente']);
    const asignables = await s.consulta<Asignable>(
      `select p.id, 'humano' tipo, p.nombre, p.iniciales, null categorias from agora.persona p
       union all
       select a.id, a.origen, a.nombre, a.iniciales, array(select x.nodo_id::text from agora.agente_alcance x where x.agente_id = a.id)
         from agora.agente a where a.estado = 'aprobado' and a.rol in ('coordinador', 'especialista', 'analista')`);
    const columnas = await s.consulta<Columna>(`select clave, nombre, tipo, config from agora.columna order by orden`);
    const [c] = await s.consulta<{ umbral: string; hoy: string }>(`select umbral_monto_mxn::text umbral, (now() at time zone 'America/Mexico_City')::date::text hoy from agora.org_config limit 1`);
    const nombres = Object.fromEntries([...items.map((i) => [i.id, i.nombre]), ...asignables.map((a) => [a.id, a.nombre])]);
    return { workspace: w, workspaces: workspaces.map(({ id, nombre }) => ({ id, nombre })), categorias, items, propuestas, asignables, columnas, umbral: c!.umbral, hoy: c!.hoy, yo: persona, nombres };
  });
}
