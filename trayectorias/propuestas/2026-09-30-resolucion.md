# Resolución de las propuestas del 2026-09-30

> Instrucción del laboratorio: «arreglo de la métrica». El criterio de P1 y P2 pide buscar la causa
> antes de tocar nada, y la causa no estaba en un skill ni en el arnés: **estaba en el informe**.
> Ningún skill, prompt, regla ni routing se tocó; el arreglo es código del informe, con su prueba.

| Propuesta | Causa encontrada | Qué se aplicó |
|---|---|---|
| P1, P2 · errores por herramienta +33 % / +26 % | **Artefacto de agregación.** El informe promediaba la tasa de cada sesión, así que una sesión de 47 usos pesaba lo mismo que una de 2000. Dos sesiones cortas (`fabrica-70d74f86`: 7 errores en 47 usos; `fabrica-a547ce33`: 5 en 49) subían la media de 0,025 a 0,033, mientras el agregado (total de errores ÷ total de usos) **bajaba** de 0,028 a 0,025. Por herramienta, Bash (~75 % de los usos) estuvo entre 2,3 % y 2,6 % en los tres tramos. | Toda tasa del informe (salida, caché y coste por llamada, ms por llamada, revisión humana, rojos por gate, errores por herramienta) se guarda como razón y el periodo es **total ÷ total** (`scripts/trayectorias/metricas.mjs`). Cuatro pruebas nuevas en `prueba:trayectorias`, una con este mismo caso. |

## Lo que cambia al regenerar el informe del 2026-09-30

- Con el corte por defecto (2026-09-13): errores por herramienta 0,028 → 0,025 (−11 %), **ningún hallazgo**.
- Las «mejoras» que se leyeron cortando en el 2026-09-20 (rojos por gate −53 %, caché +20 %) también eran
  efecto de la media: con total ÷ total quedan en −15 % y −7 %, por debajo del umbral. Nada que celebrar ni que
  corregir en ese tramo.
- La regresión que marcaron los informes del 13, 14 y 20/09 hay que leerla con esta misma sospecha. La del
  2026-09-13 tenía errores reales detrás (su resolución los documenta); si la subida también lo era no se ha
  vuelto a medir con total ÷ total.

## Lo que NO se aplicó, y por qué

- P1 y P2 no piden cambiar nada fuera del informe: la señal desaparece al medir bien.
- `propuestas/2026-09-30.md` se conserva tal como se generó: es el registro de lo que el informe viejo decía.
