# Plan 011 — Trayectorias

> Derivado del grafo `docs/grafos/trayectorias.json` con `grafo2plan.py`: siete fases, una con
> paralelismo (las tres capturas). Aquí va lo que el ejecutor decidió dentro de cada nodo.

## Módulos y requisitos que cubren

| Módulo | Dónde | RF |
|---|---|---|
| Formato y verificador | `scripts/trayectorias/formato.mjs`, `scripts/trayectorias/verifica.mjs`, `scripts/prueba-trayectorias.ts` | RF-1 a RF-4 |
| Captura de la fábrica | `scripts/trayectorias/captura-sesion.mjs` + `.claude/hooks/captura-trayectoria.sh` | RF-5, RF-6 |
| Captura de la aplicación | `src/lib/ai/trayectorias.ts` | RF-7 |
| Captura de herramientas | `tools/extractor-documental/medicion/servicio.mjs` (emite `trayectoria.json`) | RF-8 |
| Almacén e ingesta | `trayectorias/datos/<linea>/`, `scripts/trayectorias/ingesta.mjs` | RF-9 |
| Evaluador | `trayectorias/criterios.json`, `scripts/trayectorias/evalua.mjs` + subagente | RF-10, RF-11 |
| Informe | `scripts/trayectorias/informe.mjs` → `trayectorias/informes/` | RF-12, RF-13 |
| Propuestas | `scripts/trayectorias/propuestas.mjs` → `trayectorias/propuestas/` + CDC pendiente | RF-14, RF-15 |

## Decisiones, y lo que se descartó

- **Captura al cerrar la sesión (`SessionEnd`), no por herramienta.** Un hook por llamada añade
  latencia a cada acción; el transcript ya lo tiene todo y se convierte una vez.
- **Deduplicar el uso por id de mensaje**: en el transcript cada bloque de contenido repite el
  `usage` del mismo mensaje; sumar líneas infla los tokens por un factor de 3 a 6.
- **Solo conteos y nombres**: nunca se copia texto de un mensaje ni de una herramienta. Los
  nombres de archivo tocados no entran (pueden llevar el nombre de un cliente).
- **Coste de la fábrica solo si el modelo está en el catálogo de routing**; si no, `null`.
- **El almacén vive en `trayectorias/`, fuera de `.claude/`**, para no entrar al presupuesto de
  contexto y para que el clon no cargue con él en cada sesión.
- **Evaluación en dos capas**: criterios estructurales que un script calcula, y un veredicto de
  un subagente que recibe solo las trayectorias y los criterios, nunca el diff ni la conversación.
- **Descartado**: formatos ajenos de trazas que arrastran el contenido de los mensajes; un
  tablero web; aplicar propuestas automáticamente.

## Cobertura de los criterios de finalización

| Criterio | Evidencia |
|---|---|
| 1 | `npm run verifica:specs` |
| 2 | `node scripts/prueba-trayectorias.ts`, `npm run verifica:trayectorias` |
| 3 | `npm run trayectorias:captura -- --historicas`, hook local + sesión nueva |
| 4 | `node scripts/prueba-trayectorias.ts` |
| 5 | `medicion/servicio.mjs` + `npm run trayectorias:ingesta` |
| 6 | `npm run trayectorias:evalua` + veredicto del subagente en `trayectorias/evaluaciones/` |
| 7 | `npm run trayectorias:informe` |
| 8 | `npm run trayectorias:propuestas` + `git diff --stat` vacío en lo gobernado |
| 9 | `npm run validate` |

## Gates y riesgos

- **Gate humano**: toda propuesta es un CDC; aplicar es de la dueña.
- **Riesgo**: el hook en `settings.json` del repo es CDC; se deja propuesto y cableado en local.
- **Riesgo**: cifras históricas de sesiones con modelos fuera de catálogo salen sin coste.
