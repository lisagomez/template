/**
 * Lo que lee, cambia y escribe un objeto del almacén va en fila, por clave: dos acciones a la vez se pisaban y la última
 * borraba a la otra (medido el 2026-10-21: en R2, el veredicto se llevaba las retros por paso; en disco, un 500). El
 * laboratorio es UNA instancia (`max_instances: 1`), así que la fila en memoria basta. La usan los casos y las
 * validaciones de candidatos.
 */
const filas = new Map<string, Promise<unknown>>()
export function enFila<T>(clave: string, hace: () => Promise<T>): Promise<T> {
  const turno = (filas.get(clave) ?? Promise.resolve()).then(hace)
  const fin = turno.catch(() => undefined)
  filas.set(clave, fin)
  void fin.then(() => { if (filas.get(clave) === fin) filas.delete(clave) })
  return turno
}
