/**
 * Fase 7 · el testigo del freno en la BASE. El freno de la capa exige el clic en el navegador; lo que un navegador no
 * garantiza lo garantiza aquí la base: la cita de cerrar, revocar, quitar la segregación o avisar a un tercero es algo
 * que ESTA persona dijo en la conversación (no un asistente ni un agente), sirve una vez y vence a los 15 minutos.
 */
import { assert, cuenta, rechaza, agente, persona, GOLFO, type Comprobacion, type Ctx, type Sabotaje } from './_marco.ts'

const atestigua = (c: Ctx, quien: string, ...textos: string[]) => c.comoPersona(quien, (s) => s.consulta('select agora.atestigua($1::text[])', [textos]))
const cierra = (c: Ctx, quien: string, cita: string) => c.comoPersona(quien, (s) => s.consulta(`select agora.cierra_periodo($1, '2026-09', $2)`, [GOLFO, cita]))
const revoca = (c: Ctx, quien: string, clave: string, cita: string) => c.comoPersona(quien, (s) => s.consulta(`select agora.revoca_agente($1, 'prueba del testigo', $2)`, [agente(clave), cita]))

export const CAPA: Comprobacion[] = [
  {
    fase: 'capa', nombre: 'sin el testigo de la persona, la base no cierra el periodo ni revoca (aunque la cita sea larga)', tipo: 'conducta',
    async corre(c) {
      await rechaza(cierra(c, 'mariana', 'cierra los costos de septiembre'), 'la cita no es tuya')
      await rechaza(revoca(c, 'paula', 'fletes-golfo', 'revoca a fletes del golfo ya'), 'la cita no es tuya')
      const [p] = await c.base.consulta<{ n: string }>(`select count(*) n from agora.periodo where org_id = $1 and periodo = '2026-09' and estado = 'cerrado'`, [GOLFO])
      assert.equal(Number(p!.n), 0)
    },
  },
  {
    fase: 'capa', nombre: 'la cita la dijo ESTA persona: el testigo de otra no sirve, el suyo sí (normalizado como el freno)', tipo: 'conducta',
    async corre(c) {
      await atestigua(c, 'paula', 'cierra los costos de septiembre')
      await rechaza(cierra(c, 'mariana', 'cierra los costos de septiembre'), 'la cita no es tuya')
      await atestigua(c, 'mariana', 'Cierra los  costos de SEPTIEMBRE')
      await cierra(c, 'mariana', 'cierra los costos de septiembre')
      assert.equal(await cuenta(c.base, `select 1 from agora.freno_testigo where persona_id = $1 and accion = 'cierra_periodo'`, [persona('mariana')]), 1)
    },
  },
  {
    fase: 'capa', nombre: 'una cita sirve UNA vez: la segunda revocación con la misma cita se rechaza', tipo: 'conducta',
    async corre(c) {
      await atestigua(c, 'paula', 'revoca al socio que no responde')
      await revoca(c, 'paula', 'fletes-golfo', 'revoca al socio que no responde')
      await rechaza(revoca(c, 'paula', 'medios-norte', 'revoca al socio que no responde'), 'ya se usó')
      const [a] = await c.base.consulta<{ estado: string }>('select estado from agora.agente where id = $1', [agente('medios-norte')])
      assert.equal(a!.estado, 'aprobado')
    },
  },
  {
    fase: 'capa', nombre: 'pasados 15 minutos la cita venció', tipo: 'conducta',
    async corre(c) {
      await atestigua(c, 'paula', 'revoca a fletes del golfo ya')
      await c.base.consulta(`update agora.freno_testigo set dicho_en = now() - interval '16 minutes' where persona_id = $1`, [persona('paula')])
      await rechaza(revoca(c, 'paula', 'fletes-golfo', 'revoca a fletes del golfo ya'), 'venció')
      await atestigua(c, 'paula', 'revoca a fletes del golfo ya')
      await revoca(c, 'paula', 'fletes-golfo', 'revoca a fletes del golfo ya')
    },
  },
  {
    fase: 'capa', nombre: 'quitar la segregación y avisar a un tercero gastan testigo; volver a ponerla no', tipo: 'conducta',
    async corre(c) {
      await rechaza(c.comoPersona('paula', (s) => s.consulta('select agora.cambia_segregacion($1, false, $2)', [GOLFO, 'quita la segregación de funciones'])), 'la cita no es tuya')
      await rechaza(c.comoPersona('paula', (s) => s.consulta(`select agora.usa_testigo($1, 'avisa_tercero')`, ['avísale a fletes del golfo'])), 'la cita no es tuya')
      await atestigua(c, 'paula', 'quita la segregación de funciones')
      await c.comoPersona('paula', (s) => s.consulta('select agora.cambia_segregacion($1, false, $2)', [GOLFO, 'quita la segregación de funciones']))
      await c.comoPersona('paula', (s) => s.consulta('select agora.cambia_segregacion($1, true, $2)', [GOLFO, 'vuelve a poner la segregación']))
    },
  },
  {
    fase: 'capa', nombre: 'un agente y la Puerta no atestiguan; nadie escribe ni fecha un testigo a mano', tipo: 'conducta',
    async corre(c) {
      await rechaza(c.comoAgente('coordinador', (s) => s.consulta('select agora.atestigua($1::text[])', [['cierra los costos de septiembre']])), /prohibido|permission/)
      await rechaza(c.comoPuerta((s) => s.consulta('select agora.atestigua($1::text[])', [['revoca a fletes del golfo']])), /prohibido|permission/)
      await rechaza(c.comoPersona('paula', (s) => s.consulta(`insert into agora.freno_testigo (org_id, persona_id, sha256) values ($1, $2, repeat('a', 64))`, [GOLFO, persona('paula')])), /prohibido|permission/)
      await atestigua(c, 'paula', 'algo que dije')
      await rechaza(c.comoPersona('paula', (s) => s.consulta(`update agora.freno_testigo set dicho_en = now() + interval '1 hour', usado_en = null`)), /prohibido|permission/)
    },
  },
  {
    fase: 'capa', nombre: 'el testigo guarda la huella y la hora, nunca el texto (no es memoria ni hilo)', tipo: 'estructura',
    async corre({ base }) {
      const cols = await base.consulta<{ c: string }>(`select column_name c from information_schema.columns where table_schema = 'agora' and table_name = 'freno_testigo' order by ordinal_position`)
      assert.deepEqual(cols.map((x) => x.c), ['id', 'org_id', 'persona_id', 'sha256', 'dicho_en', 'usado_en', 'accion'])
    },
  },
]

const reemplazaConsumo = (cuerpo: string) => `create or replace function agora_priv.consume_testigo(p_cita text, p_accion text) returns void language plpgsql security definer set search_path = '' as $$ ${cuerpo} $$;`

export const SABOTAJES_CAPA: Sabotaje[] = [
  { fase: 'capa', nombre: 'K1 · lo irreversible no pide testigo', sql: reemplazaConsumo('begin return; end'), caza: /sin el testigo/ },
  { fase: 'capa', nombre: 'K2 · el testigo de cualquiera sirve', sql: reemplazaConsumo(`declare t bigint; begin
      select x.id into t from agora.freno_testigo x where x.sha256 = agora_priv.huella_cita(p_cita) and x.usado_en is null order by x.dicho_en desc limit 1;
      if t is null then raise exception 'la cita no es tuya' using errcode = 'AG403'; end if; update agora.freno_testigo set usado_en = now(), accion = p_accion where id = t; end`), caza: /ESTA persona/ },
  { fase: 'capa', nombre: 'K3 · la cita no se gasta', sql: reemplazaConsumo(`begin
      if agora_priv.llama_la_base() then return; end if;
      if not exists (select 1 from agora.freno_testigo x where x.persona_id = auth.uid() and x.sha256 = agora_priv.huella_cita(p_cita) and x.dicho_en > now() - interval '15 minutes') then
        raise exception 'la cita no es tuya' using errcode = 'AG403'; end if; end`), caza: /UNA vez/ },
  { fase: 'capa', nombre: 'K4 · la cita no vence', sql: reemplazaConsumo(`declare t bigint; begin
      if agora_priv.llama_la_base() then return; end if;
      select x.id into t from agora.freno_testigo x where x.persona_id = auth.uid() and x.sha256 = agora_priv.huella_cita(p_cita) and x.usado_en is null order by x.dicho_en desc limit 1;
      if t is null then raise exception 'la cita no es tuya' using errcode = 'AG403'; end if; update agora.freno_testigo set usado_en = now(), accion = p_accion where id = t; end`), caza: /venció/ },
  { fase: 'capa', nombre: 'K5 · la persona puede escribir y fechar testigos a mano', sql: `grant insert, update on agora.freno_testigo to authenticated; grant usage on sequence agora.freno_testigo_id_seq to authenticated;
      create policy p_testigo_mano on agora.freno_testigo for all to authenticated using (true) with check (true);`, caza: /a mano/ },
  { fase: 'capa', nombre: 'K6 · un agente puede atestiguar', sql: `grant execute on function agora.atestigua(text[]) to agora_agente, agora_puerta;
      create or replace function agora.atestigua(textos text[]) returns int language sql security definer set search_path = '' as $$ select 1 $$;`, caza: /no atestiguan/ },
]
