/**
 * Las dos pymes del laboratorio. DATOS SINTÉTICOS Y DECLARADOS: ni «La Parroquia de Doña Chela»
 * ni «Huipiles Xalapeños» existen; los teléfonos usan números de ejemplo y los clientes también.
 * Veracruz porque es donde el documento fuente propone el piloto.
 */
import type { Inquilino } from '../modelo.js';
import { HORA } from '../comun/base.js';

export const CSV_RESTAURANTE = `retailer_id,nombre,descripcion,precio,existencias,categoria,sinonimos
tacos-pastor,Orden de tacos al pastor,5 tacos con piña y salsa verde,95,40,tacos,taco;pastor;tacos
tacos-bistec,Orden de tacos de bistec,5 tacos de bistec con cebolla,105,30,tacos,taco;bistec
picadas,Picadas veracruzanas,3 picadas con salsa roja y queso,80,25,antojitos,picada;antojito
gordas-negras,Gorditas negras,3 gorditas de frijol negro,85,20,antojitos,gordita;gorda
arroz-tumbada,Arroz a la tumbada,Arroz caldoso con mariscos al estilo Alvarado,185,12,platos fuertes,arroz;mariscos;tumbada
huachinango,Huachinango a la veracruzana,Pescado con jitomate aceitunas y alcaparras,240,8,platos fuertes,pescado;huachinango
cafe-lechero,Café lechero,Café con leche servido al estilo del puerto,45,100,bebidas,cafe;lechero;cafecito
agua-horchata,Agua de horchata,Litro de agua fresca,40,50,bebidas,agua;horchata
bomba-pollo,Bomba de pollo,Empanada de pollo del puerto,55,0,antojitos,bomba;empanada`;

export const CSV_TIENDA = `retailer_id,nombre,descripcion,precio,existencias,categoria,sinonimos
huipil-rojo-m,Huipil bordado rojo talla M,Bordado a mano en Xico,950,6,huipiles,huipil;blusa;bordado;rojo
huipil-rojo-g,Huipil bordado rojo talla G,Bordado a mano en Xico,950,4,huipiles,huipil;blusa;bordado;rojo
huipil-blanco-m,Huipil bordado blanco talla M,Bordado a mano en Xico,890,5,huipiles,huipil;blusa;bordado;blanco
guayabera-lino-m,Guayabera de lino talla M,Lino natural con alforzas,1250,7,guayaberas,guayabera;camisa;lino
guayabera-lino-g,Guayabera de lino talla G,Lino natural con alforzas,1250,3,guayaberas,guayabera;camisa;lino
reboso-azul,Rebozo de algodón azul,Tejido en telar de cintura,680,9,accesorios,rebozo;reboso;chal
bolsa-palma,Bolsa de palma tejida,Hecha a mano en Tlacotalpan,420,12,accesorios,bolsa;palma;tejida
aretes-filigrana,Aretes de filigrana,Plata con filigrana,560,10,accesorios,aretes;plata;filigrana
sombrero-jarocho,Sombrero jarocho,Palma fina con toquilla,780,0,accesorios,sombrero;jarocho`;

const FAQ_PRIVACIDAD = {
  id: 'privacidad', pregunta: 'Aviso de privacidad', claves: ['privacidad', 'datos personales', 'aviso'],
  respuesta: 'Usamos tu nombre, teléfono y dirección solo para atender tu pedido o reservación; no los vendemos ni los compartimos con fines ajenos. El pago lo procesa el proveedor de pagos: aquí no guardamos datos de tarjeta. Puedes pedir que borremos tus datos escribiendo BORRAR MIS DATOS; lo atiende el encargado. (Datos ficticios de laboratorio.)',
};

export function restaurante(canal: Inquilino['canal']): Inquilino {
  return {
    id: 'pyme_restaurante', nombre: 'La Parroquia de Doña Chela', giro: 'restaurante', ciudad: 'Veracruz', pais: 'MX', moneda: 'MXN', zonaHoraria: 'America/Mexico_City',
    canal, dueno: { nombre: 'Doña Chela' }, estado: 'activo', ficticio: true,
    politicas: {
      umbralTraspasoCentavos: 150_000, pausaPorEcoMs: 2 * HORA, maxTurnosConversacion: 25, maxTokensConversacion: 40_000, presupuestoTokensMensual: 3_000_000,
      horario: 'Todos los días de 8:00 a 22:00',
      cobertura: [
        { zona: 'Centro', costoCentavos: 3_500, minutos: 30 }, { zona: 'Boca del Río', costoCentavos: 5_500, minutos: 45 },
        { zona: 'Costa de Oro', costoCentavos: 5_000, minutos: 40 }, { zona: 'Reforma', costoCentavos: 4_000, minutos: 35 },
      ],
      citas: { servicios: [{ id: 'mesa-2', nombre: 'Mesa para 2', minutos: 90, precioCentavos: 0, capacidad: 4 }, { id: 'mesa-4', nombre: 'Mesa para 4', minutos: 90, precioCentavos: 0, capacidad: 3 }, { id: 'mesa-6', nombre: 'Mesa para 6', minutos: 120, precioCentavos: 0, capacidad: 1 }], apertura: 13, cierre: 22, diasAbiertos: [0, 1, 2, 3, 4, 5, 6] },
      temasRestringidos: ['cerveza', 'mezcal', 'tequila', 'alcohol', 'bebidas alcoholicas'],
    },
    faqs: [
      { id: 'horario', pregunta: 'Horario', claves: ['horario', 'abren', 'cierran', 'hora'], respuesta: 'Abrimos todos los días de 8:00 a 22:00. A domicilio de 13:00 a 21:30.' },
      { id: 'envio', pregunta: 'Envíos a domicilio', claves: ['envio', 'domicilio', 'entregan', 'cobertura', 'zona'], respuesta: 'Llevamos a Centro ($35.00), Reforma ($40.00), Costa de Oro ($50.00) y Boca del Río ($55.00). También puedes pasar a recoger.' },
      { id: 'pagos', pregunta: 'Formas de pago', claves: ['pago', 'pagar', 'tarjeta', 'efectivo', 'transferencia', 'aceptan'], respuesta: 'Pagas con la liga segura que te mandamos (tarjeta o transferencia). No compartas datos de tu tarjeta por chat.' },
      { id: 'ubicacion', pregunta: 'Ubicación', claves: ['ubicacion', 'direccion', 'donde'], respuesta: 'Estamos frente al malecón, en el Centro de Veracruz (dirección ficticia de laboratorio).' },
      FAQ_PRIVACIDAD,
    ],
  };
}

export function tienda(canal: Inquilino['canal']): Inquilino {
  return {
    id: 'pyme_tienda', nombre: 'Huipiles Xalapeños', giro: 'tienda', ciudad: 'Xalapa', pais: 'MX', moneda: 'MXN', zonaHoraria: 'America/Mexico_City',
    canal, dueno: { nombre: 'Martha' }, estado: 'activo', ficticio: true,
    politicas: {
      umbralTraspasoCentavos: 400_000, pausaPorEcoMs: 2 * HORA, maxTurnosConversacion: 25, maxTokensConversacion: 40_000, presupuestoTokensMensual: 3_000_000,
      horario: 'Lunes a sábado de 10:00 a 19:00',
      cobertura: [
        { zona: 'Xalapa', costoCentavos: 6_000, minutos: 1_440 }, { zona: 'Veracruz', costoCentavos: 12_000, minutos: 2_880 },
        { zona: 'Coatepec', costoCentavos: 8_000, minutos: 1_440 },
      ],
      temasRestringidos: [],
    },
    faqs: [
      { id: 'horario', pregunta: 'Horario', claves: ['horario', 'abren', 'cierran'], respuesta: 'Lunes a sábado de 10:00 a 19:00.' },
      { id: 'envio', pregunta: 'Envíos', claves: ['envio', 'envian', 'domicilio', 'paqueteria', 'cobertura'], respuesta: 'Enviamos a Xalapa ($60.00, 1 día), Coatepec ($80.00, 1 día) y Veracruz ($120.00, 2 días). También puedes recoger en tienda.' },
      { id: 'cambios', pregunta: 'Cambios y tallas', claves: ['cambio', 'talla', 'devolucion', 'garantia'], respuesta: 'Tienes 15 días para cambiar de talla con la prenda sin usar y con etiqueta. No hacemos reembolsos en efectivo.' },
      { id: 'pagos', pregunta: 'Formas de pago', claves: ['pago', 'pagar', 'tarjeta', 'transferencia', 'aceptan', 'factura'], respuesta: 'Pagas con la liga segura que te mandamos. Si necesitas factura, captura tu RFC en el formulario de envío.' },
      FAQ_PRIVACIDAD,
    ],
  };
}
