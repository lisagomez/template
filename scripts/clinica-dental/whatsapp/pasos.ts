/**
 * Los pasos del recorrido de WhatsApp, como los haría una persona: en el PORTAL (registro con el consentimiento,
 * agenda con WhatsApp, vincular desde «Mis citas») y en SU TELÉFONO (el WhatsApp simulado del laboratorio: escribir,
 * tocar botones, llenar un Flow). Cada estado se captura en escritorio Y en celular: la acción ocurre una vez y se
 * fotografía desde los dos tamaños (el estado vive en el servidor).
 */
import type { BrowserContext, Page } from 'playwright';
import { auditaA11y, captura, contexto, eligeCookies, type Vista } from '../navegador.ts';
import { confirmaCita, entra, envíaRegistro, fechaDe, llenaCuestionario, type Sintetico } from '../flujos.ts';
import { BASE, laboratorio } from '../servidor.ts';

export const numeroDe = (s: Sintetico): string => `521${s.registro.celular.replace(/\D/g, '').slice(-10)}`;
/** Quién escribe desde su número vinculado en la medición del asistente, por clínica (la medición y el juez lo comparten). */
export const QUIEN_MIDE: Record<string, string> = { maguey: 'adulto-convenio', colibri: 'baja-newsletter' };
/** El número y el texto van en el fragmento (`#…`): el navegador no los manda al servidor ni quedan en su log. */
export const telefonoUrl = (clinica: string, numero: string, texto = '') => `${BASE}/laboratorio-clinica-dental/whatsapp?clinica=${clinica}#numero=${numero}${texto ? `&texto=${encodeURIComponent(texto)}` : ''}`;

/** Un contexto por tamaño, con la guardia de red (navegador.ts aborta y anota toda petición que no sea la app). */
export async function dos(): Promise<Record<Vista, BrowserContext>> {
  return { escritorio: await contexto('escritorio'), celular: await contexto('celular') };
}

/** La misma URL, fotografiada desde los dos tamaños (y axe en los dos). */
export async function enAmbas(ctxs: Record<Vista, BrowserContext>, url: string, nombre: string, op: { completa?: boolean; antes?: (p: Page) => Promise<void>; axe?: string } = {}): Promise<void> {
  for (const vista of ['escritorio', 'celular'] as const) {
    const p = await ctxs[vista].newPage();
    await p.goto(url, { waitUntil: 'networkidle' });
    await eligeCookies(p, false);
    await op.antes?.(p);
    await p.waitForTimeout(300);
    await captura(p, vista, nombre, op.completa ?? false);
    if (op.axe) await auditaA11y(p, vista, op.axe);
    await p.close();
  }
}

/** Registro por escrito marcando WhatsApp (además de lo que el paciente sintético declara). Deja la sesión abierta. */
export async function registraConWhatsapp(p: Page, s: Sintetico, vista: Vista | null): Promise<void> {
  await p.goto(`${BASE}/clinica/${s.clinica}/registro`, { waitUntil: 'networkidle' });
  await eligeCookies(p, false);
  await llenaCuestionario(p, s);
  await p.locator('#consentimientos-recordatorios').check();
  await p.locator('#consentimientos-whatsapp').check();
  if (vista) {
    await p.locator('#consentimientos-whatsapp').scrollIntoViewIfNeeded();
    await captura(p, vista, '01-registro-consentimiento-whatsapp');
  }
  await envíaRegistro(p);
}

/** Agenda con avisos por WhatsApp y confirma. */
export async function agendaPorWhatsapp(p: Page, s: Sintetico, dias = s.cita.diasAdelante, hora = s.cita.hora): Promise<void> {
  await p.goto(`${BASE}/clinica/${s.clinica}/agenda`, { waitUntil: 'networkidle' });
  await p.locator(`input[name="servicio"][value="${s.cita.servicio}"]`).check();
  const fecha = fechaDe(dias);
  await p.locator(`[data-dia="${fecha}"]`).waitFor({ timeout: 30_000 });
  await p.locator(`[data-dia="${fecha}"]`).click();
  await p.locator(`[data-hora="${hora}"]`).click();
  await p.locator('input[name="canal-aviso"][value="whatsapp"]').check();
  if ((await confirmaCita(p)) !== 'confirmada') throw new Error(`${s.id}: el hueco ya no estaba`);
  await p.getByText('Falta un paso para WhatsApp').waitFor();
}

/** «Mis citas» → «Vincular WhatsApp»: devuelve el código y el texto prellenado del enlace `wa.me`. */
export async function pideCodigo(p: Page, s: Sintetico): Promise<{ codigo: string; texto: string }> {
  await p.goto(`${BASE}/clinica/${s.clinica}/mis-citas`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Vincular WhatsApp' }).click();
  const codigo = p.locator('[data-codigo-whatsapp]');
  await codigo.waitFor({ timeout: 20_000 });
  const enlace = (await p.locator('[data-enlace-whatsapp]').getAttribute('data-enlace-whatsapp')) ?? '';
  return { codigo: (await codigo.getAttribute('data-codigo-whatsapp')) ?? '', texto: new URL(enlace).searchParams.get('text') ?? '' };
}

const burbujas = async (p: Page) => Number(await p.locator('ol[data-burbujas]').getAttribute('data-burbujas'));

/** Espera a que el chat tenga MÁS burbujas que `n` y a que la clínica haya contestado. */
async function esperaRespuesta(p: Page, n: number): Promise<void> {
  for (const limite = Date.now() + 45_000; Date.now() < limite; await p.waitForTimeout(250)) {
    if ((await burbujas(p)) > n && (await p.locator('li[data-lado]').last().getAttribute('data-lado')) !== 'paciente') return;
  }
}

/** En el teléfono: escribe (o manda lo que el campo ya traía) y espera la respuesta. */
export async function escribe(p: Page, texto: string | null): Promise<void> {
  const n = await burbujas(p);
  if (texto !== null) await p.locator('#wa-texto').fill(texto);
  await p.getByRole('button', { name: 'Enviar' }).click();
  await esperaRespuesta(p, n + 1);
}

export async function toca(p: Page, boton: string): Promise<void> {
  const n = await burbujas(p);
  await p.locator('li[data-lado] button', { hasText: boton }).last().click();
  await esperaRespuesta(p, n + 1);
}

/** Espera la pantalla del Flow (o que se cierre). */
export async function pantallaFlow(p: Page, pantalla: string | null): Promise<void> {
  if (pantalla) await p.locator(`[role="dialog"][data-pantalla="${pantalla}"]`).waitFor({ timeout: 30_000 });
  else await p.locator('[role="dialog"][data-pantalla]').waitFor({ state: 'detached', timeout: 30_000 });
}

/** En el Flow: elige la opción `n` (o la que diga `texto`) y toca el botón del pie. */
export async function avanzaFlow(p: Page, eleccion: { n?: number; texto?: string } | null, boton: string, siguiente: string | null): Promise<void> {
  if (eleccion) {
    const opciones = p.locator('[role="dialog"] input[type="radio"]');
    if (eleccion.texto) await p.locator('[role="dialog"] label', { hasText: eleccion.texto }).first().click();
    else await opciones.nth(eleccion.n ?? 0).check();
  }
  await p.locator('[role="dialog"] button', { hasText: boton }).click();
  await pantallaFlow(p, siguiente);
}

/**
 * Deja el contexto con la sesión de ESTE paciente. «Entrar» redirige a quien ya entró, y «Salir» depende de que la
 * página haya hidratado: borrar las cookies del contexto cierra la sesión anterior sin carreras.
 */
export async function misCitas(ctx: BrowserContext, s: Sintetico): Promise<void> {
  await ctx.clearCookies();
  const p = await ctx.newPage();
  await entra(p, s);
  await p.close();
}

export const avanza = (ms: number) => laboratorio({ accion: 'avanza', ms });
