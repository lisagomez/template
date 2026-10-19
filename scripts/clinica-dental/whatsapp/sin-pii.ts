/**
 * CERO PII SEMBRADA tras la corrida de WhatsApp: cada nombre, apellido, correo, celular y padecimiento de los pacientes
 * sintéticos, cada NÚMERO de WhatsApp que escribió (en sus dos formas, 52 y 521) y frases que la gente escribió o dijo
 * en el chat, buscados en todo lo que la corrida deja fuera del expediente: el libro, el log del servidor, la cola del
 * webhook (compactada: lo procesado no se queda), las semillas de dbt, el corte, el unit economics, el grafo, el libro
 * de gasto y la guardia de red. CONTROL: el almacén del portal SÍ los tiene (si no, la búsqueda no buscaría nada).
 *
 *   CLINICA_DATOS=~/.clinica-dental-whatsapp node scripts/clinica-dental/whatsapp/sin-pii.ts
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buscaSembrados } from '../../../tools/clinica-dental/dist/index.js';
import { PACIENTES } from '../flujos.ts';
import { DATOS } from '../rutas.ts';

const MEDICION = join(process.cwd(), 'docs/goals/clinica-dental-whatsapp-medicion');
const lee = (r: string) => (existsSync(r) ? readFileSync(r, 'utf8') : null);

/** Lo que alguien escribió o dijo en el chat (recorrido y medición): nunca debe quedar fuera del teléfono. */
const DICHO = ['se me está hinchando la cara', 'mira mi muela', 'cuánto cuesta la limpieza', 'No puedo respirar bien', 'Quiero hablar con alguien', 'Soy la mamá de Ameyalli', 'dime qué pacientes tienen cita'];
/** Números que escribieron sin ser pacientes (el tercero del enlace reenviado y los de la medición). */
const OTROS = ['5215598765432', '5215500007777', '5212200007777', '5212200006666', '5212200005555'];

function sembrados(): string[] {
  const portal = JSON.parse(lee(join(DATOS, 'portal.json')) ?? '{"pacientes":[]}') as { pacientes: { datos: Record<string, unknown>; whatsapp?: { waId: string | null } }[] };
  const valores = [...PACIENTES.map((p) => p.registro as Record<string, unknown>), ...portal.pacientes.map((p) => p.datos)].flatMap((d) => {
    const t = (d['tutor'] ?? {}) as Record<string, unknown>;
    return [d['nombre'], d['apellidoPaterno'], d['apellidoMaterno'], d['correo'], d['celular'], d['empresa'], d['padecimiento'], t['nombre'], t['correo'], t['celular']];
  });
  const textos = valores.filter((v): v is string => typeof v === 'string' && v.trim().length >= 4);
  const diez = textos.filter((v) => /\d{4}/.test(v)).map((v) => v.replace(/\D/g, '').slice(-10));
  const wa = [...diez.flatMap((d) => [`52${d}`, `521${d}`]), ...OTROS, ...OTROS.map((n) => n.replace(/^521/, '52'))];
  return [...new Set([...textos, ...diez, ...wa, ...DICHO].map((v) => v.trim()))].filter((v) => v.length >= 4);
}

function objetivos(): Record<string, string | null> {
  const libro = join(DATOS, 'libro');
  return {
    'libro de eventos (JSONL, dos clínicas)': existsSync(libro) ? readdirSync(libro).filter((f) => f.endsWith('.jsonl')).map((f) => lee(join(libro, f))).join('\n') : null,
    'log del servidor de la app': lee(join(DATOS, 'servidor.log')),
    'cola durable del webhook (compactada)': [lee(join(DATOS, 'whatsapp-cola', 'entrada.jsonl')) ?? '', lee(join(DATOS, 'whatsapp-cola', 'hechos.jsonl')) ?? ''].join('\n'),
    'semillas de dbt (raw_eventos.csv)': lee(join(process.cwd(), 'tools/clinica-dental/semantica/semillas/raw_eventos.csv')),
    'corte semántico (métricas)': lee(join(MEDICION, 'corte-semantico.json')),
    'unit economics': lee(join(MEDICION, 'unit-economics.json')),
    'grafo de atención': lee(join(MEDICION, 'grafo-atencion.json')),
    'libro de gasto del asistente': lee(join(DATOS, 'gasto.jsonl')),
    'guardia de red del servidor': lee(join(DATOS, 'red-servidor.json')),
  };
}

const s = sembrados();
const resultados = Object.entries(objetivos()).map(([que, texto]) => ({ que, revisado: texto !== null, bytes: texto?.length ?? 0, apariciones: texto === null ? [] : buscaSembrados(texto, s) }));
const control = buscaSembrados(lee(join(DATOS, 'portal.json')) ?? '', s);
const salida = { cuando: new Date().toISOString(), valoresSembrados: s.length, control: { que: 'almacén del portal (expediente administrativo: AQUÍ sí debe estar, incluido el número vinculado)', apariciones: control.length }, resultados };
writeFileSync(join(MEDICION, 'sin-pii.json'), `${JSON.stringify(salida, null, 1)}\n`);
console.log(`valores sembrados buscados: ${s.length} (datos de registro, números de WhatsApp en sus dos formas y frases dichas en el chat)`);
for (const r of resultados) console.log(`  ${r.apariciones.length === 0 ? '✓' : '✗'} ${r.que.padEnd(42)} ${r.revisado ? `${String(r.bytes).padStart(9)} bytes` : 'NO EXISTE'} · ${r.apariciones.length} apariciones${r.apariciones.length ? ` (${r.apariciones.slice(0, 5).join(', ')})` : ''}`);
console.log(`  control: ${control.length} valores sembrados SÍ están en el almacén del portal (la búsqueda funciona)`);
if (resultados.some((r) => r.apariciones.length > 0 || !r.revisado) || control.length === 0) process.exit(1);
