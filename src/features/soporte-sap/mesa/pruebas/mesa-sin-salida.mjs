#!/usr/bin/env node
/**
 * La mesa SIN SALIDA a internet, para probar con evidencia lo que promete su conversación: nada sale de esta máquina, y lo
 * que se guarda, se guarda solo en el almacén de la mesa (goal «capa Arbrain», punto 9 del HECHO).
 *
 * La misma imagen de `docs/MESA-DEL-EXPERTO.md` («Probar en esta máquina»), endurecida para la prueba:
 *   · la mesa vive en una red interna de Docker (`--internal`): no tiene ruta hacia fuera de su subred;
 *   · su sistema de archivos es de solo lectura: solo escribe en el almacén (`/datos`, un volumen) y en `/tmp` (en memoria);
 *   · las llaves de Access de prueba las sirve un contenedor que comparte su red, en su 127.0.0.1 (nada del anfitrión);
 *   · el navegador entra por una puerta local (127.0.0.1:<puerto>), un contenedor que solo reenvía bytes a la mesa.
 *
 * Mide: qué intenta salir desde dentro de la mesa (rutas, una IP pública, el anfitrión), `docker diff` y el almacén antes y
 * después del recorrido, qué quedó del experto en el almacén y en los logs, y corre los recorridos con Playwright.
 *
 *   node src/features/soporte-sap/mesa/pruebas/mesa-sin-salida.mjs <imagen> <carpeta-de-trabajo> <capturas> [--recorrido-mesa]
 *
 * Variables: MESA_PUERTO (8090). Sale con 1 si algo sale, si algo se guarda fuera del almacén o si un recorrido falla.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { identidadLocal } from '../../../../../scripts/laboratorio-alojado/identidad-local.mjs'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const [imagen, trabajoArg, capturasArg] = args
if (!imagen || !trabajoArg || !capturasArg) { console.error('uso: mesa-sin-salida.mjs <imagen> <carpeta-de-trabajo> <capturas> [--recorrido-mesa]'); process.exit(2) }
const trabajo = resolve(trabajoArg), capturas = resolve(capturasArg)
const PUERTO = Number(process.env['MESA_PUERTO'] ?? 8090)
const sufijo = randomBytes(3).toString('hex')
const RED = `mesa-sin-salida-${sufijo}`, MESA = `mesa-conversacion-${sufijo}`, LLAVES = `${MESA}-llaves`, PUERTA = `${MESA}-puerta`

const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const intenta = (...a) => { const r = spawnSync('docker', a, { encoding: 'utf8' }); return `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() }
const huella = (f) => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16)
const archivosDe = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivosDe(join(d, e.name)) : [join(d, e.name)]))
const listado = (d) => Object.fromEntries(archivosDe(d).map((f) => [relative(d, f), huella(f)]))

// --- Identidad, llaves y almacén -------------------------------------------------------------------------------------
mkdirSync(capturas, { recursive: true })
const id = identidadLocal(join(trabajo, 'identidad'))
/** Si la identidad se generó con el CLI (`identidad-local.mjs <carpeta> http://127.0.0.1:8798/certs /datos`), la mesa arranca
 *  con su `app.env`, como en `docs/MESA-DEL-EXPERTO.md`; si no, con las mismas variables una por una. De ese archivo solo se
 *  anotan los NOMBRES de las variables. */
const appEnv = join(trabajo, 'identidad', 'app.env')
const entorno = existsSync(appEnv)
  ? ['--env-file', appEnv]
  : ['-e', 'ACCESS_EQUIPO=prueba-local', '-e', `ACCESS_AUD=${id.aud}`, '-e', 'MESA_EXPERTOS=experto@prueba.local', '-e', 'MESA_LABORATORIO=laboratorio@prueba.local']
const dirLlaves = join(trabajo, 'llaves'), almacen = join(trabajo, 'almacen')
mkdirSync(dirLlaves, { recursive: true }); mkdirSync(almacen, { recursive: true })
writeFileSync(join(dirLlaves, 'certs'), JSON.stringify(id.jwks))
chmodSync(join(dirLlaves, 'certs'), 0o644)
chmodSync(almacen, 0o777) // la mesa corre como uid 1001 dentro del contenedor

const SIRVE_LLAVES = "const fs=require('fs');require('http').createServer((q,r)=>{if(q.url!=='/certs'){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':'application/json'});r.end(fs.readFileSync('/llaves/certs'))}).listen(8798,'127.0.0.1')"
const REENVIA = `const net=require('net');net.createServer((c)=>{const s=net.connect(8080,'${MESA}');c.pipe(s).pipe(c);s.on('error',()=>c.destroy());c.on('error',()=>s.destroy())}).listen(8090,'0.0.0.0')`
/** Lo que se intenta desde DENTRO de la mesa: salir por IP, resolver un nombre de fuera (el DNS de Docker podría reenviarlo
 *  al del anfitrión: sería una salida), llegar a algo que escucha fuera de su red y, como control de que la red funciona,
 *  sus llaves en su propio 127.0.0.1. */
const SONDA = `const net=require('net');const fs=require('fs');
const conecta=(h,p)=>new Promise((ok)=>{const s=net.connect({host:h,port:p,timeout:4000});s.on('connect',()=>{s.destroy();ok('CONECTÓ')});s.on('timeout',()=>{s.destroy();ok('sin respuesta en 4 s')});s.on('error',(e)=>ok(e.code||e.message))});
(async()=>{const rutas=fs.readFileSync('/proc/net/route','utf8').trim().split('\\n').slice(1).map((l)=>l.split(/\\s+/)).map((c)=>({interfaz:c[0],destino:c[1],puerta:c[2]}));
const r={rutas,rutaPorDefecto:rutas.some((x)=>x.destino==='00000000'),ipPublica:await conecta('1.1.1.1',443),httpsPorIp:await fetch('https://1.1.1.1/',{signal:AbortSignal.timeout(5000)}).then((x)=>'RESPONDIÓ '+x.status,(e)=>(e.cause&&e.cause.code)||e.name),
fueraDeSuRed:await conecta(process.argv[1],8090),nombreExterno:await require('dns').promises.lookup('example.com').then((x)=>'RESOLVIÓ '+x.address,(e)=>e.code||e.message),llavesEnSu127:await fetch('http://127.0.0.1:8798/certs').then((x)=>'RESPONDIÓ '+x.status,(e)=>(e.cause&&e.cause.code)||e.name)};console.log(JSON.stringify(r))})()`

const evidencia = { imagen, red: RED, fecha: new Date().toISOString() }
const limpia = () => { for (const c of [PUERTA, LLAVES, MESA]) intenta('rm', '-f', c); intenta('network', 'rm', RED) }
process.on('exit', limpia)

try {
  docker('network', 'create', '--internal', RED)
  docker('run', '-d', '--name', MESA, '--network', RED, '--read-only', '--tmpfs', '/tmp:rw,size=256m', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    ...entorno, '-e', 'ACCESS_CERTS_URL=http://127.0.0.1:8798/certs', '-e', 'MESA_ALMACEN=disco', '-e', 'MESA_ALMACEN_DIR=/datos', '-v', `${almacen}:/datos`, imagen)
  evidencia.entorno = existsSync(appEnv) ? { appEnv: readFileSync(appEnv, 'utf8').split('\n').filter(Boolean).map((l) => l.split('=')[0]) } : 'variables una por una'
  docker('run', '-d', '--name', LLAVES, '--network', `container:${MESA}`, '--read-only', '--cap-drop', 'ALL', '-v', `${dirLlaves}:/llaves:ro`, '--entrypoint', 'node', imagen, '-e', SIRVE_LLAVES)
  docker('run', '-d', '--name', PUERTA, '-p', `127.0.0.1:${PUERTO}:8090`, '--read-only', '--cap-drop', 'ALL', '--entrypoint', 'node', imagen, '-e', REENVIA)
  docker('network', 'connect', RED, PUERTA)
  // Los IDs de Docker (red y extremo) van recortados a 12, como los enseña `docker ps`: 64 hex sueltos tienen la forma
  // de una llave de Hetzner y la auditoría de credenciales los caza (no son secretos, pero tampoco hacen falta enteros).
  const corto = (_k, v) => (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v.slice(0, 12) : v)
  evidencia.redes = { mesa: JSON.parse(docker('inspect', '-f', '{{json .NetworkSettings.Networks}}', MESA), corto), red: JSON.parse(docker('network', 'inspect', '-f', '{{json .Internal}}', RED)) }
  evidencia.puertosPublicados = { mesa: docker('port', MESA) || 'ninguno', puerta: docker('port', PUERTA) }

  // Lista cuando contesta la mesa con una identidad válida.
  const jwt = id.firma({ email: 'experto@prueba.local' })
  const hasta = Date.now() + 120_000
  for (;;) {
    const ok = await fetch(`http://127.0.0.1:${PUERTO}/api/mesa/soporte-sap`, { headers: { 'cf-access-jwt-assertion': jwt } }).then((r) => r.status === 200, () => false)
    if (ok) break
    if (Date.now() > hasta) throw new Error(`la mesa no contestó en 120 s:\n${intenta('logs', '--tail', '30', MESA)}`)
    await new Promise((r) => setTimeout(r, 1500))
  }
  // Algo que SÍ escucha fuera de la red de la mesa: la puerta, en la red por defecto de Docker (desde ahí la alcanza el anfitrión).
  const fuera = docker('inspect', '-f', '{{.NetworkSettings.Networks.bridge.IPAddress}}', PUERTA)
  evidencia.salida = { ...JSON.parse(docker('exec', MESA, 'node', '-e', SONDA, fuera)), fueraEs: `${fuera}:8090 (la puerta, en la red por defecto)` }
  evidencia.antes = { diff: intenta('diff', MESA) || '(sin cambios)', almacen: listado(almacen) }

  // Los recorridos, contra la puerta local.
  const corre = (archivo, extra = [], destino = capturas) => spawnSync('node', [archivo, `http://127.0.0.1:${PUERTO}`, destino, ...extra], { encoding: 'utf8', env: { ...process.env, MESA_IDENTIDAD: `local:${join(trabajo, 'identidad')}`, MESA_LLAVES_PUERTO: '8797' } })
  const recorridos = {}
  // El de siempre primero (cuenta con su lista de casos tal como la deja él); sus capturas no van a la evidencia: se quedan
  // en la carpeta de trabajo. La conversación después: su guía de primer arranque sale en un navegador nuevo.
  if (process.argv.includes('--recorrido-mesa')) recorridos.mesa = corre('src/features/soporte-sap/mesa/pruebas/recorrido-mesa.mjs', [], join(trabajo, 'capturas-recorrido-mesa'))
  recorridos.conversacion = corre('src/features/soporte-sap/mesa/pruebas/recorrido-conversacion.mjs', ['--sin-llaves'])
  for (const [k, r] of Object.entries(recorridos)) { console.log(`\n--- recorrido ${k} (salida ${r.status}) ---\n${r.stdout}${r.stderr}`); evidencia[`recorrido_${k}`] = { salida: r.status, resumen: r.stdout.trim().split('\n').slice(-12) } }

  // Después: qué cambió en el contenedor, en el almacén, y qué quedó del experto.
  evidencia.despues = { diff: intenta('diff', MESA) || '(sin cambios)', almacen: listado(almacen) }
  const nuevos = Object.keys(evidencia.despues.almacen).filter((k) => !(k in evidencia.antes.almacen))
  const contenido = archivosDe(almacen).map((f) => readFileSync(f, 'utf8')).join('\n')
  const logs = intenta('logs', MESA)
  const tmp = intenta('exec', MESA, 'sh', '-c', 'find /tmp -type f 2>/dev/null | head -40')
  const SOLO_CONVERSACION = ['por qué dijiste no lo sé', 'muéstrame lo que te enseñé', 'vuelve a correr el último caso']
  const CASOS = ['la app de Fiori abre en blanco tras el transporte', 'MIGO da M7 053', 'Una app del launchpad de Fiori abre en blanco después del transporte']
  evidencia.almacen = {
    nuevos, todosSonCasosOValidaciones: nuevos.every((k) => /^mesa\/(casos|validaciones)\/[^/]+\.json$/.test(k)),
    conversacionEnElAlmacen: SOLO_CONVERSACION.filter((t) => contenido.includes(t)),
    casosEnElAlmacen: CASOS.filter((t) => contenido.includes(t)),
    datoPersonalEnElAlmacen: contenido.includes('juan.perez'),
  }
  evidencia.logs = { lineas: logs.split('\n').length, textoDelExperto: [...SOLO_CONVERSACION, ...CASOS, 'juan.perez'].filter((t) => logs.includes(t)) }
  evidencia.tmp = { archivos: tmp ? tmp.split('\n') : [], textoDelExperto: tmp ? intenta('exec', MESA, 'sh', '-c', `grep -rlE 'Fiori abre|MIGO da|juan\\.perez|por qué dijiste' /tmp 2>/dev/null || true`) : '' }
} catch (e) {
  evidencia.error = e instanceof Error ? e.message : String(e)
}

writeFileSync(join(capturas, 'sin-salida-evidencia.json'), `${JSON.stringify(evidencia, null, 2)}\n`)
const s = evidencia.salida ?? {}
const nadaSale = s.rutaPorDefecto === false && s.ipPublica !== 'CONECTÓ' && !String(s.httpsPorIp ?? '').startsWith('RESPONDIÓ') && s.fueraDeSuRed !== 'CONECTÓ' && !String(s.nombreExterno ?? '').startsWith('RESOLVIÓ') && String(s.llavesEnSu127 ?? '').startsWith('RESPONDIÓ 200')
const a = evidencia.almacen ?? {}
// `docker diff` anota «A /datos»: el punto de montaje del almacén, que Docker crea al montarlo. Fuera de él, nada.
const diffLimpio = evidencia.despues?.diff === evidencia.antes?.diff && String(evidencia.despues?.diff ?? '').split('\n').every((l) => l === 'A /datos' || l === '(sin cambios)')
const soloEnSuAlmacen = a.todosSonCasosOValidaciones === true && a.conversacionEnElAlmacen?.length === 0 && a.datoPersonalEnElAlmacen === false && diffLimpio && evidencia.logs?.textoDelExperto?.length === 0 && evidencia.tmp?.archivos?.length === 0
const recorridosOk = Object.keys(evidencia).filter((k) => k.startsWith('recorrido_')).every((k) => evidencia[k].salida === 0)
console.log(`\nRed de la mesa interna: ${evidencia.redes?.red} · ruta por defecto: ${s.rutaPorDefecto} · a 1.1.1.1:443: ${s.ipPublica} · https por IP: ${s.httpsPorIp} · example.com: ${s.nombreExterno} · a ${s.fueraEs}: ${s.fueraDeSuRed} · sus llaves en su 127.0.0.1: ${s.llavesEnSu127}`)
console.log(`docker diff después: ${evidencia.despues?.diff} · nuevos en el almacén: ${a.nuevos?.length} (solo casos o validaciones: ${a.todosSonCasosOValidaciones}) · conversación en el almacén: ${JSON.stringify(a.conversacionEnElAlmacen)} · dato personal: ${a.datoPersonalEnElAlmacen} · texto del experto en los logs: ${JSON.stringify(evidencia.logs?.textoDelExperto)}`)
console.log(`${nadaSale ? '✓' : '✗'} nada sale de la máquina · ${soloEnSuAlmacen ? '✓' : '✗'} solo se guarda en su almacén · ${recorridosOk ? '✓' : '✗'} recorridos${evidencia.error ? `\nERROR: ${evidencia.error}` : ''}`)
process.exitCode = nadaSale && soloEnSuAlmacen && recorridosOk && !evidencia.error ? 0 : 1
