/**
 * El perfil de growth del laboratorio: qué métrica de Golfo Norte es de qué palanca y por qué dimensiones recorrer
 * (`perfil.json`, que también lee el CLI). Es CONFIGURACIÓN del catálogo, no reglas: no nombra tiendas, regiones,
 * campañas ni lo que se espera encontrar. Las palancas y el guardarraíl salen de la propuesta (north star ventas
 * netas, margen ≥ 23 %).
 */
import perfil from './perfil.json' with { type: 'json' }

export const PERFIL_GN = perfil

/** El mapa: dimensión con geografía y la métrica que sostiene la capa de inventario. Cobertura: sin datos. */
export const MAPA_GN = { dimensionMapa: 'tienda__tienda_nombre', capasMapa: { reorden: 'combinaciones_bajo_reorden' } }
