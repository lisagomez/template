'use client';

/** Voz picking: la maquina lee la linea (TTS local), la persona confirma la cantidad (STT local), siguiente. */
import { useState } from 'react';
import { useTranscripcion } from '../../hooks/use-transcripcion.ts';
import { sintetizaVoz } from '../../services/cliente.ts';
import { evaluaConfirmacion, fraseParaLeer, PEDIDO_MUESTRA, type VeredictoConfirmacion } from '../../services/picking.ts';
import { EntradaAudio } from '../entrada-audio.tsx';
import { Aviso, Boton, claseEntrada, Ocupado, Reproductor } from '../ui.tsx';

const MENSAJE: Record<VeredictoConfirmacion['tipo'], (v: VeredictoConfirmacion) => string> = {
  ok: (v) => `Confirmado: ${v.tipo === 'ok' ? v.oido : ''}. Siguiente línea.`,
  'cantidad-distinta': (v) => `Oí ${v.tipo === 'cantidad-distinta' ? v.oido : ''}, pero la línea pide otra cantidad. Vuelve a confirmar.`,
  repetir: () => 'Repito la línea.',
  'no-entendi': () => 'No entendí una cantidad. Di solo el número.',
};

export function PanelPicking({ token }: { token: string | undefined }) {
  const [indice, setIndice] = useState(0);
  const [audioLinea, setAudioLinea] = useState<Blob | undefined>(undefined);
  const [leyendo, setLeyendo] = useState(false);
  const [mensaje, setMensaje] = useState<string | undefined>(undefined);
  const [tecleado, setTecleado] = useState('');
  const [historial, setHistorial] = useState<string[]>([]);
  const stt = useTranscripcion(token);
  const linea = PEDIDO_MUESTRA[indice];
  const terminado = !linea;

  const lee = async () => {
    if (!token || !linea) return;
    setLeyendo(true);
    try {
      const { audio } = await sintetizaVoz(token, fraseParaLeer(linea, indice + 1, PEDIDO_MUESTRA.length), undefined, 1);
      setAudioLinea(audio);
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'no se pudo leer la línea');
    } finally {
      setLeyendo(false);
    }
  };

  const confirma = (dicho: string) => {
    if (!linea) return;
    const v = evaluaConfirmacion(dicho, linea);
    setMensaje(`«${dicho}» → ${MENSAJE[v.tipo](v)}`);
    setHistorial((h) => [...h, `Línea ${indice + 1}: dijiste «${dicho}» → ${v.tipo}`]);
    if (v.tipo === 'ok') {
      setIndice((i) => i + 1);
      setAudioLinea(undefined);
    }
  };

  const confirmaPorVoz = async (audio: Blob) => {
    const r = await stt.corre(audio, { modo: 'rapido' });
    if (r?.texto) confirma(r.texto);
  };

  return (
    <div className="space-y-3" data-prueba="panel-picking">
      <ol className="grid gap-1 text-sm sm:grid-cols-3">
        {PEDIDO_MUESTRA.map((l, i) => (
          <li key={l.producto} className={`rounded-lg border px-3 py-2 ${i === indice ? 'border-neutral-900 dark:border-white' : i < indice ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950' : 'border-neutral-200 dark:border-neutral-800'}`}>
            <p className="text-xs text-neutral-500">{l.ubicacion}</p>
            <p>{l.producto}</p>
            <p className="font-semibold">{l.cantidad} unidades {i < indice ? '✓' : ''}</p>
          </li>
        ))}
      </ol>
      {terminado ? (
        <Aviso tipo="ok">Pedido completo: las tres líneas confirmadas por voz.</Aviso>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Boton variante="primario" onClick={() => void lee()} disabled={!token || leyendo}>
              {leyendo ? 'Generando la voz…' : `Escuchar la línea ${indice + 1}`}
            </Boton>
            <Boton onClick={() => { setIndice(0); setHistorial([]); setMensaje(undefined); setAudioLinea(undefined); }}>Reiniciar</Boton>
          </div>
          <Reproductor audio={audioLinea} etiqueta="La máquina dice:" />
          <p className="text-xs text-neutral-500">Confirma la cantidad de viva voz (graba y termina), o escríbela si no tienes micrófono.</p>
          <EntradaAudio token={token} ocupado={stt.ocupado} alAudio={(a) => void confirmaPorVoz(a)} />
          {stt.ocupado ? <Ocupado texto="Escuchando tu confirmación…" /> : null}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (tecleado.trim()) confirma(tecleado.trim()); setTecleado(''); }}>
            <input value={tecleado} onChange={(e) => setTecleado(e.target.value)} placeholder="o escribe la cantidad: «tres»" className={claseEntrada} />
            <Boton type="submit">Confirmar</Boton>
          </form>
        </>
      )}
      {stt.error ? <Aviso tipo="error">{stt.error}</Aviso> : null}
      {mensaje ? <Aviso tipo="info">{mensaje}</Aviso> : null}
      {historial.length > 0 ? (
        <ul className="text-xs text-neutral-500">
          {historial.map((h, i) => (
            <li key={`${i}-${h}`}>{h}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
