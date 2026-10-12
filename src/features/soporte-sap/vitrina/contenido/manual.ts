/**
 * El manual de usuario de Soporte SAP, por rol. Describe el laboratorio tal como corre (identidades de laboratorio,
 * datos sintéticos, simulador en lugar de SAP) y marca dónde producción será distinta. Fuente única: la página de la
 * vitrina lo pinta y `genera-manual.mjs` escribe `src/features/soporte-sap/MANUAL.md` desde aquí.
 */
import type { PasoDelRecorrido } from './capturas'

export interface SeccionManual {
  readonly id: string
  readonly titulo: string
  readonly para: string
  readonly pasos: readonly string[]
  readonly captura?: PasoDelRecorrido
  /** Lo que conviene saber: una regla del producto que no se ve a simple vista. */
  readonly ojo?: string
}
export interface ManualDeRol { readonly id: 'cliente' | 'consultor' | 'laboratorio'; readonly titulo: string; readonly quien: string; readonly entra: string; readonly secciones: readonly SeccionManual[] }

export const EN_PRODUCCION = [
  'En el laboratorio eliges tu identidad con los botones de rol. En producción entras con tu cuenta, y la base decide lo que ves (auth.uid() y la RLS de cada tabla).',
  'Los datos son sintéticos y viven en memoria: al reiniciar el laboratorio se pierden. En producción viven en la base de tu modo de despliegue, con su respaldo.',
  'Los planes se aplican a un simulador del SAP del cliente. El producto no se conecta a un SAP real: llevar la solución allá lo hace una persona con su propio acceso (D6).',
  'No hay modelo de lenguaje: el triage y los planes son deterministas. Si un día lo hay, lo crudo solo va a un modelo autohospedado (D7).',
] as const

export const MANUAL: readonly ManualDeRol[] = [
  {
    id: 'cliente', titulo: 'Usuario del cliente (N3)', quien: 'Quien trabaja en la empresa que atiende la consultora y levanta incidencias.', entra: 'el botón «N3 · Cliente».',
    secciones: [
      { id: 'levantar', titulo: 'Levantar una incidencia', para: 'Contar lo que pasa una sola vez, con su evidencia.', captura: '01',
        pasos: ['Escribe un título corto: la transacción y qué falla («MIGO no deja contabilizar la entrada»).', 'En la descripción, di el mensaje de error, la sociedad, el periodo y a quién afecta.', 'Adjunta hasta cinco archivos de 5 MB o menos: la captura del error (PNG o JPG), el PDF del spool o el XML del CFDI.', 'Pulsa «Levantar incidencia». La lectura de una captura con OCR puede tardar unos segundos.'],
        ojo: 'Los adjuntos se leen por sus bytes, en local. Un archivo que no se puede leer se guarda sin extracción y se dice por qué.' },
      { id: 'seguir', titulo: 'Seguir tu incidencia', para: 'Saber qué se entendió y en qué va.', captura: '02',
        pasos: ['Abre la incidencia en «Tus incidencias».', 'En «Evidencia» ves cada campo leído, de dónde salió y que está «por revisar»; cada original dice cuándo vence.', 'En la categorización ves la prioridad, el módulo y la transacción, con sus razones.', 'El reloj de SLA dice si la respuesta va en plazo, y la cadena de eventos, que nada se alteró («íntegra ✓»).'] },
      { id: 'respuesta', titulo: 'Leer la respuesta y contestar lo que te piden', para: 'Que tu respuesta no cuente contra ti.', captura: '14.2',
        pasos: ['Las respuestas de tu consultora aparecen en la incidencia.', 'Si te piden algo, el reloj se pausa y ves qué te piden.', 'Al responder, pulsa «Ya respondí (reanuda el reloj)»: lo reanudas tú, sin esperar a tu consultora.'] },
      { id: 'impugnar', titulo: 'Impugnar una decisión', para: 'Decir «esto está mal» y que alguien responda con su nombre.', captura: '14',
        pasos: ['En la incidencia, elige qué impugnas: la prioridad, la categoría, la complejidad, una pausa o la resolución.', 'Escribe el motivo (diez caracteres o más) y pulsa «Impugnar».', 'Tu consultora la acepta o la rechaza a su nombre. Una impugnación resuelta no se reabre.'] },
      { id: 'tablero', titulo: 'Tu tablero', para: 'Ver tu servicio con la misma cifra que ve tu consultora.', captura: '08',
        pasos: ['Cada métrica del mes dice su fuente al pasar el cursor.', 'El FODA cita su dato, su criterio y su confianza.', 'Los accionables muestran un impacto en MXN con su fórmula y sus supuestos.'],
        ojo: 'Una proyección no es una promesa: cambia si cambian sus supuestos.' },
      { id: 'conocimiento', titulo: 'El conocimiento común (D1)', para: 'Decidir si lo aprendido de tus casos ayuda a otras consultoras.', captura: '05.02',
        pasos: ['En «Conocimiento común», pulsa «Consentir» si quieres que lo aprendido de tus casos suba al núcleo, generalizado.', 'Puedes revocarlo cuando quieras: revocar frena lo que no ha subido; lo que ya subió, generalizado, se queda.'],
        ojo: 'Hace falta tu consentimiento y el de tu consultora, cada uno por su lado.' },
      { id: 'salida', titulo: 'Tu salida del servicio (D8)', para: 'Irte con lo tuyo.', captura: '14.7',
        pasos: ['En «Salida del servicio», marca que entiendes que no tiene vuelta y pulsa «Registrar la salida».', 'Descarga tu export: es tuyo y de tu consultora; el laboratorio no lo descarga.', 'Desde ese momento nada tuyo cambia; tras la gracia de tu contrato se borra todo salvo el sandbox anonimizado y el núcleo.'],
        ojo: 'Hoy la gracia de tu contrato dice «por decidir»: mientras no se decida, no se borra nada.' },
    ],
  },
  {
    id: 'consultor', titulo: 'Consultor (N2)', quien: 'Quien atiende a los clientes de la consultora y responde por su SLA.', entra: 'el botón «N2 · Consultor».',
    secciones: [
      { id: 'bandeja', titulo: 'La bandeja', para: 'Ver todo lo de tus clientes en un lugar.', captura: '03',
        pasos: ['La «Bandeja de la consultora» lista las incidencias de tus clientes con su prioridad y su estado.', 'Abre una para ver su evidencia, su categorización con razones, el veredicto de la matriz y el plan verificado.'] },
      { id: 'escalar', titulo: 'Escalar al laboratorio', para: 'Pedir que el laboratorio decida un plan.', captura: '03.5',
        pasos: ['Con el plan verificado pendiente, pulsa «Escalar al laboratorio».', 'Queda a tu nombre, y desde ahí corre el reloj de la respuesta del laboratorio (D13).'],
        ojo: 'El laboratorio no ve lo que no escalas: ni la incidencia, ni su plan.' },
      { id: 'sala', titulo: 'La sala', para: 'Ver qué se decidió sobre lo que escalaste, y quién.', captura: '04',
        pasos: ['La sala de tu canal muestra cada plan con sus pasos, su previsión de antes y después y las comprobaciones del supervisor.', 'Quien decide lo escalado es el laboratorio: aprueba, rechaza o lo manda a revisión con su motivo, y queda su nombre.', 'Un plan aprobado se aplica al simulador; en la incidencia ves el antes y el después.'],
        ojo: 'Aprobar es una fila con nombre de persona que ningún agente puede escribir. Llevar la solución al SAP del cliente lo hace una persona, fuera del producto (D6).' },
      { id: 'responder', titulo: 'Responder, pedir y resolver', para: 'Que el SLA mida lo que el cliente vive.', captura: '11',
        pasos: ['Responde al cliente desde la incidencia: tu primera respuesta es la que para el reloj de respuesta.', 'Si necesitas algo del cliente, pídelo diciendo qué: el reloj se pausa hasta que responda.', 'Cuando esté resuelto, pulsa «Dar por resuelta»: aplicar en el simulador no es resolver.'] },
      { id: 'impugnaciones', titulo: 'Las impugnaciones', para: 'Responder con tu nombre.', captura: '14',
        pasos: ['Las impugnaciones abiertas aparecen en la incidencia.', 'Pulsa «Aceptar» o recházala; queda a tu nombre y no se reabre.'] },
      { id: 'workspace', titulo: 'SLA, horas, presupuesto y accionables', para: 'Saber cómo va el servicio y qué hacer primero.', captura: '07',
        pasos: ['El contrato de SLA muestra las metas citadas de una referencia pública, o «por decidir».', 'Las horas vienen de la capa semántica; el presupuesto del mes, de lo gastado en la cadena de eventos.', 'Los accionables traen su impacto en MXN, su fórmula y sus supuestos.'],
        ojo: 'Al tope del presupuesto, un P1 o un P2 pasa a una persona en el momento; un P3 o un P4 espera, con aviso.' },
    ],
  },
  {
    id: 'laboratorio', titulo: 'Laboratorio (N1): superadministrador y experto', quien: 'Quien opera la sala, el sandbox y el núcleo de conocimiento.', entra: 'los botones «N1 · Superadministrador» y «N1 · Experto HIL».',
    secciones: [
      { id: 'sala-n1', titulo: 'La sala de lo escalado', para: 'Decidir lo que las consultoras te escalan.', captura: '04',
        pasos: ['Solo ves lo que una consultora escaló, sin sus adjuntos originales.', 'Pulsa «Aprobar (mi sesión)», «Rechazar» o «A revisión» con su motivo; tu decisión es la respuesta del laboratorio (D13).'] },
      { id: 'chat', titulo: 'El chat del HIL', para: 'Preguntar y enseñar.', captura: '10',
        pasos: ['Pregunta una métrica: responde con su definición y su fuente.', 'Si pides aprobar desde el chat, no lo hace: pasa la petición a la sala.', 'Como experto, enseña un caso nuevo: el agente propone la regla y el CLI.'],
        ojo: 'Solo ves agregados de grupos de 3 clientes o más; lo demás se suprime y se dice por qué (D14).' },
      { id: 'nucleo', titulo: 'El sandbox y el núcleo', para: 'Aprender sin exponer a nadie.', captura: '05.1',
        pasos: ['El sandbox muestra solo texto anonimizado.', 'Una propuesta dice qué le falta para subir al núcleo, nunca de quién.', 'Con los consentimientos vigentes, el superadministrador la sube al núcleo, generalizada.'] },
      { id: 'operacion', titulo: 'Presupuesto, fichas de servidor y salidas', para: 'Operar sin prometer lo que no está probado.', captura: '09.1',
        pasos: ['Fija el tope de tokens y de páginas de OCR de cada consultora por mes.', 'Revisa la ficha de servidor de cada consultora: ninguna dice «apto» sin una restauración probada (GATE 3).', 'Ves las salidas registradas, pero no descargas el export de un cliente.'],
        ojo: 'El experto no ve las horas de los consultores ni la salud de la cuenta: eso es del superadministrador.' },
    ],
  },
]
