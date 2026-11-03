# Banco de motores (pantalla)

Eliges una función, cargas un ejemplo sintético y la corres: la pantalla y su API salen del esquema.

## Qué hace (y qué no)

- Pinta `/laboratorio-banco`: entrada a la izquierda, salida a la derecha (en bloques etiquetados de la
  marca Turno 25), ejemplos sintéticos arriba y la misma llamada por API abajo.
- Registra tres funciones sobre motores del repo, por el mismo adaptador que usa producción:
  `ocr-tesseract` (Tesseract por `motorPorProceso` del extractor documental), `codigo-gs1`
  (`leeCodigoDeProducto` de etiquetas GS1) y `peor-caso` (el generador del banco).
- Expone `GET /api/banco` y `POST /api/banco/<id>`.
- Trae la **tarjeta de caso** que comparten `/laboratorio-etiquetas` y `/laboratorio-pymes`.

No hace: servirse en un despliegue (fuera del laboratorio la página y la API dan 404), aceptar datos
reales, guardar lo que corre ni sacar nada de la máquina. Si esta máquina no declara `TESSERACT_CMD`, el
OCR dice «no medido» en vez de fingir.

## Casos de uso

- **Ver qué lee el OCR de una factura** antes de conectarlo a un buzón: factura sintética, texto, confianza
  y modelo pineado.
- **Revisar qué entiende el sistema de un código escaneado**: GTIN, Digital Link con lote y caducidad, un
  dígito verificador malo o un QR que no es GS1.
- **Probar la interfaz con datos extremos** y ver que el bloque etiquetado no se rompe.
- **Llamar a la misma función por API** desde un script, con la entrada validada por el mismo esquema.

## Requerimientos de infraestructura

- **Runtime**: la app Next.js del repo (`npm run dev`), Node `>=22.18`.
- **Dependencias del sistema**: para el OCR, Tesseract 5 con el idioma `spa`, Python 3 con `pytesseract` y
  Pillow. Sin ellos, el OCR queda «no medido» y las otras dos funciones siguen.
- **CPU, GPU y memoria**: el OCR de la factura sintética tardó 617 ms en CPU (2026-11-02); lo demás, menos
  de 5 ms.
- **Servicios externos**: ninguno.
- **Variables de entorno**: `BANCO_LABORATORIO` (en `1` abre el banco; en producción queda cerrado igual),
  `TESSERACT_CMD`, `TESSDATA_PREFIX` y `LD_LIBRARY_PATH` (los del motor de OCR; solo se comprueba si están).
- **Almacenamiento**: ninguno. El adaptador de OCR escribe la imagen en un temporal solo del usuario y lo
  borra siempre.
- **Salida del perímetro (C4)**: nada sale de la máquina. Medido con Playwright: entre 37 y 38
  peticiones por recorrido completo (varía entre corridas), todas a `localhost`.

## Cómo se abre

```bash
BANCO_LABORATORIO=1 TESSERACT_CMD=… TESSDATA_PREFIX=… LD_LIBRARY_PATH=… npm run dev
# y luego /laboratorio-banco
node scripts/banco/recorrido.mjs --base http://localhost:3000 --salida <dir>   # el recorrido con capturas
```

Los ejemplos de imagen viven en `public/banco/ejemplos/` y se regeneran con
`node scripts/banco/genera-ejemplos.mjs`.
