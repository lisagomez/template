'use client'
/**
 * `LienzoDeModelado` — el pintado del modelo. Sin dependencias.
 *
 * POR QUE NO `@xyflow/react`: TAR-23 pedia **verificar primero** que monta en React 19 y caer a un
 * lienzo propio si no. Esa verificacion **no se ha podido hacer** aqui —no esta instalado y no hay
 * con que montar un componente— asi que no se afirma que falle: se afirma que **no se comprobo**,
 * y se aplica el respaldo que la propia tarea prevé.
 *
 * POR QUE TARJETAS EN HTML Y LINEAS EN SVG, que es la decision de esta capa: los elementos SVG no
 * son arrastrables con la API de arrastre del navegador —`draggable` no es un atributo de `<text>`,
 * y `tsc` lo rechaza— asi que un lienzo SVG puro obliga a reimplementar el arrastre con eventos de
 * puntero. Las tarjetas en HTML lo tienen gratis, y ademas son enfocables con el teclado y su texto
 * fluye. El SVG se queda con lo unico que HTML no sabe hacer: las lineas.
 *
 * Aqui NO hay ninguna decision: posiciones, cardinalidades, trazos e impedimentos salen de
 * `./lienzo`, que es puro y esta probado. Esto pinta lo que le den.
 */
import type { CSSProperties, ReactElement } from 'react'
import { altoDeTarjeta, anchoDeTarjeta } from './lienzo.js'
import type { Lienzo, TarjetaDeEntidad } from './lienzo.js'

export interface ColumnaSenalada {
  tabla: string
  columna: string
}

export interface PropiedadesDelLienzo {
  lienzo: Lienzo
  /** Al soltar una columna sobre otra. Quien reciba decide si crea la relacion (RF-33). */
  onArrastraColumna?(origen: ColumnaSenalada, destino: ColumnaSenalada): void
}

function centroDe(tarjeta: TarjetaDeEntidad): { x: number; y: number } {
  return { x: tarjeta.x + anchoDeTarjeta() / 2, y: tarjeta.y + altoDeTarjeta(tarjeta) / 2 }
}

const contenedor: CSSProperties = { position: 'relative' }
const capaDeLineas: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' }

export function LienzoDeModelado({ lienzo, onArrastraColumna }: PropiedadesDelLienzo): ReactElement {
  const porTabla = new Map(lienzo.tarjetas.map((t) => [t.tabla, t]))
  const ancho = Math.max(...lienzo.tarjetas.map((t) => t.x + anchoDeTarjeta()), 400) + 40
  const alto = Math.max(...lienzo.tarjetas.map((t) => t.y + altoDeTarjeta(t)), 300) + 40

  return (
    <div style={{ ...contenedor, width: ancho, height: alto }} aria-label="Modelo de entidades y relaciones">
      <svg style={capaDeLineas} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true">
        {lienzo.lineas.map((linea) => {
          const desde = porTabla.get(linea.desde)
          const hacia = porTabla.get(linea.hacia)
          if (desde === undefined || hacia === undefined) return null
          const a = centroDe(desde)
          const b = centroDe(hacia)
          return (
            <g key={`${linea.desde}-${linea.hacia}-${linea.etiqueta}`}>
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="currentColor"
                // Punteada = apunta a una tabla que YA existe: no se crea, se referencia.
                strokeDasharray={linea.trazo === 'punteada' ? '6 4' : undefined}
              />
              {/* Los indicadores van en los EXTREMOS, como en Power BI: se leen sin leyenda. */}
              <text x={a.x} y={a.y - 6} textAnchor="middle">{linea.cardinalidadOrigen}</text>
              <text x={b.x} y={b.y - 6} textAnchor="middle">{linea.cardinalidadDestino}</text>
              <title>{linea.etiqueta}</title>
            </g>
          )
        })}
      </svg>

      {lienzo.tarjetas.map((tarjeta) => (
        <article
          key={tarjeta.tabla}
          style={{
            position: 'absolute',
            left: tarjeta.x,
            top: tarjeta.y,
            width: anchoDeTarjeta(),
            border: tarjeta.preexistente ? '1px dashed currentColor' : '1px solid currentColor',
          }}
        >
          <h3>
            {tarjeta.tabla}
            {/* La distincion va tambien en el TEXTO, no solo en el borde y la posicion: un lector
                de pantalla no ve ninguna de las dos. */}
            {tarjeta.preexistente ? ' — ya existe en tu proyecto' : ' — propuesta'}
          </h3>
          <ul>
            {tarjeta.columnas.map((columna) => (
              <li
                key={columna.nombre}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', `${tarjeta.tabla}.${columna.nombre}`)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const crudo = e.dataTransfer.getData('text/plain')
                  const punto = crudo.indexOf('.')
                  if (punto <= 0) return
                  onArrastraColumna?.(
                    { tabla: crudo.slice(0, punto), columna: crudo.slice(punto + 1) },
                    { tabla: tarjeta.tabla, columna: columna.nombre },
                  )
                }}
              >
                {columna.esClave ? '🔑 ' : ''}
                {columna.nombre} : {columna.tipo}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  )
}
