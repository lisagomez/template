/**
 * RECORRIDO con Playwright de TODAS las rutas con pantalla dentro de la capa (lazo `l-adopcion` del grafo
 * `docs/goals/capa-arbrain-grafo.json`). Las rutas y su módulo salen del verificador de enchufes (la misma fuente):
 * por cada una se exige la ventana de la capa, el módulo dueño en el lienzo y CERO errores de consola. Guarda una
 * captura por ruta y un resumen en JSON. Sale con 1 si una ruta falla.
 *
 * Sesiones: las rutas con cuenta (buzón, reel, sgi) entran con una cuenta sintética NUEVA de la Supabase LOCAL, o con
 * las de `--cuentas` (el JSON que escribe `scripts/sgi/siembra.ts`; nunca se imprime). A esa cuenta se le siembra lo
 * mínimo para que sus rutas dinámicas pinten de verdad (`scripts/capa/siembra-recorrido.ts`: por las puertas de la app,
 * con su sesión, sin service_role; con `--cuentas` queda UNA sola vez en esa cuenta, marcada «(recorrido de la capa)»);
 * lo que una sesión de usuario no puede crear se dice en la nota de la ruta. La mesa entra con la identidad de Access
 * de prueba (`scripts/laboratorio-alojado/identidad-local.mjs`, `--identidad <carpeta>`).
 *
 * Uso: node scripts/capa/recorrido.ts --base http://localhost:3011 [--capturas <dir>] [--cuentas <json>]
 *        [--identidad <carpeta>] [--solo <prefijo>]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { chromium, type BrowserContext, type Page } from 'playwright';
import type { Cuenta } from '../sgi/local.ts';
import type { SiembraDelRecorrido } from './siembra-recorrido.ts';
import { contexto, DENTRO } from './verifica-enchufes.mjs';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const BASE = arg('base') ?? 'http://localhost:3011';
const DIR = arg('capturas') ?? 'docs/goals/capa-arbrain-capturas/recorrido';
const SOLO = arg('solo');
mkdirSync(DIR, { recursive: true });

interface Ruta { ruta: string; archivo: string; modulo: string }
interface Resultado { ruta: string; visitada: string; modulo: string; visto: string; ok: boolean; errores: string[]; captura: string; nota: string }

const ctx = contexto();
const moduloDe = new Map<string, string>();
for (const e of ctx.enchufes) for (const r of (e.json?.pantallas ?? []) as string[]) moduloDe.set(r, e.json.modulo);
const rutas: Ruta[] = ctx.paginas.filter((p: { archivo: string }) => DENTRO.some((d: string) => p.archivo.startsWith(d)))
  .map((p: { ruta: string; archivo: string }) => ({ ruta: p.ruta, archivo: p.archivo, modulo: moduloDe.get(p.ruta) ?? '' }))
  .filter((r: Ruta) => !SOLO || r.ruta.startsWith(SOLO))
  .sort((a: Ruta, b: Ruta) => a.ruta.localeCompare(b.ruta));

const CON_CUENTA = /^\/(buzon|reel|sgi)(\/|$)/;
const DE_LA_MESA = /^\/mesa\//;
/** Lo que el recorrido marca como «primer arranque visto» para no tapar la pantalla (se prueba aparte). */
const INQUILINO: Record<string, string> = { laboratorio: 'laboratorio', 'soporte-sap': 'mesa', agora: 'golfo-norte' };
const PRIMER_ARRANQUE = Object.entries(INQUILINO).map(([producto, inquilino]) => [`capa:${producto}:capa/${producto}/${inquilino}/capa/primer-arranque`, JSON.stringify({ version: 1, terminado: true, paso: 5, nivel: 'lo-importante', voz: false })]);

const navegador = await chromium.launch();
const nuevo = async (cabeceras?: Record<string, string>): Promise<BrowserContext> => {
  const c = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX', colorScheme: 'light', extraHTTPHeaders: cabeceras });
  await c.addInitScript((pares: string[][]) => { try { for (const [k, v] of pares) localStorage.setItem(k!, v!); } catch { /* sin almacenamiento */ } }, PRIMER_ARRANQUE);
  return c;
};

/** La cuenta del recorrido: una sintética NUEVA en la Supabase local (@example.com, contraseña aleatoria que solo vive
 *  en memoria y nunca se imprime), o las del archivo de `--cuentas` si se da. Con su sesión (llave anónima) en `.c`,
 *  que es lo que la siembra usa. Nunca service_role (C7). */
async function cuentaDelRecorrido(): Promise<Cuenta | null> {
  const { altaCuenta } = await import('../sgi/local.ts');
  const ruta = arg('cuentas');
  if (ruta && existsSync(ruta)) {
    const cuentas = JSON.parse(readFileSync(ruta, 'utf8')) as Record<string, { correo: string; clave: string }>;
    const k = cuentas['consultora'] ?? Object.values(cuentas)[0];
    return k ? altaCuenta('capa-recorrido', undefined, k.correo, k.clave) : null;
  }
  return altaCuenta('capa-recorrido');
}

/** Lo que la cuenta tiene para enseñar: lo siembra `siembra-recorrido.ts` por las mismas puertas que la app. Si la
 *  siembra falla no se esconde: las rutas dinámicas lo dicen en su nota en vez de pasar o morir en silencio. */
let siembra: SiembraDelRecorrido | null = null;
let falloDeSiembra = '';

async function conCuenta(): Promise<BrowserContext | null> {
  const cuenta = await cuentaDelRecorrido().catch(() => null);
  if (!cuenta) return null;
  if (rutas.some((r) => CON_CUENTA.test(r.ruta) && r.ruta.includes('['))) {
    try {
      const { siembraDelRecorrido, resumenDeSiembra } = await import('./siembra-recorrido.ts');
      siembra = await siembraDelRecorrido(cuenta);
      console.log(`  ${resumenDeSiembra(siembra)}`);
    } catch (e) {
      falloDeSiembra = (e instanceof Error ? e.message.split('\n')[0]! : String(e)).replace(/^siembra del recorrido: /, '');
      console.log(`✗ siembra del recorrido: ${falloDeSiembra}`);
    }
  }
  const c = await nuevo();
  const p = await c.newPage();
  await p.goto(`${BASE}/login?siguiente=/sgi`);
  await p.fill('input[name=correo]', cuenta.correo);
  await p.fill('input[name=contrasena]', cuenta.clave);
  await p.click('button[type=submit]');
  await p.waitForURL((u) => u.pathname === '/sgi', { timeout: 30_000 });
  await p.close();
  return c;
}

async function deLaMesa(): Promise<{ experto: BrowserContext; laboratorio: BrowserContext; cierra: () => void } | null> {
  const dir = arg('identidad');
  if (!dir) return null;
  const { identidadLocal, sirveLlaves } = await import('../laboratorio-alojado/identidad-local.mjs');
  const id = identidadLocal(dir);
  const servidor = await sirveLlaves(id.jwks, 8799, '127.0.0.1');
  return {
    experto: await nuevo({ 'cf-access-jwt-assertion': id.firma({ email: 'experto@prueba.local' }) }),
    laboratorio: await nuevo({ 'cf-access-jwt-assertion': id.firma({ email: 'laboratorio@prueba.local' }) }),
    cierra: () => servidor.close(),
  };
}

/** El primer enlace de una página de lista que lleva a una ruta dinámica (`/sgi/<org>`, `/reel/<id>`…). */
async function primerEnlace(p: Page, desde: string, patron: RegExp): Promise<string | null> {
  await p.goto(`${BASE}${desde}`, { waitUntil: 'networkidle' });
  const hrefs = await p.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
  return hrefs.find((h) => patron.test(h)) ?? null;
}

const resueltas = new Map<string, string | null>();
/** Las rutas dinámicas se concretan SIGUIENDO los enlaces de la lista, como lo haría una persona. Con la siembra, el
 *  enlace que se busca es el de lo sembrado (así una cuenta con más datos tampoco desvía el recorrido). */
async function concreta(p: Page, ruta: string): Promise<string | null> {
  if (!ruta.includes('[')) return ruta;
  if (resueltas.has(ruta)) return resueltas.get(ruta)!;
  const uuid = '[0-9a-f-]{36}';
  let destino: string | null = null;
  if (ruta.startsWith('/sgi/[org]')) {
    const org = await primerEnlace(p, '/sgi', new RegExp(`^/sgi/${siembra?.org ?? uuid}$`));
    if (org) destino = ruta.replace('/sgi/[org]', org);
    if (destino?.includes('[version]')) destino = await primerEnlace(p, destino.replace('/[version]', ''), new RegExp(`^${org}/documentos/${uuid}$`));
  } else if (ruta === '/buzon/[pyme]') {
    if (!siembra || siembra.pyme) destino = await primerEnlace(p, '/buzon', new RegExp(`^/buzon/(?!cierre)${siembra?.pyme ?? '[^/?#]+'}$`));
  } else if (ruta === '/reel/[id]') destino = await primerEnlace(p, '/reel', new RegExp(`^/reel/${siembra?.reel ?? '[^/?#]+'}$`));
  resueltas.set(ruta, destino);
  return destino;
}

/** Por qué una ruta dinámica no se pudo concretar: lo que la siembra dijo, o que falló, o que no hay de dónde sacar datos. */
const sinDatos = (ruta: string) => siembra?.sinSembrar[ruta] ?? (falloDeSiembra ? `la siembra falló: ${falloDeSiembra}` : 'sin datos sintéticos para concretar la ruta dinámica');

async function visita(c: BrowserContext, r: Ruta, n: number): Promise<Resultado> {
  const p = await c.newPage();
  const errores: string[] = [];
  p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().split('\n')[0]!.slice(0, 240)); });
  p.on('pageerror', (e) => errores.push(`pageerror: ${e.message.split('\n')[0]!.slice(0, 240)}`));
  const captura = `${DIR}/${String(n).padStart(2, '0')}-${r.ruta.replace(/^\//, '').replace(/[[\]]/g, '').replace(/\//g, '_') || 'inicio'}.png`;
  const res: Resultado = { ruta: r.ruta, visitada: '', modulo: r.modulo, visto: '', ok: false, errores, captura, nota: '' };
  try {
    const destino = await concreta(p, r.ruta);
    errores.length = 0;
    if (!destino) { res.nota = sinDatos(r.ruta); return res; }
    res.visitada = destino;
    const respuesta = await p.goto(`${BASE}${destino}`, { waitUntil: 'networkidle', timeout: 60_000 });
    const ventana = p.locator('[data-capa-ventana]');
    await ventana.waitFor({ timeout: 20_000 });
    res.visto = (await ventana.getAttribute('data-capa-modulo')) ?? '';
    const lienzo = (await p.locator('[data-capa-ranura=lienzo]').innerText()).trim().length;
    const estado = respuesta?.status() ?? 0;
    await p.waitForTimeout(400);
    await p.screenshot({ path: captura });
    res.ok = estado < 400 && res.visto === r.modulo && r.modulo !== '' && lienzo > 0 && errores.length === 0;
    res.nota = `HTTP ${estado} · lienzo ${lienzo} caracteres`;
  } catch (e) {
    res.nota = `EXCEPCIÓN: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`;
    await p.screenshot({ path: captura }).catch(() => undefined);
  } finally {
    await p.close();
  }
  return res;
}

const anonima = await nuevo();
const cuenta = rutas.some((r) => CON_CUENTA.test(r.ruta)) ? await conCuenta() : null;
const mesa = rutas.some((r) => DE_LA_MESA.test(r.ruta)) ? await deLaMesa() : null;
const resultados: Resultado[] = [];
let n = 0;
for (const r of rutas) {
  n++;
  const c = CON_CUENTA.test(r.ruta) ? cuenta : DE_LA_MESA.test(r.ruta) ? (r.ruta.endsWith('/laboratorio') ? mesa?.laboratorio : mesa?.experto) : anonima;
  if (!c) { resultados.push({ ruta: r.ruta, visitada: '', modulo: r.modulo, visto: '', ok: false, errores: [], captura: '', nota: CON_CUENTA.test(r.ruta) ? 'sin --cuentas' : 'sin --identidad' }); continue; }
  const x = await visita(c, r, n);
  resultados.push(x);
  console.log(`${x.ok ? '✓' : '✗'} ${String(n).padStart(2)} ${r.ruta.padEnd(42)} ${x.visto || '—'}${x.visto === r.modulo ? '' : ` (esperado ${r.modulo || '¿?'})`} · ${x.nota}${x.errores.length ? `\n      consola: ${x.errores.slice(0, 3).join(' | ')}` : ''}`);
}
mesa?.cierra();
await navegador.close();
const buenas = resultados.filter((r) => r.ok).length;
writeFileSync(`${DIR}/resumen.json`, `${JSON.stringify({ base: BASE, fecha: new Date().toISOString(), n: buenas, total: resultados.length, siembra: siembra ?? (falloDeSiembra ? { fallo: falloDeSiembra } : null), resultados }, null, 2)}\n`);
const errores = resultados.reduce((s, r) => s + r.errores.length, 0);
console.log(`\nRecorrido de la capa: ${buenas}/${resultados.length} rutas dentro de la capa · ${errores} error(es) de consola · ${DIR}/resumen.json`);
process.exit(buenas === resultados.length && errores === 0 ? 0 : 1);
