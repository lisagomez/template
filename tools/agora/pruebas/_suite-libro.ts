/**
 * Fase 4 · el libro de costos. El cuadre (ejercido = costos con evidencia + gasto de modelo con su tipo de cambio;
 * null no es cero; disponible = presupuesto − comprometido vigente − ejercido, que es lo mismo que presupuesto −
 * compromisos aprobados − ejercido sin compromiso) y los 8 MALOS FINANCIEROS: cada uno bloqueado por la base o
 * por el supervisor, nunca solo por la pantalla.
 */
import { assert, cuenta, rechaza, agente, persona, nodo, item, GOLFO, SECRETO, type Comprobacion, type Ctx, type Sabotaje } from './_marco.ts'
import { decide, propone, aplica, registraCosto, supervisa, cierraPeriodo, atestigua } from '../dist/index.js'
import { uid } from '../dist/laboratorio/index.js'

const e = (c: Ctx) => ({ base: c.base, secreto: SECRETO })
const centro = async (c: Ctx, cat: string, per: string) => (await c.base.consulta<Record<string, string>>(`select * from agora.v_centro_periodo where categoria_id = $1 and periodo = $2`, [nodo(cat), per]))[0]!
/** Cierra septiembre (o devuelve su póliza si ya estaba cerrado: las comprobaciones corren también en fila sobre una base). */
async function cierraSeptiembre(c: Ctx): Promise<{ poliza: string | null }> {
  const [ya] = await c.base.consulta<{ id: string }>(`select id from agora.poliza where periodo = '2026-09' and org_id = $1 and folio like 'POL-%-D-%'`, [GOLFO])
  if (ya) return { poliza: ya.id }
  await atestigua(e(c), persona('mariana'), ['cierra los costos de septiembre de 2026']) // lo dijo Mariana en la conversación
  return cierraPeriodo(e(c), persona('mariana'), { org: GOLFO, periodo: '2026-09', cita: 'cierra los costos de septiembre de 2026' })
}

export const LIBRO: Comprobacion[] = [
  {
    fase: 'libro', nombre: 'cuadre: el ejercido es la suma de los costos con evidencia más el gasto de modelo con su tipo de cambio', tipo: 'conducta',
    async corre(c) {
      for (const [cat, per] of [['pipeline', '2026-09'], ['campanas', '2026-09'], ['logistica', '2026-09'], ['pipeline', '2026-10']] as const) {
        const v = await centro(c, cat, per)
        const [x] = await c.base.consulta<{ costos: string; modelo: string }>(`select
            (select coalesce(sum(importe_mxn), 0) from agora.costo where categoria_id = $1 and periodo = $2 and estado = 'ejercido' and tipo <> 'reclasificacion')::text costos,
            (select coalesce(sum(round(g.costo_usd * t.valor_mxn, 2)), 0) from agora.gasto_modelo g join agora.tipo_cambio t on t.id = g.tipo_cambio_id where g.categoria_id = $1 and g.periodo = $2 and g.costo_usd is not null)::text modelo`, [nodo(cat), per])
        // Al centavo, en enteros: sin flotantes de por medio.
        const c$ = (x: string | number) => Math.round(Number(x) * 100)
        assert.equal(c$(v.ejercido_mxn!), c$(x!.costos) + c$(x!.modelo), `${cat} ${per}: el ejercido no cuadra con sus fuentes`)
        assert.equal(c$(v.disponible_mxn!), c$(v.presupuesto_mxn!) - c$(v.comprometido_mxn!) - c$(v.ejercido_mxn!))
        // La misma cifra por la otra fórmula (encumbrance): presupuesto − compromisos aprobados − ejercido que no venía de un compromiso.
        assert.equal(c$(v.disponible_mxn!), c$(v.presupuesto_mxn!) - c$(v.compromisos_aprobados_mxn!) - (c$(v.ejercido_mxn!) - c$(v.ejercido_de_compromiso_mxn!)))
      }
    },
  },
  {
    fase: 'libro', nombre: 'null no es cero: una llamada sin datos de uso cuenta como fila sin costo, no suma cero', tipo: 'conducta',
    async corre(c) {
      const v = await centro(c, 'logistica', '2026-09')
      assert.equal(Number(v.filas_sin_costo), 1, 'la llamada sin uso no se declaró')
      const [g] = await c.base.consulta<{ n: string; mxn: string | null }>(`select count(*) n, sum(costo_mxn)::text mxn from agora.gasto_modelo where categoria_id = $1 and periodo = '2026-09'`, [nodo('logistica')])
      assert.equal(Number(g!.n), 1)
      assert.equal(g!.mxn, null, 'una fila sin uso se volvió cero')
    },
  },
  {
    fase: 'libro', nombre: 'el gasto de modelo en MXN sale de un tipo de cambio con fuente y fecha; sin él, es null', tipo: 'conducta',
    async corre(c) {
      const [sinFuente] = await c.base.consulta<{ n: string }>(`select count(*) n from agora.gasto_modelo g join agora.tipo_cambio t on t.id = g.tipo_cambio_id where length(t.fuente) < 3 or t.fuente_url not like 'https://%'`)
      assert.equal(Number(sinFuente!.n), 0)
      // Una llamada en una fecha sin tipo de cambio publicado en los cinco días previos (diciembre, en el fixture).
      await c.base.consulta(`insert into agora.gasto_modelo (org_id, agente_id, ejecutado_por, categoria_id, proveedor, modelo, costo_usd, cuando) values ($1, $2, $2, $3, 'prueba', 'modelo-pineado-0.1', 1.5, '2026-12-15 10:00:00-06')`,
        [GOLFO, agente('coordinador'), nodo('pipeline')])
      const [g] = await c.base.consulta<{ mxn: string | null; tc: string | null }>(`select costo_mxn::text mxn, tipo_cambio_id::text tc from agora.gasto_modelo where proveedor = 'prueba'`)
      assert.deepEqual(g, { mxn: null, tc: null }, 'sin tipo de cambio la cifra en MXN se estimó')
    },
  },
  {
    fase: 'libro', nombre: 'una desviación sobre el umbral alerta en el hilo de la categoría y a Finanzas', tipo: 'conducta',
    async corre(c) {
      await registraCosto(e(c), persona('mariana'), { categoria: nodo('campanas'), periodo: '2026-10', importe: 9000, concepto: 'Reimpresión urgente de material', tipo: 'cfdi', uuid: uid('cfdi:desviacion-1'), rfc: 'IRE190312AB1', proveedor: 'Imprenta (ficticia)' })
      await registraCosto(e(c), persona('mariana'), { categoria: nodo('campanas'), periodo: '2026-10', importe: 14000, concepto: 'Pauta adicional', tipo: 'cfdi', uuid: uid('cfdi:desviacion-2'), rfc: 'MNO150101XY2', proveedor: 'Medios Norte (ficticia)' })
      assert.equal(await cuenta(c.base, `select 1 from agora.aviso where tipo = 'presupuesto_desviacion' and para_rol = 'finanzas' and nodo_id = $1`, [nodo('campanas')]), 1)
      assert.equal(await cuenta(c.base, `select 1 from agora.mensaje where clave like 'aviso:desviacion:%'`), 1)
    },
  },
  // --- Los 8 malos financieros -------------------------------------------------------------------------------
  {
    fase: 'libro', nombre: 'MALO 1 · el mismo costo dos veces (mismo UUID o misma evidencia) lo rechaza la base', tipo: 'conducta',
    async corre(c) {
      const [u] = await c.base.consulta<{ u: string }>(`select evidencia_uuid::text u from agora.costo where evidencia_uuid is not null limit 1`)
      await rechaza(registraCosto(e(c), persona('mariana'), { categoria: nodo('pipeline'), periodo: '2026-10', importe: 100, concepto: 'otra vez', tipo: 'cfdi', uuid: u!.u }), /conflicto|duplicate|ux_costo_uuid/)
      const [h] = await c.base.consulta<{ h: string }>(`select evidencia_sha256 h from agora.costo where evidencia_sha256 is not null limit 1`)
      await rechaza(registraCosto(e(c), persona('mariana'), { categoria: nodo('logistica'), periodo: '2026-10', importe: 100, concepto: 'otra vez', tipo: 'comprobante', comprobanteSha256: h!.h }), /conflicto|duplicate|ux_costo_sha/)
    },
  },
  {
    fase: 'libro', nombre: 'MALO 2 · un costo ejercido sin evidencia: la base no lo deja existir (queda pendiente)', tipo: 'conducta',
    async corre(c) {
      await rechaza(c.comoPersona('mariana', (s) => s.consulta(`insert into agora.costo (org_id, categoria_id, periodo, importe_mxn, concepto, tipo, estado) values ($1, $2, '2026-10', 500, 'sin factura', 'cfdi', 'ejercido')`, [GOLFO, nodo('pipeline')])), /ejercido_con_evidencia|invalido/)
      const r = await registraCosto(e(c), persona('mariana'), { categoria: nodo('pipeline'), periodo: '2026-10', importe: 500, concepto: 'sin factura todavía', tipo: 'cfdi' })
      assert.equal(r.estado, 'pendiente')
      const v = await centro(c, 'pipeline', '2026-10')
      assert.equal(Number(v.pendiente_mxn), 500, 'lo pendiente no se declara aparte')
    },
  },
  {
    fase: 'libro', nombre: 'MALO 3 · un compromiso sin aprobación no existe (ni escrito como servicio)', tipo: 'conducta',
    async corre(c) {
      const [p] = await c.base.consulta<{ id: string }>(`select id from agora.propuesta where clave = 'siembra:p-visitas'`) // pendiente
      const [a] = await c.base.consulta<{ id: string }>(`select id from agora.aprobacion limit 1`)
      await rechaza(c.base.consulta(`insert into agora.compromiso (org_id, categoria_id, periodo, importe_mxn, propuesta_id, aprobacion_id, concepto) values ($1, $2, '2026-11', 1000, $3, $4, 'sin aprobar')`, [GOLFO, nodo('pipeline'), p!.id, a!.id]), 'propuesta aprobada')
      await rechaza(c.comoPersona('mariana', (s) => s.consulta(`insert into agora.compromiso (org_id, categoria_id, periodo, importe_mxn, propuesta_id, aprobacion_id, concepto) values ($1, $2, '2026-11', 1000, $3, $4, 'x')`, [GOLFO, nodo('pipeline'), p!.id, a!.id])), /prohibido|permission/)
    },
  },
  {
    fase: 'libro', nombre: 'MALO 4 · un monto sobre el umbral aprobado por quien no es de Finanzas, o por un agente', tipo: 'conducta',
    async corre(c) {
      const [p] = await c.base.consulta<{ id: string; sha256: string }>(`select id, sha256 from agora.propuesta where clave = 'siembra:p-radio'`)
      await rechaza(c.comoPersona('paula', (s) => decide(s, { org: GOLFO, propuesta: p!.id, sha256: p!.sha256, persona: persona('paula'), decision: 'aprobar' })), 'matriz no te deja')
      await rechaza(c.comoPersona('daniel', (s) => decide(s, { org: GOLFO, propuesta: p!.id, sha256: p!.sha256, persona: persona('daniel'), decision: 'aprobar' })), 'matriz no te deja')
      await rechaza(c.comoAgente('coordinador', (s) => s.consulta(`insert into agora.aprobacion (org_id, propuesta_id, decision, sha256, decidida_por) values ($1, $2, 'aprobar', $3, $4)`, [GOLFO, p!.id, p!.sha256, persona('mariana')])), /prohibido|permission/)
      // Aplicarla: un agente que no la propuso ni la ve («no existe»); su autor, sin la fila humana de Finanzas.
      await rechaza(c.comoAgente('coordinador', (s) => aplica(s, p!.id)), 'no existe')
      await rechaza(c.comoAgente('medios-norte', (s) => aplica(s, p!.id)), 'sin su fila de aprobación')
    },
  },
  {
    fase: 'libro', nombre: 'MALO 5 · la subida del tope de gasto de un agente sin Finanzas', tipo: 'conducta',
    async corre(c) {
      await rechaza(c.comoPersona('paula', (s) => s.consulta(`select agora.baja_tope($1, 'gasto', 5000)`, [agente('coordinador')])), 'subir un tope es una propuesta')
      await rechaza(c.comoPersona('paula', (s) => s.consulta(`update agora.agente set tope_gasto_mes_mxn = 5000 where id = $1`, [agente('coordinador')])), /prohibido|permission/)
      const p = await c.comoPersona('luis', (s) => propone(s, { org: GOLFO, autorPersona: persona('luis'), resumen: 'subir el tope del coordinador', payload: { version: 1, clase: 'tope_gasto', categoria: nodo('pipeline'), agente: agente('coordinador'), tope: 'gasto', antes: 3000, despues: 3400 } }))
      await c.comoPersona('paula', (s) => decide(s, { org: GOLFO, propuesta: p.id, sha256: p.sha256, persona: persona('paula'), decision: 'aprobar' }))
      await rechaza(c.comoPersona('paula', (s) => aplica(s, p.id)), 'sin su fila de aprobación')
      const [a] = await c.base.consulta<{ t: string }>('select tope_gasto_mes_mxn::text t from agora.agente where id = $1', [agente('coordinador')])
      assert.equal(Number(a!.t), 3000)
    },
  },
  {
    fase: 'libro', nombre: 'MALO 6 · editar un presupuesto o un costo de un periodo cerrado', tipo: 'conducta',
    async corre(c) {
      await cierraSeptiembre(c)
      await rechaza(registraCosto(e(c), persona('mariana'), { categoria: nodo('pipeline'), periodo: '2026-09', importe: 100, concepto: 'tardío', tipo: 'cfdi', uuid: uid('cfdi:tardio') }), 'está cerrado')
      await rechaza(c.comoPersona('mariana', (s) => s.consulta(`update agora.costo set importe_mxn = 1 where periodo = '2026-09'`)), 'está cerrado')
      await rechaza(c.base.consulta(`insert into agora.presupuesto (org_id, categoria_id, periodo, version, importe_mxn, motivo) values ($1, $2, '2026-09', 1, 1, 'tarde')`, [GOLFO, nodo('pipeline')]), 'está cerrado')
      await rechaza(c.base.consulta(`update agora.compromiso set liberado_mxn = 0 where periodo = '2026-09'`), 'está cerrado')
    },
  },
  {
    fase: 'libro', nombre: 'MALO 7 · un tipo de cambio sin fuente (o sin URL, o publicado antes de su fecha)', tipo: 'conducta',
    async corre(c) {
      await rechaza(c.base.consulta(`insert into agora.tipo_cambio (fecha, valor_mxn, fuente, fuente_url, publicado) values ('2026-10-29', 19.1, '', 'https://x.example', '2026-10-29')`), /check|invalido/)
      await rechaza(c.base.consulta(`insert into agora.tipo_cambio (fecha, valor_mxn, fuente_url, publicado) values ('2026-10-29', 19.1, 'https://x.example', '2026-10-29')`), /null|invalido/)
      await rechaza(c.base.consulta(`insert into agora.tipo_cambio (fecha, valor_mxn, fuente, fuente_url, publicado) values ('2026-10-29', 19.1, 'Banxico', 'http://x.example', '2026-10-29')`), /check|invalido/)
      await rechaza(c.base.consulta(`insert into agora.tipo_cambio (fecha, valor_mxn, fuente, fuente_url, publicado) values ('2026-10-29', 19.1, 'Banxico', 'https://x.example', '2026-10-28')`), /check|invalido/)
    },
  },
  {
    fase: 'libro', nombre: 'MALO 8 · una póliza descuadrada no existe, y quien aprobó el gasto no la acepta', tipo: 'conducta',
    async corre(c) {
      const r = await cierraSeptiembre(c)
      assert.ok(r.poliza, 'el cierre no dejó póliza')
      await rechaza(c.base.transaccion(async (s) => {
        await s.consulta(`insert into agora.poliza (id, org_id, periodo, tipo, folio, concepto) values ('11111111-1111-4111-8111-111111111111', $1, '2026-09', 'diario', 'POL-MALA', 'descuadrada')`, [GOLFO])
        await s.consulta(`insert into agora.poliza_movimiento (poliza_id, org_id, orden, cuenta, naturaleza, importe, documento, concepto) values ('11111111-1111-4111-8111-111111111111', $1, 1, '603-082', 'cargo', 100, 'x', 'x'), ('11111111-1111-4111-8111-111111111111', $1, 2, '201-001', 'abono', 99, 'x', 'x')`, [GOLFO])
      }), /descuadrada|descuadre/)
      const [h] = await c.base.consulta<{ h: string }>('select sha256 h from agora.poliza where id = $1', [r.poliza])
      // Mariana aprobó compromisos de septiembre y cerró el periodo: no acepta su póliza.
      await rechaza(c.comoPersona('mariana', (s) => s.consulta(`insert into agora.poliza_decision (org_id, poliza_id, decision, sha256, decidida_por) values ($1, $2, 'acepta', $3, $4)`, [GOLFO, r.poliza, h!.h, persona('mariana')])), /segregación|Contabilidad/)
      await rechaza(c.comoPersona('daniel', (s) => s.consulta(`insert into agora.poliza_decision (org_id, poliza_id, decision, sha256, decidida_por) values ($1, $2, 'acepta', $3, $4)`, [GOLFO, r.poliza, h!.h, persona('daniel')])), /Contabilidad|segregación/)
      await c.comoPersona('sofia', (s) => s.consulta(`insert into agora.poliza_decision (org_id, poliza_id, decision, sha256, decidida_por) values ($1, $2, 'acepta', $3, $4)`, [GOLFO, r.poliza, h!.h, persona('sofia')]))
      const [p] = await c.base.consulta<{ estado: string }>('select estado from agora.poliza where id = $1', [r.poliza])
      assert.equal(p!.estado, 'aceptada')
    },
  },
  {
    fase: 'libro', nombre: 'el supervisor financiero frena un monto que no cabe en el presupuesto del mes (antes del hilo)', tipo: 'conducta',
    async corre(c) {
      const v = await c.comoAgente('coordinador', (s) => supervisa(s, { version: 1, clase: 'cambiar_monto', categoria: nodo('campanas'), cambios: [{ item: item('it-5'), campo: 'monto_mxn', antes: 120000, despues: 160000 }] }, { autor: { tipo: 'agente', origen: 'interno', autonomia: 'A2' } }))
      assert.equal(v.ok, false)
      assert.match(v.motivo ?? '', /primero se amplía el presupuesto/)
    },
  },
]

export const SABOTAJES_LIBRO: Sabotaje[] = [
  { fase: 'libro', nombre: 'F1 · sin unicidad de la evidencia (el mismo costo dos veces)', sql: 'drop index agora.ux_costo_uuid; drop index agora.ux_costo_sha;', caza: /MALO 1/ },
  { fase: 'libro', nombre: 'F2 · ejercido sin evidencia', sql: 'alter table agora.costo drop constraint ejercido_con_evidencia;', caza: /MALO 2/ },
  { fase: 'libro', nombre: 'F3 · compromiso sin aprobación', sql: 'alter table agora.compromiso disable trigger tg_compromiso_con_aprobacion;', caza: /MALO 3/ },
  { fase: 'libro', nombre: 'F4 · cualquiera aprueba sobre el umbral', sql: `delete from agora.matriz_regla where clase = 'cambiar_monto'; insert into agora.matriz_regla (org_id, clase, condicion, firmas) select id, 'cambiar_monto', 'monto_sobre_umbral', '[["propietario","aprobador","finanzas"]]' from agora.org;`, caza: /MALO 4/ },
  { fase: 'libro', nombre: 'F5 · subir el tope con una sola firma (sin Finanzas)', sql: `update agora.matriz_regla set firmas = '[["propietario"]]' where clase = 'tope_gasto';`, caza: /MALO 5/ },
  { fase: 'libro', nombre: 'F6 · el periodo cerrado se puede editar', sql: `create or replace function agora_priv.periodo_cerrado(o uuid, p text) returns boolean language sql stable as $$ select false $$;`, caza: /MALO 6/ },
  { fase: 'libro', nombre: 'F7 · tipo de cambio sin fuente', sql: `alter table agora.tipo_cambio alter column fuente drop not null; alter table agora.tipo_cambio drop constraint tipo_cambio_fuente_check; alter table agora.tipo_cambio drop constraint tipo_cambio_fuente_url_check;`, caza: /MALO 7/ },
  { fase: 'libro', nombre: 'F8a · la póliza descuadrada existe', sql: `drop trigger tg_partida_doble_mov on agora.poliza_movimiento; drop trigger tg_partida_doble_pol on agora.poliza;`, caza: /MALO 8/ },
  { fase: 'libro', nombre: 'F8b · quien aprobó el gasto acepta su póliza', sql: `update agora.org_config set segregacion = false; insert into agora.membresia (org_id, persona_id, rol) select org_id, id, 'contabilidad' from agora.persona where nombre = 'Mariana Treviño';`, caza: /MALO 8/ },
  { fase: 'libro', nombre: 'F9 · null se vuelve cero', sql: `create or replace function agora_priv.gasto_coherente() returns trigger language plpgsql set search_path = '' as $$ begin new.periodo := agora_priv.periodo_de_registro(new.org_id, new.cuando); new.costo_mxn := coalesce(round(new.costo_usd * 19, 2), 0); return new; end $$;`, caza: /null no es cero|tipo de cambio con fuente/ },
  { fase: 'libro', nombre: 'F10 · el gasto de modelo en MXN ya no es el uso por su tipo de cambio', sql: `update agora.gasto_modelo set costo_mxn = costo_mxn + 1 where costo_mxn is not null;`, caza: /cuadre/ },
  { fase: 'libro', nombre: 'F11 · sin alerta de desviación', sql: `drop trigger tg_desviacion_costo on agora.costo;`, caza: /desviación sobre el umbral/ },
]
