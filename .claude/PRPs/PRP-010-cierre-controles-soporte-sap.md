# PRP-010: Cierre de controles de Soporte SAP antes de firmar la AISIA y el C3

> **Estado**: APROBADO (2026-10-07) por el laboratorio, en sesión: «apruebo el PRP con tus recomendaciones; el
> build como H-30». DP-1 a DP-7 quedan como su recomendación. La fase 0 está en el PR #226.
> **Fecha**: 2026-10-07
> **Proyecto**: Soporte SAP (`productos/soporte-sap.json`), más una fase que toca a todo despliegue del template
> **Spec**: no hay. El QUÉ se acuerda aquí: es el inventario de hallazgos de abajo, que sale de dos revisiones
> independientes contra el código (2026-10-05 y 2026-10-07). El PRP-008 sigue siendo el plan del producto; este
> PRP cierra lo que el PRP-008 y la AISIA afirman y el código no cumple.
> **CDC aplicable**: **sí**, en dos sitios, y en ninguno más:
> - la **plantilla de producto v3** (`productos/PLANTILLA.md` y `verifica:productos`), en la fase 3: radio
>   plantilla;
> - el **padrón de gates** (`.claude/gates.json`): `configura:deploy` dentro de `predeploy` (fase 3) y, si no cabe
>   en un gate existente, la casa de la prueba de la imagen (fase 0): radio padrón.
>
> Ningún skill, prompt, modelo ni `routing-modelos.json` cambia. Cada CDC va con su propuesta fuera del registro y
> la firma la escribe el laboratorio.

---

## Objetivo

Que cada frase de la AISIA y del C3 de Soporte SAP sea verdad sobre el código de `main`, con una prueba que se
ponga roja si el control desaparece, y que el laboratorio las firme con esa evidencia delante. De paso: que ninguna
imagen del template lleve `.env.production` dentro, y que el servidor de cada instalación se elija contra un perfil
que declara el producto, igual en el laboratorio que en la máquina de la consultora.

## Por Qué

| Problema | Solución |
|---|---|
| La AISIA y el C3 prometen controles que el código no tiene. Firmarlos así convierte intenciones en hechos firmados, el error de la v1 del C3 | cerrar cada hallazgo con código y prueba negativa, o corregir la frase, o declarar la brecha; y firmar después |
| Cinco de los daños caen sobre terceros (datos de empleados, nómina, dinero del SLA, otros tenants, el secreto del N3): ninguna firma los cubre | para esos no hay «brecha declarada»: o el control los cierra o el producto no ofrece la función |
| Las pruebas pasan (151/151, sala 18/18, 9/9 sabotajes) y aun así hay huecos: prueban la función, no el camino real ni el rol real | un arnés de sabotajes para Soporte SAP como el de la sala, cuyas filas ejercen el camino del producto y el rol de la base |
| `.env.production` entra en la imagen de la app, con `service_role` y todas las llaves del servidor, y Next lo carga al arrancar | fuera del contexto de build, con una prueba de que la imagen ya no lo trae |
| El VPS ya no es Hetzner (D12) y la consultora puede querer su propio servidor | un perfil de despliegue que el producto declara y contra el que se mide cualquier máquina; no una lista de proveedores |

**Valor de negocio**: sin la AISIA y el C3 firmados, Soporte SAP no sale del laboratorio ni entra una consultora
real. Es el primer producto vendible del laboratorio. La fase 0, además, protege a todo despliegue del template,
incluido el piloto del buzón de CFDI, cuyo primer documento real todavía no ha llegado.

## Qué

### Las dos revisiones

- **Revisión 1 (2026-10-05)**: un agente independiente revisó la AISIA v2 y el C3 v3 dentro del goal de firmas
  (rama `soporte/firmas`). Encontró 22 hallazgos, dos de ellos «cambian el alcance». El goal se detuvo por su red de
  seguridad y la rama quedó sin mergear.
- **Revisión 2 (2026-10-07)**: dos revisores independientes, uno para la AISIA y otro para el C3, contra `main`.
  Los hallazgos más graves se re-verificaron con sondas en una base efímera.

Este inventario es la unión de las dos, sin duplicados. **Infirmable** = el daño cae sobre quien no firmó (límite
de C5): solo admite `código`. **Resolución propuesta**: `código` (control + prueba negativa + sabotaje), `texto`
(la frase decía de más), `brecha` (queda abierta y se declara). La columna «Rama» dice si `soporte/firmas` ya lo
arregló en parte.

### Inventario de hallazgos

**Datos personales y lo que lee el laboratorio**

| Id | Hallazgo | Rev. | Infirmable | Resolución propuesta | Rama |
|---|---|---|---|---|---|
| H-01 | El agente escala por su cuenta y firma `escalada_por` con cualquier nombre. El laboratorio pasa a leer título, descripción y campos extraídos (RFC y montos del CFDI). En el runtime, toda incidencia con regla llega al N1 sin que la consultora escale nada. **Confirmado con sonda** | 1 y 2 | sí | código: escalar es decisión de la consultora, a su nombre; los campos extraídos, bajo el acceso motivado (DP-3) | **cerrado en la tanda 1a** |
| H-02 | El tope de 72 h del acceso a originales se salta con un `creado_en` futuro: **8 832 h**, confirmado con sonda. El acceso es por cliente, no por incidencia, y no se puede revocar | 1 y 2 | sí | código: la base fija `creado_en`, el tope se mide contra `now()`, hay revocación y una prueba con `creado_en` futuro | **cerrado en la tanda 1a** |
| H-03 | La base acepta texto crudo en `ss_caso_sandbox` y datos personales en `senales` de cuarentena, y el laboratorio lee los dos. Nada liga el sandbox con el veredicto del anonimizador | 1 y 2 | sí | código: el agente no escribe en el sandbox; `senales`, solo del vocabulario fijo | **cerrado en la tanda 1a** (segundo cerrojo; ver nota) |
| H-04 | El anonimizador falla abierto ante formas nuevas: 5 de 14 frases entran con el dato («pepe gonzalez de almacen», «jgarcia», «doña Lupita», «El chofer Ramiro», «rosa punto elena en gmail»). La revisión humana de la cuarentena no existe | 2 | sí | código: las 5 al fixture permanente y el detector arreglado. Texto: «fail-closed» promete de más, y la cuarentena es definitiva hasta D14 (DP-8) | **código cerrado** en la fase 2 (el texto, en la fase 4) |
| H-05 | Cualquier consultor lee fila por fila las horas de sus colegas y el actor de cada evento. El seudónimo es un md5 sin sal que el laboratorio puede revertir con `ss_miembro` | 1 y 2 | — | código: cada quien sus filas más un agregado; seudónimo con sal | **cerrado en la tanda 1d** |

**Decisiones humanas e integridad**

| Id | Hallazgo | Rev. | Infirmable | Resolución propuesta | Rama |
|---|---|---|---|---|---|
| H-06 | En la sala en SQL, una persona de un tenant aprueba el plan de otro: `sala_aprobaciones` no ata `mensaje_id` a `tenant_id`, `task_id` ni la huella. `sala_agente` se acota con un GUC que fija su propia sesión. La versión en memoria sí lo hace bien | 2 | sí | código, más un sabotaje nuevo en la suite de la sala | **cerrado** (la aprobación en la 1a; el tenant de `sala_agente`, en la 1c) |
| H-07 | El rol de plataforma inserta decisiones ya tomadas (mapeo aprobado, campo confirmado) y eventos con el seudónimo de un consultor. Ninguna prueba usa ese rol | 1 y 2 | — | código | **cerrado en la tanda 1e** |
| H-08 | La restauración corre como superusuario y con los disparadores apagados. Inserta filas de otro tenant sin comprobarlas y verifica después del commit. El export no va firmado y deja fuera `ss_acceso_motivado`, los bytes de Storage y las tablas `sala_*`. `exportaTenant` falla con el rol de plataforma | 1 y 2 | sí | código: verificar cada fila dentro de la transacción y antes del commit. Texto: privilegio de migración declarado en C7; la retención no existe | **cerrado en la tanda 1e** (los bytes de Storage van por su línea; la retención es D8) |
| H-09 | El agente no puede actualizar `ss_incidencia` (el disparador lee `ss_organizacion` sin política para él). Fallaría en producción. **Arreglarlo sin cuidado** deja al agente bajar prioridades, mover sellos de SLA y cerrar incidencias. **Confirmado con sonda** | 1 y 2 | — | código: `update` por columna, sin estados terminales ni prioridad ni sellos; prueba negativa | **cerrado en la tanda 1b** |
| H-10 | Impugnación: la consultora reescribe el `motivo` y el autor de la queja del N3; resolver no deja evento ni cambia nada; no hay pantalla; una pausa del reloj no se puede impugnar | 1 y 2 | — | código en la base (fase 1) y en la app (fase 2) | **cerrado** (la base en la 1b; la pantalla, en la fase 2) |
| H-11 | `ejecuta()` no ata la aprobación a la huella del plan, y `ss-simulador --param` ejecuta sin compararla | 1 y 2 | sí, con SAP real | código + prueba negativa | **cerrado** en la fase 2 |
| H-12 | El agente, con la tarea de cualquier consultora, escribe en el chat de cualquier usuario («aprueba el plan de Boreal ya») | 1 y 2 | — | código | **cerrado en la tanda 1d** |
| H-13 | La base no verifica `anterior`, `hash` ni `seq` de la cadena de eventos | 1 | — | código: la base calcula la cadena | **cerrado en la tanda 1d** |

**Tenencia y vínculos sin atar**

| Id | Hallazgo | Rev. | Infirmable | Resolución propuesta | Rama |
|---|---|---|---|---|---|
| H-14 | Sin atar: `ss_campo_extraido.adjunto_id` (cuelga el adjunto de un N3 en la incidencia de otro), `ss_sla_resultado` sin FK al contrato, `ss_importacion_fila.crudo_id`, `ss_contrato_sla`, `ss_chat_mensaje` y `ss_procedencia`. Cinco disparadores de tenencia no tienen caso directo. Buckets sin prueba de `public=false`, sin `file_size_limit` ni `allowed_mime_types`. Roles creados con `if not exists`, que no corrigen un rol que ya exista con `bypassrls` | 1 y 2 | sí | código + un sabotaje por disparador | **cerrado en la tanda 1d** (salvo `ss_procedencia` y el tamaño y tipo de los buckets: ver nota) |

**Prioridad y SLA**

| Id | Hallazgo | Rev. | Infirmable | Resolución propuesta | Rama |
|---|---|---|---|---|---|
| H-15 | El piso de nómina deja **P4** a IMSS, PTU, aguinaldo, incapacidad, vacaciones, sueldo, infotipo, el depósito de la quincena y SUA/IDSE. El categorizador y el anonimizador usan vocabularios distintos. La base no impone el piso: el N3 inserta la prioridad que quiera y el consultor la cambia sin motivo ni evento. **Confirmado con sonda** | 1 y 2 | sí | código: un solo vocabulario, el piso en la base y el cambio de prioridad con motivo y evento | **cerrado en la tanda 1b** |
| H-16 | El SLA es manipulable por las tres partes. El N3 crea con `creada_en` pasado, P1 y estado resuelta. El consultor reescribe `creada_en` y `primera_respuesta_en`. El agente inserta `ss_sla_resultado` con `cumple=true` y un contrato inventado. La ventana de ±5 min la elige quien escribe. La prueba de recálculo es circular | 1 y 2 | sí (dinero ajeno) | código: un job calcula el resultado desde los eventos; la base fija las fechas; tipos de evento por rol | **cerrado** (la base en la 1b; el job, en la fase 2) |
| H-17 | La primera respuesta la marca la máquina (al anonimizar o al mandar a la sala), así que una P1 a 60 min se cumple siempre. Ni el contrato ni la plantilla definen «respuesta» | 1 y 2 | sí | código + definición en el contrato (DP-4) | **cerrado** (la base en la 1b; el runtime, en la fase 2) |
| H-18 | «P1 y P2 nunca se cortan por presupuesto» es una función que nadie llama. El aviso no llega a nadie. Nadie lee `ss_presupuesto`; el tope de OCR vive en memoria y sin periodo | 1 y 2 | sí | código: cablear en el runtime y en el enjambre, aviso registrado, tope leído de la base con su periodo | **cerrado** en la fase 2 |

**Núcleo de conocimiento**

| Id | Hallazgo | Rev. | Infirmable | Resolución propuesta | Rama |
|---|---|---|---|---|---|
| H-19 | `generaliza` no la llama nadie. El chat propone al núcleo el texto crudo del experto, con alcance `nucleo` **por defecto**. La base acepta propuestas sin generalizar. `generaliza` no cubre `Y…`, minúsculas, `/ACME/…`, `BUKRS 2000`, «Sociedad: 2000» ni «centro 1010» | 1 y 2 | sí | código: «a medida» por defecto, `generaliza` en el camino y un banco adversarial escrito por otro. Texto: ayuda, y el control es la firma del superadministrador | **cerrado** en la fase 2 (el texto, en la fase 4) |
| H-20 | Los veredictos salen de `tools/soporte-sap/src/laboratorio/matriz.ts`, no de `tools/conocimiento`: un commit cambia un veredicto sin gate de firma | 1 | — | texto + brecha | — |

**Superficie, abuso e inyección**

| Id | Hallazgo | Rev. | Infirmable | Resolución propuesta | Rama |
|---|---|---|---|---|---|
| H-21 | **El control central del C3 no existe fuera de las pruebas.** El token de tarea solo se verifica en `pruebas/_base.ts`; es un HMAC propio, no un JWT. Con `set_config` dentro de la consulta, un token de A lee B. «Sin conexión directa» es papel. El secreto de firma no tiene variable, rotación ni chequeo | 1 y 2 | sí | código: verificar la firma en la base (DP-2) | **cerrado en la tanda 1c** (cargar el secreto al desplegar es paso humano) |
| H-22 | Un PDF de unos 300 KB tumba la app de todos los tenants y productos. La capa 0 corre en el proceso de la app y el inflado no tiene tope | 1 | — (O4) | código: tope de bytes inflados, medido sobre el corpus real del extractor | — |
| H-23 | Los adjuntos se cuentan por lote, no por incidencia. El tope de OCR se mira antes de leer. El N3 sube directo al bucket sin validación de bytes. `formData()` carga todo en memoria | 1 y 2 | — | código | **cerrado** en la fase 2 |
| H-24 | `delimitaDocumento` no se usa. Los parámetros del plan (usuario SAP, BP, RFC) salen del texto no confiable. La prioridad sube con palabras clave, y el banco de inyección no las toca | 1 y 2 | — | código mínimo (delimitar) + brecha O1/O2 declarada | **cerrado** en la fase 2 (la brecha, declarada en la matriz) |
| H-25 | La prueba del 404 no mira el GET, y el GET devuelve la vista de cualquier rol, superadministrador incluido. La ruta devuelve `e.message`. Los logs no están inventariados | 1 y 2 | — | código + prueba que invoca los handlers | **código cerrado** en la fase 2 (la vista de cualquier rol y los logs: texto, fase 4) |
| H-26 | `configura:deploy` no está en `predeploy`. El SDD §16 cita una prueba suya que no existe en `main` | 2 | — | CDC del padrón (fase 3) | **cerrado** en la fase 3 (con el CDC del padrón firmado) |

**Pantalla y métricas**

| Id | Hallazgo | Rev. | Infirmable | Resolución propuesta | Rama |
|---|---|---|---|---|---|
| H-27 | El riesgo de baja sale sin su fórmula ni su umbral. La mitigación agrava el daño: el N3 ni lo ve ni lo puede discutir | 1 y 2 | — | código (de la rama) + texto | **sí** |
| H-28 | El FODA no lleva confianza con pocos datos, y el caso «baja» no tiene prueba. El recorrido no comprueba el aviso de proyección. La vista «por categoría y complejidad» no existe. No hay tamaño mínimo de grupo | 2 | — | código para la confianza; texto para lo demás | **código cerrado** en la fase 2 (lo demás: texto, fase 4) |

**La imagen (todo el template)**

| Id | Hallazgo | Rev. | Infirmable | Resolución propuesta | Rama |
|---|---|---|---|---|---|
| H-29 | `.env.production` entra en la imagen. `.dockerignore` excluye `.env` y `.env*.local` pero no `.env.production`, el `Dockerfile` hace `COPY . .` y el modo standalone de Next lo copia (`node_modules/next/dist/build/index.js`, `writeStandaloneDirectory`) y lo carga al arrancar. Efectos: `service_role`, `SS_PG_PASSWORD` y las llaves del despacho (`scripts/despacho/llaves.mjs` escribe ahí) quedan en el sistema de archivos de la app; y variables que el compose **no** pasa, como `SOPORTE_SAP_LABORATORIO=1` o los tokens de otras rutas, llegan al runtime. Eso tumba la premisa de la revisión de rutas públicas (#209): «la app solo recibe lo que le pone el compose». Afecta también a `docker-compose.despacho.yml`, que usa el mismo `Dockerfile` | 2 | sí | código + prueba (fase 0) | **cerrado en #226** |
| H-30 | **La imagen de la app no se construye desde un clon limpio, tampoco en `main`.** Se encontró el 07/10 al construir la imagen real desde un `git archive` para la evidencia de la fase 0, y tiene tres capas: (1) `tools/*/dist` está en `.gitignore` y `npm run build` no lo compila (solo `prepara:gate`, por `pretypecheck`): Turbopack da 427 errores; (2) `.dockerignore` excluye `.claude`, y `src/lib/ai/routing.ts` importa `.claude/routing-modelos.json`; (3) el typecheck de `next build` incluye `tools/dictado/src`, y `@tu-scope/voz` no está en la imagen. `npm run deploy` falla en un servidor recién clonado, incluido el despacho del buzón | 07/10 | — | código + prueba (fase 0b) | **cerrado en la fase 0b** |
| H-31 | **La imagen final arrastra archivos del repo.** El file tracing de Next copia a `.next/standalone` lo que las rutas tocan con `fs`, y en la imagen quedan `src/` (3 MB de fuente), `tools/` (4.3 MB), `docs/`, `trayectorias/` (60 archivos de datos de sesiones), `inventario/`, `productos/` y `erp/` (`casa/huellas.txt`, `entrega.json`, referencias de roles y servidor). La cabecera del `Dockerfile` dice «la imagen final NO contiene código fuente». En el despacho la imagen vive en la máquina de un tercero, y lo defendible del ERP «no sale» (§1.7). Salió al arrancar por primera vez la imagen de la fase 0b; en `main` pasa igual | 07/10 | — | código: qué ruta necesita cada archivo en tiempo de ejecución, y fuera lo demás (`outputFileTracingExcludes`) + prueba que inspeccione la imagen | **cerrado** (ver «H-31, hecho») |
| H-32 | **El importador seudonimiza los nombres de consultores sin sal**: `src/mapeo.ts:154` da `usr-` + `sha256(consultora|nombre)`, y quien adivine un nombre lo revierte. Lo mismo que H-05, pero en el código que importa los exportes de tickets, no en la base | 07/10 | — | código (fase 2): la sal de la base, o una sal propia del importador | **cerrado** en la fase 2 (sal propia: `SS_SAL_IMPORTADOR`) |

**Texto y cifras** (fase 4, todo `texto`):

- 22 tablas, no 20; cuatro roles más `sala_agente`, no tres; 277 casos con 155 sembrados, no 92; los «56 intentos
  rechazados» son 56 comprobaciones, varias positivas.
- El encabezado del C3 dice v2 con contenido v3; S1–S6 + S2b frente a S1–S7; `controlDeCosto()` no existe.
- El SDD §12 dice que el acceso motivado lo otorga el superadministrador, y el SQL dice la consultora. El SDD §13
  dice «se borran también en las copias», contra un destino de solo agregar.
- Contradicción interna del contrato N2–N3 (§11 frente a la línea del plan que pide aprobación); el aviso de
  privacidad al N3 sigue `[POR DECIDIR]`.
- Faltan D7, D10 y D12 en la AISIA §1 y §2. `OCR_RESPALDO=mistral` puede encenderse por despliegue, por encima de
  `motor: 'local'`.
- La AISIA §5 deja fuera infirmables: el secreto del N3, la prioridad de nómina, el SLA y la restauración que toca a
  otros tenants. «Corte por presupuesto» sale como reversible.
- Daños sin listar en la AISIA §2: fatiga del aprobador sin mitigación propia, reidentificación por grupo chico,
  primera respuesta automática, pausa unilateral, la consultora que altera la impugnación y la P1 sin evidencia
  leída al llegar al tope de OCR.
- Al C3 le faltan **Flujos** y **Priorización** (plantilla, paso 3 y final). El PRP-008 todavía dice «EN EJECUCIÓN».

### Decisiones del laboratorio

**Decididas el 2026-10-07: todas como su recomendación.** DP-6 sigue sin respuesta sobre los hechos. H-30 sugiere que
ninguna imagen se ha construido desde un clon limpio; si existe un servidor, su imagen se reconstruye tras el #226.

| Id | Decisión | Recomendación (decidida) |
|---|---|---|
| DP-1 | Qué hacer con la rama `soporte/firmas` (05/10): ya trae los topes de la ingesta, la fórmula del riesgo de baja en pantalla, las pruebas de superficie y la matriz de trazabilidad con sabotajes | **rebasarla sobre `main` y usarla de base**: la matriz es el arnés de sabotajes que falta. Su estado «probado» no se hereda: se re-mide (ver Gotchas) |
| DP-2 | El alcance del token de tarea (H-21) | **verificar la firma dentro de la base**: `consultora_de_tarea()` comprueba el HMAC con un secreto que solo lee una función `security definer`. Así el control no depende de una pasarela que no existe. Alternativa: dejarlo como texto y brecha («sin control fuera de una pasarela no construida»), lo que deja abierto un infirmable |
| DP-3 | Quién escala al laboratorio (H-01) | **solo la consultora, a su nombre**: el plan del agente va primero al consultor, y el laboratorio ve solo lo que la consultora escala. Alternativa: el agente escala, pero al N1 llega anonimizado y sin campos extraídos |
| DP-4 | Qué cuenta como primera respuesta (H-17) | **solo un mensaje de una persona al N3**: las acciones de la máquina no cuentan. Va al contrato; las cifras siguen siendo de D13 |
| DP-5 | Qué lleva la plantilla v3 | **solo `despliegue`**: `retencion` y `salida` siguen la recomendación de B-6 y entran con el siguiente manifiesto. `despliegue` entra con la regla vigente, porque Soporte SAP lo tiene (B-3 no se toca) |
| DP-6 | ¿Hay algún servidor desplegado con este `Dockerfile`, incluida la máquina de un despacho? | si lo hay, se reconstruye la imagen tras la fase 0. Las llaves se rotan solo si la imagen salió de ese servidor (no hay `docker push` en el repo) |
| DP-7 | La revisión humana de la cuarentena (H-04) | **texto**: la cuarentena es definitiva y nadie la revisa hasta D14. Falla seguro. Construir el flujo es una feature, no un cierre |

### Criterios de Éxito

- [ ] La imagen de la app, construida con un `.env.production` sembrado, **no contiene ningún `.env*`** fuera de los
      `.example`. La app en marcha ve solo las variables que le pasa el compose. Hay una prueba que se pone roja si
      vuelve a entrar (fase 0)
- [ ] La imagen de la app se construye desde un clon limpio, sin pasos a mano, y una prueba lo vigila (fase 0b, H-30)
- [ ] Cada hallazgo con resolución `código` tiene una prueba negativa que pasa en verde sin sabotaje y cae con su
      sabotaje, y la corre un gate. Las tres sondas confirmadas el 07/10 (H-02, H-01 y H-06) quedan como pruebas
      permanentes
- [ ] **Ningún hallazgo infirmable termina como `brecha`.** Se cierra en código o el producto deja de ofrecer esa
      función, y la AISIA lo dice
- [ ] Cada fila del arnés de sabotajes ejerce el **camino del producto** (runtime, CLI o rol real de la base), no
      solo la función aislada
- [ ] `configura:deploy` mide la máquina contra el perfil `despliegue` del manifiesto: dice si cabe el tamaño
      contratado, compara la región declarada con D10 (y dice «pendiente de D10» mientras siga abierta, nunca
      «cumple») y avisa si falta el destino de respaldo, sin imprimir llaves. Corre en `predeploy`
- [ ] `verifica:productos` en verde con la plantilla v3 y siembras nuevas para `despliegue`
- [ ] La ficha de servidor por consultora se ve en la pantalla del laboratorio, con captura de Playwright, y no dice
      «apto» sin la restauración probada en esa máquina (GATE 3)
- [ ] La AISIA v3 y el C3 v4: cada frase tiene su fila en la matriz con estado `probado`, `brecha` o `depende`. Una
      **tercera revisión independiente** no deja ninguna afirmación contradicha sin resolver
- [ ] `npm run validate` en verde **después** del último commit; `npm run regresion` en verde en cada CDC
- [ ] Ninguna firma escrita por el agente

### Comportamiento Esperado

1. El laboratorio aprueba este PRP y decide DP-1 a DP-7.
2. La fase 0 sale primero, en su propio PR: la imagen deja de llevar secretos en todo el template. La fase 0b, justo
   después: la imagen se construye desde un clon limpio.
3. La base y la app cierran sus huecos; cada cierre deja una prueba negativa y un sabotaje en el arnés.
4. El manifiesto declara el perfil de servidor. `configura:deploy` mide contra él cualquier máquina, sea del
   laboratorio o de la consultora, y la pantalla del laboratorio muestra la ficha de cada instalación.
5. Se reescriben la AISIA v3 y el C3 v4. Un revisor que no escribió nada intenta romperlos, y lo que encuentra se
   resuelve.
6. El laboratorio abre el kit de firma: cada afirmación con su control, su prueba, su sabotaje y el resultado de
   hoy. Firma él. Después, el BUSINESS_LOGIC del producto y la fila del índice cambian de estado.

---

## Contexto

### Referencias

- `productos/soporte-sap.json` y `productos/PLANTILLA.md` (v2), con `scripts/verifica-productos.mjs` (patrón de
  siembras)
- `src/features/soporte-sap/BUSINESS_LOGIC.md`: el contrato del producto, con la firma pendiente
- `docs/goals/soporte-sap-AISIA.md` (borrador v2) y `.claude/PRPs/PRP-008-soporte-sap.md` §Gobernanza (C3 v3)
- `docs/SDD-soporte-sap.md` §12 (esquema), §13 (respaldo), §14 (estimado S/M/L), §15 (despliegue en cualquier VPS)
  y §16 (seguridad)
- `docs/goals/soporte-sap-informe-a.md` (D1–D15) y `soporte-sap-informe-b.md` §7 (B-3 y B-6)
- `tools/soporte-sap/migraciones/propuesta-soporte-sap.sql` y `tools/sala-a2a/migraciones/propuesta-sala-a2a.sql`:
  propuestas validadas en efímero, **no aplicadas a ninguna base**
- `tools/soporte-sap/pruebas/_base.ts`, `_aislamiento.ts`: el arnés en PGlite. `tools/sala-a2a/pruebas/sabotajes.ts`:
  el patrón de sabotajes (lo corre `prueba:tools`)
- Rama `soporte/firmas`: `docs/goals/soporte-sap-firmas.md` (spec del goal), `tools/soporte-sap/firmas/matriz.ts`
  (la matriz), `evidencia/firmas.ts`, `pruebas/{firmas,superficie,riesgo-de-baja}.ts`
- `tools/extractor-documental/src/pdf-flujos.ts`: el inflado sin tope (H-22). Es componente del buzón y del estudio
  pymes
- `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `docker-compose.despacho.yml`, `scripts/configura-deploy.mjs`,
  `scripts/despacho/{reglas,llaves}.mjs`
- `docs/DEPLOY-HETZNER.md` («Que servidor necesitas» y el anexo del despacho) y `docs/FASE0-INFRAESTRUCTURA.md` §9
  (niveles de respaldo, append-only y Object Lock)
- `.claude/gates.json` (perfiles `validate`, `predeploy`, `cdc`) y `.claude/gobernanza/GOBERNANZA.md` §2 (radios del CDC)

### Arquitectura propuesta

No hay feature nueva: es cierre sobre lo que existe.

```
tools/soporte-sap/
├── migraciones/propuesta-soporte-sap.sql   # fase 1: los huecos de la base (sigue siendo propuesta)
├── src/                                     # fase 2: el cableado
├── firmas/matriz.ts                         # de la rama: la matriz, con filas por camino real
└── pruebas/                                 # pruebas negativas y sabotajes (los corre prueba:tools)
tools/sala-a2a/migraciones/propuesta-sala-a2a.sql   # fase 1: H-06
tools/extractor-documental/src/pdf-flujos.ts        # fase 2: H-22
src/features/soporte-sap/                            # fase 2: impugnación, riesgo de baja; fase 3: ficha de servidor
productos/{PLANTILLA.md,soporte-sap.json,ventas-whatsapp.json}  # fase 3: plantilla v3 (CDC)
scripts/configura-deploy.mjs (+ un módulo de perfil)            # fase 3
.dockerignore · Dockerfile                                       # fase 0
```

**El perfil de despliegue (fase 3).** El producto declara **requisitos**, no proveedores. Las tablas de planes
envejecen sin que nadie lo note, y el repo ya lo aprendió: `configura:deploy` no tiene tabla de planes a propósito.

```json
"despliegue": {
  "modos": ["gestionado", "despacho"],
  "tamanos": { "fuente": "tools/soporte-sap/medicion/estimado.json", "S": "…", "M": "…", "L": "…" },
  "exige": ["region-segun-D10", "respaldo-inmutable-fuera-de-sitio", "80/443", "docker"],
  "opera": "por decidir (D3): laboratorio | consultora"
}
```

- **La selección es un dato de cada instalación, no código.** En `.env.production` van el proveedor y la región
  como texto libre («el mío» es lo normal) y el tamaño contratado. Alimentan el inventario y la lista de terceros
  de la AISIA, pero no deciden el despliegue: eso sigue saliendo de medir la máquina.
- **El respaldo, por protocolo**: un destino compatible con S3 y con bloqueo de objetos. El proveedor se reduce a
  una URL y unas llaves; no hay código por proveedor.
- **La ficha de servidor** en la pantalla del laboratorio, una por consultora: el perfil, la última medición, las
  tres preguntas sobre snapshots del SDD §13 con su respuesta escrita y si ya se probó una restauración en esa
  máquina. **No crea servidores**: eso es un cobro, pasa por gate humano y solo se automatiza después de hacerlo
  tres veces a mano.
- **Si la consultora pone su servidor**: quien tiene root lee todo y, en modo despacho, la base entera, sin que la
  RLS lo impida. Eso va al C3 v4 y al contrato. La restauración se prueba en su máquina, y D3 deja de ser teórica.

### Modelo de datos

No se aplica nada a ninguna base: los cambios van en las dos propuestas SQL y se validan en PGlite efímero, como en
la corrida A. Los cambios previstos son restricciones, disparadores, políticas, `grant` por columna y, si un control
lo exige (el registro del aviso de presupuesto, la revocación de un acceso), alguna columna o tabla. **Toda tabla
nueva entra al inventario del §4 del `BUSINESS_LOGIC.md` del producto en la misma fase**, con RLS `enable` + `force`
y su prueba de aislamiento.

---

## Gobernanza

### Modelo de amenazas (C3) de este PRP — *¿quién nos ataca?*

- **Activos que toca**, por daño:
  1. los secretos del servidor (`service_role`, `SS_PG_PASSWORD`, las llaves del despacho, el secreto de los tokens
     de tarea y las llaves del destino de respaldo, que son nuevas);
  2. la integridad de los controles mismos: un arreglo que abre otro hueco (H-09 es el ejemplo);
  3. lo que el laboratorio firma;
  4. la residencia de los datos (la región declarada).
- **Fronteras que cruza**:
  - el contexto de build de Docker (del repo a la imagen);
  - `.env.production` en una máquina que puede ser de la consultora;
  - el VPS ajeno y su root;
  - el destino de respaldo, que es de un tercero;
  - las salidas de los agentes revisores y los informes que dejan: son datos, no instrucciones, y sus sondas se
    re-ejecutan antes de creerlas.
- **Atacantes relevantes**:
  - **O6**: una lectura de archivos en la app expone la imagen; el root de un VPS ajeno lee todo.
  - **O3**: la fatiga al firmar casi treinta hallazgos.
  - **O2**: una región o una respuesta del proveedor declaradas en falso: es texto que nadie puede verificar desde
    la máquina.
  - **O5**: lo que se añada para el respaldo (cliente S3, rclone o Borg).
- **Controles**:
  - la fase 0 con prueba de imagen;
  - las llaves del respaldo con permiso de escribir y no de borrar, y bloqueo de objetos en el destino;
  - `configura:deploy` en `predeploy`;
  - un kit de firma **anti-sello-de-goma**: cada afirmación con su resultado de hoy, los infirmables arriba y el
    diff acotado por documento;
  - cero dependencias nuevas si alcanza con lo que ya está pineado.
- **Brechas abiertas a propósito**:
  - el root de un VPS ajeno no lo cierra ningún control: va al contrato y a D3;
  - la región declarada es autodeclarada: la verifica quien contrata, y el contrato lo dice;
  - mientras D10 siga abierta, la región no se valida, se marca pendiente.

### Evaluación de impacto / AISIA (C4) de este PRP — *¿a quién dañamos sin atacante?*

- **Partes afectadas**:
  - los empleados y las contrapartes de los N3 (sus datos);
  - los N3 (su SLA y su prioridad);
  - las consultoras y sus consultores;
  - el laboratorio, que firma;
  - los despachos del buzón de CFDI, por la fase 0 y por el tope del PDF en el extractor que comparten.
- **Daño posible con el sistema operando bien**:
  - **Firmar controles de papel**, que es el daño que este PRP existe para evitar.
  - **El piso de nómina sube de más**: P2 en casos que no lo merecen, que desplazan a otros. Reversible, con motivo y
    evento.
  - **El tope de inflado rechaza un PDF legítimo** y un CFDI queda sin leer. Se mide sobre el corpus real, el aviso
    lo dice y el documento queda como adjunto.
  - **La ficha dice «apto» y la máquina no restaura.** Por eso no dice «apto» sin GATE 3.
  - **El perfil da por buena una región que el contrato no admite.** Mientras D10 siga abierta, dice «pendiente».
  - **La primera respuesta humana hace que la consultora incumpla más SLA.** Es la medición correcta, pero cambia
    dinero: el contrato lo dice antes de medir.
  - **Cerrar el escalamiento al agente (DP-3) reduce lo que aprende el laboratorio.** Afecta al producto, no a
    terceros: se acepta.
- **Reversibilidad**: todo vive en propuestas, en el laboratorio y con datos sintéticos; nada toca una base real.
  Los documentos firmados se revisan con sus disparadores. La vía de apelación del N3 es la impugnación, y este PRP
  la vuelve real (H-10).
- **Decisión**: **mitigar**.

---

## Blueprint (Assembly Line)

> Solo fases. Las subtareas se generan al entrar a cada una (mapear contexto, generar subtareas, ejecutar).
> Cada fase cierra con commit y `npm run validate` **después** del commit, en su propio PR.

### Fase 0: `.env.production` fuera de la imagen (todo el template)
**Objetivo**: ninguna imagen de la app lleva `.env*` (salvo los `.example`), en los dos composes, y la app en marcha
ve solo lo que le pasa el compose. Cierra H-29. Va primero y en su propio PR. El arreglo no es CDC; la prueba
necesita casa en el padrón: si entra a un gate existente sin tocar `gates.json` ni su `guarda`, no hay CDC; si no
cabe, su alta va con una propuesta de CDC chica, de radio padrón, en el mismo PR. Responde DP-6 y deja anotado que
la premisa de #209 vuelve a ser cierta.
**Validación**: una imagen construida con un `.env.production` sembrado no contiene el archivo ni sus valores; la
prueba cae si se quita la exclusión; validate en verde.
**Hecho (2026-10-07, PR #226, `5cceab4`)**: `.dockerignore` con `.env*` y `**/.env*`, una guarda en el `Dockerfile` y
`revisaImagen` con 7 casos en `prueba:buzon`, sin CDC. Con Docker real, el `.dockerignore` de `main` dejaba entrar cuatro
archivos con llaves y el nuevo ninguno; la guarda tumba el build si hay fuga. El validate dio 31/31 en un worktree limpio.
La imagen final no se pudo comparar por H-30.

### Fase 0b: la imagen se construye desde un clon limpio (todo el template)
**Objetivo**: que `npm run deploy` funcione en un servidor recién clonado, en los dos composes. Cierra H-30:
- las herramientas que la app importa se compilan dentro del build;
- de `.claude/` entra solo lo que la app importa;
- el typecheck del build no depende de paquetes que no están en la imagen.

Va después del merge del #226, porque toca los mismos archivos, y antes de desplegar el buzón: el despacho construye
con este `Dockerfile`. Si su prueba necesita alta en el padrón, es un CDC chico de radio padrón, en el mismo PR.
**Validación**: una imagen construida desde un `git archive`, con un `.env.production` sembrado, arranca, responde su
healthcheck y no contiene ningún `.env*`. Esto cierra también la evidencia que la fase 0 no pudo dar. Además, una
prueba sin Docker caza cada capa de H-30 con su siembra, y validate en verde.
**Hecho (2026-10-07, `d66336c`)**:
- `prebuild` = `prepara-gate`: compila `tools/*/dist` e instala el peer del dictado.
- `.dockerignore`: `!.claude/routing-modelos.json`, más `**/node_modules`, `**/dist` y `**/*.tgz`.
- `revisaConstruible`, con 8 casos en `prueba:buzon`. Sobre los archivos de `main` caza las tres capas.

**Evidencia con Docker real**, desde un `git archive` del commit y con un `.env.production` sembrado con canarios:
- el build pasa en 243 s, con las 13 herramientas compiladas dentro;
- el contenedor queda **healthy** y `/` responde **200**;
- hay **0** archivos `.env*` en la imagen;
- el cargador de Next (`@next/env`) encuentra **0 archivos** en `/app`, y ni el canario ni `service_role` llegan al
  proceso. Esto cierra la evidencia que la fase 0 no pudo dar.

Al arrancarla salió **H-31**.

### H-31, hecho (2026-10-07, `f63bd26` + `e2e4ac4`, apilado sobre la fase 0b)
**Causa**: el file tracing convierte un `fs` con camino dinámico en un glob por extensión sobre todo el repo:
- ventas, por `tools/ventas-whatsapp/src/almacen/archivo.ts:55` → todo `*.json`;
- `laboratorio/muestra`, por el `mkdtemp` → todo `*.txt`, `erp/casa/huellas.txt` incluido;
- `contenido/video` → todo `*.png`;
- soporte-sap → `*-pagina.ts`;
- el caso `priv-8` del laboratorio pymes → todo `src/`.

Arreglarlo ruta por ruta lo reintroduce la siguiente ruta.

**Arreglo**: `NUNCA_EN_LA_IMAGEN` en `next.config.ts`, bajo la clave `/**`:
- `erp`, `trayectorias`, `inventario`, `productos`, `docs`, `.claude`, `scripts` y `src`;
- de `tools/`, `src`, `pruebas`, `manual` y `medicion`;
- la configuración de la raíz.

Ninguna ruta lee nada de eso en tiempo de ejecución. `priv-8` dice «no medido» sin fuente. 6 casos en `prueba:buzon`
prueban la configuración real con el picomatch y las opciones de Next (`collect-build-traces.js`).

**Evidencia** con Docker real, desde un `git archive`:
- en `/app` solo quedan `.next`, `node_modules`, `package.json`, `public`, `server.js` y `tools`;
- `erp`, `trayectorias`, `src`, `docs` y el resto, 0 archivos; `.env*`, 0;
- la imagen queda healthy;
- `/`, `/estudio`, `/laboratorio-pymes`, `/buzon` y `/soporte-sap` responden 200, sin ningún `ENOENT` en los logs.

**Decisión abierta del laboratorio**: en `tools/` quedan 66 archivos de datos que las herramientas leen en tiempo de
ejecución. Entre ellos están las **reglas del grafo** (`tools/conocimiento/dominios`, 17), que son de lo defendible
(§1.7). ¿Pueden ir en la imagen del despacho? Si no, la imagen del despacho necesita su propia lista.

### Fase 1: Los huecos de la base, con su arnés de sabotajes
**Objetivo**: las dos propuestas SQL cierran H-01, H-02, H-03, H-05 a H-10 (la parte de la base), H-12 a H-16 y
H-21 (según DP-2), y cada control tiene una prueba negativa con el rol real y un sabotaje que la tumba. Arranca de la
rama `soporte/firmas` rebasada (DP-1). La matriz pasa a ser el arnés de Soporte SAP, como el de la sala.
**Validación**: el arnés corre todos los sabotajes y cada uno cae; las pruebas de `tools/soporte-sap` y de
`tools/sala-a2a` en verde; las sondas del 07/10 re-ejecutadas dan **rechazado**.

**Tanda 1a, hecha (2026-10-07, rama `soporte/cierre-base`)**: H-01, H-02, H-03 y H-06, con 6 filas nuevas en la matriz y
4 hallazgos «revision». **Una desviación sobre la propuesta**: en H-03 el agente sigue escribiendo en el sandbox. La base
cierra el DATO, no al escritor: `ss_sandbox_sin_identificadores` rechaza correo, RFC, CURP y secuencias largas de dígitos
aunque los escriba el agente, y `ss_cuarentena_solo_senales` solo admite las señales del anonimizador. Quitarle la
escritura al agente obliga a otro escritor, y eso es un cambio de flujo. Los nombres sin forma siguen en H-04.

**Tanda 1b, hecha (2026-10-07, rama `soporte/cierre-1b`)**: H-15, H-16, H-17 (en la base), H-09 y H-10, con 12 filas nuevas
en la matriz (82 «probado» en total) y 5 hallazgos «revision». Las fechas y las marcas del reloj las pone la base desde los
eventos. Responder, pausar, resolver y cambiar la prioridad son eventos de una persona. El piso de nómina tiene un solo
vocabulario en el código y en la base. **Para la fase 2**: el runtime en memoria todavía marca la primera respuesta al
anonimizar o al mandar a la sala (H-17), y el job que calcula `ss_sla_resultado` desde los eventos no existe (la
plataforma tiene permiso; falta el código).

**Tanda 1c, hecha (2026-10-07, rama `soporte/cierre-1c`)**: H-21 y el tenant de `sala_agente` (lo que quedaba de H-06).
La base verifica el token de la tarea: firma con `pgcrypto`, rol de la sesión y vencimiento. El secreto vive en
`ss_priv.secreto_tareas` y `sala_priv.secreto_tareas`, y solo lo lee la función que verifica. La brecha
`c3-conexion-directa` pasa a «probado». **Para el despliegue (fase 3)**: cargar los dos secretos es un paso humano, y
PostgREST tiene que pasar la cabecera `x-tarea`; `configura:deploy` debería comprobar que el secreto existe sin
imprimirlo. **Lo que queda de la fase 1 va en la tanda 1d**: H-05, H-07, H-08, H-12, H-13 y H-14.

**Tanda 1d, hecha (2026-10-07, rama `soporte/cierre-1d`)**: H-13 (la base calcula la cadena, y el verificador del código
la acepta), H-14, H-12 y H-05. Ahora hay 97 filas «probado». **Quedan de H-14**: `ss_procedencia` no tiene a qué atarse
(su `registro` es texto libre) y el tamaño y tipo de los buckets dependen de la versión de Storage (fase 3). **Para el
despliegue**: cargar la sal de los seudónimos es otro paso humano. **Hallazgo nuevo**: H-32, el seudónimo sin sal del
importador (fase 2). **Sigue la tanda 1e**: H-07 y H-08, la plataforma y la restauración.

**Tanda 1e, hecha (2026-10-08, rama `soporte/cierre-1e`)**: H-07 y H-08. La plataforma solo lee y borra, nunca inserta,
y exporta con su propio rol. La restauración, con privilegio de migración, verifica la firma del export, el tenant de
cada fila y las huellas (la suya y las de los demás) **antes del commit**. El export lleva los accesos motivados y, si
está en la misma base, la sala. **Siguen como texto, para el C3 v4**: el privilegio de migración de la restauración,
declarado en C7; los bytes de Storage, que van por su propia línea de respaldo; y la retención, que no existe (D8; además
`ss_evento` es de solo agregar, así que una incidencia con eventos no se puede borrar).

**La fase 1 está completa** (2026-10-08): H-01 a H-03, H-05 a H-10 y H-12 a H-16 cerrados en la base, H-17 en la base, y
H-21. Son 104 filas «probado» en la matriz, todas en verde sin sabotaje y en rojo con él. El arnés atrapó en el
camino cinco pruebas o sabotajes que no medían nada; están en los aprendizajes.

### Fase 2: Cablear lo que la app promete y no hace
**Objetivo**:
- cablear el presupuesto (H-18), la generalización y el «a medida» por defecto (H-19), la impugnación en la app
  (H-10) y la primera respuesta humana (H-17, según DP-4);
- atar la aprobación a la huella del plan (H-11);
- el anonimizador con las 5 frases nuevas (H-04), la delimitación de documentos (H-24) y los topes de la ingesta
  por incidencia (H-23);
- la ruta del laboratorio (H-25), la confianza del FODA (H-28) y el riesgo de baja de la rama (H-27);
- el tope de inflado del extractor (H-22), medido sobre su corpus y probado también contra el buzón.

**Validación**: cada cambio con su fila en la matriz, que ejerce el camino del runtime o del CLI; recorrido de
Playwright en verde; `prueba:buzon` en verde tras tocar el extractor.

**Fase 2, primera parte: el SLA, hecha (2026-10-08, rama `soporte/fase2-sla`)**:
- **H-17**: el runtime ya no marca la primera respuesta; la marca el consultor al responderle al cliente (acción
  `responde` y su formulario).
- **H-16**: `src/sla-job.ts` calcula `ss_sla_resultado` desde la base con `relojSla`. Lo escribe la plataforma (lo
  único que escribe) y, sin contrato válido o sin prioridad inicial, no inventa: omite y dice por qué.
- **Evidencia**: 4 filas nuevas en la matriz, el recorrido de Playwright en verde (19 capturas) y la demostración de
  que el código viejo daba «respuesta en meta» sin respuesta.
- **H-22 sigue pendiente, sin cambios en esta rama.** El hallazgo está confirmado (un PDF pequeño agota la memoria del
  lector); el tope de inflado lo lleva el laboratorio por otra vía.

**Fase 2, segunda parte: el núcleo y el anonimizador, hecha (2026-10-08, rama `soporte/fase2-nucleo`)**:
- **H-19**: lo que enseña el experto queda **a medida** de la consultora del caso que nombra, y anonimizado; sin
  caso, no se guarda. Al núcleo lo sube el superadministrador con `alNucleo`, que generaliza (acción `al_nucleo` y su
  botón). La base rechaza lo que llegue sin generalizar, al proponerlo y al promoverlo
  (`ss_priv.propuesta_nucleo_generalizada`). Por sí sola rechaza 25 de los 27 casos del banco; solo se le escapan la
  marca y las siglas, que no conoce. `generaliza` vive ahora en `src/generaliza.ts`.
- **H-04**: las 5 frases y un banco que escribió un agente que **no leyó el detector** quedan como fixture permanente
  (`pruebas/_banco-independiente.ts`). Contra el código de entonces, ese banco dio:
  - anonimizador: 8 fugas de 30 y 4 controles técnicos tapados (como «En VA01» → «[NOMBRE]01»);
  - generalizador: 12 fugas de 20 y 4 controles tapados.
  Ahora da 0 en los dos. Ese banco ya lo vio quien escribió el arreglo, así que dejó de ser independiente; la medida
  honesta es el **banco de control** (`pruebas/_banco-de-control.ts`), que otro agente escribió después sin ver ni el
  detector ni el primer banco, y midió una sola vez antes de que se tocara nada por él:
  - anonimizador: **3 fugas de 30**: un `usr=`, un teléfono leído con O por 0 y l por 1, y un diminutivo en minúsculas
    («chuyita»). Los 4 casos de nómina fueron a revisión, y quedaron 4 de 10 controles técnicos tapados;
  - generalizador: **0 fugas de 20**, y 1 de 6 controles tapados (`ZTERM`, `ZLSCH`: campos estándar que empiezan con Z).
  Se arreglaron, y los dos bancos quedan como fixture permanente. Ahora dan 0 fugas. Los únicos «tapados» que quedan son
  un número de documento de 10 dígitos y una fecha, que se generalizan **por diseño**, y la prueba lo dice.
  **No es «cero fugas»**: un nombre en minúsculas, sin contexto y fuera de la lista de nombres comunes pasa. Va
  como límite en el texto de la fase 4.
- **Evidencia**: 11 filas de la matriz nuevas o rehechas, y el paso 5.1 del recorrido (el superadministrador sube la
  enseñanza y la pantalla muestra `[CLIENTE]` y `[OBJETO_PROPIO]`), con 20 capturas, 0 en rojo y 0 errores de consola.

**Fase 2, tercera parte: el presupuesto y la huella de la ejecución, hecha (2026-10-09, rama `soporte/fase2-presupuesto`)**:
- **H-11**: lo que se aprueba y lo que se ejecuta son el mismo artefacto (`src/artefacto.ts`). `ejecuta()` recalcula la
  huella sobre lo que va a correr y la compara con la aprobada: otro parámetro, otra versión u otra tarea no ejecutan,
  tampoco desde `ss-simulador`. La prueba vieja del CLI aprobaba una huella inventada (`'ab' × 32`) y ejecutaba: fijaba
  el bug como requisito.
- **H-18**: `src/presupuesto.ts` lee el tope de la base por mes (`ss_presupuesto`) y calcula lo gastado desde la cadena
  del mes. Las páginas las anota cada `ADJUNTO_LEIDO` y los tokens cada `PLAN_PREPARADO`; lo que no trae su medida no
  cuenta como cero. El enjambre no prepara ni corrige un plan sin el visto bueno del presupuesto. El runtime pasa por
  `conPresupuesto` todo paso que gasta modelo:
  - con presupuesto, el paso corre, y el aviso del 80 % queda en la cadena;
  - al tope o sin tope del mes, P1 y P2 pasan a una persona ahora y P3 y P4 esperan.
  Un P1 o un P2 con una imagen sin leer por el tope de OCR también pasa a una persona. Los avisos se ven en el panel
  «Presupuesto del mes» del consultor y del superadministrador, y el tope lo fija el superadministrador. En el
  laboratorio no hay modelo: los tokens son el supuesto de `medicion/estimado.json`, y el evento lo dice
  (`tokensSon: 'estimados'`). No hay tabla nueva.
- **Evidencia**: 9 filas nuevas en la matriz y el paso 13 del recorrido. En ese paso, con el tope en 0, el P1 con su
  captura pasa a una persona por las dos razones y el P4 espera. El recorrido dio 21 capturas, 0 en rojo y 0 errores
  de consola, con Tesseract.

**Fase 2, cuarta parte: las pantallas, hecha (2026-10-09, rama `soporte/fase2-pantallas`)**:
- **H-10**: la impugnación en la app. El cliente impugna la prioridad, la categoría, la complejidad o una pausa del reloj
  de su incidencia, con un motivo de 10 caracteres o más. La consultora la resuelve a su nombre, sin reescribir la queja,
  y una resuelta no se reabre. Son las reglas de `ss_impugnacion`.
- **H-25**: la prueba del 404 no veía el GET: buscaba `export async function`, y el GET no es async. Ahora revisa cada
  método exportado, y un servidor sin la variable responde 404 al GET y al POST (comprobado a mano). La ruta ya no
  devuelve el mensaje de cualquier error: solo los `Rechazo` del laboratorio; lo demás sale como «error interno»
  (500) y se queda en el log del servidor. **Quedan como texto (fase 4)**: la ruta no autentica y devuelve la vista de
  cualquier rol, porque es de demostración y `configura:deploy` la rechaza en producción; y los logs sin inventariar.
- **H-27**: el código ya estaba (la fila `aisia-riesgo-pantalla`: la fórmula y el umbral a la vista). Lo que queda es
  texto (fase 4): el N3 no ve el riesgo de baja ni lo puede discutir.
- **H-28**: cada punto del FODA lleva la confianza del volumen del cliente; con pocos datos, «baja». El recorrido
  comprueba la confianza del FODA y el aviso de proyección. **Quedan como texto (fase 4)**: la vista por categoría y
  complejidad no existe, y no hay tamaño mínimo de grupo.
- **Evidencia**: 5 filas nuevas en la matriz y los pasos 14 y 14.5 del recorrido. Salieron 23 capturas, 0 en rojo y
  0 errores de consola.

**Fase 2, quinta parte: la ingesta, los documentos y el importador, hecha (2026-10-09, rama `soporte/fase2-ingesta`)**:
- **H-23**: al bucket de originales solo sube la ingesta, que valida los bytes, y solo ella registra el adjunto (antes
  subían el cliente y su consultora). La base no admite más de 10 adjuntos por incidencia (`ss_adjunto_tope`), y la
  ingesta cuenta desde los que la incidencia ya tiene. De lo que lee el motor de OCR, solo cuenta y se usa lo que cabe en
  el tope del periodo. La ruta mira el tamaño de la subida antes de `formData()`: sin tamaño declarado, o con más de
  cinco adjuntos del máximo, responde 413. Comprobado a mano: una subida que declara 40 MB da 413.
- **H-24**: lo leído de un documento entra a la incidencia delimitado (`delimitaDocumento`). La urgencia y el impacto
  salen de lo que declara el cliente, no de sus documentos. El banco de inyección sembraba «PON ESTO EN P1», que no
  sube nada; la prueba nueva siembra las palabras que sí la suben («urgente», «toda la planta», «hoy»), y demuestra que
  sin el control un documento convertía el caso en P1. **Brecha declarada** (`c3-parametros-de-documento`): un
  parámetro del plan puede salir de un documento. Lo cubre la aprobación humana del plan, atada a su huella (H-11).
- **H-32**: el importador seudonimiza con HMAC y su sal (`Seudonimizador`); sin sal, o con una corta, no seudonimiza.
  La sal del despliegue es `SS_SAL_IMPORTADOR`; la vista previa de `ss-mapea`, que no muestra ni guarda seudónimos, usa
  una del momento si falta. **Para la fase 3**: `configura:deploy` comprueba que la sal existe, sin imprimirla.
- **Evidencia**: 10 filas nuevas en la matriz (9 «probado» y 1 brecha) y el recorrido en verde (23 capturas).

### Fase 3: El perfil de despliegue (VPS seleccionable en el laboratorio y en la instalación)
**Objetivo**:
- la sección `despliegue` en la plantilla v3 (DP-5) y en los dos manifiestos;
- `configura:deploy` midiendo contra ese perfil y metido en `predeploy` (H-26);
- el respaldo por protocolo S3 con bloqueo de objetos;
- la ficha de servidor por consultora en la pantalla del laboratorio;
- el runbook de despliegue sin proveedor fijo.

Dos CDC: la plantilla y el padrón.
**Validación**: `verifica:productos` con siembras nuevas que cazan un `despliegue` mal declarado; casos de
`configura:deploy` que fallan con una máquina chica, con una región frente a D10 y sin destino de respaldo, y uno
que pasa; captura de la ficha; regresión en verde y propuestas de CDC con la firma en blanco.

**Fase 3, hecha (2026-10-09, rama `soporte/fase3-despliegue`), con dos CDC que firma el laboratorio**:
- **CDC 1, la plantilla v3** (DP-5): la sección `despliegue` en `PLANTILLA.md` y en los dos manifiestos. Declara
  requisitos, no proveedores: los modos, la máquina por tamaño (sale de `maquinaPara`), lo que exige (la región por su
  decisión, el respaldo inmutable, los puertos y Docker), quién opera y los secretos.
  - `verifica:productos` la exige, con 9 siembras nuevas (35 en total).
  - Ventas WhatsApp declara `tamanos: null` con su `falta`.
- **`configura:deploy` mide contra el perfil** (`scripts/despliegue/perfil.mjs`, puro). Con `PRODUCTO=<slug>`:
  - comprueba la máquina contra el tamaño contratado;
  - dice la región «pendiente de D10», nunca «cumple»;
  - avisa si falta el destino de respaldo por S3 con días de bloqueo;
  - exige los secretos del producto sin imprimirlos.
  Con `--escribir` deja la medición, sin secretos, en `.despliegue/medicion.json`, fuera de git y de la imagen.
- **La ficha de servidor** (`src/ficha.ts`) en la pantalla del superadministrador: una por consultora. No dice
  «apto» sin una restauración probada en esa máquina (GATE 3). En el laboratorio las dos dicen «no apto», sin medir.
- **El respaldo por protocolo**: cualquier S3 con Object Lock (FASE0 §9.2, N2), con `rclone` sin remoto con nombre y
  el control negativo a mano. El runbook queda sin proveedor fijo; el nombre del archivo es histórico.
- **CDC 2, el padrón** (H-26): `configura:deploy` entra en `predeploy` como gate `siempre`, porque la máquina y el
  `.env` cambian sin que cambie el árbol. El SDD §16 cita ya dónde está su prueba.
- **Evidencia**: 8 pruebas en `pruebas/despliegue.ts`, entre ellas la máquina chica, la región frente a D10, el
  respaldo que falta y la instalación que pasa. Además, el paso 9.1 del recorrido (24 capturas), `verifica:productos`
  35/35, la regresión capa A 163/163 y `verifica:gates` con 34 activos. Esta fase no añade filas a la matriz: el
  control «perfil de despliegue» entra con el C3 v4 (fase 4).

### Fase 4: AISIA v3 y C3 v4, y la tercera revisión
**Objetivo**:
- reescribir los dos documentos para que digan lo que es verdad: cifras corregidas, infirmables reclasificados,
  daños nuevos en la §2, Flujos y Priorización en el C3, el root ajeno y el perfil de despliegue, y el estado real
  del PRP-008;
- que un agente que no escribió nada (con el modelo que el routing asigna a gobernanza) intente romperlos contra el
  código;
- resolver cada hallazgo como código, texto o brecha. Un infirmable no puede quedar como brecha.

**Validación**: la matriz cubre cada daño de la AISIA y cada control del C3, con su resultado de hoy; la tercera
revisión no deja ninguna afirmación contradicha sin resolver.

### Fase 5: Validación final y kit de firma
**Objetivo**: todo en verde tras el último commit, y el kit listo, fuera de todo registro:
- el texto final de los dos documentos con la firma en blanco;
- dónde aterriza cada uno: la AISIA en `.claude/gobernanza/`; el C3 en el PRP-008; la firma en el
  `BUSINESS_LOGIC.md` del producto; el estado en la fila del índice y en el manifiesto;
- los pasos de una línea en el orden en que el laboratorio los corre.

**La firma la escribe el laboratorio.**
**Validación**:
- [ ] `npm run validate` en verde después del último commit, con el conteo de gates
- [ ] `npm run regresion` en verde (y `-- --trampa` si el laboratorio lo pide en algún CDC)
- [ ] Captura de Playwright de la app con la impugnación y la ficha de servidor
- [ ] Todos los criterios de éxito marcados con su evidencia

---

## Aprendizajes (Self-Annealing)

> Crece con cada error durante la implementación. El mismo error nunca dos veces.

- **2026-10-07 · la imagen de producción nunca se había construido desde un clon limpio** (fase 0 → H-30). El
  `Dockerfile`, los composes y `npm run deploy` estaban escritos y documentados, y fallaban en tres capas que ningún
  gate veía, porque ningún gate construye la imagen. Salió solo al construirla de verdad para tener evidencia.
  **Lección**: la evidencia de un cambio de despliegue es una imagen construida desde un `git archive`, no un build
  local con el árbol de trabajo, que trae `dist/` y archivos sin seguimiento.
- **2026-10-07 · `verifica:inventario` cuenta los archivos sin seguimiento.** Con este PRP sin commit en el árbol,
  la vista del inventario divergía en una rama que no lo traía. **Fix**: validar en un worktree limpio, desacoplado
  del commit y con `npm ci` real. No se borra un archivo sin seguimiento para que pase el gate: el clasificador lo
  bloquea, y con razón, porque no tiene respaldo.
- **2026-10-07 · construir la imagen no basta: hay que mirar qué lleva dentro** (fase 0b → H-31). La primera imagen
  que llegó a construirse traía `src/`, `erp/` y `trayectorias/`, contra lo que dice el propio `Dockerfile`. Un
  build en verde dice que compila, no qué se lleva. **Lección**: la evidencia de una imagen incluye listar `/app`
  y buscar lo que no debería estar, no solo el healthcheck.
- **2026-10-07 · la matriz del 05/10 daba 64/64 en verde, y aun así tenía los huecos de hoy** (fase 1, tanda 1a).
  `aisia-lab-escalado` saboteaba la lectura del laboratorio, no quién escala; `aisia-lab-72h` saboteaba el intervalo,
  no quién pone la fecha. Una fila «probado» prueba exactamente lo que siembra su sabotaje, y nada más.
  **Lección**: cada afirmación se parte en todas las formas de romperla, y cada forma lleva su fila.
- **2026-10-07 · una limpieza puede tapar su propio sabotaje.** Para quitar la política vieja del agente puse un
  `drop policy` DESPUÉS del bloque que crea las políticas: con el sabotaje (volver a meter la tabla en la lista), el
  bloque la recreaba y el `drop` la borraba otra vez, y el arnés dijo «NO CAE». **Fix**: el `drop` va antes del bloque.
  **Lección**: un control que no se puede romper por el camino que se prueba parece más fuerte de lo que es.
- **2026-10-08 · en el recorrido, «se ve el número» no prueba nada** (fase 2, H-17). La primera versión de los pasos 11.1
  y 11.2 miraba los minutos del reloj: «respuesta 0 min» se veía igual antes y después de responder, así que el 11.2
  pasaba en vacío. La segunda miraba la cadena, y tampoco servía, porque el código viejo marcaba la primera respuesta
  en el reloj sin anotarla. Lo que delata el bug es el ESTADO del reloj: con el código viejo, la P1 decía «respuesta en
  meta» sin que nadie respondiera. Se demostró aparte con `relojSla` (viejo: cumple `true`; nuevo: `null`, en plazo).
  **Lección**: un paso de recorrido se escribe contra lo que el bug cambia en pantalla, y se comprueba que el código
  viejo lo pondría en rojo.
- **2026-10-09 · una prueba estructural tiene que contar lo que no encontró** (fase 2, H-25). La prueba del 404 buscaba
  `export async function (GET|POST…)` y revisaba la primera línea de cada uno. El GET no es async: nunca entró en la
  lista, y la prueba pasaba sin mirarlo. **Fix**: compara los métodos revisados con TODOS los exportados. **Lección**:
  una prueba que recorre «cada X» afirma también cuántos X hay; si no, un X que no encaja en el patrón la deja en verde.
- **2026-10-09 · una prueba que lee el código prueba la línea que busca, y nada más** (fase 2, H-18). La prueba del P1 con
  evidencia sin leer buscaba el `anota(... 'A_HUMANO_POR_PRESUPUESTO' ... evidencia sin leer)`. Un sabotaje que apaga la
  condición (`if (false)`) la habría dejado en verde. **Fix**: la prueba exige la condición junto con la línea, y el
  recorrido lo ejercita de punta a punta. **Lección**: en una prueba de lectura de código, el sabotaje que se imagina
  es el que decide qué se busca; se escribe primero el sabotaje y después la expresión.
- **2026-10-09 · el ataque de «otro parámetro» necesita un usuario que exista** (fase 2, H-11). La primera versión
  ejecutaba con la aprobación de ALMACEN01 un plan para FINANZAS02, que no existe en el SAP simulado: el código viejo
  también habría fallado, por «usuario inexistente». **Fix**: VENTAS02, bloqueado en el estado de la prueba, y una
  comprobación de que cada «otro» artefacto es ejecutable antes de probar que no se ejecuta.
- **2026-10-08 · un banco que ya leíste deja de medir** (fase 2, H-04). El banco independiente encontró 20 fugas que
  el banco propio no veía. Pero al arreglarlas, el banco pasa a ser parte del diseño, y su «0 fugas» ya no dice nada
  de lo que no se ha visto. **Fix**: un segundo banco de control, escrito después y sin ver ni el detector ni el
  primero; su número es el que se reporta. **Lección**: el referente lo escribe otro, y se mide UNA vez antes de tocar
  el código por él.
- **2026-10-08 · una lista de nombres tapa al detector general en el banco** (fase 2, H-04). Todos los nombres del
  banco eran comunes, así que la lista los atrapaba y el detector del «nombre suelto con mayúscula» no tenía un caso
  que solo él cubriera: su sabotaje habría dado «NO CAE». **Fix**: un caso con nombres fuera de la lista (Tlacaélel,
  Yaretzi). **Lección**: cuando dos detectores se solapan, cada uno necesita un caso que solo él atrapa.
- **2026-10-08 · dos cerrojos tienen que estar de acuerdo** (fase 2, H-19). El primer disparador del núcleo rechazaba
  `BSEG-ZLSCH`, una fecha `2026/10/01` y «la planta 3»: lo que `generaliza` deja pasar porque es estándar, la base lo
  habría rechazado. **Fix**: una prueba que manda a la base todo lo que `generaliza` deja del banco, más controles de
  lo estándar. **Lección**: un segundo cerrojo se prueba en las dos direcciones, lo que rechaza y lo que deja pasar.
- **2026-10-07 · un control nuevo puede dejar sin efecto el sabotaje de uno viejo** (fase 1, tanda 1d). Al correr solo
  las filas nuevas, todo verde; la matriz COMPLETA dio dos «NO CAE» en filas viejas. La cadena ahora pone la fecha del
  evento, así que quitar la ventana de `evento_honesto` ya no cambiaba nada; y el nuevo `alter role` corregía el
  `bypassrls` que sembraba el sabotaje de `c3-bypassrls`. **Fix**: esos sabotajes quitan los dos cerrojos. **Lección**:
  antes de cada PR se corre la matriz entera, y el commit de su documento solo se hace si sale en verde.
- **2026-10-07 · un control que compara con `<>` se abre cuando le falta un dato** (fase 1, tanda 1d). `evento_honesto`
  rechazaba un actor ajeno con `new.actor <> seudonimo(...)`. Con la sal sin cargar, el seudónimo es NULL y `<>` da
  NULL: el evento entraba con el actor de otro. **Fix**: `is distinct from`. **Lección**: en una regla de seguridad,
  toda comparación contra un valor que puede faltar falla cerrado.
- **2026-10-07 · dos pruebas vacías del H-21, y las dos parecían razonables** (fase 1, tanda 1c). La sonda del
  `set_config` iba en el WHERE y después en un LATERAL de la misma consulta: no leía B **ni con la función vieja**,
  porque la base evalúa antes la función estable de la política. El arnés dijo «NO CAE» dos veces. Una sonda medida
  aparte lo resolvió: el ataque real son DOS sentencias en la misma sesión, que es lo que hace un agente con SQL.
  **Lección**: una prueba de seguridad se escribe contra el ataque que funciona en el sistema SIN el control; si no
  se mide primero que el ataque funciona, la prueba puede estar midiendo nada.
- **2026-10-07 · un `fs` con camino dinámico es un glob sobre todo el repo** (H-31). `turbopackIgnore` en la app no
  alcanza el código compilado de una herramienta, y cada ruta nueva puede reintroducirlo. **Fix**: una lista global de
  lo que nunca viaja, probada con la semántica de Next, y la imagen inspeccionada por dentro.
- **2026-10-07 · en esta máquina Docker no tiene buildx.** `DOCKER_BUILDKIT=0` (el builder clásico) respeta igual el
  `.dockerignore` e ignora la línea `# syntax`; en el servidor, `docker compose build` usa BuildKit.

---

## Gotchas

- [ ] **«Probado» en la matriz de la rama no se hereda.** Marcaba «probado» el corte por presupuesto, que nadie
      llama, y la tenencia, con la sala abierta entre tenants. La matriz probaba funciones y sembraba solo los
      sabotajes que su autor imaginó. Cada fila se re-mide por el camino real
- [ ] **Una revisión no agota los huecos.** La del 07/10 no repitió la mitad de lo que encontró la del 05/10 (el PDF
      que tumba la app, la restauración entre tenants, `ejecuta()` sin huella), y encontró cosas que aquella no vio
      (la sala entre tenants, `.env.production`). Por eso hay una tercera en la fase 4
- [ ] **H-09 es una trampa**: dar `update` al agente sin `grant` por columna le abre la prioridad, los sellos de SLA y
      los estados terminales. Primero la prueba negativa, después el permiso
- [ ] **Next standalone copia `.env` y `.env.production`** de los archivos que carga (`writeStandaloneDirectory`). El
      arreglo es sacarlos del contexto de build; los `NEXT_PUBLIC_*` ya viajan como build args y no dependen de ellos
- [ ] **El extractor es componente de otros productos**: el tope de inflado se mide sobre su corpus (los umbrales del
      extractor nunca se ponen a ojo) y se prueba contra `prueba:buzon`
- [ ] **Subir la plantilla a v3 obliga a migrar los dos manifiestos**: `verifica:productos` exige la versión vigente.
      El de ventas-whatsapp declara `despliegue` con `falta` si no lo tiene
- [ ] **Ningún archivo de pruebas huérfano**: `verifica:gates` pone en rojo un archivo de pruebas que ningún gate
      corre. Lo que va en `tools/*/pruebas/` lo corre `prueba:tools`; lo de `scripts/` necesita casa
- [ ] **El referente del anonimizador lo pone quien no escribió el detector**: las 5 frases del 07/10 entran al
      fixture tal cual
- [ ] Las propuestas SQL **no se aplican** a ningún Supabase (el MCP está en solo lectura, y bien)
- [ ] Ningún identificador con forma de caso-trampa (`T` + uno o dos dígitos); toda huella como `sha256:<hex>`;
      `npm run inventario:vista` en cada commit que añade archivos; borrar `.next/dev` antes de validar; en un
      worktree, `npm ci` real
- [ ] La rama `soporte/firmas` se rebasa sobre un `main` que se movió (#213–#225). `configura-deploy.mjs` ganó el modo
      despacho: las pruebas de superficie de la rama se re-corren contra él
- [ ] Push y PR los corre el laboratorio con `!`; la firma de un CDC la escribe el laboratorio

## Anti-Patrones

- NO declarar como `brecha` un daño infirmable: se cierra o no se ofrece
- NO escribir «Firmada por», `**Firma:**` lleno ni «PROMOVIDO»; no editar nada dentro de `.claude/gobernanza/`
- NO reabrir el producto más allá de lo necesario para que una frase sea verdad
- NO meter una tabla de proveedores ni de planes; NO escribir código por proveedor para el respaldo
- NO automatizar la creación de servidores (es un cobro: gate humano)
- NO arreglar el `update` del agente con un `grant` de tabla entera
- NO usar `service_role` en superficies de negocio (C7)
- NO apagar ni borrar un gate para que algo pase
- NO dar por buena la sonda de un revisor sin re-ejecutarla

---

*PRP aprobado el 2026-10-07. Fase 0 en el PR #226; las demás, cada una en su PR.*
