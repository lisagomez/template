'use client';

/** Que panel le toca a cada caso. Un caso PUERTA HUMANA siempre muestra el panel de puerta, este lo que este declarado. */
import { CLASE_MUESTRA, COMANDOS_MUESTRA, NOTA_MUESTRA, RECORDATORIO_MUESTRA } from '../../services/muestras.ts';
import type { Caso, EstadoCaso } from '../../types/index.ts';
import type { ContextoPanel } from './contexto.ts';
import { PanelCelular } from './panel-celular.tsx';
import { PanelComandos } from './panel-comandos.tsx';
import { PanelCompetencias } from './panel-competencias.tsx';
import { PanelFaq } from './panel-faq.tsx';
import { PanelLocucion } from './panel-locucion.tsx';
import { PanelPicking } from './panel-picking.tsx';
import { PanelPodcast } from './panel-podcast.tsx';
import { PanelPuerta } from './panel-puerta.tsx';
import { PanelReunion } from './panel-reunion.tsx';
import { PanelSentimiento } from './panel-sentimiento.tsx';
import { PanelTranscribir } from './panel-transcribir.tsx';

export function PanelCaso({ caso, estado, contexto }: { caso: Caso; estado: EstadoCaso; contexto: ContextoPanel }) {
  const { token, voces } = contexto;
  if (estado === 'puerta') return <PanelPuerta caso={caso} />;
  switch (caso.panel) {
    case 'transcribir':
      return <PanelTranscribir token={token} muestra={{ texto: NOTA_MUESTRA, nombre: 'nota de muestra leída por la voz sintética' }} avisoRuido={caso.slug === 'manos-libres-epi'} />;
    case 'segmentos':
      return <PanelTranscribir token={token} conTiempos conCapitulos={caso.slug === 'lectura-de-clases'} muestra={{ texto: CLASE_MUESTRA, nombre: 'clase de muestra leída por la voz sintética' }} />;
    case 'comandos':
      return <PanelComandos token={token} muestra={caso.slug === 'recordatorios' ? RECORDATORIO_MUESTRA : COMANDOS_MUESTRA} modoRecordatorio={caso.slug === 'recordatorios'} />;
    case 'reunion':
      return <PanelReunion token={token} entradaInicial={caso.slug === 'reunion-grupal' ? 'reunion' : 'llamada'} enfoque={caso.slug === 'feedback-asesor' ? 'score' : caso.slug === 'asesoria-especializada' ? 'playbook' : caso.slug === 'reunion-grupal' ? 'turnos' : 'insights'} />;
    case 'sentimiento':
      return <PanelSentimiento token={token} />;
    case 'competencias':
      return <PanelCompetencias token={token} />;
    case 'faq':
      return <PanelFaq token={token} />;
    case 'locucion':
      return <PanelLocucion token={token} voces={voces} />;
    case 'podcast':
      return <PanelPodcast token={token} />;
    case 'picking':
      return <PanelPicking token={token} />;
    case 'celular':
      return <PanelCelular token={token} />;
    default:
      return <PanelPuerta caso={caso} />;
  }
}
