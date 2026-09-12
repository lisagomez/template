# Plan 009 — Identificadores y códigos antes que OCR

> El QUÉ está en `spec.md`. Aquí va el CÓMO: módulos, decisiones con su alternativa descartada, y
> cómo cada requisito queda cubierto. Todo se apoya en lo que el extractor ya tenía.

## Módulos y requisitos que cubren

| Módulo | Nuevo/modificado | Cubre |
|---|---|---|
| `src/identificadores-mx.ts` | nuevo (núcleo) | RF-9..RF-15 |
| `src/codigos.ts` (`csf`, `curp`, `rfc`, `camposDeCodigo`) | modificado | RF-2..RF-5 |
| `src/clasifica-pagina.ts` | nuevo (núcleo) | RF-18..RF-20 |
| `src/lectores/zxing.ts` | nuevo (adaptador Node) | RF-1, RF-6..RF-8 |
| `src/motores/proceso-local.ts` + `motores-locales/tesseract.py` | nuevos (adaptador + script) | RF-22..RF-27 |
| `src/motores/openai-compat.ts` (`usage` en ceros) | modificado | RF-28 |
| `src/lote-pagina.ts` (+ `reglaFaltaIdentificador`) | nuevo (núcleo) | RF-13..RF-17, RF-21, RF-29, RF-30, RF-36, RF-37 |
| `src/lote-corpus.ts` (opciones y declaraciones nuevas, reutilización) | modificado | RF-31..RF-33 |
| `src/tipos.ts` (`PaginaExtraida.confianza?`) | modificado | RF-27, RF-29 |
| `medicion/sonda-qr.mjs`, `medicion/expedientes.mjs`, `medicion/genera-identificadores.py`, `medicion/genera-qr-fixtures.py` | nuevos | RF-34, RF-35 |
| `pruebas/contrato.ts` (`lectores/` es adaptador; el lector no sale a la red) | modificado | RNF-1, RF-8 |

## Decisiones, y lo que se descartó

1. **Códigos por el puerto que ya existía.** `LectorDeCodigos` tenía una sola implementación
   (cámara, navegador). El lector de servidor reutiliza `zxing-wasm`, que ya era peer opcional,
   e inyecta el `.wasm` desde el paquete. Descartado: pyzbar/OpenCV en Python (otro proceso, otra
   dependencia) y `BarcodeDetector` (no existe en Node).
2. **Validadores como lógica pura, con diagnóstico.** `diagnosticaRfc` devuelve el motivo, no
   solo un booleano, para que la cola humana sepa por qué. Descartado: consultar SAT/RENAPO
   (saca el dato) y un catálogo de subdelegaciones del IMSS (envejece).
3. **Corrección de UNA posición, aceptada solo si es única, y SOLO como propuesta.** Un checksum
   mod 10/11 detecta toda sustitución simple, pero deja pasar una de cada diez u once
   sustituciones: medido sobre expedientes reales, de 4 correcciones el QR confirmó 1 y
   contradijo 2. Por eso el valor corregido no entra a `campos`: se declara en `corregidos` y lo
   confirma una persona o un código (C4).
4. **Motor local por proceso, no por HTTP.** Tesseract es un binario; envolverlo en un servidor
   HTTP para hablar el dialecto de OpenAI habría sido ceremonia. El adaptador escribe la imagen
   en un temporal 0700, lee JSON por stdout y pasa por `validaPaginas`: la misma barrera que los
   motores de red. Descartado: importar Node en el núcleo (el contrato lo prohíbe; por eso es
   adaptador).
5. **Zonas con `psm 8`, fijado por medición.** Sobre 4 facturas sintéticas, `psm 8` con escala 3
   leyó 7 de 7 RFC exactos; `psm 7`, 4 de 7. La lista blanca de caracteres se pasa, pero el motor
   LSTM la ignora (medido: mismos resultados con y sin ella) y el motor legacy que la respeta no
   viene en estos datos de idioma. Descartado: confiar en la confianza por palabra de Tesseract en
   las zonas (medido: 0).
6. **Derivar al respaldo sin regla por defecto, pero con una regla MEDIDA a mano.** Sin regla,
   el respaldo no se llama nunca. La que la medición respalda es `reglaFaltaIdentificador`:
   deriva la página cuya clase espera un identificador que nadie dio, o la que propuso uno que no
   pasó el checksum sin otro válido. Sobre 84 páginas reales deriva 6 (unos 15 min) frente a 12
   (unos 30 min) de «confianza < 0,6», con solo 2 de solape; y las 12 de confianza baja son casi
   todas fotos y sellos sin identificador que rescatar. La confianza de página no está calibrada
   y no lleva umbral: por eso la regla no la mira. El proyecto la instancia con SUS clases.
7. **Reutilización de páginas idénticas dentro del lote**, por SHA-256 de la imagen, como ya se
   hacía por documento. Descartado: cache entre lotes (persistencia que hoy no existe).
8. **El flujo por página vive en `src/lote-pagina.ts`**, no en `lote-corpus.ts`: el segundo
   habría pasado de 500 líneas.
9. **Fixtures sintéticos con dígito válido**, generados por una implementación Python
   independiente: 600 válidos y 600 mutados. Dos implementaciones que coinciden en 1200 casos son
   mejor evidencia que un ejemplo de manual. Y los QR de prueba reproducen la FORMA medida de los
   reales, nunca su contenido.

## Cobertura de los criterios de finalización

- Pruebas: `pruebas/identificadores-mx.ts`, `pruebas/codigos.ts` (ampliada),
  `pruebas/clasifica-pagina.ts`, `pruebas/lector-zxing.ts` (integración real con
  `globalThis.fetch` que lanza), `pruebas/motor-proceso-local.ts` (proceso de mentira con
  `process.execPath`), `pruebas/lote-pagina.ts`, `pruebas/lote-corpus.ts` (ajustada a la
  reutilización), `pruebas/motor-compatible.ts` (`usage` en ceros), `pruebas/contrato.ts`.
- Medición: `medicion/expedientes.mjs` sobre las 84 páginas reales, fuera del repo; cifras en
  `tareas.md`.
- Gates: `npm run prueba`, `npm run validate` (incluye `verifica:specs`), `node demo/verifica.mjs`.

## Gates y riesgos

- **Contrato**: `src/lectores/` declarado adaptador; prueba de que el lector no menciona red ni CDN.
- **C1**: `zxing-wasm@3.1.4` pineado en `devDependencies` de la raíz; el modelo del motor por
  proceso va pineado (`tesseract-5.5.0-spa-zonal-1`).
- **C4**: ver `spec.md`. Lo que más riesgo lleva es la corrección por checksum, y por eso nunca
  se auto-valida y siempre se declara.
- **Riesgo residual**: la forma del QR de la CURP se midió sobre dos variantes; una tercera cae en
  `texto` y pierde los datos impresos, pero no la CURP (se busca dentro de la carga).
