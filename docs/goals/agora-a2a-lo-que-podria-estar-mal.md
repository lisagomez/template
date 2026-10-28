# Ágora — lo que podría estar mal, y cómo quedó

> Cada punto con su estado: **arreglado** (con la prueba que lo vigila), **declarado** (es un límite conocido, dicho
> donde se ve) o **del laboratorio** (decidirlo no me toca). Fecha: 2026-10-28.

| # | Lo que podría estar mal | Estado | Cómo quedó |
| --- | --- | --- | --- |
| 1 | Una función `security definer` que decide con `current_user` o `confiable()` deja pasar a cualquiera (dentro, siempre vale «la base») | **arreglado** | `rol_que_llama()` / `llama_la_base()`; la comprobación estructural recorre `pg_proc` (sabotajes S14 y S15) |
| 2 | Un `if` con una comparación nula no rechaza (otra organización aplicaba una propuesta ajena y leía topes ajenos) | **arreglado** | `coalesce(…, false)`; «nadie de otra organización aplica una propuesta de Golfo Norte» en la suite del núcleo |
| 3 | Un parámetro que se llama como una columna la sombrea (`origen`, `clave`, `estado`) | **arreglado** | Prefijos `p_`; lo cazó la re-verificación independiente de la póliza y la suite del vigía |
| 4 | El nombre de un socio decidía la intención: «paga la factura de fletes del golfo» caía en **revocar** | **arreglado** | Regla: ningún ejemplo de una intención que escribe lleva nombre propio; prueba estructural con mutación. Corpus 2 a ciegas: 0 irreversibles no pedidas |
| 5 | El enrutador acierta 74,2 % (corpus 2) y 58,7 % (corpus 1): una de cada cuatro peticiones termina en «no lo sé» | **declarado** | El modo de fallo es seguro (pregunta o dice que no sabe, sin escribir). Subirlo sin LLM es trabajo de ejemplos con un corpus nuevo cada vez; con LLM es un CDC (C8) |
| 6 | En el corpus 2, «reserva un vuelo a monterrey» cae en `calendario.reserva` (del módulo compartido del calendario) | **declarado** | En Ágora esa intención no tiene manejador: tras el «¿lo hago?», la capa responde «no está conectado aquí». Corregirlo es de los ejemplos de `tools/calendario` (lo ven otros productos) |
| 7 | El clic humano del freno lo comprueba el navegador (`isTrusted`): el servidor no ve el gesto | **declarado y mitigado** | Lo que el servidor sí puede, lo exige la base: el testigo (cita de esta persona, de un solo uso, ≤ 15 min). Sin acciones del servidor que cierren o revoquen con una cita libre |
| 8 | La persona puede atestiguar cualquier texto suyo (con las herramientas del navegador) | **declarado** | Atestigua lo suyo, con su sesión y su rol: es su propia decisión. Ni un agente, ni la Puerta, ni el asistente pueden atestiguar (sin permiso en la base, sabotaje K6) |
| 9 | El freno no se confirma con el teclado: brecha de accesibilidad | **del laboratorio** | La declara la capa (`MAPA.md` §2.10, §6); una vía accesible que no sea un Enter a destiempo es trabajo de la capa |
| 10 | Las funciones definer escriben en tablas con RLS forzada; en el laboratorio su dueño es superusuario | **declarado (no medido en Supabase)** | En Supabase, el dueño de las funciones necesita `BYPASSRLS` o políticas para él. Se mide al migrar, no antes |
| 11 | Las suites contra Postgres real (`npm run agora:pg`) no están en `validate`: necesitan Docker | **del laboratorio** | `validate` corre las mismas suites en PGlite. Meter `agora:pg` al padrón, inactivo y con su motivo, es un CDC (propuesto); entrada en `riesgos-propuesta.md` |
| 12 | El coordinador usa un modelo determinista: no se midió con un modelo real ni contra inyección real | **del laboratorio** | Texto de afuera delimitado `<<<DATO … DATO>>>`, guardia de gasto antes de llamar y sin clase de routing. Encender un modelo es CDC (C8) más la revisión del C4 |
| 13 | El vigía suspende al socio que cambió su tarjeta, aunque el cambio sea legítimo | **declarado (falla cerrado)** | Suspender se deshace (la Propietaria reactiva) y queda el aviso con el motivo; preferible a dejar entrar una tarjeta que nadie revisó |
| 14 | El tipo de cambio es un fixture ficticio de Banxico FIX | **declarado** | Con fuente, fecha y URL; leer el FIX real es dato público, pero sale a la red: queda para cuando el laboratorio lo pida |
| 15 | «Horas a la decisión» marca 0 h en el laboratorio | **declarado** | La siembra decide en el mismo instante en que propone; con uso real la cifra sale de las filas |
| 16 | La prueba «cuadra con el libro» de la pantalla de métricas lee `v_centro_periodo`, que también alimenta `sem_libro` | **declarado** | La independiente está en la suite (las filas de origen, al centavo; sabotajes M1 a M5). La de la pantalla es de sanidad |
| 17 | El plan anunciaba «cierre pendiente» de un mes ya cerrado | **arreglado** | Pendiente = mes vencido, con movimiento en el libro y sin cerrar (el criterio del vigía) |
| 18 | El menú de la capa muestra «Buzon» y «Metricas», sin acento | **del laboratorio** | La capa nombra la pantalla por el segmento ASCII de la ruta; un título por pantalla en el enchufe sería un cambio genérico de la capa |
| 19 | El alta de la organización guía, pero no crea una organización nueva | **declarado** | Crear un inquilino es un trabajo de plataforma (`service_role`, C7) que no se construyó; cada paso enseña la vía controlada de su decisión |
| 20 | Los recorridos de evidencia (`e2e-capa.ts`, `capturas.ts`) mueven la base del laboratorio | **declarado** | Lo dicen en su cabecera; `npm run agora:laboratorio` la vuelve a sembrar |
| 21 | El testigo del freno se poda a las 24 h solo cuando la persona vuelve a atestiguar | **declarado** | Solo guarda huellas; una poda programada es una línea cuando haya uso real |
| 22 | La persona del laboratorio sale de una cookie («Ver como») | **declarado** | Solo con `AGORA_LABORATORIO=1`; en producción sería la sesión de Supabase |
| 23 | El recorrido de la capa escribe por defecto en la carpeta de evidencia de otro goal | **arreglado aquí** | Se corre con `--capturas docs/goals/agora-a2a-capturas/recorrido`; lo que escribió en la otra carpeta se restauró |
