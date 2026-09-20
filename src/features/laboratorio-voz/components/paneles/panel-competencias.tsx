'use client';

/** Competencias orales medidas sobre la grabacion de la persona: ritmo, muletillas, pausas, tiempo hablado. */
import { useTranscripcion } from '../../hooks/use-transcripcion.ts';
import { evaluaCompetencias, REFERENCIA } from '../../services/competencias.ts';
import { CLASE_MUESTRA } from '../../services/muestras.ts';
import { formateaMs } from '../../services/texto.ts';
import { EntradaAudio } from '../entrada-audio.tsx';
import { Aviso, Metrica, Ocupado } from '../ui.tsx';
import { ListaSegmentos } from './segmentos-ui.tsx';

export function PanelCompetencias({ token }: { token: string | undefined }) {
  const stt = useTranscripcion(token);
  const segmentos = stt.resultado?.segmentos ?? [];
  const c = segmentos.length > 0 ? evaluaCompetencias(segmentos, (stt.resultado?.segundosAudio ?? 0) * 1000) : undefined;
  return (
    <div className="space-y-3" data-prueba="panel-competencias">
      <EntradaAudio token={token} ocupado={stt.ocupado} muestra={{ texto: CLASE_MUESTRA, nombre: 'exposición de muestra leída por la voz sintética' }} alAudio={(a) => void stt.corre(a, { modo: 'tiempos', hablantes: 1 })} />
      {stt.ocupado ? <Ocupado texto="Transcribiendo con tiempos…" /> : null}
      {stt.error ? <Aviso tipo="error">{stt.error}</Aviso> : null}
      {c ? (
        <>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6" data-prueba="metricas">
            <Metrica nombre="Palabras" valor={c.palabras} />
            <Metrica nombre="Palabras / min" valor={c.palabrasPorMinuto} pista={REFERENCIA.palabrasPorMinuto} />
            <Metrica nombre="Tiempo hablado" valor={`${c.segundosHabla} s de ${c.segundosTotales} s`} pista={`${Math.round(c.ratioHabla * 100)} %`} />
            <Metrica nombre="Muletillas / min" valor={c.muletillasPorMinuto} pista={REFERENCIA.muletillasPorMinuto} />
            <Metrica nombre="Pausas > 1,5 s" valor={c.pausasLargas.length} pista={REFERENCIA.pausasLargas} />
            <Metrica nombre="Frase más larga" valor={`${c.fraseMasLarga} palabras`} />
          </div>
          {c.muletillas.length > 0 ? <p className="text-sm">Muletillas encontradas: {c.muletillas.map((m) => `«${m.palabra}» ×${m.veces}`).join(', ')}</p> : <p className="text-sm text-neutral-500">Sin muletillas de la lista.</p>}
          {c.pausasLargas.length > 0 ? <p className="text-xs text-neutral-500">Pausas largas en: {c.pausasLargas.map((p) => `${formateaMs(p.inicioMs)} (${(p.ms / 1000).toFixed(1)} s)`).join(', ')}</p> : null}
          <ListaSegmentos segmentos={segmentos} />
          <Aviso tipo="honesto">Mide, no juzga. Los rangos son orientativos; la voz sintética de la muestra no tiene muletillas, para eso graba tú.</Aviso>
        </>
      ) : null}
    </div>
  );
}
