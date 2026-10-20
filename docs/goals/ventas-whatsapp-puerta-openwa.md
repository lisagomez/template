# Puerta de salida de OpenWA hacia el BSP oficial — Spec

> Compilado el 2026-10-20 con `/goal-compiler`. Alineación elegida por el laboratorio: **puerta de salida** (no OpenWA
> como transporte, no solo patrones, no uso interno con número propio).

## CONTEXTO (análisis del 2026-10-20)

**OpenWA** (github.com/rmyndharis/OpenWA, MIT, v0.25.0, ~15.8 mil estrellas): gateway autohospedado de WhatsApp en
NestJS. API REST de 161 rutas y 201 operaciones (casi todas bajo `/api/sessions/{sessionId}/…`: `messages/send-text`,
`send-template`, `send-image`, `send-document`, `send-bulk`, …), webhooks firmados con HMAC, multisesión, llaves con
alcance por sesión y por chat, dosificación de envíos (calentamiento, tope de conversaciones nuevas, cortacircuitos),
servidor MCP (25 herramientas de solo lectura por defecto, 51 con escritura) y SDK en cinco lenguajes
(`@rmyndharis/openwa@0.6.0` en npm, MIT, sin dependencias). Su documento 29 («Engine Capability Matrix») clasifica las
113 operaciones de su interfaz de motor `IWhatsAppEngine`, y a lo que un motor no soporta contesta **HTTP 501**.

**Se conecta a WhatsApp por clientes hechos por ingeniería inversa** (`whatsapp-web.js` con Puppeteer, o Baileys), no por
la Cloud API oficial. Su propio README: siempre hay riesgo de que Meta restrinja o banee el número, y para salud,
finanzas o datos regulados lo declara «no aprobado» y remite a la Cloud API oficial. Contrato pineado para este goal:
`openapi.json` de la v0.25.0, `sha256:fdb4bd3c7bb26b5ffd5d415d94c9eebdb6630de196c14c2d561a05b76a91789d`.

**El repo**: `tools/ventas-whatsapp` ya es un **BSP propio sobre la Cloud API oficial** (N-02: alta por Embedded Signup,
bóveda, factura y conciliación), con el transporte inyectado, un simulador de Meta (webhooks firmados, plantillas con
estado, ventana de 24 h, precios de México, Flows), frontera del número y laboratorio. OpenWA **no** puede ser transporte
de nada con terceros en este repo: los mensajes son de clientes de las pymes y, si Meta banea el número, el daño es suyo
(riesgo no firmable, AGENTS.md); además contradice N-02.

**Por qué una puerta de salida**: muchas pymes y herramientas (Typebot, Chatwoot, n8n) ya hablan la API de OpenWA. Si el
BSP oficial la habla también, migrar a la vía oficial es cambiar la URL base y la llave: OpenWA se vuelve la entrada de
clientes al BSP, en lugar de su competencia.

## MISIÓN

Quien hoy usa OpenWA (una pyme, un integrador, una herramienta hecha contra su SDK) apunta al BSP oficial del repo
cambiando **solo la URL base y la llave**, y lo que la vía oficial permite sigue funcionando igual: mismas rutas, mismas
formas de petición y respuesta, mismos eventos de webhook con la misma firma HMAC, pero por la Cloud API, con plantillas,
ventana de 24 h, opt-in y precios reales de México, y sin riesgo de baneo.

Lo que la vía oficial no permite **no se simula**: se contesta como OpenWA contesta lo que su motor no soporta (HTTP 501
con su forma de error) más la **alternativa oficial** concreta (fuera de la ventana: «usa la plantilla X»; mensajes en
frío: «solo con plantilla y opt-in»; QR para vincular: «liga de Embedded Signup»). Ningún éxito falso.

Al horizonte:
- **La matriz de compatibilidad**, generada del contrato pineado (nunca a mano): cada una de las 201 operaciones con su
  estado (igual · igual con diferencia declarada · imposible por la vía oficial, con su alternativa · fuera de alcance:
  administración de OpenWA como infra, plugins o Docker) y la fuente vigente de Meta que lo sostiene.
- **Sesiones = números del BSP**: crear una sesión da una liga de Embedded Signup en vez de un QR; su estado se lee del
  alta; `send-bulk` solo con plantilla, opt-in y la frontera del número.
- **Webhooks**: los eventos de la Cloud API traducidos a la forma de OpenWA y firmados como los firma OpenWA, para que un
  receptor hecho para OpenWA los verifique sin cambios; idempotencia y estados que solo avanzan, como ya hace el canal.
- **Llaves con alcance por sesión y por chat**, y la dosificación de OpenWA (calentamiento, tope de conversaciones nuevas,
  cortacircuitos) mapeada a la frontera del BSP.
- **Un panel «migrar desde OpenWA»** en el laboratorio: la persona describe lo que usa (rutas, eventos, la configuración
  sintética de su OpenWA) y recibe el informe de qué funciona igual, qué cambia y qué no existe por la vía oficial, con el
  costo por mensaje según la tarifa de México.
- Opcional, si el resto está hecho: el `/mcp` compatible en solo lectura por defecto, con las mismas llaves.

## LIBERTAD TÉCNICA

Eliges arquitectura, dónde vive la fachada (un punto de entrada nuevo de `tools/ventas-whatsapp`, rutas de la app o
ambos), cómo generas la matriz y cómo pruebas el contrato. Puedes evaluar también la vía inversa —un motor «cloud-api»
para OpenWA respaldado por el BSP—, pero publicarla río arriba es gate humano y no es el entregable de este goal. Lo
nombrado aquí es sugerencia, salvo RESTRICCIONES.

## INVESTIGA ANTES DE CONSTRUIR

La documentación vigente de la Cloud API de Meta (mensajes, plantillas y su categoría, ventana de 24 h, medios,
interactivos, catálogo, grupos si aplica, webhooks y firma, errores) y la de OpenWA (sus documentos 06 de API, 04 de
seguridad, 29 de capacidades y 24 de MCP, y cómo firma y entrega sus webhooks). Dos o tres referencias de fachadas de
compatibilidad entre APIs. Reafirma el objetivo en una línea antes de cada edición grande.

## DEFINICIÓN DE HECHO (evidencia visible en la conversación)

**Lecciones del goal anterior** (`clinica-dental-whatsapp`), que valen como reglas aquí:
- Los criterios se **fijan antes de medir** y no se precisan después de ver resultados; si un resultado incomoda, se
  cambia el producto o se reporta el rojo.
- Cada afirmación es sobre un **conjunto cerrado y nombrado** (las 201 operaciones del contrato pineado, los flujos del
  SDK listados abajo), nunca un «100 %» sobre un espacio abierto.
- Lo que no se puede demostrar en este goal se pega como **bloqueo con quién lo destraba**.

Lo que debe existir:
1. **Contrato pineado**: `openapi.json` v0.25.0 copiado con su `sha256` y su licencia MIT con atribución.
2. **Matriz generada**: 201/201 operaciones clasificadas con los criterios fijados antes de medir, cada fila con su fuente
   de Meta.
3. **Suite de contrato**: para cada operación declarada «igual» o «igual con diferencia», la petición y la respuesta se
   validan contra los esquemas del openapi pineado (el oráculo): n/n en verde.
4. **El SDK sin modificar**: `@rmyndharis/openwa@0.6.0`, versión exacta, apuntado a la fachada y contra el simulador de
   Meta, recorre: crear y listar una sesión (liga de alta en vez de QR); texto dentro de la ventana; texto fuera de la
   ventana → error declarado con la plantilla sugerida; plantilla fuera de la ventana; imagen y documento; recibir eventos
   de webhook y verificar su firma como lo hace un receptor de OpenWA. Salida pegada.
5. **Lo imposible no se simula**: una prueba recorre TODAS las operaciones clasificadas como imposibles y exige el error
   con forma OpenWA más su alternativa.
6. **Seguridad**: llaves por sesión y por chat; firma HMAC; idempotencia; dosificación y frontera; cero datos personales
   en logs; ninguna dependencia de `whatsapp-web.js`, Baileys ni Puppeteer en el lockfile (comprobado); guardia de red:
   cero peticiones a Meta o a una instancia real de OpenWA.
7. **Panel de migración**: capturas de Playwright en escritorio y celular del informe de compatibilidad con una
   configuración sintética.
8. **Gobierno**: revisión de la C3 de ventas por la superficie nueva (una API que integradores ajenos llaman) y propuesta
   de CDC de los textos y errores fijos, **sin firmar**, junto al spec; las rutas nuevas declaradas en `prueba:a2a`.
9. Las suites en verde con su conteo y `npm run validate` en verde **después del commit**.
10. Reporte: decisiones, cómo podría estar mal (diferencias entre el simulador y Meta, entre la fachada y OpenWA real), y
    qué se hizo con cada cosa.

## COMANDO DE VALIDACIÓN

`npm --prefix tools/ventas-whatsapp run prueba && npm run typecheck`, tras cada cambio grande, con el output pegado.

## RESTRICCIONES REALES

- Solo datos sintéticos. Nada sale a Meta (todo contra el simulador) ni a una instancia real de OpenWA. Nunca se conecta
  un número.
- Prohibido instalar o vendorizar `whatsapp-web.js`, Baileys, Puppeteer o cualquier cliente no oficial de WhatsApp.
- Versiones exactas: el contrato por su `sha256`, el SDK `@rmyndharis/openwa@0.6.0`.
- «Compatible con la API de OpenWA»: nunca presentarse como OpenWA ni usar su marca como propia; atribución MIT.
- Nada en `.claude/` ni `AGENTS.md`. Nunca escribir una firma. No publicar nada (npm, río arriba en OpenWA): gate humano.
- Sin LLM: el goal no lo necesita.
- Rama `ventas/puerta-openwa` en su propio worktree.
