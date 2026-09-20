/**
 * Intenciones POR REGLAS: de una frase dictada a lo que HARIA (evento, recordatorio, busqueda,
 * correo, nota de CRM) con su fecha entendida. Solo produce una VISTA PREVIA: ejecutar contra
 * un calendario, un correo o un CRM es accion irreversible y hoy no hay integracion (puerta
 * humana). Determinista: mismo texto y misma hora → misma lectura.
 */
import { normaliza, parteEnFrases, primerNumero, quitaAcentos } from './texto.ts';

export type TipoIntencion = 'evento' | 'recordatorio' | 'busqueda' | 'correo' | 'crm' | 'ninguna';

export interface Intencion {
  tipo: TipoIntencion;
  /** Lo que haria, en una linea, para la vista previa. */
  resumen: string;
  detalles: Record<string, string>;
  fecha?: string;
  fechaTexto?: string;
  confianza: 'alta' | 'media' | 'baja';
}

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function horaDe(texto: string): { hora: number; minuto: number; literal: string } | undefined {
  const m = /a las? (\d{1,2}|[a-z]+)(?::(\d{2}))?(?: y (media|cuarto))?( de la (?:manana|tarde|noche))?/.exec(texto);
  if (!m) return undefined;
  const hora = primerNumero(m[1] ?? '');
  if (hora === undefined || hora > 24) return undefined;
  const minuto = m[2] ? Number(m[2]) : m[3] === 'media' ? 30 : m[3] === 'cuarto' ? 15 : 0;
  const tarde = /tarde|noche/.test(m[4] ?? '') || (!m[4] && hora >= 1 && hora <= 6);
  return { hora: tarde && hora < 12 ? hora + 12 : hora, minuto, literal: m[0] };
}

/** Fecha absoluta a partir de expresiones relativas; `ahora` se inyecta para que sea determinista. */
export function fechaDe(textoCrudo: string, ahora: Date): { fecha: Date; literal: string } | undefined {
  const texto = normaliza(textoCrudo);
  const base = new Date(ahora);
  let literal = '';
  const dia = DIAS.findIndex((d) => new RegExp(`\\b(?:el |este |proximo )?${d}\\b`).test(texto));
  const enPlazo = /en (\d+|[a-z]+) (minutos?|horas?|dias?|semanas?)/.exec(texto);
  const fechaMes = /(?:el )?(\d{1,2}) de ([a-z]+)/.exec(texto);
  if (/pasado manana/.test(texto)) {
    base.setDate(base.getDate() + 2);
    literal = 'pasado mañana';
  } else if (/(?<!de la |por la |en la )\bmanana\b/.test(texto)) {
    base.setDate(base.getDate() + 1);
    literal = 'mañana';
  } else if (enPlazo) {
    const n = primerNumero(enPlazo[1] ?? '') ?? 1;
    const u = enPlazo[2] ?? '';
    if (u.startsWith('minuto')) base.setMinutes(base.getMinutes() + n);
    else if (u.startsWith('hora')) base.setHours(base.getHours() + n);
    else if (u.startsWith('dia')) base.setDate(base.getDate() + n);
    else base.setDate(base.getDate() + n * 7);
    literal = enPlazo[0];
    return { fecha: base, literal };
  } else if (fechaMes && MESES.includes(fechaMes[2] ?? '')) {
    base.setMonth(MESES.indexOf(fechaMes[2] ?? ''), Number(fechaMes[1]));
    if (base < ahora) base.setFullYear(base.getFullYear() + 1);
    literal = fechaMes[0];
  } else if (dia >= 0) {
    const salto = (dia - base.getDay() + 7) % 7 || 7;
    base.setDate(base.getDate() + salto);
    literal = DIAS[dia] ?? '';
  } else if (/\bhoy\b/.test(texto)) {
    literal = 'hoy';
  }
  const hora = horaDe(texto);
  if (hora) {
    base.setHours(hora.hora, hora.minuto, 0, 0);
    literal = literal ? `${literal} ${hora.literal}` : hora.literal;
  } else if (literal) {
    base.setHours(9, 0, 0, 0);
  }
  return literal ? { fecha: base, literal } : undefined;
}

const quien = (texto: string): string | undefined => {
  const m = /\b(?:con|a|para) ([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?: [A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?)/.exec(texto);
  return m?.[1];
};

function tipoDe(texto: string): TipoIntencion {
  const t = quitaAcentos(texto.toLowerCase());
  if (/\b(recuerdame|recordatorio|avisame|no (?:me )?olvide|recordarme)\b/.test(t)) return 'recordatorio';
  if (/\b(correo|email|mail)\b/.test(t) && /\b(envia|manda|redacta|escribe|mandale|enviale)\b/.test(t)) return 'correo';
  if (/\b(busca|buscar|encuentra|abre|localiza|muestrame|muestra)\b/.test(t)) return 'busqueda';
  if (/\b(agenda|agendar|programa|programar|reunion|cita|junta|reserva)\b/.test(t)) return 'evento';
  if (/\b(cliente|lead|prospecto|oportunidad|cuenta|crm)\b/.test(t) && /\b(anota|registra|apunta|actualiza|crea|marca)\b/.test(t)) return 'crm';
  return 'ninguna';
}

export function detectaIntencion(texto: string, ahora: Date = new Date()): Intencion {
  const tipo = tipoDe(texto);
  const cuando = fechaDe(texto, ahora);
  const persona = quien(texto);
  const detalles: Record<string, string> = {};
  const fecha = cuando ? { fecha: cuando.fecha.toISOString(), fechaTexto: cuando.literal } : {};
  const fechaLegible = cuando ? cuando.fecha.toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' }) : 'sin fecha';
  if (persona) detalles.persona = persona;
  switch (tipo) {
    case 'evento':
      return { tipo, resumen: `Crearia un evento${persona ? ` con ${persona}` : ''} · ${fechaLegible}`, detalles, ...fecha, confianza: cuando ? 'alta' : 'media' };
    case 'recordatorio': {
      const tarea = texto.replace(/^.*?(recu[eé]rdame|av[ií]same|recordatorio(?: de)?|no (?:me )?olvide(?:s)?(?: de)?)\s*/i, '').replace(new RegExp(cuando?.literal ?? '$^', 'i'), '').trim();
      detalles.tarea = tarea || texto;
      return { tipo, resumen: `Guardaria un recordatorio: «${detalles.tarea}» · ${fechaLegible}`, detalles, ...fecha, confianza: cuando ? 'alta' : 'media' };
    }
    case 'busqueda': {
      detalles.consulta = texto.replace(/^.*?\b(busca|buscar|encuentra|abre|localiza|muestrame|muestra)\b\s*(?:el |la |los |las |un |una )?/i, '').trim();
      return { tipo, resumen: `Buscaria documentos: «${detalles.consulta}»`, detalles, confianza: detalles.consulta ? 'alta' : 'baja' };
    }
    case 'correo': {
      const asunto = /\b(?:sobre|asunto|diciendo|que diga)\s+(.+)$/i.exec(texto)?.[1];
      if (asunto) detalles.asunto = asunto;
      return { tipo, resumen: `Redactaria un correo${persona ? ` para ${persona}` : ''}${asunto ? ` sobre «${asunto}»` : ''} (borrador, sin enviar)`, detalles, confianza: persona ? 'alta' : 'media' };
    }
    case 'crm':
      detalles.nota = texto;
      return { tipo, resumen: `Anotaria en el CRM${persona ? ` (cliente ${persona})` : ''}: «${texto}»`, detalles, confianza: 'media' };
    default:
      return { tipo, resumen: 'No reconozco una accion: queda como texto dictado.', detalles, confianza: 'baja' };
  }
}

/**
 * Un dictado puede traer varias acciones («agenda… punto y aparte busca…»): se lee frase a frase
 * y sale una intencion por frase. Si ninguna frase trae accion, queda una sola «ninguna».
 */
export function detectaIntenciones(texto: string, ahora: Date = new Date()): Intencion[] {
  const porFrase = parteEnFrases(texto).map((f) => detectaIntencion(f, ahora));
  const conAccion = porFrase.filter((i) => i.tipo !== 'ninguna');
  return conAccion.length > 0 ? conAccion : [detectaIntencion(texto, ahora)];
}
