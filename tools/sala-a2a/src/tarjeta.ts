/**
 * La capacidad de la sala como agente: `publicar-en-canal`, con sus fronteras negativas literales.
 * Superficie opaca: exactamente `{card, rpc, /health}` más el REST autenticado de la app, sin
 * `/docs` ni `/openapi.json`. La tarjeta la arma la app con los tipos del SDK A2A pineado.
 */
export const RUTAS_PERMITIDAS = ['/.well-known/agent-card.json', '/rpc', '/health'] as const

export const FRONTERAS_SALA = [
  'no aprueba: una aprobación es una fila que firma un humano',
  'no ejecuta tareas: las encola para el departamento que se mencionó',
  'no envía a canales externos',
  'no decide si un artefacto es válido: eso es del supervisor y del humano',
] as const

export const CAPACIDAD_SALA = {
  id: 'publicar-en-canal',
  name: 'Publicar en un canal de la sala',
  description: `Publica un mensaje o abre un hilo en un canal del tenant de la tarea. ${FRONTERAS_SALA.join('; ')}.`,
  tags: ['sala', 'canal', 'mensajes'],
} as const

/** ¿Una ruta pertenece a la superficie opaca? Cualquier otra, 404. */
export const rutaPermitida = (ruta: string): boolean => (RUTAS_PERMITIDAS as readonly string[]).includes(ruta)
