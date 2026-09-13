/**
 * La lectura ENRIQUECIDA de un documento: lo que el nucleo devuelve (`leeCorpus`) mas lo que la
 * spec 010 pide encima: evidencia por campo (RF-7, RF-8), estructura por clase (RF-12, RF-13) y
 * tiempos por etapa (RF-10). Todo puro salvo la llamada al nucleo; nada de HTTP aqui.
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'dist')
const { leeCorpus, conEvidencia, resumenDeEvidencia, estructuraPorClase } = await import(join(DIST, 'index.js'))

const PERCENTIL = (valores, p) => {
  if (valores.length === 0) return null
  const ordenados = [...valores].sort((a, b) => a - b)
  return ordenados[Math.min(ordenados.length - 1, Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1))]
}

/** Enriquece UNA lectura del nucleo. Exportada para que la medicion la reuse sin pasar por HTTP. */
export function enriquece(lectura, configuracion) {
  const { proyecto } = configuracion
  const campos = conEvidencia(lectura.campos, {
    ruta: lectura.ruta, cotejos: [lectura.cotejoDeCodigos, lectura.cotejoDeRespaldo],
    conValidador: new Set(Object.keys(proyecto.validadores)),
  })
  const claseFija = lectura.ruta === 'xml' ? 'cfdi' : undefined
  const estructura = estructuraPorClase(campos, lectura.clasesDePagina, proyecto.esquemas, claseFija)
  const paginas = Math.max(1, lectura.paginas.length)
  return {
    documentoId: lectura.documentoId, nombre: lectura.nombre, tipoDocumento: lectura.tipoDocumento,
    ruta: lectura.ruta, motivo: lectura.motivo, paginas,
    campos,
    evidencia: resumenDeEvidencia(campos),
    revisionHumana: campos.filter((c) => c.revisionHumana).length,
    estructura,
    identificadoresInvalidos: lectura.identificadoresInvalidos,
    corregidos: lectura.corregidos,
    codigos: lectura.codigos,
    paginasAlRespaldo: lectura.paginasAlRespaldo,
    duplicadoDe: lectura.duplicadoDe ?? null,
    tiempos: { ...lectura.tiempos, total: lectura.milisegundos },
    /** La lectura del nucleo tal cual, para quien quiera validar contra los tipos del extractor. */
    lectura,
  }
}

export async function leeDocumentos(archivos, configuracion, enVuelo) {
  const inicio = Date.now()
  const resultado = await leeCorpus(archivos, { ...configuracion.opcionesDeCorpus, enVuelo: enVuelo ?? configuracion.enVuelo })
  const documentos = resultado.lecturas.map((l) => enriquece(l, configuracion))
  const totales = documentos.map((d) => d.tiempos.total)
  const paginas = documentos.reduce((s, d) => s + d.paginas, 0)
  const msLote = Date.now() - inicio
  return {
    documentos,
    lote: {
      documentos: documentos.length, paginas, porRuta: resultado.porRuta,
      milisegundos: msLote,
      paginasPorMinuto: msLote > 0 ? Number((paginas / (msLote / 60000)).toFixed(2)) : null,
      latenciaPorDocumentoMs: { p50: PERCENTIL(totales, 50), p95: PERCENTIL(totales, 95) },
      porEtapaMs: {
        codigos: { p50: PERCENTIL(documentos.map((d) => d.tiempos.codigos), 50), p95: PERCENTIL(documentos.map((d) => d.tiempos.codigos), 95) },
        motor: { p50: PERCENTIL(documentos.map((d) => d.tiempos.motor), 50), p95: PERCENTIL(documentos.map((d) => d.tiempos.motor), 95) },
        respaldo: { p50: PERCENTIL(documentos.map((d) => d.tiempos.respaldo), 50), p95: PERCENTIL(documentos.map((d) => d.tiempos.respaldo), 95) },
      },
      paginasAlRespaldo: resultado.paginasAlRespaldo,
    },
  }
}
