// Proceso de mentira para probar `motorPorProceso` sin ningun OCR instalado. Que hace lo decide MODO.
import { existsSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

const peticion = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const modo = process.env.MODO ?? 'bien'

if (modo === 'bien' || modo === 'confianza-en-texto') {
  const respuesta = {
    paginas: [{
      indice: 0,
      // El markdown lleva el directorio y si la imagen existia: es como la prueba comprueba
      // el ciclo de vida del temporal sin espiar por fuera.
      markdown: `dir=${dirname(peticion.imagen)} imagen=${existsSync(peticion.imagen)} mime=${peticion.tipoMime}`,
      confianza: modo === 'bien' ? 0.8 : 'alta',
      campos: [{ clave: 'total', valor: '1200.00', confianza: 0.9 }],
    }],
  }
  process.stdout.write(JSON.stringify(respuesta))
  process.exit(0)
}
if (modo === 'basura') { process.stdout.write('esto no es json'); process.exit(0) }
if (modo === 'falla') { process.stderr.write('extractor: falta el idioma spa\nTRAZA CON DATOS QUE NO DEBEN SALIR\n'); process.exit(2) }
if (modo === 'falla-sin-prefijo') { process.stderr.write('SECRETO\n'); process.exit(3) }
if (modo === 'cuelga') { setTimeout(() => {}, 600000) }
