# Instalar el ERP

Esquema `erp`: facturación CFDI 4.0, cobranza, pedidos e inventario (pack retail), folios,
bitácora de auditoría, tarjetas de agente y catálogo de activos digitales. **Multi-tenant desde
el día uno**: cada fila lleva `cliente_id`, y la base de datos (no la aplicación) impide que un
tenant vea o toque las filas de otro.

## Qué necesitas

- PostgreSQL **13 o superior** (probado en 17). Sirve un proyecto de Supabase.
- Una conexión con el **dueño del esquema**; en Supabase es el usuario `postgres` (Project
  Settings → Database → Connect, modo *Session*, puerto 5432).
- `psql` 15+ en la máquina, o Docker: si no hay `psql`, el instalador usa `postgres:17-alpine`.

## Instalar

```bash
export ERP_DB_URL='postgresql://…'            # nunca se imprime; no la pegues en chats ni tickets
export ERP_MARCA='Tu Marca'                   # nombre comercial de esta instalación
export ERP_TENANT_ID='…uuid…'                 # opcional: si falta, se genera uno
export ERP_PUENTE_POSTGRES=1                  # opcional: ver «El puente», abajo
export ERP_LOGIN_EJECUTOR=erp_ejecutor ERP_LOGIN_EJECUTOR_PASSWORD='…'   # opcional
export ERP_LOGIN_LECTOR=erp_lector     ERP_LOGIN_LECTOR_PASSWORD='…'     # opcional
bash erp/instalacion/instalar.sh
```

El instalador aplica las migraciones `NNN_*.sql` en orden, vuelve a correr `004_seguridad.sql`
como cierre (grants y RLS sobre **todas** las tablas), registra la marca y el tenant en el
comentario del esquema, crea los accesos que pidas y termina verificando lo instalado:

```
tablas en erp: 22
tablas con RLS FORCE: 22 de 22
tablas con política tenant_aislamiento: 22
append-only (sin UPDATE para rol_exe_fin): act_costo=ok act_version=ok sis_bitacora=ok
DELETE para rol_exe_fin en alguna tabla: no
```

Es **idempotente**: correrlo otra vez no cambia nada ni borra nada. Las contraseñas solo se
usan al crear un login; si ya existe, no se tocan.

## Verificar

```bash
ERP_DB_URL='postgresql://…' ERP_TENANT_ID='…' bash erp/instalacion/pruebas.sh
```

Diez pruebas de cierre, dentro de **una transacción que se deshace** (no deja filas, ni
siquiera en la bitácora, que nadie puede limpiar):

| | Qué comprueba |
|---|---|
| (a) | la cadena pedido → factura → timbre → cobro cuadra (subtotal + IVA = total = cobrado) |
| (b) | la base rechaza sola: descuadre de cabecera, total negativo, emitir sin conceptos, descuadre cabecera↔detalle, transición de timbre inválida, importe mal calculado, prefijo de folio inventado |
| (c) | el rol lector lee su tenant y no puede escribir, borrar ni asignar folios |
| (d) | aislamiento: el tenant B no ve, no modifica ni escribe filas de A |
| (e) | nadie borra (lo fiscal es inmutable: la baja es un estado) |
| (f) | bitácora, versiones y costos son *append-only* |
| (g) | sin tenant en sesión: cero filas y ninguna escritura (cerrado por defecto) |
| (h) | RLS `FORCE` y política de aislamiento en todas las tablas |
| (i) | activos: el costo acumulado lo mantiene la base; ratificar y capitalizar exigen rastro |
| (j) | folios humanos secuenciales y con contador propio por tenant |

Las pruebas necesitan que la conexión pueda hacer `SET ROLE` a los roles del ERP: con
`ERP_PUENTE_POSTGRES=1` o con un superusuario.

¿Sin base a mano? `bash erp/instalacion/prueba-efimera.sh` levanta un PostgreSQL desechable en
Docker, instala dos veces, corre las pruebas, compara el esquema con la referencia
(`referencia/esquema-erp.sql`) y lo destruye todo al final.

## Cómo se conecta una aplicación

Nunca con una llave que salte la RLS (en Supabase, `service_role` tiene BYPASSRLS y anula el
aislamiento). Cada sesión o transacción declara su rol y su tenant:

```sql
begin;
set local role rol_exe_fin;                         -- o rol_swm para solo lectura
set local app.cliente_id = '<uuid del tenant>';     -- sin esto: cero filas, cero escrituras
-- … consultas …
commit;
```

| Rol | Puede |
|---|---|
| `rol_exe_fin` | leer, insertar y actualizar en su tenant; nunca borrar; nunca editar lo append-only |
| `rol_swm` | solo leer su tenant |
| `rol_admin` | DDL y migraciones (uso humano) |

Los logins (`ERP_LOGIN_EJECUTOR`, `ERP_LOGIN_LECTOR`) son miembros de esos roles y no tienen
privilegios propios. El esquema `erp` **no** se expone por la API REST de Supabase: se entra por
PostgreSQL directo.

### El puente

`ERP_PUENTE_POSTGRES=1` hace al usuario de instalación miembro de los tres roles para que pueda
hacer `SET ROLE`. Úsalo para las pruebas y para operar a mano mientras no haya un login dedicado.
Ojo en Supabase: `postgres` tiene BYPASSRLS, así que **sin** `SET ROLE` ve todas las filas de
todos los tenants. Por eso toda operación empieza con `set local role`.

## Acceso de soporte (solo lectura, con vencimiento)

Cuando pidas soporte, crea un login de **solo lectura** para esa incidencia, con fecha de
vencimiento, y revócalo al cerrarla. Nunca des la conexión del dueño del esquema.

```sql
-- como dueño del esquema; la contraseña la generas tú y la entregas por un canal seguro
create role soporte_incidencia login password '…' valid until '2026-12-31';
grant rol_swm to soporte_incidencia;
-- al cerrar la incidencia:
drop role soporte_incidencia;
```

`rol_swm` solo lee, y la RLS sigue aplicando: quien entra con ese login ve las filas del tenant
que fije en su sesión, no puede escribir, borrar ni asignar folios (prueba (c)).

## Varios tenants en la misma base

El tenant de la instalación es solo el **inicial**. Otro tenant no necesita instalar nada: basta
con usar otro `app.cliente_id` en sus sesiones; la base aísla sus filas sola (prueba (d)). Si un
cliente exige aislamiento más fuerte que RLS en base compartida, se instala en su propia base.

## Qué se instala

| Archivo | Contenido |
|---|---|
| `migrations/001_nucleo.sql` | 13 tablas: clientes, saldos, cobros, facturas, conceptos, impuestos por concepto, folios y timbres CFDI, encargos, bitácora, tarjetas de agente |
| `migrations/002_pack_retail.sql` | 4 tablas: artículos, precios, pedidos, partidas |
| `migrations/003_folios.sql` | contador de folios por tenant y `erp.siguiente_folio()` |
| `migrations/004_seguridad.sql` | roles, grants, RLS `FORCE` por `cliente_id`, append-only |
| `migrations/005_activos.sql` | 4 tablas: activos, versiones, protección, costos |
