/**
 * El SAP simulado de cada cliente del laboratorio, sembrado con los síntomas de las incidencias del
 * corpus: periodos cerrados, un usuario bloqueado, un IDoc en 51, un CFDI rechazado, un rango
 * desfasado y un job cancelado. Usuarios con seudónimos de laboratorio, nunca nombres reales.
 */
import type { SapSimulado } from '../simulador.js'

export function sapDeLaboratorio(cliente: string, sistema: 'ECC' | 'S4HANA'): SapSimulado {
  return {
    cliente, sistema, release: sistema === 'S4HANA' ? 'S/4HANA 2023 FPS02' : 'ECC 6.0 EhP8',
    periodos: { '1000': { fi: ['2026-08', '2026-09'], mm: ['2026-08', '2026-09'] }, '2000': { fi: ['2026-09'], mm: ['2026-09'] } },
    usuarios: { ALMACEN01: { bloqueado: true }, VENTAS02: { bloqueado: false } },
    idocs: { '0000000000123456': { estado: 51 } },
    bps: { '1000452': { rfc: 'XAXX010101001' } },
    cfdis: { '6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7': { estado: 'rechazado', bp: '1000452' } },
    lco: ['EKU9003173C9', 'URE180429TM6', 'XAXX010101000'],
    rangos: { 'RV_BELEG/01': { nivel: 90000123, maxUsado: 90000150 } },
    jobs: { ZCIERRE_DIARIO: { estado: 'cancelado' } },
  }
}
