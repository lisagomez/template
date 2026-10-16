import { FormularioRegistro } from '@/features/clinica-dental/components/registro/formulario';
import { runtime } from '@/features/clinica-dental/services/servidor/runtime';
import { usuarioActual } from '@/features/clinica-dental/services/servidor/sesion';

export default async function Registro({ params }: { params: Promise<{ clinica: string }> }) {
  const { clinica } = await params;
  const usuario = await usuarioActual();
  // Sin redirigir: al crear la cuenta, la acción escribe cookies y Next re-renderiza esta ruta; una redirección
  // aquí taparía la confirmación del registro (con el aviso de lo descartado). El formulario decide qué mostrar.
  const yaRegistrado = usuario !== null && (await (await runtime()).portal.paciente(clinica, usuario)) !== null;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Regístrate como paciente</h1>
        <p className="mt-1 text-slate-700">Toma unos dos minutos. Si prefieres, activa <strong>Voz</strong> abajo a la derecha y la guía te pregunta cada dato.</p>
      </div>
      <FormularioRegistro clinica={clinica} conSesion={usuario !== null} yaRegistrado={yaRegistrado} />
    </div>
  );
}
