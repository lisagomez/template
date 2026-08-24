#!/usr/bin/env node
/**
 * Prueba de la contabilidad de tokens. Corre dentro de `npm run validate`.
 *
 * Node ejecuta TypeScript directo (type stripping), asi que esto prueba **el modulo real**
 * que usa la app, no una copia en JS que se desincronizaria al primer cambio.
 *
 * Lo que se prueba es justo lo que un gate puede probar sin BD y sin red: la aritmetica del
 * coste, el aviso al 80 %, el corte al 100 % y —la que mas importa— que una llamada sin
 * datos de uso NO se cuente como cero.
 */
import { registraUso, estadoPresupuesto, type EventoDeUso, type Registrador } from '../src/lib/ai/contabilidad.ts'
import { costeUsd } from '../src/lib/ai/routing.ts'

const verde = (s: string) => `\x1b[32m${s}\x1b[0m`
const rojo = (s: string) => `\x1b[31m${s}\x1b[0m`
const gris = (s: string) => `\x1b[2m${s}\x1b[0m`

let fallos = 0
function comprueba(descripcion: string, condicion: boolean, detalle = '') {
  console.log(`  ${condicion ? verde('✓') : rojo('✗')} ${descripcion}${detalle ? gris(`  ${detalle}`) : ''}`)
  if (!condicion) fallos++
}

// Registrador falso: la lógica se prueba sin base de datos, que es la razón de inyectarlo.
const guardados: EventoDeUso[] = []
const falso: Registrador = {
  async guarda(evento) {
    guardados.push(evento)
  },
  async resumen() {
    return {
      gastadoUsd: guardados.reduce((a, e) => a + (e.costoUsd ?? 0), 0),
      filasSinCosto: guardados.filter((e) => e.costoUsd === null).length,
    }
  },
}

console.log('Contabilidad de tokens\n')

// --- 1. El coste sale del catalogo, y el cache cuenta aparte ----------------
const sinCache = costeUsd('implementar-feature', { entrada: 1_000_000, salida: 100_000 })
const conCache = costeUsd('implementar-feature', { entrada: 1_000_000, salida: 100_000, cacheados: 900_000 })
comprueba('un millon de entrada + 100k de salida en `capaz` cuesta $3', Math.abs(sinCache - 3) < 1e-9, `$${sinCache.toFixed(2)}`)
// $1.38 = 100k frescos x $2/M + 900k cacheados x $0.20/M + 100k salida x $10/M.
// La primera version de esta prueba esperaba $1.18 y el rojo era MIO, no del modulo:
// habia contado la salida a medias. Queda escrito porque una prueba que se ajusta al
// codigo sin entender por que no prueba nada.
comprueba('con 900k servidos desde cache baja a $1.38', Math.abs(conCache - 1.38) < 1e-9, `$${conCache.toFixed(2)}`)
comprueba('el cache abarata la entrada, no la salida', conCache < sinCache && conCache > 1)

// --- 2. Registro ------------------------------------------------------------
await registraUso(falso, 'titulo-de-sesion', { entrada: 2_000, salida: 200 })
await registraUso(falso, 'revision-de-codigo', { entrada: 500_000, salida: 50_000 })
comprueba('registra el modelo que le toca a la tarea, no uno cualquiera', guardados[0].modelo.includes('haiku'), guardados[0].modelo)
comprueba('dos llamadas registradas', guardados.length === 2)

// --- 3. La llamada sin uso NO se cuenta como cero ---------------------------
await registraUso(falso, 'documentacion', null)
const resumen = await falso.resumen()
comprueba('una llamada sin datos de uso se guarda con coste null', guardados[2].costoUsd === null)
comprueba('y se cuenta como fila sin costear, no como cero', resumen.filasSinCosto === 1)
const parcial = estadoPresupuesto(resumen.gastadoUsd, 100, resumen.filasSinCosto)
comprueba('el mensaje avisa de que la cifra real es MAYOR', parcial.mensaje.includes('MAYOR'), parcial.mensaje)

// --- 4. Aviso al 80 % y corte al 100 % --------------------------------------
const ok = estadoPresupuesto(50, 100)
const aviso = estadoPresupuesto(80, 100)
const excedido = estadoPresupuesto(120, 100)
comprueba('50 de 100 -> ok', ok.nivel === 'ok' && !ok.recomiendaCortar)
comprueba('80 de 100 -> aviso (el umbral es >=, no >)', aviso.nivel === 'aviso' && !aviso.recomiendaCortar, aviso.mensaje)
comprueba('120 de 100 -> excedido y RECOMIENDA cortar', excedido.nivel === 'excedido' && excedido.recomiendaCortar, excedido.mensaje)
comprueba('recomendar no es cortar: el modulo no corta nada por su cuenta', typeof excedido.recomiendaCortar === 'boolean')

// --- 5. Un presupuesto imposible falla ruidosamente -------------------------
let reventó = false
try {
  estadoPresupuesto(10, 0)
} catch {
  reventó = true
}
comprueba('presupuesto cero -> error, no una division silenciosa', reventó)

console.log(fallos === 0 ? verde('\n✓ Contabilidad correcta.') : rojo(`\n${fallos} comprobacion(es) en rojo.`))
process.exit(fallos === 0 ? 0 : 1)
