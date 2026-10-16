/** Sonda de depuración: una frase al HUD y todo lo que pasa (eventos del bucle, telemetría, toma de salida). */
import { abreHud, di, enciende, frase, toma, turnos } from './banco-pagina.ts';
import { tokenDictado } from './voz-sintetica.ts';
const h = await abreHud(process.argv[3] ?? 'http://localhost:3011', tokenDictado());
h.pagina.on('console', (m) => m.type() !== 'log' && m.type() !== 'info' && console.log('consola:', m.type(), m.text().slice(0, 200)));
h.pagina.on('pageerror', (e) => console.log('error de página:', e.message.slice(0, 300)));
await enciende(h.pagina);
await h.pagina.evaluate(() => {
  const w = window as unknown as { __centroDeMando: { bucle: { suscribe(f: (e: unknown) => void): void } }; __eventos: string[] };
  w.__eventos = [];
  w.__centroDeMando.bucle.suscribe((e) => w.__eventos.push(`${Math.round(performance.now())} ${JSON.stringify(e).slice(0, 160)}`));
});
const d = await frase(process.argv[2] ?? '¿Qué hora es?', 'es_MX-claude-high');
const dicha = await di(h.pagina, d);
console.log('verdad: ini', Math.round(dicha.iniVoz), 'fin', Math.round(dicha.finVoz));
await h.pagina.waitForTimeout(6000);
for (const e of await h.pagina.evaluate(() => (window as unknown as { __eventos: string[] }).__eventos)) console.log('  ', e);
console.log('turnos', JSON.stringify(await turnos(h.pagina)));
console.log('toma', JSON.stringify((await toma(h.pagina)).map((e) => `${e.tipo}@${Math.round(e.t)}`)));
await h.pagina.screenshot({ path: '/tmp/claude-1000/-home-gsore-code-template/dc98a50c-9d27-4faf-836d-562711cc749c/scratchpad/depura.png' });
await h.navegador.close();
