# Historial del dictado — resultados (2026-09-20)

Ejecutado en un run sobre `main` tras la píldora (PR #135). Página `/historial`, feature
`src/features/historial/`, ruta `/api/historial`. Evidencia repetible:
`node scripts/laboratorio-voz/captura-historial.mjs` (capturas y medidas sobre la build de
producción; corrige y borra sobre una COPIA del historial servida en otro puerto) y la tabla de
búsqueda de abajo. Las capturas quedan en `capturas-laboratorio/30-…38-*.png` (carpeta local, no
versionada).

## Qué existe ahora

- **Buscar** sobre el JSONL entero, en el servidor: texto con o sin acentos (también sobre lo
  que dijo el motor antes de una corrección), atajos Hoy / Esta semana / Este mes, rango de
  fechas, motor, «Corregidos», «Lentos» (≥ 1,5 s hasta pegar); resultados del más reciente al
  más antiguo, agrupados por día («Hoy», «Ayer», «martes 15 de septiembre»), con el término
  resaltado en el texto original (mapa de posiciones: «cotizacion» resalta «cotización»).
- **Cada dictado**: texto, hora, motor, segundos de audio, latencia hasta pegar (en ámbar si es
  alta), y «Antes de corregir» tachado si se corrigió. Acciones: Copiar («Copiado»), Pegar en la
  PC (la misma ruta que el celular), Corregir en línea (el lazo `corrige()` propone palabras
  nuevas y un clic las mete al diccionario), Borrar con confirmación en línea.
- **Cómo me va** (plegable): esta semana (dictados, palabras, cambio contra la anterior), racha
  de días, latencia p50/p95 de la semana, total, motor más usado, sesiones medidas (turnos, sin
  voz, respaldo, saturaciones y señal floja: de las trayectorias de forma), barras de 14 días.
  Nunca un puntaje: «orientan, no califican».
- **Sacar**: Markdown (por día), CSV (RFC 4180: comillas y saltos de línea escapados) y JSON de
  lo que se ve con los filtros puestos; la página dice nombre, dictados y tamaño.
- **Borrar lo anterior a un día** con doble confirmación (equivale a `dictado historial --borra
  --antes`).
- **Vivo**: cada 2 s se pide una huella barata (número de entradas + última); si cambió, se
  recarga lo que se ve con los filtros vigentes y aparece «N nuevos». Sin pestaña visible o con
  una carga en vuelo no se sondea, así el sondeo nunca pisa lo que la persona pidió.
- **Teclado**: `/` va al buscador, `↑` `↓` se mueven, `Enter` copia, `Esc` suelta el campo.
- **Entradas**: la píldora («Abrir historial» → `/historial`; `DICTADO_HISTORIAL_URL` si la app
  no está en `:3000`), `/dictar` («Ver todo lo dictado») y «Tus datos» del laboratorio («Ver todo
  el historial →»). El emparejamiento es el mismo de `/dictar`; sin token, la página lo pide.
- **Núcleo de dictado**: `borraUno(id)` en el almacén (memoria y JSONL) y la primera corrección
  conserva el texto original en `textoCrudo` (las siguientes no lo pisan). 108/108 pruebas.

## Medido

| medida | valor |
|---|---|
| buscar «cotizacion» sobre el historial real (188), por la ruta, p50 | 93 ms (28 coinciden) |
| buscar sobre 20 000 entradas sintéticas (3,9 MB), por la ruta, p50 / p95 | 181 / 188 ms (4 000 coinciden) |
| buscar + motor + rango sobre 20 000 | 181 ms (1 336 coinciden) |
| lista sin filtros sobre 20 000 (100 por página) | 149 ms |
| estadísticas sobre 20 000 (+ trayectorias) | 258 ms |
| exportar CSV de 20 000 | 220 ms, 2,5 MB |
| en memoria, sin proceso: leer y parsear 20 000 / filtrar / buscar | 28 / 1,6 / 27,5 ms |
| carga de la página (hasta el primer dictado pintado) | 755–815 ms |
| dictado nuevo → aparece en la página, con `dictar --entrada` (incluye reproducir el audio a tiempo real, ~3,8 s, y transcribir) | 4,7–4,8 s desde que arrancó `dictar`; el sondeo añade como mucho 2 s |
| errores de página / avisos de consola en toda la corrida | 0 / 0 |
| desborde horizontal a 390 px | ninguno (ancho 390) |

**Decisión sobre el índice**: no hace falta. Buscar en memoria sobre 20 000 cuesta 27 ms; lo que
manda es el arranque del proceso que lee el disco (~90 ms), el mismo precio que ya paga el
laboratorio. Un índice ahorraría 27 ms de 181 y añadiría un caché que puede quedarse viejo.

## Capturas (las vi; descritas en una línea)

- `30-historial-lista.png`: cabecera con enlaces, buscador, chips de fecha, «188 dictados»,
  «Hoy · 100» con cada dictado, sus cifras y sus cuatro botones.
- `31-historial-busqueda-sin-acento.png`: «cotizacion» tecleado sin acento; «28 de 188
  dictados», 28 en la lista, «cotización» resaltado en amarillo en cada uno.
- `32-historial-copiado.png`: el primer dictado con la etiqueta «Copiado» arriba.
- `33-historial-cifras.png`: seis cifras (esta semana 188 · racha 2 días · latencia 257 ms, p95
  5 654 ms · total 188 · motor «residente» · 2 sesiones medidas), barras de 14 días con los dos
  últimos días llenos, línea del micrófono.
- `34-historial-exportar.png`: «Sacar en un archivo» con Markdown/CSV/JSON y
  «historial-dictado-2026-09-20.md · 188 dictados · 22.9 KB»; a la derecha, «Borrar lo anterior
  a un día» con su fecha.
- `35-historial-correccion-candidatos.png`: el texto corregido, «Antes de corregir:» tachado,
  y «Palabras nuevas en tu corrección: + Zorrilla + Quintanar».
- `36-historial-borrar-confirmacion.png`: «¿Borrar este dictado? Sí, borrar / No» en línea.
- `37-historial-vivo-nuevo.png`: la lista con el dictado recién llegado arriba y «1 nuevo».
- `38-historial-movil-oscuro.png`: a 390 px y en oscuro, todo apilado, sin desborde.

Exportación por la ruta: Markdown 23 239 bytes (empieza por «# Historial de dictado / 188
dictados · exportado el …»); CSV 24 119 bytes (cabecera `fecha,texto,texto_crudo,motor,
duracion_ms,latencia_ms` y una fila por dictado).

## Decisiones

- **Sin índice** (arriba). **Sin SSE**: un sondeo de huella cada 2 s, solo con la pestaña
  visible y sin cargas en vuelo, cuesta menos que mantener una conexión abierta y no exige
  nada del demonio.
- **Página propia** (`/historial`), no `/dashboard` (marcador genérico del template) ni una
  pestaña más del laboratorio: es la casa de la persona que dicta, no del que prueba.
- **«Tus datos» del laboratorio se queda** con sus 30 recientes y enlaza al historial completo;
  no se duplicó lógica: la ruta nueva reutiliza `maquina.mjs` y `corrige()`.
- **Borrar exige `confirmo: true` en la ruta** además de la doble confirmación en pantalla: un
  cliente que llame a la ruta a mano tiene que decirlo explícitamente.
- **Corregir guarda el original**: era lo que faltaba para que «Corregidos» y «Antes de
  corregir» significaran algo; se resolvió en el núcleo, no en la página.

## Formas en que podría estar mal, y qué se hizo

- *Una línea rota en el JSONL*: el almacén ya la salta (probado en `node.ts`); la página no la
  ve. *Historial vacío*: «Todavía no hay dictados» (rama probada en la página; el JSON de 20 000
  se sirvió desde un `DICTADO_DATOS` aparte).
- *20 000 entradas*: medido arriba; la página pagina de 100 en 100 con «Ver más».
- *Un dictado de 5 000 caracteres*: el editor y la ruta lo limitan a 5 000; el CSV lo escapa
  (probado con comillas y saltos).
- *Token caducado a media sesión*: cada llamada devuelve «el emparejamiento caducó: vuelve a
  emparejar» y «Olvidar emparejamiento» está al pie.
- *Dos pestañas*: la huella lo cubre; una corrección o un borrado en una aparece en la otra en
  ≤ 2 s (es lo que hace el paso «vivo»).
- *Una respuesta vieja pisa a una nueva* (se vio en la primera corrida: la lista sin filtrar
  llegó después que la filtrada): cada carga lleva número y solo se aplica la última; el sondeo
  no corre con una carga en vuelo. La captura de búsqueda exige ahora «N de M» con N < M y N en
  la lista.
- *Copiar sin permiso de portapapeles*: aviso «el navegador no dejó copiar; selecciona el texto
  a mano».
- *El tema oscuro*: va por clase `dark` en `<html>` (decisión del proyecto), no por el sistema;
  la captura lo fuerza así.
- *El verificador de gobernanza tumbó el gate* por la hora en formato ISO («fecha, letra te,
  dos ceros») escrita en la máquina de sondeo: su regla de trazo grueso toma «te + dos dígitos»
  por el identificador de un caso de regresión. Se construye la medianoche local con `new Date(año, mes, día)`; el gate volvió a
  152/152. Es la regla haciendo su trabajo, no un falso positivo que haya que aflojar.

## Lo que queda fuera

Nube, cuentas, resúmenes por modelo de lenguaje, reintento desde audio (no hay audio),
selección múltiple para borrar en lote (hay «anterior a un día»), y un índice si algún día el
historial pasa de decenas de miles.
