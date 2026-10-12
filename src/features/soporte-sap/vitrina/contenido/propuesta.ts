/**
 * Lo que la vitrina y el deck afirman del producto, en un solo lugar. Ninguna cifra inventada: lo medido dice dónde se
 * midió (el laboratorio, con datos sintéticos) y su fuente; lo que no está decidido dice «por decidir» y quién decide.
 * Fuentes: `src/features/soporte-sap/BUSINESS_LOGIC.md`, `productos/soporte-sap.json` y la AISIA.
 */
export const NO_HACE: ReadonlyArray<{ readonly que: string; readonly porque: string }> = [
  { que: 'No se conecta a tu SAP ni guarda sus credenciales', porque: 'Implementa contra un simulador; llevar la solución al SAP del cliente lo hace una persona con su propio acceso (D6).' },
  { que: 'No aprueba nada solo', porque: 'Ni el agente ni el chat escriben una aprobación: es una fila con el nombre de una persona.' },
  { que: 'No manda tickets, chat ni documentos a un modelo externo', porque: 'Lo crudo solo iría a un modelo autohospedado; hoy no hay modelo de lenguaje (D7).' },
  { que: 'No le enseña al laboratorio lo que no escalas', porque: 'Y de las métricas, solo grupos de 3 clientes o más (DP-3, D14).' },
  { que: 'No promete disponibilidad ni RPO/RTO', porque: 'Hasta probar una restauración (GATE 3) son desconocidos, no una cifra bonita.' },
  { que: 'No pone precios', porque: 'El precio y la forma de cobro los decide el plan comercial; hoy dicen «por decidir».' },
]

export const POR_DECIDIR: ReadonlyArray<{ readonly que: string; readonly quien: string }> = [
  { que: 'El precio y la forma de cobro (por tier, bolsa de horas o por ticket)', quien: 'El laboratorio, con su plan comercial (ERP-7, D5).' },
  { que: 'La disponibilidad, el RPO y el RTO', quien: 'GATE 3: contratar el servidor y el respaldo y probar una restauración.' },
  { que: 'El plazo de respuesta del laboratorio a lo escalado', quien: 'Se mide desde hoy (D13); la cifra se compromete al cerrar GATE 3.' },
  { que: 'La métrica principal de éxito', quien: 'Sale de la primera consultora real.' },
  { que: 'Cuánto se guardan los originales y la gracia de salida', quien: 'El contrato de cada cliente; mientras no lo diga, no se borra nada (D8).' },
  { que: 'El texto legal y el aviso de privacidad', quien: 'Por escribir, con la transferencia a Estados Unidos del modo gestionado.' },
]

export const MEDIDO_EN_LABORATORIO: ReadonlyArray<{ readonly cifra: string; readonly que: string }> = [
  { cifra: '0 fugas', que: 'del anonimizador sobre 277 casos sintéticos, 155 de ellos con datos sembrados' },
  { cifra: '63 de 63', que: 'comprobaciones de aislamiento entre organizaciones, en verde' },
  { cifra: '11 de 11', que: 'sabotajes de la sala cazados por su suite de pruebas' },
  { cifra: 'S, M y L', que: 'restauración por cliente sin tocar a su vecino' },
]
export const FUENTE_DE_LO_MEDIDO = 'Medido en el laboratorio con datos sintéticos (BUSINESS_LOGIC.md §5). No es una medición en una consultora real.'

export const DONDE_VIVE: ReadonlyArray<{ readonly modo: string; readonly que: string; readonly decision: string }> = [
  { modo: 'Gestionado', que: 'Un proyecto propio de Supabase Pro con recuperación a un punto en el tiempo, y el servidor en AWS, los dos en us-east-1 (Virginia, Estados Unidos). El respaldo inmutable va cifrado, antes de salir, a Backblaze B2 US East.', decision: 'D10 y D12' },
  { modo: 'Despacho', que: 'En la máquina de la consultora, donde ella decida: así se queda en México si lo necesita.', decision: 'D10' },
]
