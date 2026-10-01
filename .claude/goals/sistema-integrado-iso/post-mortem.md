# Sistema integrado ISO 9001 + ISO/IEC 42001 — post-mortem (Fase 5 del goal-compiler)

Ejecutado el 2026-09-30 en la rama `app/iso`. **No convergió: se detuvo por la red de seguridad**
(«falta la llave»). Diez de los quince puntos de la definición de hecho están cumplidos y medidos. Los
cinco restantes dependen de una sola entrada, `OPENROUTER_API_KEY`, que no está en la máquina (ver
`resultados.md`). Este documento cierra el ciclo con lo que ya se sabe. Se completa cuando corran los 46
casos con LLM.

## 1. Retrospectivo del ejecutor

**Fricciones** (todas resueltas, con caso de regresión donde aplica)

- **La lectura antes que el disparador.** `insert … returning` con RLS evalúa la política de lectura
  antes del disparador AFTER que crea la membresía. Resultado: 42501, y quien crea la organización no la
  ve. Se resolvió con `creado_por`, forzado en el `with check`.
- **`sgi_faltantes_puerta` respondía a cualquiera.** Era SECURITY DEFINER y no revisaba pertenencia, así
  que una sesión de la organización B leía faltantes de A. Lo cazó la prueba de aislamiento al
  escribirla. Ahora comprueba pertenencia y tiene un caso propio.
- **Un INSERT saltaba la aprobación.** La protección de estados solo miraba UPDATE, y se podía crear
  algo ya «aprobado». Lo cazó la siembra. El disparador cubre ahora INSERT y UPDATE, con 2 casos.
- **Funciones SECURITY DEFINER en `public`.** `prueba:migraciones` rechazó 12. Se movieron a
  `sgi_privado`, y las 2 que se consultan por la API pasaron a INVOKER. La RLS se volvió a medir: 42/42.
- **Cuatro gates del repo cazaron cuatro cosas distintas:**
  - `verify:gobernanza` rechazó un literal de fecha con hora en el orquestador;
  - `verifica:gates` encontró un script con forma de gate sin declarar y su prueba huérfana;
  - `prueba:a2a` encontró una ruta de servidor nueva sin declarar;
  - el README del laboratorio mostraba el valor de una variable de entorno; ahora nombra solo la
    variable.

  En los cuatro casos se cambió el código, no la regla.
- **`json.dumps` reformateaba `inventario/activos.json` entero.** Se restauró y se insertaron los 3
  asientos como texto.
- **Playwright.** `waitForURL('**/sgi')` también casaba con la URL del login, y se cambió a comparar
  `pathname`. El aviso de hidratación en desarrollo resultó ser de Turbopack en la primera compilación:
  el recorrido final corre contra `next build` + `next start`.
- **L8 no entendía negaciones.** «No te certifica» salía como promesa. Ahora la negación cuenta como
  deslinde, con caso.

**Gaps del spec y del compilador**

- **La llave era un HECHO y se trató como DECISIÓN.** Al compilar se preguntó «¿qué LLM?» y la
  respuesta fue «Llave de OpenRouter». Nadie comprobó, enmascarado, que la llave existiera. Cinco nodos
  del grafo (agentes, app, casa, laboratorio, entrega) dependen de ella, y el grafo no la tenía como
  entrada: `grafo2plan` no podía ver que un tercio de la definición de hecho colgaba de un artefacto
  ausente. Es el hallazgo principal.
- **La definición de hecho no tenía estado terminal de bloqueo.** La red de seguridad dice «detente y
  reporta». El evaluador confirma que se activó bien, pero el Stop hook sigue relanzando el turno porque
  la condición solo cierra con HECHO. Cada vuelta cuesta un turno sin avance.
- **La investigación cambió el spec.** ISO 9001:2026 salió el 16-sep-2026, a mitad del plan. El
  catálogo versionado absorbió la nueva edición sin rehacer nada, pero con 61 referencias marcadas
  `supuesta` porque nadie ha leído la norma. El spec pedía «versionado»; la realidad pidió además
  «versionado con incertidumbre declarada».

**Qué funcionó**

- **Motor puro y su espejo en SQL, comparados.** La prueba le pregunta a la base las 110 combinaciones de
  rol, tipo y fase, y las compara con el motor: 0 diferencias. Dos implementaciones de la misma regla
  sin una prueba que las cruce divergen en silencio.
- **La base calcula la huella y aplica el efecto de aprobar.** La app solo inserta una aprobación
  inmutable, así que ningún camino de código cambia un estado por su cuenta.
- **Siembra y pruebas con sesiones reales y la llave anónima**, nunca `service_role`. Por eso aparecieron
  las dos fugas de arriba: con BYPASSRLS no se habrían visto.
- **El corredor de agentes se niega a inventar.** Sin llave no produce ninguna corrida, y
  `corridas.json` sigue vacío.
- **Recorrido de Playwright contra el build de producción**, con pasos seleccionables (`--con-llm`
  separado): 9/9 sin errores de consola, sin esperar a la llave.

## 2. Mapa hallazgo → elemento del grafo

El goal fue un GRAFO (Fase 1.5): 15 nodos, 24 aristas y 10 lazos, compilado a `plan.md`.

| Hallazgo | Elemento | Qué era frágil |
|---|---|---|
| Llave ausente | **nodo que faltaba** (`llave`) → arista a `agentes` | una entrada manual de la que colgaban 5 nodos no existía en la topología; el plan no podía ordenarla ni marcarla |
| Sin estado terminal de bloqueo | lazo de parada del `/goal` (fuera del grafo) | la red de seguridad detiene el trabajo pero no el hook |
| `sgi_faltantes_puerta` filtraba | lazo **L3** (aislamiento) sobre `esquema` | SECURITY DEFINER se salta la RLS igual que `service_role`, y L3 solo lo vio porque medía con sesiones reales |
| INSERT ya «aprobado» | lazo **L4** (humano en el ciclo) sobre `motor`/`esquema` | la referencia decía «ninguna fase cierra sin aprobación», pero el sensor solo miraba cambios, no altas |
| 42501 en `insert … returning` | arista `supabase-local → esquema` | el orden RLS → disparador AFTER no estaba en el contrato de la arista |
| SECURITY DEFINER en `public` | lazo **L10** (validate) sobre `entrega` | funcionó: un gate del repo cazó lo que el goal no pedía |
| L8 y las negaciones | lazo **L8** sobre `app` | un detector sin caso negativo marca falsos positivos, que llevan a apagarlo |
| 9001:2026 publicada a mitad | arista `investigacion → catalogo` | «versionado» sin «incertidumbre declarada» por referencia |

## 3. Hallazgos convertidos en gates y reglas

Hechos en este goal, en la rama:

- `scripts/sgi/mide-aislamiento.ts` (`npm run sgi:rls`) incluye estos casos de regresión:
  - pertenencia en las 3 funciones SECURITY DEFINER;
  - INSERT con estado aprobado, rechazado;
  - la comparación base = motor en las 110 combinaciones;
  - el catálogo espejo.
- `prueba:laboratorio-sgi`, **activo en `validate`**. El alta en `gates.json` es CDC en propuesta. Guarda:
  - al menos 5 casos por pieza;
  - las 10 trampas con caso;
  - L8 sobre 32 archivos, con el caso de la negación;
  - el espejo SQL sin deriva.
- `grafo.json` gana el nodo `llave` en gris y la arista manual `llave → agentes`. El grafo ya dice qué
  falta, en lugar de que lo diga solo `resultados.md`.

**Propuestos, NO aplicados.** El goal prohíbe tocar skills y reglas, y cada uno es CDC (C1):

1. **Skill `goal-compiler`, Fase 2** («HECHOS vs DECISIONES»): añadir «toda credencial de la que dependa
   la definición de hecho es un HECHO. Se comprueba enmascarada (presente/ausente, largo) ANTES de
   entregar el bloque. Si falta, se consigue antes de lanzar, o la parte que depende de ella sale del
   HECHO a una fase aparte».
2. **Skill `goal-compiler`, Plantilla B**: la red de seguridad cierra el loop. Añadir a HECHO la
   alternativa «o bien: BLOQUEADO, con el bloqueo, quién lo destraba y el estado del grafo pegados»,
   para que el evaluador pueda terminar sin relanzar turnos vacíos.
3. **Skill `goal-compiler`, Fase 1.5**: toda entrada manual (llave, copia licenciada, firma) es un nodo
   del grafo con su estado, no una nota del spec.
4. **`.claude/rules/aprendizajes-stack.md`**, tres entradas que muerden en `supabase/migrations/**`:
   - `insert … returning` con RLS evalúa la lectura antes del disparador AFTER: `creado_por` forzado en
     el `with check`;
   - una función SECURITY DEFINER comprueba pertenencia ella misma, y vive en un esquema que PostgREST
     no expone;
   - la protección de estados cubre INSERT y UPDATE, no solo UPDATE.
5. **`.claude/rules/aprendizajes-stack.md`**, al tocar `inventario/**`: `activos.json` se edita como
   texto; `json.dumps` lo reformatea entero y el diff esconde el asiento.

Cada uno se aplica con diff, `npm run regresion` y entrada firmada en `BITACORA-CDC.md`.

## 4. Intocable (lo que funcionó y no se cambia sin medir)

- Motor puro y espejo SQL, **con la prueba que los cruza**.
- Aprobar es insertar una fila inmutable; la base calcula la huella y aplica el efecto.
- Pruebas y siembra con sesiones reales y la llave anónima. `service_role` fuera.
- El consultor nunca aprueba.
- El corredor que se niega a inventar: sin llave no hay corrida, y `null` no es cero.
- Evidencia contra el build de producción, con los pasos que piden agente separados de los que no.
- Catálogo versionado, con la incertidumbre declarada por referencia.

## 5. Lo que sigue (cuando el laboratorio guarde la llave)

1. `npm run sgi:agentes`: 46 casos, tope US$15, llave enmascarada.
2. `npm run build`, servidor de producción con la llave, y `capturas.ts --con-llm` (10 pasos).
3. La casa: SoA, impacto y política de IA aprobados.
4. `resultados.md`, `grafo.json` (agentes, app, casa, laboratorio, entrega; L1, L5, L6, L9) y la
   sección «Estado del LLM» de `propuesta-cdc.md` con los números reales.
5. Commit, `npm run validate`, y este post-mortem se completa con lo que diga la corrida.

## 6. Con la llave (2026-10-01): lo que solo se ve corriendo de verdad

La llave llegó y hubo 15 corridas reales (US$4.69). El goal se detuvo otra vez, ahora por **saldo**. Cada hallazgo
salió de una corrida, no de una prueba con dobles:

| Hallazgo | Elemento del grafo | Qué se hizo |
|---|---|---|
| Opus 5 razona por omisión **dentro** de `max_tokens`: el diagnóstico gastó 3,500 de 3,500 razonando y la respuesta salió vacía, con un error que decía «ilegible» | arista `motor/catalogo → agentes` (contrato con el proveedor) | Tope de razonamiento aparte (4,000), `truncada` detectada por `finish_reason`; 2 pruebas nuevas. Medido con una sonda antes de cambiar nada |
| Al menos 9 de 15 llamadas se truncaron al primer intento | nodo `agentes` (límites por tarjeta) | Límites subidos con el dato; el reintento las rescató todas |
| El reintento «menos propuestas» dejó la SoA en 20 de 38 controles | lazo **L4**: la puerta de la fase 3 depende de una SoA completa | El reintento pide textos más cortos y conservar todas las propuestas (CDC) |
| La trampa 1 engañó al modelo en su única respuesta completa | lazo **L5** | El validador lo paró (el lazo aguantó); el reintento lo dice explícito (CDC, sin medir) |
| La SoA fotografiada salió «genérica» y no se podía aprobar | lazo **L7** aplicado a lo que no le toca | La versión abre con la organización y su alcance; L7 sigue vigilando lo que redacta el agente. Verificado sin agente |
| Al repetir una corrida se borraba lo que ya se había pagado | lazo **L9** (costo) | El corredor acumula el gasto descartado |
| El tope del goal (US$15) no era el único: la llave tenía US$5 y la cuenta su propio saldo; con 4 llamadas a Opus en paralelo, OpenRouter reserva el máximo de cada una y rechazó 38 | **nodo que faltaba otra vez**: el saldo es una entrada manual, igual que la llave | Se detuvo antes de dejar la cuenta en cero (la comparten otras llaves) |
| El guion de capturas leyó un aviso viejo porque `waitForURL(/aviso=/)` ya se cumplía | arista `app → evidencia` | `clicYAviso` espera una URL **distinta** con aviso |

**Propuestas nuevas, NO aplicadas** (skills y reglas están fuera del alcance del goal; cada una es CDC):

6. **Skill `goal-compiler`, Fase 2**, ampliando la propuesta 1: además de la llave, se comprueba **el saldo y el tope
   de la llave**, también enmascarados (OpenRouter: `GET /api/v1/key`, `limit_remaining`). Si el saldo no cubre la
   estimación del spec, se dice antes de lanzar.
7. **`.claude/rules/aprendizajes-stack.md`**, al tocar `src/lib/ai/**` o un cliente de modelo: «un modelo que razona
   por omisión gasta su razonamiento dentro de `max_tokens`: tope de razonamiento aparte y `finish_reason` leído;
   "length" es truncada, no ilegible».
8. **`.claude/rules/aprendizajes-stack.md`**, al tocar `scripts/**/capturas*`: «`waitForURL(patrón)` se cumple en el
   acto si la URL actual ya casa: después de un clic, esperar una URL distinta».

**Intocable, sumado**: medir con una sonda de centavos antes de cambiar código que gasta, y no aflojar un gate que
se pone en rojo con un dato real (`dia-5`).
