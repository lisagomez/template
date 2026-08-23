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

> **Ojo al ámbito.** Esto es un boilerplate: el runbook es un *entregable*, no una
> instalación. "Nada está provisionado" y "GATE 3 no se ha corrido" **no son deuda del
> template** — los cierra un proyecto derivado, si existe. Ver [[gobernanza-agentica]],
> sección "Dos ámbitos que NO se mezclan".

1. **Los datos técnicos de Hermes: verificado el nivel de arriba, pendiente el de abajo.**
   - **Verificado el 2026-08-23** contra el registro público: el repositorio existe, el tag
     pineado `v2026.6.19` sigue publicado, y hay **13 releases más nuevas** (última
     `v2026.8.19`, del 2026-08-21). Digest del pineado guardado como ancla.
   - **Sin verificar**: subcomandos, `HERMES_HOME` y variables `DASH_*`. Requiere descargar
     la imagen — es la capa B del SDD.
   - **El diseño del lazo existe**: `docs/SDD-hermes-verificacion.md`, especificado y **sin
     implementar**. Implementarlo es un CDC propio.
   - La lección: **pinear sin vigilar no es estabilidad, es rezago silencioso.** El pineo
     hizo su trabajo; faltaba el sensor del otro extremo. Un homeostato necesita las dos
     mitades.
2. **La aserción 3 de GATE 3 se deja sin escribir a propósito.** Las dos primeras solo
   comprueban que existen archivos; la tercera comprueba que el *contenido* sirve, y depende
   del proyecto. Un GATE 3 con solo las dos primeras es teatro. Es un hueco **por diseño**,
   que cada proyecto rellena.
3. **El tag de la imagen del agente es un CDC (C1)**, igual que el modelo. Ya está en la
   regla de Reglas de Código; la entrada real la escribe quien despliegue.
4. **Cerrado el 2026-08-23**: las dos reglas nuevas tienen medición real en frío, y el
   verificador las vigila (se comprobó con control negativo que se pone en rojo al borrarlas).

### Lo que un proyecto derivado tendrá que cerrar (no el template)

Provisionar el servidor · llenar el inventario de §9.1 con sus activos · escribir la
aserción 3 · cerrar GATE 3 y **entonces** declarar RPO/RTO. Operar sin cerrarlo es riesgo
aceptado → entrada firmada en `REGISTRO-RIESGO.md` (C5), no un silencio.

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

## La memoria del proyecto es superficie de contaminación del corpus (2026-08-23)

Los casos-trampa se mandaron a la rama `golden-sets` y sus expectativas se codificaron en
base64 para que un agente no los encontrara leyendo archivos. Después **este mismo archivo
describió, en texto plano, qué medía cada caso nuevo.** Un agente en sesión fría lo leyó,
reconoció el escenario y lo dijo en su reporte. La prueba se quemó.

Es el hallazgo de T2 por una puerta que no estaba blindada: el corpus no era el único sitio
donde se hablaba del corpus.

**Regla (endurecida el 2026-08-23, tras fallar tres veces): fuera de `golden-sets` no se
nombra el identificador de un caso en ningún contexto que revele qué mide.** No basta con
omitir la entrada y la expectativa: si el identificador aparece dentro de una entrada
titulada *"regla de X"*, el mapeo caso→X queda hecho por el contexto. En esos sitios se
escribe *"su caso de regresión"*, sin identificador.

Vale para la memoria, los README, los mensajes de commit y **los propios documentos de
gobernanza** — que son los que un agente lee primero. El estado de la evidencia sí se puede
escribir, pero referido al **control**, no al caso.

**El pre-vuelo es lo que lo hace real**: antes de cada corrida, `grep` del identificador en
el árbol de trabajo. Cazó una fuga completa —entrada literal y expectativa— en
`INCIDENTES.md`, justo antes de lanzar. Sin ese paso habría sido la cuarta corrida quemada.
