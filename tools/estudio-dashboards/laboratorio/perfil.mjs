/**
 * El perfil de growth del laboratorio: qué métrica de Golfo Norte es de qué palanca y por qué dimensiones recorrer.
 * Es CONFIGURACIÓN del catálogo, no reglas: no nombra tiendas, regiones, campañas ni lo que se espera encontrar.
 * Las palancas y el guardarraíl salen de la propuesta (§Enfoque growth: north star ventas netas, margen ≥ 23 %).
 */
export const PERFIL_GN = {
  entidad: 'tienda__tienda_nombre',
  comparables: [{ dimension: 'tienda__es_comparable', operador: 'igual', valores: [true] }],
  periodo: { desde: '2026-01', hasta: '2026-09' },
  palancas: {
    crecimiento: 'ventas_netas',
    frecuencia: ['frecuencia_compra'],
    valor: ['ventas_por_cliente'],
    retencion: ['retencion_m3_pct'],
    riesgo: ['combinaciones_bajo_reorden'],
    eficiencia: ['roas_incremental'],
    adquisicion: 'clientes_nuevos',
  },
  segmentos: ['cohorte__origen', 'cliente__origen'],
  guardarrail: { metrica: 'margen_bruto_pct', minimo: 23 },
}

/** El mapa: dimensión con geografía y la métrica que sostiene la capa de inventario. Cobertura: sin datos. */
export const MAPA_GN = { dimensionMapa: 'tienda__tienda_nombre', capasMapa: { reorden: 'combinaciones_bajo_reorden' } }
