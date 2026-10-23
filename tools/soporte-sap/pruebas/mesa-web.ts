/**
 * La fuente web de BASIS en la mesa: el generador sobre una captura SINTÉTICA (sin red) y la mesa sobre el catálogo
 * generado que está en el repo. Cada afirmación de seguridad tiene aquí su prueba, y su sabotaje en la matriz: solo
 * entran candidatos de capturas fijadas con su huella; la extracción se niega ante una copia alterada; nada se copia de la
 * redacción de una fuente y de una SAP Note solo van número, título y enlace; lo que pide S-user o no deja capturar en
 * automático no se captura; corrobora solo una fuente que politica-cita admite; revisar avisa y no mueve el pin; validar
 * es una propuesta; y la mesa no sale a internet.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RAIZ, lee } from './_ayuda.ts'
import { EXPERTO, LAB, GET, POST, importa, pide } from './_mesa.mts'
import { PROSA, SAPSTACK, capturaSintetica, commitea } from './_web.mts'

const WEB = 'src/features/soporte-sap/mesa/fuentes/web'
const generador = await importa(`${WEB}/generador.mjs`)
const reglas = await importa(`${WEB}/reglas.mjs`)
const captura = await importa(`${WEB}/captura.mjs`)
const revisa = await importa(`${WEB}/revisa.mjs`)
const web = await importa('src/features/soporte-sap/mesa/services/web.ts')
const CATALOGO = JSON.parse(lee(`${WEB}/catalogo.json`))
const GENERADO = JSON.parse(lee(`${WEB}/candidatos-web.json`))
const PIN = JSON.parse(lee(`${WEB}/pin.json`))
const SAPSTACK_REAL = JSON.parse(lee('src/features/soporte-sap/mesa/fuentes/sapstack/candidatos-sapstack.json')).candidatos
const sintetica = capturaSintetica()
after(() => sintetica.limpia())
const execGit = (dir: string, ...a: string[]) => { execFileSync('git', ['-C', dir, ...a]) }
const genera = (pin = sintetica.pin) => generador.catalogoWebDe(sintetica.dir, pin, CATALOGO, SAPSTACK)
type C = { id: string; tipo: string; clave: string; titulo: string; hipotesis: string; destino: string; aviso: string | null; cita: { url: string; texto: string } | null; captura: { fecha: string; ref: string }; seguridad?: { explotada: string | null; prioridad: string } }

test('web · el catálogo generado es el del pin: banner, huella, captura y cita admitida en cada candidato', () => {
  assert.equal(Object.keys(GENERADO)[0], '_ALTO')
  assert.equal(web.catalogoWebValido(GENERADO, PIN).motivo, null)
  const shas = new Set([PIN.cvelist.sha, PIN.kev.sha, ...PIN.sapDocs.map((s: { sha: string }) => s.sha)])
  const ids = new Set(SAPSTACK_REAL.map((c: { id: string }) => c.id))
  for (const c of GENERADO.candidatos as C[]) {
    assert.equal(c.captura.fecha, PIN.capturadoEl, c.clave)
    assert.ok(shas.has(c.captura.ref), `${c.clave}: su captura no es de un SHA del pin`)
    assert.ok(!ids.has(c.id), `${c.clave}: choca con un id de sapstack`)
    if (c.cita) assert.ok(generador.admitida(c.cita), `${c.clave}: cita no admitida ${c.cita.url}`)
  }
  assert.equal(new Set(GENERADO.candidatos.map((c: C) => c.id)).size, GENERADO.candidatos.length, 'ids repetidos')
})

test('web · solo entran candidatos de capturas fijadas con su huella: uno editado o de otra captura no se carga', async () => {
  const editado = { ...GENERADO, candidatos: GENERADO.candidatos.map((c: C, i: number) => (i === 0 ? { ...c, hipotesis: `${c.hipotesis} (a mano)` } : c)) }
  assert.match(web.catalogoWebValido(editado, PIN).motivo ?? '', /huella/)
  assert.equal(web.catalogoWebValido(editado, PIN).candidatos.length, 0)
  assert.match(web.catalogoWebValido(GENERADO, { ...PIN, cvelist: { ...PIN.cvelist, sha: 'f'.repeat(40) } }).motivo ?? '', /otra captura/)
  const r = await GET(pide('GET', '?vista=candidatos', EXPERTO))
  const v = await r.json()
  assert.equal(v.web.integro, true)
  assert.equal(v.candidatos.filter((c: { origen?: string }) => c.origen === 'web').length, GENERADO.candidatos.length, 'la mesa enseña los del catálogo fijado')
})

test('web · la extracción se niega ante una captura alterada o en otro SHA, y dos corridas dan la misma huella', () => {
  const a = genera(), b = genera()
  assert.equal(a.huella, b.huella)
  assert.deepEqual(a.candidatos, b.candidatos)
  const archivo = join(sintetica.dir, 'cvelist', `cves/2026/90xxx/CVE-2026-90001.json`)
  const original = readFileSync(archivo, 'utf8')
  writeFileSync(archivo, original.replace('"baseScore": 9.8', '"baseScore": 3.1'))
  try { assert.throws(() => genera(), /alterada/) } finally { writeFileSync(archivo, original) }
  const kev = join(sintetica.dir, 'kev-data')
  const otro = commitea(kev, 'known_exploited_vulnerabilities.json', readFileSync(join(kev, 'known_exploited_vulnerabilities.json'), 'utf8').replace('2026.10.01', '2026.10.02'))
  assert.notEqual(otro, sintetica.pin.kev.sha)
  assert.throws(() => genera(), /pin/)
  execGit(kev, 'reset', '-q', '--hard', sintetica.pin.kev.sha)
  assert.equal(genera().huella, a.huella, 'de vuelta en su SHA, la misma huella')
})

test('web · ningún pasaje de una captura aparece literal en lo extraído: el conocimiento va con palabras propias', () => {
  const c = genera()
  const capturado = [PROSA.cve, PROSA.pagina].flatMap((p) => [...reglas.tejas(p)])
  for (const x of c.candidatos as C[]) {
    const propio = `${x.hipotesis} ${x.destino} ${x.aviso ?? ''}`
    for (const t of capturado) assert.ok(!reglas.tejas(propio).has(t), `${x.clave} copia «${t}»`)
  }
  const copia = { ...(c.candidatos[0] as C), hipotesis: `Según SAP: ${PROSA.cve}` }
  assert.equal(reglas.pasajesCopiados([copia], [PROSA.cve]).length, 1, 'la guarda lo caza')
  assert.ok(c.candidatos.some((x: C) => x.hipotesis.includes('Importing Requests')), 'el título de una página sí se puede citar')
})

test('web · de una SAP Note solo entran su número, su título y su enlace; nunca su contenido', () => {
  const c = genera()
  const notas = (c.candidatos as C[]).filter((x) => x.tipo === 'nota')
  assert.ok(notas.length >= 2)
  const permitidos = new Set(['id', 'tipo', 'clave', 'titulo', 'modulos', 'release', 'enAlcance', 'hipotesis', 'destino', 'fuente', 'aviso', 'origen', 'cita', 'captura', 'seguridad', 'contexto'])
  for (const n of notas) {
    assert.deepEqual(Object.keys(n).filter((k) => !permitidos.has(k)), [], `${n.clave}: campos de más`)
    assert.equal(n.cita?.url, `https://me.sap.com/notes/${n.clave}`)
    assert.equal(n.cita?.texto, `SAP Note ${n.clave}`)
    assert.ok(!JSON.stringify(n).includes(PROSA.cve.slice(0, 40)), `${n.clave}: lleva la descripción del registro`)
  }
  const s = notas.find((n) => n.clave === '3900001')!
  assert.equal(s.seguridad?.prioridad, 'Hot News')
  assert.equal(s.seguridad?.explotada, '2026-10-15', 'KEV la marca')
  assert.ok(!notas.some((n) => n.clave === '3900002'), 'la de Commerce queda fuera del alcance')
})

test('web · una fuente que pide S-user o que no deja capturar en automático no se captura, y la captura va fuera del repo', () => {
  assert.throws(() => captura.permitida('https://me.sap.com/notes/3765424', CATALOGO), /S-user/)
  assert.throws(() => captura.permitida('https://support.sap.com/pam', CATALOGO), /S-user/)
  assert.throws(() => captura.permitida('https://help.sap.com/docs/SAP_NETWEAVER_750', CATALOGO), /robots\.txt/)
  assert.throws(() => captura.permitida('https://support.sap.com/en/my-support/knowledge-base/security-notes-news/october-2026.html', CATALOGO), /robots\.txt/)
  assert.throws(() => captura.permitida('https://community.sap.com/t5/x', CATALOGO), /no se captura|extracción/)
  assert.throws(() => captura.permitida('https://ejemplo.invalido/x', CATALOGO), /no está en el catálogo/)
  assert.equal(captura.permitida('https://github.com/CVEProject/cvelistV5', CATALOGO).id, 'cvelist')
  assert.throws(() => captura.carpetaFuera(join(RAIZ, 'capturas'), RAIZ), /dentro del repo/)
})

test('web · una corroboración solo cuenta de una fuente que politica-cita admite; una que dice otra cosa contradice', () => {
  const x = genera().corroboraciones
  assert.equal(x['tcode-stms'].estado, 'corroborado', 'STMS: SAP Help (vía SAP-docs) la nombra como transacción')
  assert.ok(x['tcode-stms'].evidencias.every((e: { admitida: boolean; cita: { url: string } }) => e.admitida && e.cita.url.startsWith('https://help.sap.com/')))
  assert.equal(x['tcode-smventiuno'].estado, 'no_encontrado', 'SM21 solo sale en la imagen de prueba, que no está en SAP Help')
  assert.equal(x['tcode-smventiuno'].evidencias[0].admitida, false)
  assert.equal(x['tcode-rsusr'].estado, 'contradicho', 'SAP lo nombra como reporte')
  assert.equal(x['nota-vieja'].estado, 'contradicho', 'SAP la cita con otro título')
})

test('web · la revisión de vigencia avisa de una versión nueva y no mueve el pin', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pin-web-'))
  try {
    const ruta = join(dir, 'pin.json')
    copyFileSync(join(RAIZ, WEB, 'pin.json'), ruta)
    const antes = JSON.parse(readFileSync(ruta, 'utf8'))
    const al = await revisa.revisaWeb(ruta, { hoy: '2026-10-23', remoto: revisa.sinRed })
    assert.equal(al.estado, 'al_dia')
    const nueva = await revisa.revisaWeb(ruta, { hoy: '2026-11-11', remoto: revisa.sinRed })
    assert.equal(nueva.estado, 'version_nueva')
    assert.match(nueva.avisos[0], /Patch Day del 2026-11-10/)
    const despues = JSON.parse(readFileSync(ruta, 'utf8'))
    for (const k of revisa.FIJADO) assert.deepEqual(despues[k], antes[k], `«${k}» se movió`)
    assert.equal(despues.revision.estado, 'version_nueva')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('web · validar un candidato de la web es una propuesta, y el laboratorio la ve con su cita y su captura', async () => {
  const c = (GENERADO.candidatos as C[]).find((x) => x.seguridad?.prioridad === 'Hot News')!
  const r = await POST(pide('POST', '', EXPERTO, { tipo: 'valida_candidato', candidato: c.id, valoracion: 'no_se', comentario: 'hay que ver si el kernel del cliente está en la lista' }))
  assert.equal(r.status, 200)
  assert.equal((await r.json()).validacion.estado, 'propuesta')
  const m = await (await GET(pide('GET', '?vista=mapa', LAB))).json()
  const p = m.propuestas.find((x: { candidato: { id: string } }) => x.candidato.id === c.id)
  assert.ok(p && p.validaciones.every((v: { estado: string }) => v.estado === 'propuesta'))
  assert.equal(p.candidato.cita.url, c.cita?.url)
  assert.equal(m.fuentes.web.candidatos, GENERADO.candidatos.length)
  assert.equal(m.metricas.firmados.valor, 0, 'validar no firma')
})

test('web · la mesa no sale a internet: leer candidatos y mapa no pide nada fuera de la llave de Access', async () => {
  const fuera: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (u: string | URL | Request, i?: RequestInit) => {
    const url = new URL(typeof u === 'string' ? u : u instanceof URL ? u.href : u.url)
    if (url.hostname !== '127.0.0.1') { fuera.push(url.href); throw new Error('sin red') }
    return original(u, i)
  }) as typeof fetch
  try {
    assert.equal((await GET(pide('GET', '?vista=candidatos', EXPERTO))).status, 200)
    assert.equal((await GET(pide('GET', '?vista=mapa', LAB))).status, 200)
    await new Promise((ok) => setTimeout(ok, 50))
  } finally { globalThis.fetch = original }
  assert.deepEqual(fuera, [])
  for (const f of ['web.ts', 'candidatos.ts', 'mapa.ts']) assert.doesNotMatch(lee(`src/features/soporte-sap/mesa/services/${f}`), /captura\.mjs|revisa\.mjs|child_process|node:https?['"]/, `${f} no carga lo que sale a la red`)
})
