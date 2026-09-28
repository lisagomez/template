import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { carpetaDe, guarda, leeJson, procesaEnHijo } from './almacen';
import type { DecisionesLocales, ProyectoLocal } from '../../types';

export const hoyEnMexico = (): string => new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);

interface ResultadoLocal { observaciones: Array<{ nivel: string; mensaje: string }>; master?: { qa: Array<{ nivel: string; mensaje: string }> } }

/**
 * Procesa (o reprocesa) el clip con las decisiones vigentes y registra la versión nueva. Cualquier cambio
 * REVOCA lo aprobado (respuesta 8: nadie aprueba a ciegas un archivo que cambió).
 */
export async function reprocesa(supabase: SupabaseClient, duenoId: string, proyectoId: string): Promise<{ estado: string; version: number; huella: string | null }> {
  const carpeta = carpetaDe(duenoId, proyectoId);
  const local = await leeJson<ProyectoLocal>(join(carpeta, 'proyecto.json'));
  if (!local) throw new Error('proyecto sin datos locales');
  const decisiones = (await leeJson<DecisionesLocales>(join(carpeta, 'decisiones.json'))) ?? { marcas: [], conConsentimiento: [], cubiertos: [] };
  const { data: cs } = await supabase.from('reel_consentimientos').select('alias, rol, vigente_hasta, revocado_en').eq('proyecto_id', proyectoId);
  const consentimientos = (cs ?? []).map((c) => ({ alias: String(c.alias), rol: c.rol as 'dueno' | 'empleado' | 'cliente', vigenteHasta: String(c.vigente_hasta), revocado: c.revocado_en !== null }));
  await supabase.from('reel_proyectos').update({ estado: 'procesando' }).eq('id', proyectoId);
  const r = await procesaEnHijo({ bruto: join(carpeta, 'bruto.mp4'), carpeta, marca: local.marca, catalogo: local.catalogo, consentimientos, hoy: hoyEnMexico(), diccionario: local.diccionario, decisiones });
  const resultado = await leeJson<ResultadoLocal>(join(carpeta, 'resultado.json'));
  const bloqueos = [...(resultado?.observaciones ?? []), ...(resultado?.master?.qa ?? [])].filter((o) => o.nivel === 'bloquea').map((o) => o.mensaje);
  const { data: previas } = await supabase.from('reel_versiones').select('numero').eq('proyecto_id', proyectoId).order('numero', { ascending: false }).limit(1);
  const numero = Number(previas?.[0]?.numero ?? 0) + 1;
  if (r.huella && r.duracion) await supabase.from('reel_versiones').insert({ proyecto_id: proyectoId, numero, huella: r.huella, duracion_s: r.duracion });
  await supabase.from('reel_aprobaciones').update({ revocada_en: new Date().toISOString() }).eq('proyecto_id', proyectoId).is('revocada_en', null);
  await supabase.from('reel_proyectos').update({ estado: r.estado, motivo_bloqueo: bloqueos.join(' · ').slice(0, 500) || null, aprobado_en: null }).eq('id', proyectoId);
  await guarda(carpeta, 'registro.json', JSON.stringify({ aprobadoEn: null, brutoBorradoEn: null }));
  return { estado: r.estado, version: numero, huella: r.huella };
}
