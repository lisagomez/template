# AISIA — Evaluación de Impacto del Sistema de IA

> Control **C4** de `../GOBERNANZA.md`. Se llena una por sistema de IA y una por
> feature con consecuencias sobre personas. Se revisa al cambiar el sistema o tras
> un incidente.

**La pregunta que responde**: *¿a quién podemos dañar sin que nadie nos ataque?*
El modelo de amenazas cubre al atacante. Esto cubre el sistema operando **bien**.

---

## Plantilla

```markdown
# AISIA — <sistema / feature>
> Fecha: YYYY-MM-DD · Estado: borrador | firmada · Revisión: <disparador>

## 1. Partes afectadas
Quién recibe consecuencias, incluidos los que NO son usuarios.

## 2. Daños posibles SIN atacante
Qué pasa cuando el sistema decide mal operando exactamente como fue diseñado.

## 3. Severidad × probabilidad × reversibilidad
| Daño | Severidad | Probabilidad | ¿Reversible? |
|---|---|---|---|

## 4. Mitigaciones
Qué gate humano, qué plazo de gracia, qué vía de apelación, y qué se le comunica
al afectado.

## 5. Decisión
aceptar / mitigar / rediseñar / no ofrecer — con una línea de justificación.

Firmada por: ____________  Rol: ____________  Fecha: ____________
```

---

## Ejemplo lleno — el propio SaaS Factory

> Fecha: 2026-08-23 · Estado: **borrador — pendiente de firma** · Revisión: al añadir
> un skill que escriba a producción sin gate humano.

### 1. Partes afectadas

- **La dueña de la fábrica**: opera un sistema que genera código que ella no escribió
  y que puede no entender por completo.
- **Los usuarios finales de las apps generadas**: nunca hablaron con la fábrica, no
  saben que existe, y sus datos viven en un esquema que decidió un agente.
- **Terceros mencionados en los datos**: personas cuyos datos entran a una app generada
  sin haber sido parte de ninguna conversación.
- **Clientes de la dueña**, cuando la app se les entrega o se les revende.

### 2. Daños posibles SIN atacante

| Daño | Cómo ocurre operando "bien" |
|---|---|
| **Fuga de datos entre usuarios** | El agente genera una tabla sin RLS, o la genera con RLS pero la superficie usa `service_role` (C7). Nadie ataca: el aislamiento simplemente no existe. |
| **Pérdida de datos del usuario final** | Una migración generada altera una columna en producción. El agente hizo exactamente lo que se le pidió. |
| **Decisión automatizada sin apelación** | Una feature generada bloquea, cobra o rechaza a un usuario y no hay ruta humana para revertirlo, porque nadie pidió una. |
| **Cobro indebido** | Un webhook de pagos mal interpretado cobra de más. El código pasó typecheck y build. |
| **Exclusión por diseño** | La app generada asume conectividad, un idioma, o un dispositivo. Quien no encaja simplemente no puede usarla, y no aparece en ninguna métrica. |
| **Opacidad** | El usuario final no sabe que interactúa con algo construido y operado por agentes. |

### 3. Severidad × probabilidad × reversibilidad

| Daño | Severidad | Probabilidad | ¿Reversible? |
|---|---|---|---|
| Fuga entre usuarios | **Alta** | Media — es el error más fácil de cometer | **No**: el dato ya salió |
| Pérdida de datos | Alta | Baja-media | Solo con respaldo probado |
| Decisión sin apelación | Media-alta | **Alta** — nadie pide la vía de apelación | Sí, si existe la vía |
| Cobro indebido | Media | Media | Sí, con reembolso |
| Exclusión por diseño | Media | Alta | Sí, pero es invisible: nadie reporta |
| Opacidad | Baja-media | Alta | Sí |

### 4. Mitigaciones

- **Fuga**: RLS obligatoria (Reglas de Código) **más** C7 — la regla que hace que RLS
  no sea decorativa. Un PRP que crea tablas sin RLS no pasa.
- **Pérdida**: toda migración destructiva es acción irreversible → gate humano
  explícito. Respaldo probado antes, no después (§9: un respaldo no probado no es un
  respaldo).
- **Sin apelación**: toda feature que bloquee, cobre o rechace declara su **vía de
  apelación humana** en Criterios de Éxito del PRP. Si no la declara, no está completa.
- **Cobro**: los flujos de dinero son irreversibles por definición → gate humano y
  verificación contra el proveedor, nunca contra la palabra del webhook.
- **Exclusión**: la AISIA de cada feature nombra explícitamente a quién deja fuera.
- **Opacidad**: las apps generadas pueden y deben decir que operan con asistencia
  automatizada cuando eso afecte al usuario.

### 5. Decisión

**Mitigar.** La fábrica se opera con estas mitigaciones activas y con gate humano en
toda acción irreversible. Se **rediseña** (no se acepta) cualquier flujo donde un agente
pueda escribir a producción o mover dinero sin firma humana.

Firmada por: ______________________  Rol: responsable de la fábrica  Fecha: ____________

> Sin esa firma esta AISIA es un análisis, no una decisión. La firma la pone una
> persona; ningún agente puede fabricarla.
