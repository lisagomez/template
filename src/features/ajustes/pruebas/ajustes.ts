/**
 * Pruebas de la logica pura de /ajustes: sin navegador, sin disco.
 * `node --test src/features/ajustes/pruebas/*.ts`
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agrupaCampos, avisoDeAplicacion, avisoDeCapa, cuentaCambiados, etiquetaOrigen, formateaCifras, opcionesDe, valorParaEditar } from '../services/presenta.ts';
import type { Campo, EntradaCatalogo, GrupoInfo } from '../services/tipos.ts';

const campo = (c: Partial<Campo> & { clave: string }): Campo => ({ grupo: 'audio', etiqueta: c.clave, ayuda: '', tipo: 'texto', enCaliente: false, ...c });
const GRUPOS: GrupoInfo[] = [{ id: 'motor', titulo: 'Motor' }, { id: 'audio', titulo: 'Audio' }, { id: 'sonidos', titulo: 'Sonidos' }];
const ESQUEMA: Campo[] = [campo({ clave: 'silencioMs', grupo: 'audio', tipo: 'entero' }), campo({ clave: 'motor', grupo: 'motor', tipo: 'motor', bandera: 'motor' }), campo({ clave: 'retencionDias', grupo: 'audio', variable: 'DICTADO_RETENCION_DIAS' })];

test('agrupaCampos: en el orden de los grupos y sin grupos vacios', () => {
  const g = agrupaCampos(ESQUEMA, GRUPOS);
  assert.deepEqual(g.map((x) => [x.grupo.id, x.campos.map((c) => c.clave)]), [['motor', ['motor']], ['audio', ['silencioMs', 'retencionDias']]]);
});

test('etiquetaOrigen y avisoDeCapa: el origen en palabras, y el aviso solo cuando manda una capa por encima del archivo', () => {
  const m = ESQUEMA[1]!;
  const r = ESQUEMA[2]!;
  assert.equal(etiquetaOrigen('defecto', m), 'por defecto');
  assert.equal(etiquetaOrigen('ajustes', m), 'guardado');
  assert.equal(etiquetaOrigen('argumento', m), 'lo fija la bandera --motor de esta sesión');
  assert.equal(etiquetaOrigen('entorno', r), 'lo fija DICTADO_RETENCION_DIAS');
  assert.equal(avisoDeCapa('ajustes', m), undefined);
  assert.equal(avisoDeCapa('defecto', m), undefined);
  assert.match(avisoDeCapa('argumento', m) ?? '', /--motor/);
  assert.match(avisoDeCapa('entorno', r) ?? '', /DICTADO_RETENCION_DIAS/);
});

test('avisoDeAplicacion, opcionesDe y valorParaEditar', () => {
  assert.match(avisoDeAplicacion(campo({ clave: 'x', enCaliente: true })), /sin reiniciar/);
  assert.match(avisoDeAplicacion(campo({ clave: 'x', enCaliente: false })), /siguiente sesión/);
  assert.deepEqual(opcionesDe(campo({ clave: 'motor', tipo: 'motor' }), ['parakeet', 'remoto']), ['parakeet', 'remoto']);
  assert.deepEqual(opcionesDe(campo({ clave: 'respaldo', tipo: 'respaldo' }), ['parakeet', 'remoto']), ['auto', 'ninguno', 'parakeet']);
  assert.deepEqual(opcionesDe(campo({ clave: 'pegar', tipo: 'eleccion', opciones: ['a', 'b'] }), []), ['a', 'b']);
  assert.equal(valorParaEditar(12), '12');
  assert.equal(valorParaEditar('auto'), 'auto');
  assert.equal(valorParaEditar(true), 'true');
});

test('formateaCifras: coma decimal y ms redondeados; sin medir, guiones', () => {
  const medido: EntradaCatalogo = { nombre: 'parakeet', instalado: true, medido: true, wer: 0.0332, latenciaP50Ms: 531.8, latenciaP95Ms: 925.9, cargaMs: 76.2 };
  assert.deepEqual(formateaCifras(medido), { wer: '3,3 %', p50: '532 ms', p95: '926 ms', carga: '76 ms' });
  assert.deepEqual(formateaCifras({ nombre: 'remoto', instalado: true, medido: false }), { wer: '—', p50: '—', p95: '—', carga: '—' });
  assert.equal(formateaCifras({ ...medido, cargaMs: undefined }).carga, '—');
});

test('cuentaCambiados: solo lo que no esta en su defecto', () => {
  assert.equal(cuentaCambiados({ a: { origen: 'defecto' }, b: { origen: 'ajustes' }, c: { origen: 'entorno' } }), 2);
  assert.equal(cuentaCambiados({}), 0);
});
