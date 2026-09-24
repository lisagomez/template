#!/usr/bin/env node
/**
 * Export del inventario al ERP (spec 014, RF-13; SDD §2.8, §2.10). Escribe en
 * `inventario/salida/` (ignorado por git), nunca en el ERP:
 *   - activos.jsonl  formato de `businessos/activos/activos.jsonl` (lo lee el humano)
 *   - erp-act.sql    filas para erp.act_activo / act_version / act_costo (lo aplica el
 *                    cosechador o el laboratorio, con psql -v cliente_id=<uuid de la casa>)
 *   - costeo.md      reporte: costo por componente con fuente, y lo que falta medir
 *   - detector.json  lo que lee swm-act y la referencia para CAMBIADO en la proxima corrida
 *
 * Un inventario divergente no se exporta: el gate va primero.
 * Uso:  node scripts/inventario/exporta.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cargaRepo } from './repo.mjs';
import { detecta, paraErp, RUTA_ULTIMO } from './detecta.mjs';
import { construccion, leeCommits, leeTrayectorias, costeaActivo, clasificacionPropuesta } from './costeo.mjs';
import { sqlDeActivos } from './sql.mjs';

export const DIR_SALIDA = 'inventario/salida';

/** Linea del ledger con la forma exacta de `activos/activos.jsonl` del catalogo. */
export function lineaLedger(a, costo, clasificacion, fecha) {
  const c = costo.construccion;
  return {
    id: a.id,
    nombre: a.nombre,
    clase: a.clase,
    estado: a.estado,
    clasificacion_erp: clasificacion,
    ubicacion: `template/${a.ubicacion}`,
    servicios: [],
    costo_construccion: { usd: c.usd, fuente: c.fuente, ...(c.tokens ? { tokens: c.tokens } : {}),
      cobertura: c.cobertura },
    costo_operacion_mensual: { usd: costo.operacion.usd_mes, fuente: costo.operacion.fuente },
    costo_replica: { usd_est: costo.replica.usd_est, fuente: costo.replica.fuente },
    valor_reposicion: { usd_est: costo.reposicion.usd_est, fuente: costo.reposicion.fuente },
    hash: a.hash,
    fecha_alta: fecha,
  };
}

const usd = (v) => (v === null || v === undefined ? '—' : `$${v.toFixed(2)}`);

function reporte(filas, fecha) {
  const faltan = filas.filter((f) => f.costo_construccion.usd === null);
  const lineas = [
    `# Costeo del inventario — ${fecha}`, '',
    '> Fuera de git (repo publico). `—` = no medido: la razon esta en la columna Fuente.', '',
    '| Activo | Construccion | Operacion/mes | Replica | Reposicion | D+I prop. | Fuente de construccion |',
    '|---|---:|---:|---:|---:|---|---|',
    ...filas.map((f) => `| ${f.id} | ${usd(f.costo_construccion.usd)} | ${usd(f.costo_operacion_mensual.usd)} `
      + `| ${usd(f.costo_replica.usd_est)} | ${usd(f.valor_reposicion.usd_est)} | ${f.clasificacion_erp.di} `
      + `| ${f.costo_construccion.fuente} |`),
    '', `## Lo que falta medir (${faltan.length} de ${filas.length} sin construccion en USD)`, '',
    ...faltan.map((f) => `- ${f.id}: ${f.costo_construccion.fuente}`),
    '- Replica y reposicion: `no_estimado` en todos (no hay dogfood medido).',
    '- Horas humanas: se declaran en el ERP con `cosechar-activos.py ajustar`.', '',
  ];
  return lineas.join('\n');
}

export function exporta(repo, fecha = new Date().toISOString().slice(0, 10)) {
  const estado = detecta(repo);
  if (estado.hallazgos.length + estado.errores.length > 0) {
    return { ok: false, motivo: 'inventario divergente: corre `npm run verifica:inventario` primero' };
  }
  const datos = {
    construccion: construccion(repo.porActivo, leeCommits(repo.raiz), leeTrayectorias(repo.raiz, 'fabrica')),
    aplicacion: leeTrayectorias(repo.raiz, 'aplicacion'),
    herramientas: leeTrayectorias(repo.raiz, 'herramientas'),
  };
  const propios = estado.activos.filter((a) => !a.externo);
  const filas = propios.map((a) => lineaLedger(a, costeaActivo(a, datos), clasificacionPropuesta(a), fecha));
  const dir = join(repo.raiz, DIR_SALIDA);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'activos.jsonl'), filas.map((f) => JSON.stringify(f)).join('\n') + '\n');
  writeFileSync(join(dir, 'erp-act.sql'), sqlDeActivos(propios, filas, fecha));
  writeFileSync(join(dir, 'costeo.md'), reporte(filas, fecha));
  writeFileSync(join(repo.raiz, RUTA_ULTIMO), JSON.stringify(paraErp(estado), null, 1));
  return { ok: true, filas, externos: estado.activos.length - propios.length };
}

if (process.argv[1] && process.argv[1].endsWith('exporta.mjs')) {
  const r = exporta(cargaRepo());
  if (!r.ok) {
    console.error(`\x1b[31m${r.motivo}\x1b[0m`);
    process.exit(1);
  }
  const medidos = r.filas.filter((f) => f.costo_construccion.usd !== null).length;
  console.log(`Exportados ${r.filas.length} activos a ${DIR_SALIDA}/ (${r.externos} externo(s) no exportados: los cataloga su fuente).`);
  console.log(`Construccion en USD medida en ${medidos}; el resto va como no_medido con su razon.`);
  console.log('Archivos: activos.jsonl · erp-act.sql · costeo.md · detector.json (fuera de git).');
}
