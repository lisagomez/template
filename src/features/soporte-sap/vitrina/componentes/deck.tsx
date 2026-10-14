'use client'

/**
 * El deck para consultoras: láminas 16:9 en bento-grid. En pantalla se recorren con las flechas del teclado; al imprimir
 * (o con `imprime-deck.mjs`), cada lámina es una página de 1280 × 720. Ninguna cifra inventada: lo medido dice dónde se
 * midió, y lo que no está decidido dice «por decidir» (`contenido/propuesta.ts`).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { captura, RAIZ_DE_LA_VITRINA as R, type PasoDelRecorrido } from '../contenido/capturas'
import { DONDE_VIVE, FUENTE_DE_LO_MEDIDO, MEDIDO_EN_LABORATORIO, NO_HACE, POR_DECIDIR } from '../contenido/propuesta'
import { FASES, JOURNEY } from '../contenido/journey'
import { EtiquetaNivel } from './bento'

export const PDF_DEL_DECK = `${R}/soporte-sap-deck.pdf`

function Lamina({ antetitulo, titulo, children, oscura = false }: { antetitulo: string; titulo: string; children?: ReactNode; oscura?: boolean }) {
  return (
    <section data-lamina className={`flex flex-col overflow-hidden rounded-3xl p-8 lg:aspect-video lg:p-12 print:h-[720px] print:w-[1280px] print:break-after-page print:last:break-after-auto print:rounded-none ${oscura ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white print:border-0'}`}>
      <p className={`text-xs font-semibold uppercase tracking-widest ${oscura ? 'text-neutral-400' : 'text-neutral-500'}`}>{antetitulo}</p>
      <h2 className="mt-2 text-3xl font-bold leading-tight tracking-tight lg:text-4xl">{titulo}</h2>
      <div className="mt-6 min-h-0 flex-1">{children}</div>
    </section>
  )
}

const Celda = ({ children, tono = 'bg-neutral-100' }: { children: ReactNode; tono?: string }) => <div className={`rounded-2xl p-5 ${tono}`}>{children}</div>
const Foto = ({ paso, alt }: { paso: PasoDelRecorrido; alt: string }) => (
  <div className="h-full min-h-48 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50"><Image src={captura(paso)} alt={alt} width={1440} height={900} unoptimized className="h-full w-full object-cover object-top" /></div>
)

/** El dolor, la propuesta y los tres niveles. */
function LaminasDeApertura() {
  return (
    <>
      <Lamina antetitulo="Para consultoras de soporte SAP" titulo="Soporte SAP: tu AMS con evidencia, sin perder el control humano" oscura>
        <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-3">
          <p className="text-xl text-neutral-300 lg:col-span-2">El cliente levanta la incidencia. El agente lee la evidencia, categoriza y prepara la solución conocida con su fuente. Una persona decide. Y cada número tiene una sola definición.</p>
          <div className="grid grid-cols-2 gap-2 self-end" aria-hidden><span className="h-16 rounded-xl bg-sky-500" /><span className="h-16 rounded-xl bg-emerald-500" /><span className="h-16 rounded-xl bg-violet-500" /><span className="h-16 rounded-xl bg-amber-400" /></div>
          <p className="text-sm text-neutral-400 lg:col-span-3">Vitrina de laboratorio: datos sintéticos, un simulador en lugar de SAP y sin modelo de lenguaje.</p>
        </div>
      </Lamina>
      <Lamina antetitulo="El dolor" titulo="Las mismas incidencias, una y otra vez">
        <div className="grid gap-4 lg:grid-cols-2">
          <Celda><strong>Lo que se sabe vive en una cabeza.</strong> Cada incidencia repetida se vuelve a resolver desde cero.</Celda>
          <Celda><strong>El triage se lee a mano.</strong> Capturas, spools y CFDI, transcritos por un consultor.</Celda>
          <Celda><strong>El SLA se discute en hojas de cálculo.</strong> Cada parte con su número.</Celda>
          <Celda><strong>Un agente que «arregla» en el SAP del cliente</strong> es un riesgo que nadie firma.</Celda>
        </div>
        <p className="mt-4 text-sm text-neutral-500">Cuánto le cuesta hoy a una consultora no está medido: se mide con la primera consultora real.</p>
      </Lamina>
      <Lamina antetitulo="La propuesta" titulo="Más incidencias, más rápido, con evidencia, y con una persona al mando">
        <div className="grid gap-4 lg:grid-cols-4">
          <Celda tono="bg-amber-50"><strong>Evidencia leída en local.</strong> Captura con OCR local, PDF por su capa de texto, CFDI como XML; cada campo, por revisar.</Celda>
          <Celda tono="bg-sky-50"><strong>La solución conocida, con su fuente.</strong> Un motor de reglas determinista, o «sin regla» y al sandbox para aprenderla.</Celda>
          <Celda tono="bg-violet-50"><strong>Ninguna solución sin una persona.</strong> El ejecutor prepara, el supervisor verifica y una persona aprueba en la sala.</Celda>
          <Celda tono="bg-emerald-50"><strong>Un número, una definición.</strong> La consultora y su cliente ven la misma cifra, desde la capa semántica.</Celda>
        </div>
      </Lamina>
      <Lamina antetitulo="Tres niveles" titulo="Cada quien ve lo suyo, y nada más">
        <div className="grid gap-4 lg:grid-cols-3">
          <Celda tono="bg-sky-50"><EtiquetaNivel nivel="N3">N3 · tu cliente</EtiquetaNivel><p className="mt-2">Levanta incidencias, sigue su reloj de SLA, impugna con motivo, ve su tablero y se va con su export.</p></Celda>
          <Celda tono="bg-emerald-50"><EtiquetaNivel nivel="N2">N2 · tu consultora</EtiquetaNivel><p className="mt-2">Atiende con SLA, horas, presupuesto y accionables; responde y resuelve a su nombre; decide qué escala.</p></Celda>
          <Celda tono="bg-violet-50"><EtiquetaNivel nivel="N1">N1 · el laboratorio</EtiquetaNivel><p className="mt-2">Decide lo que le escalas, enseña al agente lo nuevo y cuida el núcleo común. No ve lo que no le escalas.</p></Celda>
        </div>
      </Lamina>
    </>
  )
}

/** El journey y cómo trabaja el producto. */
function LaminasDelProducto() {
  return (
    <>
      <Lamina antetitulo="El journey" titulo={`De la incidencia a la salida, en ${JOURNEY.length} pasos`}>
        <div className="grid gap-3 lg:grid-cols-5">
          {FASES.map((f) => (
            <Celda key={f.id}><strong>{f.titulo}</strong><p className="mt-1 text-sm text-neutral-600">{f.idea}</p>
              <ul className="mt-2 space-y-1 text-xs">{JOURNEY.filter((p) => p.fase === f.id).map((p) => <li key={p.id} className="flex items-start gap-1"><EtiquetaNivel nivel={p.nivel} /><span>{p.titulo}</span></li>)}</ul>
            </Celda>
          ))}
        </div>
      </Lamina>
      <Lamina antetitulo="Del ticket al plan" titulo="El agente prepara y verifica; la persona decide">
        <div className="grid h-full gap-4 lg:grid-cols-5">
          <ol className="space-y-2 text-sm lg:col-span-2">
            {['El cliente levanta, con sus adjuntos', 'La ingesta lee la evidencia por campo', 'El agente categoriza: prioridad ITIL con razones', 'La matriz da la solución conocida y su fuente', 'El ejecutor prepara el plan; el supervisor lo verifica', 'La consultora decide si lo escala', 'Una persona aprueba en la sala, con su nombre', 'Se aplica al simulador, con su antes y su después'].map((x, k) => <li key={x} className="flex gap-2"><span className="font-bold text-neutral-400">{k + 1}</span>{x}</li>)}
          </ol>
          <div className="lg:col-span-3"><Foto paso="04" alt="El plan en la sala con el veredicto del supervisor" /></div>
        </div>
      </Lamina>
      <Lamina antetitulo="Aprender sin exponer" titulo="Lo nuevo se aprende anonimizado, y sube al núcleo solo con consentimiento">
        <div className="grid h-full gap-4 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-2">
            <Celda tono="bg-amber-50">El anonimizador reemplaza nombres y correos; lo que deja forma de dato, y todo caso de RR. HH. o nómina, va a cuarentena y no entra.</Celda>
            <Celda tono="bg-emerald-50">Tu consultora y tu cliente consienten cada uno por su lado; cualquiera puede revocar.</Celda>
            <Celda tono="bg-violet-50">Al núcleo sube generalizado: sin cliente, sin objetos propios, sin la forma de tu negocio.</Celda>
          </div>
          <div className="lg:col-span-3"><Foto paso="05.1" alt="La enseñanza sube al núcleo generalizada" /></div>
        </div>
      </Lamina>
      <Lamina antetitulo="El servicio, medido" titulo="El SLA se mide desde los eventos, no desde una hoja de cálculo">
        <div className="grid h-full gap-4 lg:grid-cols-5">
          <div className="space-y-3 text-sm lg:col-span-2">
            <Celda>El reloj corre, se pausa cuando se espera al cliente y se reanuda cuando responde; cada tramo dice quién lo abrió.</Celda>
            <Celda>La primera respuesta la da el consultor, no el sistema. Aplicar en el simulador no es resolver.</Celda>
            <Celda>MTTR, primera respuesta, cumplimiento, resolución al primer contacto, reuso del conocimiento, backlog, horas y costo por ticket: una definición por métrica.</Celda>
          </div>
          <div className="lg:col-span-3"><Foto paso="11" alt="El reloj de una incidencia corre, se pausa y se reanuda" /></div>
        </div>
      </Lamina>
    </>
  )
}

/** Lo que ve tu cliente, lo que no hace, dónde vive, lo que no se promete y cómo seguimos. */
function LaminasDeCierre() {
  return (
    <>
      <Lamina antetitulo="Tu cliente" titulo="Ve su servicio, con la misma cifra que tú">
        <div className="grid h-full gap-4 lg:grid-cols-5">
          <div className="space-y-3 text-sm lg:col-span-2">
            <Celda tono="bg-sky-50">Sus métricas del mes, cada una con su fuente.</Celda>
            <Celda tono="bg-sky-50">Un FODA en el que cada punto cita su dato, su criterio y su confianza.</Celda>
            <Celda tono="bg-sky-50">Accionables con impacto en MXN, su fórmula y sus supuestos. Una proyección no es una promesa.</Celda>
          </div>
          <div className="lg:col-span-3"><Foto paso="08" alt="El tablero del cliente con su FODA" /></div>
        </div>
      </Lamina>
      <Lamina antetitulo="Lo que no hace, a propósito" titulo="Lo que el producto no hace también es la propuesta" oscura>
        <ul className="grid gap-3 lg:grid-cols-2">{NO_HACE.map((x) => <li key={x.que} className="rounded-2xl bg-white/10 p-4"><strong>{x.que}.</strong> <span className="text-neutral-300">{x.porque}</span></li>)}</ul>
      </Lamina>
      <Lamina antetitulo="Dónde vive y qué está probado" titulo="Tus datos, dónde decidas; lo probado, con su fuente">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">{DONDE_VIVE.map((d) => <Celda key={d.modo}><strong>{d.modo}.</strong> {d.que} <span className="text-xs text-neutral-500">({d.decision})</span></Celda>)}</div>
          <div>
            <div className="grid grid-cols-2 gap-3">{MEDIDO_EN_LABORATORIO.map((m) => <Celda key={m.cifra} tono="bg-emerald-50"><p className="text-2xl font-bold">{m.cifra}</p><p className="text-sm">{m.que}</p></Celda>)}</div>
            <p className="mt-2 text-xs text-neutral-500">{FUENTE_DE_LO_MEDIDO}</p>
          </div>
        </div>
      </Lamina>
      <Lamina antetitulo="Por decidir" titulo="Lo que todavía no se promete, y quién lo decide">
        <ul className="grid gap-3 lg:grid-cols-2">{POR_DECIDIR.map((x) => <li key={x.que} className="rounded-2xl border border-dashed border-neutral-300 p-4"><strong>{x.que}.</strong> <span className="text-neutral-600">{x.quien}</span></li>)}</ul>
      </Lamina>
      <Lamina antetitulo="Cómo seguimos" titulo="Míralo, pruébalo, y hablemos de un piloto con tus datos" oscura>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl bg-white/10 p-5"><strong>1. La vitrina.</strong> <span className="text-neutral-300">Los tres niveles momento a momento, el journey y el manual de cada rol.</span></div>
          <div className="rounded-2xl bg-white/10 p-5"><strong>2. En vivo.</strong> <span className="text-neutral-300">El laboratorio corriendo: levanta una incidencia como tu cliente y atiéndela como tu consultora.</span></div>
          <div className="rounded-2xl bg-white/10 p-5"><strong>3. Un piloto.</strong> <span className="text-neutral-300">Con tus documentos: medir el anonimizador y los umbrales con tu corpus, sembrar tus reglas firmadas y escribir tu contrato de SLA.</span></div>
        </div>
      </Lamina>
    </>
  )
}

const Laminas = () => <><LaminasDeApertura /><LaminasDelProducto /><LaminasDeCierre /></>

export function Deck() {
  const raiz = useRef<HTMLDivElement>(null)
  const [actual, setActual] = useState(0)
  const [total, setTotal] = useState(0)
  useEffect(() => {
    const laminas = [...(raiz.current?.querySelectorAll<HTMLElement>('[data-lamina]') ?? [])]
    setTotal(laminas.length)
    const ve = new IntersectionObserver((xs) => { for (const x of xs) if (x.isIntersecting) setActual(laminas.indexOf(x.target as HTMLElement)) }, { threshold: 0.6 })
    for (const l of laminas) ve.observe(l)
    const tecla = (e: KeyboardEvent) => {
      const paso = e.key === 'ArrowRight' || e.key === 'PageDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'PageUp' ? -1 : 0
      if (!paso) return
      e.preventDefault()
      setActual((a) => { const n = Math.min(laminas.length - 1, Math.max(0, a + paso)); laminas[n]?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return n })
    }
    window.addEventListener('keydown', tecla)
    return () => { ve.disconnect(); window.removeEventListener('keydown', tecla) }
  }, [])
  return (
    <div>
      <style>{'@page { size: 1280px 720px; margin: 0 }'}</style>
      <div className="sticky top-16 z-30 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-full border border-neutral-200 bg-white/90 px-4 py-2 text-sm backdrop-blur print:hidden" data-prueba="deck-barra">
        <span>Lámina {actual + 1} de {total} · usa ← y → para avanzar</span>
        <a href={PDF_DEL_DECK} className="rounded-full bg-neutral-900 px-4 py-1.5 font-semibold text-white" data-prueba="deck-pdf" download>Descargar PDF</a>
      </div>
      <div ref={raiz} className="space-y-6 print:space-y-0" data-prueba="deck"><Laminas /></div>
    </div>
  )
}
