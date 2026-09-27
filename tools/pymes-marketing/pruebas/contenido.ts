/** Pruebas de contenido: brief de 30 días, calendario vivo y pieza SVG. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactorDePlantillas, VOZ_NEUTRA, sinDatos } from '../dist/index.js';
import { ventasDesdeCsv, resumeVentas } from '../dist/ventas/index.js';
import { capturaDeDescripcion, confirmaMarca } from '../dist/marca/index.js';
import { estrategiaDe30Dias, briefEnTexto, calendarioDe30Dias, extiendeCalendario, estadoDelCalendario, marcaFila, piezaSvg } from '../dist/contenido/index.js';

function ventasDemo() {
  const filas = ['fecha,producto,cantidad,importe'];
  const productos: [string, number, number, number][] = [
    ['Concha', 12, 30, 45], ['Pan de muerto', 45, 2, 14], ['Bolillo', 3, 80, 82], ['Pastel tres leches', 380, 2, 1],
    ['Cuernito', 14, 12, 6], ['Café de olla', 25, 10, 11], ['Galletas de nata', 8, 1, 1],
  ];
  for (let d = 0; d < 91; d++) {
    const dia = new Date(Date.UTC(2026, 6, 20 + d)).toISOString().slice(0, 10);
    for (const [p, precio, antes, ahora] of productos) {
      const n = d >= 61 ? ahora : antes;
      if (n > 0) filas.push(`${dia},${p},${n},${n * precio}`);
    }
  }
  return ventasDesdeCsv(filas.join('\n'));
}

const marca = confirmaMarca(capturaDeDescripcion('verde bosque y crema', 'Panadería La Espiga'));

test('brief de 30 días: estructura de la fuente, cifras reales, temporada de México y lo que falta', () => {
  const r = resumeVentas(ventasDemo());
  const e = estrategiaDe30Dias(r, '2026-10-19');
  assert.equal(e.ventas, 'ok');
  assert.ok(e.empujar.length >= 2 && e.empujar.length <= 3);
  assert.equal(e.empujar[0]!.producto, 'Pan de muerto', 'Día de Muertos manda en la ventana');
  assert.ok(e.empujar[0]!.fecha?.nombre === 'Día de Muertos');
  assert.ok(e.reposicionar.some((x) => x.producto === 'Cuernito'), 'cayó 50%: se reposiciona');
  assert.ok(e.faltantes.some((f) => /inventario no verificado/.test(f)));
  assert.ok(e.faltantes.some((f) => /margen/.test(f)));
  const palabras = briefEnTexto(e).split(/\s+/).filter(Boolean).length;
  assert.ok(palabras >= 150 && palabras <= 450, `el brief mide ${palabras} palabras`);
  assert.match(briefEnTexto(e), /## Empujar fuerte[\s\S]*## Mantener[\s\S]*## Reposicionar o pausar[\s\S]*## Temporada/);
});

test('brief sin ventas: no inventa productos, deja la temporada y dice qué falta', () => {
  const e = estrategiaDe30Dias(sinDatos('no hay ventas cargadas'), '2026-11-01');
  assert.equal(e.ventas, 'sin-datos');
  assert.equal(e.empujar.length, 0);
  assert.ok(e.temporada.some((t) => t.fecha.nombre === 'El Buen Fin' && t.porConfirmar), 'sin catálogo, la temporada se marca por confirmar');
});

test('calendario: 2 por semana, reuso apuntando al origen, 40/30/20/10, nada aprobado ni publicado', async () => {
  const e = estrategiaDe30Dias(resumeVentas(ventasDemo()), '2026-10-19');
  const filas = await calendarioDe30Dias(e, marca, redactorDePlantillas(), { precios: { 'pan de muerto': 45 } });
  const origenes = filas.filter((f) => f.origen === null);
  assert.equal(origenes.length, 9, '30 días a 2 por semana (martes y viernes) desde un lunes');
  assert.ok(filas.filter((f) => f.origen !== null).every((f) => filas.some((o) => o.id === f.origen)), 'cada reuso apunta a una pieza que existe');
  assert.ok(filas.every((f) => f.estado === 'borrador' || f.estado === 'falta-algo'), 'nada nace aprobado');
  assert.ok(origenes.some((f) => f.angulo === 'oferta') && origenes.some((f) => f.angulo === 'util') && origenes.some((f) => f.angulo === 'prueba'));
  const prueba = filas.find((f) => f.angulo === 'prueba')!;
  assert.equal(prueba.estado, 'falta-algo', 'la prueba social necesita un pedido real: no se inventa');
  assert.match(prueba.texto, /POR COMPLETAR/);
  const conPrecio = filas.find((f) => f.producto === 'Pan de muerto' && f.angulo === 'oferta')!;
  assert.match(conPrecio.texto, /\$45\.00/);
  assert.ok(filas.filter((f) => f.angulo === 'oferta' && f.producto !== 'Pan de muerto').every((f) => !/\$\d/.test(f.texto)), 'sin precio confirmado no se escribe precio');
  const ig = filas.find((f) => f.canal === 'instagram' && f.angulo === 'oferta')!;
  assert.ok((ig.texto.match(/#/g) ?? []).length >= 3, 'IG lleva 3 a 5 hashtags');
  assert.ok(!filas.find((f) => f.canal === 'whatsapp')!.texto.includes('#'), 'el estado de WhatsApp no lleva hashtags');
  assert.ok(filas.every((f) => f.pieza?.startsWith('<svg')));
});

test('calendario: se extiende sin rehacer y el estado dice dónde empieza el hueco', async () => {
  const e1 = estrategiaDe30Dias(resumeVentas(ventasDemo()), '2026-10-19');
  const primero = await calendarioDe30Dias(e1, marca, redactorDePlantillas());
  const aprobado = primero.map((f, i) => (i === 0 ? marcaFila(f, 'aprobada') : f));
  const e2 = estrategiaDe30Dias(resumeVentas(ventasDemo()), '2026-11-02');
  const extendido = extiendeCalendario(aprobado, await calendarioDe30Dias(e2, marca, redactorDePlantillas()));
  assert.equal(extendido[0]!.estado, 'aprobada', 'lo aprobado se queda');
  assert.equal(new Set(extendido.map((f) => f.id)).size, extendido.length, 'sin filas duplicadas');
  const estado = estadoDelCalendario(extendido, '2026-10-19');
  assert.equal(estado.aprobadas, 1);
  assert.ok(estado.huecoDesde > '2026-11-30');
});

test('pieza SVG: determinista, escapa el texto y respeta el formato', () => {
  const a = piezaSvg(marca, { titular: 'Pan <script>alert(1)</script> & café', precio: '$45.00', formato: 'historia', semilla: 'x' });
  assert.equal(a, piezaSvg(marca, { titular: 'Pan <script>alert(1)</script> & café', precio: '$45.00', formato: 'historia', semilla: 'x' }));
  assert.ok(!a.includes('<script>'));
  assert.match(a, /viewBox="0 0 1080 1920"/);
  assert.match(piezaSvg(marca, { titular: 'Hola', formato: 'horizontal', semilla: 'y' }), /viewBox="0 0 1200 630"/);
  assert.ok(VOZ_NEUTRA.muestras === 0);
});
