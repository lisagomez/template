/**
 * Logica pura de /etiquetas: editor, arreglos de un clic, etiquetas por lote y la semilla de
 * demostracion (ficticia) con su tablero. `node --test src/features/etiquetas/pruebas/*.ts`
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aManual, aplicaAlEditor, calcula, EDITOR_INICIAL, simbolosDelEditor, type EstadoEditor } from '../services/editor.ts';
import { zplDeLote } from '../services/lote.ts';
import { resumenLegible, gtinLegible } from '../services/presenta.ts';
import { semillaFicticia, IMPRESORAS_DEMO, VENTAS_DEMO } from '../services/servidor/semilla.ts';
import { resumenPresupuesto } from '../services/nucleo.ts';
import { CATEGORIAS_EJEMPLO, clasificaPrefijo, evaluaRiesgo, integridadLocal, PERFIL_EJEMPLO, tableroSitio, ventasFicticias, verificaTransferencias, type Arreglo } from '../services/nucleo.ts';

const HOY = '2026-09-25';
const caja: EstadoEditor = { ...EDITOR_INICIAL, producto: 'Yogurt natural 1 kg', gtin: '09521234000021', lote: 'L4471', caducidad: '2026-10-30', categoria: 'lacteos', sitio: 'CEDIS-NTE' };

test('editor: el digito malo se corrige desde la revision y vuelve al campo GTIN', () => {
  const r = calcula(caja, PERFIL_EJEMPLO, CATEGORIAS_EJEMPLO, HOY);
  assert.ok(!('error' in r));
  const p = r.revision.puntos.find((x) => x.id === 'digitos')!;
  assert.equal(p.estado, 'error');
  const arreglado = aplicaAlEditor(caja, r.simbolos, p.arreglo as Arreglo);
  assert.equal(arreglado.gtin, '09521234000020');
  assert.equal(arreglado.manual, null);
  const r2 = calcula(arreglado, PERFIL_EJEMPLO, CATEGORIAS_EJEMPLO, HOY);
  assert.ok(!('error' in r2) && !r2.revision.bloquea);
});

test('editor: cadena a mano con el lote en medio; «mover lote al final» la reordena', () => {
  const m: EstadoEditor = { ...caja, manual: '(01)09521234000020(10)L4471(17)261030' };
  const r = calcula(m, PERFIL_EJEMPLO, CATEGORIAS_EJEMPLO, HOY);
  assert.ok(!('error' in r));
  const p = r.revision.puntos.find((x) => x.id === 'lote')!;
  assert.equal(p.estado, 'aviso');
  assert.equal(aplicaAlEditor(m, r.simbolos, p.arreglo!).manual, '(01)09521234000020(17)261030(10)L4471');
});

test('editor: la tarima sale en dos codigos y el SSCC va solo', () => {
  const t: EstadoEditor = { ...caja, tipo: 'tarima', gtin: '19521111000010', sscc: '095212340000000013', cantidad: 50 };
  const s = simbolosDelEditor(t);
  assert.ok(s.ok);
  assert.deepEqual(s.simbolos.map((x) => x.map((e) => e.ai)), [['02', '37', '17', '10'], ['00']]);
  assert.equal(aManual(t).manual, '(02)19521111000010(37)50(17)261030(10)L4471\n(00)095212340000000013');
});

test('lote: una etiqueta por articulo; si una no pasa la revision, se dice cual', () => {
  const e = semillaFicticia(HOY);
  const arts = [e.articulos['YOG-001']!, { ...e.articulos['REF-007']!, gtinCaja: '19521111000042' }];
  const r = zplDeLote(arts, { sitio: 'CEDIS-NTE', lote: 'L9', caducidad: '2026-12-01', copias: 2 }, IMPRESORAS_DEMO[1]!, CATEGORIAS_EJEMPLO, HOY);
  assert.deepEqual(r.etiquetas.map((x) => [x.sku, x.bloquea]), [['YOG-001', false], ['REF-007', true]]);
  assert.equal((r.zpl.match(/\^XA/g) ?? []).length, 1);
  assert.match(r.zpl, /\^PQ2,0,1,Y/);
});

test('semilla: todo ficticio (prefijo 952), cinco colores en Centro y el FEFO sin vencidos ni rojos', () => {
  const e = semillaFicticia(HOY);
  for (const a of Object.values(e.articulos)) for (const g of [a.gtinUnidad, a.gtinCaja]) if (g && !g.startsWith('004')) assert.equal(clasificaPrefijo(g).clase, 'demostracion', `${a.sku} ${g}`);
  assert.ok(e.configuracion.prefijoEmpresa.startsWith('952'));
  const cedis = tableroSitio(e, 'CEDIS-NTE', HOY);
  const centro = tableroSitio(e, 'SUC-CENTRO', HOY);
  assert.ok(Object.values(centro.totales).every((n) => n > 0), JSON.stringify(centro.totales));
  for (const t of [cedis, centro]) {
    assert.ok(t.totales.vencido > 0 && t.totales.retiro > 0 && t.totales.alerta > 0 && t.totales.vigente > 0, JSON.stringify(t.totales));
    assert.ok(t.fefo.every((g) => g.lotes.every((l) => l.estado !== 'vencido' && l.estado !== 'retiro')), 'el FEFO no surte vencidos ni rojos');
  }
  const yog = cedis.fefo.find((g) => g.sku === 'YOG-001')!;
  assert.deepEqual(yog.lotes.map((l) => l.existencia.lote), ['L4502', 'L4471']);
});

test('semilla: el inventario entra por la cadena (proyeccion = estado en cada sitio), con un rechazo 2/3 y un lote verde en riesgo', () => {
  const e = semillaFicticia(HOY);
  for (const s of e.configuracion.sitios) assert.deepEqual(integridadLocal(e, s.clave), { ok: true, diferencias: [] }, s.clave);
  assert.deepEqual(verificaTransferencias(e.eventos!), []);
  assert.match(e.devoluciones![0]!.regla, /regla de 2\/3: con 180 días de vida útil debe llegar con al menos 120/);
  const r = evaluaRiesgo(e, 'SUC-PONIENTE', HOY, ventasFicticias(VENTAS_DEMO));
  assert.deepEqual(r.map((x) => [x.lote.lote, x.semaforo, x.recomendacion.accion, x.recomendacion.destino]), [['SUC03-L4471', 'vigente', 'transferir', 'SUC-CENTRO']]);
  assert.ok(Object.values(e.eventos!).flat().every((x) => /^(op-[0-9a-f]{8}|op-apertura|agente-riesgo)$/.test(x.operador)), 'la cadena no lleva nombres, solo seudonimos');
});

test('presenta: resumen legible de una importacion y GTIN a ojo', () => {
  const r = resumenLegible({ nuevo: 3, 'asignado:propio': 2, 'registrado:fabricante': 4, conflicto: 0 });
  assert.deepEqual(r.map((x) => x.texto), ['nuevos', 'asignados · Marca propia: asignado con el prefijo de la casa', 'registrados · Del fabricante (se conserva)']);
  assert.equal(gtinLegible('09521234000020'), '0 9521234 00002 0');
});

test('rollos de la semilla: el ritmo del mes rebasa lo presupuestado en CEDIS, y Poniente se ve «sin costo», no en cero', () => {
  const e = semillaFicticia(HOY);
  const c = e.consumibles!;
  const [cedis, centro, poniente, oriente] = resumenPresupuesto(c, ['CEDIS-NTE', 'SUC-CENTRO', 'SUC-PONIENTE', 'SUC-ORIENTE'], HOY.slice(0, 7), HOY);
  assert.ok(cedis!.gasto > 0 && cedis!.proyeccion > cedis!.gasto);
  assert.ok(['aviso', 'excedido'].includes(cedis!.estado), cedis!.estado);
  assert.ok(centro!.gasto > 0);
  assert.equal(poniente!.gasto, 0);
  assert.ok(poniente!.etiquetasSinCosto > 0);
  assert.equal(poniente!.estado, 'incompleto');
  assert.equal(oriente!.estado, 'sin-presupuesto');
  assert.equal(c.escenarios[0]!.id, 'dulceria-ejemplo');
});

test('zonas de la semilla: en Sucursal Centro se retira del anaquel lo vencido, lo de retiro y lo que vence esta semana', () => {
  const e = semillaFicticia(HOY);
  const t = tableroSitio(e, 'SUC-CENTRO', HOY);
  assert.deepEqual(t.anaquel.map((f) => f.existencia.lote).sort(), ['L0920', 'P0077', 'Q0009']);
  assert.ok(t.anaquel.every((f) => f.zona === 'piso'));
  assert.ok(t.resurtido.every((g) => g.lotes.every((l) => l.zona === 'almacen' || l.zona === 'recibo')));
  assert.ok(e.configuracion.sitios.every((s) => s.gln && clasificaPrefijo('0' + s.gln).clase === 'demostracion'));
});
