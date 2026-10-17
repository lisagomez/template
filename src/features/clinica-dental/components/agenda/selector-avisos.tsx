'use client';

/**
 * El selector de notificación: correo, Telegram, ambos o ninguno, y el newsletter APARTE (sin marcar). Elegir un
 * canal es el momento del opt-in de recordatorios; la restricción de Telegram se dice aquí, no se esconde.
 */
export type CanalElegido = 'correo' | 'telegram' | 'ambos' | 'ninguno';
export interface EleccionAvisos { canal: CanalElegido | null; newsletter: boolean }

const OPCIONES: { valor: CanalElegido; texto: string; detalle: string }[] = [
  { valor: 'correo', texto: 'Correo', detalle: 'Confirmación con archivo para tu calendario, y recordatorios 24 h y 2 h antes.' },
  { valor: 'telegram', texto: 'Telegram', detalle: 'Confirmación con un video de la clínica y recordatorio 2 h antes. Te daremos un enlace para iniciar el chat.' },
  { valor: 'ambos', texto: 'Correo y Telegram', detalle: 'Lo mejor de los dos.' },
  { valor: 'ninguno', texto: 'Ninguno', detalle: 'Sin recordatorios.' },
];

export function SelectorAvisos({ valor, alCambiar }: { valor: EleccionAvisos; alCambiar: (v: EleccionAvisos) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">¿Cómo quieres tus avisos? <span className="font-normal text-slate-600">(elige una opción)</span></legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPCIONES.map((o) => (
          <label key={o.valor} className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${valor.canal === o.valor ? 'border-[color:var(--c1)] ring-2 ring-[color:var(--c1)]/30' : 'border-slate-200'}`}>
            <input type="radio" name="canal-aviso" value={o.valor} checked={valor.canal === o.valor} onChange={() => alCambiar({ ...valor, canal: o.valor })} className="mt-0.5 h-4 w-4 accent-[color:var(--c1)]" />
            <span><span className="font-medium">{o.texto}</span><span className="block text-slate-600">{o.detalle}</span></span>
          </label>
        ))}
      </div>
      <label className="flex cursor-pointer items-start gap-3 pt-2 text-sm">
        <input type="checkbox" checked={valor.newsletter} onChange={(e) => alCambiar({ ...valor, newsletter: e.target.checked })} className="mt-0.5 h-5 w-5 accent-[color:var(--c1)]" />
        <span>También quiero el <strong>newsletter</strong> de la clínica (llega aparte; te das de baja con un clic).</span>
      </label>
    </fieldset>
  );
}
