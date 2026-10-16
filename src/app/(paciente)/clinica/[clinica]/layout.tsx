import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { CLINICAS } from '../../../../../tools/clinica-dental/dist/index.js';
import { Marco } from '@/features/clinica-dental/components/marco';
import { SCRIPT_CONSENTIMIENTO } from '@/features/clinica-dental/services/cliente/datalayer';
import { esLaboratorio } from '@/features/clinica-dental/services/servidor/datos';
import { usuarioActual } from '@/features/clinica-dental/services/servidor/sesion';

export async function generateMetadata({ params }: { params: Promise<{ clinica: string }> }): Promise<Metadata> {
  const { clinica: id } = await params;
  const c = CLINICAS.find((x) => x.id === id);
  return { title: c ? `${c.nombre} · Portal del paciente` : 'Portal del paciente', description: c?.lema, robots: { index: false, follow: false } };
}

export default async function LayoutClinica({ children, params }: { children: ReactNode; params: Promise<{ clinica: string }> }) {
  const { clinica: id } = await params;
  const c = CLINICAS.find((x) => x.id === id);
  if (!c) notFound();
  if (!esLaboratorio()) {
    return <main lang="es-MX" className="mx-auto max-w-xl p-8"><h1 className="text-xl font-semibold">Portal solo de laboratorio</h1><p className="mt-2 text-slate-700">Este portal funciona solo con pacientes y clínicas sintéticos.</p></main>;
  }
  const conSesion = (await usuarioActual()) !== null;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_CONSENTIMIENTO }} />
      <Marco clinica={c} conSesion={conSesion}>{children}</Marco>
    </>
  );
}
