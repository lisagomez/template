#!/usr/bin/env node
/**
 * Mide el filtro de muletillas (`src/muletillas.ts`) contra las 24 transcripciones del corpus
 * propio (`corpus-propio/muletillas/medicion-2026-09-21.json`: 6 guiones × 2 voces × 2 motores).
 *
 * Referencia LIMPIA = el guion sin sus muletillas, quitadas por la lista conocida de cada guion
 * (la que conto la medicion del 21), no por el filtro. Lo que se mide, por motor:
 *   - WER contra la referencia limpia ANTES y DESPUES del filtro: si el filtro sirve, baja.
 *   - Muletillas que el motor conservo y el filtro quita (recall del filtro).
 *   - Palabras quitadas que NO eran muletilla del guion (falsos positivos). En g1-control, que
 *     no lleva muletillas, el filtro no debe tocar nada.
 *
 * Regla escrita antes de medir: falsos positivos = 0 en el control y el WER no sube en ningun
 * guion. Si no se cumple, el filtro no entra encendido por defecto.
 * Escribe `corpus-propio/muletillas/filtro-<fecha>.md` y `.json`.
 *
 *   node medicion/mide-filtro-muletillas.mjs [fecha]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quitaMuletillas } from '../dist/muletillas.js';
import { tokeniza } from '../dist/texto/normaliza.js';
import { wer, werAcumulado } from '../dist/texto/wer.js';

const aqui = dirname(fileURLToPath(import.meta.url));
const carpeta = join(aqui, 'corpus-propio', 'muletillas');
const medicion = JSON.parse(readFileSync(join(carpeta, 'medicion-2026-09-21.json'), 'utf8'));
const guiones = JSON.parse(readFileSync(join(carpeta, 'guiones.json'), 'utf8'));
const fecha = process.argv[2] ?? new Date().toISOString().slice(0, 10);

/** Las muletillas de cada guion, las que la medicion del 21 contaba. */
const muletillasDe = (guion) => {
  const fila = medicion.filas.find((f) => f.guion.startsWith(`${guion}-`));
  return fila ? fila.porMuletilla.map((m) => m.palabra) : [];
};

/**
 * La palabra de la lista como patron que tolera acentos («basicamente» casa «básicamente») y
 * las vocalizaciones alargadas («mmm» casa «mm» y «mmmm»): la lista del 21 viene sin acentos.
 */
const patronDe = (m) => (/^m+$/i.test(m) ? 'mm+' : m.replace(/\s+/g, '\\s+').replace(/[aeiou]/g, (v) => ({ a: '[aá]', e: '[eé]', i: '[ií]', o: '[oó]', u: '[uúü]' })[v]));

/** Quita de un texto las muletillas conocidas, a nivel de palabra («¿no?» con sus signos). */
function sinConocidas(texto, lista) {
  let t = texto;
  for (const m of lista) {
    if (m.endsWith('?')) t = t.replace(new RegExp(`¿?\\s*${patronDe(m.slice(0, -1))}\\s*\\?`, 'giu'), ' ');
    else t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${patronDe(m)}(?![\\p{L}\\p{N}])`, 'giu'), ' ');
  }
  return t;
}
/** Cuantas palabras de muletilla conocida hay en un texto. */
const cuentaConocidas = (texto, lista) => tokeniza(texto).length - tokeniza(sinConocidas(texto, lista)).length;

const filas = [];
const porPalabra = new Map(); // motor|palabra → { presentes, quitadas }
for (const f of medicion.filas) {
  const guion = f.guion.replace(/-es_(ES|MX)$/, '');
  const lista = muletillasDe(guion);
  const referencia = sinConocidas(guiones[guion].map(([t]) => t).join(' '), lista);
  const filtrado = quitaMuletillas(f.texto);
  const conservadas = cuentaConocidas(f.texto, lista);
  const quedan = cuentaConocidas(filtrado.texto, lista);
  const palabrasQuitadas = tokeniza(f.texto).length - tokeniza(filtrado.texto).length;
  const falsos = Math.max(0, palabrasQuitadas - (conservadas - quedan));
  for (const palabra of lista) {
    const k = `${f.motor}|${palabra}`;
    const acc = porPalabra.get(k) ?? { motor: f.motor, palabra, presentes: 0, quitadas: 0 };
    const presentes = cuentaConocidas(f.texto, [palabra]);
    acc.presentes += presentes;
    acc.quitadas += presentes - cuentaConocidas(filtrado.texto, [palabra]);
    porPalabra.set(k, acc);
  }
  filas.push({
    motor: f.motor, guion: f.guion, conservadas, quitadas: conservadas - quedan, quedan, falsos,
    quitadasTexto: filtrado.quitadas, werAntes: wer(referencia, f.texto).wer, werDespues: wer(referencia, filtrado.texto).wer,
    referencia, antes: f.texto, despues: filtrado.texto,
  });
}

const motores = [...new Set(filas.map((f) => f.motor))];
const resumen = motores.map((motor) => {
  const mias = filas.filter((f) => f.motor === motor);
  const suma = (k) => mias.reduce((a, f) => a + f[k], 0);
  const acumulado = (k) => werAcumulado(mias.map((f) => ({ referencia: f.referencia, hipotesis: f[k] }))).wer;
  const control = mias.filter((f) => f.guion.startsWith('g1-'));
  const sube = mias.filter((f) => f.werDespues > f.werAntes + 1e-9).map((f) => f.guion);
  return {
    motor, conservadas: suma('conservadas'), quitadas: suma('quitadas'), recall: suma('conservadas') ? suma('quitadas') / suma('conservadas') : 0,
    falsos: suma('falsos'), falsosEnControl: control.reduce((a, f) => a + f.falsos, 0), werAntes: acumulado('antes'), werDespues: acumulado('despues'), sube,
    apto: control.every((f) => f.falsos === 0) && sube.length === 0,
  };
});

const pct = (x) => `${(x * 100).toFixed(1).replace('.', ',')} %`;
const md = [];
md.push(`# Filtro de muletillas contra las transcripciones del 2026-09-21 — medición ${fecha}`, '');
md.push('El filtro (`src/muletillas.ts`) quita «mm», «eh», «ah»… donde estén, y «este», «o sea», «bueno», «pues», «digamos», «tipo», «vale», «básicamente», «como que» solo cuando van aislados por puntuación a los dos lados. Se aplica a lo que cada motor transcribió el 21 (no al audio) y se compara con el guion SIN sus muletillas.', '');
md.push('Regla escrita antes de medir: 0 falsos positivos en el control (g1, sin muletillas) y el WER no sube en ningún guion; si no, el filtro no entra encendido por defecto.', '');
md.push('## Por motor', '', '| motor | muletillas que el motor conservó | quitadas por el filtro | recall del filtro | falsos positivos (en control) | WER antes → después | sube en | decisión |', '|---|---|---|---|---|---|---|---|');
for (const r of resumen) md.push(`| ${r.motor} | ${r.conservadas} | ${r.quitadas} | ${pct(r.recall)} | ${r.falsos} (${r.falsosEnControl}) | ${pct(r.werAntes)} → ${pct(r.werDespues)} | ${r.sube.join(', ') || '—'} | ${r.apto ? '**apto**: encendido por defecto' : 'NO apto'} |`);
md.push('', '## Por muletilla (lo que el motor conservó y el filtro quitó)', '', '| motor | muletilla | conservadas por el motor | quitadas por el filtro |', '|---|---|---|---|');
for (const p of [...porPalabra.values()].sort((a, b) => a.motor.localeCompare(b.motor) || b.presentes - a.presentes)) md.push(`| ${p.motor} | ${p.palabra} | ${p.presentes} | ${p.quitadas} |`);
md.push('', '## Por guion y voz', '', '| motor | guion | conservadas | quitadas | quedan | falsos | WER antes → después | qué quitó |', '|---|---|---|---|---|---|---|---|');
for (const f of filas) md.push(`| ${f.motor} | ${f.guion} | ${f.conservadas} | ${f.quitadas} | ${f.quedan} | ${f.falsos} | ${pct(f.werAntes)} → ${pct(f.werDespues)} | ${f.quitadasTexto.map((q) => `«${q}»`).join(' ') || '—'} |`);
md.push('', '## Lo que queda y por qué', '');
md.push('Las lexicas que quedan van sin coma en la transcripción («Buenos días, este hoy vamos a ver»): sin puntuación a los dos lados el filtro no las toca a propósito, porque «este documento» o «vale la pena» son palabras de verdad. Quitarlas exigiría entender la frase, no puntuación; con el motor que puntúa peor (Parakeet) se quedan.', '');
writeFileSync(join(carpeta, `filtro-${fecha}.md`), `${md.join('\n')}\n`);
writeFileSync(join(carpeta, `filtro-${fecha}.json`), `${JSON.stringify({ fecha, regla: '0 falsos en control y WER no sube en ningun guion', resumen, porPalabra: [...porPalabra.values()], filas: filas.map((f) => Object.fromEntries(Object.entries(f).filter(([k]) => !['referencia', 'antes', 'despues'].includes(k)))) }, null, 1)}\n`);
console.log(md.slice(0, 9).join('\n'));
console.log(`\nescrito ${join(carpeta, `filtro-${fecha}.md`)}`);
