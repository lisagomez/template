/**
 * Los tres complementos MENORES mas comunes: impuestos locales, leyendas fiscales y donatarias.
 *
 * POR QUE JUNTOS. Cada uno cabe en diez lineas de esquema, y separarlos en tres modulos no
 * ganaria claridad. Lo que SI comparten, y es el motivo de que existan: los tres aparecen en
 * facturas cotidianas (el impuesto sobre hospedaje de un hotel, la leyenda de una retencion
 * cedular, la autorizacion de una donataria), y sin lector cada uno saltaba como «complemento sin
 * lector», que es ruido que tapa los avisos que importan.
 *
 * LA TRAMPA. Los tres declaran su version en MINUSCULA (`version="1.0"`), al reves que el tronco
 * y los complementos grandes (`Version`). El registro mira las dos, y el motor de arbol recibe
 * cual es para no meterla como campo. Medido contra los XSD oficiales (2026-09-12).
 *
 * ESTADO DE LA EVIDENCIA: escritos contra el esquema oficial, NO verificados contra documentos
 * reales. El comprobador de deriva los coteja con los XSD publicados.
 */
import { DONATARIAS_11, IMPUESTOS_LOCALES_10, LEYENDAS_FISCALES_10 } from './espacios.js'
import { inventarioDe, lectorDeArbol } from './lector-de-arbol.js'
import type { Rama } from './lector-de-arbol.js'

// --- Impuestos locales 1.0 --------------------------------------------------------------------

const RAIZ_IMPUESTOS = ['TotaldeRetenciones', 'TotaldeTraslados']
const RAMAS_IMPUESTOS: readonly Rama[] = [
  // El esquema los declara [0..1] cada uno, pero un comprobante real trae varias retenciones
  // locales como elementos hermanos: se leen como lista, con contador, y no se pierde ninguna.
  { nombre: 'RetencionesLocales', clave: 'retencion', lista: true, atributos: ['ImpLocRetenido', 'TasadeRetencion', 'Importe'] },
  { nombre: 'TrasladosLocales', clave: 'traslado', lista: true, atributos: ['ImpLocTrasladado', 'TasadeTraslado', 'Importe'] },
]

export const INVENTARIO_IMPUESTOS_LOCALES = inventarioDe('ImpuestosLocales', RAIZ_IMPUESTOS, RAMAS_IMPUESTOS, 'version')

export const lectorDeImpuestosLocales10 = lectorDeArbol({
  clave: { espacio: IMPUESTOS_LOCALES_10, nombreLocal: 'ImpuestosLocales', version: '1.0' },
  nombre: 'Complemento de impuestos locales 1.0',
  atributoDeVersion: 'version',
  atributosDeRaiz: RAIZ_IMPUESTOS,
  ramas: RAMAS_IMPUESTOS,
  identificadores: new Set(),
})

// --- Leyendas fiscales 1.0 --------------------------------------------------------------------

const RAMAS_LEYENDAS: readonly Rama[] = [
  { nombre: 'Leyenda', clave: 'leyenda', lista: true, atributos: ['disposicionFiscal', 'norma', 'textoLeyenda'] },
]

export const INVENTARIO_LEYENDAS_FISCALES = inventarioDe('LeyendasFiscales', [], RAMAS_LEYENDAS, 'version')

export const lectorDeLeyendasFiscales10 = lectorDeArbol({
  clave: { espacio: LEYENDAS_FISCALES_10, nombreLocal: 'LeyendasFiscales', version: '1.0' },
  nombre: 'Complemento de leyendas fiscales 1.0',
  atributoDeVersion: 'version',
  atributosDeRaiz: [],
  ramas: RAMAS_LEYENDAS,
  identificadores: new Set(),
})

// --- Donatarias 1.1 ----------------------------------------------------------------------------

const RAIZ_DONATARIAS = ['noAutorizacion', 'fechaAutorizacion', 'leyenda']

export const INVENTARIO_DONATARIAS = inventarioDe('Donatarias', RAIZ_DONATARIAS, [], 'version')

export const lectorDeDonatarias11 = lectorDeArbol({
  clave: { espacio: DONATARIAS_11, nombreLocal: 'Donatarias', version: '1.1' },
  nombre: 'Complemento de donatarias 1.1',
  atributoDeVersion: 'version',
  atributosDeRaiz: RAIZ_DONATARIAS,
  ramas: [],
  // El numero de autorizacion identifica a la donataria ante el SAT: exacto, nunca por parecido.
  identificadores: new Set(['noAutorizacion']),
})
