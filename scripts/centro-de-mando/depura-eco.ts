/** Sonda: una respuesta del cerebro con eco residual a −20 dB, registrando lo que ve la puerta de eco marco a marco. */
import { abreHud, di, enciende, esperaTurno, frase } from './banco-pagina.ts';
import { tokenDictado } from './voz-sintetica.ts';
const h = await abreHud('http://localhost:3011', tokenDictado());
await enciende(h.pagina);
await h.pagina.evaluate(() => {
  type Marco = { ms: number; prob: number; nivelMicDb?: number; nivelSalidaDb?: number };
  const w = window as unknown as { __centroDeMando: { oido: { interrupcion: { procesa(m: Marco, h: boolean): { tipo: string }[]; perdidaDb: number } } }; __marcos: string[]; __microfono: { eco(db: number): void } };
  w.__marcos = [];
  const m = w.__centroDeMando.oido.interrupcion;
  const original = m.procesa.bind(m);
  m.procesa = (marco, habla) => {
    const a = original(marco, habla);
    if (habla) w.__marcos.push(`${Math.round(marco.ms)} p=${marco.prob.toFixed(2)} mic=${marco.nivelMicDb?.toFixed(1)} sal=${marco.nivelSalidaDb?.toFixed(1)} perd=${m.perdidaDb.toFixed(1)} ${a.map((x) => x.tipo).join(',')}`);
    return a;
  };
  w.__microfono.eco(-20);
});
const d = await di(h.pagina, await frase('¿Qué es un balance general?', 'es_MX-claude-high'));
const r = await esperaTurno(h.pagina, d);
console.log('turno', r?.estado);
const marcos = await h.pagina.evaluate(() => (window as unknown as { __marcos: string[] }).__marcos);
const i = marcos.findIndex((x) => x.includes('interrumpe'));
for (const x of marcos.slice(0, 12)) console.log(x);
console.log('…');
for (const x of marcos.slice(Math.max(0, i - 14), i + 1)) console.log(x);
await h.navegador.close();
