/**
 * Visibilidad en buscadores y en asistentes de IA (adaptado de `seo-ai-visibility`): auditoría de
 * solo lectura, arreglos como archivos para copiar y la prueba del asistente que hace el dueño.
 */
import type { SeccionDelLunes } from '../comun/lunes.js';
import { seccionSinDatos } from '../comun/lunes.js';
import type { Auditoria } from './auditoria.js';

export function visibilidadParaElLunes(a: Auditoria | null): SeccionDelLunes {
  if (!a) return seccionSinDatos('visibilidad', 'Si te encuentran', 'no se revisó el sitio esta semana');
  return {
    fuente: 'visibilidad', titulo: 'Si te encuentran', estado: 'ok', motivo: null,
    hallazgos: [a.enUnaLinea, ...a.cinco.slice(1, 4).map((h) => `${h.titulo} (${h.impacto}, ${h.tiempo})`)],
    acciones: a.cinco.slice(0, 1).map((h) => ({ titulo: h.decision ? `Decide: ${h.titulo.toLowerCase()}` : `Arregla: ${h.titulo.toLowerCase()}`, porque: h.detalle, impacto: null, prioridad: h.impacto === 'alto' ? 1 : 2, fuente: 'visibilidad' })),
  };
}

export { auditaVisibilidad, type Auditoria, type Hallazgo, type EntradaDeAuditoria, type Impacto, type Esfuerzo } from './auditoria.js';
export { robotsPropuesto, llmsTxt, jsonLdNegocio, registraPrueba, type DatosDelNegocio, type PruebaDelAsistente } from './archivos.js';
export { RASTREADORES_IA, bloqueaRaiz, gruposDeRobots } from './robots.js';
