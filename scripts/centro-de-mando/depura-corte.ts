/** Sonda: la máquina habla, la persona dice «Para.»; registra lo que ve la máquina de interrupción marco a marco. */
import { abreHud, di, enciende, frase, toma } from './banco-pagina.ts';
import { tokenDictado } from './voz-sintetica.ts';
const h = await abreHud('http://localhost:3011', tokenDictado());
await enciende(h.pagina);
await h.pagina.evaluate(() => {
  type Marco = { ms: number; prob: number; nivelMicDb?: number; nivelSalidaDb?: number };
  const w = window as unknown as { __centroDeMando: { oido: { interrupcion: { procesa(m: Marco, h: boolean): { tipo: string }[]; perdidaDb: number; estado: string } } }; __marcos: string[] };
  w.__marcos = [];
  const m = w.__centroDeMando.oido.interrupcion;
  const original = m.procesa.bind(m);
  m.procesa = (marco, habla) => {
    const a = original(marco, habla);
    if (habla && marco.prob > 0.3) w.__marcos.push(`${Math.round(marco.ms)} p=${marco.prob.toFixed(2)} mic=${marco.nivelMicDb?.toFixed(1)} sal=${marco.nivelSalidaDb?.toFixed(1)} perd=${m.perdidaDb.toFixed(1)} ${m.estado} ${a.map((x) => x.tipo).join(',')}`);
    return a;
  };
});
const larga = await di(h.pagina, await frase('Explícame paso a paso cómo armar un presupuesto mensual para una cafetería pequeña.', 'es_MX-claude-high'));
for (let i = 0; i < 200; i++) {
  await h.pagina.waitForTimeout(100);
  if ((await toma(h.pagina)).some((e) => e.tipo === 'sube' && e.t > larga.finVoz)) break;
}
await h.pagina.waitForTimeout(800);
const para = await di(h.pagina, await frase(process.argv[2] ?? 'Para.', 'es_ES-davefx-medium'));
console.log('para: ini', Math.round(para.iniVoz), 'fin', Math.round(para.finVoz));
await h.pagina.waitForTimeout(2500);
for (const x of await h.pagina.evaluate(() => (window as unknown as { __marcos: string[] }).__marcos.slice(-25))) console.log(x);
console.log('toma', JSON.stringify((await toma(h.pagina)).filter((e) => e.t > para.iniVoz - 500).map((e) => `${e.tipo}@${Math.round(e.t)}`)));
await h.navegador.close();
