/**
 * El núcleo de la sala: mensajes, hilos de un nivel, aprobaciones como fila humana, el ruteo de
 * menciones y la frontera de contenido. Sin dependencias: el almacén se inyecta (en memoria para el
 * laboratorio; en producción, las tablas de `migraciones/propuesta-sala-a2a.sql` con su RLS).
 *
 * El invariante, también aquí: un componente que ejecuta un modelo no puede fabricar una
 * aprobación. `registraAprobacion` exige un principal HUMANO cuya sesión es la que firma.
 */

export type TipoAutor = 'humano' | 'agente' | 'sistema'
export type Origen = 'sala' | 'espejo_slack' | 'espejo_telegram' | 'espejo_correo' | 'chat_hil'
export type Accion = 'aprobar' | 'rechazar' | 'a_revision'

export interface Principal {
  readonly tipo: TipoAutor
  /** `auth.uid()` de la sesión para un humano; el slug de su Agent Card para un agente. */
  readonly id: string
}

export interface Canal {
  readonly id: string
  readonly tenant: string
  readonly slug: string
  readonly nombre: string
  readonly departamento: string | null
}

export interface BloqueAccion {
  readonly tipo: 'acciones'
  readonly acciones: readonly Accion[]
  /** La huella del artefacto que se aprueba: lo aprobado es ESTO, no otra cosa. */
  readonly sha256: string
  readonly taskId: string
}

export interface Mensaje {
  readonly id: string
  readonly tenant: string
  readonly canal: string
  readonly hilo: string | null
  readonly autor: Principal
  readonly departamento: string | null
  readonly cuerpo: string
  readonly bloques: readonly BloqueAccion[]
  readonly origen: Origen
  readonly creado: string
}

export interface Aprobacion {
  readonly id: string
  readonly tenant: string
  readonly mensaje: string
  readonly accion: Accion
  readonly taskId: string
  readonly sha256: string
  readonly decididaPor: string
  readonly decidida: string
}

export interface Aviso {
  readonly mensaje: string
  readonly texto: string
}

export interface EstadoSala {
  readonly canales: readonly Canal[]
  readonly mensajes: readonly Mensaje[]
  readonly aprobaciones: readonly Aprobacion[]
  readonly participantes: Readonly<Record<string, readonly string[]>>
}

export const salaVacia = (): EstadoSala => ({ canales: [], mensajes: [], aprobaciones: [], participantes: {} })

export class ErrorSala extends Error {
  override readonly name = 'ErrorSala'
}

const exige = (cond: unknown, msg: string): void => {
  if (!cond) throw new ErrorSala(msg)
}

/** El cuerpo de un mensaje es DATO: va delimitado y nunca se interpreta como instrucción. */
export function delimitaDato(cuerpo: string): string {
  const limpio = cuerpo.replaceAll('<<<', '‹‹‹').replaceAll('>>>', '›››')
  return `<<<DATO_DE_LA_SALA\n${limpio}\nDATO_DE_LA_SALA>>>`
}

export function agregaParticipante(s: EstadoSala, tenant: string, usuario: string): EstadoSala {
  const actuales = s.participantes[tenant] ?? []
  return actuales.includes(usuario) ? s : { ...s, participantes: { ...s.participantes, [tenant]: [...actuales, usuario] } }
}

export function creaCanal(s: EstadoSala, c: Canal): EstadoSala {
  exige(!s.canales.some((x) => x.tenant === c.tenant && x.slug === c.slug), `ya existe el canal ${c.slug}`)
  return { ...s, canales: [...s.canales, c] }
}

export interface Publicacion {
  readonly id: string
  readonly canal: string
  readonly hilo?: string | null
  readonly autor: Principal
  readonly departamento?: string | null
  readonly cuerpo: string
  readonly bloques?: readonly BloqueAccion[]
  readonly origen?: Origen
  readonly creado: string
}

/** Publica un mensaje. Impone: participante del tenant, autor coherente, departamento solo de agente, hilos de un nivel. */
export function publica(s: EstadoSala, p: Publicacion): EstadoSala {
  const canal = s.canales.find((c) => c.id === p.canal)
  exige(canal, `no existe el canal ${p.canal}`)
  const tenant = canal!.tenant
  if (p.autor.tipo === 'humano') exige((s.participantes[tenant] ?? []).includes(p.autor.id), 'el humano no participa en esta sala')
  exige(!p.departamento || p.autor.tipo !== 'humano', 'un departamento es atribución de un agente, no de un humano')
  exige(p.cuerpo.trim().length > 0, 'mensaje vacío')
  if (p.hilo) {
    const raiz = s.mensajes.find((m) => m.id === p.hilo)
    exige(raiz && raiz.tenant === tenant, 'el hilo no existe en esta sala')
    exige(raiz!.hilo === null, 'los hilos son de un solo nivel')
  }
  const m: Mensaje = {
    id: p.id, tenant, canal: p.canal, hilo: p.hilo ?? null, autor: p.autor, departamento: p.departamento ?? null,
    cuerpo: p.cuerpo, bloques: p.bloques ?? [], origen: p.origen ?? 'sala', creado: p.creado,
  }
  return { ...s, mensajes: [...s.mensajes, m] }
}

export interface Sesion {
  /** El principal de la sesión que llama, tal como lo autentica la app. */
  readonly principal: Principal
}

/**
 * Registra una decisión sobre un mensaje con bloques de acción. Solo un HUMANO participante, y
 * solo a su propio nombre: `decididaPor` es el id de la sesión, no un argumento.
 */
export function registraAprobacion(s: EstadoSala, sesion: Sesion, a: { id: string; mensaje: string; accion: Accion; decidida: string }): EstadoSala {
  exige(sesion.principal.tipo === 'humano', 'ningún componente que ejecuta un modelo puede fabricar una aprobación')
  const m = s.mensajes.find((x) => x.id === a.mensaje)
  exige(m, 'no existe el mensaje')
  exige((s.participantes[m!.tenant] ?? []).includes(sesion.principal.id), 'el humano no participa en esta sala')
  const bloque = m!.bloques.find((b) => b.acciones.includes(a.accion))
  exige(bloque, `el mensaje no ofrece la acción «${a.accion}»`)
  exige(!s.aprobaciones.some((x) => x.mensaje === a.mensaje && x.decididaPor === sesion.principal.id), 'ya decidiste sobre este mensaje')
  const fila: Aprobacion = {
    id: a.id, tenant: m!.tenant, mensaje: a.mensaje, accion: a.accion, taskId: bloque!.taskId,
    sha256: bloque!.sha256, decididaPor: sesion.principal.id, decidida: a.decidida,
  }
  return { ...s, aprobaciones: [...s.aprobaciones, fila] }
}

/** ¿Hay una aprobación humana para esta tarea y este artefacto exacto? Lo único que desbloquea. */
export function aprobado(s: EstadoSala, taskId: string, sha256: string): Aprobacion | null {
  return s.aprobaciones.find((a) => a.taskId === taskId && a.sha256 === sha256 && a.accion === 'aprobar') ?? null
}

export interface Ruteo {
  readonly tarea: { readonly departamento: string; readonly mensaje: string } | null
  readonly aviso: Aviso | null
}

/**
 * Qué hace la sala con un mensaje que menciona a un departamento (`@dep-<nombre>`). La sala no
 * llama al modelo: como mucho, crea una tarea. Un espejo nunca crea tareas; una mención desde un
 * origen externo se ignora con aviso visible, no en silencio.
 */
export function enruta(m: Mensaje, departamentos: readonly string[]): Ruteo {
  const mencion = /@dep-([a-z0-9-]+)/.exec(m.cuerpo)?.[1] ?? null
  if (!mencion || !departamentos.includes(mencion)) return { tarea: null, aviso: null }
  if (m.origen.startsWith('espejo_')) {
    return { tarea: null, aviso: { mensaje: m.id, texto: `la mención a @dep-${mencion} viene de un espejo (${m.origen}) y se ignora: un puente es lectura` } }
  }
  if (m.autor.tipo !== 'humano') return { tarea: null, aviso: null }
  return { tarea: { departamento: mencion, mensaje: m.id }, aviso: null }
}
