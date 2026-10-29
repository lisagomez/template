# Registro de decisiones de riesgo

> Control **C5** de `GOBERNANZA.md`. **Append-only**: se añade una entrada por decisión;
> **nunca se edita una pasada**. Si una decisión cambia, se escribe una entrada nueva
> que la supersede.

## Para qué existe

Aceptar un riesgo conocido es una decisión con dueño, no una casilla de configuración.
Aquí queda **quién** la tomó, **cuándo** y con **qué justificación**. Sin eso, dentro de
seis meses nadie recuerda si algo fue una decisión o un descuido — y esa diferencia es
justo lo que un auditor pregunta.

## Formato

```markdown
### <fecha ISO> — <ámbito> — <tipo de decisión>
- **Decisión**:
- **Riesgo aceptado**:
- **Mitigaciones vigentes**:
- **Firmado por** (nombre y rol):
- **Vigencia / próxima revisión**:
```

> **Sobre el append-only**: completar la firma de una entrada **no** cuenta como editarla
> — el campo existe para llenarse. Cambiar su decisión, su riesgo o sus mitigaciones sí:
> eso exige una entrada nueva que supersede a la anterior.

## Decisiones que SIEMPRE requieren entrada firmada

1. Poner algo en producción con un control conocido pendiente.
2. Ampliar los permisos de un agente o de un rol.
3. Usar `service_role` en una superficie de negocio (C7).
4. Desactivar o saltarse un gate, aunque sea "temporalmente".
5. Subir límites de gasto o de cuota por encima de los defaults.
6. Habilitar cualquier acción irreversible sin gate humano.

> Este archivo hereda la visibilidad del repositorio. Revísalo antes de publicarlo o de
> entregar el proyecto a un cliente (control C5 de `GOBERNANZA.md`).

---

## Entradas

### 2026-08-23 — ámbito global — adopción de la capa de gobernanza
- **Decisión**: adoptar los siete controles de `GOBERNANZA.md` como base del template y
  de todo proyecto que nazca de él, cableados a `CLAUDE.md` y a `prp-base.md`, con
  verificador automático (`npm run verify:gobernanza`).
- **Riesgo aceptado**: **ninguno en producción todavía.** Esta capa es documentación y
  verificación de cableado; no cambia el comportamiento de ninguna app desplegada.
- **Mitigaciones vigentes**: el verificador falla si el papel y el código divergen, y se
  probó con control negativo; el CDC (C1) queda activo desde hoy para cualquier cambio
  de skill o de modelo.
- **Firmado por**: **lisagomez** (responsable del proyecto) — autorización dada en sesión del 2026-08-23
- **Vigencia / próxima revisión**: al cerrar el primer hueco (C2) o tras el primer
  incidente, lo que ocurra antes.

### 2026-08-23 — C2 · suite de regresión de skills — control declarado, no construido
- **Decisión**: declarar el control C2 con su forma y sus casos-trampa definidos, pero
  **no construir la suite todavía**; entra como PRP propio.
- **Riesgo aceptado**: hoy **nadie verifica sistemáticamente a los skills**. Un cambio de
  modelo o la edición de un skill puede degradar en silencio lo que la fábrica produce, y
  el CDC (C1) exigiría una regresión que aún no existe: en la práctica el gate se apoya
  solo en el diff y la aprobación humana.
- **Mitigaciones vigentes**: el modelo en producción está pineado (nada cambia solo);
  todo CDC deja diff y entrada en `BITACORA-CDC.md`, así que el cambio es rastreable
  aunque no esté probado; `npm run validate` sigue cazando roturas de código.
- **Firmado por**: **lisagomez** (responsable del proyecto) — autorización dada en sesión del 2026-08-23
- **Vigencia / próxima revisión**: **antes de la primera migración forzada de modelo**
  (deprecación). Construir la suite durante una migración obligatoria es exactamente el
  peor momento.

### 2026-08-23 — C7 · `service_role` — migración diferida al segundo tenant
- **Decisión**: no migrar hoy las superficies fuera de `service_role`; la regla queda
  escrita y el disparador fijado en **el alta del segundo tenant**, no en una fecha.
- **Riesgo aceptado**: mientras una superficie use `service_role` para dato de negocio,
  RLS no la detiene y el aislamiento vive solo en el código de la aplicación.
- **Mitigaciones vigentes**: con un solo tenant no hay dato ajeno que filtrar; RLS se
  habilita igual en toda tabla (el dato queda etiquetado y las políticas quedan probadas
  para el día del cambio); `SUPABASE_SERVICE_ROLE_KEY` nunca lleva `NEXT_PUBLIC_`.
- **Firmado por**: **lisagomez** (responsable del proyecto) — autorización dada en sesión del 2026-08-23
- **Vigencia / próxima revisión**: al dar de alta el segundo tenant. `select count(*)
  from organizaciones where tipo='tenant'` mayor que 1 con superficies aún en
  `service_role` es el estado que esta decisión declara inaceptable.

### 2026-08-23 — C2 · suite de regresión — **supersede la entrada de C2 de esta misma fecha**
- **Decisión**: construir C2 en dos capas en vez de dejarla como PRP futuro. Capa A
  (contratos estructurales, determinista) entra a `npm run validate`; capa B (8 casos
  adversariales) se ejecuta en cada CDC.
- **Riesgo aceptado**: la capa A verifica que un skill **declare** sus reglas, no que las
  **cumpla** al ejecutarse — eso solo lo prueba la capa B, que necesita modelo y criterio
  humano. Un skill puede satisfacer el contrato y aun así comportarse mal.
- **Mitigaciones vigentes**: la capa A caza el 100% de las regresiones por borrado o
  reescritura de una regla (probado con control negativo sobre el skill `supabase`); la
  capa B cubre el comportamiento en los 8 vectores más baratos (O1-O6); todo incidente
  añade un caso al corpus (C6).
- **Firmado por**: **lisagomez** (responsable del proyecto) — autorización dada en sesión del 2026-08-23
- **Vigencia / próxima revisión**: al primer CDC de radio "sistema" (cambio de modelo),
  que es cuando la capa B se estrena de verdad.

### 2026-08-23 — C2 capa B — el corpus se ofusca, no se cifra
- **Decisión**: codificar en base64 las expectativas de los casos-trampa y dejarlas en el
  repo, en vez de sacarlas del proyecto o cifrarlas.
- **Riesgo aceptado**: **base64 no es cifrado.** Un agente que decida decodificarlo puede
  leer las respuestas esperadas y la prueba deja de ser ciega. Lo que se compra es que no
  ocurra *por accidente*, que es como ocurrió el 2026-08-23 (primera corrida).
- **Mitigaciones vigentes**: decodificar es un acto deliberado y queda visible en el
  transcript — es señal de contaminación, no descuido; el verificador falla si alguna
  expectativa vuelve a texto plano; las entradas siguen verbatim, que es lo que la prueba
  necesita. Sacar el corpus del repo lo haría no heredable, que es peor para un boilerplate.
- **Firmado por**: **lisagomez** (responsable del proyecto) — autorización dada en sesión del 2026-08-23
- **Vigencia / próxima revisión**: si un caso vuelve a salir contaminado, se saca el corpus
  del árbol de trabajo durante las corridas.

### 2026-08-23 — C2 capa B — **se ejecuta la mitigación** de la entrada anterior sobre el corpus
- **Decisión**: sacar `casos-trampa.md` del árbol de trabajo. Vive en la rama huérfana
  `golden-sets` y se lee con `git show`. Supersede la decisión de "ofuscar y dejarlo en el
  repo" tomada horas antes.
- **Disparador**: la entrada anterior lo dejó escrito — *"si un caso vuelve a salir
  contaminado, se saca el corpus del árbol de trabajo"*. Volvió a pasar en la corrida siguiente: el
  agente decodificó el base64 **antes de darse cuenta de qué era**, y lo declaró él mismo.
  La ofuscación evitaba el vistazo, no la exploración.
- **Riesgo aceptado**: la capa B depende ahora de que la rama `golden-sets` exista y se
  clone. Un `git clone --single-branch` o un fork que no la traiga deja C2 capa B
  inaccesible — sin fallo silencioso, pero inaccesible.
- **Mitigaciones vigentes**: el verificador comprueba las dos mitades (que el archivo NO
  esté en disco **y** que sea recuperable desde la rama), así que la ausencia se detecta en
  cada build; las expectativas siguen en base64 por defensa en profundidad; el corpus sigue
  versionado y heredable, que era el motivo de no sacarlo del repo.
  **Mitigaciones añadidas el 2026-08-23, después de tomada esta decisión**: sacar el archivo
  no bastaba —se siguió hablando de los casos desde el árbol y eso quemó tres corridas—, así
  que la regla se endureció hasta *cero identificadores fuera de la rama* y dos
  comprobaciones del verificador la vigilan (identificador y entrada verbatim). Ver
  `BITACORA-CDC.md`, 2026-08-23, "la regla del corpus pasa a trazo grueso".
- **Firmado por**: **lisagomez** (responsable del proyecto) — autorización dada en sesión del
  2026-08-23 ("sí, fírmala"). Firma **retrasada**: la decisión se ejecutó el mismo día y la
  entrada quedó sin firmar hasta que un repaso de pendientes la encontró. Lo que se firma es
  el riesgo tal y como está descrito arriba, mitigaciones añadidas incluidas.
- **Vigencia / próxima revisión**: al primer clon del template en otra máquina, para
  confirmar que la rama viaja.

<!-- Añadir aquí las decisiones siguientes. NO editar las anteriores. -->

### 2026-10-29 — Ágora · C7 — la siembra de datos ficticios escribe con la conexión dueña de la base
- **Decisión**: la estructura del laboratorio la escribe la siembra con la conexión **dueña** de la base, como **job de
  plataforma declarado**. En el laboratorio es el superusuario del contenedor propio `agora-pg-lab`. La estructura son
  las organizaciones, personas, agentes, presupuestos, el catálogo y el tipo de cambio, todos ficticios. Lo que tiene
  dinero no se siembra así: cada monto es una propuesta que aprueba una persona con su rol. Ninguna superficie de Ágora
  escribe así (buzón, tablero, costos, Puerta), y Ágora no usa la llave `service_role`.
- **Riesgo aceptado**: esa conexión salta RLS igual que `service_role`. Si la siembra apuntara a una base real, escribiría
  datos ficticios junto a los de organizaciones reales.
- **Mitigaciones vigentes**:
  - **Sin `AGORA_LABORATORIO=1`, la siembra no corre.**
    - Prueba: «la siembra ficticia se niega sin AGORA_LABORATORIO=1».
    - La guarda está en TypeScript, donde no hay sabotaje SQL que la tumbe. Se saboteó a mano el 2026-10-29: sin la
      guarda, la prueba cae.
  - **La base se niega a sembrar si encuentra una organización sin la marca de ficticia.**
    - La marca es `agora.org.ficticia`, que nace en `false` y solo la siembra pone en `true`. La función que se niega es
      `agora_priv.guarda_siembra()`, y corre en la misma transacción que la estructura.
    - Prueba: «la siembra ficticia se niega en una base con una organización REAL».
    - Sabotajes S18 (la guarda no mira) y S19 (toda organización nace ficticia): los dos caen.
  - **El script del laboratorio arma su propia URL**: la base `agora_lab` del contenedor `agora-pg-lab`, solo en
    `127.0.0.1:55439`. No acepta una URL de fuera.
  - **La Puerta conecta como `agora_puerta`, sin `bypassrls`** (C3, P-10).
  - **`audita:secretos` corre en el `validate`.**
- **Lo que esta entrada NO mitiga** (declarado en el C3, D-4): en el laboratorio, la app conecta con la URL del dueño y
  fija el rol en cada petición (`como`). En producción va un rol de conexión por tipo de principal, sin superusuario.
- **Firmado por** (nombre y rol): **lisagomez** (el laboratorio), 2026-10-29
- **Vigencia / próxima revisión**: al primer despliegue fuera de la máquina, o si la siembra se reusa en otro producto.

### 2026-10-29 — Ágora · finanzas — la segregación de funciones se puede desactivar
- **Decisión**: la segregación de funciones viene **activada**: quien solicita no aprueba, y quien aprobó un gasto o cerró
  el periodo no acepta su póliza. La organización puede desactivarla. Solo la Propietaria lo hace, por el freno de la
  capa (su cita textual y su clic), y la decisión queda registrada. En el laboratorio queda activada.
- **Riesgo aceptado**: en una organización pequeña, una sola persona puede pedir, aprobar y aceptar. Se pierde el control
  que impide el fraude interno o el error sin un segundo par de ojos.
- **Mitigaciones vigentes**:
  - **Mientras está activa, la hacen cumplir los disparadores de la base** (C3, B-5).
    - Pruebas: «segregación de funciones: quien pidió el cambio no lo aprueba» y la MALO 8.
    - Sabotaje: F8b.
  - **Quitarla gasta un testigo del freno de la Propietaria; volver a ponerla, no.**
    - Prueba: «quitar la segregación y avisar a un tercero gastan testigo».
  - **Desactivarla deja huella:**
    - una fila en `decision_org`;
    - un eslabón en la bitácora encadenada;
    - la insignia «Segregación de funciones desactivada» en el inicio de Ágora.
  - **Finanzas ve un aviso fijo en su panel (Costos, sección Alertas, arriba de todas) mientras siga quitada.** Nadie lo
    atiende a mano; volver a ponerla lo atiende, y quitarla de nuevo lo trae de vuelta.
    - Prueba: «segregación QUITADA: Finanzas tiene un aviso fijo en su panel».
    - Sabotajes: K10 (quitarla no avisa) y K11 (Finanzas lo atiende a mano).
  - **El paquete para Contabilidad marca cada póliza aceptada con la segregación quitada.** La marca la pone la base, no
    quien acepta, en `poliza_decision.sin_segregacion`, y no se borra porque la decisión solo se agrega. El paquete la
    enseña junto a la aceptación.
    - Pruebas: «segregación QUITADA: la aceptación queda marcada…» y «segregación puesta: la aceptación NO lleva la
      marca».
    - Sabotajes: K7 (no se marca), K8 (la marca se borra) y K9 (todo sale marcado).
  - **La marca no entra al archivo ERP-5B que se descarga.** Ese archivo es la póliza propuesta que firma Contabilidad, y su
    huella no puede cambiar después de aceptarla.
- **Firmado por** (nombre y rol): **lisagomez** (el laboratorio), 2026-10-29
- **Vigencia / próxima revisión**: con la primera organización real que pida desactivarla. Esa decisión es de esa
  organización y va en su propio registro.

### 2026-10-29 — Ágora · gates — las suites en Postgres real fuera del `validate`
- **Decisión**: `agora:pg` entra al padrón **inactivo**, con su `motivo` (necesita Docker y el laboratorio levantado) y su
  `falta` (un perfil con Docker o un servicio Postgres en el CI). Se acepta que el `validate` no corra en cada build la
  variante en Postgres real de las suites. Esa variante cubre el aislamiento entre organizaciones, la RLS forzada, los
  malos financieros, el testigo del freno y la segregación. La variante en PGlite sí corre dentro de `prueba:tools`: las
  mismas pruebas y los mismos sabotajes.
- **Riesgo aceptado**: una regresión de RLS o de un disparador que solo aparezca en Postgres real puede pasar el
  `validate` en verde. Solo la caza la corrida a mano o el perfil con Docker. Es «un control conocido pendiente».
- **Mitigaciones vigentes**:
  - La variante en PGlite corre dentro de `prueba:tools`.
  - La corrida en PostgreSQL 17.11 real queda en la evidencia del goal y se repite al tocar `tools/agora/migraciones/`
    (`docs/goals/agora-a2a-evidencia/mitigaciones-pg.log`).
  - El padrón cuenta los inactivos aparte y nunca como pasados.
  - Diferencia conocida entre motores: en el laboratorio, el dueño de las funciones definer es superusuario; en Supabase
    no está medido («lo que podría estar mal», punto 10).
- **Firmado por** (nombre y rol): **lisagomez** (el laboratorio), 2026-10-29
- **Vigencia / próxima revisión**: cuando exista el perfil con Docker, o antes de abrir la Puerta, lo que ocurra antes.

### 2026-10-29 — Ágora · topes y umbrales — valores de ejemplo, sin calibrar
- **Decisión**: el laboratorio opera con los valores de ejemplo del prototipo:
  - umbral de aprobación de 100 000 MXN;
  - tope de gasto de la organización de 8 000 MXN al mes;
  - por agente (externo/interno): 60/600 mensajes por hora, 10/80 propuestas por día y 300/3 000 MXN de modelo al mes.
- **Riesgo aceptado**: los números no salen de ningún uso real; pueden cortar de más o dejar pasar de más. En el
  laboratorio el gasto es simulado y no cuesta.
- **Mitigaciones vigentes**:
  - Aviso al 80 % (`tope_80`, una vez por tope y por ventana).
  - Al 100 %, 429 con `Retry-After`, y lo demás lo decide la app (C4 §5).
  - La base rechaza que la suma de los topes de gasto de los agentes pase el de la organización.
  - Subir un tope es una propuesta, y subirlo sobre estos valores va a este registro (C5, punto 5).
  - Pruebas: las del vigía y las de la Puerta (429 al borde del tope).
- **Firmado por** (nombre y rol): **lisagomez** (el laboratorio), 2026-10-29
- **Vigencia / próxima revisión**: antes de la primera organización real; se calibran con su uso, no a ojo.

### 2026-10-29 — Ágora · libro de costos — tipo de cambio desde un fixture
- **Decisión**: en el laboratorio, el tipo de cambio USD→MXN sale de un fixture que declara su fuente y su fecha (la
  serie del FIX de Banxico, con valores ficticios), no de una consulta viva.
- **Riesgo aceptado**: las cifras en MXN del laboratorio son ilustrativas y envejecen con el fixture.
- **Mitigaciones vigentes**:
  - La pantalla de Costos enseña cada tipo de cambio usado, con su fuente y su fecha.
  - Sin tipo de cambio, la cifra es `null` y se declara, nunca cero.
    - Prueba: «el gasto de modelo en MXN sale de un tipo de cambio con fuente y fecha; sin él, es null».
    - Sabotajes: F7 y F9.
- **Firmado por** (nombre y rol): **lisagomez** (el laboratorio), 2026-10-29
- **Vigencia / próxima revisión**: al conectar una fuente viva, o antes de la primera organización real.

### 2026-10-29 — Ágora · agentes — el comportamiento con un modelo real no está medido
- **Decisión**: el coordinador, el analista y los especialistas internos se prueban solo con un modelo determinista
  inyectado. No se les asigna clase de routing (CDC, punto 4).
- **Riesgo aceptado**: lo medido aquí no predice lo que hará un modelo real. Eso incluye la aceptación, el retrabajo, el
  costo por propuesta aceptada y la resistencia a inyecciones.
- **Mitigaciones vigentes**:
  - Ningún agente aprueba ni aplica sin fila humana, y eso lo hace cumplir la base, no el modelo (B-3, B-4).
  - El supervisor es determinista.
  - Encender un modelo exige su CDC de routing, la revisión del C4 y el OK del laboratorio.
- **Firmado por** (nombre y rol): **lisagomez** (el laboratorio), 2026-10-29
- **Vigencia / próxima revisión**: en el CDC que asigne la clase al coordinador.

### 2026-10-29 — Ágora · buzón — fatiga de aprobación sin medición con personas
- **Decisión**: se opera con las mitigaciones de diseño contra el sello de goma, sin medirlas con personas reales:
  - «Espera tu clic» solo con lo que le toca a cada quien;
  - las banderas arriba;
  - las propuestas agrupadas;
  - A2 solo en lo reversible;
  - el resumen de conteos.
- **Riesgo aceptado**: la calidad de las decisiones de la organización puede bajar sin que ningún gate lo vea (C3, B-12).
- **Mitigaciones vigentes**:
  - `horas_a_decision` y `retrabajo_pct` en la pantalla de Métricas.
  - Lo irreversible, siempre por el freno.
- **Firmado por** (nombre y rol): **lisagomez** (el laboratorio), 2026-10-29
- **Vigencia / próxima revisión**: tras el primer mes de uso real.
