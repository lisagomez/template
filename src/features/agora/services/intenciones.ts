'use server';

/**
 * Lo que hacen las intenciones de Ágora que necesitan la base, sin LLM. Una intención NO da autoridad: lleva a una
 * pantalla, lee una cifra que ya calculó el libro o abre una propuesta. Un cambio de monto, fecha o responsable
 * pedido así queda como PROPUESTA en el hilo y nunca se aplica directo. Las irreversibles (cerrar el periodo,
 * revocar, avisar a un tercero, quitar la segregación) llegan aquí solo DESPUÉS del freno de la capa, con la cita
 * textual de la persona, que la base registra.
 */
import { refresh } from 'next/cache';
import * as agora from '../../../../tools/agora/dist/index.js';
import { diaSemana, sumaDias } from '../../../../tools/agora/dist/fechas.js';
import { corta } from '../../../../tools/agora/dist/index.js';
import { laboratorio, personaActual } from './laboratorio';
import { palabras, resuelve } from './resuelve';
import { mxn, periodoLargo } from './formato';

export interface Respuesta { texto: string; ir?: string }

async function conEntorno(fn: (e: agora.Entorno, persona: string) => Promise<Respuesta>): Promise<Respuesta> {
  const lab = laboratorio();
  if (!lab.activo) return { texto: `No puedo: ${lab.motivo}` };
  const p = await personaActual();
  try {
    return await fn(lab.entorno, p.id);
  } catch (e) {
    return { texto: `La base dijo que no: ${e instanceof Error ? e.message : String(e)}.` };
  }
}

const leer = <T,>(e: agora.Entorno, persona: string, fn: (s: agora.Sesion) => Promise<T>) => agora.como(e.base, { tipo: 'persona', id: persona }, fn);
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const UNIDADES: Record<string, number> = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15,
  veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, trescientos: 300,
  cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 };

/** «70 mil», «70,000», «$70000», «setenta mil», «ciento veinte mil». */
export async function montoDe(texto: string): Promise<number | null> {
  const t = sinAcentos(texto).replace(/\$/g, ' ');
  const d = t.match(/(\d{1,3}(?:[,.]\d{3})+|\d+)(?:\s*(mil|k)\b)?/);
  if (d) return Number(d[1]!.replace(/[,.](?=\d{3}\b)/g, '')) * (d[2] ? 1000 : 1);
  const m = t.match(/\b((?:(?:un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos)\s*(?:y\s*)?)+)mil\b/);
  if (!m) return null;
  const n = m[1]!.trim().split(/\s+/).filter((w) => w !== 'y').reduce((s, w) => s + (UNIDADES[w] ?? 0), 0);
  return n > 0 ? n * 1000 : null;
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const hoyMx = () => iso(Date.now() - 6 * 3600_000);

/** «al viernes», «el 30 de noviembre», «2026-11-30». Siempre una fecha futura. */
export async function fechaDe(texto: string): Promise<string | null> {
  const t = sinAcentos(texto);
  const isoM = t.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoM) return isoM[1]!;
  const dm = t.match(/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de\s+(20\d{2}))?/);
  const hoy = hoyMx();
  if (dm) {
    const anio = dm[3] ? Number(dm[3]) : Number(hoy.slice(0, 4));
    const f = `${anio}-${String(MESES.indexOf(dm[2]!) + 1).padStart(2, '0')}-${dm[1]!.padStart(2, '0')}`;
    return f < hoy && !dm[3] ? `${anio + 1}${f.slice(4)}` : f;
  }
  const dia = DIAS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(t));
  if (dia < 0) return null;
  return sumaDias(hoy, ((dia - diaSemana(hoy) + 7) % 7) || 7);
}

function periodoDe(texto: string): string {
  const t = sinAcentos(texto);
  const p = t.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (p) return `${p[1]}-${p[2]}`;
  const m = MESES.findIndex((x) => t.includes(x));
  const hoy = hoyMx();
  if (m >= 0) {
    const anio = t.match(/\b(20\d{2})\b/)?.[1] ?? hoy.slice(0, 4);
    return `${anio}-${String(m + 1).padStart(2, '0')}`;
  }
  const d = new Date(Date.parse(`${hoy.slice(0, 7)}-01T12:00:00Z`) - 864e5);
  return iso(d.getTime()).slice(0, 7); // «el mes»: el mes vencido
}

interface ItemCorto { id: string; nombre: string; categoria_id: string; categoria: string; monto_mxn: string | null; inicio: string | null; fin: string | null; responsable_persona: string | null; responsable_agente: string | null }

/** «mueve la fecha de la campaña al viernes», «cambia el monto de la ruta a 70 mil», «asigna las visitas a Daniel». */
export async function intencionCambio(texto: string, workspace: string | null, categoria: string | null): Promise<Respuesta> {
  return conEntorno(async (e, persona) => {
    const items = await leer(e, persona, (s) => s.consulta<ItemCorto>(
      `select i.id, i.nombre, i.categoria_id, n.nombre categoria, i.monto_mxn::text, i.inicio::text, i.fin::text, i.responsable_persona, i.responsable_agente
         from agora.item i join agora.nodo n on n.id = i.categoria_id
        where i.estado <> 'done' and ($1::uuid is null or $1::uuid = any (n.ancestros)) and ($2::uuid is null or i.categoria_id = $2::uuid)`, [workspace, categoria]))
    const t = sinAcentos(texto);
    const campo = /\b(monto|presupuesto|cuesta|costo|pesos|mxn|mil)\b|\$/.test(t) ? 'monto' : /\b(asigna|asignale|responsable|encarga|encargale)\b/.test(t) ? 'responsable' : 'fecha';
    // El ítem: el que más palabras comparte con el pedido (sin las del valor).
    const sinValor = texto.replace(/\b(a|al|el)\s+(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\b.*$/i, '').replace(/\b(a|en)\s+[\d$].*$/i, '')
    const r = resuelve(sinValor, items, (i) => i.nombre)
    if (r.tipo === 'ninguno') return { texto: 'No sé de qué ítem hablas, y prefiero no adivinar. Dime su nombre, por ejemplo: «cambia el monto de Material POP a 50 mil».' }
    if (r.tipo === 'ambiguo') return { texto: `¿Te refieres a «${r.cuales[0].nombre}» o a «${r.cuales[1].nombre}»? No lo cambio hasta saber cuál.` }
    const it = r.cual
    let payload: agora.Payload
    let resumen: string
    if (campo === 'monto') {
      const monto = await montoDe(texto)
      if (monto === null) return { texto: `¿A cuánto? Dime la cifra en pesos para «${it.nombre}» (por ejemplo «a 70 mil»).` }
      payload = { version: 1, clase: 'cambiar_monto', categoria: it.categoria_id, cambios: [{ item: it.id, campo: 'monto_mxn', antes: it.monto_mxn === null ? null : Number(it.monto_mxn), despues: monto }] }
      resumen = `Cambiar el monto de «${it.nombre}» de ${mxn(it.monto_mxn, false)} a ${mxn(monto, false)}`
    } else if (campo === 'responsable') {
      const gente = await leer(e, persona, (s) => s.consulta<{ id: string; nombre: string; tipo: string }>(
        `select id, nombre, 'persona' tipo from agora.persona union all select id, nombre, origen from agora.agente where estado = 'aprobado'`))
      const q = resuelve(texto.replace(new RegExp(it.nombre, 'i'), ''), gente, (g) => g.nombre)
      if (q.tipo !== 'uno') return { texto: q.tipo === 'ambiguo' ? `¿A ${q.cuales[0].nombre} o a ${q.cuales[1].nombre}?` : `¿A quién se lo asigno? No encuentro a esa persona ni a ese agente.` }
      const g = q.cual
      const externo = g.tipo === 'externo'
      payload = { version: 1, clase: externo ? 'asignar_externo' : 'asignar', categoria: it.categoria_id, cambios: g.tipo === 'persona'
        ? [{ item: it.id, campo: 'responsable_persona', antes: it.responsable_persona, despues: g.id }]
        : [{ item: it.id, campo: 'responsable_agente', antes: it.responsable_agente, despues: g.id }] }
      resumen = `Asignar «${it.nombre}» a ${g.nombre}${externo ? ' (externo: pide aprobador)' : ''}`
    } else {
      const f = await fechaDe(texto)
      if (!f) return { texto: `¿A qué fecha muevo «${it.nombre}»? Dímela como «al viernes» o «al 30 de noviembre».` }
      payload = { version: 1, clase: 'mover_fecha', categoria: it.categoria_id, cambios: [{ item: it.id, campo: 'fin', antes: it.fin, despues: f }] }
      resumen = `Mover la fecha de «${it.nombre}» del ${it.fin ?? '—'} al ${f}`
    }
    const r2 = await agora.proponeComoPersona(e, persona, { payload, resumen })
    if (!r2.id) return { texto: `El supervisor lo frenó antes del hilo: ${r2.veredicto.motivo}.` }
    refresh()
    return { texto: `Lo dejé como propuesta en el hilo de ${it.categoria} (huella ${corta(r2.sha256!)}): ${resumen}. Nada cambió todavía: la aprueba con su clic quien dice la matriz.`,
      ir: `/agora/buzon?cat=${it.categoria_id}&propuesta=${r2.id}` }
  })
}

export async function intencionDisponible(texto: string): Promise<Respuesta> {
  return conEntorno(async (e, persona) => {
    const cats = await leer(e, persona, (s) => s.consulta<{ id: string; nombre: string; ws: string }>(
      `select c.id, c.nombre, w.nombre ws from agora.nodo c join agora.nodo w on w.id = c.ancestros[1] where c.tipo = 'categoria'`))
    const r = resuelve(texto, cats, (c) => c.nombre)
    if (r.tipo === 'ninguno') return { texto: 'No sé de qué categoría, y no lo adivino. Dime cuál: Pipeline, Campañas, Logística, Compras…' }
    if (r.tipo === 'ambiguo') return { texto: `¿${r.cuales[0].nombre} de ${r.cuales[0].ws} o ${r.cuales[1].nombre} de ${r.cuales[1].ws}?` }
    const [v] = await leer(e, persona, (s) => s.consulta<{ periodo: string; presupuesto: string; disponible: string; comprometido: string; ejercido: string }>(
      `select periodo, presupuesto_mxn::text presupuesto, disponible_mxn::text disponible, comprometido_mxn::text comprometido, ejercido_mxn::text ejercido
         from agora.v_centro_periodo where categoria_id = $1 and periodo = to_char(now() at time zone 'America/Mexico_City', 'YYYY-MM')`, [r.cual.id]))
    if (!v) return { texto: `${r.cual.nombre} no tiene presupuesto este mes.`, ir: '/agora/costos' }
    return { texto: `${r.cual.nombre} (${periodoLargo(v.periodo)}): disponible ${mxn(v.disponible)} de ${mxn(v.presupuesto)}; comprometido ${mxn(v.comprometido)}, ejercido ${mxn(v.ejercido)}. Lo calculó el libro.`, ir: '/agora/costos' }
  })
}

/** Después del freno: la cita es lo que la persona escribió. */
export async function intencionCierre(texto: string): Promise<Respuesta> {
  return conEntorno(async (e, persona) => {
    const periodo = periodoDe(texto)
    const org = (await e.base.consulta<{ org_id: string }>('select org_id from agora.persona where id = $1', [persona]))[0]!.org_id
    const r = await agora.cierraPeriodo(e, persona, { org, periodo, cita: texto })
    refresh()
    return { texto: r.poliza
      ? `Cerré los costos de ${periodoLargo(periodo)}. La póliza ${r.folio} quedó PROPUESTA para Contabilidad (${r.lineas} línea(s) de costo${r.sin_costear ? `; ${r.sin_costear} llamada(s) de modelo sin costo, declaradas: la cifra real es mayor` : ''}). Ágora no asienta: la asienta Contabilidad.`
      : `Cerré ${periodoLargo(periodo)}: no tenía costos ejercidos, así que no hay póliza que proponer.`, ir: `/agora/contabilidad?periodo=${periodo}` }
  })
}

export async function intencionAgente(texto: string, accion: 'suspende' | 'revoca' | 'avisa'): Promise<Respuesta> {
  return conEntorno(async (e, persona) => {
    const agentes = await leer(e, persona, (s) => s.consulta<{ id: string; nombre: string; slug: string; origen: string; estado: string }>('select id, nombre, slug, origen, estado from agora.agente'))
    const r = resuelve(texto, agentes, (a) => `${a.nombre} ${a.slug.replace(/-/g, ' ')}`)
    if (r.tipo === 'ninguno') return { texto: '¿Qué agente? No lo encuentro, y no adivino con estas cosas.' }
    if (r.tipo === 'ambiguo') return { texto: `¿${r.cuales[0].nombre} o ${r.cuales[1].nombre}? No hago nada hasta saber cuál.` }
    const a = r.cual
    if (accion === 'suspende') {
      await agora.suspende(e, persona, a.id, `suspendido desde la ventana: «${texto}»`)
      refresh()
      return { texto: `Suspendí a ${a.nombre}: sus llamadas responden «no existe» y sus propuestas quedan congeladas. Lo reactiva la Propietaria.`, ir: '/agora/agentes' }
    }
    if (accion === 'revoca') {
      const x = await agora.revoca(e, persona, a.id, 'revocado desde la ventana', texto)
      refresh()
      return { texto: `Revoqué a ${a.nombre}: su siguiente llamada ya falla. Retiré ${x.propuestas} propuesta(s), cancelé ${x.tareas} tarea(s), dejé ${x.items} ítem(s) sin responsable y cancelé ${x.recordatorios} recordatorio(s).`, ir: '/agora/agentes' }
    }
    const cat = (await e.base.consulta<{ nodo_id: string }>(`select x.nodo_id from agora.agente_alcance x join agora.nodo n on n.id = x.nodo_id where x.agente_id = $1 and n.tipo = 'categoria' limit 1`, [a.id]))[0]
    if (cat) await agora.publica(e, persona, { categoria: cat.nodo_id, cuerpo: `Aviso a ${a.nombre} (tercero), confirmado por el freno: «${texto}». En el laboratorio no sale nada de la máquina: el aviso queda aquí.` })
    refresh()
    return { texto: `Aviso registrado para ${a.nombre}. En el laboratorio no sale nada: la salida a un tercero exige el C4 firmado.`, ir: cat ? `/agora/buzon?cat=${cat.nodo_id}` : '/agora/agentes' }
  })
}

export async function intencionSegregacion(texto: string): Promise<Respuesta> {
  return conEntorno(async (e, persona) => {
    const org = (await e.base.consulta<{ org_id: string }>('select org_id from agora.persona where id = $1', [persona]))[0]!.org_id
    await agora.cambiaSegregacion(e, persona, org, false, texto)
    refresh()
    return { texto: 'Quité la segregación de funciones: quedó como decisión registrada de la organización, con tu cita. Se vuelve a poner desde el alta.', ir: '/agora/alta' }
  })
}

/** Lo que alguien le dice a un agente es un mensaje en el hilo de la categoría abierta: nunca un chat aparte. */
export async function intencionEscribe(texto: string, categoria: string | null): Promise<Respuesta> {
  return conEntorno(async (e, persona) => {
    if (!categoria) return { texto: '¿En qué categoría? Abre su buzón (o su tablero) y vuelve a decírmelo: lo dejo en su hilo.' }
    const [c] = await leer(e, persona, (s) => s.consulta<{ nombre: string }>('select nombre from agora.nodo where id = $1', [categoria]))
    if (!c) return { texto: 'Esa categoría no existe para ti.' }
    await agora.publica(e, persona, { categoria, cuerpo: texto })
    refresh()
    return { texto: `Lo dejé en el hilo de ${c.nombre}. Lo que conteste un agente llega ahí, como propuesta cuando cambia algo.`, ir: `/agora/buzon?cat=${categoria}` }
  })
}

/** Ir a una pantalla de un workspace o categoría dicha por su nombre. Dos candidatos: pregunta; ninguno: lo dice. */
export async function intencionAbre(texto: string, pantalla: 'tablero' | 'buzon', vista?: 'tabla' | 'kanban' | 'gantt'): Promise<Respuesta> {
  return conEntorno(async (e, persona) => {
    const nodos = await leer(e, persona, (s) => s.consulta<{ id: string; tipo: string; nombre: string; ws: string | null; wsNombre: string | null }>(
      `select n.id, n.tipo, n.nombre, coalesce(n.ancestros[1], n.id) ws, coalesce(w.nombre, n.nombre) "wsNombre" from agora.nodo n left join agora.nodo w on w.id = n.ancestros[1]`))
    const pedido = palabras(texto)
    const candidatos = pantalla === 'buzon' ? nodos.filter((n) => n.tipo === 'categoria') : nodos
    const r = pedido.length ? resuelve(texto, candidatos, (n) => n.nombre) : ({ tipo: 'ninguno' } as const)
    const v = vista ? `&vista=${vista}` : ''
    if (r.tipo === 'ambiguo') {
      const [a, b] = r.cuales
      return { texto: `Hay dos que se llaman así: «${a.nombre}» de ${a.wsNombre} y «${b.nombre}» de ${b.wsNombre}. ¿Cuál abro? No lo adivino.` }
    }
    if (r.tipo === 'ninguno') {
      if (pantalla === 'buzon') return { texto: 'Te llevo al buzón: elige la categoría en el explorador.', ir: '/agora/buzon' }
      return { texto: `Te llevo al tablero${vista && vista !== 'tabla' ? ` en ${vista === 'gantt' ? 'Gantt' : 'kanban'}` : ''}.`, ir: `/agora/tablero?${v.slice(1)}` }
    }
    const n = r.cual
    if (pantalla === 'buzon') return { texto: `Te llevo al buzón de ${n.nombre}.`, ir: `/agora/buzon?cat=${n.id}` }
    const destino = n.tipo === 'categoria' ? `/agora/tablero?ws=${n.ws}&cat=${n.id}${v}` : `/agora/tablero?ws=${n.ws}${v}`
    return { texto: `Te llevo al ${vista === 'gantt' ? 'Gantt' : vista === 'kanban' ? 'kanban' : 'tablero'} de ${n.tipo === 'workspace' ? n.nombre : `${n.nombre} (${n.wsNombre})`}.`, ir: destino }
  })
}
