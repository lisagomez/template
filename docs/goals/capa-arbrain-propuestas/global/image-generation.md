# `image-generation`: no se realinea (divergencia documentada)

> Nivel global de la capa Arbrain (fase 6, nodo `global`). Comparado el 2026-10-25 contra Arbrain **v0.2.10**
> (`829a9e9`, firma verificada). En el mapa: pieza `skill-image-generation`, **`excluye` por `no-aplica`**. Este
> archivo deja el diff a la vista y dice por qué la copia del proyecto se queda como está.

## Las copias

| Copia | Dónde | Archivos | Contra Arbrain v0.2.10 |
|---|---|---|---|
| Arbrain v0.2.10 | `.claude/skills/image-generation/` de la etiqueta | `SKILL.md` (28 líneas), `references/sunburst.md` | — |
| Proyecto | `.claude/skills/image-generation/` | `SKILL.md` (116), `scripts/generate-image.ts` (250) | 3 archivos, +355/−78 |
| Global | — | no hay copia | — |

## Qué tiene cada lado

- **Arbrain v0.2.10:**
  - un solo modelo, GPT Image 2.5 «Sunburst», por la Images API de OpenRouter, con `quality` low, medium o high;
  - registro del costo real de cada imagen, y «fallos sin usage = costo desconocido»;
  - local primero, y nada de fallback automático a otro modelo;
  - la imagen se muestra por el MCP `cabina` de su app.
- **Proyecto (lo aprendido aquí):**
  - Gemini por OpenRouter, con **modelos pineados**: cambiarlos es un CDC.
  - **`openrouter/auto` y todo alias `:latest` se rechazan**; el `auto` propio solo elige entre candidatos
    declarados.
  - La lección del **2026-09-10**: el modelo pineado dejó de existir y ahora el script lista los modelos vigentes
    en el error.
  - La llave `OPENROUTER_API_KEY` en `.env.local`. Y la del goal-compiler aplica aquí: la llave y el saldo de
    OpenRouter son HECHOS que se comprueban antes de prometer una imagen (hoy el saldo está casi agotado).

## Propuesta

- **No se realinea.** Adoptar la de Arbrain sería **cambiar el modelo**, un CDC (C1) que no es parte de la capa, y
  perdería los pineos y la lección de la deriva. La copia del proyecto se queda como está.
- **Una idea suelta para otro CDC** (fuera de esta capa): la regla de Arbrain «fallos sin usage = costo
  desconocido» casa con la contabilidad del template (`src/lib/ai/contabilidad.ts`: una llamada sin datos de uso
  se guarda con costo `null`, nunca cero). Si algún día `generate-image.ts` registra costos, que siga esa regla.

## El diff

Generado con `git diff --no-index` (la copia de Arbrain, leída de la etiqueta verificada). Los archivos que solo
existen en un lado se resumen en una línea: su texto está en esa copia.

### Arbrain v0.2.10 → proyecto

```text
{arbrain => proyecto}/image-generation/SKILL.md                  | 122 +++++++++++++++++++----
 arbrain/image-generation/references/sunburst.md => /dev/null     |  61 ------------
 /dev/null => proyecto/image-generation/scripts/generate-image.ts | 250 +++++++++++++++++++++++++++++++++++++++++++++++
 3 files changed, 355 insertions(+), 78 deletions(-)
```

```diff
diff --git a/arbrain/image-generation/SKILL.md b/proyecto/image-generation/SKILL.md
index 16cebf5..54f7954 100644
--- a/arbrain/image-generation/SKILL.md
+++ b/proyecto/image-generation/SKILL.md
@@ -1,28 +1,116 @@
 ---
 name: image-generation
-description: "Generar y editar imágenes del dueño con GPT Image 2.5 Sunburst vía OpenRouter. Único modelo; variar quality low, medium o high. Miniaturas, ilustraciones y assets de edición."
+description: |
+  Generar y editar imagenes usando OpenRouter + Gemini. Usar cuando el usuario pide crear,
+  generar o editar imagenes, thumbnails, logos, banners, ilustraciones, o cualquier asset visual.
+  Requiere OPENROUTER_API_KEY configurada (via skill /ai setup-base).
+  Triggers: imagen, image, genera imagen, create image, generate image, foto, picture,
+  edita imagen, edit image, thumbnail, banner, logo, ilustracion, dibujo.
+allowed-tools: Read, Write, Edit, Bash, Glob
 ---
 
-# Image Generation · Sunburst
+# Image Generation (OpenRouter + Gemini)
 
-**Un solo modelo para todas las imágenes: SUNBURST.** La variable es `quality`, nunca sustituir el modelo en silencio. Si el dueño decide otro modelo, se cambia aquí por escrito.
+> Generar imagenes desde texto o editar imagenes existentes via OpenRouter API con modelos Gemini.
+> Requiere: `OPENROUTER_API_KEY` en `.env.local` (se configura con skill `/ai setup-base`).
 
-## Antes de generar
+---
+
+## Comando
+
+```bash
+npx tsx .claude/skills/image-generation/scripts/generate-image.ts \
+  --prompt "PROMPT" \
+  [--image /path/to/input.png] \
+  [--output /path/to/output.png] \
+  [--aspect 16:9] \
+  [--model google/gemini-3.1-flash-image | auto]
+```
+
+## Argumentos
+
+| Arg | Requerido | Descripcion |
+|-----|-----------|-------------|
+| `--prompt` | SI | Descripcion de lo que generar o como editar |
+| `--image` | NO | Path a imagen de entrada (para editar/transformar una imagen existente) |
+| `--output` | NO | Path de salida personalizado. Default: `generated/img-{timestamp}.png` |
+| `--aspect` | NO | Aspect ratio: `1:1` (default), `16:9`, `9:16`, `4:3`, `3:2` |
+| `--model` | NO | Id EXACTO de OpenRouter (default: `google/gemini-3.1-flash-image`) o `auto` |
+
+### Modelos (pineados — cambiarlos es CDC)
+
+| Modelo | Mejor para |
+|--------|-----------|
+| `google/gemini-3.1-flash-image` | Default. Rapido, buena calidad |
+| `google/gemini-3-pro-image` | Mas detalle cuando el flash no alcanza |
+| `auto` | OpenRouter elige, pero SOLO entre los candidatos pineados del script (fallback routing: prueba en orden y responde el primero disponible; la salida `MODEL:` dice cual fue) |
+
+**`openrouter/auto` y todo alias `:latest` se rechazan**: un alias auto-actualizable cambia el
+comportamiento sin diff ni aprobacion (C1) y no garantiza un modelo con salida de imagen. El
+`auto` de arriba es la version acotada: seleccion de OpenRouter dentro de una lista declarada.
+
+Si el modelo pineado deja de existir en OpenRouter (paso el 2026-09-10), el script **lista los
+modelos de imagen vigentes** en el error, para que la deriva salga con el arreglo en la mano.
+
+---
+
+## Ejemplos
+
+```bash
+# Texto a imagen
+npx tsx .claude/skills/image-generation/scripts/generate-image.ts \
+  --prompt "A minimalist logo with the letter S in cyan on dark background"
 
-Leer [sunburst.md](references/sunburst.md): contrato, llamada a la Images API, costos de referencia y cómo registrar cada imagen. Ese archivo manda sobre recomendaciones de modelo en otras skills.
+# Editar imagen existente
+npx tsx .claude/skills/image-generation/scripts/generate-image.ts \
+  --prompt "Remove the background and make it transparent" \
+  --image ./public/photo.png
 
-Requisito: una llave de OpenRouter (`OPENROUTER_API_KEY`) configurada en `arbrain/server/.env`. Si no existe, decirlo y pedirle al dueño que la agregue; esta skill es opcional en tu edición.
+# Widescreen para thumbnail
+npx tsx .claude/skills/image-generation/scripts/generate-image.ts \
+  --prompt "Futuristic dashboard UI with charts and graphs" \
+  --aspect 16:9 \
+  --output ./public/images/thumbnail.png
 
-1. Identificar el entregable y cargar sus reglas visuales: la guía de marca del dueño si existe (búscala en la memoria, `reference/`, o pregúntala una vez y guárdala con `memory-manager`); para lienzos y diagramas, la skill `canvas`; para assets de un video, `edicion-por-voz`.
-2. Abrir las referencias visuales antes de enviarlas (logo, fotos del dueño, ejemplos de estilo aprobados). Guardar la ubicación de las referencias reutilizables en la memoria para no buscarlas cada vez.
-3. Llamar `POST https://openrouter.ai/api/v1/images` con `model: openai/gpt-image-2.5-sunburst`. Defaults recomendados: **low para ilustraciones y presentaciones; high para miniaturas**. LOW también sirve como entrega final; no subir por hábito. No es `reasoning_effort`.
-4. Guardar PNG y registro de prompt, referencias, modelo, quality, parámetros, tiempo y usage. Mostrar el costo real. Fallos sin usage se reportan como costo desconocido.
-5. Revisar identidad, logo, texto, estilo y resolución antes de entregar. Las reglas gráficas las define la guía del entregable. El modelo no redefine la marca.
+# Usando modelo Pro
+npx tsx .claude/skills/image-generation/scripts/generate-image.ts \
+  --prompt "Detailed architectural blueprint of a SaaS platform" \
+  --model google/gemini-3-pro-image
+
+# Dejando que OpenRouter elija entre los candidatos pineados
+npx tsx .claude/skills/image-generation/scripts/generate-image.ts \
+  --prompt "Hero image for a logistics dashboard" \
+  --model auto
+```
+
+---
+
+## Cuando Usar
+
+Activar cuando el usuario:
+- Pide **crear** o **generar** una imagen, ilustracion, diseno o visual
+- Pide **editar** o **modificar** una imagen existente (pasar original con `--image`)
+- Necesita un thumbnail, banner, logo, o cualquier asset visual
+- Envia una imagen y pide cambiar algo de ella
+
+---
+
+## Despues de Generar
+
+**SIEMPRE** incluir la imagen en tu respuesta para que el usuario la vea:
+
+```markdown
+![Descripcion de la imagen](path/to/generated/image.png)
+```
+
+Si la imagen se guardo en `public/`, usar el path relativo para que sea accesible desde la app.
+
+---
 
-## Entrega y límites
+## Tips de Prompts
 
-- **Mostrar en el chat por default:** al terminar, `mostrar` del MCP `cabina` con `vista: documento` y la ruta del PNG, salvo que el dueño diga lo contrario. Imágenes sueltas en una carpeta del repo como `imagenes/<fecha>-<tema>/` (o junto al proyecto que las usa).
-- **Local primero.** No subir a almacenamiento público para mostrar una imagen en chat. Subir solo con autorización expresa para compartir o publicar (freno: publicar requiere pedido humano).
-- El destino vive junto al proyecto. Las referencias reutilizables, en una carpeta de assets propia que el dueño elija.
-- Lienzos y diagramas requieren la skill `canvas` y su estándar visual antes de insertar elementos; el backend de imagen sigue siendo Sunburst.
-- No convertir esta skill en un fallback automático hacia otro modelo. Si Sunburst falla, diagnosticar y reportar.
+- Se especifico: "A golden retriever wearing sunglasses on a beach at sunset" > "a dog"
+- Especifica estilo: "photorealistic", "illustration", "watercolor", "pixel art", "minimalist", "3D render"
+- Para ediciones: describe el cambio claramente: "Make the sky purple" o "Add a hat to the person"
+- Para logos/texto: Gemini puede renderizar texto en imagenes, especifica que texto incluir
+- Para assets de la app: incluir contexto de donde se usara: "Hero image for a SaaS landing page"
diff --git a/arbrain/image-generation/references/sunburst.md b/arbrain/image-generation/references/sunburst.md
# solo en el lado izquierdo: 61 líneas (su texto está en esa copia; no se repite aquí)
diff --git a/proyecto/image-generation/scripts/generate-image.ts b/proyecto/image-generation/scripts/generate-image.ts
# solo en el lado derecho: 250 líneas (su texto está en esa copia; no se repite aquí)
```
