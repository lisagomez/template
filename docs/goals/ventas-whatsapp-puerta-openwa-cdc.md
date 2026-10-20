# Propuesta de CDC (C1) — puerta de salida de OpenWA — SIN FIRMAR

> Fecha: 2026-10-20 · Rama `ventas/puerta-openwa` · Goal `docs/goals/ventas-whatsapp-puerta-openwa.md`.
> **Propuesta fuera del registro**: se pega en `.claude/gobernanza/BITACORA-CDC.md` cuando el laboratorio la firme, y
> entonces se borra este archivo. El agente no escribe firmas ni marca el gate humano.

### 2026-10-20 — puerta de salida de OpenWA: los criterios y textos fijos de la matriz, los errores de la fachada, dos dependencias de desarrollo y tres rutas de laboratorio — radio: producto (`tools/ventas-whatsapp`, app `/migracion-openwa` y `/api/ventas-whatsapp/openwa*`) y dependencia nueva (solo de desarrollo)

- **Cambio**:
  1. **Los criterios** `tools/ventas-whatsapp/src/openwa/criterios.ts`: cinco estados (igual, diferencia, imposible,
     pendiente, fuera) y 54 reglas que clasifican las **203 operaciones** del contrato pineado de OpenWA 0.25.0
     (`openwa/openapi-0.25.0.json`, `sha256:fdb4bd3c7bb26b5ffd5d415d94c9eebdb6630de196c14c2d561a05b76a91789d`, con su
     licencia MIT en `openwa/LICENSE-OpenWA`). Cada regla trae su **nota** (qué pasa por la vía oficial), su
     **alternativa** (lo que contesta un 501) y su **fuente** (página de Meta u OpenWA, consultada el 2026-10-20; 67
     filas se sostienen en una ausencia y lo dicen: `sin_documentar`). La matriz **no se escribe a mano**: la genera
     `openwa/genera-matriz.mjs` y una prueba la regenera y compara. Cambiar una regla es un cambio de comportamiento.
  2. **Los errores fijos de la fachada** (`src/openwa/*.ts`), con el sobre de error de OpenWA y, cuando la vía oficial no
     lo hace, `alternativa`: 422 `FUERA_DE_VENTANA` (con las plantillas aprobadas), `SOLO_URL`, `PIE_NO_DISPONIBLE`,
     `PTT_NO_DISPONIBLE`, `MENCIONES_NO_DISPONIBLES`, `VISTA_PREVIA_PROPIA_NO_DISPONIBLE`, `ESTADO_NO_DISPONIBLE`,
     `SIN_MENSAJE_RECIBIDO`, `PLANTILLA_EN_REVISION`, `PLANTILLA_RECHAZADA`, `PLANTILLA_NO_DISPONIBLE`,
     `PLANTILLA_RECHAZADA_AL_CREAR`, `NO_ENTREGABLE`, `SIN_CATALOGO`, `PROXY_NO_APLICA`, `CONFIG_NO_APLICA`;
     409 `ALTA_PENDIENTE`, `FALTA_METODO_DE_PAGO`, `NUMERO_DESCONECTADO`; 429 `SEND_PACING_LIMITED` (código de OpenWA);
     501 `NO_DISPONIBLE_EN_LA_VIA_OFICIAL`, `PENDIENTE_EN_ESTA_FACHADA`, `FUERA_DE_ALCANCE`, `DESTINO_NO_DISPONIBLE`;
     y los de idempotencia de OpenWA (`IDEMPOTENCY_KEY_*`).
  3. **Supuestos declarados** en código: las plantillas se crean como `marketing` (Meta recategoriza; el costo no
     sorprende hacia arriba) en `es_MX`; la frontera de salida deja 40 contactos nuevos por sesión y hora (**ficticio**
     hasta medir el piloto); la fachada guarda en memoria (laboratorio).
  4. **El simulador de Meta** gana la administración (Template API con revisión y su webhook, Block Users API con la
     regla de 24 h, perfil de negocio) y la reacción del cliente; el núcleo, los mensajes multimedia (medios por liga,
     ubicación, contactos, reacción) y la vista previa de ligas. Export nuevo `./openwa`; `prueba` compila antes de correr.
  5. **Dependencias de desarrollo, pineadas exactas** (solo para las pruebas; el núcleo sigue sin dependencias):
     `@rmyndharis/openwa@0.6.0` (MIT, 0 dependencias, sin scripts de instalación; integridad sha512 en el lockfile y la
     huella del árbol instalado, `sha256:3e42cc3961597cef32c45785886fc23e9604b9e82f79fd9e9108f96337550c37`, comprobada
     en cada corrida) y `ajv@8.17.1` (antes solo llegaba ajv 6 como transitiva).
  6. **La app**: `/api/ventas-whatsapp/openwa/[...ruta]`, `/api/ventas-whatsapp/openwa-webhook`,
     `/api/ventas-whatsapp/openwa-informe` (declaradas en `prueba:a2a` con su justificación) y la página
     `/migracion-openwa`; la variable `VENTAS_WA_OPENWA_LLAVE` (opcional; sin ella, 503); en `plataforma`, la alta simulada
     acepta el número que devuelve la ventana simulada (`simulado`, solo laboratorio) y la página toma `?liga=`.
  - **Sin cambios** en `.claude/`, `AGENTS.md`, `gates.json`, `routing-modelos.json`, modelos, skills ni prompts: la
    fachada no usa LLM.
- **Motivo**: la puerta de salida de lo no oficial. Quien usa OpenWA (WhatsApp Web, Baileys, Puppeteer: riesgo de baneo
  y de datos de terceros, no firmable) migra a la Cloud API cambiando URL y llave; lo imposible por la vía oficial se
  contesta con error y alternativa, nunca se simula.
- **Demostrado** (2026-10-20, todo sintético, sin red fuera de 127.0.0.1):
  - matriz, criterio fijado: 201/201 operaciones GET/POST/PUT/PATCH/DELETE del contrato clasificadas con su fuente;
    aparte, las 2 OPTIONS/HEAD del ingress de plugins también tienen fila (fuera, 501 + alternativa);
  - contrato: 57/57 operaciones servidas cumplen el openapi pineado en petición y respuesta (ajv), con un control
    negativo que prueba que el validador rechaza;
  - no servidas: 146/146 contestan 501 + alternativa + fuente; ninguna llama a Meta;
  - el SDK 0.6.0 sin modificar recorre los flujos del spec en proceso y contra la app construida (corrida e2e);
  - seguridad: llaves, HMAC, firma de Meta, idempotencia, frontera, bloqueo de 24 h, cero escrituras a la consola y
    cero dependencias no oficiales en los 2 lockfiles del repo; un defecto encontrado al revisar el C3 (el 501 del QR
    entregaba la liga de otra sesión) se arregló con una prueba que falla sin el arreglo (7/8 → 8/8);
  - el `chatId` público de México (`521…`) se conserva hacia afuera: un CRM que venía de OpenWA no pierde sus chats.
- **Salida del perímetro (C4)**: **sí, nueva**: los webhooks de la fachada mandan los mensajes de los clientes finales a
  los receptores que registre el integrador de la pyme. Ver OW-10 en `docs/goals/ventas-whatsapp-puerta-openwa-c3.md`:
  no se abre fuera del laboratorio sin la revisión de la AISIA de ventas.
- **Gate aplicado**:
  - diff revisado ☐ (el laboratorio, antes de firmar);
  - regresión capa A ☐ (`npm run regresion`, dentro del `validate`);
  - `npm run validate` ☐ tras el commit (el resultado va en el reporte);
  - capa B: no cambia ningún skill ni instrucción del arnés; decide el laboratorio ☐;
  - aprobación humana ☐;
  - pineo ☑ (dos dependencias de desarrollo exactas, sin modelo).
- **Regresión**: la suite de `tools/ventas-whatsapp` (118 pruebas) y `prueba:a2a` con las tres rutas declaradas.
- **Aprobado por**: pendiente
