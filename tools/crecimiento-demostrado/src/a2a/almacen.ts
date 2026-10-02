/** Un TaskStore con dueño por tarea y sin historial: `load` de una tarea ajena no se distingue de una que no existe (lo decide la pasarela). */
import type { Task } from '@a2a-js/sdk';
import type { TaskStore } from '@a2a-js/sdk/server';

export class AlmacenPorInquilino implements TaskStore {
  private readonly tareas = new Map<string, Task>();
  readonly duenos = new Map<string, string>();
  async save(task: Task): Promise<void> { this.tareas.set(task.id, { ...task, history: [] }); }
  async load(taskId: string): Promise<Task | undefined> { return this.tareas.get(taskId); }
  async list() { return { tasks: [], nextPageToken: '', pageSize: 0, totalSize: 0 }; }
}
