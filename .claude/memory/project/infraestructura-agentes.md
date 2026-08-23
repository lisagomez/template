# Infraestructura de agentes y respaldos — estado

**Consolidada:** 2026-08-23 · **Estado:** cableada al flujo y **CDC firmado** (2026-08-23);
**nada provisionado aún**

## Qué se hizo

Se fusionaron los tres documentos de Fase 0 del proyecto Hermes OS
(`FASE0.md`, `FASE0-hetzner.md`, `FASE0-respaldos.md`, en
`/home/gsore/code/a2aboths/businessos/`) en un solo runbook portable:
`docs/FASE0-INFRAESTRUCTURA.md`. Declarado en `README.md`, en `BUSINESS_LOGIC.md` §4
(inventario de respaldo) y §7 (paso 7), y aquí.

**Cableado al flujo con CDC firmado** (`BITACORA-CDC.md`, 2026-08-23, radio: sistema):
rama nueva en el decision tree de `CLAUDE.md` y `GEMINI.md`, más **dos reglas nuevas en
Reglas de Código** — respaldo como contrato y canales de chat externos — y el tag de imagen
de agente añadido a la regla de CDC. Las reglas van inline, no en el runbook, por la
lección de que un control escrito solo en el documento no dispara. La firma aprueba **el
cableado**; los pendientes de abajo siguen abiertos.

Mismo material de origen que la capa de gobernanza — ver
[[material-origen-gobernanza]] y [[gobernanza-agentica]].

## Cambios de alcance pedidos (2026-08-23, lisagomez)

- **Tres verticales → dos.** Se retira `personal`. Quedan `negocio` (datos propios) y
  `clientes` (datos de terceros). La frontera **no es organizativa: es de radio de daño**,
  y es justo la que separa lo firmable de lo infirmable en C5.
- **Telegram y Slack fuera de Fase 0.** No es "aún no toca": un canal de chat es superficie
  de entrada no autenticada hacia un agente con llaves. Entra con modelo de amenazas (C3) y
  AISIA (C4), o no entra. En Fase 0 el único canal es el dashboard por túnel SSH.
- **Inventario de respaldo parametrizado.** El origen listaba activos de Hermes OS (Postgres
  del grafo, `trio-workspace`, MSP de Fabric). Ahora §9.1 es una tabla que cada proyecto
  llena, con una regla de criticidad explícita (*¿se puede reconstruir?*).

## Las cuatro contradicciones que tenían los originales

Los tres documentos se contradecían y **nadie lo había notado porque nunca se leyeron
juntos**. Quedó una sola respuesta por punto (tabla completa en el apéndice del runbook):

1. **Respaldo:** `FASE0.md` §9 mandaba tarball → GitHub; `FASE0-respaldos.md` lo degradaba a
   espejo. Ganó Borg + B2. El token de push vive en el box que se respalda.
2. **Volúmenes:** `FASE0.md` usaba bind mounts, `FASE0-respaldos.md` volúmenes nombrados
   (`/var/lib/docker/volumes/hermes_negocio-hermes/`). Ganaron los bind mounts: **el nombre
   del volumen depende del nombre del directorio**, así que un `mv` deja el script de
   respaldo corriendo en verde sobre una ruta muerta. Falla silenciosa, la peor clase.
3. **Location:** `fsn1` vs Ashburn VA. Se deja como decisión de latencia, no fija.
4. **Usuario:** `hermes` con hardening propio vs el `deploy` de `DEPLOY-HETZNER.md`. Uno
   solo (`deploy`), y el hardening **por referencia**, no duplicado: dos procedimientos de
   hardening en el mismo repo divergen.

## Lo que se añadió y no estaba en ningún origen

**§0 — dónde montar los agentes.** `DEPLOY-HETZNER.md` declara el servidor de la app
*desechable* porque los datos viven en Supabase. Es cierto para la app y **falso para los
volúmenes `.hermes`**, que son memoria irrecuperable. Montar estado irrecuperable en un box
que se trata como desechable es cómo se pierde: no por fallo técnico, por la costumbre de
reconstruirlo sin pensar.

Además los números no daban: app 4 GB + caddy 0.5 + dos Hermes a 2 GB + SO = **9 GB sobre
8** en un cx33. Recomendación: **servidor aparte** (CX22), o mismo box con límites
retuneados (app 3 GB, Hermes 1.5 GB c/u).

## Pendientes reales

1. **Nada está provisionado.** El runbook es papel hasta que exista un servidor. No asumir
   que hay agentes corriendo.
2. **Los datos técnicos de Hermes NO se re-verificaron.** Tag `v2026.6.19`, subcomandos
   (`setup`, `gateway run`, `dashboard`), ruta `/opt/data` y variables `DASH_*` vienen del
   origen (verificados allí el 2026-06-26). Confirmar contra la doc oficial de Nous antes de
   provisionar. El documento lo dice; no lo escondas si alguien pregunta.
3. **GATE 3 nunca se ha corrido**, en ningún proyecto. RPO/RTO siguen siendo desconocidos y
   **no deben declararse** hasta medirlos. Operar sin cerrarlo es riesgo aceptado → entrada
   firmada en `REGISTRO-RIESGO.md` (C5), no un silencio.
4. **La aserción 3 de GATE 3 está sin escribir a propósito.** Las dos primeras solo
   comprueban que existen archivos; la tercera comprueba que el *contenido* sirve, y depende
   del proyecto. Un GATE 3 con solo las dos primeras es teatro.
5. **El tag de la imagen del agente es un CDC (C1)**, igual que el modelo. Ya está en la
   regla de Reglas de Código; falta la entrada real cuando se despliegue.
6. **T12 y T13 ya existen** (rama `golden-sets`, commit `154ad33`, capa B 14/14) pero
   **no se han ejecutado en sesión fría**. Corpus completo no es evidencia: las dos reglas
   nuevas siguen sin medición real, solo dejaron de estar sin instrumento. T12 mide los
   canales de chat externos; T13, la declaración de RPO/RTO sin GATE 3. Ejecutarlos es la
   deuda viva — y T12 primero, porque protege una superficie real.
7. **El verificador no vigila las reglas nuevas.** Si alguien las borra de `CLAUDE.md`, las
   58 comprobaciones siguen en verde. Es el mismo tipo de hueco que el pineo aspiracional.

## Decisiones que no son obvias del documento

- **`AGENTS.md` es un prompt, no configuración.** Por eso editarlo en el servidor "rapidito"
  es exactamente el hueco que C1 cierra. Se edita en el repo, pasa regresión, se aprueba, se
  copia.
- **El vigilante del respaldo va sin LLM a propósito.** Un vigilante que depende del agente
  falla exactamente cuando el agente falla. La alarma vive fuera de lo que vigila.
- **N0 (restauración verificada) es obligatorio; N1/N2 se eligen.** Un proyecto con tres
  destinos y sin N0 tiene tres copias de algo que nadie comprobó que se pueda restaurar.
  Se resistió la tentación de imponer el 3-2-1-1-0 completo a todo proyecto.
- **Se mantuvieron dos controles independientes para el mismo riesgo** (firewall de red de
  Hetzner **y** publicar el dashboard solo en `127.0.0.1`), porque el firewall es config
  remota que alguien puede aflojar desde una consola web sin tocar el servidor.
