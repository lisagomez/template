/** Lo que el servidor le pasa a las pantallas del paciente: ya formateado y sin seudónimos ni ids internos de más. */
export interface VistaAvisoUI {
  id: string;
  canal: 'correo' | 'telegram';
  clase: 'confirmacion' | 'recordatorio_24h' | 'recordatorio_2h' | 'cancelacion' | 'newsletter';
  estado: 'programado' | 'esperando_vinculo' | 'enviando' | 'entregado' | 'fallido' | 'cancelado' | 'incierto';
  cuando: string;
  motivo: string | null;
  accion: 'vincular_telegram' | 'resuscribir' | 'revisar_correo' | null;
}

export interface VistaCitaUI {
  id: string;
  servicio: string;
  cuando: string;
  puedeCambiar: boolean;
  avisos: VistaAvisoUI[];
}
