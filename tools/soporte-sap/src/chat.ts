/**
 * El chat del HIL: la conversación 1:1 del superadministrador o del experto con el agente A2A. Convive
 * con la sala sin abrir un segundo camino para aprobar:
 *
 * - contesta una MÉTRICA con el corte semántico (valor, fuente y definición) o una pregunta de
 *   SOPORTE con la regla del grafo (solución y cita); sin fuente, «no lo sé»;
 * - lo que pide una aprobación o involucra a otros SE PROMUEVE a un hilo de la sala, con su contexto
 *   como dato, y ahí espera la fila humana. Este módulo no conoce la tabla de aprobaciones ni la
 *   función que las registra: no puede aprobar;
 * - el experto enseña (deja una PROPUESTA en el sandbox, nunca una regla); el superadministrador
 *   interroga la operación. Cada rol ve lo suyo.
 *
 * Todo lo que escribe una persona es DATO: no se ejecuta, no cambia el rol, no cambia el alcance.
 * Determinista y sin modelo: el modelo, si un día redacta, redacta DESPUÉS de esto, no decide.
 */
import { respondeMetrica } from './superficies.js'
import { consultaMatriz, type MotorReglas, type EntradaMatriz } from './matriz.js'
import type { Corte, Lector } from './corte.js'
import type { Sistema } from './simulador.js'
import { anonimiza, type Validadores } from './anonimiza.js'
import { generaliza } from './generaliza.js'

export type RolHil = 'superadmin' | 'experto'
export interface SesionHil { readonly usuario: string; readonly rol: RolHil }

export interface FuenteChat { readonly tipo: 'metrica' | 'regla'; readonly cita: string }

/** Un plan que espera aprobación en la sala (lo que el chat conoce de ella: dónde está, nada más). */
export interface PlanEnSala { readonly taskId: string; readonly mensaje: string; readonly canal: string; readonly resumen: string }

/** Lo que el chat entrega para publicar en la sala: la app lo pasa a `publica`. Sin bloques de acción. */
export interface PublicacionChat {
  readonly id: string
  readonly canal: string
  readonly hilo: string
  readonly autor: { readonly tipo: 'agente'; readonly id: string }
  readonly cuerpo: string
  readonly origen: 'chat_hil'
  readonly creado: string
}

/** Un caso del sandbox que el chat conoce: la consultora de la que es (lo que una enseñanza necesita para quedar a medida). */
export interface CasoDelSandbox { readonly incidencia: string; readonly consultora: string }

/**
 * Una enseñanza del experto: PROPUESTA del sandbox, ANONIMIZADA y A MEDIDA de la consultora del caso por defecto
 * (PRP-010 H-19). Al núcleo, que leen todas las consultoras, solo la sube el superadministrador con `alNucleo`,
 * generalizada; y la base la rechaza si llega sin generalizar. Decide una persona, en otro lado.
 */
export interface PropuestaDeEnsenanza {
  readonly tipo: 'caso'
  readonly origen: 'sandbox'
  readonly alcance: 'a_medida' | 'nucleo'
  /** La consultora del caso; `null` solo en el núcleo (la base exige lo mismo: `ss_a_medida_es_de_alguien`). */
  readonly consultora: string | null
  readonly estado: 'propuesta'
  readonly propuestaPor: string
  readonly contenido: string
}

/** Un CLI que el experto enseñó como operación repetible: PROPUESTA (imprimirlo o adoptarlo es CDC, C1). */
export interface PropuestaDeCli {
  readonly tipo: 'cli'
  readonly nombre: string
  readonly operacion: string
  /** Cambia estado en el SAP del cliente: no es de solo lectura, y por eso va en dry-run por defecto. */
  readonly readOnly: false
  readonly dryRunPorDefecto: true
  readonly estado: 'propuesta'
  readonly nota: string
}

const OPERACION = /\b(limpi\w*|reprocesa\w*|reinici\w*|desbloque\w*|borr\w*|reenvi\w*|regenera\w*)\s+(?:la |el |los |las )?([\p{L} ]{3,40}?)(?=[,.;:]|$| del | de la | en )/u
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)

/** Si lo que enseña el experto es una operación repetible, el agente propone un CLI (no lo imprime). */
export function propuestaDeCli(texto: string): PropuestaDeCli | null {
  const m = OPERACION.exec(texto)
  if (!m) return null
  const operacion = `${m[1]} ${m[2]}`.trim()
  return {
    tipo: 'cli', nombre: `ss-${slug(operacion)}`, operacion, readOnly: false, dryRunPorDefecto: true, estado: 'propuesta',
    nota: 'imprimir o adoptar un CLI es CDC (C1): queda como propuesta, sin imprimir; llama al simulador, nunca inventa una respuesta',
  }
}

export type RespuestaHil =
  | { readonly tipo: 'valor' | 'regla'; readonly texto: string; readonly fuentes: readonly FuenteChat[] }
  | { readonly tipo: 'promovida'; readonly texto: string; readonly publicacion: PublicacionChat }
  /** `caso`: de qué caso nació, para registrar su origen aparte (D1, PRP-011); la propuesta no lo lleva. */
  | { readonly tipo: 'propuesta'; readonly texto: string; readonly propuesta: PropuestaDeEnsenanza; readonly cli: PropuestaDeCli | null; readonly caso: CasoDelSandbox }
  | { readonly tipo: 'no_lo_se' | 'no_permitido'; readonly texto: string }

export interface ContextoChat {
  readonly corte: Corte
  readonly entidades: Parameters<typeof respondeMetrica>[3]
  readonly motor: MotorReglas
  readonly matriz: readonly EntradaMatriz[]
  readonly planes: readonly PlanEnSala[]
  /** El delimitador de contenido de la sala (inyectado: el texto humano viaja como DATO). */
  readonly delimitaDato: (texto: string) => string
  /** Los casos del sandbox: una enseñanza nombra el suyo y queda a medida de su consultora. */
  readonly casos: readonly CasoDelSandbox[]
  readonly validadores: Validadores
  readonly agente: string
  readonly ahora: string
  readonly nuevoId: () => string
}

/** Lo que el experto no ve: el costo y la salud de las consultoras son del superadministrador. */
const SOLO_SUPERADMIN = new Set(['horas_consultor', 'horas_por_ticket', 'salud_cuenta', 'cobertura_mapeo'])

const sinAcentos = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '')
const PIDE_APROBAR = /\b(aprueb\w*|aprob\w*|autoriz\w*|ejecut\w*|aplic\w* (el|la) (plan|cambio|solucion)|da(le)? (el )?(ok|visto bueno)|firm\w*)\b/
const ENSENA = /\b(te enseno|ensenar|ensename|aprende esto|toma este caso)\b/
const PIDE_METRICA = /\b(cual fue|cuanto|cuantas|cuantos|como va|como fue|mttr|backlog|sla|volumen|horas|salud|reapertura|primer contacto|cartera|riesgo)\b/
const PIDE_SOLUCION = /\b(que hago|como (se )?resuelv\w*|solucion|que hacemos|como arreglo|error|mensaje|dump|no deja|no puede|rechaz\w*)\b/
const SISTEMA = /\b(s\/?4\s?hana|s4)\b/i

export function respondeHil(ctx: ContextoChat, sesion: SesionHil, texto: string): RespuestaHil {
  const t = sinAcentos(texto)
  if (PIDE_APROBAR.test(t)) return promueve(ctx, sesion, texto)
  if (ENSENA.test(t)) return ensena(ctx, sesion, texto)
  if (PIDE_METRICA.test(t) && !PIDE_SOLUCION.test(t)) return metrica(ctx, sesion, texto)
  if (PIDE_SOLUCION.test(t)) return regla(ctx, texto)
  return { tipo: 'no_lo_se', texto: 'No lo sé: no reconozco una pregunta sobre una métrica ni sobre una incidencia. No respondo sin una fuente.' }
}

const escapa = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** El experto enseña: a medida de la consultora del caso que nombra, y anonimizado; con dudas, no se guarda. */
function ensena(ctx: ContextoChat, sesion: SesionHil, texto: string): RespuestaHil {
  if (sesion.rol !== 'experto') return { tipo: 'no_permitido', texto: 'Enseñar en el sandbox es del experto. Como superadministrador puedes preguntar por la operación.' }
  const caso = ctx.casos.find((c) => new RegExp(`(?<![\\w-])${escapa(c.incidencia)}(?![\\w-])`).test(texto))
  if (!caso) return { tipo: 'no_lo_se', texto: 'No sé de qué caso es: nombra su incidencia. La propuesta queda a medida de la consultora del caso; al núcleo solo la sube el superadministrador, generalizada.' }
  const a = anonimiza(texto, ctx.validadores)
  if (a.veredicto === 'cuarentena') return { tipo: 'no_permitido', texto: `No la guardo como propuesta: ${a.senales.join('; ')}. Escríbela sin el dato.` }
  return {
    tipo: 'propuesta', texto: `Lo dejo como PROPUESTA a medida de la consultora de ${caso.incidencia}, anonimizada. Al núcleo solo la sube el superadministrador, generalizada; una regla nueva la firma el laboratorio en tools/conocimiento, y yo no la siembro.`,
    propuesta: { tipo: 'caso', origen: 'sandbox', alcance: 'a_medida', consultora: caso.consultora, estado: 'propuesta', propuestaPor: `agente:${ctx.agente} (enseñado por ${sesion.usuario})`, contenido: ctx.delimitaDato(a.texto) },
    cli: propuestaDeCli(a.texto),
    caso,
  }
}

/**
 * Subir una enseñanza al NÚCLEO (D1, D2; PRP-010 H-19): la decide el superadministrador y va GENERALIZADA, sin lo
 * que identifica al cliente ni a la consultora (`nombres`). Si al generalizar queda una señal, no sube: lanza.
 */
export function alNucleo(p: PropuestaDeEnsenanza, v: Validadores, nombres: readonly string[]): PropuestaDeEnsenanza {
  if (p.alcance === 'nucleo') return p
  const g = generaliza(p.contenido, v, nombres)
  if (g.veredicto === 'cuarentena') throw new Error(`no sube al núcleo: ${g.senales.join('; ')}`)
  return { ...p, alcance: 'nucleo', consultora: null, contenido: g.texto }
}

function metrica(ctx: ContextoChat, sesion: SesionHil, texto: string): RespuestaHil {
  const lector: Lector = { nivel: 'N1' }
  const r = respondeMetrica(ctx.corte, lector, texto, ctx.entidades)
  if (r.tipo === 'no_lo_se' || r.fuente === null) return { tipo: 'no_lo_se', texto: r.texto }
  const nombre = r.fuente.split(' · ')[1] ?? ''
  if (sesion.rol === 'experto' && SOLO_SUPERADMIN.has(nombre)) return { tipo: 'no_permitido', texto: 'Esa métrica es del superadministrador (costo y salud de las consultoras).' }
  const def = ctx.corte.metricas.find((m) => m.nombre === nombre)
  return { tipo: 'valor', texto: `${r.texto}. Definición: ${def?.descripcion ?? 'sin definición en el catálogo'}`, fuentes: [{ tipo: 'metrica', cita: r.fuente }] }
}

function regla(ctx: ContextoChat, texto: string): RespuestaHil {
  const sistema: Sistema = SISTEMA.test(texto) ? 'S4HANA' : 'ECC'
  const c = consultaMatriz(ctx.motor, ctx.matriz, texto, sistema)
  if (c.tipo === 'sin_solucion') return { tipo: 'no_lo_se', texto: `No lo sé: el grafo no tiene una regla para esto (${c.motivo}). Va al sandbox para aprenderlo con el experto.` }
  const aviso = c.tipo === 'grado_insuficiente' ? ' Su grado no alcanza para producción: lo revisa el experto antes de aplicarlo.' : ''
  return { tipo: 'regla', texto: `${c.entrada.titulo}: ${c.entrada.solucion.resumen.replace(/\.$/, '')}.${aviso}`, fuentes: [{ tipo: 'regla', cita: `${c.fuente.clave} · ${c.fuente.cita} · ${c.fuente.url}` }] }
}

function promueve(ctx: ContextoChat, sesion: SesionHil, texto: string): RespuestaHil {
  const plan = ctx.planes.find((p) => texto.includes(p.taskId))
  if (!plan) return { tipo: 'no_lo_se', texto: 'No lo sé: no encuentro el plan que quieres aprobar. Las aprobaciones se deciden en la sala, sobre el plan publicado.' }
  return {
    tipo: 'promovida',
    texto: `No apruebo desde el chat. Llevé tu petición al hilo del plan ${plan.taskId} en la sala; ahí decide una persona con su sesión.`,
    publicacion: {
      id: ctx.nuevoId(), canal: plan.canal, hilo: plan.mensaje, autor: { tipo: 'agente', id: ctx.agente }, origen: 'chat_hil', creado: ctx.ahora,
      cuerpo: `Desde el chat del HIL (${sesion.rol}) piden decidir el plan ${plan.taskId} («${plan.resumen}»). La decisión es una fila humana en este hilo. Lo que escribió, como dato:\n${ctx.delimitaDato(texto)}`,
    },
  }
}
