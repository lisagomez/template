/**
 * Los candidatos de BASIS que salen de la web, generados desde una captura y nunca a mano. La captura es una carpeta FUERA
 * del repo (la baja `captura.mjs`) con copias git de cada fuente; aquí solo se LEE: cada copia tiene que estar
 * exactamente en el SHA de `pin.json` y sin un cambio, o el generador se niega. De lo leído salen:
 *
 *   · notas de seguridad, de los registros que SAP publica como CNA en el CVE List (número, título, CVSS, CVE, producto,
 *     versiones y fecha), marcadas como explotadas si CISA las tiene en KEV;
 *   · transacciones y punteros a SAP Notes que cita la documentación de SAP publicada en SAP-docs (CC BY 4.0);
 *   · el cruce con sapstack: qué candidato de sapstack corrobora, contradice o no encuentra una fuente que
 *     `politica-cita.mjs` admite.
 *
 * Mismo pin y misma captura dan la misma huella. Lo que se escribe va con palabras propias: si una hipótesis repitiera
 * ocho palabras de la prosa capturada, el generador se niega (`pasajesCopiados`).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { DOMINIOS_PROPIOS } from '../../../../../../tools/conocimiento/politica-cita.mjs'
import { BANNER, huellaDe } from '../generadores.mjs'
import {
  ayudaDe, citaDeNota, esPatchDay, esProsa, hipotesisDePuntero, hipotesisDeSeguridad, hipotesisDeTransaccion, idWeb,
  mencionesEn, moduloDe, notaDeUrl, notasEn, pasajesCopiados, prioridadDe, sha256,
} from './reglas.mjs'

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
/** ¿`politica-cita.mjs` admite esta cita como fuente de una regla de sap-soporte? (null es que sí) */
export const admitida = (cita) => Boolean(cita) && DOMINIOS_PROPIOS['sap-soporte'].fuente({ fuente_url: cita.url, fuente_cita: cita.texto }) === null
/** Dónde vive cada fuente dentro de la carpeta de captura. */
export const carpetas = (c) => ({ cvelist: join(c, 'cvelist'), kev: join(c, 'kev-data'), sapDocs: (id) => join(c, 'sap-docs', id) })
/** La ruta de un registro dentro de cvelistV5: cves/<año>/<miles>xxx/CVE-<año>-<n>.json. */
export function rutaDeCve(id) {
  const [, anio, n] = /^CVE-(\d{4})-(\d+)$/.exec(id) ?? []
  if (!anio) throw new Error(`id de CVE raro: ${id}`)
  return `cves/${anio}/${Math.floor(Number(n) / 1000)}xxx/${id}.json`
}

/** Cada copia está en su SHA y sin cambios; si no, se niega con el motivo. Mover un pin lo decide el laboratorio. */
export function verificaCaptura(carpeta, pin) {
  const d = carpetas(carpeta)
  const copias = [['CVE List', d.cvelist, pin.cvelist.sha], ['KEV', d.kev, pin.kev.sha], ...pin.sapDocs.map((s) => [s.repo, d.sapDocs(s.id), s.sha])]
  for (const [nombre, dir, sha] of copias) {
    if (!existsSync(join(dir, '.git'))) throw new Error(`falta la captura «${nombre}» en ${dir}: córrela con extrae.mjs web captura`)
    const head = git(dir, 'rev-parse', 'HEAD')
    if (head !== sha) throw new Error(`la captura «${nombre}» está en ${head.slice(0, 12)} y el pin es ${sha.slice(0, 12)}: mover el pin lo decide el laboratorio, en pin.json`)
    const sucio = git(dir, 'status', '--porcelain')
    if (sucio) throw new Error(`la captura «${nombre}» fue alterada (${sucio.split('\n').length} archivo(s) distinto(s) de su SHA): no se extrae de ella`)
  }
  for (const id of pin.cvelist.cves) if (!existsSync(join(d.cvelist, rutaDeCve(id)))) throw new Error(`falta ${id} en la captura del CVE List`)
}

// ── El CVE List y KEV ──────────────────────────────────────────────────────────────────────────

/** Lo que se toma de un registro de CVE: hechos (y su descripción solo para comprobar que no se copia). */
function leeCve(dir, id) {
  const archivo = rutaDeCve(id)
  const bytes = readFileSync(join(dir, archivo))
  const r = JSON.parse(bytes.toString('utf8'))
  const cna = r.containers?.cna ?? {}
  const m = (cna.metrics ?? []).map((x) => x.cvssV3_1 ?? x.cvssV3_0).find(Boolean) ?? null
  const versiones = (cna.affected ?? []).flatMap((a) => (a.versions ?? []).filter((v) => v.status === 'affected').map((v) => String(v.version).trim()))
  const linea = bytes.toString('utf8').split('\n').findIndex((l) => l.includes('"title"')) + 1
  return {
    id, archivo, linea: linea || 1, huella: sha256(bytes), sap: r.cveMetadata?.assignerShortName === 'sap',
    publicada: String(r.cveMetadata?.datePublished ?? '').slice(0, 10), actualizada: String(r.cveMetadata?.dateUpdated ?? '').slice(0, 10),
    titulo: String(cna.title ?? '').replace(/\s+/g, ' ').trim(), producto: [...new Set((cna.affected ?? []).map((a) => String(a.product ?? '').trim()).filter(Boolean))].join('; '),
    versiones: [...new Set(versiones)], cvss: m ? Number(m.baseScore) : null, vector: m?.vectorString ?? null,
    cwe: [...new Set((cna.problemTypes ?? []).flatMap((p) => (p.descriptions ?? []).map((x) => x.cweId)).filter(Boolean))],
    notas: [...new Set((cna.references ?? []).map((x) => notaDeUrl(x.url)).filter(Boolean))],
    prosa: (cna.descriptions ?? []).map((x) => String(x.value ?? '')),
  }
}

/** CVE → fecha en que CISA lo dio por explotado. */
function explotadas(dir) {
  const k = JSON.parse(readFileSync(join(dir, 'known_exploited_vulnerabilities.json'), 'utf8'))
  return { version: k.catalogVersion, porCve: new Map(k.vulnerabilities.map((v) => [v.cveID, v.dateAdded])) }
}

/** Los registros agrupados por nota: una nota puede corregir varios CVE (se toma el CVSS mayor). */
function porNota(registros, kev) {
  const notas = new Map()
  for (const r of registros) for (const n of r.notas) notas.set(n, [...(notas.get(n) ?? []), r])
  return [...notas.entries()].sort(([a], [b]) => Number(a) - Number(b)).map(([n, rs]) => {
    const mayor = [...rs].sort((a, b) => (b.cvss ?? -1) - (a.cvss ?? -1) || (a.id < b.id ? -1 : 1))[0]
    const fechas = rs.map((r) => r.publicada).sort()
    const explotada = rs.map((r) => kev.porCve.get(r.id)).filter(Boolean).sort()[0] ?? null
    return {
      n, registro: mayor, cves: rs.map((r) => r.id).sort(), titulo: mayor.titulo, producto: [...new Set(rs.map((r) => r.producto))].join('; '),
      versiones: [...new Set(rs.flatMap((r) => r.versiones))], cvss: mayor.cvss, vector: mayor.vector, cwe: [...new Set(rs.flatMap((r) => r.cwe))].sort(),
      publicada: fechas[0], actualizada: rs.map((r) => r.actualizada).sort().at(-1), explotada,
      dispares: new Set(rs.map((r) => r.cvss)).size > 1,
    }
  })
}

function candidatoDeSeguridad(g, pin) {
  const r = g.registro
  const s = { cves: g.cves, cvss: g.cvss, vector: g.vector, prioridad: prioridadDe(g.cvss), publicada: g.publicada, patchDay: esPatchDay(g.publicada), actualizada: g.actualizada, cwe: g.cwe, producto: g.producto, versiones: g.versiones, explotada: g.explotada }
  return {
    id: idWeb('nota', g.n), tipo: 'nota', clave: g.n, titulo: g.titulo || '(el registro no trae título)', modulos: [moduloDe(`${g.producto} ${g.titulo}`)], release: null, enAlcance: true,
    hipotesis: hipotesisDeSeguridad(g.n, s), destino: 'la fuente citada de una regla de seguridad (puntero a SAP for Me) y la revisión de parches del cliente',
    fuente: { archivo: r.archivo, linea: r.linea, url: `${pin.cvelist.web}/blob/${pin.cvelist.sha}/${r.archivo}#L${r.linea}` },
    aviso: g.dispares ? `la nota corrige ${g.cves.length} CVE con CVSS distintos: se enseña el mayor` : null,
    origen: 'web', cita: citaDeNota(g.n), captura: { fuente: 'cvelist', ref: pin.cvelist.sha, fecha: pin.capturadoEl, huella: r.huella }, seguridad: s,
  }
}

// ── SAP-docs ───────────────────────────────────────────────────────────────────────────────────

function archivosMd(dir) {
  const out = []
  const recorre = (d) => { for (const f of readdirSync(d).sort()) { const p = join(d, f); if (f === '.git') continue; if (statSync(p).isDirectory()) recorre(p); else if (f.endsWith('.md')) out.push(p) } }
  recorre(dir)
  return out
}

/** Una página de SAP-docs: su loio, su título, sus menciones de transacciones, sus notas citadas y su prosa. */
function leePagina(raiz, ruta, s, conocidos) {
  const texto = readFileSync(ruta, 'utf8')
  const lineas = texto.split('\n')
  const archivo = relative(raiz, ruta)
  const loio = /<!--\s*loio([0-9a-f]{32})\s*-->/.exec(texto)?.[1] ?? null
  const pagina = (lineas.find((l) => /^# /.test(l)) ?? `# ${archivo}`).replace(/^#\s+/, '').replace(/\\/g, '').trim()
  const ayuda = ayudaDe(s.ayuda, loio)
  const cita = ayuda ? { url: ayuda, texto: `SAP Help Portal: ${pagina}` } : null
  const base = { fuente: s.id, guia: s.guia, pagina, archivo, cita, admitida: admitida(cita), url: (l) => `${s.web}/blob/${s.sha}/${archivo}#L${l}`, huella: sha256(texto) }
  const menciones = [], citas = []
  let seccion = pagina
  lineas.forEach((l, i) => {
    if (/^#{2,4} /.test(l)) seccion = l.replace(/^#+\s+/, '').replace(/\\/g, '').trim()
    for (const m of mencionesEn(l, conocidos)) menciones.push({ ...base, ...m, seccion, linea: i + 1 })
    for (const n of notasEn(l)) citas.push({ ...base, ...n, seccion, linea: i + 1 })
  })
  const abap = /ABAP|NetWeaver|\bHANA\b|S\/4HANA|SAP GUI|Cloud Connector|ST-PI|\bRFC\b|transaction/.test(texto)
  return { menciones, citas, abap, prosa: lineas.filter(esProsa) }
}

function leeSapDocs(carpeta, pin, conocidos) {
  const paginas = []
  for (const s of pin.sapDocs) {
    const raiz = carpetas(carpeta).sapDocs(s.id)
    for (const ruta of archivosMd(raiz)) paginas.push({ ...leePagina(raiz, ruta, s, conocidos), fuente: s.id })
  }
  return paginas
}

const evidencia = (m, detalle) => ({ fuente: m.fuente, guia: m.guia, pagina: m.pagina, seccion: m.seccion, archivo: m.archivo, linea: m.linea, url: m.url(m.linea), cita: m.cita, admitida: m.admitida, detalle })
/** Una por página: la primera vez que la nombra. */
const unaPorPagina = (xs) => [...new Map(xs.map((x) => [`${x.fuente}:${x.archivo}`, x])).values()]

function candidatoDeTransaccion(tc, ms, pin) {
  const m = ms.find((x) => x.admitida) ?? ms[0]
  const paginas = unaPorPagina(ms)
  return {
    id: idWeb('tcode', tc), tipo: 'tcode', clave: tc, titulo: ms.find((x) => x.nombre)?.nombre ?? `(sin nombre en la fuente; SAP la usa en ${m.pagina})`, modulos: ['BASIS'], release: null, enAlcance: true,
    hipotesis: hipotesisDeTransaccion(tc, m), destino: 'el triage (módulo del ticket) y el léxico del anonimizador',
    fuente: { archivo: m.archivo, linea: m.linea, url: m.url(m.linea) },
    aviso: paginas.length > 1 ? `SAP la nombra en ${paginas.length} páginas` : m.admitida ? null : 'la única fuente que la nombra no está en SAP Help: politica-cita no la admite como cita',
    origen: 'web', cita: m.admitida ? m.cita : null, captura: { fuente: m.fuente, ref: pin.sapDocs.find((s) => s.id === m.fuente).sha, fecha: pin.capturadoEl, huella: m.huella },
    contexto: [m.pagina, m.seccion, m.guia, ...ms.map((x) => x.nombre).filter(Boolean)],
  }
}

function candidatoDePuntero(n, cs, abap, pin) {
  const c = cs.find((x) => x.admitida) ?? cs[0]
  const paginas = unaPorPagina(cs)
  const titulo = cs.find((x) => x.titulo)?.titulo
  return {
    id: idWeb('nota', n), tipo: 'nota', clave: n, titulo: titulo ?? `(sin título en la fuente; SAP la cita en ${c.pagina})`, modulos: [abap ? 'BASIS' : 'BTP'], release: null, enAlcance: abap,
    hipotesis: hipotesisDePuntero(n, c), destino: 'la fuente citada de una regla (puntero a SAP for Me)',
    fuente: { archivo: c.archivo, linea: c.linea, url: c.url(c.linea) },
    aviso: paginas.length > 1 ? `SAP la cita en ${paginas.length} páginas` : null,
    origen: 'web', cita: citaDeNota(n), captura: { fuente: c.fuente, ref: pin.sapDocs.find((s) => s.id === c.fuente).sha, fecha: pin.capturadoEl, huella: c.huella },
    contexto: [c.pagina, c.seccion, c.guia, ...(titulo ? [titulo] : [])],
  }
}

// ── El cruce con sapstack ──────────────────────────────────────────────────────────────────────

const palabrasDe = (t) => new Set(String(t).toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '').match(/[\p{L}\p{N}]{3,}/gu) ?? [])
/** ¿Dos títulos dicen lo mismo? Comparten al menos la mitad de sus palabras de tres letras o más. */
export function mismoTitulo(a, b) {
  const x = palabrasDe(a), y = palabrasDe(b)
  const comunes = [...x].filter((p) => y.has(p)).length
  return comunes / Math.max(1, Math.min(x.size, y.size)) >= 0.5
}

function cruceDeTransaccion(c, ms) {
  const ev = unaPorPagina(ms).map((m) => evidencia(m, m.como === 'transaccion' ? 'la nombra como transacción' : `la nombra como ${m.como}, no como transacción`))
  const admitidas = ev.filter((e) => e.admitida)
  if (admitidas.some((e) => !e.detalle.startsWith('la nombra como transacción'))) return { estado: 'contradicho', evidencias: ev }
  return { estado: admitidas.length ? 'corroborado' : 'no_encontrado', evidencias: ev }
}

function cruceDeNota(c, seg, cs, pin) {
  const ev = []
  if (seg) {
    const igual = mismoTitulo(c.titulo, seg.titulo)
    ev.push({ fuente: 'cvelist', guia: 'CVE List (registro de SAP)', pagina: seg.cves.join(', '), seccion: null, archivo: seg.registro.archivo, linea: seg.registro.linea, url: `${pin.cvelist.web}/blob/${pin.cvelist.sha}/${seg.registro.archivo}`, cita: citaDeNota(c.clave), admitida: true, detalle: igual ? 'SAP le da el mismo título' : `SAP la titula «${seg.titulo}»` })
  }
  for (const x of unaPorPagina(cs)) {
    const t = x.titulo ? (mismoTitulo(c.titulo, x.titulo) ? 'SAP la cita con el mismo título' : `SAP la cita como «${x.titulo}»`) : 'SAP la cita (sin título: el número existe, el título no se comprueba)'
    ev.push({ ...evidencia(x, t), cita: citaDeNota(c.clave), admitida: true })
  }
  if (ev.some((e) => /titula «|cita como «/.test(e.detalle))) return { estado: 'contradicho', evidencias: ev }
  return { estado: ev.length ? 'corroborado' : 'no_encontrado', evidencias: ev }
}

// ── Todo junto ─────────────────────────────────────────────────────────────────────────────────

/** El catálogo web entero, desde una captura verificada. `sapstack` son sus candidatos (para el cruce y para no duplicar). */
export function catalogoWebDe(carpeta, pin, catalogo, sapstack) {
  verificaCaptura(carpeta, pin)
  const d = carpetas(carpeta)
  const kev = explotadas(d.kev)
  if (kev.version !== pin.kev.catalogVersion) throw new Error(`KEV dice ${kev.version} y el pin ${pin.kev.catalogVersion}`)
  const registros = pin.cvelist.cves.map((id) => leeCve(d.cvelist, id))
  const deSap = registros.filter((r) => r.sap || r.notas.length)
  const grupos = porNota(deSap, kev)
  const conocidos = new Set([...sapstack.filter((c) => c.tipo === 'tcode').map((c) => c.clave), ...catalogo.areas.flatMap((a) => a.tcodes)])
  const paginas = leeSapDocs(carpeta, pin, conocidos)
  const enSapstack = new Map(sapstack.map((c) => [`${c.tipo}:${c.clave}`, c]))
  const seguridad = new Map(grupos.filter((g) => moduloDe(`${g.producto} ${g.titulo}`)).map((g) => [g.n, g]))
  const menciones = agrupa(paginas.flatMap((p) => p.menciones), (m) => m.tcode)
  const citas = agrupa(paginas.flatMap((p) => p.citas.map((c) => ({ ...c, abap: p.abap }))), (c) => c.numero)
  const candidatos = [
    ...[...seguridad.values()].filter((g) => !enSapstack.has(`nota:${g.n}`)).map((g) => candidatoDeSeguridad(g, pin)),
    ...[...citas].filter(([n]) => !seguridad.has(n) && !enSapstack.has(`nota:${n}`)).map(([n, cs]) => candidatoDePuntero(n, cs, cs.some((x) => x.abap), pin)),
    ...[...menciones].filter(([tc, ms]) => catalogo.areas.some((a) => a.tcodes.includes(tc)) && !enSapstack.has(`tcode:${tc}`) && ms.some((m) => m.como === 'transaccion')).map(([tc, ms]) => candidatoDeTransaccion(tc, ms.filter((m) => m.como === 'transaccion'), pin)),
  ]
  const corroboraciones = cruce(sapstack, menciones, citas, seguridad, pin)
  const copiados = pasajesCopiados(candidatos, [...deSap.flatMap((r) => r.prosa), ...paginas.flatMap((p) => p.prosa)])
  if (copiados.length) throw new Error(`se copiaría la redacción de una fuente en ${copiados.length} candidato(s), p. ej. ${copiados[0].clave}: «${copiados[0].pasaje}». No se escribe nada`)
  const resumen = resumenDe(registros, grupos, seguridad, candidatos, corroboraciones, kev, paginas)
  return { _ALTO: BANNER, pin: pinDe(pin), huella: huellaDe({ candidatos, corroboraciones, resumen }), resumen, candidatos, corroboraciones }
}

function agrupa(xs, clave) {
  const m = new Map()
  for (const x of xs) m.set(clave(x), [...(m.get(clave(x)) ?? []), x])
  return new Map([...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)))
}

/** El cruce de cada candidato de sapstack que es de BASIS/BC o que alguna fuente nombra. */
function cruce(sapstack, menciones, citas, seguridad, pin) {
  const out = {}
  for (const c of sapstack) {
    const basis = c.modulos.some((m) => m === 'BASIS' || m === 'BC')
    const x = c.tipo === 'tcode' ? cruceDeTransaccion(c, menciones.get(c.clave) ?? []) : cruceDeNota(c, seguridad.get(c.clave), citas.get(c.clave) ?? [], pin)
    if (basis || x.evidencias.length) out[c.id] = { clave: c.clave, tipo: c.tipo, basis, ...x }
  }
  return out
}

function resumenDe(registros, grupos, seguridad, candidatos, corroboraciones, kev, paginas) {
  const cuenta = (f) => candidatos.filter(f).length
  const cr = Object.values(corroboraciones).filter((x) => x.basis)
  return {
    registros: registros.length, deSap: registros.filter((r) => r.sap).length, sinNota: registros.filter((r) => !r.notas.length).length,
    notasDeSeguridad: grupos.length, fueraDeAlcance: grupos.length - seguridad.size, explotadas: cuenta((c) => c.seguridad?.explotada),
    kev: kev.version, paginas: paginas.length,
    candidatos: { total: candidatos.length, seguridad: cuenta((c) => c.seguridad), punteros: cuenta((c) => c.tipo === 'nota' && !c.seguridad), tcodes: cuenta((c) => c.tipo === 'tcode'), enAlcance: cuenta((c) => c.enAlcance) },
    cruce: { total: cr.length, corroborados: cr.filter((x) => x.estado === 'corroborado').length, contradichos: cr.filter((x) => x.estado === 'contradicho').length, noEncontrados: cr.filter((x) => x.estado === 'no_encontrado').length },
  }
}

/** Lo que del pin queda dentro del catálogo: la mesa lo compara con `pin.json` y rechaza un catálogo de otra captura. */
export const pinDe = (pin) => ({ capturadoEl: pin.capturadoEl, cvelist: pin.cvelist.sha, kev: pin.kev.sha, sapDocs: Object.fromEntries(pin.sapDocs.map((s) => [s.id, s.sha])) })
