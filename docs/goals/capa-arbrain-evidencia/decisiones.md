# Capa Arbrain: reporte de decisiones, formas en que podría estar mal y post-mortem al grafo

> Goal `docs/goals/capa-arbrain.md` · grafo `docs/goals/capa-arbrain-grafo.json` · rama `capa/arbrain` desde
> `origin/main` `4b446fb` · 2026-10-25. Punto 15 del HECHO y la RED DE SEGURIDAD («al terminar se hace el post-mortem
> al grafo»). La corrida tuvo dos sesiones: la primera se cortó a las 10:17 porque la WSL se reinició (se perdió el
> scratchpad y cuatro subagentes quedaron a media llamada); la segunda retomó desde el worktree, que no se perdió.

## 1. Decisiones

| # | Decisión | Por qué | Nodo |
|---|---|---|---|
| D1 | La capa se llama **`capa`** (`@tu-scope/capa` 0.1.0), activo **base** `TPL-capa`. Núcleo sin React, Next ni Supabase; la interfaz en la entrada `./react`, con React como peer opcional | el contrato de herramienta (`docs/EMPAQUETAR-HERRAMIENTA.md`) y la restricción «su núcleo no importa React» | capa |
| D2 | **Estilos propios con prefijo `capa-`**, no un sexto design system ni Tailwind 4 | la capa no puede depender del Tailwind del consumidor; pasar a Tailwind 4 es un CDC del laboratorio | capa |
| D3 | **Del diseño de Arbrain se reimplementan patrones**, no se copia código: 21 piezas adoptadas y 72 reimplementadas, con procedencia en la cabecera (archivo, etiqueta y commit) y `NOTICE` | Arbrain saca versiones a diario: copiar tal cual garantiza divergir en días; Apache-2.0 sin derecho de marca | mapa, capa |
| D4 | **El contrato de módulo es un `enchufe.json`** junto a cada activo con pantalla (ranuras, intenciones con ejemplos, `efecto` e `irreversible`, pantallas, memoria y `sale`), con un verificador de 10 siembras y un registro **generado** en la app | lo que intercambia módulos es un dato, no código; el verificador lo hace gate | enchufe |
| D5 | **El verificador de enchufes entra al `validate`** (`verifica:enchufes`, activo) y su registro, a `generados` (banner y comparación) | un control escrito solo en el documento no dispara; un generado sin banner rompe D-SS-9 | gobernanza |
| D6 | **Intención sin LLM**: un enrutador léxico compara con los ejemplos que declara cada enchufe; si duda, dice que no sabe o pregunta entre dos | el HECHO no lleva LLM; un modelo se inyecta por C8 y queda «no medido» | capa |
| D7 | **El freno de Arbrain se adopta tal cual en su regla**: cita textual cotejada y **clic humano**; ni voz, ni texto, ni Enter, ni `click()` sintético | es la pieza de seguridad; relajarla para el teclado abriría la confirmación por voz | capa, voz |
| D8 | **Memoria por inquilino con almacén inyectado** (navegador en Recepción, almacén de la mesa en Soporte SAP) | cada producto decide dónde vive su memoria, y la mesa ya tenía su almacén gobernado | capa, mesa |
| D9 | **Las dos instancias se demuestran con contenedores**: la red privada es un relevo simulado, el job une con `merge-tree` fuera del árbol, el centro es un bare con hook de política y la puerta de Cloudflare se valida sin conexión con un validador propio de Access | sin VPS, sin Tailscale y sin Cloudflare (restricciones); `cloudflared` da `OK` a una regla sin Access, por eso el validador propio | instancias |
| D10 | **El resumen es un esquema cerrado** de la capa (`validaResumen`) y el VPS mantiene una **lista de productos permitidos** (hoy solo Recepción): lo rechazado queda en cuarentena, fuera del cerebro | cerebro personal ≠ cerebro de producto (no firmable) | resumen |
| D11 | **La skill de actualización es un script determinista** (`scripts/capa/actualiza.mjs`) más una skill como propuesta: trae lo firmado a una cuarentena, diffea solo lo adoptado, clasifica por nivel y sale con código propio en el CDC | el precedente de `update-sf`; un agente no decide subir de versión | skill |
| D12 | **`lee-cerebro` vive en `scripts/capa/`**, no en el paquete | así ningún producto puede importarlo | global |
| D13 | **Voz**: el acuse sale de un repertorio fijo elegido por NUESTRO enrutador sin LLM (no Jev ni OpenRouter); el enchufe de motor es el de OpenAI en el servicio de dictado; la nube queda en adaptadores apagados con su C4; la voz del dispositivo cuenta solo si es local | el audio no sale de la máquina por defecto; el navegador de Chrome manda el audio a Google | voz |
| D14 | **La mesa no lleva voz**; su conversación resuelve sin modelo, con su memoria por identidad | su contenedor (1 GiB) no cabe Parakeet y la nube no se enciende con datos sensibles | mesa |
| D15 | **El producto nuevo es Recepción** (mostrador de una barbería ficticia), y la recomposición cambia `crecimiento-demostrado` por `estudio-pymes` | dos módulos reales, locales y sin LLM, con pantalla dentro de la capa | producto |
| D16 | **`/buzon/[pyme]` queda como brecha** del recorrido (61/62): aplicar las migraciones del buzón en la Supabase local y sembrar un miembro por SQL de operador lo decide el laboratorio. **Decidido por el laboratorio el 2026-10-25: brecha** | el spec dice «sin migraciones aplicadas» | adopción |
| D17 | **`prueba:instancias` entra al padrón inactivo**, con motivo y falta | necesita Docker y baja ~350 MB: no cabe en cada integración, pero su ausencia tiene que verse | gobernanza |

## 2. Formas en que esto podría estar mal o incompleto

| # | Forma | Estado |
|---|---|---|
| R1 | **El enrutador es léxico.** «Cancela lo de mañana» o una frase sin palabras de los ejemplos cae en «no lo sé». En voz, el corpus nuevo (D) dio 71,6 %, por debajo del 75,5 % del corpus C, aunque todos los fallos van al lado seguro (al cerebro, nunca una orden equivocada) | **Declarada**: caída medida y dicha, sin ajustar el enrutador sobre el corpus de prueba |
| R2 | **El recorrido comprueba forma, no fondo**: HTTP 200, ventana de la capa, módulo dueño y 0 errores de consola. No prueba cada función de cada módulo | **Declarada**: las suites propias de cada módulo siguen siendo su prueba de fondo |
| R3 | **Las rutas con sesión dejan residuo en la Supabase local**: cada corrida crea una cuenta sintética (`@example.com`) con ~35 filas, y la RLS no deja borrarlas con sesión de usuario | **Brecha**: unas 20 cuentas sintéticas acumuladas; limpiarlas pide SQL de operador en local |
| R4 | **`/buzon/[pyme]` sin recorrer** (D16) | **Brecha decidida por el laboratorio** |
| R5 | **Lo irreversible no se confirma sin ratón** (D7). El botón de Modo conversación sí funciona con teclado, pero la tarjeta del freno pide el clic | **Brecha declarada** en el README de la capa: accesibilidad frente a seguridad; resolverla (por ejemplo, un gesto de teclado que no pueda llegar por voz) es una decisión aparte |
| R6 | **Recepción guarda su memoria en el navegador del mostrador** y declara `datosSensibles: true`: con clientes reales, sus nombres quedarían en una computadora compartida | **Declarada**: con datos sintéticos no aplica; FUERA DEL HECHO §6 exige la AISIA del producto antes de activar la memoria con clientes reales |
| R7 | **La red privada de la demo no cifra** ni da identidad por nodo, y el validador de Access mira el YAML, no la política del panel | **Declarada** en el C3 (T-1, T-2): se revisa al encender lo real |
| R8 | **Las latencias de voz se miden en Chromium headless con micrófono falso**, en WSL y sin GPU. Un control que cambia una sola variable (sin acuse) dio órdenes de 1573 ms contra 694 ms una hora antes, con el mismo código: el estado de la máquina mueve las cifras más del doble | **Declarada**: el acuse no hace más lento el «para» (319 contra 327 ms, con y sin él); la diferencia de órdenes y «para» contra la base queda **no atribuida** (`voz.md`, «Control del coordinador»). «Para» 16/16 sin tardías y eco 0/6 se sostienen en las cuatro corridas |
| R9 | **El reinicio de la máquina borró el scratchpad** de la primera sesión: las salidas del simulacro de la skill están pegadas en `skill.md`, pero los guiones de preparación se perdieron | **Resuelta**: lo determinista del simulacro lo repiten las pruebas de la capa (`actualiza-capa.ts`: firma buena, sin firma, llave ajena, nada escrito al fallar), que corren en `prueba:tools` |
| R10 | **El explorador mostraba el slug** («Recepcion», sin acento) y dos entradas «Soporte sap» en la mesa; el compositor decía «Pídele algo a el asistente» | **Resuelta** en la capa: el grupo lleva el nombre del enchufe (y `data-capa-modulo` para las pruebas), las pantallas homónimas se nombran por su ruta, y «al asistente». Las capturas de voz y del recorrido viejo son de antes del arreglo |
| R11 | **La capa reimplementa 72 piezas**: si el autor cambia la semántica de una, la nuestra no cambia sola | **Resuelta por diseño**: la skill diffea las rutas `origen` de lo adoptado y de lo reimplementado y lo enseña por nivel; nada se aplica sin CDC |
| R12 | **El corpus D lo escribió un agente del mismo goal**: es nuevo y se congeló antes de medir, pero no es de una persona ajena | **Declarada**: un corpus de la voz real del laboratorio sigue pendiente (calibración, memoria del dictado) |
| R13 | **Un aviso de hidratación intermitente** («A tree hydrated but some attributes… didn't match»): una vez en `/recepcion` (agente del producto) y en la primera corrida completa del recorrido en `/laboratorio-pymes` y `/laboratorio-ventas-whatsapp` (60/63) | **Brecha declarada, causa no encontrada**: no se reprodujo en 4 cargas aisladas por ruta, ni en 6 cargas con el estado del recorrido, ni en el tramo de los 13 laboratorios en secuencia, ni en la segunda corrida completa (62/63, 0 errores de consola). El recorrido corta el mensaje a su primera línea y no guardó el diff de atributos: propuesta, que `recorrido.ts` guarde el mensaje entero |
| R14 | **Con Silero** (el detector que usan hoy el HUD y el módulo de voz de la capa) todo llega ~100 ms después y **«para» encima del acuse falló 2 de 8** en la corrida C2 (uno no calló; otro calló a los 1914 ms y sonó una frase del turno viejo). Hipótesis sin verificar: Silero confirma la voz cuando el acuse ya terminó | **Brecha declarada** de la ranura de voz de la capa: el «para» encima de la respuesta sigue 16/16. Corregirla (por ejemplo, que el corte del acuse lo dispare la energía aunque el turno lo abra Silero) es trabajo aparte, medido |
| R15 | **La respuesta a «sí, confírmalo» en modo conversación solo se oye**: no queda escrita en el hilo | **Brecha declarada**; propuesta para la capa: un `avisa(texto)` en lo que recibe `creaControl` |
| R16 | **La preferencia del modo conversación se guardaba, pero nadie la leía** | **Resuelta**: si la persona lo dejó encendido, el botón ofrece «Retomar conversación»; el micrófono nunca se abre solo al recargar (el permiso es del primer clic) |
| R17 | **`mide.ts` mide el HUD del centro de mando, no el Modo conversación de la capa**: la latencia del botón de la capa no está medida | **Declarada**: comparten el bucle (`bucle-voz`) y los motores, no el mismo montaje |
| R18 | **El enrutador de la mesa confunde «borra mi último caso» con «prueba este caso»** (0,52 contra el umbral 0,5): en un ensayo volvió a correr un caso | **Resuelta en lo que importa**: `pideBorrar` lo detecta y no corre nada (prueba unitaria y paso 11 del recorrido); la pregunta «¿Lo hago?» todavía sale (brecha cosmética). Un caso largo escrito detrás de «prueba este caso:» no casa: se escribe antes y luego se pide |
| R19 | **La prueba de «nada sale» de la mesa es local** (red sin salida en Docker). La mesa alojada tiene salida a internet | **Brecha ya declarada** en el C3 de la mesa alojada (revisión 11); este goal no la cambia |
| R20 | **`npm run empaqueta capa` no prueba el subpath `./react`** en el proyecto limpio: falta el peer opcional `react` | **Declarada**: la interfaz la cubren la prueba de render en servidor de la capa (`tools/capa/pruebas/`) y el recorrido de la app (62/63); instalar React en la prueba de integración es un cambio del empaquetador, aparte |

## 3. Post-mortem al grafo

Cada hallazgo, mapeado a un nodo, una arista o un lazo, y en qué se vuelve.

| Hallazgo | Dónde | Se vuelve |
|---|---|---|
| Cinco agentes en un mismo worktree se pisaron: la imagen de la mesa no compiló por tipos a medio escribir del agente de voz, y una corrida del recorrido dio 58/62 por errores de compilación transitorios | aristas de la fase 5 (`e-voz`, `e-mesa`, `e-compone`, `e-skill`) | **Regla del spec**: en la fase 5, cada agente que construya imágenes o recorra rutas trabaja sobre una **copia** del worktree, o la fase se parte en dos turnos |
| Un reinicio de la máquina cortó la sesión y cuatro agentes sin entregar; se perdió el scratchpad | todos los nodos de la fase 5 | **Regla del spec**: lo que se necesite para reproducir una evidencia va al repo (`scripts/` o `pruebas/`), nunca solo al scratchpad. Cada agente escribe su evidencia por partes, no al final |
| El gate del nodo `enchufe` existía como script, pero no estaba en el padrón | lazo `l-enchufe` | **Gate**: `verifica:enchufes` en `validate` (D5). El lazo pide desde ahora «y está en el padrón» |
| El registro generado de enchufes no llevaba el banner de D-SS-9 | arista `e-adopta-enchufe` | **Gate**: registrado en `generados` |
| `cloudflared` da `OK` a una regla sin Access | lazo `l-instancias` | **Regla**: el validador propio con su sabotaje es parte del lazo (ya lo es) |
| La medición de voz salió en el filo (646 contra 644 ms) con la máquina cargada | lazo `l-voz` | **Cambio del spec**: el lazo exige `loadavg1` < 2,5 al medir y todas las corridas pegadas |
| La corrida C2 de voz salió con otro detector (Silero) porque faltó `--detector energia`; y el primer control del coordinador cambió dos variables a la vez (acuse y cierre) y no era comparable con la base | lazo `l-voz` | **Regla**: un control cambia una sola variable; y `mide.ts` debería imprimir su configuración contra la de la base y marcar «no comparable» cuando difiere (propuesta para `scripts/centro-de-mando/mide.ts`) |
| El primer `validate` sobre el commit cayó en la gobernanza (2 de 171): `verifica:enchufes` no estaba nombrado en el README, y una hora ISO armada en un *template literal* (la letra de la hora pegada a sus dos cifras, justo después de `}`) tenía la forma de un identificador de caso. El primer borrador de esta misma fila repitió el ejemplo literal y volvió a tumbarla. El tercero, `verifica:generados`: el banner del registro de enchufes iba en una línea de JSDoc (` * ALTO…`), y el verificador solo lo acepta en un comentario de línea (`//`, `#`, `--`, `<!--`) o en `_ALTO` | nodo `gobernanza`, lazo `l-validate` | **Regla** (ya la caza el verificador, y está bien que lo haga): dar de alta un gate incluye su línea en `README.md`; las horas ISO en código se arman por partes. **Propuesta**: que el patrón de identificadores no muerda `T` seguida de dos cifras y dos puntos (una hora), con su siembra; cambiar el verificador es un CDC |
| `/buzon/[pyme]` no se puede sembrar con sesión de usuario | lazo `l-adopcion` | **Cambio del spec**: el N/N declara de antemano qué rutas exigen datos que solo crea un operador, y el laboratorio decide antes de construir |
| El lock cambió de formato a media sesión (`sha256:` en el ancla, por `audita:secretos`) y la skill lo siguió porque lee el formato con `compruebaLock` | arista `e-pinea` | **Regla** (ya cumplida): todo consumidor del lock lo lee por `pinea.mjs`, nunca por su cuenta |

## 4. Estado de los lazos

| Lazo | Estado | Evidencia |
|---|---|---|
| `l-firma` | **verde** | `FIRMA_OK v0.2.10 829a9e9 (lock vigente)`, repetido tras el reinicio; lock en `tools/capa/upstream.lock.json` |
| `l-instancias` | **verde** | `PRUEBA_OK: (a)-(h)`, 69 comprobaciones, sobre el código final (`instancias.md`) |
| `l-capa` | **verde** | `prueba:tools -- capa` 33 pruebas; `empaqueta capa`: 3 subpaths en un proyecto limpio (`./react` sin probar ahí, R20) |
| `l-enchufe` | **verde** | `verifica:enchufes` 23/23 y 10/10 siembras; ahora es gate de `validate` |
| `l-adopcion` | **verde con brecha** | 62/63 rutas dentro de la capa, 0 errores de consola; `/buzon/[pyme]` es brecha decidida (D16); el aviso de hidratación intermitente es R13 |
| `l-voz` | **parcial** | acuse p50 630 ms en la corrida comparable y en calma (646 en la cargada); «para» 16/16 sin tardías y eco 0/6 en las cuatro corridas; órdenes y reacción del «para» más lentas que la base, **no atribuidas** (R8); enrutador 71,6 % en el corpus D, caída declarada (R1); Silero, R14 |
| `l-mesa` | **verde** | red sin salida, 51 peticiones al origen local, almacén con 9 archivos y ninguno de la conversación (`mesa.md`) |
| `l-recompone` | **verde** | `git diff --stat -- tools/capa` vacío sobre la rama (árbol de `tools/capa` `8019a63e86…`, el del commit final); los dos lados en verde (`producto.md`) |
| `l-simulacro` | **verde** | v0.2.9 → v0.2.10 parado en el CDC; sin firma y llave ajena → `FALLA` sin escribir nada (`skill.md`) |
| `l-resumen` | **verde** | el texto libre se rechaza entero y queda en la cuarentena del VPS (`resumen.md`, caso (h)) |
| `l-validate` | ver la entrada de CDC | `npm run validate` sobre el commit final (`docs/goals/capa-arbrain-propuestas/cdc-capa.md`) |
