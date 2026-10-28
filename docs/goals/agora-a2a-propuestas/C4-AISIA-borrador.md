# AISIA — Ágora: agentes que proponen sobre dinero, y socios externos por la Puerta — BORRADOR

> **Estado: borrador sin firmar; la firma es del laboratorio.** Fecha: 2026-10-28 · Control **C4**, sobre
> `.claude/gobernanza/plantillas/aisia.md`. Goal `docs/goals/agora-a2a.md`. Lo redactó un agente; ningún agente
> fabrica la firma.
>
> Lo que existe opera **solo en laboratorio**: una organización ficticia (Distribuidora Golfo Norte), socios ficticios,
> un socio **simulado** en la Puerta, un modelo determinista inyectado, voz solo local, y nada que salga de la máquina.
>
> Revisión: antes de una organización o un socio reales, al encender un modelo real, al decidir qué recibe el
> Despacho Fiscal Sierra, al conectar un espejo o el correo, al cambiar un tope por defecto, o tras un incidente.
>
> **aprobación humana ☐** · **Aprobado por**: pendiente

## 1. Partes afectadas

- **El equipo de la organización** (Propietaria, Administrador, Aprobadores, Editores, Colaboradores, Lectores): su
  trabajo queda en hilos y su nombre en cada aprobación. Quién aprobó qué, y en cuántas horas, es dato de desempeño.
- **El departamento financiero**: decide montos sobre el umbral con cifras que calcula Ágora.
- **El departamento contable**: acepta una póliza que no redactó y la asienta en su sistema, bajo su responsabilidad.
- **Los socios** (Medios Norte, Fletes del Golfo, Empaques Regio) **y la gente detrás de sus agentes**: sus cotizaciones
  y honorarios entran a Ágora, y un tope o una revocación los deja sin servicio.
- **El Despacho Fiscal Sierra** (observador externo, **en revisión**).
- **Terceros que no firmaron**: clientes, transportistas o empleados de un socio mencionados en un hilo; los emisores de
  los CFDI (su RFC y sus montos).
- **El laboratorio**, que opera Ágora. Con una organización real, sus datos **no son del laboratorio**: son de un tercero.

## 2. Qué ve cada agente y cada tercero

Propuesta por defecto, con minimización. Lo marcado **decide el laboratorio** no tiene default aceptado.

| Quién | Datos financieros | Datos de personas | Datos de socios | Cómo se hace cumplir |
| --- | --- | --- | --- | --- |
| Coordinador (interno) | Las cifras **ya calculadas** del libro en las categorías de su alcance; nunca las calcula | Nombres y roles de quienes participan en esos hilos | Lo que el socio escribió en el hilo de esa categoría | Token de tarea por alcance; rol `agora_agente`; RLS |
| Supervisor de reglas y supervisor financiero (sin modelo) | El payload de la propuesta y el presupuesto de su categoría, para validar | Ninguno más allá del autor | Ninguno más allá del payload | Solo lee lo que valida; su salida es un veredicto con la regla que falló |
| Analista financiero (interno) | Cifras ya calculadas del dominio Finanzas; propone escenarios, nunca cifras | Ninguno | Agregados, sin nombre de socio | Alcance del dominio Finanzas |
| Vigía | Consumo de topes; fechas de cierre | Dueño de cada ítem (para avisarle) | Huella de la tarjeta, estado del idCard | Lee contadores y huellas, no cuerpos de mensajes |
| Especialista interno | Montos de los ítems de su dominio | Los del hilo de su dominio | Los del hilo de su dominio | Alcance del idCard |
| **Socio externo por la Puerta** | Solo los montos de **sus** ítems y cotizaciones; **nunca** presupuesto, comprometido, ejercido, disponible, pólizas ni el libro | Solo quienes escriben en el hilo de su categoría (nombre y rol) | Solo lo suyo; nada de otro socio | Alcance por categoría y skill; respuesta de inexistente a lo demás. **Decide el laboratorio**: si ve el monto de sus ítems o ni eso |
| **Despacho Fiscal Sierra** | **Nada por defecto.** Opciones: (a) nada; (b) conteos y enlaces; (c) la póliza **aceptada** de un periodo **cerrado**; (d) la balanza de costos | Ninguno | Ninguno | **Decide el laboratorio** (es la decisión de C4 que pide el spec, no un default) |
| Espejos (no conectados) | Nada; si se conectan, propuesta: solo conteos y enlaces | Nada | Nada | Requiere su C3 y su C4 |
| Resumen hacia fuera | Solo conteos y enlaces, **ningún monto** | Ninguno | Ninguno | Esquema cerrado de la capa (`validaResumen`); en este goal no sale |
| Memoria de la capa | Nunca cifras | Preferencias de la persona (vista, workspace abierto, cuánto pregunta) | Nunca | El enchufe declara cada clave; mal de la capa número 6 |

## 3. Qué sale de la máquina y a quién

**En este goal: nada.** Cada salida posible, su estado y su condición para encender:

| Salida | A quién | Estado en este goal | Para encenderla |
| --- | --- | --- | --- |
| Llamadas a modelo | Proveedor (OpenRouter u otro) | Apagada: modelo determinista | CDC de routing (C8) + revisión de esta AISIA: qué texto sale, con qué tope de llave |
| Voz | Proveedor de voz en la nube | Apagada: `datosSensibles: true`, solo motores locales | No se enciende con datos financieros (C4 de voz, firmado el 2026-10-26) |
| Puerta A2A | El socio real | Cerrada: socio simulado, `127.0.0.1` | C3 §6 completa |
| Espejos | Slack, Telegram, correo | No conectados | C3 y C4 de ese canal, gate humano |
| Avisos a terceros | Socio o invitado por correo | Ninguno; pasa por el freno | Freno + C4 del canal de correo |
| Calendario externo | Google (adaptador `gog`, no medido) | No conectado | Prueba en vivo con cuenta de prueba |
| Póliza propuesta | Sistema contable del departamento | Archivo local en el contrato de ERP-5B | Lo asienta una persona de Contabilidad; Ágora no asienta ni presenta nada ante el SAT |
| Despacho Fiscal Sierra | Tercero | Nada | La decisión de §2 |

Prueba de que nada sale (propuesta para la fase 8): `sale: []` en cada enchufe de Ágora (`verifica:enchufes`) y un
recorrido con la red sin salida que cuente cero peticiones fuera del origen local, como se hizo con la mesa.

### 3.1 Lo construido que toca datos de personas o de socios (estado al 2026-10-28, laboratorio)

- **El Despacho Fiscal Sierra no recibe nada**: quedó en «en revisión», con techo A0, rol observador y `0` propuestas al
  día. Ningún enchufe de Ágora declara `sale`. La opción de §2 sigue siendo del laboratorio.
- **El testigo del freno** guarda la huella sha256 de lo que la persona escribe o dicta en la conversación, la hora de
  la base y, al usarse, la acción. **Nunca el texto.** Solo la persona lo ve (RLS), se poda a las 24 h y no es memoria
  ni hilo. No sale de la base.
- **La memoria de la capa** guarda solo preferencias (vista del tablero, workspace y categoría abiertos), en el
  navegador. Niega una clave que el enchufe no declara y un valor que parece monto (probado con mutación).
- **El resumen para la agenda** tiene 4 conteos y 1 enlace, sin montos ni texto libre (lo valida la capa), y no sale de
  la máquina.
- **La voz** es local (Parakeet, Piper, Silero), con `datosSensibles: true` y ningún adaptador de nube. Una composición
  con nube no compone (prueba).
- **Las métricas** se leen con la sesión de quien mira (vistas `security_invoker`): una persona de otra organización no
  suma ni una fila (prueba y sabotaje M3).
- **El vigía suspende** a un socio por deriva de su tarjeta sin preguntar. Es la única acción autónoma sobre un tercero,
  y es reversible: la Propietaria reactiva y queda el aviso con el motivo. Declarado en §4 como un daño posible si la
  deriva es legítima.

## 4. Daños posibles sin atacante

| Daño | Cómo ocurre operando «bien» | Severidad | Probabilidad | ¿Reversible? |
| --- | --- | --- | --- | --- |
| **Una aprobación sobre una cifra que miente por omisión** | El gasto de modelo no llega al libro y el ejercido sale menor | Alta | Media (es el fallo de convergencia del grafo) | Sí, si se detecta antes del cierre |
| **MXN con un tipo de cambio viejo** | El fixture tiene fecha y nadie lo actualiza | Media | Alta en el laboratorio | Sí |
| **Póliza aceptada sin leer** (O3) | Contabilidad confía en que «ya cuadra» y asienta una cuenta mal mapeada | Alta para la organización | Media | Solo con reclasificación en el periodo abierto |
| **Suspensión automática injusta** | El socio rotó su tarjeta de buena fe y el vigía lo suspende por deriva | Media para el socio | Media | Sí: la Propietaria lo reactiva |
| **Revocación que deja trabajo huérfano** | Los ítems del agente quedan sin responsable | Media | Media | Sí, reasignando |
| **El tope que corta a un agente** | Ver §5 | Media | Alta | Sí, pero la ventana perdida no vuelve |
| **Vigilancia de desempeño** | `horas_a_decision` y aceptación por aprobador se leen como evaluación de una persona | Media | Alta si la métrica es por persona | Parcial |
| **Un socio ve lo de otro** | Un alcance mal configurado en el alta | **Alta (terceros)** | Baja | **No** |
| **Un dato de un tercero mencionado en un hilo llega al socio** | El hilo de la categoría lo lleva y el socio lo lee | Alta (terceros) | Media | **No** |
| **Opacidad** | Alguien del equipo no distingue a un agente de una persona | Media | Baja (insignias humano/interno/externo, sello de externo) | Sí |

Mitigaciones de esta tabla: `null` no es cero y cada vista dice cuántas filas van sin costear; tipo de cambio con fuente
y fecha, y sin él la cifra en MXN es `null`; partida doble estructural y catálogo de cuentas como configuración que revisa
el contador; aviso de deriva a la Propietaria con reactivación de un clic; alerta al aprobador del dominio por cada ítem
huérfano; métricas de cuello de botella **por rol y dominio**, no por persona (propuesta); alcance revisado en la doble
firma del alta; y en el hilo de un socio solo se escribe lo que el socio puede leer (aviso visible en el compositor).

## 5. El tope que corta a un agente es una decisión con víctima

**A quién deja sin servicio**

- **Mensajes por hora** al 100 %: el agente no publica y la Puerta le responde 429. Detrás hay una persona del socio que
  esperaba una respuesta, o un equipo interno que esperaba un análisis.
- **Propuestas por día** al 100 %: la propuesta nueva se rechaza con su motivo; el ítem que la necesitaba espera.
- **Gasto de modelo por mes** al 100 %: no se llama al modelo y el agente sigue solo con reglas. Baja la calidad; las
  personas siguen atendidas.
- **Tope de la organización** al 100 %: todos los agentes pasan a reglas a la vez, incluido el que prepara el cierre.
- La víctima puede ser **un tercero**: el socio, cuyo trabajo se corta a media tarea por un límite que no fijó él.

**Quién lo decide**

- **El número** lo fija la organización: bajarlo, la Propietaria o el Administrador; subirlo, la Propietaria, y el de gasto
  también Finanzas. Cada cambio es una versión nueva del idCard. En el alta de un externo, el socio conoce sus topes.
- **Qué pasa al 100 %** lo decide **la app**, Ágora, y ya lo decidió el laboratorio el 2026-10-27: 429 con `Retry-After`,
  la propuesta se rechaza o el agente sigue con reglas. **Nunca se corta**: lo que espera el clic de una persona, el freno,
  ni «quiero hablar con una persona».

**Por qué lo decide la app y no el módulo**

El módulo que mide (`tools/sala-a2a/src/presupuesto.ts`, `src/lib/ai/contabilidad.ts`) no sabe quién está del otro lado
ni qué depende de esa llamada. Un corte dentro del módulo es una política escondida en una librería, aplicada igual a todo
producto que la reuse. El módulo mide, avisa al 80 % y es *fail-closed* para la llamada al modelo; **qué se degrada y qué
se protege** es de quien conoce a las personas, que es la app. Es la regla de AGENTS.md: negarle el servicio a alguien
para proteger la factura es una decisión con víctima, y la víctima se nombra donde se decide.

**Cómo se avisa**

- Al 80 %: un mensaje en el hilo de la categoría y en «Espera tu clic» de la Propietaria; el de gasto, también a Finanzas.
  Uno por tope y por ventana.
- Al 100 %: al agente, 429 con `Retry-After`; a las personas (incluidas las del socio, en su hilo), un mensaje del sistema
  que dice qué tope, desde cuándo, qué sigue funcionando y cuándo se reanuda.
- **Vía para subir el tope**: cualquiera, también el socio, lo pide como mensaje en el hilo; se vuelve propuesta que
  aprueban la Propietaria y, si es de gasto, Finanzas. Subirlo sobre los defaults va al registro de riesgo (C5).
- Se mide: `consumo_de_cuota_pct` y rechazos 429 por agente y por tope, en el tablero.

## 6. Riesgos infirmables (no van al registro de riesgo)

Recaen sobre quien no firmó; ninguna firma del laboratorio ni de la organización los autoriza. Se rediseñan o no se hacen:

1. Que un socio vea datos de otro socio, o de personas mencionadas que no firmaron.
2. Que salga a un tercero (Despacho, socio, proveedor de modelo, espejo) un dato financiero de una organización **real**
   sin la decisión de esa organización: para el laboratorio, esos datos son ajenos.
3. Que un agente pague, mueva dinero, asiente, cierre un periodo, apruebe o presente algo ante el SAT (dinero ajeno; la
   regla de oro de ERP-5D).
4. Un aviso a un tercero que no pase por el freno.
5. Usar las métricas por aprobador como evaluación individual de personas sin decírselo.
6. Cortar a un socio sin aviso ni vía para pedir más cupo.
7. Desactivar RLS o usar `service_role` en la Puerta o en el buzón con más de una organización.

## 7. Decisión

**Mitigar, y solo laboratorio con datos ficticios.** No se ofrece a una organización ni a un socio reales hasta: este
documento y el C3 firmados en una revisión que nombre al socio; la decisión sobre el Despacho (§2); la decisión sobre qué
ve un socio por la Puerta (§2); la prueba de que nada sale (§3); y, con un modelo real, su revisión aparte.

Firmada por: pendiente  Rol: pendiente  Fecha: pendiente
