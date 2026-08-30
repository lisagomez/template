# Plan 002 — Eficiencia de tokens y frescura de versiones

> **Plan RETROSPECTIVO.** Los cinco incrementos están construidos y con CDC firmado.
> Reconstruye la arquitectura resultante, verificada contra el repo el 2026-08-30.
> Queda abierto el punto 7 de su Definición de Hecho (ver al final).

## Módulos

| Módulo | Dónde vive | Responsabilidad |
|---|---|---|
| Sensor de contexto | `scripts/mide-contexto.mjs` | Mide tokens por archivo contra presupuesto declarado; falla en rojo si se pasa |
| Mapa de routing | `.claude/routing-modelos.json` | Clase de tarea → nivel de modelo, pineado, con precio y fecha |
| Gate de routing | `scripts/verifica-routing.mjs` | Rechaza clases sin asignar y modelos no pineados |
| Contabilidad runtime | `src/lib/ai/contabilidad.ts` | Registra uso por llamada; aviso al 80 % |
| Vigilante de frescura | `scripts/vigila-versiones.mjs` | Reporta desfase de lo pineado. **Fuera de `validate`**: usa red |
| Fuente única | `AGENTS.md` + `scripts/sincroniza-gemini.mjs` | `GEMINI.md` se genera, no se edita |
| Portabilidad | `opencode.json`, `docs/PORTABILIDAD-ARNESES.md` | Los gates corren desde otro arnés |

## Decisiones, con la alternativa descartada

1. **Aproximación calibrada (chars / 3.644), no tokenizador local.** Calibrada el
   2026-08-23 sobre 762.817 caracteres → 209.324 tokens reales, con margen declarado
   (±8 % por archivo, mucho menos en el agregado). **Descartado**: un tokenizador exacto
   como dependencia — habría atado el gate a un paquete que hay que mantener y actualizar
   por modelo. La spec avisaba: *un contador que no se calibra miente*; la respuesta fue
   calibrar y publicar el error, no perseguir exactitud.

2. **El vigilante de versiones vive FUERA de `validate`.** Usa red; un gate de boilerplate
   no puede depender de red. **Descartado**: meterlo en el gate principal. Devuelve exit
   `2` cuando no puede verificar — "no pude mirar" no es "todo bien".

3. **`AGENTS.md` es la fuente única y `GEMINI.md` se genera.** **Descartado**: mantener
   los dos a mano — divergen en silencio. El verificador rechaza un `GEMINI.md` editado
   a mano.

4. **Lo informativo bajó a `.claude/rules/` con `paths:`; en `AGENTS.md` solo queda lo
   que obliga.** El ahorro se materializa en Claude Code (carga condicional) y **no** en
   opencode (carga siempre). **Descartado**: presentarlo como ahorro universal — es un
   intercambio, y así está declarado.

5. **Coste `null`, nunca cero, cuando falta el dato de uso.** **Descartado**: sumar
   huecos como ceros — da una factura que parece completa y no lo es.

6. **Cortar al 100 % lo decide la app, no el módulo.** Negar servicio a un usuario para
   proteger la propia factura es una decisión con víctima (C4).

## Cobertura de la DEFINICIÓN DE HECHO

| DoF | Qué lo cubre | Estado |
|---|---|---|
| 1. `validate` verde | Gate completo | ⚠️ **no corre en esta máquina**: `node_modules/` vacío |
| 2. Tabla medida del contexto | `npm run mide:contexto`, con método y margen | ✅ corrido 2026-08-30 |
| 3. Control negativo del gate de tokens | Inflar archivo → rojo → revertir | ⚠️ hecho en su sesión |
| 4. Mapa de routing | `.claude/routing-modelos.json` + `verifica-routing.mjs` | ✅ verde 2026-08-30 |
| 5. Runtime probado | `scripts/prueba-contabilidad.ts` | ⚠️ no ejecutable aquí (`.ts` sin loader) |
| 6. Frescura corriendo | `scripts/vigila-versiones.mjs` | ⚠️ requiere red |
| 7. Portabilidad demostrada | `docs/PORTABILIDAD-ARNESES.md` (medido) | ✅ documento con medición |
| 8. Entrada firmada | `BITACORA-CDC.md` | ✅ |

## Estrategia de gates

Cuatro sensores dentro de `validate`: contexto, routing, contabilidad y credenciales. El
vigilante de frescura queda fuera y se corre a mano. Regla que los ordena: **no inventar
cifras** — sin medición, "desconocido".

## Abierto

Punto 7 de su Definición de Hecho: la portabilidad está medida en documento, pero opencode
**no está instalado en esta máquina**, así que la comprobación no se puede repetir aquí.
