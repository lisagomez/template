'use client'

import { useEffect, useState } from 'react'
import { z } from 'zod'
import {
  DEPLOY_PROVIDERS,
  PROJECT_TYPES,
  aEntrada,
  projectSettingsSchema,
  type FormularioProyecto,
} from '../types/schema'
import { getProjectSettings, supabaseConfigurado, upsertProjectSettings } from '../services/project-settings-service'

const ETIQUETA_TIPO: Record<(typeof PROJECT_TYPES)[number], string> = {
  aplicacion: 'Aplicacion — se despliega en un VPS (Docker + Caddy)',
  herramienta: 'Herramienta — se empaqueta e instala en otros proyectos',
}

const VACIO: FormularioProyecto = {
  project_type: 'aplicacion',
  project_name: '',
  deploy_provider: '',
  deploy_domain: '',
  package_scope: '',
  package_name: '',
}

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'sin-supabase' }
  | { tipo: 'listo'; guardado: string | null }
  | { tipo: 'guardando' }
  | { tipo: 'error'; mensaje: string }

/**
 * Selector de tipo de proyecto con campos condicionales. Los campos del otro tipo no se
 * ocultan solo por CSS: `aEntrada` los pone a null y el esquema Zod (espejo del CHECK de
 * la base) rechaza cualquier mezcla ANTES de tocar Supabase.
 */
export function ProjectSettingsForm() {
  const [form, setForm] = useState<FormularioProyecto>(VACIO)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })

  useEffect(() => {
    if (!supabaseConfigurado()) {
      setEstado({ tipo: 'sin-supabase' })
      return
    }
    let cancelado = false
    getProjectSettings()
      .then((fila) => {
        if (cancelado) return
        if (fila) {
          setForm({
            project_type: fila.project_type,
            project_name: fila.project_name,
            deploy_provider: fila.deploy_provider ?? '',
            deploy_domain: fila.deploy_domain ?? '',
            package_scope: fila.package_scope ?? '',
            package_name: fila.package_name ?? '',
          })
        }
        setEstado({ tipo: 'listo', guardado: fila?.updated_at ?? null })
      })
      .catch((e: unknown) => {
        if (!cancelado) setEstado({ tipo: 'error', mensaje: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelado = true
    }
  }, [])

  const campo = (k: keyof FormularioProyecto) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrores((prev) => {
      const { [k]: _omitido, ...resto } = prev
      void _omitido
      return resto
    })
  }

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    const resultado = projectSettingsSchema.safeParse(aEntrada(form))
    if (!resultado.success) {
      const porCampo: Record<string, string> = {}
      for (const issue of resultado.error.issues) {
        const clave = String(issue.path[0] ?? 'form')
        if (!porCampo[clave]) porCampo[clave] = issue.message
      }
      setErrores(porCampo)
      return
    }
    if (!supabaseConfigurado()) return
    setEstado({ tipo: 'guardando' })
    try {
      const fila = await upsertProjectSettings(resultado.data)
      setEstado({ tipo: 'listo', guardado: fila.updated_at })
    } catch (err: unknown) {
      setEstado({ tipo: 'error', mensaje: err instanceof Error ? err.message : String(err) })
    }
  }

  const esHerramienta = form.project_type === 'herramienta'
  const bloqueado = estado.tipo === 'guardando' || estado.tipo === 'cargando'

  return (
    <form onSubmit={guardar} className="max-w-xl space-y-6" data-testid="project-settings-form" noValidate>
      {estado.tipo === 'sin-supabase' && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="sin-supabase">
          Supabase no esta configurado en este entorno (<code>NEXT_PUBLIC_SUPABASE_URL</code> /{' '}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>). El selector funciona; guardar no, y no se finge.
        </p>
      )}
      {estado.tipo === 'error' && (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900" data-testid="error-guardado">
          {estado.mensaje}
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Tipo de proyecto</legend>
        {PROJECT_TYPES.map((tipo) => (
          <label key={tipo} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="project_type"
              value={tipo}
              checked={form.project_type === tipo}
              onChange={campo('project_type')}
              data-testid={`tipo-${tipo}`}
            />
            <span>{ETIQUETA_TIPO[tipo]}</span>
          </label>
        ))}
      </fieldset>

      <label className="block text-sm">
        <span className="font-medium">Nombre del proyecto</span>
        <input
          className="mt-1 w-full rounded border px-2 py-1"
          value={form.project_name}
          onChange={campo('project_name')}
          data-testid="project-name"
        />
        {errores.project_name && <span className="text-xs text-red-700">{errores.project_name}</span>}
      </label>

      {!esHerramienta && (
        <div className="space-y-3 rounded border p-3" data-testid="campos-aplicacion">
          <p className="text-xs text-gray-600">Despliegue (VPS propio). Ver docs/DEPLOY-HETZNER.md.</p>
          <label className="block text-sm">
            <span className="font-medium">Proveedor</span>
            <select className="mt-1 w-full rounded border px-2 py-1" value={form.deploy_provider} onChange={campo('deploy_provider')} data-testid="deploy-provider">
              <option value="">— elige —</option>
              {DEPLOY_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {errores.deploy_provider && <span className="text-xs text-red-700">{errores.deploy_provider}</span>}
          </label>
          <label className="block text-sm">
            <span className="font-medium">Dominio</span>
            <input className="mt-1 w-full rounded border px-2 py-1" placeholder="app.midominio.com" value={form.deploy_domain} onChange={campo('deploy_domain')} data-testid="deploy-domain" />
            {errores.deploy_domain && <span className="text-xs text-red-700">{errores.deploy_domain}</span>}
          </label>
        </div>
      )}

      {esHerramienta && (
        <div className="space-y-3 rounded border p-3" data-testid="campos-herramienta">
          <p className="text-xs text-gray-600">Empaquetado (npm). Ver docs/EMPAQUETAR-HERRAMIENTA.md. Sin VPS ni Docker.</p>
          <label className="block text-sm">
            <span className="font-medium">Scope (opcional)</span>
            <input className="mt-1 w-full rounded border px-2 py-1" placeholder="@mi-scope" value={form.package_scope} onChange={campo('package_scope')} data-testid="package-scope" />
            {errores.package_scope && <span className="text-xs text-red-700">{errores.package_scope}</span>}
          </label>
          <label className="block text-sm">
            <span className="font-medium">Nombre del paquete</span>
            <input className="mt-1 w-full rounded border px-2 py-1" placeholder="mi-herramienta" value={form.package_name} onChange={campo('package_name')} data-testid="package-name" />
            {errores.package_name && <span className="text-xs text-red-700">{errores.package_name}</span>}
          </label>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50" disabled={bloqueado || estado.tipo === 'sin-supabase'} data-testid="guardar">
          {estado.tipo === 'guardando' ? 'Guardando…' : 'Guardar'}
        </button>
        {estado.tipo === 'listo' && estado.guardado && (
          <span className="text-xs text-gray-600" data-testid="guardado-en">
            Guardado: {new Date(estado.guardado).toLocaleString()}
          </span>
        )}
      </div>
    </form>
  )
}

// Se exporta para que un test pueda comprobar que la union Zod rechaza la mezcla de tipos.
export type { z }
