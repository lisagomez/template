/**
 * Las dos clinicas SINTETICAS del laboratorio, declaradas y validadas. Nada de aqui es de una clinica real:
 * nombres, direcciones, telefonos y precios son inventados (dominios `.example`, RFC 2606; telefonos con
 * `0000`). Cada una tiene marca, servicios por categoria con duracion y precio, horario, sillones, base de
 * conocimiento para el asistente, promociones y los costos SUPUESTOS que alimentan el unit economics, cada
 * uno con su fuente.
 *
 * Lo que el asistente puede decir de una clinica sale SOLO de aqui: si no esta declarado, no existe.
 */
import { z } from 'zod';

export const CATEGORIAS = ['general', 'ortodoncia', 'endodoncia', 'implantologia'] as const;
export type Categoria = (typeof CATEGORIAS)[number];
export const NOMBRE_CATEGORIA: Record<Categoria, string> = {
  general: 'Odontología general y preventiva',
  ortodoncia: 'Ortodoncia',
  endodoncia: 'Endodoncia',
  implantologia: 'Implantología',
};

const id = z.string().regex(/^[a-z][a-z0-9-]{1,40}$/);
const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const esquemaServicio = z.object({
  id,
  categoria: z.enum(CATEGORIAS),
  nombre: z.string().min(3).max(80),
  duracionMin: z.number().int().min(15).max(240),
  precioMxn: z.number().int().min(0),
  enQueConsiste: z.string().min(10).max(400),
  comoPrepararse: z.string().min(10).max(400),
  /** Costo variable SUPUESTO por cita (insumos, esterilizacion): para el margen por cita. */
  costoVariableMxn: z.number().int().min(0),
});

const esquemaSupuesto = z.object({
  valor: z.number(),
  unidad: z.string().min(1),
  fuente: z.string().min(10),
});

export const esquemaClinica = z.object({
  id,
  nombre: z.string().min(3).max(80),
  lema: z.string().min(3).max(120),
  marca: z.object({ primario: z.string().regex(/^#[0-9a-f]{6}$/), acento: z.string().regex(/^#[0-9a-f]{6}$/), fondo: z.string().regex(/^#[0-9a-f]{6}$/), inicial: z.string().length(1) }),
  direccion: z.string().min(10),
  comoLlegar: z.string().min(10),
  telefono: z.string().regex(/^\+52 \d{2} 0000 \d{4}$/),
  correoAvisos: z.string().regex(/^[a-z0-9.+-]+@[a-z0-9.-]+\.example$/),
  dominio: z.string().regex(/^[a-z0-9.-]+\.example$/),
  botTelegram: z.string().regex(/^[A-Za-z0-9_]{5,32}bot$/),
  zona: z.literal('America/Mexico_City'),
  horario: z.array(z.object({ dia: z.number().int().min(0).max(6), desde: hora, hasta: hora })).min(1),
  fechasBloqueadas: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  sillones: z.array(id).min(1).max(10),
  intervaloMin: z.number().int().min(15).max(60),
  margenDespuesMin: z.number().int().min(0).max(30),
  avisoMinimoMin: z.number().int().min(0),
  horizonteDias: z.number().int().min(7).max(120),
  servicios: z.array(esquemaServicio).min(4),
  politicas: z.object({ cancelacion: z.string().min(10), pagos: z.string().min(10), menores: z.string().min(10), llegada: z.string().min(10) }),
  promociones: z.array(z.object({ id, texto: z.string().min(10).max(160), vigencia: z.string().min(4) })),
  /** Supuestos del unit economics: cada cifra dice de donde sale. Ninguna es un dato real de la clinica. */
  supuestos: z.object({
    gastoMarketingMensualMxn: z.record(z.string(), esquemaSupuesto),
    visitasPorAnio: esquemaSupuesto,
    aniosRetencion: esquemaSupuesto,
    costoCorreoUsd: esquemaSupuesto,
    costoTelegramUsd: esquemaSupuesto,
    /**
     * WhatsApp en Mexico: lo que se cobra por mensaje ENTREGADO y cobrable, por categoria. Una plantilla utility se
     * paga siempre (desde el 1/oct/2026 tambien dentro de la ventana); un mensaje de servicio solo pasados los
     * 1,000 gratis del mes. El costo REAL de cada mensaje lo marca el estado que manda Meta (`pricing.billable`).
     */
    tarifasWhatsappUsd: z.object({ utility: esquemaSupuesto, service: esquemaSupuesto, marketing: esquemaSupuesto }),
    tipoCambioMxnPorUsd: esquemaSupuesto,
  }),
});

export type Servicio = z.infer<typeof esquemaServicio>;
export type Clinica = z.infer<typeof esquemaClinica>;

const SIN_FUENTE = 'supuesto del laboratorio, sin fuente externa: se reemplaza con el dato de la clinica antes de decidir nada';
const FUENTE_CORREO = 'supuesto: plan Pro de Resend, US$20 al mes por 50 000 correos = US$0.0004 por correo (https://resend.com/pricing, consultado 2026-10-16); Gmail personal no es proveedor de envio masivo';
const FUENTE_TELEGRAM = 'supuesto: la Bot API de Telegram no cobra por mensaje (https://core.telegram.org/bots/api, consultado 2026-10-16)';
const FUENTE_WA = 'tarifa de lista de Meta para Mexico vigente desde el 2026-10-01 (archivo «Cost per message» enlazado en https://developers.facebook.com/docs/whatsapp/pricing, consultado 2026-10-19); sin volumen: una clinica no llega a los descuentos';
const TARIFAS_WA = {
  utility: { valor: 0.0085, unidad: 'US$ por plantilla utility entregada', fuente: FUENTE_WA },
  service: { valor: 0.0085, unidad: 'US$ por mensaje de servicio entregado pasados los 1,000 gratis del mes', fuente: FUENTE_WA },
  marketing: { valor: 0.0397, unidad: 'US$ por plantilla de marketing entregada (no se usa: los avisos son utility)', fuente: FUENTE_WA },
};
const FUENTE_CAMBIO = 'supuesto: 18.50 MXN por US$, redondeado; verificar contra el tipo de cambio FIX de Banxico del dia antes de decidir';

const COMUNES = {
  zona: 'America/Mexico_City' as const,
  fechasBloqueadas: ['2026-11-02', '2026-11-16', '2026-12-25', '2027-01-01'],
  intervaloMin: 30,
  margenDespuesMin: 10,
  avisoMinimoMin: 120,
  horizonteDias: 60,
  politicas: {
    cancelacion: 'Puedes cancelar o reprogramar sin costo hasta 24 horas antes de tu cita desde el portal. Con menos de 24 horas, llama a la clínica.',
    pagos: 'Aceptamos efectivo, tarjeta de débito y crédito y transferencia. Los precios incluyen IVA.',
    menores: 'Los menores de 18 años vienen acompañados de su madre, padre o tutor, que firma el consentimiento.',
    llegada: 'Llega 10 minutos antes con una identificación. Si tienes estudios o radiografías recientes, tráelos.',
  },
};

export const CLINICAS_DECLARADAS: readonly Clinica[] = [
  {
    ...COMUNES,
    id: 'maguey',
    nombre: 'Clínica Dental Maguey',
    lema: 'Odontología cercana en Coyoacán',
    marca: { primario: '#0f766e', acento: '#f59e0b', fondo: '#f0fdfa', inicial: 'M' },
    direccion: 'Calle Ficticia 101, Col. Laboratorio, Coyoacán, 04000 Ciudad de México (dirección sintética)',
    comoLlegar: 'A 8 minutos caminando del metro Coyoacán (dato sintético). Estacionamiento con tres cajones para pacientes.',
    telefono: '+52 55 0000 0101',
    correoAvisos: 'avisos@maguey.clinica.example',
    dominio: 'maguey.clinica.example',
    botTelegram: 'ClinicaMagueyLabbot',
    horario: [1, 2, 3, 4, 5].flatMap((dia) => [{ dia, desde: '09:00', hasta: '14:00' }, { dia, desde: '16:00', hasta: '19:00' }]).concat([{ dia: 6, desde: '09:00', hasta: '13:00' }]),
    sillones: ['sillon-1', 'sillon-2'],
    servicios: [
      { id: 'valoracion', categoria: 'general', nombre: 'Consulta de valoración', duracionMin: 30, precioMxn: 450, costoVariableMxn: 60, enQueConsiste: 'Revisión completa de dientes y encías, con plan de tratamiento por escrito.', comoPrepararse: 'Cepíllate como siempre. Trae la lista de medicamentos que tomas.' },
      { id: 'limpieza', categoria: 'general', nombre: 'Limpieza dental (profilaxis)', duracionMin: 45, precioMxn: 800, costoVariableMxn: 120, enQueConsiste: 'Retiro de sarro y placa con ultrasonido y pulido de las superficies.', comoPrepararse: 'No necesitas ayuno. Evita café o vino tinto dos horas después.' },
      { id: 'resina', categoria: 'general', nombre: 'Resina (obturación estética)', duracionMin: 60, precioMxn: 1200, costoVariableMxn: 260, enQueConsiste: 'Restauración de una pieza con resina del color del diente.', comoPrepararse: 'Come algo ligero antes: la anestesia local dura unas dos horas.' },
      { id: 'valoracion-ortodoncia', categoria: 'ortodoncia', nombre: 'Valoración de ortodoncia', duracionMin: 45, precioMxn: 600, costoVariableMxn: 80, enQueConsiste: 'Fotografías, modelos y explicación de las opciones de brackets o alineadores.', comoPrepararse: 'Si tienes una radiografía panorámica reciente, tráela.' },
      { id: 'ajuste-brackets', categoria: 'ortodoncia', nombre: 'Ajuste mensual de brackets', duracionMin: 30, precioMxn: 900, costoVariableMxn: 90, enQueConsiste: 'Cambio de ligas y arco según tu plan de tratamiento.', comoPrepararse: 'Cepíllate bien antes de venir.' },
      { id: 'valoracion-endodoncia', categoria: 'endodoncia', nombre: 'Valoración endodóntica', duracionMin: 30, precioMxn: 500, costoVariableMxn: 70, enQueConsiste: 'Pruebas de sensibilidad y radiografía para saber si la pieza necesita tratamiento de conductos.', comoPrepararse: 'Anota desde cuándo te molesta y qué lo empeora.' },
      { id: 'conductos', categoria: 'endodoncia', nombre: 'Tratamiento de conductos', duracionMin: 90, precioMxn: 4500, costoVariableMxn: 900, enQueConsiste: 'Limpieza y sellado de los conductos de la raíz, con anestesia local.', comoPrepararse: 'Come antes de venir y reserva la tarde para descansar.' },
      { id: 'valoracion-implantes', categoria: 'implantologia', nombre: 'Valoración de implantes', duracionMin: 45, precioMxn: 700, costoVariableMxn: 90, enQueConsiste: 'Revisión del hueso y la encía para planear un implante.', comoPrepararse: 'Trae tomografía si ya tienes una.' },
      { id: 'implante', categoria: 'implantologia', nombre: 'Colocación de implante', duracionMin: 120, precioMxn: 18000, costoVariableMxn: 6500, enQueConsiste: 'Colocación quirúrgica del implante de titanio, previa valoración.', comoPrepararse: 'Sigue las indicaciones de tu valoración; ven acompañado.' },
    ],
    promociones: [
      { id: 'limpieza-noviembre', texto: 'Limpieza dental con 20 % de descuento en noviembre (promoción sintética).', vigencia: '2026-11-01 a 2026-11-30' },
      { id: 'valoracion-ortodoncia', texto: 'La valoración de ortodoncia se descuenta si inicias tratamiento (promoción sintética).', vigencia: 'todo 2026' },
    ],
    supuestos: {
      gastoMarketingMensualMxn: {
        busqueda: { valor: 6000, unidad: 'MXN al mes', fuente: SIN_FUENTE },
        redes: { valor: 4000, unidad: 'MXN al mes', fuente: SIN_FUENTE },
        convenio: { valor: 1500, unidad: 'MXN al mes', fuente: SIN_FUENTE },
        referido: { valor: 0, unidad: 'MXN al mes', fuente: 'supuesto: el referido no tiene gasto directo de pauta' },
      },
      visitasPorAnio: { valor: 2.5, unidad: 'visitas por paciente al año', fuente: SIN_FUENTE },
      aniosRetencion: { valor: 3, unidad: 'años', fuente: SIN_FUENTE },
      costoCorreoUsd: { valor: 0.0004, unidad: 'US$ por correo', fuente: FUENTE_CORREO },
      costoTelegramUsd: { valor: 0, unidad: 'US$ por mensaje', fuente: FUENTE_TELEGRAM },
      tarifasWhatsappUsd: TARIFAS_WA,
      tipoCambioMxnPorUsd: { valor: 18.5, unidad: 'MXN por US$', fuente: FUENTE_CAMBIO },
    },
  },
  {
    ...COMUNES,
    id: 'colibri',
    nombre: 'Dental Colibrí',
    lema: 'Tu sonrisa, sin prisas, en Puebla',
    marca: { primario: '#6d28d9', acento: '#ec4899', fondo: '#faf5ff', inicial: 'C' },
    direccion: 'Avenida Sintética 2020, Col. Prueba, 72000 Puebla, Pue. (dirección sintética)',
    comoLlegar: 'Frente al parque del Laboratorio (dato sintético). Sin estacionamiento propio; hay estacionamiento público a una cuadra.',
    telefono: '+52 22 0000 0202',
    correoAvisos: 'avisos@colibri.clinica.example',
    dominio: 'colibri.clinica.example',
    botTelegram: 'DentalColibriLabbot',
    horario: [1, 2, 3, 4, 5].map((dia) => ({ dia, desde: '10:00', hasta: '18:00' })),
    sillones: ['sillon-unico'],
    servicios: [
      { id: 'valoracion', categoria: 'general', nombre: 'Consulta de valoración', duracionMin: 30, precioMxn: 400, costoVariableMxn: 55, enQueConsiste: 'Revisión de dientes y encías y plan de tratamiento.', comoPrepararse: 'Trae la lista de medicamentos que tomas.' },
      { id: 'limpieza', categoria: 'general', nombre: 'Limpieza dental (profilaxis)', duracionMin: 60, precioMxn: 750, costoVariableMxn: 110, enQueConsiste: 'Retiro de sarro, pulido y aplicación de flúor.', comoPrepararse: 'No necesitas ayuno.' },
      { id: 'valoracion-ortodoncia', categoria: 'ortodoncia', nombre: 'Valoración de ortodoncia', duracionMin: 60, precioMxn: 550, costoVariableMxn: 75, enQueConsiste: 'Estudio de mordida y opciones de alineadores.', comoPrepararse: 'Trae radiografías si las tienes.' },
      { id: 'valoracion-endodoncia', categoria: 'endodoncia', nombre: 'Valoración endodóntica', duracionMin: 30, precioMxn: 450, costoVariableMxn: 65, enQueConsiste: 'Pruebas y radiografía para decidir si hace falta un tratamiento de conductos.', comoPrepararse: 'Anota desde cuándo te molesta.' },
      { id: 'conductos', categoria: 'endodoncia', nombre: 'Tratamiento de conductos', duracionMin: 90, precioMxn: 4200, costoVariableMxn: 850, enQueConsiste: 'Limpieza y sellado de los conductos de la raíz.', comoPrepararse: 'Come antes de venir.' },
      { id: 'valoracion-implantes', categoria: 'implantologia', nombre: 'Valoración de implantes', duracionMin: 60, precioMxn: 650, costoVariableMxn: 85, enQueConsiste: 'Revisión del hueso para planear un implante.', comoPrepararse: 'Trae tomografía si ya tienes una.' },
    ],
    promociones: [{ id: 'primera-visita', texto: 'Primera consulta de valoración a 300 pesos para pacientes nuevos (promoción sintética).', vigencia: 'octubre a diciembre de 2026' }],
    supuestos: {
      gastoMarketingMensualMxn: {
        busqueda: { valor: 3500, unidad: 'MXN al mes', fuente: SIN_FUENTE },
        redes: { valor: 5000, unidad: 'MXN al mes', fuente: SIN_FUENTE },
        convenio: { valor: 0, unidad: 'MXN al mes', fuente: 'supuesto: Dental Colibrí no tiene convenios de empresa' },
        referido: { valor: 0, unidad: 'MXN al mes', fuente: 'supuesto: el referido no tiene gasto directo de pauta' },
      },
      visitasPorAnio: { valor: 2, unidad: 'visitas por paciente al año', fuente: SIN_FUENTE },
      aniosRetencion: { valor: 2.5, unidad: 'años', fuente: SIN_FUENTE },
      costoCorreoUsd: { valor: 0.0004, unidad: 'US$ por correo', fuente: FUENTE_CORREO },
      costoTelegramUsd: { valor: 0, unidad: 'US$ por mensaje', fuente: FUENTE_TELEGRAM },
      tarifasWhatsappUsd: TARIFAS_WA,
      tipoCambioMxnPorUsd: { valor: 18.5, unidad: 'MXN por US$', fuente: FUENTE_CAMBIO },
    },
  },
];

/** Valida al cargar: una clinica mal declarada no arranca. */
export const CLINICAS: readonly Clinica[] = CLINICAS_DECLARADAS.map((c) => esquemaClinica.parse(c));
export const IDS_CLINICA = CLINICAS.map((c) => c.id);

export function clinica(idClinica: string): Clinica {
  const c = CLINICAS.find((x) => x.id === idClinica);
  if (!c) throw new Error(`clinica desconocida: ${idClinica}`);
  return c;
}

export function servicio(c: Clinica, idServicio: string): Servicio {
  const s = c.servicios.find((x) => x.id === idServicio);
  if (!s) throw new Error(`servicio desconocido en ${c.id}: ${idServicio}`);
  return s;
}

export const pesos = (n: number): string => `$${n.toLocaleString('es-MX')} MXN`;
