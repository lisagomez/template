/** Los agentes de la organización (idCard, huellas, alcance, firmas y el uso de sus tres topes) y lo que vio la Puerta. */
import { conSesion } from '@/features/agora/services/datos';

export interface Tope { uso: string | number; tope: string | number; reintenta_en: number; sin_costo?: number }
export interface AgenteVisible {
  id: string; slug: string; nombre: string; iniciales: string; origen: 'interno' | 'externo'; rol: string; estado: string; version: number; vence: string | null; responsable: string
  descripcion: string; autonomia: string; sinModelo: boolean; cardUrl: string | null; cardSha256: string | null; kid: string | null; llaveSha256: string | null
  alcance: Array<{ nodo: string; skills: string[] }>; firmas: string[]
  topes: { mensajes: Tope; propuestas: Tope; gasto: Tope; org: { uso: string | number; tope: string | number } } | null
}
export interface Llamada { cuando: string; agente: string | null; metodo: string; resultado: string; motivo: string; http: number; retry: number | null }

export interface DatosDeAgentes {
  agentes: AgenteVisible[]; llamadas: Llamada[]; trasRevocar: Array<{ agente: string; revocado: string; llamadas: number }>
  porMotivo: Array<{ motivo: string; n: number }>
  yo: { propietario: boolean; administrador: boolean; aprobador: boolean }
  /** Donde viven las propuestas de topes: la primera categoría del dominio Finanzas (las decide Finanzas). */
  categoriaFinanzas: string | null
}

export async function leeAgentes() {
  return conSesion(async (s): Promise<DatosDeAgentes> => {
    const agentes = await s.consulta<AgenteVisible>(`select a.id, a.slug, a.nombre, a.iniciales, a.origen, a.rol, a.estado, a.version, a.vence::text, a.responsable, a.descripcion, a.autonomia_max autonomia,
        a.sin_modelo "sinModelo", a.card_url "cardUrl", a.card_sha256 "cardSha256", a.kid, a.llave_sha256 "llaveSha256",
        coalesce((select jsonb_agg(jsonb_build_object('nodo', n.nombre, 'skills', x.skills) order by n.orden) from agora.agente_alcance x join agora.nodo n on n.id = x.nodo_id where x.agente_id = a.id), '[]') alcance,
        coalesce((select array_agg(p.nombre || ' (' || f.rol_usado || ')') from agora.agente_firma f join agora.persona p on p.id = f.persona_id where f.agente_id = a.id and f.version = a.version), '{}') firmas,
        agora.topes_de(a.id) topes
      from agora.agente a order by a.origen desc, a.estado, a.nombre`);
    const llamadas = await s.consulta<Llamada>(`select l.cuando::text, a.nombre agente, l.metodo, l.resultado, l.motivo, l.http, l.retry_after retry from agora.a2a_llamada l left join agora.agente a on a.id = l.agente_id order by l.id desc limit 25`);
    const trasRevocar = await s.consulta<DatosDeAgentes['trasRevocar'][number]>(`select a.nombre agente, v.revocado_en::text revocado, v.llamadas from agora.v_llamadas_tras_revocar v join agora.agente a on a.id = v.agente_id`);
    const porMotivo = await s.consulta<{ motivo: string; n: number }>(`select motivo, count(*)::int n from agora.a2a_llamada where resultado = 'rechazada' group by motivo order by n desc`);
    const [yo] = await s.consulta<DatosDeAgentes['yo']>(`select agora_priv.tiene_rol(p.org_id, null, array['propietario']) propietario, agora_priv.tiene_rol(p.org_id, null, array['administrador']) administrador,
        exists (select 1 from agora.membresia m where m.persona_id = p.id and m.rol = 'aprobador') aprobador from agora.persona p where p.id = auth.uid()`);
    const [fin] = await s.consulta<{ id: string }>(`select c.id from agora.nodo c join agora.nodo d on d.id = c.padre_id where c.tipo = 'categoria' and d.slug = 'finanzas' order by c.orden limit 1`);
    return { agentes, llamadas, trasRevocar, porMotivo, yo: yo!, categoriaFinanzas: fin?.id ?? null };
  });
}
