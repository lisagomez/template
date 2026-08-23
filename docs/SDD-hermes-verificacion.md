# SDD — Mantener Hermes al día y verificar sus datos técnicos

**Estado:** especificado, **no implementado**. Implementarlo es un CDC propio (C1).
**Ámbito:** el diseño y el script viajan con el template; **la ejecución semanal es del
entorno** de cada proyecto (un cron, en la máquina o el servidor que lo corra).

---

## 1. El problema

El runbook `FASE0-INFRAESTRUCTURA.md` afirma cosas técnicas sobre Hermes: un tag de imagen
pineado, tres subcomandos, la ruta `HERMES_HOME`, las variables del dashboard y su puerto.
**Ninguna se había verificado nunca desde este repositorio.** Venían del material de origen,
comprobadas allí el 2026-06-26, y el documento lo declara en un aviso.

Un aviso no es un control. Y las afirmaciones de un boilerplate las hereda cada proyecto:
si envejecen mal, envejecen mal en todos a la vez.

### Lo que se descubrió al escribir este SDD

Consultando el registro público, en un minuto:

| Hecho | Estado |
|---|---|
| `nousresearch/hermes-agent` existe | ✅ verificado (HTTP 200) |
| El tag pineado `v2026.6.19` existe | ✅ verificado |
| **Releases publicadas desde entonces** | **13** — la última, `v2026.8.19` (2026-08-21) |
| `latest` y `main` | actualizados **hoy**, mismo digest entre sí |

**El pineo está dos meses por detrás y nadie lo sabía.** No es un fallo del pineo — el pineo
hizo su trabajo: mantener el sistema estable y previsible. Lo que faltaba era el otro
extremo del lazo: **algo que avise de que el mundo se movió.**

Pinear sin vigilar no es estabilidad, es rezago silencioso.

---

## 2. Principio de diseño

> **El job nunca cambia nada. Detecta deriva y prepara la decisión.**

Actualizar el tag es un **CDC completo** (C1): diff, regresión, aprobación humana y entrada
firmada. Un job que actualizara solo sería exactamente el anti-patrón que C1 existe para
impedir — cambio de comportamiento sin gate, sólo que automatizado y por tanto peor.

Tres consecuencias que atraviesan todo el diseño:

1. **Sin LLM.** El vigilante no razona: compara. Un vigilante que depende del agente falla
   cuando falla el agente. Mismo patrón que el vigilante de respaldos (§9.8 del runbook).
2. **Sin credenciales.** Consulta un registro público. No toca `.env`, no toca secretos, y
   por tanto no puede filtrarlos.
3. **Falla ruidosa.** Si no hay red, si la API cambia, si el repositorio desaparece: **rojo,
   nunca verde silencioso.** El modo de falla que esta capa ha sufrido tres veces es un
   control que parece funcionar y no mide nada.

---

## 3. Qué se verifica — dos capas

Mismo reparto que C2: una capa barata y determinista que corre siempre, y otra cara que
corre cuando toca decidir.

### Capa A — mecánica, semanal, sin descargar la imagen

| # | Comprobación | Falla si |
|---|---|---|
| **A1** | El repositorio del registro responde | No existe o no responde → puede ser retirada del upstream |
| **A2** | El tag pineado sigue publicado | Desapareció → el `docker compose up` de un servidor nuevo fallaría |
| **A3** | **El digest del tag pineado no ha cambiado** | Cambió → **el tag fue re-publicado**: no es deriva, es incidente (§6) |
| **A4** | Cuántas releases hay más nuevas, y cuál es la última | Nunca falla: **informa**. La escalada la decide §5 |
| **A5** | `latest` / `main` siguen siendo móviles | Control positivo: confirma que el anti-patrón sigue siendo real |

**A3 es la comprobación que más gente olvida.** Un tag **no es inmutable**: se puede volver
a publicar sobre el mismo nombre. Pinear por tag protege del despiste, no de un upstream
comprometido. Por eso el digest se guarda y se compara.

> **Mejora natural cuando se implemente:** pinear el compose **por digest**
> (`imagen@sha256:…`) además del tag. Entonces A3 deja de ser una alarma y pasa a ser
> imposible por construcción. Es un cambio de comportamiento: CDC propio.

### Capa B — aserciones sobre la imagen, en cada CDC de actualización

No semanal: **cara** (descarga imágenes) y sólo relevante cuando de verdad se va a mover el
pineo. Es lo que convierte "hay una versión nueva" en "la versión nueva sirve".

| # | Afirmación del runbook | Cómo se comprueba |
|---|---|---|
| **B1** | Existen los subcomandos `setup`, `gateway run`, `dashboard` | Ejecutar la imagen con `--help` y buscarlos en la salida |
| **B2** | `HERMES_HOME` es `/opt/data` | Inspeccionar el entorno de la imagen |
| **B3** | El dashboard usa `DASH_USER` / `DASH_PASS` / `DASH_SECRET` | Documentación de la release + arranque en seco del dashboard |
| **B4** | El dashboard escucha en `9119` | Puertos expuestos de la imagen |

**Cada B que falle es un cambio incompatible**, y su sitio es el CDC de la actualización —
no una sorpresa el día que alguien provisione un servidor.

---

## 4. Cadencia y disparadores

| Qué | Cuándo | Coste |
|---|---|---|
| Capa A | **Semanal**, lunes 09:00 (hora local del servidor, fijada con `timedatectl`) | Una llamada HTTP |
| Capa B | En **cada CDC** que proponga mover el pineo | Descarga de imagen |
| A3 en rojo | **Inmediato**: no espera al lunes siguiente | — |

La hora importa: los servidores cloud vienen en UTC, y "09:00" significa lo que crea la
zona horaria configurada, no lo que crea quien lo escribió.

---

## 5. Escalada — cómo se decide actuar, y cómo se evita el sello de goma

Un informe semanal que diga *"13 releases por detrás"* todas las semanas deja de leerse a
la tercera. Eso es **O3, la fatiga de aprobación**, y es el modo de falla más probable de
este mecanismo: no que deje de correr, sino que corra y nadie lo mire.

Por eso **el informe no reporta estado, reporta cambios de estado**:

| Situación | Qué hace el vigilante |
|---|---|
| Nada cambió desde la semana pasada | **Silencio.** No hay informe |
| Hay releases nuevas desde el último informe | Aviso una vez, con la lista y el enlace a las notas |
| El pineo cumple **90 días** | Aviso de antigüedad, una vez |
| Cualquier comprobación de la capa A en rojo | Aviso inmediato, y A3 abre incidente |

**El silencio es la señal de que todo está igual.** Y como un vigilante mudo es
indistinguible de uno muerto, se necesita el heartbeat de §7.

Sobre actualizar por actualizar: **estar al día no es un objetivo**. El objetivo es decidir
a sabiendas. Una release nueva se adopta cuando aporta algo o cierra algo; el rezago se
vuelve deuda cuando nadie decide, no cuando el número crece.

---

## 6. Cuando A3 se pone en rojo: es un incidente, no una deriva

Que el digest de un tag pineado cambie significa que **alguien re-publicó sobre un nombre
que este proyecto trata como fijo**. Es el atacante **O5** del catálogo: cadena de
suministro.

Procedimiento: `.claude/gobernanza/plantillas/incidente.md`, y entrada en `INCIDENTES.md`.

- **No se actualiza** para "arreglarlo". Un digest que cambió sin aviso es justo lo que no
  hay que traerse a producción.
- Se compara con las notas de la release: ¿hubo re-publicación anunciada?
- Se contiene fijando el compose al **digest anterior**, que sigue siendo descargable.
- Cierre, como todo incidente: contener → clasificar → **caso de regresión** → aprendizaje.

---

## 7. Cómo se evita que este control se pudra

Es la pregunta que hay que hacerle a cualquier control nuevo, y esta capa se la ha fallado
varias veces a sí misma.

| Riesgo | Mitigación |
|---|---|
| **El job deja de correr y nadie se entera** | Marca de éxito en disco tras cada corrida. Si supera 10 días, el aviso salta. Es el modo de falla real de todo cron |
| **La API del registro cambia y el script "pasa"** | Toda comprobación que no pueda **afirmar** su resultado devuelve rojo. Ausencia de respuesta ≠ ausencia de deriva |
| **Nadie lee el informe** | §5: se reporta el cambio, no el estado |
| **El script se pudre** | Se le exige control negativo: probarlo contra un tag inventado debe dar rojo. Un verificador que nunca ha fallado no está verificado |
| **El baseline se desincroniza del compose** | El script **lee el tag del compose**, no lo lleva escrito. Si el compose cambia, el script sigue al compose |

Ese último punto es el que evita la clase de fallo que esta capa ya sufrió: un control
anclado en una copia del dato en vez de en el dato.

---

## 8. Contrato del script

`scripts/verifica-hermes.mjs` — sin dependencias externas.

**Entradas**: el tag pineado, **leído de `docs/FASE0-INFRAESTRUCTURA.md`** (fuente única);
el digest del último baseline conocido, de `.hermes-baseline.json`.

**Salidas**:
- Exit `0` — sin deriva. Actualiza la marca de éxito.
- Exit `1` — deriva o comprobación en rojo. Escribe el informe.
- Exit `2` — **no pudo verificar** (sin red, API cambiada). Nunca se confunde con "todo bien".

**Nunca**: edita el compose, edita el runbook, escribe en un registro append-only, ni toca
credenciales. Si hay que proponer un CDC, deja un **borrador fuera** de la bitácora — un
borrador sin firma dentro de un archivo append-only se lee como aprobado.

```jsonc
// .hermes-baseline.json — versionado: es el ancla contra la que se compara
{
  "imagen": "nousresearch/hermes-agent",
  "tag": "v2026.6.19",
  "digest": "sha256:9f367c7756ef0876…",   // verificado 2026-08-23
  "verificado": "2026-08-23",
  "capaB": { "subcomandos": null, "hermeHome": null, "puertoDashboard": null }
}
```

Los `null` de la capa B son deliberados: **todavía no se ha comprobado nada de eso.** Un
baseline que finja saberlo sería peor que uno que declare su ignorancia.

---

## 9. Modelo de amenazas (C3)

| Objetivo del atacante | Superficie | Control |
|---|---|---|
| **O5 · Cadena de suministro** — re-publicar el tag pineado | Registro público | A3 (digest); pineo por digest cuando se implemente |
| **O5 · Typosquatting** — un nombre parecido en el compose | Edición del compose | El script lee el nombre del compose y comprueba que responde; un nombre inventado da rojo |
| **O3 · Fatiga de aprobación** — informes semanales que nadie lee | El propio informe | §5: se reporta el cambio, no el estado |
| **O4 · Denial-of-wallet** | — | Sin LLM y una llamada HTTP semanal: coste nulo por diseño |
| Respuesta manipulada del registro | HTTP hacia el registro | Sólo se comparan nombres y digests, nunca se ejecuta nada de la respuesta |

**Lo que este mecanismo NO defiende**: que una release nueva y legítima traiga una
regresión. Para eso está la capa B en el CDC, y el gate humano detrás.

---

## 10. Evaluación de impacto (C4)

*¿A quién dañamos si el sistema opera bien y se equivoca?*

| Punto | Respuesta |
|---|---|
| **Datos personales que toca** | Ninguno. Consulta un registro público de imágenes |
| **Partes afectadas** | El dueño del proyecto. Indirectamente, los usuarios de un agente que corra una versión con un fallo conocido |
| **Daño con el sistema operando bien** | Un **falso "todo en orden"**: el proyecto cree estar vigilado y arrastra una versión vulnerable. Por eso el exit `2` existe y no se confunde con el `0` |
| **Acciones irreversibles** | Ninguna. El job no escribe fuera de su informe y su baseline |
| **Vía de apelación humana** | Todo su output es una propuesta; nada se aplica sin CDC firmado |
| **Aislamiento de datos** | No accede a la base de datos ni a credenciales |

---

## 11. Implementación — lo que falta

Este documento **especifica**; no implementa. Lo que queda, en orden:

1. `scripts/verifica-hermes.mjs` con el contrato de §8, **y su control negativo**: contra un
   tag inventado debe dar rojo, y sin red debe dar exit `2`, no `0`.
2. `.hermes-baseline.json` con los valores verificados hoy (§8).
3. Comprobación en el verificador: que el baseline exista y que su `tag` coincida con el del
   compose del runbook — si divergen, rojo.
4. **Primera corrida de la capa B**, que cerraría por fin el pendiente *"los datos técnicos
   de Hermes no se re-verificaron"*. Requiere descargar la imagen.
5. El cron semanal — **en el entorno**, no en el template.

**Nada de esto se aplica sin CDC**: añadir un script al gate y un archivo de baseline cambia
lo que el sistema comprueba, y eso es comportamiento.

---

## 12. Qué cierra y qué no

**Cierra**: el diseño del lazo que faltaba. El pineo daba estabilidad; le faltaba el sensor
que avisa de que el mundo se movió. Un homeostato necesita las dos mitades.

**No cierra**: los datos técnicos siguen sin re-verificarse — eso lo hace la capa B, y
requiere descargar la imagen. Lo que sí queda verificado hoy es el nivel de arriba: el
repositorio existe, el tag pineado existe, y **hay 13 releases de rezago**.
