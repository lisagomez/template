'use client';

/**
 * Vincular el WhatsApp desde la cuenta. Cuatro estados: sin vincular → con código (y el enlace `wa.me` con el mensaje
 * escrito) → un número lo mandó y espera que la persona diga «sí, es mío» → vinculado. Si el número que escribió no es
 * el celular del registro, confirmar pide sus 4 últimos dígitos: así un enlace reenviado no le da a otra persona los
 * avisos. Del número solo se ve el final: nunca entero.
 */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { codigoWhatsapp, confirmaWhatsapp, desvinculaWhatsapp, rechazaWhatsapp } from '../../services/servidor/acciones-whatsapp';
import type { VinculoWhatsappUI } from '../../types';
import { Aviso, clasesBoton, clasesBotonSecundario } from '../ui';

interface Props { clinica: string; estado: VinculoWhatsappUI; telefonoClinica: string; laboratorio: string | null }

export function VinculoWhatsapp({ clinica, estado, telefonoClinica, laboratorio }: Props) {
  const router = useRouter();
  const [digitos, setDigitos] = useState('');
  const [mensaje, setMensaje] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null);
  const haz = async (accion: () => Promise<{ ok: boolean; error?: string }>, exito: string) => {
    const r = await accion();
    setMensaje(r.ok ? { tono: 'ok', texto: exito } : { tono: 'error', texto: r.error ?? 'No se pudo.' });
    if (r.ok) router.refresh();
  };
  return (
    <section aria-labelledby="mi-whatsapp" className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:p-5" data-whatsapp={estado.estado}>
      <h2 id="mi-whatsapp" className="font-semibold">Mi WhatsApp</h2>
      {mensaje ? <Aviso tono={mensaje.tono}>{mensaje.texto}</Aviso> : null}
      {estado.estado === 'sin_vincular' ? (
        <>
          <p className="text-sm text-slate-700">Recibe tus avisos y confirma, cambia o cancela tus citas por WhatsApp. No te escribimos al celular de tu registro: primero nos mandas un código desde el número que quieres usar.</p>
          <button type="button" className={clasesBoton} onClick={() => void haz(() => codigoWhatsapp(clinica), 'Listo: manda el código desde tu WhatsApp.')}>Vincular WhatsApp</button>
        </>
      ) : null}
      {estado.estado === 'codigo' ? (
        <>
          <p className="text-sm text-slate-700">Manda este código por WhatsApp a {telefonoClinica} desde el número que quieres vincular. Sirve una vez y caduca a las {estado.expira}.</p>
          <p className="font-mono text-2xl font-bold tracking-widest" data-codigo-whatsapp={estado.codigo}>{estado.codigo}</p>
          <div className="flex flex-wrap gap-2">
            <a className={clasesBoton} href={estado.enlace} target="_blank" rel="noopener noreferrer" data-enlace-whatsapp={estado.enlace}>Abrir WhatsApp con el mensaje</a>
            {laboratorio ? <a className={clasesBotonSecundario} href={laboratorio}>Abrir el WhatsApp simulado</a> : null}
          </div>
        </>
      ) : null}
      {estado.estado === 'pendiente' ? (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          {estado.coincideCelular ? (
            <p className="text-sm font-medium">Nos escribió el número que termina en <strong data-ultimos4={estado.ultimos4 ?? ''}>{estado.ultimos4}</strong>, el celular de tu registro. ¿Eres tú?</p>
          ) : (
            <label className="block text-sm">
              <span className="font-medium text-red-800">Nos escribió un número que NO es el celular de tu registro.</span>
              <span className="block">Si fuiste tú, escribe los 4 últimos dígitos del WhatsApp desde el que nos escribiste (no te los mostramos: así un enlace reenviado no le sirve a otra persona):</span>
              <input inputMode="numeric" autoComplete="off" maxLength={4} value={digitos} onChange={(e) => setDigitos(e.target.value.replace(/\D/g, ''))} className="mt-1 block w-28 rounded-lg border border-slate-300 px-3 py-2 font-mono" aria-label="Últimos 4 dígitos de tu WhatsApp" />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={clasesBoton} onClick={() => void haz(() => confirmaWhatsapp(clinica, estado.coincideCelular ? undefined : digitos), 'WhatsApp vinculado: ahí te llegarán tus avisos.')}>{estado.coincideCelular ? 'Sí, es mi número' : 'Confirmar con los dígitos'}</button>
            <button type="button" className={clasesBotonSecundario} onClick={() => void haz(() => rechazaWhatsapp(clinica), 'Descartado: ese número no recibirá nada. Pide otro código si quieres vincular el tuyo.')}>{estado.coincideCelular ? 'No soy yo' : 'No fui yo'}</button>
          </div>
        </div>
      ) : null}
      {estado.estado === 'vinculado' ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">Vinculado al número que termina en <strong>{estado.ultimos4}</strong>. Escribe <strong>BAJA</strong> en el chat o desvincúlalo aquí cuando quieras.</p>
          <button type="button" className={clasesBotonSecundario} onClick={() => void haz(() => desvinculaWhatsapp(clinica), 'Desvinculado: ya no te escribimos por WhatsApp.')}>Desvincular</button>
        </div>
      ) : null}
      <p className="text-xs text-slate-600">WhatsApp es de Meta: procesa estos mensajes y los guarda hasta 30 días. Los avisos llevan tu nombre, la clínica y la fecha; nunca tu tratamiento.</p>
    </section>
  );
}
