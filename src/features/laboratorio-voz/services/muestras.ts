/** Guiones y textos de muestra: lo que la persona prueba cuando no trae audio propio. Nada aqui es un resultado: es la ENTRADA. */

export interface LineaGuion {
  lado: 'agente' | 'cliente';
  texto: string;
}

export const NOTA_MUESTRA = 'Hola, esta es una nota de voz de prueba. Recuérdame mandar la cotización a Luis el jueves por la mañana, y anota que el pedido de tornillos va con urgencia.';

export const CLASE_MUESTRA =
  'Buenos días. Hoy vamos a ver la fotosíntesis. Las plantas toman luz, agua y dióxido de carbono, y producen azúcar y oxígeno. Ese proceso ocurre en los cloroplastos. ' +
  'Ahora pasemos a la segunda parte. La respiración celular es el proceso inverso: la célula quema el azúcar para obtener energía. Ocurre en las mitocondrias. ' +
  'Para cerrar, un repaso. Fotosíntesis produce azúcar con luz; respiración consume azúcar para dar energía. Ambos procesos se necesitan.';

export const AUDIOLIBRO_MUESTRA =
  'Capítulo uno. La casa del acantilado. El viento llegaba del mar con olor a sal y a algas, y golpeaba las ventanas como si pidiera permiso para entrar. ' +
  'Marta dejó la taza sobre la mesa, se asomó al balcón y contó las luces del puerto: siete, como cada noche. Pero esa noche, una octava luz parpadeaba donde nunca había habido nada.';

export const LLAMADA_MUESTRA: LineaGuion[] = [
  { lado: 'agente', texto: 'Buenas tardes, le habla Ana de Soluciones Norte. ¿Qué es lo que más se les complica hoy en la operación?' },
  { lado: 'cliente', texto: 'Batallamos con las cotizaciones, porque cada quien lo hace a su manera y se nos complica mucho.' },
  { lado: 'cliente', texto: 'Nos cuesta como veinte horas al mes en retrabajo, y eso ya nos preocupa.' },
  { lado: 'agente', texto: '¿Cómo se decide una compra así en su empresa?' },
  { lado: 'cliente', texto: 'Pues tendría que preguntarle al gerente, no me sé los pasos. La verdad se me hace caro, no sé si tengamos presupuesto.' },
  { lado: 'agente', texto: 'Entiendo. ¿Le parece si le mando una propuesta con dos opciones?' },
  { lado: 'cliente', texto: 'Sí, quedamos en que me mandas la información el jueves y lo revisamos.' },
];

export const SENTIMIENTO_MUESTRA =
  'La atención fue excelente y el técnico muy amable.\nPero el envío llegó tarde y el producto venía roto.\nEstoy muy molesto, es la segunda vez que pasa.\nAun así, la solución que me dieron fue rápida y quedé satisfecho.';

export const FAQ_MUESTRA = [
  '¿Cuál es el horario de atención? | Atendemos de lunes a viernes de nueve de la mañana a seis de la tarde.',
  '¿Cuánto tarda el envío? | El envío tarda de dos a cuatro días hábiles en toda la república.',
  '¿Puedo devolver un producto? | Sí, tienes treinta días para devolverlo si está sin usar y con su empaque.',
  '¿Aceptan pagos con tarjeta? | Aceptamos tarjeta de crédito, débito y transferencia bancaria.',
  '¿Dónde están ubicados? | Estamos en la avenida Reforma 120, en Monterrey.',
].join('\n');

export const COMANDOS_MUESTRA = 'Agenda reunión con Ana el martes a las diez de la mañana punto y aparte busca el contrato de Acero del Norte';

export const RECORDATORIO_MUESTRA = 'Recuérdame llamar a Luis mañana a las cuatro de la tarde';

export const PODCAST_MUESTRA: LineaGuion[] = [
  { lado: 'agente', texto: 'Bienvenidos al episodio doce. Hoy hablamos de cómo empezar un negocio sin deuda.' },
  { lado: 'cliente', texto: 'Gracias por invitarme. Yo empecé con doscientos pesos y una mesa prestada.' },
  { lado: 'agente', texto: 'Cuéntanos el primer error que cometiste.' },
  { lado: 'cliente', texto: 'Comprar inventario antes de tener un solo cliente. Eso me costó tres meses.' },
];
