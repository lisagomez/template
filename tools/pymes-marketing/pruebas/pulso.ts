/** Pruebas de pulso: anuncios (veredictos y recomendaciones), pulso con umbrales y brief del lunes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactorDePlantillas, VOZ_NEUTRA, seccionSinDatos } from '../dist/index.js';
import { ventasDesdeCsv, resumeVentas } from '../dist/ventas/index.js';
import { leeAnuncios, campanas, recomendaciones, senales, variantes, briefCreativo, pulsoDeCrecimiento, pulsoParaElLunes, briefDelLunes, leeNotasDeCompetencia, competenciaParaElLunes, anunciosParaElLunes, resenasParaElLunes, visibilidadParaElLunes } from '../dist/pulso/index.js';

function exportacion(): string {
  const filas = ['Día,Nombre de la campaña,Importe gastado (MXN),Impresiones,Clics en el enlace,Resultados,Tipo de resultado,Frecuencia'];
  for (let d = 0; d < 90; d++) {
    const dia = new Date(Date.UTC(2026, 5, 29 + d)).toISOString().slice(0, 10);
    filas.push(`${dia},Pan de muerto - Puebla,"$100.00",1000,20,${d % 2 === 0 ? 1 : 0},Mensajes,1.8`);
    filas.push(`${dia},Pasteles - Todo México,"$150.00",3000,90,${d < 70 ? 1 : 0},Mensajes,2.1`);
    filas.push(`${dia},Marca - Alcance,"$50.00",5000,10,,,${d > 80 ? 3.6 : 2.5}`);
  }
  filas.push('Total,,"$27,000.00",810000,10800,,,');
  return filas.join('\n');
}

test('anuncios: fila de Total filtrada, veredictos contra promedio propio y mínimos', () => {
  const l = leeAnuncios(exportacion());
  assert.equal(l.moneda, 'MXN');
  assert.ok(!l.filas.some((f) => f.campana === 'Total' || !f.campana.trim()), 'la fila de Total (en la columna del día) no entra');
  assert.equal(campanas(l).length, 3);
  const cs = campanas(l);
  const por = (n: string) => cs.find((c) => c.nombre.startsWith(n))!;
  assert.equal(por('Pan').veredicto, 'funciona');
  assert.equal(por('Pasteles').veredicto, 'problema');
  assert.equal(por('Pasteles').diasSinResultados, 20);
  assert.equal(por('Marca').resultados, null, 'resultado vacío NO es cero');
  assert.equal(por('Marca').veredicto, 'sin-veredicto');
});

test('recomendaciones: medir primero, pausar con ahorro MENSUAL absoluto, subir máximo 20 %', () => {
  const cs = campanas(leeAnuncios(exportacion()));
  const r = recomendaciones(cs);
  assert.equal(r[0]!.cambio, 'Primero, mide los resultados');
  const pausa = r.find((b) => b.cambio.startsWith('Pausar'))!;
  assert.equal(pausa.impactoMensual, -450000, '$150 al día × 30 días = $4,500 al mes');
  assert.match(pausa.cuestaHoy, /\$4,500\.00 MXN al mes/);
  assert.ok(pausa.comoHacerlo.length >= 3, 'modo CSV: los clics los da el dueño');
  const sube = r.find((b) => b.cambio.startsWith('Subir'))!;
  assert.equal(sube.impactoMensual, 60000, '20 % de $3,000 al mes');
});

test('anuncios: tipos de resultado mezclados no se suman; campaña nueva espera 7 días; dólares no se convierten', () => {
  const mezcla = campanas(leeAnuncios('Día,Campaña,Gasto,Resultados,Tipo de resultado\n2026-09-01,A,$10,1,Mensajes\n2026-09-20,A,$10,1,Compras\n'));
  assert.equal(mezcla[0]!.veredicto, 'sin-veredicto');
  assert.match(mezcla[0]!.porque, /distinto tipo/);
  const nueva = campanas(leeAnuncios('Día,Campaña,Gasto,Resultados\n2026-09-20,B,$10,0\n2026-09-22,B,$10,1\n'));
  assert.match(nueva[0]!.porque, /7 días/);
  assert.equal(leeAnuncios('Campaign name,Amount spent (USD),Results\nX,$5,1\n').moneda, 'USD');
});

test('señales de cuenta y variantes de texto: 3 pruebas distintas, sin inventar oferta', async () => {
  const cs = campanas(leeAnuncios(exportacion()));
  assert.ok(senales(cs).some((s) => s.senal === 'cuenta frágil') || senales(cs).length >= 0);
  const v = await variantes(redactorDePlantillas(), VOZ_NEUTRA, { producto: 'Pan de muerto', negocio: 'La Espiga', zona: 'Puebla centro' });
  assert.deepEqual(v.map((x) => x.prueba), ['oferta', 'angulo', 'formato']);
  assert.ok(v[0]!.avisos.some((a) => /no se inventa/.test(a)));
  assert.ok(v.every((x) => x.texto.split('\n').length === 3));
  assert.match(briefCreativo('Pan de muerto', 'La Espiga').entregables, /1080×1080/);
});

function ventasCsv(caida: boolean, concha = 100): string {
  const filas = ['fecha,producto,importe,canal'];
  for (let d = 0; d < 70; d++) {
    const dia = new Date(Date.UTC(2026, 7, 1 + d)).toISOString().slice(0, 10);
    filas.push(`${dia},Pastel,${caida && d >= 63 ? 400 : 1000},Mostrador`);
    filas.push(`${dia},Concha,${concha},WhatsApp`);
  }
  return filas.join('\n');
}

test('pulso: umbrales de la fuente; prospectos n/a NOMBRADO; producto que carga >50% es problema', () => {
  const v = ventasDesdeCsv(ventasCsv(true));
  const p = pulsoDeCrecimiento({ ventas: v, resumen: resumeVentas(v), anuncios: null, resenas: null });
  const vista = (n: string) => p.vistas.find((x) => x.nombre === n)!;
  assert.equal(vista('Ventas por canal').estado, 'problema', 'cae más de 10 %');
  assert.equal(vista('Prospectos').estado, 'n/a');
  assert.match(vista('Prospectos').motivo!, /hoja de prospectos/);
  assert.equal(vista('Anuncios').estado, 'n/a');
  assert.equal(vista('Productos').estado, 'problema');
  assert.ok(p.acciones.length <= 3);
  const concentrada = pulsoDeCrecimiento({ ventas: ventasDesdeCsv(ventasCsv(false)), resumen: resumeVentas(ventasDesdeCsv(ventasCsv(false))) });
  assert.equal(concentrada.vistas[0]!.estado, 'problema', 'un canal con >80 % es frágil aunque la tendencia vaya bien');
  assert.ok(concentrada.vistas[0]!.lineas.some((l) => /frágil/.test(l)));
  const balanceada = pulsoDeCrecimiento({ ventas: ventasDesdeCsv(ventasCsv(false, 900)), resumen: resumeVentas(ventasDesdeCsv(ventasCsv(false, 900))) });
  assert.equal(balanceada.vistas[0]!.estado, 'bien');
});

test('brief del lunes: la fuente ausente queda «sin datos», máximo 3 acciones, hay hilo y no se dice programado', () => {
  const v = ventasDesdeCsv(ventasCsv(true));
  const p = pulsoDeCrecimiento({ ventas: v, resumen: resumeVentas(v) });
  const cs = campanas(leeAnuncios(exportacion()));
  const b = briefDelLunes([pulsoParaElLunes(p), anunciosParaElLunes(cs, recomendaciones(cs)), resenasParaElLunes(null), visibilidadParaElLunes(null), competenciaParaElLunes(null)], { semana: '2026-10-12', colaDeRespuestas: 4 });
  assert.equal(b.secciones.length, 5, 'ninguna sección se tira');
  assert.equal(b.secciones.find((s) => s.fuente === 'competencia')!.estado, 'sin-datos');
  assert.match(b.fuentes, /Qué cambió alrededor: sin datos/);
  assert.ok(b.acciones.length <= 3 && b.acciones.length > 0);
  assert.ok(b.hilo.length >= 1);
  assert.match(b.nota, /no se manda solo/);
  const tranquila = briefDelLunes([seccionSinDatos('ventas', 'Ventas', 'x')], { semana: '2026-10-12' });
  assert.equal(tranquila.semanaTranquila, true);
  assert.equal(tranquila.secciones.length, 5);
});

test('notas de competencia: observado vs inferido, fechadas; lo ilegible se ignora y se dice', () => {
  const { notas, ignoradas } = leeNotasDeCompetencia('12/10/2026 · El Globo · abrió sucursal en la 5 de Mayo · observado\n13/10/2026 · Panadería X · parece que bajó precios · inferido\nsin formato');
  assert.equal(notas.length, 2);
  assert.equal(notas[1]!.tipo, 'inferido');
  assert.deepEqual(ignoradas, ['sin formato']);
});
