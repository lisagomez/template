'use client'

/**
 * La sección en vivo: el laboratorio corriendo en la máquina del laboratorio, a través de la ruta de Vercel que firma y
 * pasa cada petición por el túnel. Si la máquina está apagada, se dice, y la vitrina sigue. Aquí no se suben archivos.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { SoporteSap } from '../../components/soporte-sap'
import type { Vista } from '../../services/tipos'
import { RAIZ_DE_LA_VITRINA as R } from '../contenido/capturas'

export const API_EN_VIVO = '/api/vitrina/soporte-sap/en-vivo'
type Estado = { fase: 'comprobando' } | { fase: 'apagado'; motivo: string } | { fase: 'encendido'; vista: Vista }

function Apagado({ motivo, reintenta }: { motivo: string; reintenta: () => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3" data-prueba="en-vivo-apagado">
      <section className="rounded-3xl bg-neutral-900 p-8 text-white lg:col-span-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">En vivo</p>
        <h2 className="mt-2 text-3xl font-bold">El laboratorio está apagado ahora</h2>
        <p className="mt-3 text-neutral-300" data-prueba="en-vivo-motivo">{motivo}</p>
        <button type="button" onClick={reintenta} className="mt-6 rounded-full bg-white px-5 py-2 text-sm font-semibold text-neutral-900">Comprobar de nuevo</button>
      </section>
      <section className="rounded-3xl border border-neutral-200 bg-white p-6">
        <h3 className="font-bold">Mientras tanto</h3>
        <ul className="mt-3 space-y-2 text-sm">
          <li><Link className="underline" href={`${R}/niveles`}>Los tres niveles, momento a momento</Link></li>
          <li><Link className="underline" href={`${R}/journey`}>El journey, paso a paso</Link></li>
          <li><Link className="underline" href={`${R}/manual`}>El manual de cada rol</Link></li>
        </ul>
        <p className="mt-4 text-xs text-neutral-500">La sección en vivo pasa al laboratorio que corre en la máquina del laboratorio, solo mientras está encendido.</p>
      </section>
    </div>
  )
}

export function EnVivo() {
  const [estado, setEstado] = useState<Estado>({ fase: 'comprobando' })
  // El estado lo escribe la promesa: el efecto solo consulta (react-hooks/set-state-in-effect).
  const consulta = useCallback(() => {
    fetch(`${API_EN_VIVO}/estado`, { cache: 'no-store' })
      .then(async (r) => {
        const datos = (await r.json()) as { encendido: boolean; vista?: Vista; motivo?: string }
        setEstado(datos.encendido && datos.vista ? { fase: 'encendido', vista: datos.vista } : { fase: 'apagado', motivo: datos.motivo ?? `respondió ${r.status}` })
      })
      .catch(() => setEstado({ fase: 'apagado', motivo: 'No se pudo consultar la sección en vivo.' }))
  }, [])
  useEffect(() => { consulta() }, [consulta])
  const comprueba = () => { setEstado({ fase: 'comprobando' }); consulta() }

  if (estado.fase === 'comprobando') return <p className="py-10 text-neutral-500" data-prueba="en-vivo-comprobando">Comprobando si el laboratorio está encendido…</p>
  if (estado.fase === 'apagado') return <Apagado motivo={estado.motivo} reintenta={comprueba} />
  return (
    <div data-prueba="en-vivo-encendido">
      <p className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-prueba="en-vivo-aviso">
        <strong>Laboratorio en vivo, con datos sintéticos.</strong> No escribas datos reales: ni de tus clientes ni de nadie. Los adjuntos son documentos de muestra.
        Lo que hagas lo ven los demás invitados, y todo vive en memoria: se pierde al apagar el laboratorio.
      </p>
      <div className="-mx-4"><SoporteSap inicial={estado.vista} fuente={{ modo: 'en-vivo', api: API_EN_VIVO }} /></div>
    </div>
  )
}
