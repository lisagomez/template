# Eficiencia de tokens y frescura de versiones — estado

**Spec:** `.claude/specs/002-eficiencia-tokens/spec.md` (compilado por `/goal-compiler`,
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

## Pendientes reales del template

> **Los tres se cerraron el 2026-08-26** (bitácora CDC, tres entradas de esa fecha). Se deja
> el texto original debajo como historia de por qué se hicieron así.
>
> 1. **Corte de `AGENTS.md` ejecutado, medido antes**: 527 → 321 líneas. Lo informativo
>    (aprendizajes, flujos, arquitectura, QA, estructura) vive en `.claude/rules/*.md` con
>    `paths:` y texto original; la tabla de skills se borró (sus `description` ya cargan). Suelo
>    por sesión **11313 → 8437 tokens**; `CLAUDE.md` expandido 7480 → 4604. `opencode.json`
>    carga las rules siempre: ahí el ahorro es cero y `mide:contexto` lo mide aparte (nivel
>    *condicional*, 3335 tokens). Riesgo residual declarado: una rule que no cargue por un
>    `paths:` que no empate — los errores críticos siguen en `AGENTS.md`. **Medido esa misma
>    noche**: un caso en frío que toca `package.json` recibió la rule de aprendizajes y la citó
>    con ruta y línea (reporte en `corridas.md` de `golden-sets`). Cubre el mecanismo, no
>    cada `paths:`.
> 2. **Contabilidad medida en frío**: caso en `golden-sets`, corrida real con `claude -p`
>    (sesión fría, worktree desacoplado, **con `AGENTS.md` ya recortado**): verde-plus. Reporte
>    en `corridas.md` de esa rama; el sujeto no se fusiona.
> 3. **`GEMINI.md` ya no es copia a mano**: `npm run sincroniza:gemini` lo genera desde
>    `AGENTS.md` (solo lo que obliga, verbatim) y el verificador (3b-bis) falla si diverge.
>    Presupuesto del espejo 4000 → 4500 con la razón en el JSON.

1. **`AGENTS.md` tiene 519 lineas; la doc oficial pide menos de 200.** `CLAUDE.md` va al
   **88 % de su presupuesto** de contexto (7.065 de 8.000). `.claude/rules/` con `paths:`
   carga solo al tocar los archivos que importan.
   **Pero no es un ahorro gratis, y esto se comprobo el 2026-08-24**: `.claude/rules` aparece
   **0 veces** en el binario de opencode (lo unico parecido, `.cursor/rules/`, vive dentro de
   un prompt que le dice al agente que los *lea*, no en su ruta de carga). Una regla
   obligatoria movida ahi **deja de existir para opencode**: la misma divergencia que
   documenta `docs/PORTABILIDAD-ARNESES.md`, pero provocada por nosotros. Mitigacion con su
   propio precio: `opencode.json` con `instructions: [".claude/rules/*.md"]` las carga — pero
   **siempre**, sin `paths:`, asi que la regla se conserva en los dos arneses y **el ahorro
   solo se materializa en Claude Code**. Hay que medirlo y declararlo, no venderlo entero.
   **Corte propuesto** (sin decidir): se quedan inline los **controles** (C1, C5, C7, C8,
   secretos, respaldo, canales de chat) porque tienen que disparar en cualquier arnes; puede
   bajar lo que **informa y no obliga** (catalogos, decision tree largo, ejemplos,
   aprendizajes historicos). Con ese corte el ahorro real es **bastante menor** que "519 →
   200 lineas", asi que se mide **antes** de comprometerlo.
   **Y no se fusiona con la imprenta de CLIs** (`003-imprenta-de-clis.md`), aunque tiente:
   esto cambia **como cargan las reglas** —el modo de fallo #1 de este repo, un control que
   deja de disparar en silencio, que solo destapa una sesion fria— y aquello solo **añade**
   superficie, con controles negativos estructurales. Dos radios en un solo CDC, y un rojo en
   la mitad peligrosa bloqueando la aditiva.
2. **La regla de contabilidad no esta medida en frio.** El corpus no tiene caso que muerda
   sobre ella; darlo de alta es un CDC propio. Escrita donde dispara ≠ comprobado que
   dispara.
3. **`GEMINI.md` sigue siendo copia condensada aparte** — no consta que Gemini soporte los
   imports, asi que ahi la divergencia sigue siendo posible y la vigilan comprobaciones
   propias.

## Punto 7 (portabilidad): cerrado el 2026-08-24 — y donde acaba su ambito

Medido y en `docs/PORTABILIDAD-ARNESES.md`: opencode `1.18.21`, **22/22 skills** cargados,
orden de resolucion leido **del binario** (`AGENTS.md` → `CLAUDE.md` → `CONTEXT.md`, para en
el primero) y `npm run validate` corrido **entero y en verde dentro de una PTY de opencode**.

**Hallazgo que no estaba en la doc: opencode NO expande los imports `@ruta`.** Da igual
mientras `AGENTS.md` sea autocontenido; el dia que una regla se mueva a un archivo importado
existiria para un arnes y no para el otro, sin ninguna alarma. El bloque 6j del verificador
vigila lo adyacente: que ningun script del gate invoque el binario de un arnes.

**La correccion que dio la dueña el 2026-08-24, y que vale para todo lo que venga:** faltaba
una sesion conducida por un LLM para medir si opencode *obedece* (no solo *carga*) las
reglas, y se planteo pedir una credencial. **Un boilerplate no tiene credenciales** — no por
descuido, por diseño. Eso lo cierra un proyecto derivado, no el template; el spec ya lo
preveia al aceptar *"un informe medido de que lo impide y que costaria"* como alternativa. Es
la misma frontera de [[gobernanza-agentica]], "Dos ambitos que NO se mezclan", y es la
**segunda vez** que se cruza en la misma direccion: al agente le sale solo proponer que el
entorno se provisione para cerrar un pendiente del template.

## Lo que cierra un proyecto derivado (NO el template)

- **Medir si otro arnes OBEDECE**: capa B con opencode al volante, casos-trampa en sesion
  fria, corpus desde la rama `golden-sets`. Coste calculado: **$0,19** una sesion de 10
  turnos (nivel `capaz`, suelo medido de 9.334 tokens). No falta presupuesto: falta un
  proyecto con llaves.
- **Contabilidad contra un proveedor real**: la tabla (con RLS) y leer `usage` de la
  respuesta. La aritmetica, el aviso al 80 % y el hueco declarado ya estan probados aqui.
