/**
 * Zod para TODO lo que entra por /api/etiquetas. Estricto: una clave que no se espera es un
 * error, no un campo que se ignora.
 */
import { z } from 'zod';

const clave = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/);
const fechaIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cset82 = /^[!"%&'()*+,\-./0-9:;<=>?A-Z_a-z]+$/;

export const esquemaPerfil = z.object({
  id: clave,
  nombre: z.string().trim().min(1).max(60),
  sitio: clave,
  dpi: z.union([z.literal(203), z.literal(300), z.literal(600)]),
  anchoMm: z.number().min(20).max(170),
  altoMm: z.number().min(10).max(400),
  origenX: z.number().int().min(0).max(32000),
  origenY: z.number().int().min(0).max(32000),
  corrimientoIzq: z.number().int().min(-9999).max(9999),
  corrimientoSup: z.number().int().min(-120).max(120),
  oscuridad: z.number().int().min(-30).max(30),
  velocidad: z.number().int().min(2).max(14),
  perfilLectura: z.enum(['pistola', 'automatico']),
}).strict();

export const esquemaCategoria = z.object({
  id: clave,
  nombre: z.string().trim().min(1).max(60),
  alertaDias: z.number().int().min(0).max(3650),
  retiroDias: z.number().int().min(0).max(3650),
  minimoRecepcionDias: z.number().int().min(0).max(3650),
}).strict().refine((c) => c.retiroDias <= c.alertaDias, { message: 'los días de retiro no pueden pasar a los de alerta' });

export const esquemaSitio = z.object({
  clave,
  nombre: z.string().trim().min(1).max(60),
  tipo: z.enum(['cedis', 'sucursal']),
  agente: z.string().url().max(200).optional(),
}).strict();

export const esquemaRollo = z.object({
  id: clave,
  nombre: z.string().trim().min(1).max(80),
  tecnologia: z.enum(['termica-directa', 'transferencia-termica']),
  anchoMm: z.number().min(10).max(170),
  altoMm: z.number().min(5).max(400),
  etiquetasPorRollo: z.number().int().min(1).max(100_000),
  costoPaquete: z.number().min(0).max(1_000_000),
  rollosPorPaquete: z.number().int().min(1).max(1000),
  fuente: z.string().url().max(400).optional(),
  fechaPrecio: fechaIso.optional(),
}).strict();

const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const esquemaAccion = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('catalogo-plan'), archivo: z.string().min(1).max(200), huella: z.string().max(100), registros: z.array(z.record(z.string().max(80), z.string().max(500))).max(5000) }).strict(),
  z.object({ accion: z.literal('catalogo-aplica'), archivo: z.string().min(1).max(200), huella: z.string().max(100), registros: z.array(z.record(z.string().max(80), z.string().max(500))).max(5000) }).strict(),
  z.object({
    accion: z.literal('config'),
    prefijoEmpresa: z.string().regex(/^\d{6,12}$/).optional(),
    prefijoInterno: z.string().regex(/^(04|02|2\d)$/).optional(),
    extensionSscc: z.number().int().min(0).max(9).optional(),
    categorias: z.array(esquemaCategoria).min(1).max(50).optional(),
    sitios: z.array(esquemaSitio).max(200).optional(),
    labelaryPermitido: z.boolean().optional(),
  }).strict(),
  z.object({ accion: z.literal('impresora'), perfil: esquemaPerfil }).strict(),
  z.object({ accion: z.literal('sscc'), sitio: clave }).strict(),
  z.object({
    accion: z.literal('etiquetado'), sitio: clave, sku: z.string().min(1).max(40), lote: z.string().min(1).max(20).regex(cset82), caducidad: fechaIso,
    cantidad: z.number().int().min(1).max(100_000), sscc: z.string().regex(/^\d{18}$/).optional(),
  }).strict(),
  z.object({ accion: z.literal('recepcion'), sitio: clave, texto: z.string().min(1).max(200) }).strict(),
  z.object({ accion: z.literal('consumo'), sitio: clave, impresora: clave, etiquetas: z.number().int().min(1).max(100_000), origen: z.enum(['impresion', 'lote', 'calibracion']) }).strict(),
  z.object({ accion: z.literal('rollo'), rollo: esquemaRollo }).strict(),
  z.object({ accion: z.literal('rollo-impresora'), impresora: clave, rollo: clave.or(z.literal('')) }).strict(),
  z.object({ accion: z.literal('presupuesto'), sitio: clave, mes, monto: z.number().min(0).max(100_000_000) }).strict(),
  z.object({ accion: z.literal('compra'), sitio: clave, rollo: clave, rollos: z.number().int().min(1).max(10_000), costoTotal: z.number().min(0).max(100_000_000) }).strict(),
  z.object({ accion: z.literal('ticket'), sitio: clave, impresora: clave, zpl: z.string().min(5).max(262_144), copias: z.number().int().min(1).max(500) }).strict(),
]);

export type AccionEtiquetas = z.infer<typeof esquemaAccion>;
