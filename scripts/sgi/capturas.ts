/**
 * RECORRIDO con Playwright para la definición de hecho del goal: cada paso entra con la cuenta del ROL que le toca,
 * hace la acción de verdad, comprueba el resultado, revisa la consola y guarda la captura en
 * .claude/goals/sistema-integrado-iso/capturas/. Los pasos que piden a un agente van marcados `llm` y solo corren si
 * el servidor arrancó con la llave (--con-llm). Correr sobre una base recién sembrada: npm run sgi:local:reinicia.
 * Uso: node scripts/sgi/capturas.ts [--base http://localhost:3011] [--con-llm] [--solo 3,5]
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const BASE = arg('base') ?? 'http://localhost:3011';
const CON_LLM = process.argv.includes('--con-llm');
const SOLO = arg('solo')?.split(',').map(Number);
const DIR = '.claude/goals/sistema-integrado-iso/capturas';
mkdirSync(DIR, { recursive: true });
const cuentas = JSON.parse(readFileSync('supabase/.temp/sgi-cuentas.json', 'utf8')) as Record<string, { correo: string; clave: string }>;

interface Registro { n: number; paso: string; ok: boolean; evidencia: string[]; capturas: string[]; llm: boolean; errores_consola: string[] }
const registro: Registro[] = [];
const navegador: Browser = await chromium.launch();
const sesiones = new Map<string, Page>();
const erroresDe = new Map<Page, string[]>();

async function como(cuenta: string): Promise<Page> {
  const ya = sesiones.get(cuenta);
  if (ya) return ya;
  const p = await (await navegador.newContext({ viewport: { width: 1360, height: 900 }, locale: 'es-MX' })).newPage();
  const errs: string[] = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(process.env.SGI_ERRORES_COMPLETOS ? m.text().slice(0, 5000) : m.text().split('\n')[0]!.slice(0, 200)); });
  p.on('pageerror', (e) => errs.push(`pageerror: ${e.message.slice(0, 200)}`));
  erroresDe.set(p, errs);
  await p.goto(`${BASE}/login?siguiente=/sgi`);
  await p.fill('input[name=correo]', cuentas[cuenta]!.correo);
  await p.fill('input[name=contrasena]', cuentas[cuenta]!.clave);
  await p.click('button[type=submit]');
  await p.waitForURL((u) => u.pathname === '/sgi');
  sesiones.set(cuenta, p);
  return p;
}
async function orgId(p: Page, nombre: string): Promise<string> {
  await p.goto(`${BASE}/sgi`);
  const href = await p.locator('[data-prueba=organizaciones] a', { hasText: nombre }).first().getAttribute('href');
  return href!.split('/').pop()!;
}
const foto = async (p: Page, nombre: string, lista: string[]) => { const ruta = `${DIR}/${nombre}.png`; await p.screenshot({ path: ruta, fullPage: true }); lista.push(ruta); };
const aviso = async (p: Page) => (await p.locator('[data-prueba=aviso], [data-prueba=error]').first().textContent({ timeout: 2000 }).catch(() => '')) ?? '';
async function avance(p: Page): Promise<Record<string, number>> {
  const t = (await p.locator('[data-prueba=avance]').innerText()).split('\n');
  const out: Record<string, number> = {};
  for (let i = 0; i < t.length - 1; i++) { const m = /^([\d.]+)%$/.exec(t[i + 1]!.trim()); if (m) out[t[i]!.trim()] = Number(m[1]); }
  return out;
}

async function paso(n: number, nombre: string, llm: boolean, cuerpo: (ev: string[], caps: string[]) => Promise<boolean>) {
  if (SOLO && !SOLO.includes(n)) return;
  if (llm && !CON_LLM) { registro.push({ n, paso: nombre, ok: false, evidencia: ['NO CORRIDO: pide a un agente y el servidor no tiene la llave (falta --con-llm)'], capturas: [], llm, errores_consola: [] }); return; }
  const ev: string[] = [], caps: string[] = [];
  for (const errs of erroresDe.values()) errs.length = 0;
  let ok = false;
  try { ok = await cuerpo(ev, caps); } catch (e) { ev.push(`✗ excepción: ${(e as Error).message.slice(0, 300)}`); }
  const consola = [...erroresDe.values()].flat();
  if (consola.length) { ok = false; ev.push(`✗ ${consola.length} error(es) de consola`); }
  registro.push({ n, paso: nombre, ok, evidencia: ev, capturas: caps, llm, errores_consola: consola });
  console.log(`${ok ? '✓' : '✗'} ${String(n).padStart(2)} ${nombre}\n${ev.map((e) => `     ${e}`).join('\n')}`);
}
const marca = (ev: string[], ok: boolean, t: string) => { ev.push(`${ok ? '✓' : '✗'} ${t}`); return ok; };

const admin = await como('maquinados.admin');
const M = await orgId(admin, 'Maquinados');

await paso(1, 'Roadmap con puertas y % por cláusula, norma y global (Maquinados)', false, async (ev, caps) => {
  await admin.goto(`${BASE}/sgi/${M}`);
  const a = await avance(admin);
  await foto(admin, '01-roadmap', caps);
  const fases = await admin.locator('[data-prueba^=fase-]').count();
  return marca(ev, fases === 9, `9 fases con puerta`) && marca(ev, Object.keys(a).length >= 3, `avance: ${JSON.stringify(a)}`) && marca(ev, (await admin.locator('[data-prueba=por-clausula]').innerText()).includes('Anexo A'), 'avance por cláusula de las dos normas');
});

await paso(2, 'Una evidencia (acta de revisión por la dirección) sube las DOS normas', false, async (ev, caps) => {
  const dir = await como('maquinados.direccion');
  await dir.goto(`${BASE}/sgi/${M}`);
  const antes = await avance(dir);
  await dir.goto(`${BASE}/sgi/${M}/evidencias`);
  const tarjeta = dir.locator('[data-prueba^="evidencia-Acta de revisión"]');
  await tarjeta.locator('select[name=rol]').selectOption('alta_direccion');
  await tarjeta.locator('[data-prueba=aprobar]').click();
  await dir.waitForURL(/aviso=/);
  await foto(dir, '02-evidencia-dos-normas', caps);
  await dir.goto(`${BASE}/sgi/${M}`);
  const despues = await avance(dir);
  await foto(dir, '03-roadmap-tras-acta', caps);
  const q = Object.keys(despues).find((k) => k.includes('9001'))!, ia = Object.keys(despues).find((k) => k.includes('42001'))!;
  return marca(ev, despues[q]! > antes[q]! && despues[ia]! > antes[ia]!, `9001 ${antes[q]}% → ${despues[q]}% · 42001 ${antes[ia]}% → ${despues[ia]}% · global ${antes.Global}% → ${despues.Global}%`);
});

await paso(3, 'El agente documental redacta la Política de IA con la terminología del taller', true, async (ev, caps) => {
  const c = await como('consultora');
  await c.goto(`${BASE}/sgi/${M}/documentos`);
  await c.locator('[data-prueba="redactar-Política de IA"]').click();
  await c.waitForURL(/documentos\/[0-9a-f-]{36}/, { timeout: 180_000 });
  const texto = await c.locator('[data-prueba=contenido]').innerText();
  const traza = await c.locator('[data-prueba=traza]').innerText();
  await foto(c, '04-politica-ia-borrador', caps);
  const propios = ['Maquinados del Bajío', 'Cotizador', 'Inspección visual', 'CNC', 'Querétaro'].filter((t) => texto.toLowerCase().includes(t.toLowerCase()));
  marca(ev, propios.length >= 3, `usa términos del taller: ${propios.join(', ')}`);
  marca(ev, /Modelo \(pineado\): anthropic\//.test(traza), `traza: ${traza.split('\n').slice(0, 5).join(' · ')}`);
  await c.locator('[data-prueba=enviar-revision]').click();
  await c.waitForURL(/aviso=/);
  (globalThis as { versionPolitica?: string }).versionPolitica = c.url().split('/').pop()!.split('?')[0];
  return marca(ev, (await aviso(c)).includes('revisión'), 'enviada a revisión');
});

await paso(4, 'El dueño de proceso intenta aprobar la política: rechazado', true, async (ev, caps) => {
  const d = await como('maquinados.produccion');
  const v = (globalThis as { versionPolitica?: string }).versionPolitica!;
  await d.goto(`${BASE}/sgi/${M}/documentos/${v}`);
  await d.locator('[data-prueba=aprobar]').click();
  await d.waitForURL(/error=/);
  const msj = await aviso(d);
  await foto(d, '05-politica-rechazada-a-dueno', caps);
  return marca(ev, /no se aprueba esto|alta dirección/i.test(msj), `mensaje: «${msj}»`);
});

await paso(5, 'La alta dirección aprueba la versión exacta; la puerta 2 ya puede cerrarse y la cierra', true, async (ev, caps) => {
  const dir = await como('maquinados.direccion');
  const v = (globalThis as { versionPolitica?: string }).versionPolitica!;
  await dir.goto(`${BASE}/sgi/${M}/documentos/${v}`);
  await dir.locator('select[name=rol]').selectOption('alta_direccion');
  await dir.locator('[data-prueba=aprobar]').click();
  await dir.waitForURL(/aviso=/);
  const aps = await dir.locator('[data-prueba=aprobaciones]').innerText();
  await foto(dir, '06-politica-ia-aprobada', caps);
  marca(ev, /aprobado[\s\S]*Alta dirección[\s\S]*v1[\s\S]*sha256:/.test(aps), `registro: ${aps.split('\n')[0]}`);
  await dir.goto(`${BASE}/sgi/${M}`);
  await dir.locator('[data-prueba=cerrar-fase-2]').click();
  await dir.waitForURL(/(aviso|error)=/);
  const msj = await aviso(dir);
  await foto(dir, '07-fase-2-cerrada', caps);
  return marca(ev, msj.includes('Fase 2 cerrada'), `«${msj}»`);
});

await paso(6, 'Diagnóstico → informe GAP (agente de diagnóstico)', true, async (ev, caps) => {
  await admin.goto(`${BASE}/sgi/${M}/diagnostico`);
  await foto(admin, '08a-diagnostico', caps);
  await admin.locator('[data-prueba=generar-gap]').click();
  await admin.waitForURL(/documentos\/[0-9a-f-]{36}/, { timeout: 240_000 });
  const t = await admin.locator('[data-prueba=contenido]').innerText();
  await foto(admin, '08-informe-gap', caps);
  return marca(ev, /Brechas/.test(t) && /SGI-/.test(t), `informe con brechas y requisitos citados (${t.length} caracteres)`);
});

for (const [n, que, nombre, img] of [[7, 'riesgos', 'Matriz de riesgos (calidad e IA) propuesta por el agente', '09-riesgos'], [8, 'impacto', 'Evaluación de impacto de IA propuesta por el agente', '10-impacto-ia']] as const) {
  await paso(n, nombre, true, async (ev, caps) => {
    const c = await como('consultora');
    await c.goto(`${BASE}/sgi/${M}/riesgos`);
    await c.locator(`[data-prueba=agente-${que}]`).click();
    await c.waitForURL(/(aviso|error)=/, { timeout: 240_000 });
    const msj = await aviso(c);
    await foto(c, img, caps);
    const filas = await c.locator(que === 'riesgos' ? '[data-prueba=riesgos] li' : '[data-prueba=impacto] li').count();
    return marca(ev, /Propuesta lista/.test(msj) && filas > 1, `«${msj}» · ${filas} filas`);
  });
}

await paso(9, 'SoA: el agente la propone, se prepara la versión y la aprueba la alta dirección', true, async (ev, caps) => {
  const c = await como('consultora');
  await c.goto(`${BASE}/sgi/${M}/soa`);
  await c.locator('[data-prueba=agente-soa]').click();
  await c.waitForURL(/(aviso|error)=/, { timeout: 240_000 });
  const decididos = (await c.locator('[data-prueba=soa] tbody tr').filter({ hasNotText: 'sin decidir' }).count());
  await foto(c, '11-soa', caps);
  marca(ev, decididos >= 30, `${decididos} de 38 controles decididos`);
  await c.locator('[data-prueba=foto-soa]').click();
  await c.waitForURL(/documentos\/[0-9a-f-]{36}/);
  const v = c.url().split('/').pop()!.split('?')[0];
  const dir = await como('maquinados.direccion');
  await dir.goto(`${BASE}/sgi/${M}/documentos/${v}`);
  await dir.locator('select[name=rol]').selectOption('alta_direccion');
  await dir.locator('[data-prueba=aprobar]').click();
  await dir.waitForURL(/aviso=/);
  await foto(dir, '12-soa-aprobada', caps);
  return marca(ev, /aprobado/i.test(await dir.locator('[data-prueba=aprobaciones]').innerText()), 'SoA aprobada por la alta dirección');
});

await paso(10, 'Hallazgo → NC → CAPA: el auditor verifica la eficacia y la NC se cierra', false, async (ev, caps) => {
  const au = await como('maquinados.auditoria');
  await au.goto(`${BASE}/sgi/${M}/auditoria`);
  await foto(au, '13a-capa-antes', caps);
  const nc = au.locator('[data-prueba=ncs] > li').first();
  marca(ev, (await nc.innerText()).includes('en tratamiento'), 'NC en tratamiento con acción «hecha»');
  await nc.locator('select[name=rol]').selectOption('auditor_interno');
  await nc.locator('[data-prueba=aprobar]').click();
  await au.waitForURL(/aviso=/);
  await foto(au, '13-capa-nc-cerrada', caps);
  const t = await au.locator('[data-prueba=ncs] > li').first().innerText();
  return marca(ev, /cerrada/.test(t) && /eficaz/.test(t), 'acción eficaz → NC cerrada (lo hizo el disparador de la aprobación)') && marca(ev, (await au.locator('[data-prueba=hallazgos]').first().innerText()).includes('firmado'), 'el hallazgo que la originó está firmado');
});

await paso(11, 'Auditoría: el agente redacta hallazgos desde las notas; solo el auditor los firma', true, async (ev, caps) => {
  const au = await como('maquinados.auditoria');
  await au.goto(`${BASE}/sgi/${M}/auditoria`);
  await au.locator('[data-prueba=notas]').first().fill('El micrómetro 0-25 mm tiene la etiqueta de calibración vencida desde junio y se midieron 3 lotes con él. El chatbot de cotización dio un precio a un cliente sin revisión de ventas.');
  await au.locator('[data-prueba=agente-hallazgos]').first().click();
  await au.waitForURL(/(aviso|error)=/, { timeout: 240_000 });
  const h = au.locator('[data-prueba=hallazgos] > li', { hasText: 'borrador' }).first();
  marca(ev, await h.count() > 0, 'hallazgo en borrador propuesto por el agente');
  await h.locator('select[name=rol]').selectOption('auditor_interno');
  await h.locator('[data-prueba=aprobar]').click();
  await au.waitForURL(/aviso=/);
  await foto(au, '14-hallazgo-firmado', caps);
  return marca(ev, (await au.locator('[data-prueba=hallazgos]').first().innerText()).match(/firmado/g)!.length >= 2, 'firmado por el auditor interno');
});

await paso(12, 'Panel del consultor: 3 clientes, avance, marca blanca y plantillas', false, async (ev, caps) => {
  const c = await como('consultora');
  await c.goto(`${BASE}/sgi/consultor`);
  const filas = await c.locator('[data-prueba=clientes] tbody tr').count();
  await c.locator('input[name=color_primario]').fill('#7c3aed');
  await c.locator('[data-prueba=form-marca] button[type=submit]').click();
  await c.waitForURL(/aviso=/);
  await foto(c, '15-panel-consultor', caps);
  const cli = await como('clinica.admin');
  await cli.goto(`${BASE}/sgi/${await orgId(cli, 'Clínica')}`);
  await foto(cli, '16-marca-blanca-en-el-cliente', caps);
  const color = await cli.locator('[data-prueba=marca]').evaluate((e) => getComputedStyle(e).backgroundColor);
  return marca(ev, filas === 3, `${filas} clientes en el panel`) && marca(ev, color === 'rgb(124, 58, 237)', `la clínica ve el color del despacho: ${color}`);
});

await paso(13, 'Reporte de avance para el cliente (agente portafolio)', true, async (ev, caps) => {
  const c = await como('consultora');
  await c.goto(`${BASE}/sgi/consultor`);
  await c.locator('[data-prueba="reporte-Maquinados del Bajío"]').click();
  await c.waitForURL(/documentos\/[0-9a-f-]{36}/, { timeout: 240_000 });
  await foto(c, '17-reporte-de-avance', caps);
  return marca(ev, /Cómo vamos|Resumen/.test(await c.locator('[data-prueba=contenido]').innerText()), 'reporte en borrador en el sistema del cliente');
});

await paso(14, 'Modo sin jerga para la pyme', false, async (ev, caps) => {
  await admin.goto(`${BASE}/sgi/${M}`);
  await admin.locator('[data-prueba=modo-pyme]').click();
  await admin.waitForLoadState('networkidle');
  const t = await admin.locator('[data-prueba=roadmap]').innerText();
  await foto(admin, '18-modo-pyme', caps);
  await admin.locator('[data-prueba=modo-experto]').click();
  return marca(ev, t.includes('Compromiso de la dirección') && !t.includes('cl. 5'), 'fases con nombres de negocio, sin números de cláusula');
});

await paso(15, 'Exportar DOCX y PDF de la política de calidad aprobada, con huella', false, async (ev, caps) => {
  await admin.goto(`${BASE}/sgi/${M}/documentos`);
  await admin.locator('[data-prueba=documentos] tr', { hasText: 'Política de calidad' }).locator('a').first().click();
  await admin.waitForURL(/documentos\/[0-9a-f-]{36}/);
  await foto(admin, '19-exportar', caps);
  for (const f of ['docx', 'pdf'] as const) {
    const r = await admin.request.get(`${BASE}${await admin.locator(`[data-prueba=${f}]`).getAttribute('href')}`);
    const cuerpo = await r.body();
    const h = `sha256:${createHash('sha256').update(cuerpo).digest('hex')}`;
    const ruta = `${DIR}/politica-de-calidad-v1.${f}`;
    writeFileSync(ruta, cuerpo);
    caps.push(ruta);
    marca(ev, r.headers()['x-huella'] === h, `${f.toUpperCase()} ${cuerpo.length} bytes · huella del archivo = X-Huella (${h.slice(0, 23)}…)`);
  }
  const zipOk = execFileSync('python3', ['-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip() is None and "Bajío" in z.read("word/document.xml").decode())', `${DIR}/politica-de-calidad-v1.docx`], { encoding: 'utf8' }).trim();
  const pdf = readFileSync(`${DIR}/politica-de-calidad-v1.pdf`, 'latin1');
  return marca(ev, zipOk === 'True', 'el DOCX abre como zip válido y trae el documento') && marca(ev, pdf.startsWith('%PDF-1.4') && pdf.includes('xref'), 'PDF 1.4 con tabla xref');
});

await paso(16, 'La casa: la app como su primer inquilino (inventario de sus agentes)', false, async (ev, caps) => {
  const k = await como('casa.admin');
  const K = await orgId(k, 'la casa');
  await k.goto(`${BASE}/sgi/${K}/contexto`);
  const n = await k.locator('[data-prueba=inventario-ia] li').count();
  await foto(k, '20-casa-inventario-ia', caps);
  return marca(ev, n === 9, `${n} agentes en su inventario de IA`);
});

await paso(17, 'La casa: SoA, impacto y política de IA propuestos por sus propios agentes, pendientes del laboratorio', true, async (ev, caps) => {
  const k = await como('casa.admin');
  const K = await orgId(k, 'la casa');
  for (const [pagina, que] of [['soa', 'soa'], ['riesgos', 'impacto']] as const) {
    await k.goto(`${BASE}/sgi/${K}/${pagina}`);
    await k.locator(`[data-prueba=agente-${que}]`).click();
    await k.waitForURL(/(aviso|error)=/, { timeout: 240_000 });
    marca(ev, /Propuesta lista/.test(await aviso(k)), `${que}: ${await aviso(k)}`);
    await foto(k, `21-casa-${que}`, caps);
  }
  await k.goto(`${BASE}/sgi/${K}/soa`);
  await k.locator('[data-prueba=foto-soa]').click();
  await k.waitForURL(/documentos\/[0-9a-f-]{36}/);
  await foto(k, '22-casa-soa-pendiente', caps);
  const aps = await k.locator('[data-prueba=aprobaciones]').innerText();
  return marca(ev, /Sin aprobaciones/.test(aps), 'versión en revisión, pendiente del laboratorio (alta dirección de la casa)');
});

await paso(18, 'Migración de edición 9001:2015+A1 → 9001:2026', false, async (ev, caps) => {
  await admin.goto(`${BASE}/sgi/${M}/migracion`);
  const t = await admin.locator('[data-prueba=migracion]').innerText();
  await foto(admin, '23-migracion', caps);
  return marca(ev, /nuevos/.test(t), t.replaceAll('\n', ' · '));
});

await paso(19, 'El laboratorio, en vivo', false, async (ev, caps) => {
  const p = await (await navegador.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  await p.goto(`${BASE}/laboratorio-sgi`);
  await foto(p, '24-laboratorio', caps);
  return marca(ev, (await p.locator('[data-prueba=casos] tbody tr').count()) >= 79, `${await p.locator('[data-prueba=casos] tbody tr').count()} casos`);
});

await navegador.close();
writeFileSync(`${DIR}/recorrido.json`, `${JSON.stringify({ cuando: new Date().toISOString(), base: BASE, conLlm: CON_LLM, pasos: registro }, null, 1)}\n`);
const corridos = registro.filter((r) => !r.evidencia[0]?.startsWith('NO CORRIDO'));
console.log(`\n${corridos.filter((r) => r.ok).length}/${corridos.length} pasos corridos en verde · ${registro.length - corridos.length} sin correr (piden agente)`);
process.exit(corridos.every((r) => r.ok) ? 0 : 1);
