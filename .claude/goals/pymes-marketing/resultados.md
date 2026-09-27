# Resultados — pymes, contenido y marketing (goal ejecutado el 2026-09-26)

Rama `pymes-marketing-build`. Nada se publicó, se envió ni se conectó; ningún MCP del plugin se usó.

## Qué quedó
| Pieza | Dónde | Evidencia |
|---|---|---|
| Paquete `@tu-scope/pymes-marketing` 0.1.0 (6 herramientas + redactor LLM opcional) | `tools/pymes-marketing/` | `npm run empaqueta`: 8 subpaths instalados e importados en un proyecto limpio; 42 pruebas propias |
| Laboratorio | `/laboratorio-pymes`, `src/features/laboratorio-pymes/` | 45 casos (24 trampas): 44 pasan, 1 no medido declarado, 0 fallan; `npm run prueba:laboratorio-pymes` dentro de `validate` |
| App del cliente | `/estudio`, `src/features/estudio-pymes/` | Usa solo lo aprobado (6 de 7); recorrido con Playwright sin errores de consola; aprobar hizo 0 peticiones de red |
| Triaje 12/12 | `triaje.md` (+ `triaje-plugin.md`, `triaje-video.md`) | pineos verificados; sfstudio 7/9 sin red, rojos diagnosticados |
| Propuesta de video | `propuesta-video.md` | 14 preguntas para firma; sin construir |
| AISIA de reseñas | `aisia-resenas.md` | firmada por el laboratorio (2026-09-27) |
| CDC del redactor | `BITACORA-CDC.md`, entrada del 2026-09-27 | firmado por el laboratorio; la propuesta se borró al firmar |
| Capturas | `capturas/` | laboratorio, caso-trampa, marca, brief 30 días, calendario con pieza, reseñas, brief del lunes |

## Decisiones (y por qué)
1. **Un paquete, ocho subpaths**, no cinco paquetes: las herramientas comparten núcleo (voz, «sin datos»,
   dinero, texto ajeno). Con paquetes hermanos, la app no resolvería los imports en ejecución sin instalar
   tarballs (el precedente `dictado`→`voz` solo importa tipos). El empaquetador prueba cada subpath por separado.
2. **Imagen por código (SVG) en lugar de Canva o un servicio de imágenes**: $0, determinista, nada sale;
   PNG y foto del producto quedan para después.
3. **Redactor inyectable; de serie, plantillas**: sin llave no hay LLM medido. El de LLM está cableado a la
   contabilidad y al routing (+2 clases al nivel `capaz`), pero no se aprueba sin corrida real.
4. **La app procesa en el navegador**: los XML, CSV y reseñas del cliente no llegan al servidor. El estado
   vive en memoria a propósito (persistir exigiría aviso de privacidad y otra AISIA).
5. **El laboratorio corre en el servidor en cada visita** y la app calcula su compuerta con la misma corrida:
   si una herramienta deja de pasar, su sección se apaga sola.
6. **Estados del grafo honestos**: lo construido queda ámbar (validado con datos sintéticos, sin estreno con
   un cliente real); morado solo triaje, paquete, laboratorio y los lazos que corrieron.
7. **Visibilidad por URL no se implementó**: leer una dirección desde el servidor exige protección contra
   SSRF; esta versión audita lo que el dueño pega. Dicho en la pantalla.

## Costo por corrida
- Redactor de plantillas: **27 redacciones, 0 llamadas, US$0.00 (medido)**.
- Redactor con LLM: **no medido** (sin `OPENROUTER_API_KEY`). Cableado probado con proveedor simulado:
  US$0.002584 por redacción (812 + 96 tokens, `anthropic/claude-sonnet-5` pineado) ≈ US$0.07 por un mes de
  27 piezas; sin uso reportado se guarda `null`.

## Formas en que podía estar mal — y qué se hizo
| Riesgo | Estado |
|---|---|
| Colores de una frase tomados en otro orden («café y crema» dejaba crema de principal) | **Resuelto**: orden de la frase; caso marca-1 |
| Brief que empujaba un producto que cae 50 % y dejaba «mantener» vacío | **Resuelto**: lo que baja se reposiciona; 388 palabras en el ejemplo |
| Oferta «producto + sí mismo» y «paquete de la semana» inventado | **Resuelto**: solo paquetes que propone la estrategia, con pareja real |
| Disculparse por lo que el cliente elogió (reseña mixta) | **Resuelto**: temas por cláusula; caso resenas-5 |
| Respuesta del dueño contada como cliente; nombre «Caro» como queja de precio | **Resuelto**: se separa la respuesta y se busca por inicio de palabra |
| Fila «Total» de Meta contada como campaña | **Resuelto**: se filtra en cualquier columna; caso pulso-1 |
| Tendencia con una sola reseña de base | **Resuelto**: mínimo 3 por mitad |
| Brief del lunes afirmando «la venta baja» con −3 % | **Resuelto**: «baja» = zona roja (≤ −10 %) |
| Precio de CFDI sin IVA impreso en una pieza | **Resuelto**: solo precios confirmados por el dueño |
| Datos sintéticos a favor de la herramienta | **Abierto**: falta un piloto con XML, reseñas y exportaciones reales (con permiso) |
| Columnas de exportes en español «a verificar con una exportación real» | **Abierto**: sinónimos del triaje, sin archivo real de Meta todavía |
| Léxico de temas heurístico | **Abierto, declarado**: cubre los casos probados; un LLM medido podría mejorarlo |
| Fechas móviles (Buen Fin, Hot Sale, regreso a clases) | **Declarado**: se marcan «aproximada» |
| SVG depende de las fuentes instaladas del que lo abre | **Abierto**: exportar PNG queda para el siguiente goal |

## Lo que queda para el siguiente goal
- Firmas: las 14 preguntas de `propuesta-video.md` (el CDC del redactor y la AISIA se firmaron el 2026-09-27).
- Piloto con datos reales de un negocio (con su permiso) y ajuste de sinónimos de exportaciones.
- Lectura del sitio por URL con protección SSRF; exportar piezas a PNG; lista guardada de competidores.
- Medir el redactor con LLM (llave + corrida real) antes de ofrecerlo.
- Las demás familias del plugin (finanzas, ventas, operación), cada una con su goal.
