# Plan 005 — Capa de interoperabilidad A2A

> **Plan PROSPECTIVO y NO APROBADO.** Esta spec **no está construida**: no existe
> `.claude/skills/add-a2a/`, `@a2a-js/sdk` no está en `package.json` y no hay ningún
> artefacto A2A en el repo (verificado 2026-08-30). Este plan no autoriza construir nada;
> es el punto de partida para el día que se ejecute.
>
> **Advertencia que condiciona todo lo de abajo:** los hallazgos de protocolo de la spec
> son de un fetch del **2026-08-24**. A2A es un estándar joven. Nada de este plan debe
> tratarse como hecho confirmado hasta introspeccionar el paquete que `npm install`
> resuelva **en el momento de construir**.

## Módulos propuestos

| Módulo | Responsabilidad | Grado de libertad |
|---|---|---|
| Skill `/add-a2a` | Entrevista de descubrimiento; sin ella no genera nada | **Fijo**: entrevista, nunca asume el dominio |
| Agent Card | `/.well-known/agent-card.json` | **Fijo**: el path es RFC 8615, no una elección |
| Bridge | Route Handlers de Next.js con `@a2a-js/sdk` | **Fijo**: el SDK y el stack. **Libre**: la ruta exacta |
| Punto de integración | Handler núcleo envuelto vs. adaptador Express | **Libre, pero sólo tras introspección** |
| Contrato de regresión | Entrada en `golden-sets/contratos.json` | **Fijo**: mismo mecanismo que `add-login` |

## La decisión que NO se puede tomar por adelantado

El SDK oficial trae una superficie proto/gRPC nativa y una capa de compatibilidad JSON-RPC
(`@a2a-js/sdk/compat/v0_3`), y **no tiene adaptador oficial para Next.js** — sí uno para
Express, como peer-dependency.

Cuál usar, y si el handler núcleo se puede envolver directamente en un Route Handler
(Request/Response estándar) o hace falta aceptar Express, **se decide introspeccionando el
paquete instalado**. La spec es explícita en que fijarlo por adelantado arriesga quedar
obsoleto. Este plan **no lo fija**.

## Decisiones ya tomadas por la spec (no reabrir sin CDC)

1. **La skill entrevista, nunca asume el dominio.** No hay default razonable para "cuál es
   tu negocio". Incluye preguntar la **regla de oro**: el invariante que el protocolo jamás
   puede perder al traducir la respuesta. En Hermes era "disclaimer + fuentes" porque el
   dominio era regulatorio; aquí lo declara cada usuario para su dominio.

2. **Opacidad por diseño.** La superficie expone SOLO la capacidad de la Agent Card: nunca
   rutas internas, ni el motor detrás, ni detalles de error internos.

3. **Fail-safe.** Capacidad caída, entrada inválida o excepción → Task `failed` con razón
   legible. Nunca un 200 con respuesta inventada, nunca un 500 crudo.

4. **Auth mínima declarada, el resto residual explícito.** API key o bearer como mínimo
   real; OAuth2/OIDC/mTLS y gestión multi-partner quedan como residual **declarado**, no
   fingido. La spec oficial de descubrimiento reconoce que aún no estandariza registries:
   tampoco hay que inventar ese mecanismo.

5. **Golden Path sin excepciones.** TypeScript, ningún servicio en otro lenguaje, ningún
   contenedor nuevo (`docker-compose.yml` sigue siendo `app` + `caddy`).

6. **Aislar, no fundir.** Aquí el aislamiento es límite de código (rutas propias), no de
   proceso como en Hermes.

7. **C7.** Si la capacidad toca Supabase, el bridge llama a la función que ya respeta RLS;
   jamás `service_role` para "simplificar".

## Restricción de contexto que muerde antes de escribir

La spec avisaba con las descripciones de skills al 87 % de 3500. **Hoy están al 95 %**
(3335 tokens, medido 2026-08-30) porque entró `spec-generator`. La `description` de
`add-a2a` tiene que ser magra **o no cabrá**: puede que haya que recortar descripciones
ajenas en el mismo cambio. Medir con `npm run mide:contexto` **antes** de escribir el
frontmatter, no después.

## Estrategia de tests

| Prueba | Qué demuestra | DoF |
|---|---|---|
| Agent Card servida | JSON completo y bien formado, validado contra los tipos del SDK instalado | 4 |
| Task que completa | El camino feliz | 4 |
| Entrada inválida / capacidad apagada | `failed` con razón legible | 4 |
| Intento de llegar a algo interno | La opacidad no filtra | 5 |
| **Negativa**: romper una garantía | `regresion` en rojo; restaurar → verde | 6 |

Nada de script de red nuevo: el contrato entra en `contratos.json` y lo verifica
`npm run regresion`, ya dentro de `validate`. La prueba end-to-end corre en una app
descartable, nunca con datos de cliente.

## Gate humano que no se salta

**Exponer el endpoint A2A real a un partner o a internet** es gate humano. Si se activa
antes de tener gestión de credenciales por partner, va como decisión de riesgo firmada
(C5). Y ojo con el límite de C5: si el daño recae sobre terceros que no firmaron, ninguna
firma lo autoriza.

## Lo que este plan no puede saber

La spec pregunta en su autocrítica **qué parte de la auth mínima es teatro** por no haberse
probado nunca contra un consumidor externo real. Sigue sin respuesta, y sólo se puede
responder ejecutando.
