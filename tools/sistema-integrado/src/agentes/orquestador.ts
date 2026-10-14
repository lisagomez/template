/**
 * EL ORQUESTADOR — determinista. Lee el motor y dice qué falta, a quién delegarlo y qué está vencido. No usa LLM y no
 * cierra nada: cerrar una puerta es de la persona con el rol (`autorizaCierre`).
 */
import { CATALOGO, requisito, type Catalogo, type Fase } from '../catalogo/index.js';
import { faseActual, puerta, type EstadoProyecto, type Puerta } from '../motor/index.js';
import type { AgenteId } from './tipos.js';

/** A qué agente conviene delegar un requisito pendiente. Regla fija y legible. */
export function agenteSugerido(id: string): AgenteId {
  const r = requisito(id);
  if (!r) return 'documental';
  if (r.familia === 'A') return /^SGI-A-5\./.test(id) ? 'riesgos' : /^SGI-A-10\.3/.test(id) ? 'proveedores' : 'documental';
  if (/^SGI-(C|Q)-6\.2-/.test(id)) return 'kpis';
  if (r.fase === 1) return /-4\.3-/.test(id) ? 'documental' : 'contexto';
  if (r.fase === 3) return 'riesgos';
  if (/^SGI-C-7\.[23]-|^SGI-Q-7\.3-/.test(id)) return 'capacitacion';
  if (/^SGI-Q-8\.4-/.test(id)) return 'proveedores';
  if (/^SGI-C-9\.1-/.test(id)) return 'kpis';
  if (/^SGI-C-9\.2-/.test(id) || r.fase === 7) return 'auditoria';
  return 'documental';
}

export interface TareaPlan { readonly fase: Fase; readonly requisito: string; readonly tema: string; readonly agente: AgenteId; readonly motivo: string }
export interface TareaConFecha { readonly titulo: string; readonly vence: string; readonly hecha: boolean; readonly requisitos?: readonly string[] }
export interface Recordatorio { readonly titulo: string; readonly vence: string; readonly estado: 'vencida' | 'por-vencer' }

export interface Plan {
  readonly fase: Fase;
  readonly puerta: Puerta;
  readonly tareas: readonly TareaPlan[];
  readonly recordatorios: readonly Recordatorio[];
}

/** Plan de la fase actual. `hoy` se inyecta (AAAA-MM-DD): sin reloj escondido. */
export function planDeTareas(estado: EstadoProyecto, tareas: readonly TareaConFecha[], hoy: string, c: Catalogo = CATALOGO): Plan {
  const fase = faseActual(estado);
  const p = puerta(estado, fase, c);
  const plan: TareaPlan[] = p.faltan.filter((f) => f.tipo === 'requisito').map((f) => {
    const r = requisito(f.id, c)!;
    return { fase, requisito: f.id, tema: r.tema, agente: agenteSugerido(f.id), motivo: f.motivo };
  });
  const [anio, mes, dia] = hoy.split('-').map(Number) as [number, number, number];
  const limite = new Date(Date.UTC(anio, mes - 1, dia + 7)).toISOString().slice(0, 10);
  const recordatorios: Recordatorio[] = tareas.filter((t) => !t.hecha && t.vence <= limite)
    .map((t) => ({ titulo: t.titulo, vence: t.vence, estado: t.vence < hoy ? 'vencida' as const : 'por-vencer' as const }))
    .sort((a, b) => a.vence.localeCompare(b.vence));
  return { fase, puerta: p, tareas: plan, recordatorios };
}
