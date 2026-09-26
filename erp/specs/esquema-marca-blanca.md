# Esquema del ERP, marca blanca — Spec

> Compilado con `/goal-compiler` el 2026-09-25. Forma: **LOOP** (un solo contexto: leer BD,
> comparar, reescribir migraciones, validar; sin fan-out real ni criterios distintos por nodo).
> Alcance decidido por el laboratorio: esquema `erp` + todo lo que toca. Entrega: **listo para
> empaquetar**; licencia, precio y publicación quedan fuera (gate humano). Es la **Fase 3B del
> PRP-004**, y el goal continúa por las fases 4-8 hasta cada gate humano (ver INTEGRACION).

## MISION

Este repo es el **boilerplate de producción de marca blanca**: el laboratorio lo usa para
probar, y se empaqueta o se licencia a clientes. Cuando termines, debe existir esta realidad:

1. **Una sola fuente de verdad del esquema del ERP, idéntica a producción.** Lo que corre en el
   Supabase compartido A2ABot (`erp` + roles + funciones + políticas + grants + lo que el ERP
   toque fuera de `erp`) está capturado en migraciones versionadas del repo. Cualquier diferencia
   entre la BD viva y `erp/migrations/` queda **resuelta y documentada**: o el archivo se pone al
   día, o se explica por qué la BD tiene algo que no debe viajar.
2. **Estado de cluster que hoy no vive en ningún `.sql`** (p. ej. `grant rol_exe_fin, rol_swm,
   rol_admin to postgres`, reaplicaciones de 004/005 en orden) queda capturado como migración o
   paso de instalación explícito. Recrear la BD desde cero no debe depender de la memoria de
   nadie.
3. **Marca blanca de verdad.** Cero datos de la casa en lo que se entrega: ni el UUID del tenant
   de la casa (`005_activos.sql` lo trae escrito), ni ref del proyecto Supabase, ni nombres,
   marcas, seeds reales, correos o dominios. El tenant, la marca y cualquier identidad son
   **parámetros de instalación**. Los datos de la casa, si hacen falta para el laboratorio, van
   en un seed aparte que **no** se empaqueta.
4. **Instalable desde cero y probado.** En un Postgres efímero (receta de
   `erp/migrations/README.md`, o una mejor), una instalación limpia con un tenant ficticio deja el
   ERP funcionando: RLS `FORCE` en toda tabla, políticas por `cliente_id`, roles, folios atómicos,
   append-only, y las pruebas de cierre (a)(b)(c)(d) del README en verde. Idempotente: correrla
   dos veces no rompe nada.
5. **Frontera de entrega declarada.** Un documento (dentro de `erp/`) que diga, objeto por objeto
   o por módulo: qué se entrega al cliente, qué es **defendible** y no sale (doctrina §1.7 del
   maestro y D-10…D-12), qué queda como parámetro, y qué necesita el cliente para instalar. Es la
   entrada para que el laboratorio decida licencia y empaque; **no** los decide.
6. **La fábrica lo ve.** Los gates existentes siguen verdes (`npm run validate`,
   `inventario:valida-erp`) y, si cambió algo del esquema de `act`, el inventario lo refleja.

Horizonte: que un cliente nuevo pueda recibir el ERP y tenerlo aislado y operando en su propio
Supabase siguiendo solo lo que dejas escrito, sin tocar la BD de la casa.

## INTEGRACION CON EL PRP-004 (lo que viene después del esquema)

Esta spec **es la Fase 3B** de `.claude/PRPs/PRP-004-erp-al-monorepo-privado.md` (léelo entero:
Gotchas y Anti-Patrones aplican). Al cerrar la 3B, el goal sigue por las fases 4-8 **hasta cada gate
humano y se detiene ahí**, dejando el paquete listo para que el laboratorio diga sí o no:

| Fase | Lo que haces tú | Dónde te detienes (gate) |
|------|-----------------|--------------------------|
| 4 Re-ubicación en catálogo | Leer (solo lectura) las filas `businessos/erp/…` de `erp.act_activo`; ensayo completo en el Postgres efímero sobre la instalación de la 3B: re-ubicar con traza en `sis_bitacora`, mismo nº de folios y mismo `costo_acumulado` antes/después, detector `--dry-run` sin HUÉRFANOS. Dejar el SQL exacto de producción escrito, sin correr. | Diff de filas antes/después pegado. **No se escribe en producción.** |
| 5 Corte de jobs | Runbook con los comandos exactos del servidor (clon con llave de despliegue de solo lectura, cambios de `weekly-jobs.sh` y cron hacia `erp/bin/`) y corrida local de ambos scripts en `--dry-run` desde `erp/bin/`. | **No se toca el servidor.** |
| 6 Retiro en `hermes-os-a2a` | Nada más que listar lo que borraría el PR. | **Bloqueada por la duda abierta 2 del PRP**; no se crea rama ni PR. |
| 7 CDC en `AGENTS.md` | Redactar el diff propuesto (línea del decision tree, declaración C7 en `GOBERNANZA.md` §8) y correr `npm run regresion` y `--trampa` sobre él **en una copia**, sin aplicarlo. | Diff pegado en la conversación **antes** de pedir el sí. |
| 8 Validación final | Tabla de criterios de éxito del PRP: cada uno con evidencia o con el gate que lo tiene pendiente. | — |

Actualiza el PRP al avanzar: marca la 3B cerrada con su evidencia en una línea (como las fases 0-3)
y añade a «Aprendizajes» lo que muerda por el camino.

## LIBERTAD TECNICA

Tú eliges cómo introspeccionar (catálogos `pg_catalog`/`information_schema`, `pg_dump
--schema-only`, management API, lo que sea mejor), cómo comparar, cómo parametrizar (variables de
psql, `current_setting`, plantilla, script de instalación) y cómo organizar las migraciones (si
conviene migrar de `erp/migrations/` a `supabase/migrations/` o convivir, decídelo y justifícalo).
Nada aquí es receta salvo RESTRICCIONES.

## INVESTIGA ANTES DE CONSTRUIR

- Lee `erp/ERP-MAESTRO.md` (§1.7 defensibilidad, Parte IV ERP-0, §4B act), `erp/migrations/README.md`,
  `.claude/PRPs/PRP-004-erp-al-monorepo-privado.md` y `.claude/rules/` que carguen al tocar SQL.
- Mira 2-3 referencias de cómo distribuyen esquemas multi-tenant de marca blanca productos serios
  (instalación parametrizada, separación seed/esquema, migraciones idempotentes) y decide.
- Reafirma el objetivo en una línea antes de cada edición grande.

## DEFINICION DE HECHO (evidencia visible en la conversación)

- **Inventario de la BD viva** pegado: esquemas, tablas, funciones, triggers, políticas, roles y
  grants del alcance, y los objetos fuera de `erp` que el ERP referencia. Lo de `public` que es de
  otras apps: solo listado como candidato, sin traerlo.
- **Diff BD viva ↔ archivos** pegado, con la resolución de cada diferencia.
- **Búsqueda de datos de la casa** en lo entregable (UUID del tenant, ref del proyecto, marcas) con
  resultado **cero** pegado.
- **Instalación limpia en Postgres efímero** con tenant ficticio: output completo pegado, más la
  segunda corrida (idempotencia) y las pruebas de cierre (a)(b)(c)(d) en verde.
- **Diff de esquema instalado-desde-cero ↔ producción** (sin datos) mostrando que son equivalentes
  en el alcance, salvo lo documentado como "no viaja".
- Documento de frontera de entrega creado, con su ruta.
- Por cada fase 4-7 del PRP: su paquete de gate pegado (tabla de INTEGRACION) o el motivo de bloqueo.
- Tabla final de criterios de éxito del PRP-004 con evidencia o gate pendiente, y el PRP actualizado.
- Último output de `npm run validate` en verde.
- Lista de las formas en que esto podría estar mal o incompleto, y cómo las resolviste.

## COMANDO DE VALIDACION

`npm run validate` más la instalación en Postgres efímero. Declara en tu primer checkpoint el
comando exacto de instalación+pruebas (idealmente un script en `erp/bin/` o un `npm run`) y córrelos
tras cada cambio grande, pegando el output.

## RESTRICCIONES REALES

- **La BD compartida es producción y la usan otras apps: SOLO LECTURA.** Cero DDL, cero DML, cero
  `SET ROLE` con escritura contra ella. Todo cambio se prueba en el Postgres efímero. Aplicar algo a
  producción es gate humano y queda fuera de esta tarea.
- **Acceso**: `ERP_LECTOR_DB_URL` en `.env.local` (usuario `erp_lector`, hereda `rol_swm`: lee, no
  escribe, sin BYPASSRLS; verificado 2026-09-25, ve las 22 tablas de `erp`). Es la única credencial
  para producción en esta tarea. No hay `psql` local: úsalo desde `docker run --rm -e
  ERP_LECTOR_DB_URL postgres:16-alpine`. Las filas de `erp` las ves solo con `app.cliente_id`
  fijado (RLS). Si algo que necesitas no se lee con ella, **detente y pídelo al laboratorio**.
- **Nunca `service_role`** para esto (BYPASSRLS, control C7). Nunca imprimas secretos ni cadenas de
  conexión: presencia, largo y a lo sumo 4 caracteres de prefijo.
- No bajar garantías existentes: RLS `FORCE`, append-only, sin `DELETE`, `traza_id NOT NULL`,
  triggers de cuadre y de transición. Si la BD viva tiene algo más débil que los archivos, se reporta,
  no se copia.
- Toda migración nueva pasa primero por la validación efímera (regla del README).
- Licencia, precio, publicación y empaque final son del laboratorio: dejas el insumo, no la decisión.
- No toques skills, prompts, `settings.json`, `.mcp.json` ni `AGENTS.md` (sería CDC, C1).
- Trabaja en una rama propia; no hagas merge.
