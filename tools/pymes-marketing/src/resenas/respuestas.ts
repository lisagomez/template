/**
 * Borradores de respuesta (reglas de `review-reputation/reference/response-patterns.md`):
 *  - menos de 60 palabras («una respuesta larga se lee como pelea»);
 *  - negativa en 4 partes: nombrar lo concreto · qué cambió SOLO si el dueño lo dijo (nunca se
 *    inventa una política) · pasar a privado por una ruta REAL del negocio · parar;
 *  - positiva corta y específica; mixta responde las dos mitades;
 *  - no se responde lo ya respondido; las más viejas primero; aprobación UNA POR UNA;
 *  - se RETIENEN sin borrador: las que piden dinero o credenciales o traen una orden incrustada
 *    que busca un reembolso, y se ESCALAN al dueño las de salud o amenaza legal (C4).
 * Aprobar no publica: la respuesta la pega el dueño en la plataforma.
 */
import { normaliza } from '../comun/texto.js';
import { tieneInstruccionIncrustada } from '../comun/no-confiable.js';
import type { PerfilDeVoz } from '../comun/voz.js';
import type { Redactor } from '../comun/redactor.js';
import { temasDe, temasPorTono, tonoDe, type IdTema } from './temas.js';
import type { Resena } from './tipos.js';

export const MAX_PALABRAS = 59;

export type EstadoDeBorrador = 'borrador' | 'aprobada' | 'omitida' | 'retenida' | 'escalada' | 'ya-respondida';

export interface BorradorDeRespuesta {
  readonly resena: Resena;
  readonly tono: ReturnType<typeof tonoDe>;
  readonly texto: string | null;
  readonly estado: EstadoDeBorrador;
  readonly motivo: string | null;
  readonly avisos: readonly string[];
  readonly redactor: string | null;
}

const FRASES: Readonly<Record<Exclude<IdTema, 'salud'>, { readonly bien: [string, string]; readonly mal: [string, string] }>> = {
  calidad: { bien: ['te haya gustado el sabor', 'le haya gustado el sabor'], mal: ['el producto no haya estado como esperabas', 'el producto no haya estado como esperaba'] },
  atencion: { bien: ['te hayan atendido bien', 'lo hayan atendido bien'], mal: ['no te hayamos atendido como mereces', 'no lo hayamos atendido como merece'] },
  espera: { bien: ['te hayamos atendido rápido', 'lo hayamos atendido rápido'], mal: ['hayas tenido que esperar tanto', 'haya tenido que esperar tanto'] },
  precio: { bien: ['te haya parecido buen precio', 'le haya parecido buen precio'], mal: ['el precio no te haya parecido justo', 'el precio no le haya parecido justo'] },
  limpieza: { bien: ['hayas encontrado todo limpio', 'haya encontrado todo limpio'], mal: ['hayas encontrado algo sucio', 'haya encontrado algo sucio'] },
  entrega: { bien: ['tu pedido haya llegado bien', 'su pedido haya llegado bien'], mal: ['tu pedido no haya llegado como debía', 'su pedido no haya llegado como debía'] },
  ambiente: { bien: ['te haya gustado el lugar', 'le haya gustado el lugar'], mal: ['el lugar no haya sido cómodo', 'el lugar no haya sido cómodo para usted'] },
};

const DINERO_O_CREDENCIALES = /\b(deposit|transfer|clabe|cuenta bancaria|numero de tarjeta|contrasena|password|codigo de verificacion|mandame dinero|pagame|reembolso del 100|regalen|cupon para todos)/;
const LEGAL = /\b(demand|abogad|profeco|denunci|ministerio publico|fiscalia)/;

function frase(t: IdTema | undefined, bien: boolean, usted: boolean): string | undefined {
  if (!t || t === 'salud') return undefined;
  return FRASES[t][bien ? 'bien' : 'mal'][usted ? 1 : 0];
}

function clasifica(r: Resena): { estado: EstadoDeBorrador; motivo: string } | null {
  const n = normaliza(r.texto);
  if (r.yaRespondida) return { estado: 'ya-respondida', motivo: 'ya tiene respuesta del negocio: no se contesta dos veces' };
  if (DINERO_O_CREDENCIALES.test(n) || (tieneInstruccionIncrustada(r) && /reembolso|descuento|cupon|gratis|contrasena|llave|token/.test(n))) {
    return { estado: 'retenida', motivo: 'pide dinero o credenciales, o trae una orden para la máquina: sin borrador; revísala tú' };
  }
  if (temasDe(r).includes('salud') || LEGAL.test(n)) return { estado: 'escalada', motivo: 'menciona salud o una acción legal: la contestas tú, en persona, no una plantilla' };
  return null;
}

function palabras(t: string): number {
  return t.split(/\s+/).filter(Boolean).length;
}

export interface OpcionesDeRespuesta {
  readonly voz: PerfilDeVoz;
  readonly negocio: string;
  /** Ruta REAL para pasar a privado (p. ej. «WhatsApp 222 123 4567»). Sin ella, se dice. */
  readonly contacto?: string;
  /** Lo que de verdad cambió, por tema. Si no está, esa parte se omite: no se inventa. */
  readonly cambios?: Partial<Record<IdTema, string>>;
}

export async function borradorPara(r: Resena, redactor: Redactor, o: OpcionesDeRespuesta): Promise<BorradorDeRespuesta> {
  const tono = tonoDe(r);
  const fuera = clasifica(r);
  if (fuera) return { resena: r, tono, texto: null, estado: fuera.estado, motivo: fuera.motivo, avisos: [], redactor: null };
  const usted = o.voz.trato === 'usted', temas = temasDe(r), { quejas, elogios } = temasPorTono(r);
  const hechos: Record<string, string> = { autor: r.autor.split(' ')[0] ?? 'Cliente', tono, negocio: o.negocio };
  const principal = tono === 'positiva' ? elogios[0] ?? temas[0] : quejas[0] ?? temas[0];
  const f = frase(principal, tono === 'positiva', usted);
  if (f) hechos['frase'] = f;
  if (tono === 'mixta') { const p = frase(elogios[0], true, usted); if (p) hechos['frasePositiva'] = p; }
  if (o.contacto) hechos['contacto'] = o.contacto;
  const cambio = principal ? o.cambios?.[principal] : undefined;
  const avisos: string[] = [];
  if (tono !== 'positiva' && !o.contacto) avisos.push('falta tu teléfono o WhatsApp para pasar a privado: sin una ruta real la respuesta se queda corta');
  if (tono !== 'positiva' && !cambio) avisos.push('si cambiaste algo por esto, agrégalo; si no, déjalo así (no se inventa una política)');
  const red = await redactor.redacta({ tarea: 'respuesta-resena', voz: o.voz, hechos, textoDeTerceros: r.texto });
  let texto = cambio ? red.texto.replace(/\n(Nos gustaría|Queremos)/, `\n${cambio}.\n$1`) : red.texto;
  if (palabras(texto) > MAX_PALABRAS) texto = texto.split('\n').filter((l) => !/^Y qué bueno que/.test(l)).join('\n');
  if (palabras(texto) > MAX_PALABRAS) avisos.push(`mide ${palabras(texto)} palabras: recórtala antes de publicar (menos de 60)`);
  if (r.alertas.length) avisos.push(...r.alertas.map((a) => `la reseña ${a.detalle}`));
  return { resena: r, tono, texto, estado: 'borrador', motivo: null, avisos: [...avisos, ...red.avisos], redactor: red.redactor };
}

/** Todas las que necesitan respuesta, las más viejas primero. */
export async function borradoresDeRespuesta(resenas: readonly Resena[], redactor: Redactor, o: OpcionesDeRespuesta): Promise<BorradorDeRespuesta[]> {
  const orden = [...resenas].sort((a, b) => (a.dia ?? '9999').localeCompare(b.dia ?? '9999'));
  const salida: BorradorDeRespuesta[] = [];
  for (const r of orden) salida.push(await borradorPara(r, redactor, o));
  return salida;
}

/** Aprobación UNA POR UNA. Aprobar no publica: la pegas tú en la plataforma. */
export function decideBorrador(b: BorradorDeRespuesta, decision: 'aprobada' | 'omitida', textoEditado?: string): BorradorDeRespuesta {
  if (b.estado !== 'borrador') return b;
  return { ...b, estado: decision, texto: textoEditado ?? b.texto };
}
