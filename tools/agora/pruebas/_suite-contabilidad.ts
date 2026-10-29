/**
 * Fase 5 · el paquete para Contabilidad. La póliza propuesta cuadra (partida doble estructural), cada cuenta lleva su
 * código agrupador SAT, cada línea de CFDI su UUID, y el export cumple el contrato de ERP-5B. Solo un humano de
 * Contabilidad la acepta, sobre su huella; un periodo cerrado no se edita, se reclasifica en el abierto. Y la póliza
 * se RE-VERIFICA de cero desde el libro, con un cálculo independiente del de la base.
 */
import { z } from 'zod'
import { assert, cuenta, rechaza, persona, nodo, GOLFO, SECRETO, type Comprobacion, type Ctx, type Sabotaje } from './_marco.ts'
import { cierraPeriodo, atestigua } from '../dist/index.js'

/** El contrato de ERP-5B §5B.3 (ctb_poliza + ctb_movimiento), tal como lo exporta Ágora. */
export const ContratoPoliza = z.strictObject({
  contrato: z.literal('ERP-5B.3'),
  poliza: z.strictObject({ folio: z.string().regex(/^POL-\d{4}-\d{2}-[IED]-\d{3}$/), tipo: z.enum(['ingreso', 'egreso', 'diario']), periodo: z.string().regex(/^\d{4}-\d{2}$/),
    origen: z.enum(['automatica', 'manual']), concepto: z.string().min(3), documentos: z.array(z.uuid()) }),
  movimientos: z.array(z.strictObject({ orden: z.number().int().positive(), cuenta: z.string(), codigo_agrupador: z.string().regex(/^[1-8]\d{2}(\.\d{2})?$/), naturaleza: z.enum(['cargo', 'abono']),
    importe: z.number().positive(), uuid_cfdi: z.uuid().nullable(), rfc: z.string().nullable(), documento: z.string().min(1), concepto: z.string() })).min(2),
  cuadre: z.strictObject({ cargos: z.number(), abonos: z.number() }),
  sin_costear: z.number().int().min(0),
  anexo: z.string().min(10),
})

const cierra = async (c: Ctx) => {
  const [ya] = await c.base.consulta<{ id: string }>(`select id from agora.poliza where periodo = '2026-09' and org_id = $1`, [GOLFO])
  if (ya) return ya.id
  await atestigua({ base: c.base, secreto: SECRETO }, persona('mariana'), ['cierra los costos de septiembre de 2026']) // lo dijo en la conversación
  return (await cierraPeriodo({ base: c.base, secreto: SECRETO }, persona('mariana'), { org: GOLFO, periodo: '2026-09', cita: 'cierra los costos de septiembre de 2026' })).poliza!
}
const exporta = async (c: Ctx, pid: string) => (await c.comoPersona('sofia', (s) => s.consulta<{ e: unknown; h: string }>('select agora.exporta_poliza($1) e, agora.huella_poliza($1) h', [pid])))[0]!

/** La póliza esperada, calculada en TypeScript directo de las filas del libro y la configuración (no de la base). */
async function esperada(c: Ctx, per: string) {
  const costos = await c.base.consulta<{ tipo: string; slug: string; importe: string; uuid: string | null }>(
    `select c.tipo, n.slug, c.importe_mxn::text importe, c.evidencia_uuid::text uuid from agora.costo c join agora.nodo n on n.id = c.categoria_id where c.org_id = $1 and c.periodo = $2 and c.estado = 'ejercido' and c.tipo <> 'reclasificacion'`, [GOLFO, per])
  const modelo = await c.base.consulta<{ slug: string; mxn: string }>(`select n.slug, sum(g.costo_mxn)::text mxn from agora.gasto_modelo g join agora.nodo n on n.id = g.categoria_id where g.org_id = $1 and g.periodo = $2 and g.costo_mxn is not null group by n.slug`, [GOLFO, per])
  const plantillas = await c.base.consulta<{ origen: string; categoria_slug: string | null; cuenta_cargo: string; cuenta_abono: string }>(`select origen, categoria_slug, cuenta_cargo, cuenta_abono from agora.plantilla_asiento where org_id = $1`, [GOLFO])
  const pl = (origen: string, slug: string) => plantillas.find((x) => x.origen === origen && x.categoria_slug === slug) ?? plantillas.find((x) => x.origen === origen && x.categoria_slug === null)!
  const saldo = new Map<string, number>()
  const suma = (cuenta: string, centavos: number) => saldo.set(cuenta, (saldo.get(cuenta) ?? 0) + centavos)
  for (const x of costos) { const p = pl(x.tipo, x.slug); const v = Math.round(Number(x.importe) * 100); suma(`${p.cuenta_cargo}:cargo`, v); suma(`${p.cuenta_abono}:abono`, v) }
  for (const x of modelo) { const p = pl('gasto_modelo', x.slug); const v = Math.round(Number(x.mxn) * 100); suma(`${p.cuenta_cargo}:cargo`, v); suma(`${p.cuenta_abono}:abono`, v) }
  return { saldo, uuids: costos.filter((x) => x.uuid).map((x) => x.uuid!).sort() }
}

export const CONTABILIDAD: Comprobacion[] = [
  {
    fase: 'contabilidad', nombre: 'el cierre deja una póliza propuesta que cumple el contrato de ERP-5B y cuadra', tipo: 'conducta',
    async corre(c) {
      const pid = await cierra(c)
      const { e, h } = await exporta(c, pid)
      const x = ContratoPoliza.parse(e)
      const cent = (n: number) => Math.round(n * 100)
      assert.equal(cent(x.cuadre.cargos), cent(x.cuadre.abonos), 'la póliza no cuadra')
      assert.equal(cent(x.movimientos.filter((m) => m.naturaleza === 'cargo').reduce((s, m) => s + m.importe, 0)), cent(x.cuadre.cargos))
      assert.match(h, /^[0-9a-f]{64}$/)
      const [p] = await c.base.consulta<{ sha256: string; estado: string }>('select sha256, estado from agora.poliza where id = $1', [pid])
      assert.equal(p!.sha256, h, 'la huella guardada no es la del export')
      assert.equal(p!.estado, 'propuesta')
    },
  },
  {
    fase: 'contabilidad', nombre: 'toda cuenta de la póliza lleva su código agrupador SAT, y cada línea de un CFDI su UUID', tipo: 'conducta',
    async corre(c) {
      const pid = await cierra(c)
      const malos = await c.base.consulta<{ cuenta: string }>(`select m.cuenta from agora.poliza_movimiento m join agora.cuenta k on k.org_id = m.org_id and k.codigo = m.cuenta
        where m.poliza_id = $1 and (m.codigo_agrupador is distinct from k.codigo_agrupador or m.codigo_agrupador !~ '^[1-8][0-9]{2}([.][0-9]{2})?$')`, [pid])
      assert.deepEqual(malos, [])
      const x = ContratoPoliza.parse((await exporta(c, pid)).e)
      const conCfdi = await c.base.consulta<{ u: string }>(`select evidencia_uuid::text u from agora.costo where periodo = '2026-09' and org_id = $1 and evidencia_uuid is not null order by 1`, [GOLFO])
      assert.deepEqual([...x.poliza.documentos].sort(), conCfdi.map((r) => r.u), 'el vínculo póliza↔UUID no está completo')
    },
  },
  {
    fase: 'contabilidad', nombre: 'RE-VERIFICACIÓN de cero: la póliza de la base es la que sale del libro calculada aparte', tipo: 'conducta',
    async corre(c) {
      const pid = await cierra(c)
      const esp = await esperada(c, '2026-09')
      const real = await c.base.consulta<{ k: string; v: string }>(`select cuenta || ':' || naturaleza k, sum(importe)::text v from agora.poliza_movimiento where poliza_id = $1 group by 1`, [pid])
      const r = new Map(real.map((x) => [x.k, Math.round(Number(x.v) * 100)]))
      assert.deepEqual(Object.fromEntries([...r].sort()), Object.fromEntries([...esp.saldo].sort()), 'la póliza de la base no es la que sale del libro')
    },
  },
  {
    fase: 'contabilidad', nombre: 'la póliza declara las llamadas sin costo (no entran como cero)', tipo: 'conducta',
    async corre(c) {
      const pid = await cierra(c)
      const x = ContratoPoliza.parse((await exporta(c, pid)).e)
      const [n] = await c.base.consulta<{ n: string }>(`select count(*) n from agora.gasto_modelo where org_id = $1 and periodo = '2026-09' and costo_mxn is null`, [GOLFO])
      assert.equal(x.sin_costear, Number(n!.n))
      assert.ok(x.sin_costear > 0, 'la siembra debería tener al menos una llamada sin costo en septiembre')
    },
  },
  {
    fase: 'contabilidad', nombre: 'cerrar es de Finanzas, con cita, de un mes vencido y sin costos pendientes; un agente no cierra', tipo: 'conducta',
    async corre(c) {
      await rechaza(c.comoPersona('paula', (s) => s.consulta(`select agora.cierra_periodo($1, '2026-09', 'cierra septiembre por favor')`, [GOLFO])), 'cerrar el periodo es de Finanzas')
      await rechaza(c.comoPersona('mariana', (s) => s.consulta(`select agora.cierra_periodo($1, '2026-09', '')`, [GOLFO])), 'falta la cita textual')
      await rechaza(c.comoPersona('mariana', (s) => s.consulta(`select agora.cierra_periodo($1, to_char(now(), 'YYYY-MM'), 'cierra el mes en curso')`, [GOLFO])), 'no ha terminado')
      await rechaza(c.comoAgente('coordinador', (s) => s.consulta(`select agora.cierra_periodo($1, '2026-09', 'cierra los costos de septiembre')`, [GOLFO])), /prohibido|permission/)
    },
  },
  {
    fase: 'contabilidad', nombre: 'solo Contabilidad acepta, sobre la huella exacta; devolver pide motivo; un agente no decide', tipo: 'conducta',
    async corre(c) {
      const pid = await cierra(c)
      const { h } = await exporta(c, pid)
      const ins = (quien: string, decision: string, sha: string, motivo: string | null = null) => c.comoPersona(quien, (s) => s.consulta(
        `insert into agora.poliza_decision (org_id, poliza_id, decision, sha256, decidida_por, motivo) values ($1, $2, $3, $4, $5, $6)`, [GOLFO, pid, decision, sha, persona(quien), motivo]))
      await rechaza(ins('paula', 'acepta', h), 'solo Contabilidad')
      await rechaza(ins('sofia', 'acepta', 'ab'.repeat(32)), 'huella no es la de la póliza')
      await rechaza(ins('sofia', 'devuelve', h), /motivo_al_devolver|invalido/)
      await rechaza(c.comoAgente('coordinador', (s) => s.consulta(`insert into agora.poliza_decision (org_id, poliza_id, decision, sha256, decidida_por) values ($1, $2, 'acepta', $3, $4)`, [GOLFO, pid, h, persona('sofia')])), /prohibido|permission/)
      await ins('sofia', 'acepta', h)
      const [p] = await c.base.consulta<{ estado: string }>('select estado from agora.poliza where id = $1', [pid])
      assert.equal(p!.estado, 'aceptada')
      await rechaza(c.base.consulta(`update agora.poliza set concepto = 'otro' where id = $1`, [pid]), 'no se edita')
    },
  },
  {
    fase: 'contabilidad', nombre: 'tras el cierre no se edita: se reclasifica en el periodo abierto (y el ejercido se mueve de centro)', tipo: 'conducta',
    async corre(c) {
      await cierra(c)
      const [orig] = await c.base.consulta<{ id: string; importe: string }>(`select id, importe_mxn::text importe from agora.costo where periodo = '2026-09' and categoria_id = $1 and tipo = 'cfdi' limit 1`, [nodo('campanas')])
      await rechaza(c.comoPersona('mariana', (s) => s.consulta(`update agora.costo set categoria_id = $1 where id = $2`, [nodo('pipeline'), orig!.id])), 'está cerrado')
      const antes = (await c.base.consulta<{ e: string }>(`select ejercido_mxn::text e from agora.v_centro_periodo where categoria_id = $1 and periodo = to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM')`, [nodo('pipeline')]))[0]?.e ?? '0'
      await c.comoPersona('mariana', (s) => s.consulta(`insert into agora.costo (org_id, categoria_id, periodo, importe_mxn, concepto, tipo, reclasifica, de_categoria_id, estado)
        values ($1, $2, to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM'), 1000, 'Reclasificación: parte del estudio era de prospección', 'reclasificacion', $3, $4, 'ejercido')`, [GOLFO, nodo('pipeline'), orig!.id, nodo('campanas')]))
      const despues = (await c.base.consulta<{ e: string }>(`select ejercido_mxn::text e from agora.v_centro_periodo where categoria_id = $1 and periodo = to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM')`, [nodo('pipeline')]))[0]!.e
      assert.equal(Math.round((Number(despues) - Number(antes)) * 100), 100000)
    },
  },
  {
    fase: 'contabilidad', nombre: 'un agente no propone pólizas ni escribe movimientos', tipo: 'estructura',
    async corre({ base }) {
      const malos = await base.consulta<{ t: string; p: string }>(`select t, p from unnest(array['poliza', 'poliza_movimiento', 'poliza_decision', 'periodo', 'cuenta', 'plantilla_asiento']) t,
        unnest(array['insert', 'update', 'delete']) p where has_table_privilege('agora_agente', 'agora.' || t, p) or has_table_privilege('authenticated', 'agora.' || t, p) and t not in ('poliza_decision')`)
      assert.deepEqual(malos.map((x) => `${x.p} ${x.t}`), [])
    },
  },
  {
    fase: 'contabilidad', nombre: 'segregación QUITADA: la aceptación queda marcada en el paquete (la pone la base) y la marca no se borra', tipo: 'conducta',
    async corre(c) {
      const pid = await cierra(c)
      const { h } = await exporta(c, pid)
      await atestigua({ base: c.base, secreto: SECRETO }, persona('paula'), ['quita la segregación de funciones'])
      await c.comoPersona('paula', (s) => s.consulta('select agora.cambia_segregacion($1, false, $2)', [GOLFO, 'quita la segregación de funciones']))
      // Quien acepta no se declara «con segregación»: la marca la pone la base.
      await c.comoPersona('sofia', (s) => s.consulta(`insert into agora.poliza_decision (org_id, poliza_id, decision, sha256, decidida_por, sin_segregacion) values ($1, $2, 'acepta', $3, $4, false)`, [GOLFO, pid, h, persona('sofia')]))
      const [d] = await c.base.consulta<{ m: boolean }>('select sin_segregacion m from agora.poliza_decision where poliza_id = $1', [pid])
      assert.equal(d!.m, true, 'la aceptación sin segregación no quedó marcada')
      await rechaza(c.comoPersona('sofia', (s) => s.consulta('update agora.poliza_decision set sin_segregacion = false where poliza_id = $1', [pid])), /solo se agrega|prohibido|permission/)
      const [d2] = await c.base.consulta<{ m: boolean }>('select sin_segregacion m from agora.poliza_decision where poliza_id = $1', [pid])
      assert.equal(d2!.m, true, 'la marca se borró')
    },
  },
  {
    fase: 'contabilidad', nombre: 'segregación puesta: la aceptación NO lleva la marca (aunque quien acepta la pida)', tipo: 'conducta',
    async corre(c) {
      const pid = await cierra(c)
      const { h } = await exporta(c, pid)
      await c.comoPersona('sofia', (s) => s.consulta(`insert into agora.poliza_decision (org_id, poliza_id, decision, sha256, decidida_por, sin_segregacion) values ($1, $2, 'acepta', $3, $4, true)`, [GOLFO, pid, h, persona('sofia')]))
      const [d] = await c.base.consulta<{ m: boolean }>('select sin_segregacion m from agora.poliza_decision where poliza_id = $1', [pid])
      assert.equal(d!.m, false)
    },
  },
  {
    fase: 'contabilidad', nombre: 'segregación QUITADA: Finanzas tiene un aviso fijo en su panel que nadie atiende a mano; ponerla lo atiende', tipo: 'conducta',
    async corre(c) {
      const fijos = () => c.comoPersona('mariana', (s) => cuenta(s, `select 1 from agora.aviso where tipo = 'segregacion_off' and para_rol = 'finanzas' and not atendido`))
      const quita = async (cita: string) => {
        await atestigua({ base: c.base, secreto: SECRETO }, persona('paula'), [cita])
        await c.comoPersona('paula', (s) => s.consulta('select agora.cambia_segregacion($1, false, $2)', [GOLFO, cita]))
      }
      assert.equal(await fijos(), 0)
      await quita('quita la segregación de funciones')
      assert.equal(await fijos(), 1, 'quitar la segregación no avisó a Finanzas')
      await rechaza(c.comoPersona('mariana', (s) => s.consulta(`update agora.aviso set atendido = true where tipo = 'segregacion_off'`)), /prohibido|permission/)
      assert.equal(await fijos(), 1, 'el aviso se atendió con la segregación quitada')
      await c.comoPersona('paula', (s) => s.consulta('select agora.cambia_segregacion($1, true, $2)', [GOLFO, 'vuelve a poner la segregación']))
      assert.equal(await fijos(), 0, 'ponerla no atendió el aviso')
      await quita('quita otra vez la segregación')
      assert.equal(await fijos(), 1, 'al quitarla de nuevo el aviso no volvió')
    },
  },
]

export const SABOTAJES_CONTABILIDAD: Sabotaje[] = [
  { fase: 'contabilidad', nombre: 'K1 · el cierre omite los abonos (y no hay partida doble que lo pare)', sql: `drop trigger tg_partida_doble_mov on agora.poliza_movimiento; drop trigger tg_partida_doble_pol on agora.poliza;
      create or replace function agora_priv.plantilla(p_org uuid, p_origen text, p_categoria uuid) returns agora.plantilla_asiento language sql stable security definer set search_path = '' as $$
        select pl.org_id, pl.origen, pl.categoria_slug, pl.cuenta_cargo, pl.cuenta_cargo, pl.revisada_por from agora.plantilla_asiento pl where pl.org_id = p_org and pl.origen = p_origen and pl.categoria_slug is null limit 1 $$;`, caza: /RE-VERIFICACIÓN|cuadra/ },
  { fase: 'contabilidad', nombre: 'K2 · una cuenta sin código agrupador válido', sql: `alter table agora.cuenta drop constraint cuenta_codigo_agrupador_check; update agora.cuenta set codigo_agrupador = '999.99' where codigo = '602-061';`, caza: /código agrupador|contrato de ERP-5B/ },
  { fase: 'contabilidad', nombre: 'K3 · cualquiera acepta la póliza', sql: `create or replace function agora_priv.decision_poliza_valida() returns trigger language plpgsql security definer set search_path = '' as $$ begin return new; end $$;`, caza: /solo Contabilidad acepta/ },
  { fase: 'contabilidad', nombre: 'K4 · el agente puede decidir pólizas', sql: `grant insert on agora.poliza_decision to agora_agente; create policy x on agora.poliza_decision for insert to agora_agente with check (true);`, caza: /solo Contabilidad acepta|un agente no propone/ },
  { fase: 'contabilidad', nombre: 'K5 · el cierre sin cita ni dueño', sql: `create or replace function agora_priv.tiene_rol(o uuid, n uuid, roles text[]) returns boolean language sql stable security definer set search_path = '' as $$ select true $$;`, caza: /cerrar es de Finanzas|solo Contabilidad/ },
  { fase: 'contabilidad', nombre: 'K6 · la póliza no lleva el UUID del CFDI', sql: `create or replace function agora.exporta_poliza(pid uuid) returns jsonb language sql stable as $$
      select jsonb_build_object('contrato', 'ERP-5B.3', 'poliza', jsonb_build_object('folio', p.folio, 'tipo', p.tipo, 'periodo', p.periodo, 'origen', p.origen, 'concepto', p.concepto, 'documentos', '[]'::jsonb),
        'movimientos', (select jsonb_agg(jsonb_build_object('orden', m.orden, 'cuenta', m.cuenta, 'codigo_agrupador', m.codigo_agrupador, 'naturaleza', m.naturaleza, 'importe', m.importe, 'uuid_cfdi', null, 'rfc', m.rfc_tercero, 'documento', m.documento, 'concepto', m.concepto) order by m.orden) from agora.poliza_movimiento m where m.poliza_id = p.id),
        'cuadre', (select jsonb_build_object('cargos', sum(m.importe) filter (where m.naturaleza = 'cargo'), 'abonos', sum(m.importe) filter (where m.naturaleza = 'abono')) from agora.poliza_movimiento m where m.poliza_id = p.id),
        'sin_costear', p.sin_costear, 'anexo', 'Anexo 24 RMF 2024') from agora.poliza p where p.id = pid $$;`, caza: /UUID/ },
  // La segregación quitada deja huella: la marca de la aceptación y el aviso fijo de Finanzas (registro de riesgo, C5).
  { fase: 'contabilidad', nombre: 'K7 · la aceptación sin segregación no queda marcada', sql: `create function agora_priv.k7() returns trigger language plpgsql as $$ begin new.sin_segregacion := false; return new; end $$;
    create trigger tg_zz_k7 before insert on agora.poliza_decision for each row execute function agora_priv.k7();`, caza: /la aceptación queda marcada/ },
  { fase: 'contabilidad', nombre: 'K8 · la marca se borra después', sql: `drop trigger tg_decision_poliza_solo_agregar on agora.poliza_decision; grant update on agora.poliza_decision to authenticated;
    create policy k8 on agora.poliza_decision for update to authenticated using (true) with check (true);`, caza: /la aceptación queda marcada/ },
  { fase: 'contabilidad', nombre: 'K9 · toda aceptación sale marcada (la marca ya no dice nada)', sql: `create function agora_priv.k9() returns trigger language plpgsql as $$ begin new.sin_segregacion := true; return new; end $$;
    create trigger tg_zz_k9 before insert on agora.poliza_decision for each row execute function agora_priv.k9();`, caza: /NO lleva la marca/ },
  { fase: 'contabilidad', nombre: 'K10 · quitar la segregación no avisa a Finanzas', sql: `create or replace function agora.cambia_segregacion(o uuid, activa boolean, cita text) returns jsonb language plpgsql security definer set search_path = '' as $$
    begin
      if not agora_priv.tiene_rol(o, null, array['propietario']) then raise exception 'la segregación la decide la Propietaria' using errcode = 'AG403'; end if;
      if not activa then perform agora_priv.consume_testigo(cita, 'quita_segregacion'); end if;
      update agora.org_config set segregacion = activa where org_id = o;
      insert into agora.decision_org (org_id, tipo, quien, cita) values (o, case when activa then 'segregacion_on' else 'segregacion_off' end, agora_priv.uid(), cita);
      return jsonb_build_object('ok', true, 'segregacion', activa);
    end $$;`, caza: /aviso fijo/ },
  { fase: 'contabilidad', nombre: 'K11 · Finanzas atiende el aviso a mano y la segregación sigue quitada', sql: `grant update on agora.aviso to authenticated;
    create policy k11 on agora.aviso for update to authenticated using (true) with check (true);`, caza: /aviso fijo/ },
]
