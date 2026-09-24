#!/usr/bin/env node
/**
 * Valida el export contra el esquema REAL del ERP (spec 014, RF-14). Levanta un Postgres
 * desechable en Docker, aplica las migraciones del ERP en orden, carga `erp-act.sql` con el
 * rol del ejecutor (`rol_exe_fin`, con RLS y grants reales: nada de superusuario ni
 * service_role), lo carga otra vez para probar que es idempotente, y comprueba que lo que
 * quedo en las tablas coincide con el ledger. Al final el contenedor se destruye: no queda
 * nada escrito en ningun sitio.
 *
 * Vive fuera de `validate`: necesita Docker y las migraciones del repo privado del ERP.
 * Uso:  node scripts/inventario/valida-erp.mjs --migraciones <dir con 001..005_*.sql>
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { RAIZ } from './repo.mjs';
import { DIR_SALIDA } from './exporta.mjs';

const IMAGEN = 'postgres:16-alpine';
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };

function psql(nombre, sql, extra = []) {
  const r = spawnSync('docker', ['exec', '-i', nombre, 'psql', '-U', 'postgres', '-qAt',
    '-v', 'ON_ERROR_STOP=1', ...extra], { input: sql, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr.trim().split('\n').slice(0, 4).join(' | '));
  return r.stdout.trim();
}

function levanta() {
  const nombre = `inventario-erp-${process.pid}`;
  execFileSync('docker', ['run', '-d', '--rm', '--name', nombre, '-e', 'POSTGRES_PASSWORD=x', IMAGEN],
    { stdio: 'ignore' });
  for (let i = 0; i < 60; i += 1) {
    if (spawnSync('docker', ['exec', nombre, 'pg_isready', '-U', 'postgres', '-q']).status === 0) {
      // pg_isready responde antes de que termine el arranque inicial del contenedor
      if (spawnSync('docker', ['exec', nombre, 'psql', '-U', 'postgres', '-c', 'select 1']).status === 0) return nombre;
    }
    spawnSync('sleep', ['1']);
  }
  throw new Error('Postgres no arranco en 60 s');
}

function aplicaMigraciones(nombre, dir) {
  const sqls = readdirSync(dir).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
  for (const f of sqls) psql(nombre, readFileSync(join(dir, f), 'utf8'));
  // 005 lo pide en su cabecera: 004 (grants/RLS por bucle) y los REVOKE se re-corren despues
  for (const f of sqls.filter((s) => /^00[45]_/.test(s))) psql(nombre, readFileSync(join(dir, f), 'utf8'));
  return sqls;
}

function cargaComoEjecutor(nombre, sql, cliente) {
  const sesion = `set role rol_exe_fin;\nset app.cliente_id = '${cliente}';\n${sql}`;
  return psql(nombre, sesion, ['-v', `cliente_id=${cliente}`]).split('\n').map(Number)
    .reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
}

function comprueba(nombre, ledger, cliente) {
  const q = (s) => psql(nombre, `set app.cliente_id = '${cliente}';\n${s}`);
  const conUsd = ledger.filter((l) => l.costo_construccion.usd !== null);
  const sinUsd = ledger.filter((l) => l.costo_construccion.usd === null).map((l) => `'${l.id}'`);
  const checks = [
    ['filas en act_activo = activos del ledger', Number(q('select count(*) from erp.act_activo;')), ledger.length],
    ['filas en act_version = activos del ledger', Number(q('select count(*) from erp.act_version;')), ledger.length],
    ['filas en act_costo = activos con USD medido', Number(q('select count(*) from erp.act_costo;')), conUsd.length],
    ['defensibilidad nace propuesta en todas', Number(q("select count(*) from erp.act_activo where defensibilidad_estado = 'propuesta';")), ledger.length],
    ['sin USD medido => sin fila de costo (el 0 es del trigger, no un dato)',
      Number(q(`select count(*) from erp.act_costo c join erp.act_activo a on a.id = c.activo_id where a.ref_catalogo in (${sinUsd.join(',') || "''"});`)), 0],
    ['costo_acumulado (trigger) = suma del ledger, en centavos',
      Math.round(Number(q('select coalesce(sum(costo_acumulado),0) from erp.act_activo;')) * 100),
      Math.round(conUsd.reduce((s, l) => s + l.costo_construccion.usd, 0) * 100)],
    ['folios humanos ACT-NNNN acunados por erp.siguiente_folio',
      Number(q("select count(*) from erp.act_activo where folio ~ '^ACT-[0-9]{4}$';")), ledger.length],
  ];
  let ok = true;
  for (const [etiqueta, real, esperado] of checks) {
    const bien = real === esperado;
    ok &&= bien;
    console.log(`  ${bien ? verde('✓') : rojo('✗')} ${etiqueta}: ${real}${bien ? '' : ` (esperado ${esperado})`}`);
  }
  return ok;
}

function main() {
  const dir = arg('--migraciones') ?? process.env.ERP_MIGRACIONES;
  if (!dir || !existsSync(dir)) {
    console.error(rojo('Falta --migraciones <dir> (las de businessos/erp/migrations del repo del ERP).'));
    process.exit(2);
  }
  const salida = join(RAIZ, DIR_SALIDA);
  const sql = readFileSync(join(salida, 'erp-act.sql'), 'utf8');
  const ledger = readFileSync(join(salida, 'activos.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const cliente = randomUUID(); // tenant de prueba: el UUID de la casa no sale de su .env
  const nombre = levanta();
  try {
    const sqls = aplicaMigraciones(nombre, resolve(dir));
    console.log(`Postgres desechable (${IMAGEN}) con ${sqls.join(', ')}`);
    const primera = cargaComoEjecutor(nombre, sql, cliente);
    const segunda = cargaComoEjecutor(nombre, sql, cliente);
    console.log(`Carga como rol_exe_fin: ${primera} alta(s); segunda carga: ${segunda} (idempotente)`);
    const ok = comprueba(nombre, ledger, cliente) && segunda === 0 && primera === ledger.length;
    console.log(ok ? verde('Export compatible con erp.act_activo / act_version / act_costo (005_activos.sql).')
      : rojo('Export INCOMPATIBLE con el esquema del ERP.'));
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error(rojo(`Postgres rechazo el export: ${e.message}`));
    process.exitCode = 1;
  } finally {
    spawnSync('docker', ['stop', nombre], { stdio: 'ignore' });
  }
}

main();
