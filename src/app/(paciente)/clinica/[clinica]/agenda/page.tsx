import { Agenda } from '@/features/clinica-dental/components/agenda/agenda';
import { runtime } from '@/features/clinica-dental/services/servidor/runtime';
import { usuarioActual } from '@/features/clinica-dental/services/servidor/sesion';

export const dynamic = 'force-dynamic';

export default async function PaginaAgenda({ params, searchParams }: { params: Promise<{ clinica: string }>; searchParams: Promise<{ servicio?: string; reprograma?: string }> }) {
  const { clinica } = await params;
  const q = await searchParams;
  const usuario = await usuarioActual();
  const rt = await runtime();
  const esPaciente = usuario ? (await rt.portal.paciente(clinica, usuario)) !== null : false;
  let reprograma: { cita: string; servicio: string } | null = null;
  if (usuario && esPaciente && q.reprograma && /^cit_[0-9a-f]{20}$/.test(q.reprograma)) {
    const v = await rt.portal.proximas(clinica, usuario);
    const x = v.citas.find((y) => y.cita.id === q.reprograma && y.puedeCambiar);
    if (x) reprograma = { cita: x.cita.id, servicio: x.cita.servicio };
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{reprograma ? 'Cambiar mi cita' : 'Agendar cita'}</h1>
        <p className="text-slate-700">Solo te mostramos horarios realmente libres. La cita queda confirmada al pulsar «Confirmar».</p>
      </div>
      <Agenda clinica={clinica} conSesion={usuario !== null} esPaciente={esPaciente} servicioInicial={q.servicio && /^[a-z][a-z0-9-]{1,40}$/.test(q.servicio) ? q.servicio : null} reprograma={reprograma} />
    </div>
  );
}
