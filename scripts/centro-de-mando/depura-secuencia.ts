/** Sonda: varias frases seguidas, esperando cada turno, y el volcado del que se cuelgue. */
import { abreHud, di, enciende, esperaTurno, frase, toma, turnos } from './banco-pagina.ts';
import { tokenDictado } from './voz-sintetica.ts';
const h = await abreHud('http://localhost:3011', tokenDictado());
h.pagina.on('pageerror', (e) => console.log('error de página:', e.message.slice(0, 300)));
h.pagina.on('console', (m) => m.type() === 'error' && console.log('consola:', m.text().slice(0, 200)));
await enciende(h.pagina);
await h.pagina.evaluate(() => {
  const w = window as unknown as { __centroDeMando: { bucle: { suscribe(f: (e: { tipo: string }) => void): void } }; __eventos: string[] };
  w.__eventos = [];
  w.__centroDeMando.bucle.suscribe((e) => e.tipo !== 'karaoke' && w.__eventos.push(`${Math.round(performance.now())} ${JSON.stringify(e).slice(0, 140)}`));
});
for (const t of process.argv.slice(2)) {
  const d = await di(h.pagina, await frase(t, 'es_MX-claude-high'));
  const r = await esperaTurno(h.pagina, d, 30_000);
  console.log(`«${t}» → ${r?.estado} ${r?.orden ?? r?.ruta ?? ''}`);
  if (r?.estado === 'en-curso') {
    for (const e of await h.pagina.evaluate(() => (window as unknown as { __eventos: string[] }).__eventos.slice(-25))) console.log('   ', e);
    console.log('   turno', JSON.stringify(r));
    console.log('   toma', JSON.stringify((await toma(h.pagina)).slice(-6)));
    console.log('   estado reproductor', await h.pagina.evaluate(() => JSON.stringify([...document.querySelectorAll('audio')].length)));
    break;
  }
}
void turnos;
await h.navegador.close();
