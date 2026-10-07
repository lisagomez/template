/**
 * Recorrido del buzón en el navegador (spec 015), contra el stack REAL del despacho y con datos sintéticos. No lo
 * corre ningún gate: es la evidencia de que las pantallas, las rutas y la base se entienden de verdad (fase 4, y la
 * base de TAR-19 en la fase 8).
 *
 * Cómo se corrió el 2026-10-07 (todo local, nada sale de la máquina):
 *   1. el Supabase del despacho: docker compose -p despacho-e2e -f docker-compose.despacho.yml (+ un override con el
 *      puerto 18443) con DOMAIN=localhost y los secretos de scripts/despacho/llaves.mjs; las migraciones con psql;
 *      una cuenta dada de alta por la API de admin y hecha miembro con SQL;
 *   2. el extractor: node tools/extractor-documental/servicio/servidor.mjs (EXTRACTOR_RESPALDO=ninguno, Tesseract local);
 *   3. la app: npm run dev con NEXT_PUBLIC_SUPABASE_URL=https://localhost:18443, EXTRACTOR_SERVICIO_URL y
 *      NODE_EXTRA_CA_CERTS con la raíz de Caddy (no se apaga la verificación TLS);
 *   4. APP=http://localhost:3001 SALIDA=<carpeta> XML=tools/extractor-documental/pruebas/fixtures/cfdi-40-ingreso.xml
 *      [LISTADO_REAL=<el CSV del SAT, para la prueba de escala>] node scripts/buzon/recorrido.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const APP = process.env.APP ?? 'http://localhost:3001';
const SALIDA = process.env.SALIDA;
const XML = process.env.XML;
mkdirSync(join(SALIDA, 'capturas'), { recursive: true });
const pasos = [];
const paso = (n, ok, detalle = '') => { pasos.push({ n, ok, detalle }); console.log(`${ok ? '✓' : '✗'} ${n}${detalle ? ` — ${detalle}` : ''}`); };

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1000, height: 1400 } });
const foto = (nombre) => pagina.screenshot({ path: join(SALIDA, 'capturas', `${nombre}.png`), fullPage: true });
try {
  await pagina.goto(`${APP}/buzon`);
  paso('sin sesión, /buzon manda a entrar', pagina.url().includes('/login'));
  await pagina.fill('input[name="correo"]', 'contadora@despacho-ejemplo.mx');
  await pagina.fill('input[name="contrasena"]', 'sintetica-larga-1234');
  await pagina.click('button[type="submit"]');
  await pagina.waitForURL('**/buzon', { timeout: 30000 });
  paso('la contadora entra y llega al buzón', true);

  for (const [rfc, nombre] of [['XAXX010101000', 'Pyme receptora'], ['ABC010203XY9', 'Otra pyme']]) {
    await pagina.fill('[data-prueba="rfc"]', rfc);
    await pagina.fill('[data-prueba="nombre"]', nombre);
    await pagina.click('[data-prueba="dar-de-alta"]');
    await pagina.getByText(nombre).waitFor();
  }
  paso('alta de dos pymes', true);
  await foto('01-pymes');

  const pyme = pagina.locator('[data-prueba="pyme"]', { hasText: 'Pyme receptora' });
  const enlace = await pyme.getByRole('link').getAttribute('href');
  await pagina.goto(`${APP}${enlace}`);
  paso('RF-2: sin consentimiento no hay zona de subida, y lo dice', await pagina.locator('[data-prueba="sin-consentimiento"]').isVisible());
  await foto('02-sin-consentimiento');

  await pagina.goto(`${APP}/buzon`);
  await pyme.locator('[data-prueba="consentimiento-archivo"]').setInputFiles({ name: 'consentimiento-firmado.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 consentimiento sintetico') });
  await pyme.locator('[data-prueba="consentimiento-fecha"]').fill('2026-10-01');
  await pyme.locator('[data-prueba="registrar"]').click();
  await pyme.locator('[data-prueba="consentimiento-vigente"]').waitFor();
  paso('RF-1: consentimiento escrito registrado', true);

  await pagina.goto(`${APP}${enlace}`);
  await pagina.locator('[data-prueba="archivos"]').setInputFiles(XML);
  await pagina.click('[data-prueba="subir"]');
  await pagina.locator('[data-prueba="resultados"] li').first().waitFor({ timeout: 60000 });
  paso('el XML entra', (await pagina.locator('[data-prueba="resultados"]').innerText()).includes('entró'), await pagina.locator('[data-prueba="resultados"]').innerText());
  await pagina.reload();
  const doc = pagina.locator('[data-prueba="documento"]').first();
  paso('RF-15: dice «sello no verificado»', await doc.locator('[data-prueba="sello"]').isVisible());
  paso('RF-17: con el RFC del emisor sin validar, «Confirmar» está deshabilitado y dice por qué',
    !(await doc.locator('[data-prueba="confirmar"]').isEnabled()) && /rfc_emisor/.test(await doc.locator('[data-prueba="pendientes"]').innerText()));
  await foto('03-xml-con-rfc-por-revisar');
  const forzado = await pagina.evaluate(async (url) => (await fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'confirmar' }) })).json(),
    `${APP}/api/buzon/documentos/${await doc.getAttribute('data-id')}`);
  paso('RF-17: aunque se llame a la API a mano, la base no deja confirmar', /campos por revisar/.test(forzado.error ?? ''), forzado.error ?? '');
  await doc.locator('[data-prueba="guardar-rfc_emisor"]').click();
  await pagina.locator('[data-prueba="documento"] [data-prueba="confirmar"]:enabled').waitFor();
  paso('revisado el campo, «Confirmar» se habilita', true);
  await doc.locator('[data-prueba="confirmar"]').click();
  await pagina.locator('[data-prueba="documento"][data-estado="confirmado"]').waitFor();
  paso('RF-16: confirmado por la persona, CFDI por CFDI', true);
  await foto('04-confirmado');

  await pagina.locator('[data-prueba="archivos"]').setInputFiles({ name: 'mismo-folio.xml', mimeType: 'application/xml', buffer: Buffer.concat([await (await import('node:fs/promises')).readFile(XML), Buffer.from('\n<!-- otra copia -->')]) });
  await pagina.click('[data-prueba="subir"]');
  await pagina.locator('[data-prueba="resultados"] li').first().waitFor({ timeout: 60000 });
  paso('RF-13: el mismo folio no entra dos veces', /folio fiscal ya está/.test(await pagina.locator('[data-prueba="resultados"]').innerText()), await pagina.locator('[data-prueba="resultados"]').innerText());

  const csv = await pagina.evaluate(async (url) => (await fetch(url)).text(), `${APP}/api/buzon/exporta?pyme=${enlace.split('/').pop()}`);
  writeFileSync(join(SALIDA, 'confirmados.csv'), csv);
  paso('TAR-11: el CSV lleva el CFDI confirmado', csv.includes('11111111-2222-3333-4444-555555555555'), `${csv.trim().split('\r\n').length - 1} fila(s)`);

  const otra = pagina.locator('[data-prueba="pyme"]', { hasText: 'Otra pyme' });
  await pagina.goto(`${APP}/buzon`);
  await otra.locator('[data-prueba="consentimiento-archivo"]').setInputFiles({ name: 'c.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 otro') });
  await otra.locator('[data-prueba="consentimiento-fecha"]').fill('2026-10-01');
  await otra.locator('[data-prueba="registrar"]').click();
  await otra.locator('[data-prueba="consentimiento-vigente"]').waitFor();
  await pagina.goto(`${APP}${await otra.getByRole('link').getAttribute('href')}`);
  await pagina.locator('[data-prueba="archivos"]').setInputFiles(XML);
  await pagina.click('[data-prueba="subir"]');
  await pagina.locator('[data-prueba="resultados"] li').first().waitFor({ timeout: 60000 });
  await pagina.reload();
  const ajeno = pagina.locator('[data-prueba="documento"]').first();
  paso('RF-12: el CFDI de otra pyme queda como «receptor ajeno» y sin «Confirmar»',
    (await ajeno.getAttribute('data-estado')) === 'receptor_ajeno' && (await ajeno.locator('[data-prueba="confirmar"]').count()) === 0);
  await foto('05-receptor-ajeno');

  // --- Fase 5: el listado 69-B (RF-18, RF-19) -----------------------------------------------------------------
  const importaListado = async (archivo, fuente) => {
    await pagina.goto(`${APP}/buzon`);
    await pagina.locator('[data-prueba="lista-archivo"]').setInputFiles(archivo);
    if (fuente) await pagina.fill('[data-prueba="lista-fuente"]', fuente);
    await pagina.click('[data-prueba="importar-lista"]');
    await pagina.locator('[data-prueba="lista-aviso"]').waitFor({ timeout: 180000 });
    return pagina.locator('[data-prueba="lista-aviso"]').innerText();
  };
  if (process.env.LISTADO_REAL) {
    const t0 = Date.now();
    const aviso = await importaListado(process.env.LISTADO_REAL);
    paso('escala: el listado REAL completo entra en una sola llamada (todo o nada)', /Importado: \d{5} registros/.test(aviso), `${aviso} · ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  // Sintético y POSTERIOR al real: pasa a ser el vigente. El emisor del fixture aparece como «Presunto».
  const sintetico = Buffer.from(['"Información actualizada al 30 de septiembre de 2026; listado sintético de prueba.",,,',
    'Listado completo de contribuyentes (Artículo 69-B del CFF),,,', 'No,RFC,Nombre del Contribuyente,Situación del contribuyente',
    '1,AAA010101AAA,EMISOR SINTETICO,Presunto', '2,ZZZ020202ZZ2,OTRO SINTETICO,Sentencia Favorable'].join('\r\n'), 'latin1');
  paso('se importa un listado sintético posterior', /Importado: 2 registros, actualizado al 2026-09-30/.test(await importaListado({ name: 'listado-69b-sintetico.csv', mimeType: 'text/csv', buffer: sintetico }, 'Listado SINTÉTICO de prueba (no es del SAT)')));
  // Se espera al refresco de la pantalla: leerla al instante muestra todavía el listado anterior (medido).
  const vigente = await pagina.locator('[data-prueba="lista-vigente"]', { hasText: 'actualizado al 2026-09-30' })
    .waitFor({ timeout: 20000 }).then(() => true, () => false);
  paso('el listado vigente es el de fecha más reciente', vigente);
  await foto('07-listado-69b');
  await pagina.goto(`${APP}${enlace}`);
  const conBandera = pagina.locator('[data-prueba="bandera-69b"]').first();
  const textoBandera = await conBandera.innerText();
  paso('RF-18: el CFDI del emisor en el listado lleva su bandera resaltada, con fuente y fecha',
    (await conBandera.getAttribute('data-alerta')) === 'true' && /«Presunto»/.test(textoBandera) && /2026-09-30/.test(textoBandera));
  paso('RF-19: la bandera dice que no es un veredicto', /No es un veredicto/.test(textoBandera));
  await foto('08-bandera-69b');

  await pagina.goto(`${APP}/buzon`);
  pagina.once('dialog', (d) => d.accept());
  await pyme.locator('[data-prueba="revocar"]').click();
  await pyme.locator('[data-prueba="registrar-consentimiento"]').waitFor();
  await pagina.goto(`${APP}${enlace}`);
  paso('RF-3, RF-4: al revocar, sus documentos desaparecen', (await pagina.locator('[data-prueba="documento"]').count()) === 0);
  await foto('06-revocado');
} catch (e) {
  paso('el recorrido se cortó', false, String(e?.message ?? e).split('\n')[0]);
  await foto('error');
} finally {
  await navegador.close();
  writeFileSync(join(SALIDA, 'pasos.json'), JSON.stringify(pasos, null, 2));
  process.exit(pasos.every((p) => p.ok) ? 0 : 1);
}
