/**
 * Las ranuras de la capa: los huecos fijos de la experiencia donde un módulo se enchufa. El catálogo es
 * cerrado y versionado: un producto elige qué módulo llena cada una, nunca inventa otra. Intercambiar
 * módulos cambia QUIÉN llena la ranura, no la ranura.
 *
 * Reimplementado (no copiado) de la forma de la «Cabina» de Arbrain v0.2.10: una ventana con chat, panel
 * lateral, lienzo y explorador (`arbrain/src/features/cabina/Cabina.tsx`, `panel/`, `explorador/`). La
 * procedencia de cada pieza está en `mapa.json`.
 */

export const RANURAS = [
  'conversacion',
  'lienzo',
  'explorador',
  'panel',
  'plan',
  'voz',
  'memoria',
  'freno',
  'primer-arranque',
  'ajustes',
  'intencion',
] as const

export type Ranura = (typeof RANURAS)[number]

/** Las que solo llena la capa: el freno no se reemplaza, porque su garantía no depende de quién compone. */
export const RANURAS_DE_LA_CAPA: readonly Ranura[] = ['freno']

/** Sin módulo, estas no tienen versión de la capa: el lienzo es la pantalla del módulo, y la voz exige un
 *  motor local declarado (si no, el botón no aparece o explica por qué; nunca se llena sola con la nube). */
export const RANURAS_SIN_RESPALDO: readonly Ranura[] = ['lienzo', 'voz']

export interface FichaRanura {
  id: Ranura
  nombre: string
  queHace: string
  /** Lo que la llena si ningún módulo del producto la declara (null: queda vacía y lo dice). */
  respaldo: string | null
}

export const FICHAS: Readonly<Record<Ranura, FichaRanura>> = {
  conversacion: { id: 'conversacion', nombre: 'Conversación', queHace: 'Chat con el asistente del producto: pedir en lenguaje simple, escuchar cada respuesta y dictar.', respaldo: 'la conversación de la capa, con el enrutador de intención sin LLM' },
  lienzo: { id: 'lienzo', nombre: 'Lienzo', queHace: 'Donde se pinta la pantalla del módulo.', respaldo: null },
  explorador: { id: 'explorador', nombre: 'Explorador', queHace: 'Las pantallas y piezas del producto, a un clic.', respaldo: 'la lista de pantallas que declaran los enchufes' },
  panel: { id: 'panel', nombre: 'Panel', queHace: 'El costado: lo que está pasando, lo que espera tu clic y lo que sigue.', respaldo: 'el panel de la capa: freno pendiente, memoria y plan del día' },
  plan: { id: 'plan', nombre: 'Plan y calendario', queHace: 'La agenda y el plan del día.', respaldo: 'la agenda mínima de la capa (en la memoria del producto)' },
  voz: { id: 'voz', nombre: 'Voz', queHace: 'Dictar, escuchar cada respuesta y conversar con manos libres (Modo conversación).', respaldo: null },
  memoria: { id: 'memoria', nombre: 'Memoria del producto', queHace: 'Lo que el producto recuerda entre sesiones, por inquilino.', respaldo: 'la memoria de la capa en el almacén que declare el producto' },
  freno: { id: 'freno', nombre: 'Freno', queHace: 'Lo irreversible pide la cita textual de quien lo pidió y un clic. Decirlo en voz alta no basta.', respaldo: 'el freno de la capa (único)' },
  'primer-arranque': { id: 'primer-arranque', nombre: 'Primer arranque', queHace: 'La guía de la primera vez y cuánto pregunta el asistente.', respaldo: 'la guía de la capa, armada con la marca y lo que declaran los enchufes' },
  ajustes: { id: 'ajustes', nombre: 'Ajustes', queHace: 'Cuánto pregunta, la voz (con «Probar») y la memoria.', respaldo: 'los ajustes de la capa' },
  intencion: { id: 'intencion', nombre: 'Operar por intención', queHace: 'Se pide el resultado y la app encuentra qué módulo lo hace.', respaldo: 'el enrutador de la capa sobre las intenciones de los enchufes' },
}

export const esRanura = (x: unknown): x is Ranura => typeof x === 'string' && (RANURAS as readonly string[]).includes(x)
