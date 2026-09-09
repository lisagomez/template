/**
 * Aplanado del arbol que llega al soltar una carpeta. Cubre la mitad dificil de RF-5.
 *
 * §2.2 del SDD: **«carpetas» no es un input de HTML, son dos mecanismos distintos** — y se
 * confunden porque desde fuera parecen lo mismo.
 *
 *   - **Elegir** una carpeta: `<input type="file" webkitdirectory>`. El navegador entrega la lista
 *     YA aplanada en `input.files`, con la ruta relativa en `webkitRelativePath`. No hay que
 *     recorrer nada.
 *   - **Soltar** una carpeta: `DataTransferItem.webkitGetAsEntry()`. Aqui NO hay lista: hay un
 *     arbol, y **hay que recorrerlo a mano**. Si no se recorre, soltar una carpeta con 300
 *     facturas no da error — da CERO archivos, y el usuario cree que la aplicacion los ignoro.
 *
 * Este archivo hace el segundo. Vive en `./react` y no en el nucleo porque toca API del DOM, pero
 * **no importa React**: es recursion sobre una estructura, y por eso se prueba sin navegador.
 *
 * Tres cosas que aprendio la implementacion y que un recorrido ingenuo se salta:
 *
 * 1. `readEntries()` **devuelve como mucho 100 entradas por llamada.** Hay que llamarlo en bucle
 *    hasta que devuelva vacio. Quien lo llama una vez y ya, pierde en silencio todo lo que pase
 *    de 100 — el fallo mas caro de esta funcion, porque el resultado parece correcto.
 * 2. Un arbol con un enlace ciclico cuelga el recorrido. Hay tope de profundidad.
 * 3. Un `file()` puede fallar (permisos, fichero movido a mitad). Se registra y se sigue: abortar
 *    el lote entero por un archivo ilegible pierde los otros 299.
 */

/** La forma minima de `FileSystemEntry`. Declarada para poder probar sin navegador. */
export interface EntradaDeArchivo {
  isFile: boolean
  isDirectory: boolean
  name: string
  fullPath?: string
  /** Solo en ficheros. */
  file?(exito: (f: File) => void, fallo?: (e: Error) => void): void
  /** Solo en directorios. */
  createReader?(): { readEntries(exito: (e: EntradaDeArchivo[]) => void, fallo?: (e: Error) => void): void }
}

export interface ArchivoAplanado {
  archivo: File
  /** Ruta dentro de lo que se solto, para poder reconstruir el arbol al mostrarlo. */
  ruta: string
}

export interface ResultadoDelAplanado {
  archivos: readonly ArchivoAplanado[]
  /** Lo que no se pudo leer, nombrado. El rechazo silencioso es como se pierden documentos. */
  ilegibles: readonly { ruta: string; motivo: string }[]
  /** `true` si se corto por profundidad: se dice, no se calla. */
  truncadoPorProfundidad: boolean
}

/** Tope de profundidad. Un enlace ciclico en el arbol colgaria el recorrido sin esto. */
const PROFUNDIDAD_MAXIMA = 16

/** Tope de vueltas al lector. A 100 por lote son 100 000 entradas: mas que eso es un lector roto. */
const LOTES_MAXIMOS = 1000

/**
 * `readEntries` devuelve como mucho 100 por llamada: se insiste hasta que devuelve vacio.
 *
 * El bucle es ITERATIVO y no recursivo a proposito. Un lector que devuelva siempre el mismo lote
 * —por un bug suyo o porque alguien lo simule mal— hacia crecer la pila con la version recursiva
 * hasta reventarla, y el error resultante (`Maximum call stack size exceeded`) no dice nada de la
 * causa. Con `await` en cada vuelta la pila no crece, y el tope convierte un lector roto en un
 * resultado incompleto declarado en vez de en un cuelgue.
 */
async function leeTodasLasEntradas(directorio: EntradaDeArchivo): Promise<EntradaDeArchivo[]> {
  const lector = directorio.createReader?.()
  if (lector === undefined) return []
  const acumulado: EntradaDeArchivo[] = []
  for (let vuelta = 0; vuelta < LOTES_MAXIMOS; vuelta++) {
    const lote = await new Promise<EntradaDeArchivo[]>((resuelve) => {
      lector.readEntries(
        (entradas) => resuelve(entradas),
        () => resuelve([]),
      )
    })
    if (lote.length === 0) return acumulado
    acumulado.push(...lote)
  }
  return acumulado
}

function leeFichero(entrada: EntradaDeArchivo): Promise<File | null> {
  return new Promise((resuelve) => {
    if (entrada.file === undefined) {
      resuelve(null)
      return
    }
    entrada.file(
      (f) => resuelve(f),
      () => resuelve(null),
    )
  })
}

/**
 * Recorre el arbol soltado y devuelve la lista plana.
 *
 * No clasifica ni rechaza por tipo: eso es del nucleo (`clasificaLote`), que es puro y ya esta
 * probado. Aqui solo se convierte un arbol del DOM en una lista.
 */
export async function aplanaEntradas(raices: readonly EntradaDeArchivo[]): Promise<ResultadoDelAplanado> {
  const archivos: ArchivoAplanado[] = []
  const ilegibles: { ruta: string; motivo: string }[] = []
  let truncado = false

  const recorre = async (entrada: EntradaDeArchivo, prefijo: string, profundidad: number): Promise<void> => {
    const ruta = prefijo === '' ? entrada.name : `${prefijo}/${entrada.name}`
    if (profundidad > PROFUNDIDAD_MAXIMA) {
      truncado = true
      ilegibles.push({ ruta, motivo: `se corto a ${PROFUNDIDAD_MAXIMA} niveles de profundidad` })
      return
    }
    if (entrada.isFile) {
      const archivo = await leeFichero(entrada)
      if (archivo === null) ilegibles.push({ ruta, motivo: 'no se pudo leer el archivo' })
      else archivos.push({ archivo, ruta })
      return
    }
    if (entrada.isDirectory) {
      for (const hija of await leeTodasLasEntradas(entrada)) {
        await recorre(hija, ruta, profundidad + 1)
      }
    }
  }

  for (const raiz of raices) await recorre(raiz, '', 0)
  return { archivos, ilegibles, truncadoPorProfundidad: truncado }
}

/**
 * Saca las raices de un `DataTransfer`. Se separa para que `aplanaEntradas` sea probable sola.
 *
 * `webkitGetAsEntry` es lo unico que da acceso al ARBOL. `DataTransfer.files` existe y es la
 * tentacion obvia, pero con una carpeta soltada viene **vacio** en la practica: por ahi es por
 * donde se pierden las 300 facturas sin un solo error en consola.
 */
export function raicesDe(transferencia: {
  items?: ArrayLike<{ webkitGetAsEntry?(): EntradaDeArchivo | null }>
}): EntradaDeArchivo[] {
  const items = transferencia.items
  if (items === undefined) return []
  const raices: EntradaDeArchivo[] = []
  for (let i = 0; i < items.length; i++) {
    const entrada = items[i]?.webkitGetAsEntry?.()
    if (entrada !== null && entrada !== undefined) raices.push(entrada)
  }
  return raices
}

/**
 * Lo que devuelve `<input webkitdirectory>`: ya viene plano, con la ruta en `webkitRelativePath`.
 * Se normaliza a la misma forma para que la UI tenga un solo camino despues.
 */
export function desdeInput(archivos: ArrayLike<File>): ArchivoAplanado[] {
  const salida: ArchivoAplanado[] = []
  for (let i = 0; i < archivos.length; i++) {
    const archivo = archivos[i]
    const relativa = (archivo as File & { webkitRelativePath?: string }).webkitRelativePath
    salida.push({ archivo, ruta: relativa !== undefined && relativa !== '' ? relativa : archivo.name })
  }
  return salida
}
