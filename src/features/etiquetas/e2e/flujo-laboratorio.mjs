/**
 * Flujo 46 de las capturas: el laboratorio de la herramienta (`/laboratorio-etiquetas`). Los casos
 * corren al abrir la página (con el motor local y el corpus real si esta máquina los tiene) y su
 * veredicto decide qué usa `/etiquetas`. Escritorio: métricas, tabla y la caja contra su referencia;
 * celular: métricas y tabla.
 */
export async function laboratorio46({ navegador, contexto, foto, compone, informe, BASE }) {
  const r = {};
  for (const vista of ['escritorio', 'celular']) {
    const c = await contexto(navegador, vista, 'Supervisor Centro');
    const p = await c.newPage();
    await p.goto(`${BASE}/laboratorio-etiquetas`, { timeout: 120_000 });
    await p.waitForSelector('[data-prueba="seccion-herramientas"]', { timeout: 120_000 });
    await p.addStyleTag({ content: 'nav{position:static!important} div.fixed.right-4.top-4{display:none!important}' });
    const estados = await p.locator('article[data-estado]').evaluateAll((xs) => xs.map((x) => x.getAttribute('data-estado')));
    const aprobadas = await p.locator('[data-prueba^="aprobada-"]').evaluateAll((xs) => xs.filter((x) => x.textContent === 'aprobada').map((x) => x.getAttribute('data-prueba').slice(9)));
    informe.laboratorio = { casos: estados.length, pasan: estados.filter((e) => e === 'pasa').length, noMedidos: estados.filter((e) => e === 'no-medido').length, fallan: estados.filter((e) => e === 'falla').length, aprobadas, maquina: await p.locator('[data-prueba="maquina"]').textContent() };
    r[vista] = [await foto(p, 'main > header', `lab-cabecera-${vista}`), await foto(p, '[data-prueba="metricas"]', `lab-metricas-${vista}`), await foto(p, '[data-prueba="seccion-herramientas"]', `lab-tabla-${vista}`)];
    if (vista === 'escritorio') r.caja = await foto(p, '[data-prueba="caso-etq-caja"]', 'lab-caso-caja');
    await c.close();
  }
  await compone('46', 'Laboratorio de la herramienta: casos, estado real y lo que aprueba para la app', [['escritorio · métricas', r.escritorio[1]], ['escritorio · herramientas', r.escritorio[2]], ['escritorio · la caja contra su referencia', r.caja], ['celular · métricas', r.celular[1]], ['celular · herramientas', r.celular[2]]]);
}
