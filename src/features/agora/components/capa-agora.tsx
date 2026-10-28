'use client';

/**
 * Ágora montada en la capa. La composición es DATO (`productos/composiciones/agora.json`: marca, asistente, módulos,
 * ranuras, memoria por organización, voz local y resumen de solo conteos); aquí solo va lo que sus módulos aportan:
 * los manejadores de sus intenciones y lo que cada uno pinta en su ranura. Intercambiar un módulo es editar la
 * composición y este mapa, nunca la capa.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import agora from '../../../../productos/composiciones/agora.json' with { type: 'json' };
import { CapaApp } from '@/shared/capa/capa-app';
import { moduloDeVozLocal } from '@/shared/capa/modulos/voz';
import { HiloDeLaCategoria } from '@/features/agora-buzon/components/hilo-de-la-categoria';
import { PlanDeAgora } from './plan-de-agora';
import { AlmacenDeAgora } from '../services/almacen';
import { manejadoresDeAgora } from '../services/manejadores';
import type { DatosDeAgora } from '../types';
import { ArbolDeAgora } from './arbol';
import { ContextoAgora } from './contexto';
import { EsperaTuClic } from './espera-tu-clic';
import { VerComo } from './ver-como';

/** Módulo → ranura → lo que pinta. La voz la llena `dictado` con los motores LOCALES: el audio no sale de la máquina. */
const COMPONENTES = {
  agora: { explorador: ArbolDeAgora, panel: EsperaTuClic },
  'agora-buzon': { conversacion: HiloDeLaCategoria },
  calendario: { plan: PlanDeAgora },
};
const VOZ = moduloDeVozLocal();

/** Lo vigente para los manejadores: los datos del último render y la URL abierta. */
class Vigente {
  private d: DatosDeAgora;
  private p: { get(k: string): string | null };
  constructor(d: DatosDeAgora, p: { get(k: string): string | null }) { this.d = d; this.p = p; }
  pon(d: DatosDeAgora, p: { get(k: string): string | null }) { this.d = d; this.p = p; }
  datos() { return this.d; }
  parametro(k: string) { return this.p.get(k); }
}

export function CapaAgora({ datos, children }: { datos: DatosDeAgora; children: ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  // Los manejadores son estables (si cambian, la capa rehace la conversación y pierde lo pendiente del freno): leen
  // los datos y la URL vigentes de este contenedor, que se pone al día después de cada render.
  const [vigente] = useState(() => new Vigente(datos, params));
  useEffect(() => vigente.pon(datos, params), [vigente, datos, params]);
  const almacen = useMemo(() => new AlmacenDeAgora(), []);
  const manejadores = useMemo(() => manejadoresDeAgora({
    datos: () => vigente.datos(),
    parametro: (k) => vigente.parametro(k),
    navega: (r) => router.push(r),
    refresca: () => router.refresh(),
  }), [router, vigente]);
  const inquilino = datos.apagada ? 'golfo-norte' : datos.yo.org.slug;
  return (
    <ContextoAgora.Provider value={datos}>
      <CapaApp composicion={agora} inquilino={inquilino} manejadores={manejadores} componentes={COMPONENTES} voz={VOZ} almacen={almacen} extra={<VerComo />}>
        {children}
      </CapaApp>
    </ContextoAgora.Provider>
  );
}
