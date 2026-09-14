# Extractor documental — en qué quedamos (2026-09-14)

**Estado**: la spec 010 («el extractor en la infraestructura del cliente») está construida y
mezclada en `main` por el PR #98 (merge `0281772`, 2026-09-13). Cierra el hilo que empezó en la
spec 007 y siguió por la 008 (corpus a modelo) y la 009 (identificadores y códigos). El CDC está
aprobado por lisagomez el 2026-09-13 (acta en `.claude/gobernanza/BITACORA-CDC.md`).

## Banco de pruebas: cerrada la brecha con `leePagina` (PR #102, mezclado 2026-09-14)

`banco/corrida.ts::corre()` llamaba a `motor.extrae()` directo y se saltaba `leePagina()`, el
orquestador del núcleo — el banco nunca ejercitaba clasificación de página, tiempos por etapa,
evidencia por campo ni los validadores de identificadores mexicanos. Alcance elegido por
lisagomez vía `AskUserQuestion` en plan mode: cerrar la brecha real, sin cotejo por código QR, sin
`calibracion.ts` contra verdad conocida, sin `infiereModelo`/`proponeModelo`.

- **Bug encontrado y corregido**: los 8 RFC sintéticos de `PROVEEDORES` en `banco/negocio.ts` no
  pasaban `diagnosticaRfc()` — mismo tipo de bug que ya se había corregido antes en
  `medicion/genera-corpus.py`. Se cambió solo el último carácter de cada uno, verificado contra
  `digitoVerificadorRfc`. Si vuelve a aparecer un RFC sintético a mano en cualquier corpus de
  prueba de este repo, verificar el checksum antes de darlo por bueno — no es la primera vez.
- **`banco/corrida.ts`**: `corre()` ahora pasa por `leePagina()`, declara una clase `factura` con
  su esquema (`esquema-por-clase.ts`) y valida `rfc_emisor` por checksum. `DocumentoProcesado`
  ganó `clase`, `estructura`, `tiempos`, `invalidos`, `corregidos` de forma aditiva.
  `campos`/`enRevision` pasaron de `CampoExtraido[]` a `CampoConEvidencia[]` (superconjunto).
- **`banco/cli.mjs`**: `npm run banco corrida` ahora imprime tiempos por etapa, clase, faltantes
  del esquema y evidencia por campo (`checksum`/`motor`/etc.), marcando en rojo lo que va a
  revisión.
- **Sigue sin cablear a propósito**: `cotejoDeCodigos`/`cotejoDeRespaldo` quedan `undefined` — el
  banco no puede producir evidencia `codigo` ni `corroboracion`, solo `motor` y `checksum`.
- **Verificación**: 83/83 pruebas de `pruebas/banco-*.ts` en verde. La suite completa del paquete
  (`npm run prueba`) dio 775/776 — el único fallo (`pruebas/salida-json.ts:120`, lee
  `corpus/salida-*` local fuera de git de corridas reales de días anteriores) es preexistente y
  ajeno: se reproduce igual en `main` sin este cambio (confirmado con `git stash`). Si vuelve a
  aparecer, no es de este trabajo — es el corpus local desalineado de los tipos actuales.

## Decisiones que no se re-litigan sin números nuevos

- **Tesseract por zonas es la base en CPU** (197 pág/min sobre 84 páginas reales, spec 009;
  254 pág/min en Docker sobre corpus sintético, 2026-09-13). GLM-OCR o PaddleOCR-VL van solo
  en la cola, bajo la regla medida `reglaFaltaIdentificador`. **Mistral apagado por defecto**:
  entra solo con decisión C4 firmada, y con datos de terceros ninguna firma.
- **No hay umbral de confianza**: la correlación confianza-error dio r = −0,11 (sin señal).
  `revisionHumana` sale de la EVIDENCIA por campo (codigo · exacto · corroboracion · checksum ·
  motor), no de un corte. TAR-17 y TAR-25 de la 007 cerraron así.
- **El servicio del contenedor es Node sobre `dist/`**, no Python: la barrera de validación, el
  XML, los códigos y la evidencia viven en TypeScript y no se duplican. Python solo hace el OCR
  (`motores-locales/tesseract.py`) lanzado por `proceso-local`.
- **Hermes consume por un puente MCP→A2A** (`servicio/mcp-para-hermes.mjs`): Hermes no habla A2A
  nativo. Hermes no tiene ninguna llave del extractor.
- **La GPU es un servicio del VPS**: perfil `ocr-gpu` (vLLM) con reserva de dispositivo, y
  `configura:deploy` la mide. Sin GPU, el perfil no se levanta y no es error.

## Gates humanos ABIERTOS (nadie los cierra por su cuenta)

1. **Exponer la Agent Card fuera de la red interna** (spec 005 RF-12): hoy `app:3000/a2a` solo
   existe en la red `interna` del compose y Caddy no lo enruta. Antes de abrirlo: cuota por
   partner (no existe), AISIA de documentos de terceros enviados por un partner (pendiente), C3.
2. **Activar `OCR_RESPALDO=mistral`**: decisión C4 firmada aparte; no con datos de terceros.
3. **Aplicar cualquier propuesta de modelo** (spec 008): sigue siendo gate humano.

## Lo que falta medir (no es deuda de código)

- **Corpus real del cliente, ≥100 páginas, fuera del repo**: todas las cifras de la 010 son de
  33 páginas sintéticas y van marcadas NO CONCLUYENTES.
- **Una máquina con GPU** para arrancar `ocr-gpu` y medir la cola: declarado no medido.
- Spec 005: quedan TAR-14 (control negativo del contrato) y TAR-16 (autocrítica).

## Siguiente paso natural

Cuando la dueña aporte el corpus real: `cd tools/extractor-documental && node medicion/servicio.mjs
--via http://<ocr>:8080 --en-vuelo 4` sobre él, y recién entonces decidir si la cola merece GPU.
Hermes con modelo local exige `model.context_length` y `model.ollama_num_ctx` a 65536
(`hermes/config.extractor.yaml`).
