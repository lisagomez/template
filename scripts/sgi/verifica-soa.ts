/**
 * La mitad DETERMINISTA del paso 9 del recorrido, sin agente y sin gasto: con las filas de la SoA que ya existen,
 * la consultora prepara la versión, que debe quedar EN REVISIÓN (no genérica), y la alta dirección la aprueba.
 * Uso: node scripts/sgi/verifica-soa.ts [--base http://localhost:3012] [--org Maquinados]
 */
import { readFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const BASE = arg('base') ?? 'http://localhost:3012';
const ORG = arg('org') ?? 'Maquinados';
const cuentas = JSON.parse(readFileSync('supabase/.temp/sgi-cuentas.json', 'utf8')) as Record<string, { correo: string; clave: string }>;
const navegador = await chromium.launch();
const errores: string[] = [];
async function como(cuenta: string): Promise<Page> {
  const p = await (await navegador.newContext({ viewport: { width: 1360, height: 900 }, locale: 'es-MX' })).newPage();
  p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().split('\n')[0]!.slice(0, 200)); });
  await p.goto(`${BASE}/login?siguiente=/sgi`);
  await p.fill('input[name=correo]', cuentas[cuenta]!.correo);
  await p.fill('input[name=contrasena]', cuentas[cuenta]!.clave);
  await p.click('button[type=submit]');
  await p.waitForURL((u) => u.pathname === '/sgi');
  return p;
}
const c = await como('consultora');
const href = await c.locator('[data-prueba=organizaciones] a', { hasText: ORG }).first().getAttribute('href');
const org = href!.split('/').pop()!;
await c.goto(`${BASE}/sgi/${org}/soa`);
const filas = await c.locator('[data-prueba=soa] tbody tr').filter({ hasNotText: 'sin decidir' }).count();
await c.locator('[data-prueba=foto-soa]').click();
await c.waitForURL(/documentos\/[0-9a-f-]{36}/);
const estado = await c.locator('main').innerText();
const version = c.url().split('/').pop()!.split('?')[0]!;
const dir = await como('maquinados.direccion');
await dir.goto(`${BASE}/sgi/${org}/documentos/${version}`);
await dir.locator('select[name=rol]').selectOption('alta_direccion');
const antes = dir.url();
await dir.locator('[data-prueba=aprobar]').click();
await dir.waitForURL((u) => u.href !== antes && /(aviso|error)=/.test(u.href));
await dir.screenshot({ path: '.claude/goals/sistema-integrado-iso/capturas/12-soa-aprobada.png', fullPage: true });
const aps = await dir.locator('[data-prueba=aprobaciones]').innerText();
const ok = [
  [filas >= 1, `${filas} controles decididos en la tabla`],
  [!/Genérico/.test(estado) && /Organización: /.test(estado), 'la versión abre con la organización y su alcance, y NO es genérica'],
  [/aprobado/i.test(aps) && /sha256:/.test(aps), `aprobada por la alta dirección: ${aps.split('\n')[0]}`],
  [errores.length === 0, `${errores.length} error(es) de consola`],
] as const;
for (const [b, t] of ok) console.log(`${b ? '✓' : '✗'} ${t}`);
await navegador.close();
process.exit(ok.every(([b]) => b) ? 0 : 1);
