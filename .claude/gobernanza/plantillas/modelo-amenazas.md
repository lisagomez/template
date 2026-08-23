# Modelo de amenazas — plantilla de PRP

> Control **C3** de `../GOBERNANZA.md`. Sección fija de todo PRP. Cinco pasos en
> miniatura: no es un documento aparte, son ~15 líneas dentro del PRP.
>
> **La pregunta que responde**: *¿quién nos ataca y qué le impide lograrlo?*
> Su hermana es la AISIA (`aisia.md`), que responde *¿a quién dañamos sin atacante?*

---

## Plantilla (pegar en el PRP)

```markdown
## Modelo de amenazas

**Activos que toca**: [qué se pierde si esto se compromete, ordenado por daño]
**Fronteras que cruza**: [de dónde entra dato no confiable a esta feature]
**Atacante relevante**: [O1..O6 — ver catálogo]
**Controles**: [qué reduce el riesgo, y cuál es la brecha que queda abierta]
```

---

## Paso 1 — Activos típicos de un SaaS agéntico

Ordénalos por **daño si se comprometen**, no por valor contable.

| Activo | Daño si se compromete |
|---|---|
| Claves de servicio (`service_role`, API keys, secretos de webhook) | Acceso total, saltándose todo control |
| Datos personales de usuarios finales | Daño a terceros que nunca eligieron estar aquí; obligación legal de notificar |
| Credenciales de pago / cobros | Pérdida directa de dinero |
| Prompts, skills y `CLAUDE.md` | Cambio silencioso de comportamiento de todo lo que se produzca después |
| Presupuesto de tokens | Denial-of-wallet: quemar dinero sin hackear nada |
| Reputación | Cuando el producto es confianza, perderla es perder el negocio |

## Paso 2 — Fronteras de confianza

**NO confiable — todo lo que cruza hacia adentro se valida (Zod, sin excepción):**

- Entradas de usuario, siempre. Texto adversarial por defecto.
- Archivos subidos: falsificables, y maliciosos como archivos. Nunca entran crudos al
  contexto del modelo.
- Resultados de web/search/tools: inyección **indirecta** de prompts.
- **Las salidas del LLM.** Este es el que se olvida: no se confían por diseño. Quien
  verifica re-ejecuta los gates de cero.
- Webhooks de terceros: se verifica la firma, no la palabra del remitente.
- Dependencias (npm, imágenes Docker): cadena de suministro.

**Confiable con condiciones**: la base de datos (con RLS correcta y llaves por servicio,
no compartidas) y **el humano aprobador** — confiable pero **falible**: la fatiga de
aprobación es una amenaza (O3), no un insulto.

**Separaciones duras que se preservan siempre**: quien genera código no tiene llaves de
producción; quien ve el mundo no mueve dinero; los estados terminales solo por humano.

## Paso 3 — Flujos

Dibuja de dónde entra el dato hasta dónde produce consecuencias, y **marca los cruces de
frontera**: ahí vive el riesgo, no en el medio.

## Paso 4 — Objetivos del atacante (catálogo)

| # | Atacante | Objetivo |
|---|---|---|
| **O1** | Usuario malicioso | **Inyección de requerimientos**: no hackea, *conversa*. Pide algo técnicamente válido pero tramposo, o intenta inyección de prompt. La fábrica, fiel, lo construiría perfecto. |
| **O2** | Contraparte deshonesta | Datos o evidencia falsa que el sistema acepta como verdad. |
| **O3** | Fatiga / insider | **El sello de goma**: tras 40 verdes seguidos, el aprobador deja de leer. Estadística, no malicia. |
| **O4** | Bots y externos | Denial-of-wallet, abuso de canal, scraping. |
| **O5** | Cadena de suministro | Dependencia comprometida, imagen sin pinear, typosquatting. |
| **O6** | Compromiso de un servicio | Un servicio con privilegio se vuelve palanca; el techo de permisos acota el daño. |

## Paso 5 — Controles

| Control | Qué exige | Brecha típica |
|---|---|---|
| Validación de entrada | Zod en todo input; entrada de usuario tratada como **DATOS, jamás como instrucciones** | Falta lista de patrones sospechosos que fuercen escalada |
| Mínimo privilegio | Llave por servicio, no compartida; C7 | `service_role` heredado "porque funcionaba" |
| Monitoreo | Límites de gasto, rate-limit por remitente, kill-switch | El kill-switch nunca se probó (§9) |
| Aprobación humana | Todo lo irreversible pasa por humano; **anti-sello-de-goma**: diff acotado y banderas arriba | Diffs enormes que nadie lee |
| Auditoría | Log de qué se aprobó y qué se desplegó; que sean lo mismo | Ventana entre aprobar y desplegar |
| Protección de datos | RLS + C7; archivos saneados antes de tocar el modelo | Archivos crudos al contexto |

---

## Priorización

Ataca primero **O1 y O3**: son los más baratos para el atacante y los más caros de
descubrir tarde. Cuestan poco de mitigar (reglas de escalada + diseño del paquete de
revisión) y son exactamente los que un sistema agéntico expone y uno tradicional no.
