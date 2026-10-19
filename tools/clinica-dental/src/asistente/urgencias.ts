/**
 * LAS URGENCIAS LAS DECIDE UNA REGLA, NO EL LLM. Se evaluan ANTES de todo (enrutador y cerebro) y su
 * respuesta es fija. Ante la duda se deriva: un falso positivo cuesta una llamada; un falso negativo, mucho mas.
 *
 * Fuentes (consultadas el 2026-10-16):
 *  - NHS, Dental abscess: «finding it hard to breathe, speak or swallow», «swollen or painful eye»
 *    https://www.nhs.uk/conditions/dental-abscess/
 *  - NHS, Toothache: «the area around your eye or your neck is swollen»; dolor con «a high temperature» → ver al
 *    dentista (no urgencias hospitalarias) https://www.nhs.uk/conditions/toothache/
 *  - NHS, Emergency dental care: «heavy bleeding from your mouth that will not stop»; golpe en la cabeza o la
 *    cara con perdida de conocimiento, vomito o vision doble; diente caido: atencion en menos de 1 hora
 *    https://www.nhs.uk/nhs-services/dentists/how-can-i-access-an-nhs-dentist-in-an-emergency-or-out-of-hours/
 *  - Oral Health Foundation, Knocked-out teeth: reimplantar «ideally within 30-60 minutes», guardarlo en leche
 *    https://www.dentalhealth.org/knocked-out-teeth
 *  - NHS 111 Wales: enjuagar con agua fria «no more than 10 seconds»; un diente de leche «do not put it back in»
 *    https://111.wales.nhs.uk/encyclopaedia/t/article/tooth,knockedout
 *  - En Mexico, el numero de emergencias es el 911.
 * Lista declarada por el laboratorio a partir de esas fuentes; NO es una guia clinica validada por un dentista.
 */
export type DestinoUrgencia = 'emergencias_911' | 'clinica_hoy';

export interface ReglaUrgencia {
  id: string;
  senal: string;
  destino: DestinoUrgencia;
  fuente: string;
  /** Cada alternativa es una lista de patrones que deben aparecer TODOS (sobre el texto normalizado). */
  alternativas: RegExp[][];
}

/** Minusculas, sin acentos ni signos, espacios simples: «¡No puedo TRAGAR!» → «no puedo tragar». */
export function normaliza(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const NHS_ABSCESO = 'https://www.nhs.uk/conditions/dental-abscess/';
const NHS_MUELA = 'https://www.nhs.uk/conditions/toothache/';
const NHS_URGENCIA = 'https://www.nhs.uk/nhs-services/dentists/how-can-i-access-an-nhs-dentist-in-an-emergency-or-out-of-hours/';
const DIENTE = /\b(diente|dientes|muela|muelas|colmillo|incisivo|encia|encias|boca|quijada|mandibula|cachete|mejilla)\b/;
const TRAUMA = /\b(golpe|golpee|golpeo|pegue|pego|pegaron|caida|cai|cayo|choque|choco|accidente|pelotazo|pelota|balonazo|madrazo|trancazo|tropece|tropezo)\b/;
// «le cayó un diente» sin el «se»: el ASR lo pierde a menudo («…jugando futbol, dice le cayó un diente», 4 de 20 tomas).
// Atado al diente: «me cayó mal la comida» no es un diente que se cae.
const SALIO = /\b(se me cayo|se le cayo|se cayo|se salio|se me salio|se le salio|tumbo|tumbe|tumbaron|arranco|desprendio|quedo afuera|completo|(me|le) (cayo|salio) (un |el |una |la |los |las |su |mi )?(diente|dientes|muela|muelas|colmillo|incisivo))\b/;

export const REGLAS_URGENCIA: readonly ReglaUrgencia[] = [
  {
    id: 'U1', senal: 'Dificultad para respirar, hablar o tragar', destino: 'emergencias_911', fuente: NHS_ABSCESO,
    alternativas: [
      [/\b(no puedo|no puede|me cuesta|le cuesta|dificultad para|trabajo para|batallo para|batalla para)( casi)? (respirar|tragar|pasar saliva|pasar la saliva|pasar comida|hablar)\b/],
      [/\b(me ahogo|se ahoga|me falta el aire|le falta el aire|no me entra aire|se me cierra la garganta|se le cierra la garganta)\b/],
    ],
  },
  {
    id: 'U2', senal: 'Hinchazón que llega al ojo o al cuello, o que avanza', destino: 'emergencias_911', fuente: NHS_MUELA,
    alternativas: [
      [/\b(hinch|inflam|bola|bulto)\w*/, /\b(ojo|ojos|parpado|cuello|garganta)\b/],
      [/\b(hinch|inflam)\w*/, /\b(crece|avanza|aumenta|sube|se extiende|cada vez mas|mas grande)\b/],
      [/\b(vision doble|veo doble|veo borroso|no veo bien)\b/, /\b(hinch|inflam|muela|diente)\w*/],
    ],
  },
  {
    id: 'U3', senal: 'Sangrado abundante que no para', destino: 'emergencias_911', fuente: NHS_URGENCIA,
    alternativas: [
      // «Me sangran mucho las encías al cepillarme» es comun y no es urgencia: lo que cuenta es que NO PARE.
      [/\bsangr\w*/, /\b(no para|no se para|no se detiene|no se quita|no se corta|sin parar|a chorros|no ha parado|lleva horas|llevo horas|desde hace horas)\b/],
      [/\bno (me |le )?(para|deja|ha dejado) de sangrar\b/],
      [/\b(sangrado|sangre)\b/, /\b(abundante|muchisima|mucha sangre)\b/, /\b(extraccion|cirugia|me sacaron|le sacaron|operaron|golpe)\b/],
    ],
  },
  {
    id: 'U4', senal: 'Golpe en la cabeza o la cara con desmayo, vómito o visión doble', destino: 'emergencias_911', fuente: NHS_URGENCIA,
    alternativas: [[TRAUMA, /\b(desmay\w*|perdi el conocimiento|perdio el conocimiento|vomit\w*|vision doble|veo doble|ve doble)\b/]],
  },
  {
    id: 'U5', senal: 'Diente caído por un golpe (avulsión)', destino: 'clinica_hoy', fuente: 'https://www.dentalhealth.org/knocked-out-teeth',
    alternativas: [[TRAUMA, DIENTE, SALIO], [/\b(se me cayo|se le cayo|se salio|se me salio|tumbo|tumbaron|arranco)\b/, /\b(diente|muela|colmillo)\b/, /\b(entero|completo|con raiz|con todo y raiz|definitivo|permanente)\b/]],
  },
  {
    id: 'U6', senal: 'Fiebre con dolor o hinchazón dental', destino: 'clinica_hoy', fuente: NHS_MUELA,
    alternativas: [[/\b(fiebre|calentura|temperatura alta|escalofrio\w*)\b/, /\b(muela|diente|dientes|encia|encias|absceso|flemon|postemilla|dolor dental)\b/]],
  },
];

const NIEGA_FIEBRE = /\b(no tengo|no tiene|sin|no hay|nada de) (fiebre|calentura|temperatura)\b/;

/**
 * Las palabras de alarma que el ASR tuerce en una NOTA DE VOZ (medido con la voz Piper local, 120 tomas de las 12
 * urgencias del corpus: «no para de sangrar» → «no para desancrar», «sangrando a chorros» → «sancrando a choros»,
 * «hinchada» → «linchada»). Cada término con la lectura que necesita la regla. Solo términos LARGOS: una palabra corta
 * a una letra de otra es otra palabra («rojo» no es «ojo», «tratar» no es «tragar»), y una urgencia inventada manda al
 * 911 a quien no lo necesita.
 */
const VOZ_ALARMA: readonly (readonly [string, string])[] = [
  ['respirar', 'respirar'], ['hinchada', 'hinchada'], ['hinchado', 'hinchado'], ['hinchando', 'hinchando'],
  ['sangrar', 'sangrar'], ['sangrando', 'sangrando'], ['desangrar', 'de sangrar'], ['chorros', 'chorros'],
];

/** Lo que el motor de respaldo recibe como pista (Whisper favorece ese vocabulario; Parakeet no la usa). */
export const PISTA_VOZ_URGENCIAS = 'Urgencia dental: no puedo respirar, no puedo tragar, tengo la cara hinchada, se me hincha hasta el ojo, no para de sangrar, está sangrando a chorros, la extracción, tengo fiebre o calentura, la encía inflamada.';

function distancia(a: string, b: string): number {
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    for (let j = 1; j <= b.length; j++) fila[j] = Math.min(previa[j]! + 1, fila[j - 1]! + 1, previa[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    previa = fila;
  }
  return previa[b.length]!;
}

/**
 * Confusiones que una palabra COMUN no permite corregir sola y el contexto sí: con la cara hinchada, «me cuesta pagar»
 * al cerrar la frase es «me cuesta tragar» (los dos motores lo oyeron así en 1 de 240 tomas). Con objeto («me cuesta
 * pagar la consulta») o sin hinchazón, se queda como está.
 */
const CONFUSIONES_VOZ: readonly { oido: RegExp; contexto: RegExp; lectura: string }[] = [
  { oido: /\b(me cuesta|le cuesta|no puedo|no puede) pagar((?: (?:y|ni|bien|nada)\b.*)?)$/, contexto: /\b(hinch|inflam)\w*/, lectura: '$1 tragar$2' },
];

/** La lectura de una nota de voz para la regla: cada palabra de 5+ letras a 1 letra de un término (2 si tiene 9+) es ese término. */
export function corrigeVoz(texto: string): string {
  const leido = normaliza(texto).split(' ').map((w) => {
    if (w.length < 5) return w;
    const t = VOZ_ALARMA.find(([termino]) => w !== termino && distancia(w, termino) <= (termino.length >= 9 ? 2 : 1));
    return t ? t[1] : w;
  }).join(' ');
  return CONFUSIONES_VOZ.reduce((x, c) => (c.contexto.test(x) ? x.replace(c.oido, c.lectura) : x), leido);
}

/**
 * La RED de una nota de voz que ninguna regla reconoció pero trae una señal de alarma (las mismas familias de palabras
 * de las reglas): el ASR puede torcer justo la palabra que decide («me cuesta traer» por «tragar», «muera» por «muela»;
 * 4 de 120 tomas con una voz de control). No es una derivación: es un aviso fijo después de la respuesta.
 */
const SENAL_VOZ = /\b(hinch\w*|inflam\w*|sangr\w*|fiebre|calentura|escalofrio\w*|respir\w*|trag\w*|ahog\w*|golpe\w*|cayo|salio)\b/;
export const traeSenalDeAlarma = (lecturas: readonly string[]): boolean => lecturas.some((x) => SENAL_VOZ.test(normaliza(x)) || SENAL_VOZ.test(corrigeVoz(x)));
export const avisoDeAlarma = (c: { nombre: string; telefono: string }): string =>
  `Por si acaso: si te cuesta respirar o tragar, la hinchazón te llega al ojo o al cuello, o el sangrado no para, llama ahora al 911. Si tienes fiebre con dolor de muela o se cayó un diente por un golpe, llama hoy a ${c.nombre} al ${c.telefono}.`;

/** Para una nota de voz: la regla sobre lo que oyó cada motor y sobre su lectura corregida. */
export function detectaUrgenciaEnVoz(lecturas: readonly string[], c: { nombre: string; telefono: string }): Urgencia | null {
  for (const x of lecturas) {
    const u = detectaUrgencia(x, c) ?? detectaUrgencia(corrigeVoz(x), c);
    if (u) return u;
  }
  return null;
}

export interface Urgencia { regla: ReglaUrgencia; respuesta: string }

/** La primera regla que dispara, en orden (las de 911 primero). `null` si ninguna. */
export function detectaUrgencia(texto: string, c: { nombre: string; telefono: string }): Urgencia | null {
  const t = normaliza(texto);
  for (const regla of REGLAS_URGENCIA) {
    if (regla.id === 'U6' && NIEGA_FIEBRE.test(t)) continue;
    if (regla.alternativas.some((alt) => alt.every((re) => re.test(t)))) return { regla, respuesta: respuestaUrgencia(regla, c) };
  }
  return null;
}

export function respuestaUrgencia(r: ReglaUrgencia, c: { nombre: string; telefono: string }): string {
  if (r.destino === 'emergencias_911') {
    return `Lo que describes puede ser una urgencia: llama ahora al 911 o ve al servicio de urgencias más cercano. No esperes a una cita. Cuando estés a salvo, avísale a ${c.nombre} al ${c.telefono}.`;
  }
  if (r.id === 'U5') {
    return `Si es un diente permanente, cada minuto cuenta: llama ya a ${c.nombre} al ${c.telefono}; lo ideal es atenderlo en los primeros 30 a 60 minutos. Tómalo por la corona, sin tocar la raíz; si está sucio, enjuágalo con agua fría no más de 10 segundos y guárdalo en leche o en tu saliva. Si es un diente de leche, no lo vuelvas a colocar. Si la clínica está cerrada, ve a urgencias.`;
  }
  return `La fiebre con dolor o hinchazón de una muela necesita que te revise un dentista hoy: llama a ${c.nombre} al ${c.telefono}. Si además te cuesta respirar o tragar, o la hinchazón llega al ojo o al cuello, llama al 911.`;
}
