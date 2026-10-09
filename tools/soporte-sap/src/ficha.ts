/**
 * La ficha de servidor de una instalación (PRP-010, fase 3): su modo, la última medición de `configura:deploy`, las tres
 * preguntas sobre snapshots del SDD §13 con su respuesta escrita y si ya se probó una restauración en ESA máquina.
 * No crea servidores: eso es un cobro, pasa por gate humano y solo se automatiza después de hacerlo tres veces a mano.
 *
 * **No dice «apto» sin la restauración probada (GATE 3)**: un respaldo sin restauración probada no es un respaldo.
 */

/** Lo que escribe `configura:deploy --escribir` en `.despliegue/medicion.json`, sin un solo secreto. */
export interface MedicionDeServidor {
  readonly fecha: string
  readonly modo: string
  readonly tamano: string | null
  readonly proveedor: string | null
  readonly region: string | null
  readonly maquina: { readonly vcpu: number; readonly ramGb: number; readonly discoGb: number | null }
  readonly cabe: boolean | null
  readonly region_estado: string
  readonly respaldo: string
}

/** Las tres preguntas que hay que hacerle al proveedor sobre sus snapshots (SDD §13; dependen de D12). */
export const PREGUNTAS_SNAPSHOT = [
  '¿El snapshot es consistente con el servidor encendido?',
  '¿Incluye los volúmenes?',
  '¿Sobrevive a que se borre el servidor?',
] as const

export interface FichaDeServidor {
  readonly consultora: string
  readonly modo: 'gestionado' | 'despacho'
  readonly medicion: MedicionDeServidor | null
  /** Una respuesta escrita por pregunta, en el orden de `PREGUNTAS_SNAPSHOT`; null mientras no se haya preguntado. */
  readonly respuestas: readonly (string | null)[]
  /** La restauración probada en esta máquina (GATE 3), con su evidencia; null si no se ha probado. */
  readonly restauracion: { readonly fecha: string; readonly evidencia: string } | null
}

/** Apto solo si todo está: medida y cabe, la región cumple, el respaldo declarado, las tres respuestas y GATE 3. */
export function veredictoDeFicha(f: FichaDeServidor): { readonly apto: boolean; readonly faltan: readonly string[] } {
  const faltan: string[] = []
  const m = f.medicion
  if (!m) faltan.push('medir la máquina con configura:deploy -- --escribir')
  else {
    if (m.cabe === false) faltan.push(`la máquina no cabe en su tamaño (${m.tamano})`)
    if (m.cabe === null) faltan.push('el tamaño contratado: sin él no hay contra qué medir')
    if (m.region_estado !== 'cumple') faltan.push(`la región: ${m.region_estado}`)
    if (m.respaldo !== 'declarado') faltan.push(`el destino de respaldo inmutable: ${m.respaldo}`)
  }
  const sinRespuesta = PREGUNTAS_SNAPSHOT.filter((_, k) => !f.respuestas[k]?.trim())
  if (sinRespuesta.length) faltan.push(`responder ${sinRespuesta.length} de ${PREGUNTAS_SNAPSHOT.length} preguntas sobre snapshots (SDD §13, D12)`)
  if (!f.restauracion) faltan.push('probar una restauración en esta máquina (GATE 3)')
  return { apto: faltan.length === 0, faltan }
}
