'use client'
/**
 * `ZonaDeIngesta` — las tres vias de entrada de RF-4, RF-5 y RF-6: boton, arrastre y carpeta.
 *
 * La directiva `'use client'` va en la PRIMERA linea del archivo, y el empaquetador comprueba que
 * sobrevive al build: sin ella, Next intenta ejecutar esto en el servidor y falla en el proyecto
 * de destino, no aqui.
 *
 * REPARTO DE TRABAJO, y es el que hace que esto sea probable:
 *   - El recorrido del arbol soltado vive en `./aplana`, sin React. Se prueba sin navegador.
 *   - La clasificacion y el rechazo viven en el NUCLEO (`clasificaLote`). Ya estan probados.
 *   - Aqui queda solo el pegamento del DOM: los eventos y el estado. Lo que no se puede probar
 *     sin navegador es exactamente lo que no lleva decisiones dentro.
 *
 * El rechazo NUNCA es silencioso (RF-6): lo no soportado se devuelve nombrando **archivo y
 * motivo**. Un archivo que desaparece sin explicacion es como se pierden documentos y como se
 * pierde la confianza en la herramienta.
 */
import { useCallback, useRef, useState } from 'react'
import type { DragEvent, ChangeEvent, ReactElement } from 'react'
import { clasificaLote } from '../archivos.js'
import type { Clasificacion, LimitesDelMotor } from '../tipos.js'
import { aplanaEntradas, raicesDe, desdeInput } from './aplana.js'
import type { ArchivoAplanado } from './aplana.js'

export interface LoteIngresado {
  aceptados: readonly Clasificacion[]
  rechazados: readonly Clasificacion[]
  /** Los `File` de verdad, por ruta, para quien los tenga que subir despues. */
  archivos: readonly ArchivoAplanado[]
  /** Lo que no se pudo ni leer del disco. Distinto de «rechazado por tipo». */
  ilegibles: readonly { ruta: string; motivo: string }[]
}

export interface PropiedadesDeIngesta {
  onLote(lote: LoteIngresado): void
  limites?: LimitesDelMotor
  /** Texto de la zona. Se puede traducir sin tocar el componente. */
  etiqueta?: string
  deshabilitado?: boolean
}

function aLote(
  archivos: readonly ArchivoAplanado[],
  ilegibles: readonly { ruta: string; motivo: string }[],
  limites?: LimitesDelMotor,
): LoteIngresado {
  const entrantes = archivos.map((a) => ({
    nombre: a.ruta,
    tipoMime: a.archivo.type === '' ? undefined : a.archivo.type,
    bytes: a.archivo.size,
  }))
  const { aceptados, rechazados } = clasificaLote(entrantes, limites)
  return { aceptados, rechazados, archivos, ilegibles }
}

export function ZonaDeIngesta({
  onLote,
  limites,
  etiqueta = 'Arrastra archivos o una carpeta, o pulsa para elegir',
  deshabilitado = false,
}: PropiedadesDeIngesta): ReactElement {
  const [encima, setEncima] = useState(false)
  const [leyendo, setLeyendo] = useState(false)
  const inputArchivos = useRef<HTMLInputElement | null>(null)
  const inputCarpeta = useRef<HTMLInputElement | null>(null)

  const suelta = useCallback(
    async (evento: DragEvent<HTMLDivElement>) => {
      evento.preventDefault()
      setEncima(false)
      if (deshabilitado) return
      setLeyendo(true)
      try {
        // `webkitGetAsEntry` es lo unico que da el ARBOL. `dataTransfer.files` viene vacio con una
        // carpeta soltada, y por ahi es por donde se pierden 300 facturas sin un error en consola.
        const raices = raicesDe(evento.dataTransfer as unknown as { items?: ArrayLike<{ webkitGetAsEntry?(): never }> })
        const { archivos, ilegibles } = await aplanaEntradas(raices)
        onLote(aLote(archivos, ilegibles, limites))
      } finally {
        setLeyendo(false)
      }
    },
    [deshabilitado, limites, onLote],
  )

  const eligeArchivos = useCallback(
    (evento: ChangeEvent<HTMLInputElement>) => {
      const lista = evento.target.files
      if (lista !== null) onLote(aLote(desdeInput(lista), [], limites))
      // Se limpia para que elegir el MISMO archivo dos veces vuelva a disparar `change`.
      evento.target.value = ''
    },
    [limites, onLote],
  )

  return (
    <div>
      <div
        role="button"
        tabIndex={deshabilitado ? -1 : 0}
        aria-disabled={deshabilitado}
        aria-busy={leyendo}
        data-encima={encima ? 'si' : 'no'}
        onDragOver={(e) => {
          e.preventDefault()
          if (!deshabilitado) setEncima(true)
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={suelta}
        onClick={() => !deshabilitado && inputArchivos.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (!deshabilitado) inputArchivos.current?.click()
          }
        }}
      >
        <p>{leyendo ? 'Leyendo la carpeta…' : etiqueta}</p>
        <button type="button" disabled={deshabilitado} onClick={(e) => { e.stopPropagation(); inputCarpeta.current?.click() }}>
          Elegir una carpeta
        </button>
      </div>

      {/* Las DOS vias de §2.2. No son la misma con una opcion distinta: son mecanismos distintos. */}
      <input ref={inputArchivos} type="file" multiple hidden onChange={eligeArchivos} />
      <input
        ref={inputCarpeta}
        type="file"
        multiple
        hidden
        onChange={eligeArchivos}
        // `webkitdirectory` no esta en los tipos de React porque no es estandar; sigue siendo la
        // unica via de «elegir una carpeta» en todos los navegadores que la soportan.
        {...{ webkitdirectory: '', directory: '' }}
      />
    </div>
  )
}
