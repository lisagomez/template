/**
 * Los datos SINTÉTICOS de Recepción: un negocio FICTICIO (Barbería La Alameda), su horario, sus servicios y la
 * semilla de su agenda. Nada de aquí es de una persona real: los clientes son inventados y sus correos van al
 * dominio reservado `.example` (RFC 2606), que no entrega nada. Los precios son del negocio ficticio, no del
 * producto (el producto no tiene precio: ERP-7).
 *
 * Lo leen igual la pestaña (la agenda del mostrador) y el servidor (la lectura de solo conteos): por eso vive
 * aquí y no dentro de un componente.
 */
export const ZONA = 'America/Mexico_City';

export const NEGOCIO = {
  /** El inquilino de la memoria del producto: lo que Nora recuerda es de este negocio y de nadie más. */
  inquilino: 'alameda',
  nombre: 'Barbería La Alameda',
  nota: 'negocio ficticio · datos sintéticos',
} as const;

/** La cuenta y el calendario del negocio en el simulador de Google de `tools/calendario`. */
export const REF_AGENDA = { cuenta: 'mostrador@alameda.example', calendario: 'citas' } as const;

/** Domingo es 0. Es la forma de `horario` en las reglas de `Reservas` (tools/calendario). */
export const HORARIO = [
  { dia: 0, desde: '10:00', hasta: '15:00' },
  ...[1, 2, 3, 4, 5, 6].map((dia) => ({ dia, desde: '10:00', hasta: '20:00' })),
];

/** Lo que dura una cita apartada desde el mostrador y cada cuánto empieza una. */
export const CITA = { minutos: 45, cadaMinutos: 15, avisoMinimoMinutos: 30 } as const;

export const SERVICIOS = [
  { id: 'corte', nombre: 'Corte', minutos: 45, precio: 180 },
  { id: 'barba', nombre: 'Arreglo de barba', minutos: 30, precio: 120 },
  { id: 'corte-y-barba', nombre: 'Corte y barba', minutos: 75, precio: 270 },
  { id: 'lavado', nombre: 'Lavado y peinado', minutos: 20, precio: 90 },
] as const;

export interface CitaSembrada { dias: number; hora: number; minuto: number; minutos: number; servicio: string; cliente: string; correo: string }

/**
 * La agenda con la que arranca el negocio, en días desde hoy (hora local de `ZONA`). Mañana lleva UNA sola cita
 * a propósito: «cancela la cita de mañana» tiene un solo blanco y no se adivina cuál.
 */
export const SEMILLA: readonly CitaSembrada[] = [
  { dias: 0, hora: 10, minuto: 30, minutos: 45, servicio: 'Corte', cliente: 'Mario R.', correo: 'mario.r@clientes.example' },
  { dias: 0, hora: 12, minuto: 0, minutos: 30, servicio: 'Arreglo de barba', cliente: 'Luis P.', correo: 'luis.p@clientes.example' },
  { dias: 0, hora: 13, minuto: 30, minutos: 75, servicio: 'Corte y barba', cliente: 'Andrés G.', correo: 'andres.g@clientes.example' },
  { dias: 1, hora: 12, minuto: 0, minutos: 45, servicio: 'Corte', cliente: 'Daniela M.', correo: 'daniela.m@clientes.example' },
  { dias: 2, hora: 11, minuto: 0, minutos: 30, servicio: 'Lavado y peinado', cliente: 'Ernesto V.', correo: 'ernesto.v@clientes.example' },
];
