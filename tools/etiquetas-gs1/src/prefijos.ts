/**
 * Que dice el prefijo GS1 de un GTIN (GenSpecs §1.2.3, Tablas 1-4 y 1-5).
 *
 * Importa para dos decisiones: si un codigo que llega en un archivo es global o solo vale
 * dentro de alguien (circulacion restringida), y si es de DEMOSTRACION (952), que GS1 prohibe
 * usar en el mundo real aunque sea dentro de una empresa.
 */

export type ClasePrefijo =
  | 'global'
  | 'demostracion'
  | 'restringido-empresa'
  | 'restringido-region'
  | 'publicacion'
  | 'cupon-o-recibo'
  | 'reservado'

export interface Prefijo {
  readonly clase: ClasePrefijo
  readonly prefijo: string
  readonly explicacion: string
}

const EXPLICA: Readonly<Record<ClasePrefijo, string>> = {
  global: 'GTIN global: lo asignó el dueño de la marca con su prefijo de empresa GS1.',
  demostracion: 'Prefijo 952: GS1 lo reserva para demostraciones y ejemplos. No identifica productos reales y no debe salir a la calle, ni siquiera dentro de la empresa.',
  'restringido-empresa': 'Circulación restringida dentro de una empresa (prefijo 04 o GTIN-8 000-099/200-299): solo vale dentro de la cadena.',
  'restringido-region': 'Circulación restringida regional (prefijos 02 y 20-29, los define GS1 México; se usan, p. ej., para peso variable). Solo vale en ese ámbito.',
  publicacion: 'ISSN o ISBN (977-979): identifica publicaciones, no mercancía de almacén.',
  'cupon-o-recibo': 'Cupón o recibo de devolución (980-99): no es un artículo.',
  reservado: 'Prefijo reservado por GS1 o sin uso: ningún producto real debería tenerlo.',
}

const resultado = (clase: ClasePrefijo, prefijo: string): Prefijo => ({ clase, prefijo, explicacion: EXPLICA[clase] })

/** `gtin14`: GTIN normalizado a 14 cifras (indicador + 12 + digito). */
export function clasificaPrefijo(gtin14: string): Prefijo {
  if (gtin14.startsWith('000000')) {
    // GTIN-8 (Tabla 1-5, prefijos GS1-8 de tres cifras).
    const p = gtin14.slice(6, 9)
    const n = Number(p)
    if (n <= 99 || (n >= 200 && n <= 299)) return resultado('restringido-empresa', p)
    if (p === '952') return resultado('demostracion', p)
    if (n >= 977) return resultado('reservado', p)
    return resultado('global', p)
  }
  const cuerpo = gtin14.slice(1)
  if (cuerpo.startsWith('0000000')) return resultado('restringido-empresa', '0000000')
  if (/^0{3,6}/.test(cuerpo) && Number(cuerpo.slice(0, 7)) <= 99) return resultado('reservado', cuerpo.slice(0, 7))
  const p2 = cuerpo.slice(0, 2)
  const p3 = cuerpo.slice(0, 3)
  if (p2 === '02' || (Number(p2) >= 20 && Number(p2) <= 29)) return resultado('restringido-region', p2)
  if (p2 === '04') return resultado('restringido-empresa', p2)
  if (p3 === '952') return resultado('demostracion', p3)
  if (p3 === '977' || p3 === '978' || p3 === '979') return resultado('publicacion', p3)
  if (p2 === '99' || (Number(p3) >= 980 && Number(p3) <= 983)) return resultado('cupon-o-recibo', p3)
  if (Number(p3) >= 984 && Number(p3) <= 989) return resultado('reservado', p3)
  if (p3 === '951') return resultado('reservado', p3)
  return resultado('global', p3)
}

export function esCirculacionRestringida(gtin14: string): boolean {
  const c = clasificaPrefijo(gtin14).clase
  return c === 'restringido-empresa' || c === 'restringido-region'
}

/** ¿Este GTIN esta numerado bajo `prefijoEmpresa` (el GCP que GS1 Mexico asigno a la casa)? */
export function perteneceAPrefijo(gtin14: string, prefijoEmpresa: string): boolean {
  // El GCP empieza tras el digito indicador (GTIN-13 rellenado lleva un 0 delante).
  return prefijoEmpresa.length > 0 && gtin14.slice(1).startsWith(prefijoEmpresa)
}
