# Puerta de salida de OpenWA — reporte

> Goal `docs/goals/ventas-whatsapp-puerta-openwa.md` · rama `ventas/puerta-openwa` · 2026-10-20 · solo laboratorio.
> Propuestas sin firmar junto al spec: `ventas-whatsapp-puerta-openwa-c3.md` y `ventas-whatsapp-puerta-openwa-cdc.md`.
> Capturas: `ventas-whatsapp-puerta-openwa-capturas/`.

## Qué quedó

La API de OpenWA 0.25.0 servida sobre el BSP de `tools/ventas-whatsapp` (`./openwa`), para que quien usa OpenWA
(WhatsApp Web o Baileys, no oficiales) pase a la Cloud API cambiando `baseUrl` y `apiKey`. Lo imposible por la vía
oficial contesta 501 con la alternativa oficial y su fuente; lo que cambia, 422/409 con la razón. La app la sirve en
`/api/ventas-whatsapp/openwa` y el panel de migración vive en `/migracion-openwa`.

## Lo medido (criterios fijados antes de medir, sobre conjuntos cerrados)

| Conjunto cerrado | Resultado | Dónde |
|---|---|---|
| Operaciones del contrato pineado (`sha256:fdb4bd3c…`) | **203/203** clasificadas, cada fila con fuente: igual 25 · diferencia 32 · imposible 66 · pendiente 18 · fuera 62 | `pruebas/openwa-matriz.ts` |
| De ellas, GET/POST/PUT/PATCH/DELETE (la cifra del goal) | **201/201** (las 2 restantes son OPTIONS y HEAD del ingress de plugins: fuera) | idem |
| Operaciones servidas (igual + diferencia) | **57/57** cumplen el openapi en petición y respuesta (ajv), con control negativo | `pruebas/openwa-contrato.ts` |
| Operaciones no servidas | **146/146** contestan 501 + alternativa + fuente + código por estado; 0 llamadas a Meta | `pruebas/openwa-no-disponibles.ts` |
| Flujos del spec con el SDK `@rmyndharis/openwa@0.6.0` sin modificar (huella de los 114 archivos) | **6/6**: sesión con liga de alta en vez de QR · texto en ventana · texto fuera → 422 con plantilla sugerida · plantilla fuera de ventana · imagen y documento · webhook con firma verificada por el SDK | `pruebas/openwa-sdk.ts` y `e2e/openwa.mjs` |
| `chatId` de México | `521…` entra y sale igual en eventos, mensajes, chats y contactos; `52…` llega al mismo chat | `pruebas/openwa-chats.ts` |
| Seguridad | llaves (rol, sesión, chat, IP, vencimiento, revocación) · HMAC saliente · firma de Meta entrante · idempotencia · frontera · bloqueo de 24 h · 0 escrituras a consola · 0 dependencias no oficiales en los 2 lockfiles · receptor colgado no retrasa a Meta | `pruebas/openwa-seguridad.ts` |
| Red | 0 conexiones fuera de la máquina (proceso de la app, guion y navegador) | `e2e/openwa.mjs` |
| Panel | escritorio 1366 px y celular 390 px: 0 errores de consola, 0 desborde horizontal | capturas |

## Decisiones

1. **La fachada vive en `tools/ventas-whatsapp/src/openwa`** (export `./openwa`), no en un paquete aparte: usa el BSP,
   el simulador y la Graph multi-inquilino que ya existen, y el núcleo sigue sin dependencias.
2. **La matriz se genera, no se escribe**: `criterios.ts` (54 reglas, por `operationId` o por etiqueta) + el openapi
   pineado → `matriz.ts` y `MATRIZ.md`. El generador falla si una operación cae en cero o en dos reglas, si una regla
   nombra algo que no existe o si no clasifica nada; una prueba regenera y compara.
3. **Cinco estados**: `igual` (misma forma y semántica), `diferencia` (misma forma, semántica declarada), `imposible`
   (la vía oficial no lo permite), `pendiente` (la vía oficial lo permite, la fachada todavía no) y `fuera`
   (administración propia de OpenWA). Cada fila dice si su fuente es una página que lo dice (`documentado`) o una
   **ausencia** en la documentación vigente (`sin_documentar`, 67 filas).
4. **201 contra 203**: el goal dijo 201 porque mi primer conteo omitía `options` y `head`. El conjunto cerrado son los
   203 `operationId` del contrato; no se escondieron dos para cuadrar la cifra. Las dos cuentas están arriba.
5. **Bloquear un contacto pasó de `igual` a `diferencia` ANTES de medir**: la Block Users API solo bloquea a quien
   escribió en las últimas 24 h. Lo encontré al investigar, no al ver un resultado.
6. **Sesión = número del BSP**. `start` da `signupUrl` (la liga firmada del BSP, de un uso y con vencimiento) y deja la
   sesión en `action_required` hasta que la pyme termina el alta; `GET /qr` contesta 501 con la misma liga (solo a quien
   alcanza esa sesión).
7. **La ventana la decide Meta**: la fachada no la adivina; traduce el 131047 a 422 `FUERA_DE_VENTANA` con las
   plantillas aprobadas de la sesión.
8. **Plantillas de OpenWA = plantillas de Meta en revisión**: `{{nombre}}` → `{{1}}` en orden de aparición, con
   ejemplo; editar crea otra versión (`_v2`) porque un nombre borrado no se reusa en 30 días. Categoría `marketing` por
   defecto (Meta recategoriza: el costo no sorprende hacia arriba).
9. **Medios solo por `url`**: Meta descarga la liga; `base64` contesta 422 `SOLO_URL` (subir medios queda pendiente).
   Pie en audio o sticker, `ptt`, menciones y vista previa propia contestan 422 con alternativa: aceptarlos para
   ignorarlos sería simular.
10. **Sin LLM**: la fachada traduce; no decide nada sobre terceros.
11. **Llaves propias** (`vwa_k1_…`), `engineType: meta-cloud-api` y agente de usuario propio en las entregas: compatible
    con la API de OpenWA, sin presentarse como OpenWA. La licencia MIT de OpenWA va con su contrato.
12. **Las entregas a los webhooks del integrador van de fondo**, con reintentos y lista de fallidas re-entregables:
    un receptor lento no retrasa el 200 que Meta espera ni la respuesta de un envío (lo encontré al redactar este
    reporte; hay prueba).
13. **El `chatId` que ve quien migra es el que ya tenía**: el núcleo normaliza los celulares de México (`521…` → `52…`)
    para mandar, pero hacia afuera la fachada usa el número como lo reportó Meta (o como lo escribió el integrador la
    primera vez). Un CRM que guardó `5215…@c.us` de OpenWA sigue encontrando sus chats; escribir con cualquiera de las
    dos formas llega al mismo chat (prueba `openwa-chats.ts`). Lo encontré al redactar este reporte.
14. **Dos dependencias de desarrollo pineadas**: el SDK (para probar que un cliente real de OpenWA migra sin tocarse) y
    ajv 8.17.1 (para validar contra el openapi). El núcleo no las importa.

## Formas en que podría estar mal

1. **El simulador es nuestra lectura de Meta.** Los códigos marcados `SUPUESTO` (error al escribir a un bloqueado:
   131026; nombre de plantilla duplicado: 100) pueden ser otros, y el mapeo a 422 caería en el `default` (503).
2. **67 filas se sostienen en una ausencia**: «no se encontró en la documentación vigente» no es «no existe». Una
   página nueva de Meta puede mover una fila de `imposible` a `pendiente`.
3. **El contrato se probó en el camino feliz** de las 57 y en el 501 de las 146. Los 4xx de las 57 siguen el sobre
   de error de OpenWA, pero no todos se validaron contra el esquema uno por uno.
4. **El SDK recorrió los flujos del spec**; las demás operaciones servidas se probaron por su forma HTTP, no método
   por método del SDK.
5. **Todo vive en memoria**: un reinicio olvida llaves, sesiones, webhooks, plantillas locales e idempotencia. Para
   salir del laboratorio hace falta el almacén (como el resto de ventas).
6. **El `chatId` público es el primero que se vio** (decisión 13): si el integrador escribe primero con `52…` y luego
   Meta reporta `521…` para el mismo número, la fachada sigue mostrando `52…`. Y supone que el `from` de Meta es la
   forma que guardaba OpenWA; eso no se verificó con un número real.
7. **SSRF por `https` a una red interna** no se bloquea todavía (OW-4).
8. **La sobrescritura de la URL de callback por WABA** (para que los webhooks de esos números lleguen a la fachada y no
   al vendedor) no se verificó contra la documentación vigente (OW-15).
9. **La frontera de 40 contactos nuevos por hora es ficticia** hasta medir el piloto.
10. **La guardia de red** cuenta conexiones TCP y peticiones del navegador, no consultas DNS.
11. **El ajv convierte OpenAPI 3.0** (`nullable`) a JSON Schema; el control negativo prueba que rechaza, pero un caso
    raro de `allOf` + `nullable` podría quedar más laxo.

## Bloqueos y quién los destraba

| Qué falta | Quién lo destraba |
|---|---|
| Firmar la revisión C3 y la propuesta de CDC (y pegar el CDC en la bitácora) | El laboratorio |
| Revisar la AISIA de ventas por OW-10 (los mensajes de clientes salen al integrador de la pyme) antes de abrir la fachada fuera de la máquina | El laboratorio (C4) |
| Verificar la sobrescritura del callback por WABA en el primer alta real | El laboratorio, con el alta de Tech Provider |
| Push de la rama y PR | El laboratorio (con `!`) |

## Cómo reproducir

```bash
npm --prefix tools/ventas-whatsapp run prueba && npm run typecheck   # la validación del goal
npm --prefix tools/ventas-whatsapp run matriz                        # regenera la matriz (una prueba falla si difiere)
npm run build && node tools/ventas-whatsapp/e2e/openwa.mjs           # el SDK contra la app construida + capturas
```

## Validación (después del commit)

- `npm --prefix tools/ventas-whatsapp run prueba` → **117/117** (contrato 57/57 · matriz 203/203 · no disponibles
  146/146 · lockfiles 2 revisados, 0 dependencias no oficiales); `npm run typecheck` → exit 0.
- `node tools/ventas-whatsapp/e2e/openwa.mjs` con la app construida → exit 0: 13/13 webhooks con firma válida,
  0 conexiones fuera de la máquina (app, guion y navegador), panel sin errores de consola ni desborde.
- `npm run validate -- --sigue` tras `d21c474` → **32/32 gates activos**, 10 inactivos declarados, 0 rojos
  (árbol `a4ddfdb69894`). Tras este commit del reporte se repite y el resultado va en el mensaje de cierre.
