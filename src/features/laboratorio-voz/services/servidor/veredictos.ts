/**
 * Solo servidor: los veredictos de quien prueba, en un JSONL local (carpeta de datos del
 * dictado, fuera del repo) escrito por `scripts/laboratorio-voz/maquina.mjs`. Y el informe en Markdown: el estado real de los 20 casos con el
 * ultimo veredicto de cada uno. Nada sale de la maquina.
 */
import type { Piezas, Veredicto, VeredictoNuevo } from '../../types/index.ts';
import { CASOS, SALAS } from '../casos.ts';
import { calculaEstado, ETIQUETA_ESTADO, NOMBRE_PIEZA, resumenEstados } from '../estado-casos.ts';
import { maquina } from './dictado-cli.ts';

/** Leer y guardar pasan por `maquina.mjs` (proceso aparte): el bundle no toca el disco de datos. */
export const leeVeredictos = (): Promise<Veredicto[]> => maquina<Veredicto[]>('veredictos-lee');
export const agregaVeredicto = (nuevo: VeredictoNuevo): Promise<Veredicto> => maquina<Veredicto>('veredictos-agrega', nuevo);

const RESULTADO: Record<Veredicto['resultado'], string> = { funciono: 'Funcionó', 'a-medias': 'A medias', no: 'No funcionó' };

export function informeMarkdown(veredictos: readonly Veredicto[], piezas: Piezas, ahora = new Date()): string {
  const ultimo = new Map<number, Veredicto>();
  for (const v of veredictos) ultimo.set(v.caso, v);
  const resumen = resumenEstados(CASOS, piezas);
  const lineas: string[] = [
    `# Laboratorio de voz — informe de pruebas`,
    ``,
    `Generado el ${ahora.toLocaleString('es-MX')} · Todo corrió en esta computadora; nada salió a internet.`,
    ``,
    `## Estado real de los casos`,
    ``,
    `LISTO: ${resumen.listo} · POR REGLAS: ${resumen.reglas} · PUERTA HUMANA: ${resumen.puerta} · Veredictos registrados: ${veredictos.length}`,
    ``,
    `## Piezas en la máquina`,
    ``,
    ...Object.entries(piezas).map(([id, hay]) => `- ${hay ? '✓' : '✗'} ${NOMBRE_PIEZA[id as keyof Piezas]}`),
    ``,
  ];
  for (const sala of SALAS) {
    lineas.push(`## ${sala.titulo}`, ``, `| # | Caso | Estado | Veredicto | Nota |`, `|---|---|---|---|---|`);
    for (const c of CASOS.filter((x) => x.sala === sala.id)) {
      const e = calculaEstado(c, piezas);
      const v = ultimo.get(c.id);
      lineas.push(`| ${c.id} | ${c.titulo} | ${ETIQUETA_ESTADO[e.estado]} | ${v ? RESULTADO[v.resultado] : 'sin probar'} | ${v?.nota.replace(/\|/g, '/') ?? ''} |`);
    }
    lineas.push(``);
  }
  return lineas.join('\n');
}
