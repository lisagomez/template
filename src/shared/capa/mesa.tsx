'use client';

/**
 * La capa de la mesa del experto (`/mesa`), con la marca y el asistente de Soporte SAP
 * (`productos/composiciones/soporte-sap.json`). Su ranura de conversación resuelve SIN LLM, con el enrutador de la capa,
 * las intenciones que declara el enchufe de Soporte SAP: «prueba este caso», «¿por qué dijiste no lo sé en el paso 3?» y
 * «muéstrame lo que te enseñé». Lo que contesta sale de la API de la mesa, con la identidad del experto: su memoria es la
 * de la mesa, y no habla con ningún asistente personal.
 *
 * Lo que escribe el experto no se guarda en su navegador: la conversación vive en la memoria de esta pestaña y lo que se
 * corre, en el almacén de la mesa. En el navegador solo queda si ya vio la guía (`almacen-capa.ts`).
 */
import { useState, type ReactNode } from 'react';
import mesa from '../../../productos/composiciones/soporte-sap.json' with { type: 'json' };
import { AlmacenCapaDeLaMesa } from '@/features/soporte-sap/mesa/services/almacen-capa';
import { avisaCasoCorrido, canalHttp, manejadoresDeLaMesa } from '@/features/soporte-sap/mesa/services/conversacion-mesa';
import { CapaApp } from './capa-app';

/** Fuera del componente: si cambiaran en cada render, la capa rehace la conversación y la pierde. */
const MANEJADORES = manejadoresDeLaMesa(canalHttp(), avisaCasoCorrido);

export function CapaMesa({ children }: { children: ReactNode }) {
  const [almacen] = useState(() => new AlmacenCapaDeLaMesa());
  return <CapaApp composicion={mesa} inquilino="mesa" almacen={almacen} manejadores={MANEJADORES}>{children}</CapaApp>;
}
