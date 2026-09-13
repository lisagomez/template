/**
 * El ejecutor A2A: traduce Task ↔ capacidad y NADA mas (spec 005 TAR-9). Un documento entra como
 * parte `raw` (bytes en base64) o `text` (un XML), sale una Task COMPLETADA con un artefacto de
 * datos, o FALLIDA con razon legible. Nunca un 200 con respuesta inventada (RF-8).
 */
import { TaskState, Role } from '@a2a-js/sdk'
import type { Task, Part, Message } from '@a2a-js/sdk'
import type { AgentExecutor, RequestContext, ExecutionEventBus } from '@a2a-js/sdk/server'
import { extraeConElServicio, FalloDeCapacidad, type DocumentoEntrante } from './servicio-extractor.ts'
import type { ResultadoDeExtraccion } from './esquema.ts'

const MIME_XML = 'application/xml'

/** La primera parte con contenido leible. Sin ella, la Task falla con razon: no se adivina. */
export function documentoDe(partes: readonly Part[]): DocumentoEntrante | null {
  for (const parte of partes) {
    const contenido = parte.content
    if (contenido?.$case === 'raw') {
      return { bytes: new Uint8Array(contenido.value), nombre: parte.filename || 'documento', tipoMime: parte.mediaType || 'application/octet-stream' }
    }
    if (contenido?.$case === 'text' && contenido.value.trimStart().startsWith('<')) {
      return { bytes: new TextEncoder().encode(contenido.value), nombre: parte.filename || 'documento.xml', tipoMime: parte.mediaType || MIME_XML }
    }
  }
  return null
}

const ahora = (): string => new Date().toISOString()

function mensajeDelAgente(texto: string, contextId: string, taskId: string): Message {
  return {
    messageId: crypto.randomUUID(), contextId, taskId, role: Role.ROLE_AGENT,
    parts: [{ content: { $case: 'text', value: texto }, metadata: undefined, filename: '', mediaType: 'text/plain' }],
    metadata: undefined, extensions: [], referenceTaskIds: [],
  }
}

function tareaFallida(contexto: RequestContext, razon: string): Task {
  return {
    id: contexto.taskId, contextId: contexto.contextId,
    status: { state: TaskState.TASK_STATE_FAILED, message: mensajeDelAgente(razon, contexto.contextId, contexto.taskId), timestamp: ahora() },
    artifacts: [], history: [], metadata: undefined,
  }
}

function tareaCompletada(contexto: RequestContext, resultado: ResultadoDeExtraccion): Task {
  return {
    id: contexto.taskId, contextId: contexto.contextId,
    status: { state: TaskState.TASK_STATE_COMPLETED, message: undefined, timestamp: ahora() },
    artifacts: [{
      artifactId: crypto.randomUUID(), name: 'extraccion',
      description: 'Campos con confianza, evidencia y marca de revision humana. selloVerificado es siempre false.',
      parts: [{ content: { $case: 'data', value: resultado }, metadata: undefined, filename: '', mediaType: 'application/json' }],
      metadata: undefined, extensions: [],
    }],
    history: [], metadata: undefined,
  }
}

export class EjecutorDelExtractor implements AgentExecutor {
  // Campo explicito y no «parameter property»: Node en modo strip-only no admite esa sintaxis.
  private readonly pedir: typeof fetch

  constructor(pedir: typeof fetch = fetch) {
    this.pedir = pedir
  }

  async execute(contexto: RequestContext, bus: ExecutionEventBus): Promise<void> {
    let tarea: Task
    try {
      const documento = documentoDe(contexto.userMessage.parts)
      if (documento === null) {
        tarea = tareaFallida(contexto, 'la peticion no trae ningun documento: se esperaba una parte raw (PDF o imagen) o un XML como texto')
      } else {
        tarea = tareaCompletada(contexto, await extraeConElServicio(documento, this.pedir))
      }
    } catch (error) {
      // Solo FalloDeCapacidad lleva una razon pensada para salir. Cualquier otra cosa se resume.
      tarea = tareaFallida(contexto, error instanceof FalloDeCapacidad ? error.message : 'fallo interno al procesar el documento')
    }
    bus.publish({ kind: 'task', data: tarea })
    bus.finished()
  }

  async cancelTask(taskId: string, bus: ExecutionEventBus): Promise<void> {
    // La extraccion es una llamada corta y bloqueante: no hay nada que cancelar a medias.
    bus.publish({ kind: 'statusUpdate', data: { taskId, contextId: '', status: { state: TaskState.TASK_STATE_CANCELED, message: undefined, timestamp: ahora() }, metadata: undefined } })
    bus.finished()
  }
}
