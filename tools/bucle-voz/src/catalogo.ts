/**
 * El catálogo de órdenes en español que el enrutador local resuelve sin modelo. Solo hay dos
 * clases que se EJECUTAN: control del propio bucle y lectura. La escritura no está aquí: la
 * detecta el enrutador por su verbo y el bucle la deja en dry-run.
 *
 * Los ejemplos son frases canónicas, no el corpus de medición: el acierto se mide con frases
 * que no están en esta lista (`medicion/corpus-enrutador.json`).
 */
import type { DefinicionOrden } from './enrutador.js';

export const ORDENES_ES: readonly DefinicionOrden[] = [
  { id: 'para', clase: 'control', ejemplos: ['para', 'detente', 'cállate', 'silencio', 'alto', 'basta', 'ya basta', 'deja de hablar', 'stop', 'calla', 'párale', 'no sigas', 'detén', 'calla ya', 'no más'] },
  { id: 'repite', clase: 'control', ejemplos: ['repite', 'repítelo', 'otra vez', '¿qué dijiste?', 'no te escuché', '¿puedes repetir?', 'dilo otra vez', 'repite lo último', 'no te entendí', '¿cómo?', 'de nuevo', 'no oí', '¿qué cosa?'] },
  { id: 'mas-despacio', clase: 'control', ejemplos: ['más despacio', 'más lento', 'habla más despacio', 'despacio', 'más pausado', 'baja la velocidad', 've más lento'] },
  { id: 'mas-rapido', clase: 'control', ejemplos: ['más rápido', 'habla más rápido', 'acelera', 'sube la velocidad', 'más deprisa', 've más rápido', 'más aprisa', 'acelera más'] },
  { id: 'duerme', clase: 'control', ejemplos: ['duérmete', 'a dormir', 'adiós', 'hasta luego', 'eso es todo', 'apágate', 'termina', 'nos vemos', 'ya terminamos', 'es todo', 'eso sería todo', 'terminamos'] },
  { id: 'confirma', clase: 'control', ejemplos: ['confirmo', 'confírmalo', 'sí confírmalo', 'adelante', 'hazlo', 'sí hazlo', 'procede'] },
  { id: 'olvida', clase: 'control', ejemplos: ['olvídalo', 'déjalo', 'cancela', 'cancela eso', 'no lo hagas', 'mejor no', 'descártalo', 'ya no', 'no lo hagas ya'] },
  { id: 'hora', clase: 'lectura', ejemplos: ['¿qué hora es?', 'dime la hora', 'la hora', '¿qué horas son?', '¿tienes la hora?'] },
  { id: 'fecha', clase: 'lectura', ejemplos: ['¿qué día es hoy?', '¿qué fecha es?', 'dime la fecha', '¿a qué estamos hoy?', 'la fecha de hoy', 'día de hoy', 'fecha'] },
  { id: 'agenda-hoy', clase: 'lectura', ejemplos: ['¿qué tengo hoy?', 'mi agenda de hoy', '¿qué hay en mi agenda?', '¿tengo reuniones hoy?', 'agenda de hoy', '¿cuál es mi agenda?', '¿qué pendientes tengo hoy?', 'mis citas de hoy', 'calendario de hoy', 'lee mi agenda', 'mis pendientes', 'agenda'] },
  { id: 'agenda-manana', clase: 'lectura', requiere: ['mañana'], ejemplos: ['¿qué tengo mañana?', 'mi agenda de mañana', '¿tengo reuniones mañana?', 'agenda de mañana', 'mis citas de mañana'] },
  { id: 'estado', clase: 'lectura', ejemplos: ['¿cómo vas?', 'estado del sistema', '¿cuánto tardaste?', 'latencia', 'telemetría', '¿qué tan rápido respondes?', 'estado', 'velocidad de respuesta', 'rendimiento', 'qué tan rápido'] },
  { id: 'gasto', clase: 'lectura', ejemplos: ['¿cuánto llevas gastado?', '¿cuánto has gastado?', 'presupuesto', 'gasto del cerebro', '¿cuánto me has costado?', 'cuánto llevas', 'cuánto cuesta el cerebro', 'gastos'] },
  { id: 'ayuda', clase: 'lectura', ejemplos: ['¿qué puedes hacer?', 'ayuda', '¿qué órdenes entiendes?', '¿qué sabes hacer?', 'órdenes disponibles', 'qué haces', 'qué puedo pedir', 'órdenes'] },
];
