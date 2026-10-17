/**
 * El SIMULADOR DE TELEGRAM visto desde el teléfono del paciente (laboratorio): los chats de cada bot de clínica,
 * el `/start <token>` con el que se vinculó, el aviso con el REEL (sendVideo) y los recordatorios.
 */
import Link from 'next/link';
import type { MensajeSimulado } from '../../../../../tools/clinica-dental/dist/servidor.js';
import { CLINICAS } from '../../../../../tools/clinica-dental/dist/index.js';

export interface EntradaHistorial { bot: string; chat: number; direccion: 'entrante' | 'saliente'; mensaje: MensajeSimulado }

const hora = (s: number) => new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(s * 1000));

export function Telegram({ historial, elegido }: { historial: EntradaHistorial[]; elegido: string | null }) {
  const chats = [...new Map(historial.map((h) => [`${h.bot}:${h.chat}`, h])).values()];
  const actual = chats.find((h) => `${h.bot}:${h.chat}` === elegido) ?? chats[0] ?? null;
  const mensajes = actual ? historial.filter((h) => h.bot === actual.bot && h.chat === actual.chat) : [];
  const clinica = CLINICAS.find((c) => c.botTelegram === actual?.bot);
  return (
    <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
      <nav aria-label="Chats" className="rounded-xl bg-white ring-1 ring-slate-200">
        <ul className="divide-y divide-slate-100">
          {chats.map((h) => (
            <li key={`${h.bot}:${h.chat}`}><Link className="block px-3 py-2 text-sm hover:bg-slate-50" href={`?chat=${h.bot}:${h.chat}`}><span className="font-medium">@{h.bot}</span><span className="block text-xs text-slate-600">chat {h.chat}</span></Link></li>
          ))}
        </ul>
        {chats.length === 0 ? <p className="p-4 text-sm text-slate-600">Ningún paciente ha iniciado un chat con los bots.</p> : null}
      </nav>
      {actual ? (
        <section aria-label={`Chat con @${actual.bot}`} className="mx-auto w-full max-w-sm overflow-hidden rounded-[2rem] border-8 border-slate-900 bg-[#e7ebe6] shadow-xl">
          <header className="bg-[#517da2] px-4 py-3 text-white"><p className="font-semibold">{clinica?.nombre ?? actual.bot}</p><p className="text-xs opacity-90">bot · @{actual.bot} (simulado)</p></header>
          <ol className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-3">
            {mensajes.map((h, i) => (
              <li key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm shadow-sm ${h.direccion === 'entrante' ? 'ml-auto bg-[#effdde]' : 'bg-white'}`}>
                {h.mensaje.video && clinica ? <video controls muted playsInline preload="auto" className="mb-2 w-full rounded-lg" src={`/api/clinica-dental/reel/${clinica.id}`} aria-label="Reel de servicios y promociones de la clínica" /> : null}
                <p className="whitespace-pre-wrap">{h.mensaje.caption ?? h.mensaje.text}</p>
                <p className="mt-1 text-right text-[10px] text-slate-500">{hora(h.mensaje.date)}{h.mensaje.video ? ' · sendVideo' : ''}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
