'use client'
/**
 * `TablaDeRevision` — la vista de revision (TAR-11) y la accion de pantalla de TAR-12.
 *
 * DOS DECISIONES QUE ESTAN EN LA FIRMA, no en la implementacion, para que no se puedan saltar:
 *
 * 1. **`umbral` es una prop OBLIGATORIA y sin default.** `tipos.ts` lo dice: la confianza se
 *    compara contra un umbral explicito, nunca contra un default. TAR-17 esta bloqueada a
 *    proposito porque ese numero se mide y no se inventa — y un valor por defecto aqui seria justo
 *    la puerta por la que un numero sin medir entraria de todos modos, con apariencia de decision.
 * 2. **La confianza y la region se pintan SIEMPRE**, no bajo un desplegable (RF-11). Un dato cuya
 *    procedencia hay que ir a buscar es un dato que nadie mira; enseñarlo al lado del valor es lo
 *    que hace que la revision sea revision y no una lectura por encima.
 *
 * Lo que decide vive en `./revision` y se prueba sin navegador. Aqui queda el pegamento.
 */
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { CampoExtraido } from '../tipos.js'
import type { PlantillaDeRevision } from '../plantilla.js'
import {
  aplicaPlantilla,
  cuentaBajoUmbral,
  puedeValidarseSinRevision,
  exigeCotejo,
  disposicionDe,
} from './revision.js'
import type { FilaDeRevision } from './revision.js'

export interface PropiedadesDeRevision {
  tipoDocumento: string
  campos: readonly CampoExtraido[]
  /** Obligatorio y sin default: ver el punto 1 de la cabecera. */
  umbral: number
  /**
   * Si los campos deterministas de este documento se cotejaron contra una segunda fuente.
   *
   * Obligatorio y sin default, por el mismo motivo que `umbral`. Un dato de XML o de un codigo
   * llega con confianza 1 y sin region, asi que sin esta prop se promoveria solo — y lo que lo
   * hace fiable no es su confianza, es que otra fuente independiente diga lo mismo.
   *
   * Quien coteja es `corrobora()`. Si el documento no tiene con que cotejarse, va `false`: eso
   * manda a revision, que es la respuesta correcta cuando no hay segunda fuente.
   */
  cotejado: boolean
  plantilla?: PlantillaDeRevision | null
  /** Guardar el valor corregido de un campo. El motivo es obligatorio aguas abajo (versiones). */
  onGuardaCampo?(clave: string, valor: string): void
  /** Quitar el campo de ESTE documento. No deshabilita el campo en la plantilla: son cosas distintas. */
  onEliminaCampo?(clave: string): void
  /** La accion de pantalla de TAR-12: persistir la disposicion entera. */
  onGuardaComoDefecto?(plantilla: PlantillaDeRevision): void
}

function porcentaje(confianza: number): string {
  return `${Math.round(confianza * 100)} %`
}

function citaDe(fila: FilaDeRevision): string {
  if (fila.region === undefined) {
    // Se dice por que no hay region, en vez de dejar el hueco: de un escaner no hay imagen que
    // recortar, y eso es normal. De OCR, en cambio, es una senal.
    return fila.procedencia === 'codigo' ? 'leido de un codigo (sin imagen)' : 'sin region de origen'
  }
  return `pagina ${fila.region.pagina + 1}`
}

export function TablaDeRevision({
  tipoDocumento,
  campos,
  umbral,
  cotejado,
  plantilla = null,
  onGuardaCampo,
  onEliminaCampo,
  onGuardaComoDefecto,
}: PropiedadesDeRevision): ReactElement {
  const [editando, setEditando] = useState<string | null>(null)
  const [borrador, setBorrador] = useState('')
  const [ocultas, setOcultas] = useState<string[]>([])

  const filas = useMemo(
    () => aplicaPlantilla(campos, plantilla, umbral).filter((f) => !ocultas.includes(f.clave)),
    [campos, plantilla, umbral, ocultas],
  )
  const pendientes = cuentaBajoUmbral(filas)

  return (
    <section aria-label={`Revision de ${tipoDocumento}`}>
      <header>
        {/* `revision_humana` NO es un error: es la salida normal. Se enuncia sin adjetivos, porque
            llamarlo fallo es lo que empuja a subir el umbral hasta que la cola desaparece. */}
        <p data-pendientes={pendientes}>
          {pendientes === 0
            ? 'Todos los campos superan el umbral.'
            : `${pendientes} campo(s) por debajo del umbral (${porcentaje(umbral)}): los revisa una persona.`}
        </p>
        {!puedeValidarseSinRevision(filas, cotejado) && pendientes === 0 ? (
          /* Se dice CUAL de las dos barreras salto. "No se puede validar" a secas deja a la
             persona sin saber que hacer, y lo que hay que hacer es distinto en cada caso. */
          <p>
            {exigeCotejo(filas) && !cotejado
              ? 'Hay campos exactos que nadie coteje contra una segunda fuente: leerlos bien no dice que el documento sea autentico.'
              : 'Hay campos de reconocimiento sin region de origen: no se pueden auditar despues.'}
          </p>
        ) : null}
      </header>

      <table>
        <thead>
          <tr>
            <th scope="col">Campo</th>
            <th scope="col">Valor</th>
            <th scope="col">Confianza</th>
            <th scope="col">Origen</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.clave} data-bajo-umbral={fila.bajoUmbral ? 'si' : 'no'}>
              <th scope="row">{fila.etiqueta}</th>
              <td>
                {editando === fila.clave ? (
                  <input
                    value={borrador}
                    aria-label={`Valor de ${fila.etiqueta}`}
                    onChange={(e) => setBorrador(e.target.value)}
                  />
                ) : (
                  fila.valor
                )}
              </td>
              {/* Siempre a la vista, nunca tras un desplegable. */}
              <td>{porcentaje(fila.confianza)}</td>
              <td>{citaDe(fila)}</td>
              <td>
                {editando === fila.clave ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onGuardaCampo?.(fila.clave, borrador)
                        setEditando(null)
                      }}
                    >
                      Guardar
                    </button>
                    <button type="button" onClick={() => setEditando(null)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!fila.editable}
                      onClick={() => {
                        setEditando(fila.clave)
                        setBorrador(fila.valor)
                      }}
                    >
                      Modificar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOcultas((previas) => [...previas, fila.clave])
                        onEliminaCampo?.(fila.clave)
                      }}
                    >
                      Eliminar
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button type="button" onClick={() => onGuardaComoDefecto?.(disposicionDe(tipoDocumento, filas, ocultas))}>
        Guardar esta disposicion como predeterminada
      </button>
    </section>
  )
}
