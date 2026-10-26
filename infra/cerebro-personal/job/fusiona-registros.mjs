#!/usr/bin/env node
/**
 * Driver de merge «registros» de git para `.claude/plan/calendario.json` y `.claude/plan/habitos.json`.
 *
 * git lo llama así (merge.registros.driver):   fusiona-registros.mjs %O %A %B %P
 *   %O la versión base · %A la de este lado (aquí se escribe el resultado) · %B la del otro lado · %P la ruta
 *
 * La unidad es el REGISTRO, no la línea: un evento o una tarea por su `id`, un hábito por su `clave`, una marca de
 * hábito por fecha y clave, una reflexión por fecha (esquema en `lista-permitida.json › registros`).
 *   - Registros distintos cambiados en cada lado: se unen.
 *   - El mismo registro cambiado igual en los dos lados: uno solo.
 *   - El mismo registro cambiado DISTINTO en los dos lados (o borrado en uno y cambiado en el otro): CHOQUE.
 * Ante un choque nunca elige un lado: sale con 1 sin escribir nada y nombra los registros en stderr
 * (`CHOQUE-REGISTRO <ruta> <registro>`). Un archivo que no es JSON, o una colección sin id único, también es choque.
 * El orden del arreglo sigue al de este lado; los registros nuevos del otro lado van al final, en su orden.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { LISTA } from './politica.mjs';

const AUSENTE = Symbol('ausente');
const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** Forma canónica (claves ordenadas) para comparar registros sin que importe el orden de sus campos. */
const canon = (x) => {
  if (Array.isArray(x)) return x.map(canon);
  if (esObjeto(x)) return Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])]));
  return x;
};
const igual = (a, b) => (a === AUSENTE || b === AUSENTE ? a === b : JSON.stringify(canon(a)) === JSON.stringify(canon(b)));

/** Une tres objetos con un esquema de registros. Devuelve { resultado, choques }. Puro (lo prueba el .test). */
export function fusiona(base, nuestra, otra, esquema) {
  const choques = [];
  const registro = (b, o, t, nombre) => {
    if (igual(o, t)) return o;
    if (igual(b, o)) return t;
    if (igual(b, t)) return o;
    choques.push(nombre);
    return o;
  };
  const de = (obj, k) => (esObjeto(obj) && Object.hasOwn(obj, k) ? obj[k] : AUSENTE);

  const coleccion = (b, o, t, campo, nombre) => {
    const presentes = [b, o, t].filter((x) => x !== AUSENTE);
    if (!presentes.every(Array.isArray)) return registro(b, o, t, nombre);
    const indice = (arr) => {
      if (arr === AUSENTE) return new Map();
      const m = new Map();
      for (const item of arr) {
        const id = esObjeto(item) ? item[campo] : undefined;
        if ((typeof id !== 'string' && typeof id !== 'number') || m.has(id)) return null;
        m.set(id, item);
      }
      return m;
    };
    const [mb, mo, mt] = [indice(b), indice(o), indice(t)];
    if (!mb || !mo || !mt) {
      if (igual(o, t) || igual(b, o) || igual(b, t)) return registro(b, o, t, nombre);
      choques.push(`${nombre} (sin «${campo}» único: no se puede unir por registro)`);
      return o;
    }
    const orden = [...mo.keys(), ...[...mt.keys()].filter((id) => !mo.has(id))];
    const fuera = [];
    for (const id of orden) {
      const r = registro(mb.get(id) ?? AUSENTE, mo.get(id) ?? AUSENTE, mt.get(id) ?? AUSENTE, `${nombre}[${id}]`);
      if (r !== AUSENTE) fuera.push(r);
    }
    // Lo borrado en los dos lados no está en `orden`: no vuelve.
    return o === AUSENTE && t === AUSENTE ? AUSENTE : fuera;
  };

  const mapa = (b, o, t, profundidad, nombre) => {
    if (igual(o, t)) return o;
    if (igual(b, o)) return t;
    if (igual(b, t)) return o;
    const presentes = [b, o, t].filter((x) => x !== AUSENTE);
    if (!presentes.every(esObjeto)) return registro(b, o, t, nombre);
    const vacio = (x) => (x === AUSENTE ? {} : x);
    const [vb, vo, vt] = [vacio(b), vacio(o), vacio(t)];
    const claves = [...Object.keys(vo), ...Object.keys(vt).filter((k) => !Object.hasOwn(vo, k)), ...Object.keys(vb).filter((k) => !Object.hasOwn(vo, k) && !Object.hasOwn(vt, k))];
    const fuera = {};
    for (const k of claves) {
      const r = profundidad > 1
        ? mapa(de(vb, k), de(vo, k), de(vt, k), profundidad - 1, `${nombre}.${k}`)
        : registro(de(vb, k), de(vo, k), de(vt, k), `${nombre}.${k}`);
      if (r !== AUSENTE) fuera[k] = r;
    }
    return fuera;
  };

  if (!esObjeto(nuestra) || !esObjeto(otra) || (base !== null && !esObjeto(base))) {
    return { resultado: null, choques: ['el archivo no es un objeto JSON'] };
  }
  const b = base ?? {};
  const claves = [...Object.keys(nuestra), ...Object.keys(otra).filter((k) => !Object.hasOwn(nuestra, k)), ...Object.keys(b).filter((k) => !Object.hasOwn(nuestra, k) && !Object.hasOwn(otra, k))];
  const resultado = {};
  for (const k of claves) {
    const [vb, vo, vt] = [de(b, k), de(nuestra, k), de(otra, k)];
    let r;
    if (esquema.colecciones?.[k]) r = coleccion(vb, vo, vt, esquema.colecciones[k], k);
    else if (esquema.mapas?.[k]) r = mapa(vb, vo, vt, esquema.mapas[k], k);
    else r = registro(vb, vo, vt, k);
    if (r !== AUSENTE) resultado[k] = r;
  }
  return { resultado, choques };
}

function principal() {
  const [rutaBase, rutaNuestra, rutaOtra, ruta] = process.argv.slice(2);
  const choque = (motivos) => {
    for (const m of motivos) process.stderr.write(`CHOQUE-REGISTRO ${ruta} ${m}\n`);
    process.exit(1);
  };
  const esquema = LISTA.registros[ruta];
  if (!esquema) choque(['sin esquema de registros para esta ruta']);
  let base, nuestra, otra;
  try {
    const texto = (p) => readFileSync(p, 'utf8');
    base = texto(rutaBase).trim() ? JSON.parse(texto(rutaBase)) : null; // sin base (alta en los dos lados): vacío
    nuestra = JSON.parse(texto(rutaNuestra));
    otra = JSON.parse(texto(rutaOtra));
  } catch (e) {
    choque([`no es JSON legible (${e.message})`]);
  }
  const { resultado, choques } = fusiona(base, nuestra, otra, esquema);
  if (choques.length) choque(choques);
  writeFileSync(rutaNuestra, `${JSON.stringify(resultado, null, 2)}\n`);
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) principal();
