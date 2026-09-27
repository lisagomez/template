# Inventario: menciones de cobro o pasarela en línea (2026-09-27)

Rama `pagos-add-payments`, apilada sobre `pymes-marketing-build` (sin mezclar a `main`). Búsqueda sobre
`git ls-files` (md, mdx, json, ts, tsx, mjs), en inglés y en español, sin corpus, mediciones, datos de
trayectorias ni el ERP contable. 129 coincidencias en la primera pasada; aquí las que importan.

## Necesitaba referencia → se puso
| Archivo:línea | Qué decía | Qué se hizo |
|---|---|---|
| `.claude/skills/add-payments/SKILL.md:3-13` y `:41` | Solo lo que resuelve; ningún límite de Polar | `description` suma «NO USAR para: … bienes físicos o servicios presenciales, ni marketplaces»; sección **Límites (qué NO resuelve)** con citas de Polar, suscripción→acceso, México y lo «a verificar» |
| `.claude/skills/website-3d/SKILL.md:43-48` | «D) Venta Directa — Botón de compra / checkout» sin camino | Acceso o suscripción digital → `/add-payments`; físico o presencial → tienda o WhatsApp, no ese skill |
| `.claude/skills/new-app/SKILL.md:209-211` | El BUSINESS_LOGIC no decidía si la app cobra ni cómo | Línea «Cobro en línea» con las tres ramas (no cobra · `/add-payments` · no aplica) |
| `.claude/PRPs/prp-base.md:156-157` | «Si esta feature bloquea, cobra o rechaza…» sin camino | Cobro por acceso o suscripción → `/add-payments`; físico o presencial → no aplica |
| `.claude/skills/supabase/SKILL.md:309-310` | MRR sobre `purchases` sin decir de dónde sale la tabla, etiqueta USD fija | Cita `/add-payments` y marca la moneda «a verificar» |
| `.claude/skills/supabase/references/schema-example.md:14` | Tabla `purchases` sin origen | «la crea `/add-payments` (Polar)» |
| `.claude/skills/bucle-agentico/SKILL.md:28` | Ejemplo «Sistema de facturación con Stripe» (Stripe directo, excluido por `add-payments`) | «Planes y cobro por uso sobre /add-payments (Polar)» |
| `.claude/rules/flujos.md:18` | «ADD-PAYMENTS → Pagos con Polar (si el proyecto cobra)» | «(si cobra acceso o suscripción; bienes físicos: no aplica)» — +10 tokens |
| `docs/SDD-alineacion-imprenta.md:163` | «es con lo que cobra el golden path» sin nombrar el skill | «(skill `/add-payments`)» |

## Referencia equivocada → se corrigió
| Archivo:línea | Qué decía | Por qué estaba mal | Qué se hizo |
|---|---|---|---|
| `.claude/skills/add-a2a/SKILL.md:27` | «Igual que `/add-payments` pregunta qué se va a cobrar» | `add-payments`: «NO PREGUNTES. Ejecuta el Golden Path completo» | «`/add-payments` no pregunta porque el producto y su precio ya viven en Polar…» + contrato `prohibido` para que no vuelva |
| `.claude/specs/005-a2a-interoperabilidad/spec.md:46` | La misma comparación | Mismo error | **No se reescribe**: es registro de una spec cerrada; la regla viva está en la skill |

## No aplica → se dijo por qué (y dónde quedó dicho)
| Archivo:línea | Por qué no lleva la referencia |
|---|---|
| `.claude/goals/pymes-marketing/resultados.md:64` | **Cobro de la pyme** (ligas de pago, tienda de pan): Polar prohíbe productos físicos y no es para servicios presenciales. Se dejó el **hueco nombrado**, no la referencia |
| `.claude/goals/pymes-marketing/triaje-plugin.md` (PayPal, Mercado Pago, Stripe como fuentes de ventas; contracargos) | Es **lectura** de ventas para analizarlas, no cobrar |
| `tools/pymes-marketing/NOTICE`, `grafo.json:151` | Conectores de datos sustituidos por CSV/CFDI: lectura |
| `.claude/specs/007-extractor-documental/*`, `docs/SDD-extractor-documental.md`, `docs/SDD-qr-seguros.md`, `.claude/rules/qr-seguros.md` | Cobros como **escenario de daño** (pago desviado, QR sustituido) o control de seguridad, no una pasarela |
| `.claude/specs/003-imprenta-de-clis/spec.md:99,104`, `docs/SDD-imprenta-de-clis.md:192` | CLIs que mueven dinero: gate y C5, no un cobro que implementar |
| `docs/FASE0-INFRAESTRUCTURA.md:143`, `.claude/skills/new-app/SKILL.md:181`, `.claude/goals/pruebas-voz/spec.md:110` | «Cobrar» como acción irreversible con gate humano |
| `.claude/memory/project/imprenta-de-clis.md:33`, `.claude/memory/reference/entorno-git-y-red.md`, `.claude/imprenta/manifiesto.json:114-123` | El CLI `polar` de la imprenta; el manifiesto ya enlaza `"skill": "add-payments"` |
| `.claude/skills/memory-manager/SKILL.md:123` | Ejemplo de una decisión que se guarda («Stripe en vez de Polar»), no un flujo |
| `.claude/design-systems/*` («estilo Stripe») | Referencia visual |
| `.claude/skills/ai/references/structured-outputs.md:121` (`'billing'`) | Categoría de ejemplo |
| `scripts/audita-secretos.mjs:30` | Firma de llaves de Stripe para cazar fugas |
| `scripts/inventario/*`, `scripts/prueba-*.{ts,mjs}`, `scripts/lib/imprenta.mjs` | `cli:polar` como activo o fixture |
| `docs/INVESTIGACION-OCR-*.md`, `docs/DEPLOY-HETZNER.md`, `docs/GOAL-inventario-de-activos.md` | «De pago» = licencias o planes de terceros |
| `.claude/skills/add-mobile/SKILL.md` | «Suscripción» de notificaciones push |
| `eslint.config.mjs:11`, `scripts/inventario/repo.mjs:43` | `checkout` de git |
| `.claude/PRPs/PRP-004-*.md:201`, `erp/**` | Cobros del ERP contable (registro, no pasarela) |
| `.claude/gobernanza/BITACORA-CDC.md` | Registro de solo añadir: no se reescribe |
| `.claude/goals/pymes-marketing/propuesta-video.md`, `spec.md`, `plan.md` | «Servicios de pago» = APIs de terceros con costo |

## Ya la tenía
`AGENTS.md:36-37` (decision tree), `GEMINI.md:45-46` (generado), `README.md:175`, `.claude/README.md:148,345,422`,
`.claude/skills/SKILLS_README.md:20`, `.claude/PRPs/PRP-002-*.md:64`, `.claude/imprenta/manifiesto.json:116`,
`.claude/gobernanza/golden-sets/contratos.json` (contrato de `add-payments`). Sin cambios: el límite vive
ahora en el skill al que todas llevan.
