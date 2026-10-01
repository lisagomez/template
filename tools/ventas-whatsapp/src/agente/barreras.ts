/**
 * Las barreras del agente: ANTES del modelo (lo que entra) y DESPUÉS (lo que sale). No viven en
 * las instrucciones del modelo: un modelo que las ignora no pasa por ellas.
 *
 * Por qué dos lados: la política de AI Providers de WhatsApp (15/ene/2026) deja fuera a quien usa
 * IA para atender SU negocio, siempre que el agente no se vuelva un asistente de propósito
 * general. La entrada frena lo evidente sin gastar tokens; la salida frena lo que el modelo
 * produzca aunque la entrada pareciera inocente (precio inventado, tema ajeno, fuga de
 * instrucciones, decir que es otro asistente).
 *
 * Son LÉXICAS y explicables. Un modelo real puede producir algo fuera de dominio que no dispare
 * ninguna: por eso la corrida con el modelo real es obligatoria antes del piloto (hoy «no medido»).
 */
import { pliega } from '../comun/base.js';

export type VeredictoEntrada =
  | { tipo: 'permitido' }
  | { tipo: 'inyeccion'; pista: string }
  | { tipo: 'fuera_de_dominio'; pista: string }
  | { tipo: 'restringido'; pista: string };

export type VeredictoSalida =
  | { tipo: 'ok' }
  | { tipo: 'precio_inventado'; pista: string }
  | { tipo: 'existencias_inventadas'; pista: string }
  | { tipo: 'fuera_de_dominio'; pista: string }
  | { tipo: 'fuga_de_instrucciones'; pista: string }
  | { tipo: 'identidad'; pista: string }
  | { tipo: 'liga_ajena'; pista: string };

const INYECCION: RegExp[] = [
  /ignora (todas )?(tus|las|los|mis) (instrucciones|reglas|indicaciones)/, /olvida (tus|las) (instrucciones|reglas)/,
  /\b(actua|responde|comportate) como (si|un|una)\b/, /\bahora eres\b/, /\beres ahora\b/, /system prompt/, /\bprompt del sistema\b/,
  /modo (desarrollador|dios|sin restricciones)/, /\bjailbreak\b/, /\bdan\b.*\bmodo\b/, /repite (tus|las) instrucciones/,
  /(muestrame|dime|revela) (tus|las) instrucciones/, /\[\s*system\s*\]/, /<\s*\/?\s*system\s*>/, /desactiva (tus|los) (filtros|limites)/,
];

/** Temas que ningún negocio del laboratorio atiende. */
const AJENOS: Array<[RegExp, string]> = [
  [/\b(presidente|elecciones|partido politico|votar por|diputad\w*|senador\w*|gobierno federal)\b/, 'política'],
  [/\b(diagnostic|sintoma|medicamento|dosis|ibuprofeno|paracetamol|antibiotico|receta medica|enfermedad|embarazo)\w*/, 'salud'],
  [/\b(abogado|demanda judicial|divorcio|pension alimenticia|contrato legal|asesoria legal)\b/, 'legal'],
  [/\b(invertir|inversion|criptomoneda|bitcoin|acciones de la bolsa|prestamo personal|credito hipotecario)\b/, 'finanzas'],
  [/\b(codigo en|programa en|python|javascript|sql|html|funcion recursiva|algoritmo)\b/, 'programación'],
  [/\b(escribe|redacta|hazme|componme) (un|una) (poema|cuento|ensayo|cancion|carta de amor|tarea escolar|tarea)\b/, 'redacción ajena'],
  [/\b(capital de|quien (gano|descubrio|invento|escribio)|cuantos (planetas|paises)|historia de (mexico|la humanidad|roma)|tabla periodica)\b/, 'cultura general'],
  [/\b(traduce|traduccion al|translate)\b/, 'traducción'],
  [/\bcuanto es \d+\s*[x*+\-/]\s*\d+/, 'matemáticas'],
  [/\b(resuelve|resuelveme|hazme|haz) (mi |la |una |esta )?(tarea|ecuacion|integral|derivada)\b|\b(algebra|trigonometria|ecuacion de segundo grado)\b/, 'tareas escolares'],
  [/\b(horoscopo|tarot|signo zodiacal)\b/, 'esoterismo'],
  [/\b(clima|pronostico del tiempo) (en|de|para)\b/, 'clima'],
  // «gracias a Dios» o «si Dios quiere» son frases de cualquier cliente: no se bloquean.
  [/\b(religion|dios existe|existe dios|biblia|pecado)\b/, 'religión'],
  [/\b(pornografia|sexo|desnud)\w*/, 'contenido adulto'],
  [/\b(armas?|pistolas?|explosivos?|drogas?|marihuana|cocaina)\b/, 'armas o drogas'],
  [/\b(apuestas?|casino|quiniela)\b/, 'apuestas'],
];

/** El cliente dice que es otro asistente o que «puede con todo». */
const IDENTIDAD: RegExp[] = [/\bsoy (chatgpt|gpt|claude|gemini|llama|un modelo de lenguaje|una ia de proposito general)\b/, /asistente de proposito general/, /puedo ayudarte con (lo que sea|cualquier (cosa|tema))/];
const FUGA: RegExp[] = [/mis instrucciones (son|dicen)/, /\bsystem prompt\b/, /\bprompt\b.*\b(dice|es)\b/, /me (programaron|configuraron) para/, /\bsistema:/];

export function revisaEntrada(textoCliente: string, restringidos: string[]): VeredictoEntrada {
  const t = pliega(textoCliente);
  for (const r of INYECCION) if (r.test(t)) return { tipo: 'inyeccion', pista: r.source };
  for (const [r, tema] of AJENOS) if (r.test(t)) return { tipo: 'fuera_de_dominio', pista: tema };
  for (const r of restringidos) if (t.includes(pliega(r))) return { tipo: 'restringido', pista: r };
  return { tipo: 'permitido' };
}

/** Montos en el texto: «$1,250», «$95.50», «120 pesos», «MXN 80». En centavos. */
export function montosEn(textoAgente: string): number[] {
  const salida: number[] = [];
  const re = /(?:\$\s?|mxn\s?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?|(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s?(?:pesos|mxn)\b/gi;
  for (const m of textoAgente.matchAll(re)) {
    const entero = (m[1] ?? m[3] ?? '').replace(/,/g, '');
    const dec = (m[2] ?? m[4] ?? '').padEnd(2, '0');
    if (entero) salida.push(Number(entero) * 100 + Number(dec || '0'));
  }
  return salida;
}

export interface Respaldo {
  /** Montos que salieron de una herramienta o de la configuración del negocio (centavos). */
  montos: Set<number>;
  existencias: Set<number>;
  /** Vocabulario del negocio (plegado): productos, categorías, FAQ, palabras de comercio. */
  vocabulario: Set<string>;
  /** Dominios de liga permitidos (el procesador, el propio negocio). */
  dominiosLiga: string[];
}

const CORTESIA = new Set(['hola', 'gracias', 'claro', 'con', 'gusto', 'listo', 'perfecto', 'buen', 'dia', 'tarde', 'noche', 'saludos', 'de', 'nada', 'aqui', 'estoy', 'para', 'ayudarte', 'ayudar', 'te', 'en', 'que', 'puedo', 'lo', 'siento', 'entendi', 'no', 'si', 'por', 'favor', 'un', 'una', 'el', 'la', 'y', 'o', 'tu', 'mi', 'es', 'esta', 'bien', 'va', 'orden', 'ok', 'excelente', 'con gusto']);

/** Palabras de comercio que cualquier negocio del laboratorio usa. */
export const VOCABULARIO_COMERCIO = [
  'pedido', 'pedir', 'orden', 'carrito', 'producto', 'productos', 'precio', 'precios', 'total', 'pago', 'pagar', 'liga', 'envio', 'entrega',
  'domicilio', 'recoger', 'horario', 'abierto', 'cerrado', 'catalogo', 'menu', 'disponible', 'existencias', 'talla', 'color', 'reserva',
  'reservar', 'mesa', 'cita', 'personas', 'direccion', 'colonia', 'zona', 'cobertura', 'factura', 'devolucion', 'cambio', 'garantia',
  'promocion', 'descuento', 'tienda', 'restaurante', 'sucursal', 'ubicacion', 'minutos', 'hora', 'hoy', 'manana', 'confirmo', 'confirmado',
  'dueno', 'encargado', 'comunico', 'humano', 'persona', 'asesor', 'opciones', 'elige', 'escoge', 'agrega', 'quieres', 'algo', 'mas',
];

const tokens = (s: string) => pliega(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 1);

export function revisaSalida(textoAgente: string, r: Respaldo): VeredictoSalida {
  const t = pliega(textoAgente);
  for (const x of IDENTIDAD) if (x.test(t)) return { tipo: 'identidad', pista: x.source };
  for (const x of FUGA) if (x.test(t)) return { tipo: 'fuga_de_instrucciones', pista: x.source };
  for (const [x, tema] of AJENOS) if (x.test(t)) return { tipo: 'fuera_de_dominio', pista: tema };
  for (const monto of montosEn(textoAgente)) if (!r.montos.has(monto)) return { tipo: 'precio_inventado', pista: String(monto / 100) };
  for (const m of t.matchAll(/(\d+)\s*(piezas|unidades|disponibles|en existencia|en stock)/g)) {
    if (!r.existencias.has(Number(m[1]))) return { tipo: 'existencias_inventadas', pista: m[0] };
  }
  for (const m of textoAgente.matchAll(/https?:\/\/([^/\s]+)/g)) {
    if (!r.dominiosLiga.some((d) => m[1] === d || m[1]?.endsWith(`.${d}`))) return { tipo: 'liga_ajena', pista: m[1] ?? '' };
  }
  // Texto largo casi sin vocabulario del negocio: el modelo se fue a otro tema.
  const palabras = tokens(textoAgente).filter((w) => !CORTESIA.has(w) && !/^\d+$/.test(w));
  if (palabras.length >= 14) {
    const delNegocio = palabras.filter((w) => r.vocabulario.has(w) || r.vocabulario.has(w.replace(/(es|s)$/, ''))).length;
    if (delNegocio / palabras.length < 0.15) return { tipo: 'fuera_de_dominio', pista: `solo ${delNegocio} de ${palabras.length} palabras del negocio` };
  }
  return { tipo: 'ok' };
}

/** Quejas: disparan el traspaso ANTES de llamar al modelo. */
const QUEJA = /\b(queja|quejarme|pesimo|pesima|horrible|estafa|fraude|me robaron|robo|reembolso|devuelvan mi dinero|profeco|demanda|nunca llego|llego frio|llego fria|llego mal|no sirve|defectuos|exijo|estoy (muy )?(molest|enojad|harto|harta)|mal servicio|inaceptable|cobraron (de mas|doble))\w*/;
export const esQueja = (textoCliente: string) => QUEJA.test(pliega(textoCliente));

const PIDE_HUMANO = /\b(hablar con (alguien|una persona|un humano|el dueno|la duena|el encargado|la encargada)|una persona real|asesor humano|atencion humana|quiero un humano|pasame con)\b/;
export const pideHumano = (textoCliente: string) => PIDE_HUMANO.test(pliega(textoCliente));

/** Datos que no deben quedarse en el historial: tarjetas y claves. */
export function minimiza(textoCliente: string): { texto: string; ocultado: boolean } {
  const tarjeta = /\b(?:\d[ -]?){13,19}\b/g;
  const clave = /\b(nip|cvv|contrasena|password)\s*[:=]?\s*\S+/gi;
  const texto = textoCliente.replace(tarjeta, '[tarjeta oculta]').replace(clave, '[dato oculto]');
  return { texto, ocultado: texto !== textoCliente };
}
