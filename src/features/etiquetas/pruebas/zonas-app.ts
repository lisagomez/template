/**
 * Escanear por zona del lado de la APP, por el mismo camino que el route handler (`permitida` +
 * `ejecuta` / `leeEstado`) sobre la semilla ficticia en una carpeta temporal:
 *
 * - la matriz de roles: cada codigo pide solo lo suyo, lo demas es 403;
 * - el servidor rechaza la zona que no es del rol aunque la pantalla la mande;
 * - el ALMACENISTA no recibe NINGUNA cantidad del sistema: se mete un lote CENTINELA de 137 cajas
 *   y ese numero no aparece en ninguna respuesta suya (estado, escaneos, ronda, conteos);
 * - la cola sin señal: el mismo `idCliente` no se aplica dos veces.
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { aAammdd, altaConExpediente, completaClave, sumaDiasIso, ubica } from '../services/nucleo.ts';
import { esquemaAccion, type AccionEtiquetas } from '../services/esquemas.ts';
import { ejecuta, leeEstado } from '../services/servidor/acciones.ts';
import { almacenDelServidor, hoyIso } from '../services/servidor/almacen.ts';
import { ACCIONES_DEL_ROL, permitida, subeFotos, type Rol } from '../services/servidor/roles.ts';

process.env['ETIQUETAS_DATOS'] = await mkdtemp(join(tmpdir(), 'etiquetas-zonas-'));
process.env['ETIQUETAS_SEMILLA'] = 'ficticia';

const CENTINELA = 137;
const G_CHO = completaClave('1952111100006');
const HOY = hoyIso();
const CADUCA = sumaDiasIso(HOY, 200);
const cajaCho = `(01)${G_CHO}(17)${aAammdd(CADUCA)}(10)SENT137`;

/** Lo que haria el route handler: Zod, rol, y la accion. */
async function pide(rol: Rol, a: AccionEtiquetas, operador = 'Almacenista Uno'): Promise<{ status: number; cuerpo: unknown }> {
  const v = esquemaAccion.safeParse(a);
  if (!v.success) return { status: 400, cuerpo: { error: v.error.issues[0]?.message } };
  if (!permitida(rol, v.data.accion)) return { status: 403, cuerpo: { error: 'no permitido' } };
  return ejecuta(v.data, operador, rol);
}
const id = (n: number) => `prueba-zona-${String(n).padStart(4, '0')}`;
const escanea = (sitio: string, zona: 'recibo' | 'almacen' | 'piso' | 'merma', texto: string, n: number, extra: Record<string, unknown> = {}) => ({ accion: 'escanea' as const, sitio, zona, texto, idCliente: id(n), ...extra }) as AccionEtiquetas;

async function glnDe(sitio: string): Promise<string> {
  return (await almacenDelServidor().lee()).configuracion.sitios.find((s) => s.clave === sitio)!.gln!;
}

test('matriz de roles: cada codigo pide solo lo suyo', () => {
  const todas = esquemaAccion.options.map((o) => (o.shape as { accion: { value: string } }).accion.value);
  for (const a of todas) assert.equal(permitida('operacion', a), true, `el supervisor puede ${a}`);
  for (const rol of ['recibo', 'almacenista', 'conteo'] as const) assert.deepEqual(todas.filter((a) => permitida(rol, a)).sort(), [...ACCIONES_DEL_ROL[rol]].sort(), rol);
  for (const a of ['dia', 'conteo-abre', 'conteo-aplica', 'conteo-cancela', 'recepcion', 'lee-caducidad', 'revision-confirma', 'lotes', 'expediente', 'config', 'correccion', 'movimiento']) assert.equal(permitida('almacenista', a), false, `almacenista: ${a}`);
  for (const a of ['dia', 'conteo-abre', 'conteo-aplica', 'conteo-lee', 'identifica-pieza', 'registra-hallazgo', 'movimiento', 'lotes']) assert.equal(permitida('recibo', a), false, `recibo: ${a}`);
  for (const a of ['escanea', 'deshaz', 'ronda', 'dia']) assert.equal(permitida('conteo', a), false, `conteo: ${a}`);
  assert.equal(permitida('almacenista', 'conteo-lee'), true);
  // La subida de fotos va por su propia ruta: la pieza suelta (almacenista) y la recepcion con foto (recibo) la necesitan.
  assert.deepEqual((['operacion', 'recibo', 'almacenista', 'conteo'] as const).map(subeFotos), [true, true, true, false]);
  assert.equal(permitida('recibo', 'recepcion'), true);
});

test('el servidor rechaza la zona que no es del rol, aunque la pantalla la mande', async () => {
  const r1 = (await pide('almacenista', escanea('SUC-CENTRO', 'recibo', cajaCho, 1))).cuerpo as { vista: { tipo: string; titulo: string } };
  assert.equal(r1.vista.tipo, 'error');
  assert.match(r1.vista.titulo, /no opera en recibo/);
  const r2 = (await pide('recibo', escanea('SUC-CENTRO', 'piso', cajaCho, 2), 'Recibo Uno')).cuerpo as { vista: { tipo: string; titulo: string } };
  assert.equal(r2.vista.tipo, 'error');
  assert.match(r2.vista.titulo, /no opera en piso/);
  const r3 = (await pide('recibo', escanea('SUC-CENTRO', 'recibo', `(414)${await glnDe('SUC-CENTRO')}(254)PISO`, 3), 'Recibo Uno')).cuerpo as { vista: { tipo: string } };
  assert.equal(r3.vista.tipo, 'error', 'ni siquiera fija la zona de piso con su etiqueta');
  assert.equal((await pide('conteo', escanea('SUC-CENTRO', 'almacen', cajaCho, 4))).status, 403);
});

test('el almacenista no recibe NINGUNA cantidad del sistema: el centinela de 137 cajas no aparece', async () => {
  await almacenDelServidor().transaccion((e) => {
    const p = altaConExpediente(e, { sitio: 'SUC-CENTRO', sku: 'CHO-021', gtin: G_CHO, lote: 'SENT137', caducidad: CADUCA, cantidad: CENTINELA, zona: 'almacen' }, 'recepcion', new Date().toISOString(), 'centinela', 'op-prueba001');
    assert.ok(p.resultado.ok);
    const u = ubica(p.estado, 'SUC-CENTRO', { gtin: G_CHO, lote: 'SENT137', caducidad: CADUCA }, 'B-03-1', new Date().toISOString(), 'op-prueba001');
    assert.ok(u.resultado.ok);
    return { estado: u.estado, resultado: null };
  });
  const sup = JSON.stringify((await leeEstado('operacion')).cuerpo);
  assert.ok(new RegExp(`"cantidad":${CENTINELA}\\b`).test(sup), 'el supervisor sí lo ve (la prueba no es trivial)');
  const gln = await glnDe('SUC-CENTRO');
  const visto: unknown[] = [];
  const pideA = async (a: AccionEtiquetas) => { const r = await pide('almacenista', a); visto.push(r.cuerpo); return r.cuerpo as { ok?: boolean; vista?: { tipo: string; deshacer?: string; lote?: { lote: string } } }; };
  const estado = (await leeEstado('almacenista')).cuerpo as { existencias: unknown[]; lotes: { lote: string }[] };
  visto.push(estado);
  assert.deepEqual(estado.existencias, []);
  assert.ok(estado.lotes.some((l) => l.lote === 'SENT137'), 'sí ve el lote (sin cuántas cajas)');
  assert.equal((await pideA(escanea('SUC-CENTRO', 'almacen', `(414)${gln}(254)ALMACEN-B-03-1`, 10))).vista?.tipo, 'zona');
  assert.equal((await pideA(escanea('SUC-CENTRO', 'almacen', cajaCho, 11, { posicion: 'B-03-1' }))).vista?.lote?.lote, 'SENT137');
  const sube = await pideA(escanea('SUC-CENTRO', 'piso', cajaCho, 12, { todas: true }));
  assert.equal(sube.vista?.tipo, 'movido', 'sube TODAS a piso sin decir cuántas');
  const des = await pideA({ accion: 'deshaz', sitio: 'SUC-CENTRO', evento: sube.vista!.deshacer! });
  assert.equal(des.ok, true, 'deshacer es una corrección');
  const demasiadas = (await pideA(escanea('SUC-CENTRO', 'piso', cajaCho, 13, { veces: 500 }))) as { vista: { tipo: string; detalle: string[] } };
  assert.equal(demasiadas.vista.tipo, 'error', 'pedir más de las que hay es un error…');
  assert.match(demasiadas.vista.detalle.join(' ') + JSON.stringify(demasiadas.vista), /suficientes|cajas/, '…que no dice cuántas hay');
  assert.equal((await pideA(escanea('SUC-CENTRO', 'piso', cajaCho, 16, { veces: 3 }))).vista?.tipo, 'movido');
  assert.equal((await pideA(escanea('SUC-CENTRO', 'merma', cajaCho, 14, { motivo: 'dañado' }))).vista?.tipo, 'merma');
  assert.equal((await pideA(escanea('SUC-CENTRO', 'piso', `]E0${completaClave('952111100006')}`, 15))).vista?.tipo, 'pieza-suelta');
  await pideA({ accion: 'ronda', sitio: 'SUC-CENTRO' });
  await pideA({ accion: 'conteos' });
  const todo = JSON.stringify(visto);
  assert.ok(!new RegExp(`\\b${CENTINELA}\\b`).test(todo), `el ${CENTINELA} no sale en ninguna respuesta del almacenista`);
  for (const k of ['"cantidad"', '"esperado"', '"conciliacion"', '"diferencia"', '"cajas"']) assert.ok(!todo.includes(k), `ninguna respuesta lleva ${k}`);
});

test('la cola sin señal: el mismo idCliente no se aplica dos veces', async () => {
  const gln = await glnDe('SUC-CENTRO');
  await pide('almacenista', escanea('SUC-CENTRO', 'almacen', `(414)${gln}(254)ALMACEN-B-03-1`, 20));
  const antes = (await almacenDelServidor().lee()).eventos?.['SUC-CENTRO']?.length ?? 0;
  const a = escanea('SUC-CENTRO', 'piso', `(01)19521111000010(17)${aAammdd(sumaDiasIso(HOY, 8))}(10)L4502`, 21);
  const r1 = (await pide('almacenista', a)).cuerpo as { vista: { tipo: string }; repetido?: boolean };
  const r2 = (await pide('almacenista', a)).cuerpo as { vista: { tipo: string }; repetido?: boolean };
  const despues = (await almacenDelServidor().lee()).eventos?.['SUC-CENTRO']?.length ?? 0;
  assert.equal(r1.vista.tipo, 'movido');
  assert.equal(r2.repetido, true, 'el reintento devuelve la respuesta guardada');
  assert.deepEqual(r2.vista, r1.vista);
  assert.ok(despues - antes >= 1 && despues - antes <= 2, 'un MOVIDO (y a lo sumo su cierre de tarea), no dos');
});

test('al recibir, recibo y supervisor ven la foto del inventario (antes → después); y queda en el RECIBIDO', async () => {
  const gln = await glnDe('SUC-CENTRO');
  await pide('recibo', escanea('SUC-CENTRO', 'recibo', `(414)${gln}(254)RECIBO`, 30), 'Recibo Uno');
  const texto = `(01)19521111000010(17)${aAammdd(sumaDiasIso(HOY, 34))}(10)ZINV1`;
  const r = (await pide('recibo', escanea('SUC-CENTRO', 'recibo', texto, 31, { veces: 6 }), 'Recibo Uno')).cuerpo as { vista: { tipo: string; inventario?: { antes: { lote: number; articulo: number }; despues: { lote: number; articulo: number } } } };
  assert.equal(r.vista.tipo, 'recibido');
  const inv = r.vista.inventario!;
  assert.deepEqual([inv.antes.lote, inv.despues.lote], [0, 6]);
  assert.equal(inv.despues.articulo - inv.antes.articulo, 6, 'el artículo sube lo que se recibió');
  const otra = (await pide('operacion', { accion: 'recepcion', sitio: 'SUC-CENTRO', texto }, 'Supervisor')).cuerpo as { ok: boolean; inventario?: typeof inv };
  assert.ok(otra.ok);
  assert.deepEqual([otra.inventario?.antes.lote, otra.inventario?.despues.lote], [6, 7], 'la segunda recepción del lote parte de lo que dejó la primera');
  const ev = (await almacenDelServidor().lee()).eventos!['SUC-CENTRO']!.at(-1)!;
  assert.deepEqual(ev.datos['existencia'], otra.inventario, 'y es lo que quedó en la cadena');
});
