/**
 * Complemento Carta Porte 3.1: el que acompana al traslado de mercancias por territorio nacional.
 *
 * POR QUE IMPORTA. Es el complemento mas grande que publica el SAT: dice de donde a donde va la
 * carga (ubicaciones con fecha y distancia), que va (mercancias con peso, valor, fraccion
 * arancelaria y, si aplica, documentacion aduanera), en que (autotransporte con placas, poliza y
 * remolques; barco; avion; tren) y quien la lleva (figuras de transporte con licencia y
 * domicilio). Sin este lector, una carta porte entra como una factura de traslado de cero pesos.
 *
 * ESTRUCTURA: del XSD oficial (`CartaPorte31.xsd`, `targetNamespace`
 * `http://www.sat.gob.mx/CartaPorte31`, leido el 2026-09-12 con nuestro propio analizador). Con
 * ~150 atributos repartidos en 25 elementos, aqui no hay tablas a mano: el ARBOL de abajo declara
 * la jerarquia y la clave de cada campo se deriva del nombre del SAT (`RFCRemitenteDestinatario`
 * → `rfc_remitente_destinatario`), de forma determinista y probada. El comprobador de deriva
 * (`medicion/deriva.mjs`) coteja el inventario contra el XSD publicado.
 *
 * ESTADO DE LA EVIDENCIA: escrito contra el esquema oficial, NO verificado contra una carta porte
 * real. Es la misma distincion que marca `espacios.ts` para pagos y comercio exterior.
 *
 * Las listas (ubicaciones, mercancias, remolques, carros, figuras...) van con clave numerada, y
 * cada lista lleva su contador: aplanarlas sin indice haria que la ultima pisara a las demas.
 */
import type { CampoExtraido } from '../../tipos.js'
import type { Elemento } from '../arbol.js'
import { hijo } from '../arbol.js'
import type { LectorDeComplemento } from '../registro.js'
import { CARTA_PORTE_31 } from './espacios.js'
import { inventarioDe, lectorDeArbol } from './lector-de-arbol.js'
import type { Rama } from './lector-de-arbol.js'

export { claveDeAtributo } from './lector-de-arbol.js'

const DOMICILIO = ['Calle', 'NumeroExterior', 'NumeroInterior', 'Colonia', 'Localidad', 'Referencia', 'Municipio', 'Estado', 'Pais', 'CodigoPostal']

const MERCANCIA = [
  'BienesTransp', 'ClaveSTCC', 'Descripcion', 'Cantidad', 'ClaveUnidad', 'Unidad', 'Dimensiones', 'MaterialPeligroso',
  'CveMaterialPeligroso', 'Embalaje', 'DescripEmbalaje', 'SectorCOFEPRIS', 'NombreIngredienteActivo', 'NomQuimico',
  'DenominacionGenericaProd', 'DenominacionDistintivaProd', 'Fabricante', 'FechaCaducidad', 'LoteMedicamento',
  'FormaFarmaceutica', 'CondicionesEspTransp', 'RegistroSanitarioFolioAutorizacion', 'PermisoImportacion',
  'FolioImpoVUCEM', 'NumCAS', 'RazonSocialEmpImp', 'NumRegSanPlagCOFEPRIS', 'DatosFabricante', 'DatosFormulador',
  'DatosMaquilador', 'UsoAutorizado', 'PesoEnKg', 'ValorMercancia', 'Moneda', 'FraccionArancelaria', 'UUIDComercioExt',
  'TipoMateria', 'DescripcionMateria',
]

const CONTENEDOR_MARITIMO = ['TipoContenedor', 'MatriculaContenedor', 'NumPrecinto', 'IdCCPRelacionado', 'PlacaVMCCP', 'FechaCertificacionCCP']
const CONTENEDOR_FERROVIARIO = ['TipoContenedor', 'PesoContenedorVacio', 'PesoNetoMercancia']

/** El arbol entero del complemento, tal como lo declara el XSD. La raiz va aparte. */
const RAMAS: readonly Rama[] = [
  { nombre: 'RegimenesAduaneros', clave: 'regimenes', atributos: [], hijos: [
    { nombre: 'RegimenAduaneroCCP', clave: 'regimen', lista: true, atributos: ['RegimenAduanero'] },
  ] },
  { nombre: 'Ubicaciones', clave: 'ubicaciones', atributos: [], hijos: [
    { nombre: 'Ubicacion', clave: 'ubicacion', lista: true, atributos: [
      'TipoUbicacion', 'IDUbicacion', 'RFCRemitenteDestinatario', 'NombreRemitenteDestinatario', 'NumRegIdTrib', 'ResidenciaFiscal',
      'NumEstacion', 'NombreEstacion', 'NavegacionTrafico', 'FechaHoraSalidaLlegada', 'TipoEstacion', 'DistanciaRecorrida',
    ], hijos: [{ nombre: 'Domicilio', clave: 'domicilio', atributos: DOMICILIO }] },
  ] },
  { nombre: 'Mercancias', clave: 'mercancias', atributos: ['PesoBrutoTotal', 'UnidadPeso', 'PesoNetoTotal', 'NumTotalMercancias', 'CargoPorTasacion', 'LogisticaInversaRecoleccionDevolucion'], hijos: [
    { nombre: 'Mercancia', clave: 'mercancia', lista: true, atributos: MERCANCIA, hijos: [
      { nombre: 'DocumentacionAduanera', clave: 'documentacion', lista: true, atributos: ['TipoDocumento', 'NumPedimento', 'IdentDocAduanero', 'RFCImpo'] },
      { nombre: 'GuiasIdentificacion', clave: 'guia', lista: true, atributos: ['NumeroGuiaIdentificacion', 'DescripGuiaIdentificacion', 'PesoGuiaIdentificacion'] },
      { nombre: 'CantidadTransporta', clave: 'cantidad_transporta', lista: true, atributos: ['Cantidad', 'IDOrigen', 'IDDestino', 'CvesTransporte'] },
      { nombre: 'DetalleMercancia', clave: 'detalle', atributos: ['UnidadPesoMerc', 'PesoBruto', 'PesoNeto', 'PesoTara', 'NumPiezas'] },
    ] },
    { nombre: 'Autotransporte', clave: 'autotransporte', atributos: ['PermSCT', 'NumPermisoSCT'], hijos: [
      { nombre: 'IdentificacionVehicular', clave: 'vehiculo', atributos: ['ConfigVehicular', 'PesoBrutoVehicular', 'PlacaVM', 'AnioModeloVM'] },
      { nombre: 'Seguros', clave: 'seguros', atributos: ['AseguraRespCivil', 'PolizaRespCivil', 'AseguraMedAmbiente', 'PolizaMedAmbiente', 'AseguraCarga', 'PolizaCarga', 'PrimaSeguro'] },
      { nombre: 'Remolques', clave: 'remolques', atributos: [], hijos: [{ nombre: 'Remolque', clave: 'remolque', lista: true, atributos: ['SubTipoRem', 'Placa'] }] },
    ] },
    { nombre: 'TransporteMaritimo', clave: 'maritimo', atributos: [
      'PermSCT', 'NumPermisoSCT', 'NombreAseg', 'NumPolizaSeguro', 'TipoEmbarcacion', 'Matricula', 'NumeroOMI', 'AnioEmbarcacion', 'NombreEmbarc',
      'NacionalidadEmbarc', 'UnidadesDeArqBruto', 'TipoCarga', 'Eslora', 'Manga', 'Calado', 'Puntal', 'LineaNaviera', 'NombreAgenteNaviero',
      'NumAutorizacionNaviero', 'NumViaje', 'NumConocEmbarc', 'PermisoTempNavegacion',
    ], hijos: [
      { nombre: 'Contenedor', clave: 'contenedor', lista: true, atributos: CONTENEDOR_MARITIMO, hijos: [
        { nombre: 'RemolquesCCP', clave: 'remolques', atributos: [], hijos: [{ nombre: 'RemolqueCCP', clave: 'remolque', lista: true, atributos: ['SubTipoRemCCP', 'PlacaCCP'] }] },
      ] },
    ] },
    { nombre: 'TransporteAereo', clave: 'aereo', atributos: [
      'PermSCT', 'NumPermisoSCT', 'MatriculaAeronave', 'NombreAseg', 'NumPolizaSeguro', 'NumeroGuia', 'LugarContrato', 'CodigoTransportista',
      'RFCEmbarcador', 'NumRegIdTribEmbarc', 'ResidenciaFiscalEmbarc', 'NombreEmbarcador',
    ] },
    { nombre: 'TransporteFerroviario', clave: 'ferroviario', atributos: ['TipoDeServicio', 'TipoDeTrafico', 'NombreAseg', 'NumPolizaSeguro'], hijos: [
      { nombre: 'DerechosDePaso', clave: 'derecho_de_paso', lista: true, atributos: ['TipoDerechoDePaso', 'KilometrajePagado'] },
      { nombre: 'Carro', clave: 'carro', lista: true, atributos: ['TipoCarro', 'MatriculaCarro', 'GuiaCarro', 'ToneladasNetasCarro'], hijos: [
        { nombre: 'Contenedor', clave: 'contenedor', lista: true, atributos: CONTENEDOR_FERROVIARIO },
      ] },
    ] },
  ] },
  { nombre: 'FiguraTransporte', clave: 'figuras', atributos: [], hijos: [
    { nombre: 'TiposFigura', clave: 'figura', lista: true, atributos: ['TipoFigura', 'RFCFigura', 'NumLicencia', 'NombreFigura', 'NumRegIdTribFigura', 'ResidenciaFiscalFigura'], hijos: [
      { nombre: 'PartesTransporte', clave: 'parte', lista: true, atributos: ['ParteTransporte'] },
      { nombre: 'Domicilio', clave: 'domicilio', atributos: DOMICILIO },
    ] },
  ] },
]

const DE_LA_RAIZ = ['IdCCP', 'TranspInternac', 'EntradaSalidaMerc', 'PaisOrigenDestino', 'ViaEntradaSalida', 'TotalDistRec', 'RegistroISTMO', 'UbicacionPoloOrigen', 'UbicacionPoloDestino']

/**
 * Se comparan por igualdad exacta, nunca por parecido: folios, placas, matriculas, polizas,
 * licencias, registros fiscales, pedimentos, guias y las claves de catalogo que identifican.
 */
const SON_IDENTIFICADOR = new Set([
  'IdCCP', 'IDUbicacion', 'RFCRemitenteDestinatario', 'NumRegIdTrib', 'NumEstacion', 'NumPedimento', 'IdentDocAduanero', 'RFCImpo',
  'NumeroGuiaIdentificacion', 'IDOrigen', 'IDDestino', 'NumPermisoSCT', 'PlacaVM', 'Placa', 'PolizaRespCivil', 'PolizaMedAmbiente',
  'PolizaCarga', 'Matricula', 'NumeroOMI', 'NumPolizaSeguro', 'NumViaje', 'NumConocEmbarc', 'NumAutorizacionNaviero', 'MatriculaContenedor',
  'NumPrecinto', 'IdCCPRelacionado', 'PlacaVMCCP', 'PlacaCCP', 'MatriculaAeronave', 'NumeroGuia', 'RFCEmbarcador', 'NumRegIdTribEmbarc',
  'MatriculaCarro', 'GuiaCarro', 'RFCFigura', 'NumLicencia', 'NumRegIdTribFigura', 'UUIDComercioExt', 'FraccionArancelaria', 'BienesTransp',
  'ClaveSTCC', 'NumCAS', 'RegistroSanitarioFolioAutorizacion', 'PermisoImportacion', 'FolioImpoVUCEM', 'NumRegSanPlagCOFEPRIS', 'LoteMedicamento',
  'CodigoTransportista', 'RegimenAduanero',
])

/** Lo que este lector mapea, por elemento, para el comprobador de deriva. Aqui se mapea el esquema entero. */
export const INVENTARIO_CARTA_PORTE: Readonly<Record<string, readonly string[]>> = inventarioDe('CartaPorte', DE_LA_RAIZ, RAMAS)

export const lectorDeCartaPorte31: LectorDeComplemento = lectorDeArbol({
  clave: { espacio: CARTA_PORTE_31, nombreLocal: 'CartaPorte', version: '3.1' },
  nombre: 'Complemento carta porte 3.1',
  atributosDeRaiz: DE_LA_RAIZ,
  ramas: RAMAS,
  identificadores: SON_IDENTIFICADOR,
  // Que medio lleva la carga, dicho una vez: es lo primero que alguien quiere saber.
  extra: (nodo: Elemento): readonly CampoExtraido[] => {
    const mercancias = hijo(nodo, CARTA_PORTE_31, 'Mercancias')
    const medios: readonly (readonly [string, string])[] = [['Autotransporte', 'autotransporte'], ['TransporteMaritimo', 'maritimo'], ['TransporteAereo', 'aereo'], ['TransporteFerroviario', 'ferroviario']]
    const presentes = mercancias === null ? [] : medios.filter(([nombre]) => hijo(mercancias, CARTA_PORTE_31, nombre) !== null).map(([, clave]) => clave)
    return [{ clave: 'medio_de_transporte', valor: presentes.join(',') || 'ninguno', confianza: 1, procedencia: 'xml' }]
  },
})
