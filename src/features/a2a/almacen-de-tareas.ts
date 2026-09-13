/**
 * Un `TaskStore` EFIMERO y sin eco del documento.
 *
 * El `InMemoryTaskStore` del SDK guarda la Task entera —con `history`, donde va el mensaje del
 * consumidor y dentro el documento en base64— para siempre y con alcance `unknown` para todos.
 * Medido en la revision de opacidad (2026-09-13): 37 tareas, 39,7 MB, RFC y CURP de terceros en
 * memoria del proceso web. Aqui la Task se guarda SIN historial, con un tope de entradas y una
 * caducidad: lo justo para que `GetTask` responda un rato despues de un `SendMessage`.
 */
import type { Task, ListTasksResponse } from '@a2a-js/sdk'
import type { TaskStore } from '@a2a-js/sdk/server'

interface Guardada {
  readonly task: Task
  readonly caduca: number
}

export class AlmacenDeTareasEfimero implements TaskStore {
  private readonly tareas = new Map<string, Guardada>()
  private readonly maximo: number
  private readonly vidaMs: number
  private readonly ahora: () => number

  constructor(maximo = 200, vidaMs = 10 * 60 * 1000, ahora: () => number = () => Date.now()) {
    this.maximo = maximo
    this.vidaMs = vidaMs
    this.ahora = ahora
  }

  private poda(): void {
    const limite = this.ahora()
    for (const [id, g] of this.tareas) if (g.caduca <= limite) this.tareas.delete(id)
    while (this.tareas.size > this.maximo) {
      const masVieja = this.tareas.keys().next().value
      if (masVieja === undefined) break
      this.tareas.delete(masVieja)
    }
  }

  async save(task: Task): Promise<void> {
    this.poda()
    // Sin `history`: el documento no se queda en memoria ni vuelve en un GetTask.
    this.tareas.set(task.id, { task: { ...task, history: [] }, caduca: this.ahora() + this.vidaMs })
    this.poda()
  }

  async load(taskId: string): Promise<Task | undefined> {
    this.poda()
    return this.tareas.get(taskId)?.task
  }

  /** Nunca se enumera: el puente cierra `ListTasks` antes, y aunque llegara aqui, no hay lista que dar. (Sin `context`: el alcance por llamante no existe con clave compartida, y se dice.) */
  async list(): Promise<ListTasksResponse> {
    return { tasks: [], nextPageToken: '', pageSize: 0, totalSize: 0 }
  }

  /** Cuantas hay ahora mismo. Para las pruebas. */
  get tamano(): number {
    return this.tareas.size
  }
}
