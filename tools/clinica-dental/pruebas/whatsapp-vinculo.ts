/**
 * Vincular el WhatsApp sin mandarle nada a un desconocido (C3 T-6 y T-14): el celular escrito en el registro nunca
 * recibe nada; el numero tiene que escribir con su codigo Y la persona confirmarlo desde su cuenta; un enlace
 * reenviado no le da a nadie los avisos de otro; el consentimiento es aparte y retirarlo corta el envio.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alta, instante, PACIENTES } from './_banco.ts';
import { bancoWa, paciente, vinculado, vistos, waIdDe } from './_banco-wa.ts';

const reservaWa = (w: Awaited<ReturnType<typeof bancoWa>>, id: string, dias = 3) => {
  const p = paciente(id);
  return w.portal.reserva({ clinica: p.clinica, usuario: `usr-${p.id}`, servicio: p.cita.servicio, inicio: instante(dias, p.cita.hora), canales: ['whatsapp'], newsletter: false, clave: `wa-${id}` });
};

test('consentimiento de WhatsApp APARTE en el registro: no viene marcado, exige recordatorios y se guarda separado', async () => {
  const w = await bancoWa();
  const base = paciente('adulto-convenio');
  const sinWa = await w.portal.registra({ clinica: 'maguey', usuario: 'usr-x1', entrada: base.registro, visitante: null, via: 'escrito', canal: 'directo', segundos: 1 });
  assert.ok(sinWa.ok);
  assert.equal((await w.portal.consentimientos('maguey', 'usr-x1')).whatsapp, false, 'sin marcar, no se otorga (y un registro de antes del canal sigue valiendo)');
  const consentimientos = { ...(base.registro['consentimientos'] as Record<string, boolean>), recordatorios: false, whatsapp: true };
  const malo = await w.portal.registra({ clinica: 'maguey', usuario: 'usr-x2', entrada: { ...base.registro, correo: 'x2@pacientes.example', consentimientos }, visitante: null, via: 'escrito', canal: 'directo', segundos: 1 });
  assert.ok(!malo.ok && /recordatorios/.test(malo.errores['consentimientos.whatsapp'] ?? ''));
  const bueno = await w.portal.registra({ clinica: 'maguey', usuario: 'usr-x3', entrada: { ...base.registro, correo: 'x3@pacientes.example', consentimientos: { ...consentimientos, recordatorios: true } }, visitante: null, via: 'escrito', canal: 'directo', segundos: 1 });
  assert.ok(bueno.ok);
  assert.equal((await w.portal.consentimientos('maguey', 'usr-x3')).whatsapp, true);
});

test('un número que NO probó ser del paciente no recibe nada: ni el celular del registro ni nadie', async () => {
  const w = await bancoWa();
  const p = paciente('adulto-convenio');
  await alta(w, p);
  const r = await reservaWa(w, p.id);
  assert.ok(r.ok && r.whatsappPorVincular, 'la cita avisa que falta vincular');
  await w.asienta();
  assert.deepEqual((await w.almacen.avisos('maguey')).filter((a) => a.canal === 'whatsapp').map((a) => a.estado), ['esperando_vinculo', 'esperando_vinculo', 'esperando_vinculo']);
  assert.equal(w.meta.registro.filter((x) => x.tipo === 'graph').length, 0, 'a Meta no salió ni un mensaje');
});

test('enlace REENVIADO: el tercero que manda el código primero queda pendiente, no ve nada y la persona lo rechaza', async () => {
  const w = await bancoWa();
  const p = paciente('adulto-convenio');
  await alta(w, p);
  await reservaWa(w, p.id);
  const { codigo } = await w.portal.whatsapp.codigo('maguey', `usr-${p.id}`);
  const tercero = w.cliente('maguey', '5215598765432', 'Tercero');
  tercero.escribe(`Hola, quiero vincular mi WhatsApp. Mi código es ${codigo}`);
  await w.asienta();
  const estado = await w.portal.whatsapp.estado('maguey', `usr-${p.id}`);
  assert.deepEqual(estado, { estado: 'pendiente', ultimos4: '5432', coincideCelular: false }, 'la persona ve «termina en 5432», que no es su celular');
  const sinDigitos = await w.portal.whatsapp.confirma('maguey', `usr-${p.id}`);
  assert.ok(!sinDigitos.ok && sinDigitos.motivo === 'faltan_digitos', 'no coincide con su registro: confirmar pide los 4 dígitos');
  const malos = await w.portal.whatsapp.confirma('maguey', `usr-${p.id}`, { ultimos4: '1001' });
  assert.ok(!malos.ok && malos.motivo === 'digitos');
  assert.ok(await w.portal.whatsapp.rechaza('maguey', `usr-${p.id}`));
  await w.asienta();
  assert.equal(vistos(tercero).length, 1, 'al tercero solo le llegó «confirma en el portal»');
  assert.match(vistos(tercero)[0]!, /confirma que este número \(termina en 5432\)/);
  assert.doesNotMatch(vistos(tercero).join(' '), /limpieza|Ameyalli|cita en/i);
  const propio = w.cliente('maguey', waIdDe(p, true), 'Ameyalli');
  propio.escribe(`Mi código es ${codigo}`);
  await w.asienta();
  assert.match(vistos(propio)[0]!, /ya se usó/, 'el código vale UNA vez: el reenviado lo quemó');
  assert.equal((await w.almacen.paciente('maguey', `usr-${p.id}`))?.whatsapp?.waId, null);
});

test('wa_id de México normalizado: llega con el 1 de celular (521…) y coincide con el celular del registro sin pedir dígitos', async () => {
  const w = await bancoWa();
  const { p, cl } = await vinculado(w, 'adulto-convenio', { conUno: true });
  assert.equal((await w.almacen.paciente('maguey', `usr-${p.id}`))?.whatsapp?.waId, waIdDe(p, false), 'se guarda 52 + 10 dígitos');
  assert.match(vistos(cl)[1]!, /quedó vinculado/);
  const sinUno = w.cliente('maguey', waIdDe(p, false), 'Ameyalli');
  sinUno.escribe('mis citas');
  await w.asienta();
  assert.match(vistos(cl).concat(vistos(sinUno)).join(' '), /No tienes citas próximas/, 'las dos formas del número son la misma persona');
});

test('confirmado el número, los avisos que esperaban salen; retirar el consentimiento DESVINCULA y corta lo pendiente', async () => {
  const w = await bancoWa();
  const p = paciente('adulto-convenio');
  await alta(w, p);
  await reservaWa(w, p.id);
  const { codigo } = await w.portal.whatsapp.codigo('maguey', `usr-${p.id}`);
  const cl = w.cliente('maguey', waIdDe(p, true), 'Ameyalli');
  cl.escribe(codigo);
  await w.asienta();
  assert.ok((await w.portal.whatsapp.confirma('maguey', `usr-${p.id}`)).ok);
  await w.asienta();
  assert.ok(vistos(cl).some((x) => /quedó confirmada/.test(x)), 'la confirmación que esperaba ya salió');
  await w.portal.whatsapp.desvincula('maguey', `usr-${p.id}`);
  const avisos = (await w.almacen.avisos('maguey')).filter((a) => a.canal === 'whatsapp' && a.clase !== 'confirmacion');
  assert.ok(avisos.length === 2 && avisos.every((a) => a.estado === 'cancelado' && a.motivo === 'consentimiento_retirado'));
  assert.equal((await w.almacen.paciente('maguey', `usr-${p.id}`))?.whatsapp?.waId, null);
  const eventos = (await w.libro.eventos('maguey')).filter((e) => e.tipo === 'whatsapp_vinculo').map((e) => (e.tipo === 'whatsapp_vinculo' ? e.paso : ''));
  assert.deepEqual(eventos, ['codigo_emitido', 'mensaje_recibido', 'confirmado', 'desvinculado']);
});

test('un número ya vinculado a otra cuenta no se puede vincular a una segunda (una persona por número por clínica)', async () => {
  const w = await bancoWa();
  const { cl } = await vinculado(w, 'adulto-convenio');
  const otro = PACIENTES.pacientes.find((x) => x.id === 'registro-por-voz')!;
  await alta(w, otro);
  const { codigo } = await w.portal.whatsapp.codigo('maguey', `usr-${otro.id}`);
  cl.escribe(codigo);
  await w.asienta();
  assert.match(vistos(cl).at(-1)!, /ya está vinculado a otra cuenta/);
  assert.equal((await w.portal.whatsapp.estado('maguey', `usr-${otro.id}`)).estado, 'codigo', 'la otra cuenta sigue sin número');
});
