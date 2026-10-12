/**
 * El journey de experiencia de Soporte SAP, de punta a punta y a través de los tres niveles. Cada paso es un paso del
 * recorrido que Playwright hace contra el producto (su captura) y un momento congelado de la vitrina (lo que cada nivel
 * veía): lo que aquí se afirma, se ve. Las siglas D1…D14 son las decisiones del laboratorio en la AISIA.
 */
import type { PasoDelRecorrido } from './capturas'

export type Nivel = 'N3' | 'N2' | 'N1' | 'agente'
export type RolDeVista = 'cliente' | 'consultor' | 'superadmin' | 'experto'
export type IdFase = 'alta' | 'decision' | 'aprendizaje' | 'servicio' | 'control'

export interface PasoJourney {
  readonly id: string
  readonly fase: IdFase
  readonly nivel: Nivel
  readonly quien: string
  readonly titulo: string
  readonly hace: string
  readonly ve: string
  readonly necesita: string
  /** Quién decide en este paso: una persona con nombre, o el agente con una regla determinista. */
  readonly decide: string
  readonly mide?: string
  readonly protege?: string
  readonly captura: PasoDelRecorrido
  /** El momento de la vitrina y el rol con el que se abre para verlo. */
  readonly momento: string
  readonly rol: RolDeVista
}

export const FASES: ReadonlyArray<{ readonly id: IdFase; readonly titulo: string; readonly idea: string }> = [
  { id: 'alta', titulo: 'Alta y evidencia', idea: 'El cliente cuenta lo que pasa una sola vez; lo demás se lee de sus adjuntos.' },
  { id: 'decision', titulo: 'Del plan a la decisión', idea: 'El agente prepara y verifica; una persona decide, y queda su nombre.' },
  { id: 'aprendizaje', titulo: 'Aprender sin exponer', idea: 'Lo nuevo se aprende anonimizado y sube al núcleo solo con consentimiento.' },
  { id: 'servicio', titulo: 'El servicio, medido', idea: 'El SLA se mide desde los eventos, y cada número dice de dónde sale.' },
  { id: 'control', titulo: 'Control y salida', idea: 'El cliente impugna, la consultora resuelve a su nombre, y quien se va se lleva lo suyo.' },
]

export const NIVELES: Readonly<Record<Nivel, { readonly nombre: string; readonly tono: string }>> = {
  N3: { nombre: 'N3 · el cliente de la consultora', tono: 'sky' },
  N2: { nombre: 'N2 · la consultora', tono: 'emerald' },
  N1: { nombre: 'N1 · el laboratorio', tono: 'violet' },
  agente: { nombre: 'Los agentes', tono: 'amber' },
}

export const JOURNEY: readonly PasoJourney[] = [
  { id: 'levanta', fase: 'alta', nivel: 'N3', quien: 'Usuaria de Alimentos del Bajío', titulo: 'Levanta la incidencia con su captura y su CFDI',
    hace: 'Escribe qué pasa en MIGO (el mensaje M7 053, la sociedad, el periodo) y adjunta la captura del error y el XML del CFDI rechazado.',
    ve: 'Su incidencia, con su número, su estado y su reloj de SLA corriendo.', necesita: 'Contarlo una vez y que lo urgente se note: la planta está detenida.',
    decide: 'Ella, qué contar y qué adjuntar.', mide: 'El reloj de SLA arranca al recibirla.', protege: 'Los adjuntos se leen en esta máquina: la captura con OCR local, el CFDI como XML. Nada crudo va a un modelo externo (D7).',
    captura: '01', momento: '01-levanta', rol: 'cliente' },
  { id: 'evidencia', fase: 'alta', nivel: 'agente', quien: 'La ingesta', titulo: 'La evidencia se lee por campo, y todo queda por revisar',
    hace: 'Valida cada adjunto por sus bytes y lo lee con el extractor documental: OCR por zonas para la imagen, el XML para el CFDI.',
    ve: 'Cada campo con su valor, de dónde salió y «por revisar»; cada original dice cuándo vence.', necesita: 'Que el consultor no tenga que transcribir capturas, spools ni CFDI a mano.',
    decide: 'Nadie todavía: leer bien no es autenticar, y nada se da por bueno solo.', protege: 'Un adjunto que no se puede leer se guarda sin extracción y se dice por qué.',
    captura: '02', momento: '01-levanta', rol: 'cliente' },
  { id: 'categoriza', fase: 'alta', nivel: 'agente', quien: 'El agente de soporte', titulo: 'Categoriza con su traza',
    hace: 'Saca la transacción, el mensaje y el módulo; asigna la prioridad ITIL por impacto × urgencia, y abre la cadena de eventos sha256.',
    ve: 'Prioridad P1, módulo MM, MIGO, M7 053, las razones de cada etiqueta y la cadena «íntegra ✓».', necesita: 'Una prioridad explicada, no una caja negra.',
    decide: 'Una regla determinista, con sus razones a la vista. Si la prioridad está mal, el cliente la impugna.', mide: 'Cada paso queda en la cadena, con su hash.',
    captura: '03', momento: '01-levanta', rol: 'consultor' },
  { id: 'escala', fase: 'decision', nivel: 'N2', quien: 'Consultor de Consultora Andina', titulo: 'La consultora escala al laboratorio, a su nombre',
    hace: 'Abre la incidencia, ve que el plan verificado espera su decisión, y la escala al laboratorio.',
    ve: '«Escalada al laboratorio por usr-consultor-andina».', necesita: 'Decidir ella qué ve el laboratorio de sus clientes.',
    decide: 'La consultora. El agente no escala, y el cliente tampoco.', mide: 'Desde la escalada corre el reloj de la respuesta del laboratorio (D13).', protege: 'Sin escalar, el laboratorio no ve la incidencia ni su plan (DP-3).',
    captura: '03.5', momento: '02-escala', rol: 'consultor' },
  { id: 'sala', fase: 'decision', nivel: 'N1', quien: 'Superadministrador del laboratorio', titulo: 'El plan llega a la sala con el veredicto del supervisor',
    hace: 'El ejecutor prepara el plan desde la matriz y lo simula; el supervisor, otro agente, lo verifica: 6 de 6.',
    ve: 'El plan, sus pasos, la previsión de antes y después, y las comprobaciones del supervisor.', necesita: 'Aprobar sabiendo qué se va a cambiar y por qué es seguro.',
    decide: 'Una persona en la sala: aprobar, rechazar o mandarlo a revisión.', protege: 'El laboratorio no ve los adjuntos originales de lo escalado.',
    captura: '04', momento: '02-escala', rol: 'superadmin' },
  { id: 'aprueba', fase: 'decision', nivel: 'N1', quien: 'Superadministrador del laboratorio', titulo: 'Una persona aprueba y el simulador aplica',
    hace: 'Aprueba en la sala; el plan se aplica al simulador del SAP del cliente.',
    ve: 'El antes y el después: «error presente» → «error ausente», y el aviso de que no se aplicó en el SAP del cliente.', necesita: 'Que nada cambie en el SAP real sin una persona con su propio acceso.',
    decide: 'La persona que aprueba: es una fila que ningún modelo puede escribir.', protege: 'El producto no se conecta a un SAP real ni guarda sus credenciales: llevarlo allá lo hace una persona, fuera del producto (D6).',
    captura: '04.5', momento: '03-aprueba', rol: 'cliente' },
  { id: 'sandbox', fase: 'aprendizaje', nivel: 'agente', quien: 'El anonimizador', titulo: 'Un caso nuevo entra al sandbox anonimizado',
    hace: 'Sin regla para «la app Fiori se queda en blanco», el caso se anonimiza: el nombre y el correo de quien lo reportó se reemplazan.',
    ve: 'En el sandbox, solo el texto anonimizado: [NOMBRE] y [CORREO] donde estaban quien lo reportó y su correo. El original no lo ve el laboratorio, porque no se le escaló.', necesita: 'Aprender del caso sin exponer a quien lo vivió.',
    decide: 'El anonimizador, con reglas: lo que deja forma de dato, y todo caso de RR. HH. o nómina, va a cuarentena definitiva (D14).',
    protege: 'La cuarentena no la revisa nadie, tampoco el laboratorio.', captura: '05', momento: '04-ensena', rol: 'experto' },
  { id: 'ensena', fase: 'aprendizaje', nivel: 'N1', quien: 'Experto del laboratorio', titulo: 'El experto enseña y el agente propone la regla',
    hace: 'Le explica al agente en el chat cómo se resolvió; el agente propone una regla y un CLI, a medida de la consultora.',
    ve: 'La propuesta «a medida de andina» y lo que le falta para subir al núcleo.', necesita: 'Que lo aprendido sirva la próxima vez.',
    decide: 'El laboratorio firma lo que cambia un veredicto.', protege: 'La pantalla dice qué falta, nunca de quién.', captura: '05.01', momento: '04-ensena', rol: 'superadmin' },
  { id: 'consiente', fase: 'aprendizaje', nivel: 'N2', quien: 'La consultora y su cliente', titulo: 'Cada organización consiente por sí',
    hace: 'La consultora consiente; el cliente también, en su propia pantalla. Cualquiera de los dos puede revocar.',
    ve: 'Su consentimiento vigente, con fecha y nombre.', necesita: 'Que su conocimiento no le sirva a su competencia sin que lo sepa.',
    decide: 'Cada organización por sí misma (D1).', protege: 'Sin los dos consentimientos, nada sube al núcleo común.', captura: '05.02', momento: '04-ensena', rol: 'cliente' },
  { id: 'nucleo', fase: 'aprendizaje', nivel: 'N1', quien: 'Superadministrador del laboratorio', titulo: 'Sube al núcleo, generalizado',
    hace: 'Sube la enseñanza al núcleo común.', ve: 'La regla con [CLIENTE] y [OBJETO_PROPIO] donde estaban el cliente y su transacción Z.',
    necesita: 'Un núcleo que mejore para todas las consultoras sin revelar a ninguna.', decide: 'El superadministrador, solo con los consentimientos vigentes.',
    protege: 'Generalizar quita también lo que no es dato personal: objetos propios, sociedades, la forma del negocio.', captura: '05.1', momento: '04-ensena', rol: 'superadmin' },
  { id: 'revision', fase: 'decision', nivel: 'N1', quien: 'Superadministrador del laboratorio', titulo: 'A revisión: el agente corrige y vuelve a proponer',
    hace: 'Manda un plan a revisión con su motivo («el periodo correcto es 2026/11»); el agente propone la v2 y se aprueba.',
    ve: 'La v2 con el cambio: periodo 2026/10 → 2026/11.', necesita: 'Corregir al agente sin rehacer el trabajo.',
    decide: 'La persona, y su motivo queda en la cadena.', captura: '06', momento: '05-revision', rol: 'superadmin' },
  { id: 'chat', fase: 'decision', nivel: 'N1', quien: 'Superadministrador del laboratorio', titulo: 'El chat responde con definiciones y no aprueba nada',
    hace: 'Pregunta el MTTR del mes y el de una consultora, y pide aprobar desde el chat.',
    ve: 'El MTTR total con su definición y su fuente; el de una consultora, no («su grupo tiene menos de 3 clientes»); y «No apruebo desde el chat»: la petición pasa a la sala.',
    necesita: 'Respuestas con fuente, no cifras inventadas.', decide: 'Solo la sala aprueba.', protege: 'El laboratorio solo ve agregados de 3 clientes o más (D14).',
    captura: '10', momento: '05-revision', rol: 'superadmin' },
  { id: 'responde', fase: 'servicio', nivel: 'N2', quien: 'Consultor de Consultora Andina', titulo: 'La primera respuesta la da el consultor',
    hace: 'Responde al cliente: «Ya revisamos el periodo contable; te confirmamos hoy mismo».',
    ve: 'Antes de responder, el reloj en plazo aunque el plan ya estuviera en la sala; después, «respuesta en meta».', necesita: 'Un SLA que mida lo que el cliente vive, no lo que hace el sistema.',
    decide: 'El consultor, al responder.', mide: 'PRIMERA_RESPUESTA en la cadena, a nombre del consultor.', captura: '11.2', momento: '06-sla', rol: 'consultor' },
  { id: 'pausa', fase: 'servicio', nivel: 'N2', quien: 'La consultora y su cliente', titulo: 'Esperar al cliente pausa el reloj; su respuesta lo reanuda',
    hace: 'El consultor pide el log de la ST22; el cliente lo manda y el reloj sigue.', ve: 'Los tramos del reloj: corre, pausa, corre, cada uno con quién lo abrió.',
    necesita: 'Que la espera del cliente no cuente contra la consultora, y que se vea.', decide: 'El consultor pausa diciendo qué pide; el cliente reanuda al responder.',
    mide: 'Respuesta, resolución y pausa, desde los eventos.', captura: '11', momento: '06-sla', rol: 'consultor' },
  { id: 'workspace', fase: 'servicio', nivel: 'N2', quien: 'Consultor de Consultora Andina', titulo: 'El workspace: SLA, horas y accionables con fórmula',
    hace: 'Revisa el contrato de SLA de su cliente, sus horas y los accionables del mes.',
    ve: 'Metas citadas de una referencia pública o «por decidir»; accionables con impacto en MXN, su fórmula y sus supuestos.', necesita: 'Saber qué hacer primero y cuánto vale.',
    decide: 'La consultora, con su cliente: las proyecciones no son promesas.', mide: 'Cada número viene del corte semántico, con una sola definición.',
    captura: '12', momento: '06-sla', rol: 'consultor' },
  { id: 'tablero', fase: 'servicio', nivel: 'N3', quien: 'Usuaria de Alimentos del Bajío', titulo: 'El cliente ve su servicio, con su dato',
    hace: 'Abre su tablero del mes.', ve: 'Sus métricas con su fuente, un FODA donde cada punto cita su dato, su criterio y su confianza, y sus accionables.',
    necesita: 'Una sola versión de cada número, la misma que ve su consultora.', decide: 'Nadie le cambia el número: sale de la capa semántica.',
    mide: 'Lo que ve el cliente es lo mismo que ve su consultora.', captura: '08', momento: '06-sla', rol: 'cliente' },
  { id: 'fichas', fase: 'servicio', nivel: 'N1', quien: 'Superadministrador del laboratorio', titulo: 'La ficha de servidor no dice «apto» sin restauración probada',
    hace: 'Revisa la ficha de servidor de cada consultora.', ve: 'Ninguna «apta»: falta medir y probar una restauración (GATE 3).',
    necesita: 'No prometer disponibilidad que no está probada.', decide: 'Nadie promete RPO ni RTO antes de GATE 3.', captura: '09.1', momento: '06-sla', rol: 'superadmin' },
  { id: 'presupuesto', fase: 'servicio', nivel: 'N2', quien: 'Consultor de Consultora Andina', titulo: 'Al tope del presupuesto, nadie se queda sin atención',
    hace: 'Con el tope del mes en cero, el cliente levanta un P1 con captura y un P4.', ve: 'El P1 pasa a una persona en el momento; el P4 espera, con aviso.',
    necesita: 'Que proteger la factura no deje sin servicio a un cliente con la planta detenida.', decide: 'La regla: un P1 o un P2 nunca espera por el presupuesto.',
    captura: '13', momento: '07-presupuesto', rol: 'consultor' },
  { id: 'impugna', fase: 'control', nivel: 'N3', quien: 'Usuaria de Alimentos del Bajío', titulo: 'El cliente impugna la prioridad',
    hace: 'Impugna que el usuario bloqueado sea P4: «nadie del almacén puede surtir sin ese usuario».', ve: 'Su impugnación, aceptada, con el nombre de quien la resolvió.',
    necesita: 'Poder decir «esto está mal» y que alguien responda.', decide: 'La consultora, a su nombre; una resuelta no se reabre.', captura: '14', momento: '08-impugna', rol: 'cliente' },
  { id: 'resuelve', fase: 'control', nivel: 'N2', quien: 'Consultor de Consultora Andina', titulo: 'Aplicar no es resolver',
    hace: 'Da por resuelta la incidencia de MIGO, que el simulador ya había aplicado.', ve: 'RESUELTA a nombre del consultor, después de APLICADA_EN_SIMULADOR.',
    necesita: 'Que «resuelto» lo diga quien atiende al cliente.', decide: 'El consultor, no el agente.', mide: 'El reloj de resolución se cierra aquí.', captura: '14.4', momento: '08-impugna', rol: 'consultor' },
  { id: 'salida', fase: 'control', nivel: 'N3', quien: 'Usuaria de Alimentos del Bajío', titulo: 'Se va, y se lleva lo suyo',
    hace: 'Registra su salida y descarga su export.', ve: 'Su salida registrada; lo suyo congelado; el borrado espera la gracia de su contrato, que hoy dice «por decidir».',
    necesita: 'Irse sin quedar atrapado ni perder su historia.', decide: 'El cliente, con una persona que registra la baja (D8).',
    protege: 'Tras la gracia se borra todo salvo el sandbox anonimizado y el núcleo; el laboratorio no descarga su export.', captura: '14.7', momento: '09-salida', rol: 'cliente' },
]
