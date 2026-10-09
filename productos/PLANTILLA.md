# Plantilla de producto (v3)

> Para declarar el siguiente producto. Qué es un producto: [`CONCEPTO.md`](CONCEPTO.md). El manifiesto
> de referencia es [`soporte-sap.json`](soporte-sap.json); la plantilla salió de él y **lo que no aparece en
> Soporte SAP no entra** (spec de la corrida B). El segundo producto, [`ventas-whatsapp.json`](ventas-whatsapp.json),
> la puso a prueba y la cambió (abajo, «Historia»). La verifica `npm run verifica:productos`.

## Cómo se usa

1. Copia el esqueleto de abajo a `productos/<slug>.json` (el `slug` en kebab-case, igual al nombre del archivo).
2. Llena cada campo con lo que **ya existe**: rutas que existen, activos del inventario, decisiones con su
   número. **Un null no es un dato**: un campo obligatorio en null lleva `falta` en su sección, y una sección
   que no aplica se declara `{ "aplica": false, "motivo": "…" }` (hoy solo puede no aplicar el `sla`).
3. Lo que tu producto tiene y la plantilla no recoge va a `noCupo`, con dónde está y qué propones. No lo
   metas a la fuerza en otro campo, y no inventes un campo: la plantilla cambia por CDC, no por manifiesto.
4. Dale a cada activo **propio** su dueño en `inventario/activos.json` (`"producto": "<slug>"`) y corre
   `npm run inventario:vista`.
5. Corre `npm run verifica:productos`: tu manifiesto en verde, lo que falta y lo que no cupo en ámbar, y las
   siembras cazadas.

## Los campos

| Campo | Qué lleva | En Soporte SAP | En el vendedor en WhatsApp | Lo que el gate exige |
|---|---|---|---|---|
| `plantilla` | la versión de la plantilla que sigue | 3 | 3 | la vigente |
| `slug`, `nombre`, `version` | identidad | `soporte-sap`, versión 1 | `ventas-whatsapp` | `slug` en kebab-case = nombre del archivo |
| `estado` | `blueprint`, `beta` o `produccion` | `blueprint` | `blueprint` | no más avanzado que el menos avanzado de sus propios |
| `indice` | el nombre de su fila en `BUSINESS_LOGIC.md` §1 | «Soporte SAP» | «Vendedor con IA en WhatsApp» | la fila existe; cita solo propios del manifiesto |
| `contrato` | `ruta` del contrato C4 (o `null` con `falta`), `c3`, `aisia`, estado de `firma` | contrato, PRP-008, AISIA en borrador | pendiente; C3 y C4 en borrador | la ruta es la que enlaza su fila (o las dos lo dicen pendiente); toda ruta existe |
| `modeloDeNegocio` | quién paga, a quién sirve, la forma (B2B, B2B2C…) y la propuesta | la consultora; B2B2C | la pyme; B2B2C | — |
| `niveles` | cada nivel, quién es y qué hace | laboratorio, consultora, cliente | laboratorio, pyme, cliente de la pyme | — |
| `tenencia` | el árbol de tenants y el control de aislamiento con su prueba | RLS forzada | almacén por inquilino | la prueba existe (o `falta`) |
| `roles` | cada rol: `persona` o `agente`, su nivel, si `aprueba` | tres agentes, ninguno aprueba | tres agentes, ninguno aprueba | **ningún agente aprueba** |
| `activos` | `propios`, `componentes` (`{id, para}`) y `base` (`{id, para}`) | 10 · 2 · 8 | 2 · 0 · 1 | existen; no se solapan; propios con este dueño y ninguno fuera; componentes de otro producto del índice; base de ninguno |
| `canales` | por dónde se habla con el producto: `interno` o `externo` | sala, chat del HIL, app | WhatsApp y A2A (externos), panel, plataforma, laboratorio | **un canal externo exige C3 y AISIA** |
| `terceros` | quién recibe algo de fuera del inventario: `quien`, `recibe`, `datosPersonales`, `decision` y `costo { naturaleza, fuente }` | la base gestionada (D10), el VPS (D12), el modelo (D7) | Meta, el procesador, el LLM, los números, la infraestructura | **un tercero con datos personales exige AISIA**; cada uno con su decisión y su costo, de naturaleza `medido`, `supuesto`, `fuente` o `por decidir` |
| `pricing` | variables, tiers, `precio`, `modeloDeCobro`, `planComercial`, quién decide, fuente | variables del N3 → tier | conversaciones, anuncio, número, modalidad del BSP | **ningún precio ni modelo de cobro sin plan comercial** (ERP-7) |
| `metricas` | de dónde salen los números y si hay una sola definición | el corte semántico | el tablero de atribución | la fuente existe (o `falta`) |
| `sla` | los contratos y la plantilla del documento, o `aplica: false` con `motivo` | `sla.ts` y su plantilla | no aplica: nadie contrata un tiempo de respuesta | existen, o el motivo |
| `entrega` | modelo `A`, `B`, `mixto` o `por decidir`, con la decisión que lo fija | por decidir (D3) | por decidir, sin decisión propia | uno de los cuatro |
| `respaldo` | dónde está su inventario de respaldo, el procedimiento y `rpoRto` | export por tenant | falta: va en el contrato pendiente | inventario (o `falta`); **RPO y RTO `desconocidos` hasta GATE 3**; nunca «no aplica» |
| `despliegue` | **requisitos, no proveedores**: `modos` (`gestionado`, `despacho`), la máquina de cada `tamano` (S, M, L) con su `fuente`, lo que `exige` (la región según su decisión, respaldo inmutable fuera de sitio, puertos, Docker), quién lo `opera` y con qué decisión, y los `secretos` que necesita en producción | gestionado y despacho; 2 vCPU · 1.5 GB · 21–22 GB del estimado; región por D10 (abierta); opera por D3 | gestionado; tamaños: falta (sin estimado) | **ningún proveedor ni plan**; los tamaños con su máquina y su fuente (o `falta`); **respaldo inmutable fuera de sitio**; la región, abierta o decidida con sus regiones; ningún secreto con `NEXT_PUBLIC_` |
| `reuso` | la matriz dominio × capa, si existe, con su comando | 40.7 % / 14.8 % | falta: no hay matriz | el comando existe (o `falta`); el reuso de composición lo calcula el gate |
| `fde` | `aMedida`, `nucleo`, `vuelta` y su `registro` | mapeos y contratos por cliente | catálogo, límites y umbral por pyme | las dos listas con algo, cómo vuelve lo a medida, y el registro (o `falta`) |
| `fuera` | lo que el producto no hace | sin SAP real, sin aprobar solo | sin número real, sin LLM, sin cobrar solo | al menos una línea |
| `noCupo` | lo que el producto tiene y la plantilla no recoge: `que`, `donde`, `propuesta` | nada | cuatro cosas (abajo) | cada una con su evidencia y su propuesta |

## El esqueleto

```json
{
 "plantilla": 3, "slug": "", "nombre": "", "version": 1, "estado": "blueprint", "indice": "",
 "contrato": { "ruta": null, "falta": "", "c3": null, "aisia": null, "firma": "pendiente del laboratorio" },
 "modeloDeNegocio": { "quienPaga": "", "aQuienSirve": [], "forma": "", "propuesta": "" },
 "niveles": [], "tenencia": { "arbol": [], "aislamiento": { "control": "", "prueba": "" } },
 "roles": [], "activos": { "propios": [], "componentes": [], "base": [] }, "canales": [],
 "terceros": [{ "quien": "", "recibe": "", "datosPersonales": false, "decision": "", "costo": { "naturaleza": "por decidir", "fuente": "" } }],
 "pricing": { "variables": [], "tiers": [], "precio": null, "modeloDeCobro": null, "planComercial": null, "quienDecide": "", "fuente": "" },
 "metricas": { "fuente": "", "catalogo": null, "definicionUnica": false },
 "sla": { "contratos": "", "plantilla": "" },
 "entrega": { "modelo": "por decidir", "decision": "" },
 "respaldo": { "inventario": null, "falta": "", "procedimiento": "", "rpoRto": "desconocidos", "gate3": false },
 "despliegue": { "modos": [], "tamanos": null, "falta": "", "exige": { "region": { "decision": "", "estado": "abierta", "regiones": [] }, "respaldo": "inmutable-fuera-de-sitio", "puertos": [80, 443], "docker": true }, "opera": { "quien": "por decidir", "decision": "" }, "secretos": [] },
 "reuso": { "matriz": null, "falta": "" }, "fde": { "aMedida": [], "nucleo": [], "vuelta": "", "registro": null, "falta": "" },
 "fuera": [], "noCupo": []
}
```

## Historia de la plantilla

- **v1 (2026-10-04)**: salida de Soporte SAP. Cada campo tiene su caso en la corrida A. 18 siembras.
- **v2 (2026-10-04)**: la cambió el segundo producto, el vendedor en WhatsApp, descrito sin tocar su código.
  La v1 lo daba **en verde**, pero era un verde hueco. Tenía cuatro campos en null (SLA, inventario de
  respaldo, matriz de reuso, registro FDE) y el gate no preguntaba por qué. Tampoco tenía dónde decir que el
  texto de los clientes sale a Meta y a un proveedor de LLM.
  - **Entró**, porque Soporte SAP también lo tiene y la v1 no lo recogía, o porque la v1 ya lo prometía y su
    gate no lo cumplía:
    - `terceros`, con su costo: Soporte SAP los tenía en D7, D10 y D12 y en las líneas de costo de
      `pricing.ts`. El vocabulario de la naturaleza es común a los dos: el «ficticio» del vendedor es el
      «supuesto» de Soporte SAP.
    - «un null no es un dato» (`falta`) y `aplica: false` con `motivo`: el paso 2 de la v1 ya decía «un campo
      que no aplica se declara con su motivo».
    - `plantilla` (la versión) y `noCupo`: son el mecanismo para que la plantilla cambie sin que un
      manifiesto la estire en silencio.
  - **No entró**, porque solo lo tiene el vendedor (está en su `noCupo`, como propuesta):
    - las líneas de negocio (N-01 números, N-02 BSP propio);
    - el agente que actúa solo bajo un umbral de monto;
    - las fases del producto con compuertas;
    - la inversión de una vez antes del piloto.
  - 8 siembras nuevas (26 en total).

- **v3 (2026-10-09)**: `despliegue` (PRP-010, DP-5). Soporte SAP lo tiene y la v2 no lo recogía: el estimado de
  la máquina por tamaño (SDD §14), el despliegue en cualquier VPS (§15) y tres decisiones abiertas, D3 (quién opera),
  D10 (dónde viven los datos) y D12 (el proveedor). Es la misma regla de entrada, sin cambiarla (B-3).
  - **Requisitos, no proveedores**: una tabla de planes envejece sin que nadie lo note, y el repo ya lo aprendió
    (`configura:deploy` no tiene tabla de planes a propósito). El proveedor y la región de cada instalación son un
    dato de su `.env.production`, y la máquina se mide.
  - `configura:deploy` mide la máquina contra el tamaño contratado. Compara la región con su decisión, y mientras
    esté abierta dice «pendiente», nunca «cumple». Avisa si falta el destino de respaldo y comprueba que estén los
    `secretos`, sin imprimirlos.
  - `retencion` y `salida` no entran: siguen la recomendación de B-6 y entran con el siguiente manifiesto.
  - 9 siembras nuevas (35 en total).

**La regla de entrada**: un cambio entra a la plantilla si Soporte SAP también lo tiene o si es una regla
que la plantilla ya escribía. Lo que solo tiene un producto se queda en su `noCupo`. Que entre lo que tienen
dos productos aunque no lo tenga la referencia es un cambio de esta regla: lo decide el laboratorio en un CDC aparte (decisión B-3, `docs/goals/soporte-sap-informe-b.md` §7).
