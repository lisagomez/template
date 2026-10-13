'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { RegistroDeHoras } from '@/features/buzon-cfdi/services/medicion';

interface Props { pymeId: string; registros: readonly RegistroDeHoras[] }

const FASE = { previo: 'Mes previo (captura a mano)', piloto: 'Mes del piloto (con el buzón)' } as const;

/**
 * Las horas de captura de CFDI de esta pyme, por mes: el mismo registro el mes previo y el del piloto (RF-20). No se
 * pregunta ni se guarda quién capturó (RF-21): la cifra es de la pyme, no de una persona.
 */
export function RegistroHoras({ pymeId, registros }: Props) {
  const router = useRouter();
  const [aviso, setAviso] = useState('');
  async function registrar(form: FormData) {
    setAviso('');
    const r = await fetch('/api/buzon/horas', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pyme_id: pymeId, mes: form.get('mes'), fase: form.get('fase'), horas: form.get('horas'), cfdi_recibidos: form.get('cfdi_recibidos') }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setAviso(d.error ?? 'no se pudo registrar');
    router.refresh();
  }
  return (
    <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm" data-prueba="registro-horas">
      <h2 className="font-semibold">Tiempo de captura</h2>
      <p className="text-xs text-gray-600">Horas del mes dedicadas a capturar los CFDI recibidos de esta pyme. No se registra quién las hizo.</p>
      <form action={registrar} className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
        <input type="month" name="mes" required className="rounded border px-2 py-1" data-prueba="horas-mes" />
        <select name="fase" className="rounded border px-2 py-1" data-prueba="horas-fase">
          <option value="previo">Mes previo</option>
          <option value="piloto">Mes del piloto</option>
        </select>
        <input type="number" name="horas" min="0" max="744" step="0.25" required placeholder="Horas" className="rounded border px-2 py-1" data-prueba="horas-horas" />
        <input type="number" name="cfdi_recibidos" min="0" step="1" placeholder="CFDI (previo)" className="rounded border px-2 py-1" data-prueba="horas-cfdi" />
        <button className="rounded-lg bg-gray-900 px-3 py-1 text-white" data-prueba="horas-registrar">Registrar</button>
      </form>
      {aviso && <p role="alert" className="text-sm text-red-700">{aviso}</p>}
      <table className="w-full text-sm" data-prueba="horas-registradas">
        <tbody>
          {registros.map((r) => (
            <tr key={`${r.mes}-${r.fase}`}><td className="pr-2">{r.mes.slice(0, 7)}</td><td className="pr-2">{FASE[r.fase]}</td>
              <td className="pr-2">{r.horas} h</td><td>{r.fase === 'previo' ? `${r.cfdi_recibidos} CFDI` : 'CFDI: los cuenta el buzón'}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
