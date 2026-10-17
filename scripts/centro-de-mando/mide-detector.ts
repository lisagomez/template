/**
 * El detector de voz del HUD con ruido de sala, FUERA del navegador (punto 4 de `docs/goals/propuesta-cdc.md`):
 * energía calibrada (lo de hoy), Silero v6.2 y los dos a la vez, sobre EL MISMO audio y con el mismo detector
 * que corre en el HUD (`src/features/centro-de-mando/services/detector.ts`).
 *
 *   node scripts/centro-de-mando/banco-ruido.ts       # una vez: salas de DEMAND, Silero y onnxruntime-node
 *   node scripts/centro-de-mando/mide-detector.ts [--frases 30] [--snr 20,10,5,0] [--ruidos rosa,teclado,…]
 *
 * Voz: frases REALES de FLEURS es_419 (de las 100 primeras; las 50 últimas hacen el murmullo, así que ninguna
 * voz de prueba suena también de fondo) y las órdenes cortas del HUD dichas por Piper, cada una a −26 dBFS de
 * nivel activo. Entre frase y frase, 1,2-2,5 s del mismo ruido; al final, 60 s de ruido solo.
 *
 * La verdad son los tramos de voz de la señal LIMPIA (ventanas de 10 ms por encima del suelo de la toma),
 * unidos si la pausa es menor que el cierre de 600 ms. Por cada frase de verdad:
 *  - entera: un turno y solo uno la toca, y ese turno no toca otra frase (lo que el HUD necesita);
 *  - partida: dos turnos o más (el HUD contestaría a media frase);
 *  - fundida: su turno toca también otra frase (no cerró en el hueco);
 *  - recortada: un solo turno, pero empieza o acaba a más de 300 ms de la voz (al motor le llega media frase);
 *  - perdida: ningún turno la toca;
 *  - cierre: del fin real de la voz a que el detector EMITE el fin del turno (lo que espera la persona);
 *    inicio: del inicio real a que emite el inicio (lo que tarda en atenuar cuando le interrumpen).
 * Disparos falsos: turnos que no tocan ninguna frase, por minuto de los 60 s de ruido solo.
 *
 * Escribe `docs/goals/centro-de-mando-voz-medicion/detector.json`. No gasta nada: todo es local.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { codificaWav, creaModeloSilero, type RuntimeOnnx } from '../../tools/voz/dist/node/index.js';
import type { ModeloVoz } from '../../tools/voz/dist/index.js';
import { ambos, creaDetector, creaModelo, MARGEN_PUERTA_DB, MS_CIERRE, puertaDeNivel, TIPOS_DETECTOR } from '../../src/features/centro-de-mando/services/detector.ts';
import { creaVozSintetica, type ModuloSherpaTts } from '../../tools/dictado/dist/node/index.js';
import { aseguraBanco, BANCO, bancoDictado, rutasFleurs, SALAS } from './banco-ruido.ts';
import { ORDENES, VOCES } from './corpus.ts';
import { azar, HZ, leeMono, potencia, potenciaActiva, rosa, ruidoDe } from './ruidos.ts';

const arg = (n: string, d: string) => process.argv.find((_, i) => process.argv[i - 1] === n) ?? d;
const N_FRASES = Number(arg('--frases', '30'));
const SNRS = arg('--snr', '20,10,5,0').split(',').map(Number);
const SINTETICOS = ['rosa', 'teclado', 'musica', 'murmullo'];
const RUIDOS = arg('--ruidos', [...SINTETICOS, ...SALAS.map((s) => s.sala)].join(',')).split(',');
const SALIDA = 'docs/goals/centro-de-mando-voz-medicion/detector.json';
const NIVEL_VOZ_DB = -26;
const MS_RUIDO_SOLO = 60_000;
const MS_RECORTE = 300;

interface Frase { tipo: 'fleurs' | 'orden'; muestras: Float32Array }
/** Un tramo de voz de la señal limpia, con la frase (el clip) de la que sale. */
interface Verdad { tipo: Frase['tipo']; frase: number; inicio: number; fin: number }
interface Turno { inicioMs: number; finMs: number; emiteInicio: number; emiteFin: number }

const ms = (muestras: number) => (muestras / HZ) * 1000;
const aMuestras = (milis: number) => Math.round((milis / 1000) * HZ);
const nivel = (x: Float32Array, a: number, b: number) => 10 * Math.log10(potencia(x, a, b) + 1e-20);

function aNivel(x: Float32Array, db: number): Float32Array {
  const g = Math.sqrt(10 ** (db / 10) / potenciaActiva(x));
  return x.map((v) => v * g);
}

/** Tramos de voz de la señal limpia: por encima de max(−45 dBFS, suelo + 10 dB), unidos bajo 600 ms de pausa. */
function tramosDeVoz(x: Float32Array): { inicio: number; fin: number }[] {
  const v = HZ / 100;
  const niveles: number[] = [];
  for (let i = 0; i + v <= x.length; i += v) niveles.push(nivel(x, i, i + v));
  const suelo = [...niveles].sort((a, b) => a - b)[Math.floor(niveles.length * 0.1)] ?? -120;
  const umbral = Math.max(-45, suelo + 10);
  const tramos: { inicio: number; fin: number }[] = [];
  niveles.forEach((n, k) => {
    if (n < umbral) return;
    const ultimo = tramos.at(-1);
    if (ultimo && k * 10 - ultimo.fin < MS_CIERRE) ultimo.fin = (k + 1) * 10;
    else tramos.push({ inicio: k * 10, fin: (k + 1) * 10 });
  });
  return tramos.filter((t) => t.fin - t.inicio >= 150);
}

function cargaFleurs(): { prueba: Frase[]; fondo: Float32Array[] } {
  const rutas = rutasFleurs();
  const r = azar(7);
  const indices = rutas.slice(0, 100).map((_, i) => i).sort(() => r() - 0.5).slice(0, N_FRASES);
  const prueba = indices.map((i) => ({ tipo: 'fleurs' as const, muestras: leeMono(rutas[i] ?? '') }));
  const fondo = rutas.slice(100).map(leeMono);
  return { prueba, fondo };
}

/**
 * Las órdenes por Piper, con el motor de `tools/dictado` llamado DIRECTO (sin flujo: el audio entero de una
 * vez) y guardadas en el banco la primera vez, porque Piper no es determinista y la medición sí.
 */
async function cargaOrdenes(): Promise<Frase[]> {
  mkdirSync(join(BANCO, 'piper'), { recursive: true });
  const dictado = bancoDictado();
  const sherpa = createRequire(join(dictado, 'package.json'))('sherpa-onnx-node') as ModuloSherpaTts;
  const frases: Frase[] = [];
  for (const voz of VOCES) {
    let piper: ReturnType<typeof creaVozSintetica> | undefined;
    for (const [i, texto] of ORDENES.entries()) {
      const ruta = join(BANCO, 'piper', `${voz}-${i}.wav`);
      if (!existsSync(ruta)) {
        piper ??= creaVozSintetica({ sherpa, carpeta: join(dictado, 'modelos', `vits-piper-${voz}`), hilos: 2 });
        const a = await piper.sintetiza(texto);
        writeFileSync(ruta, codificaWav(a.muestras, a.frecuenciaHz));
      }
      frases.push({ tipo: 'orden', muestras: leeMono(ruta) });
    }
  }
  return frases;
}

/** La pista de voz entera (ceros en los huecos) y la verdad, en ms. */
function componeFlujo(frases: readonly Frase[]): { voz: Float32Array; verdad: Verdad[]; inicioRuidoSolo: number } {
  const r = azar(11);
  const orden = [...frases].sort(() => r() - 0.5);
  const huecos = orden.map(() => aMuestras(1200 + r() * 1300));
  const total = aMuestras(1000) + orden.reduce((s, f, i) => s + f.muestras.length + (huecos[i] ?? 0), 0) + aMuestras(MS_RUIDO_SOLO);
  const voz = new Float32Array(total);
  const verdad: Verdad[] = [];
  let t = aMuestras(1000);
  orden.forEach((f, i) => {
    const x = aNivel(f.muestras, NIVEL_VOZ_DB);
    voz.set(x, t);
    for (const tramo of tramosDeVoz(x)) verdad.push({ tipo: f.tipo, frase: i, inicio: ms(t) + tramo.inicio, fin: ms(t) + tramo.fin });
    t += x.length + (huecos[i] ?? 0);
  });
  return { voz, verdad, inicioRuidoSolo: ms(t) };
}

/** Voz + ruido a `snr` dB por debajo del nivel activo de la voz. `null`: «limpio», un suelo rosa a −60 dBFS. */
function mezcla(voz: Float32Array, ruido: Float32Array, snr: number | null): Float32Array {
  const g = Math.sqrt(10 ** ((snr === null ? -60 : NIVEL_VOZ_DB - snr) / 10));
  return voz.map((v, i) => Math.max(-1, Math.min(1, v + (ruido[i] ?? 0) * g)));
}

async function corre(modelo: ModeloVoz, senal: Float32Array): Promise<Turno[]> {
  const d = creaDetector(modelo);
  const turnos: Turno[] = [];
  let abierto: { inicioMs: number; emiteInicio: number } | undefined;
  const anota = (eventos: Awaited<ReturnType<typeof d.procesa>>, ahora: number) => {
    for (const e of eventos) {
      if (e.tipo === 'inicioHabla') abierto = { inicioMs: e.ms, emiteInicio: ahora };
      else if (e.tipo === 'finHabla') {
        turnos.push({ inicioMs: e.turno.inicioMs, finMs: e.turno.finMs, emiteInicio: abierto?.emiteInicio ?? ahora, emiteFin: ahora });
        abierto = undefined;
      }
    }
  };
  for (let i = 0; i < senal.length; i += modelo.tamMarco) anota(await d.procesa(senal.subarray(i, i + modelo.tamMarco)), ms(Math.min(senal.length, i + modelo.tamMarco)));
  anota(await d.cierra(), ms(senal.length));
  return turnos;
}

const percentil = (xs: number[], p: number) => {
  const o = [...xs].sort((a, b) => a - b);
  return o.length === 0 ? null : Math.round(o[Math.min(o.length - 1, Math.floor((p / 100) * o.length))] ?? 0);
};
const pct = (n: number, de: number) => (de === 0 ? null : Math.round((1000 * n) / de) / 10);

/** Las frases (clips) con sus tramos: se evalúa por FRASE, no por tramo. Una pausa de 650 ms dentro de una
 * frase leída no es el fin de un turno para la persona, y un detector que no la parte no se equivoca. */
function frasesDe(verdad: readonly Verdad[]) {
  const porFrase = new Map<number, Verdad[]>();
  for (const v of verdad) porFrase.set(v.frase, [...(porFrase.get(v.frase) ?? []), v]);
  return [...porFrase.values()].map((tramos) => ({ tipo: tramos[0]!.tipo, tramos, inicio: tramos[0]!.inicio, fin: tramos.at(-1)!.fin }));
}

function evalua(turnos: Turno[], verdad: Verdad[], inicioRuidoSolo: number) {
  const tocaTramo = (t: Turno, v: Verdad) => t.inicioMs < v.fin && t.finMs > v.inicio;
  const frases = frasesDe(verdad);
  type F = (typeof frases)[number];
  const toca = (t: Turno, f: F) => f.tramos.some((v) => tocaTramo(t, v));
  const cuenta = { entera: 0, partida: 0, fundida: 0, recortada: 0, perdida: 0 };
  const recorta = (t: Turno, f: F) => t.finMs < f.fin - MS_RECORTE || t.inicioMs > f.inicio + MS_RECORTE;
  const porTipo = { fleurs: { entera: 0, total: 0 }, orden: { entera: 0, total: 0 } };
  const cierre: number[] = [];
  const inicio: number[] = [];
  for (const v of frases) {
    const suyos = turnos.filter((t) => toca(t, v));
    porTipo[v.tipo].total++;
    if (suyos.length === 0) cuenta.perdida++;
    else if (suyos.length > 1) cuenta.partida++;
    else if (frases.some((o) => o !== v && toca(suyos[0]!, o))) cuenta.fundida++;
    else if (recorta(suyos[0]!, v)) cuenta.recortada++;
    else {
      cuenta.entera++;
      porTipo[v.tipo].entera++;
      cierre.push(suyos[0]!.emiteFin - v.fin);
    }
    if (suyos[0]) inicio.push(suyos[0].emiteInicio - v.inicio);
  }
  const falsos = turnos.filter((t) => !verdad.some((v) => tocaTramo(t, v)));
  const enRuidoSolo = falsos.filter((t) => t.inicioMs >= inicioRuidoSolo).length;
  return {
    frases: frases.length,
    ...cuenta,
    enteraPct: pct(cuenta.entera, frases.length),
    ordenesEnterasPct: pct(porTipo.orden.entera, porTipo.orden.total),
    cierreP50: percentil(cierre, 50),
    cierreP95: percentil(cierre, 95),
    inicioP50: percentil(inicio, 50),
    falsosEnHuecos: falsos.length - enRuidoSolo,
    falsosPorMinuto: Math.round((enRuidoSolo / (MS_RUIDO_SOLO / 60_000)) * 10) / 10,
  };
}

type Resultado = ReturnType<typeof evalua> & { ruido: string; snr: number | null; detector: string; msPorMarco: number };

/**
 * Los tres tipos del HUD, con su código (`creaModelo`), y la puerta de `ambos` a otros márgenes para ver cuál
 * conviene (`--margenes 0,6`). `ambos` es el del HUD (`MARGEN_PUERTA_DB`).
 */
function variantes(creaSilero: () => Promise<ModeloVoz>): { nombre: string; crea: () => Promise<ModeloVoz> }[] {
  const margenes = arg('--margenes', '0,6').split(',').filter(Boolean).map(Number).filter((m) => m !== MARGEN_PUERTA_DB);
  return [
    ...TIPOS_DETECTOR.map((t) => ({ nombre: t === 'ambos' ? `ambos-${MARGEN_PUERTA_DB}` : t, crea: () => creaModelo(t, creaSilero) })),
    ...margenes.map((m) => ({ nombre: `ambos-${m}`, crea: async () => ambos(await creaSilero(), puertaDeNivel(m)) })),
  ];
}

async function principal(): Promise<void> {
  const banco = aseguraBanco(RUIDOS);
  const ort = (await import(banco.ort)) as RuntimeOnnx;
  const creaSilero = () => creaModeloSilero({ ort, modelo: banco.silero });
  const { prueba, fondo } = cargaFleurs();
  const { voz, verdad, inicioRuidoSolo } = componeFlujo([...prueba, ...(await cargaOrdenes())]);
  const nFrases = new Set(verdad.map((v) => v.frase)).size;
  console.log(`flujo: ${(voz.length / HZ / 60).toFixed(1)} min, ${nFrases} frases (${verdad.length} tramos de voz, ${new Set(verdad.filter((v) => v.tipo === 'orden').map((v) => v.frase)).size} órdenes)`);
  const condiciones: { ruido: string; snr: number | null }[] = [{ ruido: 'limpio', snr: null }, ...RUIDOS.flatMap((ruido) => SNRS.map((snr) => ({ ruido, snr })))];
  const resultados: Resultado[] = [];
  for (const c of condiciones) {
    const senal = mezcla(voz, c.ruido === 'limpio' ? rosa(voz.length, azar(1)) : ruidoDe(c.ruido, voz.length, () => fondo, banco.salas), c.snr);
    for (const { nombre: detector, crea } of variantes(creaSilero)) {
      const t0 = performance.now();
      const turnos = await corre(await crea(), senal);
      const msPorMarco = (performance.now() - t0) / (senal.length / 512);
      const r = { ruido: c.ruido, snr: c.snr, detector, msPorMarco: Math.round(msPorMarco * 1000) / 1000, ...evalua(turnos, verdad, inicioRuidoSolo) };
      resultados.push(r);
      console.log(`${c.ruido.padEnd(9)} ${String(c.snr ?? '—').padStart(3)} dB  ${detector.padEnd(8)} enteras ${String(r.enteraPct).padStart(5)} % (órd ${String(r.ordenesEnterasPct).padStart(5)} %) part ${r.partida} fund ${r.fundida} rec ${r.recortada} perd ${r.perdida}  cierre ${r.cierreP50}/${r.cierreP95}  falsos/min ${r.falsosPorMinuto}  ${r.msPorMarco} ms/marco`);
    }
  }
  const salida = { fecha: new Date().toISOString().slice(0, 10), nivelVozDb: NIVEL_VOZ_DB, msCierre: MS_CIERRE, margenPuertaDb: MARGEN_PUERTA_DB, frases: nFrases, flujoMin: Math.round((voz.length / HZ / 60) * 10) / 10, resultados };
  writeFileSync(SALIDA, `${JSON.stringify(salida, null, 1)}\n`);
  console.log(`\nescrito ${SALIDA}`);
}

await principal();
