# El concepto «producto»

> Extraído de Soporte SAP (corrida B del goal `docs/goals/soporte-sap.md`, 2026-10-04), no diseñado en
> abstracto: cada término de aquí tiene su caso en lo que se construyó en la corrida A
> (`docs/goals/soporte-sap-informe-a.md`). La plantilla para declarar uno está en
> [`PLANTILLA.md`](PLANTILLA.md) y la verifica `npm run verifica:productos`.

## 1. Definición

Un **producto** es un modelo de negocio que **compone activos** del monorepo (apps, herramientas, CLIs,
contratos) para **un cliente que paga**, con una frontera explícita entre lo que comparten todos sus
clientes (su **núcleo**) y lo que se hace para cada uno (**a medida**). Se declara en un **manifiesto**
(`productos/<slug>.json`), aparece como una **fila del índice** del portafolio (`BUSINESS_LOGIC.md` raíz) con
su contrato de impacto (C4), y sus activos propios llevan su `slug` en el inventario.

Es lo que el ERP llama la fábrica que vende (`erp/ERP-MAESTRO.md` §1.9): el producto no es el código, es la
composición de piezas del catálogo para un cliente, y el **% de reuso** dice cuánto de esa composición ya
existía.

## 2. Los tres usos de «producto», resueltos

Hasta hoy la palabra nombraba tres cosas distintas. Desde aquí cada una tiene su nombre:

| Uso | Dónde vive | Qué significa desde hoy | Qué cambia | Por qué así y no de otro modo |
|---|---|---|---|---|
| **clase `PRODUCTO`** | `clase` de cada asiento de `inventario/activos.json` | la **clase del activo**: una *pieza vendible* (llega al cliente dentro de algún producto). No es un producto: es material de uno o de varios | nada en los datos; se dice «activo de clase PRODUCTO» o «pieza vendible», nunca «un producto» para un activo | la clase es copia del `check` de `erp.act_activo` (`005_activos.sql`) y del catálogo; renombrarla rompe la igualdad con el ERP que vigilan `prueba:inventario` y el export al módulo `act` |
| **fila del índice** | `BUSINESS_LOGIC.md` raíz, §1 | **es el producto**: su cara pública, con su contrato C4 y su estado de firma | cada fila gana (o tendrá) un manifiesto; la columna «Activos que cubre» se verifica contra él | el índice ya listaba productos que componen activos (el asesor de ventas por voz compone cinco) y ya lo vigila `verify:gobernanza`: el concepto lo formaliza en vez de inventar otro registro |
| **campo `producto`** | asientos del inventario (lo añadió la corrida A) | el **dueño**: el producto que mantiene el activo y responde por él. Un activo tiene **a lo sumo un dueño**; otros productos lo componen sin poseerlo | su significado se fija («dueño», no «usado por») y un gate cruza dueños con manifiestos | un activo que sirve a varios productos (el extractor) no cabe en un campo de un solo valor si «producto» significa «usado por»; como «dueño» sí cabe, y el uso compartido vive en el manifiesto de quien lo compone |

Y el **manifiesto** es lo único nuevo: la declaración completa del producto (modelo de negocio, niveles,
roles, composición, canal, pricing, métricas, SLA, entrega, respaldo, reuso, frontera FDE). Es la fuente de
la composición; el índice y el campo `producto` se verifican contra él, no al revés.

## 3. Composición: propios, componentes y base

Lo que un producto compone cae en una de tres clases, sin solaparse:

| Clase | Qué es | Regla | En Soporte SAP |
|---|---|---|---|
| **propio** | activo cuyo dueño es este producto | su `producto` en el inventario es el `slug`, y todo activo con ese `producto` está en la lista | `TPL-soporte-sap`, `TPL-sala-a2a`, `TPL-feature-soporte-sap` y sus 7 CLIs |
| **componente** | activo que es propio de **otro** producto del índice | aparece en la fila de otro producto; no lleva este `slug` | `TPL-extractor-documental` y `TPL-feature-a2a` (del producto «Extractor documental») |
| **base** | activo que no es de ningún producto: la base común (§2 del índice) o la fábrica | no aparece en ninguna fila del §1 | app base, auth, motor de reglas, despliegue, motor de IA, trayectorias, conocimiento |

**El caso del extractor**, que la spec señaló como el choque: es un producto por sí mismo (tiene fila,
contrato y clientes que lo compran solo) **y** un componente de Soporte SAP. Las dos cosas son ciertas a la
vez porque «producto» ya no es una propiedad del activo sino una relación: el extractor tiene un dueño y
varios compositores.

**Lo que no es activo: los terceros.** Lo que un producto usa y no está en el inventario —la base de datos
gestionada, el proveedor del VPS, Meta, un procesador de pagos, un proveedor de LLM— no se compone: se
contrata. El manifiesto lo declara aparte (`terceros`), con lo que recibe, la decisión que lo fija y lo que
cuesta, porque ahí es donde el dato sale del perímetro (C4). Soporte SAP los tenía en sus decisiones (D7, D10,
D12) y la plantilla v1 no los recogía; lo destapó el segundo producto, el vendedor en WhatsApp, que tiene cinco.

## 4. La frontera FDE: a medida y núcleo

El A2A trabaja como Forward Deployed Engineer: entra a cada cliente, configura, resuelve a medida y devuelve
al núcleo lo que sirve a todos. La frontera:

| | **Núcleo del producto** | **A medida (por cliente)** |
|---|---|---|
| Qué es | lo que comparten todos los clientes: el código de los propios, las reglas firmadas del grafo, los CLIs adoptados, el contrato tipo, el catálogo de métricas | la configuración y los datos de un tenant: el mapeo de su herramienta, sus contratos versionados, sus parámetros de impacto (D15), sus umbrales medidos con su corpus |
| Dónde vive | en el repo, versionado | en el tenant (datos con RLS), no en el código |
| Quién lo cambia | un CDC o una firma del laboratorio | el FDE propone y una persona aprueba (registro `fronteraNucleo`) |
| En Soporte SAP | la matriz y sus reglas, `relojSla`, el anonimizador, el corte semántico | el mapeo de MesaUno (Andina) y el de TicketeraDos (Boreal), el contrato N2–N3 de cada cliente |

**La vuelta al núcleo.** Lo hecho a medida que se repite se propone al núcleo: una regla nace como propuesta
de siembra del sandbox (anonimizada y generalizada, D1), un CLI como propuesta (imprimirlo es CDC), y la
firma es del laboratorio. El FDE **nunca** cambia el núcleo por su cuenta. La regla de reuso de la fábrica
(`docs/CREAR-UNA-HERRAMIENTA.md`: sin reuso real tres o más veces, no se empaqueta) aplica igual: una
solución a medida sube al núcleo cuando se repite, no cuando es elegante.

## 5. El reuso de un producto

Dos medidas, que no se confunden:

- **reuso de composición** (todo producto lo tiene, lo calcula el gate): `(componentes + base) / total` de
  los activos que compone. Dice cuánto del producto ya existía como pieza.
- **reuso de la matriz dominio × capa** (si el producto la tiene): la cuenta por celda del SDD. En Soporte
  SAP, 40.7 % amplio y 14.8 % estricto (`node tools/soporte-sap/clis/ss-reuso.mjs`). Es más fina, pero solo
  existe donde alguien hizo la matriz.

Medido con los dos manifiestos: Soporte SAP compone 20 activos con 50 % de reuso de composición; el vendedor
en WhatsApp, 3 con 33.3 %. El vendedor se construyó casi solo, con su propia cadena de hashes, su pasarela
A2A y su presupuesto de IA. El presupuesto ya existía en el motor de IA (agosto), y la cadena de hashes se
volvió a escribir cuatro días después en Soporte SAP (`ss-cadena`). Esas repeticiones son las candidatas a
volver al núcleo (§4); el informe de la corrida B las lista, y aquí no se toca su código.

**El reuso de composición no se compara entre productos**: depende de lo fino que esté partido el inventario
(los 7 CLIs de Soporte SAP son 7 activos; todo el vendedor es uno). Se compara un producto consigo mismo en
el tiempo.

## 6. Lo que el concepto no es

- **No es la clase `PRODUCTO`** (§2): una pieza vendible no es un producto.
- **No es un pack vertical del ERP**: un pack (`erp/ERP-MAESTRO.md` §1.2) es un módulo de dominio del ERP que se
  carga por cliente; un producto puede componer packs, como compone herramientas.
- **No es una licencia ni un precio**: el manifiesto declara las variables del pricing y deja el precio por
  decidir hasta que haya plan comercial (ERP-7).
- **No reemplaza el contrato C4**: el manifiesto apunta al contrato; la evaluación de impacto sigue en el
  `BUSINESS_LOGIC.md` de su feature.

## 7. Qué cambia ya y qué queda propuesto

- **Ya**: este documento, la plantilla, el gate `verifica:productos`, los manifiestos de Soporte SAP y del
  segundo producto, y el `producto` de sus propios en el inventario.
- **Propuesto (CDC, sin firmar)**: el gate en el padrón de `validate`; que cada fila del índice gane su
  manifiesto (el gate las lista como pendientes, sin ponerse en rojo); y que `new-app` genere el manifiesto
  junto con el contrato. Ninguna clase del inventario se renombra.
