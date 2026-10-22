/**
 * Lo que sapstack es de verdad, contado sobre la copia fijada, y las afirmaciones de la transcripción del laboratorio
 * contra su código. Solo lee archivos: nunca corre un guion de sapstack ni instala nada (es de un tercero).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import yaml from 'js-yaml'

const lee = (clon, ruta) => readFileSync(join(clon, ruta), 'utf8')
const lineas = (clon, ruta) => lee(clon, ruta).split('\n')

/** Todos los archivos del repo, sin `.git`, ordenados. */
export function archivos(clon) {
  const fuera = []
  const recorre = (dir) => {
    for (const n of readdirSync(dir).sort()) {
      if (n === '.git') continue
      const p = join(dir, n)
      if (statSync(p).isDirectory()) recorre(p)
      else fuera.push(relative(clon, p))
    }
  }
  recorre(clon)
  return fuera
}

/** La primera línea (1-based) de `ruta` que casa con `patron`, o null. */
export function linea(clon, ruta, patron) {
  if (!existsSync(join(clon, ruta))) return null
  const i = lineas(clon, ruta).findIndex((l) => patron.test(l))
  return i < 0 ? null : i + 1
}

/** Busca un patrón en todo el repo: `archivo:línea` de cada coincidencia. */
export function buscaEnRepo(clon, patron, filtro = () => true) {
  const hallados = []
  for (const a of archivos(clon).filter(filtro)) {
    const ls = lee(clon, a).split('\n')
    ls.forEach((l, i) => { if (patron.test(l)) hallados.push(`${a}:${i + 1}`) })
  }
  return hallados
}

/** El commit de la copia: se lee del `.git`, sin correr nada del repo. */
export function commitDe(clon) {
  return execFileSync('git', ['-C', clon, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

/** Las claves de primer nivel de `data/tcodes.yaml`, con su línea, y las repetidas. */
export function clavesDeTcodes(clon) {
  const ls = lineas(clon, 'data/tcodes.yaml')
  const claves = []
  ls.forEach((l, i) => { const m = /^"?([A-Za-z0-9_/.-]+)"?:\s*$/.exec(l); if (m) claves.push({ codigo: m[1], linea: i + 1 }) })
  const vistas = new Map()
  for (const c of claves) vistas.set(c.codigo, [...(vistas.get(c.codigo) ?? []), c.linea])
  const repetidas = [...vistas].filter(([, ls2]) => ls2.length > 1).map(([codigo, en]) => ({ codigo, lineas: en }))
  return { claves, unicas: vistas.size, repetidas }
}

/** `data/tcodes.yaml` leído como YAML (la última clave repetida gana, como en cualquier lector tolerante). */
export function tcodes(clon) {
  return yaml.load(lee(clon, 'data/tcodes.yaml'), { json: true }) ?? {}
}

export function notas(clon) {
  return (yaml.load(lee(clon, 'data/sap-notes.yaml')) ?? {}).notes ?? []
}

const cuenta = (xs) => Object.fromEntries([...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())].sort(([a], [b]) => (a < b ? -1 : 1)))

/** El inventario contado: cada cifra sale de los archivos, no del README. */
export function inventario(clon) {
  const todos = archivos(clon)
  const t = tcodes(clon)
  const ns = notas(clon)
  const k = clavesDeTcodes(clon)
  return {
    archivos: todos.length,
    modulos: readdirSync(join(clon, 'plugins')).sort(),
    skills: todos.filter((a) => /^plugins\/[^/]+\/skills\/[^/]+\/SKILL\.md$/.test(a)).length,
    agentes: todos.filter((a) => /^agents\/.+\.md$/.test(a)).length,
    comandos: todos.filter((a) => /^commands\/.+\.md$/.test(a)).length,
    escenarios: todos.filter((a) => /^docs\/scenarios\/.+\.md$/.test(a)).length,
    guiones: todos.filter((a) => /^scripts\/.+\.sh$/.test(a)).length,
    flujosCi: todos.filter((a) => /^\.github\/workflows\//.test(a)).length,
    tcodes: { lineasDeClave: k.claves.length, unicos: k.unicas, repetidas: k.repetidas, leidos: Object.keys(t).length },
    tcodesPorModulo: cuenta(Object.values(t).flatMap((v) => v?.modules ?? [])),
    tcodesPorRelease: cuenta(Object.values(t).map((v) => v?.release ?? '(sin release)')),
    notas: ns.length,
    notasPorCategoria: cuenta(ns.map((n) => n.category ?? '(sin categoría)')),
    readmeDice: { tcodes: linea(clon, 'README.md', /279/), notas: linea(clon, 'README.md', /50\+/) },
    licencia: lineas(clon, 'LICENSE').find((l) => /^Copyright/i.test(l)) ?? '(sin línea de copyright)',
    origen: linea(clon, 'README.md', /BoxLogoDev\/sapstack/),
  }
}
