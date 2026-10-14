/**
 * La optimización de respuestas y costos, medida en A/B sobre el mismo día simulado (con la cola
 * larga de preguntas que ningún enrutador entiende): ahorra tokens y llamadas SIN bajar la
 * resolución ni la conversión. Y la compactación junta mensajes sin salirse de los límites de Meta.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compacta, validaMensaje } from '../dist/index.js';
import { mideOptimizacion } from '../dist/laboratorio/index.js';
import { FLOWS } from './_ayuda.ts';

test('A/B: el optimizador ahorra tokens y llamadas al modelo y no baja resolución ni conversión', async () => {
  const r = await mideOptimizacion({ flows: FLOWS });
  for (const v of [r.antes, r.despues]) console.log(`# ${v.variante}: ${v.llamadasPorConversacion} llamadas/conv · ${v.tokensPorConversacion} tokens/conv · ${v.mensajesPorConversacion} mensajes/conv · IA ${v.costoIaMicrosPorConversacion} µUSD/conv · resueltas ${v.resueltasSinHumanoPct} % · conversión ${v.conversionPct} %`);
  console.log(`# ahorro: tokens ${r.ahorroTokensPct} % · llamadas ${r.ahorroLlamadasPct} % · mensajes ${r.ahorroMensajesPct} %`);
  assert.ok(r.despues.tokensPorConversacion < r.antes.tokensPorConversacion);
  assert.ok(r.despues.llamadasModelo > 0, 'la cola larga sigue yendo al modelo: el ahorro no sale por construcción');
  assert.ok(r.despues.resueltasSinHumanoPct >= r.antes.resueltasSinHumanoPct, 'ahorrar no puede costar resolución');
  assert.ok(r.despues.conversionPct >= r.antes.conversionPct, 'ni conversión');
});

test('compactar: texto + texto = un mensaje; texto + botones = el texto en el cuerpo; nunca se sale del límite ni toca plantillas', () => {
  const dos = compacta([{ tipo: 'texto', texto: 'Hola' }, { tipo: 'texto', texto: 'Te comunico con Martha.' }]);
  assert.equal(dos.length, 1);
  const conBotones = compacta([{ tipo: 'texto', texto: 'Lo siento.' }, { tipo: 'botones', cuerpo: '¿Qué hacemos?', botones: [{ id: 'menu', titulo: 'Ver menú' }] }]);
  assert.equal(conBotones.length, 1);
  assert.equal(conBotones[0]!.tipo, 'botones');
  const largo = 'x'.repeat(1000);
  const noCabe = compacta([{ tipo: 'texto', texto: largo }, { tipo: 'botones', cuerpo: largo, botones: [{ id: 'a', titulo: 'A' }] }]);
  assert.equal(noCabe.length, 2, 'si no cabe en 1024, no se junta');
  for (const m of noCabe) assert.deepEqual(validaMensaje(m), []);
  const plantilla = compacta([{ tipo: 'texto', texto: 'x' }, { tipo: 'plantilla', nombre: 'estado_pedido', idioma: 'es_MX', parametros: [] }]);
  assert.equal(plantilla.length, 2);
  assert.equal(compacta([{ tipo: 'texto', texto: 'igual' }, { tipo: 'texto', texto: 'igual' }]).length, 1, 'el duplicado exacto se quita');
});
