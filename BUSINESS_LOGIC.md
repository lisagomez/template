# BUSINESS_LOGIC.md — [Nombre del Proyecto]

> ⚠️ **PLANTILLA SIN LLENAR.** Este archivo es el contrato de negocio del proyecto y lo
> genera el skill **`/new-app`** a partir de una entrevista. No lo edites a mano al
> arrancar: di qué quieres construir y el agente lo llena.
>
> Mientras diga "PLANTILLA SIN LLENAR", **este proyecto no tiene lógica de negocio
> definida** y nada de lo que se construya encima tiene contra qué validarse.

---

## 1. Problema de Negocio

**Dolor:** [Qué proceso está roto, es lento o costoso hoy]
**Costo actual:** [En tiempo, dinero o leads perdidos. Específico.]

## 2. Solución

**Propuesta de valor:** [Un <tipo de herramienta> que <acción> para <usuario específico>]

**Flujo principal (Happy Path):**
1. [Paso 1]
2. [Paso 2]
3. [Paso 3]

## 3. Usuario Objetivo

**Rol:** [Quién lo usa]
**Contexto:** [Cuándo y dónde lo usa]

## 4. Arquitectura de Datos

**Input:** [Qué entra]
**Output:** [Qué sale]

**Storage (tablas Supabase sugeridas):**
- `[tabla]`: [descripción] — RLS habilitada

## 5. KPI de Éxito

**Métrica principal:** [Cómo se sabe que funcionó]

## 6. Gobernanza (controles C4 y C7)

> Se llena SIEMPRE, aunque el proyecto sea chico. Plantilla completa en
> `.claude/gobernanza/plantillas/aisia.md`. La pregunta que responde esta sección no es
> *¿quién nos ataca?* sino **¿a quién dañamos si el sistema opera bien y se equivoca?**

| Punto | Respuesta |
|---|---|
| **Datos personales que toca** | [de quién, qué tipo — o "ninguno"] |
| **Partes afectadas** | [incluidos los que NO son usuarios de la app] |
| **Daño con el sistema operando bien** | [decisión errónea sin ningún atacante] |
| **Acciones irreversibles** | [cobros, envíos, borrados — cada una con gate humano] |
| **Vía de apelación humana** | [cómo revierte un usuario una decisión automática] |
| **Aislamiento de datos** | RLS en toda tabla; las superficies NO usan `service_role` (C7) |

## 7. Especificación Técnica (Para el Agente)

### Features a implementar (Feature-First)

```
src/features/
├── auth/           # Autenticación Email/Password (Supabase)
└── [feature]/      # [Descripción]
```

### Stack confirmado

Golden Path del template — ver `CLAUDE.md`. No se discute stack: Next.js 16 + React 19 +
TypeScript + Tailwind 3.4, Supabase (Auth + DB + RLS), Zod, Zustand, Playwright.

### Próximos pasos

1. [ ] Configurar Supabase
2. [ ] Implementar Auth (`/add-login`)
3. [ ] Feature principal
4. [ ] Testing E2E (`/playwright-cli`)
5. [ ] `npm run validate` en verde (typecheck + build + gobernanza)
6. [ ] Deploy

---

*Generado por SaaS Factory V4 · Fecha: [FECHA] · Llenar con `/new-app`*
