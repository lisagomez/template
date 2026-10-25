/**
 * «Vigente» que se sostiene solo: pregunta a cada fuente web si hay versión nueva y lo apunta en `pin.json` → «revision».
 * AVISA Y NO MUEVE: los SHA, la versión de KEV, los CVE y el último Patch Day del pin quedan como estaban. Mover el pin lo
 * decide el laboratorio (se cambia `pin.json`, se vuelve a capturar y extraer, y la diferencia de candidatos va a la mesa).
 *
 * Qué pregunta:
 *   · el Patch Day: el calendario (segundo martes) dice si ya pasó el siguiente al fijado; y NVD, si hay CVE de SAP
 *     publicados después de la captura (los del Patch Day y los de fuera de ciclo);
 *   · KEV: si su último commit trae entradas de SAP que el pin no tiene;
 *   · cada guía de SAP-docs: si tiene un commit nuevo.
 * `remoto` se inyecta: con `sinRed` solo cuenta el calendario (para simular una fecha sin salir a internet).
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diaUtc, paraNvd, proximoPatchDay } from './reglas.mjs'

/** Lo que el pin fija. `revisa` no puede cambiar ninguno de estos campos. */
export const FIJADO = ['capturadoEl', 'ventana', 'ultimoPatchDay', 'cvelist', 'kev', 'sapDocs']

/** Sin red: cada fuente «responde» lo que ya está fijado. Solo el calendario puede avisar. */
export const sinRed = (pin) => ({
  cabeza: (web) => (web === pin.kev.web ? pin.kev.sha : pin.sapDocs.find((s) => s.web === web)?.sha ?? null),
  cvesDeSapDesde: async () => null,
  kevSapEn: () => null,
})

/** Con red: git ls-remote, la API de NVD y una copia de KEV en un temporal (que se borra). */
export const conRed = (pin) => ({
  cabeza: (web) => execFileSync('git', ['ls-remote', `${web}.git`, 'HEAD'], { encoding: 'utf8', timeout: 60_000 }).split(/\s+/)[0],
  cvesDeSapDesde: async (fecha) => {
    const ini = diaUtc(fecha)
    if (ini.getTime() > Date.now()) return []
    const fin = new Date(Math.min(ini.getTime() + 119 * 86_400_000, Date.now()))
    const r = await fetch(`https://services.nvd.nist.gov/rest/json/cves/2.0?sourceIdentifier=cna@sap.com&pubStartDate=${paraNvd(ini)}&pubEndDate=${paraNvd(fin)}&resultsPerPage=2000`, { headers: { 'user-agent': 'soporte-sap-laboratorio/0.1 (revision)' } })
    if (!r.ok) throw new Error(`NVD respondió ${r.status}`)
    return (await r.json()).vulnerabilities.map((v) => v.cve.id).filter((id) => !pin.cvelist.cves.includes(id))
  },
  kevSapEn: (sha) => {
    const dir = mkdtempSync(join(tmpdir(), 'kev-'))
    try {
      for (const a of [['init', '-q'], ['remote', 'add', 'origin', `${pin.kev.web}.git`], ['fetch', '-q', '--depth', '1', 'origin', sha]]) execFileSync('git', ['-C', dir, ...a], { timeout: 120_000 })
      const k = JSON.parse(execFileSync('git', ['-C', dir, 'show', `${sha}:known_exploited_vulnerabilities.json`], { encoding: 'utf8', maxBuffer: 64 << 20 }))
      return k.vulnerabilities.filter((v) => /^SAP/i.test(v.vendorProject)).map((v) => v.cveID)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  },
})

const dia = (fecha, n) => new Date(diaUtc(fecha).getTime() + n * 86_400_000).toISOString().slice(0, 10)

/** Los avisos de hoy. Nunca escribe nada. */
export async function avisos(pin, hoy, remoto) {
  const out = []
  const proximo = proximoPatchDay(pin.ultimoPatchDay)
  if (hoy >= proximo) out.push(`Patch Day del ${proximo}: SAP ya publicó sus notas de ese mes y el pin sigue en el del ${pin.ultimoPatchDay}`)
  const nuevos = await remoto.cvesDeSapDesde(dia(pin.capturadoEl, 1))
  if (nuevos?.length) out.push(`${nuevos.length} CVE de SAP publicados después de la captura (${nuevos.slice(0, 4).join(', ')}${nuevos.length > 4 ? '…' : ''})`)
  const kev = remoto.cabeza(pin.kev.web)
  if (kev && kev !== pin.kev.sha) {
    const sap = remoto.kevSapEn(kev)
    const fijadas = new Set(pin.cvelist.cves)
    const nuevasDeSap = (sap ?? []).filter((id) => !fijadas.has(id))
    if (nuevasDeSap.length) out.push(`KEV (${kev.slice(0, 7)}) tiene ${nuevasDeSap.length} entrada(s) de SAP que el pin no tiene: ${nuevasDeSap.join(', ')}`)
  }
  for (const s of pin.sapDocs) {
    const h = remoto.cabeza(s.web)
    if (h && h !== s.sha) out.push(`${s.repo} tiene un commit nuevo (${h.slice(0, 12)}); el pin sigue en ${s.sha.slice(0, 12)}`)
  }
  return { proximo, avisos: out }
}

/** La revisión, apuntada en el pin sin tocar lo fijado. Devuelve el pin nuevo; lo escribe si se le da la ruta. */
export async function revisaWeb(rutaPin, { hoy, remoto }) {
  const pin = JSON.parse(readFileSync(rutaPin, 'utf8'))
  const r = await avisos(pin, hoy, remoto(pin))
  const revision = { fecha: hoy, estado: r.avisos.length ? 'version_nueva' : 'al_dia', proximoPatchDay: r.proximo, avisos: r.avisos }
  const nuevo = { ...pin, revision }
  for (const k of FIJADO) if (JSON.stringify(nuevo[k]) !== JSON.stringify(pin[k])) throw new Error(`revisa no mueve el pin: «${k}» cambió`)
  writeFileSync(rutaPin, `${JSON.stringify(nuevo, null, 2)}\n`)
  return revision
}
