'use client'

/**
 * La ventana: una sola, con cabecera (marca y voz), explorador, lienzo (la pantalla del módulo), panel y
 * conversación. Reimplementa la forma de la Cabina de Arbrain v0.2.10 (conversación al lado, panel con lo que
 * espera tu clic, explorador a la izquierda) sin su código ni su marca: la marca es la del producto.
 */
import { useState, type ReactNode } from 'react'
import { CAPA } from '../composicion.js'
import type { Ranura } from '../ranuras.js'
import { useCapa } from './contexto.js'
import { CSS_CAPA } from './estilos.js'
import { Ajustes, PrimerArranque } from './guia.js'
import { Compositor, Hilo } from './hilo.js'
import { BotonModoConversacion, VozNoDisponible } from './voz.js'

export function EstilosCapa() {
  return <style href="capa-estilos" precedence="default">{CSS_CAPA}</style>
}

/** El componente que el módulo dueño de la ranura pinta ahí (o nada). */
export function Ranura({ ranura }: { ranura: Ranura }) {
  const { producto, componentes } = useCapa()
  const quien = producto.ranuras[ranura].quien
  const C = quien && quien !== CAPA ? componentes[quien]?.[ranura] : undefined
  return C ? <div data-capa-ranura={ranura} data-capa-llena={quien}><C /></div> : null
}

/** El nombre de una pantalla: su último segmento (el del módulo, con el nombre del módulo); si dos se llaman igual, la ruta entera. */
function nombresDePantallas(rutas: string[], modulo: string, nombre: string): Map<string, string> {
  const segmento = (s: string) => (s === modulo ? nombre : (s.charAt(0).toUpperCase() + s.slice(1)).replace(/-/g, ' '))
  const corto = (r: string) => segmento(r.split('/').filter(Boolean).at(-1) ?? 'inicio')
  const largo = (r: string) => r.split('/').filter(Boolean).map(segmento).join(' · ')
  return new Map(rutas.map((r) => [r, rutas.filter((x) => corto(x) === corto(r)).length > 1 ? largo(r) : corto(r)]))
}

/** El módulo dueño de una ruta: la pantalla declarada más larga que la contiene (los segmentos `[x]` valen por uno). */
export function moduloDeRuta(ruta: string, pantallas: ReadonlyArray<{ modulo: string; ruta: string }>): string | null {
  const partes = ruta.split('/').filter(Boolean)
  const casa = (patron: string) => {
    const p = patron.split('/').filter(Boolean)
    return p.length <= partes.length && p.every((s, k) => (s.startsWith('[') ? Boolean(partes[k]) : s === partes[k]))
  }
  return [...pantallas].filter((x) => casa(x.ruta)).sort((a, b) => b.ruta.length - a.ruta.length)[0]?.modulo ?? null
}

function Explorador() {
  const { producto, ruta, navega } = useCapa()
  const enlazables = producto.pantallas.filter((p) => !p.ruta.includes('['))
  const modulos = [...new Set(enlazables.map((p) => p.modulo))]
  return (
    <nav className="capa-explorador" aria-label="Explorador" data-capa-ranura="explorador">
      {/* Si un módulo llena el explorador (p. ej. su jerarquía), lo suyo va arriba; las pantallas siguen debajo. */}
      <Ranura ranura="explorador" />
      {modulos.map((m) => {
        const nombre = producto.nombres[m] ?? m.replace(/-/g, ' ')
        const delModulo = enlazables.filter((p) => p.modulo === m)
        const nombres = nombresDePantallas(delModulo.map((p) => p.ruta), m, nombre)
        return (
          <div key={m}>
            <div className="capa-ceja" data-capa-modulo={m}>{nombre}</div>
            {delModulo.map((p) => (
              <a key={p.ruta} href={p.ruta} className="capa-enlace" aria-current={ruta === p.ruta ? 'page' : undefined} onClick={(e) => { e.preventDefault(); navega(p.ruta) }}>
                {nombres.get(p.ruta)}
              </a>
            ))}
          </div>
        )
      })}
    </nav>
  )
}

function PlanDeLaCapa() {
  const { producto } = useCapa()
  const plan = producto.ranuras.plan
  if (plan.quien !== CAPA) return null
  return <p className="capa-aviso" data-capa-ranura="plan" data-capa-llena="capa">Sin agenda conectada: pídeme que te recuerde algo y queda en la memoria del producto.</p>
}

function Panel() {
  const { conversacion, mensajes, producto } = useCapa()
  const frenos = conversacion.freno.pendientes()
  return (
    <section className="capa-panel" aria-label="Panel" data-capa-ranura="panel" data-mensajes={mensajes.length}>
      <h4>Espera tu clic</h4>
      {frenos.length ? frenos.map((f) => <div key={f.id} className="capa-dato"><span>{f.porque}</span><b>{f.categoria}</b></div>) : <p className="capa-aviso">Nada pendiente.</p>}
      {producto.ranuras.plan.quien ? <h4>Plan</h4> : null}
      <Ranura ranura="plan" />
      <PlanDeLaCapa />
      <Ranura ranura="panel" />
    </section>
  )
}

export interface PropsVentana {
  children: ReactNode
  /** Acciones propias de la app en la cabecera (no son ranuras: no las elige la composición). */
  extra?: ReactNode
}

export function Ventana({ children, extra }: PropsVentana) {
  const capa = useCapa()
  const { producto, ruta } = capa
  const { marca } = producto.composicion
  const [explorador, setExplorador] = useState(true)
  const [conversacion, setConversacion] = useState<'auto' | 'abierta' | 'cerrada'>('auto')
  const [ajustes, setAjustes] = useState(false)
  const modulo = moduloDeRuta(ruta, producto.pantallas)
  const alternaConversacion = () => setConversacion((c) => (c === 'cerrada' ? 'abierta' : c === 'abierta' ? 'cerrada' : 'cerrada'))
  return (
    <div
      className="capa-tema capa-ventana"
      style={{ ['--capa-acento' as string]: marca.acento }}
      data-capa-ventana={producto.composicion.producto}
      data-capa-modulo={modulo ?? ''}
      data-explorador={explorador ? 'abierto' : 'cerrado'}
      data-conversacion={conversacion}
    >
      <EstilosCapa />
      <header className="capa-cabecera">
        <button type="button" className="capa-icono" aria-label="Mostrar u ocultar el explorador" aria-pressed={explorador} onClick={() => setExplorador((x) => !x)}>☰</button>
        <div className="capa-marca"><i aria-hidden="true" /><span>{marca.nombre}</span><small>· {marca.asistente}</small></div>
        <span className="capa-espacio" />
        <div data-capa-ranura="voz" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BotonModoConversacion />
          <VozNoDisponible />
          <Ranura ranura="voz" />
        </div>
        {extra}
        <button type="button" className="capa-icono" aria-label="Mostrar u ocultar la conversación" aria-pressed={conversacion !== 'cerrada'} onClick={alternaConversacion}>💬</button>
        <button type="button" className="capa-icono" aria-label="Ajustes" onClick={() => setAjustes(true)}>⚙</button>
      </header>
      <Explorador />
      <main className="capa-lienzo" data-capa-ranura="lienzo" data-capa-llena={modulo ?? ''}>{children}</main>
      <aside className="capa-conversacion" aria-label="Conversación">
        <Panel />
        {/* Lo que pinta el módulo que llena la conversación (p. ej. el hilo de su canal) va junto al hilo de la capa,
            nunca en su lugar: el freno, la intención y el compositor siguen siendo de la capa. */}
        <Ranura ranura="conversacion" />
        <Hilo />
        <Compositor />
      </aside>
      <PrimerArranque />
      {ajustes ? <Ajustes cierra={() => setAjustes(false)} /> : null}
    </div>
  )
}
