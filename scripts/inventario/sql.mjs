/**
 * SQL de alta para el modulo act del ERP, con la misma forma que usa el cosechador
 * (`businessos/cosechar-activos.py`): folio por `erp.siguiente_folio`, version inicial y
 * costo solo si hay monto medido. Idempotente por `ref_catalogo` (unico por cliente).
 *
 * El UUID del tenant NO se escribe aqui: el archivo usa la variable psql `:cliente_id`.
 * Nunca escribe `costo_acumulado` (lo mantiene el trigger desde act_costo) ni ratifica nada.
 */
const lit = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

/** Fila de act_costo solo con monto medido: `monto` es NOT NULL y un 0 inventado mentiria. */
function filaCosto(fila) {
  const c = fila.costo_construccion;
  if (c.usd === null) return '';
  return `,
costo as (
  insert into erp.act_costo (cliente_id, activo_id, componente, monto, eje_dei, tokens_in, tokens_out, fuente)
  select :'cliente_id'::uuid, id, 'tokens', ${c.usd.toFixed(2)}, ${lit(fila.clasificacion_erp.di)},
         ${c.tokens?.in ?? 'null'}, ${c.tokens?.out ?? 'null'}, ${lit(`template: ${c.fuente}`)}
  from alta returning activo_id
)`;
}

function altaDeActivo(activo, fila, fecha) {
  const version = `template@${fecha}`;
  const descripcion = `${activo.nombre}. Fuente: template (inventario/activos.json). `
    + `Eje D+I propuesto por heuristica (${fila.clasificacion_erp.di}); validar con el contador.`;
  return `-- ${activo.id}
with folio as (select erp.siguiente_folio(:'cliente_id'::uuid, 'ACT') as f
               where not exists (select 1 from erp.act_activo
                                  where cliente_id = :'cliente_id'::uuid and ref_catalogo = ${lit(activo.id)})),
alta as (
  insert into erp.act_activo (cliente_id, folio, nombre, tipo, descripcion, ubicacion, hash_vigente,
                              version_vigente, responsable, eje_dei, defensibilidad,
                              defensibilidad_estado, ref_catalogo)
  select :'cliente_id'::uuid, f.f, ${lit(activo.nombre)}, ${lit(activo.tipo)}, ${lit(descripcion)},
         ${lit(`template/${activo.ubicacion}`)}, ${lit(activo.hash)}, ${lit(version)}, ${lit(activo.responsable)},
         ${lit(fila.clasificacion_erp.di)}, ${lit(fila.clasificacion_erp.defensibilidad)}, 'propuesta', ${lit(activo.id)}
  from folio f returning id
),
ver as (
  insert into erp.act_version (cliente_id, activo_id, version, hash, origen)
  select :'cliente_id'::uuid, id, ${lit(version)}, ${lit(activo.hash)}, 'fuente:template'
  from alta returning activo_id
)${filaCosto(fila)}
select count(*) as alta from alta;
`;
}

/** Script completo: una transaccion; si una fila viola un check, no entra ninguna. */
export function sqlDeActivos(activos, filas, fecha) {
  const porId = new Map(filas.map((f) => [f.id, f]));
  return [
    '-- Export del inventario del template al modulo act (spec 014). PROPUESTA: no se aplica',
    '-- sola. Aplicar con: psql "$ERP_DB_URL" -v cliente_id=<uuid casa> -v ON_ERROR_STOP=1 -f erp-act.sql',
    '-- bajo el rol del cosechador (sin service_role). Defensibilidad nace propuesta (D-10).',
    'begin;',
    ...activos.map((a) => altaDeActivo(a, porId.get(a.id), fecha)),
    'commit;',
    '',
  ].join('\n');
}
