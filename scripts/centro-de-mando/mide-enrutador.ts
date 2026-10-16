/**
 * Acierto del enrutador y de la palabra de activación, en español, sobre los corpus de
 * `tools/bucle-voz/medicion/`:
 *  1. por TEXTO (las frases tal cual);
 *  2. por AUDIO: cada frase dicha por voces Piper locales → la ruta de transcripción del HUD
 *     (motor local con anclaje) → enrutador / activación. Es lo que de verdad decide en el HUD.
 *
 *   node scripts/centro-de-mando/mide-enrutador.ts [--base http://localhost:3011] [--solo-texto]
 *
 * Escribe `docs/goals/centro-de-mando-voz-medicion/enrutador.json`. No gasta un centavo: ni cerebro ni red.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { aPcm16, creaActivacion, creaEnrutadorLocal, ORDENES_ES, type Decision } from '../../tools/bucle-voz/dist/index.js';
import { dice, tokenDictado, VOCES } from './voz-sintetica.ts';

const arg = (n: string) => process.argv.find((a, i) => process.argv[i - 1] === n);
const BASE = arg('--base') ?? 'http://localhost:3011';
const SALIDA = 'docs/goals/centro-de-mando-voz-medicion';
const token = tokenDictado();
const enrutador = creaEnrutadorLocal({ ordenes: ORDENES_ES });
const etiqueta = (d: Decision) => (d.tipo === 'orden' ? (d.clase === 'escritura' ? 'escritura' : d.orden) : d.tipo === 'llm' ? 'llm' : 'nada');

async function transcribe(muestras: Float32Array): Promise<string[]> {
  const r = await fetch(`${BASE}/api/centro-de-mando/transcribir`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream', 'x-frecuencia-hz': '16000' }, body: aPcm16(muestras).buffer });
  if (!r.ok) throw new Error(`transcribir: ${r.status}`);
  return ((await r.json()) as { candidatos: string[] }).candidatos;
}

interface Fallo {
  frase: string;
  voz?: string;
  oido?: string[];
  esperada: string;
  salio: string;
}

/** Lo peligroso no es mandar una orden al cerebro (cuesta una vuelta): es ejecutar la orden EQUIVOCADA. */
const esOrden = (e: string) => e !== 'llm' && e !== 'nada';

function resumen(total: number, fallos: Fallo[]) {
  const equivocadas = fallos.filter((f) => esOrden(f.salio));
  return {
    total,
    aciertos: total - fallos.length,
    acierto: Math.round(((total - fallos.length) / total) * 1000) / 10,
    ordenesEquivocadas: equivocadas.length,
    conversacionComoOrden: equivocadas.filter((f) => f.esperada === 'llm').length,
    escriturasPerdidas: fallos.filter((f) => f.esperada === 'escritura').length,
    alCerebro: fallos.filter((f) => f.salio === 'llm').length,
    fallos,
  };
}

const linea = (nombre: string, r: ReturnType<typeof resumen>) =>
  `${nombre}: ${r.aciertos}/${r.total} (${r.acierto} %) · órdenes equivocadas ${r.ordenesEquivocadas} · conversación tomada por orden ${r.conversacionComoOrden} · escrituras perdidas ${r.escriturasPerdidas} · al cerebro por duda ${r.alCerebro}`;

const CORPUS = arg('--corpus') ?? 'tools/bucle-voz/medicion/corpus-enrutador.json';
const corpus = JSON.parse(await readFile(CORPUS, 'utf8')) as { frases: [string, string][] };
const leeCorpus = async (r: string) => (JSON.parse(await readFile(r, 'utf8')) as { frases: [string, string][] }).frases;
const otros = { B: await leeCorpus('tools/bucle-voz/medicion/corpus-enrutador-b.json'), C: await leeCorpus('tools/bucle-voz/medicion/corpus-enrutador-c.json') };
const activ = JSON.parse(await readFile('tools/bucle-voz/medicion/corpus-activacion.json', 'utf8')) as { frase: string; positivas: string[]; negativas: string[] };
const activacion = creaActivacion({ frases: [activ.frase] });

const fallosTexto: Fallo[] = corpus.frases.flatMap(([frase, esperada]) => {
  const salio = etiqueta(enrutador.decide([frase]));
  return salio === esperada ? [] : [{ frase, esperada, salio }];
});
const texto = resumen(corpus.frases.length, fallosTexto);
console.log(linea('enrutador por TEXTO, corpus A', texto));
for (const f of fallosTexto) console.log(`  ✗ «${f.frase}» esperaba ${f.esperada}, salió ${f.salio}`);
const textoOtros = Object.fromEntries(
  Object.entries(otros).map(([nombre, frases]) => {
    const fallos = frases.flatMap(([frase, esperada]) => {
      const salio = etiqueta(enrutador.decide([frase]));
      return salio === esperada ? [] : [{ frase, esperada, salio }];
    });
    const r = resumen(frases.length, fallos);
    console.log(linea(`enrutador por TEXTO, corpus ${nombre}`, r));
    return [nombre, r];
  }),
);
const activTexto = { positivas: activ.positivas.filter((p) => activacion.detecta(p).activada).length, negativas: activ.negativas.filter((p) => activacion.detecta(p).activada).length };
console.log(`activación por TEXTO: ${activTexto.positivas}/${activ.positivas.length} positivas, ${activTexto.negativas}/${activ.negativas.length} falsas`);

let audio: Record<string, unknown> = { medido: false };
if (!process.argv.includes('--solo-texto')) {
  const voces = VOCES.slice(0, 2); // claude-high y davefx: la tercera (ald) es de baja calidad incluso para Whisper (ver medición)
  const fallos: Fallo[] = [];
  let n = 0;
  for (const voz of voces) {
    for (const [frase, esperada] of corpus.frases) {
      const d = await dice(frase, voz, token);
      const oido = await transcribe(d.muestras);
      const salio = etiqueta(enrutador.decide(oido));
      n++;
      if (salio !== esperada) fallos.push({ frase, voz, oido, esperada, salio });
    }
  }
  const r = resumen(n, fallos);
  console.log(linea(`enrutador por AUDIO, corpus A (${voces.join(', ')})`, r));
  for (const f of fallos) console.log(`  ✗ [${f.voz}] «${f.frase}» oyó ${JSON.stringify(f.oido)} → ${f.salio} (esperaba ${f.esperada})`);
  const act = { positivas: 0, nPos: 0, falsas: 0, nNeg: 0, segundosNegativas: 0, perdidas: [] as string[], disparos: [] as string[], barrido: [] as { umbral: number; detectadas: number; falsas: number }[] };
  const oidos: { positiva: boolean; oido: string[] }[] = [];
  for (const voz of VOCES) {
    for (const p of activ.positivas) {
      const d = await dice(p, voz, token);
      act.nPos++;
      const oido = await transcribe(d.muestras);
      oidos.push({ positiva: true, oido });
      if (oido.some((t) => activacion.detecta(t).activada)) act.positivas++;
      else act.perdidas.push(`[${voz}] ${p} → ${JSON.stringify(oido)}`);
    }
    for (const p of activ.negativas) {
      const d = await dice(p, voz, token);
      act.nNeg++;
      act.segundosNegativas += d.muestras.length / 16_000;
      const oido = await transcribe(d.muestras);
      oidos.push({ positiva: false, oido });
      if (oido.some((t) => activacion.detecta(t).activada)) {
        act.falsas++;
        act.disparos.push(`[${voz}] ${p} → ${JSON.stringify(oido)}`);
      }
    }
  }
  console.log(`activación por AUDIO (${VOCES.join(', ')}): ${act.positivas}/${act.nPos} detectadas, ${act.falsas}/${act.nNeg} falsas en ${act.segundosNegativas.toFixed(0)} s de habla sin la frase`);
  // Barrido del umbral sobre LAS MISMAS transcripciones: el umbral se elige viendo la tabla entera, no a ojo.
  for (const umbral of [0.75, 0.8, 0.85, 0.9]) {
    const a = creaActivacion({ frases: [activ.frase], umbral });
    const dispara = (o: string[]) => o.some((t) => a.detecta(t).activada);
    act.barrido.push({ umbral, detectadas: oidos.filter((x) => x.positiva && dispara(x.oido)).length, falsas: oidos.filter((x) => !x.positiva && dispara(x.oido)).length });
  }
  console.log('  barrido del umbral (detectadas de 30 · falsas de 45):', act.barrido.map((b) => `${b.umbral}: ${b.detectadas} · ${b.falsas}`).join(' | '));
  for (const p of act.perdidas) console.log(`  perdida: ${p}`);
  for (const p of act.disparos) console.log(`  falsa: ${p}`);
  audio = { medido: true, enrutador: r, activacion: act };
}

await mkdir(SALIDA, { recursive: true });
await writeFile(`${SALIDA}/enrutador.json`, `${JSON.stringify({ fecha: new Date().toISOString().slice(0, 10), enrutador: enrutador.id, texto, textoOtros, activacionTexto: activTexto, audio }, null, 2)}\n`);
