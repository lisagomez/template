# Plantilla de contrato de nivel de servicio — Soporte SAP

> **Plantilla de trabajo, no un contrato.** Cada cifra y cada cláusula legal es un hueco
> `[POR DECIDIR …]` que llena **el laboratorio** (y su asesoría legal), nunca un agente. La parte
> técnica (cómo se mide) no es un hueco: es la definición del reloj que usa el producto
> (`tools/soporte-sap/src/sla.ts`) y que ven las dos partes. Los datos de cada contrato viven
> versionados en `ss_contrato_sla` (`id`, `version`, `vigente_desde`).

Sirve para los dos niveles:

- **N1–N2**: el laboratorio con una consultora. El laboratorio solo compromete lo que controla: la
  respuesta a lo que la consultora le escala.
- **N2–N3**: una consultora con su cliente.

## 1. Partes

| | Nombre | Representante |
|---|---|---|
| Presta el servicio | [POR DECIDIR: razón social] | [POR DECIDIR: nombre y cargo] |
| Recibe el servicio | [POR DECIDIR: razón social] | [POR DECIDIR: nombre y cargo] |

## 2. Objeto

- N1–N2: la respuesta del laboratorio a los escalamientos de la consultora (sandbox, sala y núcleo
  de conocimiento).
- N2–N3: la atención de la consultora a las incidencias SAP del cliente.

[POR DECIDIR: redacción legal del objeto]

## 3. Prioridades y quién las asigna

La prioridad sale de la matriz ITIL de **impacto × urgencia** (P1 a P4). En N2–N3, **un agente
categoriza** la prioridad y el cliente puede **impugnarla**; la resuelve su consultora, a su nombre.
El cliente lo sabe por este contrato.

| Prioridad | Definición operativa |
|---|---|
| P1 | La operación crítica está detenida y no hay forma de rodearla. |
| P2 | Una operación productiva está gravemente afectada. |
| P3 | Una función falla y hay forma de rodearla. |
| P4 | Consulta o problema menor. |

[POR DECIDIR: redacción legal de las definiciones]

## 4. Metas por prioridad

| Prioridad | Respuesta | Resolución | Calendario | Referencia pública (no es una promesa) |
|---|---|---|---|---|
| P1 | [POR DECIDIR] | [POR DECIDIR] | [POR DECIDIR: 24×7 u hábil] | SAP Enterprise Support Schedule §2.1.1 a: SAP responde a sus licenciatarios en una hora, 24×7 |
| P2 | [POR DECIDIR] | [POR DECIDIR] | [POR DECIDIR] | §2.1.1 b: en cuatro horas, en horario local de SAP |
| P3 | [POR DECIDIR] | [POR DECIDIR] | [POR DECIDIR] | sin referencia pública |
| P4 | [POR DECIDIR] | [POR DECIDIR] | [POR DECIDIR] | sin referencia pública |

El contrato de laboratorio (`contratoDeLaboratorio`) usa las dos referencias de SAP **solo para
demostrar la medición**. Una meta sin decidir no se mide como incumplida: el reloj corre igual y la
pantalla dice «sin meta».

## 5. Cómo se mide (el reloj)

1. Arranca al **recibir** la incidencia, en el calendario de su meta: hábil (lunes a viernes,
   horario y feriados del contrato) o continuo (24×7). Lo recibido fuera de horario empieza a contar
   al abrir.
2. La **espera del cliente** pausa la resolución, desde que se le pide algo hasta que contesta. Lo que se le pide
   queda escrito y el cliente lo ve; su respuesta la registra **él mismo** (o su consultor), y puede impugnar una
   pausa.
3. **Resolver** detiene el reloj, también durante una espera.
4. Una **reapertura** lo reanuda desde la reapertura; el tiempo entre resolver y reabrir no cuenta.
5. Si la **prioridad cambia**, rige la meta de la nueva prioridad, contada
   [POR DECIDIR: desde la recepción | desde el cambio]. Un incumplimiento que **ya ocurrió** con la prioridad
   anterior se queda: cambiar la prioridad después no lo borra.
6. Sin respuesta y con el plazo vencido, la incidencia **ya incumplió**, aunque siga abierta.
7. Cada incidencia guarda sus tramos (corre, pausa, detenido) con el evento que abrió cada uno: es
   la evidencia de un incumplimiento. Fecha y actor de cada evento los da la base.
8. La **primera respuesta** es un mensaje de una **persona** de quien presta el servicio a quien lo recibe.
   Una acción automática (categorizar, anonimizar, preparar un plan, mandarlo a aprobación) no cuenta.
9. Si el servicio corre en un servidor de quien lo presta (**modo despacho**), la medición vive en su base: quien
   tiene root en ese servidor puede reescribirla. En ese modo, la medición **no es evidencia independiente** frente
   a quien recibe el servicio.

Calendario: horario [POR DECIDIR: días y horas], zona [POR DECIDIR], feriados
[POR DECIDIR: lista o referencia legal].

## 6. Escalamiento

| A quién | Cuándo |
|---|---|
| Consultor de la consultora | toda incidencia, al recibirla |
| Laboratorio (experto) | cuando **la consultora** lo escala, a su nombre (sin regla en el grafo, o un plan que pide aprobación en la sala). Un agente no escala |
| Superadministrador del laboratorio | un escalamiento sin respuesta del experto |

Plazos de escalamiento: [POR DECIDIR]

## 7. Reporte

El cumplimiento se publica con las **mismas métricas** que ven las dos partes (la capa semántica del
producto): cumplimiento de SLA de respuesta y de resolución, tiempo a la primera respuesta, tiempo
medio de resolución, backlog. Periodicidad del reporte: [POR DECIDIR].

## 8. Créditos por incumplimiento

[POR DECIDIR: si hay créditos, su cálculo, su tope y cómo se reclaman]

## 9. Exclusiones

[POR DECIDIR: lo que no cuenta como incumplimiento (por ejemplo, causas del lado del cliente) —
redacción legal]

## 10. Disponibilidad de la plataforma

[POR DECIDIR: el laboratorio **no compromete disponibilidad antes de cerrar GATE 3** (respaldo con
restauración probada). Hasta entonces RPO y RTO son desconocidos y así se dicen.]

## 11. Datos personales y transparencia

- En N2–N3, un agente categoriza las incidencias y el laboratorio ve **lo que la consultora le
  escala**; los originales, solo con un acceso motivado que otorga la consultora, por un tiempo
  máximo. El laboratorio ve además **agregados de operación** (métricas por consultora y por tamaño de
  cliente), sin textos ni nombres.
- Antes de que un caso sirva para aprender, se anonimiza. Lo que no se puede anonimizar con certeza, y
  todo caso de recursos humanos o nómina, **no sirve para aprender**: queda en cuarentena y su atención
  sigue igual.
- [POR DECIDIR: aviso de privacidad, responsable y encargado, transferencias — redacción legal]

## 12. Vigencia y versiones

Cada cambio es una **versión nueva** con fecha de inicio; la anterior no se edita. Una incidencia se
mide con la versión que regía al recibirla. Vigencia: [POR DECIDIR]. Terminación y entrega de datos
(export por tenant): [POR DECIDIR].

## 13. Firmas

| Parte | Nombre | Firma | Fecha |
|---|---|---|---|
| [POR DECIDIR] | [POR DECIDIR] | | |
| [POR DECIDIR] | [POR DECIDIR] | | |
