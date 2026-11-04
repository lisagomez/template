# El reloj de las pruebas sobre PGlite

Medido el 2026-11-04, al arreglar de fondo las fechas de Ágora (#297).

## PGlite toma la hora de Node

PGlite corre en WebAssembly, y su `now()`, `current_date`, `clock_timestamp()` y `statement_timestamp()` salen de
`Date.now()` del proceso de Node. Si se reemplaza `Date.now` por `() => real() + desfase` **antes** de crear la base,
la base y el código leen la misma hora desplazada, y el tiempo sigue avanzando. `new Date()` sin argumentos **no** se
mueve: solo sirve si el código lee la hora con `Date.now()`.

Así quedó `tools/agora/pruebas/_reloj.ts`: las suites empiezan el 2026-10-29 y ya no se caen al cambiar de mes. La otra
vía, inyectar un reloj en la base cambiando `now()` en las migraciones, costaba 72 cambios y abría un reloj que un rol
podría mover. Contra PostgreSQL real el truco no aplica: ahí `now()` es la hora del servidor, y mover solo Node dejaría
dos relojes.

**Cuándo usarlo:** si otra herramienta que prueba sobre PGlite (`calendario`, `clinica-dental`, `sala-a2a`, `soporte-sap`,
`ventas-whatsapp`) empieza a caer por fecha. Mismo patrón: un módulo de reloj que la base de pruebas importa **primero**,
una prueba del reloj y una contraprueba sin él.

## Una prueba no importa lo que vigila

La primera versión de `tools/agora/pruebas/reloj.ts` importaba `_reloj.ts` directamente para leer la constante del día.
Con eso instalaba el reloj por su cuenta, y la contraprueba (quitar el import de `_base.ts`) seguía en verde: la prueba
no vigilaba nada. Se arregló reexportando el reloj desde `_base.ts` y tomándolo por `_marco.ts`, como las demás suites.

**Regla:** la prueba de un efecto de importación (un reloj, un polyfill, un registro) importa por el mismo camino que
sus consumidores, nunca el módulo directo, y se da por buena solo después de una contraprueba que quite lo vigilado.
