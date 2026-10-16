/**
 * Privacidad (lazos l-sin-pii y l-datalayer): ningun nombre, correo, celular ni texto del padecimiento SEMBRADO
 * aparece en el libro ni en el dataLayer; la categoria del servicio va al libro y NUNCA al dataLayer; consent
 * mode v2 denegado por defecto; sin ID y consentimiento no hay contenedor.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aDataLayer, buscaSembrados, CLAVES_PERMITIDAS, CONSENTIMIENTO_POR_DEFECTO, consentimientoDesdeEleccion, debeCargarContenedor, TIPOS_EN_DATALAYER,
} from '../dist/index.js';
import { alta, banco, instante, PACIENTES, sembrados } from './_banco.ts';

async function corridaCompleta() {
  const b = banco();
  for (const p of PACIENTES.pacientes) {
    await alta(b, p);
    const hora = p.cita.choqueCon ? (p.cita.alternativa ?? p.cita.hora) : p.cita.hora;
    await b.portal.reserva({ clinica: p.clinica, usuario: `usr-${p.id}`, servicio: p.cita.servicio, inicio: instante(p.cita.diasAdelante, hora), canales: p.cita.canales, newsletter: p.cita.newsletter, clave: 'c' });
    if (p.telegram?.vincula) {
      const { enlace } = await b.portal.enlaceTelegram(p.clinica, `usr-${p.id}`);
      await b.telegram.abreEnlace(enlace.split('/')[3]!.split('?')[0]!, enlace.split('start=')[1]!, { id: p.telegram.chatId!, nombre: p.telegram.nombre! });
    }
  }
  await b.portal.despacha();
  b.reloj.avanza(2_000);
  await b.portal.despacha();
  return b;
}

test('los valores sembrados existen (si la lista estuviera vacía, la prueba no probaría nada)', () => {
  const s = sembrados();
  assert.ok(s.length >= 40, `solo ${s.length} valores sembrados`);
  assert.ok(s.some((x) => /punzadas en un colmillo/.test(x)) && s.some((x) => /@pacientes\.example$/.test(x)) && s.some((x) => /^\+?52|^55 0000/.test(x)));
});

test('CERO PII sembrada en el libro de las dos clínicas (nombres, correos, celulares, padecimientos, empresa, tutor)', async () => {
  const b = await corridaCompleta();
  const libro = [...b.almacenLibro.todos.values()].flat();
  assert.ok(libro.length > 60);
  assert.deepEqual(buscaSembrados(libro, sembrados()), []);
  assert.ok(JSON.stringify(libro).includes('"categoria":"general"'), 'la categoría SÍ va al libro interno');
});

test('el almacén del portal sí tiene la PII (es el expediente administrativo): la prueba de arriba no es trivial', async () => {
  const b = await corridaCompleta();
  assert.ok(buscaSembrados(b.almacen.exporta(), sembrados()).length > 20);
});

test('CERO PII y CERO categoría en el dataLayer, de todos los eventos de la corrida', async () => {
  const b = await corridaCompleta();
  const eventos = [...b.almacenLibro.todos.values()].flat().map((e) => e.evento);
  const capa = eventos.map(aDataLayer).filter((x) => x !== null);
  assert.ok(capa.length >= 16, `solo ${capa.length} eventos en el dataLayer`);
  assert.deepEqual(buscaSembrados(capa, sembrados()), []);
  for (const e of capa) {
    for (const k of Object.keys(e)) assert.ok(CLAVES_PERMITIDAS.has(k), `clave no permitida: ${k}`);
    assert.ok(!('categoria' in e) && !('servicio' in e) && !('sujeto' in e), JSON.stringify(e));
    assert.ok(!/pac_|vis_|cit_|avi_/.test(JSON.stringify(e)), 'ni seudónimos ni ids internos');
  }
});

test('solo los eventos de producto permitidos salen al dataLayer (el resto da null)', async () => {
  const b = await corridaCompleta();
  const eventos = [...b.almacenLibro.todos.values()].flat().map((e) => e.evento);
  for (const e of eventos) {
    const d = aDataLayer(e);
    assert.equal(d !== null, TIPOS_EN_DATALAYER.includes(e.tipo), e.tipo);
  }
  assert.ok(!TIPOS_EN_DATALAYER.includes('consentimiento_otorgado') && !TIPOS_EN_DATALAYER.includes('asistente_turno') && !TIPOS_EN_DATALAYER.includes('urgencia_derivada'));
});

test('consent mode v2: los cuatro parámetros DENEGADOS por defecto', () => {
  assert.deepEqual({ ...CONSENTIMIENTO_POR_DEFECTO }, { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  assert.ok(Object.isFrozen(CONSENTIMIENTO_POR_DEFECTO));
});

test('el contenedor de GTM solo carga con un ID válido Y el consentimiento de analítica', () => {
  assert.equal(debeCargarContenedor(undefined, consentimientoDesdeEleccion(true)), false, 'sin ID (el laboratorio) no hay contenedor');
  assert.equal(debeCargarContenedor('GTM-ABC1234', CONSENTIMIENTO_POR_DEFECTO), false, 'con ID pero sin consentimiento, tampoco');
  assert.equal(debeCargarContenedor('GTM-ABC1234', consentimientoDesdeEleccion(false)), false);
  assert.equal(debeCargarContenedor('<script>', consentimientoDesdeEleccion(true)), false, 'un ID con otra forma no se inyecta');
  assert.equal(debeCargarContenedor('GTM-ABC1234', consentimientoDesdeEleccion(true)), true);
  assert.equal(consentimientoDesdeEleccion(true).ad_storage, 'denied', 'la publicidad no se ofrece en un portal de salud');
});
