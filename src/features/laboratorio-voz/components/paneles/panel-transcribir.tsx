'use client';

/**
 * Hablar y que se escriba: rapido (solo texto) o con tiempos (turnos, buscador, capitulos).
 * El «antes» es el audio que entra; el «despues», el texto con su latencia medida.
 */
import { useTranscripcion } from '../../hooks/use-transcripcion.ts';
import { EntradaAudio, type Muestra } from '../entrada-audio.tsx';
import { Aviso, Boton, Metrica, Ocupado } from '../ui.tsx';
import { ListaSegmentos } from './segmentos-ui.tsx';

export function PanelTranscribir({ token, muestra, conTiempos = false, conCapitulos = false, avisoRuido = false }: { token: string | undefined; muestra?: Muestra; conTiempos?: boolean; conCapitulos?: boolean; avisoRuido?: boolean }) {
  const stt = useTranscripcion(token);
  const r = stt.resultado;
  const copia = () => {
    if (r?.texto) void navigator.clipboard.writeText(r.texto).catch(() => undefined);
  };
  return (
    <div className="space-y-3" data-prueba="panel-transcribir">
      <EntradaAudio token={token} muestra={muestra} ocupado={stt.ocupado} alAudio={(a) => void stt.corre(a, { modo: conTiempos ? 'tiempos' : 'rapido', ...(conTiempos ? { hablantes: 1 } : {}) })} />
      {stt.ocupado ? <Ocupado texto={conTiempos ? 'Transcribiendo con tiempos… (cerca de un minuto por cada veinte de audio)' : 'Transcribiendo en esta computadora…'} /> : null}
      {stt.error ? <Aviso tipo="error">{stt.error}</Aviso> : null}
      {r && r.texto ? (
        <div className="space-y-2" data-prueba="resultado">
          <div className="grid gap-2 sm:grid-cols-4">
            <Metrica nombre="Audio" valor={`${r.segundosAudio} s`} />
            <Metrica nombre="Motor" valor={r.msMotor !== undefined ? `${r.msMotor} ms` : '—'} pista="solo el reconocimiento" />
            <Metrica nombre="Total servidor" valor={`${r.ms} ms`} pista="con carga y lectura del audio" />
            <Metrica nombre="Visto desde aquí" valor={stt.msCliente !== undefined ? `${stt.msCliente} ms` : '—'} pista="incluye la red" />
          </div>
          <p className="text-xs text-neutral-500">Después · el texto ({r.motor})</p>
          <p className="rounded-lg border border-neutral-200 bg-white p-3 text-base dark:border-neutral-800 dark:bg-neutral-950" data-prueba="texto">{r.texto}</p>
          <Boton onClick={copia}>Copiar el texto</Boton>
          {conTiempos && r.segmentos ? <ListaSegmentos segmentos={r.segmentos} conBuscador conCapitulos={conCapitulos} /> : null}
          {avisoRuido ? <Aviso tipo="honesto">Cuenta los errores en tu grabación: esa es la medida real en tu entorno. La cifra de 3,3 % es con audio limpio y leído.</Aviso> : null}
        </div>
      ) : null}
    </div>
  );
}
