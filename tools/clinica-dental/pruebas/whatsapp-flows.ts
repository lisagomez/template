/**
 * Agendar, reprogramar y cancelar con un FLOW que confirma la PERSONA (cifrado como lo cifra WhatsApp, por el
 * endpoint de datos). Cero dobles reservas aunque el portal y un Flow choquen en el mismo hueco; la identidad sale
 * del `flow_token` firmado y de la vinculacion vigente, nunca del payload; cancelar pide la casilla.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firmaMeta } from '../../ventas-whatsapp/dist/index.js';
import { tokenFlow, VIGENCIA_FLOW_MS } from '../dist/servidor.js';
import { alta, instante } from './_banco.ts';
import { bancoWa, paciente, SECRETO_APP, vinculado, vistos } from './_banco-wa.ts';

const primero = (d: Record<string, unknown>, k: string) => ((d[k] as Array<{ id: string }>)[0])!.id;

/** Llena el Flow de agendar: el servicio dado, el dia pedido (o el primero) y la hora pedida (o la primera). */
const agenda = (servicio: string, hora?: (horas: Array<{ id: string; title: string }>) => string, dia?: string) => ({
  SERVICIO: { servicio },
  DIA: (d: Record<string, unknown>) => ({ servicio: d['servicio'], cita: '', dia: dia ?? primero(d, 'dias') }),
  HORA: (d: Record<string, unknown>) => ({ servicio: d['servicio'], cita: '', hora: hora ? hora(d['horas'] as Array<{ id: string; title: string }>) : primero(d, 'horas') }),
  CONFIRMA: (d: Record<string, unknown>) => ({ servicio: d['servicio'], cita: d['cita'], hora: d['hora'], confirma: true }),
});

test('AGENDAR por Flow: servicio → día → hora → «Confirmar cita»; la confirmación sale como mensaje de SERVICIO (ventana abierta, sin plantilla)', async () => {
  const w = await bancoWa();
  const { p, cl } = await vinculado(w, 'adulto-convenio');
  cl.escribe('quiero agendar una cita');
  await w.asienta();
  const r = await cl.llenaFlow(agenda('limpieza'));
  assert.deepEqual(r.errores, []);
  assert.deepEqual(r.pantallas, ['SERVICIO', 'DIA', 'HORA', 'CONFIRMA']);
  await w.asienta();
  const [cita] = await w.almacen.citas('maguey', (await w.almacen.paciente('maguey', `usr-${p.id}`))!.seudonimo);
  assert.ok(cita && cita.estado === 'confirmada' && cita.canales.join() === 'whatsapp');
  const confirmacion = cl.recibidos.find((x) => /quedó confirmada/.test(x.resumen))!;
  assert.equal(confirmacion.mensaje.tipo, 'botones', 'dentro de la ventana: interactivo, no plantilla');
  assert.equal(confirmacion.precio?.tipo, 'free_customer_service', 'entra en los 1,000 mensajes de servicio gratis del mes');
  const ev = (await w.libro.eventos('maguey')).find((e) => e.tipo === 'cita_confirmada');
  assert.ok(ev?.tipo === 'cita_confirmada' && ev.via === 'whatsapp');
});

test('fuera de la ventana el aviso es PLANTILLA utility (US$0.0085), sin el servicio ni apellidos; «Cambiar cita» abre el Flow con la cita y la mueve', async () => {
  const w = await bancoWa();
  const { usuario, cl } = await vinculado(w, 'adulto-convenio');
  w.reloj.avanza(25 * 3_600_000);
  const r = await w.portal.reserva({ clinica: 'maguey', usuario, servicio: 'limpieza', inicio: instante(4, '10:00'), canales: ['whatsapp'], newsletter: false, clave: 'pl' });
  assert.ok(r.ok);
  await w.asienta();
  const conf = cl.recibidos.find((x) => x.mensaje.tipo === 'plantilla' && x.mensaje.nombre === 'cita_confirmada_v1')!;
  assert.ok(conf, 'pasadas 24 h desde que escribió, la confirmación sale como plantilla');
  assert.match(conf.plantilla!.texto, /^Hola, Ameyalli\. Tu cita en Clínica Dental Maguey quedó confirmada para el /);
  assert.doesNotMatch(conf.plantilla!.texto, /Limpieza|limpieza|apellido/i, 'ni el servicio (dato de salud) ni apellidos');
  const cobro = (await w.libro.eventos('maguey')).find((e) => e.tipo === 'whatsapp_cobro' && e.categoria === 'utility');
  assert.ok(cobro?.tipo === 'whatsapp_cobro' && cobro.costo_usd === 0.0085 && cobro.mensaje === 'aviso' && cobro.billable);
  cl.tocaBotonPlantilla('Cambiar cita');
  await w.asienta();
  assert.equal(cl.ultimo()?.mensaje.tipo, 'flow');
  const f = await cl.llenaFlow({ DIA: (d) => ({ servicio: d['servicio'], cita: d['cita'], dia: (d['dias'] as Array<{ id: string }>)[3]!.id }), HORA: (d) => ({ servicio: d['servicio'], cita: d['cita'], hora: primero(d, 'horas') }), CONFIRMA: (d) => ({ servicio: d['servicio'], cita: d['cita'], hora: d['hora'], confirma: true }) });
  assert.deepEqual(f.pantallas, ['DIA', 'HORA', 'CONFIRMA'], 'el botón ya traía la cita: no pregunta cuál');
  await w.asienta();
  const citas = await w.almacen.citas('maguey', r.ok ? r.cita.paciente : '');
  assert.deepEqual(citas.map((x) => x.estado).sort(), ['confirmada', 'reprogramada']);
  assert.ok(vistos(cl).some((x) => /cambió al/.test(x)), 'aviso de cita reprogramada');
});

test('recordatorio de 24 h: plantilla con «Confirmo» (queda en el libro) y «No podré ir», que a menos de 24 h pasa a la recepción', async () => {
  const w = await bancoWa();
  const { usuario, cl } = await vinculado(w, 'adulto-convenio');
  const r = await w.portal.reserva({ clinica: 'maguey', usuario, servicio: 'limpieza', inicio: instante(3, '10:00'), canales: ['whatsapp'], newsletter: false, clave: 'r24' });
  assert.ok(r.ok);
  w.reloj.avanza(50 * 3_600_000 + 60_000);
  await w.asienta();
  const rec = cl.recibidos.find((x) => x.mensaje.tipo === 'plantilla' && x.mensaje.nombre === 'recordatorio_cita_24h_v1')!;
  assert.deepEqual(rec.plantilla!.botones.map((b) => b.texto), ['Confirmo', 'No podré ir']);
  cl.tocaBotonPlantilla('Confirmo');
  await w.asienta();
  assert.match(vistos(cl).at(-1)!, /Te esperamos/);
  assert.ok((await w.libro.eventos('maguey')).some((e) => e.tipo === 'asistencia_confirmada'));
  cl.tocaBotonPlantilla('No podré ir');
  await w.asienta();
  assert.match(vistos(cl).at(-1)!, /la recepción de Clínica Dental Maguey te escribe por aquí/);
  assert.equal((await w.almacen.cita('maguey', r.ok ? r.cita.id : ''))?.estado, 'confirmada', 'a menos de 24 h no se cancela sola: la decide una persona');
});

test('CANCELAR por Flow: sin la casilla no se cancela; con ella sí, el hueco se libera y llega el aviso', async () => {
  const w = await bancoWa();
  const { usuario, cl } = await vinculado(w, 'adulto-convenio');
  const r = await w.portal.reserva({ clinica: 'maguey', usuario, servicio: 'limpieza', inicio: instante(4, '11:00'), canales: ['whatsapp'], newsletter: false, clave: 'cx' });
  assert.ok(r.ok);
  await w.asienta();
  cl.toca('Cancelar cita');
  await w.asienta();
  const sinCasilla = await cl.llenaFlow({ CANCELA: (d) => ({ cita: d['cita'], seguro: false }) });
  assert.ok(sinCasilla.errores.some((e) => /Marca la casilla/.test(e)));
  assert.equal((await w.almacen.cita('maguey', r.ok ? r.cita.id : ''))?.estado, 'confirmada');
  const ok = await cl.llenaFlow({ CANCELA: (d) => ({ cita: d['cita'], seguro: true }) });
  assert.deepEqual(ok.errores, []);
  await w.asienta();
  assert.equal((await w.almacen.cita('maguey', r.ok ? r.cita.id : ''))?.estado, 'cancelada');
  assert.ok(vistos(cl).some((x) => /Cancelamos tu cita/.test(x)));
  const ev = (await w.libro.eventos('maguey')).find((e) => e.tipo === 'cita_cancelada');
  assert.ok(ev?.tipo === 'cita_cancelada' && ev.via === 'whatsapp');
});

test('CERO dobles reservas: el portal y un Flow confirman el MISMO hueco a la vez en una clínica de un sillón; gana uno', async () => {
  for (let corrida = 0; corrida < 3; corrida++) {
    const w = await bancoWa();
    const { cl } = await vinculado(w, 'baja-newsletter');
    const otro = paciente('choque-de-hueco');
    await alta(w, otro);
    cl.escribe('quiero agendar');
    await w.asienta();
    const hueco = instante(3, '12:00');
    // El portal reserva en el MISMO instante en que la persona toca «Confirmar cita» en el Flow.
    let portal: ReturnType<typeof w.portal.reserva> | null = null;
    const flow = await cl.llenaFlow({
      ...agenda('limpieza', (hs) => hs.find((h) => h.id === hueco)?.id ?? '', hueco.slice(0, 10)),
      CONFIRMA: (d) => {
        portal = w.portal.reserva({ clinica: 'colibri', usuario: `usr-${otro.id}`, servicio: 'limpieza', inicio: hueco, canales: ['correo'], newsletter: false, clave: `choque-${corrida}` });
        return { servicio: d['servicio'], cita: '', hora: d['hora'], confirma: true };
      },
    });
    const enPortal = await portal!;
    const confirmadas = (await w.almacen.citas('colibri')).filter((x) => x.estado === 'confirmada' && x.inicio === Date.parse(hueco));
    assert.equal(confirmadas.length, 1, `corrida ${corrida}: un solo sillón, una sola cita`);
    assert.equal(Number(flow.cierre !== null) + Number(enPortal.ok), 1, 'exactamente uno gana');
    if (!flow.cierre) assert.ok(flow.errores.some((e) => /Alguien acaba de tomar ese horario/.test(e)));
  }
});

test('la IDENTIDAD nunca sale del payload: token de otro, número desvinculado, cita ajena y botón con firma falsa no mueven nada', async () => {
  const w = await bancoWa();
  const a = await vinculado(w, 'adulto-convenio');
  const b = await vinculado(w, 'registro-por-voz');
  const rA = await w.portal.reserva({ clinica: 'maguey', usuario: a.usuario, servicio: 'limpieza', inicio: instante(5, '10:00'), canales: ['whatsapp'], newsletter: false, clave: 'ida' });
  assert.ok(rA.ok);
  await w.asienta();
  // B toca un botón firmado para la cita de A (lo copió): la firma es buena, la cita no es suya.
  const payloadDeA = a.cl.recibidos.find((x) => x.mensaje.tipo === 'botones')!.mensaje;
  const idCancelarA = payloadDeA.tipo === 'botones' ? payloadDeA.botones.find((x) => x.titulo === 'Cancelar cita')!.id : '';
  b.cl.recibe({ wamid: 'x', instante: 0, mensaje: { tipo: 'botones', cuerpo: 'copia', botones: [{ id: idCancelarA, titulo: 'Cancelar cita' }] }, resumen: 'copia' });
  b.cl.toca('Cancelar cita');
  // Y un botón con la firma alterada.
  b.cl.recibe({ wamid: 'y', instante: 0, mensaje: { tipo: 'botones', cuerpo: 'falso', botones: [{ id: idCancelarA.replace(/.$/, (c) => (c === '0' ? '1' : '0')), titulo: 'Falso' }] }, resumen: 'falso' });
  b.cl.toca('Falso');
  await w.asienta();
  assert.match(vistos(b.cl).at(-2)!, /Esa cita ya no está activa/);
  assert.match(vistos(b.cl).at(-1)!, /Ese botón ya no es válido/);
  // Un flow_token firmado para A pero llenado desde el Flow de B: el endpoint mira la vinculación del token.
  const pa = (await w.almacen.paciente('maguey', a.usuario))!;
  const tokA = tokenFlow(w.portal.ctx.seudonimos.firma, { clinica: 'maguey', paciente: pa.seudonimo, waId: '5255000099999'.slice(1), flujo: 'cancelar', cita: rA.ok ? rA.cita.id : null, expira: w.reloj.ahora() + VIGENCIA_FLOW_MS });
  b.cl.recibe({ wamid: 'z', instante: 0, mensaje: { tipo: 'flow', cuerpo: 'x', cta: 'x', flowId: 'flow_cancelar_1090000000101', flowToken: tokA, pantalla: 'CITA' }, resumen: 'flow ajeno' });
  const intento = await b.cl.llenaFlow({ CANCELA: (d) => ({ cita: d['cita'], seguro: true }) });
  assert.deepEqual(intento.errores, ['HTTP 427'], 'token cuyo número no es el vinculado: 427, el botón se deshabilita');
  // B pide cancelar mandando en el payload la cita de A: la cita no aparece entre las suyas.
  b.cl.escribe('quiero cancelar mi cita');
  await w.asienta();
  const ajena = await b.cl.llenaFlow({ CITA: () => ({ cita: rA.ok ? rA.cita.id : '' }), CANCELA: (d) => ({ cita: d['cita'], seguro: true }) });
  assert.equal(ajena.cierre, null);
  assert.equal((await w.almacen.cita('maguey', rA.ok ? rA.cita.id : ''))?.estado, 'confirmada', 'la cita de A sigue intacta');
});

test('el endpoint: firma mala 432, cuerpo que no descifra 421, ping activo; y tras la BAJA el Flow pendiente deja de servir (427)', async () => {
  const w = await bancoWa();
  const { cl } = await vinculado(w, 'adulto-convenio');
  cl.escribe('quiero agendar');
  await w.asienta();
  const flow = cl.ultimo()!.mensaje;
  assert.equal(flow.tipo, 'flow');
  const ep = (cuerpo: string, firma: string) => import('../dist/servidor.js').then((m) => m.atiendeEndpointFlows({ ctx: w.portal.ctx, verificaFirma: () => firma === firmaMeta(SECRETO_APP, cuerpo), cifrado: { abre: () => null } }, cuerpo, firma));
  assert.equal((await ep('{}', 'sha256=mala')).status, 432);
  assert.equal((await ep('{}', firmaMeta(SECRETO_APP, '{}'))).status, 421);
  cl.escribe('BAJA');
  await w.asienta();
  const despues = await cl.llenaFlow(agenda('limpieza'));
  assert.deepEqual(despues.errores, ['HTTP 427']);
});
