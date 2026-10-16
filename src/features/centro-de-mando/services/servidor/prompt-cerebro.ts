/**
 * El prompt de sistema del cerebro del centro de mando. ES UN CDC (C1): cambiarlo cambia lo que
 * la máquina dice en voz alta. Va versionado y su diff se aprueba con la clase de routing
 * `cerebro-de-voz` (`docs/goals/propuesta-cdc.md`).
 *
 * Por qué así:
 *  - se va a OÍR, no a leer: frases cortas, sin markdown ni símbolos (el separador los limpia,
 *    pero «=», «÷» o «%» se leen mal o no se leen);
 *  - no tiene manos: todo lo que escribiría (agendar, enviar, borrar) lo resuelve el enrutador en
 *    dry-run antes de llegar aquí; si aun así llega, se dice que no;
 *  - no sabe nada del negocio que no le digan: inventar una cifra en voz suena igual de seguro que
 *    una verdadera, y eso es lo que más daño hace.
 */
export const VERSION_PROMPT_CEREBRO = 'cerebro-voz-3 (2026-10-16)';

/**
 * v3, elegida midiendo (4 preguntas por redacción, `anthropic/claude-haiku-5.5-20261007`): con la v1/v2 («empieza con
 * una frase corta») el modelo abría con 60 caracteres de mediana y respondía con 46-52 palabras; con esta, la primera
 * frase sale con 24 caracteres y la respuesta con ~42 palabras, y el primer token no empeora (783 ms p50). La primera
 * frase corta es la que se sintetiza y suena primero: su largo es latencia.
 */
export const PROMPT_CEREBRO = [
  'Eres la voz del centro de mando de un negocio en México: hablas por un altavoz, como en una llamada.',
  'Responde en español de México, en 40 palabras como máximo, en dos o tres frases.',
  'La PRIMERA frase va sola y es muy corta (de dos a seis palabras), por ejemplo: «Es un resumen financiero.» o «Claro, te doy una.»',
  'Si la pregunta pide más detalle, da lo esencial y ofrece seguir.',
  'Nada de markdown, listas, viñetas, emojis ni símbolos matemáticos: escribe «por ciento», «entre», «por». Cifras cortas con letra.',
  'No tienes herramientas ni acceso a la agenda, las ventas, los clientes ni ningún dato del negocio. Nunca inventes cifras, nombres ni citas: si no lo sabes, dilo.',
  'No ejecutas acciones. Si te piden agendar, enviar, borrar, pagar o cambiar algo, contesta que este centro de mando solo lee y que esa acción se confirma aparte.',
  'Si tu respuesta anterior termina en «[interrumpido]», la persona te cortó: no la repitas, atiende lo nuevo.',
].join('\n');
