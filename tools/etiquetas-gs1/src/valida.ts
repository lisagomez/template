/**
 * Validacion GS1 de una etiqueta completa: cada elemento contra el diccionario (longitud,
 * juego de caracteres, digito, fechas), cada simbolo contra los limites de GS1-128 (48
 * caracteres, FNC1, lote al final) y la etiqueta entera contra las reglas de combinacion
 * (`ex=` pares invalidos y `req=` asociaciones obligatorias, GenSpecs §4.13-4.14).
 *
 * Las combinaciones se evaluan sobre TODOS los simbolos de la etiqueta, como pide el
 * diccionario: en una tarima el SSCC va en su propio codigo y aun asi satisface el `req` de (37).
 */
import { casaPatron, entradaAi, nombreAi } from './diccionario/index.js'
import { corrigeDigito } from './digito.js'
import { caracteresDeDatos, llevaSeparador, MAXIMO_CARACTERES_GS1_128, type Elemento, type Simbolo } from './elementos.js'
import { esFecha, fechaLegible, parseaFechaGs1 } from './fechas.js'
import { aplicaLinter, caracteresFueraDeCset82, CSET39, CSET64, CSET82 } from './linters.js'
import { clasificaPrefijo } from './prefijos.js'

export type Severidad = 'error' | 'aviso' | 'info'

export type Arreglo =
  | { readonly tipo: 'corrige-digito'; readonly ai: string; readonly valor: string }
  | { readonly tipo: 'lote-al-final'; readonly simbolo: number }
  | { readonly tipo: 'quita-caracteres'; readonly ai: string; readonly valor: string }
  | { readonly tipo: 'parte-simbolo'; readonly simbolo: number }
  | { readonly tipo: 'ajusta-grosor'; readonly puntos: number }

export interface Hallazgo {
  readonly codigo: string
  readonly severidad: Severidad
  /** Una linea, en lenguaje llano. */
  readonly titulo: string
  /** Por que importa y que hacer, sin jerga. */
  readonly explicacion: string
  readonly ai?: string
  readonly simbolo?: number
  readonly arreglo?: Arreglo
}

export interface ContextoValidacion {
  readonly anioActual: number
}

const h = (x: Hallazgo): Hallazgo => x

function validaComponentes(e: Elemento, simbolo: number, ctx: ContextoValidacion): Hallazgo[] {
  const entrada = entradaAi(e.ai)
  if (!entrada) return [h({ codigo: 'ai-desconocido', severidad: 'error', ai: e.ai, simbolo, titulo: `(${e.ai}) no es un identificador GS1`, explicacion: 'Ese AI no existe en las GS1 General Specifications. Ningún lector lo interpretará.' })]
  const nombre = `(${e.ai}) ${nombreAi(e.ai)}`
  if (e.valor.length < entrada.longitudMin || e.valor.length > entrada.longitudMax) {
    const esperado = entrada.longitudMin === entrada.longitudMax ? `${entrada.longitudMax}` : `de ${entrada.longitudMin} a ${entrada.longitudMax}`
    return [h({ codigo: 'longitud', severidad: 'error', ai: e.ai, simbolo, titulo: `${nombre}: mide ${e.valor.length} y debe medir ${esperado}`, explicacion: 'GS1 fija la longitud de cada dato; con otra longitud el lector corta mal los datos que siguen.' })]
  }
  const salida: Hallazgo[] = []
  let pos = 0
  for (const c of entrada.componentes) {
    if (pos >= e.valor.length && c.opcional) break
    const largo = c.min === c.max ? c.max : Math.min(c.max, e.valor.length - pos)
    const trozo = e.valor.slice(pos, pos + largo)
    pos += largo
    const juego = c.tipo === 'N' ? /^\d*$/ : c.tipo === 'X' ? CSET82 : c.tipo === 'Y' ? CSET39 : CSET64
    if (!juego.test(trozo)) {
      const malos = c.tipo === 'X' ? caracteresFueraDeCset82(trozo) : [...new Set([...trozo].filter((x) => !juego.test(x)))]
      const limpio = c.tipo === 'X' ? e.valor.split('').filter((x) => CSET82.test(x)).join('') : undefined
      salida.push(h({
        codigo: c.tipo === 'N' ? 'caracter-no-numerico' : 'caracter-prohibido', severidad: 'error', ai: e.ai, simbolo,
        titulo: `${nombre}: lleva caracteres no permitidos (${malos.map((m) => (m === ' ' ? 'espacio' : `«${m}»`)).join(', ')})`,
        explicacion: c.tipo === 'N'
          ? 'Este dato solo admite cifras.'
          : 'GS1 solo admite letras sin acento, cifras y unos pocos signos (el juego CSET 82): nada de espacios, acentos, ñ, #, @ ni barras invertidas.',
        ...(limpio !== undefined && limpio.length >= entrada.longitudMin ? { arreglo: { tipo: 'quita-caracteres' as const, ai: e.ai, valor: limpio } } : {}),
      }))
      continue
    }
    for (const linter of c.linters) {
      const r = aplicaLinter(linter, trozo, ctx.anioActual)
      if ('noVerificado' in r) {
        salida.push(h({ codigo: 'no-verificado', severidad: 'info', ai: e.ai, simbolo, titulo: `${nombre}: la regla «${linter}» no se comprueba aquí`, explicacion: 'La estructura es correcta, pero este sistema no tiene la tabla para comprobar ese contenido (listas ISO, IBAN, cupones). No se da por bueno a ciegas.' }))
      } else if (!r.ok) {
        const esDigito = linter === 'csum' && /^\d+$/.test(e.valor)
        salida.push(h({
          codigo: esDigito ? 'digito-verificador' : linter.startsWith('yy') ? 'fecha-invalida' : 'contenido-invalido', severidad: 'error', ai: e.ai, simbolo,
          titulo: esDigito ? `${nombre}: el último dígito no cuadra (debería ser ${corrigeDigito(e.valor).at(-1)})` : `${nombre}: ${r.mensaje}`,
          explicacion: esDigito
            ? 'El dígito verificador protege contra errores de captura. Con uno malo el lector rechaza el código o, peor, lo toma por otro producto.'
            : 'El lector aceptará la estructura, pero el dato no significa nada válido.',
          ...(esDigito ? { arreglo: { tipo: 'corrige-digito' as const, ai: e.ai, valor: corrigeDigito(e.valor) } } : {}),
        }))
      }
    }
  }
  if (salida.length === 0) salida.push(...avisosDeContenido(e, simbolo, ctx))
  return salida
}

/** Lo que es valido pero conviene saber: DD=00, prefijo de demo, circulacion restringida. */
function avisosDeContenido(e: Elemento, simbolo: number, ctx: ContextoValidacion): Hallazgo[] {
  const salida: Hallazgo[] = []
  const entrada = entradaAi(e.ai)
  if (entrada?.componentes[0]?.linters.includes('yymmd0') && e.valor.endsWith('00')) {
    const f = parseaFechaGs1(e.valor, ctx.anioActual)
    if (esFecha(f)) salida.push(h({ codigo: 'fecha-dia-cero', severidad: 'info', ai: e.ai, simbolo, titulo: `(${e.ai}) con día 00: vale el último día del mes (${fechaLegible(f)})`, explicacion: 'GS1 permite DD=00 cuando solo se conoce año y mes. Ojo: en productos de salud regulada ya no se admite desde 2025.' }))
  }
  if ((e.ai === '01' || e.ai === '02') && e.valor.length === 14) {
    const p = clasificaPrefijo(e.valor)
    if (p.clase === 'demostracion') salida.push(h({ codigo: 'prefijo-demostracion', severidad: 'aviso', ai: e.ai, simbolo, titulo: `(${e.ai}) usa el prefijo de demostración 952`, explicacion: p.explicacion }))
    else if (p.clase !== 'global') salida.push(h({ codigo: 'prefijo-' + p.clase, severidad: p.clase.startsWith('restringido') ? 'info' : 'aviso', ai: e.ai, simbolo, titulo: `(${e.ai}) ${p.clase.startsWith('restringido') ? 'es de circulación restringida' : 'no es un GTIN de artículo'}`, explicacion: p.explicacion }))
  }
  return salida
}

export function validaSimbolo(simbolo: Simbolo, indice: number, ctx: ContextoValidacion): Hallazgo[] {
  const salida = simbolo.flatMap((e) => validaComponentes(e, indice, ctx))
  const n = caracteresDeDatos(simbolo)
  if (n > MAXIMO_CARACTERES_GS1_128) {
    salida.push(h({
      codigo: 'mas-de-48', severidad: 'error', simbolo: indice,
      titulo: `El código tiene ${n} caracteres de datos; GS1-128 admite 48`,
      explicacion: 'Cuentan los AIs, los datos y cada separador FNC1 (GenSpecs §5.4.4.3). Parte el código en dos: la guía de etiqueta logística pone el SSCC (00) en su propio código.',
      ...(simbolo.length > 1 ? { arreglo: { tipo: 'parte-simbolo' as const, simbolo: indice } } : {}),
    }))
  }
  const iLote = simbolo.findIndex((e) => e.ai === '10')
  if (iLote >= 0 && iLote !== simbolo.length - 1) {
    salida.push(h({ codigo: 'lote-no-al-final', severidad: 'aviso', ai: '10', simbolo: indice, titulo: 'El lote (10) no va al final del código', explicacion: 'El lote es de longitud variable: en medio necesita un separador FNC1 extra y el código sale más largo. Al final no lo necesita, y así lo pide el estándar de la casa.', arreglo: { tipo: 'lote-al-final', simbolo: indice } }))
  }
  const separados = simbolo.filter((_, i) => llevaSeparador(simbolo, i)).map((e) => `(${e.ai})`)
  if (separados.length > 0) salida.push(h({ codigo: 'fnc1', severidad: 'info', simbolo: indice, titulo: `Lleva separador FNC1 después de ${separados.join(', ')}`, explicacion: 'Es de longitud variable y no es el último dato: sin el separador el lector no sabría dónde termina.' }))
  return salida
}

function nombres(ais: readonly string[]): string {
  return ais.map((a) => `(${a.replace(/n/g, 'x')})`).join(' y ')
}

/** Reglas `ex=` y `req=` sobre la etiqueta completa (todos sus simbolos). */
export function validaCombinaciones(simbolos: readonly Simbolo[]): Hallazgo[] {
  const todos = simbolos.flat()
  const ais = [...new Set(todos.map((e) => e.ai))]
  const salida: Hallazgo[] = []
  const vistos = new Set<string>()
  for (const ai of ais) {
    const entrada = entradaAi(ai)
    if (!entrada) continue
    for (const patron of entrada.excluye) {
      for (const otro of ais) {
        if (otro === ai || !casaPatron(patron, otro)) continue
        const par = [ai, otro].sort().join('+')
        if (vistos.has(par)) continue
        vistos.add(par)
        salida.push(h({
          codigo: 'combinacion-prohibida', severidad: 'error', ai,
          titulo: `GS1 no permite (${ai}) junto con (${otro})`,
          explicacion: par === '01+37'
            ? '(37) cuenta las unidades que hay DENTRO de una unidad logística y va con (02), no con (01): una caja con (01) ya es la unidad comercial. Para contar cajas en una tarima usa (00)+(02)+(37).'
            : `Las GS1 General Specifications declaran ese par inválido: los dos datos se contradicen sobre qué se está identificando.`,
        }))
      }
    }
    if (entrada.requiere.length > 0) {
      const cumple = entrada.requiere.some((alt) => alt.every((p) => ais.some((x) => casaPatron(p, x))))
      if (!cumple) {
        const opciones = entrada.requiere.map((alt) => nombres(alt))
        salida.push(h({ codigo: 'falta-asociacion', severidad: 'error', ai, titulo: `(${ai}) ${nombreAi(ai)} necesita ir con ${opciones.slice(0, 3).join(', o con ')}${opciones.length > 3 ? '…' : ''}`, explicacion: 'Un atributo (lote, fecha, cantidad) no significa nada sin la clave que dice de qué artículo o unidad es. La regla vale para la etiqueta entera.' }))
      }
    }
  }
  const porAi = new Map<string, Set<string>>()
  for (const e of todos) porAi.set(e.ai, (porAi.get(e.ai) ?? new Set()).add(e.valor))
  for (const [ai, valores] of porAi) {
    if (valores.size > 1) salida.push(h({ codigo: 'ai-repetido', severidad: 'error', ai, titulo: `(${ai}) aparece con dos valores distintos`, explicacion: 'Un mismo dato no puede decir dos cosas en la misma unidad.' }))
  }
  return salida
}

export function validaEtiqueta(simbolos: readonly Simbolo[], ctx: ContextoValidacion): Hallazgo[] {
  return [...simbolos.flatMap((s, i) => validaSimbolo(s, i, ctx)), ...validaCombinaciones(simbolos)]
}

export function hayErrores(hallazgos: readonly Hallazgo[]): boolean {
  return hallazgos.some((x) => x.severidad === 'error')
}

/** Aplica un arreglo de un clic a los simbolos. Devuelve simbolos nuevos (no muta). */
export function aplicaArreglo(simbolos: readonly Simbolo[], arreglo: Arreglo): Simbolo[] {
  switch (arreglo.tipo) {
    case 'corrige-digito':
    case 'quita-caracteres':
      return simbolos.map((s) => s.map((e) => (e.ai === arreglo.ai ? { ai: e.ai, valor: arreglo.valor } : e)))
    case 'lote-al-final':
      return simbolos.map((s, i) => (i === arreglo.simbolo ? [...s.filter((e) => e.ai !== '10'), ...s.filter((e) => e.ai === '10')] : s))
    case 'parte-simbolo':
      // Guia de etiqueta logistica: el SSCC en su propio codigo, abajo; si no hay SSCC, el lote aparte.
      return simbolos.flatMap((s, i) => {
        if (i !== arreglo.simbolo) return [s]
        const aparte = s.some((e) => e.ai === '00') ? '00' : '10'
        return [s.filter((e) => e.ai !== aparte), s.filter((e) => e.ai === aparte)]
      })
    case 'ajusta-grosor':
      return [...simbolos]
  }
}
