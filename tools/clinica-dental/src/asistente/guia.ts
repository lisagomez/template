/**
 * LA GUIA DE VOZ DEL REGISTRO: dice cada campo, escucha, PROPONE lo que entendio y espera un «si, correcto» antes de
 * llenarlo (medido: un «si» suelto el ASR local lo oye en ingles — «See», «Steve» —; «si, correcto», no). Al final lee el resumen y solo envia con un «si, envialo» explicito. Se puede decir «para»,
 * «repite», «atras» o «corrige <campo>» en cualquier momento. Sin LLM: corre con reglas (`interpreta.ts`).
 *
 * Lo que la guia NO hace, a proposito:
 *  - No pide la contraseña en voz alta (se escribe en pantalla).
 *  - No marca consentimientos: el del dato de salud es expreso, por escrito y con la cuenta autenticada
 *    (LFPDPPP 2025, art. 8); la guia recuerda marcarlos en pantalla.
 */
import { MAYORIA_DE_EDAD } from '../cuestionario.js';
import { NOMBRE_CATEGORIA, type Categoria } from '../clinicas.js';
import { categoriasDichas, celularDicho, correoDicho, edadDicha, empresaDicha, nombreDicho, ningunoDicho, parentescoDicho, siONo } from './interpreta.js';
import { normaliza } from './urgencias.js';

export type ValorCampo = string | number | Categoria[] | null;
export type CampoGuia = 'nombre' | 'apellidoPaterno' | 'apellidoMaterno' | 'edad' | 'correo' | 'celular' | 'empresa' | 'categorias' | 'padecimiento' | 'tutor.nombre' | 'tutor.apellidoPaterno' | 'tutor.parentesco' | 'tutor.correo' | 'tutor.celular';

interface Paso { campo: CampoGuia; etiqueta: string; pregunta: string; interpreta: (t: string) => ValorCampo | undefined; opcional?: boolean; soloMenor?: boolean }

const opcional = (f: (t: string) => ValorCampo | undefined) => (t: string) => (ningunoDicho(t) ? null : f(t));
const nulo = <T>(x: T | null): T | undefined => (x === null ? undefined : x);

export const PASOS: readonly Paso[] = [
  { campo: 'nombre', etiqueta: 'nombre', pregunta: '¿Cuál es tu nombre o tus nombres?', interpreta: (t) => nulo(nombreDicho(t)) },
  { campo: 'apellidoPaterno', etiqueta: 'apellido paterno', pregunta: '¿Tu apellido paterno?', interpreta: (t) => nulo(nombreDicho(t)) },
  { campo: 'apellidoMaterno', etiqueta: 'apellido materno', pregunta: '¿Tu apellido materno? Si no tienes, di «no tengo».', interpreta: opcional((t) => nulo(nombreDicho(t))), opcional: true },
  { campo: 'edad', etiqueta: 'edad', pregunta: '¿Cuántos años tienes?', interpreta: (t) => nulo(edadDicha(t)) },
  { campo: 'correo', etiqueta: 'correo', pregunta: 'Dime tu correo. Por ejemplo: ana punto lópez arroba ejemplo punto com.', interpreta: (t) => nulo(correoDicho(t)) },
  { campo: 'celular', etiqueta: 'celular', pregunta: 'Dime tu celular, los diez dígitos.', interpreta: (t) => nulo(celularDicho(t)) },
  { campo: 'empresa', etiqueta: 'empresa del convenio', pregunta: 'Si vienes por un convenio de tu empresa, dime cuál. Si no, di «ninguna».', interpreta: opcional((t) => nulo(empresaDicha(t))), opcional: true },
  { campo: 'categorias', etiqueta: 'qué te interesa', pregunta: '¿Qué te interesa? Odontología general, ortodoncia, endodoncia o implantes. Puedes decir varias.', interpreta: (t) => nulo(categoriasDichas(t)) },
  { campo: 'padecimiento', etiqueta: 'padecimiento', pregunta: 'Si quieres, describe brevemente qué te molesta. Es un dato de salud: solo se guarda si marcas en pantalla el consentimiento expreso. Di «nada» para saltarlo.', interpreta: (t) => (/^(omitir|omite|saltar|no|paso|ninguno|ninguna|nada|nada mas)$/.test(normaliza(t)) ? null : t.trim().slice(0, 500)), opcional: true },
  { campo: 'tutor.nombre', etiqueta: 'nombre de tu madre, padre o tutor', pregunta: 'Como eres menor de edad, necesito a tu madre, padre o tutor. ¿Cuál es su nombre?', interpreta: (t) => nulo(nombreDicho(t)), soloMenor: true },
  { campo: 'tutor.apellidoPaterno', etiqueta: 'apellido paterno del tutor', pregunta: '¿Y su apellido paterno?', interpreta: (t) => nulo(nombreDicho(t)), soloMenor: true },
  { campo: 'tutor.parentesco', etiqueta: 'parentesco', pregunta: '¿Es tu madre, tu padre o tu tutor legal?', interpreta: (t) => nulo(parentescoDicho(t)), soloMenor: true },
  { campo: 'tutor.correo', etiqueta: 'correo del tutor', pregunta: '¿Su correo?', interpreta: (t) => nulo(correoDicho(t)), soloMenor: true },
  { campo: 'tutor.celular', etiqueta: 'celular del tutor', pregunta: '¿Su celular, los diez dígitos?', interpreta: (t) => nulo(celularDicho(t)), soloMenor: true },
];

export type Fase = 'pregunta' | 'confirma' | 'resumen' | 'pausa' | 'enviado';
export interface EstadoGuia { indice: number; valores: Partial<Record<CampoGuia, ValorCampo>>; propuesta: ValorCampo | undefined; fase: Fase; antes: Fase | null }
export type AccionGuia = { tipo: 'llena'; campo: CampoGuia; valor: ValorCampo } | { tipo: 'enfoca'; campo: CampoGuia } | { tipo: 'enviar' } | { tipo: 'pausa' };
export interface PasoGuiaResultado { estado: EstadoGuia; decir: string; acciones: AccionGuia[] }

export const correoParaVoz = (c: string) => c.replace(/@/g, ' arroba ').replace(/\./g, ' punto ').replace(/_/g, ' guion bajo ').replace(/-/g, ' guion ');
const enVoz = (campo: CampoGuia, v: ValorCampo): string => {
  if (v === null) return 'sin dato';
  if (Array.isArray(v)) return v.map((c) => NOMBRE_CATEGORIA[c]).join(', ');
  if (campo.endsWith('correo')) return correoParaVoz(String(v));
  if (campo.endsWith('celular')) return String(v).replace('+52', '').replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3');
  if (campo === 'tutor.parentesco') return v === 'tutor_legal' ? 'tutor legal' : String(v);
  return String(v);
};

const menor = (e: EstadoGuia) => typeof e.valores.edad === 'number' && e.valores.edad < MAYORIA_DE_EDAD;
const aplica = (e: EstadoGuia, i: number) => !PASOS[i]?.soloMenor || menor(e);
function siguiente(e: EstadoGuia, desde: number): number {
  let i = desde;
  while (i < PASOS.length && !aplica(e, i)) i++;
  return i;
}

function pregunta(e: EstadoGuia, extra = ''): PasoGuiaResultado {
  const i = siguiente(e, e.indice);
  if (i >= PASOS.length) return resumen({ ...e, indice: i });
  const p = PASOS[i]!;
  return { estado: { ...e, indice: i, fase: 'pregunta', propuesta: undefined }, decir: `${extra}${p.pregunta}`, acciones: [{ tipo: 'enfoca', campo: p.campo }] };
}

function resumen(e: EstadoGuia): PasoGuiaResultado {
  const lineas = PASOS.filter((_, i) => aplica(e, i) && e.valores[PASOS[i]!.campo] !== undefined).map((p) => `${p.etiqueta}: ${enVoz(p.campo, e.valores[p.campo] ?? null)}`);
  return {
    estado: { ...e, fase: 'resumen', propuesta: undefined },
    decir: `Repaso lo que tengo. ${lineas.join('. ')}. Antes de enviar: escribe tu contraseña en pantalla, no la digas en voz alta, y marca las casillas de consentimiento que quieras. Para enviar, di «sí, envíalo». Para cambiar algo, di «corrige» y el campo.`,
    acciones: [],
  };
}

export const inicioGuia = (): PasoGuiaResultado => pregunta({ indice: 0, valores: {}, propuesta: undefined, fase: 'pregunta', antes: null }, 'Hola, te ayudo a registrarte. Puedes decir «para», «repite», «atrás» o «lo escribo» cuando quieras. ');

function ordenGlobal(e: EstadoGuia, t: string): PasoGuiaResultado | null {
  if (/^(para|pausa|detente|espera|alto)$/.test(t)) return { estado: { ...e, fase: 'pausa', antes: e.fase }, decir: 'Pausé la guía. Di «continúa» para seguir.', acciones: [{ tipo: 'pausa' }] };
  if (e.fase === 'pausa') return /^(continua|sigue|seguimos|adelante|reanuda)/.test(t) ? (e.antes === 'resumen' ? resumen(e) : pregunta(e)) : { estado: e, decir: 'Sigo en pausa. Di «continúa» para seguir.', acciones: [] };
  if (/^(repite|otra vez|que dijiste|como)$/.test(t)) return e.fase === 'resumen' ? resumen(e) : pregunta(e);
  if (/^(atras|anterior|regresa|el anterior)$/.test(t)) {
    let i = Math.max(0, (e.fase === 'resumen' ? PASOS.length : e.indice) - 1);
    while (i > 0 && !aplica(e, i)) i--;
    return pregunta({ ...e, indice: i });
  }
  if (/^(lo escribo|mejor lo escribo|lo tecleo|escribir|lo escribo yo)$/.test(t) && e.fase !== 'resumen') {
    return pregunta({ ...e, indice: siguiente(e, e.indice) + 1 }, 'De acuerdo, escríbelo en pantalla. ');
  }
  const corrige = /^(corrige|cambia|corregir) (el |la |mi |los )?(.+)$/.exec(t);
  if (corrige?.[3]) {
    const i = PASOS.findIndex((p, k) => aplica(e, k) && normaliza(p.etiqueta).includes(corrige[3]!.trim()));
    return i >= 0 ? pregunta({ ...e, indice: i }) : { estado: e, decir: 'No ubiqué ese campo. Dime cuál: nombre, apellido, edad, correo, celular, empresa, intereses o padecimiento.', acciones: [] };
  }
  return null;
}

export function procesaGuia(e: EstadoGuia, dicho: string): PasoGuiaResultado {
  const t = normaliza(dicho);
  const global = ordenGlobal(e, t);
  if (global) return global;
  if (e.fase === 'enviado') return { estado: e, decir: 'Tu registro ya se envió.', acciones: [] };
  if (e.fase === 'resumen') {
    return siONo(dicho) === 'enviar'
      ? { estado: { ...e, fase: 'enviado' }, decir: 'Envío tu registro.', acciones: [{ tipo: 'enviar' }] }
      : { estado: e, decir: 'No envío nada sin tu permiso. Di «sí, envíalo» para enviar, o «corrige» y el campo.', acciones: [] };
  }
  const p = PASOS[e.indice];
  if (!p) return resumen(e);
  if (e.fase === 'confirma') {
    const r = siONo(dicho);
    if (r === 'si' || r === 'enviar') return pregunta({ ...e, indice: e.indice + 1, valores: { ...e.valores, [p.campo]: e.propuesta ?? null } }, 'Listo. ');
    if (r === 'no') {
      const otra = pregunta(e, 'De acuerdo, otra vez. ');
      return { ...otra, acciones: [{ tipo: 'llena', campo: p.campo, valor: null }, ...otra.acciones] };
    }
    return { estado: e, decir: `¿Es correcto ${enVoz(p.campo, e.propuesta ?? null)}? Di «sí, correcto» o «no».`, acciones: [] };
  }
  const valor = p.interpreta(dicho);
  if (valor === undefined) return { estado: e, decir: `No te entendí. ${p.pregunta}`, acciones: [] };
  return { estado: { ...e, fase: 'confirma', propuesta: valor }, decir: `Entendí: ${enVoz(p.campo, valor)}. ¿Es correcto? Di «sí, correcto» o «no».`, acciones: [{ tipo: 'llena', campo: p.campo, valor }] };
}
