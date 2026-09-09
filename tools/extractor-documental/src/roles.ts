/**
 * Roles y permisos. La matriz va DECLARADA COMO DATO, no como cadena de `if`.
 *
 * Existe porque el flujo entero asume que quien escanea no es quien valida: con permisos por
 * persona, el revisor no ve lo que subio el operario y la cola de revision queda vacia para quien
 * tiene que atenderla.
 *
 * Anadir una accion es anadir una fila, y la prueba recorre la matriz entera — asi ningun rol gana
 * un permiso por descuido al tocar otra cosa.
 */

export type Rol = 'operario' | 'revisor' | 'consulta'

export type Accion =
  | 'crear_lote'
  | 'escanear'
  | 'corregir'
  | 'validar'
  | 'cerrar_lote'
  | 'suprimir'
  | 'exportar'
  | 'consultar'

const MATRIZ: Readonly<Record<Rol, readonly Accion[]>> = {
  operario: ['crear_lote', 'escanear', 'consultar'],
  revisor: ['crear_lote', 'escanear', 'corregir', 'validar', 'cerrar_lote', 'suprimir', 'exportar', 'consultar'],
  // Solo lee. No es un rol de segunda: es quien audita sin poder alterar lo auditado.
  consulta: ['consultar', 'exportar'],
}

export function puede(rol: Rol, accion: Accion): boolean {
  return MATRIZ[rol].includes(accion)
}

/** Todas las acciones de un rol, para que la UI no ofrezca botones imposibles. */
export function accionesDe(rol: Rol): readonly Accion[] {
  return MATRIZ[rol]
}

/**
 * Falla si el rol no puede. Se usa en el borde de cada operacion del nucleo: devolver `false` en
 * silencio deja que la llamada siga y el fallo aparezca tres capas mas abajo.
 */
export function exige(rol: Rol, accion: Accion): void {
  if (!puede(rol, accion)) {
    throw new Error(`El rol "${rol}" no puede "${accion}"`)
  }
}
