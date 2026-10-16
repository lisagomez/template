/**
 * Capturas del laboratorio que salen del corte semántico: el tablero de unit economics y el grafo de atención, en
 * escritorio y celular. Corre después de `semantica/corre.mjs` y `analitica.ts`.
 *   node scripts/clinica-dental/capturas-tablero.ts
 */
import { auditaA11y, captura, cierra, contexto, registro } from './navegador.ts';
import { BASE } from './servidor.ts';

for (const vista of ['escritorio', 'celular'] as const) {
  const ctx = await contexto(vista);
  const p = await ctx.newPage();
  for (const [ruta, nombre] of [['tablero', '10-tablero-unit-economics'], ['grafo', '11-grafo-de-atencion']] as const) {
    await p.goto(`${BASE}/laboratorio-clinica-dental/${ruta}`, { waitUntil: 'networkidle' });
    await captura(p, vista, nombre, true);
    await auditaA11y(p, vista, ruta);
  }
  await ctx.close();
}
await cierra();
console.log(JSON.stringify({ externas: registro.externas.length, errores: registro.errores, axe: registro.axe.map((a) => ({ pagina: a.pagina, vista: a.vista, serias: a.serias.length, detalle: a.serias })) }));
