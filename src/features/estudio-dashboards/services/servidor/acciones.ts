/**
 * Lo que el lienzo le pide al servidor, cada acción sobre la MISMA superficie de herramientas del núcleo que usa el
 * CLI. Toda cifra viaja con su consulta y su SQL (procedencia). La instrucción va en seco: devuelve «lo que entendí»
 * y la propuesta resuelta; aplicar es otra acción, que registra la versión.
 */
import { z } from 'zod';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ejecutaHerramienta, interpreta, resuelve, versionActual, nuevoHistorial, type Dashboard, type Senal,
} from '../../../../../tools/estudio-dashboards/dist/index.js';
import { anota, estadoGasto } from './gasto';
import { ALMACEN, CONTEXTO, CORTE, TABLEROS, runtime, type NombreTablero } from './runtime';

const tablero = z.enum(TABLEROS);
const seleccion = z.object({ dimension: z.string().max(80), valores: z.array(z.string().max(80)).min(1).max(25) }).strict();
export const accionEsquema = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('estado'), tablero }),
  z.object({ accion: z.literal('instruccion'), tablero, instruccion: z.string().trim().min(2).max(500), seleccion: seleccion.nullable().optional() }),
  z.object({ accion: z.literal('aplicar'), tablero, parche: z.unknown(), instruccion: z.string().max(500).optional(), resumen: z.string().max(300).optional(), autor: z.enum(['agente', 'persona']) }),
  z.object({ accion: z.literal('version'), tablero, operacion: z.enum(['volver', 'oficial']), n: z.number().int().min(0).max(500) }),
  z.object({ accion: z.literal('comparar'), tablero, a: z.number().int().min(0), b: z.number().int().min(0) }),
  z.object({ accion: z.literal('describir'), metrica: z.string().max(80) }),
  z.object({ accion: z.literal('senales') }),
  z.object({ accion: z.literal('alerta'), regla: z.unknown(), confirmadaPor: z.string().trim().min(1).max(80).optional() }),
  z.object({ accion: z.literal('reinicia'), tablero }),
]);
export type Accion = z.infer<typeof accionEsquema>;

async function leer(t: NombreTablero) {
  const { ctx } = await runtime();
  const h = (await ctx.versiones.lee(t)) ?? nuevoHistorial(t, ctx.tablerosBase![t]!);
  return { h, d: versionActual(h).dashboard };
}

async function estado(t: NombreTablero) {
  const rt = await runtime();
  const lectura = await ejecutaHerramienta(rt.ctx, 'leer_dashboard', { tablero: t });
  const { d } = await leer(t);
  const catalogo = await ejecutaHerramienta(rt.ctx, 'listar_metricas', {});
  return { tablero: lectura, datos: await resuelve(rt.ctx.consultor, d, rt.ctx.resolver), catalogo, geografia: rt.geografia, gasto: await estadoGasto(), agente: rt.modelo ? rt.modelo.id : null };
}

async function instruccion(t: NombreTablero, texto: string, sel: Dashboard['seleccion'] | null | undefined) {
  const rt = await runtime();
  const gasto = await estadoGasto();
  if (!rt.modelo) return { status: 503, cuerpo: { error: 'el agente no está disponible: falta la llave del modelo en el servidor' } };
  if (gasto.nivel === 'excedido') return { status: 503, cuerpo: { error: `el agente se apagó: el lienzo llegó a su tope de US$${gasto.presupuestoUsd}` } };
  const { h, d } = await leer(t);
  const previa = [...h.versiones].reverse().find((x) => x.autor === 'agente' && x.instruccion);
  const alcance = (previa?.parche as { alcance?: { componentes?: string[] } } | null)?.alcance?.componentes ?? [];
  const ultimo = previa && previa.n === h.actual ? { instruccion: previa.instruccion!, componentes: alcance } : null;
  const v = await interpreta({ consultor: rt.ctx.consultor, modelo: rt.modelo, corte: CORTE, contexto: CONTEXTO, registrador: anota }, d, h.actual, texto, sel ?? d.seleccion ?? undefined, ultimo);
  const r = v.resultado;
  const propuesta = r?.aplicado && !v.error ? { dashboard: r.aplicado.dashboard, parche: r.parche, tocados: r.aplicado.tocados, globales: r.aplicado.globales } : null;
  const datos = propuesta ? await resuelve(rt.ctx.consultor, propuesta.dashboard, rt.ctx.resolver) : null;
  return { status: 200, cuerpo: { version: h.actual, vuelta: { entendi: v.entendi, texto: v.texto, plan: v.plan, error: v.error, costoUsd: v.costoUsd, ms: v.ms, intentos: v.intentos, modelo: v.modelo, versionPrompt: v.versionPrompt }, propuesta, datos, explicacion: r?.explicacion ?? null, alerta: r?.alerta ?? null, propuestaMetrica: r?.propuesta ?? null } };
}

/** Ejecuta una acción ya validada. Devuelve el estado HTTP y el cuerpo. */
export async function ejecuta(a: Accion): Promise<{ status: number; cuerpo: unknown }> {
  const rt = await runtime();
  switch (a.accion) {
    case 'estado': return { status: 200, cuerpo: await estado(a.tablero) };
    case 'instruccion': return instruccion(a.tablero, a.instruccion, a.seleccion);
    case 'aplicar': {
      const r = await ejecutaHerramienta(rt.ctx, 'editar_dashboard', { tablero: a.tablero, parche: a.parche, instruccion: a.instruccion, resumen: a.resumen, autor: a.autor, aplicar: true });
      return { status: 200, cuerpo: { aplicado: r, ...(await estado(a.tablero)) } };
    }
    case 'version': {
      await ejecutaHerramienta(rt.ctx, a.operacion === 'volver' ? 'volver_version' : 'fijar_oficial', { tablero: a.tablero, n: a.n, aplicar: true });
      return { status: 200, cuerpo: await estado(a.tablero) };
    }
    case 'comparar': return { status: 200, cuerpo: await ejecutaHerramienta(rt.ctx, 'comparar_versiones', { tablero: a.tablero, a: a.a, b: a.b }) };
    case 'describir': return { status: 200, cuerpo: await ejecutaHerramienta(rt.ctx, 'describir_metrica', { metrica: a.metrica }) };
    case 'senales': return { status: 200, cuerpo: { senales: (await rt.senales()) as readonly Senal[] } };
    case 'alerta': return { status: 200, cuerpo: await ejecutaHerramienta(rt.ctx, 'crear_alerta', { regla: a.regla, aplicar: !!a.confirmadaPor, ...(a.confirmadaPor ? { confirmada_por: a.confirmadaPor } : {}) }) };
    case 'reinicia': {
      await rm(/*turbopackIgnore: true*/ join(ALMACEN, `${a.tablero}.json`), { force: true });
      return { status: 200, cuerpo: await estado(a.tablero) };
    }
  }
}
