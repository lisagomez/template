/**
 * Los pasos del recorrido: cada paciente sintético hace lo suyo en la página (registro escrito o con la guía de
 * voz, agenda, Telegram, baja, reprogramar, cancelar), con capturas y axe donde el DoF del spec las pide.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { auditaA11y, captura, contexto, dataLayer, eligeCookies, type Vista } from './navegador.ts';
import { confirmaCita, entra, envíaRegistro, fechaDe, llenaCuestionario, paciente, preparaCita, type Sintetico } from './flujos.ts';
import { DATOS } from './rutas.ts';
import { BASE, laboratorio } from './servidor.ts';
import { esperaVoz, habla, type MedidaTurno } from './voz.ts';

export const VISTA_DE: Record<string, Vista> = {
  'adulto-convenio': 'escritorio', 'menor-con-tutor': 'celular', 'sin-consentimiento-salud': 'escritorio', 'baja-newsletter': 'celular',
  'telegram-sin-vincular': 'escritorio', 'choque-de-hueco': 'celular', 'registro-por-voz': 'escritorio', 'correo-que-rebota': 'celular',
};
export const capas: unknown[][] = [];
export const latenciasGuia: MedidaTurno[] = [];

export async function nuevaPagina(s: Sintetico, op: { voz?: boolean; vista?: Vista } = {}): Promise<{ ctx: BrowserContext; p: Page; vista: Vista }> {
  const vista = op.vista ?? VISTA_DE[s.id] ?? 'escritorio';
  const ctx = await contexto(vista, op);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/clinica/${s.clinica}?canal=${s.canal}`, { waitUntil: 'networkidle' });
  await eligeCookies(p, s.id.length % 2 === 0);
  return { ctx, p, vista };
}

export async function cierraPagina(ctx: BrowserContext, p: Page): Promise<void> {
  capas.push(await dataLayer(p).catch(() => []));
  await ctx.close();
}

/** Registro por escrito; captura del cuestionario lleno (P1 escritorio, P2 celular) y axe del registro. */
export async function registroEscrito(s: Sintetico, p: Page, vista: Vista): Promise<string> {
  await p.goto(`${BASE}/clinica/${s.clinica}/registro`, { waitUntil: 'networkidle' });
  await llenaCuestionario(p, s);
  if (s.id === 'adulto-convenio' || s.id === 'menor-con-tutor') {
    await captura(p, vista, '01-registro-cuestionario', true);
    await auditaA11y(p, vista, 'registro');
  }
  return envíaRegistro(p);
}

const textoGuia = (p: Page) => p.locator('section[aria-labelledby="guia-titulo"] p:has-text("Guía:")').innerText().catch(() => '');
const DEPURA = process.env['CLINICA_DEPURA'] === '1';
async function dice(p: Page, texto: string): Promise<void> {
  // En la guía, el «cerebro» del bucle es la máquina de estados LOCAL: bucle-voz lo etiqueta `llm`, pero no hay LLM.
  const m = await habla(p, texto);
  latenciasGuia.push({ ...m, ruta: m.ruta === 'llm' ? 'guia-local' : m.ruta });
  if (DEPURA) console.log(`      «${texto}» → oyó ${JSON.stringify(m.oido)} · ${m.msExterna ?? '—'} ms · guía: ${(await textoGuia(p)).slice(0, 120)}`);
}

/** Un campo por voz: dice el valor, confirma con «sí»; si no lo entiende dos veces, «lo escribo» y lo teclea. */
async function campoPorVoz(p: Page, dicho: string, id: string | null, escrito: string | null): Promise<void> {
  for (let intento = 0; intento < 2; intento++) {
    await dice(p, dicho);
    if (/¿Es correcto/.test(await textoGuia(p))) {
      await dice(p, 'Sí, correcto.');
      if (/¿Es correcto/.test(await textoGuia(p))) await dice(p, 'Sí, es correcto.');
      return;
    }
  }
  await dice(p, 'Lo escribo.');
  if (id && escrito) await p.locator(`#${id}`).fill(escrito);
}

/** Registro con la GUÍA DE VOZ (micrófono falso, ASR y TTS locales). Solo se envía con «sí, envíalo». */
export async function registroPorVoz(s: Sintetico, p: Page, vista: Vista, enviar: boolean): Promise<string> {
  await p.getByRole('button', { name: /Voz: no/ }).click();
  await p.goto(`${BASE}/clinica/${s.clinica}/registro`, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Empezar la guía de voz' }).click();
  await esperaVoz(p);
  await p.waitForFunction(() => window.__clinicaVoz?.bucle.estado === 'escuchando', undefined, { timeout: 30_000 });
  const r = s.registro;
  await campoPorVoz(p, r.nombre, 'nombre', r.nombre);
  await campoPorVoz(p, r.apellidoPaterno, 'apellidoPaterno', r.apellidoPaterno);
  await campoPorVoz(p, r.apellidoMaterno ?? 'No tengo.', 'apellidoMaterno', r.apellidoMaterno ?? '');
  await campoPorVoz(p, 'Veintinueve años.', 'edad', String(r.edad));
  await p.locator('section[aria-labelledby="guia-titulo"]').scrollIntoViewIfNeeded();
  await captura(p, vista, '02-registro-guia-voz');
  await dice(p, 'Lo escribo.');
  await p.locator('#correo').fill(r.correo);
  await campoPorVoz(p, 'Cinco cinco, cero cero cero cero, uno cero cero siete.', 'celular', r.celular);
  await campoPorVoz(p, 'Ninguna.', null, null);
  await campoPorVoz(p, 'General y ortodoncia.', null, null);
  await campoPorVoz(p, 'Nada.', null, null);
  if (!enviar) return 'demostración sin enviar';
  for (const c of r.categorias) await p.locator(`#cat-${c}`).check();
  await p.locator('#contrasena').fill(s.contrasena);
  for (const k of ['recordatorios', 'aviso_privacidad']) await p.locator(`#consentimientos-${k}`).check();
  await dice(p, 'Sí, envíalo.');
  const listo = await p.getByRole('heading', { name: '¡Listo, ya estás registrado!' }).waitFor({ timeout: 30_000 }).then(() => true, () => false);
  if (!listo) throw new Error(`la guía no envió: guía «${await textoGuia(p)}» · errores ${JSON.stringify(await p.locator('[role="alert"], p.text-red-700').allInnerTexts())}`);
  return 'registrado por voz';
}

/** Agenda: hasta el resumen, captura (P1 escritorio, P2 celular) y axe; confirma; vincula Telegram si toca. */
export async function citaDe(s: Sintetico, p: Page, vista: Vista): Promise<string> {
  await preparaCita(p, s);
  if (s.id === 'adulto-convenio' || s.id === 'menor-con-tutor') {
    await captura(p, vista, '03-agenda-hueco-y-avisos', true);
    await auditaA11y(p, vista, 'agenda');
  }
  const r = await confirmaCita(p);
  if (r === 'confirmada') await vinculaSiToca(s, p);
  return r;
}

export async function vinculaSiToca(s: Sintetico, p: Page): Promise<void> {
  if (!s.telegram?.vincula) return;
  const enlace = await p.locator('[data-enlace-telegram]').first().getAttribute('data-enlace-telegram', { timeout: 15_000 });
  if (enlace) await laboratorio({ accion: 'abre-telegram', enlace, chatId: s.telegram.chatId, nombre: s.telegram.nombre });
}

/** El choque: dos pacientes confirman el MISMO hueco de la clínica de un sillón al mismo tiempo. */
export async function choque(a: Sintetico, pa: Page, b: Sintetico, pb: Page): Promise<{ a: string; b: string }> {
  await preparaCita(pa, a);
  await preparaCita(pb, b);
  const [ra, rb] = await Promise.all([confirmaCita(pa), confirmaCita(pb)]);
  return { a: ra, b: rb };
}

/**
 * El perdedor del choque elige otro horario: la alternativa declarada en la PAREJA. Quién pierde no está fijo (es una
 * carrera real: en una corrida perdió uno y en otra el otro), así que la hora no puede depender de quién perdió.
 */
export async function alternativa(s: Sintetico, p: Page, hora: string): Promise<string> {
  await p.locator(`[data-dia="${fechaDe(s.cita.diasAdelante)}"]`).click();
  await p.locator(`[data-hora="${hora}"]`).click();
  await p.locator('input[name="canal-aviso"][value="correo"]').check();
  return confirmaCita(p);
}

interface Enviado { idMensaje: string; para: string; asunto: string; masivo: boolean; eml: string }
export const buzon = (): Enviado[] => readFileSync(join(DATOS, 'buzon', 'indice.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Enviado);

/** La baja de un clic como la hace Gmail: POST al List-Unsubscribe, sin cookies ni sesión. */
export async function bajaUnClic(s: Sintetico): Promise<{ status: number; token: string }> {
  const n = buzon().find((e) => e.masivo && e.para === s.registro.correo);
  const token = /baja\/(tok_[0-9a-f]{20})>/.exec(n?.eml ?? '')?.[1];
  if (!token) throw new Error(`no llegó newsletter a ${s.id}`);
  const r = await fetch(`${BASE}/api/clinica-dental/baja/${token}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
  return { status: r.status, token };
}

export async function reprogramaDesdeMisCitas(s: Sintetico, nuevaFecha: string, hora: string): Promise<string> {
  const { ctx, p } = await nuevaPagina(s);
  await entra(p, s);
  await p.getByRole('link', { name: 'Cambiar' }).first().click();
  await p.locator(`[data-dia="${nuevaFecha}"]`).waitFor({ timeout: 30_000 });
  await p.locator(`[data-dia="${nuevaFecha}"]`).click();
  await p.locator(`[data-hora="${hora}"]`).click();
  const r = await confirmaCita(p);
  await cierraPagina(ctx, p);
  return r;
}

export async function cancelaDesdeMisCitas(s: Sintetico): Promise<string> {
  const { ctx, p } = await nuevaPagina(s);
  await entra(p, s);
  await p.getByRole('button', { name: 'Cancelar' }).first().click();
  await p.getByRole('button', { name: 'Sí, cancelar' }).click();
  await p.getByText(/Cita cancelada/).waitFor({ timeout: 20_000 });
  await cierraPagina(ctx, p);
  return 'cancelada';
}

export const p = paciente;
