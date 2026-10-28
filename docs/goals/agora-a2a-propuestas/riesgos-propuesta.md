# Propuesta de entradas para el registro de riesgo (C5): Ágora — fuera del registro

> **Estado: borrador sin firmar; la firma es del laboratorio.** Fecha: 2026-10-28. Goal `docs/goals/agora-a2a.md`.
> Redactado **fuera** de `.claude/gobernanza/REGISTRO-RIESGO.md`, que es append-only y no admite una entrada sin firma.
> Al firmarse, cada entrada se pega allá con la firma escrita por el laboratorio; las no firmadas no entran.
>
> Solo entran riesgos **propios**: el daño recae en el laboratorio o en la organización que opera Ágora, y en este goal
> esa organización es ficticia. Los que recaen en terceros están en la lista final y **no tienen vía de registro**.
>
> Las mitigaciones se escriben como deben quedar construidas: antes de pedir la firma, el agente del goal confirma cada
> una con su prueba y quita la que no exista. Una mitigación sin prueba no es vigente.

---

### 2026-10-28 — Ágora · C7 — la siembra de datos ficticios corre con `service_role`
- **Decisión**: la siembra del laboratorio (organización, socios, presupuestos y CFDI ficticios) corre con
  `service_role` como **job de plataforma declarado**; ninguna superficie de Ágora (buzón, tablero, costos, Puerta) lo usa.
- **Riesgo aceptado**: el job salta RLS. Si apuntara a una base real, escribiría datos ficticios en una organización real
  o leería todas.
- **Mitigaciones vigentes**: solo arranca con `AGORA_LABORATORIO=1` y contra el Postgres efímero propio del goal; se
  niega si encuentra una organización que no lleve la marca de ficticia; la llave nunca entra al proceso de la Puerta ni
  de la app (C3, P-10); `audita:secretos` en el `validate`.
- **Firmado por** (nombre y rol): pendiente
- **Vigencia / próxima revisión**: al primer despliegue fuera de la máquina, o si la siembra se reusa en otro producto.

### 2026-10-28 — Ágora · finanzas — la segregación de funciones se puede desactivar
- **Decisión**: la segregación (quien solicita no aprueba; quien aprobó un gasto no acepta su póliza) viene **activada**
  y la organización puede desactivarla solo por el freno de la capa (cita textual y clic), con la decisión registrada.
  En el laboratorio queda activada.
- **Riesgo aceptado**: una organización pequeña donde una sola persona pide, aprueba y acepta pierde el control que
  impide el fraude interno o el error sin segundo par de ojos.
- **Mitigaciones vigentes**: el disparador de la base la hace cumplir mientras está activa (C3, B-5); desactivarla deja
  un eslabón en la bitácora y una alerta permanente en el panel de Finanzas; el paquete para Contabilidad marca las
  pólizas aceptadas sin segregación.
- **Firmado por** (nombre y rol): pendiente
- **Vigencia / próxima revisión**: con la primera organización real que pida desactivarla (esa decisión es suya y va en
  su propio registro).

### 2026-10-28 — Ágora · gates — las suites en Postgres real fuera del `validate`
- **Decisión**: el hueco del CDC quedó lleno: `agora:pg` se propone **inactivo** (`motivo`: necesita Docker; `falta`: un
  perfil con Docker o un servicio Postgres en el CI). Se acepta que el `validate` no corra en cada build la variante en
  Postgres real de las suites de aislamiento entre organizaciones, RLS forzada, los malos financieros y el testigo del
  freno. La variante en PGlite (las mismas 124 pruebas y los mismos 80 sabotajes) sí corre, dentro de `prueba:tools`.
- **Riesgo aceptado**: una regresión de RLS o de un disparador puede pasar el `validate` en verde; solo la caza la
  corrida a mano o el perfil con Docker. Es «un control conocido pendiente».
- **Mitigaciones vigentes**: la variante en PGlite corre en `prueba:tools` (124/124, 80/80 sabotajes); la corrida en
  Postgres real 17.11 está en la evidencia del goal (`docs/goals/agora-a2a-evidencia/f8-pg.log`: 124/124 y 80/80); el
  padrón cuenta los inactivos aparte y nunca como pasados. Diferencia conocida entre motores: en el laboratorio el dueño
  de las funciones definer es superusuario; en Supabase no está medido (ver «lo que podría estar mal», punto 10).
- **Firmado por** (nombre y rol): pendiente
- **Vigencia / próxima revisión**: al existir el perfil con Docker, o antes de abrir la Puerta, lo que ocurra antes.

### 2026-10-28 — Ágora · topes y umbrales — valores de ejemplo, sin calibrar
- **Decisión**: el laboratorio opera con los valores de ejemplo del prototipo: umbral de aprobación de 100 000 MXN,
  tope de gasto de la organización de 8 000 MXN al mes, y por agente 60/600 mensajes por hora, 10/80 propuestas por día y
  300/3 000 MXN de modelo al mes (externo/interno).
- **Riesgo aceptado**: los números no salen de ningún uso real; pueden cortar de más o dejar pasar de más. En el
  laboratorio el gasto es simulado y no cuesta.
- **Mitigaciones vigentes**: aviso al 80 %; fail-closed al 100 % con lo que decide la app (C4 §5); la suma de topes de
  agentes no puede pasar el de la organización; subir sobre estos valores va a este registro (C5, punto 5).
- **Firmado por** (nombre y rol): pendiente
- **Vigencia / próxima revisión**: antes de la primera organización real; se calibran con su uso, no a ojo.

### 2026-10-28 — Ágora · libro de costos — tipo de cambio desde un fixture
- **Decisión**: en el laboratorio el tipo de cambio USD→MXN sale de un fixture que declara su fuente y su fecha (el FIX de
  Banxico como referencia), no de una consulta viva.
- **Riesgo aceptado**: las cifras en MXN del laboratorio son ilustrativas y envejecen con el fixture.
- **Mitigaciones vigentes**: cada cifra en MXN muestra el tipo de cambio, su fuente y su fecha; sin tipo de cambio la
  cifra es `null` y se declara (el mal financiero número 7, bloqueado por la base o el supervisor).
- **Firmado por** (nombre y rol): pendiente
- **Vigencia / próxima revisión**: al conectar una fuente viva, o antes de la primera organización real.

### 2026-10-28 — Ágora · agentes — el comportamiento con un modelo real no está medido
- **Decisión**: el coordinador, el analista y los especialistas internos se prueban solo con un modelo determinista
  inyectado; no se asigna clase de routing (CDC, punto 3).
- **Riesgo aceptado**: la aceptación, el retrabajo, el costo por propuesta aceptada y la resistencia a inyecciones
  medidos aquí no predicen lo que hará un modelo real.
- **Mitigaciones vigentes**: ningún agente aprueba ni aplica sin fila humana (lo hace cumplir la base, no el modelo); el
  supervisor es determinista; encender un modelo exige su CDC de routing, la revisión del C4 y el OK del laboratorio.
- **Firmado por** (nombre y rol): pendiente
- **Vigencia / próxima revisión**: en el CDC que asigne la clase al coordinador.

### 2026-10-28 — Ágora · buzón — fatiga de aprobación sin medición con personas
- **Decisión**: se opera con las mitigaciones de diseño contra el sello de goma («Espera tu clic» solo con lo tuyo,
  banderas arriba, propuestas agrupadas, A2 en lo reversible, resumen de conteos) sin medirlas con personas reales.
- **Riesgo aceptado**: la calidad de las decisiones de la organización puede bajar sin que ningún gate lo vea (C3, B-12).
- **Mitigaciones vigentes**: `horas_a_decision` y `retrabajo_pct` en el tablero; lo irreversible siempre por el freno.
- **Firmado por** (nombre y rol): pendiente
- **Vigencia / próxima revisión**: tras el primer mes de uso real.

---

## Lo que no es firmable (y por qué)

El dueño acepta riesgos propios, no los de otros (C5, «El límite»). En todos estos el daño recae en alguien que no
firma este registro; se rediseñan o no se hacen. Están también en la §6 de la AISIA.

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
