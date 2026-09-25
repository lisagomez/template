# ERP · frontera de entrega (marca blanca)

> PRP-004, Fase 3B · 2026-09-25 · **Propuesta, pendiente de ratificar por el laboratorio.**
> Qué recibe un tenant de marca blanca, qué no sale nunca y qué es parámetro. Es el **insumo**
> para decidir licencia, precio y empaque; **no decide ninguno de los tres**. Clasificar la
> defensibilidad es decisión humana (ERP-MAESTRO §1.7, consecuencia 4): hasta que el laboratorio
> ratifique, `erp/entrega.json` lleva `"ratificacion": { "estado": "propuesta" }`.

## La regla que lo sostiene

La frontera es **ejecutable**, no solo este papel. `erp/entrega.json` asigna cada archivo de `erp/`
a una sola clase, y `npm run verifica:marca-blanca` (dentro de `npm run validate`) falla si:

1. un archivo de `erp/` no tiene clase (nadie decidió si sale);
2. algo defendible o de la casa cae dentro de la entrega;
3. una huella de la casa (`erp/casa/huellas.txt`) aparece en lo que se entrega.

`--prueba` siembra los tres fallos y exige que el gate los cace; `--lista` devuelve los
entregables para empaquetar: `tar czf erp.tgz $(node scripts/verifica-marca-blanca.mjs --lista)`.
Es el control «fuga de defendibles» que pide ERP-6 (paso 6): *verificación automatizada de que
ningún fuente defendible viaja en el artefacto del cliente*.

## Las cuatro clases

### Entrega — lo que recibe el tenant (15 archivos)

| Pieza | Archivos | Para qué |
|---|---|---|
| Esquema | `migrations/001…005_*.sql` | 22 tablas, 4 funciones, 3 triggers, 22 políticas, 3 roles, grants y append-only |
| Instalador | `instalacion/instalar.sh`, `lib.sh` | instala desde cero o encima (idempotente), con la identidad como parámetro |
| Pruebas | `instalacion/pruebas.sh`, `pruebas.sql`, `prueba-efimera.sh` | pruebas de cierre (a)…(j) en una transacción que se deshace; instalación completa en efímero |
| Referencia | `instalacion/referencia/{esquema-erp.sql, roles.sql, roles.txt, servidor.txt}` | el esquema y los roles **tal como están en producción**, para comprobar que una instalación es equivalente |
| Guía | `instalacion/INSTALAR.md` | lo único que necesita leer quien instala |

**Por qué el esquema sí sale.** El valor no está en la forma de las tablas: un equipo con un
asistente de código reproduce tablas y checks en semanas (la prueba de §1.7). Lo que no se copia son
las reglas auditadas, los datos de costo y las relaciones, y nada de eso vive en el DDL. Además, si
el cliente instala en **su** base, el DDL es visible para su administrador de todos modos: no se
puede entregar «uso» de un esquema que corre en infraestructura ajena sin entregar su forma.

**Lo que el esquema sí deja ver**, y que el laboratorio debe dar por aceptado al ratificar:

- los comentarios de las migraciones citan secciones y decisiones del maestro (§1.7, D-07, D-10,
  ERP-4B) sin su contenido; explican por qué existe cada restricción;
- la lista cerrada de prefijos de folio (`003_folios.sql`) anticipa módulos futuros (auditoría,
  pólizas, documentos, prospectos, CRM, nómina, cotizaciones, promociones): es hoja de ruta
  visible;
- el diseño multi-tenant por RLS, las tarjetas de agente y la bitácora con traza.

Si algo de eso no debe salir, la alternativa es **no entregar DDL**: el tenant usa el ERP en una
base que opera la casa (tier dedicado o compartido) y recibe solo uso: API, resultados, exportación.
Esa decisión cambia la clase de toda la entrega y es del laboratorio.

### Defendible — el foso, no sale nunca (3)

| Archivo | Por qué |
|---|---|
| `ERP-MAESTRO.md` | la doctrina entera: arquitectura A2A como sistema probado, decisiones D-01…D-41, hoja de ruta, estrategia D+I y de defensibilidad, planeación comercial |
| `reglas/` | paquetes de reglas auditadas (política contable D-07): «know-how con firma de auditor — eso no se clona» |
| `integracion-arkham.md` | relación con un socio: las relaciones son defendibles |

### Casa — operación e identidad de quien opera el ERP (5)

| Archivo | Por qué |
|---|---|
| `casa/ESTADO-PRODUCCION.md` | ref de producción, tenant propio, historia de aplicación, estado de cluster |
| `casa/parametros-casa.env` | parámetros de instalación de la casa (sin secretos) |
| `casa/huellas.txt` | la lista de huellas es, ella misma, dato de la casa |
| `bin/cosechar-activos.py`, `bin/detector-swm-act.py` | adaptadores a los sistemas de la casa (tareas, consumo de tokens, Slack, rutas del servidor): no son del producto, son de cómo la casa se inventaría a sí misma |

### Fábrica — cómo se construye y se vigila aquí (6)

`entrega.json`, este documento, `specs/`, `migrations/README.md` (bitácora de diseño con la hoja de
ruta de módulos), `instalacion/captura-referencia.sh` (lee producción de la casa) e
`instalacion/control-reversion.sh` (la prueba de las pruebas).

## Parámetros de instalación

Nada del tenant va escrito en los archivos entregados. Todo entra por variables de entorno:

| Parámetro | Obligatorio | Dónde termina |
|---|---|---|
| `ERP_DB_URL` | sí | solo en la conexión; nunca se imprime |
| `ERP_MARCA` | sí | `COMMENT ON SCHEMA erp` (única diferencia admitida con producción) |
| `ERP_TENANT_ID` | no (se genera) | `COMMENT ON SCHEMA erp` y la salida del instalador; cada sesión lo fija en `app.cliente_id` |
| `ERP_LOGIN_EJECUTOR` + contraseña | no | login miembro de `rol_exe_fin` y `rol_swm` |
| `ERP_LOGIN_LECTOR` + contraseña | no | login miembro de `rol_swm` |
| `ERP_PUENTE_POSTGRES=1` | no | membresía del dueño en los tres roles (SET ROLE) |

## Qué necesita el cliente para instalar

PostgreSQL 13+ (probado en 17; sirve Supabase), la conexión del dueño del esquema, y `psql` 15+ o
Docker. Nada más: ni extensiones (usa `gen_random_uuid` nativo), ni acceso a ningún sistema de la
casa, ni red hacia fuera. Con eso: `instalar.sh` → `pruebas.sh` → la aplicación entra con
`set local role` + `set local app.cliente_id`.

## Qué queda para el laboratorio

1. **Ratificar o corregir esta clasificación** (y poner `ratificacion` en `entrega.json`).
2. Decidir el **modelo de entrega**: DDL a la base del cliente (esta propuesta) o solo uso sobre una
   base que opera la casa.
3. **Licencia, precio y empaque final** (ERP-6 paso 4: sin plan comercial no hay precios).
4. Si se quiere, un endurecimiento con CDC de esquema: quitar `EXECUTE` a `PUBLIC` en las funciones
   de `erp` (hoy no abre nada, ver `casa/ESTADO-PRODUCCION.md`) y limpiar de los comentarios de las
   migraciones las referencias al maestro.
