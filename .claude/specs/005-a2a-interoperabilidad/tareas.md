# Tareas 005 — Capa de interoperabilidad A2A

> **Actualizado el 2026-09-13 (spec 010)**: el bridge está construido con el extractor como capacidad
> real. Lo que sigue abierto: TAR-14 (control negativo) y TAR-16 (autocrítica); el CDC (TAR-15)
> quedó aprobado el 2026-09-13. Exponer el endpoint sigue siendo gate humano. Orden por dependencia.
> La fase 1 no es opcional ni se puede saltar: sin ella, todo lo demás se escribe contra
> un protocolo recordado en vez de contra el instalado.

## Fase 1 — Verificar el protocolo contra la fuente (bloquea todo lo demás)

- [x] **TAR-1 · Instalar `@a2a-js/sdk` e introspeccionar el paquete real.**
      Hecho cuando: están confirmados **contra los `.d.ts` o los exports**, no contra esta
      spec: la forma exacta de `AgentCard` (casing, campos opcionales), el tipo de
      `TaskState`, si el handler núcleo es extraíble sin Express, y si conviene la
      superficie proto/gRPC o la capa de compatibilidad JSON-RPC.
      RF: INVESTIGA-1, DoF-8.
      → **Hecho (2026-09-13):** introspeccionado `@a2a-js/sdk@1.1.0` (2026-09-13): `AgentCard` con `supportedInterfaces[].protocolVersion`, `TaskState` enum numérico serializado como `TASK_STATE_*`, `JsonRpcTransportHandler` sin Express, método JSON-RPC `SendMessage`, partes `raw|text|data`.

- [x] **TAR-2 · Leer el repositorio oficial `a2aproject/A2A`.**
      Hecho cuando: están confirmadas las reglas de transición entre estados de Task y la
      forma exacta de `AgentSkill`. RF: INVESTIGA-2.
      → **Hecho (2026-09-13):** estados de Task confirmados en el SDK (COMPLETED, FAILED, CANCELED terminales); `AgentSkill` con `examples`, `inputModes`, `outputModes`, `securityRequirements` obligatorios.

- [x] **TAR-3 · Pinear la versión resuelta.**
      Hecho cuando: `package.json` declara la versión exacta y queda escrita su fuente.
      Sin rangos `^`. RF: DoF-3, C1.
      → **Hecho (2026-09-13):** `"@a2a-js/sdk": "1.1.0"` en `package.json`, sin rango.

- [x] **TAR-4 · Decidir el punto de integración con Next.js.**
      Hecho cuando: está decidido handler núcleo directo vs. adaptador Express, **con la
      evidencia de introspección pegada**. RF: DoF-8. Depende de TAR-1.
      → **Hecho (2026-09-13):** handler núcleo directo en Route Handler (`src/features/a2a/puente.ts`), espejo del adaptador Express del SDK sin Express.

## Fase 2 — La skill

- [ ] **TAR-5 · Medir el presupuesto de contexto ANTES de escribir el frontmatter.**
      Hecho cuando: `npm run mide:contexto` dice cuánto cabe. Hoy las descripciones están
      al **95 % de 3500**: puede que haya que recortar descripciones ajenas en el mismo
      cambio. RF: INVESTIGA-5, RESTRICCIONES.

- [ ] **TAR-6 · Escribir `/add-a2a` con la entrevista de descubrimiento.**
      Hecho cuando: declara la entrevista, el campo de regla de oro, el path del Agent
      Card, los estados usados, la opacidad, el fail-safe, C7 y el gate humano.
      **Sin entrevista no genera nada.** RF: MISION-1, DoF-2. Depende de TAR-5.

- [ ] **TAR-7 · Contrato en el corpus.**
      Hecho cuando: `add-a2a` tiene entrada en `golden-sets/contratos.json` y
      `npm run regresion` la verifica. RF: COMANDO DE VALIDACION.

## Fase 3 — El bridge y su plantilla

- [x] **TAR-8 · Agent Card en `/.well-known/agent-card.json`.**
      Hecho cuando: se sirve JSON completo, **validado contra los tipos del SDK instalado**,
      no contra una lectura del proto. RF: MISION-3, DoF-4.
      → **Hecho (2026-09-13):** `src/app/.well-known/agent-card.json/route.ts`, tipos del SDK, dos skills, versión 1.0 declarada.

- [x] **TAR-9 · Bridge como Route Handlers.**
      Hecho cuando: vive en su propio espacio de rutas y no importa código de features de
      negocio salvo la interfaz declarada. RF: MISION-2, "aislar no fundir".
      → **Hecho (2026-09-13):** `src/app/a2a/route.ts` + `src/features/a2a/` (tarjeta, esquema Zod, cliente del servicio, ejecutor, puente).

- [x] **TAR-10 · Fail-safe probado apagando la capacidad.** *(con media hecha)*
      Hecho cuando: capacidad caída y entrada corrupta producen `failed` con razón legible.
      **Un fail-safe probado solo con el camino feliz no es un fail-safe.**
      **La mitad ya está**: los adaptadores del extractor no vuelcan ni la clave ni el cuerpo de la
      respuesta en un mensaje de error, y hay pruebas que lo exigen. Falta la otra mitad — que el
      bridge traduzca eso a una Task `failed` sin añadir un stack trace por el camino.
      RF: MISION-5, DoF-4.
      → **Hecho (2026-09-13):** probado apagando la capacidad (URL a puerto cerrado) y con entrada corrupta: `TASK_STATE_FAILED` con razón en español, sin URL ni código de red (`scripts/prueba-a2a.ts`).

- [x] **TAR-11 · Opacidad demostrada.** *(abaratada el 2026-09-09)*
      Hecho cuando: se intenta llegar desde la superficie A2A a una ruta interna, stack
      trace o nombre de tabla, y se evidencia que no se filtra.
      **Se porta la prueba de Hermes, no se inventa una.** Y su forma importa: la suya **enumera las
      rutas de la app y exige igualdad** con el conjunto de tres, en vez de probar una lista de
      rutas internas. Una lista solo caza lo que alguien pensó en poner en ella; enumerar caza **la
      ruta que nadie previó**, que es la que se filtra de verdad. Más una tercera que fija que
      `/health` devuelve exactamente `{"status":"ok"}`: un health que reporta versiones o estado de
      base de datos es reconocimiento gratis.
      Se abarata porque la capacidad ofrecida **no tiene interior que filtrar**: el extractor no
      conoce rutas, ni nombres de tabla, ni el motor que lo mueve — se lo dan.
      **La prueba se escribe en el MISMO PR que el bridge (TAR-9), no antes**: un verificador sin
      nada que verificar es código que parece capacidad y nunca ha corrido contra lo real.
      El código listo para pegar está en `docs/SDD-puente-a2a-extractor.md` §6. RF: MISION-4, DoF-5.
      → **Hecho (2026-09-13):** prueba que ENUMERA los `route.ts` de `src/app` y exige igualdad con las tres rutas; health exacto; Card sin nombres del interior. Revisión por agente distinto del autor en la sesión de la spec 010: cazó cinco fugas que las pruebas del autor no cubrían (motivo crudo del OCR, `-32603` del SDK con mensaje interno, `ListTasks` global con `history`, eco de la versión, razón engañosa por `mediaType`); las cinco corregidas con regresión (15/15).

- [x] **TAR-12 · Auth mínima, con lo que falta declarado residual.**
      Hecho cuando: API key o bearer funciona y OAuth2/OIDC/mTLS + multi-partner quedan
      escritos como residual explícito. RF: MISION-6.
      → **Hecho (2026-09-13):** clave por cabecera `X-API-Key` cuando `A2A_API_KEY` está puesta (401 sin ella); OAuth2/OIDC/mTLS/multi-partner declarados residual en la Card.

## Fase 4 — Cerrar

- [x] **TAR-13 · Prueba end-to-end con una capacidad REAL.** *(cambiada el 2026-09-09)*
      **Ya no hace falta inventar una capacidad de juguete**: `tools/extractor-documental/` es una
      capacidad real, con 372 pruebas, y —lo que decide— **su núcleo no tiene credenciales**: el
      motor de OCR y el almacén se inyectan. Eso, que se hizo para que el paquete fuera instalable,
      resulta ser exactamente la frontera que Hermes exige de un componente que ejecuta un modelo:
      *«ningún componente que ejecuta un modelo tiene credenciales»*.
      Hecho cuando: el bridge expone `extraccion-documental`, corre contra un documento de prueba
      **propio, nunca de cliente**, y su salida queda pegada. Diseño: `docs/SDD-puente-a2a-extractor.md`.
      RF: DoF-4, COMANDO DE VALIDACION.
      → **Hecho (2026-09-13):** corrida contra el servicio OCR real con un escaneo sintético: COMPLETED con confianza, evidencia y `revisionHumana` por campo; XML por la skill de comprobante con `selloVerificado=false`.

- [ ] **TAR-14 · Control negativo del contrato.**
      Hecho cuando: se rompe una de las seis garantías → `regresion` en rojo; restaurar →
      verde. RF: DoF-6.

- [x] **TAR-15 · CDC redactado sin auto-aprobación.**
      Hecho cuando: hay entrada en `BITACORA-CDC.md` (radio: skill nuevo) con la aprobación
      humana **pendiente**, y memoria del proyecto actualizada. RF: DoF-10, C1.
      → **Hecho (2026-09-13):** entrada redactada por el agente con aprobación pendiente; **aprobada por lisagomez el 2026-09-13** («aprueba CDC»), acta en `BITACORA-CDC.md`. Exponer el endpoint sigue fuera de esta firma.

- [ ] **TAR-16 · Autocrítica.**
      Hecho cuando: está respondido qué parte de la auth es teatro por no probarse contra un
      consumidor real, qué campo puede moverse por ser estándar joven, y qué le falta para
      servirle a un partner real. RF: DoF-11.

## Nota sobre el estado de partida

La spec dice que `regresion` daba **92/92** cuando se escribió. Hoy da **105/105** y
`verify:gobernanza` **136/136**. El gate parte limpio en esta máquina — confírmalo igual
antes de asumirlo, como pide la propia spec.
