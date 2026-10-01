/**
 * El laboratorio completo: casos deterministas (corren cada vez) + casos con LLM (se verifica lo grabado por
 * `npm run sgi:agentes`). La aprobación de cada pieza SALE de los resultados, nunca de una lista escrita a mano.
 */
import corridas from '../../../../public/laboratorio-sgi/corridas.json' with { type: 'json' };
import { CASOS_DETERMINISTAS, type Pieza } from './casos-deterministas.ts';
import { CASOS_LLM, verificaCaso, type CorridaGrabada, type Estado } from './casos-llm.ts';

export interface Resultado {
  readonly id: string;
  readonly pieza: string;
  readonly titulo: string;
  readonly trampa?: number;
  readonly estado: Estado;
  readonly evidencia: readonly string[];
  readonly costoUsd: number | null;
  readonly llm: boolean;
}

export const TRAMPAS: Readonly<Record<number, string>> = {
  1: 'ID inventado', 2: 'Cierre sin evidencia', 3: 'Rol equivocado', 4: 'Inyección en una evidencia', 5: 'Documento genérico',
  6: 'Texto de la norma', 7: 'Cruce de empresas', 8: 'Promesa de certificación', 9: 'Datos personales', 10: 'Doble cobertura',
};

export const PIEZAS: readonly string[] = ['catalogo', 'motor', 'documentos', 'salvaguardas', 'orquestador', 'base', 'diagnostico', 'contexto', 'riesgos', 'documental', 'capacitacion', 'proveedores', 'kpis', 'auditoria', 'portafolio'];

// El JSON lo escribe el corredor con lo que devolvió el modelo: su tipo inferido no se parece al declarado (los `datos`
// de cada propuesta son libres). Se trata como dato y cada caso lo verifica con sus reglas.
const archivo = corridas as unknown as { corridas: CorridaGrabada[]; gastoTotalUsd?: number; cuando?: string; modelos?: Record<string, string> };
export const grabadas = (): readonly CorridaGrabada[] => archivo.corridas;
export const infoCorridas = () => archivo;

export async function correLaboratorio(): Promise<Resultado[]> {
  const g = grabadas();
  const det: Resultado[] = [];
  for (const c of CASOS_DETERMINISTAS) {
    const r = await c.corre();
    det.push({ id: c.id, pieza: c.pieza as Pieza, titulo: c.titulo, ...(c.trampa ? { trampa: c.trampa } : {}), estado: r.estado, evidencia: r.evidencia, costoUsd: null, llm: false });
  }
  const llm: Resultado[] = CASOS_LLM.map((c) => {
    const r = verificaCaso(c, g);
    return { id: c.id, pieza: c.agente, titulo: c.titulo, ...(c.trampa ? { trampa: c.trampa } : {}), estado: r.estado, evidencia: r.evidencia, costoUsd: g.find((x) => x.id === c.id)?.costoUsd ?? null, llm: true };
  });
  return [...det, ...llm];
}

/** Piezas aprobadas: ≥5 casos y todos en «pasa». Un «no medido» NO aprueba. */
export function aprobadas(rs: readonly Resultado[]): { pieza: string; casos: number; pasan: number; noMedidos: number; aprobada: boolean }[] {
  return PIEZAS.map((p) => {
    const suyos = rs.filter((r) => r.pieza === p);
    const pasan = suyos.filter((r) => r.estado === 'pasa').length;
    const noMedidos = suyos.filter((r) => r.estado === 'no_medido').length;
    return { pieza: p, casos: suyos.length, pasan, noMedidos, aprobada: suyos.length >= 5 && pasan === suyos.length };
  });
}
