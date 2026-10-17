/**
 * Cuestionario y consentimientos (lazo l-consentimiento, referencia: LFPDPPP vigente, datos sensibles):
 * sin consentimiento expreso no se guarda el padecimiento; sin opt-in no hay newsletter ni Telegram; el menor
 * pide tutor; retirar tiene efecto; el borrador del dispositivo nunca lleva el dato de salud ni la contraseña.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { borradorSeguro, esquemaCuenta, normalizaCelular, preparaRegistro, validaRegistro, VERSION_AVISO } from '../dist/index.js';
import { alta, banco, PACIENTES, type PacienteSintetico } from './_banco.ts';

const sintetico = (id: string): PacienteSintetico => PACIENTES.pacientes.find((p) => p.id === id)!;
const base = () => structuredClone(sintetico('adulto-convenio').registro) as unknown as Record<string, unknown> & { consentimientos: Record<string, boolean> };

test('sin consentimiento de salud el padecimiento NO sale de preparaRegistro, y el registro sigue', () => {
  const r = preparaRegistro(sintetico('sin-consentimiento-salud').registro);
  assert.ok(r.ok);
  assert.equal(r.preparado.datos.padecimiento, undefined);
  assert.equal(r.preparado.descartado.padecimiento, true, 'se le dice a la persona que se descarto');
  const con = preparaRegistro(sintetico('adulto-convenio').registro);
  assert.ok(con.ok);
  assert.match(con.preparado.datos.padecimiento ?? '', /muela del lado izquierdo/);
});

test('en el portal: el paciente sin consentimiento queda guardado SIN el texto del padecimiento', async () => {
  const b = banco();
  const r = await alta(b, sintetico('sin-consentimiento-salud'));
  assert.ok(r.ok && r.descartado.padecimiento);
  const guardado = JSON.stringify(b.almacen.exporta());
  assert.ok(!guardado.includes('punzadas en un colmillo'), 'el texto no llega al almacen');
});

test('menor de 18 sin tutor: error humano en el campo tutor; con tutor: consentimiento del tutor registrado', () => {
  const menor = structuredClone(sintetico('menor-con-tutor').registro);
  delete menor.tutor;
  const sin = validaRegistro(menor);
  assert.ok(!sin.ok);
  assert.match(sin.errores['tutor'] ?? '', /menor de 18 años/);
  const con = preparaRegistro(sintetico('menor-con-tutor').registro);
  assert.ok(con.ok);
  assert.equal(con.preparado.menor, true);
  assert.deepEqual(con.preparado.consentimientos.find((c) => c.tipo === 'tutor'), { tipo: 'tutor', otorgado: true, version: VERSION_AVISO });
});

test('el tutor tiene que consentir: sin `consiente: true` no hay registro', () => {
  const menor = structuredClone(sintetico('menor-con-tutor').registro) as Record<string, unknown> & { tutor: Record<string, unknown> };
  menor.tutor.consiente = false;
  const r = validaRegistro(menor);
  assert.ok(!r.ok);
  assert.match(r.errores['tutor.consiente'] ?? '', /patria potestad o la tutela/);
});

test('ningún opt-in viene marcado: cada consentimiento es un booleano EXPLÍCITO y el aviso es obligatorio', () => {
  const x = base();
  delete x.consentimientos.newsletter;
  assert.ok(!validaRegistro(x).ok, 'sin decir newsletter sí/no, no valida');
  const y = base();
  y.consentimientos.aviso_privacidad = false;
  const r = validaRegistro(y);
  assert.ok(!r.ok);
  assert.match(r.errores['consentimientos.aviso_privacidad'] ?? '', /aviso de privacidad/);
});

test('Telegram sin recordatorios no se acepta (es un canal de recordatorios)', () => {
  const x = base();
  x.consentimientos.recordatorios = false;
  x.consentimientos.telegram = true;
  const r = validaRegistro(x);
  assert.ok(!r.ok);
  assert.match(r.errores['consentimientos.telegram'] ?? '', /recordatorios/);
});

test('sin campos de más: un campo no pedido se rechaza en lugar de guardarse', () => {
  const x = { ...base(), curp: 'XAXX010101HDFXXX00' };
  const r = validaRegistro(x);
  assert.ok(!r.ok);
});

test('mensajes humanos: celular, correo, edad y nombre', () => {
  const x = { ...base(), celular: '123', correo: 'no-es-correo', edad: 'veinte', nombre: 'Ana<script>' };
  const r = validaRegistro(x);
  assert.ok(!r.ok);
  assert.match(r.errores['celular'] ?? '', /10 dígitos/);
  assert.match(r.errores['correo'] ?? '', /correo válido/);
  assert.match(r.errores['edad'] ?? '', /edad/);
  assert.match(r.errores['nombre'] ?? '', /solo puede llevar letras/);
  assert.equal(normalizaCelular('(55) 0000-1001'), '+525500001001');
  assert.equal(normalizaCelular('+52 55 0000 1001'), '+525500001001');
  assert.ok(!esquemaCuenta.safeParse({ contrasena: 'corta' }).success);
});

test('el borrador del dispositivo nunca lleva el padecimiento ni la contraseña', () => {
  const borrador = borradorSeguro({ ...base(), contrasena: 'Secreta-123' });
  assert.equal('padecimiento' in borrador, false);
  assert.equal('contrasena' in borrador, false);
  assert.equal('consentimientos' in borrador, false, 'los consentimientos se vuelven a marcar, no se arrastran');
  assert.equal(borrador['nombre'], 'Ameyalli');
});

test('retirar el consentimiento de salud BORRA el texto guardado (tan fácil de retirar como de dar)', async () => {
  const b = banco();
  const p = sintetico('adulto-convenio');
  await alta(b, p);
  assert.match(JSON.stringify(b.almacen.exporta()), /muela del lado izquierdo/);
  const r = await b.portal.cambiaConsentimiento('maguey', `usr-${p.id}`, 'datos_salud', false);
  assert.equal(r.cambiado, true);
  assert.ok(!JSON.stringify(b.almacen.exporta()).includes('muela del lado izquierdo'));
  const ev = (await b.libro.eventos('maguey')).filter((e) => e.tipo === 'consentimiento_retirado');
  assert.equal(ev.length, 1);
  assert.equal((await b.portal.cambiaConsentimiento('maguey', `usr-${p.id}`, 'datos_salud', false)).cambiado, false, 'idempotente');
});

test('el registro es idempotente por cuenta: registrarse dos veces no duplica ni re-emite', async () => {
  const b = banco();
  const p = sintetico('baja-newsletter');
  const a = await alta(b, p);
  const c = await alta(b, p);
  assert.ok(a.ok && c.ok && c.repetido);
  assert.equal((await b.libro.eventos('colibri')).filter((e) => e.tipo === 'paciente_registrado').length, 1);
});

test('consentimientos otorgados al registrar, con la versión del aviso (borrador), en el libro', async () => {
  const b = banco();
  await alta(b, sintetico('adulto-convenio'));
  const tipos = (await b.libro.eventos('maguey')).filter((e) => e.tipo === 'consentimiento_otorgado').map((e) => (e.tipo === 'consentimiento_otorgado' ? `${e.consentimiento}@${e.version_aviso}` : ''));
  assert.deepEqual(tipos.sort(), ['aviso_privacidad', 'datos_salud', 'newsletter', 'recordatorios'].map((t) => `${t}@${VERSION_AVISO}`));
});
