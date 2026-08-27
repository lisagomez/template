import { ProjectSettingsForm } from '@/features/project-settings/components/ProjectSettingsForm'

export const metadata = { title: 'Configuracion del proyecto' }

export default function ConfiguracionPage() {
  return (
    <div className="min-h-screen p-8">
      <h1 className="text-3xl font-bold">Configuracion del proyecto</h1>
      <p className="mt-2 text-gray-600">
        Aplicacion o herramienta: la eleccion queda en la base con su regla (PRP-002). No dispara
        ningun script: <code>npm run deploy</code> y <code>npm run empaqueta</code> siguen siendo tuyos.
      </p>
      <div className="mt-8">
        <ProjectSettingsForm />
      </div>
    </div>
  )
}
