/**
 * CERO PII SEMBRADA (lazo l-sin-pii): busca cada nombre, apellido, correo, celular, empresa y texto de padecimiento de
 * los pacientes sintéticos —los DECLARADOS y los que de verdad quedaron guardados (la guía de voz transcribe nombres
 * distintos)— en todo lo que sale de la corrida: el libro, el dataLayer de cada pestaña, el log del servidor, las
 * semillas de dbt, el corte semántico, el unit economics, el grafo y el libro de gasto. El almacén del portal es el
 * CONTROL: ahí sí tienen que aparecer (si no, la búsqueda no buscaría nada).
 *
 *   node scripts/clinica-dental/sin-pii.ts   → docs/goals/clinica-dental-medicion/sin-pii.json; exit 1 si aparece algo
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buscaSembrados } from '../../tools/clinica-dental/dist/index.js';
import { PACIENTES } from './flujos.ts';
import { DATOS } from './rutas.ts';

const MEDICION = join(process.cwd(), 'docs/goals/clinica-dental-medicion');
const lee = (r: string) => (existsSync(r) ? readFileSync(r, 'utf8') : null);

function sembrados(): string[] {
  const portal = JSON.parse(lee(join(DATOS, 'portal.json')) ?? '{"pacientes":[]}') as { pacientes: { datos: Record<string, unknown> }[] };
  const valores = [...PACIENTES.map((p) => p.registro as Record<string, unknown>), ...portal.pacientes.map((p) => p.datos)].flatMap((d) => {
    const t = (d['tutor'] ?? {}) as Record<string, unknown>;
    return [d['nombre'], d['apellidoPaterno'], d['apellidoMaterno'], d['correo'], d['celular'], d['empresa'], d['padecimiento'], t['nombre'], t['correo'], t['celular']];
  });
  const textos = valores.filter((v): v is string => typeof v === 'string' && v.trim().length >= 4);
  const celulares = textos.filter((v) => /\d{4}/.test(v)).flatMap((v) => [v.replace(/\D/g, '').slice(-10)]);
  return [...new Set([...textos, ...celulares].map((v) => v.trim()))].filter((v) => v.length >= 4);
}

function objetivos(): Record<string, string | null> {
  const libro = join(DATOS, 'libro');
  const recorrido = JSON.parse(lee(join(MEDICION, 'recorrido.json')) ?? '{}') as { dataLayer?: unknown };
  return {
    'libro de eventos (JSONL, dos clínicas)': existsSync(libro) ? readdirSync(libro).filter((f) => f.endsWith('.jsonl')).map((f) => lee(join(libro, f))).join('\n') : null,
    'dataLayer de cada pestaña del recorrido': JSON.stringify(recorrido.dataLayer ?? null),
    'log del servidor de la app': lee(join(DATOS, 'servidor.log')),
    'semillas de dbt (raw_eventos.csv)': lee(join(process.cwd(), 'tools/clinica-dental/semantica/semillas/raw_eventos.csv')),
    'corte semántico (métricas)': lee(join(MEDICION, 'corte-semantico.json')),
    'unit economics': lee(join(MEDICION, 'unit-economics.json')),
    'grafo de atención': lee(join(process.cwd(), 'docs/grafos/clinica-dental-atencion.json')),
    'libro de gasto del asistente': lee(join(DATOS, 'gasto.jsonl')),
  };
}

const s = sembrados();
const resultados = Object.entries(objetivos()).map(([que, texto]) => ({ que, revisado: texto !== null, bytes: texto?.length ?? 0, apariciones: texto === null ? [] : buscaSembrados(texto, s) }));
const control = buscaSembrados(lee(join(DATOS, 'portal.json')) ?? '', s);
const salida = { cuando: new Date().toISOString(), valoresSembrados: s.length, control: { que: 'almacén del portal (expediente administrativo: AQUÍ sí debe estar)', apariciones: control.length }, resultados };
writeFileSync(join(MEDICION, 'sin-pii.json'), `${JSON.stringify(salida, null, 1)}\n`);
console.log(`valores sembrados buscados: ${s.length} (declarados + guardados de verdad)`);
for (const r of resultados) console.log(`  ${r.apariciones.length === 0 ? '✓' : '✗'} ${r.que.padEnd(42)} ${r.revisado ? `${String(r.bytes).padStart(9)} bytes` : 'NO EXISTE'} · ${r.apariciones.length} apariciones${r.apariciones.length ? ` (${r.apariciones.slice(0, 5).join(', ')})` : ''}`);
console.log(`  control: ${control.length} valores sembrados SÍ están en el almacén del portal (la búsqueda funciona)`);
if (resultados.some((r) => r.apariciones.length > 0 || !r.revisado) || control.length === 0) process.exit(1);
