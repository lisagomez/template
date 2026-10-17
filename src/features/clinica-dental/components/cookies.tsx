'use client';

/**
 * El banner de analitica y el evento de visita. Rechazar y aceptar pesan lo mismo; la publicidad ni se ofrece
 * (un portal de salud no la necesita). Sin eleccion, todo sigue DENEGADO y el contenedor de GTM no se carga.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { aplicaEleccion, eleccionGuardada } from '../services/cliente/datalayer';
import { canal, dispositivo, primeraVisita, registraEvento } from '../services/cliente/visitante';

const ID_GTM = process.env['NEXT_PUBLIC_GTM_ID'];

const sinSuscripcion = () => () => undefined;
/** Si ya eligió (localStorage). En el servidor no se sabe: el banner no se pinta hasta hidratar. */
const yaEligio = () => (eleccionGuardada() === null ? 'no' : 'si');

export function Cookies({ clinica }: { clinica: string }) {
  const eligio = useSyncExternalStore(sinSuscripcion, yaEligio, () => 'servidor');
  const [cerrado, setCerrado] = useState(false);
  const visible = eligio === 'no' && !cerrado;

  useEffect(() => {
    const previa = eleccionGuardada();
    if (previa !== null) aplicaEleccion(previa, ID_GTM);
    if (primeraVisita(clinica)) void registraEvento({ tipo: 'portal_visitado', clinica, canal_adquisicion: canal(), dispositivo: dispositivo() });
  }, [clinica]);

  if (!visible) return null;
  const elige = (si: boolean) => {
    aplicaEleccion(si, ID_GTM);
    setCerrado(true);
  };
  return (
    <div role="region" aria-label="Preferencias de analítica" className="fixed inset-x-3 bottom-20 z-40 rounded-xl border border-slate-200 bg-white p-4 shadow-lg sm:bottom-3 sm:left-3 sm:right-auto sm:max-w-md">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-700">
          ¿Nos dejas medir de forma anónima cómo se usa el portal? Sin publicidad y sin tus datos personales. Puedes cambiarlo cuando quieras.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => elige(false)} className="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-medium hover:bg-slate-50">Rechazar</button>
          <button type="button" onClick={() => elige(true)} className="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-medium hover:bg-slate-50">Aceptar analítica</button>
        </div>
      </div>
    </div>
  );
}
