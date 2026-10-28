/**
 * Lo que leen las pantallas de Ágora, siempre con la sesión de quien mira (RLS decide qué existe para ella). Devuelve
 * datos planos y ya calculados por la base: ninguna cifra se calcula en la pantalla.
 */
import type { Sesion } from './base/tipos.js'

export type Insignia = 'humano' | 'interno' | 'externo'
export interface Quien { tipo: Insignia; id: string; nombre: string; iniciales: string }

export interface Yo {
  id: string; nombre: string; iniciales: string; titulo: string; org: { id: string; slug: string; nombre: string }
  roles: Array<{ rol: string; nodo: string | null; nodoNombre: string | null }>
  config: { umbral: string; topeOrg: string; segregacion: boolean; zona: string }
}

export async function yo(s: Sesion, persona: string): Promise<Yo | null> {
  const [p] = await s.consulta<{ id: string; nombre: string; iniciales: string; titulo: string; org_id: string; slug: string; org: string; umbral: string; tope: string; segregacion: boolean; zona: string }>(
    `select p.id, p.nombre, p.iniciales, p.titulo, o.id org_id, o.slug, o.nombre org, c.umbral_monto_mxn umbral, c.tope_gasto_org_mxn tope, c.segregacion, c.zona
       from agora.persona p join agora.org o on o.id = p.org_id join agora.org_config c on c.org_id = o.id where p.id = $1`, [persona])
  if (!p) return null
  const roles = await s.consulta<{ rol: string; nodo: string | null; nodo_nombre: string | null }>(
    `select m.rol, m.nodo_id nodo, n.nombre nodo_nombre from agora.membresia m left join agora.nodo n on n.id = m.nodo_id where m.persona_id = $1 order by m.rol`, [persona])
  return { id: p.id, nombre: p.nombre, iniciales: p.iniciales, titulo: p.titulo, org: { id: p.org_id, slug: p.slug, nombre: p.org },
    roles: roles.map((r) => ({ rol: r.rol, nodo: r.nodo, nodoNombre: r.nodo_nombre })), config: { umbral: p.umbral, topeOrg: p.tope, segregacion: p.segregacion, zona: p.zona } }
}

export interface NodoArbol { id: string; tipo: 'workspace' | 'dominio' | 'categoria'; slug: string; nombre: string; padre: string | null; inicio: string | null; fin: string | null
  items: number; pendientes: number; alertas: number }

/** La jerarquía visible (que también es el árbol de centros de costo), con conteos para el explorador. */
export async function arbol(s: Sesion): Promise<NodoArbol[]> {
  return s.consulta<NodoArbol>(
    `select n.id, n.tipo, n.slug, n.nombre, n.padre_id padre, n.inicio::text, n.fin::text,
            (select count(*)::int from agora.item i where i.categoria_id = n.id) items,
            (select count(*)::int from agora.propuesta p where p.categoria_id = n.id and p.estado = 'pendiente') pendientes,
            (select count(*)::int from agora.aviso a where a.nodo_id = n.id and not a.atendido) alertas
       from agora.nodo n order by n.orden, n.nombre`)
}

export interface ItemTablero {
  id: string; categoria: string; grupo: string; nombre: string; estado: string; prioridad: string; inicio: string | null; fin: string | null
  monto: string | null; progreso: number; etiquetas: string[]; vinculo: string | null; archivo: { nombre: string; sha256: string; bytes: number } | null
  responsable: Quien | null; dependeDe: string[]; hilo: string | null; versionFecha: number
  comprometido: string; ejercido: string; pendientes: number
}

export async function itemsDe(s: Sesion, workspace: string): Promise<ItemTablero[]> {
  return s.consulta<ItemTablero>(
    `select i.id, i.categoria_id categoria, i.grupo, i.nombre, i.estado, i.prioridad, i.inicio::text, i.fin::text, i.monto_mxn monto, i.progreso, i.etiquetas, i.vinculo, i.archivo,
            case when i.responsable_persona is not null then jsonb_build_object('tipo', 'humano', 'id', p.id, 'nombre', p.nombre, 'iniciales', p.iniciales)
                 when i.responsable_agente is not null then jsonb_build_object('tipo', a.origen, 'id', a.id, 'nombre', a.nombre, 'iniciales', a.iniciales) end responsable,
            coalesce((select array_agg(d.depende_de::text) from agora.dependencia d where d.item_id = i.id), '{}') "dependeDe",
            i.hilo_id hilo, i.version_fecha "versionFecha",
            coalesce((select sum(k.vigente_mxn) from agora.v_compromiso_saldo k where k.item_id = i.id and k.estado = 'vigente'), 0)::text comprometido,
            coalesce((select sum(c.importe_mxn) from agora.costo c where c.item_id = i.id and c.estado = 'ejercido'), 0)::text ejercido,
            (select count(*)::int from agora.propuesta x where x.estado = 'pendiente' and x.payload_canon like '%' || i.id::text || '%') pendientes
       from agora.item i join agora.nodo c on c.id = i.categoria_id
       left join agora.persona p on p.id = i.responsable_persona left join agora.agente a on a.id = i.responsable_agente
      where $1::uuid = any (c.ancestros) order by c.orden, i.inicio nulls last, i.nombre`, [workspace])
}

export interface Propuesta {
  id: string; categoria: string; clase: string; resumen: string; sha256: string; nivel: string; estado: string; monto: string | null
  autor: Quien | null; solicitadaPor: string | null; creada: string; vence: string; payload: Record<string, unknown>; motivoSupervisor: string | null
  decisiones: Array<{ decision: string; persona: string; rol: string | null; cuando: string; motivo: string | null }>
  puedo: { puede: boolean; motivo?: string; rol?: string; firmas?: string[][] } | null
}

const SELECT_PROPUESTA = `select p.id, p.categoria_id categoria, p.clase, p.resumen, p.sha256, p.nivel, p.estado, p.monto_mxn::text monto,
    case when p.autor_agente is not null then jsonb_build_object('tipo', a.origen, 'id', a.id, 'nombre', a.nombre, 'iniciales', a.iniciales)
         else jsonb_build_object('tipo', 'humano', 'id', h.id, 'nombre', h.nombre, 'iniciales', h.iniciales) end autor,
    sp.nombre "solicitadaPor", p.creada_en::text creada, p.vence_en::text vence, p.payload, p.motivo_supervisor "motivoSupervisor",
    coalesce((select jsonb_agg(jsonb_build_object('decision', x.decision, 'persona', q.nombre, 'rol', x.rol_usado, 'cuando', x.decidida_en, 'motivo', x.motivo) order by x.decidida_en)
                from agora.aprobacion x join agora.persona q on q.id = x.decidida_por where x.propuesta_id = p.id), '[]') decisiones,
    agora.puedo_decidir(p.id) puedo
  from agora.propuesta p left join agora.agente a on a.id = p.autor_agente left join agora.persona h on h.id = p.autor_persona
  left join agora.persona sp on sp.id = p.solicitada_por`

export const propuestasDe = (s: Sesion, categorias: string[], estados = ['pendiente']): Promise<Propuesta[]> =>
  s.consulta<Propuesta>(`${SELECT_PROPUESTA} where p.categoria_id = any ($1::uuid[]) and p.estado = any ($2::text[]) order by p.creada_en desc`, [categorias, estados])

export const propuesta = async (s: Sesion, id: string): Promise<Propuesta | null> =>
  (await s.consulta<Propuesta>(`${SELECT_PROPUESTA} where p.id = $1`, [id]))[0] ?? null

export interface Mensaje { id: string; hilo: string | null; autor: Quien | { tipo: 'sistema'; id: null; nombre: string; iniciales: string }; cuerpo: string; origen: string
  creado: string; propuesta: string | null; item: string | null; huellaTarjeta: string | null }

export async function mensajesDe(s: Sesion, categoria: string, limite = 200): Promise<Mensaje[]> {
  return s.consulta<Mensaje>(
    `select m.id, m.hilo_id hilo,
            case m.autor_tipo when 'humano' then jsonb_build_object('tipo', 'humano', 'id', p.id, 'nombre', p.nombre, 'iniciales', p.iniciales)
                              when 'agente' then jsonb_build_object('tipo', a.origen, 'id', a.id, 'nombre', a.nombre, 'iniciales', a.iniciales)
                              else jsonb_build_object('tipo', 'sistema', 'id', null, 'nombre', 'Ágora', 'iniciales', 'Á') end autor,
            m.cuerpo, m.origen, m.creado_en::text creado, m.propuesta_id propuesta, m.item_id item, a.card_sha256 "huellaTarjeta"
       from agora.mensaje m join agora.canal c on c.id = m.canal_id
       left join agora.persona p on p.id = m.autor_persona left join agora.agente a on a.id = m.autor_agente
      where c.categoria_id = $1 order by m.creado_en, m.id limit $2`, [categoria, limite])
}

export interface Pendiente { tipo: 'propuesta' | 'aviso' | 'poliza' | 'alta'; id: string; titulo: string; detalle: string; nodo: string | null; ir: string; cuando: string }

/** «Espera tu clic»: solo lo que te toca decidir a ti (la matriz lo dice), y las alertas para tu rol. */
export async function esperaTuClic(s: Sesion): Promise<Pendiente[]> {
  const props = await s.consulta<Pendiente>(
    `select 'propuesta' tipo, p.id, p.resumen titulo,
            coalesce(a.nombre, h.nombre) || ' · ' || replace(p.clase, '_', ' ') || coalesce(' · ' || to_char(p.monto_mxn, 'FM$999,999,990') || ' MXN', '') detalle,
            p.categoria_id nodo, '/agora/buzon?cat=' || p.categoria_id || '&propuesta=' || p.id ir, p.creada_en::text cuando
       from agora.propuesta p left join agora.agente a on a.id = p.autor_agente left join agora.persona h on h.id = p.autor_persona
      where p.estado = 'pendiente' and coalesce((agora.puedo_decidir(p.id) ->> 'puede')::boolean, false) order by p.creada_en desc`)
  const avisos = await s.consulta<Pendiente>(
    `select 'aviso' tipo, v.id, v.texto titulo, replace(v.tipo, '_', ' ') detalle, v.nodo_id nodo,
            case when v.tipo like 'tope%' or v.tipo in ('deriva_tarjeta', 'suspension') then '/agora/agentes' when v.tipo = 'presupuesto_desviacion' then '/agora/costos'
                 else '/agora/tablero' end ir, v.creado_en::text cuando
       from agora.aviso v where not v.atendido order by v.creado_en desc limit 30`)
  const polizas = await s.consulta<Pendiente>(
    `select 'poliza' tipo, p.id, 'Póliza ' || p.folio || ' por aceptar' titulo, 'periodo ' || p.periodo || ' · propuesta por Ágora' detalle, null nodo,
            '/agora/contabilidad?periodo=' || p.periodo ir, p.generada_en::text cuando
       from agora.poliza p where p.estado = 'propuesta' and agora_priv.tiene_rol(p.org_id, null, array['contabilidad'])`)
  const altas = await s.consulta<Pendiente>(
    `select 'alta' tipo, a.id, 'Alta de ' || a.nombre || ': falta tu firma' titulo, a.responsable detalle, null nodo, '/agora/agentes?agente=' || a.id ir, now()::text cuando
       from agora.agente a where a.estado in ('solicitado', 'en_revision')
        and not exists (select 1 from agora.agente_firma f where f.agente_id = a.id and f.version = a.version and f.persona_id = auth.uid())
        and (agora_priv.tiene_rol(a.org_id, null, array['propietario'])
             or exists (select 1 from agora.agente_alcance x where x.agente_id = a.id and agora_priv.tiene_rol(a.org_id, x.nodo_id, array['aprobador'])))`)
  return [...props, ...polizas, ...altas, ...avisos]
}

export interface FilaCentro { nodo: string; tipo: string; nombre: string; periodo: string; presupuesto: string; comprometido: string; ejercido: string; disponible: string
  gastoModelo: string; filasSinCosto: number; pendiente: string }

export const arbolDeCostos = (s: Sesion, periodo: string): Promise<FilaCentro[]> =>
  s.consulta<FilaCentro>(`select nodo_id nodo, tipo, nombre, periodo, presupuesto_mxn::text presupuesto, comprometido_mxn::text comprometido, ejercido_mxn::text ejercido,
      disponible_mxn::text disponible, gasto_modelo_mxn::text "gastoModelo", filas_sin_costo "filasSinCosto", pendiente_mxn::text pendiente
      from agora.v_arbol_periodo where periodo = $1`, [periodo])

export interface GastoAgente { agente: string; nombre: string; origen: string; llamadas: number; usd: string | null; mxn: string | null; sinCosto: number; tope: string }

export const gastoPorAgente = (s: Sesion, periodo: string): Promise<GastoAgente[]> =>
  s.consulta<GastoAgente>(`select a.id agente, a.nombre, a.origen, count(g.*)::int llamadas, sum(g.costo_usd)::text usd, sum(g.costo_mxn)::text mxn,
      count(g.*) filter (where g.costo_mxn is null)::int "sinCosto", a.tope_gasto_mes_mxn::text tope
      from agora.agente a left join agora.gasto_modelo g on g.agente_id = a.id and g.periodo = $1
     group by a.id, a.nombre, a.origen, a.tope_gasto_mes_mxn having count(g.*) > 0 order by sum(g.costo_mxn) desc nulls last`, [periodo])

export interface TipoDeCambio { fecha: string; valor: string; fuente: string; serie: string | null; url: string; publicado: string; nota: string | null; llamadas: number }

export const tiposDeCambioUsados = (s: Sesion, periodo: string): Promise<TipoDeCambio[]> =>
  s.consulta<TipoDeCambio>(`select t.fecha::text, t.valor_mxn::text valor, t.fuente, t.serie, t.fuente_url url, t.publicado::text, t.nota, count(g.*)::int llamadas
      from agora.gasto_modelo g join agora.tipo_cambio t on t.id = g.tipo_cambio_id where g.periodo = $1 group by t.id order by t.fecha`, [periodo])
