# Revisión: ¿aplica el grafo? (las dos lecturas)

> 2026-09-30. «Grafo» en esta casa son dos cosas distintas, y las dos aplican de forma diferente.

## 1. El motor de reglas (`tools/grafo-conocimiento` + `tools/conocimiento`)

Responde «¿esto está permitido?» con un veredicto de un motor DETERMINISTA sobre reglas con fuente,
y **sin regla no da veredicto** (no es «permitido»). El LLM solo estructura la pregunta.

| Dónde aplicaría en el vendedor | Hoy | Veredicto |
|---|---|---|
| **Datos personales del cliente final** (aviso de privacidad, base de licitud, transferencias) | El dominio `mx-datos-personales-prospeccion` YA existe, con la LFPDPPP nueva (DOF 20/03/2025) verificada contra el texto oficial: `MX-LFPDPPP2025-14-17-CONTACTO-PF` (aviso previo y licitud del contacto de persona física) y `MX-LFPDPPP2025-35-36-TRANSFERENCIA-INTL` (transferencias a terceros: Meta, el procesador, el proveedor de LLM) | **Aplica ya** como fuente de la AISIA (C4). Ojo: el dominio está redactado para prospección B2B; para atención a clientes finales hace falta su propia regla (propuesta abajo). La AISIA borrador ya las cita |
| **Política de comercio por giro** (qué no se vende por WhatsApp: alcohol, medicamentos, armas…) | Lista escrita a mano por inquilino (`temasRestringidos`) | **Aplica, como propuesta**: un dominio `whatsapp-politica-comercio` con la política de comercio de Meta como fuente. Hoy una lista sin fuente responde «permitido» a lo que no conoce; el motor respondería «sin regla» |
| **Categoría de una plantilla** (utilidad o marketing) antes de mandarla a aprobar | Declarada a mano en `PLANTILLAS_META` | **Aplica, como propuesta**: reglas de categorización de Meta con fuente; predice el riesgo de recategorización (más cara, exige opt-in) |
| **Tarifas por país y fecha** | La tarjeta de tarifas (datos con fuente y bandera de verificación) | **No aplica**: son datos versionados, no reglas con veredicto |
| **El veredicto del traspaso o de las barreras** | Código determinista y probado | **No aplica**: no es una pregunta regulatoria con fuente, es política del producto |

**Por qué no se siembra ahora**: sembrar en `tools/conocimiento` pide dominio, versión, CAMBIOS y
**firma del laboratorio** (lo que cambia un veredicto va firmado), y cada regla tiene que
verificarse contra la página oficial de Meta, no contra resúmenes. Queda como propuesta:

| Clave propuesta | Dominio | Qué diría | Fuente a verificar |
|---|---|---|---|
| `WA-COMERCIO-ALCOHOL` | whatsapp-politica-comercio | La venta de alcohol por el catálogo de WhatsApp está restringida: sin regla del país, sin veredicto | Política de comercio de WhatsApp (Meta) |
| `WA-COMERCIO-MEDICAMENTOS` | whatsapp-politica-comercio | Medicamentos (incluidos OTC) excluidos | Política de comercio de WhatsApp (Meta) |
| `WA-PLANTILLA-UTILIDAD` | whatsapp-plantillas | Una plantilla es de utilidad si responde a una transacción o solicitud del cliente y no promueve | Guía de categorías de plantillas (Meta) |
| `MX-LFPDPPP2025-ATENCION-CLIENTE` | mx-datos-personales-atencion | Datos del cliente que escribe al negocio: aviso en el primer contacto, finalidad acotada, transferencia al proveedor de IA como transferencia (Arts. 35-36) | LFPDPPP 2025, texto oficial |

## 2. El grafo del sistema (loop contra grafo, conectoma)

**Construirlo fue un LOOP**, como lo compiló `/goal-compiler`: un agente, una línea de meta, y el
test de colapso se sostiene.

**El producto EN EJECUCIÓN sí es un grafo**: orquestador, seis dominios y los lazos que lo regulan.
Quedó mapeado en `docs/grafos/ventas-ia-waba.json`, con 22 artefactos, 23 transformaciones y 14 lazos.
Los estados son honestos:
- **ámbar** para lo construido y probado en el laboratorio, porque instalado no es estrenado;
- **gris** para lo que falta;
- **ningún morado**, porque nada ha corrido con Meta, dinero o clientes reales.

`grafo2plan.py` derivó el plan: 13 fases, 5 con paralelismo. Lo que dijo, y por qué importa:
- **Dos convergencias**, y son exactamente las dos que el diseño serializa a propósito:
  - el **mensaje saliente**: agente y dueño escriben al mismo cliente, por un solo camino
    (`enviaSaliente`), con la pausa por eco y el estado «humano»;
  - el **eslabón de la cadena**: tareas y mensajes, con una cola por inquilino.

  Un merge que tira una fuente en silencio es EL fallo de grafo: aquí los dos tienen prueba.
- **La agenda son los grises**, en orden topológico:
  1. C3 y C4 firmados;
  2. luego, en paralelo: el modelo real (CDC y arnés), el vault de tokens, el procesador real, el
     esquema aplicado y las reglas citadas;
  3. al final, el número real, después del vault.

**Recomendación**: mantener el grafo como el mapa vivo del piloto. Cada cierre cambia un estado con
evidencia: un gris pasa a ámbar al construirse, y un ámbar a morado al estrenarse. No sirve un grafo
que no se actualiza.
