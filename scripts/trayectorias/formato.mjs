/**
 * El formato comun de una trayectoria (spec 011, RF-1 a RF-3) y su validador.
 *
 * Una trayectoria es FORMA: conteos, nombres de herramientas y modelos, tokens, tiempos, gates y
 * veredictos. Nunca contenido: ni texto de un mensaje, ni un valor extraido de un documento, ni
 * un nombre de archivo tocado (puede llevar el nombre de un cliente). Es lo que permite versionar
 * el dataset en git sin filtrar a nadie (C4).
 *
 * El validador es de trazo grueso a proposito, como el de casos-trampa: rechaza cualquier cadena
 * larga o con saltos de linea, cualquier cosa con forma de RFC, CURP, correo o secreto, y
 * cualquier identificador de caso del corpus (`T` + 1-2 digitos). Una version matizada exigiria
 * juicio en cada campo, y esa clase de regla ya fallo cuatro veces en este repo.
 *
 * Sin dependencias: se importa desde scripts, desde pruebas y desde `src/`.
 */

export const VERSION = 1
export const LINEAS = ['fabrica', 'aplicacion', 'herramientas']
export const ORIGENES = ['sesion', 'llamada', 'medicion']
export const RESULTADOS_DE_GATE = ['verde', 'rojo', 'desconocido']
export const LARGO_MAXIMO = 80

/** Claves admitidas por nivel. Cualquier otra se rechaza: un campo libre es por donde se cuela el contenido. */
const CLAVES = {
  raiz: ['version', 'id', 'linea', 'origen', 'cuando', 'actor', 'modelos', 'acciones', 'uso', 'costoUsd', 'tiempos', 'gates', 'resultado', 'cobertura', 'avisos'],
  origen: ['tipo', 'referencia', 'subagente'],
  cuando: ['inicio', 'fin'],
  actor: ['skills', 'feature', 'tarea', 'herramienta'],
  acciones: ['herramientas', 'llamadasAlModelo', 'turnos', 'subagentes', 'documentos', 'paginas', 'comandos', 'ediciones'],
  uso: ['entrada', 'salida', 'cacheCreacion', 'cacheLectura'],
  tiempos: ['totalMs', 'porEtapaMs'],
  gate: ['nombre', 'resultado', 'veces'],
  resultado: ['errores', 'revisionHumana', 'campos', 'veredicto', 'evals', 'metricas'],
  cobertura: ['completa', 'faltan'],
}

const FORMAS_PROHIBIDAS = [
  [/\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/, 'RFC'],
  [/\b[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/, 'CURP'],
  [/[^\s@]+@[^\s@]+\.[a-z]{2,}/i, 'correo'],
  [/\b(sk|rk|pk)[-_][A-Za-z0-9_-]{10,}/, 'clave de API'],
  [/\beyJ[A-Za-z0-9_-]{20,}/, 'token JWT'],
  [/\bAKIA[0-9A-Z]{12,}/, 'clave AWS'],
  [/-----BEGIN /, 'clave privada'],
  [/\b[A-Z][A-Z0-9_]{3,}=\S{8,}/, 'variable de entorno con valor'],
  [/\bT\d{1,2}\b/, 'identificador de caso del corpus'],
  [/\/home\/|\/Users\/|[A-Z]:\\/, 'ruta de una maquina'],
]

const esObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const esEnteroNoNegativo = (v) => Number.isInteger(v) && v >= 0
const esFechaIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)) && v.length <= 30

function cadenaLimpia(v, donde, errores) {
  if (typeof v !== 'string') { errores.push(`${donde}: tiene que ser texto`); return }
  if (v.length === 0) errores.push(`${donde}: vacio`)
  if (v.length > LARGO_MAXIMO) errores.push(`${donde}: ${v.length} caracteres, el maximo es ${LARGO_MAXIMO} (una trayectoria es forma, no contenido)`)
  if (/[\n\r]/.test(v)) errores.push(`${donde}: lleva saltos de linea`)
  for (const [forma, nombre] of FORMAS_PROHIBIDAS) if (forma.test(v)) errores.push(`${donde}: contiene algo con forma de ${nombre}`)
}

function clavesAdmitidas(objeto, admitidas, donde, errores) {
  for (const clave of Object.keys(objeto)) if (!admitidas.includes(clave)) errores.push(`${donde}: clave no admitida "${clave}"`)
}

function contadorPorNombre(v, donde, errores) {
  if (!esObjeto(v)) { errores.push(`${donde}: tiene que ser un objeto nombre -> conteo`); return }
  for (const [nombre, n] of Object.entries(v)) {
    cadenaLimpia(nombre, `${donde}.${nombre}`, errores)
    if (!esEnteroNoNegativo(n)) errores.push(`${donde}.${nombre}: el conteo tiene que ser entero >= 0`)
  }
}

function validaUso(uso, errores) {
  if (uso === null) return
  if (!esObjeto(uso)) { errores.push('uso: tiene que ser objeto o null'); return }
  clavesAdmitidas(uso, CLAVES.uso, 'uso', errores)
  for (const clave of ['entrada', 'salida']) if (!esEnteroNoNegativo(uso[clave])) errores.push(`uso.${clave}: entero >= 0 obligatorio`)
  for (const clave of ['cacheCreacion', 'cacheLectura']) if (uso[clave] !== undefined && !esEnteroNoNegativo(uso[clave])) errores.push(`uso.${clave}: entero >= 0`)
}

function validaGates(gates, errores) {
  if (!Array.isArray(gates)) { errores.push('gates: tiene que ser una lista'); return }
  gates.forEach((g, i) => {
    if (!esObjeto(g)) { errores.push(`gates[${i}]: no es objeto`); return }
    clavesAdmitidas(g, CLAVES.gate, `gates[${i}]`, errores)
    cadenaLimpia(g.nombre, `gates[${i}].nombre`, errores)
    if (!RESULTADOS_DE_GATE.includes(g.resultado)) errores.push(`gates[${i}].resultado: ${RESULTADOS_DE_GATE.join('|')}`)
    if (g.veces !== undefined && !esEnteroNoNegativo(g.veces)) errores.push(`gates[${i}].veces: entero >= 0`)
  })
}

function validaResultado(r, errores) {
  if (!esObjeto(r)) { errores.push('resultado: tiene que ser objeto'); return }
  clavesAdmitidas(r, CLAVES.resultado, 'resultado', errores)
  for (const clave of ['errores', 'revisionHumana', 'campos']) if (r[clave] !== undefined && !esEnteroNoNegativo(r[clave])) errores.push(`resultado.${clave}: entero >= 0`)
  if (r.veredicto !== undefined && r.veredicto !== null) cadenaLimpia(r.veredicto, 'resultado.veredicto', errores)
  if (r.evals !== undefined) {
    if (!esObjeto(r.evals)) errores.push('resultado.evals: objeto criterio -> booleano')
    else for (const [k, v] of Object.entries(r.evals)) { cadenaLimpia(k, `resultado.evals.${k}`, errores); if (typeof v !== 'boolean') errores.push(`resultado.evals.${k}: booleano`) }
  }
  if (r.metricas !== undefined) {
    if (!esObjeto(r.metricas)) errores.push('resultado.metricas: objeto nombre -> numero o null')
    else for (const [k, v] of Object.entries(r.metricas)) { cadenaLimpia(k, `resultado.metricas.${k}`, errores); if (v !== null && typeof v !== 'number') errores.push(`resultado.metricas.${k}: numero o null`) }
  }
}

/** Devuelve la lista de errores. Vacia = valida. Nunca lanza: el que llama decide. */
export function validaTrayectoria(t) {
  const errores = []
  if (!esObjeto(t)) return ['la trayectoria tiene que ser un objeto']
  clavesAdmitidas(t, CLAVES.raiz, 'raiz', errores)
  if (t.version !== VERSION) errores.push(`version: se esperaba ${VERSION}`)
  cadenaLimpia(t.id, 'id', errores)
  if (!LINEAS.includes(t.linea)) errores.push(`linea: ${LINEAS.join('|')}`)
  if (!esObjeto(t.origen)) errores.push('origen: objeto obligatorio')
  else {
    clavesAdmitidas(t.origen, CLAVES.origen, 'origen', errores)
    if (!ORIGENES.includes(t.origen.tipo)) errores.push(`origen.tipo: ${ORIGENES.join('|')}`)
    cadenaLimpia(t.origen.referencia, 'origen.referencia', errores)
    if (t.origen.subagente !== undefined && typeof t.origen.subagente !== 'boolean') errores.push('origen.subagente: booleano')
  }
  if (!esObjeto(t.cuando)) errores.push('cuando: objeto obligatorio')
  else {
    clavesAdmitidas(t.cuando, CLAVES.cuando, 'cuando', errores)
    if (!esFechaIso(t.cuando.inicio)) errores.push('cuando.inicio: fecha ISO')
    if (t.cuando.fin !== undefined && !esFechaIso(t.cuando.fin)) errores.push('cuando.fin: fecha ISO')
  }
  if (!esObjeto(t.actor)) errores.push('actor: objeto obligatorio')
  else {
    clavesAdmitidas(t.actor, CLAVES.actor, 'actor', errores)
    if (t.actor.skills !== undefined) { if (!Array.isArray(t.actor.skills)) errores.push('actor.skills: lista'); else t.actor.skills.forEach((s, i) => cadenaLimpia(s, `actor.skills[${i}]`, errores)) }
    for (const clave of ['feature', 'tarea', 'herramienta']) if (t.actor[clave] !== undefined) cadenaLimpia(t.actor[clave], `actor.${clave}`, errores)
  }
  contadorPorNombre(t.modelos ?? {}, 'modelos', errores)
  if (!esObjeto(t.acciones)) errores.push('acciones: objeto obligatorio')
  else {
    clavesAdmitidas(t.acciones, CLAVES.acciones, 'acciones', errores)
    contadorPorNombre(t.acciones.herramientas ?? {}, 'acciones.herramientas', errores)
    for (const clave of ['llamadasAlModelo', 'turnos', 'subagentes', 'documentos', 'paginas', 'comandos', 'ediciones']) if (t.acciones[clave] !== undefined && !esEnteroNoNegativo(t.acciones[clave])) errores.push(`acciones.${clave}: entero >= 0`)
  }
  if (!('uso' in t)) errores.push('uso: obligatorio (objeto o null)')
  else validaUso(t.uso, errores)
  if (!('costoUsd' in t)) errores.push('costoUsd: obligatorio (numero o null)')
  else if (t.costoUsd !== null && !(typeof t.costoUsd === 'number' && t.costoUsd >= 0)) errores.push('costoUsd: numero >= 0 o null')
  if (t.uso === null && t.costoUsd !== null) errores.push('costoUsd: sin uso no hay coste; va null, nunca estimado')
  if (!esObjeto(t.tiempos)) errores.push('tiempos: objeto obligatorio')
  else {
    clavesAdmitidas(t.tiempos, CLAVES.tiempos, 'tiempos', errores)
    if (t.tiempos.totalMs !== null && !esEnteroNoNegativo(t.tiempos.totalMs)) errores.push('tiempos.totalMs: entero >= 0 o null')
    if (t.tiempos.porEtapaMs !== undefined) contadorPorNombre(t.tiempos.porEtapaMs, 'tiempos.porEtapaMs', errores)
  }
  validaGates(t.gates ?? [], errores)
  validaResultado(t.resultado ?? {}, errores)
  if (!esObjeto(t.cobertura)) errores.push('cobertura: objeto obligatorio')
  else {
    clavesAdmitidas(t.cobertura, CLAVES.cobertura, 'cobertura', errores)
    if (typeof t.cobertura.completa !== 'boolean') errores.push('cobertura.completa: booleano')
    if (!Array.isArray(t.cobertura.faltan)) errores.push('cobertura.faltan: lista')
    else t.cobertura.faltan.forEach((f, i) => cadenaLimpia(f, `cobertura.faltan[${i}]`, errores))
    if (t.cobertura.completa === true && (t.cobertura.faltan ?? []).length > 0) errores.push('cobertura: completa=true con faltantes')
    if (t.uso === null && !(t.cobertura.faltan ?? []).includes('uso')) errores.push('cobertura.faltan: sin uso, tiene que declarar "uso"')
  }
  if (t.avisos !== undefined) { if (!Array.isArray(t.avisos)) errores.push('avisos: lista'); else t.avisos.forEach((a, i) => cadenaLimpia(a, `avisos[${i}]`, errores)) }
  return errores
}

/** Cobertura calculada a partir de lo que falta. Una sola forma de decirlo. */
export function cobertura(faltan) {
  const unicos = [...new Set(faltan)]
  return { completa: unicos.length === 0, faltan: unicos }
}

/** Id estable a partir de la linea y una referencia: corto, sin contenido. */
export function idDe(linea, referencia) {
  let h = 2166136261
  for (const c of `${linea}:${referencia}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 }
  return `${linea}-${h.toString(16).padStart(8, '0')}`
}
