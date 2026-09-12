/**
 * Un lector de complemento a partir del ARBOL de su esquema, declarado una vez.
 *
 * Los complementos grandes del SAT (carta porte, nomina) tienen decenas de elementos y cientos
 * de atributos. Traducirlos con tablas a mano, como pagos, es invitar a la deriva: una tabla por
 * elemento, un `recoge` por tabla, y el dia que el SAT publica un atributo nuevo alguien tiene
 * que acordarse de tocar tres sitios. Aqui el esquema se declara como un arbol y el recorrido es
 * uno solo: para cada rama, sus atributos con clave derivada del nombre del SAT, numeracion y
 * contador si es lista, `noLeido` para lo que el esquema no anticipa, y sus hijos.
 *
 * Es puro y sincrono, como exige `LectorDeComplemento`. El inventario que compara
 * `medicion/deriva.mjs` sale del MISMO arbol, asi que no puede divergir del lector.
 */
import type { CampoExtraido } from '../../tipos.js'
import type { Elemento } from '../arbol.js'
import { atributo, hijo, hijos } from '../arbol.js'
import type { ClaveDeEsquema, LectorDeComplemento } from '../registro.js'

/** Una rama del esquema: que elemento, con que clave, si es lista, sus atributos y sus hijos. */
export interface Rama {
  readonly nombre: string
  readonly clave: string
  readonly lista?: boolean
  readonly atributos: readonly string[]
  readonly hijos?: readonly Rama[]
}

/**
 * La clave de un atributo del SAT, en `snake_case`, con las siglas enteras y sin acentos:
 * `IdCCP` → `id_ccp`, `PlacaVM` → `placa_vm`, `RFCRemitenteDestinatario` →
 * `rfc_remitente_destinatario`, `Antigüedad` → `antiguedad`, `Año` → `anio`.
 */
export function claveDeAtributo(nombre: string): string {
  return nombre
    .replace(/ñ/g, 'ni')
    .replace(/Ñ/g, 'Ni')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(?<=[a-z0-9])(?=[A-Z])/g, '_')
    .replace(/(?<=[A-Z])(?=[A-Z][a-z])/g, '_')
    .toLowerCase()
}

/**
 * El inventario elemento → atributos que compara el comprobador de deriva. El mismo nombre de
 * elemento puede aparecer en dos ramas con atributos distintos (`Contenedor` en barco y en tren):
 * se unen, porque el XSD se lee por nombre.
 */
export function inventarioDe(raiz: string, atributosDeRaiz: readonly string[], ramas: readonly Rama[]): Readonly<Record<string, readonly string[]>> {
  const inventario: Record<string, string[]> = { [raiz]: ['Version', ...atributosDeRaiz] }
  const recorre = (lista: readonly Rama[]): void => {
    for (const rama of lista) {
      inventario[rama.nombre] = [...new Set([...(inventario[rama.nombre] ?? []), ...rama.atributos])]
      if (rama.hijos !== undefined) recorre(rama.hijos)
    }
  }
  recorre(ramas)
  return inventario
}

export interface OpcionesDeLectorDeArbol {
  readonly clave: ClaveDeEsquema
  readonly nombre: string
  /** Atributos de la raiz, ademas de `Version` (que es la clave del registro, no un campo). */
  readonly atributosDeRaiz: readonly string[]
  readonly ramas: readonly Rama[]
  /** Nombres de atributo del SAT que se comparan exactos, nunca por parecido. */
  readonly identificadores: ReadonlySet<string>
  /** Campos que el lector anade despues de recorrer el arbol (un resumen, un conteo derivado). */
  readonly extra?: (nodo: Elemento) => readonly CampoExtraido[]
}

export function lectorDeArbol(opciones: OpcionesDeLectorDeArbol): LectorDeComplemento {
  const { espacio } = opciones.clave
  return {
    clave: opciones.clave,
    nombre: opciones.nombre,

    lee(nodo: Elemento) {
      const campos: CampoExtraido[] = []
      const noLeido = new Set<string>()

      const recoge = (elemento: Elemento, atributos: readonly string[], prefijo: string): void => {
        const conocidos = new Set(atributos)
        for (const nombre of atributos) {
          const valor = atributo(elemento, nombre)
          if (valor === null) continue
          const campo: CampoExtraido = { clave: prefijo === '' ? claveDeAtributo(nombre) : `${prefijo}_${claveDeAtributo(nombre)}`, valor, confianza: 1, procedencia: 'xml' }
          if (opciones.identificadores.has(nombre)) campo.formato = 'identificador'
          campos.push(campo)
        }
        // Un atributo que el esquema no anticipa se declara: no se pierde en silencio.
        for (const a of elemento.atributos) {
          if (a.espacio === null && !conocidos.has(a.nombreLocal)) noLeido.add(`${elemento.nombreLocal}/@${a.nombreLocal}`)
        }
      }

      const recorre = (padre: Elemento, ramas: readonly Rama[], prefijoPadre: string): void => {
        for (const rama of ramas) {
          const base = prefijoPadre === '' ? rama.clave : `${prefijoPadre}_${rama.clave}`
          if (rama.lista === true) {
            const elementos = hijos(padre, espacio, rama.nombre)
            // El contador va aunque sea cero: "sin remolques" es un dato, no un hueco.
            campos.push({ clave: `${base}s_total`, valor: String(elementos.length), confianza: 1, procedencia: 'xml' })
            elementos.forEach((elemento, i) => {
              const prefijo = `${base}_${i + 1}`
              recoge(elemento, rama.atributos, prefijo)
              if (rama.hijos !== undefined) recorre(elemento, rama.hijos, prefijo)
            })
          } else {
            const elemento = hijo(padre, espacio, rama.nombre)
            if (elemento === null) continue
            recoge(elemento, rama.atributos, base)
            if (rama.hijos !== undefined) recorre(elemento, rama.hijos, base)
          }
        }
      }

      recoge(nodo, ['Version', ...opciones.atributosDeRaiz], '')
      recorre(nodo, opciones.ramas, '')
      if (opciones.extra !== undefined) campos.push(...opciones.extra(nodo))

      return { campos: campos.filter((c) => c.clave !== 'version'), noLeido: [...noLeido] }
    },
  }
}
