/**
 * Revision antes de imprimir. Siete preguntas fijas, cada una con su respuesta en lenguaje
 * llano aunque salga bien (una revision que solo habla cuando hay error no deja saber que se
 * reviso), y con arreglo de un clic cuando lo hay:
 *
 *   1. ¿el codigo GS1-128 es valido?          5. ¿cabe en 48 caracteres?
 *   2. ¿cuadran los digitos (GTIN, SSCC)?      6. ¿cabe en la etiqueta con su zona en blanco?
 *   3. ¿cuanta vida le queda? (semaforo)       7. ¿el grosor de barra cumple GS1 para quien lo lee?
 *   4. ¿el lote va al final y sin prohibidos?
 */
import { caracteresDeDatos, MAXIMO_CARACTERES_GS1_128, valorDe, type Simbolo } from './elementos.js'
import { codigosDe, type Diseno, type PerfilImpresora } from './etiqueta.js'
import { fechaLegible } from './fechas.js'
import { evaluaMedidas, mejorGrosor, puntosAMm, type PerfilLectura } from './medidas.js'
import { promocionDe, TEXTO_SEMAFORO, textoDias, vidaRestante, type Categoria, type EstadoSemaforo } from './semaforo.js'
import { validaEtiqueta, type Arreglo, type Hallazgo } from './valida.js'
import { problemasModoD } from './zpl.js'

export type EstadoRevision = 'ok' | 'aviso' | 'error' | 'info'

export interface PuntoRevision {
  readonly id: 'codigo' | 'digitos' | 'vida' | 'lote' | 'longitud' | 'cabe' | 'grosor' | 'extra'
  readonly estado: EstadoRevision
  readonly titulo: string
  readonly explicacion: string
  readonly arreglo?: Arreglo
  readonly semaforo?: EstadoSemaforo
}

export interface ResultadoRevision {
  readonly puntos: readonly PuntoRevision[]
  /** Hay algun error: no se deja imprimir. */
  readonly bloquea: boolean
  readonly hallazgos: readonly Hallazgo[]
}

export interface EntradaRevision {
  readonly simbolos: readonly Simbolo[]
  readonly diseno: Diseno
  readonly perfil: PerfilImpresora
  readonly categoria: Categoria
  readonly hoy: string
}

const peor = (estados: readonly EstadoRevision[]): EstadoRevision =>
  estados.includes('error') ? 'error' : estados.includes('aviso') ? 'aviso' : 'ok'

const aEstado = (h: Hallazgo): EstadoRevision => (h.severidad === 'error' ? 'error' : h.severidad === 'aviso' ? 'aviso' : 'info')

const DIGITOS = new Set(['digito-verificador'])
const DE_LOTE = new Set(['lote-no-al-final'])
const PROPIOS = new Set(['digito-verificador', 'lote-no-al-final', 'mas-de-48', 'fnc1'])

export function revisa(e: EntradaRevision): ResultadoRevision {
  const hallazgos = validaEtiqueta(e.simbolos, { anioActual: Number(e.hoy.slice(0, 4)) })
  const puntos: PuntoRevision[] = []

  // 1. Validez GS1 general (lo que no tiene pregunta propia).
  const generales = hallazgos.filter((h) => h.severidad === 'error' && !PROPIOS.has(h.codigo) && !(h.ai === '10' && h.codigo.startsWith('caracter')))
  puntos.push(generales.length === 0
    ? { id: 'codigo', estado: 'ok', titulo: 'El código GS1-128 es válido', explicacion: 'Identificadores, longitudes, fechas y combinaciones correctas según las GS1 General Specifications.' }
    : { id: 'codigo', estado: 'error', titulo: generales[0]!.titulo, explicacion: generales.slice(1).map((h) => h.titulo).concat(generales[0]!.explicacion).join(' · '), ...(generales[0]!.arreglo ? { arreglo: generales[0]!.arreglo } : {}) })

  // 2. Digitos verificadores de GTIN y SSCC.
  const digitos = hallazgos.filter((h) => DIGITOS.has(h.codigo))
  const claves = e.simbolos.flat().filter((x) => ['00', '01', '02'].includes(x.ai)).map((x) => `(${x.ai})`)
  puntos.push(digitos.length === 0
    ? { id: 'digitos', estado: claves.length ? 'ok' : 'info', titulo: claves.length ? `Dígito verificador correcto en ${claves.join(', ')}` : 'No hay GTIN ni SSCC que comprobar', explicacion: 'El último dígito protege contra errores de captura: cuadra con el resto.' }
    : { id: 'digitos', estado: 'error', titulo: digitos[0]!.titulo, explicacion: digitos[0]!.explicacion, ...(digitos[0]!.arreglo ? { arreglo: digitos[0]!.arreglo } : {}) })

  // 3. Vida restante con semaforo.
  const cad = e.simbolos.map((s) => valorDe(s, '17')).find((v) => v !== undefined)
  const vida = cad ? vidaRestante(cad, e.hoy, e.categoria) : undefined
  if (!vida) {
    puntos.push({ id: 'vida', estado: cad ? 'error' : 'aviso', titulo: cad ? 'La fecha de caducidad no es válida' : 'No lleva fecha de caducidad (17)', explicacion: 'Sin fecha no hay semáforo ni FEFO: la etiqueta no sirve para controlar caducidades.' })
  } else {
    const t = TEXTO_SEMAFORO[vida.estado]
    puntos.push({
      id: 'vida', estado: vida.estado === 'vigente' ? 'ok' : vida.estado === 'alerta' || vida.estado === 'promocion' ? 'aviso' : 'error', semaforo: vida.estado,
      titulo: `${t.etiqueta}: ${textoDias(vida.dias)} (caduca el ${fechaLegible(vida.fecha)})`,
      explicacion: `${t.accion} Umbrales de «${vida.categoria.nombre}»: por vencer con ${vida.categoria.alertaDias} días o menos, promoción con ${promocionDe(vida.categoria)}, bloqueo con ${vida.categoria.retiroDias}.`,
    })
  }

  // 4. Lote: al final, CSET 82, y transportable por el modo D de ZPL.
  const lote = hallazgos.filter((h) => DE_LOTE.has(h.codigo) || (h.ai === '10' && h.codigo.startsWith('caracter')))
  const loteModoD = e.simbolos.some((s) => problemasModoD(s).includes('10'))
  const tieneLote = e.simbolos.some((s) => valorDe(s, '10') !== undefined)
  if (lote.length) {
    puntos.push({ id: 'lote', estado: peor(lote.map(aEstado)), titulo: lote.map((h) => h.titulo).join(' · '), explicacion: lote[0]!.explicacion, ...(lote[0]!.arreglo ? { arreglo: lote[0]!.arreglo } : {}) })
  } else if (loteModoD) {
    const valor = e.simbolos.map((s) => valorDe(s, '10')).find((v) => v !== undefined) ?? ''
    puntos.push({ id: 'lote', estado: 'error', titulo: 'El lote lleva ( ) o >: GS1 lo permite, pero la Zebra lo alteraría', explicacion: 'En el modo D de ZPL la impresora quita los paréntesis y trata «>» como orden: el código impreso diría otro lote que el SVG. No se imprime así.', arreglo: { tipo: 'quita-caracteres', ai: '10', valor: valor.replace(/[()>]/g, '') } })
  } else {
    puntos.push({ id: 'lote', estado: tieneLote ? 'ok' : 'aviso', titulo: tieneLote ? 'El lote va al final y sin caracteres prohibidos' : 'No lleva lote (10)', explicacion: tieneLote ? 'Así no necesita separador FNC1 y el código sale más corto.' : 'Sin lote no hay trazabilidad ni retiro selectivo.' })
  }

  // 5. 48 caracteres por simbolo.
  const largos = e.simbolos.map(caracteresDeDatos)
  const excede = hallazgos.find((h) => h.codigo === 'mas-de-48')
  puntos.push(excede
    ? { id: 'longitud', estado: 'error', titulo: excede.titulo, explicacion: excede.explicacion, ...(excede.arreglo ? { arreglo: excede.arreglo } : {}) }
    : { id: 'longitud', estado: 'ok', titulo: `${largos.join(' + ')} de ${MAXIMO_CARACTERES_GS1_128} caracteres por código`, explicacion: 'Cuentan AIs, datos y separadores FNC1; el máximo de GS1-128 es 48 por código.' })

  // 6 y 7. Medidas fisicas de cada codigo.
  puntos.push(...revisaMedidas(e.diseno, e.perfil.perfilLectura))

  // Lo demas que conviene saber (prefijo de demo, circulacion restringida, DD=00, FNC1).
  for (const h of hallazgos.filter((x) => x.severidad !== 'error' && !PROPIOS.has(x.codigo))) {
    puntos.push({ id: 'extra', estado: aEstado(h), titulo: h.titulo, explicacion: h.explicacion })
  }
  const fnc1 = hallazgos.filter((h) => h.codigo === 'fnc1')
  for (const h of fnc1) puntos.push({ id: 'extra', estado: 'info', titulo: h.titulo, explicacion: h.explicacion })

  return { puntos, bloquea: puntos.some((p) => p.estado === 'error'), hallazgos }
}

function revisaMedidas(diseno: Diseno, perfil: PerfilLectura): PuntoRevision[] {
  const codigos = codigosDe(diseno)
  const cabe: PuntoRevision[] = []
  const grosor: PuntoRevision[] = []
  codigos.forEach((c, i) => {
    const medida = diseno.medidas[i]!
    const ev = evaluaMedidas(medida, c.altoBarras, diseno.dpi, diseno.anchoUtilCodigo, diseno.unidad, perfil)
    const nombre = codigos.length > 1 ? `Código ${i + 1}` : 'El código'
    const zona = puntosAMm(10 * c.puntosPorModulo, diseno.dpi).toFixed(1)
    const ideal = mejorGrosor(c.simbolo, diseno.anchoUtilCodigo, diseno.dpi, diseno.unidad)
    if (!ev.cabe || ev.excedeLargoMaximo) {
      cabe.push({
        id: 'cabe', estado: 'error',
        titulo: `${nombre} no cabe: mide ${ev.excedeLargoMaximo ? `${medida.anchoConZonasMm.toFixed(1)} mm (máximo GS1: 165.1)` : `${medida.anchoConZonasMm.toFixed(1)} mm con zonas en blanco y la etiqueta deja ${puntosAMm(diseno.anchoUtilCodigo, diseno.dpi).toFixed(1)} mm`}`,
        explicacion: `El lector necesita ${zona} mm en blanco a cada lado (10 veces el grosor de barra). Baja el grosor, acorta los datos, parte el código o usa una etiqueta más ancha.`,
        ...(ideal && ideal < c.puntosPorModulo ? { arreglo: { tipo: 'ajusta-grosor' as const, puntos: ideal } } : {}),
      })
    } else {
      cabe.push({ id: 'cabe', estado: 'ok', titulo: `${nombre} cabe con su zona en blanco (${medida.anchoConZonasMm.toFixed(1)} mm de ${puntosAMm(diseno.anchoUtilCodigo, diseno.dpi).toFixed(1)} útiles)`, explicacion: `Deja ${zona} mm en blanco a cada lado, lo que pide GS1 (10X).` })
    }
    const x = ev.xMm.toFixed(3)
    const lim = ev.limites
    const quien = perfil === 'automatico' ? 'escáner automático' : 'pistola'
    const alturaTxt = `barras de ${ev.alturaMm.toFixed(1)} mm`
    const estado: EstadoRevision = ev.x === 'no-cumple' || ev.altura === 'no-cumple' ? 'error' : ev.x === 'reducido' || ev.altura === 'reducido' ? 'aviso' : 'ok'
    const titulo = `${nombre}: grosor de barra ${x} mm (${c.puntosPorModulo} ${c.puntosPorModulo === 1 ? 'punto' : 'puntos'} a ${diseno.dpi} dpi), ${alturaTxt}`
    let explicacion = `GS1 pide ${lim.xMinimo} a ${lim.xMaximo} mm y ${lim.alturaMinima} mm de alto (${lim.tabla}).`
    if (estado === 'aviso') explicacion += ` Para ${quien} se acepta el mínimo reducido (${lim.xMinimoReducido} mm, ${lim.alturaMinimaReducida} mm), que GS1 solo admite si la unidad no da para más: lo lee una pistola, no un túnel automático.`
    else if (estado === 'error') explicacion += ev.xMm > lim.xMaximo ? ' Pasa del máximo.' : ` Para ${quien} esto no llega${perfil === 'pistola' ? ` ni al mínimo reducido (${lim.xMinimoReducido} mm, ${lim.alturaMinimaReducida} mm)` : ''}.`
    else explicacion += ` Cumple para ${quien}.`
    const arreglo = ideal && ideal > c.puntosPorModulo && ev.x !== 'cumple' ? { arreglo: { tipo: 'ajusta-grosor' as const, puntos: ideal } } : {}
    grosor.push({ id: 'grosor', estado, titulo, explicacion, ...arreglo })
  })
  return [...cabe, ...grosor]
}
