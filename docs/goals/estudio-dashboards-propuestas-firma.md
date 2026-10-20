# Estudio de dashboards: propuestas para firmar (SIN firmar)

> Fuera del registro, a propósito: nada de esto entra en `.claude/gobernanza/BITACORA-CDC.md` hasta que el
> laboratorio lo firme (aprendizaje del 2026-09-20: una entrada «pendiente» en la bitácora tumba el gate, y está bien
> que lo haga). La firma la escribe el laboratorio. Rama `estudio/dashboards`, worktree
> `.claude/worktrees/estudio-dashboards`, sin push, sin PR y sin merge.

## 1. CDC — borrador de la entrada para la bitácora

### 2026-10-20 — Estudio de dashboards: clase `agente-estudio-dashboards` en el nivel `voz`, prompt `estudio-agente/4` y superficie CLI — radio: routing (C8) y producto (paquete `@tu-scope/estudio-dashboards`, app `/laboratorio-estudio-dashboards`)

- **Cambio**:
  1. **`.claude/routing-modelos.json`: clase nueva `agente-estudio-dashboards` → `voz`** (una línea; el nivel `voz` y
     su modelo pineado `anthropic/claude-haiku-5.5-20261007` ya existen).

     ```diff
     @@ "tareas"
          "asistente-paciente": "voz",
     +    "agente-estudio-dashboards": "voz",
          "implementar-feature": "capaz",
     ```

     **Por qué `voz`**: es el nivel más barato del routing y el que mejor midió. Sobre el set de referencia congelado
     (100 preguntas), Haiku 5.5 dio 95, 94 y 95 de 100 con el razonamiento del proveedor, y 95/100 con espacio de
     razonamiento propio. Haiku 4.5 (`ligero`) dio 79/100. Sonnet 5 (`capaz`) dio 93/100 (89 más 4 reintentos por 429
     del proveedor), a 17 veces el costo y con regeneración p95 de 9.2 s. Eficiencia por reparto: no se paga Sonnet.
     **Pero** el «para» del nivel `voz` describe conversación por voz sin herramientas; esta clase **estructura** una
     instrucción en un plan validado. Dos salidas para que decida el laboratorio: (a) ampliar el «para» de `voz` a
     «o estructurar una instrucción corta en un plan que valida el código»; (b) un nivel nuevo `estructurar` con el
     mismo modelo, que exige tocar el tipo `Nivel` de `src/lib/ai/routing.ts`. Esta rama no hace ninguna de las dos.
     **Lo que el agente NO decide** (y por eso cabe en un nivel barato): no escribe cifras ni SQL; el núcleo valida
     el plan contra el esquema y el catálogo, rechaza el parche que toca de más, redacta con resultados de la capa y
     no registra nada sin una persona (aplicar, alertas).
  2. **Configuración del modelo**: temperatura 0, respuesta hasta 1,200 tokens y **razonamiento con espacio propio
     de 512 tokens** (`razonamiento: { maxTokens: 512 }` en `tools/estudio-dashboards/src/openrouter.ts`). Sin él,
     Haiku 5.5 razona dentro del tope y trunca el plan en las instrucciones largas: medido el 2026-10-20, 1,182 de
     1,200 tokens razonando y el JSON cortado. Con el razonamiento apagado da 86/100 (regeneración p95 2.8 s). Es
     una decisión del laboratorio entre precisión y latencia.
  3. **Prompt del agente** `tools/estudio-dashboards/src/agente/prompt.ts`, versión **`estudio-agente/4`**
     (sha256 del archivo `ea73b47a9b2c8d5e`, primeros 16 hex). Historia:
     - `/1` (commit `ed2ec09`) se escribió **después** de congelar el set (`f6e42aa`) y sin leerlo.
     - `/2` y `/3` iteraron SOLO contra la partición de desarrollo (30 preguntas), nunca contra la retenida (70). Agregaron dos reglas genéricas: «margen» a secas es el %, y un valor que existe en dos dimensiones toma la más específica. También una dimensión que solo filtra no es desglose, y los dominios se ordenan del más fino al más grueso.
     - `/4` agrega la línea «ÚLTIMO CAMBIO» solo en una conversación, para que «ahora…» sepa a qué se refiere. Para una instrucción suelta, como las del set, el mensaje es **byte a byte** el que se midió con `/3`; lo prueba `pruebas/agente.ts`.
     El sistema es genérico: el catálogo y los dominios se insertan desde la capa; las convenciones de periodo se
     calculan de la fecha de corte. Una prueba canario comprueba que ninguna pregunta del set (6 palabras seguidas)
     aparece en el texto redactado del prompt.
  4. **Superficie CLI** `estudio-dashboards` (`tools/estudio-dashboards/src/cli/index.ts`): las nueve herramientas de
     la propuesta (`listar_metricas`, `describir_metrica`, `consultar_metricas`, `leer_dashboard`, `editar_dashboard`,
     `analizar_variacion`, `ver_senales`, `crear_alerta`, `proponer_metrica`), tres de versiones (`comparar_versiones`,
     `volver_version`, `fijar_oficial`) y `agente`. Lo que escribe va **en seco** salvo `--aplicar`; una alerta exige
     además `--confirmada-por` y no tiene canal; `proponer_metrica` devuelve un diff y no abre PR. Códigos de salida:
     0 · 2 uso · 3 esquema · 4 capa · 5 modelo. Lee la capa real o la foto del catálogo; jamás inventa. **Grado: no
     medido** (no se puntuó con la imprenta).
  - **Sin cambios** en `.claude/settings.json`, hooks, `gates.json`, `AGENTS.md`, skills ni el manifiesto de la
    imprenta. La suite nueva (`tools/estudio-dashboards`, 46 pruebas) entra sola en `prueba:tools`.
- **Motivo**: el spec `docs/goals/estudio-dashboards.md` (decisiones del laboratorio del 2026-10-20: LLM real con
  tope de US$2 y el nivel más barato primero; «luego lo pasas a CLI»).
- **Gate aplicado**: diff revisado ☐ · regresión verde ☑ (capa A 166/166 el 2026-10-20; la capa B no la corre el
  agente: decide el laboratorio) · aprobación humana ☐ · pineo ☑ (modelo pineado, lock de Python con hashes, npm exacto).
- **Regresión**: además de la capa A, la medición del agente contra el set congelado
  (`docs/goals/estudio-dashboards-medicion/medicion-*.json`). En la configuración propuesta: 95/100, con crear,
  filtrar, explicar y alertar al 100 %, modificar al 85 % y analizar al 87.5 %. **No llega al 90 % en esos dos
  tipos**. El set no se relajó; las fallas están explicadas en el reporte §Medición.
- **Salida del perímetro (C4)**: el prompt (catálogo de Golfo Norte, datos ficticios), la especificación y la
  instrucción van a OpenRouter. Datos ficticios: no hay decisión C4 de por medio (spec). Con datos reales, C4 antes.
- **Aprobado por**: ☐ (lo escribe el laboratorio)

## 2. README product first

`tools/estudio-dashboards/README.md`: conforme a `npm run revisa:readmes` (31/31 en alcance el 2026-10-20). La
feature `src/features/estudio-dashboards` queda sin README, listada como pendiente por el auditor (no se crean solos).

## 3. Filas del inventario

En `inventario/activos.json`, las dos en estado **`blueprint`**, como el crecimiento demostrado antes de firmarse; el
laboratorio decide estado y clase. Entraron en la rama porque `verifica:inventario` y `empaqueta` las exigen:

- `TPL-estudio-dashboards` → `tools/estudio-dashboards` (PRODUCTO).
- `TPL-feature-estudio-dashboards` → `src/features/estudio-dashboards` y `scripts/estudio-dashboards` (PRODUCTO).

## 4. Fila de rutas públicas

En `docs/REVISION-rutas-publicas.md` §3: `POST /api/estudio-dashboards`. Hoy responde 503 sin
`ESTUDIO_LABORATORIO=1`, y la acción que gasta OpenRouter también responde 503 sin `OPENROUTER_API_KEY` o al llegar al
tope del lienzo (US$0.25). Riesgo **bajo** hoy y **medio** si se enciende fuera del laboratorio: la ruta no tiene
cuenta, y antes de exponerla hace falta sesión y C3.

## 5. Lo que queda para otra firma (no se hizo)

- **Adoptar el CLI en el arnés** (skill, `settings.json` o manifiesto de la imprenta): CDC aparte.
- **Set de referencia v2**: cuatro respuestas esperadas chocan con el contrato o con la capa (q021 y q027 cuentan
  como dimensión el eje de tiempo de una línea que la instrucción no pide; q059 espera analizar una métrica con
  desfase, que la capa no puede totalizar; q058 es ambigua entre eje y filtro). Adjudicarlas es del laboratorio y
  de un revisor; esta rama no tocó el set.
- **Reglas de auto-blindaje** del post-mortem (reporte §Post-mortem) en `.claude/rules/aprendizajes-stack.md`:
  propuestas, sin aplicar.
