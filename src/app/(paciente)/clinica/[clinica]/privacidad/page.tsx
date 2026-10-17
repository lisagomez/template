import { notFound } from 'next/navigation';
import { CLINICAS, VERSION_AVISO } from '../../../../../../tools/clinica-dental/dist/index.js';

/**
 * El aviso de privacidad SIMPLIFICADO que ve el paciente (LFPDPPP 2025, art. 16: datos recabados por medios
 * electrónicos). El integral, también en borrador, está junto al spec del goal. NO VIGENTE: lo revisa un abogado.
 */
export default async function Privacidad({ params }: { params: Promise<{ clinica: string }> }) {
  const { clinica: id } = await params;
  const c = CLINICAS.find((x) => x.id === id);
  if (!c) notFound();
  return (
    <article className="mx-auto max-w-3xl space-y-4 rounded-2xl bg-white p-6 leading-relaxed ring-1 ring-slate-200">
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">BORRADOR, NO VIGENTE: lo revisa un abogado. Clínica sintética del laboratorio: no recaba datos de personas reales. Versión {VERSION_AVISO}.</p>
      <h1 className="text-2xl font-bold">Aviso de privacidad simplificado</h1>
      <p><strong>Responsable:</strong> {c.nombre}, {c.direccion}.</p>
      <h2 className="text-lg font-semibold">Qué datos tratamos</h2>
      <p>Identificación y contacto (nombre, apellidos, edad, correo, celular y, si aplica, la empresa del convenio); los datos de tu madre, padre o tutor si eres menor de 18 años; y, <strong>solo con tu consentimiento expreso</strong>, la descripción de tu padecimiento, que es un <strong>dato personal sensible</strong> (de salud).</p>
      <h2 className="text-lg font-semibold">Para qué</h2>
      <p><strong>Necesarias:</strong> registrarte, agendar, cambiar o cancelar tus citas y prepararte la atención. <strong>Que puedes negar:</strong> recordatorios por correo o Telegram, el newsletter con promociones y el uso de tu descripción por el asistente del chat. Cada una tiene su casilla y ninguna viene marcada.</p>
      <h2 className="text-lg font-semibold">Con quién se comparten</h2>
      <p>No vendemos ni transferimos tus datos. Para operar usamos encargados que los tratan por nuestra cuenta: el proveedor de correo, Telegram (si lo eliges), el calendario de la clínica (solo una referencia de la cita, sin tu nombre) y, si usas el chat, el proveedor del modelo de lenguaje, que recibe <strong>solo el texto</strong> que escribes o dictas (tu voz nunca sale del servidor de la clínica).</p>
      <h2 className="text-lg font-semibold">Tus derechos</h2>
      <p>Puedes acceder, rectificar, cancelar u oponerte (derechos ARCO) y retirar tus consentimientos en cualquier momento: los de avisos y salud desde «Mis citas»; lo demás, escribiendo a {c.correoAvisos} o llamando al {c.telefono}. La baja del newsletter es de un clic.</p>
      <p className="text-sm text-slate-600">El aviso integral (borrador) y sus cambios se publicarán en este portal.</p>
    </article>
  );
}
