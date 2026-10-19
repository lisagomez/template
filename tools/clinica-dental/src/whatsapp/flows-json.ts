/**
 * Las DEFINICIONES de los tres Flows del portal (Flow JSON 7.1, Data API 3.0, con endpoint): son formularios que
 * corren dentro de WhatsApp y cuya ultima pantalla es la CONFIRMACION de la persona. Se publican en Meta tal cual
 * (el simulador las valida igual). Cambiarlas es cambiar lo que el paciente confirma: van en el CDC con las plantillas.
 *
 *   agendar:     SERVICIO → DIA → HORA → CONFIRMA («Confirmar cita»)
 *   reprogramar: CITA → DIA → HORA → CONFIRMA («Confirmar cambio»)          (CITA se salta si el boton ya trae la cita)
 *   cancelar:    CITA → CANCELA (casilla «Sí, quiero cancelar esta cita» + «Cancelar cita»)
 */
import type { FlujoWa } from './tipos.js';

export const VERSION_FLOWS = 'whatsapp-flows-1 (2026-10-19)';

type Json = Record<string, unknown>;
const opciones = (ejemplo: string) => ({ type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' } } }, __example__: [{ id: 'x', title: ejemplo }] });
const texto = (ejemplo = '') => ({ type: 'string', __example__: ejemplo });
const avanza = (payload: Json, etiqueta: string) => ({ type: 'Footer', label: etiqueta, 'on-click-action': { name: 'data_exchange', payload } });
const aviso = { type: 'TextBody', text: '${data.error}', visible: '${data.hay_error}' };
const hayError = { type: 'boolean', __example__: false };

function pantalla(id: string, titulo: string, data: Json, hijos: Json[], terminal = false): Json {
  return { id, title: titulo, ...(terminal ? { terminal: true } : {}), data, layout: { type: 'SingleColumnLayout', children: hijos } };
}

const DIA = pantalla('DIA', 'Elige el día', { servicio: texto('limpieza'), cita: texto(''), resumen: texto('Limpieza dental · 45 min'), dias: opciones('mar 21 oct'), error: texto(), hay_error: hayError }, [
  aviso,
  { type: 'TextBody', text: '${data.resumen}' },
  { type: 'Dropdown', name: 'dia', label: 'Día', required: true, 'data-source': '${data.dias}' },
  avanza({ servicio: '${data.servicio}', cita: '${data.cita}', dia: '${form.dia}' }, 'Ver horarios'),
]);

const HORA = pantalla('HORA', 'Elige la hora', { servicio: texto('limpieza'), cita: texto(''), resumen: texto('mar 21 oct'), horas: opciones('10:00'), error: texto(), hay_error: hayError }, [
  aviso,
  { type: 'TextBody', text: '${data.resumen}' },
  { type: 'Dropdown', name: 'hora', label: 'Hora', required: true, 'data-source': '${data.horas}' },
  avanza({ servicio: '${data.servicio}', cita: '${data.cita}', hora: '${form.hora}' }, 'Continuar'),
]);

const confirma = (etiqueta: string) => pantalla('CONFIRMA', 'Confirma', { servicio: texto('limpieza'), cita: texto(''), hora: texto('2026-10-21T16:00:00.000Z'), resumen: texto('Limpieza el martes 21 a las 10:00'), error: texto(), hay_error: hayError }, [
  aviso,
  { type: 'TextBody', text: '${data.resumen}' },
  avanza({ servicio: '${data.servicio}', cita: '${data.cita}', hora: '${data.hora}', confirma: true }, etiqueta),
], true);

const CITA = (siguiente: string) => pantalla('CITA', 'Tus citas', { citas: opciones('Limpieza · mar 21 oct 10:00'), error: texto(), hay_error: hayError }, [
  aviso,
  { type: 'RadioButtonsGroup', name: 'cita', label: `¿Qué cita quieres ${siguiente}?`, required: true, 'data-source': '${data.citas}' },
  avanza({ cita: '${form.cita}' }, 'Continuar'),
]);

const CANCELA = pantalla('CANCELA', 'Cancelar cita', { cita: texto('cit_x'), resumen: texto('Limpieza el martes 21 a las 10:00'), error: texto(), hay_error: hayError }, [
  aviso,
  { type: 'TextBody', text: '${data.resumen}' },
  { type: 'TextBody', text: 'Al cancelar, el horario se libera y otra persona puede tomarlo.' },
  { type: 'OptIn', name: 'seguro', label: 'Sí, quiero cancelar esta cita', required: true },
  avanza({ cita: '${data.cita}', seguro: '${form.seguro}' }, 'Cancelar cita'),
], true);

const SERVICIO = pantalla('SERVICIO', 'Agendar cita', { servicios: opciones('Limpieza dental'), error: texto(), hay_error: hayError }, [
  aviso,
  { type: 'RadioButtonsGroup', name: 'servicio', label: '¿Qué necesitas?', required: true, 'data-source': '${data.servicios}' },
  avanza({ servicio: '${form.servicio}' }, 'Continuar'),
]);

const flow = (routing: Record<string, string[]>, screens: Json[]): Json => ({ version: '7.1', data_api_version: '3.0', routing_model: routing, screens });

export const FLOWS_WA: Readonly<Record<FlujoWa, Json>> = {
  agendar: flow({ SERVICIO: ['DIA'], DIA: ['HORA'], HORA: ['CONFIRMA'], CONFIRMA: [] }, [SERVICIO, DIA, HORA, confirma('Confirmar cita')]),
  reprogramar: flow({ CITA: ['DIA'], DIA: ['HORA'], HORA: ['CONFIRMA'], CONFIRMA: [] }, [CITA('cambiar'), DIA, HORA, confirma('Confirmar cambio')]),
  cancelar: flow({ CITA: ['CANCELA'], CANCELA: [] }, [CITA('cancelar'), CANCELA]),
};
