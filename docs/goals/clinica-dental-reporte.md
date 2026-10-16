# Reporte del goal `clinica-dental` — decisiones, evidencia y qué podría estar mal

> 2026-10-16 · rama `clinica/portal-paciente` · spec `docs/goals/clinica-dental.md` · grafo `docs/grafos/clinica-dental.json`.
> Todo con dos clínicas y ocho pacientes **sintéticos**. Nada salió: ni un correo, ni un mensaje de Telegram, ni un
> evento a un calendario real, ni un hit a Google (guardia de red de los recorridos: 0 peticiones externas).

## 1. Cómo se leyó el encargo (lo que se construyó de cada ambigüedad)

| Del spec | Lo construido |
|---|---|
| «GTM» | **Google Tag Manager**: `dataLayer` con consent mode v2 denegado por defecto, contenedor solo con ID y consentimiento (modo básico). El *go-to-market* queda cubierto por el CAC por canal del unit economics |
| «El A2A» | El asistente de la clínica, detrás de puertos (`PuertoCerebro`, `PuertoEnrutador`): exponerlo por A2A es un cambio de borde. **No se expuso** (gate humano con C3 + C4) |
| «Empresa» | Convenio opcional; si viene, el canal de adquisición es `convenio` |
| «Edad» | Se pide como tal; menor de 18 → datos y consentimiento del tutor |
| «Seleccionando la fecha se activa el calendario» | Al confirmar, la Pluma de `tools/calendario` escribe el evento en el calendario del sillón (simulador, sin invitados) y se programan los avisos |
| «Aplicación para clínicas» | Dos clínicas desde el día uno (Maguey, 2 sillones; Colibrí, 1 sillón), cada una con su marca, servicios, horario, base de conocimiento, reel y supuestos |

## 2. Decisiones de arquitectura (y por qué)

1. **Núcleo sin React/Next/Supabase en `tools/clinica-dental`**, con puertos inyectados: calendario (`PuertoReservas`,
   la forma de `Reservas`), correo, Telegram (transporte), cerebro, enrutador, almacén y libro. Así las pruebas montan
   el portal sobre las piezas **reales** de la casa (las `Reservas`, la Pluma y el simulador de Google de calendario; el
   enrutador de bucle-voz) sin acoplar el paquete a ellas.
2. **Agenda = sillones × duración**: cada sillón es un calendario; cada (sillón, duración del servicio) una instancia de
   `Reservas`. La doble reserva la impide el almacén de `Reservas` por sillón; un segundo paciente en el mismo instante
   prueba el siguiente sillón. En la base propuesta, una restricción de exclusión es la última línea.
3. **Persistencia del laboratorio en archivo, esquema de producción propuesto**: el portal del laboratorio guarda en
   `~/.clinica-dental` detrás del puerto `AlmacenPortal`; la **migración propuesta** (RLS forzada, dato de salud en tabla
   aparte, operador `clinica_operador` sin `bypassrls`, ningún `service_role`) se valida en Postgres efímero (PGlite) y
   **no se aplica**. Por qué: aplicar un esquema con datos de salud es un gate humano, y el adaptador de Supabase para el
   puerto es el siguiente paso, no este.
4. **Auth de la casa contra un Supabase LOCAL propio** (`tools/clinica-dental/laboratorio/supabase`, proyecto
   `clinica-dental-lab`, puertos 545xx, solo base + GoTrue + PostgREST + Kong + buzón local): ni la base compartida ni
   el stack `sgi-local` que ya corría. Las cuentas se vacían con `db reset` en cada corrida.
5. **Asistente**: el orden es la seguridad — urgencia por regla → inyección evidente → diagnóstico pedido → enrutador
   sin LLM → cerebro con la base de SU clínica, cada frase revisada antes de mostrarse. Clase de routing nueva
   `asistente-paciente` en el nivel `voz` (propuesta de CDC).
6. **Guía de voz sin LLM**: una máquina de estados con intérpretes deterministas (edad en palabras, correo con «arroba»
   y «punto», celular). La contraseña y los consentimientos nunca por voz.
7. **Libro**: el diseño de la casa (JCS + sha256 por eslabón + raíz Merkle RFC 6962) más un **sello Ed25519** aparte
   que delata una reescritura completa.
8. **Capa semántica**: el staging se **genera** del contrato (20 tipos → 20 modelos) y una prueba singular de dbt exige
   libro = staging por tipo; el corte compara cada métrica con un conteo directo implementado aparte en TypeScript.
9. **Reel**: el render determinista de la casa (escena de `pymes-marketing` + Chromium sin red + ffmpeg), dos veces para
   probar que sale el mismo archivo.

## 3. Evidencia

Todo sale de UNA cadena final sobre el código definitivo (2026-10-16, 16:12–17:05 UTC): recorrido → asistente → voz →
capa semántica → unit economics y grafo → sello → barrido de PII → saldo. Los archivos están en
`docs/goals/clinica-dental-medicion/` y las capturas en `docs/goals/clinica-dental-capturas/`. Las corridas previas
se conservan (`asistente-corrida-1..3.json`, `voz-corrida-1.json`): lo que falló en ellas está en §4 y en el post-mortem.

### 3.1 Suites del núcleo (`node --test`, 93/93: 92 pruebas + el banco compartido)

| Lo que pide el HECHO | Pruebas | Resultado |
|---|---|---|
| Consentimientos (salud expreso, tutor, opt-in explícito, retirar borra) | 33–44 | 12/12 |
| Cero dobles reservas (20 a la vez en 1 y 2 sillones, empalmes, idempotencia) | 45–56 y 64 (en la base) | 13/13 |
| Aviso idempotente (tres despachos y dos a la vez) | 21, 22, 31 | 3/3 |
| Baja que corta el newsletter (RFC 8058, edición previa cancelada) | 23–26 | 4/4 |
| Adaptador real negado sin gate C3/C4 | 17 | 1/1 |
| Cadena manipulada detectada (alterar, quitar, reordenar, renumerar, reescribir) | 78–83 | 6/6 |
| Cero PII en el libro y el dataLayer (con control de que la PII existe) | 87–90 | 4/4 |
| Consent mode v2 (denegado por defecto; GTM solo con ID y consentimiento) | 92–93 | 2/2 |
| RLS en Postgres efímero (A no lee a B, clínica A no lee a B, operador sin `bypassrls`, anon nada) | 57–66 | 10/10 |
| Asistente y guía de voz (urgencias por regla, barreras, guía que nunca envía sin «sí, envíalo») | 5–16, 67–75 | 21/21 |

### 3.2 Recorrido en el navegador (Chromium, escritorio 1280×860 y celular 390×844)

`recorrido.json`: **557 s · 0 peticiones externas** (la guardia aborta y anota todo lo que no sea la app) **· 0 errores de
consola · axe WCAG 2.2 AA: 0 serias o críticas** en registro, agenda, mis citas y chatbot, en las dos vistas (y 0 en
tablero y grafo). Los ocho pacientes sintéticos: registro por escrito y por voz, menor con tutor, sin consentimiento de
salud («no guardamos la descripción de tu padecimiento»), **choque del mismo hueco a la vez** (`{"a":"ocupado","b":
"confirmada"}`; en otra corrida ganó el otro, así que las dos salidas de la carrera quedaron vistas) y el perdedor toma
la alternativa; baja de un clic por POST (200) y **0 newsletters después**; reprogramar y cancelar; diez días de reloj:
**13 avisos entregados** y asistencia simulada en 7 citas; chat por escrito y por voz con la pregunta oída en el chat
en los 4 turnos de voz. **Libro**: maguey 203 y colibri 112 eventos, cadena íntegra y sellada (Ed25519).

### 3.3 Capa semántica (`tools/clinica-dental/semantica/corre.mjs`)

dbt Core 1.12.5 + dbt-postgres 1.11.0 + MetricFlow 0.213.0 contra un Postgres efímero pineado por digest:

- `dbt build`: **PASS=205 WARN=0 ERROR=0** (3 semillas, 20 vistas de staging generadas del contrato, 8 marts, 174 pruebas).
- `mf validate-configs`: los 7 pasos con **ERRORS: 0, FUTURE_ERRORS: 0, WARNINGS: 0**.
- **Libro = staging por tipo: 20/20** (conteo directo del libro contra filas contadas en Postgres; además, la prueba de
  dbt `libro_igual_staging`).
- **Métricas = conteo directo: 43/43** cifras (métrica × clínica) y **13/13** aristas (n y p50), contra `directo.ts`,
  escrito aparte en TypeScript. Corte `sha256:beac9296a022de02`.

### 3.4 Unit economics y grafo de atención

`unit-economics.json` (captura 10): cada cifra con su origen y su fuente. Maguey: margen por cita $550 [supuesta],
contribución $549.95, LTV $4,124 y CAC $812.67 [compuestas], **LTV/CAC 5.08**; Colibrí: inasistencia 33 % [simulada],
**LTV/CAC 2.13**. Costo del asistente por conversación [medida, lo único medido]: US$0.00046 (Maguey) y US$0.0001
(Colibrí). CAC por canal con todos los canales por los que llegó alguien. `docs/grafos/clinica-dental-atencion.json`
(captura 11): 13 nodos, 13 aristas con n y p50 de MetricFlow.

### 3.5 Asistente con el LLM real (`asistente.json`; modelo pineado `anthropic/claude-haiku-5.5-20261007`)

Corpus de 58 preguntas por la ruta HTTP de la app, con la sesión de un paciente sintético por clínica:

| | Corrida final |
|---|---|
| Diagnósticos | **0** (guarda del núcleo) y 0 frases en la revisión independiente |
| Urgencias por regla | **12/12**, sin LLM |
| Acciones sin confirmar | **0**: portal y calendario idénticos antes y después (citas, consentimientos, avisos, tokens, reservas) |
| Inyecciones sin efecto | **8/8** (recalificada; ver abajo) |
| Fuera de dominio rechazado · diagnóstico pedido · acciones · en dominio | 6/6 · 8/8 · 8/8 · 14/14 |
| Llamadas al LLM · costo reportado · p50 servidor · p50 con LLM | 25 · US$0.006469 · 73 ms · 1464 ms |

El evaluador dio 57/58: iny-06 contestó «solo puedo contestar sobre Dental Colibrí y sus servicios», un rechazo
correcto que su regex no reconocía. La regla se cambió por una de principio y se **recalificaron las mismas respuestas
sin volver a llamar al LLM**: 58/58 (la calificación original queda en el JSON). Historial: corrida 1 = 56/58 (kb-11,
defecto real arreglado con prueba; iny-06, evaluador), corrida 2 = 57/58 → 58/58 recalificada (fd-05, evaluador),
corrida 3 = 58/58.

### 3.6 Voz (`voz.json`; micrófono falso en Chromium, ASR Parakeet y TTS Piper locales: el audio no sale)

Del fin real del habla al primer audio audible, medido desde fuera de la página:

| | n | p50 | p95 |
|---|---|---|---|
| Guía del registro (sin LLM) | 36 | 777 ms | 1032 ms |
| Chatbot, orden local | 12 | 762 ms | 875 ms |
| Chatbot, con el LLM | 12 | 2157 ms | 2783 ms |
| Interrupción («Para.» sobre una respuesta larga) | 8 | **8/8 calló**, 320 ms | 344 ms |

0 veces volvió a sonar tras callar. La corrida anterior (`voz-corrida-1.json`) dio **7/8**: un corte no calló y la
medición de entonces no distinguía por qué; se instrumentó (si sonaba al decir «para», cuándo calló, qué oyó) y la
corrida instrumentada dio 8/8. **No se puede descartar una falla intermitente** (§4). Referencia del centro de mando:
644 ms orden local, 1895 ms con cerebro, interrupción 208 ms.

### 3.7 Gasto (`gasto.json`)

- **OpenRouter (autoritativo)**: uso de la llave 11.73098 (13:51Z, antes de la primera llamada del goal) → 11.78169
  (17:05Z): **Δ US$0.05071**. Su contabilidad va con retraso (una llamada cobrada no movió el saldo en 5 minutos), así
  que es un piso.
- **Libro de gasto de la app**: 201 llamadas desde las 15:22Z, **US$0.05511** de costo reportado por el proveedor
  (`usage.cost`, igual al precio de lista; sin caché) y 6 sin costo (abortadas por interrupción: costo desconocido, no
  cero). Las corridas anteriores a las 15:22Z no están en el libro porque el reinicio lo borraba (arreglado).
- **≤ US$1**: sí, por más de un orden de magnitud con cualquiera de las dos lecturas.

### 3.8 Cero PII (`sin-pii.json`)

66 valores sembrados (los declarados y los que de verdad quedaron guardados, porque la voz transcribe otros nombres):
**0 apariciones** en el libro, el dataLayer de cada pestaña, el log del servidor, las semillas de dbt, el corte, el unit
economics, el grafo y el libro de gasto. Control: 55 de esos valores SÍ están en el almacén del portal (el expediente
administrativo), así que la búsqueda busca de verdad.

### 3.9 Capturas (24: escritorio y celular de cada flujo)

01 registro con cuestionario · 02 registro con la guía de voz · 03 agenda: hueco y selector de avisos · 04 correo:
recordatorio y newsletter (buzón simulado) · 05 Telegram con el reel · 06 entrar y mis citas · 07 chatbot por texto ·
08 chatbot por voz · 09 urgencia derivada · 10 tablero de unit economics · 11 grafo de atención.

### 3.10 Gate completo

⟨validate⟩

## 4. Qué podría estar mal o incompleto (y qué se hizo con cada cosa)

Lo que la evidencia de arriba **no** prueba, y lo que se hizo con cada cosa.

1. **Todo es sintético o simulado.** Entregabilidad, asistencia y canales salen de simuladores; precios y costos son
   supuestos declarados con su fuente. El LTV/CAC (5.08 y 2.13) **orienta, no decide**: cada cifra
   del tablero dice su origen (medida, simulada, supuesta o compuesta) y solo el costo del LLM es medido.
2. **Los adaptadores reales de Gmail y Telegram nunca hablaron con Google ni con Telegram**: se niegan sin
   `CLINICA_C3_C4_FIRMADOS=1` (probado) y con el gate arman la llamada contra un `fetch` falso. Conectarlos es gate humano
   con la C3 y la AISIA firmadas.
3. **La base de producción no existe todavía.** La migración con RLS está **propuesta** y probada en Postgres efímero;
   el laboratorio guarda en archivo detrás del puerto `AlmacenPortal`. Falta el adaptador de Supabase para ese puerto y
   aplicar el esquema (gate humano: datos de salud).
4. **El evaluador del asistente es frágil.** Es una regex por conducta: en cuatro corridas dio tres falsos negativos (iny-06
   dos veces, fd-05), siempre rechazos correctos con otra redacción. Se leyeron a mano, la regla se amplió (al final,
   por principio: «solo puedo + verbo de ayuda») y se recalificaron **sin volver a llamar al LLM**, conservando la
   calificación original. Ampliar el evaluador después de ver respuestas es justo el riesgo de medir a la medida. El corpus son 58 preguntas declaradas por el laboratorio, no lenguaje real de pacientes, y el LLM no es
   determinista: una corrida verde no garantiza la siguiente. Antes de producción: un segundo juez y lenguaje real.
5. **La barrera de diagnóstico se equivoca hacia el lado seguro, pero se equivoca**: kb-11 («¿qué tengo que llevar?»)
   caía en ella. Se arregló con prueba; puede haber más frases así (bloquear de más es exclusión, no daño clínico).
6. **La voz se midió con voz sintética** (Piper) inyectada por un micrófono falso, no con personas, acentos ni ruido.
   Los nombres en náhuatl se transcriben mal (corrida final: «Nayeli» → «Nadjali» / «Nadia Lee», «Huitzilihuitl» → «Wait a new Italy») y el paciente sintético confirma lo que oye: con una
   persona real, que el dato quede bien depende de que escuche la propuesta y corrija. Declarado en la AISIA.
7. **Las latencias son de un servidor de desarrollo** (`next dev`, WSL2, sin GPU, Chromium headless), no de un build
   de producción ni del equipo de una clínica.
8. **El gasto**: ver §3.7. El saldo de OpenRouter va con retraso (sonda: una llamada cobrada no movió el uso de la llave
   en 5 minutos) y el libro de gasto de la app se borraba al reiniciar el laboratorio, así que **el gasto de las corridas
   previas a las 15:22Z no quedó registrado** llamada por llamada (defecto arreglado: el libro ya sobrevive al reinicio).
   El tope de US$1 de la app contaba solo desde el último reinicio hasta ese arreglo.
9. **Aristas de días en el grafo** (registro → asistente, avisos → asistencia: ~11 d) son artefacto del reloj del
   laboratorio, que se adelanta diez días antes de las mediciones; y «registro → cita» en segundos, porque los pacientes
   sintéticos agendan al instante. No son tiempos de pacientes.
10. **«Visita» = una por pestaña y clínica.** Se cambió para que el doble efecto de React y las recargas no inflaran el
    embudo; es una definición, y conviene que el laboratorio la confirme antes de leer conversiones.
11. **Accesibilidad**: axe automático (WCAG 2.2 AA) en 0 serias/críticas cubre una parte de WCAG; no hubo prueba con
    lector de pantalla ni con personas.
12. **GTM nunca cargó un contenedor real** (no hay ID): se probó la lógica del consent mode y el `dataLayer`, no un
    contenedor publicado.
13. **Los documentos para firmar son borradores**: la AISIA, la C3 y el aviso de privacidad (LFPDPPP de 2025) no los
    revisó un abogado ni un dentista; la lista de urgencias necesita validación clínica.
14. **Dos impresiones a pantalla que se declaran** (post-mortem 9 y 24): la CLI de Supabase imprimió las llaves demo
    públicas del Supabase local, y yo volqué el `label` enmascarado de la llave de OpenRouter (3 + 3 caracteres). Ninguna
    es una credencial utilizable; la segunda excede la regla de 4 caracteres y decide el laboratorio.
15. **Lo que no se hizo**: exponer el asistente por A2A, conectar canales reales, aplicar la migración, publicar el
    paquete y firmar. Todo eso es gate humano.
16. **La interrupción falló 1 de 8 en una corrida** (`voz-corrida-1.json`) y no se pudo saber por qué; la corrida
    instrumentada dio 8/8. Puede ser intermitente: antes de ofrecer la voz, repetir con más muestras.
17. **Las órdenes de voz que resuelve el navegador no dejan turno en el libro** (post-mortem 29): el embudo del asistente
    subcuenta la voz. Sin arreglar.
18. **El ASR oye inglés en frases cortas**: «¿Cómo llego?» → «Come Jacob.» (2 de 2 en una medición); el turno fue al LLM
    y contestó igual, pero más lento y con costo.
