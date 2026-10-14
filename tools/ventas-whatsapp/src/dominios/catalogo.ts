/**
 * Dominio `catalogo`: el ÚNICO que escribe productos y existencias. Los demás le preguntan por A2A.
 * El precio y las existencias que el agente dice salen de aquí, nunca del texto del modelo.
 *
 * Sincronización: desde la hoja o el CSV de la pyme (`retailer_id,nombre,descripcion,precio,
 * existencias,categoria`). En producción el mismo diff alimentaría Commerce Manager; aquí el
 * catálogo de Meta es el del simulador.
 */
import { pliega } from '../comun/base.js';
import { tarea, type AgenteDominio } from '../agente/a2a-modelo.js';

export interface Producto {
  retailerId: string;
  nombre: string;
  descripcion: string;
  precioCentavos: number;
  existencias: number;
  categoria: string;
  activo: boolean;
  /** Palabras extra para encontrarlo (plegadas). */
  sinonimos: string[];
}

export interface ResultadoSync {
  altas: string[];
  cambios: Array<{ retailerId: string; campo: string; antes: unknown; despues: unknown }>;
  bajas: string[];
  errores: Array<{ fila: number; error: string }>;
}

/** Parte una línea CSV respetando comillas. */
function celdas(linea: string): string[] {
  const salida: string[] = [];
  let actual = '';
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') { if (comillas && linea[i + 1] === '"') { actual += '"'; i++; } else comillas = !comillas; }
    else if (c === ',' && !comillas) { salida.push(actual.trim()); actual = ''; }
    else actual += c;
  }
  salida.push(actual.trim());
  return salida;
}

/** CSV de la pyme → productos, con errores por fila (nada se adivina). */
export function leeCsvCatalogo(csv: string): { productos: Producto[]; errores: Array<{ fila: number; error: string }> } {
  const lineas = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const cabeza = celdas(lineas[0] ?? '').map((c) => pliega(c));
  const col = (n: string) => cabeza.indexOf(n);
  const productos: Producto[] = [];
  const errores: Array<{ fila: number; error: string }> = [];
  for (const [n, requerida] of [['retailer_id', true], ['nombre', true], ['precio', true], ['existencias', true]] as const) {
    if (requerida && col(n) === -1) return { productos, errores: [{ fila: 1, error: `falta la columna ${n}` }] };
  }
  lineas.slice(1).forEach((linea, i) => {
    const c = celdas(linea);
    const fila = i + 2;
    const retailerId = c[col('retailer_id')] ?? '';
    const precio = Number((c[col('precio')] ?? '').replace(/[$,\s]/g, ''));
    const existencias = Number(c[col('existencias')] ?? '');
    if (!/^[\w-]{1,64}$/.test(retailerId)) { errores.push({ fila, error: 'retailer_id inválido' }); return; }
    if (!Number.isFinite(precio) || precio <= 0) { errores.push({ fila, error: 'precio inválido' }); return; }
    if (!Number.isInteger(existencias) || existencias < 0) { errores.push({ fila, error: 'existencias inválidas' }); return; }
    const descripcion = col('descripcion') >= 0 ? c[col('descripcion')] ?? '' : '';
    const categoria = col('categoria') >= 0 ? c[col('categoria')] ?? 'general' : 'general';
    const sinonimos = col('sinonimos') >= 0 ? (c[col('sinonimos')] ?? '').split(/[;|]/).map((s) => pliega(s.trim())).filter(Boolean) : [];
    productos.push({ retailerId, nombre: c[col('nombre')] ?? retailerId, descripcion, precioCentavos: Math.round(precio * 100), existencias, categoria, activo: true, sinonimos });
  });
  return { productos, errores };
}

const PALABRAS_VACIAS = new Set(['de', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'con', 'sin', 'por', 'para', 'que', 'me', 'quiero', 'tienen', 'tienes', 'hay', 'dame', 'precio', 'cuanto', 'cuesta', 'algo', 'del', 'al', 'en', 'mi', 'su', 'favor', 'porfa', 'gracias', 'hola', 'pedir', 'ordenar', 'comprar', 'busco', 'venden', 'vendes', 'cuestan', 'mas', 'muy']);

/** Puntuación de coincidencia simple y explicable: palabras de la consulta en nombre, sinónimos, categoría y descripción. */
export function puntua(p: Producto, consulta: string): number {
  const palabras = pliega(consulta).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2 && !PALABRAS_VACIAS.has(w));
  if (!palabras.length) return 0;
  const nombre = pliega(p.nombre);
  const resto = `${p.sinonimos.join(' ')} ${pliega(p.categoria)} ${pliega(p.descripcion)}`;
  let s = 0;
  for (const w of palabras) {
    const raiz = w.length > 4 ? w.replace(/(es|s)$/, '') : w;
    if (nombre.includes(raiz)) s += 3;
    else if (resto.includes(raiz)) s += 1;
  }
  return s;
}

const vista = (p: Producto) => ({ retailerId: p.retailerId, nombre: p.nombre, precioCentavos: p.precioCentavos, existencias: p.existencias, categoria: p.categoria, descripcion: p.descripcion });

export const agenteCatalogo: AgenteDominio = {
  nombre: 'catalogo',
  descripcion: 'Busca productos y consulta precio y existencias vigentes. Único dueño del catálogo.',
  skills: [
    { id: 'buscar_producto', nombre: 'Buscar producto', descripcion: 'Productos que coinciden con una consulta, con precio y existencias vigentes' },
    { id: 'consultar_existencias', nombre: 'Consultar existencias', descripcion: 'Precio y existencias de productos por retailer_id' },
    { id: 'listar', nombre: 'Listar catálogo', descripcion: 'Productos activos por categoría' },
    { id: 'sincronizar_csv', nombre: 'Sincronizar CSV', descripcion: 'Actualiza el catálogo desde la hoja de la pyme' },
    { id: 'descontar', nombre: 'Descontar existencias', descripcion: 'Aparta existencias al confirmarse un pago' },
  ],
  async atiende(s, ctx) {
    const ahora = ctx.reloj();
    const todos = (await ctx.datos.lista('productos')).filter((p) => p.activo);
    switch (s.skill) {
      case 'buscar_producto': {
        const consulta = String(s.datos.consulta ?? '');
        const hallados = todos.map((p) => ({ p, s: puntua(p, consulta) })).filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s || a.p.nombre.localeCompare(b.p.nombre)).slice(0, 10).map((x) => vista(x.p));
        return tarea(s, 'catalogo', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'productos', datos: { consulta, productos: hallados } }]);
      }
      case 'consultar_existencias': {
        const idsPedidos = Array.isArray(s.datos.retailerIds) ? s.datos.retailerIds.map(String) : [];
        const productos = idsPedidos.map((id) => todos.find((p) => p.retailerId === id)).filter((p): p is Producto => !!p).map(vista);
        const faltan = idsPedidos.filter((id) => !productos.some((p) => p.retailerId === id));
        return tarea(s, 'catalogo', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'productos', datos: { productos, faltan } }]);
      }
      case 'listar': {
        const categoria = s.datos.categoria ? pliega(String(s.datos.categoria)) : null;
        const productos = todos.filter((p) => !categoria || pliega(p.categoria) === categoria).map(vista);
        return tarea(s, 'catalogo', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'productos', datos: { productos } }]);
      }
      case 'sincronizar_csv': {
        const { productos, errores } = leeCsvCatalogo(String(s.datos.csv ?? ''));
        const actuales = await ctx.datos.lista('productos');
        const r: ResultadoSync = { altas: [], cambios: [], bajas: [], errores };
        // Atómico: una hoja con errores no se aplica a medias. Se corrige y se vuelve a subir.
        if (errores.length) return tarea(s, 'catalogo', 'TASK_STATE_FAILED', ahora, ctx.ids, [{ nombre: 'sincronizacion', datos: { ...r } }], `${errores.length} filas con error: no se aplicó nada`);
        for (const p of productos) {
          const previo = actuales.find((a) => a.retailerId === p.retailerId);
          if (!previo) r.altas.push(p.retailerId);
          else for (const campo of ['nombre', 'precioCentavos', 'existencias', 'descripcion', 'categoria'] as const) {
            if (previo[campo] !== p[campo]) r.cambios.push({ retailerId: p.retailerId, campo, antes: previo[campo], despues: p[campo] });
          }
          await ctx.datos.guarda('productos', p.retailerId, p);
        }
        for (const a of actuales) if (a.activo && !productos.some((p) => p.retailerId === a.retailerId)) {
          r.bajas.push(a.retailerId);
          await ctx.datos.guarda('productos', a.retailerId, { ...a, activo: false });
        }
        return tarea(s, 'catalogo', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'sincronizacion', datos: { ...r } }]);
      }
      case 'descontar': {
        const items = Array.isArray(s.datos.items) ? s.datos.items as Array<{ retailerId: string; cantidad: number }> : [];
        for (const it of items) {
          const p = await ctx.datos.lee('productos', it.retailerId);
          if (p) await ctx.datos.guarda('productos', p.retailerId, { ...p, existencias: Math.max(0, p.existencias - it.cantidad) });
        }
        return tarea(s, 'catalogo', 'TASK_STATE_COMPLETED', ahora, ctx.ids, [{ nombre: 'descontado', datos: { items } }]);
      }
      default:
        return tarea(s, 'catalogo', 'TASK_STATE_REJECTED', ahora, ctx.ids, [], `skill desconocida: ${s.skill}`);
    }
  },
};
