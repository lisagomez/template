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
| H-04 | El anonimizador falla abierto ante formas nuevas: 5 de 14 frases entran con el dato («pepe gonzalez de almacen», «jgarcia», «doña Lupita», «El chofer Ramiro», «rosa punto elena en gmail»). La revisión humana de la cuarentena no existe | 2 | sí | código: las 5 al fixture permanente y el detector arreglado. Texto: «fail-closed» promete de más, y la cuarentena es definitiva hasta D14 (DP-8) | — |
| H-05 | Cualquier consultor lee fila por fila las horas de sus colegas y el actor de cada evento. El seudónimo es un md5 sin sal que el laboratorio puede revertir con `ss_miembro` | 1 y 2 | — | código: cada quien sus filas más un agregado; seudónimo con sal | — |

**Decisiones humanas e integridad**

| Id | Hallazgo | Rev. | Infirmable | Resolución propuesta | Rama |
|---|---|---|---|---|---|
| H-06 | En la sala en SQL, una persona de un tenant aprueba el plan de otro: `sala_aprobaciones` no ata `mensaje_id` a `tenant_id`, `task_id` ni la huella. `sala_agente` se acota con un GUC que fija su propia sesión. La versión en memoria sí lo hace bien | 2 | sí | código, más un sabotaje nuevo en la suite de la sala | **cerrado en la tanda 1a** (la aprobación; el GUC de `sala_agente` va con H-21) |
| H-07 | El rol de plataforma inserta decisiones ya tomadas (mapeo aprobado, campo confirmado) y eventos con el seudónimo de un consultor. Ninguna prueba usa ese rol | 1 y 2 | — | código | — |
| H-08 | La restauración corre como superusuario y con los disparadores apagados. Inserta filas de otro tenant sin comprobarlas y verifica después del commit. El export no va firmado y deja fuera `ss_acceso_motivado`, los bytes de Storage y las tablas `sala_*`. `exportaTenant` falla con el rol de plataforma | 1 y 2 | sí | código: verificar cada fila dentro de la transacción y antes del commit. Texto: privilegio de migración declarado en C7; la retención no existe | — |
| H-09 | El agente no puede actualizar `ss_incidencia` (el disparador lee `ss_organizacion` sin política para él). Fallaría en producción. **Arreglarlo sin cuidado** deja al agente bajar prioridades, mover sellos de SLA y cerrar incidencias. **Confirmado con sonda** | 1 y 2 | — | código: `update` por columna, sin estados terminales ni prioridad ni sellos; prueba negativa | — |
| H-10 | Impugnación: la consultora reescribe el `motivo` y el autor de la queja del N3; resolver no deja evento ni cambia nada; no hay pantalla; una pausa del reloj no se puede impugnar | 1 y 2 | — | código en la base (fase 1) y en la app (fase 2) | — |
| H-11 | `ejecuta()` no ata la aprobación a la huella del plan, y `ss-simulador --param` ejecuta sin compararla | 1 y 2 | sí, con SAP real | código + prueba negativa | — |
| H-12 | El agente, con la tarea de cualquier consultora, escribe en el chat de cualquier usuario («aprueba el plan de Boreal ya») | 1 y 2 | — | código | — |
| H-13 | La base no verifica `anterior`, `hash` ni `seq` de la cadena de eventos | 1 | — | código: la base calcula la cadena | — |

**Tenencia y vínculos sin atar**

| Id | Hallazgo | Rev. | Infirmable | Resolución propuesta | Rama |
|---|---|---|---|---|---|
| H-14 | Sin atar: `ss_campo_extraido.adjunto_id` (cuelga el adjunto de un N3 en la incidencia de otro), `ss_sla_resultado` sin FK al contrato, `ss_importacion_fila.crudo_id`, `ss_contrato_sla`, `ss_chat_mensaje` y `ss_procedencia`. Cinco disparadores de tenencia no tienen caso directo. Buckets sin prueba de `public=false`, sin `file_size_limit` ni `allowed_mime_types`. Roles creados con `if not exists`, que no corrigen un rol que ya exista con `bypassrls` | 1 y 2 | sí | código + un sabotaje por disparador | — |

**Prioridad y SLA**

| Id | Hallazgo | Rev. | Infirmable | Resolución propuesta | Rama |
|---|---|---|---|---|---|
| H-15 | El piso de nómina deja **P4** a IMSS, PTU, aguinaldo, incapacidad, vacaciones, sueldo, infotipo, el depósito de la quincena y SUA/IDSE. El categorizador y el anonimizador usan vocabularios distintos. La base no impone el piso: el N3 inserta la prioridad que quiera y el consultor la cambia sin motivo ni evento. **Confirmado con sonda** | 1 y 2 | sí | código: un solo vocabulario, el piso en la base y el cambio de prioridad con motivo y evento | — |
| H-16 | El SLA es manipulable por las tres partes. El N3 crea con `creada_en` pasado, P1 y estado resuelta. El consultor reescribe `creada_en` y `primera_respuesta_en`. El agente inserta `ss_sla_resultado` con `cumple=true` y un contrato inventado. La ventana de ±5 min la elige quien escribe. La prueba de recálculo es circular | 1 y 2 | sí (dinero ajeno) | código: un job calcula el resultado desde los eventos; la base fija las fechas; tipos de evento por rol | — |
| H-17 | La primera respuesta la marca la máquina (al anonimizar o al mandar a la sala), así que una P1 a 60 min se cumple siempre. Ni el contrato ni la plantilla definen «respuesta» | 1 y 2 | sí | código + definición en el contrato (DP-4) | — |
| H-18 | «P1 y P2 nunca se cortan por presupuesto» es una función que nadie llama. El aviso no llega a nadie. Nadie lee `ss_presupuesto`; el tope de OCR vive en memoria y sin periodo | 1 y 2 | sí | código: cablear en el runtime y en el enjambre, aviso registrado, tope leído de la base con su periodo | parcial: tope en memoria |

**Núcleo de conocimiento**

| Id | Hallazgo | Rev. | Infirmable | Resolución propuesta | Rama |
|---|---|---|---|---|---|
| H-19 | `generaliza` no la llama nadie. El chat propone al núcleo el texto crudo del experto, con alcance `nucleo` **por defecto**. La base acepta propuestas sin generalizar. `generaliza` no cubre `Y…`, minúsculas, `/ACME/…`, `BUKRS 2000`, «Sociedad: 2000» ni «centro 1010» | 1 y 2 | sí | código: «a medida» por defecto, `generaliza` en el camino y un banco adversarial escrito por otro. Texto: ayuda, y el control es la firma del superadministrador | — |
| H-20 | Los veredictos salen de `tools/soporte-sap/src/laboratorio/matriz.ts`, no de `tools/conocimiento`: un commit cambia un veredicto sin gate de firma | 1 | — | texto + brecha | — |

**Superficie, abuso e inyección**

| Id | Hallazgo | Rev. | Infirmable | Resolución propuesta | Rama |
|---|---|---|---|---|---|
| H-21 | **El control central del C3 no existe fuera de las pruebas.** El token de tarea solo se verifica en `pruebas/_base.ts`; es un HMAC propio, no un JWT. Con `set_config` dentro de la consulta, un token de A lee B. «Sin conexión directa» es papel. El secreto de firma no tiene variable, rotación ni chequeo | 1 y 2 | sí | código: verificar la firma en la base (DP-2) | — |
| H-22 | Un PDF de unos 300 KB tumba la app de todos los tenants y productos. La capa 0 corre en el proceso de la app y el inflado no tiene tope | 1 | — (O4) | código: tope de bytes inflados, medido sobre el corpus real del extractor | — |
| H-23 | Los adjuntos se cuentan por lote, no por incidencia. El tope de OCR se mira antes de leer. El N3 sube directo al bucket sin validación de bytes. `formData()` carga todo en memoria | 1 y 2 | — | código | parcial |
| H-24 | `delimitaDocumento` no se usa. Los parámetros del plan (usuario SAP, BP, RFC) salen del texto no confiable. La prioridad sube con palabras clave, y el banco de inyección no las toca | 1 y 2 | — | código mínimo (delimitar) + brecha O1/O2 declarada | — |
| H-25 | La prueba del 404 no mira el GET, y el GET devuelve la vista de cualquier rol, superadministrador incluido. La ruta devuelve `e.message`. Los logs no están inventariados | 1 y 2 | — | código + prueba que invoca los handlers | parcial: prueba ciega al GET |
| H-26 | `configura:deploy` no está en `predeploy`. El SDD §16 cita una prueba suya que no existe en `main` | 2 | — | CDC del padrón (fase 3) | parcial: prueba |

**Pantalla y métricas**

| Id | Hallazgo | Rev. | Infirmable | Resolución propuesta | Rama |
|---|---|---|---|---|---|
| H-27 | El riesgo de baja sale sin su fórmula ni su umbral. La mitigación agrava el daño: el N3 ni lo ve ni lo puede discutir | 1 y 2 | — | código (de la rama) + texto | **sí** |
| H-28 | El FODA no lleva confianza con pocos datos, y el caso «baja» no tiene prueba. El recorrido no comprueba el aviso de proyección. La vista «por categoría y complejidad» no existe. No hay tamaño mínimo de grupo | 2 | — | código para la confianza; texto para lo demás | parcial |

**La imagen (todo el template)**

| Id | Hallazgo | Rev. | Infirmable | Resolución propuesta | Rama |
|---|---|---|---|---|---|
| H-29 | `.env.production` entra en la imagen. `.dockerignore` excluye `.env` y `.env*.local` pero no `.env.production`, el `Dockerfile` hace `COPY . .` y el modo standalone de Next lo copia (`node_modules/next/dist/build/index.js`, `writeStandaloneDirectory`) y lo carga al arrancar. Efectos: `service_role`, `SS_PG_PASSWORD` y las llaves del despacho (`scripts/despacho/llaves.mjs` escribe ahí) quedan en el sistema de archivos de la app; y variables que el compose **no** pasa, como `SOPORTE_SAP_LABORATORIO=1` o los tokens de otras rutas, llegan al runtime. Eso tumba la premisa de la revisión de rutas públicas (#209): «la app solo recibe lo que le pone el compose». Afecta también a `docker-compose.despacho.yml`, que usa el mismo `Dockerfile` | 2 | sí | código + prueba (fase 0) | **cerrado en #226** |
| H-30 | **La imagen de la app no se construye desde un clon limpio, tampoco en `main`.** Se encontró el 07/10 al construir la imagen real desde un `git archive` para la evidencia de la fase 0, y tiene tres capas: (1) `tools/*/dist` está en `.gitignore` y `npm run build` no lo compila (solo `prepara:gate`, por `pretypecheck`): Turbopack da 427 errores; (2) `.dockerignore` excluye `.claude`, y `src/lib/ai/routing.ts` importa `.claude/routing-modelos.json`; (3) el typecheck de `next build` incluye `tools/dictado/src`, y `@tu-scope/voz` no está en la imagen. `npm run deploy` falla en un servidor recién clonado, incluido el despacho del buzón | 07/10 | — | código + prueba (fase 0b) | **cerrado en la fase 0b** |
| H-31 | **La imagen final arrastra archivos del repo.** El file tracing de Next copia a `.next/standalone` lo que las rutas tocan con `fs`, y en la imagen quedan `src/` (3 MB de fuente), `tools/` (4.3 MB), `docs/`, `trayectorias/` (60 archivos de datos de sesiones), `inventario/`, `productos/` y `erp/` (`casa/huellas.txt`, `entrega.json`, referencias de roles y servidor). La cabecera del `Dockerfile` dice «la imagen final NO contiene código fuente». En el despacho la imagen vive en la máquina de un tercero, y lo defendible del ERP «no sale» (§1.7). Salió al arrancar por primera vez la imagen de la fase 0b; en `main` pasa igual | 07/10 | — | código: qué ruta necesita cada archivo en tiempo de ejecución, y fuera lo demás (`outputFileTracingExcludes`) + prueba que inspeccione la imagen | **cerrado** (ver «H-31, hecho») |

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
