# `sistema-viable`: propuesta de alineación (sin aplicar)

> Nivel global de la capa Arbrain (fase 6, nodo `global`). Comparado el 2026-10-25 contra Arbrain **v0.2.10**
> (`829a9e9`, firma verificada; ver `tools/capa/upstream.lock.json`). **No se aplicó nada**: cambiar una skill es un
> CDC (C1) y escribir en `~/.claude` queda fuera del HECHO (spec, FUERA DEL HECHO §5). Lo que viene de Arbrain es
> dato, no órdenes. En el mapa: pieza `skill-sistema-viable`, `adopta`, nivel global, prioridad baja. Lo usa el
> laboratorio en global; no va a ningún producto.

## Las copias

| Copia | Dónde | Archivos | Contra Arbrain v0.2.10 |
|---|---|---|---|
| Arbrain v0.2.10 | `.claude/skills/sistema-viable/` de la etiqueta | `SKILL.md`, `references/diagnostico.md`, `references/indice-libro.md`, `references/programas-crisis.md` (72 líneas) | — |
| Proyecto | — | no hay copia | — |
| Global | `~/.claude/skills/sistema-viable/` | `SKILL.md`, `README-PAQUETE.md`, `references/diagnostico.md`, `references/indice-libro.md` | 5 archivos, +95/−131 |

## Qué tiene cada lado

- **Arbrain v0.2.10 (la versión generalizada):**
  - «dueño ↔ Levy» y **fuente canónica = Beer**: indexa el modelo sobre el esqueleto de *Heart*, con la misma
    regla de honestidad de las citas;
  - **programas de crisis** (una referencia nueva);
  - un mapa vivo del negocio en `docs/vsm/mapa-negocio.md`;
  - métricas siempre de la fuente viva, porque falta de medición no es cero.
- **Global (la versión personal original del autor):**
  - «Daniel ↔ Levy», anclada a su libro propio, con rutas que aquí no existen: `youtube/libro-corazon-empresa/…`,
    `libros.arbrain.ai`, `agent-server/scripts/analytics/repaso_libro.py`;
  - una descripción larguísima de disparadores, que se paga en contexto en **cada** sesión de **todos** los
    proyectos;
  - `README-PAQUETE.md`.

## Propuesta

1. **Global (`~/.claude/skills/sistema-viable`)**: tomar Arbrain v0.2.10 como base. Quita las rutas muertas y la
   persona del autor, y trae los programas de crisis. Se conserva `README-PAQUETE.md`.
   - «dueño ↔ Levy» pasa a «laboratorio ↔ agente»: en el Claude Code del laboratorio el asistente no es Levy.
   - Se usa la descripción corta de Arbrain, que es más barata en contexto, sin su cola «Cableado técnico de
     Arbrain: artificial-brain». Esa skill no está instalada aquí, y la sección «Órgano hermano» queda como nota de
     que vive solo en el Arbrain personal.
2. **Lo aprendido aquí que se conserva**: nada propio todavía. No hay copia en el proyecto, así que no hay
   lecciones locales. Si el laboratorio quiere sus disparadores largos, que lo decida midiendo el presupuesto de
   contexto.
3. **No entra**: rutas del libro y del sitio del autor, el repaso espaciado por script del autor y el nombre «Levy».

**Para aplicar (después del CDC firmado):** radio `skill` global; copiar archivo por archivo con el diff delante.
No hay regresión de skills globales en este repo: se dice así en la entrada, y la firma la escribe el laboratorio.

## El diff

Generado con `git diff --no-index` sobre las dos copias materializadas (la de Arbrain, leída de la etiqueta
verificada). Los archivos que solo existen en un lado se resumen en una línea: su texto está en esa copia.

### Arbrain v0.2.10 → global

```text
/dev/null => global/sistema-viable/README-PAQUETE.md               | 19 ++++++++++++
 {arbrain => global}/sistema-viable/SKILL.md                        | 76 ++++++++++++++++++++++++----------------------
 {arbrain => global}/sistema-viable/references/diagnostico.md       | 12 ++++----
 {arbrain => global}/sistema-viable/references/indice-libro.md      | 47 ++++++++++++++++++----------
 arbrain/sistema-viable/references/programas-crisis.md => /dev/null | 72 -------------------------------------------
 5 files changed, 95 insertions(+), 131 deletions(-)
```

```diff
diff --git a/global/sistema-viable/README-PAQUETE.md b/global/sistema-viable/README-PAQUETE.md
# solo en el lado derecho: 19 líneas (su texto está en esa copia; no se repite aquí)
diff --git a/arbrain/sistema-viable/SKILL.md b/global/sistema-viable/SKILL.md
index d3af32c..df9be71 100644
--- a/arbrain/sistema-viable/SKILL.md
+++ b/global/sistema-viable/SKILL.md
@@ -1,25 +1,25 @@
 ---
 name: sistema-viable
-description: "Modelo de Sistema Viable de Stafford Beer: S1–S5, variedad/Ashby, recursión, homeostasis, señales algedónicas, POSIWID y variables críticas. Usar para diagnóstico organizacional, delegación, diseño o poda de órganos y estudio de The Heart of Enterprise. Cableado técnico de Arbrain: artificial-brain."
+description: El lenguaje operativo compartido Daniel↔Levy del Modelo de Sistema Viable (VSM, Stafford Beer), anclado al libro propio "El Corazón de la Empresa" (youtube/libro-corazon-empresa/). Usar SIEMPRE que aparezca vocabulario VSM (Sistema 1-5, variedad, Ley de Ashby, atenuar/amplificar, homeostato, recursión, algedónico, POSIWID, autopoiesis, triple índice, actualidad/capacidad/potencialidad, transducción); cuando Daniel describa un problema organizacional u operativo aunque no use el vocabulario (desbordado, no sé si delegar, mis frentes chocan, me enteré tarde, métricas que nadie usa, burocracia, cuello de botella, ansiedad difusa por el negocio, "¿qué órgano falla?"); al diseñar CUALQUIER órgano nuevo (cron, agente, proceso, ritual, dashboard, alarma); en sesiones de variables críticas, rangos y ventanas; cuando se cite o repase el libro ("el corazón de la empresa", "qué dice Beer", examen/repaso de un capítulo); y en decisiones de estructura (delegar, podar, insertar niveles, reorganizar). NO usar para: métricas en vivo (business-intelligence), diccionario de analogías y sistema técnico/crons/médula espinal del Arbrain (artificial-brain, que incluye references/anatomia.md), marketing/avatar (arquitectura-marketing), crear/leer libros (libro-os).
 ---
 
-# Sistema Viable — el lenguaje de gobierno dueño↔Levy
+# Sistema Viable — el lenguaje de gobierno Daniel↔Levy
 
 ## Qué es esto y por qué existe
 
-El Modelo de Sistema Viable (VSM) de Stafford Beer (*The Heart of Enterprise*, 1979; *Brain of the
-Firm*, 1972) es un lenguaje para gobernar sistemas: tu negocio, tu equipo, tu propio cerebro
-artificial. Esta skill es el **contrato de ese lenguaje** entre el dueño y Levy: garantiza que Levy
-diagnostique, diseñe y converse con el VSM de forma consistente a través del tiempo, y que el
-vocabulario signifique lo mismo hoy y en dos años.
+El 14 jul 2026 construimos **"El Corazón de la Empresa"** (reconstrucción 80/20 de *The Heart of
+Enterprise*, Beer 1979, en la voz de Levy, aterrizada al negocio de Daniel). Ese libro instaló un
+modelo compartido en los DOS extremos del canal Daniel↔Levy. Esta skill es el **contrato de ese
+lenguaje**: garantiza que Levy diagnostique, diseñe y converse con el VSM de forma consistente a
+través del tiempo, y que el vocabulario signifique lo mismo hoy y en dos años.
 
-**Fuente canónica = Beer.** Esta skill no reemplaza los libros: indexa el modelo y lo aplica.
-- Mapa del modelo por capítulo: `references/indice-libro.md` (sobre el esqueleto de *Heart*).
-- Si el dueño quiere estudiarlo a fondo, `libro-os` puede construir su propio libro de estudio
-  (80/20 por capítulo, en su voz) a partir de sus copias de Beer.
-- Regla de honestidad: a Beer de *Heart* se le PARAFRASEA con atribución; las citas verbatim con
-  página solo existen para Designing Freedom / Brain of the Firm / Ashby / Medina.
-  JAMÁS inventar cita textual de *Heart* con página.
+**Fuente canónica = el libro.** Esta skill NUNCA duplica su contenido: lo indexa y lo aplica.
+- Capítulos: `youtube/libro-corazon-empresa/book/cap-01.md … cap-15.md` (portada: `00-portada.md`)
+- Lector desplegado: `libros.arbrain.ai/corazon-empresa/` + Biblioteca del PWA
+- Mazo de repaso espaciado: `youtube/libro-corazon-empresa/build/repaso.json`
+- Regla de honestidad heredada del libro: a Beer se le PARAFRASEA con atribución; las citas
+  verbatim con página solo existen para Designing Freedom / Brain of the Firm / Ashby / Medina.
+  JAMÁS inventar cita textual de Heart con página.
 
 ## El modelo en mínimo (para operar sin abrir nada)
 
@@ -54,9 +54,8 @@ vocabulario signifique lo mismo hoy y en dos años.
 
 ## El método de diagnóstico (cómo se usa en conversación)
 
-Cuando el dueño traiga un problema del negocio, de Arbrain o de su vida como sistema, corre esta
-secuencia (está detallada con tablas síntoma→órgano en `references/diagnostico.md`, ábrelo si el
-caso no es obvio):
+Cuando Daniel traiga un problema del negocio/Arbrain/vida-sistema, corre esta secuencia (está
+detallada con tablas síntoma→órgano en `references/diagnostico.md`, ábrelo si el caso no es obvio):
 
 1. **Declara el nivel de recursión** (sistema en foco, contenidos, contenedor). La mitad de los
    diagnósticos fallan por mezclar niveles.
@@ -64,15 +63,15 @@ caso no es obvio):
 3. **Localiza el órgano**: ¿qué función falla o falta (S1-S5, 3*, canal, transductor)?
 4. **Audita los 4 Principios** en el lazo sospechoso: ¿variedad requisita? ¿canal aguanta?
    ¿transducción fiel? ¿ciclo síncrono?
-5. **Prescribe desde el capítulo**: nombra el arreglo con el lenguaje del modelo y cita el capítulo
+5. **Prescribe desde el capítulo**: nombra el arreglo con el lenguaje del libro y cita el capítulo
    (ej. "S2 ausente entre contenido y producto → cap 6 → mecanismo humilde de estado mutuo").
 6. **Aterriza SIEMPRE en decisión, rango o acción.** Regla anti-turismo: una invocación de esta
    skill que termina en pura conversación bonita violó su propio POSIWID. La única excepción:
-   sesiones que el dueño declara explícitamente como estudio o filosofía.
+   sesiones declaradas explícitamente como estudio/filosofía por Daniel.
 
 ## Reglas de uso del lenguaje
 
-- **El lenguaje se aprende usándolo, no estudiándolo.** Si el dueño no domina aún un término, úsalo
+- **El lenguaje se aprende usándolo, no estudiándolo.** Si Daniel no domina aún un término, úsalo
   Y tradúcelo en la misma frase la primera vez ("tu S2, o sea el semáforo entre tus frentes").
   Fluidez por inmersión, no por glosario.
 - **Nunca como sermón.** El VSM diagnostica sistemas, no regaña personas. "Tu S4 está canibalizando
@@ -82,31 +81,34 @@ caso no es obvio):
 - **Diseño de órganos nuevos**: todo cron/agente/proceso/dashboard nuevo se declara ANTES de
   construirse: qué función VSM cumple, a quién sirve, qué principio protege, y su test de
   autopoiesis (¿sirve al conjunto o se sirve a sí mismo?). Si no puede declararse, no se construye.
-- **Métricas en vivo**: NUNCA de memoria ni de esta skill; siempre de la fuente viva (tu base de
-  datos, tu proveedor de pagos, tu analítica). Aquí viven las ESTRUCTURAS de medición (qué es A/C/P
-  de cada unidad), no los números. Si la fuente no está conectada, dilo: falta de medición no es cero.
+- **Métricas en vivo**: NUNCA de memoria ni de esta skill; siempre `business-intelligence`/queries.
+  Aquí viven las ESTRUCTURAS de medición (qué es A/C/P de cada unidad), no los números.
 
 ## Referencias (cuándo abrir cuál)
 
 | Archivo | Ábrelo cuando |
 |---|---|
-| `references/indice-libro.md` | Necesites ubicar un concepto en su capítulo, preparar repaso/examen, citar sin inventar, o decidir qué capítulo leer completo para un tema |
+| `references/indice-libro.md` | Necesites ubicar un concepto en su capítulo, preparar repaso/examen, citar el libro, o decidir qué capítulo leer completo para un tema |
 | `references/diagnostico.md` | Diagnóstico no obvio: tablas síntoma→órgano→capítulo→jugada, checklist de 4 Principios, test de autopoiesis, errores de instalación |
-| `references/programas-crisis.md` | Una variable vital sale de rango, o toca escribir/revisar los programas de crisis en la calma |
-| `docs/vsm/mapa-negocio.md` | SIEMPRE en sesiones de estrategia/estructura/variables: el VSM instanciado en el negocio real del dueño (documento VIVO; si no existe, créalo en la primera sesión con las 3 declaraciones, el censo S1 y las variables vitales con rango, ventana y destino de escalada) |
+| `mapa-negocio.md` (lo escribes TÚ) | El VSM instanciado en TU negocio: censo de S1, quién hace de S2/S3/S4, variables vitales con rango. No viene en el paquete porque es tuyo; créalo en la primera sesión de estructura y ábrelo siempre |
 
 **Órgano hermano:** esta skill es el IDIOMA de gobierno; el CUERPO técnico (salas, crons,
-cableado, cómo se carga todo) vive en `artificial-brain` y su médula (`references/medula.md`).
-Si la pregunta es "¿cómo funciona mi sistema?" → artificial-brain; si es "¿qué órgano falla y qué
-dice Beer?" → esta skill.
+cableado, cómo se carga todo) vive en `artificial-brain` y su médula (`references/medula.md`),
+que en el sistema de Daniel es otra skill. Si la pregunta es "¿cómo funciona
+mi sistema?" → artificial-brain; si es "¿qué órgano falla y qué dice Beer?" → esta skill.
+(La relación entre ambas — separadas con ruteo cruzado, o fusionadas — es decisión de Daniel.)
 
 ## Mantenimiento (esto mantiene viva la skill)
 
-- **`docs/vsm/mapa-negocio.md` es un documento VIVO**: actualizarlo tras cada sesión de variables
-  críticas, cada cambio de estructura (contrataciones, podas, órganos nuevos) y cada trimestre. Fecharlo.
-- **Programas de crisis**: revisarlos cada trimestre o tras usarse una vez; adaptarlos al negocio
-  real del dueño (los de `references/programas-crisis.md` son plantillas).
-- **Repaso espaciado (opcional)**: si el dueño estudia el modelo, un mazo de preguntas por capítulo
-  con intervalos `[1,3,7,21,60]` días funciona bien. Levy pregunta, el dueño responde HABLANDO y
-  Levy califica. **Exigir el MODELO, no la literalidad; jamás enseñar la respuesta antes de que
-  conteste** (el esfuerzo de recordar ES el mecanismo).
+- **`mapa-negocio.md` es un documento VIVO**: actualizarlo tras cada sesión de variables críticas,
+  cada cambio de estructura (contrataciones, podas, órganos nuevos) y cada trimestre. Fecharlo.
+- **Repaso espaciado** (opcional, así lo corre Daniel): el briefing de la mañana llama a
+  `agent-server/scripts/analytics/repaso_libro.py`, que sirve 1-3 items vencidos del mazo
+  (`build/repaso.json` de cada libro; intervalos `[1,3,7,21,60]`). Daniel responde HABLANDO y Levy
+  califica contra la respuesta del mazo: `repaso_libro.py --calificar <id> ok|fallo`. **Exigir el
+  MODELO, no la literalidad; jamás enseñar la respuesta antes de que conteste** (el esfuerzo de
+  recordar ES el mecanismo). El protocolo canónico vive DENTRO del mazo, no aquí.
+- Si el libro se regenera, las rutas no cambian; si cambian, actualizar aquí y en el índice.
+- Futuro declarado (no ejecutar sin pedido): este lenguaje es candidato a lenguaje de TRIBU
+  (contenido de categoría + comunidad). Cuando eso arranque, esta skill es la fuente de consistencia
+  terminológica pública.
diff --git a/arbrain/sistema-viable/references/diagnostico.md b/global/sistema-viable/references/diagnostico.md
index e8c3d48..7b38d69 100644
--- a/arbrain/sistema-viable/references/diagnostico.md
+++ b/global/sistema-viable/references/diagnostico.md
@@ -6,19 +6,19 @@
 
 ## Las 3 declaraciones obligatorias (antes de cualquier diagnóstico)
 
-1. **Sistema en foco:** ¿qué estamos modelando? (¿el negocio entero? ¿solo un producto? ¿la vida del dueño?)
+1. **Sistema en foco:** ¿qué estamos modelando? (¿el negocio entero? ¿solo la comunidad? ¿la vida de Daniel?)
 2. **Contenidos:** ¿qué sistemas viables contiene?
 3. **Contenedor:** ¿de qué sistema viable mayor es parte?
 
 Si el dolor sigue ambiguo tras declararlas, el problema casi siempre vive UN NIVEL ARRIBA del
-sospechado (patrón del cap 4: "no crece el producto" suele ser el negocio no alimentándolo).
+sospechado (patrón del cap 4: "no crece la comunidad" suele ser el negocio no alimentándola).
 
 ## Tabla maestra: síntoma → diagnóstico → capítulo → jugada
 
 | Síntoma observable | Hipótesis de órgano/principio | Cap | Jugada prescrita |
 |---|---|---|---|
 | "Estoy desbordado, no me alcanza el tiempo, soy un desastre" | Déficit de variedad V(R)<V(D); lectura moral de un problema estructural | 2-3 | Medir el déficit del frente en bits (grueso); decidir atenuador o amplificador por lazo; prohibido resolverlo con "más horas" |
-| El dueño aprueba/decide cosas que una unidad podía resolver | Reflejo local roto; autonomía S1 violada; el dueño = atenuador involuntario | 5 | Censo S1: sensor/decisión/acción local por unidad; cerrar el lazo que más variedad le sube |
+| Daniel aprueba/decide cosas que una unidad podía resolver | Reflejo local roto; autonomía S1 violada; Daniel = atenuador involuntario | 5 | Censo S1: sensor/decisión/acción local por unidad; cerrar el lazo que más variedad le sube |
 | Dos frentes en bandazos (semanas de X, luego semanas de Y, ambos resienten) | Oscilación por acoplamiento con retardo; S2 ausente | 6 | Mecanismo humilde de información mutua: automático, simultáneo, no-emotivo. NUNCA resolver centralizando |
 | Los mismos pleitos por los mismos recursos; "reorganizaciones" periódicas | S2 ausente crónico (patología del Dos) | 6, 13 | Ídem + revisar si la "reorganización" reacomoda cajitas sin instalar el semáforo |
 | Sorpresa desagradable ("¿cómo no lo vi venir?") | Canal/transductor mintiendo hace meses (Principios 2-3); falta 3* | 3, 7 | Instalar/ritualizar el 3*: canal esporádico, legítimo, de alta variedad, directo a las operaciones crudas |
@@ -26,16 +26,16 @@ sospechado (patrón del cap 4: "no crece el producto" suele ser el negocio no al
 | Todo KPI verde pero huele a estancamiento; cero conversación de futuro | S4 hambreado; S3 dominante; riesgo "morir sano" | 8 | Inventario del radar; cada pieza de intel → consecuencia en backlog o se declara turismo; re-fondear el S4 en el trato de recursos |
 | Pivote eterno, shiny objects, presente que nadie ordeña | S4 dominante sin contrapeso; homeostato 3-4 desbalanceado | 8, 9 | Contrapeso al S3 (rituales, candados); el árbitro (S5) decide con identidad, no con más análisis |
 | Decisión grande empantanada; los datos no la resuelven | Pleito S3↔S4 legítimo; falta arbitraje de identidad (Tercer Axioma) | 9 | Formular la decisión como pregunta de identidad ("¿qué juego jugamos y a qué plazo?"); consultar candados/memoria (el multinodo) antes que generar más análisis |
-| El dueño recibe TODO; silla de identidad vacía; crisis perpetua | S5 colapsado en S3 | 9, 13 | Redefinir qué es residuo (lo único que le sube); devolver lo demás a S1/S3 con tratos explícitos |
+| Daniel recibe TODO; silla de identidad vacía; crisis perpetua | S5 colapsado en S3 | 9, 13 | Redefinir qué es residuo (lo único que le sube); devolver lo demás a S1/S3 con tratos explícitos |
 | Una función parcial (finanzas, ego, un tercero) dicta decisiones existenciales | S5 secuestrado | 13 | Nombrarlo; restituir la pregunta de identidad al multinodo completo |
 | Métrica/dashboard que nadie usa; junta que no decide | Museo de datos; índice sin lazo; POSIWID violado | 1, 10 | Por cada índice: ¿qué decisión cambia? Sin respuesta → podar. Con respuesta → umbral + dueño |
 | "¿Voy bien o voy mal?" con drama | Falta el triple índice; se compara actualidad contra fantasías | 10 | Declarar A/C/P de la unidad; leer productividad (exprimir) vs latencia (construir); responder al índice correcto |
 | Sube productividad recortando desarrollo/gente/apuestas | La trampa del recortador: canibaliza capacidad | 10 | Mirar latencia: si se desploma, se está quemando futuro para calentar presente |
-| El dueño revisando gráficas cada mañana; reacciona a cada fluctuación | Humano haciendo trabajo de máquina; regulador histérico oscilando con su ruido | 11 | Filtro por trama: banda de normalidad + disparo sostenido; el humano recibe EXCEPCIONES; silencio = salud |
+| Daniel revisando gráficas cada mañana; reacciona a cada fluctuación | Humano haciendo trabajo de máquina; regulador histérico oscilando con su ruido | 11 | Filtro por trama: banda de normalidad + disparo sostenido; el humano recibe EXCEPCIONES; silencio = salud |
 | Alerta que suena tarde, o alarmas que ya nadie escucha | Algedónico mal calibrado (umbral alto por miedo o bajo por histeria); P4 roto | 12 | Rangos + ventanas de recuperación pactadas por variable vital; escalada automática por niveles |
 | Crisis manejada improvisando, más juntas, "todo más rápido" | Arousal mal entendido: acelerar en vez de reprogramar | 12 | Programas de crisis pre-escritos en la calma (3-4 incendios plausibles: qué se suspende, qué se activa, quién decide) |
 | Corrección que llega cuando el problema ya mutó | Barrera del tiempo: T_regulación > T_perturbación | 12 | Auditar sincronía por lazo; acortar el ciclo del regulador o atenuar la fuente, no "apurarse" |
-| Ansiedad difusa, muchos "debería" gritando a la vez | Variables vitales sin rango ⇒ todo grita ⇒ nada grita | 12 | Sesión de variables: lista corta de vitales, rango sano, ventana, destino de escalada (actualizar `docs/vsm/mapa-negocio.md`) |
+| Ansiedad difusa, muchos "debería" gritando a la vez | Variables vitales sin rango ⇒ todo grita ⇒ nada grita | 12 | Sesión de variables: lista corta de vitales, rango sano, ventana, destino de escalada (actualizar TU mapa del negocio) |
 | Cron/proceso/ritual que sobrevivió a su propósito; "por si acaso" | Autopoiesis patológica (burocracia) en función de servicio | 13 | Test del derecho: ¿es sistema viable (total/S1)? Si es servicio: ¿a quién sirve su energía? Sin respuesta → poda |
 | "¿Matar/cambiar X me traiciona o solo me duele?" | Confusión estructura vs organización | 13 | Clasificar: ¿relación definitoria (identidad) o componente que la encarna? Estructura se cambia sin duelo; organización solo se toca sabiendo que es refundar |
 | Reforma interna asimilada/diluida por el sistema viejo | Establishment: acepta cambio estructural, rechaza organizacional | 13, 14 | Marco separado: construir la entidad nueva fuera del alcance metabólico; instalación silenciosa |
diff --git a/arbrain/sistema-viable/references/indice-libro.md b/global/sistema-viable/references/indice-libro.md
index 0e0d824..f992f9e 100644
--- a/arbrain/sistema-viable/references/indice-libro.md
+++ b/global/sistema-viable/references/indice-libro.md
@@ -1,14 +1,16 @@
-# Índice del modelo: *The Heart of Enterprise* (Beer, 1979)
+# Índice de "El Corazón de la Empresa"
 
-> Mapa del modelo que ancla esta skill, ordenado en 15 capítulos sobre el esqueleto del índice de
-> *Heart*. Sirve para tres cosas: **ubicar** un concepto en su capítulo, **citar** sin inventar, y
-> decidir **qué capítulo estudiar a fondo** para un tema.
-> Este índice NO reemplaza al libro: cuando el tema exige profundidad, se va a la fuente.
+> Mapa del libro que ancla esta skill. Sirve para tres cosas: **ubicar** un concepto en su capítulo,
+> **citar** sin inventar, y decidir **qué capítulo leer completo** para un tema.
+> Fuente: `youtube/libro-corazon-empresa/book/cap-01.md … cap-15.md` (+ `00-portada.md`).
+> Lector: `libros.arbrain.ai/corazon-empresa/` · Modo Estudio TTS: `build/estudio.html`.
+> Este índice NO reemplaza al libro: cuando el tema exige profundidad, se abre el capítulo.
 
 ## Regla de citas (LEER ANTES DE CITAR — heredada de la portada)
 
-*The Heart of Enterprise* (1979) **nunca se digitalizó**: no existe en PDF ni EPUB legal. Este mapa
-reconstruye el MODELO de Beer sobre el ESQUELETO real de su índice, en español. De ahí la regla:
+*The Heart of Enterprise* (1979) **nunca se digitalizó**: no existe en PDF ni EPUB legal. El libro
+propio reconstruye el MODELO de Beer sobre el ESQUELETO real de su índice, en español y en la voz
+de Levy. De ahí la regla, verificada capítulo por capítulo:
 
 - **A Beer de *Heart* se le PARAFRASEA con atribución.** JAMÁS inventar cita textual de *Heart* con
   página. Si necesitas una frase de Beer con página, tiene que venir de las cuatro fuentes reales.
@@ -22,27 +24,27 @@ reconstruye el MODELO de Beer sobre el ESQUELETO real de su índice, en español
 |---|---|---|---|
 | **Parte I** | *Conceptos, Perceptos, Preceptos* | El suelo: qué es viable, cuánto caos hay, por dónde se escapa | |
 | 1 | La Entrada | Viabilidad = existencia separada (≠ rentabilidad). POSIWID. Tríada entorno-operación-gestión. Datos ≠ información | Se discute qué es "éxito"/"ir bien"; alguien confunde el organigrama con la empresa |
-| 2 | La Medida del Caos | Variedad en bits. Ley de Ashby V(R) ≥ V(D). No hay óptimos absolutos. Desbordamiento = déficit estructural, no moral | El dueño se siente desbordado o culpable; hay que medir un déficit en vez de adjetivarlo |
+| 2 | La Medida del Caos | Variedad en bits. Ley de Ashby V(R) ≥ V(D). No hay óptimos absolutos. Desbordamiento = déficit estructural, no moral | Daniel se siente desbordado o culpable; hay que medir un déficit en vez de adjetivarlo |
 | 3 | La Salida | Ingeniería de variedad (atenuar/amplificar). Conant-Ashby. **Los 4 Principios** | Se audita cualquier lazo; se diseña un atenuador/amplificador; se busca qué principio se rompió |
 | **Parte II** | *Bases de la Viabilidad* | El VSM construido desde cero | |
 | 4 | Muñecas Rusas | Teorema del Sistema Recursivo. Las 3 declaraciones obligatorias. Datos a la medida del nivel. Insertar nivel intermedio | Un diagnóstico mezcla niveles; "ya no puedo con todo lo que cuelga de mí" |
-| 5 | Libertad | S1 = donde vive el propósito. Autonomía por aritmética. Reflejo local. Las 3 restricciones legítimas | Censo de S1; el dueño es el sensor/aprobador de algo; debate sobre delegar |
+| 5 | Libertad | S1 = donde vive el propósito. Autonomía por aritmética. Reflejo local. Las 3 restricciones legítimas | Censo de S1; Daniel es el sensor/aprobador de algo; debate sobre delegar |
 | 6 | Restricción | Oscilación = fallo natural de autonomías acopladas. S2 = servicio, jamás mando. Automático/simultáneo/no-emotivo | Bandazos entre frentes; choques recurrentes por recursos; tentación de centralizar |
 | 7 | Adentro y Ahora | S3 = sinergia del presente. **Trato de recursos**. Primer Axioma. Barrera del ahora. **S3\*** | Se reparten recursos; se sospecha de reportes verdes; se diseña auditoría |
 | 8 | Afuera y Después | S4 = radar + auto-modelo. **Homeostato 3↔4**. Segundo Axioma. Plan que aborta continuamente | Se evalúa intel; "morir sano" vs pivote eterno; la balanza se descompensa |
-| 9 | El Metasistema | S5 = identidad que arbitra. Tercer Axioma (residuo). Por qué 5 y no 6. **Multinodo** | Decisión que los datos no resuelven; el dueño recibe demasiado; pregunta de identidad |
+| 9 | El Metasistema | S5 = identidad que arbitra. Tercer Axioma (residuo). Por qué 5 y no 6. **Multinodo** | Decisión que los datos no resuelven; Daniel recibe demasiado; pregunta de identidad |
 | **Parte III** | *Aventuras en la Viabilidad* | Medir, filtrar, alarmar, morir | |
 | 10 | Medición | Actualidad/Capacidad/Potencialidad. **Triple índice**. La trampa del recortador. Índice sin lazo = museo | Se declara A/C/P; "¿voy bien o mal?"; alguien sube productividad recortando |
-| 11 | Tramas y Planes | **Cyberfilter**: aprende lo normal, calla lo esperable, dispara sostenido, se auto-recalibra. Descartar el crudo. Planeación continua | Se diseña una alerta/banda; el dueño revisa gráficas a mano; qué señal invalida qué supuesto |
+| 11 | Tramas y Planes | **Cyberfilter**: aprende lo normal, calla lo esperable, dispara sostenido, se auto-recalibra. Descartar el crudo. Planeación continua | Se diseña una alerta/banda; Daniel revisa gráficas a mano; qué señal invalida qué supuesto |
 | 12 | Calma y Alarma | **Algedónico**. Escalada por ventanas de recuperación pactadas. Arousal = reprogramar. Barrera del tiempo | Sesión de variables vitales; se calibra un umbral; se escribe un programa de crisis |
 | 13 | Vida y Muerte | Catálogo finito de patologías. **Autopoiesis patológica** = burocracia. **Estructura vs organización**. Marco separado | Poda; "¿esto me traiciona o solo me duele?"; reforma que se diluye |
 | **Parte IV** | *Implementación y Cierre* | Del plano al órgano instalado | |
 | 14 | Lo Largo y lo Corto | **Los 6 pasos en orden**. **Los 5 errores** (organigrama, pirámide, museo, gran anuncio, cuarto del rediseño) | Se secuencia cualquier trabajo de estructura; antes de instalar un órgano |
 | 15 | Sobre el Éxito | Ultraestabilidad + entelequia. El modelo es LENGUAJE, no camisa de fuerza. Lo que Beer no tuvo (cómputo) | Se discute qué significa ganar; el modelo se está usando como dogma |
 
-## Concepto → capítulo (slugs canónicos)
+## Concepto → capítulo (slugs canónicos del libro)
 
-Úsalos como etiquetas (en notas, en un mazo de repaso o en un libro de estudio hecho con `libro-os`).
+Son los `@concepto` declarados en los capítulos; el mazo de repaso los usa como etiquetas.
 
 | Concepto | Cap |
 |---|---|
@@ -79,8 +81,21 @@ reconstruye el MODELO de Beer sobre el ESQUELETO real de su índice, en español
 - **Medina, Cybernetic Revolutionaries** — p. 38 (no hace falta entrar a la caja negra), p. 39 (el "control"
   ingenuo es coerción), p. 40 (la gerencia es el diseñador del sistema, no parte del sistema gestionado).
 
+## Mazo de repaso (cableado 15 jul 2026)
+
+- **Mazo:** `youtube/libro-corazon-empresa/build/repaso.json` — 90 items (`recuerda`, `examen`, `reto`,
+  `completa`, `feynman`), cada uno con pregunta, respuesta, conceptos y capítulo. El protocolo y los
+  intervalos `[1, 3, 7, 21, 60]` viven DENTRO del mazo: es su contrato, no el de esta skill.
+- **Ejecutor:** `agent-server/scripts/analytics/repaso_libro.py` (sirve 1-3 vencidos · `--calificar <id> ok|fallo`
+  · `--estado`). Sirve TODOS los libros con mazo, intercalándolos.
+- **Cable:** migración **v36** → última sección del morning briefing. Es la promesa literal del cap 15
+  ("el mazo de repaso te espera: Levy te lo va a servir en las mañanas").
+- **Estado:** `build/repaso-estado.json` junto a cada mazo (viaja por git: sobrevive migración de máquina).
+- **Regla al calificar:** exigir el MODELO, no la literalidad. Y jamás enseñar la respuesta antes de que
+  Daniel conteste: el esfuerzo de recordar ES el mecanismo.
+
 ## Libro hermano
 
-*Brain of the Firm* (Beer, 1972, 2ª ed. 1981) deriva el mismo modelo mirando el sistema nervioso;
-*Heart* lo deriva desde primeros principios. Cuando un concepto se resista, el hermano suele tener el
-otro ángulo. Si el dueño quiere un libro de estudio de cualquiera de los dos, `libro-os` lo construye.
+`youtube/libro-cerebro-empresa/` — "El Cerebro de la Empresa" (*Brain of the Firm* 80/20), mismo formato,
+mazo de 79 items ya en la misma rotación de repaso. Heart deriva el modelo desde primeros principios;
+Brain lo deriva mirando el sistema nervioso. Cuando un concepto se resista, el hermano suele tener el otro ángulo.
diff --git a/arbrain/sistema-viable/references/programas-crisis.md b/arbrain/sistema-viable/references/programas-crisis.md
# solo en el lado izquierdo: 72 líneas (su texto está en esa copia; no se repite aquí)
```
