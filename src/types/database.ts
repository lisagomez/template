/**
 * Tipos de las tablas de Supabase que este template define. Espejo de
 * `supabase/migrations/`: si cambia una migracion, cambia esto en el mismo commit.
 */

export type ProjectType = 'aplicacion' | 'herramienta'
export type DeployProvider = 'hetzner' | 'otro-vps'

/** Fila de `public.project_settings` (PRP-002). Una sola fila por proyecto. */
export interface ProjectSettingsRow {
  id: string
  owner_id: string
  project_name: string
  project_type: ProjectType
  deploy_provider: DeployProvider | null
  deploy_domain: string | null
  package_scope: string | null
  package_name: string | null
  setup_completed_at: string | null
  created_at: string
  updated_at: string
}

/** Lo que escribe el formulario: sin id ni timestamps (los pone la base). */
export type ProjectSettingsInsert = Omit<ProjectSettingsRow, 'id' | 'created_at' | 'updated_at' | 'setup_completed_at'> & {
  setup_completed_at?: string | null
}
