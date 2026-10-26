/**
 * La lectura de SOLO conteos de Recepción hacia el cerebro personal del laboratorio: cuántas citas hay hoy y mañana
 * y el enlace al mostrador. Nunca nombres, horas, servicios ni texto: lo que es del negocio y de sus clientes se
 * queda en el producto. La valida `validaResumen` de la capa contra lo que declara la composición.
 *
 * En el HECHO la agenda es sintética: el servidor la arma con la misma semilla y el mismo motor que la pestaña, y la
 * cuenta con la misma definición (`citasDelDia`). Lo que se aparta o cancela en una pestaña vive en esa pestaña.
 */
import { citasDelDia, creaAgenda } from './agenda.ts';

export const ENLACE_MOSTRADOR = '/recepcion';

export async function resumenDeRecepcion(ahora: number = Date.now()): Promise<unknown> {
  const agenda = creaAgenda({ ahora: () => ahora });
  await agenda.listo;
  const foto = agenda.foto();
  return {
    resumen: 1,
    producto: 'recepcion',
    generado: new Date(ahora).toISOString(),
    conteos: { 'citas-hoy': citasDelDia(foto, 0).length, 'citas-manana': citasDelDia(foto, 1).length },
    enlaces: { mostrador: ENLACE_MOSTRADOR },
  };
}
