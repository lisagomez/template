/**
 * Lo que dicen los avisos: correo (texto + HTML con la marca de la clinica) y Telegram. Plantillas
 * versionadas (`VERSION_PLANTILLAS`): cambiarlas es un CDC, igual que un prompt. El HTML es de tablas y
 * estilos en linea porque asi lo pintan los clientes de correo; todo texto del paciente se escapa.
 */
import type { Clinica, Servicio } from '../clinicas.js';
import type { ClaseAviso } from '../eventos.js';

export const VERSION_PLANTILLAS = 'avisos-1 (2026-10-16)';

export const escapaHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export function fechaLarga(ms: number, zona: string): string {
  const t = new Intl.DateTimeFormat('es-MX', { timeZone: zona, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export interface DatosAviso {
  clinica: Clinica;
  servicio: Servicio | null;
  nombre: string;
  inicio: number | null;
  urlPortal: string;
  urlBaja: string | null;
}

const ASUNTOS: Record<ClaseAviso, (d: DatosAviso) => string> = {
  confirmacion: (d) => `Tu cita en ${d.clinica.nombre} está confirmada`,
  recordatorio_24h: (d) => `Mañana es tu cita en ${d.clinica.nombre}`,
  recordatorio_2h: (d) => `Tu cita en ${d.clinica.nombre} es en 2 horas`,
  cancelacion: (d) => `Cancelamos tu cita en ${d.clinica.nombre}`,
  newsletter: (d) => `Novedades de ${d.clinica.nombre}`,
};

function lineasCita(d: DatosAviso): string[] {
  if (!d.servicio || d.inicio === null) return [];
  return [
    `Servicio: ${d.servicio.nombre} (${d.servicio.duracionMin} min)`,
    `Cuándo: ${fechaLarga(d.inicio, d.clinica.zona)} (hora del centro de México)`,
    `Dónde: ${d.clinica.direccion}`,
    `Cómo llegar: ${d.clinica.comoLlegar}`,
    `Cómo prepararte: ${d.servicio.comoPrepararse}`,
  ];
}

function cuerpoTexto(clase: ClaseAviso, d: DatosAviso): string[] {
  const c = d.clinica;
  if (clase === 'newsletter') {
    return [`Hola, ${d.nombre}:`, '', `Esto es lo nuevo en ${c.nombre}:`, ...c.promociones.map((p) => `• ${p.texto} Vigencia: ${p.vigencia}.`), '', 'Recuerda: tu limpieza cada seis meses previene más que cualquier tratamiento.'];
  }
  const intro: Record<Exclude<ClaseAviso, 'newsletter'>, string> = {
    confirmacion: 'Tu cita quedó confirmada. Adjuntamos un archivo para que la agregues a tu calendario.',
    recordatorio_24h: 'Te recordamos tu cita de mañana.',
    recordatorio_2h: 'Tu cita es en dos horas. ¡Te esperamos!',
    cancelacion: 'Tu cita quedó cancelada y el horario se liberó. Puedes agendar otra cuando quieras.',
  };
  return [`Hola, ${d.nombre}:`, '', intro[clase], '', ...lineasCita(d), '', c.politicas.cancelacion];
}

export interface MensajeCorreo { asunto: string; texto: string; html: string }

export function mensajeCorreo(clase: ClaseAviso, d: DatosAviso): MensajeCorreo {
  const c = d.clinica;
  const lineas = cuerpoTexto(clase, d);
  const motivo = clase === 'newsletter' ? `Recibes este correo porque te suscribiste al newsletter de ${c.nombre}` : 'Recibes este aviso porque activaste los recordatorios de cita';
  const pie = clase === 'newsletter' ? `${motivo}. Darte de baja: ${d.urlBaja ?? ''}` : `${motivo}. Gestiona tus avisos en ${d.urlPortal}`;
  const texto = [...lineas, '', `Teléfono: ${c.telefono}`, '', pie, 'Clínica sintética del laboratorio: este mensaje no es de una clínica real.'].join('\n');
  const parrafos = lineas.map((l) => (l ? `<p style="margin:0 0 10px;font-size:15px;line-height:1.5;color:#1f2937">${escapaHtml(l)}</p>` : '')).join('');
  const boton = clase === 'newsletter' || clase === 'cancelacion' ? '' : `<p style="margin:18px 0"><a href="${escapaHtml(d.urlPortal)}" style="background:${c.marca.primario};color:#ffffff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Ver o cambiar mi cita</a></p>`;
  const baja = clase === 'newsletter' && d.urlBaja ? `<a href="${escapaHtml(d.urlBaja)}" style="color:#374151">Darme de baja del newsletter</a>` : `<a href="${escapaHtml(d.urlPortal)}" style="color:#374151">Gestionar mis avisos</a>`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden" cellpadding="0" cellspacing="0">
<tr><td style="background:${c.marca.primario};padding:20px 24px;color:#ffffff;font-size:20px;font-weight:700">${escapaHtml(c.nombre)}<div style="font-size:13px;font-weight:400;opacity:.9">${escapaHtml(c.lema)}</div></td></tr>
<tr><td style="padding:24px">${parrafos}${boton}<p style="margin:16px 0 0;font-size:14px;color:#374151">Teléfono: ${escapaHtml(c.telefono)}</p></td></tr>
<tr><td style="padding:16px 24px;background:#f9fafb;font-size:12px;color:#4b5563;line-height:1.5">${escapaHtml(motivo)}. ${baja}<br>Clínica sintética del laboratorio: este mensaje no es de una clínica real.</td></tr>
</table></td></tr></table></body></html>`;
  return { asunto: ASUNTOS[clase](d), texto, html };
}

/** Telegram: texto plano (sin parse_mode, nada que escapar). El pie del video lleva la cita y las promociones. */
export function mensajeTelegram(clase: ClaseAviso, d: DatosAviso): string {
  const c = d.clinica;
  if (clase === 'confirmacion' && d.servicio && d.inicio !== null) {
    const promo = c.promociones[0] ? `\n\n${c.promociones[0].texto}` : '';
    return `✅ ${c.nombre}: tu cita quedó confirmada.\n${d.servicio.nombre}\n${fechaLarga(d.inicio, c.zona)}\n${c.direccion}${promo}`;
  }
  if (clase === 'recordatorio_2h' && d.servicio && d.inicio !== null) return `⏰ ${c.nombre}: tu cita de ${d.servicio.nombre} es hoy a las ${fechaLarga(d.inicio, c.zona).split(', ').pop() ?? ''}. ¡Te esperamos!`;
  if (clase === 'recordatorio_24h' && d.servicio && d.inicio !== null) return `📅 ${c.nombre}: mañana es tu cita de ${d.servicio.nombre} (${fechaLarga(d.inicio, c.zona)}).`;
  return `${c.nombre}: tu cita fue cancelada.`;
}
