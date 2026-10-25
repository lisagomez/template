/**
 * Las frases con las que se mide el HUD, en un solo sitio: las usan la medición de punta a punta
 * (`mide.ts`) y la del detector con ruido (`mide-detector.ts`).
 */
export const VOCES = ['es_MX-claude-high', 'es_ES-davefx-medium'];
export const ORDENES = ['¿Qué hora es?', '¿Qué tengo hoy?', 'Más despacio.', '¿Qué día es hoy?', 'Más rápido.', '¿Qué tengo mañana?', '¿Cuánto llevas gastado?', 'Repite.'];

/**
 * Preguntas con pausa (25/10): una primera parte, una pausa y más habla del MISMO turno. La primera parte de las
 * cuatro primeras es una pregunta completa (el peor caso del cierre por sentido); en las cuatro últimas la pausa cae
 * dentro de la frase. Sirve para contar cuántas parte en dos la máquina.
 */
export const PAUSAS: readonly (readonly [string, string])[] = [
  ['¿Qué es un balance general?', 'Lo pregunto por mi negocio.'],
  ['¿Cómo calculo el margen bruto?', 'Y también el neto.'],
  ['¿Conviene rentar el local?', 'O mejor lo compro.'],
  ['¿Qué es la depreciación?', 'Mi contador la mencionó ayer.'],
  ['¿Qué diferencia hay entre la utilidad', 'y el flujo de caja?'],
  ['¿Para qué sirve', 'el capital de trabajo?'],
  ['Explícame cómo armar', 'un presupuesto mensual.'],
  ['¿Cuánto debo cobrar', 'por una consulta?'],
];
