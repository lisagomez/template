/**
 * Datos personales SINTÉTICOS para sembrar en el corpus y medir el anonimizador. Tienen la forma de
 * los reales (RFC y CURP con su dígito verificador, NSS con Luhn, CLABE con su dígito de control),
 * pero las personas no existen: nombres de una lista, fechas y homoclaves al azar, correos en
 * `.example`. Los dígitos de RFC y CURP los calcula el extractor documental (inyectado), para no
 * reescribir lo que ya existe.
 */
import type { Azar } from './aleatorio.js'

export interface DigitosMx {
  readonly rfc: (sinDigito: string) => string | null
  readonly curp: (sinDigito: string) => string | null
}

export interface PersonaSintetica {
  readonly nombre: string
  readonly rfc: string
  readonly curp: string
  readonly nss: string
  readonly clabe: string
  readonly correo: string
  readonly telefono: string
  readonly pernr: string
  readonly usuarioSap: string
  readonly sueldo: string
}

const NOMBRES = ['MARIA FERNANDA', 'JOSE LUIS', 'GUADALUPE', 'JUAN CARLOS', 'ANA SOFIA', 'MIGUEL ANGEL', 'ROSA ELENA', 'LUIS ALBERTO', 'CLAUDIA', 'RAUL']
const APELLIDOS = ['HERNANDEZ', 'GARCIA', 'MARTINEZ', 'LOPEZ', 'GONZALEZ', 'PEREZ', 'RODRIGUEZ', 'SANCHEZ', 'RAMIREZ', 'TORRES', 'FLORES', 'RIVERA', 'GOMEZ', 'DIAZ', 'CRUZ', 'MORALES', 'REYES', 'JIMENEZ', 'RUIZ', 'MENDOZA']
const ENTIDADES = ['DF', 'JC', 'NL', 'QT', 'GT', 'PL', 'VZ', 'MC']
const ALFA = 'ABCDEFGHIJKLMNPQRSTUVWXYZ0123456789'

const vocalInterna = (s: string): string => /[AEIOU]/.exec(s.slice(1))?.[0] ?? 'X'
const consonanteInterna = (s: string): string => /[BCDFGHJKLMNÑPQRSTVWXYZ]/.exec(s.slice(1))?.[0] ?? 'X'
const dd = (n: number): string => String(n).padStart(2, '0')
const titulo = (s: string): string => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase())

/** Dígito Luhn para una cadena de dígitos (el NSS lo valida así). */
export function digitoLuhn(digitos: string): string {
  let suma = 0
  ;[...digitos].reverse().forEach((c, i) => {
    let d = Number(c) * (i % 2 === 0 ? 2 : 1)
    if (d > 9) d -= 9
    suma += d
  })
  return String((10 - (suma % 10)) % 10)
}

/** Dígito de control de una CLABE (pesos 3, 7, 1). */
export function digitoClabe(diecisiete: string): string {
  const suma = [...diecisiete].reduce((s, c, i) => s + ((Number(c) * [3, 7, 1][i % 3]!) % 10), 0)
  return String((10 - (suma % 10)) % 10)
}

export function personaSintetica(a: Azar, digitos: DigitosMx, empresa: string): PersonaSintetica {
  const nombre = a.elige(NOMBRES), paterno = a.elige(APELLIDOS), materno = a.elige(APELLIDOS)
  const anio = a.entero(60, 99), mes = a.entero(1, 12), dia = a.entero(1, 28)
  const cuatro = `${paterno[0]}${vocalInterna(paterno)}${materno[0]}${nombre[0]}`
  const fecha = `${dd(anio)}${dd(mes)}${dd(dia)}`
  const rfcBase = `${cuatro}${fecha}${a.elige([...ALFA])}${a.elige([...ALFA])}`
  const curpBase = `${cuatro}${fecha}${a.elige(['H', 'M'])}${a.elige(ENTIDADES)}${consonanteInterna(paterno)}${consonanteInterna(materno)}${consonanteInterna(nombre)}${a.entero(0, 9)}`
  const nss10 = Array.from({ length: 10 }, () => a.entero(0, 9)).join('')
  const clabe17 = `012180${Array.from({ length: 11 }, () => a.entero(0, 9)).join('')}`
  const primero = nombre.split(' ')[0]!.toLowerCase()
  return {
    nombre: titulo(`${nombre} ${paterno} ${materno}`),
    rfc: `${rfcBase}${digitos.rfc(rfcBase) ?? '0'}`,
    curp: `${curpBase}${digitos.curp(curpBase) ?? '0'}`,
    nss: `${nss10}${digitoLuhn(nss10)}`,
    clabe: `${clabe17}${digitoClabe(clabe17)}`,
    correo: `${primero}.${paterno.toLowerCase()}@${empresa}.example`,
    telefono: `55 ${a.entero(1000, 9999)} ${a.entero(1000, 9999)}`,
    pernr: String(a.entero(10000, 99999)).padStart(8, '0'),
    usuarioSap: `${nombre[0]}${paterno}`.slice(0, 12),
    sueldo: `$${a.entero(9, 48)},${a.entero(100, 999)}.00`,
  }
}

/** El texto de un ticket de nómina con datos personales sembrados (para el anonimizador). */
export function ticketDeNomina(p: PersonaSintetica, empresa: string): string {
  return `Error en PC00_M32_CALC para el número de personal ${p.pernr} (${p.nombre}, RFC ${p.rfc}, CURP ${p.curp}, NSS ${p.nss}). ` +
    `El recibo de la quincena muestra sueldo ${p.sueldo} y el depósito a su CLABE ${p.clabe} se rechazó. ` +
    `Contacto de ${empresa}: ${p.correo}, tel. ${p.telefono}. Usuario SAP ${p.usuarioSap}.`
}

/** Los valores sensibles de una persona: lo que NO puede aparecer después de anonimizar. */
export const valoresSensibles = (p: PersonaSintetica): string[] =>
  [p.nombre, p.rfc, p.curp, p.nss, p.clabe, p.correo, p.telefono, p.pernr, p.usuarioSap, p.sueldo]
