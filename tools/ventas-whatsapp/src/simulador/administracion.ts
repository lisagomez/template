/**
 * Lo que Meta administra además de los mensajes, simulado: plantillas de la WABA con revisión (PENDING → APPROVED o
 * REJECTED, con su webhook `message_template_status_update`), la lista de bloqueo del número (Block Users API) y el
 * campo «about» del perfil de negocio. Implementa la misma `AdministracionGraph` que el adaptador HTTP real.
 *
 * Reglas de la documentación consultada el 2026-10-20: solo se bloquea a quien escribió en las últimas 24 h (si no,
 * 131047); hasta 1,000 usuarios por petición y 64,000 en la lista (139101); un bloqueado no escribe al negocio y el
 * negocio no le escribe. El nombre de plantilla va en minúsculas, dígitos y guion bajo. Lo que la documentación no
 * dice va marcado «SUPUESTO».
 */
import { normalizaWaId, type Reloj } from '../comun/base.js';
import type { AdministracionGraph, PlantillaMeta } from '../meta/administracion.js';
import type { CategoriaPlantilla } from '../meta/mensajes.js';
import { VENTANA_ATENCION, type Ventanas } from '../meta/tarifas.js';
import type { NumeroSimulado } from './meta.js';

export interface AccesoMeta {
  reloj: Reloj;
  numeros: Map<string, NumeroSimulado>;
  ventanas: Map<string, Ventanas>;
  bloqueos: Set<string>;
  emite(wabaId: string, campo: string, valor: Record<string, unknown>): void;
}

const CATEGORIAS = new Set<CategoriaPlantilla>(['marketing', 'utility', 'authentication']);
const MAX_POR_PETICION = 1000;
const MAX_LISTA = 64_000;
const llaveDe = (phoneNumberId: string, waId: string) => `${phoneNumberId}|${normalizaWaId(waId)}`;

export type AdministracionSimulada = AdministracionGraph & {
  /** La palanca del laboratorio: Meta termina de revisar una plantilla. */
  revisa(wabaId: string, nombre: string, aprobada: boolean, motivo?: string): void;
  acerca(phoneNumberId: string): string | undefined;
};

export function creaAdministracionSimulada(a: AccesoMeta): AdministracionSimulada {
  const plantillas = new Map<string, Map<string, PlantillaMeta>>();
  const acercaDe = new Map<string, string>();
  let secuencia = 0;
  const deWaba = (wabaId: string) => [...a.numeros.values()].filter((n) => n.wabaId === wabaId);
  const deLaWaba = (wabaId: string) => plantillas.get(wabaId) ?? plantillas.set(wabaId, new Map()).get(wabaId)!;
  const mal = (codigo: number, error: string) => ({ ok: false as const, codigo, error });

  function publica(wabaId: string, p: PlantillaMeta) {
    for (const n of deWaba(wabaId)) {
      if (p.estado === 'APPROVED') n.plantillas[p.nombre] = p.categoria;
      else delete n.plantillas[p.nombre];
    }
  }

  return {
    async creaPlantilla(wabaId, p) {
      if (!deWaba(wabaId).length) return mal(100, '(#100) WABA desconocida');
      if (!/^[a-z0-9_]{1,512}$/.test(p.nombre)) return mal(100, '(#100) name: solo minúsculas, dígitos y guion bajo');
      if (!CATEGORIAS.has(p.categoria)) return mal(100, '(#100) category inválida');
      if (!p.cuerpo.trim() || [...p.cuerpo].length > 1024) return mal(100, '(#100) el cuerpo va de 1 a 1024 caracteres');
      if ([...(p.encabezado ?? '')].length > 60 || [...(p.pie ?? '')].length > 60) return mal(100, '(#100) el encabezado y el pie de texto van hasta 60 caracteres');
      const variables = new Set(p.cuerpo.match(/\{\{\d+\}\}/g) ?? []).size;
      if (variables && (p.ejemplos?.length ?? 0) !== variables) return mal(100, '(#100) cada variable del cuerpo lleva su ejemplo');
      const todas = deLaWaba(wabaId);
      // SUPUESTO: el código exacto del nombre duplicado no se verificó; se contesta 100.
      if (todas.has(`${p.nombre}|${p.idioma}`)) return mal(100, '(#100) ya existe una plantilla con ese nombre e idioma');
      const nueva: PlantillaMeta = { id: `tpl_${(++secuencia).toString().padStart(6, '0')}`, nombre: p.nombre, idioma: p.idioma, categoria: p.categoria, cuerpo: p.cuerpo, estado: 'PENDING' };
      todas.set(`${p.nombre}|${p.idioma}`, nueva);
      return { ok: true, id: nueva.id, estado: nueva.estado };
    },
    async plantillas(wabaId) { return [...deLaWaba(wabaId).values()].map((p) => ({ ...p })); },
    async borraPlantilla(wabaId, nombre) {
      const todas = deLaWaba(wabaId);
      const de = [...todas.entries()].filter(([, p]) => p.nombre === nombre);
      if (!de.length) return mal(100, '(#100) la plantilla no existe');
      for (const [llave, p] of de) { todas.delete(llave); publica(wabaId, { ...p, estado: 'REJECTED' }); }
      return { ok: true };
    },
    async bloquea(phoneNumberId, waIds, bloquear) {
      if (!a.numeros.has(phoneNumberId)) return mal(100, '(#100) phone_number_id desconocido');
      if (waIds.length > MAX_POR_PETICION) return mal(130429, '(#130429) demasiados usuarios en una petición');
      const delNumero = () => [...a.bloqueos].filter((b) => b.startsWith(`${phoneNumberId}|`)).length;
      for (const u of waIds) {
        const llave = llaveDe(phoneNumberId, u);
        if (!bloquear) { a.bloqueos.delete(llave); continue; }
        const ultimo = a.ventanas.get(llave)?.ultimoDelCliente;
        if (ultimo === undefined || a.reloj() - ultimo > VENTANA_ATENCION) return mal(131047, '(#131047) solo se bloquea a quien escribió en las últimas 24 h');
        if (!a.bloqueos.has(llave) && delNumero() >= MAX_LISTA) return mal(139101, '(#139101) la lista de bloqueo está llena');
        a.bloqueos.add(llave);
      }
      return { ok: true, usuarios: waIds.map(normalizaWaId) };
    },
    async bloqueados(phoneNumberId) {
      return [...a.bloqueos].filter((b) => b.startsWith(`${phoneNumberId}|`)).map((b) => b.slice(phoneNumberId.length + 1));
    },
    async actualizaPerfil(phoneNumberId, campos) {
      if (!a.numeros.has(phoneNumberId)) return mal(100, '(#100) phone_number_id desconocido');
      if (campos.about !== undefined) {
        if (!campos.about.trim() || [...campos.about].length > 139) return mal(100, '(#100) about va de 1 a 139 caracteres');
        acercaDe.set(phoneNumberId, campos.about);
      }
      return { ok: true };
    },
    revisa(wabaId, nombre, aprobada, motivo) {
      for (const p of deLaWaba(wabaId).values()) {
        if (p.nombre !== nombre) continue;
        p.estado = aprobada ? 'APPROVED' : 'REJECTED';
        publica(wabaId, p);
        a.emite(wabaId, 'message_template_status_update', { event: p.estado, message_template_id: p.id, message_template_name: p.nombre, message_template_language: p.idioma, reason: aprobada ? 'NONE' : motivo ?? 'INVALID_FORMAT' });
      }
    },
    acerca: (phoneNumberId) => acercaDe.get(phoneNumberId),
  };
}
