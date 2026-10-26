# Evidencia · fase 5 «mesa» (capa Arbrain)

> Nodo `mesa` de `docs/goals/capa-arbrain-grafo.json`, punto 9 del HECHO de `docs/goals/capa-arbrain.md`. Corrida del
> 2026-10-25 (11:40–11:48, hora local) en el worktree `capa/arbrain` (HEAD `4b446fb2f610` más los cambios sin commit de
> la rama). Sin LLM, sin desplegar, sin Cloudflare ni R2: la imagen corre con `docker run`, identidad de Access de prueba
> y almacén en disco. Datos sintéticos (los casos de muestra de la mesa y un correo inventado para el rechazo).
>
> Retoma el trabajo de un agente anterior que se cortó al reiniciarse la WSL (~10:17). Su primer build había fallado por
> errores de tipos a medio escribir de OTRO agente; el segundo no terminó. Esta corrida construye y prueba de cero.

## Cómo correrlo

```
# 1. La imagen, desde una COPIA del worktree (otro agente escribe en él a la vez; ver «La imagen»)
docker build -f scripts/laboratorio-alojado/Dockerfile --build-arg MESA_VERSION=capa-arbrain-mesa-4b446fb2f610 \
  -t soporte-sap-laboratorio:capa-mesa-conversacion .
# 2. La identidad de prueba (llaves locales; sus llaves las sirve un contenedor en el 127.0.0.1 de la mesa)
node scripts/laboratorio-alojado/identidad-local.mjs <trabajo>/identidad http://127.0.0.1:8798/certs /datos
# 3. La mesa sin salida + los dos recorridos con Playwright + la evidencia
node src/features/soporte-sap/mesa/pruebas/mesa-sin-salida.mjs soporte-sap-laboratorio:capa-mesa-conversacion \
  <trabajo> docs/goals/capa-arbrain-capturas/mesa --recorrido-mesa
# Aparte: el enrutador medido con frases nuevas, y las pruebas de la mesa
node src/features/soporte-sap/mesa/pruebas/mide-enrutador.mjs
(cd tools/soporte-sap && node --test pruebas/mesa-conversacion.ts pruebas/mesa-experto.ts pruebas/mesa-candidatos.ts pruebas/mesa-web.ts pruebas/laboratorio-alojado.ts)
```

`mesa-sin-salida.mjs` levanta tres contenedores de la misma imagen y los borra al salir (también la red):

| Contenedor | Red | Qué hace |
|---|---|---|
| la mesa | solo una red `--internal` (sin ruta hacia fuera), `--read-only`, `/tmp` en memoria, `--cap-drop ALL`, `no-new-privileges`, almacén en `/datos` (volumen) | la mesa, con `--env-file <trabajo>/identidad/app.env` (como en `docs/MESA-DEL-EXPERTO.md`) |
| sus llaves | la de la mesa (`--network container:`) | sirve las llaves públicas de prueba en el `127.0.0.1:8798` de la mesa |
| la puerta | la interna + la de por defecto, `-p 127.0.0.1:8090` | solo reenvía bytes de `127.0.0.1:8090` a la mesa, para el navegador |

Del `app.env` solo se anotaron los nombres: `ACCESS_EQUIPO, ACCESS_AUD, ACCESS_CERTS_URL, MESA_EXPERTOS, MESA_LABORATORIO,
SOPORTE_SAP_LABORATORIO, MESA_ALMACEN, MESA_ALMACEN_DIR`.

## La imagen

Se construyó desde una copia del worktree (`rsync` sin `node_modules`, `.next`, `dist`, `.git`, `*.tgz` ni `.env*`), para
no recoger archivos a medio escribir del agente de voz. Antes de construir: `npx tsc --noEmit` con **0** errores, y la
copia comparada contra el worktree por sha256 de cada archivo de `src/`, `tools/`, `scripts/` y `productos/`:
**idéntica** (las únicas diferencias eran dos `*.tgz`, que `.dockerignore` excluye igual).

```
Step 13/29 : RUN npm run build
✓ Compiled successfully in 14.2s
  Finished TypeScript in 33.1s ...
Successfully built 54627c90c7fc
Successfully tagged soporte-sap-laboratorio:capa-mesa-conversacion
real	2m46.595s
```

Fueron dos builds: el primero (11:40, 3m04s, en verde) salió antes del arreglo de «borra mi último caso» (abajo); el
segundo (11:44) es el de esta evidencia. La imagen del primero se borró; la del segundo se queda.

## Las intenciones nuevas (enchufe de Soporte SAP)

Declaradas en `src/features/soporte-sap/enchufe.json`, resueltas por el enrutador de la capa (sin LLM) y atendidas por
`src/features/soporte-sap/mesa/services/conversacion-mesa.ts`, que solo habla con la API de la mesa con la identidad de
quien escribe:

| Intención | Qué hace | `efecto` | `irreversible` |
|---|---|---|---|
| `soporte-sap.prueba-caso` | corre el caso escrito en el pedido, el escrito justo antes, o el último de la mesa, por el mismo agente sin modelo del formulario (`ingresa`, con sus dos cerrojos de dato personal), y contesta con el resultado y el paso a paso | `escribe` (guarda el caso en SU almacén: con «lo importante» pregunta antes) | `false` |
| `soporte-sap.explica-paso` | explica desde la traza de la última corrida qué faltaba en ese paso: regla, fuente, umbral o categoría; si en ese paso no dijo «no lo sé», lo dice y señala dónde sí | `lee` | `false` |
| `soporte-sap.ensenado` | lista lo que ESE experto enseñó en sus casos, las soluciones de sus veredictos y lo que validó del conocimiento | `lee` | `false` |

Nada de la conversación es irreversible; borrar un caso en la mesa es del laboratorio y la conversación no lo hace.

### El enrutador, medido con frases que no están en los ejemplos

`node src/features/soporte-sap/mesa/pruebas/mide-enrutador.mjs`:

```
✓ prueba-caso          1.00  prueba este caso (ejemplo)   [prueba-caso:1 abre-mesa:0.323 explica-paso:0]
✓ prueba-caso          0.58  prueba este caso: la app de Fiori abre en blanco tras el transporte   [prueba-caso:0.579 abre-mesa:0.234 abre:0.215]
✓ prueba-caso          0.71  prueba este caso: MIGO da M7 053   [prueba-caso:0.706 abre-mesa:0.244 explica-paso:0]
✓ prueba-caso          1.00  ¿puedes probar este caso?   [prueba-caso:1 abre-mesa:0.642 abre-kit:0.262]
✓ prueba-caso          0.76  pruébame este caso: la VF01 no crea la factura   [prueba-caso:0.762 abre-mesa:0.26 explica-paso:0]
✓ prueba-caso          0.92  corre el caso otra vez   [prueba-caso:0.924 ensenado:0.25 abre-mesa:0.233]
✓ prueba-caso          0.58  vuelve a probar el último   [prueba-caso:0.579 ensenado:0.256 abre-mesa:0.234]
✓ prueba-caso          0.87  a ver qué dice el agente   [prueba-caso:0.872 abre-mesa:0.278 abre:0.208]
✓ explica-paso         1.00  ¿por qué dijiste no lo sé en el paso 3?   [explica-paso:1 prueba-caso:0 ensenado:0]
✓ explica-paso         0.75  por que dijiste no lo se en el paso tres   [explica-paso:0.747 prueba-caso:0 ensenado:0]
✓ explica-paso         0.92  ¿qué te faltó en el tercer paso?   [explica-paso:0.918 prueba-caso:0 ensenado:0]
✓ explica-paso         0.67  ¿por qué no lo sabías?   [explica-paso:0.667 prueba-caso:0 ensenado:0]
✓ explica-paso         0.67  explícame por qué no supiste   [explica-paso:0.667 prueba-caso:0 ensenado:0]
✓ explica-paso         0.67  qué faltaba en el paso 3   [explica-paso:0.667 prueba-caso:0 ensenado:0]
✓ ensenado             1.00  muéstrame lo que te enseñé (ejemplo)   [ensenado:1 prueba-caso:0 explica-paso:0]
✓ ensenado             0.85  ¿qué te he enseñado hasta ahora?   [ensenado:0.849 prueba-caso:0 explica-paso:0]
✓ ensenado             0.67  enséñame lo que aprendiste de mí   [ensenado:0.667 prueba-caso:0 explica-paso:0]
✓ ensenado             0.85  lista lo que te enseñé   [ensenado:0.849 prueba-caso:0 explica-paso:0]
✓ ensenado             0.85  ¿qué cosas te enseñé?   [ensenado:0.849 prueba-caso:0 explica-paso:0]
✓ abre-mesa            1.00  abre la mesa del experto (ejemplo)   [abre-mesa:1 abre-kit:0.58 abre:0.33]
✓ abre-kit             1.00  cómo se usa la mesa del experto (ejemplo)   [abre-kit:1 abre-mesa:0.58 ensenado:0.216]
✓ —sin-coincidencia    0.00  recuerda que los viernes cerramos a las dos   [prueba-caso:0 explica-paso:0 ensenado:0]
✓ —sin-coincidencia    0.00  hola   [prueba-caso:0 explica-paso:0 ensenado:0]
✓ —sin-coincidencia    0.00  gracias   [prueba-caso:0 explica-paso:0 ensenado:0]
✗ prueba-caso          0.52  borra mi último caso   [prueba-caso:0.52 abre-mesa:0.329 ensenado:0.289]  ← esperaba ninguna
✓ —sin-coincidencia    0.42  manda esto al laboratorio   [abre:0.418 prueba-caso:0 explica-paso:0]
✓ —sin-coincidencia    0.23  Una app del launchpad de Fiori abre en blanco después del transporte de ayer, a    [abre-mesa:0.231 abre:0.213 prueba-caso:0]

26/27 como se esperaba · umbral 0.5
```

- «recuerda que los viernes…» no casa con nada, a propósito: la mesa no ofrece el «recuerda que…» de la capa; su memoria
  es su almacén.
- **«borra mi último caso» cae en «prueba este caso» (0,52 contra un umbral de 0,5).** En el ensayo con la imagen anterior,
  el «Sí» volvió a correr el caso: 5 casos nuevos en el almacén en vez de 4. Arreglo: `pideBorrar` en `conversacion.ts`
  mira solo el disparo del pedido (no el caso: «prueba este caso: al quitar el bloqueo…» sí se corre) y el manejador
  contesta «No borro casos, y no corrí nada: en la mesa, borrar un caso es del laboratorio…» sin tocar la mesa. El
  enrutador sigue confundiéndolo (sigue 26/27), así que la pregunta «¿Lo hago? Probar un caso…» sale igual que antes; lo
  que cambió es que el «Sí» ya no corre nada (paso 11 del recorrido, y su prueba unitaria).
- Un caso largo detrás de «prueba este caso:» ya no casa (medido en la prueba unitaria): se escribe antes y luego «prueba
  este caso» (paso 8 del recorrido).

## El recorrido de la conversación, contra la imagen (Playwright)

`recorrido-conversacion.mjs`, por la puerta `127.0.0.1:8090`, con el JWT de prueba de `experto@prueba.local`:

```
✓ 1. primer arranque con la marca de soporte sap
✓ 2. la mesa con su ranura de conversacion
✓ 3. prueba este caso pregunta antes de correrlo
✓ 4. prueba este caso resuelto sin llm
✓ 5. por que dijiste no lo se en el paso 3
✓ 6. muestrame lo que te ense
✓ 7. prueba este caso con regla
✓ 8. caso largo escrito antes del pedido
✓ 9. vuelve a correr el ultimo caso
✓ 10. un dato personal no se corre
✓ 11. borra mi ultimo caso no corre nada
✓ 12. tras recargar la conversacion se fue y los casos siguen

Peticiones del navegador: 51, a 1 origen(es): http://127.0.0.1:8090 · ajenas: 0
APIs que tocó: GET /api/mesa/soporte-sap · POST /api/mesa/soporte-sap
localStorage: {"capa:soporte-sap:capa/soporte-sap/mesa/capa/primer-arranque":"{\"version\":1,\"terminado\":true,\"paso\":4,\"nivel\":\"lo-importante\",\"voz\":false}"}
sessionStorage: 0 claves · IndexedDB: [] · Cache Storage: [] · cookies: 0
Texto del experto en su navegador: ninguno
Respuestas con error: [{"status":400,"metodo":"POST","ruta":"/api/mesa/soporte-sap"}] (esperada: el 400 del caso con forma de dato personal) · en la consola, apartados por eso: 1

12/12 pasos en verde · 0 errores de consola
```

Capturas, en `docs/goals/capa-arbrain-capturas/mesa/` (revisadas una por una):

- `conversacion-04-prueba-este-caso-resuelto-sin-llm.jpg`: «Corrí tu caso (S/4HANA · Fiori) con el agente de la mesa, sin
  modelo. Quedó guardado en tu mesa.», el resultado («no lo sé… Entró al sandbox») y el paso a paso; la mesa abre ese caso
  en su línea de tiempo, con los pasos numerados igual que en la conversación.
- `conversacion-05-por-que-dijiste-no-lo-se-en-el-paso-3.jpg`: «En el paso 3 («Busca en lo que sabe») de tu última
  corrida… la traza dice: «No lo sé: no tiene una regla para este caso». Qué faltaba: la regla…», lo que sí tenía y cómo
  enseñárselo.
- `conversacion-06-…`: «muéstrame lo que te enseñé» lista la enseñanza que el experto acaba de dar en la mesa.
- `conversacion-07-…` (caso con regla, el supervisor no deja pasar el plan porque faltan sociedad y periodo),
  `-08-` (caso largo escrito antes), `-09-` (último caso), `-10-` (dato personal: «No pude… forma de dato personal
  (correo)», sin repetir el correo), `-11-` («borra mi último caso»), `-12-` (tras recargar: sin conversación, 7 casos).
- `-01-`, `-02-`, `-03-`: la guía de primer arranque con la marca, la ranura de conversación y el «¿Lo hago?».
- `conversacion-evidencia.json`: cada petición del navegador (método, origen, ruta, tipo), lo que quedó en su navegador y
  la guía leída.

## Nada sale de la máquina

Desde DENTRO de la mesa (`docker exec … node -e <sonda>`), con su red interna:

```
Red de la mesa interna: true · ruta por defecto: false · a 1.1.1.1:443: ENETUNREACH · https por IP: ENETUNREACH ·
example.com: EAI_AGAIN · a 172.17.0.2:8090 (la puerta, en la red por defecto): ENETUNREACH ·
sus llaves en su 127.0.0.1: RESPONDIÓ 200
```

- Su tabla de rutas tiene una sola entrada, la de su subred (`eth0 000015AC`), sin ruta por defecto.
- Ni una IP pública, ni HTTPS por IP, ni un nombre de fuera (el DNS de Docker no lo resuelve), ni algo que escucha en el
  anfitrión fuera de su red. El control (sus llaves en su propio 127.0.0.1) sí responde: la red funciona, solo que no sale.
- Puertos publicados: la mesa, **ninguno**; la puerta, `8090/tcp -> 127.0.0.1:8090` (solo esta máquina).

Desde el navegador: 51 peticiones, **todas** al origen `http://127.0.0.1:8090` (0 ajenas), y a la API solo
`GET /api/mesa/soporte-sap` (10) y `POST /api/mesa/soporte-sap` (6). La conversación no abre otra superficie: la prueba
unitaria comprueba además que esas rutas son las que la puerta del Worker ya deja pasar.

## Solo se guarda en su almacén

```
docker diff después: A /datos · nuevos en el almacén: 9 (solo casos o validaciones: true) · conversación en el almacén: [] ·
dato personal: false · texto del experto en los logs: []
✓ nada sale de la máquina · ✓ solo se guarda en su almacén · ✓ recorridos
```

- `docker diff` antes y después de los dos recorridos: `A /datos`, idéntico. Es el punto de montaje del almacén; el resto
  del sistema de archivos es de solo lectura y no cambió.
- `/tmp` (en memoria) sin archivos.
- El almacén pasó de vacío a 9 archivos: 7 casos (`mesa/casos/*.json`: 3 del recorrido de siempre y 4 de la conversación)
  y 2 validaciones (`mesa/validaciones/*.json`, del recorrido de siempre). En él están los casos que se corrieron, y
  **no** está la conversación («por qué dijiste no lo sé», «muéstrame lo que te enseñé», «vuelve a correr el último
  caso»), ni el correo del caso rechazado.
- Los logs de la mesa (5 líneas) no traen texto del experto.
- En su navegador queda una sola clave: si ya vio la guía, el paso y el nivel (sin texto suyo). La conversación vive en la
  memoria de la pestaña: tras recargar no hay mensajes suyos y sus 7 casos siguen en la mesa (paso 12).
- Todo, con huellas sha256 de cada archivo del almacén antes y después: `sin-salida-evidencia.json`.

## Lo que ya existía de la mesa, en verde

- Recorrido de siempre (`recorrido-mesa.mjs`) contra la misma imagen sin salida: **26/26 pasos en verde, 0 errores de
  consola**, y sus 7 negativas en 404 (sin identidad, JWT vencido, el experto en la vista y la página del laboratorio, el
  mapa y la ruta de identidades). Sus capturas se quedaron en la carpeta de trabajo, fuera del repo.
- Pruebas: `node --test` de `mesa-conversacion.ts` (11, una nueva para «borra»), `mesa-experto.ts`, `mesa-candidatos.ts`,
  `mesa-web.ts` y `laboratorio-alojado.ts`: **52/52**.
- `npx tsc --noEmit`: 0 errores. ESLint de los archivos tocados: limpio.
- `node scripts/capa/verifica-enchufes.mjs`: **23/23 activos con pantalla, 10/10 siembras cazadas**.

## Brechas

- **El enrutador confunde «borra mi último caso» con «prueba este caso»** (0,52). Ya no corre nada, pero el «¿Lo hago?
  Probar un caso…» sale igual. Con un modelo (fase aparte) o un umbral más alto se mide de nuevo.
- **Un caso largo detrás de «prueba este caso:» no casa**: se escribe antes y luego se pide. Medido, no arreglado.
- **Lo que no dice el texto se supone y se dice** («Supuse que el sistema es S/4HANA»). Sin sociedad ni periodo, el
  supervisor no deja pasar el plan del caso conocido (captura 07): el formulario de la mesa sigue siendo la vía completa.
- **La guía de primer arranque dice «no sale de aquí»** y en la mesa alojada pasa por Cloudflare (declarado en el `sale`
  del enchufe). La capa arma ese texto solo con lo que sale por la voz. En local (esta prueba) es cierto; alojada, no.
- **«Pídele algo a el asistente de Soporte SAP…»**: la capa no contrae «a el». Y en el explorador salen dos «Soporte sap»
  (`/soporte-sap` y `/mesa/soporte-sap`, nombradas por su último segmento).
- **Esta prueba cierra la salida de la mesa en local; la mesa alojada sigue con salida a internet** (brecha del C3 en
  `docs/MESA-DEL-EXPERTO.md`, «Lo que la mesa no hace»). Nada de esto se desplegó.
- **El texto del experto viaja de la pestaña a la mesa** para correrse o rechazarse: eso es la mesa, no una salida (y en la
  alojada, Cloudflare lo ve, como ya declara la revisión 11 de la AISIA).
