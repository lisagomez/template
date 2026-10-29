# Propuesta de CDC: Ágora (goal `agora-a2a`) — fuera de la bitácora

> **Estado: sin firmar; la firma es del laboratorio.** Redactada el 2026-10-28 y puesta al día el 2026-10-29. Va
> **fuera** de `.claude/gobernanza/BITACORA-CDC.md`, porque una entrada sin firma tumba `verify:gobernanza`
> (aprendizaje del 2026-09-20). Al firmarse, la entrada de abajo se pega en la bitácora con la firma del laboratorio y
> este archivo se borra.

---

### 2026-10-29 — Ágora: `agora:pg` inactivo en el padrón, la ventana de la capa pinta el módulo dueño de `explorador` y `conversacion`, un verificador de enchufes más estricto y el coordinador sin clase de routing — radio: padrón de gates, herramienta (`tools/capa`, cambio genérico que ven todos los productos compuestos) y routing (C8, no asignación)
- **Cambio** (lo construido, no un boceto; rama `agora/a2a`, sin push):
  1. **Padrón de gates (`.claude/gates.json`): entra `agora:pg`, INACTIVO** (aplicado en la rama; esta firma lo aprueba).
     La suite de `tools/agora` (133 pruebas, fases 1 a 7, en PGlite) ya corría sola por `prueba:tools`, que está en
     `validate`.

     **Gate añadido:**

     | Nombre | Runner | Comando | Perfiles | Activo | `motivo` y `falta` | Lo que lo tumba |
     | --- | --- | --- | --- | --- | --- | --- |
     | `agora:pg` | comando | `npm run agora:pg` | ninguno | `false` | **motivo**: necesita Docker y el laboratorio de Ágora levantado (`npm run agora:laboratorio`), como `erp:prueba`. **falta**: el mismo perfil con Docker que `inventario:valida-erp` y los de `erp:`, o un servicio Postgres en el CI; hasta entonces se corre a mano al tocar `tools/agora/migraciones/` | Los 91 sabotajes de `tools/agora/evidencia/sabotajes.ts` (los mismos que en PGlite), contra el motor real |

     - El padrón pasa de 37 activos y 11 inactivos a **37 activos y 12 inactivos**; `verifica:gates` queda en 12/12.
     - Un inactivo **nunca** se cuenta como uno que pasó. Por eso va con la entrada «las suites en Postgres real fuera del
       `validate`» del registro de riesgo.
     - La corrida en Postgres real es evidencia pegada en el goal, no un gate:
       `docs/goals/agora-a2a-evidencia/mitigaciones-pg.log`.
     - La proyección del CI (`.github/workflows/gates.yml`) se regeneró con `npm run proyecta:gates -- --ci github`: suma
       una línea de comentario con el motivo. La de `hermes-os-a2a` (`reglas/software.toml`) lista el inactivo en su
       cabecera y se regenera allá.
     - No entra ningún artefacto nuevo a `generados`: `src/shared/capa/enchufes.ts` ya estaba y solo se regeneró.
     - La Puerta vive como ruta de la app (`src/app/api/agora/a2a/[org]/route.ts`). Está declarada en
       `RUTAS_FUERA_DEL_BRIDGE` de `scripts/prueba-a2a.ts`, con su motivo, y `prueba:a2a` está en verde.

  2. **`tools/capa`: la ventana pinta el componente del módulo dueño de `explorador` y de `conversacion`** (commit
     `2561724`, solo, antes que todo lo demás). El diff exacto:

     ```diff
      <nav className="capa-explorador" aria-label="Explorador" data-capa-ranura="explorador">
     +  {/* Si un módulo llena el explorador (p. ej. su jerarquía), lo suyo va arriba; las pantallas siguen debajo. */}
     +  <Ranura ranura="explorador" />
        {modulos.map((m) => {
      …
      <aside className="capa-conversacion" aria-label="Conversación">
        <Panel />
     +  {/* Lo que pinta el módulo que llena la conversación (p. ej. el hilo de su canal) va junto al hilo de la capa,
     +      nunca en su lugar: el freno, la intención y el compositor siguen siendo de la capa. */}
     +  <Ranura ranura="conversacion" />
        <Hilo />
        <Compositor />
     ```

     Las invariantes, probadas:
     - es **genérico**: no menciona a Ágora;
     - sin módulo dueño, la ventana pinta exactamente lo de antes, porque ningún otro producto declara esas ranuras;
     - el freno sigue siendo de la capa;
     - el módulo **se suma** al hilo y al compositor de la capa, **no los sustituye**.

     Hay 3 pruebas nuevas en `tools/capa/pruebas/interfaz.ts`: con el cambio, la suite da 36/36, y sin él caen 2. Desde
     ese commit, `git diff --stat -- tools/capa` queda **vacío** al intercambiar el plan
     (`docs/goals/agora-a2a-evidencia/intercambio.txt`).

  3. **El verificador de un gate: `scripts/capa/verifica-enchufes.mjs`** (más estricto).
     - **Antes**: con la heurística anterior, quitarle el enchufe a un submódulo pasaba sin verse. La siembra «un activo con
       pantalla sin enchufe» dejó de caer al agregar `agora-agentes`, y el `validate` de la fase 5 quedó en rojo por eso.
     - **Ahora**: cuando ningún enchufe declara una ruta, el dueño es la feature **más específica** (`agora-agentes` en
       `/agora/agentes`, no `agora`). Quitar **cualquiera** de los 30 enchufes, uno por uno, se ve, y las 10 siembras caen.

     Cambia lo que mide un gate: por eso va aquí.

  4. **Routing (C8): el coordinador NO recibe clase.**
     - El coordinador, el analista, el supervisor y el vigía corren sin modelo de pago; el coordinador usa
       `agora-determinista-0.1`, con precio ficticio declarado.
     - Ninguna llamada sale, y `.claude/routing-modelos.json` **no cambia**. `tools/agora` no llama a `modeloPara` ni lee
       la llave de un proveedor.
     - **Asignar la clase es un CDC aparte**. Tiene que llevar:
       - nombre y nivel (propuesta: no abaratarlo, porque propone sobre dinero; considerar `no_se_abaratan`);
       - el modelo pineado con fecha y su alternativa abierta con índices;
       - la medición con el modelo real, bajo el tope propio de la llave;
       - la revisión del C4 sobre qué texto sale al proveedor.

  Lo que **no** es CDC, declarado para que no se lea como escondido:
  - Los ejemplos de intenciones de los enchufes de Ágora cambiaron por una regla medida: ningún ejemplo de una intención
    que escribe lleva un nombre propio. Son datos del módulo, sin LLM ni prompt, y la regla la vigila una prueba
    (`tools/agora/pruebas/composicion.ts`).
  - Las mitigaciones que el laboratorio pidió construir antes de firmar el registro de riesgo (2026-10-29):
    - la guarda de la siembra;
    - el aviso fijo y la marca de la segregación quitada;
    - la prueba de la suma de topes.

    Son código y pruebas de `tools/agora`, con 8 sabotajes nuevos (S18, S19, K7 a K11 y F12).

- **Motivo**: el goal `agora-a2a`, decidido por el laboratorio el 2026-10-27 y ampliado el 2026-10-28 con la capa común.
  - Un gate nuevo, aunque nazca inactivo, es CDC (C1).
  - La capa la usan todos los productos compuestos: cambiar qué pinta una ranura cambia lo que todos ven.
  - Una clase sin asignar heredaría el default caro en silencio (C8). Por eso se declara la NO asignación en vez de callarla.
- **Lo que decide el laboratorio al firmar**:
  1. `agora:pg` en el padrón, inactivo, con su motivo y lo que falta;
  2. que la capa pinta el componente del módulo dueño en `explorador` y `conversacion`, con las invariantes listadas;
  3. la versión de `@tu-scope/capa`. Propuesta: **no sube** (sigue en 0.1.0), porque nadie la consume por versión. Se sube
     al empaquetarla;
  4. que en la ranura `conversacion` el módulo **se suma** al hilo de la capa (lo construido) y no lo sustituye;
  5. el verificador de enchufes más estricto (punto 3 del cambio);
  6. que el coordinador queda sin clase de routing hasta un CDC propio.
- **Lo que esta entrada NO aprueba** (cada uno es su propia firma o gate):
  - el C3 y el C4/AISIA de Ágora (`docs/goals/agora-a2a-propuestas/C3.md` y `C4-AISIA.md`);
  - las entradas del registro de riesgo de Ágora;
  - abrir la Puerta a un socio real, conectar un espejo o el correo, encender un modelo real;
  - subir la versión de Arbrain que pinea la capa, ni tocar `erp/` (si se toca, su clase en `erp/entrega.json`).
- **Salida del perímetro (C4)**: ninguna.
  - Ningún enchufe de Ágora declara `sale`.
  - La voz es solo local.
  - El modelo es determinista.
- **Gate aplicado** (las casillas vacías son del laboratorio):
  - diff revisado ☐ — el diff de lo que toca este CDC se enseña completo en el chat antes de pedir la firma:
    `git diff main -- .claude/gates.json .github/workflows/gates.yml tools/capa scripts/capa/verifica-enchufes.mjs`;
  - regresión capa A ☑ — `C2 capa A (contratos): 166/166 en verde`, dentro del `validate` de `7a89016`;
  - `npm run validate` ☑ — sobre `7a89016` (árbol `54480cc2cc70`): **34/34 gates activos, 12 inactivos declarados, 0
    rojos**, con las 133 pruebas de Ágora dentro de `prueba:tools`. Se repite tras el commit de la firma;
  - `verifica:gates` ☑ — 12/12 comprobaciones en verde, con 37 activos y 12 inactivos declarados;
  - `verifica:enchufes` ☑ — 30/30 activos con pantalla y 10/10 siembras cazadas; quitar cualquiera de los 30 enchufes,
    uno por uno, se ve;
  - `git diff --stat -- tools/capa` vacío tras intercambiar un módulo ☑ — el plan pasó de `calendario` a la capa solo en
    la composición; recorrido 8/8 y 0 errores de consola (`docs/goals/agora-a2a-evidencia/intercambio.txt`);
  - suites y sabotajes de `tools/agora` ☑ — 133/133 pruebas y 91/91 sabotajes, en PGlite y en PostgreSQL 17.11 real
    (`docs/goals/agora-a2a-evidencia/mitigaciones-pg.log`);
  - capa B: no la corre el agente, porque no cambia `AGENTS.md`, ningún skill ni ningún prompt. Decide el laboratorio:
    «capa A basta» o corrida en sesión limpia ☐;
  - aprobación humana ☐;
  - pineo ☑ — sin modelo. Dependencias nuevas con versión exacta: `pg` 8.16.3 y `@types/pg` 8.15.4. `@a2a-js/sdk` 1.1.0 ya
    estaba en el repo, y la Puerta de Ágora **no** lo usa: implementa el JSON-RPC de A2A 1.0 con sus 9 comprobaciones.
- **Regresión** (cómo se corre):
  - `npm run regresion` — capa A, determinista y sin modelo; también corre dentro del `validate`;
  - `npm run regresion -- --trampa` — capa B, solo si el laboratorio la pide, en sesión fría y sin `git log` ni `git diff`
    entre las herramientas del sujeto;
  - primero `npm ci` real en el worktree, porque el `node_modules` enlazado rompe Turbopack. Después `npm run validate`,
    **después del commit**, porque la gobernanza lee `git ls-files`.
  - Resultado: capa A 166/166 (`validate` de `7a89016`); capa B no corrida (decide el laboratorio).
- **Aprobado por**: pendiente
