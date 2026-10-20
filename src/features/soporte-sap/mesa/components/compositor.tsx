'use client'

/**
 * Donde el experto escribe su caso, como se lo contaría a un colega: el sistema, el módulo, la transacción, el mensaje,
 * el síntoma y lo que ya intentó. Antes de enviar se revisa que ningún texto tenga forma de dato personal; si la tiene,
 * se dice arriba y junto a su campo, sin repetir el dato (patrón de GOV.UK), y no se envía.
 */
import { useState } from 'react'
import { MODULOS, SISTEMAS, type EntradaCaso } from '../services/modelo'
import { Boton, Campo, Celda, ENTRADA_CLASE } from './ui'

const VACIA: EntradaCaso = { sistema: 'S4HANA', modulo: 'MM', transaccion: '', mensaje: '', sociedad: '', periodo: '', sintoma: '', intento: '', muestras: [] }
const EJEMPLOS: ReadonlyArray<{ nombre: string; que: string; entrada: EntradaCaso }> = [
  { nombre: 'Uno que el agente conoce', que: 'MIGO no deja contabilizar: M7 053', entrada: { sistema: 'S4HANA', modulo: 'MM', transaccion: 'MIGO', mensaje: 'M7 053', sociedad: '1000', periodo: '2026/10', sintoma: 'Al contabilizar la entrada de mercancía en MIGO sale el mensaje M7 053: el periodo de MM no está abierto.', intento: 'Revisé que el documento de compras esté liberado.', muestras: ['captura-migo.png'] } },
  { nombre: 'Uno que no conoce', que: 'Una app de Fiori abre en blanco', entrada: { sistema: 'S4HANA', modulo: 'Fiori', transaccion: '', mensaje: '', sociedad: '', periodo: '', sintoma: 'Una app del launchpad de Fiori abre en blanco después del transporte de ayer, a todos los usuarios.', intento: 'Probé en otro navegador y en modo incógnito.', muestras: [] } },
  { nombre: 'Uno de nómina', que: 'La nómina no calcula el ISR', entrada: { sistema: 'ECC', modulo: 'HCM', transaccion: 'PC00_M32_CALC', mensaje: '', sociedad: '', periodo: '2026/10', sintoma: 'El cálculo de la nómina de la quincena no calcula el ISR del empleado para el periodo.', intento: '', muestras: [] } },
]
const ETIQUETA: Readonly<Record<string, string>> = { transaccion: 'Transacción', mensaje: 'Mensaje de error', sintoma: 'Qué pasa', intento: 'Lo que ya intentaste', sociedad: 'Sociedad', periodo: 'Periodo' }

export function Compositor({ muestras, corre, revisa, ocupado }: {
  muestras: ReadonlyArray<{ archivo: string; que: string }>
  corre: (e: EntradaCaso) => Promise<string | null>
  revisa: (campos: Record<string, string>) => Promise<Record<string, string[]>>
  ocupado: boolean
}) {
  const [e, setE] = useState<EntradaCaso>(VACIA)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [general, setGeneral] = useState<string | null>(null)
  const pon = <K extends keyof EntradaCaso>(k: K, v: EntradaCaso[K]) => setE((x) => ({ ...x, [k]: v }))
  const alterna = (m: string) => pon('muestras', e.muestras.includes(m) ? e.muestras.filter((x) => x !== m) : [...e.muestras, m])

  const envia = async () => {
    const propios: Record<string, string> = {}
    if (e.sintoma.trim().length < 10) propios['sintoma'] = 'Cuéntale al agente qué pasa, en una o dos frases'
    const formas = await revisa({ transaccion: e.transaccion, mensaje: e.mensaje, sintoma: e.sintoma, intento: e.intento, sociedad: e.sociedad, periodo: e.periodo })
    for (const [k, f] of Object.entries(formas)) propios[k] = `Tiene forma de dato personal (${f.join(', ')}): escríbelo sin él, describe el caso y no a las personas ni a la empresa`
    setErrores(propios)
    if (Object.keys(propios).length) { setGeneral('Hay algo que corregir antes de correr el caso'); return }
    setGeneral(null)
    const error = await corre(e)
    if (error) setGeneral(error)
    else setE(VACIA)
  }
  const describe = (k: string) => (errores[k] ? `${k}-error` : undefined)

  return (
    <Celda prueba="compositor" titulo="Cuéntale un caso" nota="Como se lo contarías a un colega. Sin nombres de clientes ni de personas: el agente necesita el síntoma, no a quién le pasó.">
      <div className="mb-4 flex flex-wrap gap-2" data-prueba="ejemplos">
        {EJEMPLOS.map((x) => (
          <button key={x.nombre} type="button" onClick={() => { setE(x.entrada); setErrores({}); setGeneral(null) }}
            className="rounded-2xl border border-dashed border-violet-300 bg-violet-50 px-3 py-2 text-left text-xs hover:bg-violet-100">
            <span className="block font-semibold text-violet-900">{x.nombre}</span><span className="text-violet-700">{x.que}</span>
          </button>
        ))}
      </div>
      {general ? (
        <div role="alert" tabIndex={-1} className="mb-4 rounded-2xl border-2 border-rose-600 bg-white p-3" data-prueba="resumen-de-errores">
          <p className="text-sm font-bold text-rose-800">{general}</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-rose-700">{Object.entries(errores).map(([k, v]) => <li key={k}><a href={`#${k}`} className="underline">{ETIQUETA[k] ?? k}</a>: {v}</li>)}</ul>
        </div>
      ) : null}
      <form className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); void envia() }} noValidate>
        <div className="flex flex-wrap gap-3">
          <fieldset>
            <legend className="text-sm font-semibold text-neutral-900">Sistema</legend>
            <div className="mt-1 inline-flex rounded-full bg-neutral-100 p-1">
              {SISTEMAS.map((s) => (
                <button key={s} type="button" onClick={() => pon('sistema', s)} aria-pressed={e.sistema === s} data-prueba={`sistema-${s}`}
                  className={`rounded-full px-3 py-1 text-sm font-semibold ${e.sistema === s ? 'bg-white text-violet-800 shadow' : 'text-neutral-600'}`}>{s === 'S4HANA' ? 'S/4HANA' : 'ECC'}</button>
              ))}
            </div>
          </fieldset>
          <div className="min-w-40 flex-1">
            <label htmlFor="modulo" className="block text-sm font-semibold text-neutral-900">Módulo</label>
            <select id="modulo" value={e.modulo} onChange={(x) => pon('modulo', x.target.value as EntradaCaso['modulo'])} className={`mt-1 ${ENTRADA_CLASE}`} data-prueba="modulo">
              {MODULOS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Campo id="transaccion" etiqueta="Transacción" error={errores['transaccion']}><input id="transaccion" value={e.transaccion} onChange={(x) => pon('transaccion', x.target.value.toUpperCase())} placeholder="MIGO" aria-describedby={describe('transaccion')} className={ENTRADA_CLASE} data-prueba="transaccion" /></Campo>
          <Campo id="mensaje" etiqueta="Mensaje" error={errores['mensaje']}><input id="mensaje" value={e.mensaje} onChange={(x) => pon('mensaje', x.target.value)} placeholder="M7 053" aria-describedby={describe('mensaje')} className={ENTRADA_CLASE} data-prueba="mensaje" /></Campo>
          <Campo id="sociedad" etiqueta="Sociedad" error={errores['sociedad']}><input id="sociedad" value={e.sociedad} onChange={(x) => pon('sociedad', x.target.value)} placeholder="1000" className={ENTRADA_CLASE} data-prueba="sociedad" /></Campo>
          <Campo id="periodo" etiqueta="Periodo" error={errores['periodo']}><input id="periodo" value={e.periodo} onChange={(x) => pon('periodo', x.target.value)} placeholder="2026/10" className={ENTRADA_CLASE} data-prueba="periodo" /></Campo>
        </div>
        <Campo id="sintoma" etiqueta="Qué pasa" ayuda="El síntoma, como lo vería el usuario: qué hace, qué sale, desde cuándo." error={errores['sintoma']}>
          <textarea id="sintoma" rows={3} value={e.sintoma} onChange={(x) => pon('sintoma', x.target.value)} aria-describedby={describe('sintoma')} className={ENTRADA_CLASE} data-prueba="sintoma" />
        </Campo>
        <Campo id="intento" etiqueta="Lo que ya intentaste (opcional)" error={errores['intento']}>
          <textarea id="intento" rows={2} value={e.intento} onChange={(x) => pon('intento', x.target.value)} aria-describedby={describe('intento')} className={ENTRADA_CLASE} data-prueba="intento" />
        </Campo>
        <fieldset>
          <legend className="text-sm font-semibold text-neutral-900">Evidencia (opcional)</legend>
          <p className="text-xs text-neutral-500">Aquí no se suben archivos: elige una de las muestras sintéticas del laboratorio para ver cómo la lee.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {muestras.map((m) => {
              const on = e.muestras.includes(m.archivo)
              return (
                <button key={m.archivo} type="button" aria-pressed={on} onClick={() => alterna(m.archivo)} data-prueba={`muestra-${m.archivo}`}
                  className={`rounded-2xl border p-3 text-left text-xs ${on ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-200' : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100'}`}>
                  <span className="block font-mono font-semibold text-neutral-900">{m.archivo}</span><span className="text-neutral-600">{m.que}</span>
                </button>
              )
            })}
          </div>
        </fieldset>
        <div className="flex items-center gap-3">
          <Boton tipo="submit" disabled={ocupado} prueba="correr">{ocupado ? 'El agente está trabajando…' : 'Correr el caso'}</Boton>
          <span className="text-xs text-neutral-500">El agente lo recibe como si lo levantara un cliente sintético.</span>
        </div>
      </form>
    </Celda>
  )
}
