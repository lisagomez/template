/**
 * La corrida de punta a punta: ingesta → extraccion → mapeo → cola de revision → correccion →
 * persistencia → recuperacion.
 *
 * Vive aqui y no dentro de una prueba para que la prueba y el CLI ejerciten EL MISMO camino. Un
 * flujo escrito dos veces se separa, y entonces "la prueba pasa" y "el CLI funciona" dejan de
 * significar lo mismo.
 *
 * ⚠️ EL UMBRAL ES UN PARAMETRO OBLIGATORIO Y NO TIENE VALOR POR DEFECTO. No es un descuido de
 * ergonomia: es la regla de la casa. Un default aqui se copiaria a un proyecto real como si fuera
 * una recomendacion medida, y no lo seria — se mide sobre corpus real (TAR-17, TAR-25), y a ojo
 * falla en las dos direcciones: o llena la cola de falsos dudosos, o deja pasar errores con
 * confianza alta. Este modulo APLICA el umbral que le den; no opina cual.
 */
import type { CampoExtraido, PaginaExtraida, Lote, Resolucion, MotorOcr, VersionDeCampo } from '../dist/index.js'
import {
  identidadDe, resuelveValor, resuelveIdentificador, extraeIdentificadoresIndexables,
  versionInicial, corrige, vigente, abreLote,
} from '../dist/index.js'
import type { Base } from './base.ts'
import { catalogoDe } from './descriptor.ts'
import type { FacturaSintetica } from './documentos.ts'
import { comoBytes } from './documentos.ts'
import { ORGANIZACION, USUARIOS } from './negocio.ts'

export interface OpcionesDeCorrida {
  base: Base
  motor: MotorOcr
  /** Sin default a proposito. Ver la cabecera. */
  umbralDeConfianza: number
  /** Sin default a proposito. */
  umbralDeSimilitud: number
  /** Sin default a proposito. */
  margenDeAmbiguedad: number
  loteId?: string
  titulo?: string
  instanteBase?: string
}

export interface DocumentoProcesado {
  identidad: string
  folio: string
  campos: readonly CampoExtraido[]
  /** Los que quedaron por debajo del umbral: la cola de revision. */
  enRevision: readonly CampoExtraido[]
  proveedor: Resolucion
  /** `null` cuando el documento no traia GTIN. */
  gtin: Resolucion | null
  gtinAusente: boolean
}

export interface ResultadoDeCorrida {
  lote: Lote
  procesados: readonly DocumentoProcesado[]
  /** Cuantos campos cayeron en revision, sumando todos los documentos. */
  camposEnRevision: number
}

/**
 * Procesa las facturas: extrae, mapea y persiste. Devuelve lo que hace falta para revisar.
 *
 * El mapeo va por dos vias distintas y esa separacion es el corazon del asunto: el nombre del
 * proveedor por SIMILITUD (la gente escribe "ACME SA" y "ACME S.A. de C.V."), y el GTIN por
 * IGUALDAD EXACTA. Mezclarlas es lo que mete stock en el SKU equivocado (§2.10).
 */
export async function corre(
  facturas: readonly FacturaSintetica[],
  opciones: OpcionesDeCorrida,
): Promise<ResultadoDeCorrida> {
  const { base, motor, umbralDeConfianza, umbralDeSimilitud, margenDeAmbiguedad } = opciones
  const instanteBase = opciones.instanteBase ?? '2026-09-01T08:00:00.000Z'
  const loteId = opciones.loteId ?? 'lote-banco-1'

  const lote = abreLote(
    {
      id: loteId,
      organizacionId: ORGANIZACION.id,
      titulo: opciones.titulo ?? 'Facturas de septiembre',
      tipoTrabajo: 'facturas',
      creadoPor: USUARIOS.operario.id,
      rol: 'operario',
    },
    new Date(instanteBase),
  )
  base.db
    .prepare(
      `insert into lotes (id, organizacion_id, titulo, tipo_de_trabajo, estado, creado_por, creado_en, cerrado_en)
       values (?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (id) do update set titulo = excluded.titulo`,
    )
    .run(lote.id, lote.organizacionId, lote.titulo, lote.tipoTrabajo, lote.estado, lote.creadoPor, lote.creadoEn, null)

  const proveedores = catalogoDe(base, 'proveedores')
  const productos = catalogoDe(base, 'productos')
  const procesados: DocumentoProcesado[] = []
  let camposEnRevision = 0

  for (const [i, factura] of facturas.entries()) {
    const bytes = comoBytes(factura)
    const identidad = await identidadDe(bytes)
    const paginas = await motor.extrae(bytes)
    const campos = paginas.flatMap((p: PaginaExtraida) => p.campos)

    const enRevision = campos.filter((c) => c.confianza < umbralDeConfianza)
    camposEnRevision += enRevision.length

    const escrito = campos.find((c) => c.clave === 'proveedor')?.valor ?? ''
    const proveedor = resuelveValor(escrito, proveedores, {
      umbral: umbralDeSimilitud,
      margenDeAmbiguedad,
    })

    const leidoGtin = campos.find((c) => c.clave === 'gtin')?.valor
    // Igualdad exacta. Pasar esto por `resuelveValor` lanzaria, y esa barrera es deliberada.
    const gtin = leidoGtin === undefined ? null : resuelveIdentificador(leidoGtin, productos)

    const documentoId = `doc-${String(i + 1).padStart(3, '0')}`
    // `en_revision` cuando algun campo quedo por debajo del umbral. NO es un fallo: es la salida
    // normal del disenio. Tratarla como error empuja a subir el umbral hasta que la cola
    // desaparece, y con ella el control.
    const estado = enRevision.length > 0 ? 'en_revision' : 'extraido'
    base.db
      .prepare(
        `insert into documentos
           (id, organizacion_id, lote_id, identidad, clase_de_fuente, estado, tipo_documento, paginas, creado_en)
         values (?, ?, ?, ?, 'documento', ?, 'factura', ?, ?)
         on conflict (organizacion_id, identidad, clase_de_fuente) do update set paginas = excluded.paginas`,
      )
      .run(
        documentoId, ORGANIZACION.id, lote.id, identidad, estado,
        JSON.stringify(paginas), new Date(Date.parse(instanteBase) + i * 60_000).toISOString(),
      )

    const altaIndice = base.db.prepare(
      `insert into indice_identificadores (organizacion_id, documento_id, identificador_normalizado, clave)
       values (?, ?, ?, ?) on conflict do nothing`,
    )
    for (const entrada of extraeIdentificadoresIndexables(campos)) {
      altaIndice.run(ORGANIZACION.id, documentoId, entrada.valorNormalizado, entrada.clave)
    }

    procesados.push({
      identidad,
      folio: factura.folio,
      campos,
      enRevision,
      proveedor,
      gtin,
      gtinAusente: factura.gtinAusente,
    })
  }

  return { lote, procesados, camposEnRevision }
}

/**
 * Corrige un campo a mano. Append-only: se inserta una version nueva, jamas se reescribe.
 *
 * Es espejo de la migracion, donde `versiones_de_campo` tiene policy de INSERT y de SELECT y **no
 * tiene de UPDATE ni de DELETE** — sin policy permisiva, RLS deniega. Aqui no hay RLS que lo
 * imponga, asi que lo impone este codigo; la garantia es mas debil y conviene saberlo.
 */
export function corrigeCampo(
  base: Base,
  documentoId: string,
  clave: string,
  valorNuevo: string,
  motivo: string,
  instante = '2026-09-01T12:00:00.000Z',
): { version: number; anterior: string | null } {
  const previas = base.db
    .prepare(
      `select valor, version, motivo, autor, creado_en from versiones_de_campo
       where documento_id = ? and clave = ? order by version asc`,
    )
    .all(documentoId, clave) as { valor: string; version: number; motivo: string; autor: string; creado_en: string }[]

  const historial: VersionDeCampo[] = previas.map((p) => ({
    clave,
    valor: p.valor,
    quien: p.autor,
    cuando: p.creado_en,
    // La version 1 no corrige nada, asi que su motivo es `null` en el nucleo. En la base la columna
    // es NOT NULL con CHECK de no vacio, asi que alli viaja como texto: se traduce en los dos
    // sentidos en vez de relajar ninguno de los dos lados.
    motivo: p.version === 1 ? null : p.motivo,
    version: p.version,
  }))

  let nueva: VersionDeCampo
  if (historial.length === 0) {
    nueva = versionInicial(clave, valorNuevo, USUARIOS.revisor.id, new Date(instante))
  } else {
    // `corrige` devuelve el historial ENTERO con la nueva al final, no la nueva suelta: lo
    // append-only es la forma del dato, no una convencion del que llama. Y exige el rol, asi que un
    // 'consulta' que intentara corregir se estrellaria aqui y no en la base.
    const completo = corrige(historial, valorNuevo, USUARIOS.revisor.id, motivo, 'revisor', new Date(instante))
    nueva = vigente(completo)
  }

  base.db
    .prepare(
      `insert into versiones_de_campo (id, organizacion_id, documento_id, clave, valor, version, motivo, autor, creado_en)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `ver-${documentoId}-${clave}-${nueva.version}`, ORGANIZACION.id, documentoId, clave,
      nueva.valor, nueva.version, nueva.motivo ?? 'captura inicial', nueva.quien, nueva.cuando,
    )

  return {
    version: nueva.version,
    anterior: historial.length === 0 ? null : vigente(historial).valor,
  }
}

/** El valor vigente de un campo tras las correcciones. */
export function valorVigente(base: Base, documentoId: string, clave: string): string | null {
  const fila = base.db
    .prepare(
      `select valor from versiones_de_campo
       where documento_id = ? and clave = ? order by version desc limit 1`,
    )
    .get(documentoId, clave) as { valor: string } | undefined
  return fila === undefined ? null : fila.valor
}
