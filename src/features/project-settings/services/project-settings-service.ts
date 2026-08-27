import { createClient } from '@/lib/supabase/client'
import type { ProjectSettingsInsert, ProjectSettingsRow } from '@/types/database'
import type { ProjectSettingsInput } from '../types/schema'

/**
 * Acceso a `project_settings` con el cliente AUTENTICADO del usuario (anon key + sesion):
 * las policies de RLS por owner_id deciden. Aqui no hay ni habra service_role (control C7).
 *
 * "Upsert" a mano: la fila es un singleton por `unique((true))`, una constraint de
 * expresion que PostgREST no puede usar como `on_conflict`. Se lee y, si existe, se
 * actualiza por id; si no, se inserta.
 */

export function supabaseConfigurado(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

export async function getProjectSettings(): Promise<ProjectSettingsRow | null> {
  const supabase = createClient()
  const { data, error } = await supabase.from('project_settings').select('*').maybeSingle()
  if (error) throw new Error(`No se pudo leer project_settings: ${error.message}`)
  return (data as ProjectSettingsRow | null) ?? null
}

export async function upsertProjectSettings(entrada: ProjectSettingsInput): Promise<ProjectSettingsRow> {
  const supabase = createClient()
  const {
    data: { user },
    error: errorUsuario,
  } = await supabase.auth.getUser()
  if (errorUsuario || !user) throw new Error('Hace falta una sesion: la configuracion es del dueño del proyecto')

  const existente = await getProjectSettings()
  // La union discriminada de Zod ya garantizo la exclusion mutua; a la base va la fila plana.
  const fila: ProjectSettingsInsert = { ...entrada, owner_id: user.id }

  const consulta = existente
    ? supabase.from('project_settings').update(fila).eq('id', existente.id).select().single()
    : supabase.from('project_settings').insert(fila).select().single()

  const { data, error } = await consulta
  if (error) {
    // El CHECK de la base es la ultima linea: si Zod y la base divergieran, se veria AQUI.
    throw new Error(`No se pudo guardar project_settings: ${error.message}`)
  }
  return data as ProjectSettingsRow
}
