/** Textos de la interfaz en dos registros: experto (términos de la norma) y pyme (sin jerga). */
import type { Fase, Rol } from '../../../../tools/sistema-integrado/dist/index.js';

export type Modo = 'pyme' | 'experto';

export const FASE_PYME: Record<Fase, string> = {
  0: 'Ver dónde estamos', 1: 'Conocer el negocio y su entorno', 2: 'Compromiso de la dirección', 3: 'Qué puede salir mal (y bien)',
  4: 'Gente, recursos y papeles', 5: 'Cómo se trabaja', 6: 'Medir y revisar', 7: 'Corregir y mejorar', 8: 'Prepararse para la auditoría',
};
export const FASE_EXPERTO: Record<Fase, string> = {
  0: 'Diagnóstico', 1: 'Contexto y alcance (cl. 4)', 2: 'Liderazgo (cl. 5)', 3: 'Planificación (cl. 6)', 4: 'Soporte (cl. 7)',
  5: 'Operación (cl. 8)', 6: 'Evaluación del desempeño (cl. 9)', 7: 'Mejora (cl. 10)', 8: 'Preparación para la certificación',
};
export const nombreFase = (f: Fase, m: Modo) => (m === 'pyme' ? FASE_PYME[f] : FASE_EXPERTO[f]);

export const ROL: Record<Rol, string> = {
  consultor: 'Consultor', admin_pyme: 'Administración', alta_direccion: 'Alta dirección', dueno_proceso: 'Dueño de proceso', auditor_interno: 'Auditor interno',
};

export const EDICION: Record<string, string> = {
  'iso-9001:2015+a1:2024': 'ISO 9001:2015 + A1:2024', 'iso-9001:2026': 'ISO 9001:2026', 'iso-iec-42001:2023': 'ISO/IEC 42001:2023',
};
export const EDICION_PYME: Record<string, string> = {
  'iso-9001:2015+a1:2024': 'Calidad (9001, edición 2015)', 'iso-9001:2026': 'Calidad (9001, edición 2026)', 'iso-iec-42001:2023': 'Uso responsable de IA (42001)',
};
export const nombreEdicion = (e: string, m: Modo) => (m === 'pyme' ? EDICION_PYME[e] : EDICION[e]) ?? e;

export const ESTADO_DOC: Record<string, string> = { borrador: 'Borrador', en_revision: 'En revisión', aprobado: 'Aprobado', rechazado: 'Rechazado' };

/** Aviso que acompaña siempre a la app: preparar no es certificar. */
export const NO_CERTIFICA = 'Esta app prepara a la organización para la auditoría de un organismo de certificación acreditado (en México, acreditado por la EMA). La certificación solo la otorga ese organismo.';
