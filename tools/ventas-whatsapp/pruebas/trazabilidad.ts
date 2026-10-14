/**
 * Trazabilidad con cadena de hashes por inquilino: el circuito completo deja una cadena que
 * verifica, sin un solo dato personal; alterar o borrar un eslabón se delata; reescribir la cadena
 * entera lo delata el ancla firmada; y borrar el texto de un mensaje (derechos ARCO) no la rompe.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { anclasEnMemoria, canonico, hashDeEslabon, verificaCadena, verificaAnclas, type Ancla, type Eslabon } from '../dist/index.js';
import { circuito } from './_ayuda.ts';

const llaves = generateKeyPairSync('ed25519');
const firmar = (a: Omit<Ancla, 'firma'>) => sign(null, Buffer.from(canonico(a)), llaves.privateKey).toString('base64');
const verificaFirma = (a: Omit<Ancla, 'firma'>, firma: string) => verify(null, Buffer.from(canonico(a)), llaves.publicKey, Buffer.from(firma, 'base64'));

async function conCompra() {
  const x = await circuito();
  const camp = x.c.meta.anuncios.creaCampana('Trazada', 10_000);
  await x.c.vendedor.panel.registraGasto(x.restaurante.id, camp.id, camp.nombre, camp.gastoCentavos, camp.anuncios);
  const cl = x.c.meta.cliente(x.restaurante.canal.phoneNumberId, '5212291234567', 'Ana Trazada');
  cl.llegaPorAnuncio(camp.anuncios[0]!, 'Hola, ¿qué tienen?'); await x.c.asienta();
  cl.pide([{ retailerId: 'tacos-pastor', cantidad: 2 }]); await x.c.asienta();
  await cl.llenaFlow({ ENTREGA: { zona: 'Centro', direccion: 'Calle Privada 7', horario: 'lo-antes-posible', recoger: false }, RESUMEN: { confirmar: true } }); await x.c.asienta();
  await x.c.procesador.paga(x.c.procesador.ligaDeUrl((cl.ultimo()!.mensaje as { url: string }).url)!.id); await x.c.asienta();
  cl.escribe('Esto es una estafa, quiero mi reembolso'); await x.c.asienta();
  await x.c.vendedor.trazabilidad!.drena();
  return x;
}

test('el circuito deja una cadena por inquilino que verifica, con mensajes, tareas A2A y traspaso', async () => {
  const x = await conCompra();
  const cadena = await x.c.almacen.de(x.restaurante.id).lista('cadena');
  const v = verificaCadena(cadena);
  assert.equal(v.ok, true);
  const tipos = new Set(cadena.map((e) => e.tipo));
  assert.ok(tipos.has('MENSAJE_ENTRANTE') && tipos.has('MENSAJE_SALIENTE') && tipos.has('TAREA_A2A'));
  const skills = cadena.filter((e) => e.tipo === 'TAREA_A2A').map((e) => e.datos.skill);
  for (const s of ['crear_pedido', 'liga_pago', 'confirmar_pago', 'reportar_conversion', 'abrir_caso']) assert.ok(skills.includes(s), `falta ${s}`);
  assert.ok(cadena.filter((e) => e.tipo === 'TAREA_A2A').every((e) => typeof e.datos.contextId === 'string' && e.ref.length > 0), 'cada tarea con contextId y taskId');
  const deLaTienda = await x.c.almacen.de(x.tienda.id).lista('cadena');
  assert.ok(deLaTienda.every((e) => e.inquilino === x.tienda.id) && verificaCadena(deLaTienda).ok, 'la tienda tiene su propia cadena, sin nada del restaurante');
  console.log(`# cadena del restaurante: ${cadena.length} eslabones, ${[...tipos].join(', ')}`);
});

test('sin datos personales: ni teléfono, ni nombre, ni dirección, ni texto del cliente en la cadena', async () => {
  const x = await conCompra();
  const texto = JSON.stringify(await x.c.almacen.de(x.restaurante.id).lista('cadena'));
  for (const pii of ['2291234567', 'Ana Trazada', 'Calle Privada', 'estafa', 'reembolso']) assert.ok(!texto.includes(pii), `la cadena contiene «${pii}»`);
  assert.match(texto, /cliente:[0-9a-f]{8}/, 'el cliente va como seudónimo');
});

test('alterar un eslabón o borrarlo se delata; reescribir la cadena entera lo delata el ancla firmada', async () => {
  const x = await conCompra();
  const datos = x.c.almacen.de(x.restaurante.id);
  const anclas = anclasEnMemoria();
  const a = await x.c.vendedor.trazabilidad!.ancla(x.restaurante.id, anclas, firmar);
  assert.ok(a && a.hastaSeq > 5);
  const buena = await datos.lista('cadena');
  assert.equal(verificaAnclas(buena, anclas.todas, verificaFirma).ok, true);
  // 1) Alguien cambia el total de un pedido en un eslabón.
  const pago = buena.find((e) => e.datos.skill === 'confirmar_pago')!;
  const alterado = buena.map((e) => (e.seq === pago.seq ? { ...e, datos: { ...e.datos, 'pedido.totalCentavos': 1 } } : e));
  const r1 = verificaCadena(alterado);
  assert.equal(r1.ok, false);
  assert.equal(!r1.ok && r1.rotoEn, pago.seq);
  // 2) Alguien borra un eslabón.
  const r2 = verificaCadena(buena.filter((e) => e.seq !== 3));
  assert.equal(r2.ok, false);
  // 3) Alguien reescribe la cadena entera, recalculando cada hash: la cadena «verifica», el ancla no.
  let anterior = '0'.repeat(64);
  const reescrita: Eslabon[] = buena.sort((p, q) => p.seq - q.seq).map((e) => {
    const base = { ...e, datos: e.seq === pago.seq ? { ...e.datos, 'pedido.totalCentavos': 1 } : e.datos, anterior };
    const { hash: _h, ...sinHash } = base;
    void _h;
    const hash = hashDeEslabon(sinHash);
    anterior = hash;
    return { ...sinHash, hash };
  });
  assert.equal(verificaCadena(reescrita).ok, true, 'recalculada, la cadena sola no lo nota');
  const r3 = verificaAnclas(reescrita, anclas.todas, verificaFirma);
  assert.equal(r3.ok, false);
  assert.match(r3.motivo ?? '', /se reescribió/);
  // 4) Un ancla con firma de otra llave no vale.
  const otra = generateKeyPairSync('ed25519');
  const falsa = { ...a!, firma: sign(null, Buffer.from(canonico({ ...a!, firma: undefined })), otra.privateKey).toString('base64') };
  assert.equal(verificaAnclas(buena, [falsa], verificaFirma).ok, false);
});

test('derechos ARCO: borrar el texto de un mensaje no rompe la cadena (solo guarda la huella); el panel reporta integridad', async () => {
  const x = await conCompra();
  const datos = x.c.almacen.de(x.restaurante.id);
  for (const m of await datos.lista('mensajes')) await datos.guarda('mensajes', m.wamid, { ...m, resumen: '[borrado a petición del titular]' });
  const anclas = anclasEnMemoria();
  await x.c.vendedor.trazabilidad!.ancla(x.restaurante.id, anclas, firmar);
  const i = await x.c.vendedor.panel.integridad(x.restaurante.id, anclas, verificaFirma);
  assert.equal(i.activa, true);
  assert.ok(i.activa && i.cadena.ok && i.anclas?.ok && i.anclas.sinAnclar === 0);
});
