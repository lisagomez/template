/**
 * Flujos 25, 26 y 27 de las capturas: inventario fisico en Sucursal Oriente con ROLES. Quien
 * supervisa abre, concilia y aplica con el codigo de operacion; cuentan dispositivos emparejados
 * con el codigo de CONTEO, que no reciben cantidades del sistema. Recibe los ayudantes del guion.
 */
import { completaClave } from '../../../../tools/etiquetas-gs1/dist/index.js';

export async function flujosConteo({ navegador, contexto, abre, foto, compone, informe, BASE, TOKEN, TOKEN_CONTEO, cajaDe, dia, aammdd }) {
  const glnOriente = completaClave('952123490004');
  const cajaEn = (sku, dias, lote) => `(01)${cajaDe(sku)}(17)${aammdd(dia(dias))}(10)${lote}`;
  async function cuentaEn(p, texto, veces) {
    if (veces) await p.fill('[data-prueba="veces-conteo"]', String(veces));
    const antes = await p.locator('[data-prueba="lecturas-conteo"] li').count();
    const aviso = await p.locator('[data-prueba="aviso-lectura-conteo"]').textContent().catch(() => '');
    await p.fill('[data-prueba="pistola"]', texto);
    await p.press('[data-prueba="pistola"]', 'Enter');
    if (texto.startsWith('(414)')) await p.waitForFunction((a) => { const t = document.querySelector('[data-prueba="aviso-lectura-conteo"]')?.textContent ?? ''; return t.startsWith('Ubicación') && t !== a; }, aviso);
    else await p.waitForFunction((n) => document.querySelectorAll('[data-prueba="lecturas-conteo"] li').length > n, antes);
  }
  async function abreConteoEn(p, zonas) {
    await abre(p, '/etiquetas/conteo');
    await p.selectOption('[data-prueba="sitio-conteo"]', 'SUC-ORIENTE');
    for (const z of ['almacen', 'piso']) if (!zonas.includes(z)) await p.uncheck(`[data-prueba="zona-conteo-${z}"]`);
    await p.click('[data-prueba="abrir-conteo"]');
    await p.waitForSelector('[data-prueba="conteo-activo"][data-estado="contando"]');
  }
  const conteoEsc = {};
  const rolConteo = {};
  {
    // Quien supervisa abre (codigo de operacion); cuentan dispositivos emparejados con el de CONTEO.
    const ca = await contexto(navegador, 'escritorio', 'Supervisor Oriente');
    const a = await ca.newPage();
    await abreConteoEn(a, ['almacen', 'piso']);
    const ck = await contexto(navegador, 'escritorio', 'Contador Oriente', TOKEN_CONTEO);
    const k = await ck.newPage();
    await abre(k, '/etiquetas/conteo');
    await k.waitForSelector('[data-prueba="conteo-activo"][data-estado="contando"]');
    await cuentaEn(k, `(414)${glnOriente}(254)PISO`);
    await cuentaEn(k, cajaEn('ATU-003', 400, 'A2291'), 10);
    await cuentaEn(k, `(414)${glnOriente}(254)ALMACEN-B-01-1`);
    await cuentaEn(k, cajaEn('REF-007', 25, 'R551'), 8);
    await cuentaEn(k, cajaEn('REF-007', 60, 'R600'), 3);
    conteoEsc.ronda1 = await foto(k, '[data-prueba="conteo-activo"]', 'conteo-ronda1-escritorio');
    await k.click('[data-prueba="terminar-ronda"]');
    await k.waitForSelector('[data-prueba="conteo-activo"][data-estado="reconteo"]');
    const cb = await contexto(navegador, 'escritorio', 'Recontador Oriente', TOKEN_CONTEO);
    const b = await cb.newPage();
    await abre(b, '/etiquetas/conteo');
    await b.waitForSelector('[data-prueba="recontar"]');
    await cuentaEn(b, `(414)${glnOriente}(254)PISO`);
    await cuentaEn(b, cajaEn('ATU-003', 400, 'A2291'), 10);
    await cuentaEn(b, `(414)${glnOriente}(254)ALMACEN-B-01-1`);
    await cuentaEn(b, cajaEn('REF-007', 60, 'R600'), 3);
    conteoEsc.reconteo = await foto(b, '[data-prueba="conteo-activo"]', 'conteo-reconteo-escritorio');
    await b.click('[data-prueba="terminar-ronda"]');
    await b.waitForSelector('[data-prueba="conteo-terminado"]');
    rolConteo.terminado = await foto(b, 'main', 'rol-conteo-terminado-escritorio');
    await cb.close();
    await abre(k, '/etiquetas/caducidades');
    await k.waitForSelector('[data-prueba="solo-conteo"]');
    rolConteo.bloqueado = await foto(k, 'body', 'rol-conteo-bloqueado-escritorio');
    await ck.close();
    await abre(a, '/etiquetas/conteo');
    await a.waitForSelector('[data-prueba="conteo-activo"][data-estado="por-aplicar"]');
    conteoEsc.conciliacion = await foto(a, '[data-prueba="conteo-activo"]', 'conteo-conciliacion-escritorio');
    await a.fill('[data-prueba="autoriza-conteo"]', 'Gerente Oriente');
    await a.click('[data-prueba="aplicar-conteo"]');
    await a.waitForSelector('[data-prueba="aplicado"]');
    conteoEsc.aplicado = await foto(a, '[data-prueba="conteo-activo"]', 'conteo-aplicado-escritorio');
    await ca.close();
  }
  const conteoCel = {};
  {
    const cs = await contexto(navegador, 'celular', 'Supervisor Oriente');
    const s = await cs.newPage();
    await abreConteoEn(s, ['piso']);
    const cm = await contexto(navegador, 'celular', 'Contador Oriente', TOKEN_CONTEO);
    const m = await cm.newPage();
    await abre(m, '/etiquetas/conteo');
    await m.waitForSelector('[data-prueba="conteo-activo"][data-estado="contando"]');
    await cuentaEn(m, `(414)${glnOriente}(254)PISO`);
    await cuentaEn(m, cajaEn('ATU-003', 400, 'A2291'), 10);
    conteoCel.ronda1 = await foto(m, 'main', 'conteo-ronda1-celular');
    await m.click('[data-prueba="terminar-ronda"]');
    await m.waitForSelector('[data-prueba="conteo-terminado"]');
    await abre(m, '/etiquetas/expediente');
    await m.waitForSelector('[data-prueba="solo-conteo"]');
    rolConteo.celular = await foto(m, 'body', 'rol-conteo-bloqueado-celular');
    await cm.close();
    await abre(s, '/etiquetas/conteo');
    await s.waitForSelector('[data-prueba="conteo-activo"][data-estado="por-aplicar"]');
    await s.click('[data-prueba="aplicar-conteo"]');
    await s.waitForSelector('[data-prueba="aplicado"]');
    conteoCel.aplicado = await foto(s, '[data-prueba="conteo-activo"]', 'conteo-aplicado-celular');
    await cs.close();
  }
  // Lo que el servidor le da a cada codigo (la pantalla no es la frontera; el servidor si).
  const pide = async (token, metodo, cuerpo) => {
    const r = await fetch(`${BASE}/api/etiquetas`, { method: metodo, headers: { authorization: `Bearer ${token}`, 'x-operador': 'Contador Oriente', ...(cuerpo ? { 'content-type': 'application/json' } : {}) }, ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}) });
    return { status: r.status, cuerpo: await r.json() };
  };
  const estadoConteo = await pide(TOKEN_CONTEO, 'GET');
  const estadoOperacion = await pide(TOKEN, 'GET');
  informe.rolConteo = {
    estadoOperacion: { rol: estadoOperacion.cuerpo.rol, existencias: estadoOperacion.cuerpo.existencias.length },
    estadoConteo: { rol: estadoConteo.cuerpo.rol, existencias: estadoConteo.cuerpo.existencias.length, movimientos: estadoConteo.cuerpo.movimientos.length },
    lotes: (await pide(TOKEN_CONTEO, 'POST', { accion: 'lotes' })).status,
    expediente: (await pide(TOKEN_CONTEO, 'POST', { accion: 'integridad' })).status,
    abrirConteo: (await pide(TOKEN_CONTEO, 'POST', { accion: 'conteo-abre', sitio: 'SUC-ORIENTE', zonas: ['piso'], tolerancia: 1 })).status,
    conteosSinConciliacion: (await pide(TOKEN_CONTEO, 'POST', { accion: 'conteos' })).cuerpo.conteos.every((c) => !('conciliacion' in c)),
  };
  await compone('25', 'Inventario fisico: conteo ciego en el dispositivo del contador y reconteo por otra persona', [['escritorio · ronda 1 (dispositivo de conteo)', conteoEsc.ronda1], ['escritorio · reconteo (otra persona, sin ver la ronda 1)', conteoEsc.reconteo], ['celular · dispositivo de conteo', conteoCel.ronda1]]);
  await compone('26', 'Inventario fisico: conciliacion contra la cadena, autorizacion y ajustes como eventos CONTEO', [['escritorio · conciliación (supervisor)', conteoEsc.conciliacion], ['escritorio · aplicado con autorización', conteoEsc.aplicado], ['celular · supervisor: cuadra y se aplica', conteoCel.aplicado]]);
  await compone('27', 'Rol de conteo: el contador solo cuenta y no ve cantidades del sistema', [['escritorio · al terminar: sin conciliación', rolConteo.terminado], ['escritorio · otras pantallas bloqueadas', rolConteo.bloqueado], ['celular · expediente bloqueado', rolConteo.celular]]);
}
