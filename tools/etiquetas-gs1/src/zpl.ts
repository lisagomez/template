/**
 * ZPL para impresoras Zebra, desde el MISMO diseno que produce el SVG.
 *
 * Codigos: `^BC` en modo D (UCC/EAN), que arranca con FNC1 y quita los parentesis al
 * codificar. Tres cosas medidas contra un motor ZPL real (zebrash) el 2026-09-25, y que esto
 * respeta:
 *   1. el modo D NO mete el FNC1 tras un AI variable que va en medio: sin `>8` detras de (37)
 *      la tarima se lee corrupta. Aqui se pone `>8` explicito, como en el ejemplo de Zebra;
 *   2. los parentesis DENTRO de un valor se pierden (el lote «A(1)» sale «A1»), y `>` inicia
 *      codigos de invocacion: un valor con `(`, `)` o `>` no se imprime en modo D;
 *   3. un digito verificador malo no se corrige igual en todos los motores: aqui nunca llega
 *      uno malo, porque la revision lo bloquea antes.
 *
 * Textos: `^FH\` y escape de `^`, `~` y `\`, porque en ZPL un `^` en medio de un texto empieza
 * un comando. `^CI28` = UTF-8 (acentos y ñ en los textos; en los codigos no hay).
 */
import { type Diseno, type PerfilImpresora } from './etiqueta.js'
import { llevaSeparador, type Simbolo } from './elementos.js'
import { mmAPuntos } from './medidas.js'

/** Caracteres CSET 82 que el modo D de ^BC no transporta intactos. */
export const PELIGROSOS_MODO_D = /[()>]/

export function problemasModoD(simbolo: Simbolo): string[] {
  return simbolo.filter((e) => PELIGROSOS_MODO_D.test(e.valor)).map((e) => e.ai)
}

/** `(02)09521234000013(37)24>8(17)261030(10)L4471` */
export function datosModoD(simbolo: Simbolo): string {
  const malos = problemasModoD(simbolo)
  if (malos.length) throw new Error(`modo D: el valor de (${malos.join('), (')}) lleva ( ) o >, que la impresora alteraria`)
  return simbolo.map((e, i) => `(${e.ai})${e.valor}${llevaSeparador(simbolo, i) ? '>8' : ''}`).join('')
}

/** Texto seguro dentro de `^FH\^FD...^FS`. */
export function escapaTexto(texto: string): string {
  return texto.replace(/[\\^~]/g, (c) => `\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`).replace(/[\r\n]+/g, ' ')
}

const acota = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, Math.round(n)))

function cabecera(perfil: PerfilImpresora, ancho: number, alto: number): string[] {
  return [
    '^XA',
    '^CI28',
    `^PW${ancho}`,
    `^LL${alto}`,
    `^LH${acota(perfil.origenX, 0, 32000)},${acota(perfil.origenY, 0, 32000)}`,
    `^LS${acota(perfil.corrimientoIzq, -9999, 9999)}`,
    `^LT${acota(perfil.corrimientoSup, -120, 120)}`,
    `^MD${acota(perfil.oscuridad, -30, 30)}`,
    `^PR${acota(perfil.velocidad, 2, 14)}`,
  ]
}

export interface OpcionesZpl {
  readonly copias?: number
}

export function aZpl(diseno: Diseno, perfil: PerfilImpresora, opciones: OpcionesZpl = {}): string {
  const lineas = cabecera(perfil, diseno.ancho, diseno.alto)
  for (const p of diseno.piezas) {
    if (p.tipo === 'texto') {
      lineas.push(`^FO${p.x},${p.y}^A0N,${p.alto},${p.alto}^FH\\^FD${escapaTexto(p.texto)}^FS`)
    } else if (p.tipo === 'linea') {
      lineas.push(`^FO${p.x},${p.y}^GB${p.ancho},${p.alto},${p.alto}^FS`)
    } else {
      // ^A0 antes de ^BC fija la fuente de la linea legible (firmware x.10 en adelante).
      lineas.push(`^FO${p.x},${p.y}^BY${p.puntosPorModulo}^A0N,${p.altoHri},${p.altoHri}`)
      lineas.push(`^BCN,${p.altoBarras},Y,N,N,D^FD${datosModoD(p.simbolo)}^FS`)
    }
  }
  const copias = acota(opciones.copias ?? 1, 1, 9999)
  if (copias > 1) lineas.push(`^PQ${copias},0,1,Y`)
  lineas.push('^XZ')
  return lineas.join('\n') + '\n'
}

/**
 * Etiqueta de calibracion: recuadro al borde exacto del formato, reglas cada 5 mm con numero
 * cada 10, cruz al centro y los desplazamientos vigentes impresos. Se imprime, se mide con una
 * regla contra el papel real y se corrige ^LH/^LS/^LT hasta que el recuadro toque los bordes.
 */
export function etiquetaCalibracion(perfil: PerfilImpresora, rotulo: PerfilImpresora = perfil): string {
  const { dpi } = perfil
  const ancho = mmAPuntos(perfil.anchoMm, dpi)
  const alto = mmAPuntos(perfil.altoMm, dpi)
  const grueso = Math.max(2, mmAPuntos(0.5, dpi))
  const l = cabecera(perfil, ancho, alto)
  l.push(`^FO0,0^GB${ancho},${alto},${grueso}^FS`)
  const texto = mmAPuntos(2.5, dpi)
  for (let mm = 5; mm < perfil.anchoMm; mm += 5) {
    const x = mmAPuntos(mm, dpi)
    const largo = mmAPuntos(mm % 10 === 0 ? 5 : 3, dpi)
    l.push(`^FO${x},0^GB1,${largo},1^FS`)
    if (mm % 10 === 0) l.push(`^FO${x + 3},${largo + 2}^A0N,${texto},${texto}^FD${mm}^FS`)
  }
  for (let mm = 5; mm < perfil.altoMm; mm += 5) {
    const y = mmAPuntos(mm, dpi)
    const largo = mmAPuntos(mm % 10 === 0 ? 5 : 3, dpi)
    l.push(`^FO0,${y}^GB${largo},1,1^FS`)
    if (mm % 10 === 0) l.push(`^FO${largo + 3},${y + 2}^A0N,${texto},${texto}^FD${mm}^FS`)
  }
  const cx = Math.round(ancho / 2)
  const cy = Math.round(alto / 2)
  const brazo = mmAPuntos(6, dpi)
  l.push(`^FO${cx - brazo},${cy}^GB${2 * brazo},1,2^FS`, `^FO${cx},${cy - brazo}^GB1,${2 * brazo},2^FS`)
  const t = mmAPuntos(3, dpi)
  const y0 = cy + brazo + mmAPuntos(2, dpi)
  l.push(`^FO${mmAPuntos(12, dpi)},${y0}^A0N,${t},${t}^FH\\^FDCALIBRACIÓN - ${escapaTexto(perfil.nombre)} (${dpi} dpi, ${perfil.anchoMm} x ${perfil.altoMm} mm)^FS`)
  l.push(`^FO${mmAPuntos(12, dpi)},${y0 + t + 6}^A0N,${t},${t}^FDLH ${rotulo.origenX},${rotulo.origenY}  LS ${rotulo.corrimientoIzq}  LT ${rotulo.corrimientoSup}  MD ${rotulo.oscuridad}  PR ${rotulo.velocidad}^FS`)
  l.push('^XZ')
  return l.join('\n') + '\n'
}

/**
 * Perfil para la VISTA LOCAL: el motor del navegador (zebrash) aplica ^LH pero ignora ^LS y ^LT
 * (medido el 2026-09-25). Para que la vista no mienta por omision, se suman a ^LH (^LS positivo
 * mueve a la izquierda; ^LT positivo, hacia abajo). No puede bajar de 0: lo que se saldria por
 * arriba o por la izquierda se ve pegado al borde. El ZPL que se IMPRIME no pasa por aqui.
 */
export function perfilParaVistaLocal(p: PerfilImpresora): PerfilImpresora {
  return { ...p, origenX: Math.max(0, p.origenX - p.corrimientoIzq), origenY: Math.max(0, p.origenY + p.corrimientoSup), corrimientoIzq: 0, corrimientoSup: 0 }
}

// --- Lectura de ZPL ajeno: lo que usa el agente para no ser un rele abierto ----------------

export interface ComandoZpl {
  readonly prefijo: '^' | '~'
  readonly codigo: string
  readonly parametros: string
}

/** Parte el ZPL como lo parte la impresora: cada `^` o `~` empieza un comando. */
export function tokenizaZpl(zpl: string): ComandoZpl[] {
  const salida: ComandoZpl[] = []
  const re = /([\^~])([^\^~]*)/g
  for (let m = re.exec(zpl); m; m = re.exec(zpl)) {
    const cuerpo = m[2] ?? ''
    // Todo codigo mide dos caracteres; en ^A el segundo es la fuente (^A0, ^AA, ^A@).
    salida.push({ prefijo: m[1] as '^' | '~', codigo: cuerpo.slice(0, 2).toUpperCase(), parametros: cuerpo.slice(2) })
  }
  return salida
}

/**
 * Lo unico que el sistema genera y, por tanto, lo unico que el agente deja pasar. Quedan
 * FUERA a proposito: guardar configuracion (^JU), reiniciar (~JR), red y wifi (^N*, ^W*),
 * contraseñas (^KP), cambiar los prefijos de comando (^CC ~CC ^CT ~CT ^CD) —con eso se
 * colaria cualquier otra cosa—, descargar o borrar objetos (~DG ~DY ^ID), cambiar de lenguaje
 * (^SZ) y todo comando con `~`.
 */
const PERMITIDOS = new Set(['XA', 'XZ', 'CI', 'PW', 'LL', 'LH', 'LS', 'LT', 'MD', 'PR', 'FO', 'FT', 'FD', 'FS', 'FH', 'FB', 'BY', 'BC', 'GB', 'PQ', 'FX', 'CF', 'PO', 'LR', 'FR'])

export type RevisionZpl = { readonly ok: true; readonly etiquetas: number } | { readonly ok: false; readonly motivo: string }

export function revisaZpl(zpl: string, maxCopias = 500): RevisionZpl {
  if (!/^\s*\^XA/.test(zpl)) return { ok: false, motivo: 'el trabajo no empieza con ^XA' }
  if (!/\^XZ\s*$/.test(zpl)) return { ok: false, motivo: 'el trabajo no termina con ^XZ' }
  let etiquetas = 0
  let abierta = false
  for (const c of tokenizaZpl(zpl)) {
    if (c.prefijo === '~') return { ok: false, motivo: `comando ~${c.codigo} no permitido` }
    const fuente = /^A[0-9A-Z@]$/.test(c.codigo)
    if (!fuente && !PERMITIDOS.has(c.codigo)) return { ok: false, motivo: `comando ^${c.codigo} no permitido` }
    if (c.codigo === 'XA') { if (abierta) return { ok: false, motivo: '^XA sin cerrar el formato anterior' }; abierta = true; etiquetas++ }
    if (c.codigo === 'XZ') { if (!abierta) return { ok: false, motivo: '^XZ sin ^XA' }; abierta = false }
    if (c.codigo === 'CI' && !/^(0|27|28)$/.test(c.parametros.trim())) return { ok: false, motivo: '^CI solo admite 0, 27 o 28' }
    if (c.codigo === 'PQ' && Number(c.parametros.split(',')[0]) > maxCopias) return { ok: false, motivo: `más de ${maxCopias} copias en un trabajo` }
  }
  return { ok: true, etiquetas }
}
