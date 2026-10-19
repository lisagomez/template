'use client';

/**
 * Las próximas citas y, por cada una, sus avisos: qué se programó, qué se envió, por qué canal y en qué estado
 * quedó (entregado, fallido, cancelado por baja…), con lo que la persona puede hacer en cada caso. Cancelar pide
 * confirmación explícita; con menos de 24 h se llama a la clínica. Abajo, sus consentimientos: retirar es un clic.
 */
import Link from 'next/link';
import { useState } from 'react';
import { cambiarConsentimiento, cancelar, enlaceTelegram } from '../../services/servidor/acciones';
import { Aviso, clasesBoton, clasesBotonSecundario } from '../ui';
import type { VinculoWhatsappUI, VistaCitaUI, VistaAvisoUI } from '../../types';
import { VinculoWhatsapp } from './vinculo-whatsapp';

const CLASE: Record<VistaAvisoUI['clase'], string> = { confirmacion: 'Confirmación', recordatorio_24h: 'Recordatorio 24 h antes', recordatorio_2h: 'Recordatorio 2 h antes', cancelacion: 'Aviso de cancelación', newsletter: 'Newsletter' };
const ESTADO: Record<VistaAvisoUI['estado'], { texto: string; tono: string }> = {
  programado: { texto: 'Programado', tono: 'bg-slate-100 text-slate-800' }, esperando_vinculo: { texto: 'Esperando que vincules el canal', tono: 'bg-amber-100 text-amber-900' },
  enviando: { texto: 'Enviando', tono: 'bg-slate-100 text-slate-800' }, enviado: { texto: 'Enviado', tono: 'bg-sky-100 text-sky-900' }, entregado: { texto: 'Entregado', tono: 'bg-emerald-100 text-emerald-900' },
  leido: { texto: 'Leído', tono: 'bg-emerald-100 text-emerald-900' },
  fallido: { texto: 'No se pudo entregar', tono: 'bg-red-100 text-red-900' }, cancelado: { texto: 'Cancelado', tono: 'bg-slate-200 text-slate-700' },
  incierto: { texto: 'No sabemos si llegó', tono: 'bg-amber-100 text-amber-900' },
};
const MOTIVO: Record<string, string> = {
  rebote: 'tu correo rebotó', sin_vincular: 'no vinculaste el canal', bot_no_iniciado: 'el bot no puede escribirte primero', baja: 'te diste de baja', cita_cancelada: 'cancelaste la cita',
  cita_reprogramada: 'cambiaste la cita', consentimiento_retirado: 'retiraste el permiso', limite: 'el proveedor pidió esperar; se reintenta',
  no_whatsapp: 'ese número no tiene WhatsApp; te lo mandamos por correo', plantilla: 'WhatsApp detuvo el mensaje; te lo mandamos por correo',
  canal_desconectado: 'el WhatsApp de la clínica está desconectado; te lo mandamos por correo', fuera_de_ventana: 'WhatsApp no dejó mandarlo',
};
const NOMBRE_CANAL: Record<VistaAvisoUI['canal'], string> = { correo: 'Correo', telegram: 'Telegram', whatsapp: 'WhatsApp' };

function FilaAviso({ a, alVincular }: { a: VistaAvisoUI; alVincular: () => void }) {
  const e = ESTADO[a.estado];
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <span><span className="font-medium">{CLASE[a.clase]}</span> · {NOMBRE_CANAL[a.canal]} · <span className="text-slate-600">{a.cuando}</span></span>
      <span className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.tono}`}>{e.texto}{a.motivo && MOTIVO[a.motivo] ? `: ${MOTIVO[a.motivo]}` : ''}</span>
        {a.accion === 'vincular_telegram' ? <button type="button" className="text-xs font-medium underline" onClick={alVincular}>Iniciar chat</button> : null}
        {a.accion === 'revisar_correo' ? <span className="text-xs">Revisa tu correo con la clínica</span> : null}
        {a.accion === 'vincular_whatsapp' ? <a className="text-xs font-medium underline" href="#mi-whatsapp">Vincular WhatsApp</a> : null}
      </span>
    </li>
  );
}

interface PropsMisCitas { clinica: string; citas: VistaCitaUI[]; newsletter: VistaAvisoUI[]; consentimientos: Record<string, boolean>; telefono: string; whatsapp: VinculoWhatsappUI; laboratorioWhatsapp: string | null }

export function MisCitas({ clinica, citas, newsletter, consentimientos, telefono, whatsapp, laboratorioWhatsapp }: PropsMisCitas) {
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null);
  const [enlace, setEnlace] = useState<string | null>(null);
  const vincula = async () => {
    const r = await enlaceTelegram(clinica);
    if (r.ok) setEnlace(r.valor.enlace);
  };
  const cancela = async (id: string) => {
    const r = await cancelar(clinica, id);
    setConfirmando(null);
    setMensaje(r.ok ? { tono: 'ok', texto: 'Cita cancelada: el horario quedó libre y los recordatorios se cancelaron.' } : { tono: 'error', texto: r.error });
  };
  const consiente = async (tipo: string, valor: boolean) => {
    const r = await cambiarConsentimiento(clinica, tipo, valor);
    setMensaje(r.ok ? { tono: 'ok', texto: valor ? 'Listo, lo activamos.' : 'Listo, lo retiramos.' } : { tono: 'error', texto: r.error });
  };
  return (
    <div className="space-y-6">
      {mensaje ? <Aviso tono={mensaje.tono}>{mensaje.texto}</Aviso> : null}
      {enlace ? <Aviso>Un bot no puede escribirte primero: abre el enlace y pulsa «Iniciar». Sirve una sola vez y caduca en 24 horas. <a className="font-semibold underline" href={enlace} target="_blank" rel="noopener noreferrer" data-enlace-telegram={enlace}>Abrir Telegram</a></Aviso> : null}
      {citas.length === 0 ? <Aviso>No tienes citas próximas. <Link className="underline" href={`/clinica/${clinica}/agenda`}>Agenda una</Link>.</Aviso> : null}
      <ul className="space-y-4">
        {citas.map((v) => (
          <li key={v.id} className="rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{v.servicio}</h2>
                <p className="text-slate-700">{v.cuando}</p>
              </div>
              {v.puedeCambiar ? (
                <div className="flex gap-2">
                  <Link className={clasesBotonSecundario} href={`/clinica/${clinica}/agenda?reprograma=${v.id}`}>Cambiar</Link>
                  <button type="button" className={clasesBotonSecundario} onClick={() => setConfirmando(v.id)}>Cancelar</button>
                </div>
              ) : <p className="text-sm text-slate-600">Faltan menos de 24 h: para cambiarla llama al <a className="underline" href={`tel:${telefono.replace(/\s/g, '')}`}>{telefono}</a>.</p>}
            </div>
            {confirmando === v.id ? (
              <div role="alertdialog" aria-labelledby={`cancelar-${v.id}`} className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                <p id={`cancelar-${v.id}`} className="text-sm font-medium">¿Seguro que quieres cancelar esta cita?</p>
                <div className="mt-2 flex gap-2"><button type="button" className={clasesBoton} onClick={() => void cancela(v.id)}>Sí, cancelar</button><button type="button" className={clasesBotonSecundario} onClick={() => setConfirmando(null)}>No</button></div>
              </div>
            ) : null}
            <h3 className="mt-4 text-sm font-semibold text-slate-700">Avisos de esta cita</h3>
            {v.avisos.length === 0 ? <p className="text-sm text-slate-600">Elegiste no recibir avisos.</p> : <ul className="divide-y divide-slate-100">{v.avisos.map((a) => <FilaAviso key={a.id} a={a} alVincular={() => void vincula()} />)}</ul>}
          </li>
        ))}
      </ul>
      <VinculoWhatsapp clinica={clinica} estado={whatsapp} telefonoClinica={telefono} laboratorio={laboratorioWhatsapp} />
      {newsletter.length ? <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200"><h2 className="font-semibold">Newsletter</h2><ul className="divide-y divide-slate-100">{newsletter.map((a) => <FilaAviso key={a.id} a={a} alVincular={() => void vincula()} />)}</ul></section> : null}
      <Consentimientos valores={consentimientos} alCambiar={(t, v) => void consiente(t, v)} />
    </div>
  );
}

function Consentimientos({ valores, alCambiar }: { valores: Record<string, boolean>; alCambiar: (tipo: string, valor: boolean) => void }) {
  const filas: [string, string][] = [['recordatorios', 'Recordatorios de mis citas'], ['whatsapp', 'Avisos por WhatsApp'], ['telegram', 'Avisos por Telegram'], ['newsletter', 'Newsletter con novedades y promociones'], ['datos_salud', 'Tratamiento de la descripción de mi padecimiento (dato de salud)']];
  return (
    <section aria-labelledby="mis-permisos" className="rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:p-5">
      <h2 id="mis-permisos" className="font-semibold">Mis permisos</h2>
      <p className="text-sm text-slate-600">Retirarlos es tan fácil como darlos. Si retiras el de salud, borramos la descripción.</p>
      <ul className="mt-2 divide-y divide-slate-100">
        {filas.map(([t, texto]) => (
          <li key={t} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>{texto}: <strong>{valores[t] ? 'activo' : 'no activo'}</strong></span>
            {valores[t] ? <button type="button" className={clasesBotonSecundario} onClick={() => alCambiar(t, false)}>Retirar</button> : t === 'datos_salud' ? null : t === 'whatsapp' ? <a className="text-xs underline" href="#mi-whatsapp">Vincular arriba</a> : <button type="button" className={clasesBotonSecundario} onClick={() => alCambiar(t, true)}>Activar</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
