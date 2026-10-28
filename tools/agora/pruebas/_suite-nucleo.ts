/**
 * Fase 1 · el núcleo de datos. Aislamiento entre organizaciones y RLS forzada, la identidad del agente verificada
 * por la base, la antirrepetición y la bitácora encadenada. Cada sabotaje de abajo tumba al menos una de estas.
 */
import { assert, cuenta, rechaza, agente, persona, nodo, item, GOLFO, BAJIO, SECRETO, type Comprobacion, type Sabotaje } from './_marco.ts'

const TABLAS_CON_ORG = ['nodo', 'persona', 'membresia', 'agente', 'agente_alcance', 'canal', 'mensaje', 'item', 'propuesta', 'aprobacion', 'presupuesto',
  'compromiso', 'costo', 'gasto_modelo', 'bitacora', 'matriz_regla', 'cuenta', 'item_historial', 'a2a_llamada']

export const NUCLEO: Comprobacion[] = [
  {
    fase: 'nucleo', nombre: 'toda tabla de agora tiene RLS habilitada y FORZADA', tipo: 'estructura',
    async corre({ base }) {
      const sin = await base.consulta<{ t: string }>(`select c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'agora' and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity)`)
      assert.deepEqual(sin.map((x) => x.t), [], `sin RLS forzada: ${sin.map((x) => x.t).join(', ')}`)
    },
  },
  {
    fase: 'nucleo', nombre: 'una persona de Bajío no ve NADA de Golfo Norte, tabla por tabla', tipo: 'conducta',
    async corre(c) {
      await c.comoPersona('carla', async (s) => {
        for (const t of TABLAS_CON_ORG) assert.equal(await cuenta(s, `select 1 from agora.${t} where org_id = $1`, [GOLFO]), 0, `ve ${t} de Golfo`)
        assert.equal(await cuenta(s, 'select 1 from agora.org where id = $1', [GOLFO]), 0, 've la org ajena')
        assert.ok(await cuenta(s, 'select 1 from agora.item where org_id = $1', [BAJIO]) > 0, 'no ve ni lo suyo (la prueba no prueba nada)')
      })
    },
  },
  {
    fase: 'nucleo', nombre: 'una persona de Golfo Norte no ve NADA de Bajío', tipo: 'conducta',
    async corre(c) {
      await c.comoPersona('paula', async (s) => {
        for (const t of TABLAS_CON_ORG) assert.equal(await cuenta(s, `select 1 from agora.${t} where org_id = $1`, [BAJIO]), 0, `ve ${t} de Bajío`)
        assert.ok(await cuenta(s, 'select 1 from agora.item where org_id = $1', [GOLFO]) > 0)
      })
    },
  },
  {
    fase: 'nucleo', nombre: 'una persona de Bajío no escribe en Golfo Norte (mensaje ni propuesta)', tipo: 'conducta',
    async corre(c) {
      const canal = (await c.base.consulta<{ id: string }>('select id from agora.canal where categoria_id = $1', [nodo('campanas')]))[0]!.id
      await rechaza(c.comoPersona('carla', (s) => s.consulta(`insert into agora.mensaje (org_id, canal_id, autor_tipo, autor_persona, cuerpo) values ($1, $2, 'humano', $3, 'hola')`,
        [GOLFO, canal, persona('carla')])), /prohibido|no es de esa/)
      await rechaza(c.comoPersona('carla', (s) => s.consulta(`insert into agora.mensaje (org_id, canal_id, autor_tipo, autor_persona, cuerpo) values ($1, $2, 'humano', $3, 'hola')`,
        [BAJIO, canal, persona('carla')])), /prohibido|no es de esa/)
    },
  },
  {
    fase: 'nucleo', nombre: 'el alcance manda dentro de la organización: la colaboradora de Comercial no ve Operaciones', tipo: 'conducta',
    async corre(c) {
      await c.comoPersona('ana', async (s) => {
        assert.equal(await cuenta(s, 'select 1 from agora.item where categoria_id = $1', [nodo('logistica')]), 0)
        assert.ok(await cuenta(s, 'select 1 from agora.item where categoria_id = $1', [nodo('pipeline')]) > 0)
      })
    },
  },
  {
    fase: 'nucleo', nombre: 'el lector ve y no publica', tipo: 'conducta',
    async corre(c) {
      const canal = (await c.base.consulta<{ id: string }>('select id from agora.canal where categoria_id = $1', [nodo('pipeline')]))[0]!.id
      await c.comoPersona('roberto', async (s) => assert.ok(await cuenta(s, 'select 1 from agora.item') > 0))
      await rechaza(c.comoPersona('roberto', (s) => s.consulta(`insert into agora.mensaje (org_id, canal_id, autor_tipo, autor_persona, cuerpo) values ($1, $2, 'humano', $3, 'hola')`,
        [GOLFO, canal, persona('roberto')])), 'prohibido')
    },
  },
  {
    fase: 'nucleo', nombre: 'un agente ve solo su alcance: el socio de Campañas no ve Pipeline ni Logística, ni nada de Bajío', tipo: 'conducta',
    async corre(c) {
      await c.comoAgente('medios-norte', async (s) => {
        assert.ok(await cuenta(s, 'select 1 from agora.item where categoria_id = $1', [nodo('campanas')]) > 0, 'no ve ni lo suyo')
        assert.equal(await cuenta(s, 'select 1 from agora.item where categoria_id <> $1', [nodo('campanas')]), 0)
        assert.equal(await cuenta(s, 'select 1 from agora.mensaje m join agora.canal k on k.id = m.canal_id where k.categoria_id <> $1', [nodo('campanas')]), 0)
        assert.equal(await cuenta(s, 'select 1 from agora.agente where id <> $1', [agente('medios-norte')]), 0, 'un externo ve a otros agentes')
      })
      await c.comoAgente('coordinador', async (s) => assert.equal(await cuenta(s, 'select 1 from agora.item where org_id = $1', [BAJIO]), 0))
    },
  },
  {
    fase: 'nucleo', nombre: 'un token de agente con firma falsa, vencido, o de otro rol no da identidad', tipo: 'conducta',
    async corre(c) {
      await c.comoAgente('coordinador', async (s) => assert.equal(await cuenta(s, 'select 1 from agora.item'), 0), { secreto: 'otro-secreto-que-no-es-el-de-la-base-xx' })
      await c.comoAgente('coordinador', async (s) => assert.equal(await cuenta(s, 'select 1 from agora.item'), 0), { exp: Date.now() - 1000 })
      // Las claims cambiadas (otro agente) con la firma vieja no valen.
      const t = c.token('coordinador')
      const [cuerpo, firma] = t.split('.') as [string, string]
      const otro = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(cuerpo, 'base64url').toString()), agente: agente('analista') })).toString('base64url')
      const { como } = await import('../dist/index.js')
      await como(c.base, { tipo: 'agente', token: `${otro}.${firma}` }, async (s) => assert.equal(await cuenta(s, 'select 1 from agora.item'), 0))
      // Un token de agente presentado en una sesión de persona no la vuelve agente.
      await c.comoPersona('roberto', async (s) => {
        await s.consulta(`select set_config('agora.tarea', $1, true)`, [c.token('coordinador')])
        const [r] = await s.consulta<{ a: string | null }>('select agora_priv.agente_de_tarea() a')
        assert.equal(r!.a, null)
      })
    },
  },
  {
    fase: 'nucleo', nombre: 'un agente suspendido o revocado no ve ni escribe nada (su token sigue vigente)', tipo: 'conducta',
    async corre(c) {
      await c.comoAgente('empaques-regio', async (s) => assert.equal(await cuenta(s, 'select 1 from agora.item'), 0))
      const canal = (await c.base.consulta<{ id: string }>('select id from agora.canal where categoria_id = $1', [nodo('compras')]))[0]!.id
      await rechaza(c.comoAgente('empaques-regio', (s) => s.consulta(`insert into agora.mensaje (org_id, canal_id, autor_tipo, autor_agente, cuerpo) values ($1, $2, 'agente', $3, 'hola')`,
        [GOLFO, canal, agente('empaques-regio')])), /prohibido|no existe|no es de esa organización/)
    },
  },
  {
    fase: 'nucleo', nombre: 'ningún rol de servicio ni de agente puede insertar aprobaciones ni decisiones de póliza', tipo: 'estructura',
    async corre({ base }) {
      const [r] = await base.consulta<Record<string, boolean>>(`select
        has_table_privilege('service_role', 'agora.aprobacion', 'insert') s1, has_table_privilege('agora_agente', 'agora.aprobacion', 'insert') a1,
        has_table_privilege('agora_puerta', 'agora.aprobacion', 'insert') p1, has_table_privilege('service_role', 'agora.poliza_decision', 'insert') s2,
        has_table_privilege('agora_agente', 'agora.poliza_decision', 'insert') a2, has_table_privilege('authenticated', 'agora.aprobacion', 'update') u1,
        has_table_privilege('authenticated', 'agora.aprobacion', 'delete') d1`)
      assert.deepEqual(Object.entries(r!).filter(([, v]) => v).map(([k]) => k), [])
      const [pol] = await base.consulta<{ n: string }>(`select count(*) n from pg_policies where schemaname = 'agora' and tablename = 'aprobacion' and permissive = 'RESTRICTIVE' and with_check like '%auth.uid()%'`)
      assert.equal(Number(pol!.n), 1, 'falta la política restrictiva decidida_por = auth.uid()')
    },
  },
  {
    fase: 'nucleo', nombre: 'un agente no edita el tablero ni toca el libro: no tiene con qué', tipo: 'estructura',
    async corre({ base }) {
      const malos = await base.consulta<{ t: string; p: string }>(`select t, p from unnest(array['item', 'presupuesto', 'compromiso', 'costo', 'poliza', 'poliza_movimiento', 'aprobacion', 'agente']) t,
        unnest(array['insert', 'update', 'delete']) p where has_table_privilege('agora_agente', 'agora.' || t, p)`)
      assert.deepEqual(malos.map((x) => `${x.p} ${x.t}`), [])
    },
  },
  {
    fase: 'nucleo', nombre: 'una persona no escribe presupuestos ni compromisos directo: van por propuesta', tipo: 'conducta',
    async corre(c) {
      await rechaza(c.comoPersona('mariana', (s) => s.consulta(`insert into agora.presupuesto (org_id, categoria_id, periodo, version, importe_mxn, motivo) values ($1, $2, '2026-11', 1, 999999, 'directo')`,
        [GOLFO, nodo('pipeline')])), /prohibido/)
      await rechaza(c.comoPersona('paula', (s) => s.consulta(`update agora.item set monto_mxn = 1 where id = $1`, [item('it-1')])), /prohibido/)
    },
  },
  {
    fase: 'nucleo', nombre: 'el jti se toma una sola vez (antirrepetición)', tipo: 'conducta',
    async corre(c) {
      const vence = new Date(Date.now() + 300_000).toISOString()
      const r1 = await c.comoPuerta((s) => s.consulta<{ ok: boolean }>('select agora.puerta_toma_jti($1, $2, $3) ok', [agente('medios-norte'), 'jti-de-prueba-0001', vence]))
      const r2 = await c.comoPuerta((s) => s.consulta<{ ok: boolean }>('select agora.puerta_toma_jti($1, $2, $3) ok', [agente('medios-norte'), 'jti-de-prueba-0001', vence]))
      assert.equal(r1[0]!.ok, true)
      assert.equal(r2[0]!.ok, false, 'el mismo jti se aceptó dos veces')
    },
  },
  {
    fase: 'nucleo', nombre: 'la Puerta no lee tablas: solo sus funciones', tipo: 'conducta',
    async corre(c) {
      await rechaza(c.comoPuerta((s) => s.consulta('select * from agora.agente')), /prohibido|permission/)
      await rechaza(c.comoPuerta((s) => s.consulta('select * from agora.mensaje')), /prohibido|permission/)
    },
  },
  {
    fase: 'nucleo', nombre: 'el historial y la bitácora no se inventan a mano', tipo: 'conducta',
    async corre(c) {
      await rechaza(c.comoPersona('paula', (s) => s.consulta(`select agora_priv.anota_historial($1, $2, 'nombre', null, null, 'humano', $3, null, null, null)`,
        [GOLFO, item('it-1'), persona('paula')])), /prohibido|historial solo lo anota/)
      await rechaza(c.comoPersona('paula', (s) => s.consulta(`select agora_priv.anota($1, 'humano', 'x', 'falsa', 'x', '{}')`, [GOLFO])), /prohibido|permission/)
      await rechaza(c.comoPersona('paula', (s) => s.consulta(`insert into agora.item_historial (org_id, item_id, campo, actor_tipo) values ($1, $2, 'nombre', 'humano')`,
        [GOLFO, item('it-1')])), /prohibido|permission/)
    },
  },
  {
    fase: 'nucleo', nombre: 'la bitácora encadenada detecta un eslabón alterado', tipo: 'conducta',
    async corre(c) {
      const integra = await c.comoPersona('paula', (s) => s.consulta<{ roto: string | null }>('select agora.verifica_bitacora($1) roto', [GOLFO]))
      assert.equal(integra[0]!.roto, null, 'la cadena sembrada no está íntegra')
      await c.base.transaccion(async (s) => {
        await s.consulta(`update agora.bitacora set detalle = '{"alterado": true}' where id = (select min(id) + 3 from agora.bitacora where org_id = $1)`, [GOLFO])
        const r = await s.consulta<{ roto: string | null }>('select agora.verifica_bitacora($1) roto', [GOLFO])
        assert.notEqual(r[0]!.roto, null, 'la verificación no vio el eslabón alterado')
        throw Object.assign(new Error('deshacer'), { deshacer: true })
      }).catch((e) => { if (!(e as { deshacer?: boolean }).deshacer) throw e })
    },
  },
]

const reemplaza = (firma: string, cuerpo: string) => `create or replace function ${firma} language sql stable security definer set search_path = '' as $$ ${cuerpo} $$;`

export const SABOTAJES_NUCLEO: Sabotaje[] = [
  { fase: 'nucleo', nombre: 'S1 · quitar la RLS de los ítems', sql: 'alter table agora.item no force row level security; alter table agora.item disable row level security;', caza: /RLS habilitada y FORZADA|no ve NADA/ },
  { fase: 'nucleo', nombre: 'S2 · una política de ítems que deja ver todo', sql: 'drop policy p_item on agora.item; create policy p_item on agora.item for select to authenticated using (true);', caza: /no ve NADA|el alcance manda/ },
  { fase: 'nucleo', nombre: 'S3 · darle al servicio permiso de aprobar', sql: 'grant insert on agora.aprobacion to service_role;', caza: /ningún rol de servicio/ },
  { fase: 'nucleo', nombre: 'S4 · aceptar cualquier firma de token', sql: reemplaza('agora_priv.firma_valida(cuerpo text, sello text) returns boolean', 'select true'), caza: /firma falsa/ },
  { fase: 'nucleo', nombre: 'S5 · un agente revocado o suspendido conserva su identidad',
    sql: `create or replace function agora_priv.agente_de_tarea() returns uuid language plpgsql stable security definer set search_path = '' as $$
      declare c jsonb := agora_priv.claims_de_tarea(); begin return (c ->> 'agente')::uuid; exception when others then return null; end $$;`, caza: /suspendido o revocado/ },
  { fase: 'nucleo', nombre: 'S6 · la membresía ignora la organización', sql: reemplaza('agora_priv.es_de_org(o uuid) returns boolean', 'select exists (select 1 from agora.membresia m where m.persona_id = auth.uid())')
    + reemplaza('agora_priv.ve_nodo(o uuid, n uuid) returns boolean', 'select exists (select 1 from agora.membresia m where m.persona_id = auth.uid())'), caza: /no ve NADA/ },
  { fase: 'nucleo', nombre: 'S7 · darle al agente permiso de editar el tablero', sql: 'grant update on agora.item to agora_agente;', caza: /no edita el tablero/ },
  { fase: 'nucleo', nombre: 'S8 · el jti se puede repetir',
    sql: `create or replace function agora.puerta_toma_jti(aid uuid, jti text, vence timestamptz) returns boolean language sql security definer set search_path = '' as $$ select true $$;`, caza: /jti se toma una sola vez/ },
  { fase: 'nucleo', nombre: 'S9 · la verificación de la bitácora no mira', sql: `create or replace function agora.verifica_bitacora(o uuid) returns bigint language sql stable as $$ select null::bigint $$;`, caza: /eslabón alterado/ },
  { fase: 'nucleo', nombre: 'S10 · el token no se ata a su rol (sirve en una sesión de persona)',
    sql: `create or replace function agora_priv.claims_de_tarea() returns jsonb language plpgsql stable security definer set search_path = '' as $$
      declare token text := nullif(current_setting('agora.tarea', true), ''); cuerpo text; begin
      if token is null then return null; end if; cuerpo := split_part(token, '.', 1);
      if not agora_priv.firma_valida(cuerpo, split_part(token, '.', 2)) then return null; end if;
      return convert_from(decode(rpad(translate(cuerpo, '-_', '+/'), (length(cuerpo) + 3) / 4 * 4, '='), 'base64'), 'utf8')::jsonb; end $$;`, caza: /de otro rol no da identidad/ },
  { fase: 'nucleo', nombre: 'S11 · la Puerta puede leer las tablas', sql: 'grant select on agora.agente, agora.mensaje to agora_puerta; create policy x on agora.agente for select to agora_puerta using (true); create policy y on agora.mensaje for select to agora_puerta using (true);', caza: /la Puerta no lee tablas/ },
  { fase: 'nucleo', nombre: 'S12 · el historial se puede anotar a mano', sql: `create or replace function agora_priv.anota_historial(o uuid, it uuid, campo text, antes jsonb, despues jsonb, actor_tipo text, persona uuid, agente uuid, prop uuid, deshacer timestamptz) returns void language plpgsql security definer set search_path = '' as $$ begin insert into agora.item_historial (org_id, item_id, campo, antes, despues, actor_tipo, actor_persona) values (o, it, campo, antes, despues, actor_tipo, persona); end $$;`, caza: /no se inventan a mano/ },
]

export { SECRETO }
