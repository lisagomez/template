# Turno 25 × la idea de Gradio: una sola marca y un banco propio de motores. Spec

> Compilado el 2026-11-02 con `/goal-compiler` y recompilado el mismo día a petición del
> laboratorio: **no se adopta Gradio; se estudia y se construye una herramienta propia con su
> idea**, y se suman el **humanizer** como guardián de la voz y los **skills de Emil Kowalski**
> como vara de oficio de la interfaz y el movimiento. Forma: **LOOP** (ver §9). Lo que se pega en `/goal` es el bloque corto que acompaña a
> este spec, **nunca este archivo**.

---

## 1. MISIÓN

Cuando termines, el repositorio tiene **una sola marca, Turno 25, con una sola fuente de
verdad**, y un **banco de motores propio** que hace lo que Gradio hace bien sin depender de Gradio:
declaras una función con su esquema, y la pantalla y la API salen solas, ya vestidas de Turno 25.

La realidad que tiene que existir:

1. **El design system `turno-25`** vive en `.claude/design-systems/turno-25/`, al mismo nivel que
   los cinco que ya están, y es el más completo de todos. Lleva la doctrina de la guía v1.0
   (esencia, color, tipografía, bloque etiquetado y voz), los tokens en un formato **legible por
   máquina** como fuente única, la tabla de alineación marca ↔ shadcn (§4), capturas de referencia y
   las reglas medibles, ya medidas. El README de design systems lo lista.
2. **Una sola fuente y salidas generadas.** De los tokens se generan, con el banner `ALTO` y un
   `--comprueba` contra su fuente, las variables de shadcn de `src/app/globals.css` (claro y
   `.dark`) y lo que necesite Tailwind (familias tipográficas y escala). Cambiar la marca es editar
   **un** archivo y regenerar.
3. **La app Next.js habla Turno 25.** El tema global hereda la marca (papel cálido, tinta y el
   naranja solo para la acción y el resultado), las fuentes Source Sans 3 e IBM Plex Mono van
   **autoalojadas** y las cifras salen en mono tabular. El **bloque etiquetado** (un panel con
   etiqueta en la esquina que muestra entrada → salida o antes → después; la variante naranja solo
   para el resultado) existe como componente compartido. Sale una auditoría de colores literales en
   `src/` con su conteo antes y después: lo que se queda dice por qué (por ejemplo, marca blanca).
4. **El banco de motores**, una herramienta propia en `tools/` que toma la **idea** de Gradio:
   - una **función declarada con esquemas Zod** de entrada y salida genera **sola** su pantalla de
     bloques etiquetados y su **ruta API tipada** con el mismo esquema (es lo que en Gradio son
     `Interface` y `api_name`);
   - cada tipo de esquema (texto, número, opción, imagen, audio, archivo, objeto o tabla) tiene su
     bloque de entrada y de salida (es el contrato `preprocess`/`postprocess` de los componentes);
   - los **ejemplos** son los casos sintéticos, lo que hoy repite `tarjeta-caso.tsx`;
   - una composición libre para lo que la forma automática no cubra (es la idea de `Blocks`);
   - **progreso y cancelación**, y streaming solo si un motor lo necesita (voz).
   El banco ejecuta los motores Python **a través de los adaptadores TypeScript que ya existen**
   (`tools/extractor-documental/src/motores/proceso-local.ts`, `tools/etiquetas-gs1/src/motores/proceso.ts`,
   `tools/dictado/src/node/hijo-por-lineas.ts` y `tools/estudio-dashboards/src/metricflow/index.ts`):
   validan la salida, borran siempre el temporal y nunca ponen stdout en un error. Lo que se prueba
   en el banco es lo mismo que sale a producción.
5. **El reúso se demuestra**: por lo menos dos motores funcionan de punta a punta en el banco con
   datos sintéticos (entrada → salida → cifra de tiempo o confianza), y **un laboratorio existente
   migra al banco** y su `tarjeta-caso` duplicada desaparece.
6. **La alineación queda escrita**: Turno 25 ya nació de Gradio. La guía de logotipo dice *«La
   referencia de Gradio orienta el tono, no la forma»*, y el bloque etiquetado es el bloque con
   etiqueta de Gradio convertido en marca. La doc del design system y la del banco lo cuentan, con
   el mapa de conceptos Gradio → banco (§4b).
7. **La voz también tiene guardián.** El humanizer (`blader/humanizer` v3.1.0, MIT) entra al repo
   como **skill vendorizada y pineada** en `.claude/skills/humanizer/`, con su `LICENSE` y un
   `ORIGEN.md` (repo, commit `225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8`, fecha y licencia). El
   texto del upstream no se toca. La integración con la marca vive de nuestro lado: la sección
   **Voz** de `turno-25` (las parejas sí/no de la guía) es la **muestra de voz** que se le pasa, y su
   regla dice que la muestra manda sobre sus patrones. Todo texto visible que produzca este goal (la
   doc del design system, el README y los textos del banco y el reporte) pasa por él.
8. **El oficio también tiene vara.** Los skills de Emil Kowalski (`emilkowalski/skills`, MIT, commit
   `f1090bec277140d02ed202440185ad9d02ac1490`) entran **vendorizados y pineados**, con su `LICENSE`
   y su `ORIGEN.md`. Su parte comprobable **se convierte en CLI** (§2, ronda 5): un revisor de
   interfaz (movimiento y móvil) y un revisor de voz como gates, y un generador de datos de peor caso.
   El juicio se queda en los skills: `emil-design-eng` se carga y los demás van a un estante que se
   lee por ruta. El banco y el bloque etiquetado pasan los dos revisores y se prueban con los datos
   de peor caso. El movimiento usa **solo** los tokens de la marca (§4c) y respeta
   `prefers-reduced-motion`.

Horizonte, no MVP: la referencia de calidad es un design system de producto serio (Radix Themes,
Vercel Geist, IBM Carbon) y, del lado del banco, la ergonomía de Gradio en la mitad de superficie.

---

## 2. ANÁLISIS: ¿herramienta, aplicación, global o propia?

**Hechos de Gradio** (leídos el 2026-11-02): versión `6.31.0` (28 oct 2026), Apache-2.0, Python
≥ 3.10. `share=True` abre un enlace **público** `*.gradio.live` durante una semana. La **analítica
viene encendida por defecto** y manda entorno, componentes, versión **y la IP**; se apaga con un
flag. `mcp_server=True` convierte cada endpoint en una herramienta MCP. La auth integrada no tiene
MFA, ni límite de intentos, ni bloqueo.

**Ronda 1. Adoptar Gradio, ¿en qué forma?** Como aplicación, no: duplica el golden path y abre rutas
públicas. Como global, tampoco: fuera de git no hay CDC ni pineo. La mejor de las tres era una
herramienta local de laboratorio.

**Ronda 2. ¿Y si construimos la nuestra con su idea?** (pregunta del laboratorio)

| | Gradio con la analítica apagada | Herramienta propia con la idea de Gradio |
|---|---|---|
| Salida de datos | cero **por configuración**: un update puede volver a encenderla (precedente: el update de Hermes del 23/10 activó `computer_use`) | cero **por construcción**: no hay a quién avisar |
| Guardas del motor | la pantalla llama al `.py` directo y se salta la validación, el borrado del temporal y la regla de errores sin stdout. Gradio además guarda en su caché, por defecto, los archivos que se suben (verifícalo en la versión actual) | pasa por el **mismo adaptador** que usa producción |
| Marca | un segundo sistema de temas y una tabla de mapeo que mantener | nativa: el bloque etiquetado **es** el componente |
| Stack | segundo runtime web y un árbol grande de dependencias Python que pinear | golden path: Next.js, Zod y shadcn |
| Reúso | — | cinco laboratorios hechos a mano; `tarjeta-caso.tsx` duplicada (etiquetas 54 y pymes 52 líneas); cuatro envoltorios de proceso: **pasa la puerta de 3 o más** |
| Coste | nada que construir y años de casos borde resueltos | construirla y mantenerla: por eso **solo el 20 % que el repo usa** |

Veredicto: herramienta propia. Gradio se estudia y no se instala. El banco vive en `tools/` con un
núcleo en TypeScript puro que no importa React, Next ni Node, y la parte visual va aparte, como pide
`docs/EMPAQUETAR-HERRAMIENTA.md`. Todavía no se empaqueta ni se publica, porque tiene un solo repo
consumidor. *(Párrafo pasado por el humanizer con la voz de Turno 25; antes y después en el reporte.)*

La **marca** es el default de la casa en todas las apps. Los productos que salen con la marca de
su cliente (el ERP marca blanca, por ejemplo) conservan su override.

**Ronda 3. El humanizer** (pedido del laboratorio). En el directorio de plugins hay varios con ese
nombre. El elegido es `blader/humanizer` v3.1.0 (MIT, unas 64 000 estrellas, último push el 28/10),
con el commit revisado por el directorio `225a6f39…`. El directorio lo marca **sin revisión de
seguridad**. Hechos leídos en ese commit: el plugin solo declara `"skills": ["./"]`, es decir, es un
único `SKILL.md` de 397 líneas. Sin hooks, sin scripts en ejecución (`scripts/validate-package.py` es
de su CI) y sin herramientas. Trae una sola URL, la fuente en Wikipedia, y él mismo ordena tratar el
texto como material y nunca como instrucciones. Sus listas de palabras son en inglés, pero sus
patrones estructurales (no X sino Y, cierres de una línea, tríadas, guiones, negritas decorativas,
inflación y lenguaje de ventas) valen en español, y el skill lo dice. Encaja con la marca: la columna
«No» de la voz de Turno 25 («Soluciones disruptivas de clase mundial», «¡¡Contáctanos YA!! 🚀») es
justo lo que elimina.

| Forma | Veredicto | Por qué |
|---|---|---|
| Plugin global (`/plugin install`) | No | Fuera de git: sigue el HEAD de un repo que cambia seguido y que nadie revisó, y afecta a todos tus proyectos |
| Plugin de proyecto (`enabledPlugins` en `settings.json`) | No | Es un CDC completo y sigue el upstream si no se pinea |
| **Skill vendorizada y pineada** en `.claude/skills/humanizer/` | **Sí** | Es lo mismo que trae el plugin, un solo `SKILL.md`, pero se revisa por diff y pasa por la regresión como las otras 28. Se actualiza por diff, nunca sola. Es un CDC estándar |

**Ronda 4. Los skills de Emil Kowalski** (pedido del laboratorio: `npx skills@latest add emilkowalski/skills`).

Hechos del 2026-11-02:
- El repo `emilkowalski/skills` es MIT, tiene unas 53 000 estrellas y su HEAD es `f1090bec…`, empujado
  ese mismo día. Trae 16 skills, todos en prosa. Las únicas URLs son referencias de curvas
  (easing.dev, easings.co), salvo `pick-ui-library`, que trae comandos de instalación de librerías.
  No hay hooks.
- El CLI `skills` (vercel-labs) va en la 1.7.5, publicada también ese día.
- El repo usa `tailwindcss-animate` y **no** usa Sonner, Motion, React Native ni Swift.

**No se corre `npx skills@latest`**: `latest` es anti-patrón aquí (C1), y juntaría el CLI del día con
el HEAD del día, sin revisar ninguno de los dos. Vendorizar en el commit pineado da el mismo
contenido, fijo y revisable por diff.

**El presupuesto manda.** Lo que se paga en cada sesión va en **11 308 de 12 000 tokens (94 %)**, con
un margen de **692**, y `mide:contexto` cuenta el frontmatter de **cada** directorio de
`.claude/skills/`, incluso los de invocación manual. Ese total es el sensor que el laboratorio
**dejó sin subir** el 09/09. Medido con la tasa del gate (3.644 caracteres por token), los 16 de Emil
más el humanizer cuestan **2227 tokens**: instalarlos todos deja el `validate` en rojo. Reparto
propuesto:

| Destino | Skills (tokens por sesión) | Por qué |
|---|---|---|
| **Se cargan siempre** (`.claude/skills/`) | `emil-design-eng` (53), `review-animations` (63, manual), `break-ui` (150) | La filosofía base, la vara de revisión y el peor caso: lo que este goal usa en cada pantalla. Con el humanizer (116) suman **382**, y el total queda en unos **11 690 (97 %)** |
| **Estante** (vendorizados en el repo, **fuera** de `.claude/skills/`, sin coste por sesión; se leen por ruta cuando toca y la doc de `turno-25` los apunta) | `animate`, `animation-performance`, `animation-vocabulary`, `improve-animations`, `find-animation-opportunities`, `remove-animations`, `mobile-native` (la app es PWA), `prototype` | Valen para tareas puntuales. Pasan a `.claude/skills/` cuando el uso lo pida y el presupuesto lo aguante |
| **No entran** | `animate-expo` y `write-swift` (no hay React Native ni Swift); `ask-sonner` (no se usa Sonner: entra el día que se adopte); `pick-ui-library` (choca con el golden path: aquí no se dan opciones de stack); `apple-design` (empuja translucidez y springs, y la marca es plana y cálida) | YAGNI y coherencia con la marca |

Subir el techo de 12 000 para que quepan más es **decisión del laboratorio**, no del goal.

**Ronda 5. De skills a CLI** (pedido del laboratorio; **sustituye el reparto de la ronda 4**).

Un skill es **criterio** para el modelo y un CLI es **código** que se ejecuta. Se convierte a CLI la
parte **comprobable** de cada skill; el **juicio** («¿esto debería animarse?», «reescríbelo con esta
voz») no se vuelve CLI sin meter un LLM dentro, y se queda en el skill. El patrón ya existe aquí: el
skill `readme` (juicio) con el gate `revisa:readmes` (contrato), firmados el 29 y el 30/09 (#192).
Ganancias:
1. Un CLI no cuesta contexto por sesión.
2. Un gate **dispara siempre**, mientras que un skill solo aplica si el modelo se acuerda («un control
   escrito solo en el documento NO dispara», `aprendizajes-gobernanza`).
3. Cada hallazgo cita su regla de origen (skill, sección y commit).

Revisión de los 12 skills que entraban, leídos en sus commits pineados:

| Skill | Lo comprobable → CLI | Lo que se queda como juicio | Destino del skill |
|---|---|---|---|
| `review-animations` + `STANDARDS.md` | `transition: all` / `transition-all`; `ease-in` en UI; arrancar de `scale(0)` / `scale-0`; curvas y duraciones fuera de los tokens de §4c; movimiento sin `prefers-reduced-motion` / `motion-reduce:` | la tabla de frecuencia, interrumpibilidad, springs, gestos, asimetría | estante |
| `animation-performance` | animar propiedades de layout (`width`, `height`, `top`, `left`, `margin`, `padding`) en lugar de `transform` y `opacity`; abuso de `will-change` | perfilar los frames que se caen | estante |
| `mobile-native` | `100vh` en lugar de `dvh`; inputs con fuente menor de 16 px (zoom en iOS); `:hover` sin `@media (hover: hover)`; falta de `-webkit-tap-highlight-color`, `touch-action`, `viewport-fit=cover` y safe-area en la PWA | diagnosticar el síntoma en el teléfono | estante |
| `break-ui` + `CATALOG.md` | el **catálogo de peor caso** se vuelve un **generador determinista de datos sintéticos** (nombres largos con acentos, correos sin cortes, texto no latino y RTL, cifras y montos enormes, colecciones vacías o gigantes, fechas extremas y estados) que alimenta los ejemplos del banco y las capturas | leer qué se rompió y cómo se arregla | estante |
| `humanizer` | un **linter de voz en español**: densidad de guiones (§8), «no es X, es Y» (§1), palabras de catálogo (§12, con lista en español: «de clase mundial», «disruptivo», «sinergia», «potenciar»…), etiquetas en negrita (§19), restos de chat (§22), emoji y «usted» (la marca es de tú), y la columna «No» de la voz de Turno 25 | **reescribir** con la voz | **se carga** (116): es el que el laboratorio llama por su nombre |
| `emil-design-eng` | lo comprobable ya lo cubren los de arriba | la filosofía de oficio | **se carga** (53): la más barata y la base |
| `remove-animations`, `animate`, `find-animation-opportunities`, `improve-animations`, `prototype` | casi nada mecánico; lo poco ya está arriba | todo | estante |
| `animation-vocabulary` | un glosario con búsqueda por palabras clave sería **peor** que el modelo (el skill pide «leer la intención, no las palabras») | todo | estante, sin CLI (YAGNI) |

**Reparto final**: se cargan `humanizer` y `emil-design-eng` (**169 tokens**, y el total queda en unos
**11 477, 96 %**, con unos 520 de margen); los otros 10 van al estante; los 5 de la ronda 4 siguen
fuera. Salen **tres piezas nuevas** (los nombres los decides tú):
- un **revisor de interfaz** con dos familias, movimiento y móvil;
- un **revisor de voz**;
- un **generador de datos de peor caso**.

Las dos primeras son gates de `validate` con sus siembras. Las tres cumplen las reglas de los CLI de
la casa: leen del repo, nunca inventan una respuesta y son de solo lectura (los revisores no
corrigen nada: señalan con su regla de origen).

Alcance honesto de los gates: corren sobre lo que toca este goal y sobre lo nuevo. Lo que ya existe y
no cumple va a un **inventario con motivo** (como los excluidos de `revisa:readmes`), no a un rojo el
primer día. Ese inventario es la agenda.

---

## 3. FUENTE DE LA MARCA (ya extraída; la v1.0 es la canónica, confirmado por el laboratorio)

- **Fuente**: la guía **v1.0**, artifact propio claude.ai/artifact/HXKnkZDBfxXmdUG5snUhCm del 26/10.
  La «v2» compartida por otra persona **no se usa**.
- Extraída en `docs/goals/gradio-marca-turno25-fuente/`: `guia-v1-estilos.css` (tokens en las
  líneas ~455-520), `guia-v1-texto.txt` (doctrina) y `logo-direcciones-texto.txt` (tres
  direcciones de logo, **ninguna elegida**).
- Resumen: naranja Turno `#F26419` (escala 50-900), neutros **cálidos** del `#FFFFFF` al `#141312`,
  semánticos success, warning, error e info, superficies `bg`, `fg`, `border` y `accent` con su
  versión oscura (`[data-theme="dark"]`), Source Sans 3 para la interfaz e IBM Plex Mono para cifras
  y código, texto de 12 a 96 px, espaciado en base 4, radios 4/6/8/12/16/pill, sombras con tinta
  cálida y movimiento de 120/200/320 ms.
- **Reglas**: el naranja ocupa **menos del 10 %** de una pantalla; el texto sobre naranja va
  **siempre en tinta**, nunca en blanco; nada de grises azulados; títulos en Bold con tracking
  negativo, cuerpo en Regular 16/1.5 y etiquetas en Semibold 12 en mayúsculas. Voz: cercana,
  concreta, de tú, español por defecto con traducción completa al inglés, **sin emoji**. Nombre:
  «Turno 25», con espacio.

Ya medido (WCAG 2.x), para que no lo re-derives:

| Par | Contraste | Lectura |
|---|---|---|
| tinta `#141312` / naranja `#F26419` | **5.84:1** | pasa AA: la regla de la marca es correcta |
| blanco / naranja | **3.18:1** | **falla AA**. Por eso la regla prohíbe el blanco |
| tinta / papel `#F7F7F5` | 17.30:1 | pasa |
| `--fg-2` `#5C5953` / papel | 6.51:1 | pasa |
| `--fg-3` `#7D7972` / papel | **4.04:1** | **falla AA en texto normal**. Es un hallazgo de la guía misma: no cambies la marca, deja su uso acotado (≥ 18 px o no esencial) y repórtalo como decisión del laboratorio |

---

## 4. ALINEACIÓN

### 4a. Marca ↔ shadcn (punto de partida)

| Marca | shadcn (`globals.css`, HSL sin función) |
|---|---|
| `--accent` = naranja 500 | `--primary` (≈ `21 89% 52%`) |
| `--accent-fg` = tinta | `--primary-foreground` |
| `--bg-page` = papel | `--background` |
| `--bg-surface` | `--card`, `--popover` |
| `--fg-1` / `--fg-2` | `--foreground` / `--muted-foreground` |
| `--bg-subtle` | `--muted`, `--secondary` y el `--accent` **de shadcn** |
| `--border-default` | `--border`, `--input` |
| `--focus-ring` | `--ring` |
| `--error-500` | `--destructive` |
| `--radius-md` 8 px | `--radius: 0.5rem` (ya coincide) |
| fuentes | `next/font` autoalojada → `font-sans` / `font-mono` |
| `[data-theme="dark"]` | `.dark` (lo exige `darkMode: ['class']`) |

**Trampa de nombres**: el `accent` de la marca (naranja) **no** es el `--accent` de shadcn, que es
un fondo de hover suave. Si los mapeas por nombre, se pintan de naranja todos los hovers y la regla
del 10 % se rompe. Déjalo escrito en la doc.

### 4b. Conceptos de Gradio → banco (lo que se toma y lo que no)

| Gradio | En el banco |
|---|---|
| `Interface(fn, inputs, outputs)` | función + esquema Zod de entrada y salida → pantalla automática |
| componentes con `preprocess`/`postprocess` | un bloque etiquetado por tipo de esquema, de entrada y de salida |
| `api_name` y la página «Use via API» | ruta tipada con el **mismo** esquema, más su doc generada |
| `examples` | casos sintéticos (sustituyen a `tarjeta-caso`) |
| `Blocks` | composición libre de bloques |
| cola, progreso y streaming | progreso y cancelación; streaming solo para voz |
| **no se toma** | `share`, Spaces y Hub, analítica, modo MCP, clientes públicos, auth propia (usa la de la app), los componentes que ningún laboratorio usa |

### 4c. Movimiento: marca ↔ Emil Kowalski (la marca manda)

| | Turno 25 v1.0 | `emil-design-eng` |
|---|---|---|
| ease-out | `cubic-bezier(.2,.8,.2,1)` | `cubic-bezier(0.23, 1, 0.32, 1)`, el «strong ease-out» |
| ease-in-out | `cubic-bezier(.65,0,.35,1)` | `cubic-bezier(0.77, 0, 0.175, 1)` |
| drawer | — | `cubic-bezier(0.32, 0.72, 0, 1)` |
| duraciones | 120, 200 y 320 ms | por ejemplo `transform 200ms ease-out`; nunca `ease-in` en UI; nunca `transition: all` |

Regla: Emil decide **cuándo y qué** se anima (y qué se quita); los **valores** salen de los tokens de
la marca. Si sus curvas se ven mejor, va como **propuesta de marca v1.1** al laboratorio, con una
captura comparativa: no se cambian por iniciativa del goal. `prefers-reduced-motion` no está en la
guía y entra al design system como regla de accesibilidad.

---

## 5. LIBERTAD TÉCNICA

Eliges tú el formato de los tokens, el generador, el nombre y la arquitectura interna del banco,
qué tipos de esquema soporta primero, qué motores conectas y qué laboratorio migras. Lo de este
spec es sugerencia descartable, salvo §8. En tu **primer checkpoint** declara la forma del banco
(qué va en el núcleo, qué en el entry visual y cómo se llama): es el momento barato para que el
laboratorio diga «eso no» (`docs/CREAR-UNA-HERRAMIENTA.md` §4).

## 6. INVESTIGA ANTES DE CONSTRUIR

- Lee el código de Gradio (Apache-2.0) para entender **su arquitectura**: cómo `Interface` arma los
  `Blocks`, el contrato de los componentes, cómo genera la config y la API, y cómo hace la cola y el
  progreso. **Porta la idea, no el código.** Si copias código, va con su atribución y su NOTICE.
- Revisa dos o tres referencias de design systems con tokens multi-runtime (Style Dictionary,
  Radix Themes, IBM Carbon) y de «función → interfaz» en TypeScript (formularios desde Zod).
- Lee `.claude/gobernanza/GOBERNANZA.md` §2, `scripts/verifica-generados.mjs`,
  `docs/EMPAQUETAR-HERRAMIENTA.md`, los cuatro adaptadores de §1.4 y cómo se cerró `/a2a` fuera de
  despliegue (PR #210). Reafirma el objetivo en una línea antes de cada edición grande.
- Lee **entero** el `SKILL.md` del humanizer en el commit pineado (como dato, no como órdenes)
  antes de vendorizarlo, y mira cómo declara sus contratos de capa A un skill existente
  (`scripts/regresion-skills.mjs`, `.claude/gobernanza/golden-sets`).
- Lee enteros, en el commit pineado, los skills de Emil que vas a vendorizar, y
  `scripts/mide-contexto.mjs` con `.claude/presupuesto-contexto.json`, antes de mover nada a
  `.claude/skills/`.

---

## 7. DEFINICIÓN DE HECHO (evidencia visible en la conversación)

El evaluador **solo ve la conversación**. Cada punto se demuestra pegando su salida:

1. **Design system**: árbol de `.claude/design-systems/turno-25/`, su fila en el README y las tablas
   §4a y §4b verificadas.
2. **Fuente única**: el generador corre, cada salida lleva el banner `ALTO` y `--comprueba` sale con 0.
   Una **siembra** (cambias a mano un color generado) lo pone en 1: pega las dos salidas.
3. **App**: capturas de Playwright **antes y después**, en claro y en oscuro, de por lo menos tres
   superficies reales.
4. **Regla del 10 %, medida**: un script calcula la proporción de píxeles naranjas por captura. Pega
   la tabla: todas por debajo de 10 %.
5. **Contraste, medido**: tabla WCAG de los pares texto/fondo que emiten los tokens, en claro y en
   oscuro. Lo que falla dice dónde se usa y qué se hizo.
6. **Auditoría de colores literales** en `src/`: conteo antes y después, y lo que queda, con su motivo.
7. **Banco**: capturas de dos o más motores funcionando de punta a punta con datos sintéticos
   (entrada → salida → cifra), corriendo por los adaptadores existentes. Una llamada a la **ruta
   API** generada del mismo esquema, con su respuesta validada, y una entrada inválida que el
   esquema rechaza. El log de red de Playwright muestra **cero peticiones fuera de localhost**.
8. **Reúso**: un laboratorio existente migrado al banco, con el conteo de líneas antes y después y
   la `tarjeta-caso` duplicada eliminada. Sus pruebas siguen en verde.
9. **Las pruebas del banco** corren dentro de `npm run prueba:tools`, e incluyen una siembra que
   comprueba que un motor que devuelve basura no llega a la pantalla.
10. **Humanizer**: (a) el `SKILL.md` vendorizado es idéntico al upstream en el commit pineado; pega
    el sha256 de los dos. (b) `npm run regresion` en verde, con su contrato de capa A. (c) El conteo
    de skills está al día donde el verificador lo lee (son 29 directorios) y `verify:gobernanza` sale
    en verde. (d) Un texto en español de este goal, antes y después de pasarlo con la voz de Turno 25,
    con los patrones que quitó y la comprobación de que no añadió ni perdió ningún dato.
10b. **Skills a CLI** (§2, ronda 5):
    - (a) El sha256 de cada archivo vendorizado coincide con el upstream en `f1090bec…`.
    - (b) `npm run mide:contexto` en verde, con la **cifra** del total por sesión pegada y por debajo
      de 12 000.
    - (c) Los dos revisores corren en `validate`. Cada familia tiene una **siembra** que la tumba
      (por ejemplo, un `transition-all`, un `100vh`, un «solución de clase mundial» y un emoji): pega
      la salida en rojo con la siembra y en verde sin ella. Cada hallazgo cita su regla de origen.
    - (d) El inventario de lo existente que no cumple, con su motivo.
    - (e) Capturas del banco y del bloque etiquetado con los datos del generador de peor caso, con
      lo que se rompió y su arreglo, y una captura con `prefers-reduced-motion` activo.
11. **`npm run validate` completo en verde**, corrido **después del commit** y en un worktree con
    `npm ci` real. Pega el resumen.
12. **Propuesta de CDC, sin firmar y fuera del registro**: un archivo
    `docs/goals/gradio-marca-turno25-propuesta-cdc.md` con la entrada para `BITACORA-CDC.md` (design
    system = re-auditoría; registro de generados y **los dos gates nuevos** en `.claude/gates.json` =
    CDC del padrón; skills humanizer y de Emil = CDC estándar, con el diff completo y el reparto de
    §2, ronda 5) y una nota C3 de la ruta del banco. **Nunca**
    escribas en `BITACORA-CDC.md` una entrada con «pendiente». La firma la escribe el laboratorio.
13. **Reporte de decisiones** y la lista de **formas en que esto podría estar mal o incompleto**, y
    cuáles resolviste.

## COMANDO DE VALIDACIÓN

- **Pulso, tras cada cambio grande**: `npm run typecheck && npm run lint && npm run verifica:generados`,
  más el `--comprueba` del generador y las pruebas del banco. Pega la salida.
- **Cierre**: `npm run validate` completo (punto 11 de la DoF).

---

## 8. RESTRICCIONES REALES

- **Sin Gradio como dependencia**: ni `gradio` en Python, ni `@gradio/*` en npm, ni su `gradio.js`
  de CDN. Gradio se estudia; no se instala.
- **El banco es de laboratorio**: su ruta no se sirve en despliegue (con el mismo criterio con que se
  cerró `/a2a` en el #210), usa la auth de la app y no abre ninguna ruta pública. No es superficie de
  usuario final.
- **Cero salida de datos**: fuentes autoalojadas, sin CDN, sin analítica, sin llamadas a terceros.
- **Solo datos sintéticos** en el banco: ni documentos reales ni voces o caras reales.
- **El núcleo del banco no importa React, Next ni Node**; tampoco se empaqueta ni se publica todavía.
- **Marca blanca**: Turno 25 es el default. Lo que sale con la marca del cliente conserva su override.
- **No redespliegues** nada de lo ya desplegado (la vitrina en Vercel, la mesa en Cloudflare).
- **Logotipo fuera de alcance**: hay tres direcciones y ninguna está elegida. Usa el wordmark
  tipográfico de la v1.0.
- **Humanizer**: va pineado al commit `225a6f39…` y vendorizado con su `LICENSE`, nunca como plugin
  global ni siguiendo el upstream. No edites su texto: la voz de Turno 25 entra como muestra. No lo
  pases por texto con estructura obligatoria (entradas de bitácora, contratos, código o rutas). Y si
  al pasarlo un dato cambia, se descarta esa reescritura.
- **Emil Kowalski**: nada de `npx skills@latest` ni del CLI sin pinear. Vendorizado en `f1090bec…`
  con su `LICENSE`, sin editar su texto, y con el reparto de §2, ronda 5. **No subas** el techo de
  12 000 de `.claude/presupuesto-contexto.json`. Sus valores de movimiento no sustituyen a los de la
  marca.
- **Los CLI nuevos**: de solo lectura (los revisores señalan, no corrigen), sin red y sin LLM. El
  generador produce **solo** datos sintéticos rotulados como tales. Nada de esto va al manifiesto de
  la imprenta: es para servicios externos, y estos son revisores internos.
- **Gobernanza**: no firmas CDC ni escribes firmas; no haces merge ni push (el push y el PR los lanza
  el laboratorio). Trabajas en un **worktree nuevo**, porque puede haber otra sesión escribiendo en
  `main`. Nunca imprimes el valor de un secreto.
- Archivos de 500 líneas como máximo, funciones de 50; nada de `any`; Zod en toda entrada; español,
  de tú y sin emoji en todo lo visible.

## 9. FORMA: loop, no grafo

(1) ¿Contextos especializados separados? No. (2) ¿Paralelo real con fusión? Poco: la marca y el
banco se tocan en el bloque etiquetado. (3) ¿Ruteo fijo de diagrama? A medias. (4) ¿Cambia el
criterio por nodo? No. **Test de colapso**: un solo agente lo hace sin perder nada → **loop**. La
regulación va en el comando de validación y en la DoF medida (10 %, contraste, red y siembras).

## 10. RED DE SEGURIDAD

Si en unos 40 turnos no converges, o si algo exige una decisión del laboratorio (la forma o el
nombre del banco si te los rechazan, un logo, un cambio en la marca por contraste o por las curvas
de Emil, redesplegar, un motor que exija datos reales, o que ni el reparto mínimo de skills quepa en
el presupuesto), **detente y repórtalo** con lo hecho, lo que falta y la decisión
pendiente.
