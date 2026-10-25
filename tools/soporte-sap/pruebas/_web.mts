/**
 * Una captura web SINTÉTICA para las pruebas: copias git en un temporal con registros de CVE, KEV y páginas de SAP-docs
 * escritos aquí (texto propio, no de SAP), y su pin. Con ella se prueba el generador sin salir a internet: que dos
 * corridas den la misma huella, que se niegue ante una copia alterada, que no copie prosa y qué cuenta como corroborar.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const git = (dir: string, ...a: string[]) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'prueba', GIT_AUTHOR_EMAIL: 'prueba@prueba.local', GIT_COMMITTER_NAME: 'prueba', GIT_COMMITTER_EMAIL: 'prueba@prueba.local', GIT_AUTHOR_DATE: '2026-10-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-10-01T00:00:00Z' } }).trim()

/** Un repo git con esos archivos, en un commit. Devuelve su SHA. */
export function repo(dir: string, archivos: Record<string, string>): string {
  mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-q')
  for (const [ruta, texto] of Object.entries(archivos)) { mkdirSync(dirname(join(dir, ruta)), { recursive: true }); writeFileSync(join(dir, ruta), texto) }
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'captura sintetica')
  return git(dir, 'rev-parse', 'HEAD')
}
export const commitea = (dir: string, ruta: string, texto: string): string => { writeFileSync(join(dir, ruta), texto); git(dir, 'commit', '-qam', 'cambio'); return git(dir, 'rev-parse', 'HEAD') }

/** Prosa inventada para las pruebas: si un candidato repite ocho palabras seguidas de aquí, copió. */
export const PROSA = {
  cve: 'The quick parsing routine inside the imaginary dispatcher forgets to check how long every incoming header really is.',
  pagina: 'Whenever the purple elephant reaches the import queue it must wait patiently until the transport window opens again.',
}

function cve(id: string, nota: string, cvss: number, titulo: string, producto: string, fecha: string) {
  return JSON.stringify({
    dataType: 'CVE_RECORD', cveMetadata: { cveId: id, assignerShortName: 'sap', datePublished: `${fecha}T00:20:00.000Z`, dateUpdated: `${fecha}T13:00:00.000Z`, state: 'PUBLISHED' },
    containers: { cna: {
      title: titulo, affected: [{ vendor: 'SAP_SE', product: producto, versions: [{ status: 'affected', version: 'KRNL64UC 7.53' }, { status: 'affected', version: '9.16' }] }],
      descriptions: [{ lang: 'en', value: PROSA.cve }], metrics: [{ cvssV3_1: { baseScore: cvss, vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H' } }],
      problemTypes: [{ descriptions: [{ cweId: 'CWE-191', description: 'CWE-191' }] }], references: [{ url: `https://me.sap.com/notes/${nota}` }, { url: 'https://url.sap/sapsecuritypatchday' }],
    } },
  }, null, 4)
}

const pagina = (loio: string, titulo: string, cuerpo: string) => `<!-- loio${loio} -->\n\n# ${titulo}\n\n${PROSA.pagina}\n\n${cuerpo}\n`

/** La captura sintética entera y su pin. `limpia()` la borra. */
export function capturaSintetica() {
  const dir = mkdtempSync(join(tmpdir(), 'captura-web-'))
  const cves = { 'CVE-2026-90001': cve('CVE-2026-90001', '3900001', 9.8, 'Missing length check in the imaginary dispatcher', 'SAP NetWeaver and SAP Web Dispatcher', '2026-10-13'), 'CVE-2026-90002': cve('CVE-2026-90002', '3900002', 5.4, 'Weak check in a commerce add-on', 'SAP Commerce Cloud', '2026-10-13') }
  const shaCve = repo(join(dir, 'cvelist'), Object.fromEntries(Object.entries(cves).map(([id, t]) => [`cves/2026/90xxx/${id}.json`, t])))
  const kev = JSON.stringify({ catalogVersion: '2026.10.01', dateReleased: '2026-10-01T00:00:00Z', vulnerabilities: [{ cveID: 'CVE-2026-90001', vendorProject: 'SAP', product: 'NetWeaver', dateAdded: '2026-10-15', notes: '' }] })
  const shaKev = repo(join(dir, 'kev-data'), { 'known_exploited_vulnerabilities.json': kev })
  const alm = repo(join(dir, 'sap-docs', 'sapdocs-cloud-alm'), {
    'docs/importar-ordenes-1234567.md': pagina('1234567aaaabbbbccccddddeeeeffff0', 'Importing Requests', 'To import, run transaction `STMS` and choose the queue.\n\n## Lock Check (SM12)\n\nRead SAP Note [123456](https://me.sap.com/notes/123456) and SAP Note [Old Kernel Parameters](https://me.sap.com/notes/0000654321) first.\n\nThe report `RSUSR002` lists users.'),
  })
  const con = repo(join(dir, 'sap-docs', 'sapdocs-connectivity'), { 'docs/certificados-7654321.md': pagina('7654321aaaabbbbccccddddeeeeffff0', 'Trust Settings', 'Open the *Trust Manager* (transaction `STRUST`) and import the certificate.') })
  const trial = repo(join(dir, 'sap-docs', 'sapdocs-abap-trial'), { 'README.md': `# Trial\n\n${PROSA.pagina}\n\nCheck the system log in transaction SM21 if the system does not start.` })
  const pin = {
    capturadoEl: '2026-10-20', ventana: { desde: '2026-10-01', hasta: '2026-10-20' }, ultimoPatchDay: '2026-10-13',
    cvelist: { repo: 'CVEProject/cvelistV5', web: 'https://github.com/CVEProject/cvelistV5', sha: shaCve, licencia: 'CVE Terms of Use', cves: Object.keys(cves), descubiertos: { nvd: 2, kev: 1 } },
    kev: { repo: 'cisagov/kev-data', web: 'https://github.com/cisagov/kev-data', sha: shaKev, catalogVersion: '2026.10.01', licencia: 'CC0 1.0' },
    sapDocs: [
      { id: 'sapdocs-cloud-alm', repo: 'SAP-docs/cloud-alm-setup-admin-guide', web: 'https://github.com/SAP-docs/cloud-alm-setup-admin-guide', sha: alm, guia: 'Cloud ALM (sintética)', ayuda: 'https://help.sap.com/docs/cloud-alm/setup-administration', licencia: 'CC BY 4.0' },
      { id: 'sapdocs-connectivity', repo: 'SAP-docs/btp-connectivity', web: 'https://github.com/SAP-docs/btp-connectivity', sha: con, guia: 'Connectivity (sintética)', ayuda: 'https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf', licencia: 'CC BY 4.0' },
      { id: 'sapdocs-abap-trial', repo: 'SAP-docs/abap-platform-trial-image', web: 'https://github.com/SAP-docs/abap-platform-trial-image', sha: trial, guia: 'ABAP trial (sintética)', ayuda: null, licencia: 'CC BY 4.0' },
    ],
  }
  return { dir, pin, limpia: () => rmSync(dir, { recursive: true, force: true }) }
}

/** Unos candidatos de sapstack de juguete: dos T-codes de BASIS, un reporte tomado por T-code y una nota con otro título. */
export const SAPSTACK = [
  { id: 'tcode-stms', tipo: 'tcode', clave: 'STMS', titulo: 'Transport Management System', modulos: ['BASIS', 'BC'] },
  { id: 'tcode-smventiuno', tipo: 'tcode', clave: 'SM21', titulo: 'System Log', modulos: ['BASIS', 'BC'] },
  { id: 'tcode-rsusr', tipo: 'tcode', clave: 'RSUSR002', titulo: 'Users by Complex Criteria', modulos: ['BASIS', 'BC'] },
  { id: 'nota-vieja', tipo: 'nota', clave: '654321', titulo: 'Unicode conversion guide', modulos: ['BC'] },
]
