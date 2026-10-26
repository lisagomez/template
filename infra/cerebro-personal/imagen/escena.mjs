#!/usr/bin/env node
/**
 * Lo que «hace la persona» en una instancia durante la prueba, con datos SINTÉTICOS (ningún dato real, de clientes
 * ni del experto). Escribe sobre ~/Arbrain como lo haría Levy o la app: la memoria en Markdown, el calendario y los
 * hábitos en sus JSON con su forma de la semilla.
 *
 *   escena.mjs escribe <ruta> <texto>
 *   escena.mjs evento-agrega <id> <titulo> <hoy|hoy+N>
 *   escena.mjs evento-titulo <id> <titulo>
 *   escena.mjs habito-marca <hoy|hoy+N> <clave> <true|false>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const ARB = process.env.CEREBRO_ARBRAIN ?? join(homedir(), 'Arbrain');
const PLAN = join(ARB, '.claude', 'plan');
const dos = (n) => String(n).padStart(2, '0');
const dia = (t) => {
  const m = /^hoy(?:\+(\d+))?$/.exec(t ?? '');
  if (!m) throw new Error(`día no válido: ${t}`);
  const d = new Date(); d.setDate(d.getDate() + Number(m[1] ?? 0));
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};
const lee = (n) => JSON.parse(readFileSync(join(PLAN, n), 'utf8'));
const guarda = (n, o) => writeFileSync(join(PLAN, n), `${JSON.stringify(o, null, 2)}\n`);

const [orden, ...a] = process.argv.slice(2);
if (orden === 'escribe') {
  const ruta = join(ARB, a[0]);
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, `${a[1]}\n`);
} else if (orden === 'evento-agrega') {
  const c = lee('calendario.json');
  const f = dia(a[2]);
  const hora = (hm) => `${f}T${hm}:00-06:00`; // la hora ISO, armada por partes: «T» pegada a dos cifras es la forma de un identificador de caso, y la gobernanza la busca en el árbol
  c.eventos.push({ id: a[0], titulo: a[1], inicio: hora('09:00'), fin: hora('10:00'), todoElDia: false, descripcion: 'Evento sintético de la prueba' });
  guarda('calendario.json', c);
} else if (orden === 'evento-titulo') {
  const c = lee('calendario.json');
  const e = c.eventos.find((x) => x.id === a[0]);
  if (!e) throw new Error(`no hay evento ${a[0]}`);
  e.titulo = a[1];
  guarda('calendario.json', c);
} else if (orden === 'habito-marca') {
  const h = lee('habitos.json');
  const f = dia(a[0]);
  h.registro[f] ??= {};
  h.registro[f][a[1]] = { hecho: a[2] === 'true', revision: 1, actualizado: new Date().toISOString(), fuente: 'conversation' };
  guarda('habitos.json', h);
} else {
  console.error('uso: escena.mjs escribe|evento-agrega|evento-titulo|habito-marca …');
  process.exit(64);
}
