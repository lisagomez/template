/**
 * LOS CRITERIOS de la puerta de salida de OpenWA, fijados ANTES de medir (2026-10-20): qué significa cada estado y en
 * cuál cae cada una de las 201 operaciones del contrato pineado (OpenWA 0.25.0). La matriz NO se escribe a mano: la genera
 * `openwa/genera-matriz.mjs` del `openapi.json` pineado con estas reglas, y falla si una operación no cae en ninguna, si
 * cae en dos, o si una regla no clasifica nada. Cambiar una regla es un cambio de comportamiento (CDC), no un ajuste.
 *
 * Fuentes: la documentación de Meta consultada el 2026-10-20. «sin_documentar» marca las filas que se sostienen en una
 * AUSENCIA (no se encontró en la documentación vigente), no en una página que lo diga.
 */

/** - igual: misma ruta, misma forma de petición y respuesta, misma semántica.
 *  - diferencia: misma ruta y forma; la semántica cambia y la diferencia se declara aquí.
 *  - imposible: la vía oficial no lo permite; 501 con la alternativa oficial.
 *  - pendiente: la vía oficial lo permite, esta fachada todavía no; 501 con la ruta oficial.
 *  - fuera: administración propia de OpenWA (infra, plugins, motor); 501 con lo que lo reemplaza. */
export const ESTADOS_OPENWA = ['igual', 'diferencia', 'imposible', 'pendiente', 'fuera'] as const;
export type EstadoOpenWA = (typeof ESTADOS_OPENWA)[number];
export type Certeza = 'documentado' | 'sin_documentar';

export interface ReglaOpenWA {
  id: string;
  estado: EstadoOpenWA;
  /** Operaciones por `operationId` (gana sobre la etiqueta) o una etiqueta entera del contrato. */
  operaciones?: readonly string[];
  etiqueta?: string;
  fuente: string;
  certeza: Certeza;
  /** La diferencia declarada, o por qué no se puede. */
  nota: string;
  /** Para lo que contesta 501: qué usar en su lugar por la vía oficial. */
  alternativa?: string;
}

const META = 'https://developers.facebook.com/documentation/business-messaging/whatsapp';
const OPENWA = 'https://github.com/rmyndharis/OpenWA/blob/main/docs';
export const FUENTES = {
  mensajes: `${META}/messages/send-messages`,
  apiMensajes: `${META}/reference/whatsapp-business-phone-number/message-api`,
  precios: `${META}/pricing/`,
  plantillas: `${META}/reference/whatsapp-business-account/template-api`,
  revisionPlantillas: `${META}/templates/template-review`,
  leido: `${META}/messages/mark-message-as-read`,
  escribiendo: 'https://developers.facebook.com/docs/whatsapp/cloud-api/typing-indicators/',
  bloqueo: `${META}/business-scoped-user-ids/`,
  grupos: `${META}/groups`,
  llamadas: `${META}/calling`,
  perfil: `${META}/business-profiles`,
  numeros: `${META}/business-phone-numbers/phone-numbers`,
  coexistencia: `${META}/embedded-signup/onboarding-business-app-users/`,
  webhooksMeta: 'https://developers.facebook.com/docs/graph-api/webhooks/getting-started',
  plataforma: `${META}/about-the-platform`,
  llavesOpenWA: `${OPENWA}/04-security-design.md`,
  apiOpenWA: `${OPENWA}/06-api-specification.md`,
} as const;

const CRM = 'Guárdalo en tu CRM o en el panel de ventas-whatsapp: la Cloud API no tiene libreta ni lista de chats.';

export const REGLAS_OPENWA: readonly ReglaOpenWA[] = [
  // ── igual ────────────────────────────────────────────────────────────────────────────────────────────────────
  { id: 'llaves', estado: 'igual', etiqueta: 'auth', fuente: FUENTES.llavesOpenWA, certeza: 'documentado', nota: 'Llaves de la fachada con los mismos roles (ADMIN, OPERATOR, VIEWER) y el mismo alcance por sesión y por chat.' },
  { id: 'salud', estado: 'igual', etiqueta: 'health', fuente: FUENTES.apiOpenWA, certeza: 'documentado', nota: 'La salud de la fachada.' },
  { id: 'webhooks', estado: 'igual', etiqueta: 'webhooks', fuente: FUENTES.webhooksMeta, certeza: 'documentado', nota: 'Mismo sobre, mismas cabeceras X-OpenWA-* y la misma firma HMAC-SHA256; los eventos nacen de los webhooks de Meta.' },
  { id: 'reaccion', estado: 'igual', operaciones: ['MessageController_react'], fuente: FUENTES.mensajes, certeza: 'documentado', nota: 'Mensaje de reacción de la Cloud API (vacío quita la reacción).' },
  { id: 'respuesta', estado: 'igual', operaciones: ['MessageController_reply'], fuente: FUENTES.apiMensajes, certeza: 'documentado', nota: 'Respuesta citada con context.message_id.' },
  { id: 'bloqueo', estado: 'igual', operaciones: ['ContactController_unblockContact', 'ContactController_getBlockedContacts'], fuente: FUENTES.bloqueo, certeza: 'documentado', nota: 'Block Users API del número (DELETE/GET block_users).' },
  { id: 'lotes', estado: 'igual', operaciones: ['MessageController_getBatchStatus', 'MessageController_cancelBatch'], fuente: FUENTES.apiOpenWA, certeza: 'documentado', nota: 'Estado y cancelación de los lotes de la fachada.' },
  // ── diferencia ───────────────────────────────────────────────────────────────────────────────────────────────
  {
    id: 'sesiones', estado: 'diferencia', fuente: FUENTES.coexistencia, certeza: 'documentado',
    operaciones: ['SessionController_create', 'SessionController_findAll', 'SessionController_findOne', 'SessionController_start', 'SessionController_stop', 'SessionController_logout', 'SessionController_delete'],
    nota: 'Una sesión es un número del BSP. Iniciarla da la liga de alta (Embedded Signup) en vez de un QR: queda en action_required hasta que la pyme termina el alta, y entonces ready. Detenerla o cerrarla deja de enviar y de entregar eventos; no da de baja el número en Meta.',
  },
  { id: 'texto', estado: 'diferencia', operaciones: ['MessageController_sendText'], fuente: FUENTES.precios, certeza: 'documentado', nota: 'Solo dentro de la ventana de atención de 24 h; fuera, 422 FUERA_DE_VENTANA con las plantillas aprobadas que sí pueden salir.' },
  { id: 'medios', estado: 'diferencia', operaciones: ['MessageController_sendImage', 'MessageController_sendVideo', 'MessageController_sendAudio', 'MessageController_sendDocument', 'MessageController_sendSticker'], fuente: FUENTES.apiMensajes, certeza: 'documentado', nota: 'Por `url` https (Meta baja el medio de la liga); `base64` contesta 422 SOLO_URL. Dentro de la ventana de 24 h.' },
  { id: 'ubicacion-contacto', estado: 'diferencia', operaciones: ['MessageController_sendLocation', 'MessageController_sendContact'], fuente: FUENTES.apiMensajes, certeza: 'documentado', nota: 'Mensajes de ubicación y de contactos de la Cloud API, dentro de la ventana de 24 h.' },
  { id: 'plantilla-envio', estado: 'diferencia', operaciones: ['MessageController_sendTemplate'], fuente: FUENTES.plantillas, certeza: 'documentado', nota: 'Envía una plantilla APROBADA por Meta (sale fuera de la ventana y se cobra por su categoría), no una de texto guardada; las variables van a sus parámetros.' },
  { id: 'plantillas', estado: 'diferencia', etiqueta: 'templates', fuente: FUENTES.revisionPlantillas, certeza: 'documentado', nota: 'Crear una plantilla la manda a revisión de Meta (pending → approved o rejected); solo una aprobada sale.' },
  { id: 'lote-envio', estado: 'diferencia', operaciones: ['MessageController_sendBulk'], fuente: FUENTES.precios, certeza: 'documentado', nota: 'Cada destinatario, dentro de su ventana o con plantilla; la frontera del número dosifica los contactos nuevos.' },
  { id: 'producto', estado: 'diferencia', operaciones: ['CatalogController_sendProduct'], fuente: FUENTES.apiMensajes, certeza: 'documentado', nota: 'Mensaje de producto del catálogo conectado al número.' },
  { id: 'historial-propio', estado: 'diferencia', operaciones: ['MessageController_getMessages', 'MessageController_getReactions'], fuente: FUENTES.apiOpenWA, certeza: 'documentado', nota: 'Solo los mensajes y reacciones que pasaron por la fachada desde la migración.' },
  { id: 'chats-propios', estado: 'diferencia', operaciones: ['SessionController_getChats'], fuente: FUENTES.apiOpenWA, certeza: 'documentado', nota: 'Los chats que pasaron por la fachada; archivado, fijado y silenciado siempre en falso (no existen en la Cloud API).' },
  { id: 'leido', estado: 'diferencia', operaciones: ['SessionController_markChatRead'], fuente: FUENTES.leido, certeza: 'documentado', nota: 'Meta marca por id de mensaje: se marca el último recibido de ese chat.' },
  { id: 'escribiendo', estado: 'diferencia', operaciones: ['SessionController_sendChatState'], fuente: FUENTES.escribiendo, certeza: 'documentado', nota: 'Solo «typing», junto con el leído del último mensaje recibido; dura hasta 25 s o hasta la respuesta. «recording» y «paused» contestan 422.' },
  { id: 'contactos-propios', estado: 'diferencia', operaciones: ['ContactController_findAll', 'ContactController_findOne'], fuente: FUENTES.apiOpenWA, certeza: 'documentado', nota: 'Los contactos que escribieron o recibieron por la fachada; no hay libreta.' },
  { id: 'bloqueo-24h', estado: 'diferencia', operaciones: ['ContactController_blockContact'], fuente: FUENTES.bloqueo, certeza: 'documentado', nota: 'Block Users API (POST block_users): solo se bloquea a quien escribió al número en las últimas 24 h; fuera, 422 FUERA_DE_VENTANA.' },
  { id: 'acerca', estado: 'diferencia', operaciones: ['ProfileController_setStatus'], fuente: FUENTES.perfil, certeza: 'documentado', nota: 'El campo «about» del perfil de negocio.' },
  // ── pendiente: la vía oficial lo permite, esta fachada todavía no ──────────────────────────────────────────────
  {
    id: 'grupos-api', estado: 'pendiente', fuente: FUENTES.grupos, certeza: 'documentado',
    operaciones: ['GroupController_create', 'GroupController_findOne', 'GroupController_getInviteCode', 'GroupController_revokeInviteCode', 'GroupController_removeParticipants', 'GroupController_getSettings', 'GroupController_updateSettings', 'GroupController_getMembershipRequests', 'GroupController_approveMembershipRequests', 'GroupController_rejectMembershipRequests', 'SessionController_getGroups'],
    nota: 'Groups API de Meta (disponible desde el 3 de febrero de 2026 para cuentas oficiales verificadas, hasta 8 participantes, se entra por liga de invitación).',
    alternativa: 'Usa la Groups API de la Cloud API con la cuenta oficial del número; esta fachada todavía no la expone.',
  },
  { id: 'grupos-nombre', estado: 'pendiente', operaciones: ['GroupController_setSubject', 'GroupController_setDescription'], fuente: FUENTES.grupos, certeza: 'sin_documentar', nota: 'La Groups API lista «actualizar la configuración del grupo»; no se verificó que cubra nombre y descripción.', alternativa: 'Usa la Groups API de la Cloud API (actualizar la configuración del grupo).' },
  { id: 'catalogo-lectura', estado: 'pendiente', operaciones: ['CatalogController_getCatalog', 'CatalogController_getProducts', 'CatalogController_getProduct'], fuente: FUENTES.plataforma, certeza: 'sin_documentar', nota: 'El catálogo vive en el Commerce Manager de Meta; no se verificó hoy su API de lectura.', alternativa: 'Lee el catálogo desde el Commerce Manager o su API; los mensajes de producto sí salen por la fachada.' },
  { id: 'medio-entrante', estado: 'pendiente', operaciones: ['MessageController_getChatMedia'], fuente: FUENTES.apiMensajes, certeza: 'sin_documentar', nota: 'Los medios entrantes se bajan de Meta por su id; la fachada todavía no los guarda.', alternativa: 'Baja el medio con su id de la Cloud API mientras su liga siga vigente.' },
  { id: 'foto-perfil', estado: 'pendiente', operaciones: ['ProfileController_setPicture'], fuente: FUENTES.perfil, certeza: 'documentado', nota: 'El perfil de negocio acepta profile_picture_handle (subida resumible); la fachada todavía no sube.', alternativa: 'Sube la foto con la subida resumible de Meta y ponla en el perfil de negocio.' },
  // ── imposible por la vía oficial ─────────────────────────────────────────────────────────────────────────────
  { id: 'sin-qr', estado: 'imposible', operaciones: ['SessionController_getQRCode', 'SessionController_requestPairingCode'], fuente: FUENTES.coexistencia, certeza: 'documentado', nota: 'La vía oficial no vincula un dispositivo con QR ni con código de emparejamiento.', alternativa: 'Abre la liga de alta (Embedded Signup) que da POST /sessions/{id}/start; viene también en este error.' },
  { id: 'presencia', estado: 'imposible', operaciones: ['SessionController_getPresence', 'SessionController_subscribeToPresence', 'SessionController_setOnlinePresence'], fuente: FUENTES.apiMensajes, certeza: 'sin_documentar', nota: 'La Cloud API no expone ni publica presencia (en línea, escribiendo de la otra parte).', alternativa: 'Usa el indicador de escritura (POST /chats/typing) junto con el leído.' },
  { id: 'estado-de-chat', estado: 'imposible', operaciones: ['SessionController_archiveChat', 'SessionController_pinChat', 'SessionController_muteChat', 'SessionController_markChatUnread', 'SessionController_deleteChat', 'SessionController_clearChatMessages'], fuente: FUENTES.apiMensajes, certeza: 'sin_documentar', nota: 'Archivar, fijar, silenciar o borrar un chat es estado de la app de un dispositivo; la Cloud API no tiene lista de chats.', alternativa: CRM },
  { id: 'historial-vivo', estado: 'imposible', operaciones: ['MessageController_getChatHistory'], fuente: FUENTES.coexistencia, certeza: 'documentado', nota: 'La Cloud API no lee el historial de un chat. Al dar de alta un número de la app Business, Meta comparte hasta 180 días de historial una sola vez.', alternativa: 'Pide el historial de coexistencia al dar de alta el número; después, GET /messages trae lo que pasó por la fachada.' },
  { id: 'editar-borrar', estado: 'imposible', operaciones: ['MessageController_deleteMessage', 'MessageController_edit'], fuente: FUENTES.apiMensajes, certeza: 'sin_documentar', nota: 'La Cloud API informa las ediciones y borrados de la persona, pero no edita ni borra lo que manda el negocio.', alternativa: 'Manda la corrección como un mensaje nuevo.' },
  { id: 'reenviar', estado: 'imposible', operaciones: ['MessageController_forward'], fuente: FUENTES.apiMensajes, certeza: 'sin_documentar', nota: 'No hay reenvío en la Cloud API.', alternativa: 'Manda el contenido como mensaje nuevo (texto, o el medio por su url).' },
  { id: 'fijar-destacar', estado: 'imposible', operaciones: ['MessageController_pinMessage', 'MessageController_unpinMessage', 'MessageController_starMessage'], fuente: FUENTES.apiMensajes, certeza: 'sin_documentar', nota: 'Fijar y destacar mensajes son de la app de un dispositivo.', alternativa: CRM },
  { id: 'encuestas', estado: 'imposible', operaciones: ['MessageController_sendPoll', 'MessageController_votePoll'], fuente: FUENTES.mensajes, certeza: 'sin_documentar', nota: 'La Cloud API no manda encuestas nativas.', alternativa: 'Usa botones de respuesta (hasta 3), una lista (hasta 10 filas) o un Flow.' },
  { id: 'botones-ajenos', estado: 'imposible', operaciones: ['MessageController_clickButton'], fuente: FUENTES.apiMensajes, certeza: 'sin_documentar', nota: 'Un número de negocio no toca botones de los mensajes de otro negocio.', alternativa: 'Ninguna por la vía oficial: es automatizar a un usuario.' },
  { id: 'verificar-numero', estado: 'imposible', operaciones: ['ContactController_checkNumber'], fuente: FUENTES.apiMensajes, certeza: 'sin_documentar', nota: 'La Cloud API no consulta si un número tiene WhatsApp.', alternativa: 'Manda una plantilla y lee su estado: el error 131026 dice que el número no puede recibirla.' },
  { id: 'fotos-de-contacto', estado: 'imposible', operaciones: ['ContactController_getProfilePicture', 'ContactController_getProfilePictures'], fuente: FUENTES.apiMensajes, certeza: 'sin_documentar', nota: 'La Cloud API no da la foto de perfil de la persona.', alternativa: 'Ninguna por la vía oficial.' },
  { id: 'resolver-lid', estado: 'imposible', operaciones: ['ContactController_resolvePhone'], fuente: FUENTES.bloqueo, certeza: 'documentado', nota: 'Un id con alcance de negocio (BSUID) no se convierte en teléfono: es su propósito.', alternativa: 'Trabaja con el BSUID; el teléfono llega solo si la persona lo comparte.' },
  { id: 'libreta', estado: 'imposible', operaciones: ['ContactController_upsertContact', 'ContactController_deleteContact'], fuente: FUENTES.apiMensajes, certeza: 'sin_documentar', nota: 'No hay libreta de contactos en la Cloud API.', alternativa: CRM },
  {
    id: 'grupos-imposible', estado: 'imposible', fuente: FUENTES.grupos, certeza: 'sin_documentar',
    operaciones: ['GroupController_addParticipants', 'GroupController_promoteParticipants', 'GroupController_demoteParticipants', 'GroupController_join', 'GroupController_joinInfo', 'GroupController_leave', 'GroupController_setPicture', 'GroupController_deletePicture', 'GroupController_getPicture'],
    nota: 'La Groups API no agrega personas directo (entran por liga de invitación) ni documenta administradores, unirse a grupos ajenos, salir o la foto del grupo.',
    alternativa: 'Manda la liga de invitación del grupo en su plantilla; para quitar a alguien, la Groups API sí lo hace.',
  },
  { id: 'canales', estado: 'imposible', etiqueta: 'channels', fuente: FUENTES.plataforma, certeza: 'sin_documentar', nota: 'Los Canales de WhatsApp no están en la Cloud API.', alternativa: 'Publica el canal desde la app de WhatsApp.' },
  { id: 'estados', estado: 'imposible', etiqueta: 'status', fuente: FUENTES.plataforma, certeza: 'sin_documentar', nota: 'Los Estados (historias) no están en la Cloud API.', alternativa: 'Publícalos desde la app de WhatsApp Business.' },
  { id: 'etiquetas', estado: 'imposible', etiqueta: 'labels', fuente: FUENTES.plataforma, certeza: 'sin_documentar', nota: 'Las etiquetas son de la app WhatsApp Business.', alternativa: CRM },
  { id: 'llamadas', estado: 'imposible', etiqueta: 'calls', fuente: FUENTES.llamadas, certeza: 'sin_documentar', nota: 'La Calling API de Meta existe (con permiso previo de la persona), pero no documenta ligas de llamada ni rechazar por la Graph API.', alternativa: 'Usa la Calling API de Meta: permiso de llamada y llamadas iniciadas por el negocio.' },
  { id: 'nombre-visible', estado: 'imposible', operaciones: ['ProfileController_setName'], fuente: FUENTES.numeros, certeza: 'documentado', nota: 'El nombre visible del número pasa por revisión de Meta.', alternativa: 'Cámbialo en el Administrador de WhatsApp y espera la revisión.' },
  { id: 'borrar-foto', estado: 'imposible', operaciones: ['ProfileController_deletePicture'], fuente: FUENTES.perfil, certeza: 'sin_documentar', nota: 'El perfil de negocio no documenta borrar la foto.', alternativa: 'Pon otra foto con profile_picture_handle.' },
  // ── fuera: administración propia de OpenWA ───────────────────────────────────────────────────────────────────
  { id: 'infra', estado: 'fuera', etiqueta: 'infrastructure', fuente: FUENTES.apiOpenWA, certeza: 'documentado', nota: 'Configuración, motores, respaldo y reinicio de la instancia de OpenWA.', alternativa: 'La infraestructura del BSP es del laboratorio, no del cliente.' },
  { id: 'plugins', estado: 'fuera', etiqueta: 'plugins', fuente: FUENTES.apiOpenWA, certeza: 'documentado', nota: 'El sistema de plugins de OpenWA.', alternativa: 'Las integraciones (Chatwoot, Typebot, n8n) llaman a esta API como llamaban a OpenWA.' },
  { id: 'integracion', estado: 'fuera', etiqueta: 'integration', fuente: FUENTES.apiOpenWA, certeza: 'documentado', nota: 'El Integration Fabric de OpenWA.', alternativa: 'Las integraciones llaman a esta API y reciben sus webhooks.' },
  { id: 'automatizacion', estado: 'fuera', etiqueta: 'automation', fuente: FUENTES.apiOpenWA, certeza: 'documentado', nota: 'Las reglas de autorrespuesta de OpenWA.', alternativa: 'El vendedor de ventas-whatsapp contesta con sus reglas, su frontera y su ventana.' },
  { id: 'medios-conversion', estado: 'fuera', etiqueta: 'media', fuente: FUENTES.apiMensajes, certeza: 'documentado', nota: 'La conversión de medios de OpenWA.', alternativa: 'Sube los medios en un formato que la Cloud API acepte.' },
  { id: 'tableros', estado: 'fuera', operaciones: ['StatsController_getOverview', 'StatsController_getMessageStats', 'StatsController_getSessionStats', 'SessionController_getStats', 'AuditController_findAll', 'SettingsController_get', 'MetricsController_scrape', 'SearchController_search'], fuente: FUENTES.apiOpenWA, certeza: 'documentado', nota: 'Estadísticas, auditoría, ajustes, métricas y búsqueda de la instancia de OpenWA.', alternativa: 'El panel de ventas-whatsapp y su contabilidad.' },
  { id: 'motor', estado: 'fuera', operaciones: ['SessionController_getConfig', 'SessionController_updateConfig', 'SessionController_getProxy', 'SessionController_updateProxy', 'SessionController_forceKill'], fuente: FUENTES.apiOpenWA, certeza: 'documentado', nota: 'Configuración del motor no oficial (reconexión, proxy de salida, matar el proceso).', alternativa: 'No hay motor que configurar: la Cloud API corre en Meta.' },
];
