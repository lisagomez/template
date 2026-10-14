/**
 * Estado del estudio: SOLO en memoria (se va al cerrar la pestaña). No se persiste a propósito:
 * trae reseñas con datos de terceros y ventas del negocio, y guardarlos exigiría su propio aviso
 * de privacidad y su propia AISIA.
 */
import { create } from 'zustand';
import { VOZ_NEUTRA, normaliza, formatoDinero, type PerfilDeVoz } from '../../../../tools/pymes-marketing/dist/index.js';
import { capturaDeDescripcion, capturaDeSitio, confirmaMarca, ajustaMarca, type PerfilDeMarca } from '../../../../tools/pymes-marketing/dist/marca/index.js';
import { marcaFila, carruselDeTemporada, carruselDePaquete, carruselDeTip, type Carrusel, type EstrategiaDe30Dias, type FilaDeCalendario } from '../../../../tools/pymes-marketing/dist/contenido/index.js';
import { aprueba, pideCambio, type Aprobacion } from '../../../../tools/pymes-marketing/dist/aprobacion/index.js';
import { decideBorrador, type AnalisisDeResenas } from '../../../../tools/pymes-marketing/dist/resenas/index.js';
import type { VentasNormalizadas } from '../../../../tools/pymes-marketing/dist/ventas/index.js';
import type { Auditoria } from '../../../../tools/pymes-marketing/dist/visibilidad/index.js';
import type { BloqueDeCambio, BriefDelLunes, Campana } from '../../../../tools/pymes-marketing/dist/pulso/index.js';
import { demoPanaderia, RFC_DEMO } from '../../laboratorio-pymes/datos/cfdi-sinteticos.ts';
import { anunciosDemo, MUESTRAS_DE_VOZ, NEGOCIO_DEMO, RESENAS_DEMO, ROBOTS_BLOQUEA_IA, SITIO_DEMO } from '../../laboratorio-pymes/datos/demo.ts';
import * as S from '../services/estudio.ts';

export interface EstadoDelEstudio {
  readonly hoy: string;
  readonly ejemplo: boolean;
  readonly marca: PerfilDeMarca | null;
  readonly muestras: string;
  readonly voz: PerfilDeVoz;
  readonly contacto: string;
  readonly ventas: VentasNormalizadas | null;
  readonly origenVentas: string;
  readonly precios: Readonly<Record<string, number>>;
  readonly brief: EstrategiaDe30Dias | null;
  readonly calendario: readonly FilaDeCalendario[];
  readonly analisis: AnalisisDeResenas | null;
  /** Lo que la lectura de reseñas no pudo leer o leyó a medias: se enseña, no se tira. */
  readonly avisosResenas: readonly string[];
  readonly sitio: { readonly url: string; readonly html: string; readonly robots: string; readonly llms: string };
  readonly auditoria: Auditoria | null;
  readonly campanas: readonly Campana[] | null;
  readonly bloques: readonly BloqueDeCambio[];
  /** La moneda de la exportación (nunca se convierte) y lo que su lectura no pudo leer. */
  readonly monedaAnuncios: string;
  readonly avisosAnuncios: readonly string[];
  readonly notasCompetencia: string;
  readonly lunes: BriefDelLunes | null;
  readonly ocupado: boolean;
  readonly carruseles: readonly Carrusel[];
  readonly video: VideoDelEstudio | null;
  /** Por id de pieza: la última decisión del dueño (aprobada o cambio pedido), atada a su huella. */
  readonly aprobaciones: Readonly<Record<string, Aprobacion>>;
}

export interface VideoDelEstudio {
  readonly datos: { readonly titular: string; readonly apoyo?: string; readonly precio?: string; readonly etiqueta?: string; readonly semilla: string };
  readonly estado: 'listo' | 'renderizando' | 'error';
  readonly mp4?: Uint8Array;
  readonly url?: string;
  readonly huella?: string;
  readonly ms?: number;
  readonly error?: string;
}

interface Acciones {
  marcaDeFrase(frase: string, nombre: string): void;
  marcaDeSitio(html: string, url: string): void;
  confirmaMarca(): void;
  ajustaMarca(ajuste: 'mas-oscuro' | 'mas-claro'): void;
  fijaVoz(muestras: string, contacto: string): void;
  cargaArchivos(archivos: readonly File[], rfc: string): Promise<void>;
  confirmaPrecios(precios: Record<string, number>): void;
  generaBrief(): void;
  generaCalendario(): Promise<void>;
  decideFila(id: string, estado: 'aprobada' | 'descartada'): void;
  cargaResenas(texto: string): Promise<void>;
  decideRespuesta(indice: number, decision: 'aprobada' | 'omitida', texto?: string): void;
  audita(sitio: EstadoDelEstudio['sitio']): void;
  cargaAnuncios(csv: string): void;
  fijaCompetencia(notas: string): void;
  generaLunes(): void;
  cargaEjemplo(): Promise<void>;
  generaCarruseles(): void;
  generaCarruselDeTip(tema: string, puntos: readonly string[]): void;
  preparaVideo(): void;
  renderizaVideo(): Promise<void>;
  decide(id: string, contenido: string | Uint8Array, decision: 'aprobada' | 'cambio-pedido', nota?: string, segundo?: number | null): Promise<void>;
}

const INICIAL: EstadoDelEstudio = {
  hoy: new Date().toISOString().slice(0, 10), ejemplo: false, marca: null, muestras: '', voz: VOZ_NEUTRA, contacto: '', ventas: null, origenVentas: '',
  precios: {}, brief: null, calendario: [], analisis: null, avisosResenas: [], sitio: { url: '', html: '', robots: '', llms: '' }, auditoria: null, campanas: null, bloques: [],
  monedaAnuncios: 'MXN', avisosAnuncios: [], notasCompetencia: '', lunes: null, ocupado: false, carruseles: [], video: null, aprobaciones: {},
};

export const useEstudio = create<EstadoDelEstudio & Acciones>((set, get) => ({
  ...INICIAL,
  marcaDeFrase: (frase, nombre) => set({ marca: capturaDeDescripcion(frase, nombre || undefined) }),
  marcaDeSitio: (html, url) => set({ marca: capturaDeSitio(html, url || null) }),
  confirmaMarca: () => set((s) => ({ marca: s.marca ? confirmaMarca(s.marca) : null })),
  ajustaMarca: (a) => set((s) => ({ marca: s.marca ? ajustaMarca(s.marca, a) : null })),
  fijaVoz: (muestras, contacto) => set({ muestras, contacto, voz: S.construyeVoz(muestras.split(/\n\s*\n/)) }),
  cargaArchivos: async (archivos, rfc) => {
    set({ ocupado: true });
    const { ventas, resumen } = await S.ventasDeArchivos(archivos, rfc || undefined);
    set({ ventas, origenVentas: resumen, brief: null, calendario: [], ocupado: false });
  },
  confirmaPrecios: (precios) => set({ precios }),
  generaBrief: () => set((s) => ({ brief: S.brief(s.ventas, s.hoy), calendario: [] })),
  generaCalendario: async () => {
    const s = get();
    if (!s.brief || !s.marca) return;
    set({ ocupado: true });
    set({ calendario: await S.calendario(s.brief, s.marca, s.voz, s.precios), ocupado: false });
  },
  decideFila: (id, estado) => set((s) => ({ calendario: s.calendario.map((f) => (f.id === id ? marcaFila(f, estado) : f)) })),
  cargaResenas: async (texto) => {
    const s = get();
    const r = await S.resenas(texto, s.voz, s.marca?.nombre ?? 'Mi negocio', s.contacto, s.ventas, s.hoy);
    set({ analisis: r.analisis, avisosResenas: r.avisos });
  },
  decideRespuesta: (i, decision, texto) => set((s) => (s.analisis ? { analisis: { ...s.analisis, borradores: s.analisis.borradores.map((b, j) => (j === i ? decideBorrador(b, decision, texto) : b)) } } : {})),
  audita: (sitio) => set({ sitio, auditoria: S.auditoria(sitio.url, sitio.html, sitio.robots, sitio.llms) }),
  cargaAnuncios: (csv) => { const a = S.anuncios(csv); set({ campanas: a.campanas, bloques: a.bloques, monedaAnuncios: a.moneda, avisosAnuncios: a.avisos }); },
  fijaCompetencia: (notas) => set({ notasCompetencia: notas }),
  generaLunes: () => { const s = get(); set({ lunes: S.lunes({ ventas: s.ventas, analisis: s.analisis, auditoria: s.auditoria, campanas: s.campanas, bloques: s.bloques, notasCompetencia: s.notasCompetencia, semana: S.inicioDelBrief(s.ventas, s.hoy) }) }); },
  cargaEjemplo: async () => {
    set({ ocupado: true, ejemplo: true, hoy: '2026-10-18' });
    get().marcaDeSitio(SITIO_DEMO, NEGOCIO_DEMO.sitio);
    get().confirmaMarca();
    get().fijaVoz(MUESTRAS_DE_VOZ.join('\n\n'), NEGOCIO_DEMO.contacto);
    set({ ventas: S.ventasDeXmls(demoPanaderia(), RFC_DEMO), origenVentas: '91 CFDI sintéticos de ejemplo leídos en tu navegador' });
    get().confirmaPrecios({ 'pan de muerto': 45, 'concha de vainilla': 14 });
    get().generaBrief();
    await get().generaCalendario();
    await get().cargaResenas(RESENAS_DEMO);
    get().audita({ url: NEGOCIO_DEMO.sitio, html: SITIO_DEMO, robots: ROBOTS_BLOQUEA_IA, llms: '' });
    get().cargaAnuncios(anunciosDemo());
    get().generaLunes();
    get().generaCarruseles();
    get().preparaVideo();
    set({ ocupado: false });
  },
  generaCarruseles: () => {
    const s = get();
    if (!s.brief || !s.marca) return;
    const o = { precios: s.precios, contacto: s.contacto || undefined };
    set({ carruseles: [carruselDeTemporada(s.brief, s.marca, o), carruselDePaquete(s.brief, s.marca, o)].filter((c): c is Carrusel => c !== null) });
  },
  generaCarruselDeTip: (tema, puntos) => set((s) => (s.marca ? { carruseles: [...s.carruseles.filter((c) => c.tipo !== 'tip'), carruselDeTip(tema, puntos, s.marca)] } : {})),
  preparaVideo: () => {
    const s = get(), e = s.brief?.empujar.find((x) => x.fecha) ?? s.brief?.empujar[0];
    if (!e) return;
    const precio = s.precios[normaliza(e.producto)];
    set({ video: { estado: 'listo', datos: { titular: e.fecha?.nombre ?? e.producto, apoyo: e.fecha ? e.producto : undefined, precio: precio !== undefined ? formatoDinero(Math.round(precio * 100)) : undefined, etiqueta: e.fecha ? 'Temporada' : undefined, semilla: `promo-${e.clave}` } } });
  },
  renderizaVideo: async () => {
    const s = get();
    if (!s.video || !s.marca) return;
    set({ video: { ...s.video, estado: 'renderizando', error: undefined } });
    const r = await fetch('/api/contenido/video', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...s.video.datos, marca: { nombre: s.marca.nombre, colores: s.marca.colores, tipografia: s.marca.tipografia } }) }).catch(() => null);
    const v = get().video!;
    if (!r || !r.ok) { set({ video: { ...v, estado: 'error', error: r ? ((await r.json().catch(() => ({}))) as { error?: string }).error ?? `el servidor respondió ${r.status}` : 'sin conexión con el servidor local' } }); return; }
    const mp4 = new Uint8Array(await r.arrayBuffer());
    if (v.url) URL.revokeObjectURL(v.url);
    set({ video: { ...v, estado: 'listo', mp4, url: URL.createObjectURL(new Blob([mp4], { type: 'video/mp4' })), huella: r.headers.get('x-huella') ?? undefined, ms: Number(r.headers.get('x-ms')) || undefined } });
  },
  decide: async (id, contenido, decision, nota, segundo = null) => {
    const cuando = new Date().toISOString();
    const version = (get().aprobaciones[id]?.version ?? 0) + 1;
    const a = decision === 'aprobada' ? await aprueba(id, contenido, version, cuando) : await pideCambio(id, contenido, version, nota ?? '', cuando, segundo);
    set((s) => ({ aprobaciones: { ...s.aprobaciones, [id]: a } }));
  },
}));
