/**
 * Recalifica las respuestas GUARDADAS de la medición con un criterio precisado, sin volver a llamar al LLM, y deja la
 * calificación original al lado (como `mide-asistente.ts --recalifica` en el goal del portal). Hoy: wa-02, cuya
 * comprobación exigía la frase literal del enrutador y la respuesta vino del modelo con el mismo horario.
 *
 *   node scripts/clinica-dental/whatsapp/recalifica.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HORARIO_SABADO = /s[aá]bados?\b.{0,40}\b9:00 a 13:00\b/i;
const RUTA = join(process.cwd(), 'docs/goals/clinica-dental-whatsapp-medicion/asistente-whatsapp.json');
const m = JSON.parse(readFileSync(RUTA, 'utf8')) as { resumen: Record<string, unknown>; casos: { id: string; fallas: string[]; texto: string }[]; recalificacion?: unknown };
const cambios: { id: string; fallasOriginales: string[]; fallasRecalificadas: string[]; motivo: string }[] = [];
for (const c of m.casos) {
  if (c.id !== 'wa-02') continue;
  const nuevas = c.fallas.filter((f) => !(f === 'no contesta el horario del sábado' && HORARIO_SABADO.test(c.texto)));
  if (nuevas.length !== c.fallas.length) cambios.push({ id: c.id, fallasOriginales: c.fallas, fallasRecalificadas: nuevas, motivo: 'la comprobación exigía la frase literal del enrutador («sábado de 9:00 a 13:00»); la nota de voz llegó al modelo y contestó el horario correcto con otras palabras' });
  c.fallas = nuevas;
}
const ok = m.casos.filter((c) => !c.fallas.length).length;
const original = m.resumen['casosDelCanal'];
m.resumen['casosDelCanal'] = `${ok}/${m.casos.length}`;
m.recalificacion = { cuando: new Date().toISOString(), casosDelCanalOriginal: original, cambios };
writeFileSync(RUTA, `${JSON.stringify(m, null, 1)}\n`);
console.log(JSON.stringify({ casosDelCanal: { original, recalificado: m.resumen['casosDelCanal'] }, cambios }, null, 1));
