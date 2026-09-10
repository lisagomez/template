/**
 * La siembra: puebla la base con el negocio ficticio, de forma REPRODUCIBLE.
 *
 * El detalle que decide si esto es determinista de verdad: **no se usa `Date.now()` en ningun
 * sitio**. Todos los instantes se derivan de `instanteBase`, que es un parametro. Con el reloj de
 * pared, dos siembras con la misma semilla producen bases que difieren en cada columna
 * `creado_en`, y el hash sale distinto: el determinismo se perderia por la puerta de atras, sin que
 * ninguna prueba de datos lo notara.
 */
import { aleatorioCon } from './aleatorio.ts'
import { abreBase, cuenta, tablasDe } from './base.ts'
import type { Base, OpcionesDeBase } from './base.ts'
import { ORGANIZACION, USUARIOS, PROVEEDORES, PRODUCTOS } from './negocio.ts'
import { generaFacturas } from './documentos.ts'
import type { FacturaSintetica } from './documentos.ts'

export interface OpcionesDeSiembra extends OpcionesDeBase {
  /** Cualquier texto. Se cita en un reporte de fallo mucho mejor que un numero. */
  semilla?: string
  /** Instante del que se derivan todos los demas. Fijo a proposito: ver la cabecera. */
  instanteBase?: string
  /** Cuantas facturas sinteticas generar. */
  facturas?: number
}

export interface ResumenDeSiembra {
  semilla: string
  ruta: string
  tablas: readonly string[]
  proveedores: number
  productos: number
  facturas: number
  /** Las facturas generadas, para que la corrida punta a punta trabaje sobre ellas. */
  documentos: readonly FacturaSintetica[]
}

export const SEMILLA_POR_DEFECTO = 'abarrotes-2026'
const INSTANTE_POR_DEFECTO = '2026-09-01T08:00:00.000Z'

/** Deriva un instante estable a partir del base, desplazado n minutos. */
function instante(base: string, minutos: number): string {
  return new Date(Date.parse(base) + minutos * 60_000).toISOString()
}

/**
 * Siembra una base nueva y devuelve el resumen.
 *
 * Con `sinNegocio: true` se puebla solo la organizacion y sus miembros: es el proyecto virgen de
 * §2.8, donde el descriptor sale `tablas: []` sin que nada mas cambie.
 */
export function siembra(opciones: OpcionesDeSiembra = {}): { base: Base; resumen: ResumenDeSiembra } {
  const semilla = opciones.semilla ?? SEMILLA_POR_DEFECTO
  const instanteBase = opciones.instanteBase ?? INSTANTE_POR_DEFECTO
  const cuantasFacturas = opciones.facturas ?? 12
  const azar = aleatorioCon(semilla)
  const base = abreBase(opciones)

  base.db
    .prepare('insert into organizaciones (id, nombre, creado_en) values (?, ?, ?)')
    .run(ORGANIZACION.id, ORGANIZACION.nombre, instante(instanteBase, 0))

  const altaMiembro = base.db.prepare(
    'insert into membresias (organizacion_id, usuario_id, rol, creado_en) values (?, ?, ?, ?)',
  )
  for (const [i, usuario] of Object.values(USUARIOS).entries()) {
    altaMiembro.run(ORGANIZACION.id, usuario.id, usuario.rol, instante(instanteBase, i + 1))
  }

  const documentos = generaFacturas(azar, cuantasFacturas)

  if (opciones.sinNegocio === true) {
    return {
      base,
      resumen: {
        semilla,
        ruta: base.ruta,
        tablas: tablasDe(base),
        proveedores: 0,
        productos: 0,
        facturas: 0,
        documentos,
      },
    }
  }

  const altaProveedor = base.db.prepare(
    'insert into proveedores (id, razon_social, rfc) values (?, ?, ?)',
  )
  for (const p of PROVEEDORES) altaProveedor.run(p.id, p.razonSocial, p.rfc)

  const altaProducto = base.db.prepare(
    'insert into productos (id, descripcion, gtin, proveedor_id) values (?, ?, ?, ?)',
  )
  for (const p of PRODUCTOS) altaProducto.run(p.id, p.descripcion, p.gtin, p.proveedorId)

  // Las facturas del ERP (no los documentos escaneados): son el destino contra el que se mapea.
  const altaFactura = base.db.prepare(
    'insert into facturas (id, folio, proveedor_id, total, emitida_en) values (?, ?, ?, ?, ?)',
  )
  for (const [i, f] of documentos.entries()) {
    altaFactura.run(`fac-${String(i + 1).padStart(3, '0')}`, f.folio, f.proveedorEsperado, f.total, f.emitidaEn)
  }

  return {
    base,
    resumen: {
      semilla,
      ruta: base.ruta,
      tablas: tablasDe(base),
      proveedores: cuenta(base, 'proveedores'),
      productos: cuenta(base, 'productos'),
      facturas: cuenta(base, 'facturas'),
      documentos,
    },
  }
}

/**
 * Huella de TODO el contenido de la base, tabla por tabla y fila por fila.
 *
 * Es lo que permite afirmar "dos siembras con la misma semilla dan la misma base" sin comparar los
 * ficheros: comparar los bytes del `.db` mediria tambien el relleno interno de SQLite, que puede
 * variar sin que ningun dato cambie. Lo que importa es el CONTENIDO, y es lo que esto resume.
 */
export function huellaDe(base: Base): string {
  const partes: string[] = []
  for (const tabla of tablasDe(base)) {
    const filas = base.db.prepare(`select * from ${tabla}`).all() as Record<string, unknown>[]
    const ordenadas = filas
      .map((f) =>
        Object.keys(f)
          .sort()
          .map((k) => `${k}=${String(f[k])}`)
          .join('|'),
      )
      .sort()
    partes.push(`${tabla}(${ordenadas.length}):${ordenadas.join(';')}`)
  }
  // Hash sencillo y estable. No hace falta SHA-256 aqui: lo que se compara son dos huellas
  // producidas por este mismo codigo en la misma corrida.
  let h = 2166136261
  const texto = partes.join('\n')
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
