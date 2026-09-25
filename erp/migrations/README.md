# ERP Agéntico · Migraciones ERP-0 (fundación) + módulo act (ERP-4B)

Modelo de datos + seguridad estructural de la cadena mínima `ped → fac → cfd → cob (+ inv)`
y del módulo `act` (activos digitales, ERP-4B).
Spec completa: [`../ERP-MAESTRO.md`](../ERP-MAESTRO.md) (Parte IV, ERP-0; §4B para act).
**22 tablas** en el esquema `erp` (13 núcleo + 4 retail + 1 folios + 4 act).

> **v4 (estrategia D+I)** y **v5 (auditoría)** SÍ tocaron ERP-0 (migración 001):
> - `sis_encargo` gana `eje_dei` (investigacion|desarrollo|operacion, nace en el origen) y
>   `traza_id` (uuid que viaja del Slack al asiento).
> - `sis_bitacora` gana `traza_id NOT NULL` — "una escritura sin traza no debe poder existir"
>   (sin default: el CLI DEBE propagar la traza; es el eje de `aud trazar`).
> - Nueva tabla `sis_agente` (+ `sis_agente_version`): la TARJETA DE AGENTE A2A — lo que cada
>   agente DEBE poder hacer; dep-aud (ERP-4C) la compara contra la realidad.
> Módulos posteriores (NO tocan ERP-0): `act` (activos, migr. 005, ERP-4B), `aud` (auditoría,
> migr. 006, ERP-4C) y `ctb` (contable, ERP-5B — v6: perfiles regulatorios, buzón de
> documentos, pólizas con partida doble estructural, balanza, cierre irreversible, estados
> financieros, presupuesto; v7 §5B.8: cierres anuales/amarres/expediente) y `pln` (planeación
> estratégica, ERP-7 — v8: "la fábrica es el producto", pipeline, % de reuso como métrica norte,
> migración 007). Forward-compat en `003_folios.sql`: whitelist de prefijos —
> `ACT- HAL- POL- DOC- PRO- CAS- DIF- NOM- COT- PRM-` además de los de la cadena. Packs/deptos
> posteriores: CRM conversacional (v10), **nómina `dep-nom`/ERP-5C** (v11: nom/per/asi, tarifas
> fiscales como datos versionados, doble compuerta aprobar≠dispersar, CFDI de nómina, doble firma
> contador+laboral), y motor comercial (cot/prc/prm). Decisiones D-07…D-31.

## Estado e instalación

- **Producción de la casa**: aplicadas el 2026-07-26; historia, tenant, roles y estado de cluster en
  [`../casa/ESTADO-PRODUCCION.md`](../casa/ESTADO-PRODUCCION.md) (no se entrega). El 2026-09-25 el
  esquema de producción se comparó con estos archivos: **idéntico**.
- **Instalar** (desde cero o encima, idempotente): [`../instalacion/instalar.sh`](../instalacion/instalar.sh)
  aplica `NNN_*.sql` en orden y cierra con 004; el tenant, la marca, los logins y el puente son
  **parámetros**, no texto en estos archivos. Guía para quien instala: [`../instalacion/INSTALAR.md`](../instalacion/INSTALAR.md).
- **Orden**: desde el 2026-09-25 el resultado no depende del orden. 005 trae su propia RLS y sus
  revokes append-only, y 004 repite los revokes de los ledgers (`act_version`, `act_costo`), así que
  re-correr 004 al final —lo que se hace cuando un pack añade tablas— ya no reabre el UPDATE.
  Antes, instalar 001→005 en una sola pasada dejaba las 4 tablas `act_*` **sin RLS** (medido); la
  casa estaba bien solo porque se re-corrieron 004 y 005 a mano.

Todo vive en un esquema **`erp` aislado** de `public` (donde las verticales Hermes usan
`service_role`). Aquí el modelo es el opuesto: RLS con políticas por `cliente_id` + roles
dedicados; los CLIs/agentes **jamás** usan `service_role` (tiene BYPASSRLS y anula el aislamiento).

## Archivos (aplicar en este orden)

| # | Archivo | Qué crea |
|---|---------|----------|
| 001 | `001_nucleo.sql` | Núcleo (13 tablas): cob_cliente/saldo/cobro(+aplicacion), fac_factura/concepto/impuesto (impuestos POR concepto, CFDI 4.0), cfd_folio/timbre (estado intermedio + transiciones), sis_encargo (cola persistente + eje_dei + traza_id), sis_bitacora (append-only, traza_id NOT NULL), sis_agente(+_version) (tarjeta de agente A2A). Triggers de cuadre y de transición. |
| 002 | `002_pack_retail.sql` | Pack retail: inv_articulo/precio, ped_pedido/partida. El pack referencia al núcleo, nunca al revés. |
| 003 | `003_folios.sql` | Folios humanos por tenant (PED/FAC/CFD/COB/REP) con `erp.siguiente_folio()` atómico (anti-carrera). |
| 004 | `004_seguridad.sql` | Roles `rol_exe_fin`/`rol_swm`/`rol_admin` + RLS `FORCE` con política por `cliente_id` en toda tabla + revokes append-only. Es también el **cierre** de la instalación: re-correrlo si un pack añade tablas (seguro en cualquier orden). |
| 005 | `005_activos.sql` | Módulo `act` (ERP-4B): act_activo (dos ejes §1.7 + defensibilidad propuesta/ratificada + campos contables), act_version (append-only), act_proteccion (expediente defendibles), act_costo (append-only, fuente obligatoria, trigger que mantiene costo_acumulado). Trae su propia RLS y sus revokes: queda cerrado aunque se instale en una sola pasada. |

## Cómo validar (efímero, cero costo)

```bash
npm run erp:prueba     # Postgres 17 desechable: instala 2 veces, pruebas (a)…(j), ≡ producción
npm run erp:control    # la prueba de las pruebas: 6 mutaciones, todas deben caer en rojo
```

Toda migración nueva pasa primero por `npm run erp:prueba` (y su referencia de producción se
recaptura, en solo lectura, con `erp/instalacion/captura-referencia.sh` después de aplicarla).

Validación de cierre ERP-0 que pasó en 2026-07 (hoy son los casos (a)-(d) de `../instalacion/pruebas.sql`,
que añade (e) DELETE, (f) append-only, (g) cerrado sin tenant, (h) RLS FORCE total, (i) act y (j) folios):
- **(a)** cadena completa cuadra (subtotal+IVA = total = cobrado);
- **(b)** la BD rechaza sola: descuadre de cabecera, total negativo, emitir sin conceptos,
  descuadre cabecera↔detalle, transición de timbre inválida;
- **(c)** `rol_swm` no puede escribir (permission denied);
- **(d)** aislamiento por tenant: A no lee ni escribe filas de B (RLS).

## Antes de operar (bloqueos aguas abajo)

- **D-03 (bloquea ERP-1)**: elegir el stack único de los CLIs (Python/Go/Node). Sin esto no
  se escriben los 5 CLIs de la cadena.
- Al aplicar en Supabase: el MCP está read-only → usar management API para el DDL
  (`POST /v1/projects/{ref}/database/query`, UA `curl/8.0`), o el SQL Editor. Los roles son
  globales del cluster; el esquema `erp` no se expone por PostgREST (los CLIs conectan por
  Postgres directo con `rol_exe_fin`, no por la API REST).
