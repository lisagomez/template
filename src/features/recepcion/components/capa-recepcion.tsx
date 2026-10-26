'use client';

/**
 * Recepción montada en la capa. La composición es DATO (`productos/composiciones/recepcion.json`: marca, asistente,
 * módulos, ranuras, memoria por inquilino, modelo y resumen); aquí solo va lo que sus módulos aportan en la app:
 * los manejadores de sus intenciones y lo que cada módulo pinta en su ranura. Intercambiar un módulo es editar la
 * composición y este mapa, nunca la capa.
 */
import type { ReactNode } from 'react';
import recepcion from '../../../../productos/composiciones/recepcion.json' with { type: 'json' };
import { CapaApp } from '@/shared/capa/capa-app';
import { moduloDeVozLocal } from '@/shared/capa/modulos/voz';
import { NEGOCIO } from '../datos.ts';
import { manejadoresDeRecepcion } from '../services/manejadores.ts';
import { agendaDelMostrador } from '../hooks/use-agenda';
import { PlanDelMostrador } from './plan-del-mostrador';

const MANEJADORES = manejadoresDeRecepcion(agendaDelMostrador);

/** Módulo → ranura → lo que pinta: tools/calendario llena el plan. La ranura de voz la llena `dictado` sin pintar nada
 *  propio: el botón y el dictado los pone la capa con el módulo de voz local. */
const COMPONENTES = { calendario: { plan: PlanDelMostrador } };

/** La voz LOCAL (Parakeet, Piper y Silero, por el demonio de tools/dictado): el audio no sale de la máquina. */
const VOZ = moduloDeVozLocal();

export function CapaRecepcion({ children }: { children: ReactNode }) {
  return (
    <CapaApp composicion={recepcion} inquilino={NEGOCIO.inquilino} manejadores={MANEJADORES} componentes={COMPONENTES} voz={VOZ}>
      {children}
    </CapaApp>
  );
}
