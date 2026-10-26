/**
 * La conversación de la mesa, SIN modelo: lo que contesta el asistente de Soporte SAP cuando el experto le pide «prueba
 * este caso», «¿por qué dijiste no lo sé en el paso 3?» o «muéstrame lo que te enseñé». Quién pide qué lo decide el
 * enrutador de la capa (las intenciones del enchufe); aquí solo se arma la respuesta, y todo sale de SU mesa: la vista que
 * el servidor le da a su identidad (sus casos, la traza de cada corrida y lo que enseñó). Aquí no hay red ni React: son
 * funciones puras que la ranura de conversación llama (`conversacion-mesa.ts`) y que las pruebas ejecutan.
 *
 * Lo que el experto escribe en la conversación no se guarda aquí: un caso solo se guarda al correrlo, por la misma acción
 * `ingresa` del formulario, con sus dos cerrojos de dato personal (`filtro.ts`), en el almacén de la mesa.
 */
import type { CandidatosVista, Valoracion } from './modelo-candidatos'
import type { CasoVista, EntradaCaso, PasoMesa } from './modelo'

/** Cuando la conversación corre un caso, la mesa (el lienzo) lo abre: es el mismo caso, en su línea de tiempo. Vive aquí,
 *  sin la capa, para que la mesa siga funcionando sin ella. */
export const EVENTO_CASO_CORRIDO = 'soporte-sap:mesa:caso-corrido'

// --- «prueba este caso»: qué caso ------------------------------------------------------------------------------------

/** Lo que trae el pedido: el caso escrito detrás del disparo («prueba este caso: …») y si pide repetir el último. */
export interface Pedido { readonly caso: string | null; readonly ultimo: boolean }

const VERBO = /\b(?:pru[eé]ba\w*|prob(?:ar|ad)\w*|corr(?:e|er)\w*|p[aá]sa(?:me|lo|le)?|testea\w*|eval[uú]a\w*|ver qu[eé] dice)\b/i
const REPITE = /\b(?:vuelve a|otra vez|de nuevo|[uú]ltimo|anterior)\b/i
/** Un caso escrito, para correrlo, tiene que contar algo: como el síntoma del formulario (10 letras o más). */
export const MINIMO_DEL_CASO = 10

/** El pedido partido en su disparo («prueba este caso») y lo que viene detrás (el caso). */
function partes(texto: string): { disparo: string; resto: string } {
  const t = texto.trim()
  const dos = t.indexOf(':')
  if (dos > 0 && dos <= 80 && (VERBO.test(t.slice(0, dos)) || /\bcaso\b/i.test(t.slice(0, dos)))) return { disparo: t.slice(0, dos), resto: t.slice(dos + 1) }
  const m = /^(.{0,80}?\bcaso\b)[\s,.;—–-]*/i.exec(t)
  if (m && VERBO.test(m[1]!)) return { disparo: m[1]!, resto: t.slice(m[0].length) }
  return { disparo: t, resto: '' }
}

export function cuerpoDelPedido(texto: string): Pedido {
  const { disparo, resto } = partes(texto)
  const caso = resto.replace(/^\s*(?:de que|que)\s+/i, '').trim()
  return { caso: caso.length >= MINIMO_DEL_CASO ? caso : null, ultimo: REPITE.test(disparo) }
}

/**
 * Borrar no es probar, aunque el enrutador los acerque: «borra mi último caso» se parece a «corre mi último caso» (medido:
 * 0,52 contra un umbral de 0,5). En la mesa, borrar un caso es del laboratorio, así que la conversación no corre nada y lo
 * dice. Solo se mira el disparo, no el caso: «prueba este caso: al quitar el bloqueo, la MIGO…» sí se corre.
 */
const BORRA = /\b(?:borr|elimin|suprim|quit|descart|olvid)\w*/i
export const pideBorrar = (texto: string): boolean => BORRA.test(partes(texto).disparo)
export const NO_BORRO = 'No borro casos, y no corrí nada: en la mesa, borrar un caso es del laboratorio. Si quieres que se borre, pídeselo al laboratorio.'

/** Un mensaje de la conversación, como lo guarda la capa (solo lo que se lee aquí). */
export interface MensajeDelHilo { readonly de: 'persona' | 'asistente'; readonly texto: string; readonly estado?: string }

/**
 * El caso que el experto escribió JUSTO antes de pedir «prueba este caso», si el asistente no lo entendió como otra cosa
 * (contestó «no lo sé» o preguntó entre dos): así se prueba un caso largo, que el enrutador no reconoce como pedido.
 */
export function casoEscritoAntes(hilo: readonly MensajeDelHilo[], pedido: string): string | null {
  const i = hilo.map((m) => m.de === 'persona' && m.texto.trim() === pedido.trim()).lastIndexOf(true)
  if (i < 2) return null
  const anterior = hilo[i - 2]
  const respuesta = hilo[i - 1]
  if (anterior?.de !== 'persona' || respuesta?.de !== 'asistente') return null
  if (respuesta.estado !== 'no-se' && respuesta.estado !== 'ambigua') return null
  return anterior.texto.trim().length >= MINIMO_DEL_CASO ? anterior.texto.trim() : null
}

// --- Del texto libre a la entrada del caso ---------------------------------------------------------------------------

const MODULO_POR_NOMBRE = /(?<![A-Za-z0-9/])(MM|SD|FI|CO|PP|PM|QM|HCM|EWM)(?![A-Za-z0-9/])/
const NOMBRE_A_MODULO: Readonly<Record<string, EntradaCaso['modulo']>> = { MM: 'MM', SD: 'SD', FI: 'FI', CO: 'CO', PP: 'PP', PM: 'PM', QM: 'QM', HCM: 'HCM', EWM: 'WM/EWM' }
/** El módulo por lo que dice el texto. Orden: lo más específico primero (Fiori, nómina, interfaces, Basis). */
const MODULO_POR_TEXTO: ReadonlyArray<readonly [RegExp, EntradaCaso['modulo']]> = [
  [/\bfiori\b|launchpad|\/UI2\//i, 'Fiori'],
  [/n[oó]mina|\bPC00\w*|\bPA[234]0\b|\bISR\b|\bIMSS\b/i, 'HCM'],
  [/\bIDocs?\b|\bBD87\b|\bWE0[25]\b|\binterfaz\b|\bSAP P[IO]\b/i, 'Integración (IDoc/PI)'],
  [/\b(?:SM37|SM21|ST22|SU01|SU53|STRUST|SNRO|SMICM|SICF|STMS|SE38)\b|\bbasis\b|\bdump\b|\btransporte\b|\bjob\b/i, 'BC/Basis'],
  [/\b(?:MIGO|MIRO|MMPV|ME2[1-3]N|ME28|ME29N|MB5[12B]|MM0[1-3])\b|\bM7\s?\d{3}\b|entrada de mercanc|pedido de compras?|verificaci[oó]n de facturas/i, 'MM'],
  [/\b(?:VA0[1-3]|VF0[1-3]|VL0[1-3]N|VKOA|XD0[1-3])\b|pedido de venta|factura de venta/i, 'SD'],
  [/\b(?:FB0[1-9]|FB[5-7]0|F-\d{2}|F110|OB52|FBL[135]N|FAGLB03)\b|\bF5\s?\d{3}\b|\bCFDI/i, 'FI'],
  [/centro de cos?te|orden interna/i, 'CO'],
  [/orden de producci[oó]n|lista de materiales|\bMD0[1-4]\b/i, 'PP'],
  [/\bmantenimiento\b|\bIW3[1-3]\b/i, 'PM'],
  [/lote de inspecci[oó]n|\bQA3[23]\b/i, 'QM'],
]
/** Transacciones que se reconocen por su nombre; las Z y las de espacio de nombres, por su forma. */
const TRANSACCIONES = 'MIGO MIRO MMPV ME21N ME22N ME23N ME28 ME29N MB51 MB52 MB5B MM01 MM02 MM03 VA01 VA02 VA03 VF01 VF02 VF03 VL01N VL02N VKOA XD01 XD02 BP FB01 FB50 FB60 FB70 F-02 F-28 F-53 F110 OB52 FBL1N FBL3N FBL5N FAGLB03 SU01 SU53 SM21 SM37 ST22 STMS STRUST SNRO SMICM SICF SE16N SE38 SPRO BD87 WE02 WE05 PC00_M32_CALC PA20 PA30 MD01 MD04 IW31 IW32 QA32 LT01 EDOC_COCKPIT'.split(' ')
const TRANSACCION_POR_FORMA = /(?<![A-Za-z0-9_/])(\/[A-Z0-9]+\/[A-Z0-9_]{2,24}|Z[A-Z0-9_]{2,19})(?![A-Za-z0-9_])/

export function transaccionDelTexto(texto: string): string {
  const dicha = /\btransacci[oó]n\s+([A-Za-z0-9_/-]{2,30})/i.exec(texto)?.[1]
  if (dicha && /^[A-Za-z0-9_/ -]+$/.test(dicha) && /[A-Za-z]/.test(dicha)) return dicha.toUpperCase()
  const mayus = texto.toUpperCase()
  const conocida = [...TRANSACCIONES].sort((a, b) => b.length - a.length).find((t) => new RegExp(`(?<![A-Z0-9_/-])${t.replace('-', '\\-')}(?![A-Z0-9_])`).test(mayus))
  return conocida ?? TRANSACCION_POR_FORMA.exec(texto)?.[1] ?? ''
}

export function mensajeDelTexto(texto: string): string {
  const dicho = /\bmensaje\s+(?:de error\s+)?([A-Z0-9]{1,4})\s?(\d{3})\b/i.exec(texto)
  if (dicho) return `${dicho[1]!.toUpperCase()} ${dicho[2]}`
  // Todas las coincidencias, no la primera: «P2 123» es una prioridad, y el mensaje puede venir después.
  for (const m of texto.matchAll(/(?<![A-Za-z0-9])([A-Z][A-Z0-9]{1,3}) (\d{3})(?![0-9])/g)) if (!/^P[1-4]$/.test(m[1]!)) return `${m[1]} ${m[2]}`
  return /\b(CFDI\d{5})\b/i.exec(texto)?.[1]?.toUpperCase() ?? ''
}

export function moduloDelTexto(texto: string): EntradaCaso['modulo'] | null {
  const nombrado = MODULO_POR_NOMBRE.exec(texto)?.[1]
  if (nombrado) return NOMBRE_A_MODULO[nombrado] ?? null
  return MODULO_POR_TEXTO.find(([re]) => re.test(texto))?.[1] ?? null
}

/**
 * La entrada de un caso escrito en la conversación, como la llenaría el formulario: el texto entero es el síntoma, y la
 * transacción, el mensaje, el módulo, el sistema, la sociedad y el periodo salen de lo que dice. Lo que no dice se supone
 * y se dice (`supuestos`). Sin evidencia: en la conversación no se adjuntan muestras. El agente vuelve a leer todo del
 * texto al categorizar, así que esto no decide nada que él no vea.
 */
export function entradaDelTexto(texto: string): { entrada: EntradaCaso; supuestos: string[] } {
  const supuestos: string[] = []
  const s4 = /\bS\s?\/?\s?4(?:\s?HANA)?\b|S4HANA/i.test(texto)
  const ecc = /\bECC\b|\bR\/3\b|\bERP\s?6/i.test(texto)
  if (!s4 && !ecc) supuestos.push('el sistema es S/4HANA (no lo dijiste)')
  const modulo = moduloDelTexto(texto)
  if (!modulo) supuestos.push('el módulo es «Otro» (no lo reconocí)')
  const sociedad = /\bsociedad\s+([A-Za-z0-9]{1,10})\b/i.exec(texto)?.[1] ?? ''
  const periodo = /\bperiodo\s+(\d{4}[/-]\d{2})\b/i.exec(texto)?.[1] ?? ''
  const entrada: EntradaCaso = {
    sistema: ecc && !s4 ? 'ECC' : 'S4HANA', modulo: modulo ?? 'Otro', transaccion: transaccionDelTexto(texto).slice(0, 30), mensaje: mensajeDelTexto(texto),
    sociedad, periodo, sintoma: texto.trim().slice(0, 2000), intento: '', muestras: [],
  }
  return { entrada, supuestos }
}

/** «S/4HANA · MM · MIGO · M7 053»: el caso en una línea, sin el síntoma. */
export function resumenDeEntrada(e: EntradaCaso): string {
  return [e.sistema === 'S4HANA' ? 'S/4HANA' : 'ECC', e.modulo, e.transaccion, e.mensaje].filter(Boolean).join(' · ')
}

export const fechaCorta = (iso: string): string => new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

// --- Qué faltaba: regla, fuente, umbral o categoría ------------------------------------------------------------------

export type Falta = 'regla' | 'fuente' | 'umbral' | 'categoria'
export const NOMBRE_DE_LA_FALTA: Readonly<Record<Falta, string>> = { regla: 'la regla', fuente: 'la fuente', umbral: 'el umbral', categoria: 'una categoría segura' }
const COMO_SE_ARREGLA: Readonly<Record<Falta, string>> = {
  regla: 'enséñamelo en el caso, en la mesa. Queda como propuesta, y una regla nueva la firma el laboratorio con una fuente que se pueda citar.',
  fuente: 'sin una fuente que se pueda citar no aplico una regla: el laboratorio tiene que citarla.',
  umbral: 'dime en tu veredicto si la regla está bien: el laboratorio sube su grado cuando se valida, y entonces la aplico.',
  categoria: 'escríbeme la transacción y el mensaje de error: con eso la categoría deja de quedar en duda.',
}

/** Lo que faltaba para no decir «no lo sé», leído del resultado de la corrida. `null` si no lo dijo. */
export function faltaEn(c: Pick<CasoVista, 'resultado'>): { falta: Falta; porque: string } | null {
  const r = c.resultado
  if (r.tipo !== 'sin_solucion' && !(r.cita ?? '').trim()) return { falta: 'fuente', porque: `encontré la regla ${r.titulo ?? ''} (${r.regla ?? '¿?'}), pero no trae una cita que se pueda revisar` }
  if (r.tipo === 'grado_insuficiente') {
    return { falta: 'umbral', porque: `encontré la regla «${r.titulo}» (${r.regla}), con su fuente (${r.cita}), pero su grado es «${r.grado}» y para aplicarla sola el umbral es «probable» o «validada»` }
  }
  if (r.tipo === 'solucion') return null
  const razon = r.razon.trim()
  if (/sin regla aplicable/i.test(razon)) return { falta: 'regla', porque: 'ninguna regla de lo que sé aplica a tu caso (ninguna categoría casó con lo que escribiste)' }
  const duda = /^clasificaci[oó]n dudosa:\s*(.+)$/i.exec(razon)
  if (duda) return { falta: 'categoria', porque: `la categoría quedó en duda (${duda[1]}), y sin una categoría segura no aplico ninguna regla` }
  if (/^contradicci[oó]n entre reglas/i.test(razon)) return { falta: 'regla', porque: `dos reglas vigentes se contradicen (${razon}): falta una sola que mande` }
  if (/^excede tope/i.test(razon)) return { falta: 'umbral', porque: `${razon}: tu caso pasa el umbral de la regla` }
  if (/no tiene caso en la matriz/i.test(razon)) return { falta: 'regla', porque: `${razon}: la regla existe, pero le falta su caso` }
  return { falta: 'regla', porque: razon ? `el motor dijo: ${razon}` : 'el motor no devolvió una regla' }
}

// --- Las respuestas --------------------------------------------------------------------------------------------------

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const sinPunto = (s: string) => s.trim().replace(/[.\s]+$/, '')

/** Los pasos en una línea cada uno, numerados como se ven en la mesa (de arriba abajo). */
export function pasosNumerados(pasos: readonly PasoMesa[]): string {
  return pasos.map((p, k) => `${k + 1}. ${p.titulo}: ${sinPunto(p.sale)}`).join('\n')
}

/** El resultado de una corrida, en palabras de la mesa. */
export function resultadoEnPalabras(c: CasoVista): string {
  const r = c.resultado
  if (r.tipo === 'solucion') {
    const plan = c.planes.at(-1)
    const fallan = plan?.supervisor.fallan.slice(0, 2).map(sinPunto).join('; ')
    const sala = plan?.mensaje && !plan.decision ? ' El plan quedó en la sala, esperando tu decisión en la mesa.' : plan && plan.supervisor.resultado !== 'a_la_sala' ? ` El supervisor no dejó pasar el plan a la sala${fallan ? ` (${fallan})` : ''}.` : ''
    return `encontró la regla «${r.titulo}» (${r.regla}), grado ${r.grado}, con su fuente: ${r.cita}.${sala}`
  }
  if (r.tipo === 'grado_insuficiente') return `encontró la regla «${r.titulo}» (${r.regla}), pero su grado (${r.grado}) no alcanza para aplicarla sola: la revisas tú.`
  const f = faltaEn(c)
  const sandbox = c.sandbox?.veredicto === 'entra' ? ' Entró al sandbox: puedes enseñarle en el caso.' : c.sandbox ? ' Quedó en cuarentena (RR. HH. o nómina, o un texto con forma de dato personal): ese caso no se aprende.' : ''
  return `no lo sé. ${capital(f ? f.porque : sinPunto(r.razon))}.${sandbox}`
}

export type OrigenDelCaso = 'escrito' | 'anterior' | 'ultimo'

/** Lo que contesta el asistente después de correr un caso. */
export function respuestaDeCorrida(c: CasoVista, origen: OrigenDelCaso, supuestos: readonly string[] = []): string {
  const de = origen === 'ultimo' ? `Volví a correr tu último caso de la mesa (${resumenDeEntrada(c.entrada)})` : `Corrí tu caso (${resumenDeEntrada(c.entrada)})`
  const kBusca = c.pasos.findIndex((p) => p.etapa === 'busca')
  const dijo = faltaEn(c) && kBusca >= 0 ? `\nSi quieres saber qué faltaba, pregúntame: «¿por qué dijiste no lo sé en el paso ${kBusca + 1}?».` : ''
  return [
    `${de} con el agente de la mesa, sin modelo. Quedó guardado en tu mesa.`,
    supuestos.length ? `Supuse que ${supuestos.join(' y que ')}.` : '',
    `Resultado: ${resultadoEnPalabras(c)}`,
    `Paso a paso:\n${pasosNumerados(c.pasos)}`,
  ].filter(Boolean).join('\n') + dijo
}

/** «paso 3», «paso tres», «el tercer paso», «3.er paso»: el número del paso, o `null` si no lo dice. */
const ORDINALES: Readonly<Record<string, number>> = { primer: 1, primero: 1, segundo: 2, tercer: 3, tercero: 3, cuarto: 4, quinto: 5, sexto: 6, septimo: 7, octavo: 8, noveno: 9, decimo: 10 }
const CARDINALES: Readonly<Record<string, number>> = { uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 }
export function pasoPedido(texto: string): number | null {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ºª°]/g, 'o').toLowerCase()
  const cifra = /\bpaso\s*(?:numero|no\.?|#)?\s*(\d{1,2})\b/.exec(t) ?? /\b(\d{1,2})\s*(?:\.?\s*(?:o|er|ero|ro|do|to|vo|no|mo))?\s*paso\b/.exec(t)
  if (cifra) return Number(cifra[1])
  // «pasó» también se lee «paso»: se prueban todas las coincidencias, no solo la primera.
  for (const m of t.matchAll(/\bpaso\s+([a-z]+)\b/g)) if (CARDINALES[m[1]!]) return CARDINALES[m[1]!]!
  for (const m of t.matchAll(/\b([a-z]+)\s+paso\b/g)) if (ORDINALES[m[1]!]) return ORDINALES[m[1]!]!
  return null
}

/**
 * Por qué dijo «no lo sé» en un paso de la ÚLTIMA corrida: lo que faltaba (regla, fuente, umbral o categoría), leído de
 * la traza guardada. Si en ese paso no lo dijo, lo dice y señala dónde sí. Sin corridas, no inventa una.
 */
export function explicaPaso(c: CasoVista | undefined, n: number | null): string {
  if (!c) return 'Todavía no has corrido ningún caso en la mesa: no tengo una corrida que explicar. Escríbeme uno y dime «prueba este caso».'
  const quien = `tu última corrida (${resumenDeEntrada(c.entrada)}, del ${fechaCorta(c.creado)})`
  if (n !== null && (n < 1 || n > c.pasos.length)) return `${capital(quien)} tiene ${c.pasos.length} pasos:\n${pasosNumerados(c.pasos)}\n¿De cuál me preguntas?`
  const kBusca = c.pasos.findIndex((p) => p.etapa === 'busca')
  const k = n === null ? kBusca : n - 1
  const paso = c.pasos[k]
  const f = faltaEn(c)
  if (!paso) return `En ${quien} no encontré el paso donde busca en lo que sabe.`
  if (paso.etapa !== 'busca' || !f) {
    const donde = f && kBusca >= 0 ? `\nEl «no lo sé» fue en el paso ${kBusca + 1} («${c.pasos[kBusca]!.titulo}»). Qué faltaba: ${NOMBRE_DE_LA_FALTA[f.falta]}: ${f.porque}.` : '\nEn esa corrida no dije «no lo sé».'
    return `En el paso ${k + 1} («${paso.titulo}») de ${quien} no dije «no lo sé». La traza dice: «${sinPunto(paso.sale)}».${donde}`
  }
  const entendio = c.pasos.find((p) => p.etapa === 'entiende')?.sale
  const cuarentena = c.sandbox && c.sandbox.veredicto !== 'entra' ? 'Además, el caso quedó en cuarentena (RR. HH. o nómina, o un texto con forma de dato personal): ese no se aprende.' : ''
  return [
    `En el paso ${k + 1} («${paso.titulo}») de ${quien}, la traza dice: «${sinPunto(paso.sale)}».`,
    `Qué faltaba: ${NOMBRE_DE_LA_FALTA[f.falta]}. ${capital(f.porque)}.`,
    entendio ? `Lo que sí tenía (paso «Entiende el caso»): ${sinPunto(entendio)}.` : '',
    cuarentena,
    `Para que lo sepa la próxima vez: ${COMO_SE_ARREGLA[f.falta]}`,
  ].filter(Boolean).join('\n')
}

const VALORADO: Readonly<Record<Valoracion, string>> = { correcto: 'dijiste que es correcto', mal: 'dijiste que está mal', corrige: 'lo corregiste', no_se: 'dijiste que no lo sabes' }
const TOPE_POR_GRUPO = 6
const corta = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/**
 * Lo que el experto le enseñó, de SU mesa: lo que enseñó en sus casos, las soluciones que dio en sus veredictos y lo que
 * validó del conocimiento. Lo de otra identidad no llega aquí: la vista del servidor ya viene filtrada por la suya.
 */
export function loQueMeEnsenaste(casos: readonly CasoVista[], candidatos: Pick<CandidatosVista, 'candidatos' | 'mias'> | null): string {
  const ensenado = casos.flatMap((c) => c.ensenanza.filter((t) => t.autor === 'tu').map((t) => ({ t, c })))
  const soluciones = casos.filter((c) => c.retro.veredicto?.solucion)
  const validaciones = Object.values(candidatos?.mias ?? {}).sort((a, b) => (a.actualizado < b.actualizado ? 1 : -1))
  if (!ensenado.length && !soluciones.length && !validaciones.length) {
    return 'Todavía no me has enseñado nada en la mesa. Cuando digo «no lo sé» en un caso, me puedes enseñar ahí mismo; y en «Validar conocimiento» puedes decirme si lo que sé de sapstack y de la web es correcto.'
  }
  const partes = ['Esto me enseñaste, según tu mesa:']
  if (ensenado.length) {
    partes.push(`En tus casos (${ensenado.length}):`)
    for (const { t, c } of ensenado.slice(0, TOPE_POR_GRUPO)) {
      const propuesta = c.propuestas.some((p) => p.tipo === 'regla') ? ' Quedó como propuesta de regla para el laboratorio.' : ''
      partes.push(`• «${corta(t.texto)}», en el caso ${resumenDeEntrada(c.entrada)} (${fechaCorta(t.fecha)}).${propuesta}`)
    }
  }
  if (soluciones.length) {
    partes.push(`En tus veredictos, la solución correcta (${soluciones.length}):`)
    for (const c of soluciones.slice(0, TOPE_POR_GRUPO)) partes.push(`• «${corta(c.retro.veredicto!.solucion!)}», en el caso ${resumenDeEntrada(c.entrada)}.`)
  }
  if (validaciones.length) {
    const porId = new Map((candidatos?.candidatos ?? []).map((x) => [x.id, x]))
    partes.push(`Lo que validaste del conocimiento (${validaciones.length}):`)
    for (const v of validaciones.slice(0, TOPE_POR_GRUPO)) {
      const x = porId.get(v.candidato)
      const que = x ? `${x.tipo === 'nota' ? 'SAP Note ' : ''}${x.clave}${x.titulo && !x.titulo.startsWith('(') ? ` (${x.titulo})` : ''}` : v.candidato
      const dicho = v.correccion ?? v.comentario
      partes.push(`• ${que}: ${VALORADO[v.valoracion]}${dicho ? `: «${corta(dicho)}»` : ''}.`)
    }
  }
  const mas = ensenado.length > TOPE_POR_GRUPO || soluciones.length > TOPE_POR_GRUPO || validaciones.length > TOPE_POR_GRUPO
  partes.push(`Todo es propuesta: el laboratorio lo firma fuera de la mesa.${mas ? ' Aquí van los más recientes; el resto está en tus casos.' : ''}`)
  return partes.join('\n')
}
