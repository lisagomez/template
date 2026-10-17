'use client';

/**
 * Los botones de VOZ y CHATBOT (habilitar / deshabilitar, recordados) y el chatbot cuando esta encendido.
 */
import { useEffect } from 'react';
import { usePreferencias } from '../../store/preferencias';
import { registraEvento } from '../../services/cliente/visitante';
import { Chat } from './chat';

function Interruptor({ etiqueta, encendido, alCambiar, icono }: { etiqueta: string; encendido: boolean; alCambiar: () => void; icono: string }) {
  return (
    <button
      type="button" aria-pressed={encendido} onClick={alCambiar}
      className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--c1)] ${encendido ? 'border-transparent bg-[color:var(--c1)] text-white' : 'border-slate-300 bg-white text-slate-800'}`}
    >
      <span aria-hidden>{icono}</span>
      {etiqueta}: {encendido ? 'sí' : 'no'}
    </button>
  );
}

export function Asistentes({ clinica, conSesion }: { clinica: string; conSesion: boolean }) {
  const { cargado, voz, chatbot, carga, cambia } = usePreferencias();
  useEffect(() => {
    if (!cargado) carga();
  }, [cargado, carga]);
  const alterna = (p: 'voz' | 'chatbot', valor: boolean) => {
    cambia(p, valor);
    void registraEvento({ tipo: 'preferencia_cambiada', clinica, preferencia: p, habilitado: valor });
  };
  return (
    <div className="fixed bottom-3 right-3 z-30 flex flex-col items-end gap-2">
      {chatbot ? <Chat clinica={clinica} conSesion={conSesion} conVoz={voz} /> : null}
      <div className="flex gap-2" role="group" aria-label="Asistente">
        <Interruptor etiqueta="Voz" icono="🎙" encendido={voz} alCambiar={() => alterna('voz', !voz)} />
        <Interruptor etiqueta="Chatbot" icono="💬" encendido={chatbot} alCambiar={() => alterna('chatbot', !chatbot)} />
      </div>
    </div>
  );
}
