import { z } from 'zod'

/**
 * Esquema del tipo de proyecto — ESPEJO EXACTO del `CHECK project_settings_type_fields_chk`
 * de la migracion `create_project_settings.sql`:
 *
 *   herramienta → deploy_provider y deploy_domain NULOS, package_name obligatorio
 *   aplicacion  → package_scope y package_name NULOS
 *
 * Es una union discriminada a proposito: el formulario no puede ni construir un objeto con
 * los campos del otro tipo. Si se toca el CHECK, se toca esto en el mismo commit (gotcha del
 * PRP-002): un estado que el formulario nunca produce pero la base permite es justo el hueco.
 */

export const PROJECT_TYPES = ['aplicacion', 'herramienta'] as const
export const DEPLOY_PROVIDERS = ['hetzner', 'otro-vps'] as const

const nombreProyecto = z.string().trim().min(1, 'El nombre del proyecto es obligatorio').max(120)

/** Hostname publico, sin esquema ni ruta. No es un secreto. */
const dominio = z
  .string()
  .trim()
  .min(1, 'El dominio es obligatorio para desplegar')
  .max(253)
  .regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i, 'Dominio invalido: solo el host (ej. app.midominio.com)')

/** Scope npm opcional: `@algo`. */
const scopePaquete = z
  .string()
  .trim()
  .regex(/^@[a-z0-9-~][a-z0-9-._~]*$/, 'El scope va como @nombre')
  .nullable()

/** Nombre npm (sin scope). */
const nombrePaquete = z
  .string()
  .trim()
  .min(1, 'El nombre del paquete es obligatorio para una herramienta')
  .max(214)
  .regex(/^[a-z0-9-~][a-z0-9-._~]*$/, 'Nombre de paquete invalido (minusculas, sin espacios)')

export const aplicacionSchema = z.object({
  project_type: z.literal('aplicacion'),
  project_name: nombreProyecto,
  deploy_provider: z.enum(DEPLOY_PROVIDERS),
  deploy_domain: dominio,
  // Excluidos por la base: aqui ni se admiten.
  package_scope: z.null(),
  package_name: z.null(),
})

export const herramientaSchema = z.object({
  project_type: z.literal('herramienta'),
  project_name: nombreProyecto,
  package_scope: scopePaquete,
  package_name: nombrePaquete,
  // Excluidos por la base: aqui ni se admiten.
  deploy_provider: z.null(),
  deploy_domain: z.null(),
})

export const projectSettingsSchema = z.discriminatedUnion('project_type', [aplicacionSchema, herramientaSchema])

export type ProjectSettingsInput = z.infer<typeof projectSettingsSchema>

/**
 * Del estado del formulario (todo texto, todo presente) al objeto que la base acepta: los
 * campos del OTRO tipo se ponen a null antes de validar, que es lo que el CHECK exige. Asi
 * "elegir herramienta oculta y no envia deploy_*" es cierto por construccion, no por CSS.
 */
export interface FormularioProyecto {
  project_type: (typeof PROJECT_TYPES)[number]
  project_name: string
  deploy_provider: (typeof DEPLOY_PROVIDERS)[number] | ''
  deploy_domain: string
  package_scope: string
  package_name: string
}

export function aEntrada(f: FormularioProyecto): unknown {
  if (f.project_type === 'herramienta') {
    return {
      project_type: 'herramienta',
      project_name: f.project_name,
      package_scope: f.package_scope.trim() === '' ? null : f.package_scope,
      package_name: f.package_name,
      deploy_provider: null,
      deploy_domain: null,
    }
  }
  return {
    project_type: 'aplicacion',
    project_name: f.project_name,
    deploy_provider: f.deploy_provider === '' ? undefined : f.deploy_provider,
    deploy_domain: f.deploy_domain,
    package_scope: null,
    package_name: null,
  }
}
