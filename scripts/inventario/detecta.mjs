#!/usr/bin/env node
/**
 * Detector y gate del inventario de activos (spec 014). Solo lectura: PROPONE, no cataloga.
 *
 * Rojo (exit 1) si:
 *   - una unidad del repo no la cubre ningun activo (NUEVO) o la cubren dos (AMBIGUO)
 *   - un activo no cubre nada o su ubicacion no existe (HUERFANO)
 *   - el indice trae costo o clasificacion estrategica (el repo es publico)
 *   - un asiento esta mal formado, o la vista `INVENTARIO.md` no coincide con el indice
 * Informativo: CAMBIADO contra el ultimo export de esta maquina (`inventario/salida/`).
 *
 * Uso:  node scripts/inventario/detecta.mjs [--json]
 *   --json  salida para el detector swm-act del ERP (ubicaciones con prefijo `template/`).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { cargaRepo, RUTA_INDICE } from './repo.mjs';
import { camposProhibidos, validaAsientos, hashDeActivo } from './nucleo.mjs';
import { renderVista, RUTA_VISTA } from './vista.mjs';

export const RUTA_ULTIMO = 'inventario/salida/detector.json';
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;

/** Estado completo del inventario: activos con hash y todos los hallazgos. */
export function detecta(repo) {
  const { raiz, indice, porActivo, rastreados, leeBytes, existe } = repo;
  const errores = [
    ...camposProhibidos(indice).map((c) => `campo prohibido en ${RUTA_INDICE}: ${c} `
      + '(costo y clasificacion viajan al ERP, no a un repo publico)'),
    ...validaAsientos(indice, existe),
  ];
  const vista = join(raiz, RUTA_VISTA);
  if (!existsSync(vista) || readFileSync(vista, 'utf8') !== renderVista(indice, porActivo)) {
    errores.push(`${RUTA_VISTA} no coincide con el indice: corre \`npm run inventario:vista\``);
  }
  const previo = leeUltimo(raiz);
  const activos = (indice.activos ?? []).map((a) => {
    const unidades = porActivo.get(a.id) ?? [];
    const hash = hashDeActivo(unidades, rastreados ?? repo.archivos, leeBytes);
    const antes = previo.get(a.id);
    return { ...a, unidades, hash, cambiado: Boolean(antes && hash && antes !== hash) };
  });
  return { activos, hallazgos: repo.hallazgos, errores };
}

function leeUltimo(raiz) {
  const ruta = join(raiz, RUTA_ULTIMO);
  if (!existsSync(ruta)) return new Map();
  try {
    return new Map(JSON.parse(readFileSync(ruta, 'utf8')).activos.map((a) => [a.id, a.hash]));
  } catch {
    return new Map(); // un export roto no tumba el gate: CAMBIADO es informativo
  }
}

/** Forma que consume swm-act: misma ubicacion que usara el catalogo del ERP. */
export function paraErp({ activos, hallazgos, errores }) {
  return {
    fuente: 'template',
    version: 1,
    activos: activos.map((a) => ({
      id: a.id, nombre: a.nombre, tipo: a.tipo, clase: a.clase, estado: a.estado,
      ubicacion: a.externo ? a.ubicacion : `template/${a.ubicacion}`,
      externo: Boolean(a.externo), hash: a.hash, unidades: a.unidades.length,
    })),
    hallazgos,
    errores,
  };
}

function imprime({ activos, hallazgos, errores }, unidades) {
  console.log(gris(`\nInventario de activos — ${activos.length} activos, ${unidades} unidades\n`));
  for (const a of activos) {
    const marca = a.cambiado ? ' CAMBIADO' : '';
    const hash = a.hash ? a.hash.slice(0, 8) : '—'.padEnd(8);
    console.log(`  ${verde('✓')} ${a.id.padEnd(32)} ${String(a.unidades.length).padStart(3)} u  ${hash}  ${a.estado.padEnd(10)}${marca}`);
  }
  console.log('');
  for (const h of hallazgos) {
    const que = h.unidad ? `${h.unidad}${h.activos ? ` (${h.activos.join(', ')})` : ''}` : `${h.activo}: ${h.motivo}`;
    console.log(`  ${rojo('✗')} ${h.tipo.padEnd(8)} ${que}`);
  }
  for (const e of errores) console.log(`  ${rojo('✗')} ${e}`);
  const rotos = hallazgos.length + errores.length;
  if (rotos === 0) {
    console.log(verde(`Inventario al dia: ${unidades} unidades con asiento, 0 NUEVO, 0 HUERFANO, 0 AMBIGUO.`));
    return 0;
  }
  console.log(rojo(`Inventario DIVERGENTE: ${rotos} problema(s). Sin asiento no hay entrega (white-label §5).`));
  console.log(gris('  Alta: una fila en inventario/activos.json y `npm run inventario:vista`.'));
  return 1;
}

if (process.argv[1] && process.argv[1].endsWith('detecta.mjs')) {
  const repo = cargaRepo();
  const estado = detecta(repo);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(paraErp(estado), null, 1));
    process.exit(estado.hallazgos.length + estado.errores.length ? 1 : 0);
  }
  process.exit(imprime(estado, repo.unidades.length));
}
