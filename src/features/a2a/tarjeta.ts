/**
 * La Agent Card del extractor documental, construida con los TIPOS del SDK instalado (spec 005
 * RF-4, spec 010 RF-15). Las constantes se importan, no se reescriben: `AGENT_CARD_PATH` va sin
 * barra inicial y `A2A_PROTOCOL_VERSION` es lo que el SDK valida en cada peticion.
 *
 * Dos skills y no una descripcion ampliada, porque no comparten semantica: la extraccion devuelve
 * una ESTIMACION con confianza y evidencia por campo; la lectura de XML devuelve una TRANSCRIPCION
 * exacta cuyo sello NO se verifica. Un consumidor que no vea esa marca tomara la factura por
 * autentica, que es lo unico que no podemos afirmar.
 *
 * Lo que la Card NO dice, a proposito: que motor hay detras, que umbral usa nadie, ni que esquemas
 * XML hay registrados. Es interior (SDD del puente, §2.1).
 */
import { A2A_PROTOCOL_VERSION } from '@a2a-js/sdk'
import type { AgentCard, AgentSkill } from '@a2a-js/sdk'

export const NOMBRE_DE_LA_CLAVE = 'clave-api'
export const CABECERA_DE_LA_CLAVE = 'X-API-Key'

const ENTRADAS = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/xml', 'text/xml']
const SALIDAS = ['application/json']

const extraccion: AgentSkill = {
  id: 'extraccion-documental',
  name: 'Extraer datos de un documento',
  description:
    'PDF o imagen → campos con confianza, la EVIDENCIA que la sostiene (codigo, exacto, corroboracion, checksum o motor) ' +
    'y la marca revisionHumana. Un campo con revisionHumana=true es una estimacion, no un hecho.',
  tags: ['ocr', 'documentos', 'facturas', 'expedientes'],
  examples: ['Extrae los campos de esta factura escaneada', 'Lee el RFC y la CURP de este expediente'],
  inputModes: ENTRADAS,
  outputModes: SALIDAS,
  securityRequirements: [],
}

const lecturaXml: AgentSkill = {
  id: 'lectura-de-comprobante-xml',
  name: 'Leer un comprobante fiscal en XML',
  description:
    'XML de CFDI 4.0 → campos exactos, sin region. El sello NO se verifica: que el documento se lea bien ' +
    'no dice nada sobre si es autentico.',
  tags: ['cfdi', 'xml', 'facturas'],
  examples: ['Lee este CFDI y dame emisor, receptor, total y UUID'],
  inputModes: ['application/xml', 'text/xml'],
  outputModes: SALIDAS,
  securityRequirements: [],
}

/** `base` es donde se sirve el puente, por ejemplo `http://app:3000` en la red interna del compose. */
export function tarjetaDelExtractor(base: string, conClave: boolean): AgentCard {
  const raiz = base.replace(/\/$/, '')
  return {
    name: 'extractor-documental',
    description: 'Extrae datos de documentos con revision humana. Ofrecido solo en la red interna: exponerlo fuera es gate humano.',
    supportedInterfaces: [{ url: `${raiz}/a2a`, protocolBinding: 'JSONRPC', tenant: '', protocolVersion: A2A_PROTOCOL_VERSION }],
    provider: undefined,
    version: '0.1.0',
    capabilities: { streaming: false, pushNotifications: false, extensions: [] },
    securitySchemes: conClave
      ? { [NOMBRE_DE_LA_CLAVE]: { scheme: { $case: 'apiKeySecurityScheme', value: { description: 'Clave de API por cabecera. OAuth2, OIDC, mTLS y multi-partner: residual explicito (spec 005 RF-9).', location: 'header', name: CABECERA_DE_LA_CLAVE } } } }
      : {},
    securityRequirements: conClave ? [{ schemes: { [NOMBRE_DE_LA_CLAVE]: { list: [] } } }] : [],
    defaultInputModes: ENTRADAS,
    defaultOutputModes: SALIDAS,
    skills: [extraccion, lecturaXml],
    signatures: [],
  }
}
