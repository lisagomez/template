'use client';

/**
 * La capa del laboratorio (`(main)`): su composición es dato (`productos/composiciones/laboratorio.json`) y aquí solo
 * va lo que sus módulos aportan en la app: los manejadores de lo que de verdad se ejecuta y los componentes de ranura.
 */
import type { ReactNode } from 'react';
import laboratorio from '../../../productos/composiciones/laboratorio.json' with { type: 'json' };
import { BotonDictado } from '@/features/dictado/components/boton-dictado';
import { CapaApp } from './capa-app';
import { manejadoresDeCalendario, PlanDelCalendario } from './modulos/calendario';
import { moduloDeVozLocal } from './modulos/voz';

/** Lo que cada módulo pinta en su ranura: el calendario en el plan y el dictado de escritorio en la voz. */
const COMPONENTES = { calendario: { plan: PlanDelCalendario }, dictado: { voz: BotonDictado } };

/** La voz LOCAL de la ranura (Parakeet, Piper y Silero, por el demonio de tools/dictado): una sola instancia, fuera del render. */
const VOZ = moduloDeVozLocal();

export function CapaLaboratorio({ children }: { children: ReactNode }) {
  return <CapaApp composicion={laboratorio} manejadores={manejadoresDeCalendario} componentes={COMPONENTES} voz={VOZ}>{children}</CapaApp>;
}
