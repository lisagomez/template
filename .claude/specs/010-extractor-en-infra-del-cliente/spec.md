# Spec 010 — El extractor documental en la infraestructura del cliente: OCR por capacidad, A2A y Hermes

> **Origen**: [`docs/GOAL-extractor-en-infra-del-cliente.md`](../../../docs/GOAL-extractor-en-infra-del-cliente.md),
> compilado con `/goal-compiler` el 2026-09-13; grafo del sistema en
> `docs/grafos/extractor-en-infra-del-cliente.json`. **Continúa** las specs 007, 008 y 009 (cerradas)
> y **construye** la 005 (A2A, hasta hoy en 0 de 16) con el extractor como capacidad real, tal como
> diseñó `docs/SDD-puente-a2a-extractor.md`.
>
> Esta spec cierra el **QUÉ**. El motor que va en la cola, el servidor de inferencia y la forma del
> contenedor viven en el plan y se deciden **midiendo**.

## Contexto y objetivo

Un cliente instala este template en **su propio VPS**. El proveedor lo elige él después y el
template no lo asume. Quiere extraer datos de documentos con texto plano y con texto embebido en
imágenes, sin que un byte salga de su perímetro, y quiere que sus agentes (Hermes) usen esa
capacidad como una herramienta más.

Hoy la herramienta existe y está medida: capa 0 para PDF con texto, lector de XML fiscal, códigos
QR y de barras primero, Tesseract por zonas a 197 páginas por minuto en CPU, y un motor de visión
de respaldo bajo una regla medida. Lo que **no** existe: un servicio contenedorizado que un cliente
levante con `docker compose up`; la confianza explicada por la evidencia que la sostiene; la
separación entre latencia por documento y rendimiento de lote; un esquema JSON por clase de
página; el puente A2A implementado; y Hermes consumiéndolo. La GPU se **considera un servicio del
VPS**: contemplada en el compose y medida por `configura:deploy`, sin ser requisito para arrancar.

## Usuarios / actores

- **La dueña del negocio** que despliega el template en su VPS: quiere `docker compose up` y que
  funcione con o sin GPU.
- **El operador** que mide y decide: necesita cifras por etapa y por hardware, no promesas.
- **Hermes** (agente del cliente): consume la capacidad y no tiene ninguna llave del extractor.
- **Un agente externo** (futuro, tras gate humano): descubriría la Agent Card y llamaría por A2A.
- **Los terceros** cuyos datos van en los documentos: no firman nada y son a quienes protege C4.

## Historias de usuario

- H1: Como dueña quiero levantar el extractor en mi VPS con un comando y que use la GPU si la
  hay, para no depender de nadie ni pagar por página.
- H2: Como operador quiero saber de qué evidencia sale la confianza de cada campo, para revisar
  solo lo que de verdad hay que revisar.
- H3: Como operador quiero la latencia por documento y el rendimiento de lote medidos por
  separado en mi hardware, para dimensionar sin adivinar.
- H4: Como integrador quiero un JSON con esquema por clase de página, para consumirlo sin traducir.
- H5: Como dueña quiero que Hermes pida extracciones por A2A sin tener llaves del extractor, para
  que un agente convencido no pueda hacer daño.
- H6: Como dueña quiero que exponer el puente fuera de mi red sea una decisión mía, no un efecto
  de desplegar.

## Requisitos funcionales (criterios de aceptación en EARS)

### Servicio OCR contenedorizado

- RF-1: EL SISTEMA ofrecerá el extractor como un servicio HTTP contenedorizado que arranca en
  una máquina sin GPU y responde en `/health` exactamente `{"status":"ok"}`.
- RF-2: CUANDO reciba un documento, EL SISTEMA lo leerá por la vía que le corresponde en este
  orden: capa 0 si el PDF trae texto, XML si es un comprobante fiscal, códigos antes que OCR,
  Tesseract por zonas, y el motor de respaldo solo bajo la regla del proyecto.
- RF-3: SI el motor de respaldo no está configurado o no responde, ENTONCES EL SISTEMA devolverá
  la lectura de las vías que sí funcionaron y declarará el respaldo como no disponible.
- RF-4: EL SISTEMA tratará la GPU como un servicio del VPS: el compose declara el servicio de
  inferencia con reserva de dispositivo, imagen pineada, límites y health, y `configura:deploy`
  detecta y escribe si hay GPU o no.
- RF-5: SI la máquina no tiene GPU, ENTONCES EL SISTEMA arrancará igual con la cola en CPU y
  declarará el servicio de GPU como no disponible, nunca como error.
- RF-6: EL SISTEMA mantendrá el adaptador de Mistral apagado por defecto y solo lo activará con
  una decisión de flujo de datos escrita (C4); sin ella lo mostrará como «no disponible: requiere
  decisión C4».

### Confianza por capas de evidencia

- RF-7: CUANDO devuelva un campo, EL SISTEMA dirá de qué evidencia sale su confianza: `codigo`
  (leído de un QR o código de barras), `exacto` (capa 0 o XML), `corroboracion` (dos lecturas
  independientes coinciden), `checksum` (el dígito verificador lo acepta) o `motor` (solo la
  estimación del OCR).
- RF-8: EL SISTEMA marcará `revision_humana` como verdadero en todo campo cuya única evidencia
  sea el motor, mientras no exista un umbral medido que diga otra cosa.
- RF-9: CUANDO haya un corpus con referencia, EL SISTEMA medirá la correlación confianza-error
  del motor y, SI es cercana a cero, ENTONCES EL SISTEMA no fijará umbral y lo declarará.

### Latencia y rendimiento

- RF-10: EL SISTEMA medirá y devolverá el tiempo de cada etapa por página (códigos, motor
  principal, respaldo) y por documento, separado del tiempo total del lote.
- RF-11: EL SISTEMA reportará la latencia por documento (p50 y p95) y las páginas por minuto de
  lote como dos cifras distintas, con el hardware en que se midieron declarado.

### Clasificación y esquema JSON por clase

- RF-12: CUANDO el proyecto declare un esquema por clase de página, EL SISTEMA estructurará los
  campos de cada página según su clase: claves esperadas presentes, faltantes declaradas, y
  claves no previstas conservadas aparte.
- RF-13: SI una página no encaja en ninguna clase declarada, ENTONCES EL SISTEMA la devolverá
  declarada como sin clase con sus campos crudos, sin forzarla a un esquema.
- RF-14: EL SISTEMA validará en la frontera A2A la salida contra un esquema explícito, y una
  prueba fallará si el JSON no encaja en los tipos del extractor.

### Puente A2A

- RF-15: EL SISTEMA servirá la Agent Card en la ruta que exporta el SDK instalado y con sus
  tipos, con dos skills: extracción con confianza por campo y lectura de comprobante XML sin
  verificar sello.
- RF-16: EL SISTEMA atenderá JSON-RPC A2A con `@a2a-js/sdk` pineado sin rangos, sin Express, y
  responderá con el tipo de contenido que el SDK declara.
- RF-17: EL SISTEMA expondrá exactamente tres rutas de servidor: la Card, el JSON-RPC y el
  health, y una prueba las enumerará y exigirá igualdad.
- RF-18: SI la capacidad está caída, la entrada es inválida u ocurre una excepción, ENTONCES EL
  SISTEMA devolverá una Task en estado fallido con razón legible en español, sin ruta interna,
  stack trace ni nombre de motor.
- RF-19: EL SISTEMA exigirá una clave de API por cabecera cuando esté configurada y declarará
  OAuth2, OIDC, mTLS y la gestión multi-partner como residual explícito.
- RF-20: MIENTRAS no exista gestión de credenciales por partner, EL SISTEMA no publicará el
  puente fuera de la red interna del compose; exponerlo es gate humano (spec 005, RF-12).
- RF-21: EL SISTEMA preservará la confianza por campo y la marca `revision_humana` al traducir
  la respuesta al protocolo: es la regla de oro de la capacidad.

### Hermes como consumidor

- RF-22: EL SISTEMA integrará Hermes (`nousresearch/hermes-agent`, pineado por digest) como
  servicio del compose que descubre la Card y pide extracciones por un puente MCP→A2A.
- RF-23: EL SISTEMA no entregará a Hermes ninguna llave del extractor, del almacén ni
  `service_role`: Hermes recibe respuestas.

### Medición

- RF-24: EL SISTEMA medirá sobre un corpus estratificado de al menos 100 páginas, y SI el corpus
  disponible es menor, ENTONCES EL SISTEMA marcará toda cifra como no concluyente.

## Requisitos no funcionales

- El núcleo del extractor sigue **sin dependencias** y `pruebas/contrato.ts` lo vigila; el
  servicio envuelve los adaptadores existentes, no los reescribe ni duplica la barrera.
- Ningún puerto nuevo publicado por Caddy: OCR, A2A y Hermes viven en la red interna.
- Modelo, imagen de Hermes y SDK **pineados**; alias autoactualizables rechazados al construir.
- Los documentos reales no entran al repositorio. Fixtures sintéticos, y lo dicen.
- Secretos nunca en pantalla: presencia, largo y a lo sumo cuatro caracteres.
- Todo en español salvo los identificadores que el protocolo exige literales.

## Casos límite

- Un documento que no se pudo procesar se declara, no desaparece.
- Un PDF cifrado o sin texto va al motor; un XML con `DOCTYPE` se rechaza de plano.
- Una página con dos valores para la misma clave (RFC del empleado y del patrón): se elige el
  que coincide con la referencia y el resto se aparta.
- El respaldo tarda más de cinco minutos en CPU: el corte de Node por `headersTimeout` se
  esquiva con un `fetch` con dispatcher propio, como ya documenta `traduceElCorte`.
- La GPU existe pero el runtime de contenedores no la expone: el servicio de GPU se declara no
  disponible con el motivo, y la cola sigue por CPU.
- Un consumidor A2A manda una petición sin cabecera de versión: el SDK asume 0.3 y la rechaza
  con razón legible; la Card declara 1.0.
- Un consumidor manda un documento de 100 MB: se rechaza por tamaño antes de tocar el motor.

## Impacto sobre terceros (control C4)

| Parte afectada | Daño con el sistema funcionando bien | Qué lo mitiga |
|---|---|---|
| Personas cuyos datos van en los documentos | Un byte que sale del perímetro hacia una API externa | RF-6: Mistral apagado por defecto; con datos de terceros ninguna firma lo autoriza (límite de C5) |
| El agente que consume (Hermes o externo) | Un 200 con dato inventado hace que actúe sobre algo falso, en casa de otro | RF-18, RF-21: Task fallida con razón, confianza y `revision_humana` preservadas |
| El operador | Una confianza que parece calibrada y no lo está llena o vacía la cola | RF-7, RF-8, RF-9: evidencia explícita y sin umbral hasta medir |
| Un tercero cuyo documento manda un partner | Hay datos de alguien que no firmó nada | RF-20: sin exposición externa sin gate humano; la AISIA de ese caso queda **pendiente y declarada** |
| Quien recibe una factura «leída bien» | Toma por auténtico un XML que solo se leyó | La Card y la respuesta dicen que el sello no se verifica |

## Fuera de alcance

- Exponer el puente a internet o a un partner (gate humano, spec 005 RF-12).
- Cuota y límite de tasa por partner: declarados como hueco, no resueltos.
- Autenticación más allá de una clave de API (OAuth2, OIDC, mTLS): residual explícito.
- Fine-tuning de ningún motor; manuscrito difícil como objetivo propio.
- Aplicar un modelo de datos a ninguna base: sigue siendo gate humano (spec 008).
- Cambiar `AGENTS.md`, un skill, un prompt o la configuración del agente: CDC aparte.

## Criterios de finalización

1. `npm run verifica:specs` en verde con esta spec dentro.
2. El servicio OCR arranca en Docker sin GPU y su health devuelve exactamente `{"status":"ok"}`.
3. `ocr-gpu` aparece en `docker compose config` con reserva de dispositivo e imagen pineada;
   `configura:deploy` reporta lo que detectó de GPU; en máquina con GPU se demuestra o se declara
   no medido.
4. Tabla de latencia p50/p95 por documento y etapa, y páginas por minuto de lote, contra la base
   de 197, con la marca «no concluyente» si el corpus es menor de 100 páginas.
5. JSON de salida con la evidencia de cada confianza, y la correlación confianza-error con su
   conclusión: umbral medido o sin señal.
6. Tres clases con esquema JSON y un documento sin clase declarado; la prueba contra los tipos
   del extractor en verde.
7. Agent Card servida, llamada JSON-RPC con confianza por campo, prueba de opacidad enumerando
   rutas, SDK pineado, y revisión de opacidad por un agente distinto del autor.
8. Hermes (imagen por digest) descubre la Card y recibe una extracción; su entorno sin llaves,
   enmascarado.
9. `docker compose config` muestra que solo Caddy publica puertos; Mistral apagado sin decisión C4.
10. `npm run validate`, `npm run prueba` y `npm run empaqueta extractor-documental` en verde.
11. Reporte de decisiones y lista de formas en que podría estar mal, resueltas.

## Dudas abiertas

- [NECESITA ACLARACIÓN] Corpus real del cliente: no existe todavía en este entorno. Toda medición
  sale del corpus sintético y se marca no concluyente hasta que la dueña aporte 100 páginas
  estratificadas, fuera del repositorio.
- [NECESITA ACLARACIÓN] Máquina con GPU para demostrar el servicio `ocr-gpu`: este entorno no la
  tiene. Queda declarado como no medido, con el compose y la detección listos.
- [NECESITA ACLARACIÓN] Cuál de los dos candidatos de cola (GLM-OCR o PaddleOCR-VL) gana en GPU:
  la diferencia publicada es ruido y se decide midiendo en la máquina del cliente.
