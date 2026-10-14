/** Perfiles SINTÉTICOS del laboratorio (los mismos de la siembra). Puestos, nunca personas. */
import type { PerfilOrganizacion } from '../../../../tools/sistema-integrado/dist/agentes/index.js';

export const MAQUINADOS: PerfilOrganizacion = {
  nombre: 'Maquinados del Bajío', sector: 'Metalmecánica de precisión', empleados: 45, ubicacion: 'Querétaro, Qro.',
  procesos: ['Cotización', 'Compras', 'Torneado CNC', 'Fresado CNC', 'Inspección final', 'Embarque', 'Mantenimiento'],
  productos: ['Flechas y ejes a plano', 'Bujes de bronce', 'Engranes rectos'],
  puestos: ['Director general', 'Gerente de producción', 'Operador CNC', 'Inspector de calidad', 'Comprador', 'Vendedor', 'Técnico de mantenimiento'],
  sistemasIA: [
    { nombre: 'Cotizador con chatbot', proposito: 'Responder consultas y armar cotizaciones preliminares desde los planos que suben los clientes', papel: 'usa', proveedor: 'ChatCotiza (servicio en la nube)' },
    { nombre: 'Inspección visual de piezas', proposito: 'Detectar rebabas y marcas en flechas antes del embarque', papel: 'integra', proveedor: 'VisionPieza' },
  ],
  clientesTipo: ['Proveedores automotrices Tier 2 del Bajío', 'Fabricantes de maquinaria agrícola'],
  proveedoresClave: ['Aceros del Centro', 'Tratamientos Térmicos Querétaro', 'ChatCotiza (IA en la nube)', 'VisionPieza (IA de inspección)'],
  notas: 'Maquila sobre planos del cliente: no diseña producto. Tolerancias típicas de ±0.01 mm.',
};

export const PANIFICADORA: PerfilOrganizacion = {
  nombre: 'Panificadora Santa Rita', sector: 'Panadería industrial', empleados: 18, ubicacion: 'Puebla, Pue.',
  procesos: ['Recepción de harinas', 'Amasado y horneado', 'Empaque', 'Reparto'], productos: ['Pan de caja', 'Bolillo', 'Conchas'],
  puestos: ['Dueña', 'Maestro panadero', 'Ayudante de horno', 'Repartidor'], sistemasIA: [],
  clientesTipo: ['Tiendas de abarrotes', 'Cafeterías'], proveedoresClave: ['Molino La Estrella (harinas)', 'Empaques Angelópolis'],
};

export const CLINICA: PerfilOrganizacion = {
  nombre: 'Clínica Dental Sonrisa', sector: 'Salud dental', empleados: 12, ubicacion: 'Monterrey, N.L.',
  procesos: ['Agenda', 'Consulta', 'Esterilización', 'Cobranza'], productos: ['Limpieza dental', 'Ortodoncia', 'Resinas'],
  puestos: ['Directora', 'Odontólogo', 'Asistente dental', 'Recepcionista'],
  sistemasIA: [{ nombre: 'Asistente de agenda', proposito: 'Sugerir horarios y recordar citas a pacientes', papel: 'usa', proveedor: 'Proveedor de agenda en la nube' }],
  clientesTipo: ['Pacientes particulares', 'Empresas con convenio'], proveedoresClave: ['Depósito dental regional', 'Proveedor de agenda en la nube'],
};

export const CASA: PerfilOrganizacion = {
  nombre: 'Sistema Integrado ISO (la casa)', sector: 'Software para sistemas de gestión', empleados: 3, ubicacion: 'Laboratorio del template',
  procesos: ['Desarrollo de la app', 'Operación de agentes', 'Soporte a pymes y consultores'],
  productos: ['App de sistema integrado ISO 9001 + ISO/IEC 42001'], puestos: ['Laboratorio (dirección)', 'Desarrollo', 'Soporte'],
  sistemasIA: ['Diagnóstico', 'Contexto', 'Riesgos e IA', 'Documental', 'Capacitación', 'Proveedores', 'KPIs', 'Auditoría', 'Portafolio'].map((n) => ({
    nombre: `Agente ${n}`, proposito: `Propone ${n.toLowerCase()} para pymes a partir del catálogo propio; una persona aprueba`, papel: 'desarrolla', proveedor: 'Modelo por OpenRouter, pineado en routing-modelos.json',
  })),
  clientesTipo: ['Pymes mexicanas', 'Consultores de sistemas de gestión'], proveedoresClave: ['OpenRouter (proveedor de modelos)', 'Supabase (base de datos)'],
  notas: 'Los agentes solo proponen; el avance y las puertas los calcula un motor determinista; los datos de clientes se minimizan antes de salir hacia el proveedor del modelo.',
};

/** Perfil casi vacío: trampa del documento genérico. */
export const VACIA: PerfilOrganizacion = {
  nombre: 'Empresa Demo', sector: '', empleados: 10, ubicacion: '', procesos: [], productos: [], puestos: [], sistemasIA: [],
};
