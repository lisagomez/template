/**
 * Los flujos del paciente, como los haría una persona en la página (clic y teclado, nada por detrás): registro
 * con cuestionario, agenda con hueco y selector de avisos, entrar. Cada paciente sintético declara qué marca.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { BASE } from './servidor.ts';

export interface Sintetico {
  id: string; caso: string; clinica: string; contrasena: string; canal: string; via: 'escrito' | 'voz';
  registro: Record<string, unknown> & { nombre: string; apellidoPaterno: string; apellidoMaterno?: string; edad: number; correo: string; celular: string; empresa?: string; padecimiento?: string; categorias: string[]; consentimientos: Record<string, boolean>; tutor?: Record<string, string | boolean> };
  cita: { servicio: string; diasAdelante: number; hora: string; canales: ('correo' | 'telegram')[]; newsletter: boolean; choqueCon?: string; alternativa?: string };
  telegram?: { vincula: boolean; chatId?: number; nombre?: string };
  bajaNewsletter?: boolean;
  asiste: boolean;
}

export const PACIENTES = (JSON.parse(readFileSync(join(process.cwd(), 'tools/clinica-dental/laboratorio/pacientes.json'), 'utf8')) as { pacientes: Sintetico[] }).pacientes;
export const paciente = (id: string) => PACIENTES.find((p) => p.id === id)!;
export const INICIO = Date.parse('2026-10-19T08:00:00-06:00');

/** La fecha local (AAAA-MM-DD) de `dias` después del lunes 19 de octubre de 2026. */
export const fechaDe = (dias: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(INICIO + dias * 86_400_000));

const llena = async (p: Page, id: string, valor: string | number | undefined) => {
  if (valor === undefined || valor === '') return;
  await p.locator(`#${id}`).fill(String(valor));
};

export async function llenaCuestionario(p: Page, s: Sintetico, conContrasena = true): Promise<void> {
  const r = s.registro;
  for (const k of ['nombre', 'apellidoPaterno', 'apellidoMaterno', 'edad', 'correo', 'celular', 'empresa'] as const) await llena(p, k, r[k] as string | number | undefined);
  for (const c of r.categorias) await p.locator(`#cat-${c}`).check();
  if (r.padecimiento) await llena(p, 'padecimiento', r.padecimiento);
  if (r.consentimientos['datos_salud']) await p.locator('#consentimientos-datos_salud').check();
  if (r.tutor) {
    const t = r.tutor;
    await llena(p, 'tutor-nombre', t['nombre'] as string);
    await llena(p, 'tutor-apellidoPaterno', t['apellidoPaterno'] as string);
    await p.locator('#tutor-parentesco').selectOption(String(t['parentesco']));
    await llena(p, 'tutor-correo', t['correo'] as string);
    await llena(p, 'tutor-celular', t['celular'] as string);
    if (t['consiente']) await p.locator('#tutor-consiente').check();
  }
  for (const k of ['recordatorios', 'telegram', 'newsletter']) if (r.consentimientos[k]) await p.locator(`#consentimientos-${k}`).check();
  if (r.consentimientos['aviso_privacidad']) await p.locator('#consentimientos-aviso_privacidad').check();
  if (conContrasena) await llena(p, 'contrasena', s.contrasena);
}

export async function envíaRegistro(p: Page): Promise<string> {
  await p.getByRole('button', { name: 'Registrarme' }).click();
  await p.getByRole('heading', { name: '¡Listo, ya estás registrado!' }).waitFor({ timeout: 30_000 });
  return (await p.locator('[role="status"]').allInnerTexts()).join(' ');
}

/** Hasta el resumen: servicio → día → hora → avisos. No confirma (eso lo decide quien llama: a veces dos a la vez). */
export async function preparaCita(p: Page, s: Sintetico, hora = s.cita.hora): Promise<void> {
  await p.goto(`${BASE}/clinica/${s.clinica}/agenda`, { waitUntil: 'networkidle' });
  await p.locator(`input[name="servicio"][value="${s.cita.servicio}"]`).check();
  const fecha = fechaDe(s.cita.diasAdelante);
  await p.locator(`[data-dia="${fecha}"]`).waitFor({ timeout: 30_000 });
  await p.locator(`[data-dia="${fecha}"]`).click();
  await p.locator(`[data-hora="${hora}"]`).click();
  const canal = s.cita.canales.length === 2 ? 'ambos' : s.cita.canales[0] ?? 'ninguno';
  await p.locator(`input[name="canal-aviso"][value="${canal}"]`).check();
  if (s.cita.newsletter) await p.getByLabel(/También quiero el newsletter/).check();
}

export async function confirmaCita(p: Page): Promise<'confirmada' | 'ocupado'> {
  await p.getByRole('button', { name: /Confirmar cita|Confirmar el cambio/ }).click();
  // Sondeo y no una carrera de esperas: la espera perdedora, rechazada 30 s después, tumbaba el proceso.
  for (const limite = Date.now() + 30_000; Date.now() < limite; await p.waitForTimeout(200)) {
    if (await p.getByRole('heading', { name: '¡Cita confirmada!' }).isVisible()) return 'confirmada';
    if (await p.getByText(/Alguien acaba de apartar ese horario/).isVisible()) return 'ocupado';
  }
  throw new Error(`ni confirmación ni «ocupado»: ${JSON.stringify(await p.locator('[role="alert"]').allInnerTexts())}`);
}

export async function entra(p: Page, s: Sintetico): Promise<void> {
  await p.goto(`${BASE}/clinica/${s.clinica}/entrar`, { waitUntil: 'networkidle' });
  await p.locator('#correo').fill(s.registro.correo);
  await p.locator('#contrasena').fill(s.contrasena);
  await p.getByRole('button', { name: 'Entrar' }).click();
  await p.waitForURL(/\/mis-citas/, { timeout: 30_000 });
}

export async function sale(p: Page, clinica: string): Promise<void> {
  await p.goto(`${BASE}/clinica/${clinica}`, { waitUntil: 'networkidle' });
  const b = p.getByRole('button', { name: 'Salir' });
  if (await b.isVisible().catch(() => false)) {
    await b.click();
    await p.waitForURL(new RegExp(`/clinica/${clinica}$`));
  }
}
