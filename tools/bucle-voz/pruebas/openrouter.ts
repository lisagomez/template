/**
 * El cerebro en flujo por la API compatible con OpenAI: SSE con comentarios, tokens, costo y
 * error a medio flujo; la llave nunca sale en un error; el modelo va pineado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaCerebroCompat, leeSse } from '../dist/openrouter.js';
import type { PiezaCerebro } from '../dist/index.js';

const LLAVE = 'sk-prueba-0123456789abcdef';

function flujo(lineas: string[]): ReadableStream<Uint8Array> {
  const cod = new TextEncoder();
  return new ReadableStream({
    start(c) {
      // Cortes a mitad de línea, como llegan de verdad.
      const todo = cod.encode(lineas.join('\n') + '\n');
      for (let i = 0; i < todo.length; i += 7) c.enqueue(todo.slice(i, i + 7));
      c.close();
    },
  });
}

const fetchFalso = (lineas: string[], status = 200, registro?: { cuerpo?: string; senal?: AbortSignal | null }) =>
  (async (_url: string | URL | Request, init?: RequestInit) => {
    if (registro) {
      registro.cuerpo = String(init?.body);
      registro.senal = init?.signal;
    }
    return new Response(status === 200 ? flujo(lineas) : `{"error":"mal","llave":"${LLAVE}"}`, { status });
  }) as typeof fetch;

async function junta(it: AsyncIterable<PiezaCerebro>): Promise<PiezaCerebro[]> {
  const salida: PiezaCerebro[] = [];
  for await (const p of it) salida.push(p);
  return salida;
}

const trozo = (texto: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: texto } }] })}`;

test('lee el flujo: ignora comentarios, junta tokens y reporta el costo del proveedor', async () => {
  const registro: { cuerpo?: string; senal?: AbortSignal | null } = {};
  const c = creaCerebroCompat({ llave: LLAVE, modelo: 'anthropic/claude-haiku-5.5-20261007', sistema: 'Sé breve.', fetch: fetchFalso([': OPENROUTER PROCESSING', trozo('Hola'), '', trozo(', ¿qué tal?'), `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 50, completion_tokens: 8, cost: 0.0000123 } })}`, 'data: [DONE]'], 200, registro) });
  const control = new AbortController();
  const piezas = await junta(c.piensa([{ rol: 'usuario', texto: 'hola' }], control.signal));
  assert.deepEqual(piezas, [{ tipo: 'token', texto: 'Hola' }, { tipo: 'token', texto: ', ¿qué tal?' }, { tipo: 'uso', costoUsd: 0.0000123, tokens: { entrada: 50, salida: 8, cacheados: 0 } }]);
  const cuerpo = JSON.parse(registro.cuerpo ?? '{}') as { stream: boolean; model: string; messages: { role: string }[]; usage: { include: boolean } };
  assert.equal(cuerpo.stream, true);
  assert.equal(cuerpo.model, 'anthropic/claude-haiku-5.5-20261007');
  assert.deepEqual(cuerpo.messages.map((m) => m.role), ['system', 'user']);
  assert.equal(cuerpo.usage.include, true);
  assert.equal(registro.senal, control.signal, 'la señal del turno llega al fetch: interrumpir corta la conexión');
});

test('sin costo del proveedor, estima con el precio; sin precio, `null` (nunca cero)', async () => {
  const lineas = [trozo('ok'), `data: ${JSON.stringify({ usage: { prompt_tokens: 1000, completion_tokens: 100 } })}`];
  const conPrecio = creaCerebroCompat({ llave: LLAVE, modelo: 'm/x-1', sistema: '', fetch: fetchFalso(lineas), precio: { entrada: 0.1, salida: 0.5 } });
  assert.deepEqual((await junta(conPrecio.piensa([], new AbortController().signal))).at(-1), { tipo: 'uso', costoUsd: 0.00015, tokens: { entrada: 1000, salida: 100, cacheados: 0 } });
  const sinPrecio = creaCerebroCompat({ llave: LLAVE, modelo: 'm/x-1', sistema: '', fetch: fetchFalso(lineas) });
  assert.deepEqual((await junta(sinPrecio.piensa([], new AbortController().signal))).at(-1), { tipo: 'uso', costoUsd: null, tokens: { entrada: 1000, salida: 100, cacheados: 0 } });
  const sinUso = creaCerebroCompat({ llave: LLAVE, modelo: 'm/x-1', sistema: '', fetch: fetchFalso([trozo('ok')]) });
  assert.deepEqual((await junta(sinUso.piensa([], new AbortController().signal))).at(-1), { tipo: 'uso', costoUsd: null });
});

test('un error HTTP o a medio flujo se lanza sin la llave', async () => {
  const malo = creaCerebroCompat({ llave: LLAVE, modelo: 'm/x-1', sistema: '', fetch: fetchFalso([], 402) });
  await assert.rejects(junta(malo.piensa([], new AbortController().signal)), (e: Error) => e.message.includes('402') && !e.message.includes(LLAVE));
  const corta = creaCerebroCompat({ llave: LLAVE, modelo: 'm/x-1', sistema: '', fetch: fetchFalso([trozo('a'), `data: ${JSON.stringify({ error: { message: `límite ${LLAVE}` } })}`]) });
  await assert.rejects(junta(corta.piensa([], new AbortController().signal)), (e: Error) => e.message.includes('cortó') && !e.message.includes(LLAVE));
});

test('el modelo va pineado: un alias que cambia solo se rechaza al crear', () => {
  for (const modelo of ['anthropic/claude-latest', 'x/y:preview', '']) {
    assert.throws(() => creaCerebroCompat({ llave: LLAVE, modelo, sistema: '', fetch }), /pineado/);
  }
  assert.throws(() => creaCerebroCompat({ llave: '', modelo: 'a/b', sistema: '', fetch }), /llave/);
});

test('leeSse junta líneas partidas entre trozos', async () => {
  const datos: string[] = [];
  for await (const d of leeSse(flujo(['data: {"a":1}', 'event: x', 'data: {"b":2}', 'data: [DONE]']))) datos.push(d);
  assert.deepEqual(datos, ['{"a":1}', '{"b":2}']);
});
