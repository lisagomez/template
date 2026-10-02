/**
 * Las siembras de `verifica-evidencia.mjs --prueba`: cada una rompe UNA regla sobre una copia en
 * memoria de una corrida en verde, y el verificador tiene que ponerla roja con el codigo esperado.
 * Si una no cae, la regla es decoracion. Cubren las tres fugas que el goal nombro (dolor sin cita,
 * ruta inexistente, cita que no dice lo afirmado) y cada «nada se tira en silencio».
 *
 * `siembra(analisis, base)` muta `analisis` y puede devolver archivos sustitutos de la corrida.
 */
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const primeraCita = (a, tipo) => {
  for (const h of a.hallazgos) {
    const ev = h.evidencia.find((e) => e.tipo === tipo)
    if (ev) return { h, ev }
  }
  throw new Error(`la corrida base no tiene ninguna cita de tipo ${tipo} para sembrar`)
}

const primerCandidato = (a) => a.candidatos.find((p) => p.id === a.ranking[0])

export const SIEMBRAS = [
  {
    nombre: 'dolor sin evidencia',
    espera: 'E-GRADO',
    siembra: (a) => { a.hallazgos[0].evidencia = [] },
  },
  {
    nombre: 'cita a una ruta que no existe',
    espera: 'E-CITA',
    siembra: (a) => { primeraCita(a, 'archivo').ev.ruta = 'docs/NO-EXISTE-ESTE-ARCHIVO.md' },
  },
  {
    nombre: 'cita que la fuente no dice',
    espera: 'E-CITA',
    siembra: (a) => { const { ev } = primeraCita(a, 'archivo'); ev.cita = `${ev.cita} y ademas todo lo contrario` },
  },
  {
    nombre: 'commit que no existe',
    espera: 'E-CITA',
    siembra: (a) => { a.hallazgos[0].evidencia.push({ tipo: 'commit', sha: 'deadbeef', cita: 'arregla todo' }) },
  },
  {
    nombre: 'cita a un archivo posterior al commit analizado (una corrida es una foto)',
    espera: 'E-CITA',
    siembra: (a) => { a.hallazgos[0].evidencia.push({ tipo: 'archivo', ruta: 'docs/analisis/2026-10-02/INFORME.md', cita: 'Dónde duele el repo' }) },
  },
  {
    nombre: 'commit posterior al analizado',
    espera: 'E-CITA',
    siembra: (a) => {
      // solo la rama actual (HEAD), nunca --all: otras ramas incluyen la del corpus ciego
      const posterior = execFileSync('git', ['rev-list', '-1', 'HEAD', '--not', a.commit], { cwd: raiz, encoding: 'utf8' }).trim()
      if (!posterior) throw new Error('no hay commits despues del analizado: la prueba se corre con la corrida ya commiteada')
      a.hallazgos[0].evidencia.push({ tipo: 'commit', sha: posterior, cita: '' })
    },
  },
  {
    nombre: 'PR que no esta en la historia',
    espera: 'E-CITA',
    siembra: (a) => { a.hallazgos[0].evidencia.push({ tipo: 'pr', numero: 99999 }) },
  },
  {
    nombre: 'captura de medicion que declara otro comando',
    espera: 'E-CITA',
    siembra: (a) => { primeraCita(a, 'medicion').ev.comando = 'npm run otro-medidor' },
  },
  {
    nombre: 'grado inflado (un documento vendido como medicion)',
    espera: 'E-GRADO',
    siembra: (a) => {
      const h = a.hallazgos.find((x) => !x.evidencia.some((e) => e.tipo === 'medicion'))
      if (!h) throw new Error('la corrida base no tiene un hallazgo sin medicion para sembrar')
      h.grado = 'medida'
    },
  },
  {
    nombre: 'activo del inventario omitido de la cobertura',
    espera: 'E-COBERTURA',
    siembra: (a) => { a.cobertura = a.cobertura.slice(1) },
  },
  {
    nombre: 'hallazgo que no cae en ningun caso',
    espera: 'E-HUERFANO',
    siembra: (a) => {
      const id = a.hallazgos[0].id
      a.hallazgos[0].sin_caso = null
      for (const c of a.casos) c.dolores = c.dolores.filter((d) => d !== id)
    },
  },
  {
    nombre: 'cifra que su literal no dice',
    espera: 'E-CIFRA',
    siembra: (a) => { a.cifras[0].valor = '987654' },
  },
  {
    nombre: 'marcador de cifra que no existe en el informe',
    espera: 'E-CIFRA',
    siembra: (a, base) => ({ 'INFORME.md': `${base.lee('INFORME.md')}\nUna cifra sin fuente [C-99].\n` }),
  },
  {
    nombre: 'solidez elegida a mano',
    espera: 'E-PUNTUACION',
    siembra: (a) => { const p = primerCandidato(a); p.puntuacion.solidez = p.puntuacion.solidez === 3 ? 1 : 3 },
  },
  {
    nombre: 'candidato vetado que sigue en el ranking',
    espera: 'E-VETO',
    siembra: (a) => { primerCandidato(a).veto = { control: 'C4', motivo: 'siembra: dana a terceros sin mitigar' } },
  },
  {
    nombre: 'one-pager con las piezas antes que el usuario',
    espera: 'E-ONEPAGER',
    siembra: (a, base) => {
      const p = primerCandidato(a)
      const texto = base.lee(p.onepager)
      const inicio = texto.search(/^##\s+Qu[eé] se recombina/im)
      const fin = texto.slice(inicio + 3).search(/^## /m)
      const seccion = fin < 0 ? texto.slice(inicio) : texto.slice(inicio, inicio + 3 + fin)
      const resto = texto.replace(seccion, '')
      const primera = resto.search(/^## /m)
      return { [p.onepager]: `${resto.slice(0, primera)}${seccion}${resto.slice(primera)}` }
    },
  },
  {
    nombre: 'hipotesis de la peticion sin veredicto',
    espera: 'E-BORRADOR',
    siembra: (a) => { const ultima = a.peticion.hipotesis.at(-1).id; a.borrador = a.borrador.filter((b) => b.id !== ultima) },
  },
]
