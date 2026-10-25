/**
 * Junta la medición del DETECTOR de voz (energía, Silero, los dos) en `detector.md`:
 *
 *  - fuera del navegador: `detector.json` de `mide-detector.ts` (frases por ruido y SNR);
 *  - de punta a punta en el HUD: `silero/<detector>-<condición>.json` de `mide.ts --detector … [--ruido …]`.
 *
 *   node scripts/centro-de-mando/resume-detector.ts [--comprueba]   (--comprueba: exit 1 si detector.md diverge)
 *
 * No toca `resumen.md` (la medición del 2026-10-16, con su propio generador `resume.ts`).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'docs/goals/centro-de-mando-voz-medicion';

interface Fila {
  ruido: string;
  snr: number | null;
  detector: string;
  enteraPct: number | null;
  ordenesEnterasPct: number | null;
  cierreP50: number | null;
  falsosPorMinuto: number;
  msPorMarco: number;
}
interface R { n: number; p50?: number; p95?: number }
interface Corrida {
  detector: string;
  ruido: { nombre: string; snrDb: number } | null;
  ordenes: { resumen: R; muestras: { estado?: string; ruta?: string }[] };
  interrupcion: { resumen: R; fallidos: number; fugas: number; cortes: unknown[] };
  eco: { autoInterrupciones: number; n: number };
}

const d = JSON.parse(readFileSync(join(DIR, 'detector.json'), 'utf8')) as { fecha: string; frases: number; flujoMin: number; margenPuertaDb: number; resultados: Fila[] };
const v = (x: number | null | undefined, sufijo = '') => (x === null || x === undefined ? '—' : `${x}${sufijo}`);
const media = (xs: number[]) => Math.round((xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length)) * 10) / 10;
const mediana = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

function tablaBarrido(): string[] {
  const det = ['energia', 'silero', `ambos-${d.margenPuertaDb}`];
  const busca = (ruido: string, snr: number | null, detector: string) => d.resultados.find((r) => r.ruido === ruido && r.snr === snr && r.detector === detector);
  const ruidos = [...new Set(d.resultados.map((r) => r.ruido))];
  const filas = ['| Ruido | SNR | Frases enteras: energía · **Silero** · ambos | Órdenes enteras: energía · **Silero** · ambos | Cierre p50: energía · Silero | Disparos falsos/min: energía · Silero |', '|---|---|---|---|---|---|'];
  for (const ruido of ruidos) {
    for (const snr of ruido === 'limpio' ? [null] : [20, 10, 5, 0]) {
      const r = det.map((x) => busca(ruido, snr, x));
      filas.push(`| ${ruido} | ${snr === null ? '—' : `${snr} dB`} | ${v(r[0]?.enteraPct, ' %')} · **${v(r[1]?.enteraPct, ' %')}** · ${v(r[2]?.enteraPct, ' %')} | ${v(r[0]?.ordenesEnterasPct, ' %')} · **${v(r[1]?.ordenesEnterasPct, ' %')}** · ${v(r[2]?.ordenesEnterasPct, ' %')} | ${v(r[0]?.cierreP50, ' ms')} · ${v(r[1]?.cierreP50, ' ms')} | ${v(r[0]?.falsosPorMinuto)} · ${v(r[1]?.falsosPorMinuto)} |`);
    }
  }
  const agregado = det.map((x) => {
    const con = d.resultados.filter((r) => r.detector === x && r.ruido !== 'limpio');
    const enteras = con.map((r) => r.enteraPct ?? 0);
    return `| ${x} | ${media(enteras)} % | ${mediana(enteras)} % | ${media(con.map((r) => r.ordenesEnterasPct ?? 0))} % |`;
  });
  return [...filas, '', '| Detector | Frases enteras con ruido (media) | (mediana) | Órdenes enteras (media) |', '|---|---|---|---|', ...agregado];
}

/** `-sin-puerta.json`: Silero antes del arreglo del eco (sin `conPuertaAlHablar` y con la pérdida subiendo deprisa). */
function corridas(): { corrida: Corrida; sinPuerta: boolean }[] {
  const dir = join(DIR, 'silero');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ corrida: JSON.parse(readFileSync(join(dir, f), 'utf8')) as Corrida, sinPuerta: f.endsWith('-sin-puerta.json') }));
}

function tablaHud(): string[] {
  const filas = ['| Detector | Condición | Órdenes: resueltas por orden local | Fin real → suena, p50 · p95 | «Para.»: cortes | Reacción p50 | Frases del turno viejo tras callar | Auto-interrupciones con eco −20 dB |', '|---|---|---|---|---|---|---|---|'];
  for (const { corrida: c, sinPuerta } of corridas()) {
    const ok = c.ordenes.muestras.filter((m) => m.ruta === 'orden' && m.estado !== 'en-curso').length;
    const n = c.interrupcion.cortes.length;
    filas.push(`| ${c.detector}${sinPuerta ? ' (antes del arreglo del eco)' : ''} | ${c.ruido ? `${c.ruido.nombre} a ${c.ruido.snrDb} dB` : 'limpio'} | ${ok} de ${c.ordenes.muestras.length} | ${v(c.ordenes.resumen.p50, ' ms')} · ${v(c.ordenes.resumen.p95, ' ms')} | ${n - c.interrupcion.fallidos} de ${n} | ${v(c.interrupcion.resumen.p50, ' ms')} | ${c.interrupcion.fugas} | ${c.eco.autoInterrupciones} de ${c.eco.n} |`);
  }
  return filas;
}

const silero = d.resultados.filter((r) => r.detector === 'silero').map((r) => r.msPorMarco);
const texto = [
  '<!-- ALTO: ARTEFACTO AUTOGENERADO desde detector.json y silero/*.json. No lo edites a mano: node scripts/centro-de-mando/resume-detector.ts -->',
  '# Detector de voz del centro de mando: energía contra Silero, con ruido de sala',
  '',
  `**Medido el ${d.fecha}** (WSL2, Ryzen 7 5700G, sin GPU). Generado por \`scripts/centro-de-mando/resume-detector.ts\`; el método está en la cabecera de \`mide-detector.ts\` y de \`mide.ts\`.`,
  '',
  '## Fuera del navegador: el mismo detector del HUD sobre el mismo audio',
  '',
  `${d.frases} frases (${d.flujoMin} min por condición): frases leídas reales de FLEURS es_419 y las 16 órdenes del HUD dichas por Piper, a −26 dBFS de nivel activo, con 1,2-2,5 s de ruido entre una y otra y 60 s de ruido solo al final. Ruidos: rosa (continuo), teclado y golpes, música sintética, murmullo de seis voces reales de FLEURS (frases que no son de prueba) y cinco salas reales de DEMAND (oficina, junta, sala de estar, cocina, cafetería; CC BY 4.0). Se evalúa por frase: **entera** = un solo turno la cubre de punta a punta (±300 ms) y no toca otra frase; el cierre es del fin real de la voz a que el detector emite el fin del turno. «Ambos» = Silero con una puerta de nivel a ${d.margenPuertaDb} dB sobre el suelo calibrado.`,
  '',
  ...tablaBarrido(),
  '',
  `Silero cuesta ${mediana(silero)} ms por marco de 32 ms en Node (p50 de todas las condiciones).`,
  '',
  '## De punta a punta en el HUD (Chromium con micrófono falso)',
  '',
  'Las órdenes y la conversación como en `resumen.md`; «resueltas por orden local» = el turno llegó al enrutador y salió por una orden. Con ruido, la voz va a −26 dBFS y el ruido suena desde antes de encender.',
  '',
  ...tablaHud(),
  '',
];
const destino = join(DIR, 'detector.md');
const salida = `${texto.join('\n')}\n`;
if (process.argv.includes('--comprueba')) {
  const igual = existsSync(destino) && readFileSync(destino, 'utf8') === salida;
  console.log(igual ? `✓ ${destino} coincide con sus mediciones` : `✗ ${destino} diverge de sus mediciones: regeneralo`);
  process.exit(igual ? 0 : 1);
}
writeFileSync(destino, salida);
console.log(`escrito ${destino}`);
