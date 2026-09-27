/**
 * Precios de REFERENCIA de rollos Zebra de térmica directa y un escenario de EJEMPLO.
 *
 * Los precios son de tiendas en línea de México, consultados el 2026-09-25 (la página no dice si
 * incluyen IVA). Envejecen: sirven para arrancar el estimador, no como cotización. La instalación
 * los sustituye por los de su proveedor en la pantalla de rollos.
 *
 * El escenario de dulcería es FICTICIO: volúmenes supuestos, escritos en `supuestos`.
 */
import type { Escenario, Rollo } from './consumibles.js'

const CONSULTA = '2026-09-25'

export const ROLLOS_REFERENCIA: readonly Rollo[] = [
  {
    id: 'zp1000d-4x6-430', nombre: 'Z-Perform 1000D 4×6" (430 etiq.)', tecnologia: 'termica-directa', anchoMm: 101.6, altoMm: 152.4,
    etiquetasPorRollo: 430, costoPaquete: 228, rollosPorPaquete: 1, fechaPrecio: CONSULTA,
    fuente: 'https://www.abasteo.mx/Impresion-Consumibles/Papeles-para-Impresoras/Etiquetas-POS/Zebra-Rollo-de-Etiquetas-Z-Perform-1000D-Termica-Directa-4-x-6-430-Etiquetas-1-Rollo.html',
  },
  {
    id: 'zp2000d-4x2-1240', nombre: 'Z-Perform 2000D 4×2" (1,240 etiq.)', tecnologia: 'termica-directa', anchoMm: 101.6, altoMm: 50.8,
    etiquetasPorRollo: 1240, costoPaquete: 2569, rollosPorPaquete: 6, fechaPrecio: CONSULTA,
    fuente: 'https://impresorasymas.com.mx/29-etiqueta-td-termica-directa-impresora-escritorio',
  },
  {
    id: 'zp1000d-4x2-690', nombre: 'Z-Perform 1000D 4×2" (690 etiq.)', tecnologia: 'termica-directa', anchoMm: 101.6, altoMm: 50.8,
    etiquetasPorRollo: 690, costoPaquete: 1799, rollosPorPaquete: 4, fechaPrecio: CONSULTA,
    fuente: 'https://www.cyberpuerta.mx/Impresion-y-Copiado/Papeles-para-Impresoras/Etiquetas-POS/Zebra-Rollo-de-Etiquetas-1000D-4-x-2-2760-Etiquetas-Blanco-4-Rollos.html',
  },
  {
    id: 'zp2000d-2x1-2340', nombre: 'Z-Perform 2000D 2×1" (2,340 etiq.)', tecnologia: 'termica-directa', anchoMm: 50.8, altoMm: 25.4,
    etiquetasPorRollo: 2340, costoPaquete: 1899, rollosPorPaquete: 6, fechaPrecio: CONSULTA,
    fuente: 'https://impresorasymas.com.mx/29-etiqueta-td-termica-directa-impresora-escritorio',
  },
  {
    id: 'zp1000d-2x1-2340', nombre: 'Z-Perform 1000D 2×1" (2,340 etiq.)', tecnologia: 'termica-directa', anchoMm: 50.8, altoMm: 25.4,
    etiquetasPorRollo: 2340, costoPaquete: 1099, rollosPorPaquete: 6, fechaPrecio: CONSULTA,
    fuente: 'https://impresorasymas.com.mx/29-etiqueta-td-termica-directa-impresora-escritorio',
  },
]

export const ESCENARIO_DULCERIA: Escenario = {
  id: 'dulceria-ejemplo',
  nombre: 'Dulcería: un CEDIS y tres sucursales (ejemplo ficticio)',
  supuestos: 'CEDIS etiqueta 150 cajas por día hábil que llegan sin GS1-128 del proveedor (24 días al mes) y 6 tarimas diarias con etiqueta en dos caras. '
    + 'Cada sucursal reempaca 80 bolsas de dulce a granel al día (26 días). Las bolsas y cajas van en 2000D (con recubrimiento: '
    + 'Zebra lo califica para uso interior de 1 año o más, y el dulce suele caducar a 6-18 meses); las tarimas, que duran días en el '
    + 'almacén, en 1000D. Merma de 3 % por calibración y reimpresiones. Sin IVA confirmado, sin desgaste de cabezal ni envío.',
  lineas: [
    { concepto: 'Cajas en CEDIS (4×2")', rollo: 'zp2000d-4x2-1240', etiquetasMes: 150 * 24 },
    { concepto: 'Tarimas en CEDIS, dos caras (4×6")', rollo: 'zp1000d-4x6-430', etiquetasMes: 6 * 24 * 2 },
    { concepto: 'Bolsas de granel en 3 sucursales (2×1")', rollo: 'zp2000d-2x1-2340', etiquetasMes: 3 * 80 * 26 },
  ],
  mermaPct: 3,
}
