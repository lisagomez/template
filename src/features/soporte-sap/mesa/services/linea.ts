/**
 * La línea de tiempo de un caso: cada paso es un evento REAL de la cadena de la incidencia (`anota` en el runtime), con
 * su fecha, y dicho en el idioma de un experto SAP, no en el de la gobernanza del laboratorio. Lo que no está en la
 * cadena no se dibuja. Si el producto cambia lo que hace, la línea cambia con él.
 */
import type { IncidenciaLab } from '../../services/runtime'
import type { PasoMesa, Quien } from './modelo'

type Evento = IncidenciaLab['cadena'][number]
type Datos = Readonly<Record<string, unknown>>
const txt = (x: unknown): string => (typeof x === 'string' ? x : x === null || x === undefined ? '' : String(x))
const lista = (x: unknown): string[] => (Array.isArray(x) ? x.map(txt) : [])

const VIA: Readonly<Record<string, string>> = {
  ocr_local: 'la leyó con OCR (Tesseract, dentro del laboratorio)', capa0: 'la leyó por la capa de texto del PDF',
  xml: 'la leyó como CFDI (el XML es el documento fiscal)', sin_extraccion: 'la guardó sin poder leerla',
}

/** El paso que corresponde a un evento. `null` si el evento no es parte de lo que el experto necesita ver. */
function paso(e: Evento, i: IncidenciaLab): Omit<PasoMesa, 'clave' | 'quien' | 'quienDice' | 'fecha' | 'ms'> | null {
  const d = e.datos as Datos
  switch (e.tipo) {
    case 'RECIBIDA': return { etapa: 'recibe', titulo: 'Recibe tu caso', entra: txt(d['titulo']), sale: `Incidencia ${i.id} del cliente sintético (${i.sistema === 'S4HANA' ? 'S/4HANA' : 'ECC'})`, porque: null, detalle: [], tono: 'neutro' }
    case 'ADJUNTO_LEIDO': {
      if (d['rechazado']) return { etapa: 'evidencia', titulo: 'Revisa la evidencia', entra: txt(d['nombre']), sale: `No la aceptó: ${txt(d['rechazado'])}`, porque: null, detalle: [], tono: 'mal' }
      const a = i.adjuntos.find((x) => x.nombre === d['nombre'])
      const campos = a && a.aceptado ? a.campos.slice(0, 8).map((c) => `${c.campo}: ${c.valor}`) : []
      return { etapa: 'evidencia', titulo: 'Lee la evidencia', entra: txt(d['nombre']), sale: `${VIA[txt(d['via'])] ?? txt(d['via'])}: ${txt(d['campos'])} campos`, porque: a && a.aceptado && a.aviso ? a.aviso : null, detalle: campos, tono: Number(d['campos']) > 0 ? 'bien' : 'aviso' }
    }
    case 'CATEGORIZADA': return {
      etapa: 'entiende', titulo: 'Entiende el caso', entra: null,
      sale: [d['modulo'] ? `módulo ${txt(d['modulo'])}` : 'sin módulo', d['transaccion'] ? `transacción ${txt(d['transaccion'])}` : null, d['mensaje'] ? `mensaje ${txt(d['mensaje'])}` : null, `prioridad ${txt(d['prioridad'])}`].filter(Boolean).join(' · '),
      porque: i.clasificacion.razones.length ? i.clasificacion.razones.join('; ') : null, detalle: lista(d['etiquetas']).map((x) => `etiqueta: ${x}`), tono: 'neutro',
    }
    case 'VEREDICTO_GRAFO': {
      const q = i.consulta
      if (q.tipo === 'sin_solucion') return { etapa: 'busca', titulo: 'Busca en lo que sabe', entra: null, sale: 'No lo sé: no tiene una regla para este caso', porque: q.razon, detalle: [], tono: 'aviso' }
      const insuficiente = q.tipo === 'grado_insuficiente'
      return { etapa: 'busca', titulo: 'Busca en lo que sabe', entra: null, sale: `${insuficiente ? 'Encontró una regla, pero su grado no alcanza para aplicarla' : 'Encontró una regla'}: ${q.entrada.titulo} (${q.entrada.regla})`, porque: `${q.fuente.cita} · grado ${q.entrada.grado}`, detalle: [q.razon], tono: insuficiente ? 'aviso' : 'bien' }
    }
    case 'AVISO_PRESUPUESTO': case 'A_HUMANO_POR_PRESUPUESTO': case 'EN_ESPERA_POR_PRESUPUESTO':
      return { etapa: 'presupuesto', titulo: e.tipo === 'AVISO_PRESUPUESTO' ? 'Avisa del presupuesto' : 'Lo pasa a una persona', entra: null, sale: txt(d['aviso']), porque: null, detalle: [], tono: 'aviso' }
    case 'PLAN_PREPARADO': {
      const p = i.planes.find((x) => x.plan.version === d['version'])
      return { etapa: 'plan', titulo: `Arma el plan${Number(d['version']) > 1 ? ` (versión ${txt(d['version'])})` : ''}`, entra: null, sale: p ? p.plan.pasos.map((x) => x.descripcion).join('; ') : 'plan preparado', porque: d['error'] ? `le faltan datos: ${txt(d['error'])}` : 'los pasos de la solución de la regla, con los datos de tu caso', detalle: p ? p.plan.pasos.map((x) => Object.entries(x.parametros).map(([k, v]) => `${k} = ${v}`).join(', ')).filter(Boolean) : [], tono: d['error'] ? 'aviso' : 'neutro' }
    }
    case 'VEREDICTO_SUPERVISOR': {
      const p = i.planes[i.planes.length - 1]
      const fallan = p ? p.veredicto.comprobaciones.filter((c) => !c.ok).map((c) => `${c.que}: ${c.detalle}`) : []
      return { etapa: 'plan', titulo: 'Otro agente lo revisa', entra: null, sale: `${txt(d['verdes'])} de ${txt(d['total'])} comprobaciones en verde · ${d['resultado'] === 'a_la_sala' ? 'puede ir a la sala' : 'no pasa'}`, porque: null, detalle: fallan, tono: d['resultado'] === 'a_la_sala' ? 'bien' : 'mal' }
    }
    case 'ESCALADA': return { etapa: 'sala', titulo: 'La consultora lo escala al laboratorio', entra: null, sale: 'Lo ve el laboratorio, en la sala', porque: 'el laboratorio solo ve lo que una consultora le escala', detalle: [], tono: 'neutro' }
    case 'ENVIADA_A_SALA': return { etapa: 'sala', titulo: 'Llega a la sala', entra: null, sale: 'El plan espera la decisión de una persona', porque: 'nada se aplica sin que una persona lo apruebe con su sesión', detalle: [`huella del plan: ${txt(d['sha256']).slice(0, 23)}…`], tono: 'neutro' }
    case 'APROBADA': return { etapa: 'decide', titulo: 'Lo apruebas', entra: null, sale: 'Aprobado con tu sesión, sobre esa huella del plan', porque: null, detalle: [], tono: 'bien' }
    case 'RECHAZADA': return { etapa: 'decide', titulo: 'Lo rechazas', entra: null, sale: 'El plan no se aplica', porque: null, detalle: [], tono: 'mal' }
    case 'A_REVISION': return { etapa: 'decide', titulo: 'Lo mandas a revisión', entra: txt(d['motivo']), sale: 'El agente corrige el plan con tu motivo', porque: null, detalle: [], tono: 'aviso' }
    case 'APLICADA_EN_SIMULADOR': return { etapa: 'aplica', titulo: 'El simulador lo aplica', entra: txt(d['antes']), sale: txt(d['despues']), porque: d['errorDespues'] ? 'el síntoma sigue después de aplicar' : 'el síntoma ya no se reproduce en el simulador (no es tu SAP)', detalle: [], tono: d['errorDespues'] ? 'mal' : 'bien' }
    case 'ANONIMIZADA': return { etapa: 'protege', titulo: 'Lo protege', entra: null, sale: `${txt(d['reemplazos'])} datos reemplazados · ${d['veredicto'] === 'entra' ? 'puede entrar al sandbox' : 'no puede entrar al sandbox'}`, porque: 'sin regla, el caso se aprende en el sandbox, y ahí solo entra anonimizado', detalle: [], tono: d['veredicto'] === 'entra' ? 'bien' : 'aviso' }
    case 'EN_SANDBOX': return { etapa: 'aprende', titulo: 'Entra al sandbox para aprender', entra: null, sale: 'Te toca enseñarle', porque: null, detalle: [], tono: 'neutro' }
    case 'EN_CUARENTENA': return { etapa: 'protege', titulo: 'Queda en cuarentena', entra: null, sale: 'No entra al sandbox: nadie lo aprende', porque: lista(d['senales']).join('; ') || null, detalle: ['la atención y el reloj del SLA siguen igual con su consultora'], tono: 'aviso' }
    case 'PRIMERA_RESPUESTA': case 'RESUELTA': case 'ESPERA_CLIENTE': case 'RESPUESTA_CLIENTE':
      return { etapa: 'atiende', titulo: { PRIMERA_RESPUESTA: 'La consultora responde', RESUELTA: 'La consultora lo da por resuelto', ESPERA_CLIENTE: 'Se pide un dato al cliente', RESPUESTA_CLIENTE: 'El cliente responde' }[e.tipo], entra: null, sale: txt(d['mensaje'] ?? d['pide']) || '—', porque: null, detalle: [], tono: 'neutro' }
    default: return null
  }
}

/**
 * Los pasos de la incidencia, en orden, con quién hizo cada uno y cuánto pasó desde el anterior. `quienEs` traduce el
 * actor de la cadena (el seudónimo del experto, lo hecho en nombre del N3 o del N2, los agentes).
 */
export function lineaDeTiempo(i: IncidenciaLab, quienEs: (actor: string) => { quien: Quien; dice: string }): PasoMesa[] {
  const pasos: PasoMesa[] = []
  let anterior: number | null = null
  for (const e of i.cadena) {
    const p = paso(e, i)
    const t = Date.parse(e.fecha)
    if (p) {
      const q = quienEs(e.actor)
      pasos.push({ ...p, clave: `${e.seq}:${e.tipo}`, quien: q.quien, quienDice: q.dice, fecha: e.fecha, ms: anterior === null ? 0 : Math.max(0, t - anterior) })
    }
    anterior = t
  }
  return pasos
}
