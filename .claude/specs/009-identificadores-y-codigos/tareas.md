# Tareas 009 — Identificadores y códigos antes que OCR

> Cada tarea cierra con evidencia pegada, no con una promesa. Las cifras sobre expedientes reales
> son de FORMA: conteos, nunca valores. El corpus real vive fuera del repositorio.

## Cerradas

- [x] **TAR-1 · Evidencia previa (sonda de códigos).** `medicion/sonda-qr.mjs` sobre las 84
      páginas reales: **14 traen código**. Constancia de situación fiscal: QR del SAT
      (`D1,D2,D3`, dos formas: `<idCIF>_<RFC>` de 105 chars y `||fecha|RFC|nombre|sello` de 344 a
      362) **y** un Code128 de 13 chars con forma de RFC. Constancia de CURP: QR de texto (75 a 104
      chars) con la CURP dentro, dos formas (campos por `|` con la CURP primero; etiquetas
      «Número de Validación Legal / Nombre / CURP»). Otros, que NO se parsean: INE (`qr.ine.mx`),
      CFE, SEP, vacunación COVID. `zxing-wasm@3.1.4` funciona en Node inyectando el `.wasm` del
      paquete; sin eso va a un CDN.
- [x] **TAR-2 · Validadores** (`src/identificadores-mx.ts`): RFC (tabla del SAT, mod 11), CURP
      (tabla de RENAPO con Ñ en 24, siglo por la posición 17), NSS (Luhn). Cotejo cruzado contra
      una implementación Python independiente: **600/600 válidos y 600/600 inválidos**. Sobre los
      identificadores reales ya transcritos: CURP **6/7** pasan (la séptima falla por dígito y no
      admite corrección de una posición: tiene dos errores). Hallazgo: `XEXX010101000` cuadra su
      dígito por coincidencia; `XAXX010101000` no. La opción `admiteGenericos` mira la lista.
- [x] **TAR-3 · Códigos** (`src/codigos.ts`): tipos `csf`, `curp`, `rfc` y `camposDeCodigo`. Las
      formas reproducen las medidas; los QR de terceros quedan en `url` sin campos.
- [x] **TAR-4 · Clasificación de páginas** (`src/clasifica-pagina.ts`), sin clases embarcadas.
- [x] **TAR-5 · Lector de códigos de servidor** (`src/lectores/zxing.ts`). Prueba de integración
      real con los fixtures sintéticos y `globalThis.fetch` sustituido por una función que lanza:
      **la red no se toca**. Contrato: `lectores/` es adaptador y el archivo no menciona CDN.
- [x] **TAR-6 · Motor por proceso local** (`src/motores/proceso-local.ts`): temporal 0700,
      borrado también tras fallo y corte; errores sin stdout y solo con la línea `extractor:` de
      stderr; `usage` → `null`. Probado con un proceso de mentira en Node, sin Tesseract.
- [x] **TAR-7 · Tesseract por zonas** (`motores-locales/tesseract.py`). Medido sobre 4 facturas
      sintéticas con verdad (8 RFC): `psm 7` escala 3 → 4 de 7 leídos exactos; **`psm 8` escala 3 →
      7 de 7**; `psm 13` igual. La lista blanca de caracteres: **sin efecto** (motor LSTM). `--oem 0`
      (legacy): **no disponible** en estos `spa.traineddata`. Confianza por palabra en las zonas:
      **0** en psm 8/13. Defaults fijados: escala 3, psm 8, Otsu. ~560 ms por página.
- [x] **TAR-8 · Flujo por página y cableado en el lote** (`src/lote-pagina.ts`,
      `src/lote-corpus.ts`): códigos → OCR → clase → cotejo → respaldo por regla → validadores;
      reutilización de páginas idénticas; declaraciones por documento y totales. `usage` en ceros
      = no declarado. **732 pruebas en verde**, lint limpio.
- [x] **TAR-9 · Medición sobre los 4 expedientes reales** (`medicion/expedientes.mjs`, 84 páginas,
      4 en vuelo, Tesseract 5.5 local + zxing + validadores):

      | Variante | pág/min | códigos leídos | acuerdos QR↔OCR | RFC válidos (docs con RFC de persona física) | CURP válidas (corroboradas por QR) | NSS | corregidos | inválidos |
      |---|---|---|---|---|---|---|---|---|
      | Antes (Tesseract plano + patrones, 2026-09-11 mañana) | ~45 | 0 | — | 2/4 docs con algún RFC válido; **empleado en 1/4** | 4/4 (0) | 3/4 | — | — |
      | Base: zonas + QR + validadores | **197** | 10 oficiales (3 csf, 2 rfc, 4 curp, 1 gs1) + 8 url | 3/0 | **4/4**; empleado en **2/4** (uno por QR, otro por OCR zonal) | 4/4 (**3/4**) | 3/4 | 2 | 1 (curp, dígito) |
      | Sin códigos | 193 | 0 | — | 3/4; empleado en 1/4 | 4/4 (0) | 3/4 | 2 | 1 |
      | Omite `carta_recomendacion` | 196 | igual | 3/0 | igual | igual | igual | 2 | 1 |

      Lecturas: el QR es lo único que da el RFC del empleado en un expediente (sin códigos lo
      pierde entero) y lo que corrobora la CURP en 3 de 4. Los 2 RFC corregidos por checksum
      **no los confirma ningún QR del mismo expediente**: van a revisión, como manda la regla; la
      tasa de confirmación (0 de 2) es la cifra que impide relajar la corrección a dos posiciones.
      Omitir cartas ahorra 12 páginas de respaldo, no cambia los identificadores. Dos expedientes
      siguen sin RFC de empleado: uno no trae ningún código y en el otro la constancia fiscal no
      está en las páginas extraíbles.

- [x] **TAR-10 · Respaldo con GLM-OCR por regla «clase sin identificador esperado»** (omitiendo
      cartas, 2 en vuelo). Primera corrida: **8 de 10 derivaciones cortadas por el tope de 5
      minutos de Node (undici `headersTimeout`)**, con 4 en vuelo y las peticiones encoladas; es
      exactamente el caso que documenta `traduceElCorte`, y el script de medición inyecta ahora
      un `fetch` con dispatcher sin tope. Segunda corrida, sin avisos:

      | Dato | Valor |
      |---|---|
      | Páginas derivadas (regla) | 10 de 72 no omitidas (5 `alta_imss`, 4 `curp`, 1 `ine`) |
      | Tiempo de respaldo | 1099 s (29 a 273 s por página; las repetidas van al cache de Ollama) |
      | Lote entero | 634 s frente a 26 s sin respaldo (7,9 frente a 197 pág/min) |
      | Identificadores NUEVOS distintos | 1 RFC (persona física, en un expediente que ya tenía 1) |
      | Corroboraciones | 3 CURP leídas también por el segundo motor (2 hojas CURP y la INE, con confianza Tesseract 0,38); 2 acuerdos RFC |
      | NSS | 0: en las 5 hojas de alta IMSS ningún motor lo leyó |
      | Inválidos nuevos | 1 CURP por dígito, a revisión |
      | Discrepancias | 0 |

      Lectura: el respaldo cuesta **24 veces** el tiempo del lote para 1 identificador nuevo y 3
      corroboraciones. Vale para la INE (donde Tesseract no lee nada) y sobra donde el QR ya dio el
      dato: por eso la regla recibe ahora también los campos de código. Hallazgo aparte: el NSS de
      las hojas de alta del IMSS no lo lee ninguno de los dos motores; ahí falta una zona propia
      (etiqueta «Número de Seguridad Social» en un formulario, no en prosa).
- [x] **TAR-11 · Documentación de cierre**: README (sección «Identificadores y códigos antes que
      OCR», subpaths nuevos), SDD §2.24, esta tabla.

## Abiertas

- Ninguna de esta spec. Lo que sigue es del proyecto: elegir la regla de derivación, añadir la
  zona del NSS en el formato de alta del IMSS, y una muestra corregida a mano para calibrar.

## Bloqueadas o no medidas

- **RapidOCR** (`motores-locales/rapidocr.py`): no medido. Los wheels para Python 3.14 existen para
  numpy y onnxruntime; `rapidocr` exige `opencv_python` por nombre y opencv solo trae abi3. Queda
  como camino documentado, sin cifra.
- **Corrección de dos posiciones**: no se hace; con 0 de 2 corregidos confirmados por QR no hay
  base para medir su tasa de falsos positivos.
- **Calibración de la confianza de Tesseract**: sin muestra corregida a mano no se fija umbral
  (TAR-17 de 007 sigue abierta).
