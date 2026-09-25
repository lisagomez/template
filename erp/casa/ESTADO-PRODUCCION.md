# ERP de la casa · estado en producción

> **No se entrega.** Todo lo de este directorio (`erp/casa/`) es dato de quien opera el ERP:
> identificadores de producción, tenant propio, historia de aplicación. Lo que recibe un tenant
> de marca blanca está listado en `erp/entrega.json` y se describe en `erp/FRONTERA-DE-ENTREGA.md`.
> Trasladado de `erp/migrations/README.md` el 2026-09-25 (PRP-004, Fase 3B).

## Dónde vive

- Supabase compartido **A2ABot** (`hsejpktzcqwkwkwholkw`), esquema `erp`, PostgreSQL 17.6.
- Tenant de la casa (D-08): `ERP_CLIENTE_CASA=2de8835a-439c-461a-990c-a2b95d29f3a4`
  (acuñado 2026-07-26; también en el `.env` del host). Parámetros de instalación de la casa:
  `parametros-casa.env`.

## Historia de aplicación

- **Aplicadas el 2026-07-26** (decisión del laboratorio), vía management API. Orden aplicado:
  `001 → 002 → 003 → 004 → 005 → 004 (re-corrida: RLS de act_*) → 005 (re-corrida: revokes
  append-only)`. Pre-vuelo: esquema `erp` inexistente, roles inexistentes, cero colisiones de
  funciones en `public` — aplicación puramente aditiva; rollback = `drop schema erp cascade` +
  drop de los 3 roles.
- Gate de cierre verificado contra producción (2026-07-26): 22 tablas con RLS FORCE; `rol_swm`
  rechazado por permiso de TABLA; `siguiente_folio('ACT')` → `ACT-0001`; 0 filas sin
  `app.cliente_id`; DELETE denegado; escritura válida bajo `rol_exe_fin` + baja por
  `estado='baja'` (nunca delete).
- **2026-09-25 · reconciliación (Fase 3B):** `pg_dump --schema-only --schema=erp` de producción
  (con `erp_lector`, solo lectura) **idéntico** a los archivos 001-005 aplicados en ese orden.
  Desde entonces 004 y 005 son seguros en cualquier orden (ver `erp/migrations/README.md`) y la
  instalación canónica es `erp/instalacion/instalar.sh`, que reproduce este esquema línea por línea
  (`referencia/esquema-erp.sql`, `npm run erp:prueba`). **Producción no necesitó ningún cambio.**

- **2026-09-25 · Fase 4 del PRP-004 aplicada** (lisagomez, el laboratorio, desde el SQL Editor):
  ACT-0012 «ERP agéntico (ERP-0)» re-ubicado `erp/ → template/erp/` con `erp/casa/fase4-reubicacion.sql`
  (una transacción como `rol_exe_fin` + tenant; guardas de fila y de totales). Asiento en
  `sis_bitacora` (`act.reubicar`, traza `b2b726c1-19e2-4d5e-8268-c8d96e4b68e0`). ACT-0002 (en baja)
  conserva su ruta vieja a propósito: es historia. Reverso: el mismo archivo con
  `set fase4.sentido = 'vuelta'`.

## Estado de cluster (no vive en ningún .sql de migración)

Medido el 2026-09-25 con `erp_lector`. El instalador lo reproduce con parámetros
(`ERP_PUENTE_POSTGRES=1`, `ERP_LOGIN_EJECUTOR`, `ERP_LOGIN_LECTOR`); `referencia/roles.txt`
guarda su forma normalizada.

| Rol | Tipo | Miembro de | Para qué |
|-----|------|-----------|----------|
| `rol_exe_fin`, `rol_swm`, `rol_admin` | grupo, sin login | — | los crea 004 |
| `cli_fin` | login | `rol_exe_fin`, `rol_swm` | cosechador (`set local role rol_exe_fin`) y detector (`set local role rol_swm`) |
| `erp_lector` | login | `rol_swm` | lectura del catálogo y de la estructura; creado el 2026-09-25 para la Fase 3B |
| `postgres` | dueño del esquema | los 3 grupos, con SET | **puente interino** (hasta el CLI de ERP-1, D-03): `grant rol_exe_fin, rol_swm, rol_admin to postgres` |

- Las membresías `postgres → cli_fin/erp_lector/rol_*` con `admin=true, set=false` y grantor
  `supabase_admin` las crea el servidor solo al hacer `CREATE ROLE` (PG 16+): **no viajan**, no
  son decisión del ERP.
- **`postgres` tiene BYPASSRLS en Supabase.** `FORCE ROW LEVEL SECURITY` somete al dueño de la
  tabla, pero no a un rol con BYPASSRLS: conectado como `postgres` sin `SET ROLE`, la RLS no
  aplica. Por eso el puente siempre hace `set local role rol_exe_fin` (o `rol_swm`) antes de tocar
  filas, y por eso ningún CLI ni agente conecta como `postgres` ni con `service_role`.
- Las funciones de `erp` conservan el `EXECUTE` a `PUBLIC` que Postgres da por defecto
  (`=X/postgres`), igual que en los archivos. No abre nada: todas son `SECURITY INVOKER` y quien
  las llama necesita los grants de tabla (probado en `pruebas.sql`, caso (c)). Cerrarlo sería un
  endurecimiento con CDC de esquema, no una corrección.

## Fuera del ERP (en la misma base, no se tocan)

Candidatos listados en la reconciliación, **sin traer**: esquema `app` (registro de tenencia de
las apps de `public`: `tablas_tenant`, `tablas_globales`, `tablas_tenant_ajeno`, funciones
`tenant_actual`, `exigir_propietario`, `tenant_captura_default`) y `public` (apps de Hermes). La
propia migración de tenencia de Hermes declara al ERP «fuera de alcance: usa app.cliente_id +
rol_exe_fin». Ningún objeto de `erp` depende de ellos ni ellos de `erp` (medido: cero FKs, vistas,
funciones o dependencias cruzadas; ningún rol del ERP tiene grants fuera de `erp`).
