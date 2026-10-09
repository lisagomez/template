/**
 * Los controles de despliegue y superficie que el C3 afirma, cada uno con la comprobación que se pone
 * roja si falta (goal de firmas de la AISIA y el C3, 2026-10-05): la ruta del laboratorio se apaga sin
 * su variable, `configura:deploy` la rechaza en producción, el job de la capa semántica va pineado y el
 * OCR corre con memoria acotada. Leen el repo: son controles de configuración, no de comportamiento.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { RAIZ, lee } from './_ayuda.ts'

const GUARDA = 'if (!encendido()) return apagado()'

test('la ruta del laboratorio responde 404 sin SOPORTE_SAP_LABORATORIO=1: cada método empieza con la guarda', () => {
  const carpeta = 'src/app/api/soporte-sap'
  const rutas = readdirSync(join(RAIZ, carpeta), { recursive: true }).map(String).filter((f) => f.endsWith('route.ts'))
  assert.ok(rutas.length > 0)
  for (const f of rutas) {
    const fuente = lee(`${carpeta}/${f}`)
    // PRP-010 H-25: antes buscaba solo `export async function`, y el GET no es async: nunca se revisaba.
    const metodos = [...fuente.matchAll(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b[^{]*\{\n\s*([^\n]+)/g)]
    const exportados = [...fuente.matchAll(/export (?:async )?(?:function|const) (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1])
    assert.ok(metodos.length > 0, `${f}: sin métodos`)
    assert.deepEqual(metodos.map((m) => m[1]), exportados, `${f}: cada método exportado se revisa`)
    for (const [, metodo, primera] of metodos) assert.equal(primera!.trim(), GUARDA, `${f} ${metodo}: la primera línea no es la guarda`)
    assert.match(fuente, /const apagado = \(\) => NextResponse\.json\(.*\{ status: 404 \}\)/)
  }
  assert.match(lee('src/features/soporte-sap/services/runtime.ts'), /export const encendido = \(\): boolean => process\.env\['SOPORTE_SAP_LABORATORIO'\] === '1'/)
})

test('H-25 · la ruta del laboratorio no le devuelve al usuario un error interno: solo los rechazos del laboratorio llevan su mensaje', () => {
  const ruta = lee('src/app/api/soporte-sap/route.ts')
  const runtime = lee('src/features/soporte-sap/services/runtime.ts')
  assert.match(ruta, /const publico = e instanceof z\.ZodError \? 'datos inválidos' : e instanceof Rechazo \? e\.message : null/, 'el mensaje sale solo de un rechazo')
  assert.match(ruta, /error: publico \?\? 'error interno del laboratorio'/, 'lo demás sale como error interno')
  assert.doesNotMatch(ruta, /e instanceof Error \? e\.message/, 'ningún Error cualquiera')
  assert.doesNotMatch(runtime, /throw new Error\(/, 'las reglas del runtime son rechazos con nombre')
})

test('configura:deploy rechaza el laboratorio en producción y un SS_PG_HOST sin su usuario, sin imprimir la contraseña', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ss-deploy-'))
  try {
    const corre = (contenido: string): string => {
      const env = join(dir, 'env')
      writeFileSync(env, contenido)
      const r = spawnSync(process.execPath, ['scripts/configura-deploy.mjs'], { cwd: RAIZ, env: { ...process.env, ENV_PRODUCCION: relative(RAIZ, env) }, encoding: 'utf8' })
      return (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, '')
    }
    assert.match(corre('SOPORTE_SAP_LABORATORIO=1\n'), /SOPORTE_SAP_LABORATORIO=1 enciende el laboratorio de Soporte SAP/)
    assert.doesNotMatch(corre('SOPORTE_SAP_LABORATORIO=0\n'), /SOPORTE_SAP_LABORATORIO=1 enciende/)
    const sinUsuario = corre('SS_PG_HOST=db\nSS_PG_PASSWORD=clave-sintetica-de-prueba\n')
    assert.match(sinUsuario, /SS_PG_HOST está puesto pero falta SS_PG_USER o SS_PG_PASSWORD/)
    assert.doesNotMatch(sinUsuario, /clave-sintetica-de-prueba/, 'la contraseña nunca se imprime: solo su presencia')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('el job de la capa semántica va pineado: imagen base por digest, lock con hashes y Postgres de los ensayos por digest', () => {
  const docker = lee('tools/soporte-sap/semantica/Dockerfile')
  const desde = docker.split('\n').filter((l) => /^FROM /.test(l))
  assert.ok(desde.length > 0 && desde.every((l) => /^FROM [a-z0-9./_-]+@sha256:[0-9a-f]{64}\s*$/.test(l)), `FROM por digest: ${desde.join(' | ')}`)
  assert.match(docker, /pip install --require-hashes -r requirements\.lock/)
  const lock = lee('tools/soporte-sap/semantica/requirements.lock')
  const bloques = lock.split(/\n(?=[a-z0-9][a-z0-9._-]*==)/i).filter((b) => /^[a-z0-9][a-z0-9._-]*==/i.test(b))
  assert.ok(bloques.length > 0)
  const sinHash = bloques.filter((b) => !/--hash=sha256:[0-9a-f]{64}/.test(b)).map((b) => b.split(' ')[0])
  assert.deepEqual(sinHash, [], 'cada paquete del lock lleva su hash')
  for (const p of ['dbt-core==1.12.5', 'dbt-postgres==1.11.0', 'dbt-metricflow==0.15.0', 'metricflow==0.213.0']) assert.ok(lock.includes(`\n${p} `), p)
  assert.match(lee('tools/soporte-sap/semantica/imagen.mjs'), /IMAGEN_POSTGRES = 'postgres@sha256:[0-9a-f]{64}'/)
})

test('el OCR y el job de la capa semántica corren con memoria acotada en su contenedor', () => {
  const compose = lee('docker-compose.yml')
  const servicio = (nombre: string): string => {
    const i = compose.indexOf(`\n  ${nombre}:\n`)
    if (i < 0) return ''
    const resto = compose.slice(i + 1)
    const fin = resto.slice(1).search(/\n {2}[a-z][a-z0-9-]*:\n|\n[a-z]/)
    return fin < 0 ? resto : resto.slice(0, fin + 1)
  }
  for (const s of ['ocr', 'semantica']) assert.match(servicio(s), /limits:\n\s+cpus: [^\n]+\n\s+memory: \S+/, `${s}: sin límite de memoria`)
})
