/**
 * Complemento de Nomina 1.2: el recibo de pago de un EMPLEADO.
 *
 * ANALISIS DE IMPACTO SOBRE TERCEROS (control C4). Este lector es el unico del paquete que se
 * escribio con el analisis por delante, y la razon esta en el dato: a diferencia de una factura,
 * donde las partes son empresas que emitieron el documento, aqui el receptor es una PERSONA que no
 * eligio que su recibo pasara por esta herramienta. Lo que trae:
 *
 *   - Identidad: CURP, numero de seguridad social, numero de empleado, RFC del patron.
 *   - Relacion laboral: fecha de ingreso, antiguedad, tipo de contrato, sindicalizado, jornada,
 *     regimen, departamento, puesto y riesgo del puesto, periodicidad.
 *   - Dinero: salario diario integrado y base de cotizacion, banco y CUENTA BANCARIA, cada
 *     percepcion y deduccion con su importe, subsidios, saldos a favor.
 *   - Salud: INCAPACIDADES (dias, tipo, importe). Es dato de salud: categoria especial.
 *
 * Lo que este lector hace con eso, y lo que no:
 *
 *   1. Lee TODO el esquema, como los demas lectores: un recibo a medias es un recibo falso
 *      (una deduccion omitida deja un neto que no cuadra). La reduccion no va en la lectura.
 *   2. NO manda nada a ningun sitio: es puro y sincrono, como exige el puerto.
 *   3. Marca como identificador la CURP, el NSS, el numero de empleado, los RFC y la cuenta
 *      bancaria, para que se comparen exactos y NUNCA por parecido.
 *   4. Expone `CLAVES_SENSIBLES_NOMINA`: las claves que un proyecto tiene que tratar como dato
 *      personal de categoria especial o financiero (cuenta bancaria, incapacidades, sindicato,
 *      salario). No se ocultan aqui — eso lo decide el proyecto, que sabe para que lee el recibo —
 *      pero estan nombradas para que la decision no dependa de que alguien se acuerde.
 *
 * Lo que queda del lado del PROYECTO, y no es opcional: la base legal (el patron lee sus propios
 * recibos: obligacion de conservacion), la retencion y la supresion (`supresion.ts` ya existe
 * para eso), quien puede consultar la cola de revision, y que NO se cruce el recibo con datos de
 * otros empleados para perfilar. Un dano aqui recae sobre alguien que no firmo nada: es la clase
 * de riesgo que ninguna entrada del registro autoriza (limite de C5).
 *
 * ESTRUCTURA: del XSD oficial (`nomina12.xsd`, `targetNamespace` `http://www.sat.gob.mx/nomina12`,
 * leido el 2026-09-12 con nuestro propio analizador). `Antigüedad` y `Año` llevan acento en el
 * esquema y aqui salen como `antiguedad` y `anio`. ESTADO DE LA EVIDENCIA: escrito contra el
 * esquema, NO verificado contra un recibo real; el comprobador de deriva lo coteja con el XSD.
 */
import type { CampoExtraido } from '../../tipos.js'
import type { Elemento } from '../arbol.js'
import { hijo, hijos } from '../arbol.js'
import type { LectorDeComplemento } from '../registro.js'
import { NOMINA_12 } from './espacios.js'
import { inventarioDe, lectorDeArbol } from './lector-de-arbol.js'
import type { Rama } from './lector-de-arbol.js'

const DE_LA_RAIZ = ['TipoNomina', 'FechaPago', 'FechaInicialPago', 'FechaFinalPago', 'NumDiasPagados', 'TotalPercepciones', 'TotalDeducciones', 'TotalOtrosPagos']

const RAMAS: readonly Rama[] = [
  { nombre: 'Emisor', clave: 'emisor', atributos: ['Curp', 'RegistroPatronal', 'RfcPatronOrigen'], hijos: [
    { nombre: 'EntidadSNCF', clave: 'entidad_sncf', atributos: ['OrigenRecurso', 'MontoRecursoPropio'] },
  ] },
  { nombre: 'Receptor', clave: 'receptor', atributos: [
    'Curp', 'NumSeguridadSocial', 'FechaInicioRelLaboral', 'Antigüedad', 'TipoContrato', 'Sindicalizado', 'TipoJornada', 'TipoRegimen',
    'NumEmpleado', 'Departamento', 'Puesto', 'RiesgoPuesto', 'PeriodicidadPago', 'Banco', 'CuentaBancaria', 'SalarioBaseCotApor',
    'SalarioDiarioIntegrado', 'ClaveEntFed',
  ], hijos: [
    { nombre: 'SubContratacion', clave: 'subcontratacion', lista: true, atributos: ['RfcLabora', 'PorcentajeTiempo'] },
  ] },
  { nombre: 'Percepciones', clave: 'percepciones', atributos: ['TotalSueldos', 'TotalSeparacionIndemnizacion', 'TotalJubilacionPensionRetiro', 'TotalGravado', 'TotalExento'], hijos: [
    { nombre: 'Percepcion', clave: 'percepcion', lista: true, atributos: ['TipoPercepcion', 'Clave', 'Concepto', 'ImporteGravado', 'ImporteExento'], hijos: [
      { nombre: 'AccionesOTitulos', clave: 'acciones', atributos: ['ValorMercado', 'PrecioAlOtorgarse'] },
      { nombre: 'HorasExtra', clave: 'horas_extra', lista: true, atributos: ['Dias', 'TipoHoras', 'HorasExtra', 'ImportePagado'] },
    ] },
    { nombre: 'JubilacionPensionRetiro', clave: 'jubilacion', atributos: ['TotalUnaExhibicion', 'TotalParcialidad', 'MontoDiario', 'IngresoAcumulable', 'IngresoNoAcumulable'] },
    { nombre: 'SeparacionIndemnizacion', clave: 'separacion', atributos: ['TotalPagado', 'NumAñosServicio', 'UltimoSueldoMensOrd', 'IngresoAcumulable', 'IngresoNoAcumulable'] },
  ] },
  { nombre: 'Deducciones', clave: 'deducciones', atributos: ['TotalOtrasDeducciones', 'TotalImpuestosRetenidos'], hijos: [
    { nombre: 'Deduccion', clave: 'deduccion', lista: true, atributos: ['TipoDeduccion', 'Clave', 'Concepto', 'Importe'] },
  ] },
  { nombre: 'OtrosPagos', clave: 'otros_pagos', atributos: [], hijos: [
    { nombre: 'OtroPago', clave: 'otro_pago', lista: true, atributos: ['TipoOtroPago', 'Clave', 'Concepto', 'Importe'], hijos: [
      { nombre: 'SubsidioAlEmpleo', clave: 'subsidio', atributos: ['SubsidioCausado'] },
      { nombre: 'CompensacionSaldosAFavor', clave: 'compensacion', atributos: ['SaldoAFavor', 'Año', 'RemanenteSalFav'] },
    ] },
  ] },
  { nombre: 'Incapacidades', clave: 'incapacidades', atributos: [], hijos: [
    { nombre: 'Incapacidad', clave: 'incapacidad', lista: true, atributos: ['DiasIncapacidad', 'TipoIncapacidad', 'ImporteMonetario'] },
  ] },
]

/** Se comparan exactos, nunca por parecido: quien es la persona, quien el patron, y su cuenta. */
const SON_IDENTIFICADOR = new Set(['Curp', 'NumSeguridadSocial', 'NumEmpleado', 'RegistroPatronal', 'RfcPatronOrigen', 'RfcLabora', 'CuentaBancaria', 'Banco'])

/**
 * Claves que son dato personal de categoria especial o financiero del empleado. El PROYECTO decide
 * que hace con ellas (quien las ve, cuanto se conservan, si entran a la inferencia del corpus);
 * aqui estan nombradas para que esa decision no dependa de que alguien se acuerde.
 */
export const CLAVES_SENSIBLES_NOMINA: ReadonlySet<string> = new Set([
  'receptor_curp', 'receptor_num_seguridad_social', 'receptor_banco', 'receptor_cuenta_bancaria', 'receptor_sindicalizado',
  'receptor_salario_base_cot_apor', 'receptor_salario_diario_integrado', 'receptor_riesgo_puesto',
])
/** Y los prefijos de las listas que lo son enteras: cada incapacidad es un dato de salud. */
export const PREFIJOS_SENSIBLES_NOMINA: readonly string[] = ['incapacidades_incapacidad_']

export const INVENTARIO_NOMINA: Readonly<Record<string, readonly string[]>> = inventarioDe('Nomina', DE_LA_RAIZ, RAMAS)

export const lectorDeNomina12: LectorDeComplemento = lectorDeArbol({
  clave: { espacio: NOMINA_12, nombreLocal: 'Nomina', version: '1.2' },
  nombre: 'Complemento de nomina 1.2',
  atributosDeRaiz: DE_LA_RAIZ,
  ramas: RAMAS,
  identificadores: SON_IDENTIFICADOR,
  // Un resumen que quien revisa quiere ver antes que nada: cuantas percepciones, deducciones e
  // incapacidades trae el recibo. Los conteos de lista ya salen por rama; esto los junta.
  extra: (nodo: Elemento): readonly CampoExtraido[] => {
    const cuenta = (padre: string, hijoNombre: string): number => {
      const p = hijo(nodo, NOMINA_12, padre)
      return p === null ? 0 : hijos(p, NOMINA_12, hijoNombre).length
    }
    return [{
      clave: 'resumen_del_recibo',
      valor: `${cuenta('Percepciones', 'Percepcion')} percepcion(es), ${cuenta('Deducciones', 'Deduccion')} deduccion(es), ${cuenta('OtrosPagos', 'OtroPago')} otro(s) pago(s), ${cuenta('Incapacidades', 'Incapacidad')} incapacidad(es)`,
      confianza: 1,
      procedencia: 'xml',
    }]
  },
})
