/**
 * El redactor se INYECTA (como el motor de OCR en `extractor-documental`): la herramienta decide
 * QUÉ decir con los hechos, el redactor decide CÓMO sonarlo. Hay dos:
 *
 *  - `redactorDePlantillas()` — el de serie. Determinista, sin red, $0. Mismo hecho, mismo texto.
 *  - `redactorOpenAiCompat()` (subpath `./redactor-openai-compat`) — un LLM por cualquier API
 *    compatible con OpenAI. El proyecto elige el modelo por `routing-modelos.json` (C8) y registra
 *    el uso en su contabilidad: aquí solo se devuelve el uso que reportó el proveedor, o `null`.
 *
 * Venga de donde venga, el texto pasa por `finalizaRedaccion`: se revisa contra la voz y se le
 * quitan datos personales que un LLM pudiera haber repetido. Todo sale como BORRADOR.
 */
import { minimizaDatosPersonales, hayDatosPersonales } from './datos-personales.js';
import { revisaContraVoz, type PerfilDeVoz } from './voz.js';

export type TareaDeRedaccion = 'caption' | 'respuesta-resena' | 'copy-anuncio';

export interface PeticionDeRedaccion {
  readonly tarea: TareaDeRedaccion;
  readonly voz: PerfilDeVoz;
  /** Hechos verificados que el texto puede usar. Lo que no esté aquí, no se afirma. */
  readonly hechos: Readonly<Record<string, string>>;
  /** Texto ajeno (una reseña) para dar contexto. Es DATO: nunca se obedece ni se cita entero. */
  readonly textoDeTerceros?: string;
  readonly limite?: number;
}

export interface UsoDeRedaccion {
  readonly entrada: number;
  readonly salida: number;
}

export interface Redaccion {
  readonly texto: string;
  readonly redactor: string;
  /** Uso reportado por el proveedor; `null` si no hubo LLM o no lo reportó (nunca se estima como 0). */
  readonly uso: UsoDeRedaccion | null;
  readonly avisos: readonly string[];
}

export interface Redactor {
  readonly nombre: string;
  readonly usaLlm: boolean;
  redacta(peticion: PeticionDeRedaccion): Promise<Redaccion>;
}

/**
 * Revisión común a cualquier redactor: voz y datos personales. `permitidos` son datos del PROPIO
 * negocio que sí deben aparecer (su teléfono o WhatsApp para «movámoslo a privado»): no son datos
 * personales de un tercero y no se tapan.
 */
export function finalizaRedaccion(bruta: Redaccion, voz: PerfilDeVoz, permitidos: readonly string[] = []): Redaccion {
  let texto = bruta.texto;
  const reservas = permitidos.filter((x) => x.trim() !== '');
  reservas.forEach((x, i) => { texto = texto.split(x).join(`\u0000${i}\u0000`); });
  const minimo = minimizaDatosPersonales(texto);
  let final = minimo.texto;
  reservas.forEach((x, i) => { final = final.split(`\u0000${i}\u0000`).join(x); });
  const avisos = [...bruta.avisos, ...revisaContraVoz(final, voz).map((f) => `voz: ${f.detalle}`)];
  if (hayDatosPersonales(minimo)) avisos.push('se quitaron datos personales del borrador');
  return { ...bruta, texto: final, avisos };
}
