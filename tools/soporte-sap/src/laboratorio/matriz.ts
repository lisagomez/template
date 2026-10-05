/**
 * La matriz SINTÉTICA del laboratorio: casos con la forma de incidencias reales de SAP (periodos,
 * bloqueos, IDocs, CFDI, rangos de números, jobs), pero con notas inventadas del laboratorio en un
 * dominio `.invalid`. Ninguna cita es una nota de SAP. Sirve para probar el producto, no para
 * resolver nada en un SAP real.
 */
import type { EntradaMatriz } from '../matriz.js'

const nota = (n: string, tema: string) => ({
  cita: `Nota sintética ${n} del laboratorio: ${tema} (no es una nota de SAP)`,
  url: `https://ejemplo.invalid/soporte-sap/notas/${n}`,
})

const SOC = '(?:sociedad|company code)\\s*(\\d{4})'
const PER = '(?:periodo|period)\\s*(\\d{4}[-/]\\d{2})'

export const MATRIZ_LABORATORIO: readonly EntradaMatriz[] = [
  {
    regla: 'SS-MM-PERIODO', categoria: 'MM_PERIODO_CERRADO', titulo: 'Periodo de MM cerrado al contabilizar un movimiento',
    modulo: 'MM', componente: 'MM-IM', transacciones: ['MIGO', 'MMPV'], keywords: ['m7 053', 'periodo de mm cerrado', 'mmpv'], exclusiones: [],
    sistemas: ['ECC', 'S4HANA'], grado: 'validada', complejidad: 'baja',
    solucion: { resumen: 'Abrir en MMPV el periodo de MM de la sociedad y volver a contabilizar.', pasos: [{ accion: 'abre_periodo_mm', descripcion: 'abrir el periodo de MM (MMPV) en la sociedad' }] },
    parametros: { sociedad: SOC, periodo: PER },
    sintoma: (p) => ({ tipo: 'periodo_cerrado', libro: 'mm', sociedad: p['sociedad'] ?? '', periodo: (p['periodo'] ?? '').replace('/', '-') }),
    fuente: nota('NS-0001', 'M7 053 al contabilizar en MIGO con el periodo de MM cerrado'),
  },
  {
    regla: 'SS-FI-PERIODO', categoria: 'FI_PERIODO_CERRADO', titulo: 'Periodo contable de FI no abierto',
    modulo: 'FI', componente: 'FI-GL', transacciones: ['FB01', 'F-02', 'OB52'], keywords: ['f5 201', 'periodo contable no abierto', 'ob52'], exclusiones: [],
    sistemas: ['ECC', 'S4HANA'], grado: 'validada', complejidad: 'baja',
    solucion: { resumen: 'Abrir el periodo en OB52 para la variante de la sociedad.', pasos: [{ accion: 'abre_periodo_fi', descripcion: 'abrir el periodo contable (OB52) en la sociedad' }] },
    parametros: { sociedad: SOC, periodo: PER },
    sintoma: (p) => ({ tipo: 'periodo_cerrado', libro: 'fi', sociedad: p['sociedad'] ?? '', periodo: (p['periodo'] ?? '').replace('/', '-') }),
    fuente: nota('NS-0002', 'F5 201 con el periodo contable cerrado'),
  },
  {
    regla: 'SS-BC-USUARIO', categoria: 'BC_USUARIO_BLOQUEADO', titulo: 'Usuario bloqueado por intentos fallidos',
    modulo: 'BASIS', componente: 'BC-SEC-USR', transacciones: ['SU01'], keywords: ['usuario bloqueado', 'user is locked', 'su01'], exclusiones: [],
    sistemas: ['ECC', 'S4HANA'], grado: 'validada', complejidad: 'baja',
    solucion: { resumen: 'Desbloquear el usuario en SU01 tras confirmar su identidad con la consultora.', pasos: [{ accion: 'desbloquea_usuario', descripcion: 'desbloquear el usuario (SU01)' }] },
    parametros: { usuario: '(?:usuario|user)\\s+([A-Z][A-Z0-9_]{2,11})\\b' },
    sintoma: (p) => ({ tipo: 'usuario_bloqueado', usuario: p['usuario'] ?? '' }),
    fuente: nota('NS-0003', 'usuario bloqueado tras intentos fallidos de acceso'),
  },
  {
    regla: 'SS-IDOC-51', categoria: 'IDOC_ESTADO_51', titulo: 'IDoc en estado 51 por dato maestro corregido',
    modulo: 'BASIS', componente: 'BC-MID-ALE', transacciones: ['BD87', 'WE02'], keywords: ['estado 51', 'status 51', 'bd87'], exclusiones: [],
    sistemas: ['ECC', 'S4HANA'], grado: 'probable', complejidad: 'media',
    solucion: { resumen: 'Con el maestro ya corregido, reprocesar el IDoc en BD87.', pasos: [{ accion: 'reprocesa_idoc', descripcion: 'reprocesar el IDoc (BD87)' }] },
    parametros: { idoc: '(?:idoc)\\s*(\\d{10,16})' },
    sintoma: (p) => ({ tipo: 'idoc_en_error', idoc: p['idoc'] ?? '' }),
    fuente: nota('NS-0004', 'IDoc en estado 51 después de corregir el dato maestro'),
  },
  {
    regla: 'SS-CFDI-LCO', categoria: 'CFDI_RFC_FUERA_LCO', titulo: 'CFDI rechazado: RFC del receptor fuera de la LCO',
    modulo: 'FI-LOC', componente: 'FI-LOC-CFD-MX', transacciones: ['EDOC_COCKPIT', 'BP'], keywords: ['cfdi40102', 'no se encuentra en la lco', 'lista de contribuyentes'], exclusiones: [],
    sistemas: ['ECC', 'S4HANA'], grado: 'validada', complejidad: 'media',
    solucion: {
      resumen: 'Corregir el RFC del receptor en el interlocutor y reenviar el CFDI desde el eDocument Cockpit.',
      pasos: [{ accion: 'corrige_rfc_receptor', descripcion: 'corregir el RFC del receptor en el BP' }, { accion: 'reenvia_cfdi', descripcion: 'reenviar el CFDI (EDOC_COCKPIT)' }],
    },
    parametros: { bp: '(?:bp|interlocutor)\\s*(\\d{6,10})', rfc: 'rfc correcto[:\\s]+([A-Z&Ñ]{3,4}\\d{6}[A-Z0-9]{3})', uuid: 'uuid[:\\s]+([0-9a-f-]{36})' },
    sintoma: (p) => ({ tipo: 'cfdi_rechazado', uuid: p['uuid'] ?? '' }),
    fuente: nota('NS-0005', 'CFDI40102: el RFC del receptor no está en la lista de contribuyentes'),
  },
  {
    regla: 'SS-SD-RANGO', categoria: 'SD_RANGO_DESFASADO', titulo: 'Dump por número duplicado: rango de números desfasado',
    modulo: 'SD', componente: 'SD-SLS', transacciones: ['VA01', 'SNRO'], keywords: ['dbsql_duplicate_key_error', 'rango de numeros desfasado'], exclusiones: [],
    sistemas: ['ECC', 'S4HANA'], grado: 'probable', complejidad: 'media',
    solucion: { resumen: 'Ajustar en SNRO el nivel del rango por encima del último número usado.', pasos: [{ accion: 'ajusta_rango', descripcion: 'ajustar el nivel del rango de números (SNRO)' }] },
    parametros: { rango: '(?:rango|range)\\s+([A-Z_]{4,12}/\\d{2})' },
    sintoma: (p) => ({ tipo: 'rango_desfasado', rango: p['rango'] ?? '' }),
    fuente: nota('NS-0006', 'DBSQL_DUPLICATE_KEY_ERROR al crear un pedido de ventas'),
  },
  {
    regla: 'SS-BC-JOB', categoria: 'BC_JOB_CANCELADO', titulo: 'Job de fondo cancelado',
    modulo: 'BASIS', componente: 'BC-CCM-BTC', transacciones: ['SM37'], keywords: ['job cancelado', 'job cancelled', 'sm37'], exclusiones: [],
    sistemas: ['ECC', 'S4HANA'], grado: 'probable', complejidad: 'baja',
    solucion: { resumen: 'Revisar el log y reprogramar el job en SM37.', pasos: [{ accion: 'reprograma_job', descripcion: 'reprogramar el job (SM37)' }] },
    parametros: { job: '(?:job)\\s+(Z[A-Z0-9_]{2,30})' },
    sintoma: (p) => ({ tipo: 'job_cancelado', job: p['job'] ?? '' }),
    fuente: nota('NS-0007', 'job de fondo cancelado por una excepción del sistema'),
  },
  {
    regla: 'SS-SD-CUENTAS', categoria: 'SD_DETERMINACION_CUENTAS', titulo: 'Factura sin contabilizar por determinación de cuentas',
    modulo: 'SD', componente: 'SD-BIL', transacciones: ['VF02', 'VKOA'], keywords: ['vkoa', 'determinacion de cuentas'], exclusiones: [],
    sistemas: ['ECC', 'S4HANA'], grado: 'experimental', complejidad: 'alta',
    solucion: { resumen: 'Revisar la determinación de cuentas en VKOA: es un cambio de configuración y lo decide el experto.', pasos: [] },
    parametros: {},
    sintoma: null,
    fuente: nota('NS-0008', 'factura bloqueada para contabilidad por determinación de cuentas'),
  },
]
