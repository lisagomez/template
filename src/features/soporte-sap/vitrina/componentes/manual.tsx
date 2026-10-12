/**
 * El manual de usuario por rol, en la vitrina. El mismo contenido se escribe en `src/features/soporte-sap/MANUAL.md`
 * (`genera-manual.mjs`): una sola fuente, dos formas de leerlo.
 */
import Image from 'next/image'
import { EN_PRODUCCION, MANUAL, type ManualDeRol } from '../contenido/manual'
import { captura } from '../contenido/capturas'
import type { Nivel } from '../contenido/journey'
import { EtiquetaNivel, TONO_NIVEL } from './bento'

const NIVEL: Readonly<Record<ManualDeRol['id'], Nivel>> = { cliente: 'N3', consultor: 'N2', laboratorio: 'N1' }

function Rol({ m }: { m: ManualDeRol }) {
  const nivel = NIVEL[m.id]
  return (
    <section id={m.id} className="scroll-mt-24 space-y-4" data-prueba={`manual-${m.id}`}>
      <header className={`rounded-3xl border p-6 ${TONO_NIVEL[nivel].borde} ${TONO_NIVEL[nivel].suave}`}>
        <EtiquetaNivel nivel={nivel} />
        <h2 className="mt-2 text-2xl font-bold">{m.titulo}</h2>
        <p className="mt-1 text-neutral-700">{m.quien} En el laboratorio: {m.entra}</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        {m.secciones.map((s) => (
          <article key={s.id} id={`${m.id}-${s.id}`} className="flex scroll-mt-24 flex-col rounded-3xl border border-neutral-200 bg-white p-6">
            <h3 className="text-lg font-bold">{s.titulo}</h3>
            <p className="text-sm text-neutral-500">Para qué: {s.para}</p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-neutral-800">{s.pasos.map((x) => <li key={x}>{x}</li>)}</ol>
            {s.ojo ? <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900"><strong>Ojo:</strong> {s.ojo}</p> : null}
            {s.captura ? (
              <a href={captura(s.captura)} target="_blank" rel="noreferrer" className="mt-4 block overflow-hidden rounded-2xl border border-neutral-200" title="Abrir la captura entera">
                <Image src={captura(s.captura)} alt={`Captura: ${s.titulo}`} width={1440} height={900} unoptimized className="h-48 w-full object-cover object-top" />
              </a>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}

export function Manual() {
  return (
    <div className="space-y-10">
      <nav className="flex flex-wrap gap-2" aria-label="Roles">
        {MANUAL.map((m) => <a key={m.id} href={`#${m.id}`} className="rounded-full border border-neutral-300 bg-white px-4 py-1.5 text-sm font-semibold hover:bg-neutral-100">{m.titulo}</a>)}
      </nav>
      <section className="rounded-3xl bg-neutral-900 p-6 text-white" data-prueba="manual-produccion">
        <h2 className="text-xl font-bold">Esto es el laboratorio: en producción será distinto</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-300">{EN_PRODUCCION.map((x) => <li key={x}>{x}</li>)}</ul>
      </section>
      {MANUAL.map((m) => <Rol key={m.id} m={m} />)}
    </div>
  )
}
