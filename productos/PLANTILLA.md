# Plantilla de producto (v1)

> Para declarar el siguiente producto. Qué es un producto: [`CONCEPTO.md`](CONCEPTO.md). El manifiesto
> de referencia es [`soporte-sap.json`](soporte-sap.json); la plantilla salió de él y **lo que no aparece en
> Soporte SAP no entró** (spec de la corrida B). La verifica `npm run verifica:productos`.

## Cómo se usa

1. Copia el esqueleto de abajo a `productos/<slug>.json` (el `slug` en kebab-case, igual al nombre del archivo).
2. Llena cada campo con lo que **ya existe**: rutas que existen, activos del inventario, decisiones con su
   número. Un campo que no aplica se declara con su motivo; no se borra.
3. Dale a cada activo **propio** su dueño en `inventario/activos.json` (`"producto": "<slug>"`) y corre
   `npm run inventario:vista`.
4. Corre `npm run verifica:productos`: tu manifiesto en verde y las siembras cazadas.

## Los campos

| Campo | Qué lleva | En Soporte SAP | Lo que el gate exige |
|---|---|---|---|
| `slug`, `nombre`, `version` | identidad | `soporte-sap`, versión 1 | `slug` en kebab-case = nombre del archivo |
| `estado` | `blueprint`, `beta` o `produccion` | `blueprint` | no más avanzado que el menos avanzado de sus propios |
| `indice` | el nombre de su fila en `BUSINESS_LOGIC.md` §1 | «Soporte SAP» | la fila existe; cita solo propios del manifiesto |
| `contrato` | `ruta` del contrato C4 (o `null` con `falta`), `c3`, `aisia`, estado de `firma` | `src/features/soporte-sap/BUSINESS_LOGIC.md`, PRP-008, AISIA en borrador | la ruta es la que enlaza su fila (o las dos lo dicen pendiente); toda ruta existe |
| `modeloDeNegocio` | quién paga, a quién sirve, la forma (B2B, B2B2C…) y la propuesta | la consultora paga; B2B2C de tres niveles | — |
| `niveles` | cada nivel, quién es y qué hace | N1 laboratorio, N2 consultora, N3 su cliente | — |
| `tenencia` | el árbol de tenants y el control de aislamiento con su prueba | laboratorio → consultora → cliente; RLS forzada | la prueba existe |
| `roles` | cada rol: `persona` o `agente`, su nivel, si `aprueba` | tres agentes, ninguno aprueba | **ningún agente aprueba** |
| `activos` | `propios`, `componentes` (`{id, para}`) y `base` (`{id, para}`) | 10 propios, 2 componentes, 8 de base | existen; no se solapan; propios con este dueño y ninguno fuera; componentes de otro producto del índice; base de ninguno |
| `canales` | por dónde se habla con el producto: `interno` o `externo` | sala, chat del HIL, app | **un canal externo exige C3 y AISIA** |
| `pricing` | variables, tiers, `precio`, `modeloDeCobro`, `planComercial`, quién decide, fuente | variables del N3 → tier; precio por decidir | **ningún precio ni modelo de cobro sin plan comercial** (ERP-7) |
| `metricas` | de dónde salen los números y si hay una sola definición | el corte semántico (dbt + MetricFlow) | la fuente existe |
| `sla` | los contratos y la plantilla del documento | `sla.ts` y su plantilla con huecos | existen |
| `entrega` | modelo `A`, `B`, `mixto` o `por decidir`, con la decisión que lo fija | por decidir (D3), recomendación mixto | uno de los cuatro |
| `respaldo` | dónde está su inventario de respaldo, el procedimiento y `rpoRto` | export por tenant; `desconocidos` | **RPO y RTO `desconocidos` hasta GATE 3** |
| `reuso` | la matriz dominio × capa, si existe, con su comando | 40.7 % / 14.8 % | el comando existe; el reuso de composición lo calcula el gate |
| `fde` | `aMedida`, `nucleo`, `vuelta` y su `registro` | mapeos y contratos por cliente; matriz, reloj, anonimizador | las dos listas con algo y cómo vuelve lo a medida |
| `fuera` | lo que el producto no hace | sin SAP real, sin aprobar solo, sin precios | al menos una línea |

## El esqueleto

```json
{
 "slug": "", "nombre": "", "version": 1, "estado": "blueprint", "indice": "",
 "contrato": { "ruta": null, "falta": "", "c3": null, "aisia": null, "firma": "pendiente del laboratorio" },
 "modeloDeNegocio": { "quienPaga": "", "aQuienSirve": [], "forma": "", "propuesta": "" },
 "niveles": [], "tenencia": { "arbol": [], "aislamiento": { "control": "", "prueba": "" } },
 "roles": [], "activos": { "propios": [], "componentes": [], "base": [] }, "canales": [],
 "pricing": { "variables": [], "tiers": [], "precio": null, "modeloDeCobro": null, "planComercial": null, "quienDecide": "", "fuente": "" },
 "metricas": { "fuente": "", "catalogo": "", "definicionUnica": false },
 "sla": { "contratos": "", "plantilla": "" },
 "entrega": { "modelo": "por decidir", "decision": "" },
 "respaldo": { "inventario": "", "procedimiento": "", "rpoRto": "desconocidos", "gate3": false },
 "reuso": {}, "fde": { "aMedida": [], "nucleo": [], "vuelta": "", "registro": "" }, "fuera": []
}
```

## Historia de la plantilla

- **v1 (2026-10-04)**: salida de Soporte SAP. Cada campo tiene su caso en la corrida A.
