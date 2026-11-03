/**
 * La forma común de un caso de laboratorio ya corrido: lo que repetían, casi letra por letra, las
 * `tarjeta-caso.tsx` de `/laboratorio-etiquetas` y `/laboratorio-pymes`. Cada laboratorio conserva su
 * propio `Caso` (con su `corre`); lo que se pinta es esto, y lo pinta una sola tarjeta.
 */
export type EstadoDeCaso = 'pasa' | 'falla' | 'no-medido';

export interface CasoVisible {
  readonly id: string;
  readonly titulo: string;
  /** Qué entra, dicho: sintético o el corpus real del laboratorio. */
  readonly entrada: string;
  /** Qué trampa pone a prueba, o `null` si es el camino feliz. */
  readonly trampa: string | null;
  readonly esperado: EstadoDeCaso;
  /** Lo que el caso necesita y no siempre hay (sin eso queda «no medido», nunca «pasa»). */
  readonly requiere?: string;
}

export interface ResultadoVisible {
  readonly estado: EstadoDeCaso;
  /** Lo que salió de verdad. Una línea que empieza con «✗» es un fallo. */
  readonly evidencia: readonly string[];
  readonly veredicto: string;
}

export interface CasoCorridoVisible {
  readonly caso: CasoVisible;
  readonly resultado: ResultadoVisible;
  /** Dio lo que declara (o quedó «no medido» porque falta lo que requiere, y así lo dice). */
  readonly coincide: boolean;
  readonly ms: number;
}

export const ETIQUETA_DE_ESTADO: Readonly<Record<EstadoDeCaso, string>> = {
  pasa: 'pasa',
  falla: 'falla',
  'no-medido': 'no medido',
};

/** Resumen de una corrida: cuántos pasan, fallan y quedan sin medir, y si todos dieron lo que declaran. */
export function resumeCasos(corridos: readonly CasoCorridoVisible[]) {
  const cuenta = (e: EstadoDeCaso) => corridos.filter((c) => c.resultado.estado === e).length;
  return { total: corridos.length, pasa: cuenta('pasa'), falla: cuenta('falla'), noMedido: cuenta('no-medido'), coinciden: corridos.every((c) => c.coincide) };
}
