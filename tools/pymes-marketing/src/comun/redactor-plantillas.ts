/**
 * Redactor de serie: plantillas en español de México, deterministas, sin red y sin coste.
 * Respeta la voz (tú/usted, emojis, exclamaciones, saludo y despedida del dueño) y NUNCA
 * repite ni obedece el texto de terceros: con una reseña solo usa los hechos ya extraídos.
 */
import { finalizaRedaccion, type PeticionDeRedaccion, type Redaccion, type Redactor } from './redactor.js';
import { azarDe, recorta } from './texto.js';
import type { PerfilDeVoz } from './voz.js';

const EMOJIS: Readonly<Record<string, readonly string[]>> = {
  caption: ['✨', '🙌', '👉', '📍', '🎉'],
  'respuesta-resena': ['🙏', '😊'],
};

function emoji(voz: PerfilDeVoz, tarea: string, semilla: string): string {
  if (voz.emojis === 'nunca') return '';
  const lista = EMOJIS[tarea] ?? [];
  return lista.length ? ` ${lista[Math.floor(azarDe(semilla) * lista.length)]}` : '';
}

function exclama(voz: PerfilDeVoz, frase: string): string {
  return voz.exclamaciones === 'nunca' ? `${frase}.` : `¡${frase}!`;
}

function saludo(voz: PerfilDeVoz, nombre: string): string {
  if (voz.saludo) return voz.saludo.replace('<nombre>', nombre);
  return `Hola, ${nombre}:`;
}

function llamado(voz: PerfilDeVoz, h: Readonly<Record<string, string>>, semilla: string): string {
  const usted = voz.trato === 'usted';
  const opciones = h['canal'] === 'whatsapp'
    ? [usted ? 'Respóndanos y se lo apartamos' : 'Respóndenos y te lo apartamos']
    : usted
      ? ['Pídalo por WhatsApp', 'Apártelo hoy', 'Venga por el suyo']
      : ['Pídelo por WhatsApp', 'Apártalo hoy', 'Ven por el tuyo'];
  return h['cta'] ?? opciones[Math.floor(azarDe(semilla, 1) * opciones.length)]!;
}

/** Gancho → un beneficio concreto → un llamado → hashtags (IG 3–5, FB hasta 2, estado ninguno). */
function caption(p: PeticionDeRedaccion): string {
  const h = p.hechos, v = p.voz, semilla = `${h['producto']}|${h['fecha'] ?? ''}`;
  const pendiente = h['pendiente'] ? `[POR COMPLETAR: ${h['pendiente']}]` : '';
  if (h['formato'] === 'estado') {
    const linea = h['ocasion'] ? `${h['ocasion']}: ${h['producto']}` : `${h['producto']}${h['precio'] ? ` · ${h['precio']}` : ''}`;
    const invita = v.trato === 'usted' ? 'Respóndanos y se lo apartamos' : 'Respóndenos y te lo apartamos';
    return [pendiente, `${linea}${emoji(v, 'caption', semilla)}`, invita].filter(Boolean).join('\n');
  }
  const gancho = h['ocasion'] ? `${h['ocasion']} ya viene${emoji(v, 'caption', semilla)}` : `${h['producto']}${emoji(v, 'caption', semilla)}`;
  const beneficio = [h['ocasion'] ? `${h['producto']}${h['beneficio'] ? `, ${h['beneficio']}` : ''}.` : h['beneficio'] ? `${h['beneficio']}.` : '', h['oferta'] ? `${h['oferta']}.` : '', h['precio'] ? `${h['precio']}.` : ''].filter(Boolean).join(' ');
  const cierre = `${llamado(v, h, semilla)}${v.despedida ? `\n${v.despedida}` : ''}`;
  const etiquetas = h['etiquetas'] ? `\n\n${h['etiquetas']}` : '';
  return [pendiente, gancho, beneficio, `${cierre}${etiquetas}`].filter(Boolean).join('\n').trim();
}

function respuestaResena(p: PeticionDeRedaccion): string {
  const h = p.hechos, v = p.voz, nombre = h['autor'] ?? 'Cliente';
  const firma = v.despedida ?? (h['negocio'] ? `— ${h['negocio']}` : '');
  const usted = v.trato === 'usted';
  const partes: string[] = [saludo(v, nombre)];
  if (h['tono'] === 'positiva') {
    partes.push(exclama(v, usted ? 'Muchas gracias por su reseña' : 'Muchas gracias por tu reseña'));
    if (h['frase']) partes.push(`Nos da mucho gusto que ${h['frase']}.`);
    partes.push(usted ? `Aquí lo esperamos pronto${emoji(v, 'respuesta-resena', nombre)}` : `Aquí te esperamos pronto${emoji(v, 'respuesta-resena', nombre)}`);
  } else {
    partes.push(usted ? 'Gracias por tomarse el tiempo de contarnos.' : 'Gracias por tomarte el tiempo de contarnos.');
    if (h['frase']) partes.push(`Lamentamos que ${h['frase']}; no es lo que queremos para nadie.`);
    if (h['tono'] === 'mixta' && h['frasePositiva']) partes.push(`Y qué bueno que ${h['frasePositiva']}.`);
    const canal = h['contacto'] ? ` en ${h['contacto']}` : ' por mensaje directo';
    partes.push(usted ? `Nos gustaría arreglarlo: escríbanos${canal} y lo vemos personalmente.` : `Nos gustaría arreglarlo: escríbenos${canal} y lo vemos personalmente.`);
  }
  if (firma) partes.push(firma);
  return partes.join('\n');
}

function copyAnuncio(p: PeticionDeRedaccion): string {
  const h = p.hechos, v = p.voz;
  const titular = recorta(h['oferta'] ? `${h['producto']}: ${h['oferta']}` : `${h['producto']} en ${h['negocio'] ?? 'tu negocio'}`, 40);
  const texto = recorta([h['beneficio'] ? `${h['producto']}, ${h['beneficio']}.` : `${h['producto']}.`, h['oferta'] ? `${h['oferta']}.` : '', h['zona'] ? `En ${h['zona']}.` : ''].filter(Boolean).join(' '), 125);
  const boton = v.trato === 'usted' ? 'Envíe un mensaje' : 'Envía un mensaje';
  return `${titular}\n${texto}\n${boton}`;
}

const PLANTILLAS = { caption, 'respuesta-resena': respuestaResena, 'copy-anuncio': copyAnuncio } as const;

export function redactorDePlantillas(): Redactor {
  return {
    nombre: 'plantillas',
    usaLlm: false,
    async redacta(p: PeticionDeRedaccion): Promise<Redaccion> {
      const bruto = PLANTILLAS[p.tarea](p);
      const texto = p.limite ? recorta(bruto, p.limite) : bruto;
      return finalizaRedaccion({ texto, redactor: 'plantillas', uso: null, avisos: [] }, p.voz, [p.hechos['contacto'] ?? '']);
    },
  };
}
