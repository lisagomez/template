# Tareas 005 — Capa de interoperabilidad A2A

> **Todas ABIERTAS y NO AUTORIZADAS.** Esta spec no está construida. Orden por dependencia.
> La fase 1 no es opcional ni se puede saltar: sin ella, todo lo demás se escribe contra
> un protocolo recordado en vez de contra el instalado.

## Fase 1 — Verificar el protocolo contra la fuente (bloquea todo lo demás)

- [ ] **TAR-1 · Instalar `@a2a-js/sdk` e introspeccionar el paquete real.**
      Hecho cuando: están confirmados **contra los `.d.ts` o los exports**, no contra esta
      spec: la forma exacta de `AgentCard` (casing, campos opcionales), el tipo de
      `TaskState`, si el handler núcleo es extraíble sin Express, y si conviene la
      superficie proto/gRPC o la capa de compatibilidad JSON-RPC.
      RF: INVESTIGA-1, DoF-8.

- [ ] **TAR-2 · Leer el repositorio oficial `a2aproject/A2A`.**
      Hecho cuando: están confirmadas las reglas de transición entre estados de Task y la
      forma exacta de `AgentSkill`. RF: INVESTIGA-2.

- [ ] **TAR-3 · Pinear la versión resuelta.**
      Hecho cuando: `package.json` declara la versión exacta y queda escrita su fuente.
      Sin rangos `^`. RF: DoF-3, C1.

- [ ] **TAR-4 · Decidir el punto de integración con Next.js.**
      Hecho cuando: está decidido handler núcleo directo vs. adaptador Express, **con la
      evidencia de introspección pegada**. RF: DoF-8. Depende de TAR-1.

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

- [ ] **TAR-8 · Agent Card en `/.well-known/agent-card.json`.**
      Hecho cuando: se sirve JSON completo, **validado contra los tipos del SDK instalado**,
      no contra una lectura del proto. RF: MISION-3, DoF-4.

- [ ] **TAR-9 · Bridge como Route Handlers.**
      Hecho cuando: vive en su propio espacio de rutas y no importa código de features de
      negocio salvo la interfaz declarada. RF: MISION-2, "aislar no fundir".

- [ ] **TAR-10 · Fail-safe probado apagando la capacidad.** *(con media hecha)*
      Hecho cuando: capacidad caída y entrada corrupta producen `failed` con razón legible.
      **Un fail-safe probado solo con el camino feliz no es un fail-safe.**
      **La mitad ya está**: los adaptadores del extractor no vuelcan ni la clave ni el cuerpo de la
      respuesta en un mensaje de error, y hay pruebas que lo exigen. Falta la otra mitad — que el
      bridge traduzca eso a una Task `failed` sin añadir un stack trace por el camino.
      RF: MISION-5, DoF-4.

- [ ] **TAR-11 · Opacidad demostrada.** *(abaratada el 2026-09-09)*
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

- [ ] **TAR-12 · Auth mínima, con lo que falta declarado residual.**
      Hecho cuando: API key o bearer funciona y OAuth2/OIDC/mTLS + multi-partner quedan
      escritos como residual explícito. RF: MISION-6.

## Fase 4 — Cerrar

- [ ] **TAR-13 · Prueba end-to-end con una capacidad REAL.** *(cambiada el 2026-09-09)*
      **Ya no hace falta inventar una capacidad de juguete**: `tools/extractor-documental/` es una
      capacidad real, con 372 pruebas, y —lo que decide— **su núcleo no tiene credenciales**: el
      motor de OCR y el almacén se inyectan. Eso, que se hizo para que el paquete fuera instalable,
      resulta ser exactamente la frontera que Hermes exige de un componente que ejecuta un modelo:
      *«ningún componente que ejecuta un modelo tiene credenciales»*.
      Hecho cuando: el bridge expone `extraccion-documental`, corre contra un documento de prueba
      **propio, nunca de cliente**, y su salida queda pegada. Diseño: `docs/SDD-puente-a2a-extractor.md`.
      RF: DoF-4, COMANDO DE VALIDACION.

- [ ] **TAR-14 · Control negativo del contrato.**
      Hecho cuando: se rompe una de las seis garantías → `regresion` en rojo; restaurar →
      verde. RF: DoF-6.

- [ ] **TAR-15 · CDC redactado sin auto-aprobación.**
      Hecho cuando: hay entrada en `BITACORA-CDC.md` (radio: skill nuevo) con la aprobación
      humana **pendiente**, y memoria del proyecto actualizada. RF: DoF-10, C1.

- [ ] **TAR-16 · Autocrítica.**
      Hecho cuando: está respondido qué parte de la auth es teatro por no probarse contra un
      consumidor real, qué campo puede moverse por ser estándar joven, y qué le falta para
      servirle a un partner real. RF: DoF-11.

## Nota sobre el estado de partida

La spec dice que `regresion` daba **92/92** cuando se escribió. Hoy da **105/105** y
`verify:gobernanza` **136/136**. El gate parte limpio en esta máquina — confírmalo igual
antes de asumirlo, como pide la propia spec.
