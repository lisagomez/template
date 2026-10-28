# Propuesta de CDC: Ágora (goal `agora-a2a`) — fuera de la bitácora

> **Estado: borrador sin firmar; la firma es del laboratorio.** Fecha: 2026-10-28. Redactada **fuera** de
> `.claude/gobernanza/BITACORA-CDC.md`: una entrada sin firma tumba `verify:gobernanza` (aprendizaje del 2026-09-20).
> Al firmarse, la entrada se pega en la bitácora con la firma escrita por el laboratorio y este archivo se borra o se
> marca como citado. Los tres puntos se pueden firmar juntos o por separado.

---

### 2026-10-28 — Ágora: sus gates en el padrón, la ventana de la capa pinta el módulo dueño de `explorador` y `conversacion`, y el coordinador sin clase de routing — radio: padrón de gates, herramienta (`tools/capa`, cambio genérico que ven todos los productos compuestos) y routing (C8, no asignación)

- **Cambio** (lo construido, no un boceto; rama `agora/a2a`, sin push):
  1. **Padrón de gates (`.claude/gates.json`): no cambia.** La suite de `tools/agora` (125 pruebas, fases 1 a 7, en
     PGlite) entra sola por `prueba:tools`, que ya está en `validate`. **No toqué `gates.json`.** Lo que propongo
     agregar, y solo con esta firma:

     **Gates añadidos** (propuesta; NO aplicada):

     | Nombre | Runner | Comando | Perfiles | Activo | Si inactivo: `motivo` y `falta` | Siembras que lo tumban |
     | --- | --- | --- | --- | --- | --- | --- |
     | `agora:pg` | npm | `npm run agora:pg` | ninguno (inactivo) | `false` | **motivo**: necesita Docker y levanta un PostgreSQL 17 desechable (`agora-pg-lab`), igual que `erp:prueba`. **falta**: un perfil con Docker o un servicio Postgres en el CI | Los 81 sabotajes de `tools/agora/evidencia/sabotajes.ts` (los mismos que en PGlite), contra el motor real |

     Un inactivo **nunca** se cuenta como uno que pasó: aplica la entrada «las suites en Postgres real fuera del
     `validate`» de `riesgos-propuesta.md`. Mientras tanto, la corrida contra Postgres real es evidencia pegada en el
     goal (`docs/goals/agora-a2a-evidencia/f9-pg.log`: 125/125 y 81/81), no un gate.
     - No entra ningún artefacto nuevo a `generados`: `src/shared/capa/enchufes.ts` ya estaba y solo se regeneró.
     - La Puerta vive como ruta de la app (`src/app/api/agora/a2a/[org]/route.ts`), declarada en
       `RUTAS_FUERA_DEL_BRIDGE` de `scripts/prueba-a2a.ts` con su motivo (`prueba:a2a` en verde).

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

     Las invariantes, probadas: es **genérico** (no menciona a Ágora); sin módulo dueño, la ventana pinta exactamente lo
     de antes (ningún otro producto declara esas ranuras); el freno sigue siendo de la capa; el módulo **se suma** al
     hilo y al compositor de la capa, **no los sustituye** (responde a la pregunta 3 de abajo con lo que se construyó).
     3 pruebas nuevas en `tools/capa/pruebas/interfaz.ts`: 36/36 con el cambio y 2 caen sin él. Desde ese commit,
     `git diff --stat -- tools/capa` queda **vacío** al intercambiar el plan (`docs/goals/agora-a2a-evidencia/intercambio.txt`).

  3. **El verificador de un gate: `scripts/capa/verifica-enchufes.mjs`** (más estricto). Cuando ningún enchufe declara
     una ruta, el dueño es ahora la feature **más específica** (`agora-agentes` en `/agora/agentes`, no `agora`). Con
     la heurística anterior, quitarle el enchufe a un submódulo pasaba sin verse, y la siembra «un activo con pantalla
     sin enchufe» dejó de caer al agregar `agora-agentes`: el `validate` de la fase 5 quedó en rojo por eso. Ahora
     quitar **cualquiera** de los 30 enchufes, uno por uno, se ve, y las 10 siembras caen. Cambia lo que mide un gate:
     por eso va aquí.

  4. **Routing (C8): el coordinador NO recibe clase.** El coordinador, el analista, el supervisor y el vigía corren sin
     modelo de pago (el coordinador con `agora-determinista-0.1`, precio ficticio declarado); ninguna llamada sale y
     `.claude/routing-modelos.json` **no cambia**. `tools/agora` no llama a `modeloPara` ni lee la llave de un
     proveedor. **Asignar la clase es un CDC aparte**, con nombre, nivel (propuesta: no abaratarlo, porque propone sobre
     dinero; considerar `no_se_abaratan`), modelo pineado con fecha, alternativa abierta con índices, medición con el
     modelo real bajo el tope propio de la llave y la revisión del C4 sobre qué texto sale al proveedor.

  Lo que **no** es CDC y se declara para que no se lea como escondido: los ejemplos de intenciones de los enchufes de
  Ágora (son datos del módulo, sin LLM ni prompt) cambiaron por una regla medida —ningún ejemplo de una intención que
  escribe lleva un nombre propio— y la vigila una prueba (`tools/agora/pruebas/composicion.ts`).

- **Motivo**: el goal `agora-a2a` (decidido por el laboratorio el 2026-10-27 y ampliado el 2026-10-28 con la capa común).
  Un gate nuevo es CDC (C1); la capa la usan todos los productos compuestos, así que cambiar qué pinta una ranura cambia
  lo que todos ven; y una clase sin asignar heredaría el default caro en silencio (C8), por eso se declara la NO
  asignación en vez de callarla.
- **Lo que decide el laboratorio al firmar**:
  1. los gates del hueco de arriba, cada uno con su perfil y, si es inactivo, su motivo y lo que falta;
  2. que la capa gana el pintado del módulo dueño en `explorador` y `conversacion`, con las invariantes listadas, y si
     eso sube la versión de `@tu-scope/capa` (hoy 0.1.0);
  3. si en la ranura `conversacion` el módulo se **suma** al hilo de la capa (lo construido) o lo sustituye;
  4. el verificador de enchufes más estricto (punto 3 del cambio);
  5. que el coordinador queda sin clase de routing hasta un CDC propio.
- **Lo que esta entrada NO aprueba** (cada uno es su propia firma o gate):
  - el C3 y el C4/AISIA de Ágora (`C3-borrador.md`, `C4-AISIA-borrador.md`, en esta carpeta);
  - las entradas del registro de riesgo (`riesgos-propuesta.md`);
  - abrir la Puerta a un socio real, conectar un espejo o el correo, encender un modelo real;
  - subir la versión de Arbrain que pinea la capa, ni tocar `erp/` (si se toca, su clase en `erp/entrega.json`).
- **Salida del perímetro (C4)**: ninguna. Ningún enchufe de Ágora declara `sale`; la voz es solo local; el modelo es
  determinista.
- **Gate aplicado** (lo que el agente pudo correr; lo marcado ☐ es del laboratorio):
  - diff revisado ☐ — se enseña completo en el chat **antes** de pedir la firma (`git diff main..agora/a2a`);
  - regresión capa A ☑ — `C2 capa A (contratos): 166/166 en verde` (dentro del `validate` de `eb062f7`);
  - `npm run validate` ☑ tras el commit de la fase 7 (`eb062f7`): **34/34 gates activos, 11 inactivos declarados, 0
    rojos** (`docs/goals/agora-a2a-evidencia/validate-fase7.log`); se repite tras el último commit del goal;
  - `verifica:enchufes` ☑ — 30/30 activos con pantalla y 10/10 siembras cazadas; quitar cualquiera de los 30 enchufes,
    uno por uno, se ve;
  - `verifica:gates` ☑ — en verde dentro del `validate` (el padrón NO cambió; el gate propuesto no se aplicó);
  - `git diff --stat -- tools/capa` vacío tras intercambiar un módulo ☑ — `docs/goals/agora-a2a-evidencia/intercambio.txt`
    (el plan pasó de `calendario` a la capa solo en la composición; recorrido 8/8, 0 errores de consola);
  - capa B: no la corre el agente (no cambia `AGENTS.md`, ningún skill ni ningún prompt); decide el laboratorio
    («capa A basta» o corrida en sesión limpia) ☐;
  - aprobación humana ☐;
  - pineo ☑ — sin modelo; dependencias nuevas con versión exacta: `pg` 8.16.3 y `@types/pg` 8.15.4. `@a2a-js/sdk` 1.1.0
    ya estaba en el repo y la Puerta de Ágora **no** lo usa (implementa el JSON-RPC de A2A 1.0 con sus 9 comprobaciones).
- **Regresión** (cómo se corre):
  - `npm run regresion` — capa A, determinista, sin modelo; también corre dentro del `validate`;
  - `npm run regresion -- --trampa` — capa B, solo si el laboratorio la pide, en sesión fría y sin `git log` ni
    `git diff` entre las herramientas del sujeto;
  - `npm ci` real en el worktree (el `node_modules` enlazado rompe Turbopack) y después `npm run validate`, **después
    del commit**, porque la gobernanza lee `git ls-files`.
  - Resultado: capa A 166/166 (validate de `eb062f7`); capa B no corrida (decide el laboratorio).
- **Aprobado por**: pendiente
