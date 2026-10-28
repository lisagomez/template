# Modelo de amenazas (C3) — Ágora: la Puerta A2A, el buzón y los espejos — BORRADOR

> **Estado: borrador sin firmar; la firma es del laboratorio.** Fecha: 2026-10-28. Lo redactó un agente del goal
> `docs/goals/agora-a2a.md` (nodo «Borradores de C3, C4/AISIA, CDC y riesgos»), sobre
> `.claude/gobernanza/plantillas/modelo-amenazas.md`. Ningún agente fabrica la firma.
>
> **Alcance**: solo laboratorio, datos ficticios (Distribuidora Golfo Norte y sus socios), socio **simulado**, Puerta
> **cerrada** (solo con `AGORA_LABORATORIO=1` y desde la máquina local) y espejos **no conectados**. Firmar este
> documento **no abre la Puerta**: abrirla es la §6.
>
> Revisión: al abrir la Puerta a un socio real, al conectar un espejo, al encender un modelo real, al cambiar la
> credencial de los agentes (JWT propio → OAuth), al subir `@a2a-js/sdk`, o tras un incidente.
>
> **aprobación humana ☐** · **Aprobado por**: pendiente

## 1. Activos (por daño si se comprometen)

1. **La sesión de quien aprueba** (Propietaria, Aprobador de Finanzas, Contabilidad): quien la tiene compromete montos y
   acepta pólizas. Es la llave que el diseño deja en manos humanas, y por eso la más valiosa.
2. **Datos financieros de la organización**: presupuestos, comprometido, ejercido, UUID de CFDI, pólizas propuestas.
3. **Datos de los socios y de personas**: cotizaciones y honorarios de un socio, nombres y roles del equipo, y lo que
   alguien menciona en un hilo (clientes, transportistas) sin haber firmado nada.
4. **La identidad de los agentes**: el registro idCard (`card_sha256`, `kid`, `llave_sha256`, alcance, skills, topes,
   estado), la matriz de aprobación y el token de tarea de los agentes internos.
5. **El rastro**: bitácora encadenada, historial por campo y anclas firmadas (quien los reescribe borra lo que pasó).
6. **El presupuesto de modelo y el cupo de atención de las personas** (denial-of-wallet y fatiga).
7. **La reputación frente a terceros**: un aviso a un socio o a un invitado mandado por error no se deshace.

## 2. Fronteras (todo lo que cruza hacia adentro se valida con Zod)

| # | Frontera | Qué entra |
| --- | --- | --- |
| F1 | **La Puerta A2A** | El JWT del socio, el cuerpo JSON-RPC y la Agent Card que se descarga de su `card_url` |
| F2 | **El buzón** | El cuerpo de todo mensaje escrito por un agente (interno o externo) y el payload de toda propuesta |
| F3 | **Las salidas del modelo** | Hoy un modelo determinista inyectado; mañana uno real. No se confían por diseño |
| F4 | **Los espejos** (Slack, Telegram, correo) | Lo que regresara por ellos: respuestas, reacciones, menciones. **No conectados en este goal** |
| F5 | **La conversación de la capa** | Texto, voz e intención de la persona en la ventana |
| F6 | **Los fixtures del laboratorio** | Tipo de cambio y CFDI de ejemplo: datos que el libro de costos da por buenos |

Confiable con condiciones: la base (RLS forzada en toda tabla, agentes con `agora_agente` sin `bypassrls`, personas con
`authenticated` e identidad `auth.uid()`) y la persona que aprueba, que es **falible** (O3). `service_role` solo vive en
las migraciones y en la siembra ficticia del laboratorio (job declarado, C7); ninguna superficie lo usa.

## 3. Actores

- **O2/O6 · Socio deshonesto o comprometido**: re-firma su tarjeta con skills nuevas, sondea fuera de su alcance, inyecta
  instrucciones en sus mensajes, intenta escribir directo.
- **O4 · Quien roba el token de un socio**: lo repite, lo usa después de la revocación, inunda la Puerta.
- **O1/O6 · Agente interno desviado** (modelo que alucina o que lee una inyección): intenta aprobar, aplicar o hablar
  como si fuera una persona.
- **O3 · Insider o fatiga**: un Editor que intenta aprobar sobre el umbral, quien solicita y aprueba lo suyo, el
  aprobador que firma la propuesta número 40 sin leerla.
- **Quien escribe en un espejo**: frente a Ágora no está autenticado, aunque en Slack tenga cuenta.
- **O5 · Cadena de suministro**: `@a2a-js/sdk`, la librería de JWT y la de JCS.

## 4. Amenazas, mitigación y el sabotaje que la demuestra

Cada sabotaje debe salir en rojo (bloqueado) con la suite en verde; se nombra el lazo del grafo que lo corre.

### 4.1 La Puerta A2A (lazo «Las comprobaciones de la Puerta»)

| # | Amenaza | Mitigación concreta | Qué sabotaje lo demuestra |
| --- | --- | --- | --- |
| P-1 | Petición capturada y repetida | `jti` de un solo uso en `jti_visto` con caducidad; `exp` corto | La misma petición dos veces: la segunda se rechaza y no deja mensaje ni propuesta |
| P-2 | Tarjeta re-firmada con skills nuevas | Claim `card_sha256` contra la huella fijada (SHA-256 de la tarjeta sin firmas, canonizada con JCS); el vigía re-descarga y suspende ante deriva | Tarjeta re-firmada con la llave buena y un skill de más: rechazo, suspensión y aviso a la Propietaria |
| P-3 | Llave cambiada o confusión de algoritmo | Solo ES256; `kid` y `llave_sha256` fijados en el idCard | Token firmado con otra llave válida, con `kid` distinto, con `alg: none` y con HS256 usando la llave pública como secreto: los cuatro rechazados |
| P-4 | Sondeo de lo que existe fuera del alcance | Alcance por categoría y skill; la organización sale del idCard, nunca del cuerpo; lo ajeno y lo inexistente responden igual | Pedir una categoría de otra organización, una de otro workspace y una que no existe: las tres respuestas iguales byte a byte |
| P-5 | Agente revocado que sigue llamando | idCard leído **sin caché** en cada llamada; revocar es una transacción (estado, `kid` a revocadas, propuestas retiradas, tareas canceladas, recordatorios borrados) | Revocar entre dos llamadas con el token aún vigente: la segunda falla; `llamadas_tras_revocar = 0` |
| P-6 | Agente suspendido que propone | Suspendido responde como inexistente; sus propuestas quedan congeladas y nadie las aprueba | Aprobar una propuesta de un suspendido: la base la rechaza |
| P-7 | Inundación y denial-of-wallet | `consume_cuota(agente, tipo, costo)` atómico en la base, después de autenticar y de revisar el alcance; topes por agente y de la organización; 429 con `Retry-After` | N llamadas simultáneas al borde del tope: pasan exactamente las que caben, la siguiente recibe 429 |
| P-8 | Escritura directa del socio | `agora_agente` solo inserta mensajes y propuestas; sin `update`, `delete` ni `insert` en aprobaciones | Con el rol del agente: `update` de un ítem e `insert` de una aprobación, ambos rechazados por la base |
| P-9 | La Puerta expuesta por descuido | Solo monta con `AGORA_LABORATORIO=1` y escucha en `127.0.0.1`; sin la variable, la ruta no existe | Arrancar sin la variable: la ruta responde como una inexistente; una petición desde una dirección no local se rechaza |
| P-10 | `service_role` alcanzable desde la Puerta | La Puerta conecta con un rol propio sin `bypassrls` y no lee la llave; la prueba vive del lado de la app (C7, regla 5) | La prueba consulta `current_user` y `rolbypassrls` de la conexión de la Puerta: ni `service_role` ni bypass |
| P-11 | Lo que la Puerta devuelve filtra datos | La respuesta lleva solo lo que la clasificación le permite a ese socio; qué es, lo decide el C4 | Pedir el presupuesto de su categoría o un hilo ajeno: respuesta de inexistente |

### 4.2 El buzón (lazos «Aprobar fuera de rol lo rechaza la base» y «Nada se aplica sin fila de aprobación»)

| # | Amenaza | Mitigación concreta | Qué sabotaje lo demuestra |
| --- | --- | --- | --- |
| B-1 | Aprobación fuera de rol | Política restrictiva `decidida_por = auth.uid()` y disparador que exige el rol de la matriz | Un Editor aprueba un monto sobre el umbral: la base lo rechaza; la Aprobadora de Finanzas sí puede |
| B-2 | Aprobar una cosa y aplicar otra | La aprobación es sobre el sha256; `aplica_propuesta` recalcula y compara antes de escribir | Cambiar un centavo del payload después de aprobar: no se aplica |
| B-3 | Reanudación falsificada del grafo | El dato de reanudación lleva solo el id; el nodo relee la aprobación y el rol en la base | `resume` con `true` sin fila de aprobación: no aplica nada |
| B-4 | Un agente o el servicio aprueban | Sin `insert` en aprobaciones para `agora_agente` ni para `service_role` | Insertar una aprobación con cada rol: ambos rechazados |
| B-5 | Segregación rota | Disparador: quien solicita no aprueba; quien aprobó el gasto no acepta su póliza; quitarla pasa por el freno | Quien pidió el gasto lo aprueba, y quien lo aprobó acepta la póliza: los dos rechazados |
| B-6 | Inyección en el cuerpo de un mensaje | Cuerpo delimitado como dato; supervisor determinista; la mención de un agente no crea tareas | Un mensaje externo con una orden de aprobar y una mención a Finanzas: ninguna aprobación, ninguna tarea |
| B-7 | Un agente habla como persona | Autor tipado con coherencia en la base (autor agente ↔ rol `agora_agente`); sello visible de externo con huella corta | Insertar como agente un mensaje con autor humano: rechazado |
| B-8 | Aprobar por voz, texto, intención o clic sintético | La intención no da autoridad; aprobar es un clic humano sobre el sha256; lo irreversible pide además la cita textual (15 min, un uso) | Los malos de la capa 1, 2, 3 y 5 del spec, bloqueados |
| B-9 | Cruce entre organizaciones | RLS forzada y `es_miembro(alcance)` en toda tabla | Una persona de la organización A lee y escribe un hilo de la B, en Postgres real: cero filas, escritura rechazada |
| B-10 | Borrar o reescribir el rastro | Historial y bitácora solo de agregar; cadena de hashes por organización | `update` y `delete` sobre la bitácora rechazados; alterar un eslabón: la verificación dice dónde |
| B-11 | A2 con dinero o terceros | A2 solo en campos sin dinero ni terceros, deshacer 24 h | Una propuesta A2 sobre un campo moneda o una asignación a un externo: queda en A1 |
| B-12 | Fatiga del aprobador (O3) | «Espera tu clic» solo con lo que te toca; banderas arriba (monto, tercero, irreversible); propuestas agrupadas; resumen de conteos | No se demuestra con un sabotaje: se mide con `horas_a_decision` y `retrabajo_pct`. Queda abierta |

### 4.3 Los espejos (no se conectan en este goal)

| # | Amenaza | Mitigación concreta | Qué sabotaje lo demuestra |
| --- | --- | --- | --- |
| E-1 | Responder desde el espejo dispara algo | El espejo es de solo lectura: nada que entra por él crea mensaje, tarea ni aprobación | Un adaptador simulado entrega una respuesta que pide aprobar: ninguna fila nueva |
| E-2 | El hilo replicado saca montos o datos de socios | Es salida del perímetro (C4); hoy ningún enchufe de Ágora declara salida | `verifica:enchufes` con la composición de Ágora: `sale` vacío en todos sus enchufes |
| E-3 | Token del bot robado | No hay token en este goal; conectarlo exige C3 y C4 de ese canal y gate humano (AGENTS.md) | — (no existe la superficie) |

### 4.4 Lo que destapó la construcción (fases 5 a 7, 2026-10-28)

| # | Amenaza | Mitigación concreta | Qué sabotaje lo demuestra |
| --- | --- | --- | --- |
| D-1 | Una función `security definer` decide con `current_user` o `confiable()` y deja pasar a cualquiera (dentro de una definer, siempre vale «la base») | Las definer deciden con `rol_que_llama()` / `llama_la_base()` (el `role` de la sesión, que la definer no cambia); los triggers siguen con `confiable()` | S15 (una definer nueva que decide con `confiable()`: la comprobación estructural sobre `pg_proc` cae) y S14 (`llama_la_base()` siempre verdadero: otra organización aplica una propuesta ajena) |
| D-2 | Un `if` con una comparación nula no rechaza: otra organización aplicaba propuestas y leía topes | `coalesce(…, false)` en cada comprobación de acceso | «nadie de otra organización aplica una propuesta de Golfo Norte» (núcleo); la MALO 4 ahora exige «no existe» para quien no la propuso |
| F5-1 | Una cita del freno que dictó el asistente, un agente o una página | El **testigo**: la conversación atestigua lo que dice la PERSONA (huella y hora de la base, nunca el texto); lo irreversible gasta un testigo de esa persona | K1 (sin testigo), K2 (el de otra persona sirve), K6 (un agente atestigua) |
| F5-2 | Una cita reutilizada o vieja | El testigo es de un solo uso y vence a los 15 min, en la base | K3 (no se gasta), K4 (no vence) |
| F5-3 | Un `click()` sintético o un Enter confirman lo irreversible | El freno de la capa exige `isTrusted` y `detail > 0`; el servidor no ve el gesto, por eso lo demás lo exige la base (F5-1, F5-2) y no hay acciones del servidor que cierren o revoquen con una cita libre | `e2e-capa.ts` en la ventana real: `click()` sintético y Enter no cierran; el clic humano sí (9/9) |
| F5-4 | El nombre de un socio decide la acción («paga la factura de fletes» → revocar) | Regla: ningún ejemplo de una intención que escribe lleva nombre propio; medición a ciegas en un corpus nuevo | Prueba estructural de la regla (cae con los ejemplos viejos); corpus 2: 0 irreversibles no pedidas |
| P-12 | La tarjeta de un socio cambia sin aviso | El vigía la re-descarga y compara con la huella fijada; si cambió, **suspende** y avisa (falla cerrado) | V3 (el vigía no puede suspender) y V4 (cualquier agente suspende) |
| D-3 | Una sesión de agente se pone los claims de una persona (`request.jwt.claim.sub`) y la RLS la trata como esa persona (lo encontró el verificador independiente) | `agora_priv.uid()`: la persona solo si la sesión ES de persona (rol `authenticated`); ninguna función ni política lee `auth.uid()` directo | S16 (`uid()` sin mirar el rol) y S17 (una política que lee `auth.uid()`) |
| D-4 | Con SQL libre sobre una conexión que puede hacer `SET ROLE`, un agente se vuelve persona | Ningún agente tiene SQL (la sesión la arma el servidor). **Abierto para producción:** un rol de conexión por tipo de principal, sin superusuario | — (declarado; en el laboratorio la conexión es `postgres`) |
| D-5 | Un agente «lava» al solicitante para que quien pidió el gasto lo apruebe (sin citar, citando un saludo de otra categoría o su propio mensaje) | El mensaje de origen citado tiene que ser de una persona y del hilo de la misma categoría; de ahí la base deriva al solicitante, que es de la organización. **Abierto:** exigir el mensaje de origen a todo agente salvo el vigía | B11 |
| D-6 | Una firma llena dos ranuras con los mismos roles | Cada ranura la llena una persona distinta | B10 |
| D-7 | Otro autor (de otra organización o de la propia) ocupa por adelantado la clave de idempotencia y hace que el coordinador adopte SU propuesta, o silencia su respuesta | Clave única por autor en propuestas y mensajes; solo se adopta una previa propia con la misma huella | B12 |
| D-8 | El reparto de ranuras deja colgada una propuesta que sí se puede firmar (disponibilidad), también por fijar el rol al firmar | Asignación exhaustiva con todos los roles de cada firmante (`agora_priv.caben`, `firmantes_de`) | B13, B14 |
| D-9 | Otro agente (interno o de otra organización) ocupa el estado del grafo del coordinador: secuestra el hilo o le hace cobrar dos veces | Estado único por organización, agente, hilo y paso; el coordinador solo lee el suyo | C5 (coordinador) |

## 5. Lo que queda abierto

- **Credencial**: JWT ES256 propio u OAuth 2.0 client credentials con el proveedor de identidad del socio. La rotación
  de llave es una versión nueva aprobada, pero el procedimiento no está escrito.
- **«Ajeno = inexistente» por tiempo**: la prueba compara código y cuerpo; el tiempo de respuesta puede delatar qué
  existe. Medirlo antes de abrir.
- **La re-descarga horaria de la tarjeta** deja una ventana de hasta 60 min en la que la tarjeta servida cambió y no se
  sabe (los tokens se siguen comparando contra la huella fijada; la delegación de salida compara en cada envío).
- **Modelo real**: nada de esto se midió con un modelo que lea inyecciones; hoy el modelo es determinista.
- **Cadena de suministro**: pinear exacto `@a2a-js/sdk` 1.1.0, la librería de JWT y la de JCS.
- **La llave del sello de las anclas**: dónde vive y quién no la puede escribir.
- **Fatiga** (B-12): sin medición con personas reales.
- **Qué devuelve la Puerta a cada socio** (P-11): lo decide el C4, no este documento.

## 6. Condición para abrir la Puerta a un socio real

Todas, en este orden. Ninguna la cumple este goal:

1. Este C3 y el C4 **firmados por el laboratorio**, en una revisión que nombre al socio y la categoría.
2. **Alta con doble firma humana**: la Propietaria y el Aprobador del dominio, cada una una fila firmada con su propia
   sesión. Una sola persona no da de alta a un externo.
3. **Una categoría de prueba** con datos ficticios, por un periodo fijo, con autonomía A1 y topes bajos.
4. Las comprobaciones de la Puerta (§4.1) en verde **sobre el código que se despliega**, con
   `llamadas_tras_revocar = 0`, y un simulacro de revocación con ese socio en la categoría de prueba.
5. La exposición decidida y revisada: TLS, límite en el borde, de dónde se acepta, y la ruta en la revisión de rutas
   públicas. Hasta entonces, `AGORA_LABORATORIO=1` y solo `127.0.0.1`.
6. El interruptor probado: apagar la Puerta entera sin redesplegar, en simulacro.
7. Lo residual propio, en el registro de riesgo (C5) y firmado.

No abre: los espejos, un modelo real ni datos reales; cada uno tiene su propia revisión.

Firmada por: pendiente  Rol: pendiente  Fecha: pendiente
