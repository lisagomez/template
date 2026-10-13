import { Bento, Caja, Enlace, EtiquetaNivel } from '@/features/soporte-sap/vitrina/componentes/bento'
import { RAIZ_DE_LA_VITRINA as R } from '@/features/soporte-sap/vitrina/contenido/capturas'
import { JOURNEY } from '@/features/soporte-sap/vitrina/contenido/journey'
import { NO_HACE } from '@/features/soporte-sap/vitrina/contenido/propuesta'
import indice from '../../../../public/vitrina/soporte-sap/momentos/indice.json'

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { dateStyle: 'long', timeZone: 'America/Mexico_City' })

export default function InicioDeLaVitrina() {
  return (
    <Bento>
      <Caja ancho={4} alto={2} tono="oscuro" prueba="portada">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">Para consultoras de soporte SAP</p>
        <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight md:text-5xl">Atiende más incidencias, más rápido y con evidencia, sin perder el control humano.</h1>
        <p className="mt-4 max-w-2xl text-lg text-neutral-300">Cada incidencia llega categorizada, con lo que se leyó de sus adjuntos y con la solución conocida y su fuente. Ninguna se aplica sin que una persona la apruebe.</p>
        <div className="flex flex-wrap gap-3"><Enlace href={`${R}/niveles`} claro>Ver los tres niveles</Enlace><Enlace href={`${R}/journey`} claro>Recorrer el journey</Enlace></div>
      </Caja>
      <Caja ancho={2} tono="N3">
        <EtiquetaNivel nivel="N3">N3 · tu cliente</EtiquetaNivel>
        <h2 className="mt-3 text-xl font-bold">Levanta y ve su servicio</h2>
        <p className="mt-2 text-sm text-neutral-700">Cuenta lo que pasa una vez, sigue su reloj de SLA, impugna con motivo y se va con su export.</p>
        <Enlace href={`${R}/niveles?rol=cliente`}>Su vista</Enlace>
      </Caja>
      <Caja ancho={2} tono="N2">
        <EtiquetaNivel nivel="N2">N2 · tu consultora</EtiquetaNivel>
        <h2 className="mt-3 text-xl font-bold">Atiende con SLA, horas y accionables</h2>
        <p className="mt-2 text-sm text-neutral-700">Responde, pide, resuelve a su nombre, y decide qué escala al laboratorio.</p>
        <Enlace href={`${R}/niveles?rol=consultor`}>Tu vista</Enlace>
      </Caja>
      <Caja ancho={2} tono="N1">
        <EtiquetaNivel nivel="N1">N1 · el laboratorio</EtiquetaNivel>
        <h2 className="mt-3 text-xl font-bold">Decide lo escalado y cuida el núcleo</h2>
        <p className="mt-2 text-sm text-neutral-700">Aprueba en la sala, enseña al agente lo nuevo y sube al núcleo solo lo consentido.</p>
        <Enlace href={`${R}/niveles?rol=superadmin`}>Su vista</Enlace>
      </Caja>
      <Caja ancho={2} tono="agente">
        <EtiquetaNivel nivel="agente" />
        <h2 className="mt-3 text-xl font-bold">Preparan, verifican, no deciden</h2>
        <p className="mt-2 text-sm text-neutral-700">La ingesta lee la evidencia, el agente categoriza, el ejecutor prepara el plan y el supervisor lo verifica. La aprobación es de una persona.</p>
      </Caja>
      <Caja ancho={2} tono="gris">
        <h2 className="text-xl font-bold">El journey, en {JOURNEY.length} pasos</h2>
        <ol className="mt-3 space-y-1 text-sm text-neutral-700">
          {JOURNEY.slice(0, 5).map((p) => <li key={p.id} className="flex gap-2"><EtiquetaNivel nivel={p.nivel} /><span>{p.titulo}</span></li>)}
          <li className="text-neutral-500">… y {JOURNEY.length - 5} más, hasta la salida del cliente.</li>
        </ol>
        <Enlace href={`${R}/journey`}>Recorrerlo</Enlace>
      </Caja>
      <Caja ancho={3}>
        <h2 className="text-xl font-bold">Lo que el producto no hace, a propósito</h2>
        <ul className="mt-3 space-y-2 text-sm text-neutral-700">{NO_HACE.map((x) => <li key={x.que} className="flex gap-2"><span aria-hidden className="text-red-500">✕</span><span><strong>{x.que}.</strong> {x.porque}</span></li>)}</ul>
      </Caja>
      <Caja ancho={3} tono="oscuro">
        <h2 className="text-xl font-bold">Para llevártelo</h2>
        <p className="mt-2 text-sm text-neutral-300">El deck para tu equipo, en PDF, y el manual de cada rol, paso a paso y con capturas del producto.</p>
        <div className="flex flex-wrap gap-3"><Enlace href={`${R}/deck`} claro>Deck</Enlace><Enlace href={`${R}/manual`} claro>Manual</Enlace><Enlace href={`${R}/en-vivo`} claro>Probarlo en vivo</Enlace></div>
      </Caja>
      <Caja ancho={6} tono="gris" prueba="procedencia">
        <p className="text-sm text-neutral-600">
          Lo que ves en «Los tres niveles» es lo que el producto devolvió a cada rol en {indice.momentos.length} momentos del recorrido, congelado el {fecha(indice.generado)} desde el commit <code>{indice.commit}</code>.
          Las capturas son del recorrido de Playwright contra el laboratorio. Datos sintéticos: ninguna empresa ni persona de aquí existe.
        </p>
      </Caja>
    </Bento>
  )
}
