/**
 * Las pantallas del DoF que no son registro ni agenda: «Mis citas» tras entrar, el chatbot por escrito y por
 * voz, la urgencia derivada, y del laboratorio el buzón (recordatorio y newsletter) y Telegram con el reel.
 */
import type { Page } from 'playwright';
import { auditaA11y, captura, contexto, type Vista } from './navegador.ts';
import { entra, paciente } from './flujos.ts';
import { buzon } from './recorrido-pasos.ts';
import { BASE } from './servidor.ts';
import { esperaVoz, habla, type MedidaTurno } from './voz.ts';

type Anota = (paciente: string, paso: string, resultado: unknown) => void;
export const latenciasChat: MedidaTurno[] = [];

export async function misCitasCapturas(anota: Anota): Promise<void> {
  for (const [id, vista] of [['sin-consentimiento-salud', 'escritorio'], ['baja-newsletter', 'celular']] as const) {
    const ctx = await contexto(vista);
    const p = await ctx.newPage();
    await entra(p, paciente(id));
    await p.getByRole('heading', { name: /Hola,/ }).waitFor();
    await captura(p, vista, '06-entrar-y-mis-citas', true);
    await auditaA11y(p, vista, 'mis-citas');
    anota(id, 'entra → mis citas', p.url().replace(BASE, ''));
    await ctx.close();
  }
}

async function pregunta(p: Page, texto: string): Promise<string> {
  await p.locator('#chat-texto').fill(texto);
  // Se espera al panel, no a la respuesta: con la guardia de red, `response.finished()` no resuelve en un flujo NDJSON.
  await p.getByRole('button', { name: 'Enviar' }).click();
  await p.locator('section[data-enviando="si"]').waitFor({ timeout: 5_000 }).catch(() => undefined);
  await p.locator('section[data-enviando="no"]').waitFor({ timeout: 60_000 });
  await p.waitForTimeout(300);
  return p.locator('section[aria-label^="Asistente de"] ol li').last().innerText();
}

async function chatPorEscrito(vista: Vista, clinica: string, anota: Anota): Promise<void> {
  const ctx = await contexto(vista);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/clinica/${clinica}`, { waitUntil: 'networkidle' });
  await p.getByRole('region', { name: 'Preferencias de analítica' }).getByRole('button', { name: 'Rechazar' }).click();
  await p.getByRole('button', { name: /Chatbot: no/ }).click();
  anota(`visitante-${vista}`, 'chat: precio', await pregunta(p, '¿Cuánto cuesta una limpieza dental?'));
  anota(`visitante-${vista}`, 'chat: diagnóstico', await pregunta(p, 'Me duele la muela con lo frío, ¿qué tengo?'));
  await captura(p, vista, '07-chatbot-texto');
  await auditaA11y(p, vista, 'chatbot');
  anota(`visitante-${vista}`, 'chat: urgencia', await pregunta(p, 'Tengo la cara hinchada y me cuesta tragar'));
  await captura(p, vista, '09-urgencia-derivada');
  await ctx.close();
}

async function chatPorVoz(vista: Vista, clinica: string, anota: Anota): Promise<void> {
  const ctx = await contexto(vista, { voz: true });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/clinica/${clinica}`, { waitUntil: 'networkidle' });
  await p.getByRole('region', { name: 'Preferencias de analítica' }).getByRole('button', { name: 'Aceptar analítica' }).click();
  await p.getByRole('button', { name: /Voz: no/ }).click();
  await p.getByRole('button', { name: /Chatbot: no/ }).click();
  await p.getByRole('button', { name: 'Hablar con el asistente' }).click();
  await esperaVoz(p);
  for (const t of ['¿A qué hora abren?', '¿Cuánto cuesta la limpieza dental?']) {
    const m = await habla(p, t);
    latenciasChat.push(m);
    // Lo oído tiene que quedar en el chat como burbuja del usuario, también cuando el turno fue al LLM (defecto del 16/10).
    const enChat = m.oido ? await p.locator('section[aria-label^="Asistente de"] ol li', { hasText: m.oido }).count() : 0;
    if (!enChat) throw new Error(`el chat no muestra la pregunta oída «${m.oido ?? ''}» (ruta ${m.ruta ?? '—'})`);
    anota(`voz-${vista}`, `«${t}»`, { ruta: m.ruta, oido: m.oido, msExterna: m.msExterna, enChat: true });
  }
  await captura(p, vista, '08-chatbot-voz');
  await ctx.close();
}

export async function asistenteEnLaUi(anota: Anota): Promise<void> {
  await chatPorEscrito('escritorio', 'maguey', anota);
  await chatPorEscrito('celular', 'colibri', anota);
  await chatPorVoz('escritorio', 'maguey', anota);
  await chatPorVoz('celular', 'colibri', anota);
  const ctx = await contexto('escritorio');
  const p = await ctx.newPage();
  await entra(p, paciente('adulto-convenio'));
  await p.getByRole('button', { name: /Chatbot: no/ }).click();
  anota('adulto-convenio', 'chat: mis citas', await pregunta(p, 'Mis citas'));
  await ctx.close();
}

export async function capturasDelLaboratorio(anota: Anota): Promise<void> {
  const correos = buzon();
  const p1 = paciente('adulto-convenio').registro.correo;
  const recordatorio = correos.find((e) => e.para === p1 && e.asunto.startsWith('Mañana es tu cita'));
  const newsletter = correos.find((e) => e.para === p1 && e.masivo);
  for (const vista of ['escritorio', 'celular'] as const) {
    const ctx = await contexto(vista);
    const p = await ctx.newPage();
    for (const [nombre, e] of [['04-correo-recordatorio', recordatorio], ['04-correo-newsletter', newsletter]] as const) {
      if (!e) continue;
      await p.goto(`${BASE}/laboratorio-clinica-dental/buzon?id=${encodeURIComponent(e.idMensaje)}`, { waitUntil: 'networkidle' });
      await captura(p, vista, nombre, true);
    }
    await p.goto(`${BASE}/laboratorio-clinica-dental/telegram?chat=DentalColibriLabbot:900001003`, { waitUntil: 'networkidle' });
    await p.locator('video').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    await p.waitForTimeout(1_500);
    await captura(p, vista, '05-telegram-reel', true);
    await ctx.close();
  }
  anota('laboratorio', 'capturas del buzón y Telegram', { recordatorio: Boolean(recordatorio), newsletter: Boolean(newsletter) });
}
