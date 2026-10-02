/**
 * Adaptador de SOLO LECTURA al ERP de la casa (ERP-8: el copiloto analítico es interfaz de
 * pregunta). El ERP ya guarda el XML timbrado de cada comprobante en `erp.cfd_timbre`, así que
 * el adaptador no traduce tablas: entrega esos XML al MISMO camino que los archivos, y los
 * cancelados salen de su estado.
 *
 * LISTO Y NO CORRIDO contra producción en este laboratorio. Se prueba con un fixture. Al
 * conectarlo: credencial de solo lectura (`rol_bi` o `erp_lector`), y la sesión se fuerza a
 * `read_only` porque el pooler ignora `PGOPTIONS`. Ninguna sentencia que no sea SELECT sale de aquí.
 */
import { z } from 'zod';
import { sha256 } from '../comun/canonico.js';
import type { FuentesCrudas } from './ingesta.js';

export const SENTENCIAS_ERP = {
  soloLectura: 'set default_transaction_read_only = on',
  timbres: "select uuid_fiscal::text as uuid, estado, xml from erp.cfd_timbre where cliente_id = $1 and estado in ('timbrado', 'cancelado') and xml is not null order by uuid_fiscal",
} as const;

/** Lo único que se admite: SELECT, o fijar la sesión en solo lectura. */
export function esSoloLectura(sql: string): boolean {
  const s = sql.trim().toLowerCase().replace(/\s+/g, ' ');
  if (s.includes(';')) return false;
  return s.startsWith('select ') || s === 'set default_transaction_read_only = on' || s === 'set transaction read only';
}

const fila = z.object({ uuid: z.string().nullable(), estado: z.enum(['timbrado', 'cancelado']), xml: z.string().min(1) });
export type FilaDeTimbre = z.infer<typeof fila>;

export type Consulta = (sql: string, parametros: readonly unknown[]) => Promise<readonly unknown[]>;

/** Filas de `cfd_timbre` → fuentes crudas. Los cancelados entran como documentos y como lista. */
export function fuentesDesdeErp(filas: readonly FilaDeTimbre[], catalogo?: string): FuentesCrudas {
  const cancelados = filas.filter((f) => f.estado === 'cancelado' && f.uuid).map((f) => f.uuid!.toUpperCase());
  return {
    documentos: filas.map((f) => ({ nombre: `erp-${f.uuid ?? sha256(f.xml).slice(0, 12)}.xml`, texto: f.xml })),
    cancelados: ['uuid', ...cancelados].join('\n'),
    ...(catalogo !== undefined ? { catalogo } : {}),
  };
}

/** Lee del ERP con la consulta que inyecta el proyecto. Rechaza cualquier sentencia que no sea de lectura. */
export async function leeErpSoloLectura(consulta: Consulta, tenant: string, catalogo?: string): Promise<FuentesCrudas> {
  const lee: Consulta = (sql, p) => {
    if (!esSoloLectura(sql)) throw new Error('el adaptador del ERP solo lee: sentencia rechazada');
    return consulta(sql, p);
  };
  await lee(SENTENCIAS_ERP.soloLectura, []);
  const crudas = await lee(SENTENCIAS_ERP.timbres, [tenant]);
  const filas = crudas.map((c) => fila.parse(c));
  return fuentesDesdeErp(filas, catalogo);
}
