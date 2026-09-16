/**
 * Los datos del humano: historial (JSONL), diccionario (texto, una linea por termino, como en
 * sflow) y snippets (JSON). Viven en `DICTADO_DATOS` y se leen al arrancar `dictar`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { creaDiccionario, type Diccionario } from '../diccionario.js';
import { creaSnippets, type Snippet, type Snippets } from '../snippets.js';
import { creaHistorial, type Historial } from '../historial.js';
import { creaAlmacenJsonl } from './almacen-jsonl.js';
import type { Configuracion } from './cli-config.js';

const SEMILLA_DICCIONARIO = `# Diccionario personal de dictado: un termino por linea, # para comentarios.
# Nombres propios, siglas y jerga que el motor no conoce. Se usa como pista en los motores que
# la admiten (faster-whisper) y, si activas la correccion por similitud, como sustitucion.
`;

export interface Datos {
  diccionario: Diccionario;
  snippets: Snippets;
  historial: Historial;
  guardaDiccionario(): void;
  guardaSnippets(): void;
}

export function cargaDatos(config: Configuracion, opciones: { corrigePorSimilitud?: boolean } = {}): Datos {
  mkdirSync(config.datos, { recursive: true });
  const rutaDiccionario = join(config.datos, 'diccionario.txt');
  const rutaSnippets = join(config.datos, 'snippets.json');
  if (!existsSync(rutaDiccionario)) writeFileSync(rutaDiccionario, SEMILLA_DICCIONARIO, 'utf8');
  const diccionario = creaDiccionario({ terminos: readFileSync(rutaDiccionario, 'utf8').split('\n'), corrigePorSimilitud: opciones.corrigePorSimilitud });
  const snippets = creaSnippets(existsSync(rutaSnippets) ? (JSON.parse(readFileSync(rutaSnippets, 'utf8')) as Snippet[]) : []);
  const historial = creaHistorial(creaAlmacenJsonl(join(config.datos, 'historial.jsonl')), diccionario);
  return {
    diccionario,
    snippets,
    historial,
    guardaDiccionario() {
      writeFileSync(rutaDiccionario, SEMILLA_DICCIONARIO + diccionario.terminos().join('\n') + '\n', 'utf8');
    },
    guardaSnippets() {
      writeFileSync(rutaSnippets, JSON.stringify(snippets.lista(), null, 1) + '\n', 'utf8');
    },
  };
}

export async function ordenHistorial(config: Configuracion, posicionales: string[], opciones: Record<string, string | boolean>): Promise<void> {
  const datos = cargaDatos(config);
  const n = Number(opciones['n'] ?? 20);
  const busca = typeof opciones['busca'] === 'string' ? opciones['busca'] : undefined;
  if (posicionales[0] === 'corrige' && posicionales[1] && posicionales[2]) {
    const r = await datos.historial.corrige(posicionales[1], posicionales.slice(2).join(' '));
    if (!r.entrada) return console.log('no existe esa entrada');
    console.log(`corregida. candidatos al diccionario: ${r.candidatos.join(', ') || '(ninguno)'}`);
    if (r.candidatos.length > 0) console.log(`  para anadirlos: dictado diccionario agrega ${r.candidatos.map((c) => `"${c}"`).join(' ')}`);
    return;
  }
  const entradas = busca ? await datos.historial.busca(busca, n) : await datos.historial.recientes(n);
  console.log(`${await datos.historial.cuenta()} dictado(s) en total${busca ? `, ${entradas.length} con «${busca}»` : ''}`);
  for (const e of entradas) {
    const latencia = e.latenciaMs !== undefined ? ` · ${e.latenciaMs} ms` : '';
    console.log(`${e.fecha.slice(0, 19).replace('T', ' ')}  [${e.id}]  ${e.motor} · ${(e.duracionMs / 1000).toFixed(1)} s${latencia}\n  ${e.texto}`);
  }
}

export function ordenDiccionario(config: Configuracion, posicionales: string[]): void {
  const datos = cargaDatos(config);
  const [sub, ...resto] = posicionales;
  if (sub === 'agrega' && resto.length > 0) {
    const anadidos = datos.diccionario.agrega(resto);
    datos.guardaDiccionario();
    return console.log(`anadidos: ${anadidos.join(', ') || '(ya estaban)'}`);
  }
  if (sub === 'quita' && resto[0]) {
    const quitado = datos.diccionario.quita(resto.join(' '));
    datos.guardaDiccionario();
    return console.log(quitado ? 'quitado' : 'no estaba');
  }
  const terminos = datos.diccionario.terminos();
  console.log(`${terminos.length} termino(s) en ${join(config.datos, 'diccionario.txt')}`);
  for (const t of terminos) console.log(`  ${t}`);
}

export function ordenSnippets(config: Configuracion, posicionales: string[]): void {
  const datos = cargaDatos(config);
  const [sub, disparador, ...resto] = posicionales;
  if (sub === 'agrega' && disparador && resto.length > 0) {
    const s = datos.snippets.agrega(disparador, resto.join(' ').replace(/\\n/g, '\n'));
    datos.guardaSnippets();
    return console.log(`snippet «${s.disparador}» → ${JSON.stringify(s.expansion)}`);
  }
  if (sub === 'quita' && disparador) {
    const quitado = datos.snippets.quita(disparador);
    datos.guardaSnippets();
    return console.log(quitado ? 'quitado' : 'no estaba');
  }
  const lista = datos.snippets.lista();
  console.log(`${lista.length} snippet(s)`);
  for (const s of lista) console.log(`  «${s.disparador}» → ${JSON.stringify(s.expansion)}  (${s.usos} uso(s))`);
}
