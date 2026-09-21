/**
 * Pruebas de la logica pura del historial: sin navegador, sin disco.
 * `node --test src/features/historial/pruebas/*.ts`
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agrupaPorDia, coincide, diaLocal, etiquetaDia, filtra, huellaDe, normaliza, resalta } from '../services/busqueda.ts';
import { calculaEstadisticas, cuentaPalabras, latencias, porDia, racha, resumeTrayectorias, ultimosDias } from '../services/estadisticas.ts';
import { aCsv, aJson, aMarkdown } from '../services/exporta.ts';
import type { Dictado, TrayectoriaResumen } from '../services/tipos.ts';

const local = (dia: string, hora: string): string => new Date(`${dia}T${hora}:00`).toISOString();
const d = (id: string, dia: string, hora: string, texto: string, extra: Partial<Dictado> = {}): Dictado => ({ id, fecha: local(dia, hora), texto, motor: 'parakeet', duracionMs: 2000, latenciaMs: 300, ...extra });

const MUESTRA: Dictado[] = [
  d('a', '2026-09-20', '09:00', 'Recuérdame mandar la cotización a Luis el jueves.'),
  d('b', '2026-09-20', '10:30', 'El pedido de tornillos va con urgencia.', { latenciaMs: 1800, motor: 'whisper' }),
  d('c', '2026-09-19', '18:00', 'Agenda una reunión con Ana Martínez.', { textoCrudo: 'Agenda una reunión con Nana Martínez.' }),
  d('d', '2026-09-15', '08:00', 'Año nuevo, niño nuevo.', { latenciaMs: null }),
];

test('normaliza: sin acentos ni mayusculas, y la ñ se conserva', () => {
  assert.equal(normaliza('Cotización ÁRBOL'), 'cotizacion arbol');
  assert.equal(normaliza('Ñandú niño'), 'ñandu niño');
});

test('resalta: encuentra sin acento sobre texto con acento y devuelve el texto original entero', () => {
  const s = resalta('La cotización a Luis', 'cotizacion');
  assert.deepEqual(s, [{ texto: 'La ', coincide: false }, { texto: 'cotización', coincide: true }, { texto: ' a Luis', coincide: false }]);
  assert.equal(s.map((x) => x.texto).join(''), 'La cotización a Luis');
  assert.deepEqual(resalta('aaa', 'a').filter((x) => x.coincide).length, 3);
  assert.deepEqual(resalta('hola', ''), [{ texto: 'hola', coincide: false }]);
  assert.deepEqual(resalta('hola', 'zzz'), [{ texto: 'hola', coincide: false }]);
  // Varias coincidencias con acentos distintos en el original.
  const m = resalta('Ana y ANÁ y aná', 'ana');
  assert.equal(m.filter((x) => x.coincide).length, 3);
  assert.equal(m.map((x) => x.texto).join(''), 'Ana y ANÁ y aná');
});

test('coincide y filtra: consulta (tambien sobre el texto crudo), motor, corregidos, latencia y rango de dias', () => {
  assert.equal(filtra(MUESTRA, { consulta: 'cotizacion' }).map((e) => e.id).join(','), 'a');
  assert.equal(filtra(MUESTRA, { consulta: 'nana' }).map((e) => e.id).join(','), 'c', 'busca tambien en lo que dijo el motor');
  assert.equal(filtra(MUESTRA, { motor: 'whisper' }).map((e) => e.id).join(','), 'b');
  assert.equal(filtra(MUESTRA, { soloCorregidos: true }).map((e) => e.id).join(','), 'c');
  assert.equal(filtra(MUESTRA, { latenciaMinMs: 1000 }).map((e) => e.id).join(','), 'b');
  assert.equal(filtra(MUESTRA, { desde: '2026-09-19', hasta: '2026-09-19' }).map((e) => e.id).join(','), 'c');
  assert.equal(filtra(MUESTRA, {}).map((e) => e.id).join(','), 'b,a,c,d', 'del mas reciente al mas antiguo');
  assert.ok(!coincide(MUESTRA[3]!, { latenciaMinMs: 0 }), 'sin latencia medida no pasa el filtro de latencia');
});

test('agrupaPorDia y etiquetaDia: hoy, ayer y el resto con su nombre', () => {
  const g = agrupaPorDia(filtra(MUESTRA, {}));
  assert.deepEqual(g.map((x) => [x.dia, x.entradas.length]), [['2026-09-20', 2], ['2026-09-19', 1], ['2026-09-15', 1]]);
  assert.equal(etiquetaDia('2026-09-20', '2026-09-20'), 'Hoy');
  assert.equal(etiquetaDia('2026-09-19', '2026-09-20'), 'Ayer');
  assert.equal(etiquetaDia('2026-09-15', '2026-09-20'), 'martes 15 de septiembre');
  assert.equal(etiquetaDia('2025-12-31', '2026-09-20'), 'miércoles 31 de diciembre de 2025');
  assert.equal(diaLocal(local('2026-09-20', '23:59')), '2026-09-20');
});

test('huella: cambia al anadir, al cambiar la ultima y al corregirla', () => {
  const h1 = huellaDe(MUESTRA);
  assert.notEqual(h1, huellaDe(MUESTRA.slice(1)));
  assert.notEqual(h1, huellaDe([...MUESTRA, d('e', '2026-09-21', '01:00', 'nuevo')]));
  assert.notEqual(h1, huellaDe(MUESTRA.map((e) => (e.id === 'b' ? { ...e, texto: 'otro texto mas largo' } : e))));
  assert.equal(huellaDe([]), '0:-:0');
});

test('estadisticas: palabras, por dia, ultimos dias con ceros, racha, latencias y motor', () => {
  assert.equal(cuentaPalabras('  hola   mundo  '), 2);
  assert.equal(cuentaPalabras(''), 0);
  assert.deepEqual(porDia(MUESTRA).map((r) => [r.dia, r.dictados, r.palabras]), [['2026-09-15', 1, 4], ['2026-09-19', 1, 6], ['2026-09-20', 2, 15]]);
  const u = ultimosDias(MUESTRA, '2026-09-20', 3);
  assert.deepEqual(u.map((r) => [r.dia, r.dictados]), [['2026-09-18', 0], ['2026-09-19', 1], ['2026-09-20', 2]]);
  assert.deepEqual(racha(MUESTRA, '2026-09-20'), { dias: 2, hastaHoy: true });
  assert.deepEqual(racha(MUESTRA, '2026-09-21'), { dias: 2, hastaHoy: false }, 'sin dictar hoy, la racha cuenta hasta ayer');
  assert.deepEqual(racha(MUESTRA, '2026-09-25'), { dias: 0, hastaHoy: false });
  assert.deepEqual(latencias(MUESTRA), { p50: 300, p95: 1800, medidas: 3 });
  assert.deepEqual(latencias([]), { p50: null, p95: null, medidas: 0 });
  const e = calculaEstadisticas(MUESTRA, [], '2026-09-20');
  assert.equal(e.semana.dictados, 4, 'la semana va del 14 al 20: entra el del 15');
  assert.equal(e.semanaAnterior.dictados, 0);
  const e2 = calculaEstadisticas(MUESTRA, [], '2026-09-22');
  assert.equal(e2.semana.dictados, 3, 'del 16 al 22: el del 15 queda en la anterior');
  assert.equal(e2.semanaAnterior.dictados, 1);
  assert.deepEqual(e.motor, { motor: 'parakeet', dictados: 3 });
  assert.equal(e.ultimosDias.length, 14);
});

test('estadisticas: las trayectorias suman sin voz, respaldo, saturaciones y flojos', () => {
  const t = (extra: Partial<TrayectoriaResumen>): TrayectoriaResumen => ({ inicio: '', fin: '', turnos: 5, sinVoz: 1, respaldo: 0, muertesCaptura: 0, latenciaP50Ms: 300, picoDbMax: -10, picoDbMin: -20, ...extra });
  const r = resumeTrayectorias([t({}), t({ picoDbMax: -1, respaldo: 2, latenciaP50Ms: 500 }), t({ picoDbMin: -50, latenciaP50Ms: null })]);
  // p50 de [300, 500] con la regla «el valor en la posicion floor(0,5·n)» es 500; sin latencia no cuenta.
  assert.deepEqual(r, { sesiones: 3, turnos: 15, sinVoz: 3, respaldo: 2, muertesCaptura: 0, saturaciones: 1, flojos: 1, latenciaP50Ms: 500 });
});

test('exporta: markdown por dia, csv con comillas y saltos de linea escapados, json fiel', () => {
  const raro = d('r', '2026-09-20', '11:00', 'Dijo "hola",\ny se fue', { textoCrudo: 'Dijo hola' });
  const md = aMarkdown([raro, ...MUESTRA], '2026-09-20');
  assert.match(md, /^# Historial de dictado/);
  assert.match(md, /## Hoy \(2026-09-20\)/);
  assert.match(md, /- \*\*11:00\*\* Dijo "hola", y se fue/);
  assert.match(md, /antes de corregir: Dijo hola/);
  const csv = aCsv([raro]);
  const lineas = csv.split('\r\n');
  assert.equal(lineas[0], 'fecha,texto,texto_crudo,motor,duracion_ms,latencia_ms');
  assert.ok(lineas[1]?.includes('"Dijo ""hola"",\ny se fue"'), `csv: ${lineas[1]}`);
  assert.ok(csv.endsWith('\r\n'));
  const sinLatencia = aCsv([MUESTRA[3]!]).split('\r\n')[1] ?? '';
  assert.ok(sinLatencia.endsWith(',2000,'), 'latencia nula → campo vacio');
  assert.deepEqual(JSON.parse(aJson(MUESTRA)), MUESTRA);
});
