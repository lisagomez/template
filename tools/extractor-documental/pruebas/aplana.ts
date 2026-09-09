import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aplanaEntradas, raicesDe, desdeInput } from '../dist/react/aplana.js'
import type { EntradaDeArchivo } from '../dist/react/aplana.js'

const archivoFalso = (nombre: string) => ({ name: nombre }) as unknown as File

function fichero(nombre: string, ilegible = false): EntradaDeArchivo {
  return {
    isFile: true,
    isDirectory: false,
    name: nombre,
    file(exito, fallo) {
      if (ilegible) fallo?.(new Error('permiso denegado'))
      else exito(archivoFalso(nombre))
    },
  }
}

/** Directorio que entrega sus hijos en lotes de 100, como hace el navegador de verdad. */
function carpeta(nombre: string, hijos: EntradaDeArchivo[]): EntradaDeArchivo {
  return {
    isFile: false,
    isDirectory: true,
    name: nombre,
    createReader() {
      let posicion = 0
      return {
        readEntries(exito) {
          const lote = hijos.slice(posicion, posicion + 100)
          posicion += lote.length
          exito(lote)
        },
      }
    },
  }
}

test('aplana un arbol de dos niveles conservando la ruta', async () => {
  const arbol = carpeta('facturas', [fichero('a.pdf'), carpeta('2026', [fichero('b.pdf')])])
  const { archivos } = await aplanaEntradas([arbol])
  assert.deepEqual(archivos.map((a) => a.ruta), ['facturas/a.pdf', 'facturas/2026/b.pdf'])
})

test('EL FALLO CARO: mas de 100 archivos exigen llamar a readEntries en bucle', async () => {
  // `readEntries` devuelve como mucho 100 por llamada. Quien lo llama una vez y ya, pierde el
  // resto EN SILENCIO: no hay error, solo faltan archivos. Por eso esta prueba usa 250.
  const muchos = Array.from({ length: 250 }, (_, i) => fichero(`f${i}.pdf`))
  const { archivos } = await aplanaEntradas([carpeta('lote', muchos)])
  assert.equal(archivos.length, 250, 'se perdieron archivos: readEntries no se llamo hasta agotar')
})

test('un archivo ilegible se nombra y NO aborta el lote', async () => {
  const { archivos, ilegibles } = await aplanaEntradas([
    carpeta('lote', [fichero('bueno.pdf'), fichero('roto.pdf', true), fichero('otro.pdf')]),
  ])
  assert.deepEqual(archivos.map((a) => a.ruta), ['lote/bueno.pdf', 'lote/otro.pdf'])
  assert.equal(ilegibles.length, 1)
  assert.equal(ilegibles[0].ruta, 'lote/roto.pdf', 'abortar por un archivo perderia los otros 299')
})

test('un arbol ciclico no cuelga el recorrido: se corta y se dice', async () => {
  // Un enlace que apunta a un ancestro. Sin tope, la recursion no termina.
  // Un directorio real termina su lectura: entrega sus hijos y luego un lote vacio. El ciclo esta
  // en que uno de esos hijos es el propio directorio, no en que la lectura no acabe nunca.
  const ciclica: EntradaDeArchivo = {
    isFile: false,
    isDirectory: true,
    name: 'bucle',
    createReader() {
      let entregado = false
      return {
        readEntries: (exito) => {
          // `entregado` se marca ANTES de llamar a `exito`: si `exito` reentra de forma sincrona
          // —que es lo que hacia la version recursiva del lector— con el orden inverso nunca
          // llegaria a marcarse y el lote se repetiria para siempre.
          const lote = entregado ? [] : [ciclica]
          entregado = true
          exito(lote)
        },
      }
    },
  }
  const { truncadoPorProfundidad, ilegibles } = await aplanaEntradas([ciclica])
  assert.equal(truncadoPorProfundidad, true)
  assert.ok(ilegibles.some((i) => /profundidad/.test(i.motivo)), 'cortar sin decirlo pareceria que la carpeta estaba vacia')
})

test('una carpeta vacia no produce nada ni rompe nada', async () => {
  const { archivos, ilegibles } = await aplanaEntradas([carpeta('vacia', [])])
  assert.deepEqual(archivos, [])
  assert.deepEqual(ilegibles, [])
})

test('un fichero suelto tambien vale como raiz', async () => {
  const { archivos } = await aplanaEntradas([fichero('suelto.pdf')])
  assert.deepEqual(archivos.map((a) => a.ruta), ['suelto.pdf'])
})

// --- Las dos vias distintas de §2.2 ---------------------------------------------------------------

test('raicesDe saca las entradas del DataTransfer con webkitGetAsEntry', () => {
  const raiz = carpeta('x', [])
  const raices = raicesDe({ items: [{ webkitGetAsEntry: () => raiz }, { webkitGetAsEntry: () => null }] })
  assert.deepEqual(raices, [raiz], 'los items sin entrada se descartan, no producen huecos')
})

test('un DataTransfer sin items no revienta', () => {
  assert.deepEqual(raicesDe({}), [])
})

test('desdeInput usa webkitRelativePath, que es lo que trae la via del selector', () => {
  const conRuta = Object.assign(archivoFalso('b.pdf'), { webkitRelativePath: 'facturas/2026/b.pdf' })
  assert.deepEqual(desdeInput([conRuta]).map((a) => a.ruta), ['facturas/2026/b.pdf'])
})

test('sin webkitRelativePath se cae al nombre, en vez de dejar la ruta vacia', () => {
  assert.deepEqual(desdeInput([archivoFalso('suelto.pdf')]).map((a) => a.ruta), ['suelto.pdf'])
})
