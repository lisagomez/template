# Registro de decisiones de riesgo

> Control **C5** de `GOBERNANZA.md`. **Append-only**: se añade una entrada por decisión;
> **nunca se edita una pasada**. Si una decisión cambia, se escribe una entrada nueva
> que la supersede.

## Para qué existe

Aceptar un riesgo conocido es una decisión con dueño, no una casilla de configuración.
Aquí queda **quién** la tomó, **cuándo** y con **qué justificación**. Sin eso, dentro de
seis meses nadie recuerda si algo fue una decisión o un descuido — y esa diferencia es
justo lo que un auditor pregunta.

## Formato

```markdown
### <fecha ISO> — <ámbito> — <tipo de decisión>
- **Decisión**:
- **Riesgo aceptado**:
- **Mitigaciones vigentes**:
- **Firmado por** (nombre y rol):
- **Vigencia / próxima revisión**:
```

> **Sobre el append-only**: completar la firma de una entrada **no** cuenta como editarla
> — el campo existe para llenarse. Cambiar su decisión, su riesgo o sus mitigaciones sí:
> eso exige una entrada nueva que supersede a la anterior.

## Decisiones que SIEMPRE requieren entrada firmada

1. Poner algo en producción con un control conocido pendiente.
2. Ampliar los permisos de un agente o de un rol.
3. Usar `service_role` en una superficie de negocio (C7).
4. Desactivar o saltarse un gate, aunque sea "temporalmente".
5. Subir límites de gasto o de cuota por encima de los defaults.
6. Habilitar cualquier acción irreversible sin gate humano.

> Este archivo hereda la visibilidad del repositorio. Revísalo antes de publicarlo o de
> entregar el proyecto a un cliente (control C5 de `GOBERNANZA.md`).

---

## Entradas

### 2026-08-23 — ámbito global — adopción de la capa de gobernanza
- **Decisión**: adoptar los siete controles de `GOBERNANZA.md` como base del template y
  de todo proyecto que nazca de él, cableados a `CLAUDE.md` y a `prp-base.md`, con
  verificador automático (`npm run verify:gobernanza`).
- **Riesgo aceptado**: **ninguno en producción todavía.** Esta capa es documentación y
  verificación de cableado; no cambia el comportamiento de ninguna app desplegada.
- **Mitigaciones vigentes**: el verificador falla si el papel y el código divergen, y se
  probó con control negativo; el CDC (C1) queda activo desde hoy para cualquier cambio
  de skill o de modelo.
- **Firmado por**: **lisagomez** (responsable del proyecto) — autorización dada en sesión del 2026-08-23
- **Vigencia / próxima revisión**: al cerrar el primer hueco (C2) o tras el primer
  incidente, lo que ocurra antes.

### 2026-08-23 — C2 · suite de regresión de skills — control declarado, no construido
- **Decisión**: declarar el control C2 con su forma y sus casos-trampa definidos, pero
  **no construir la suite todavía**; entra como PRP propio.
- **Riesgo aceptado**: hoy **nadie verifica sistemáticamente a los skills**. Un cambio de
  modelo o la edición de un skill puede degradar en silencio lo que la fábrica produce, y
  el CDC (C1) exigiría una regresión que aún no existe: en la práctica el gate se apoya
  solo en el diff y la aprobación humana.
- **Mitigaciones vigentes**: el modelo en producción está pineado (nada cambia solo);
  todo CDC deja diff y entrada en `BITACORA-CDC.md`, así que el cambio es rastreable
  aunque no esté probado; `npm run validate` sigue cazando roturas de código.
- **Firmado por**: **lisagomez** (responsable del proyecto) — autorización dada en sesión del 2026-08-23
- **Vigencia / próxima revisión**: **antes de la primera migración forzada de modelo**
  (deprecación). Construir la suite durante una migración obligatoria es exactamente el
  peor momento.

### 2026-08-23 — C7 · `service_role` — migración diferida al segundo tenant
- **Decisión**: no migrar hoy las superficies fuera de `service_role`; la regla queda
  escrita y el disparador fijado en **el alta del segundo tenant**, no en una fecha.
- **Riesgo aceptado**: mientras una superficie use `service_role` para dato de negocio,
  RLS no la detiene y el aislamiento vive solo en el código de la aplicación.
- **Mitigaciones vigentes**: con un solo tenant no hay dato ajeno que filtrar; RLS se
  habilita igual en toda tabla (el dato queda etiquetado y las políticas quedan probadas
  para el día del cambio); `SUPABASE_SERVICE_ROLE_KEY` nunca lleva `NEXT_PUBLIC_`.
- **Firmado por**: **lisagomez** (responsable del proyecto) — autorización dada en sesión del 2026-08-23
- **Vigencia / próxima revisión**: al dar de alta el segundo tenant. `select count(*)
  from organizaciones where tipo='tenant'` mayor que 1 con superficies aún en
  `service_role` es el estado que esta decisión declara inaceptable.

### 2026-08-23 — C2 · suite de regresión — **supersede la entrada de C2 de esta misma fecha**
- **Decisión**: construir C2 en dos capas en vez de dejarla como PRP futuro. Capa A
  (contratos estructurales, determinista) entra a `npm run validate`; capa B (8 casos
  adversariales) se ejecuta en cada CDC.
- **Riesgo aceptado**: la capa A verifica que un skill **declare** sus reglas, no que las
  **cumpla** al ejecutarse — eso solo lo prueba la capa B, que necesita modelo y criterio
  humano. Un skill puede satisfacer el contrato y aun así comportarse mal.
- **Mitigaciones vigentes**: la capa A caza el 100% de las regresiones por borrado o
  reescritura de una regla (probado con control negativo sobre el skill `supabase`); la
  capa B cubre el comportamiento en los 8 vectores más baratos (O1-O6); todo incidente
  añade un caso al corpus (C6).
- **Firmado por**: **lisagomez** (responsable del proyecto) — autorización dada en sesión del 2026-08-23
- **Vigencia / próxima revisión**: al primer CDC de radio "sistema" (cambio de modelo),
  que es cuando la capa B se estrena de verdad.

### 2026-08-23 — C2 capa B — el corpus se ofusca, no se cifra
- **Decisión**: codificar en base64 las expectativas de los casos-trampa y dejarlas en el
  repo, en vez de sacarlas del proyecto o cifrarlas.
- **Riesgo aceptado**: **base64 no es cifrado.** Un agente que decida decodificarlo puede
  leer las respuestas esperadas y la prueba deja de ser ciega. Lo que se compra es que no
  ocurra *por accidente*, que es como ocurrió el 2026-08-23 (caso T2).
- **Mitigaciones vigentes**: decodificar es un acto deliberado y queda visible en el
  transcript — es señal de contaminación, no descuido; el verificador falla si alguna
  expectativa vuelve a texto plano; las entradas siguen verbatim, que es lo que la prueba
  necesita. Sacar el corpus del repo lo haría no heredable, que es peor para un boilerplate.
- **Firmado por**: **lisagomez** (responsable del proyecto) — autorización dada en sesión del 2026-08-23
- **Vigencia / próxima revisión**: si un caso vuelve a salir contaminado, se saca el corpus
  del árbol de trabajo durante las corridas.

<!-- Añadir aquí las decisiones siguientes. NO editar las anteriores. -->
