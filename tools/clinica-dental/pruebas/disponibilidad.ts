/**
 * Disponibilidad y reserva (lazo l-disponibilidad, referencia: Reservas de tools/calendario): el hueco respeta
 * horario, sillon y duracion por servicio; CERO dobles reservas aunque muchos confirmen a la vez; cancelar y
 * reprogramar liberan el hueco; un paciente no ve ni toca citas ajenas ni de la otra clinica.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horaLocal } from '../dist/index.js';
import { banco, instante, PACIENTES, type PacienteSintetico } from './_banco.ts';

const sintetico = (id: string): PacienteSintetico => PACIENTES.pacientes.find((p) => p.id === id)!;
const DIA = 86_400_000;

/** N pacientes clonados del sintetico, con cuentas distintas. */
async function muchos(b: ReturnType<typeof banco>, id: string, n: number) {
  const p = sintetico(id);
  const cuentas: string[] = [];
  for (let i = 0; i < n; i++) {
    const usuario = `usr-${id}-${i}`;
    await b.portal.registra({ clinica: p.clinica, usuario, entrada: { ...p.registro, correo: `clon${i}.${p.registro.correo}` }, visitante: null, via: 'escrito', canal: p.canal, segundos: null });
    cuentas.push(usuario);
  }
  return cuentas;
}

test('huecos: respetan el horario de la clínica y la duración del servicio (Maguey, lunes)', async () => {
  const b = banco();
  const desde = Date.parse(instante(0, '00:00'));
  const lunes = await b.agendas.get('maguey')!.dias('limpieza', desde, desde + DIA);
  const horas = lunes[0]!.horas.map((h) => h.hora);
  assert.equal(horas[0], '10:00', 'aviso mínimo de 2 h desde las 8:00');
  assert.ok(horas.every((h) => (h >= '09:00' && h <= '13:15') || (h >= '16:00' && h <= '18:15')), `fuera de horario: ${horas.join(' ')}`);
  assert.ok(!horas.includes('13:30'), 'la limpieza dura 45 min: a las 13:30 ya no cabe antes de las 14:00');
  const conductos = await b.agendas.get('maguey')!.dias('conductos', desde, desde + DIA);
  assert.ok(!conductos[0]!.horas.some((h) => h.hora === '18:00'), 'conductos (90 min) no cabe a las 18:00');
  assert.equal(lunes[0]!.horas[0]!.sillones, 2, 'Maguey ofrece el hueco en sus dos sillones');
});

test('huecos: días sin servicio (domingo, festivo declarado) no se ofrecen', async () => {
  const b = banco();
  const desde = Date.parse(instante(0, '00:00'));
  const dias = await b.agendas.get('colibri')!.dias('limpieza', desde, desde + 14 * DIA);
  const fechas = dias.map((d) => d.fecha);
  assert.ok(!fechas.includes('2026-10-24') && !fechas.includes('2026-10-25'), 'Colibrí no abre en fin de semana');
  assert.ok(!fechas.includes('2026-11-02'), 'Día de Muertos bloqueado');
});

test('CERO dobles reservas: 20 pacientes confirman el MISMO hueco a la vez en la clínica de un sillón → 1 gana', async () => {
  const b = banco();
  const cuentas = await muchos(b, 'choque-de-hueco', 20);
  const inicio = instante(3, '12:00');
  const r = await Promise.all(cuentas.map((usuario, i) => b.portal.reserva({ clinica: 'colibri', usuario, servicio: 'limpieza', inicio, canales: [], newsletter: false, clave: `k${i}` })));
  const ganan = r.filter((x) => x.ok);
  assert.equal(ganan.length, 1);
  assert.ok(r.filter((x) => !x.ok).every((x) => !x.ok && x.motivo === 'ocupado'));
  const confirmadas = (await b.almacen.citas('colibri')).filter((c) => c.estado === 'confirmada');
  assert.equal(confirmadas.length, 1);
  const eventos = (await b.sim.lista({ cuenta: 'agenda@colibri.clinica.example', calendario: 'sillon-unico' }, {})).eventos.filter((e) => e.estado !== 'cancelado');
  assert.equal(eventos.length, 1, 'un solo evento en el calendario de la clínica');
});

test('CERO dobles reservas: 20 a la vez en la clínica de dos sillones → exactamente 2, uno por sillón, sin traslape', async () => {
  const b = banco();
  const cuentas = await muchos(b, 'adulto-convenio', 20);
  const inicio = instante(3, '10:00');
  const r = await Promise.all(cuentas.map((usuario, i) => b.portal.reserva({ clinica: 'maguey', usuario, servicio: 'limpieza', inicio, canales: [], newsletter: false, clave: `k${i}` })));
  const ganan = r.flatMap((x) => (x.ok ? [x.cita] : []));
  assert.equal(ganan.length, 2);
  assert.deepEqual(ganan.map((c) => c.sillon).sort(), ['sillon-1', 'sillon-2']);
  const todas = (await b.almacen.citas('maguey')).filter((c) => c.estado === 'confirmada');
  for (const a of todas) for (const c of todas) if (a !== c && a.sillon === c.sillon) assert.ok(a.fin <= c.inicio || c.fin <= a.inicio, 'traslape en un sillón');
});

test('choque de servicios distintos: una endodoncia de 90 min bloquea las limpiezas que se le empalman', async () => {
  const b = banco();
  const [c1, c2] = await muchos(b, 'sin-consentimiento-salud', 2);
  const a = await b.portal.reserva({ clinica: 'colibri', usuario: c1!, servicio: 'conductos', inicio: instante(2, '11:00'), canales: [], newsletter: false, clave: 'a' });
  assert.ok(a.ok);
  const libres = (await b.agendas.get('colibri')!.dias('limpieza', Date.parse(instante(2, '00:00')), Date.parse(instante(3, '00:00'))))[0]!.horas.map((h) => h.hora);
  for (const h of ['10:30', '11:00', '11:30', '12:00', '12:30']) assert.ok(!libres.includes(h), `${h} se empalma con la endodoncia de 11:00 a 12:30 (+10 min de margen)`);
  const choca = await b.portal.reserva({ clinica: 'colibri', usuario: c2!, servicio: 'limpieza', inicio: instante(2, '12:00'), canales: [], newsletter: false, clave: 'b' });
  assert.ok(!choca.ok && choca.motivo === 'ocupado');
});

test('un hueco fuera de horario se rechaza como fuera de regla, no como ocupado', async () => {
  const b = banco();
  const [u] = await muchos(b, 'choque-de-hueco', 1);
  const r = await b.portal.reserva({ clinica: 'colibri', usuario: u!, servicio: 'limpieza', inicio: instante(3, '19:00'), canales: [], newsletter: false, clave: 'x' });
  assert.ok(!r.ok && r.motivo === 'fuera-de-regla');
});

test('idempotente: reintentar la misma reserva (misma clave) no aparta un segundo sillón', async () => {
  const b = banco();
  const [u] = await muchos(b, 'adulto-convenio', 1);
  const e = { clinica: 'maguey', usuario: u!, servicio: 'limpieza', inicio: instante(3, '10:00'), canales: [] as ('correo' | 'telegram')[], newsletter: false, clave: 'misma' };
  const [a, c] = [await b.portal.reserva(e), await b.portal.reserva(e)];
  assert.ok(a.ok && c.ok && c.repetida && a.cita.id === c.cita.id);
  assert.equal((await b.almacen.citas('maguey')).length, 1);
});

test('cancelar libera el hueco; reprogramar aparta el nuevo antes de soltar el viejo', async () => {
  const b = banco();
  const [u1, u2] = await muchos(b, 'choque-de-hueco', 2);
  const inicio = instante(3, '12:00');
  const r = await b.portal.reserva({ clinica: 'colibri', usuario: u1!, servicio: 'limpieza', inicio, canales: ['correo'], newsletter: false, clave: 'a' });
  assert.ok(r.ok);
  const nueva = await b.portal.reprograma('colibri', u1!, r.cita.id, instante(3, '14:00'), 'rep');
  assert.ok(nueva.ok);
  assert.equal(horaLocal(nueva.cita.inicio, 'America/Mexico_City'), '14:00');
  const otro = await b.portal.reserva({ clinica: 'colibri', usuario: u2!, servicio: 'limpieza', inicio, canales: [], newsletter: false, clave: 'b' });
  assert.ok(otro.ok, 'el hueco de las 12:00 quedó libre tras reprogramar');
  await b.portal.cancela('colibri', u1!, nueva.cita.id);
  const tras = await b.portal.reserva({ clinica: 'colibri', usuario: u2!, servicio: 'limpieza', inicio: instante(3, '14:00'), canales: [], newsletter: false, clave: 'c' });
  assert.ok(tras.ok, 'el hueco de las 14:00 quedó libre tras cancelar');
});

test('reprogramar a un horario que se empalma con la MISMA cita (otro sillón libre) no cuenta como «ya tienes cita»', async () => {
  const b = banco();
  const [u] = await muchos(b, 'adulto-convenio', 1);
  const r = await b.portal.reserva({ clinica: 'maguey', usuario: u!, servicio: 'limpieza', inicio: instante(3, '10:00'), canales: [], newsletter: false, clave: 'a' });
  assert.ok(r.ok);
  const nueva = await b.portal.reprograma('maguey', u!, r.cita.id, instante(3, '10:30'), 'rep');
  assert.ok(nueva.ok, JSON.stringify(nueva));
  assert.notEqual(nueva.cita.sillon, r.cita.sillon, 'el sillón viejo sigue apartado hasta confirmar el nuevo');
});

test('política: con menos de 24 h no se cancela desde el portal (se llama a la clínica)', async () => {
  const b = banco();
  const [u] = await muchos(b, 'adulto-convenio', 1);
  const r = await b.portal.reserva({ clinica: 'maguey', usuario: u!, servicio: 'valoracion', inicio: instante(1, '10:00'), canales: [], newsletter: false, clave: 'a' });
  assert.ok(r.ok);
  b.reloj.avanza(20 * 3_600_000);
  await assert.rejects(b.portal.cancela('maguey', u!, r.cita.id), /llama a la clínica/);
});

test('aislamiento en el núcleo: un paciente no ve ni cancela la cita de otro, ni la de la otra clínica', async () => {
  const b = banco();
  const [u1, u2] = await muchos(b, 'adulto-convenio', 2);
  const r = await b.portal.reserva({ clinica: 'maguey', usuario: u1!, servicio: 'limpieza', inicio: instante(3, '10:00'), canales: [], newsletter: false, clave: 'a' });
  assert.ok(r.ok);
  assert.equal((await b.portal.proximas('maguey', u2!)).citas.length, 0);
  await assert.rejects(b.portal.cancela('maguey', u2!, r.cita.id), /No encontramos esa cita/);
  await assert.rejects(b.portal.proximas('colibri', u1!), /completa tu registro/);
});

test('un paciente no puede tener dos citas empalmadas', async () => {
  const b = banco();
  const [u] = await muchos(b, 'adulto-convenio', 1);
  assert.ok((await b.portal.reserva({ clinica: 'maguey', usuario: u!, servicio: 'limpieza', inicio: instante(3, '10:00'), canales: [], newsletter: false, clave: 'a' })).ok);
  const dos = await b.portal.reserva({ clinica: 'maguey', usuario: u!, servicio: 'valoracion', inicio: instante(3, '10:30'), canales: [], newsletter: false, clave: 'b' });
  assert.ok(!dos.ok && dos.motivo === 'empalme');
});
