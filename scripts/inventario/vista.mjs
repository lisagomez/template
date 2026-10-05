#!/usr/bin/env node
/**
 * Vista legible del inventario (spec 014, RF-15): `inventario/INVENTARIO.md`.
 * Solo identidad y cobertura, derivadas del indice y del arbol: nada de costo ni de
 * clasificacion (el repo es publico). Lo que falta medir sale en el reporte del export,
 * fuera de git. El gate compara este archivo con lo que se generaria y falla si difiere.
 *
 * Uso: node scripts/inventario/vista.mjs          (regenera el archivo)
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RUTA_VISTA = 'inventario/INVENTARIO.md';

const fila = (celdas) => `| ${celdas.join(' | ')} |`;

/** Markdown de la vista. Determinista: mismo indice y mismas unidades, mismo texto. */
export function renderVista(indice, porActivo) {
  const activos = [...(indice.activos ?? [])].sort((a, b) => a.clase.localeCompare(b.clase)
    || a.id.localeCompare(b.id));
  const total = [...porActivo.values()].reduce((n, u) => n + u.length, 0);
  const lineas = [
    '# Inventario de activos del template',
    '',
    '> Generado por `npm run inventario:vista` desde `inventario/activos.json`. No se edita a mano:',
    '> el gate `npm run verifica:inventario` falla si esta vista no coincide con el indice.',
    '> Costo y clasificacion (D+I, defensibilidad) no viven aqui: se calculan con',
    '> `npm run inventario:exporta` y viajan al ERP (spec 014, repo publico).',
    '',
    `**${activos.length} activos** cubren **${total} unidades** del repo.`,
    '',
    fila(['ID', 'Activo', 'Clase', 'Tipo', 'Estado', 'Unidades', 'Ubicacion']),
    fila(['---', '---', '---', '---', '---', '---:', '---']),
  ];
  for (const a of activos) {
    const n = porActivo.get(a.id)?.length ?? 0;
    const nombre = a.externo ? `${a.nombre} (externo: lo cataloga su fuente)` : a.nombre;
    lineas.push(fila([a.id, nombre, a.clase, a.tipo, a.estado, String(n), `\`${a.ubicacion}\``]));
  }
  const conProducto = activos.filter((a) => a.producto).sort((a, b) => a.producto.localeCompare(b.producto) || a.id.localeCompare(b.id));
  if (conProducto.length) {
    lineas.push('', '## Por producto', '', 'El dueño de cada pieza (`producto`), con su estado y, si es un CLI, su grado. Lo que un producto compone sin ser su dueño está en su manifiesto (`productos/`).', '');
    lineas.push(fila(['Producto', 'ID', 'Activo', 'Estado', 'Grado']), fila(['---', '---', '---', '---', '---']));
    for (const a of conProducto) lineas.push(fila([a.producto, a.id, a.nombre, a.estado, a.grado ?? '—']));
  }
  lineas.push('', '## Fuentes que se escanean', '');
  for (const f of indice.fuentes ?? []) lineas.push(`- \`${f.patron}\``);
  lineas.push('', 'Una unidad que ninguna fila cubre pone el gate en rojo: el asiento nace con la pieza.', '');
  return lineas.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { cargaRepo } = await import('./repo.mjs');
  const { indice, porActivo, raiz } = cargaRepo();
  writeFileSync(join(raiz, RUTA_VISTA), renderVista(indice, porActivo));
  console.log(`Vista escrita: ${RUTA_VISTA}`);
}
