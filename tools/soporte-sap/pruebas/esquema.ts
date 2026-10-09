/**
 * La propuesta de esquema, validada en efímero: se aplica dos veces; toda tabla del producto
 * tiene RLS forzada; las funciones de visibilidad viven fuera de `public` y fijan su
 * search_path; el árbol de tenencia y los roles se imponen en la base; eventos y crudo son de
 * solo agregar.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { baseSoporte, falla, ORG, INC, USR, SQL_SOPORTE } from './_base.ts'
import { RAIZ } from './_ayuda.ts'

test('se aplica dos veces y toda tabla ss_ tiene RLS con force', async () => {
  const db = await baseSoporte()
  const sinRls = await db.query<{ n: string }>(`select relname as n from pg_class where relnamespace = 'public'::regnamespace
    and relkind = 'r' and relname like 'ss\\_%' and not (relrowsecurity and relforcerowsecurity)`)
  assert.deepEqual(sinRls.rows, [])
  const tablas = await db.query<{ n: number }>(`select count(*)::int as n from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'ss\\_%'`)
  assert.equal(tablas.rows[0]?.n, 22)
})

test('las tablas hijas no pueden contradecir la tenencia de su incidencia', async () => {
  const db = await baseSoporte()
  assert.match(await falla(() => db.exec(`insert into ss_cuarentena (incidencia_id, consultora_id, cliente_id, senales) values ('${INC.a1}', '${ORG.CB}', '${ORG.B1}', '{rfc}')`)) ?? '', /no es la de su incidencia/)
  assert.match(await falla(() => db.exec(`insert into ss_adjunto (incidencia_id, consultora_id, cliente_id, sha256, ruta, tipo_mime, bytes, via)
    values ('${INC.a1}', '${ORG.CA}', '${ORG.A1}', '${'7'.repeat(64)}', 'otra/ruta', 'image/png', 10, 'ocr_local')`)) ?? '', /ss_ruta_de_su_tenant/)
})

test('ningún rol de servicio sale con bypassrls ni puede decidir', async () => {
  const db = await baseSoporte()
  const bypass = await db.query(`select rolname from pg_roles where rolname like 'soporte_sap_%' and rolbypassrls`)
  assert.deepEqual(bypass.rows, [])
  const deciden = await db.query(`select r, t from unnest(array['soporte_sap_agente', 'soporte_sap_ingesta']) r, unnest(array['ss_mapeo', 'ss_campo_extraido', 'ss_propuesta']) t
    where has_table_privilege(r, 'public.' || t, 'UPDATE')`)
  assert.deepEqual(deciden.rows, [])
})

test('ninguna función security definer en public; las de ss_priv fijan search_path', async () => {
  const db = await baseSoporte()
  const enPublic = await db.query(`select proname from pg_proc where pronamespace = 'public'::regnamespace and prosecdef`)
  assert.deepEqual(enPublic.rows, [])
  const sinPath = await db.query(`select proname from pg_proc where pronamespace = 'ss_priv'::regnamespace
    and not exists (select 1 from unnest(proconfig) c where c like 'search_path=%')`)
  assert.deepEqual(sinPath.rows, [])
})

test('el árbol y los roles se imponen en la base', async () => {
  const db = await baseSoporte()
  assert.match(await falla(() => db.exec(`insert into ss_organizacion (tipo, nombre, padre_id) values ('cliente', 'Huérfano', '${ORG.L}')`)) ?? '', /árbol inválido/)
  assert.match(await falla(() => db.exec(`insert into ss_miembro values ('${ORG.CA}', '${USR.ua1}', 'superadmin')`)) ?? '', /no existe en una organización/)
  assert.match(await falla(() => db.exec(`insert into ss_incidencia (consultora_id, cliente_id, titulo) values ('${ORG.CB}', '${ORG.A1}', 'cruzada')`)) ?? '', /no es de la consultora/)
})

test('eventos y crudo son de solo agregar, aun para el dueño de la tabla', async () => {
  const db = await baseSoporte()
  assert.match(await falla(() => db.exec(`update ss_evento set tipo = 'X' where incidencia_id = '${INC.a1}'`)) ?? '', /solo agregar/)
  assert.match(await falla(() => db.exec(`delete from ss_evento where incidencia_id = '${INC.a1}'`)) ?? '', /solo agregar/)
  await db.exec(`insert into ss_crudo (consultora_id, herramienta, huella, contenido) values ('${ORG.CA}', 'mesauno', '${'f'.repeat(64)}', '{}')`)
  assert.match(await falla(() => db.exec(`update ss_crudo set contenido = '{"x":1}'`)) ?? '', /solo agregar/)
})

test('un mapeo aprobado dice quién lo aprobó; uno a medida dice de quién es', async () => {
  const db = await baseSoporte()
  assert.match(await falla(() => db.exec(`insert into ss_mapeo values ('${ORG.CA}', 'mesauno', 1, '{}', 'aprobado', null)`)) ?? '', /ss_aprobado_tiene_quien/)
  assert.match(await falla(() => db.exec(`insert into ss_propuesta (tipo, origen, alcance, contenido, propuesta_por) values ('cli', 'fde', 'a_medida', '{}', 'agente')`)) ?? '', /ss_a_medida_es_de_alguien/)
})

/**
 * El error que volvió (PRP-010, fase 4): `rol_en` es NULL para quien no es miembro, y `not (… = 'consultor')` con NULL
 * no lanza. Ya había pasado con `<>` en `evento_honesto` (tanda 1d). En un disparador, una función de `ss_priv` puede
 * devolver NULL, así que se compara con `is (not) distinct from`, que falla cerrado. La prueba cuenta los disparadores
 * que leyó: si el patrón dejara de encontrarlos, pasaría en vacío.
 */
test('en un disparador, lo que devuelve una función de ss_priv no se compara con = ni <>: con NULL no falla cerrado', () => {
  const sala = readFileSync(join(RAIZ, 'tools', 'sala-a2a', 'migraciones', 'propuesta-sala-a2a.sql'), 'utf8')
  for (const [nombre, sql, minimo] of [['soporte-sap', SQL_SOPORTE, 17], ['sala-a2a', sala, 2]] as const) {
    const cuerpos = [...sql.matchAll(/create or replace function ([\w.]+)\([^)]*\) returns trigger[\s\S]*?\$\$([\s\S]*?)\$\$/g)]
    assert.ok(cuerpos.length >= minimo, `${nombre}: leí ${cuerpos.length} disparadores, esperaba al menos ${minimo}`)
    const malas = cuerpos.flatMap(([, f, cuerpo]) => [...cuerpo!.matchAll(/ss_priv\.\w+\([^()]*\)\s*(?:=|<>|!=)/g)].map((x) => `${f}: ${x[0]}`))
    assert.deepEqual(malas, [], nombre)
  }
})

