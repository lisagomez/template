/**
 * El redactor (spec 004 RF-5 y RF-6, PRP-005 Fase 5): `Resultado` → la respuesta en lenguaje natural.
 *
 * DETERMINISTA, sin modelo: con plantillas no puede inventar un veredicto ni suavizar un fail-safe.
 * - Solo se redacta un `Resultado` validado. Un `FalloSinVeredicto` no pasa por aquí: tiene su propia
 *   plantilla (`redactaFallo`), que no dice nada con forma de respuesta.
 * - Cada motivo sin veredicto tiene su frase, y ninguna afirma nada (RF-6).
 * - La fuente se cita **solo si el dominio es de fuente pública** (RF-5). En uno de reglas internas no
 *   sale de qué regla, tabla o documento vino, ni las banderas del motor, que la nombran.
 * - La fecha de corte y la fecha supuesta van siempre visibles (RF-13).
 */
import { Resultado, type ConceptoEvaluado, type Conocimiento, type FalloSinVeredicto } from '../contrato.js'

const FRASES: Readonly<Record<string, string>> = {
  permitido: 'está permitido',
  no_permitido: 'no está permitido',
  deducible: 'es deducible',
  no_deducible: 'no es deducible',
  dudoso: 'no se puede afirmar sin revisar el caso: depende de condiciones que la pregunta no aclara',
}

/** Las banderas que añade el motor nombran reglas y citas: en un dominio interno no se muestran. */
const DEL_MOTOR = ['Reglas vigentes en conflicto', 'Importe ']

function cuerpo(c: ConceptoEvaluado, publica: boolean, frases: Readonly<Record<string, string>>): string[] {
  const sobre = `Sobre «${c.descripcion}»:`
  switch (c.motivo) {
    case 'sin_regla':
      return [`${sobre} no hay información suficiente para responder. Ninguna regla del conocimiento registrado aplica, y no voy a suponer una.`]
    case 'clasificacion_dudosa':
      return [`${sobre} no tengo claro de qué trata, así que no respondo. ¿Puedes precisar la pregunta?`]
    case 'conflicto':
      return [`${sobre} no puedo afirmar nada: hay reglas vigentes que dicen cosas distintas y hace falta una revisión humana.`]
    case 'tope_excedido':
      return [`${sobre} no puedo afirmar nada: el importe supera el tope que admite la regla.`]
    case 'regla': {
      const frase = frases[c.veredicto!] ?? FRASES[c.veredicto!] ?? `el veredicto es «${c.veredicto}»`
      const cita = publica && c.fuente ? ` Fuente: ${c.fuente.cita} (vigente desde ${c.fuente.vigencia.desde}${c.fuente.vigencia.hasta ? ` hasta ${c.fuente.vigencia.hasta}` : ''}).` : ''
      return [`${sobre} ${frase}.${cita}`]
    }
  }
}

function detalle(c: ConceptoEvaluado, publica: boolean): string[] {
  const banderas = publica ? c.banderas : c.banderas.filter((b) => !DEL_MOTOR.some((p) => b.startsWith(p)))
  return [
    ...(c.motivo === 'regla' && c.checklist.length > 0 ? ['Para que aplique:', ...c.checklist.map((x) => `- ${x}`)] : []),
    ...(banderas.length > 0 ? ['Atención:', ...banderas.map((x) => `- ${x}`)] : []),
  ]
}

export function redacta(resultado: Resultado, conocimiento: Conocimiento): string {
  const r = Resultado.parse(resultado)
  const cita = new Map(conocimiento.dominios.map((d) => [d.clave, d.cita]))
  const frases = conocimiento.dimensiones.find((d) => d.codigo === r.contexto.dimension)?.frases ?? {}
  const partes = r.conceptos.flatMap((c) => {
    const publica = c.dominio !== null && cita.get(c.dominio) === 'publica'
    return [...cuerpo(c, publica, frases), ...detalle(c, publica), '']
  })
  return [
    ...partes,
    r.corte ? `Conocimiento con corte al ${r.corte}.` : 'No hay conocimiento registrado para este ámbito.',
    ...(r.contexto.fecha_supuesta ? [`La pregunta no decía la fecha del hecho: se juzgó con las reglas vigentes el ${r.contexto.fecha}.`] : []),
    r.disclaimer,
  ].join('\n')
}

const FALLOS: Readonly<Record<FalloSinVeredicto['tipo'], string>> = {
  parser_no_disponible:
    'No puedo responder ahora: no pude interpretar la pregunta. No es que no haya una regla: es que no la llegué a buscar. Vuelve a intentarlo en un momento.',
  conocimiento_no_disponible: 'No puedo responder ahora: el conocimiento con el que respondo no está disponible.',
  pregunta_invalida: 'No puedo responder a la pregunta así: no pude ubicar de qué ámbito es, o es demasiado larga. ¿Puedes precisarla?',
}

/** La plantilla del fallo: dice que no hay respuesta y por qué, sin nada con forma de veredicto. */
export function redactaFallo(f: FalloSinVeredicto): string {
  return FALLOS[f.tipo]
}
