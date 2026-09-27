/** Pruebas de la generación de contenido visual: formatos, revisión, carruseles, video y aprobación. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ventasDesdeCsv, resumeVentas } from '../dist/ventas/index.js';
import { capturaDeDescripcion, confirmaMarca } from '../dist/marca/index.js';
import { estrategiaDe30Dias, disposicion, cajaSegura, FORMATOS, revisaPieza, hayProblemas, carruselDeTemporada, carruselDePaquete, carruselDeTip, piezaSvg } from '../dist/contenido/index.js';
import { escenaDePromo, cuadroSvg, planDeRender, sonidoDeEscena, wavDe, revisaEscena, hojaDeCuadrosSvg } from '../dist/video/index.js';
import { huellaSha256, aprueba, pideCambio, vigencia, csvDelMes } from '../dist/aprobacion/index.js';
import { medidasDeSvg, svgAPng } from '../dist/rasterizar.js';

const marca = confirmaMarca(capturaDeDescripcion('café tostado y crema', 'Panadería La Espiga'));

function brief() {
  const filas = ['fecha,producto,cantidad,importe'];
  for (let d = 0; d < 91; d++) {
    const dia = new Date(Date.UTC(2026, 6, 20 + d)).toISOString().slice(0, 10);
    for (const [p, precio, antes, ahora] of [['Concha', 12, 30, 45], ['Pan de muerto', 45, 2, 14], ['Pastel tres leches', 380, 2, 1], ['Bolillo', 3, 80, 82]] as const) {
      filas.push(`${dia},${p},${d >= 61 ? ahora : antes},${(d >= 61 ? ahora : antes) * precio}`);
    }
  }
  return estrategiaDe30Dias(resumeVentas(ventasDesdeCsv(filas.join('\n'))), '2026-10-19');
}

test('zona segura: en historia 9:16 el titular y el precio caen en la franja central', () => {
  const L = disposicion({ titular: 'Día de Muertos', precio: '$45.00', formato: 'historia', semilla: 's' });
  const caja = cajaSegura(FORMATOS.historia);
  assert.deepEqual([caja.y0, caja.y1], [269, 1248]);
  assert.ok(L.yTitular - L.tamTitular >= caja.y0);
  assert.ok(L.precio && L.precio.y + L.precio.alto <= caja.y1, `precio termina en ${L.precio?.y}+${L.precio?.alto}`);
  assert.deepEqual(revisaPieza(marca, { titular: 'Día de Muertos', precio: '$45.00', formato: 'historia', semilla: 's' }, { canal: 'whatsapp', precioConfirmado: true }), []);
});

test('trampas visuales: texto largo, texto de plantilla, precio sin confirmar y formato de canal', () => {
  const larga = revisaPieza(marca, { titular: 'Pan de muerto relleno de nata con azúcar glass y ajonjolí tostado del día', semilla: 'a' });
  assert.ok(larga.some((o) => o.regla === 'recortado'));
  const plantilla = revisaPieza(marca, { titular: '[POR COMPLETAR: tip]', semilla: 'b' });
  assert.ok(hayProblemas(plantilla) && plantilla.some((o) => o.regla === 'texto-de-plantilla'));
  const precio = revisaPieza(marca, { titular: 'Concha', precio: '$12.00', semilla: 'c' }, { precioConfirmado: false });
  assert.ok(precio.some((o) => o.regla === 'precio-sin-confirmar'));
  const canal = revisaPieza(marca, { titular: 'Concha', formato: 'horizontal', semilla: 'd' }, { canal: 'instagram' });
  assert.ok(canal.some((o) => o.regla === 'formato-de-canal'));
  const gris = revisaPieza({ ...marca, colores: { ...marca.colores, primario: '#dddddd', texto: '#e0e0e0', fondo: '#ffffff' } }, { titular: 'Concha', semilla: 'e' });
  assert.ok(gris.some((o) => o.regla === 'contraste'));
});

test('carruseles: temporada y paquete con datos reales, lámina 1 autocontenida; tip sin puntos no se inventa', () => {
  const e = brief();
  const t = carruselDeTemporada(e, marca, { precios: { 'pan de muerto': 45 }, contacto: 'WhatsApp 222 100 2000' })!;
  assert.equal(t.laminas.length, 4);
  assert.equal(t.laminas[0]!.datos.titular, 'Día de Muertos');
  assert.match(t.laminas[1]!.svg, /\$45\.00/);
  assert.ok(t.laminas.every((l) => /viewBox="0 0 1080 1350"/.test(l.svg)));
  assert.ok(t.laminas.every((l) => !hayProblemas(l.observaciones)), JSON.stringify(t.laminas.map((l) => l.observaciones)));
  const sinPrecio = carruselDeTemporada(e, marca, {})!;
  assert.ok(!sinPrecio.laminas.some((l) => /\$\d/.test(l.svg)));
  assert.ok(sinPrecio.avisos.some((a) => /sin precio confirmado/.test(a)));
  const p = carruselDePaquete(e, marca)!;
  assert.equal(new Set(p.laminas.map((l) => l.datos.titular)).size, p.laminas.length, 'un hueco por producto, sin repetir');
  assert.equal(carruselDeTip('Cómo conservar el pan', ['solo uno'], marca).falta !== null, true);
});

test('video: escena sin personas, en zona segura, determinista cuadro por cuadro, con movimiento', () => {
  const e = escenaDePromo(marca, { titular: 'Día de Muertos', apoyo: 'Pan de muerto', precio: '$45.00', etiqueta: 'Temporada', semilla: 'promo' });
  assert.deepEqual([e.ancho, e.alto, e.fps], [1080, 1920, 30]);
  assert.ok(e.duracion >= 3 && e.duracion <= 8);
  assert.deepEqual(revisaEscena(e), []);
  assert.equal(planDeRender(e).cuadros, e.duracion * 30);
  assert.equal(cuadroSvg(e, 1.5), cuadroSvg(e, 1.5), 'mismo instante, mismo cuadro');
  assert.notEqual(cuadroSvg(e, 0), cuadroSvg(e, e.duracion - 0.1), 'hay movimiento');
  assert.ok(!/<image\b/.test(cuadroSvg(e, 3)));
  assert.ok(!cuadroSvg(e, 0.05).includes('$45.00'), 'al inicio el precio aún no entra');
  assert.ok(cuadroSvg(e, e.duracion - 0.1).includes('$45.00'), 'al final el precio se sostiene');
  assert.match(hojaDeCuadrosSvg(e), /^<svg/);
});

test('video: trampa de persona y de duración, y sonido WAV determinista', async () => {
  const e = escenaDePromo(marca, { titular: 'Concha', semilla: 'x' });
  const conFoto = { ...e, capas: [...e.capas, { ...e.capas[0]!, id: 'foto', tipo: 'foto' as never }] };
  assert.ok(revisaEscena(conFoto).some((o) => o.regla === 'personas'));
  assert.ok(revisaEscena({ ...e, duracion: 20 }).some((o) => o.regla === 'duracion'));
  const w1 = wavDe(sonidoDeEscena(e)), w2 = wavDe(sonidoDeEscena(e));
  assert.equal(new TextDecoder().decode(w1.slice(0, 4)), 'RIFF');
  assert.equal(new DataView(w1.buffer).getUint32(24, true), 48000);
  assert.equal(await huellaSha256(w1), await huellaSha256(w2));
});

test('aprobación: huella del archivo exacto, editar revoca, pedir cambio exige nota, CSV solo de lo vigente y futuro', async () => {
  const svg = piezaSvg(marca, { titular: 'Concha', semilla: '1' });
  const a = await aprueba('2026-10-20-instagram', svg, 1, '2026-10-18T10:00');
  assert.equal(a.huella.length, 64);
  assert.equal(await vigencia(a, svg), 'vigente');
  assert.equal(await vigencia(a, svg.replace('Concha', 'Conchas')), 'revocada');
  await assert.rejects(pideCambio('x', svg, 1, '   ', '2026-10-18'));
  const c = await pideCambio('x', svg, 1, 'cambia el color', '2026-10-18', 2.5);
  assert.equal(c.segundo, 2.5);
  const csv = csvDelMes([
    { dia: '2026-10-20', canal: 'instagram', texto: 'Concha "rica"', archivo: 'a.png', aprobacion: a, vigente: true },
    { dia: '2026-10-21', canal: 'facebook', texto: 'x', archivo: 'b.png', aprobacion: a, vigente: false },
    { dia: '2026-10-10', canal: 'facebook', texto: 'y', archivo: 'c.png', aprobacion: a, vigente: true },
    { dia: '2026-10-22', canal: 'whatsapp', texto: 'z', archivo: 'd.png', aprobacion: c, vigente: true },
  ], '2026-10-18');
  const lineas = csv.split('\n');
  assert.equal(lineas.length, 2, 'solo la aprobada, vigente y en el futuro');
  assert.match(lineas[1]!, /^2026-10-20,12:00,instagram,"Concha ""rica""",a\.png,[0-9a-f]{64},aprobada/);
});

test('rasterizar: dice por qué no corre en Node; lee medidas del SVG', async () => {
  assert.deepEqual(medidasDeSvg(piezaSvg(marca, { titular: 'x', formato: 'historia', semilla: 'y' })), { ancho: 1080, alto: 1920 });
  await assert.rejects(svgAPng('<svg/>', { ancho: 1, alto: 1 }), /navegador/);
});
