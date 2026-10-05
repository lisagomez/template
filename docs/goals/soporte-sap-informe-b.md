# Soporte SAP — informe de la corrida B (el concepto «producto»)

> Spec: [`docs/goals/soporte-sap.md`](soporte-sap.md) (§2 de la misión y «Arranque de la corrida B») ·
> Concepto: [`productos/CONCEPTO.md`](../../productos/CONCEPTO.md) · Plantilla: [`productos/PLANTILLA.md`](../../productos/PLANTILLA.md) ·
> Manifiestos: [`soporte-sap.json`](../../productos/soporte-sap.json), [`ventas-whatsapp.json`](../../productos/ventas-whatsapp.json) ·
> Propuesta de CDC: firmado el 2026-10-05, en la [bitácora](../../.claude/gobernanza/BITACORA-CDC.md) (la propuesta se borró al firmar) · Informe de la A:
> [`soporte-sap-informe-a.md`](soporte-sap-informe-a.md) · Grafo: [`docs/grafos/soporte-sap.json`](../grafos/soporte-sap.json)

**Qué quedó.** Un producto es una fila del índice: un modelo de negocio que compone activos para un cliente que
paga. Lo dice el concepto, y los tres usos de «producto» quedan resueltos sin renombrar nada. Cada producto se
declara en un manifiesto (`productos/<slug>.json`), que es la fuente única de lo que compone y de lo que no se
negocia. La plantilla v2 y su gate, `verifica:productos`, corren en el `validate`.

La plantilla salió de Soporte SAP y la puso a prueba un segundo producto que ya existía, el vendedor con IA en
WhatsApp, descrito sin tocar una línea de su código. Lo que no cupo cambió la plantilla de v1 a v2 o quedó
escrito como propuesta. Nada se firmó, desplegó, expuso ni empujó.

## 1. La evidencia, punto por punto

| Lo que pide el HECHO | Resultado | Cómo se reproduce |
|---|---|---|
| Definición y vocabulario, con la resolución explícita de los tres usos | `CONCEPTO.md` §1–§2: la clase `PRODUCTO` es una **pieza vendible**; la fila del índice es **el producto**; el campo `producto` del inventario es el **dueño** (a lo sumo uno por activo). Ninguna clase se renombra, y la cabecera del índice lo dice | `productos/CONCEPTO.md`, `BUSINESS_LOGIC.md` |
| La plantilla y su gate en verde contra Soporte SAP | 27/27 comprobaciones en verde; 10 propios, 2 componentes y 8 de base; 3 terceros; reuso de composición 50 % | `npm run verifica:productos` |
| …y en rojo con cada manifiesto saboteado | **26/26 siembras cazadas**: cada defecto, sembrado sobre una copia del manifiesto, tumba su comprobación. Si una no muerde, el gate cae en rojo | ídem (sección «Siembras») |
| Un segundo producto que ya existe, descrito sin tocar su código | el vendedor en WhatsApp: 27/27 en verde, con 3 faltas, 1 «no aplica» y 4 cosas que no cupieron, en ámbar. `git diff 5e3be4c..HEAD -- tools src` está vacío | `productos/ventas-whatsapp.json` |
| …con lo que no cupo y cómo cambió la plantilla | §3 de este informe y la «Historia» de `PLANTILLA.md`. La v2 contra los dos manifiestos en v1: **9 comprobaciones en rojo** | `PLANTILLA.md` |
| El gate en el `validate`, sin pruebas huérfanas | dado de alta en `.claude/gates.json` (perfil `validate`), con su CDC propuesto. `verifica:gates` en verde: padrón, documentación y huérfanos | `npm run gates`, `npm run verifica:gates` |
| `npm run validate` en verde tras el último commit | §8 | `npm run validate` |
| Informe y grafo | este archivo. En el grafo, `concepto-producto`, `plantilla-producto`, `segundo-producto` y el lazo `l-generalizacion` pasan de gris a ámbar | `docs/grafos/soporte-sap.json` |
| Propuesta de CDC, regresión y trampas en verde, firma pendiente | `npm run regresion`: capa A 147/147; `npm run regresion -- --trampa`: capa B 22/22. Firma en blanco | `.claude/gobernanza/BITACORA-CDC.md` (firmado el 2026-10-05) |

## 2. Las decisiones y por qué

- **Ninguno de los tres usos absorbe a otro.** La clase `PRODUCTO` se queda porque el `check` de `act_activo` en
  el ERP la copia: renombrarla obliga a migrar el ERP por una palabra. Los tres conviven porque cada uno
  contesta una pregunta distinta:
  - ¿se vende la pieza? (la clase);
  - ¿qué se le vende a quién? (la fila);
  - ¿de quién es la pieza? (el dueño).

  Un activo tiene a lo sumo un dueño y puede tener muchos compositores. Así cabe el extractor, que es producto
  y a la vez componente de Soporte SAP.
- **El manifiesto, y no el índice, es la fuente de la composición.** La fila del índice sigue siendo la cara
  pública y su contrato C4, y el gate exige que cite solo propios del manifiesto. No se ensanchó la fila con
  los 7 CLIs y los componentes: eso hubiera duplicado la lista en dos sitios mantenidos a mano.
- **Composición en tres clases**, que el gate deduce del inventario y del índice, no de lo que el manifiesto
  dice de sí mismo:
  - **propios**: su dueño es este producto;
  - **componentes**: son propios de otra fila;
  - **base**: no son de ninguna fila.
- **El gate copia el patrón de `verifica:marca-blanca`**: comprobaciones con pista más siembras en memoria.
  Un gate que no se pone rojo cuando debe no cuenta.
- **Se dio de alta en el padrón, en vez de colgarlo de otro gate**, porque ninguno lee manifiestos. Va fuera
  de `predeploy`: un manifiesto no cambia lo que se despliega. Una fila sin manifiesto es **pendiente**, no
  rojo, igual que un contrato pendiente: si no, el gate obligaba a describir los 8 productos de golpe.
- **El segundo producto fue el vendedor en WhatsApp**, porque es el que más se aleja de Soporte SAP en los ejes
  que la plantilla tiene que aguantar:
  - un canal externo (Soporte SAP no tiene ninguno);
  - cinco terceros, cuatro con datos personales;
  - tres líneas de negocio;
  - un agente que actúa solo bajo un umbral;
  - contrato pendiente, sin SLA, y fases propias.

  Comparte, eso sí, la forma B2B2C de tres niveles, y eso dejó probar el núcleo común. Los demás quedaron
  fuera por esto:
  - el **extractor** es componente de Soporte SAP y probaba poco fuera de lo ya visto;
  - el **ERP** tiene maestro propio («lo gobierna su fuente»): un manifiesto suyo competiría con
    `erp/ERP-MAESTRO.md`;
  - el **asesor de voz**, **Etiquetas** y el **reel** se parecen más entre sí que al vendedor.
- **La regla de entrada a la plantilla.** Un cambio entra si Soporte SAP también lo tiene, o si es una regla que
  la plantilla ya escribía. Lo que solo tiene el segundo producto queda en su `noCupo`. Así se reconcilian la
  spec («lo que no cupo cambia la plantilla, no el producto») y el goal («lo que no aparece en Soporte SAP no
  entra»). Es la decisión más discutible de la corrida, así que va a decisiones abiertas (§7).

## 3. El segundo producto: lo que no cupo y cómo cambió la plantilla

**Con la v1, el vendedor salía en verde, y era un verde hueco.** La única comprobación en rojo era su dueño en el
inventario: un dato, no código, que se escribió. Lo grave fue lo que la v1 dejaba pasar sin decir nada:

| Lo que la v1 dejaba pasar | Qué hizo la v2 | Por qué entró |
|---|---|---|
| `sla.contratos` y `sla.plantilla` en null: el vendedor no tiene SLA y la v1 no lo distinguía de un SLA olvidado | `{ "aplica": false, "motivo": … }`, solo para las secciones que un producto ya necesitó (hoy, `sla`) | el paso 2 de la v1 ya decía «un campo que no aplica se declara con su motivo», y su gate no lo cumplía |
| `respaldo.inventario`, `reuso.matriz` y `fde.registro` en null, sin decir por qué | **un null no es un dato**: cada campo obligatorio en null lleva `falta` en su sección; el respaldo **nunca** puede «no aplicar» | es la regla del contrato pendiente del índice («se declara con lo que falta»), extendida a los campos |
| Ningún sitio para decir que el texto de los clientes sale a Meta y a un proveedor de LLM | `terceros`: quién, qué recibe, si lleva datos personales, la decisión que lo fija y su costo. **Un tercero con datos personales exige AISIA** | Soporte SAP los tiene: la BD gestionada (D10), el VPS y su respaldo (D12) y el modelo (D7), con sus líneas de costo en `pricing.ts` |
| Dos vocabularios para la misma naturaleza de una cifra: «ficticio» en el vendedor, «supuesto» en Soporte SAP | `costo.naturaleza` ∈ `medido · supuesto · fuente · por decidir`; el manifiesto traduce | los dos productos marcan la naturaleza de cada cifra |
| Nada distinguía un manifiesto escrito contra una plantilla vieja | `plantilla: 2` y la siembra que lo caza | el mecanismo para que la plantilla cambie sin que un manifiesto la estire en silencio |

**Lo que no entró**, porque solo lo tiene el vendedor. Queda en su `noCupo`, con su evidencia y su propuesta, y
el gate lo enseña en ámbar:

1. **Tres líneas de negocio**, cada una con su cobro y sus reglas que no se negocian: el vendedor como SaaS, los
   números (N-01: cuarentena de 90 días) y el BSP propio (N-02: el token en la bóveda). Propuesta:
   `modeloDeNegocio.lineas`.
2. **Un agente que actúa solo bajo un umbral.** Bajo el monto del inquilino, el vendedor arma el pedido y manda
   la liga de pago sin pasar por el dueño. `aprueba: false` no lo distingue de un agente que solo propone.
   Propuesta: `roles[].actuaSoloHasta`, y que lo que mueve dinero sin persona exija la AISIA firmada antes de
   beta. Véase §7, B-4.
3. **Fases del producto con compuertas** (0–3 construidas; 4 y 5 no). Propuesta: `fases`.
4. **La inversión de una vez** antes del piloto, aparte del costo del mes. Propuesta: `pricing.inversion`.

**Lo que sí cupo, y dice algo:**

- la forma B2B2C de tres niveles;
- los roles, con ningún agente que apruebe;
- el aislamiento con su prueba;
- precio, modelo de cobro y plan comercial en null (los precios del roadmap del vendedor son ficticios y el
  gate los habría rechazado como precio);
- RPO y RTO «desconocidos»;
- la frontera FDE: catálogo, límites y umbral por pyme a medida; agente, canal, atribución y cadena en el
  núcleo.

## 4. Reuso

- **Soporte SAP**: reuso de composición 50 % (10 de 20 activos ya existían como pieza). Matriz dominio × capa:
  40.7 % amplio y 14.8 % estricto (corrida A).
- **El vendedor en WhatsApp**: 33.3 % (solo reusa la base de la app). Se construyó casi solo, con su propia
  cadena de hashes, su pasarela A2A y su presupuesto de IA.
  - El presupuesto ya existía en el motor de IA (2026-08-24).
  - La cadena de hashes del vendedor (2026-09-30) **se volvió a escribir** cuatro días después en Soporte SAP
    (`ss-cadena`).

  Son las candidatas a volver al núcleo. Con dos usos no se empaqueta: la regla de la fábrica pide tres.
- **Las dos cifras no se comparan entre productos.** Dependen de lo fino que esté partido el inventario: los 7
  CLIs de Soporte SAP son 7 activos, y todo el vendedor es uno. Se compara un producto consigo mismo en el tiempo.

## 5. Las D1–D15 que el concepto toca

| Decisión | Dónde la toca el concepto | Qué hace con ella |
|---|---|---|
| D1 — conocimiento entre consultoras | `fde.vuelta` y la vuelta al núcleo (CONCEPTO §4) | la cita: lo a medida vuelve anonimizado y generalizado; no la decide |
| D2 — quién firma una regla | «quién cambia el núcleo»: un CDC o una firma del laboratorio | la confirma como regla del concepto |
| D3 — modelo de operación A, B o mixto | `entrega`: los dos productos «por decidir», y el vendedor sin decisión propia | la deja abierta; el gate solo exige uno de los cuatro valores |
| D4 — quién firma en la sala | `roles[].aprueba` | no la decide |
| D5 — cifras y tiers | `pricing`: precio, modelo de cobro y plan comercial en null | **la hace cumplir**: un precio sin plan comercial pone el gate en rojo |
| D6 — el SAP real | `fuera` | la cita |
| D7 — modelo con datos de clientes | `terceros`: el proveedor de modelo, hoy sin datos personales | **la hace visible**; si cambia a datos personales, el gate exige AISIA |
| D8 — retención y salida | **no está en la plantilla** | hueco: el vendedor tiene lo mismo (P-07 y su baja); va al CDC como v3 |
| D9 — umbrales del extractor | `fde.aMedida` | la cita |
| D10 — dónde vive la BD | `terceros` y `respaldo` | la hace visible, con su costo «por decidir» |
| D11 — cortes S/M/L | `pricing.tiers`, vía `pricing.ts` | no la decide |
| D12 — el VPS y el respaldo fuera de sitio | `terceros` | la hace visible, con su costo «por decidir» |
| D13 — SLA N1–N2 | `sla` recoge los contratos N2–N3 y **no dice entre qué niveles** | hueco: el compromiso N1–N2 no tiene sitio (§6) |
| D14 — qué ve el superadministrador | **no está**: los roles no declaran qué datos ven | hueco (§6) |
| D15 — parámetros de impacto | `fde.aMedida` | la cita |

## 6. Las formas en que esto podría estar mal o incompleto

**Resueltas en la corrida:**

1. **La v1 daba verdes huecos.** Cuatro nulls pasaban callados. La v2 los nombra, y la siembra «el inventario de
   respaldo en null sin decir qué falta» lo prueba.
2. **Un manifiesto viejo pasaría por nuevo.** `plantilla` y su siembra lo impiden.
3. **El mismo concepto con dos palabras** («ficticio» y «supuesto»). El manifiesto traduce al vocabulario común,
   y otra palabra pone el gate en rojo.
4. **El reuso del concepto sugería que las piezas del vendedor ya existían.** No es así: la cadena de hashes la
   escribió el vendedor primero. Corregido en `CONCEPTO.md` §5 antes del commit.

**Abiertas:**

5. **El gate comprueba forma y enlaces, no la verdad.** Un manifiesto puede mentir y el gate no lee el código.
   Ejemplo: «el procesador no recibe datos personales» es mi lectura del README («monto y referencia»). El
   código manda además el nombre de la pyme en la descripción, y si la pyme es persona física, eso es un dato
   personal. Lo decide la AISIA del vendedor, no el gate.
6. **`terceros: []` pasa.** Un producto que no declara a sus terceros sale en verde. No hay contra qué
   cruzarlo: los README dicen «Salida del perímetro (C4)» en prosa.
7. **La regla de entrada tiene un sesgo de referencia.** Lo que tengan en común todos los demás productos no
   entra mientras Soporte SAP no lo tenga (§7, B-3).
8. **Huecos en los dos productos que la v2 no cerró:**
   - retención y salida (D8 / P-07);
   - entre qué niveles es cada SLA (D13);
   - qué datos ve cada rol (D14).

   Por la regla de entrada, los dos primeros debieron entrar en la v2 y no se vieron a tiempo. Van al CDC como v3.
9. **El índice se lee dos veces.** `filasDeSeccion` copia la lectura de `verify:gobernanza` en vez de
   compartirla. Si una cambia, divergen en silencio: es la lección del 2026-08-31 (una entrada copiada propaga
   el mismo punto ciego). Compartirla toca `verify:gobernanza`, de radio mayor; se propone mover el parser a
   `scripts/lib/` en su propio CDC.
10. **Las siembras se hacen solo sobre Soporte SAP.** Las comprobaciones son genéricas, y las ramas que Soporte
    SAP no ejerce (un SLA que no aplica, un tercero con datos sin AISIA) se siembran alterando su copia. Aun
    así, un defecto que solo tenga la forma del vendedor podría escaparse.
11. **El extractor solo se probó desde el lado del compositor.** Es el choque que la spec señaló, y sin su
    propio manifiesto no se ve el lado del dueño.
12. **`PUEDEN_NO_APLICAR` solo tiene el SLA.** El siguiente producto sin métricas, por ejemplo, necesitará un
    CDC: es a propósito, pero tiene costo.
13. **La cabecera del índice cambia un documento firmado.** No toca filas ni tablas, pero va en el CDC para que
    el laboratorio la vea.

## 7. Decisiones abiertas del laboratorio, con mi recomendación

| # | Decisión | Recomendación |
|---|---|---|
| B-1 | Firmar el CDC de la B (alta del gate, cabecera del índice, inventario) | firmarlo **después** del de la A: la B lee el campo `producto` que introduce la A |
| B-2 | Ratificar el vocabulario: fila = producto, clase = pieza vendible, `producto` = dueño | ratificarlo como está; renombrar la clase obliga a migrar el ERP por una palabra |
| B-3 | La regla de entrada a la plantilla | cambiarla a «lo que tienen **dos** productos entra como propuesta, y entra a la plantilla con el **tercero**». Es la regla de reuso de la fábrica y quita el sesgo de referencia |
| B-4 | El vendedor manda la liga de pago bajo un umbral sin pasar por el dueño: ¿es un «cobro» de los que pasan por gate humano? | decidirlo en la AISIA del vendedor antes de beta; la plantilla no cambia hasta que otro producto tenga un agente que actúe solo |
| B-5 | Cuál sigue de los 6 productos sin manifiesto | el **extractor** (prueba el lado del dueño del choque) y el **ERP** al final (maestro propio y modelo B) |
| B-6 | La plantilla v3 con `retencion` y `salida` (D8 / P-07) | sí, en el mismo CDC del siguiente manifiesto, que probará los campos |

## 8. El último validate

`npm run validate`: **29/29 gates activos en verde (8 inactivos declarados) tras `ebb4790`, el último commit con código y gate; el validate de después del commit de cierre (este informe, la propuesta y el grafo) va pegado en la conversación**.
