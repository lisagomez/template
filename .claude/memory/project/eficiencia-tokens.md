# Eficiencia de tokens y frescura de versiones — estado

**Spec:** `.claude/PRPs/specs/spec-eficiencia-tokens.md` (compilado por `/goal-compiler`,
2026-08-23) · **Estado:** los cinco incrementos construidos y con CDC firmado; queda el
punto 7 de su Definicion de Hecho

La mision era que el boilerplate fuera **consciente de lo que cuesta** y **de lo viejo que
esta**, y que ninguna de las dos dependiera de que alguien se acuerde de mirar. Las dos
carencias eran el mismo fallo con distinta cara: **no habia sensor**.

## Los cuatro objetivos y donde vive cada uno

| # | Objetivo | Codigo | En `validate` |
|---|---|---|---|
| 1 | Presupuesto de contexto | `scripts/mide-contexto.mjs` + `.claude/presupuesto-contexto.json` | si |
| 2 | Routing por nivel de tarea | `.claude/routing-modelos.json` + `scripts/verifica-routing.mjs` + `src/lib/ai/routing.ts` | si |
| 3 | Contabilidad en runtime | `src/lib/ai/contabilidad.ts` + `scripts/prueba-contabilidad.ts` | si (2026-08-24) |
| 4 | Frescura de lo pineado | `scripts/vigila-versiones.mjs` | **no, a proposito: usa red** |

## Lo que no se deduce del codigo

- **Mover contenido a otro archivo NO ahorra contexto.** Un import `@ruta` se expande y se
  paga igual. Se midio al hacer `AGENTS.md` fuente unica: el suelo **subio** de 9.924 a
  10.163. Por eso el verificador y el medidor **expanden imports** (`scripts/lee-instrucciones.mjs`);
  sin eso mentirian los dos a la vez. Ver [[gobernanza-agentica]].
- **La palanca grande no es cambiar de modelo, es el cache de prefijo**: leer del cache
  cuesta **la decima parte** del input. De ahi la disciplina de no tocar `AGENTS.md` en
  caliente — lo estable arriba, lo volatil abajo.
- **Eficiencia por reparto, no por recorte.** Gobernanza, casos-trampa, incidentes y PRPs
  **no bajan de nivel**: un caso-trampa evaluado por un modelo mas debil da un verde que no
  significa nada. El gate rechaza tanto la clase sin asignar (hereda el default caro en
  silencio) como la clase de riesgo abaratada.
- **Pesos abiertos NO es alojado por ti.** Mientras corra en un proveedor ajeno, el dato sale
  igual: es decision de flujo de datos (C4), no de precio.
- **El contador de tokens declara su calibracion** (ratio, muestra, margen) y el verificador
  lo exige. Un contador sin calibrar es un invento con formato de medicion.
- **Contabilidad: el hueco se declara, no se estima.** Llamada sin datos de uso → coste
  `null` y el resumen dice cuantas filas van sin costear. Sumar huecos como ceros da una
  factura que parece completa, que es peor que un hueco declarado (misma leccion que
  RPO/RTO). Y **el modulo no corta**: recomienda al 100 %, corta la app — negar servicio a un
  usuario para proteger tu factura es una decision con victima.
- **El precio vive en un solo sitio.** `contabilidad.ts` no tiene tabla propia: llama a
  `costeUsd()` del catalogo. El verificador lo vigila porque dos tablas de precios divergen
  siempre.
- **El vigilante devuelve exit `2` cuando no puede verificar.** "No pude mirar" no es "todo
  bien", y tratar el 2 como 0 es el fallo que la receta del cron existe para evitar.

## Pendientes

1. **`AGENTS.md` tiene 519 lineas; la doc oficial pide menos de 200.** `CLAUDE.md` va al
   **88 % de su presupuesto** de contexto (7.065 de 8.000). `.claude/rules/` con `paths:`
   carga solo al tocar los archivos que importan — es el unico ahorro **real** que queda, y
   ya no es una mejora opcional.
2. **Punto 7 de la Definicion de Hecho sin cerrar: opencode nunca se ha ejecutado aqui.** La
   compatibilidad esta verificada contra su documentacion, no contra una corrida. El spec
   dice literalmente "no vale afirmar compatibilidad": falta la corrida o un informe
   **medido** de que lo impide.
3. **La regla de contabilidad no esta medida en frio.** El corpus no tiene caso que muerda
   sobre ella; darlo de alta es un CDC propio. Escrita donde dispara ≠ comprobado que
   dispara.
4. **Contabilidad sin proveedor real**: falta la tabla (con RLS) y leer `usage` de la
   respuesta. La aritmetica, el aviso al 80 % y el hueco declarado si estan probados.
5. **`GEMINI.md` sigue siendo copia condensada aparte** — no consta que Gemini soporte los
   imports, asi que ahi la divergencia sigue siendo posible y la vigilan comprobaciones
   propias.
