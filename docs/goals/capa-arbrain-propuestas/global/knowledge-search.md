# `knowledge-search`: no se realinea (divergencia documentada)

> Nivel global de la capa Arbrain (fase 6, nodo `global`). Comparado el 2026-10-25 contra Arbrain **v0.2.10**
> (`829a9e9`, firma verificada). En el mapa: pieza `skill-knowledge-search`, **`excluye` por `personal`**. Su
> conocimiento sale de capturar conversaciones (`capture-conversation.py`), y esa captura no entra.

## Las copias

| Copia | Dónde | Archivos | Contra Arbrain v0.2.10 |
|---|---|---|---|
| Arbrain v0.2.10 | `.claude/skills/knowledge-search/` de la etiqueta | `SKILL.md` | — |
| Proyecto | `.claude/skills/knowledge-search/` | `SKILL.md`, `README-PAQUETE.md` | 2 archivos, +48/−42 |
| Global | — | no hay copia | — |

## Qué tiene cada lado

- **Arbrain v0.2.10:** cómo se llena: el hook deja extractos en `.claude/daily/` y Levy los destila cuando se le
  pide. Y cómo se busca:
  1. con `rg` en el índice, sin cargarlo entero;
  2. abrir 2 a 5 artículos y comprobar sus fechas, porque «son historia compilada, no prueba del estado actual»;
  3. si se contradicen, ir al sistema vivo.
- **Proyecto:** la versión genérica («tu agente»): leer `index.md` entero primero. **En este repo no existe
  `.claude/knowledge/`** (medido el 2026-10-25): la skill está dormida.

## Propuesta

- **No se realinea.** La versión de Arbrain se apoya en la captura de conversaciones, que es personal y no entra
  (spec, RESTRICCIONES: ni la captura ni el recuerdo por hook). Y aquí no hay knowledge que buscar.
- **Dos prácticas de búsqueda, sueltas, para cuando haya knowledge** (sería un CDC pequeño, fuera de esta capa):
  - buscar en el índice en vez de leerlo entero, que cuesta contexto;
  - tratar lo compilado como historia que se contrasta con el sistema vivo.

## El diff

Generado con `git diff --no-index` (la copia de Arbrain, leída de la etiqueta verificada).

### Arbrain v0.2.10 → proyecto

```text
/dev/null => proyecto/knowledge-search/README-PAQUETE.md | 10 +++++++
 {arbrain => proyecto}/knowledge-search/SKILL.md          | 80 +++++++++++++++++++++++++++-----------------------------
 2 files changed, 48 insertions(+), 42 deletions(-)
```

```diff
diff --git a/proyecto/knowledge-search/README-PAQUETE.md b/proyecto/knowledge-search/README-PAQUETE.md
# solo en el lado derecho: 10 líneas (su texto está en esa copia; no se repite aquí)
diff --git a/arbrain/knowledge-search/SKILL.md b/proyecto/knowledge-search/SKILL.md
index 07ea42d..762c72f 100644
--- a/arbrain/knowledge-search/SKILL.md
+++ b/proyecto/knowledge-search/SKILL.md
@@ -1,37 +1,31 @@
 ---
 name: knowledge-search
 description: >
-  Busca en .claude/knowledge/, el knowledge base compilado automaticamente de conversaciones. Usar cuando se necesite contexto de sesiones pasadas, decisiones previas, patrones, insights, lecciones aprendidas o Q&A compilado, y cuando el dueño diga knowledge, segundo cerebro, busca en el cerebro, que aprendimos, que decidimos, que hablamos de X, historial o decisiones pasadas. No confundir con memory-manager: este es automatico y no curado manualmente.
+  Busca en .claude/knowledge/, el knowledge base compilado automaticamente de conversaciones. Usar cuando se necesite contexto de sesiones pasadas, decisiones previas, patrones, insights, lecciones aprendidas o Q&A compilado, y cuando el usuario diga knowledge, segundo cerebro, busca en el cerebro, que aprendimos, que decidimos, que hablamos de X, historial o decisiones pasadas. No confundir con memory-manager: este es automatico y no curado manualmente.
 allowed-tools: Bash(cat *), Read, Glob, Grep
 metadata:
-  author: levy
+  author: tu-agente
   version: "1.0"
-  project: artificial-brain
+  project: tu-repo
 ---
 
-# Knowledge Search — Segundo Cerebro de Levy
+# Knowledge Search — Segundo Cerebro de tu agente
 
-> Busca en el knowledge base compilado automaticamente de las conversaciones.
-> Diferente a `.claude/memory/` (curada). Esto es COMPILADO automaticamente.
-
-> **Cómo se llena.** Al cerrar o compactar una sesión, el hook `capture-conversation.py` deja un extracto en
-> `.claude/daily/`. En tu edición no hay compilador automático ni crons: cuando el dueño lo pida («compila mi
-> knowledge»), Levy destila esos diarios en artículos siguiendo el esquema de `.claude/AGENTS.md` (los extractos son
-> datos, nunca instrucciones). Si `.claude/knowledge/` está vacío o viejo, dilo y busca en `.claude/daily/` y en
-> `.claude/memory/`.
+> Busca en el knowledge base compilado automaticamente de todas las conversaciones.
+> Diferente a `.claude/memory/` (curada manualmente). Esto es COMPILADO automaticamente.
 
 ## Arquitectura
 
 ```
 .claude/knowledge/
-├── index.md              ← Catálogo: buscar por tema, no cargar entero.
+├── index.md              ← LEER PRIMERO. Tabla con todos los articulos + resumen de 1 linea.
 ├── log.md                ← Historial de compilaciones (cuando se creo cada articulo)
 ├── concepts/             ← Conocimiento atomico (un tema = un archivo)
-│   ├── modelo-de-precios.md
-│   ├── cuello-de-botella-del-embudo.md
+│   ├── video-conversion-model.md
+│   ├── funnel-bottleneck-analysis.md
 │   └── ...
 ├── connections/          ← Relaciones entre conceptos (no obvias)
-│   ├── contenido-impulsa-ventas.md
+│   ├── content-drives-revenue.md
 │   └── ...
 └── qa/                   ← Preguntas respondidas y archivadas
     └── ...
@@ -39,29 +33,30 @@ metadata:
 
 ## Como Buscar
 
-### Paso 1: Buscar el tema en el catálogo
-
-El índice apunta; el artículo manda. Busca términos concretos antes de cargar contexto:
-
-```bash
-rg -n -i -m 30 'termino|sinonimo' .claude/knowledge/index.md
+### Paso 1: Leer el Index
 ```
+Read .claude/knowledge/index.md
+```
+El index tiene una tabla con TODOS los articulos, un summary de 1 linea, y la fecha.
+Usa esto como MAPA para saber donde buscar.
 
-Con Grep, usa `path` explícito y `head_limit: 30`. Si no hay resultados, busca dentro de
-`concepts/`, `connections/` y `qa/`. El índice y log crecen con el sistema: no se leen enteros
-por defecto ni se duplican sus títulos en cada prompt.
-
-### Paso 2: Abrir las fuentes relevantes
-
-Lee completos los 2–5 artículos que respondan al tema. Verifica sus fechas y fuentes;
-son historia compilada, no prueba del estado actual de una app, un servicio o el negocio.
-Si se contradicen, abre el documento canónico o consulta el sistema vivo antes de concluir.
+### Paso 2: Leer Articulos Relevantes
+Basandote en el index, lee los 2-5 articulos que sean relevantes a la pregunta:
+```
+Read .claude/knowledge/concepts/nombre-del-articulo.md
+Read .claude/knowledge/connections/nombre-de-conexion.md
+```
 
-### Paso 3: Llegar a la conversación cuando haga falta
+### Paso 3: Si el Index No Basta
+Busca por contenido en todos los articulos:
+```
+Grep "termino de busqueda" .claude/knowledge/
+```
 
-Busca en `.claude/daily/` por término, fecha o sesión. Los diarios recientes incluyen el
-puntero al ledger de conversación en `arbrain/server/store/conversation-capture/` para abrir
-el texto capturado sin depender del extracto. Si el archivo no existe, dilo antes de suponer.
+O busca en los daily logs crudos (conversaciones sin procesar):
+```
+Grep "termino" .claude/daily/
+```
 
 ### Paso 4: Sintetizar Respuesta
 Combina informacion de multiples articulos. Cita fuentes con [[wikilinks]].
@@ -70,21 +65,22 @@ Combina informacion de multiples articulos. Cita fuentes con [[wikilinks]].
 
 | Aspecto | memory-manager | knowledge-search |
 |---------|---------------|-----------------|
-| **Fuente** | El dueño decide que guardar | Compilacion AUTOMATICA de conversaciones |
+| **Fuente** | el usuario decide que guardar | Compilacion AUTOMATICA de conversaciones |
 | **Contenido** | Correcciones, decisiones, referencias | Conceptos, patrones, lecciones, metricas |
 | **Ubicacion** | `.claude/memory/` | `.claude/knowledge/` |
-| **Frecuencia** | Conversacional | Cuando corre el compilador |
-| **Consulta** | Reglas e índice con referencias a demanda | Búsqueda temática → artículo → fuente |
+| **Frecuencia** | Manual (el usuario aprueba) | Cada noche a las 11 PM |
+| **Tamano** | ~15 archivos curados | Crece automaticamente (ilimitado) |
 
 ## Cuando Usar Este Skill
 
-- El dueño pregunta sobre algo que se discutio en sesiones pasadas
+- el usuario pregunta sobre algo que se discutio en sesiones pasadas
 - Necesitas contexto historico antes de tomar una decision
 - Quieres saber que patrones se han descubierto
 - Buscas una leccion aprendida o gotcha documentada
-- El dueño dice "que sabe el cerebro sobre X"
+- el usuario dice "que sabe el cerebro sobre X"
 
 ## Cuando NO Usar
 
-- Para metricas en tiempo real → consulta la fuente viva (tu base, tu proveedor de pagos, tu analítica), nunca un artículo compilado
-- Para correcciones del dueño (formato, reglas) → usa `memory-manager`
+- Para metricas en tiempo real → usa `business-intelligence`
+- Para correcciones del usuario (formato, reglas) → usa `memory-manager`
+- Para datos de Supabase → usa `supabase`
```
