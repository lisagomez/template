/**
 * Fase 6 · las métricas. Cada cifra sale de una métrica del catálogo y CUADRA AL CENTAVO con el libro y con las filas
 * que la originan; una métrica que no existe no se sustituye por una parecida; el tablero se regenera de su
 * especificación, sin LLM. Las métricas se leen con la sesión de quien mira: lo que RLS no deja ver, no suma.
 */
import { assert, cuenta, rechaza, persona, nodo, GOLFO, BAJIO, type Comprobacion, type Sabotaje } from './_marco.ts'
import { metricas } from '../dist/index.js'

const c$ = (x: string | number | null | undefined) => Math.round(Number(x ?? 0) * 100)

export const METRICAS: Comprobacion[] = [
  {
    fase: 'metricas', nombre: 'presupuesto, comprometido, ejercido y disponible por categoría cuadran al centavo con el libro', tipo: 'conducta',
    async corre(c) {
      for (const per of ['2026-09', '2026-10', '2026-11']) {
        const libro = await c.comoPersona('paula', (s) => s.consulta<Record<string, string>>(`select n.nombre, v.* from agora.v_centro_periodo v join agora.nodo n on n.id = v.categoria_id where v.periodo = $1`, [per]))
        for (const [m, col] of [['presupuesto_mxn', 'presupuesto_mxn'], ['comprometido_mxn', 'comprometido_mxn'], ['ejercido_mxn', 'ejercido_mxn'], ['disponible_mxn', 'disponible_mxn']] as const) {
          const r = await c.comoPersona('paula', (s) => metricas.consulta(s, { metrica: m, dimension: 'categoria', periodo: per }))
          for (const fila of libro) {
            const x = r.filas.find((f) => f.dimension === fila.nombre)
            assert.equal(c$(x?.valor), c$(fila[col]), `${m} de ${fila.nombre} en ${per}`)
          }
          const total = await c.comoPersona('paula', (s) => metricas.consulta(s, { metrica: m, periodo: per }))
          assert.equal(c$(total.filas[0]!.valor), libro.reduce((t, f) => t + c$(f[col]), 0), `${m} total de ${per}`)
        }
      }
    },
  },
  {
    fase: 'metricas', nombre: 'el costo de modelo por agente cuadra con las filas del registro de uso (y las sin costo se cuentan aparte)', tipo: 'conducta',
    async corre(c) {
      const r = await c.comoPersona('mariana', (s) => metricas.consulta(s, { metrica: 'costo_modelo_mxn', dimension: 'agente', periodo: '2026-10' }))
      const filas = await c.base.consulta<{ nombre: string; mxn: string }>(`select a.nombre, sum(g.costo_mxn)::text mxn from agora.gasto_modelo g join agora.agente a on a.id = g.agente_id where g.org_id = $1 and g.periodo = '2026-10' group by a.nombre`, [GOLFO])
      for (const f of filas) assert.equal(c$(r.filas.find((x) => x.dimension === f.nombre)?.valor), c$(f.mxn), f.nombre)
      const sin = await c.comoPersona('mariana', (s) => metricas.consulta(s, { metrica: 'filas_sin_costo', periodo: '2026-10' }))
      const nulas = await cuenta(c.base, `select 1 from agora.gasto_modelo where org_id = $1 and periodo = '2026-10' and costo_mxn is null`, [GOLFO])
      assert.ok(nulas > 0, 'la siembra no tiene llamadas sin datos de uso: la comprobación no probaría nada')
      assert.equal(Number(sin.filas[0]!.valor), nulas)
    },
  },
  {
    fase: 'metricas', nombre: 'las métricas de propuestas salen de las filas: aceptación y autonomía efectiva', tipo: 'conducta',
    async corre(c) {
      const r = await c.comoPersona('paula', (s) => metricas.consulta(s, { metrica: 'aceptacion_propuestas', dimension: 'agente' }))
      const [x] = await c.base.consulta<{ a: string | null }>(`select round(100.0 * count(*) filter (where p.estado in ('aprobada', 'aplicada')) / nullif(count(*) filter (where p.estado in ('aprobada', 'aplicada', 'rechazada', 'a_revision')), 0), 1)::text a
        from agora.propuesta p join agora.agente a on a.id = p.autor_agente where a.nombre = 'Coordinador de planeación' and p.org_id = $1`, [GOLFO])
      assert.equal(r.filas.find((f) => f.dimension === 'Coordinador de planeación')?.valor, x!.a)
      const au = await c.comoPersona('paula', (s) => metricas.consulta(s, { metrica: 'autonomia_efectiva' }))
      const [y] = await c.base.consulta<{ a: string }>(`select round(100.0 * count(*) filter (where nivel in ('A2', 'A3')) / nullif(count(*), 0), 1)::text a from agora.propuesta where org_id = $1 and estado = 'aplicada'`, [GOLFO])
      assert.equal(au.filas[0]!.valor, y!.a)
    },
  },
  {
    fase: 'metricas', nombre: 'a tiempo y vencidas salen de las filas, y no hay ítem cerrado sin fecha real', tipo: 'conducta',
    async corre(c) {
      const t = await c.comoPersona('paula', (s) => metricas.consulta(s, { metrica: 'tareas_a_tiempo_pct' }))
      const [x] = await c.base.consulta<{ a: string | null; n: string }>(`select round(100.0 * count(*) filter (where fecha_real <= fin) / nullif(count(*), 0), 1)::text a, count(*) n from agora.item where org_id = $1 and estado = 'done'`, [GOLFO])
      assert.ok(Number(x!.n) > 0, 'la siembra no tiene ítems cerrados')
      assert.equal(t.filas[0]!.valor, x!.a)
      const v = await c.comoPersona('paula', (s) => metricas.consulta(s, { metrica: 'tareas_vencidas' }))
      assert.equal(Number(v.filas[0]!.valor), await cuenta(c.base, `select 1 from agora.item where org_id = $1 and estado <> 'done' and fin < (now() at time zone 'America/Mexico_City')::date`, [GOLFO]))
      await rechaza(c.base.consulta(`update agora.item set fecha_real = null where org_id = $1 and estado = 'done'`, [GOLFO]), /item_cerrado_con_fecha|check/)
    },
  },
  {
    fase: 'metricas', nombre: 'las métricas respetan la RLS: Bajío no suma nada de Golfo Norte', tipo: 'conducta',
    async corre(c) {
      const golfo = await c.comoPersona('paula', (s) => metricas.consulta(s, { metrica: 'presupuesto_mxn', periodo: '2026-11' }))
      const bajio = await c.comoPersona('carla', (s) => metricas.consulta(s, { metrica: 'presupuesto_mxn', periodo: '2026-11' }))
      const [b] = await c.base.consulta<{ p: string }>(`select sum(importe_mxn)::text p from agora.presupuesto where org_id = $1 and periodo = '2026-11'`, [BAJIO])
      assert.equal(c$(bajio.filas[0]!.valor), c$(b!.p))
      assert.ok(c$(golfo.filas[0]!.valor) > c$(bajio.filas[0]!.valor))
    },
  },
  {
    fase: 'metricas', nombre: 'todo modelo semántico (sem_*) es security_invoker: lo lee la RLS de quien mira', tipo: 'estructura',
    async corre({ base }) {
      const malas = await base.consulta<{ v: string }>(`select c.relname v from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'agora' and c.relkind = 'v' and c.relname like 'sem\\_%' and not coalesce('security_invoker=true' = any (c.reloptions), false)`)
      assert.deepEqual(malas.map((x) => x.v), [], `sin security_invoker: ${malas.map((x) => x.v).join(', ')}`)
      const [n] = await base.consulta<{ n: string }>(`select count(*) n from pg_views where schemaname = 'agora' and viewname like 'sem\\_%'`)
      assert.equal(Number(n!.n), 6, 'faltan modelos semánticos')
    },
  },
  {
    fase: 'metricas', nombre: 'una persona de Bajío no lee ninguna fila de Golfo Norte en los modelos semánticos', tipo: 'conducta',
    async corre(c) {
      for (const v of ['sem_libro', 'sem_items', 'sem_propuestas', 'sem_gasto', 'sem_puerta', 'sem_suspensiones']) {
        assert.equal(await c.comoPersona('carla', (s) => cuenta(s, `select 1 from agora.${v} where org_id = $1`, [GOLFO])), 0, v)
      }
    },
  },
  {
    fase: 'metricas', nombre: 'una métrica que no existe no se sustituye por una parecida; una dimensión inválida se dice', tipo: 'conducta',
    async corre(c) {
      const e = metricas.entiende('quiero el NPS de los clientes por región', { periodo: '2026-10', workspaces: [] })
      assert.equal(e.ok, false)
      assert.match((e as { motivo: string }).motivo, /no la sustituyo/)
      assert.throws(() => metricas.compila({ metrica: 'nps' }), /no existe/)
      assert.throws(() => metricas.compila({ metrica: 'tareas_vencidas', dimension: 'agente' }), /no se abre por/)
      const ok = metricas.entiende('aceptación por agente externo en Expansión Monterrey', { periodo: '2026-10', workspaces: [{ id: nodo('mty'), nombre: 'Expansión Monterrey 2027' }] })
      assert.ok(ok.ok)
      assert.deepEqual((ok as { componente: unknown }).componente, { metrica: 'aceptacion_propuestas', dimension: 'agente', periodo: null, workspace: nodo('mty'), origen: 'externo', vista: 'barras' })
      void persona
    },
  },
]

export const SABOTAJES_METRICAS: Sabotaje[] = [
  { fase: 'metricas', nombre: 'M1 · el modelo semántico olvida el gasto de modelo (el ejercido no cuadra)', sql: `create or replace view agora.sem_libro with (security_invoker = true) as
      select v.org_id, v.periodo, c.id categoria_id, c.nombre categoria, d.nombre dominio, w.id workspace_id, w.nombre workspace, v.presupuesto_mxn, v.comprometido_mxn,
             (v.ejercido_mxn - v.gasto_modelo_mxn)::numeric(14,2) ejercido_mxn, v.disponible_mxn, v.gasto_modelo_mxn, v.filas_sin_costo, v.pendiente_mxn, (v.comprometido_mxn + v.ejercido_mxn - v.presupuesto_mxn) desviacion_mxn
        from agora.v_centro_periodo v join agora.nodo c on c.id = v.categoria_id join agora.nodo d on d.id = c.padre_id join agora.nodo w on w.id = d.padre_id;`, caza: /cuadran al centavo/ },
  { fase: 'metricas', nombre: 'M2 · el modelo de gasto cuenta las filas sin costo como cero', sql: `create or replace view agora.sem_gasto with (security_invoker = true) as
      select g.org_id, g.periodo, a.nombre agente, a.origen, c.nombre categoria, w.id workspace_id, w.nombre workspace, g.costo_usd, coalesce(g.costo_mxn, 0)::numeric(12,2) costo_mxn, false sin_costo
        from agora.gasto_modelo g join agora.agente a on a.id = g.agente_id join agora.nodo c on c.id = g.categoria_id join agora.nodo d on d.id = c.padre_id join agora.nodo w on w.id = d.padre_id;`, caza: /sin costo se cuentan aparte/ },
  { fase: 'metricas', nombre: 'M3 · el modelo semántico salta la RLS (security definer)', sql: `alter view agora.sem_libro set (security_invoker = false);`, caza: /security_invoker/ },
  { fase: 'metricas', nombre: 'M5 · un ítem cerrado sin fecha real (sale de «a tiempo» sin verse)', sql: `alter table agora.item drop constraint item_cerrado_con_fecha;`, caza: /a tiempo y vencidas/ },
  { fase: 'metricas', nombre: 'M4 · la aceptación cuenta lo pendiente como decidido', sql: `create or replace view agora.sem_propuestas with (security_invoker = true) as
      select p.org_id, p.id propuesta_id, coalesce(a.nombre, 'persona') agente, coalesce(a.origen, 'humano') origen, p.clase, p.nivel, p.estado, c.nombre categoria, d.nombre dominio, w.id workspace_id, w.nombre workspace,
             true decidida, p.estado in ('aprobada', 'aplicada') aceptada, p.estado = 'a_revision' devuelta, (p.nivel in ('A2', 'A3') and p.estado = 'aplicada') autonoma,
             extract(epoch from (p.decidida_en - p.creada_en)) / 3600 horas_a_decision, to_char(p.creada_en at time zone 'America/Mexico_City', 'YYYY-MM') periodo
        from agora.propuesta p left join agora.agente a on a.id = p.autor_agente join agora.nodo c on c.id = p.categoria_id join agora.nodo d on d.id = c.padre_id join agora.nodo w on w.id = d.padre_id;`, caza: /aceptación/ },
]
