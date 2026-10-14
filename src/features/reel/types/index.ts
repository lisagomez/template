import type { Marca, MarcaDeNegocio, ProductoDeCatalogo } from '../../../../tools/reel/dist/index.js';

/** Lo que el servidor guarda del proyecto (nunca en Supabase): marca, catálogo y diccionario del negocio. */
export interface ProyectoLocal { titulo: string; marca: MarcaDeNegocio; catalogo: ProductoDeCatalogo[]; diccionario: Record<string, string> }
/** Decisiones del dueño en la sala: marcas de corte o texto, caras con consentimiento, datos cubiertos y
 *  cortes en la voz de otra persona que ya revisó (por su clave de tramo; opcional en decisiones anteriores). */
export interface DecisionesLocales { marcas: Marca[]; conConsentimiento: number[]; cubiertos: number[]; revisados?: string[] }
