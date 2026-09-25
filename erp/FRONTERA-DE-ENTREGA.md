# ERP · frontera de entrega (marca blanca)

> PRP-004, Fase 3B · 2026-09-25 · **Modelo B propuesto (D-44), pendiente de ratificar por el
> laboratorio.** Qué recibe un tenant de marca blanca, qué no sale nunca y qué es parámetro. Decide
> la frontera técnica; **no** decide precio, cifras del SLA ni texto legal. Clasificar la
> defensibilidad es decisión humana (ERP-MAESTRO §1.7, consecuencia 4): hasta que el laboratorio
> ratifique, `erp/entrega.json` lleva `"ratificacion": { "estado": "propuesta" }`.

## El modelo: B, licencia instalada + SLA de soporte (D-44)

El tenant recibe el esquema y su instalador **bajo licencia** y los instala en **su** base; la casa
no opera su infraestructura. El SLA compromete solo lo que la casa controla —respuesta y resolución
de soporte, cadencia de actualizaciones, avisos de seguridad— y **excluye** disponibilidad y
respaldos del cliente (la casa no promete RPO/RTO de lo que no opera; los suyos siguen
«desconocidos» hasta GATE 3). El contrato lleva el anexo técnico `erp/contrato/ANEXO-TECNICO.md`.

**Por qué B y no A (servicio gestionado):** sin clientes, operar con SLA de disponibilidad es costo
fijo sin ingreso, exige GATE 3, guardia y ser encargado de todos los datos de terceros; B se entrega
con lo que ya está construido. **Disparador de revisión** (no una fecha): el primer cliente que
quiera pagar por disponibilidad garantizada —entonces se diseña A como tier dedicado (D-06)— o el
cierre de GATE 3 si la casa decide ofrecerlo antes.

## Cómo se ratifica

Quien firma dice «ratifico la frontera, modelo B» y se escribe en `erp/entrega.json`:
`"ratificacion": { "estado": "ratificada", "por": "<quien>", "fecha": "AAAA-MM-DD", "decision": "D-44" }`,
y D-44 pasa de PROPUESTA a DECIDIDO en el maestro con la misma firma. El gate rechaza una
ratificación sin quién, sin fecha o que apunte a una decisión que no existe.

## La regla que lo sostiene

La frontera es **ejecutable**, no solo este papel. `erp/entrega.json` asigna cada archivo de `erp/`
a una sola clase, y `npm run verifica:marca-blanca` (dentro de `npm run validate`) falla si:

1. un archivo de `erp/` no tiene clase (nadie decidió si sale);
2. algo defendible o de la casa cae dentro de la entrega;
3. una huella de la casa (`erp/casa/huellas.txt`) aparece en lo que se entrega;
4. lo entregado cita la doctrina (el maestro, sus secciones, decisiones o fases), salvo dentro de
   cadenas SQL: los `COMMENT ON` viven en la base y cambiarlos rompería la igualdad con producción;
5. la ratificación no deja rastro (ver arriba).

`--prueba` siembra los cinco fallos y exige que el gate los cace; `--lista` devuelve los
entregables para empaquetar: `tar czf erp.tgz $(node scripts/verifica-marca-blanca.mjs --lista)`.
Es el control «fuga de defendibles» que pide ERP-6 (paso 6): *verificación automatizada de que
ningún fuente defendible viaja en el artefacto del cliente*.

## Las cuatro clases

### Entrega — lo que recibe el tenant bajo licencia (16 archivos)

| Pieza | Archivos | Para qué |
|---|---|---|
| Esquema | `migrations/001…005_*.sql` | 22 tablas, 4 funciones, 3 triggers, 22 políticas, 3 roles, grants y append-only |
| Instalador | `instalacion/instalar.sh`, `lib.sh` | instala desde cero o encima (idempotente), con la identidad como parámetro |
| Pruebas | `instalacion/pruebas.sh`, `pruebas.sql`, `prueba-efimera.sh` | pruebas de cierre (a)…(j) en una transacción que se deshace; instalación completa en efímero |
| Referencia | `instalacion/referencia/{esquema-erp.sql, roles.sql, roles.txt, servidor.txt}` | el esquema y los roles **tal como están en producción**, para comprobar que una instalación es equivalente |
| Guía | `instalacion/INSTALAR.md` | lo único que necesita leer quien instala (incluye el acceso de soporte, solo lectura y con vencimiento) |
| Contrato | `contrato/ANEXO-TECNICO.md` | plantilla del anexo: qué se entrega, qué no, SLA de soporte en blanco, acceso de soporte |

**Por qué el esquema sí sale.** El valor no está en la forma de las tablas: un equipo con un
asistente de código reproduce tablas y checks en semanas (la prueba de §1.7). Lo que no se copia son
las reglas auditadas, los datos de costo y las relaciones, y nada de eso vive en el DDL. Además, si
el cliente instala en **su** base, el DDL es visible para su administrador de todos modos: no se
puede entregar «uso» de un esquema que corre en infraestructura ajena sin entregar su forma.

**Lo que el esquema todavía deja ver**, y que el laboratorio da por aceptado al ratificar:

- los comentarios `--` de las migraciones ya **no** citan el maestro (limpiados el 2026-09-25;
  la regla 4 lo sostiene), pero **cinco `COMMENT ON` dentro de la base** conservan referencias
  cortas (`D-01`, `D-14`, `ERP-4B`, `§1.7`): quitarlas es una migración que hay que aplicar a
  producción con gate, y revelan etiquetas, no contenido;
- la lista cerrada de prefijos de folio (`003_folios.sql`) sigue anticipando módulos futuros: es un
  `CHECK` del esquema, y cambiarlo también es migración;
- el diseño multi-tenant por RLS, las tarjetas de agente y la bitácora con traza.

Si algo de eso no debe salir, la alternativa es el modelo A (**no entregar DDL**: el tenant usa el
ERP en una base que opera la casa). Es el disparador de revisión de D-44.

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

1. **Ratificar** (o corregir) esta clasificación y el modelo B: ver «Cómo se ratifica».
2. Con el abogado, cuando llegue el primer cliente: los `[ABOGADO]` y los `[COMPLETAR]` del anexo
   técnico (licencia, cifras del SLA con su forma de medirlas, encargo del tratamiento).
3. **Precio y empaque final** (ERP-6 paso 4: sin plan comercial no hay precios).
4. Si se quiere, un endurecimiento con migración y gate sobre producción: quitar `EXECUTE` a
   `PUBLIC` en las funciones de `erp` (hoy no abre nada, ver `casa/ESTADO-PRODUCCION.md`) y limpiar
   las referencias de los cinco `COMMENT ON`.
