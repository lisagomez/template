import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CLINICAS, fechaLarga, type VistaAviso } from '../../../../../../tools/clinica-dental/dist/servidor.js';
import { MisCitas } from '@/features/clinica-dental/components/citas/mis-citas';
import { runtime } from '@/features/clinica-dental/services/servidor/runtime';
import { usuarioActual } from '@/features/clinica-dental/services/servidor/sesion';
import type { VinculoWhatsappUI, VistaAvisoUI } from '@/features/clinica-dental/types';
import { esLaboratorio } from '@/features/clinica-dental/services/servidor/datos';

export const dynamic = 'force-dynamic';

export default async function PaginaMisCitas({ params }: { params: Promise<{ clinica: string }> }) {
  const { clinica } = await params;
  const c = CLINICAS.find((x) => x.id === clinica)!;
  const usuario = await usuarioActual();
  if (!usuario) redirect(`/clinica/${clinica}/entrar?siguiente=/clinica/${clinica}/mis-citas`);
  const rt = await runtime();
  const paciente = await rt.portal.paciente(clinica, usuario);
  if (!paciente) {
    return <div className="mx-auto max-w-xl space-y-3"><h1 className="text-2xl font-bold">Mis citas</h1><p>Aún no estás registrado en {c.nombre}. <Link className="underline" href={`/clinica/${clinica}/registro`}>Regístrate aquí</Link>.</p></div>;
  }
  const v = await rt.portal.proximas(clinica, usuario);
  const consentimientos = await rt.portal.consentimientos(clinica, usuario);
  const wa = await rt.portal.whatsapp.estado(clinica, usuario);
  const hora = (ms: number) => new Intl.DateTimeFormat('es-MX', { timeZone: c.zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
  const whatsapp: VinculoWhatsappUI = wa.estado === 'codigo' ? { ...wa, expira: hora(wa.expira) } : wa.estado === 'vinculado' ? { estado: 'vinculado', ultimos4: wa.ultimos4 } : wa;
  // En el laboratorio, el «teléfono» de la persona es el WhatsApp simulado, con su celular del registro ya puesto.
  const laboratorioWhatsapp = esLaboratorio() && wa.estado === 'codigo' ? `/laboratorio-clinica-dental/whatsapp?clinica=${clinica}#numero=521${paciente.datos.celular.replace(/\D/g, '').slice(-10)}&texto=${encodeURIComponent(`Hola, quiero vincular mi WhatsApp a ${c.nombre}. Mi código es ${wa.codigo}`)}` : null;
  const aviso = (a: VistaAviso): VistaAvisoUI => ({ id: a.id, canal: a.canal, clase: a.clase, estado: a.estado, cuando: fechaLarga(a.para, c.zona), motivo: a.motivo, accion: a.accion });
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Hola, {paciente.datos.nombre}</h1>
          <p className="text-slate-700">Tus próximas citas en {c.nombre} y el estado de cada aviso.</p>
        </div>
        <Link href={`/clinica/${clinica}/agenda`} className="inline-flex min-h-11 items-center rounded-lg bg-[color:var(--c1)] px-4 font-semibold text-white">Agendar otra cita</Link>
      </div>
      <MisCitas
        clinica={clinica} telefono={c.telefono}
        citas={v.citas.map((x) => ({ id: x.cita.id, servicio: x.servicio, cuando: fechaLarga(x.cita.inicio, c.zona), puedeCambiar: x.puedeCambiar, avisos: x.avisos.map(aviso) }))}
        newsletter={v.newsletter.map(aviso)}
        consentimientos={Object.fromEntries(Object.entries(consentimientos).map(([k, val]) => [k, val === true]))}
        whatsapp={whatsapp} laboratorioWhatsapp={laboratorioWhatsapp}
      />
    </div>
  );
}
