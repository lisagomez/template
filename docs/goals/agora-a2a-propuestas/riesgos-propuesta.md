# Propuesta de entradas para el registro de riesgo (C5): Ágora — fuera del registro

> **Estado: sin firmar; la firma es del laboratorio.** Redactado el 2026-10-28 y puesto al día el 2026-10-29. Goal
> `docs/goals/agora-a2a.md`. Va **fuera** de `.claude/gobernanza/REGISTRO-RIESGO.md`, que es append-only y no admite
> una entrada sin firma. Al firmarse, cada entrada se pega allá con la firma del laboratorio; las que no se firmen no
> entran, y este archivo se borra.
>
> Solo entran riesgos **propios**: el daño recae en el laboratorio o en la organización que opera Ágora, y en este goal
> esa organización es ficticia. Los que recaen en terceros están en la lista final y **no tienen vía de registro**.
>
> **Mitigaciones confirmadas el 2026-10-29, una por una contra el código.** Cada una nombra la prueba que la sostiene. Dos
> no existían y el laboratorio pidió construirlas antes de firmar: la guarda de la siembra (entrada 1) y la huella de la
> segregación quitada (entrada 2). Entran con sus pruebas y sabotajes.

---

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
- **Firmado por** (nombre y rol): pendiente
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
- **Firmado por** (nombre y rol): pendiente
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
- **Firmado por** (nombre y rol): pendiente
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
- **Firmado por** (nombre y rol): pendiente
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
- **Firmado por** (nombre y rol): pendiente
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
- **Firmado por** (nombre y rol): pendiente
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
- **Firmado por** (nombre y rol): pendiente
- **Vigencia / próxima revisión**: tras el primer mes de uso real.

---

## Lo que no es firmable (y por qué)

El dueño acepta riesgos propios, no los de otros (C5, «El límite»). En todos estos el daño recae en alguien que no
firma este registro: se rediseñan o no se hacen. Están también en la §6 de la AISIA.

| Riesgo | Por qué no se firma | Cómo se resuelve |
| --- | --- | --- |
| Un socio ve datos de otro socio, o de personas mencionadas en un hilo | Los datos son de quien no firmó | Alcance por categoría, respuesta de inexistente, y el hilo de un socio solo lleva lo que él puede leer |
| Un dato financiero de una organización real sale a un tercero (Despacho, socio, proveedor de modelo, espejo) | Para el laboratorio esos datos son ajenos; la decisión es de esa organización y de su C4 | Nada sale por defecto; cada salida con su C4 |
| Un agente paga, mueve dinero, asienta, cierra un periodo, aprueba o presenta ante el SAT | Es dinero o responsabilidad fiscal ajenos (regla de oro de ERP-5D) | La base no le da al agente el permiso; la póliza es propuesta |
| Un aviso a un tercero sin el freno | No se deshace y lo recibe quien no eligió | El freno de la capa, único |
| Métricas por aprobador usadas como evaluación individual sin decirlo | Son datos de desempeño de empleados | Métricas por rol y dominio; si son por persona, se le dice |
| Cortar a un socio sin aviso ni vía para pedir cupo | La víctima es el socio | El aviso y la vía de C4 §5 son parte del diseño, no una opción |
| Desactivar RLS o usar `service_role` en una superficie con más de una organización | Es fuga entre organizaciones: datos de terceros | No se ofrece; RLS forzada y rol de agente sin bypass |
| Abrir la Puerta sin C3 y C4 firmados | Expone a socios y a la organización, que no firman este registro | Las firmas y la doble firma del alta **son** el gate (C3 §6), no un riesgo que se acepta |
