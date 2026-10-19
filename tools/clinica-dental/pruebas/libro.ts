/**
 * El libro de eventos (lazos l-cadena y l-contrato): la cadena re-verifica; alterar, quitar, reordenar o
 * reescribir entera se detecta y dice DONDE; un evento fuera de contrato no entra; JCS y Merkle cumplen sus RFC.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonico, creaLibro, firmaSello, hashDeEslabon, libroEnMemoria, llavesSello, raizDeHashes, TIPOS_EVENTO, verificaLibro, verificaSello, type Eslabon } from '../dist/servidor.js';
import { alta, banco, instante, PACIENTES } from './_banco.ts';

/** Un libro real: los 8 pacientes sinteticos registrados, con citas, avisos, baja y Telegram. */
async function libroLleno() {
  const b = banco();
  for (const p of PACIENTES.pacientes) {
    await alta(b, p);
    await b.portal.reserva({ clinica: p.clinica, usuario: `usr-${p.id}`, servicio: p.cita.servicio, inicio: instante(p.cita.diasAdelante, p.cita.choqueCon ? (p.cita.alternativa ?? p.cita.hora) : p.cita.hora), canales: p.cita.canales, newsletter: p.cita.newsletter, clave: 'c' });
  }
  await b.portal.despacha();
  return b;
}

test('JCS (RFC 8785): mismo objeto en otro orden = mismos bytes; sin espacios; números en su forma más corta', () => {
  assert.equal(canonico({ b: 1, a: [true, null, 'ñ'], c: { z: 1.5, y: 1e21 } }), '{"a":[true,null,"ñ"],"b":1,"c":{"y":1e+21,"z":1.5}}');
  assert.equal(canonico({ a: 1, b: 2 }), canonico({ b: 2, a: 1 }));
  assert.throws(() => canonico({ x: Number.NaN }), /no finito/);
});

test('Merkle (RFC 6962): la raíz de una lista vacía es SHA-256 de nada; cambia con cualquier hoja', () => {
  // Con su prefijo `sha256:`: 64 hex sueltos tienen forma de llave para `audita:secretos` (falso rojo del 16/10).
  assert.equal(raizDeHashes([]), 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'.slice('sha256:'.length));
  const h = ['a', 'b', 'c'].map((x) => x.repeat(64).slice(0, 64).replace(/[^0-9a-f]/g, '0'));
  assert.notEqual(raizDeHashes(h), raizDeHashes([h[0]!, h[2]!, h[1]!]));
});

test('el libro lleno re-verifica: secuencia, enlaces, hashes y contrato', async () => {
  const b = await libroLleno();
  for (const c of ['maguey', 'colibri']) {
    const v = await b.libro.verifica(c);
    assert.ok(v.ok, JSON.stringify(v));
    assert.ok(v.n > 20);
  }
});

async function cadena(): Promise<Eslabon[]> {
  const b = await libroLleno();
  return b.almacenLibro.todos.get('maguey')!;
}

test('ALTERAR un campo de un evento ya encadenado se detecta y dice en qué eslabón', async () => {
  const es = structuredClone(await cadena());
  const i = es.findIndex((e) => e.evento.tipo === 'cita_confirmada');
  (es[i]!.evento as { inicio: string }).inicio = '2026-12-24T18:00:00.000Z';
  const v = verificaLibro(es);
  assert.ok(!v.ok);
  assert.equal(v.fallo, 'alterado');
  assert.equal(v.seq, i + 1);
  assert.match(v.detalle, new RegExp(`eslabón ${i + 1} \\(cita_confirmada\\)`));
});

test('QUITAR un evento de en medio se detecta como hueco en la secuencia', async () => {
  const es = structuredClone(await cadena());
  es.splice(4, 1);
  const v = verificaLibro(es);
  assert.ok(!v.ok);
  assert.equal(v.fallo, 'quitado');
  assert.equal(v.seq, 5);
});

test('REORDENAR dos eventos se detecta y dice la posición', async () => {
  const es = structuredClone(await cadena());
  [es[6], es[7]] = [es[7]!, es[6]!];
  const v = verificaLibro(es);
  assert.ok(!v.ok);
  assert.equal(v.fallo, 'reordenado');
  assert.equal(v.posicion, 7);
});

test('QUITAR y RENUMERAR (recalcular la cadena desde ahí) rompe el enlace con el anterior', async () => {
  const es = structuredClone(await cadena()).filter((_, i) => i !== 3).map((e, i) => ({ ...e, seq: i + 1 }));
  const v = verificaLibro(es);
  assert.ok(!v.ok);
  assert.equal(v.fallo, 'enlace');
  assert.equal(v.seq, 4);
});

test('REESCRIBIR la cadena ENTERA (hashes recalculados) la delata el sello firmado', async () => {
  const b = await libroLleno();
  const { privada, publica } = llavesSello();
  const sello = await b.libro.sella('maguey', firmaSello(privada));
  assert.ok(sello);
  assert.ok((await b.libro.verifica('maguey', verificaSello(publica))).ok);
  const es = structuredClone(b.almacenLibro.todos.get('maguey')!);
  const i = es.findIndex((e) => e.evento.tipo === 'paciente_registrado');
  (es[i]!.evento as { segundos_registro?: number | null }).segundos_registro = 1;
  let anterior = '0'.repeat(64);
  const recalculada = es.map((e) => {
    const resto: Omit<typeof e, 'hash'> & { hash?: string } = { ...e, anterior };
    delete resto.hash;
    const nuevo = { ...resto, hash: hashDeEslabon(resto) };
    anterior = nuevo.hash;
    return nuevo;
  });
  assert.ok(verificaLibro(recalculada).ok, 'sin sello, una reescritura completa pasa: por eso existe el sello');
  const v = verificaLibro(recalculada, [sello], verificaSello(publica));
  assert.ok(!v.ok && v.fallo === 'sello');
  assert.match(v.detalle, /se reescribió/);
  const falsificado = { ...sello, raiz: 'f'.repeat(64) };
  const vf = verificaLibro(b.almacenLibro.todos.get('maguey')!, [falsificado], verificaSello(publica));
  assert.ok(!vf.ok && vf.fallo === 'sello' && /firma/.test(vf.detalle));
});

test('un evento FUERA DE CONTRATO no entra al libro (campo de más con un nombre, seudónimo malformado)', async () => {
  const libro = creaLibro({ almacen: libroEnMemoria(), reloj: () => Date.parse('2026-10-19T14:00:00Z') });
  const sujeto = `pac_${'a'.repeat(20)}`;
  await assert.rejects(libro.registra({ clinica: 'maguey', tipo: 'newsletter_baja', sujeto, via: 'portal', nombre: 'Ameyalli' } as never, 'x'));
  await assert.rejects(libro.registra({ clinica: 'maguey', tipo: 'newsletter_baja', sujeto: 'ameyalli@pacientes.example', via: 'portal' } as never, 'y'));
  const ok = await libro.registra({ clinica: 'maguey', tipo: 'newsletter_baja', sujeto, via: 'portal' }, 'z');
  assert.equal(ok.v, 2, 'contrato v2 (WhatsApp)');
  assert.equal((await libro.eventos('maguey')).length, 1);
});

test('registrar es idempotente por clave: un reintento no agrega un eslabón', async () => {
  const libro = creaLibro({ almacen: libroEnMemoria(), reloj: () => 0 });
  const e = { clinica: 'colibri', tipo: 'telegram_vinculado' as const, sujeto: `pac_${'b'.repeat(20)}` };
  const [a, c] = await Promise.all([libro.registra(e, 'k'), libro.registra(e, 'k')]);
  assert.equal(a.id, c.id);
  assert.equal((await libro.eventos('colibri')).length, 1);
});

test('el contrato declara cada tipo una vez y todos los del núcleo aparecen en el libro lleno', async () => {
  assert.equal(new Set(TIPOS_EVENTO).size, TIPOS_EVENTO.length);
  const b = await libroLleno();
  const vistos = new Set([...(await b.libro.eventos('maguey')), ...(await b.libro.eventos('colibri'))].map((e) => e.tipo));
  for (const t of ['paciente_registrado', 'consentimiento_otorgado', 'cita_solicitada', 'cita_confirmada', 'aviso_programado', 'aviso_enviado', 'aviso_entregado', 'aviso_fallido']) {
    assert.ok(vistos.has(t as never), `falta ${t}`);
  }
});
