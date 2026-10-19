/** Lo que el servidor le pasa a las pantallas del paciente: ya formateado y sin seudónimos ni ids internos de más. */
export interface VistaAvisoUI {
  id: string;
  canal: 'correo' | 'telegram' | 'whatsapp';
  clase: 'confirmacion' | 'recordatorio_24h' | 'recordatorio_2h' | 'cancelacion' | 'newsletter';
  estado: 'programado' | 'esperando_vinculo' | 'enviando' | 'enviado' | 'entregado' | 'leido' | 'fallido' | 'cancelado' | 'incierto';
  cuando: string;
  motivo: string | null;
  accion: 'vincular_telegram' | 'vincular_whatsapp' | 'revisar_whatsapp' | 'resuscribir' | 'revisar_correo' | null;
}

/** El WhatsApp de la persona, como lo ve en «Mis citas»: nunca el número entero, solo sus últimos 4 dígitos. */
export type VinculoWhatsappUI =
  | { estado: 'sin_vincular' }
  | { estado: 'codigo'; codigo: string; enlace: string; expira: string }
  | { estado: 'pendiente'; ultimos4: string | null; coincideCelular: boolean }
  | { estado: 'vinculado'; ultimos4: string };

export interface VistaCitaUI {
  id: string;
  servicio: string;
  cuando: string;
  puedeCambiar: boolean;
  avisos: VistaAvisoUI[];
}
