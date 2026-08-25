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

### Respaldo — qué pierde ESTE proyecto si arde el servidor

> No hay respaldo implícito. **Lo que no esté en esta tabla, no se respalda.** El
> inventario completo, la regla para decidir criticidad y los gates de verificación
> están en **[`docs/FASE0-INFRAESTRUCTURA.md`](docs/FASE0-INFRAESTRUCTURA.md) §9**.

Regla de criticidad, en una pregunta: **¿se puede reconstruir?**
Sin pérdida → no se respalda · Con trabajo → respaldo normal · **No** → respaldo inmutable.

| Activo del proyecto | ¿Reconstruible? | Criticidad | Destino |
|---|---|---|---|
| Datos en Supabase | [no / con trabajo] | [Crítica] | PITR + dump lógico |
| `.env.production` | No — contiene secretos | Crítica | Cifrado con `age`, fuera del servidor |
| [activo propio] | | | |

**RPO / RTO:** [desconocidos hasta cerrar GATE 3 — no se declaran antes de medirlos]

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

### Lo que este proyecto hereda del corpus de pruebas (C2)

Los casos-trampa que miden si los controles disparan **no viven en el árbol de trabajo**:
están en la rama **`golden-sets`** y se leen con `npm run regresion -- --trampa`. Dos cosas
que un proyecto derivado tiene que saber, porque las rompe sin querer:

- **Si clonas con `--single-branch` o forkeas sin esa rama, C2 capa B queda inaccesible.**
  No falla en silencio —el verificador lo detecta— pero el proyecto se queda sin la mitad
  del control.
- **Ningún identificador de caso puede aparecer en los archivos de este proyecto.** Ni uno,
  ni siquiera acompañado de su veredicto: el par caso→regla se reconstruye leyendo el repo
  y la prueba deja de ser ciega. La traza hacia un caso es el commit de `corridas.md` en la
  rama. **`npm run verify:gobernanza` falla si encuentra uno** — no depende del criterio de
  quien escriba.

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
7. [ ] Infraestructura de agentes, si aplica, y **respaldo con GATE 3 cerrado**
   (`docs/FASE0-INFRAESTRUCTURA.md`). Un respaldo sin restauración probada no cuenta
   como paso hecho
8. [ ] **Vigilancia de las versiones pineadas** (`docs/SDD-hermes-verificacion.md`).
   Todo lo que este proyecto pinea —modelo, imágenes, servidores MCP— gana estabilidad y
   **pierde noticias**: sin algo que avise, el rezago no se nota hasta que duele. Decidir
   quién mira y cada cuánto es parte de poner esto en producción, no un extra
9. [ ] **Decidir qué MCP se queda** (`docs/SDD-imprenta-de-clis.md`). Cada servidor MCP
   configurado cuesta tokens en **cada sesión, se use o no**: cinco de los del ejemplo suman
   20 363, casi el doble que todas las instrucciones juntas. La decisión es **por servidor y
   según frecuencia de uso**, no global — corre `node scripts/mide-mcp.mjs` y decide con la
   cifra delante, no con un factor heredado

---

*Generado por SaaS Factory V4 · Fecha: [FECHA] · Llenar con `/new-app`*
