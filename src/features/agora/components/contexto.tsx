'use client';

/** Los datos de Ágora que el servidor leyó con la sesión de la persona: los comparten el explorador, el panel y el plan. */
import { createContext, useContext } from 'react';
import type { DatosDeAgora } from '../types';

export const ContextoAgora = createContext<DatosDeAgora>({ apagada: true, motivo: 'cargando' });
export const useAgora = () => useContext(ContextoAgora);
