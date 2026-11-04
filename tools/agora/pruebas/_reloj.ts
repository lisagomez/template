/**
 * El reloj de las pruebas de Ágora: las suites corren como si fuera AHORA_DE_PRUEBAS, y el tiempo sigue avanzando
 * desde ahí.
 *
 * POR QUÉ. La siembra del laboratorio vive en octubre de 2026 (gasto hasta el 27, tipos de cambio hasta el 28) y las
 * comprobaciones se escribieron contra ese mes. Con el reloj real se caían solas al pasar el tiempo: el 2026-11-01 (el
 * «gasto del mes» ya miraba noviembre) y el 2026-11-03 (sin tipo de cambio en los cinco días previos). El #293 lo
 * parchó prueba por prueba; esto lo arregla de fondo, y esos parches se quitaron.
 *
 * CÓMO. PGlite corre en WebAssembly y su `now()` (también `current_date` y `clock_timestamp()`) sale del `Date.now()`
 * de este proceso. Desplazarlo aquí mueve juntos la base y el código: la Puerta, las tareas, los socios y el calendario
 * de laboratorio solo leen la hora con `Date.now()`. No toca migraciones ni la base real, y ningún rol puede moverlo.
 *
 * LÍMITE. Contra PostgreSQL real (`AGORA_PG_URL`) no se instala: allí `now()` es la hora del servidor, y desplazar
 * solo el lado de Node dejaría dos relojes distintos. Esas corridas siguen atadas a la fecha.
 *
 * El día elegido es el del merge del #287 (2026-10-29), cuando la suite se midió entera en verde con el reloj real.
 */
export const AHORA_DE_PRUEBAS = '2026-10-29T12:00:00-06:00'

const enPglite = !process.env.AGORA_PG_URL
if (enPglite) {
  const real = Date.now.bind(Date)
  const desfase = Date.parse(AHORA_DE_PRUEBAS) - real()
  Date.now = () => real() + desfase
}

/** Qué reloj usa esta corrida, para que la evidencia lo diga. */
export const relojDeLaCorrida = enPglite ? `fijo desde ${AHORA_DE_PRUEBAS} (PGlite)` : 'real (PostgreSQL)'
