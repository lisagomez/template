/**
 * Lo que cada nivel ve, armado en el servidor. Las métricas salen del corte semántico por las
 * superficies del dominio (`tableroN1/N2/N3`, `estadoSla`, `accionables`, `foda`): aquí solo se dan
 * forma. Visibilidad: el N3 ve lo suyo; la consultora, lo de sus clientes y su sala; el laboratorio, lo
 * escalado a la sala (sin adjuntos originales) y, del sandbox, solo el texto anonimizado: nunca el título
 * ni la descripción originales de un caso que no se le escaló.
 */
import {
  tableroN1, tableroN2, tableroN3, estadoSla, accionables, foda, verificaCadena, contratoDeLaboratorio, CLIENTES, CONSULTORAS, veredictoDeFicha, PREGUNTAS_SNAPSHOT,
  faltaParaElNucleo, vigente,
  type Tarjeta as TarjetaDominio, type ResultadoSla, type Prioridad,
} from '../../../../tools/soporte-sap/dist/index.js'
import { CORTE, estado, relojDe, relojesDeDemostracion, presupuestoDe, fichasDeServidor, type IncidenciaLab } from './runtime'
import { salidasQueVe, venceDe } from './salida'
import type { Sesion, Vista, Tarjeta, IncidenciaVista, RelojVista, GrupoTarjetas, SlaVista, PresupuestoVista, FichaVista, ConsentimientoVista } from './tipos'

const PERIODO = '2026-09'
const SOLO_SUPERADMIN = new Set(['horas_consultor', 'horas_por_ticket', 'salud_cuenta'])
/** En el orden de `ETAPAS` del dominio. */
const ETAPAS_ES = ['alta', 'onboarding', 'adopción', 'operación', 'renovación']
const tarjeta = (t: TarjetaDominio): Tarjeta => ({ nombre: t.nombre, etiqueta: t.metrica.etiqueta, valor: t.valor, unidad: t.metrica.unidad, fuente: t.fuente, definicion: t.metrica.descripcion, supuestos: t.metrica.supuestos })
const nombreDe = (id: string) => CLIENTES.find((c) => c.id === id)?.nombre ?? id

function reloj(r: ResultadoSla): RelojVista {
  return {
    contrato: r.contrato, prioridad: r.prioridad, metaRespuestaMin: r.metaRespuestaMin, respuestaMin: r.respuestaMin, resolucionMin: r.resolucionMin,
    pausadoMin: r.pausadoMin, cumpleRespuesta: r.cumpleRespuesta, alerta: r.alertaRespuesta, estado: r.estado, tramos: r.tramos.map((t) => ({ ...t })),
  }
}

/** Lo último que la consultora le pidió al cliente (el evento ESPERA_CLIENTE de la cadena). */
const pideDe = (i: IncidenciaLab): string | null => {
  const pide = [...i.cadena].reverse().find((x) => x.tipo === 'ESPERA_CLIENTE')?.datos.pide
  return typeof pide === 'string' ? pide : null
}

function incidencia(i: IncidenciaLab, s: Sesion): IncidenciaVista {
  const c = i.clasificacion, q = i.consulta
  const verAdjuntos = s.nivel !== 'N1'
  const vence = venceDe(estado(), i, new Date().toISOString())
  return {
    id: i.id, titulo: i.titulo, cliente: nombreDe(i.cliente), prioridad: c.prioridad, modulo: c.modulo, transaccion: c.transaccion, mensaje: c.mensaje,
    etiquetas: [...c.etiquetas], razones: [...c.razones], estado: i.estado,
    consulta: q.tipo === 'sin_solucion' ? { tipo: q.tipo, regla: null, grado: null, cita: null, razon: q.razon } : { tipo: q.tipo, regla: q.entrada.regla, grado: q.entrada.grado, cita: q.fuente.cita, razon: q.razon },
    adjuntos: verAdjuntos ? i.adjuntos.map((a) => (a.aceptado
      ? { nombre: a.nombre, aceptado: true, via: a.via, aviso: a.aviso, motivo: null, campos: a.campos.map((x) => ({ ...x })), vence }
      : { nombre: a.nombre, aceptado: false, via: null, aviso: null, motivo: a.motivo, campos: [], vence: null })) : [],
    cadena: i.cadena.map((e) => ({ seq: e.seq, tipo: e.tipo, actor: e.actor, fecha: e.fecha, resumen: JSON.stringify(e.datos).slice(0, 160), hash: e.hash })),
    cadenaIntegra: verificaCadena(i.id, i.cadena).ok,
    planes: i.planes.map((p) => ({
      version: p.plan.version, sha256: p.plan.sha256, cambios: [...p.plan.cambios], mensaje: p.mensaje, decision: p.decision, aplicado: p.aplicado,
      pasos: p.plan.pasos.map((x) => `${x.descripcion} (${Object.entries(x.parametros).map(([k, v]) => `${k}=${v}`).join(', ')})`),
      prevision: (p.plan.prevision ?? []).map((x) => `${x.antes} → ${x.despues}`),
      supervisor: { resultado: p.veredicto.resultado, comprobaciones: p.veredicto.comprobaciones.map((x) => ({ ...x })) },
    })),
    sandbox: i.sandbox ? { veredicto: i.sandbox.veredicto, texto: i.sandbox.veredicto === 'entra' ? i.sandbox.texto : null, senales: [...i.sandbox.senales] } : null,
    reloj: reloj(relojDe(i)),
    impugnaciones: i.impugnaciones.map((m) => ({ ...m })),
    pide: i.estado === 'espera_cliente' ? pideDe(i) : null,
    escaladaPor: i.escalada?.por ?? null,
    respuestas: s.nivel === 'N1' ? [] : i.respuestas.map((r) => ({ ...r })),
    congelada: estado().bajas[i.cliente] !== undefined,
  }
}

function tablero(s: Sesion): GrupoTarjetas[] {
  if (s.rol === 'cliente') return [{ titulo: `Tu servicio · ${PERIODO}`, tarjetas: tableroN3(CORTE, 'andina', s.organizacion, PERIODO).tarjetas.map(tarjeta) }]
  if (s.rol === 'consultor') {
    const t = tableroN2(CORTE, s.organizacion, PERIODO)
    return [{ titulo: `Consultora Andina · ${PERIODO}`, tarjetas: t.propio.map(tarjeta) },
      ...t.clientes.map((c) => ({ titulo: `${nombreDe(c.cliente)} · etapa ${c.etapa ?? 'sin dato'}`, tarjetas: c.tarjetas.map(tarjeta) }))]
  }
  const t = tableroN1(CORTE, PERIODO)
  const filtra = (xs: readonly TarjetaDominio[]) => xs.filter((x) => s.rol === 'superadmin' || !SOLO_SUPERADMIN.has(x.nombre)).map(tarjeta)
  return [{ titulo: `Todas las consultoras · ${PERIODO}`, tarjetas: filtra(t.total) },
    ...t.porConsultora.map((c) => ({ titulo: `Consultora ${c.consultora}`, tarjetas: filtra(c.tarjetas) })),
    { titulo: 'Clientes en cartera por etapa', tarjetas: t.cartera.map((x, k) => ({ ...tarjeta(x), etiqueta: `En ${ETAPAS_ES[k] ?? ''}` })) }]
}

function sla(s: Sesion): SlaVista | null {
  if (s.nivel === 'N1') return null
  const k = contratoDeLaboratorio('andina', 'alimentos-del-bajio', '2026-04-01')
  const lector = s.rol === 'cliente' ? { nivel: 'N3' as const, consultora: 'andina', cliente: s.organizacion } : { nivel: 'N2' as const, consultora: s.organizacion }
  const e = estadoSla(CORTE, lector, k, PERIODO)
  const meta = (m: number | null, cal: string) => (m === null ? 'sin meta (por decidir)' : `${m} min ${cal === 'continuo' ? 'continuos (24×7)' : 'hábiles'}`)
  return {
    contrato: `${e.contrato} · ${nombreDe('alimentos-del-bajio')}`, notas: [...e.notas],
    metas: (['P1', 'P2', 'P3', 'P4'] as Prioridad[]).map((p) => ({ prioridad: p, respuesta: meta(e.metas[p].respuestaMin, e.metas[p].calendario), resolucion: meta(e.metas[p].resolucionMin, e.metas[p].calendario), fuente: e.metas[p].fuente })),
    tarjetas: [e.respuesta, e.resolucion, e.primeraRespuestaHoras, e.mttrHoras].map(tarjeta),
  }
}

/** D1: cada organización ve su consentimiento; la consultora, además, el de sus clientes. El laboratorio, ninguno. */
function consentimientosQueVe(s: Sesion): ConsentimientoVista[] {
  const e = estado()
  const de = (org: string): ConsentimientoVista => {
    const v = vigente(e.consentimientos, org)
    return { organizacion: org, nombre: nombreDe(org) === org ? (CONSULTORAS.find((c) => c.id === org)?.nombre ?? org) : nombreDe(org), vigente: v ? { por: v.por, fecha: v.fecha } : null }
  }
  if (s.rol === 'cliente') return [de(s.organizacion)]
  if (s.rol === 'consultor') return [de(s.organizacion), ...CLIENTES.filter((c) => c.consultora === s.organizacion).map((c) => de(c.id))]
  return []
}

/** Los relojes de demostración del corpus, con la forma de la vista. */
const relojesDemo = (): Vista['relojesDemo'] => relojesDeDemostracion().map((d) => ({ titulo: d.titulo, reloj: reloj(d.reloj) }))

export function vista(s: Sesion): Vista {
  const e = estado()
  const mias = e.incidencias.filter((i) => (s.rol === 'cliente' ? i.cliente === s.organizacion : s.rol === 'consultor' ? i.consultora === s.organizacion : i.escalada !== null))
  const ve = (n: string) => (s.rol === 'cliente' ? false : s.rol === 'consultor' ? true : s.rol === 'superadmin' || !SOLO_SUPERADMIN.has(n))
  const horas = s.rol === 'consultor' ? tableroN2(CORTE, s.organizacion, PERIODO).propio.filter((t) => ve(t.nombre) && t.nombre.startsWith('horas')).map(tarjeta) : []
  const acc = s.nivel === 'N1' ? [] : accionables(CORTE, 'andina', 'alimentos-del-bajio', PERIODO).filter((a) => s.rol === 'consultor' || a.para === 'n3')
  return {
    sesion: s, periodo: PERIODO, versionCorte: CORTE.version.replace(/^sha256:/, '').slice(0, 12),
    incidencias: mias.map((i) => incidencia(i, s)),
    sala: s.rol === 'cliente' ? [] : e.sala.mensajes.map((m) => ({
      id: m.id, hilo: m.hilo, autor: m.autor.id, tipoAutor: m.autor.tipo, cuerpo: m.cuerpo, origen: m.origen,
      acciones: m.bloques.length ? [...m.bloques[0]!.acciones] : null,
      decisiones: e.sala.aprobaciones.filter((a) => a.mensaje === m.id).map((a) => `${a.accion} por ${a.decididaPor}`),
    })),
    chat: s.nivel === 'N1' ? [...(e.chat[s.usuario] ?? [])] : [],
    // D1: el superadministrador ve qué le falta a cada enseñanza para subir al núcleo, nunca de quién.
    propuestas: s.nivel === 'N1' ? e.propuestas.map((v) => ({ ...v, falta: s.rol === 'superadmin' && v.id && e.ensenanzas[v.id]?.alcance === 'a_medida' ? faltaParaElNucleo(e.consentimientos, e.origenes[v.id] ?? null) : null })) : [],
    conocimientoComun: consentimientosQueVe(s),
    tablero: tablero(s), sla: sla(s), horas,
    relojesDemo: s.rol === 'consultor' ? relojesDemo() : [],
    accionables: acc.map((a) => ({
      id: a.id, para: a.para, titulo: a.titulo, evidencia: a.evidencia.map((x) => `${x.metrica} = ${x.valor} (${x.fuente.split(' · ').slice(1, 4).join(' · ')})`),
      formula: a.formula, supuestos: a.supuestos.map((x) => `${x.nombre}: ${x.rango.bajo} · ${x.rango.central} · ${x.rango.alto} ${x.unidad} (${x.naturaleza}; ${x.fuente})`),
      bajo: a.impactoMxn.bajo, central: a.impactoMxn.central, alto: a.impactoMxn.alto, confianza: a.confianza, responsable: a.responsable, aviso: a.aviso,
    })),
    foda: s.nivel === 'N1' ? null : (() => {
      const f = foda(CORTE, 'andina', 'alimentos-del-bajio', PERIODO)
      const p = (xs: typeof f.fortalezas) => xs.map((x) => ({ texto: x.texto, criterio: x.criterio, confianza: x.confianza, datos: x.datos.map((d) => `${d.metrica} = ${d.valor} (${d.fuente.split(' · ').slice(1, 4).join(' · ')})`) }))
      return { fortalezas: p(f.fortalezas), debilidades: p(f.debilidades), oportunidades: p(f.oportunidades), amenazas: p(f.amenazas) }
    })(),
    sandbox: s.nivel === 'N1' ? e.incidencias.filter((i) => i.sandbox).map((i) => ({ incidencia: i.id, veredicto: i.sandbox!.veredicto, texto: i.sandbox!.veredicto === 'entra' ? i.sandbox!.texto : null, senales: [...i.sandbox!.senales] })) : [],
    presupuesto: (s.rol === 'consultor' ? [s.organizacion] : s.rol === 'superadmin' ? CONSULTORAS.map((c) => c.id) : []).map(presupuestoVista),
    fichas: s.rol === 'superadmin' ? fichasDeServidor().map(fichaVista) : [],
    salidas: salidasQueVe(e, s, new Date().toISOString()),
  }
}

/** La ficha tal como se ve: lo medido en una línea, cada pregunta con su respuesta y el veredicto con lo que falta. */
function fichaVista(f: ReturnType<typeof fichasDeServidor>[number]): FichaVista {
  const v = veredictoDeFicha(f), m = f.medicion
  return {
    consultora: f.consultora, modo: f.modo,
    medicion: m ? `${m.fecha.slice(0, 10)} · ${m.maquina.vcpu} vCPU · ${m.maquina.ramGb} GB · ${m.maquina.discoGb ?? '—'} GB de disco · tamaño ${m.tamano ?? '—'} · región ${m.region_estado} · respaldo ${m.respaldo}` : null,
    preguntas: PREGUNTAS_SNAPSHOT.map((pregunta, k) => ({ pregunta, respuesta: f.respuestas[k] ?? null })),
    restauracion: f.restauracion ? `${f.restauracion.fecha} · ${f.restauracion.evidencia}` : null, apto: v.apto, faltan: [...v.faltan],
  }
}

const AVISOS: ReadonlySet<string> = new Set(['AVISO_PRESUPUESTO', 'A_HUMANO_POR_PRESUPUESTO', 'EN_ESPERA_POR_PRESUPUESTO'])
/** El presupuesto del mes de una consultora y sus avisos: que el aviso llegue a alguien (PRP-010 H-18). */
function presupuestoVista(consultora: string): PresupuestoVista {
  const p = presupuestoDe(consultora)
  const avisos = estado().incidencias.filter((i) => i.consultora === consultora)
    .flatMap((i) => i.cadena.filter((x) => AVISOS.has(x.tipo)).map((x) => ({ incidencia: i.id, tipo: x.tipo, aviso: String((x.datos as Record<string, unknown>)['aviso'] ?? ''), fecha: x.fecha })))
  return { consultora, mes: p.mes, topeTokens: p.topeTokens, tokens: p.tokens, topePaginasOcr: p.topePaginasOcr, paginasOcr: p.paginasOcr, avisos }
}
