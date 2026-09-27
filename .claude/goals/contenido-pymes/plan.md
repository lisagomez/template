# Plan de orquestación — Generación de contenido para pymes: SDD, PRP, herramientas, laboratorio visual, app y documentación

> Derivado DETERMINISTA del grafo `contenido-pymes` por grafo2plan.py — no es juicio, es topología.
> Regla: dentro de una fase, grupos hacia artefactos DISTINTOS corren EN PARALELO;
> los gates de la fase se corren ANTES de avanzar a la siguiente.

## Fase 1

**→ produce `SDD de generación de contenido (docs/SDD-generacion-de-contenido.md)`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **lo que ya existe, medido** (desde Base existente: brief 30 días, calendario vivo y piezas SVG (tools/pymes-marketing/contenido) + /estudio)
- ◆ spawnear subagente (Sonnet) · **oficio y límites del video** (desde propuesta-video.md y triaje-video.md (oficio, límites, 14 preguntas sin firmar))

## Fase 2

**→ produce `PRP-006 con fases autorizadas y fases bloqueadas por firma`**
- ◆ spawnear subagente (Sonnet) · **del diseño a fases con estado** (desde SDD de generación de contenido (docs/SDD-generacion-de-contenido.md))

**Gates al cerrar la fase:**
- ↻ candado [gris] — referencia: cada fase del PRP dice autorizada o bloqueada (con quién firma y por qué); nada bloqueado se construye

## Fase 3 · ⚡ GRUPOS EN PARALELO

**→ produce `Piezas fijas exportables: PNG, carruseles, formatos por canal`**
- ◆ spawnear subagente (Sonnet) · **fase autorizada** (desde PRP-006 con fases autorizadas y fases bloqueadas por firma)

**→ produce `Video por código sin personas: promos y tarjetas animadas 9:16 (MP4/WebM)`**
- ◆ subagente con scripts · **fase autorizada: render local** (desde PRP-006 con fases autorizadas y fases bloqueadas por firma)

**→ produce `Aprobación del dueño en su celular, con huella de lo aprobado`**
- ◆ spawnear subagente (Sonnet) · **fase autorizada** (desde PRP-006 con fases autorizadas y fases bloqueadas por firma)

**→ produce `Reel del celular con voz y cara (BLOQUEADO hasta firmar la propuesta de video)`**
- ⏸ checkpoint humano (lisagomez) · **solo con la propuesta firmada** (desde PRP-006 con fases autorizadas y fases bloqueadas por firma)

**→ produce `Redacción con LLM (BLOQUEADA: sin llave medida y sin CDC)`**
- ⏸ checkpoint humano (lisagomez) · **solo con llave y CDC** (desde PRP-006 con fases autorizadas y fases bloqueadas por firma)

**Gates al cerrar la fase:**
- ↻ sin personas [gris] — referencia: el video no usa cámara, voz ni rostro; solo producto, texto y marca
- ↻ determinismo [gris] — referencia: misma entrada, mismo archivo (huella igual en dos renders)
- ↻ licencias [gris] — referencia: ninguna fuente, script o recurso sin licencia compatible y su texto incluido; nada de GSAP ni código de sfstudio
- ↻ aprobar no es publicar [gris] — referencia: cero publicaciones; lo aprobado guarda la huella de exactamente lo que se aprobó

## Fase 4

**→ produce `Laboratorio visual: casos con imagen, hojas de cuadros, comparación contra referencias`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ subagente con scripts · **casos visuales de piezas** (desde Piezas fijas exportables: PNG, carruseles, formatos por canal)
- ◆ subagente con scripts · **casos visuales de video** (desde Video por código sin personas: promos y tarjetas animadas 9:16 (MP4/WebM))

**Gates al cerrar la fase:**
- ↻ referencia visual [gris] — referencia: cada pieza y video se compara contra su imagen de referencia; un cambio visual se ve y se aprueba

## Fase 5

**→ produce `App de contenido para el cliente (derivada del estudio)`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **la app usa solo lo aprobado** (desde Laboratorio visual: casos con imagen, hojas de cuadros, comparación contra referencias)
- ◆ spawnear subagente (Sonnet) · **flujo de aprobación** (desde Aprobación del dueño en su celular, con huella de lo aprobado)

## Fase 6 · ⚡ GRUPOS EN PARALELO

**→ produce `Documentación: guía del dueño, READMEs de herramientas, SDD y PRP al día`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **guía del dueño** (desde App de contenido para el cliente (derivada del estudio))
- ◆ spawnear subagente (Sonnet) · **cómo leer el laboratorio** (desde Laboratorio visual: casos con imagen, hojas de cuadros, comparación contra referencias)

**→ produce `Gate humano: publicar, subir, desbloquear reel y LLM`**
- ⏸ checkpoint humano (lisagomez) · **publicar lo aprobado** (desde App de contenido para el cliente (derivada del estudio))

**Gates al cerrar la fase:**
- ↻ validate después del commit [gris] — referencia: npm run validate en verde con todo versionado
