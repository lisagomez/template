/**
 * EL RECORRIDO DE WHATSAPP en el navegador, de punta a punta, con pacientes sintéticos y Meta simulada:
 *
 *   1. consentimiento de WhatsApp en el registro;
 *   2. vinculación: código desde «Mis citas» → el número lo manda por WhatsApp → la persona confirma en su cuenta
 *      (y el enlace REENVIADO: un tercero lo manda primero, la persona ve «no es tu celular» y lo rechaza);
 *   3. el recordatorio de 24 h (plantilla, ventana cerrada) y la respuesta «Confirmo»;
 *   4. un Flow REPROGRAMANDO: «Cambiar cita» → día → hora → «Confirmar cambio»;
 *   5. una URGENCIA derivada por regla en la respuesta a un recordatorio;
 *   6. «Mis citas» con el estado de los avisos de WhatsApp;
 *   y además nota de voz (voz local → ASR local), foto, y la recepción que toma el chat (coexistencia).
 * Cada estado se captura en escritorio y en celular; axe en las páginas nuevas; guardia de red en el navegador y en
 * el servidor. El tablero (flujo 7) se captura después de la capa semántica (`capturas-tablero.ts`).
 *
 *   CLINICA_DATOS=~/.clinica-dental-whatsapp CLINICA_CAPTURAS=docs/goals/clinica-dental-whatsapp-capturas \
 *     node scripts/clinica-dental/whatsapp/recorrido.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { cierra, contexto, registro } from '../navegador.ts';
import { paciente } from '../flujos.ts';
import { DATOS } from '../rutas.ts';
import { BASE, reiniciaLaboratorio } from '../servidor.ts';
import { agendaPorWhatsapp, avanza, avanzaFlow, dos, enAmbas, escribe, misCitas, numeroDe, pantallaFlow, pideCodigo, registraConWhatsapp, telefonoUrl, toca } from './pasos.ts';

const MEDICION = join(process.cwd(), 'docs/goals/clinica-dental-whatsapp-medicion');
/** La sección «Mi WhatsApp» al centro de la vista (al pie la tapan los interruptores flotantes de voz y chatbot). */
const centra = (p: import('playwright').Page) => p.locator('section[aria-labelledby="mi-whatsapp"]').evaluate((e) => e.scrollIntoView({ block: 'center' }));
const HORA_MS = 3_600_000;
const pasos: { paso: string; ms: number }[] = [];
const t = async (paso: string, f: () => Promise<void>) => {
  const t0 = Date.now();
  await f();
  pasos.push({ paso, ms: Date.now() - t0 });
  console.log(`  ✓ ${paso} (${Date.now() - t0} ms)`);
};

async function vinculaSinCapturas(id: string, dias: number, hora: string): Promise<void> {
  const s = paciente(id);
  const ctx = await contexto('escritorio');
  const p = await ctx.newPage();
  await registraConWhatsapp(p, s, null);
  await agendaPorWhatsapp(p, s, dias, hora);
  const { texto } = await pideCodigo(p, s);
  const tel = await ctx.newPage();
  await tel.goto(telefonoUrl(s.clinica, numeroDe(s), texto), { waitUntil: 'networkidle' });
  await escribe(tel, null);
  await p.goto(`${BASE}/clinica/${s.clinica}/mis-citas`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Sí, es mi número' }).click();
  await p.locator('[data-whatsapp="vinculado"]').waitFor({ timeout: 20_000 });
  await ctx.close();
}

async function principal(): Promise<void> {
  await reiniciaLaboratorio();
  const p1 = paciente('adulto-convenio');
  const tel1 = telefonoUrl(p1.clinica, numeroDe(p1));
  const vistas = await dos();
  const ctx = await contexto('escritorio');
  const p = await ctx.newPage();

  await t('1 · registro con el consentimiento de WhatsApp (escritorio y celular)', async () => {
    const cel = await vistas.celular.newPage();
    await cel.goto(`${BASE}/clinica/${p1.clinica}/registro`, { waitUntil: 'networkidle' });
    const { llenaCuestionario } = await import('../flujos.ts');
    await llenaCuestionario(cel, p1);
    await cel.locator('#consentimientos-recordatorios').check();
    await cel.locator('#consentimientos-whatsapp').check();
    await cel.locator('#consentimientos-whatsapp').scrollIntoViewIfNeeded();
    const { captura } = await import('../navegador.ts');
    await captura(cel, 'celular', '01-registro-consentimiento-whatsapp');
    await cel.close();
    await registraConWhatsapp(p, p1, 'escritorio');
  });
  await t('agenda con avisos por WhatsApp (queda esperando la vinculación)', () => agendaPorWhatsapp(p, p1));
  let texto = '';
  await t('2a · «Vincular WhatsApp»: código de un solo uso y enlace wa.me', async () => {
    texto = (await pideCodigo(p, p1)).texto;
    await misCitas(vistas.escritorio, p1);
    await misCitas(vistas.celular, p1);
    await enAmbas(vistas, `${BASE}/clinica/${p1.clinica}/mis-citas`, '02a-vincular-codigo', { antes: centra, axe: 'mis-citas-codigo' });
  });
  await t('2b · el código sale por WhatsApp desde el número de la persona', async () => {
    const tel = await ctx.newPage();
    await tel.goto(telefonoUrl(p1.clinica, numeroDe(p1), texto), { waitUntil: 'networkidle' });
    await escribe(tel, null);
    await tel.close();
    await enAmbas(vistas, tel1, '02b-telefono-codigo', { axe: 'telefono' });
  });
  await t('2c · la persona confirma desde su cuenta que el número es suyo', async () => {
    await enAmbas(vistas, `${BASE}/clinica/${p1.clinica}/mis-citas`, '02c-vincular-confirmar', { antes: centra, axe: 'mis-citas-pendiente' });
    await p.goto(`${BASE}/clinica/${p1.clinica}/mis-citas`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Sí, es mi número' }).click();
    await p.locator('[data-whatsapp="vinculado"]').waitFor({ timeout: 20_000 });
    await enAmbas(vistas, tel1, '02d-telefono-vinculado');
  });
  await t('enlace REENVIADO: un tercero manda el código primero y la persona lo rechaza', () => enlaceReenviado(vistas));
  await t('otra clínica: una paciente de Colibrí vincula su WhatsApp (para la medición)', () => vinculaSinCapturas('baja-newsletter', 4, '12:00'));
  await t('3 · recordatorio de 24 h como PLANTILLA (ventana cerrada) y «Confirmo»', async () => {
    await avanza(50 * HORA_MS + 30 * 60_000);
    const tel = await ctx.newPage();
    await tel.goto(tel1, { waitUntil: 'networkidle' });
    await toca(tel, 'Confirmo');
    await tel.close();
    await enAmbas(vistas, tel1, '03-recordatorio-y-respuesta');
  });
  await t('5 · URGENCIA en la respuesta a un recordatorio (regla, sin LLM)', async () => {
    const tel = await ctx.newPage();
    await tel.goto(tel1, { waitUntil: 'networkidle' });
    await escribe(tel, 'Gracias. Oye, me duele mucho la muela y se me está hinchando la cara hasta el ojo');
    await tel.close();
    await enAmbas(vistas, tel1, '05-urgencia-derivada');
  });
  await t('nota de voz (voz local → ASR local) y foto (nunca se baja)', async () => {
    const tel = await ctx.newPage();
    await tel.goto(tel1, { waitUntil: 'networkidle' });
    const n = await tel.locator('li[data-lado]').count();
    await tel.getByRole('button', { name: 'Mandar nota de voz' }).click();
    await tel.locator('li[data-lado]').nth(n + 1).waitFor({ timeout: 60_000 });
    await tel.getByRole('button', { name: 'Mandar foto (sintética)' }).click();
    await tel.locator('li[data-lado]').nth(n + 3).waitFor({ timeout: 30_000 });
    await tel.close();
    await enAmbas(vistas, tel1, '09-voz-y-foto');
  });
  await t('6 · «Mis citas» con el estado de los avisos de WhatsApp', () => enAmbas(vistas, `${BASE}/clinica/${p1.clinica}/mis-citas`, '06-mis-citas-whatsapp', { completa: true, axe: 'mis-citas-vinculado' }));
  await t('4 · Flow REPROGRAMANDO (otra paciente, cita a 5 días)', () => reprogramaPorFlow(vistas));
  await t('coexistencia: la recepción contesta desde su celular y el asistente calla', async () => {
    const tel = await ctx.newPage();
    await tel.goto(tel1, { waitUntil: 'networkidle' });
    await tel.getByRole('button', { name: 'Contestar desde el celular' }).click();
    await tel.waitForTimeout(1_000);
    await tel.locator('#wa-texto').fill('Perfecto, gracias. ¿Y cuánto cuesta la limpieza?');
    await tel.getByRole('button', { name: 'Enviar' }).click();
    await tel.waitForTimeout(2_000);
    await tel.close();
    await enAmbas(vistas, tel1, '12-recepcion-coexistencia');
  });
  await ctx.close();
  for (const v of Object.values(vistas)) await v.close();
  await cierra();
  escribeResultado();
}

async function enlaceReenviado(vistas: Awaited<ReturnType<typeof dos>>): Promise<void> {
  const s = paciente('correo-que-rebota');
  const ctx = await contexto('escritorio');
  const p = await ctx.newPage();
  await registraConWhatsapp(p, s, null);
  const { codigo } = await pideCodigo(p, s);
  const tercero = await ctx.newPage();
  await tercero.goto(telefonoUrl(s.clinica, '5215598765432', `Hola, quiero vincular mi WhatsApp. Mi código es ${codigo}`), { waitUntil: 'networkidle' });
  await escribe(tercero, null);
  await misCitas(vistas.escritorio, s);
  await misCitas(vistas.celular, s);
  // Las sesiones de las vistas pasan a ser de esta paciente; la 1 vuelve a entrar después.
  await enAmbas(vistas, `${BASE}/clinica/${s.clinica}/mis-citas`, '08a-enlace-reenviado-pendiente', { antes: centra });
  await p.goto(`${BASE}/clinica/${s.clinica}/mis-citas`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'No fui yo' }).click();
  await p.getByText('Descartado').waitFor();
  const propio = await ctx.newPage();
  await propio.goto(telefonoUrl(s.clinica, numeroDe(s), `Mi código es ${codigo}`), { waitUntil: 'networkidle' });
  await escribe(propio, null);
  await enAmbas(vistas, telefonoUrl(s.clinica, '5215598765432'), '08b-enlace-reenviado-tercero');
  await ctx.close();
  await misCitas(vistas.escritorio, paciente('adulto-convenio'));
  await misCitas(vistas.celular, paciente('adulto-convenio'));
}

async function reprogramaPorFlow(vistas: Awaited<ReturnType<typeof dos>>): Promise<void> {
  const s = paciente('registro-por-voz');
  await vinculaSinCapturas(s.id, 5, '09:30');
  const tel = telefonoUrl(s.clinica, numeroDe(s));
  const ctx = await contexto('celular');
  const p = await ctx.newPage();
  await p.goto(tel, { waitUntil: 'networkidle' });
  await toca(p, 'Cambiar cita');
  await p.locator('li[data-lado] button', { hasText: 'Cambiar mi cita' }).last().click();
  await pantallaFlow(p, 'DIA');
  await enAmbas(vistas, tel, '04a-flow-reprograma-dia');
  await avanzaFlow(p, { n: 2 }, 'Ver horarios', 'HORA');
  await avanzaFlow(p, { n: 1 }, 'Continuar', 'CONFIRMA');
  await enAmbas(vistas, tel, '04b-flow-reprograma-confirma');
  await avanzaFlow(p, null, 'Confirmar cambio', null);
  await p.waitForTimeout(1_500);
  await ctx.close();
  await enAmbas(vistas, tel, '04c-flow-reprogramada');
}

function escribeResultado(): void {
  mkdirSync(MEDICION, { recursive: true });
  const red = JSON.parse(readFileSync(join(DATOS, 'red-servidor.json'), 'utf8')) as Record<string, number>;
  const aMeta = Object.keys(red).filter((h) => /facebook|whatsapp|meta|fbcdn/i.test(h));
  const salida = { cuando: new Date().toISOString(), pasos, navegador: { peticionesExternas: registro.externas, erroresConsola: registro.errores }, servidor: { hosts: red, hostsDeMeta: aMeta }, axe: registro.axe };
  writeFileSync(join(MEDICION, 'recorrido.json'), `${JSON.stringify(salida, null, 1)}\n`);
  const serias = registro.axe.reduce((n, a) => n + a.serias.length, 0);
  console.log(`\n  ${pasos.length} pasos · navegador: ${registro.externas.length} peticiones externas, ${registro.errores.length} errores de consola · axe: ${serias} serias o críticas en ${registro.axe.length} páginas`);
  console.log(`  servidor salió a: ${JSON.stringify(red)} · hosts de Meta: ${aMeta.length}`);
}

principal().catch(async (e) => {
  console.error(`✗ ${e instanceof Error ? e.stack : String(e)}`);
  await cierra();
  process.exit(1);
});
