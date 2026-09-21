# Historial del dictado — el hub de transcripciones — Spec

Compilado por `/goal-compiler` el 2026-09-20. Forma: **LOOP**. Lo que se pega en `/goal` es
`goal.txt`, NO este archivo. Referencia: el hub `web/` de sflow (Flask en `:5678`: lista de las
200 transcripciones recientes, buscador en el cliente y «copiar»; MIT, © Daniel Carreón).
Aquí se supera, no se copia.

## MISION

Que todo lo que la persona ha dictado tenga UNA casa: una página local, `/historial`, donde
encontrar cualquier dictado en segundos, copiarlo, corregirlo (y que el dictado aprenda de la
corrección), borrar lo que no quiere guardar, ver cómo le va (cuánto dicta, cuándo, qué tan
rápido responde la máquina, cuántas veces hubo que repetir) y sacar todo en un archivo. Que sea
lo primero que se abre desde la píldora de Windows («Abrir historial»), desde el teléfono
(`/dictar`) y desde el laboratorio; que se vea bien en el celular; que se actualice sola cuando
llega un dictado nuevo mientras está abierta; y que respete lo que ya es ley aquí: todo local,
sin modelo de lenguaje, el audio nunca se guarda, y solo se ve con el token de emparejamiento.

Nivel referencia: lo que un buen hub de notas de voz debería ser.
- **Buscar**: por texto (también sobre `textoCrudo`, lo que dijo el motor antes de corregir),
  con acentos y sin ellos, por fecha (hoy, esta semana, un rango), por motor, por «corregidos»
  y por «con latencia alta»; resultados agrupados por día, con el término resaltado. Sobre el
  JSONL entero (hoy 188 entradas; debe seguir yendo bien con 20 000: se mide).
- **Cada dictado**: texto, hora, motor, duración del audio, latencia fin de habla → pegado,
  y si fue corregido, lo que dijo el motor. Acciones: copiar (un clic, aviso «copiado»),
  corregir en línea (el lazo `corrige()` que ya existe propone palabras nuevas para el
  diccionario), borrar (con confirmación; es su propio dato), y «volver a pegar en la PC»
  (la ruta que ya pega desde el celular).
- **Cómo me va**: dictados y palabras por día y por semana; racha de días; latencia p50/p95
  de la semana; cuántos «sin voz», repeticiones con el respaldo y saturaciones del micrófono
  (de las trayectorias de forma, que ya existen en `tools/dictado/corpus/salida-dictar-*/`);
  motor más usado. Nunca un «puntaje» ni un juicio: cifras con su fuente.
- **Sacar**: exportar lo que se ve (o todo) a Markdown, CSV y JSON; y borrar por rango
  («todo lo anterior a…») con confirmación, lo mismo que `dictado historial --borra`.
- **Vivo**: si el dictado está corriendo, un dictado nuevo aparece arriba sin recargar.
- **Entrar**: desde la píldora («Abrir historial» ya apunta a la app: que apunte aquí), desde
  `/dictar` (un enlace visible) y desde el laboratorio, cuya sección «Tus datos» reutiliza los
  mismos componentes o enlaza aquí (no se duplica lógica; su captura de Playwright sigue en
  verde).
- **Se ve bien** a 390 px y en escritorio, con el mismo lenguaje neutro de `/dictar`, tema
  claro y oscuro, teclado (↑↓ para moverse, Enter para copiar, `/` para buscar).

## HECHOS QUE FIJAN EL DISEÑO (ya en el repo; leerlos antes)

- El historial vive en JSONL (`tools/dictado/src/node/almacen-jsonl.ts`, en
  `DICTADO_DATOS/historial.jsonl`; en esta máquina, `tools/dictado/medicion/banco/datos/`) con
  la interfaz `Almacen` (`recientes`, `busca` por subcadena, `actualiza`, `cuenta`, `borra
  {antesDe}`) y `Historial.corrige` (`src/historial.ts`), que devuelve candidatos al
  diccionario. Campos: `id`, `fecha` ISO, `texto`, `textoCrudo?`, `motor`, `duracionMs`,
  `latenciaMs?`. No hay índice: cada búsqueda lee el archivo.
- El laboratorio ya tiene «Tus datos» (`src/features/laboratorio-voz/components/datos-personales.tsx`,
  127 líneas): diccionario, snippets, 30 dictados recientes con corrección y candidatos,
  sobre `/api/laboratorio/datos` (GET y órdenes POST) que llama a
  `scripts/laboratorio-voz/maquina.mjs datos-lee | historial-corrige | …` como proceso aparte.
  Regla de esa casa: **el bundle no toca el disco del banco con `fs`** (Turbopack rastrea y
  tropieza con el symlink del venv); todo sondeo de disco va por `maquina.mjs`.
- El token: `/dictar` y el laboratorio se emparejan una vez (token en `localStorage`
  `dictado.token`, enlace `#t=` o QR) y toda ruta que toque datos exige `Bearer`
  (`src/shared/lib/token-dictado.ts`, `rechazoSinToken`). El historial es dato personal: misma
  puerta.
- Pegar en la PC desde el navegador ya existe (`/api/dictado/movil` con `x-destino`; `pegaEnPc`
  en `transcriptor-local.ts`).
- Las trayectorias de `dictar` (`tools/dictado/src/node/trayectoria.ts`) son FORMA sin
  contenido: turnos, sin voz, descartados, respaldo, latencias p50/p95, pico dBFS, muertes de
  la captura; una carpeta por sesión en `tools/dictado/corpus/salida-dictar-<fecha>/`.
- La píldora (`tools/dictado/windows/icono-barra.ps1`, parámetro `-Historial`) abre hoy
  `http://localhost:3000/laboratorio-voz`; `cli-dictar.ts` la lanza sin pasar ese parámetro.
- `src/app/(main)/dashboard` es el marcador de posición genérico del template: no es esto.
  Las páginas van en `src/app/(main)/<ruta>/page.tsx` y las features en
  `src/features/<feature>/{components,hooks,services,types,store}`.
- Retención: `DICTADO_RETENCION_DIAS` (365 por defecto) borra al arrancar `dictar`; el
  borrado manual es `dictado historial --borra [--antes] --si`.

## LIBERTAD TECNICA

Tú eliges cómo buscar rápido sobre el JSONL (índice en memoria en el proceso de `maquina.mjs`,
un caché por huella del archivo, o leer y filtrar: mide y decide), cómo llega el «vivo» (sondeo
corto, SSE, o un aviso del demonio), cómo se calculan y pintan las estadísticas (sin librerías
pesadas si no hacen falta), y cómo se organizan la feature y sus componentes. Sugerencias
descartables salvo RESTRICCIONES. Lo que sí: la lógica sin navegador (búsqueda con acentos,
agrupación por día, estadísticas, exportadores) va en TypeScript puro con pruebas
(`node --test`), y la página se prueba con Playwright en build de producción.

## INVESTIGA ANTES DE CONSTRUIR

Lee `datos-personales.tsx`, `maquina.mjs`, `src/app/api/laboratorio/datos/route.ts`,
`tools/dictado/src/{historial.ts,node/almacen-jsonl.ts,node/trayectoria.ts}`, `/dictar`
(`src/features/dictado/`), `token-dictado.ts`, `scripts/laboratorio-voz/captura.mjs` (paso i,
«Tus datos») y el `web/server.py` de sflow. Mide cuánto tarda buscar sobre el JSONL real y sobre
uno sintético de 20 000 entradas antes de decidir si hace falta índice. Reafirma el objetivo en
una línea antes de cada edición grande.

## DEFINICION DE HECHO (evidencia visible en la conversación)

- Último output del comando de validación pegado, en verde; `npm run validate` en verde al final.
- Capturas Playwright de `/historial` en build de producción, a 1280 px y a 390 px: la lista
  agrupada por día; una búsqueda con el término resaltado (sin acento encuentra con acento); un
  dictado corregido en línea con sus candidatos; «copiado»; el borrado de uno con confirmación;
  las estadísticas de la semana; la exportación descargada (se muestra el tamaño y las
  primeras líneas del Markdown y del CSV); el tema oscuro.
- Tabla medida: tiempo de búsqueda sobre el historial real y sobre 20 000 entradas sintéticas
  (p50, con y sin índice si lo hay); tiempo de carga de la página; latencia «dictado nuevo →
  aparece» con el dictado corriendo (`dictar --entrada <wav>` como micrófono).
- Pruebas puras en verde: búsqueda con acentos y por campos, agrupación por día, estadísticas
  (racha, p50/p95, palabras/día) con datos fijos, exportadores (Markdown, CSV, JSON) con
  comillas y saltos de línea dentro de un dictado.
- La píldora abre `/historial` (log de `dictar --icono` con el parámetro, y la captura del menú
  ya existente sigue igual), `/dictar` enlaza al historial, y el paso i de
  `scripts/laboratorio-voz/captura.mjs` («Tus datos») sigue en verde.
- Reporte de decisiones (índice o no, cómo llega el «vivo», qué se comparte con el laboratorio)
  y formas en que podría estar mal, resueltas (JSONL corrupto o con una línea rota, historial
  vacío, 20 000 entradas, un dictado de 5 000 caracteres, exportar con comas y comillas, token
  caducado a media sesión, dos pestañas abiertas).
- README de dictado (§10 «Qué se guarda y dónde») y SDD §2 (fila `web/server.py`) al día.

## COMANDO DE VALIDACION

`npm run typecheck && npm run lint && npm run prueba:laboratorio && (cd tools/dictado && npm run prueba)`
tras cada cambio grande, con el output pegado (si la lógica nueva vive en otra feature, añade
su `node --test` al comando y dilo). `npm run validate` antes de cerrar. Para capturas:
`npm run build && npx next start -H 0.0.0.0 -p 3000`. Mediciones sin otra carga.

## RESTRICCIONES REALES

- Todo local: nada sale de la máquina (C4); ningún modelo de lenguaje; el audio no se guarda y
  no se enseña porque no existe.
- Toda ruta que lea o toque el historial exige el token de emparejamiento (Bearer), como
  `/dictar` y el laboratorio. El historial no se sirve sin él.
- Borrar es irreversible: siempre con confirmación explícita en pantalla, nunca en un solo clic.
- El bundle de Next no toca el disco del banco con `fs`: el acceso al JSONL y a las
  trayectorias va por `maquina.mjs` (o un proceso equivalente), como ya hace el laboratorio.
- No se tocan `settings.json`, skills ni prompts. Los atajos y la píldora no cambian salvo el
  destino de «Abrir historial». Español sin jerga en todo lo que lee una persona.
- Lo que no se hará: sincronizar con nube, compartir enlaces, cuentas de usuario, resúmenes
  por LLM, reintentar una transcripción desde audio (no hay audio).
