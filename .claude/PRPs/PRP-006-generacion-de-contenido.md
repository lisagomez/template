# PRP-006: Generación de contenido para pymes (piezas, carruseles, video sin personas, aprobación)

> **Estado**: FASES AUTORIZADAS COMPLETADAS (2026-09-27) — las bloqueadas (7, 8, 9, 10) esperan firma
> **Fecha**: 2026-09-27
> **Proyecto**: línea pymes (`tools/pymes-marketing`, `/estudio`, `/laboratorio-pymes`)
> **Spec**: `.claude/goals/contenido-pymes/spec.md` (goal compilado; grafo y plan en la misma carpeta).
> Diseño: `docs/SDD-generacion-de-contenido.md`.
> **CDC aplicable**: **no** — no cambia modelo, skill, prompt del arnés ni plantilla. Si una fase
> bloqueada se desbloquea con LLM, ESA fase sí es CDC.
> **Aprobación**: el laboratorio pidió construir en el mismo goal (2026-09-27). El **candado** de este PRP
> decide qué se construye: solo las fases *autorizadas*; las *bloqueadas* no se tocan.

---

## Objetivo

Que el dueño de una pyme mexicana tenga el contenido de su mes **terminado y listo para aprobar desde
su celular** —piezas PNG en el formato de cada canal, carruseles y video vertical 9:16 hecho por
código sin personas—, con constancia de qué aprobó, y sin que nada se publique solo.

## Por Qué

| Problema | Solución |
|----------|----------|
| El estudio dice qué publicar, pero entrega SVG: el dueño no puede subirlo a Instagram tal cual | PNG en la medida exacta de cada canal, generado en su navegador |
| Una publicación suelta no cuenta una historia (temporada, paquete) | Carruseles de 3 a 6 láminas con datos reales |
| El video corto es el formato que más alcance tiene y el que menos puede producir una pyme | Promos 9:16 por código, con su marca, sin grabar a nadie |
| «Aprobado» sin constancia: nadie sabe qué versión se aprobó | Huella SHA-256 de lo aprobado; editar revoca; CSV del mes |

**Valor de negocio**: un mes de contenido (≈27 piezas + carruseles + promos) por $0 de producción y
sin diseñador; el laboratorio lo ofrece como parte del estudio a sus clientes pyme.

## Qué

### Criterios de Éxito
- [x] Cada pieza del calendario se exporta a PNG en su medida (1080×1350, 1080×1080, 1200×630, 1080×1920).
- [x] Carruseles de temporada y de paquete con la lámina 1 autocontenida y sin precios sin confirmar.
- [x] Video 9:16 de 4 a 8 s: 1080×1920, 30 fps, H.264 + AAC 48 kHz; misma huella en dos renders.
- [x] Texto dentro de la zona segura, sin desbordar, con contraste AA (revisión visual automática).
- [x] Aprobación desde el celular con huella; editar revoca; aprobar no hace peticiones de red.
- [x] Laboratorio visual: ≥5 casos por herramienta, con trampas, comparados contra referencia.
- [x] Guía del dueño y READMEs al día; `npm run validate` verde con todo commiteado.

### Comportamiento Esperado
El dueño abre el estudio (o el ejemplo), ve su calendario con cada pieza ya en imagen, descarga el
PNG, revisa el carrusel de la temporada y la promo en video; en su celular abre la cola de
aprobación, aprueba lo que le gusta y pide cambio (con nota) en lo que no; descarga el CSV del mes con
lo aprobado y lo sube él a sus redes.

---

## Contexto

### Referencias
- `docs/SDD-generacion-de-contenido.md` — diseño completo (formatos, zonas seguras, escena, aprobación)
- `tools/pymes-marketing/src/contenido/` — brief, calendario y pieza SVG que se extienden
- `src/features/estudio-pymes/`, `src/features/laboratorio-pymes/` — app y laboratorio que se extienden
- `.claude/goals/pymes-marketing/propuesta-video.md` — oficio y límites del video (idea, no código)
- `.claude/goals/pymes-marketing/triaje-plugin.md` §2.2 y §2.8 — formatos, reuso, reglas de precio

### Arquitectura Propuesta
```
tools/pymes-marketing/src/
├── contenido/  + formatos.ts · revision-visual.ts · carrusel.ts
├── video/      escena.ts · cuadro.ts · sonido.ts · index.ts        (nuevo subpath ./video)
├── rasterizar.ts                                                    (nuevo subpath ./rasterizar)
└── aprobacion/ huella.ts · aprobacion.ts · index.ts                 (nuevo subpath ./aprobacion)
src/features/estudio-pymes/    + secciones carrusel y video, exportar PNG, /estudio/aprobar (celular)
src/features/laboratorio-pymes/ + casos de piezas, video y aprobación; referencias visuales
src/app/api/contenido/video/   render MP4 en el servidor (Chromium sin red + ffmpeg)
scripts/laboratorio-pymes/      render de referencia, hoja de cuadros, doble render
```

### Modelo de Datos
No aplica: nada se guarda en base de datos. La aprobación vive en la sesión del navegador (ver fase
bloqueada 9 para guardarla con cuentas).

---

## Gobernanza

### Modelo de amenazas (control C3) — *¿quién nos ataca?*
- **Activos que toca**: la marca del cliente y lo que aprueba (su nombre en redes).
- **Fronteras que cruza**: texto del dueño y nombres de producto hacia SVG; una escena JSON hacia la
  ruta de render del servidor.
- **Atacante relevante**: O1 (texto que se vuelve marcado en la pieza), O4 (render caro por abuso de la
  ruta), O3 (aprobar a ciegas una versión distinta).
- **Controles**: escape de todo texto; la página de render corre con la red bloqueada; la ruta valida
  con Zod, acota duración y tamaño, y no acepta URL ni archivos; la huella ata la aprobación a los
  bytes exactos. **Brecha abierta a propósito**: la ruta no tiene autenticación (no hay `/add-login`);
  se documenta que es para uso local y queda bloqueada para producción (fase 10).

### Evaluación de impacto / AISIA (control C4) — *¿a quién dañamos sin atacante?*
- **Partes afectadas**: el dueño (su marca), sus clientes (lo que ven en redes).
- **Daño posible con el sistema operando bien**: una pieza con un precio equivocado o una promesa que
  el dueño no hizo; un video que tape el precio con los botones de la red.
- **Reversibilidad**: total mientras no se publique; nada se publica solo.
- **Decisión**: **mitigar** — precio solo confirmado, revisión visual de zona segura, aprobación con
  huella. **Sin personas en pantalla** en esta fase: lo que tiene personas es riesgo sobre terceros y
  queda bloqueado (fase 7).

---

## Blueprint (Assembly Line)

| # | Fase | Estado | Quién firma / por qué |
|---|---|---|---|
| 1 | SDD de generación de contenido | **autorizada · hecha** | — |
| 2 | Este PRP con candado | **autorizada · hecha** | — |
| 3 | Formatos, revisión visual, carruseles y PNG | **autorizada · hecha** | local, $0, sin personas |
| 4 | Video por código sin personas (escena, cuadro, sonido, render MP4 local) | **autorizada · hecha** | local, $0, sin personas |
| 5 | Aprobación con huella en el celular (sesión del navegador) | **autorizada · hecha** | local, sin cuentas |
| 6 | Laboratorio visual y app derivada | **autorizada · hecha** | extiende lo existente |
| 7 | Reel del celular con voz o cara | **BLOQUEADA** | el laboratorio: C4 con terceros; 14 preguntas de `propuesta-video.md` |
| 8 | Foto de producto dentro del video | **BLOQUEADA** | el laboratorio: la foto puede traer personas; revisión C4 propia |
| 9 | Redacción con LLM / aprobación con cuentas | **BLOQUEADA** | el laboratorio: activar el LLM es otro CDC (llave, corrida real medida con su costo; el de los prompts se firmó el 2026-09-27) y `/add-login` (C4, C7) |
| 10 | Render de video en producción | **BLOQUEADA** | el laboratorio: Chromium + ffmpeg en la imagen (infraestructura) |
| 11 | Publicar o programar | **FUERA** | siempre el dueño de cada pyme, a mano |
| 12 | Documentación y validación final | **autorizada · hecha** | — |

### Fase 3: Formatos, revisión visual, carruseles y PNG
**Objetivo**: medidas y zonas seguras por canal; revisión visual automática; carruseles; PNG en el navegador.
**Validación**: casos `piezas-*` del laboratorio; `npm run empaqueta pymes-marketing`.

### Fase 4: Video por código sin personas
**Objetivo**: escena declarativa → cuadro SVG(t) → MP4 1080×1920 30 fps con efectos sintetizados.
**Validación**: `ffprobe`; misma huella en dos renders; hoja de cuadros; casos `video-*`.

### Fase 5: Aprobación con huella
**Objetivo**: aprobar, pedir cambio, revocar al editar, CSV del mes.
**Validación**: casos `aprobacion-*`; captura en viewport de celular; 0 peticiones al aprobar.

### Fase 6: Laboratorio visual y app
**Objetivo**: galería visual con referencias; secciones de carrusel y video; `/estudio/aprobar`.
**Validación**: suite en `validate`; capturas con Playwright.

### Fase 12: Documentación y validación final
**Validación**:
- [x] `npm run validate` pasa con todo commiteado (en un clon con esta rama, `main` y el corpus; en el
      repo de trabajo lo tumba `audita:secretos` por otra rama, ver `resultados.md`)
- [x] Playwright confirma la UI (carrusel, PNG, video, aprobación en celular)
- [x] Criterios de éxito cumplidos; SDD §10 con lo medido

---

## 🧠 Aprendizajes

### 2026-09-27: `validate` antes del commit no ve lo que aún no está versionado
- **Error**: el escaneo de fugas e identificadores lee `git ls-files`; un archivo nuevo pasó el gate sin
  ser leído (goal `pymes-marketing`, arreglado en `b3e7656`).
- **Fix**: correr `validate` **después** de commitear.
- **Se cumplió aquí**: `validate` después del commit cazó `docs/GUIA-DUENO-CONTENIDO.md` sin asiento en el
  inventario (`inventario:vista` regenera la vista, pero no verifica; `verifica:inventario` sí).

### 2026-09-27: el número de PRP se toma de `origin/main`, no de la carpeta local
- **Error**: se escribió como PRP-005 porque la rama local no lo tenía; `main` ya tenía otro PRP-005.
- **Fix**: renumerado a PRP-006 antes del commit. Mirar `git ls-tree origin/main .claude/PRPs/` y las
  demás ramas antes de numerar.

## Gotchas
- [ ] Las fuentes del SVG dependen de lo instalado en quien rasteriza: se usan familias genéricas con
      respaldo; empaquetar fuentes exige su licencia.
- [ ] El MP4 determinista pide `libx264` con un solo hilo y metadatos quitados.
- [ ] En 9:16 los botones de la red tapan el 35 % de abajo: el precio va en la franja central.

## Anti-Patrones
- Copiar código de god-animation, edicion-de-video o sfstudio (sin licencia), o usar GSAP.
- Poner personas, fotos de clientes o música con derechos en un video.
- Publicar, programar o subir a una red desde la app.

## 🎯 Stack
Next.js 16 + React 19 + TypeScript + Tailwind 3.4 · Zod · Zustand · Playwright (render local) · ffmpeg.
