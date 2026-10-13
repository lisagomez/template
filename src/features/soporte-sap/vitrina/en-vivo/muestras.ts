/**
 * Los únicos adjuntos de la sección en vivo: documentos sintéticos de `tools/soporte-sap/documentos`. Un invitado no
 * sube archivos a la máquina del laboratorio, ni los datos reales de sus clientes: elige uno de estos, y el portero lo
 * lee del disco del laboratorio. Datos sin dependencias: los importa la pantalla y el portero.
 */
export interface Muestra { readonly archivo: string; readonly que: string }

export const MUESTRAS: readonly Muestra[] = [
  { archivo: 'captura-migo.png', que: 'Captura del error M7 053 en MIGO (se lee con OCR local)' },
  { archivo: 'cfdi-rechazado.xml', que: 'CFDI 4.0 rechazado (se lee como XML: es el documento fiscal)' },
  { archivo: 'spool-job.pdf', que: 'PDF del spool de un job (se lee por su capa de texto)' },
]

export const esMuestra = (archivo: unknown): archivo is string => typeof archivo === 'string' && MUESTRAS.some((m) => m.archivo === archivo)
