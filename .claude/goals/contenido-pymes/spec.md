# Generación de contenido para pymes — Spec

Compilado por `/goal-compiler` el 2026-09-27. Forma: **GRAFO** (especialidades distintas —diseño,
imagen, video por código, laboratorio visual, app, documentación—; paralelismo real en la fase 3 y
convergencia en el laboratorio). Lo que se pega en `/goal` es `goal.txt`, NO este archivo. Grafo:
`grafo.json`; plan de orquestación compilado de él: `plan.md` (se sigue, no se improvisa).

Decisiones de la dueña (2026-09-27): **video sin personas** entra (el reel con voz y cara queda
bloqueado hasta firmar `propuesta-video.md`); **un solo goal con candado** (SDD y PRP primero; se
construye solo lo que no requiere firma nueva; lo demás queda en el PRP como fase bloqueada); e
**integrar el laboratorio de pruebas visual y la documentación**.

## MISION

Que una pyme mexicana tenga, en un solo lugar, **todo el contenido de su mes listo para aprobar**:
del brief de 30 días que ya existe salen las piezas terminadas en cada formato que pide cada canal —
imagen PNG para Instagram, Facebook y el estado de WhatsApp, carruseles que cuentan algo en varias
láminas, y **video corto 9:16 generado por código** (promos de temporada, producto y precio,
tarjetas animadas con la marca, música y efectos también por código si aportan) sin una sola persona
en pantalla—; el dueño las revisa y aprueba **desde su celular**, y queda la huella exacta de lo que
aprobó. Nada se publica: lo aprobado queda listo para que él lo suba.

Alrededor de eso, la fábrica completa del producto:
1. **SDD** (`docs/SDD-generacion-de-contenido.md`, en el formato de los SDD del repo): qué existe ya
   (medido), la arquitectura de la generación de contenido (texto, imagen, carrusel, video, aprobación),
   contratos entre piezas, determinismo, licencias, C3/C4, costos, y el camino del reel y del LLM.
2. **PRP-006** (`.claude/PRPs/`, sobre `prp-base.md`): fases con su estado —**autorizada** o **bloqueada
   por firma** (quién firma, qué se firma y por qué)—, modelo de amenazas y AISIA de lo que toca.
3. **Herramientas derivadas**, empaquetadas e instalables (extendiendo `tools/pymes-marketing` o en
   paquetes nuevos: tú decides y lo justificas con el empaquetador).
4. **Apps derivadas**: la app de contenido del cliente (desde `/estudio`) con la aprobación en celular.
5. **Laboratorio visual**: casos con su imagen y su video a la vista (hoja de cuadros de cada video),
   comparación contra imágenes de referencia para que un cambio visual se vea y se apruebe, y
   casos-trampa visuales (texto que desborda, contraste bajo, nombre con código, precio sin confirmar,
   formato equivocado para el canal). Extiende `/laboratorio-pymes`, no lo reescribe.
6. **Documentación**: guía del dueño en español llano (cómo sale su mes, cómo aprueba, qué NO hace la
   herramienta), READMEs de cada herramienta, y SDD y PRP actualizados con lo que de verdad quedó.

Horizonte (fuera de este goal, en el PRP como bloqueado): el reel del celular con corte y subtítulos
locales; redacción con LLM medida; publicar o programar en redes; aprobación multiusuario con cuentas.

## LIBERTAD TECNICA

Tú eliges cómo se rasteriza (en navegador o en servidor), cómo se anima y renderiza el video, cómo se
comparan las imágenes, la granularidad de los paquetes y cómo se ve todo. Lo existente se extiende con
prueba, no se reescribe: `tools/pymes-marketing` (sobre todo `contenido/`), `/estudio`,
`/laboratorio-pymes` y su suite, el laboratorio de voz como molde visual, `src/lib/ai/contabilidad.ts`.
Del oficio de `god-animation` y de `edicion-de-video` se toman **ideas** (determinismo, hoja de cuadros,
sincronía medida, «editar revoca la aprobación»), **nunca código** (licencia no declarada; sfstudio es
UNLICENSED; GSAP es «all rights reserved»).

## INVESTIGA ANTES DE CONSTRUIR

- Lee `triaje-plugin.md` §2.2 y §2.8 (canva-creator y social-content-engine: formatos, tamaños, reuso,
  reglas de precio), `propuesta-video.md` y `triaje-video.md` (lo que sirve y lo que no), el SDD más
  cercano en forma (`docs/SDD-dictado.md` o `docs/SDD-extractor-documental.md`), `prp-base.md`, el
  `resultados.md` de `pymes-marketing` (qué quedó abierto: PNG, fuentes del SVG) y `docs/EMPAQUETAR-HERRAMIENTA.md`.
- Investiga 2-3 referencias de clase mundial de generación de contenido y video por código para
  pequeños negocios (plantillas de carrusel, promos de producto, motion design sobrio) y decide a partir
  de eso. Next.js de este repo cambia respecto a lo conocido: lee `node_modules/next/dist/docs/` antes de
  escribir rutas o componentes nuevos.
- Rama: si `pymes-marketing-build` sigue sin mezclar a `main`, crea `contenido-pymes` desde ella (no
  desde `pagos-add-payments`, que es un CDC sin firmar) y dilo.

## GRAFO DEL SISTEMA

Ver `grafo.json` y `plan.md`. Nodos: base existente y propuesta de video → **SDD** → **PRP-006** →
(paralelo) piezas fijas · video por código · aprobación en celular · [reel y LLM: aristas manuales,
bloqueadas] → **laboratorio visual** → **app** → **documentación** → firma. Lazos: L1 candado (nada
bloqueado se construye), L2 sin personas, L3 determinismo (misma entrada, misma huella), L4 referencia
visual, L5 licencias, L6 aprobar no es publicar (huella de lo aprobado), L7 `validate` después del
commit. Al cerrar cada nodo, su `estado` en `grafo.json` cambia con la evidencia: ámbar = existe y pasó
el laboratorio sin estreno real; morado solo lo validado de verdad.

## DEFINICION DE HECHO (evidencia visible en la conversacion)

- **SDD y PRP-006** escritos: rutas y las secciones clave pegadas (arquitectura; tabla de fases con
  «autorizada» o «bloqueada: quién firma y por qué»).
- `npm run empaqueta <x>` en verde por cada herramienta nueva o cambiada, sin publicar.
- **Video**: `ffprobe` pegado (1080×1920, duración, fps, audio si lo hay), la hoja de cuadros de al menos
  un video vista y descrita, y la **misma huella en dos renders**.
- **Laboratorio visual**: tabla de casos por herramienta (≥5 por herramienta, con trampas visuales),
  estado real y comparación contra referencia; capturas con Playwright de la galería del laboratorio.
- **App**: capturas con Playwright de: carrusel generado, pieza exportada a PNG, video promo (cuadro del
  inicio y del final que demuestren movimiento), y la aprobación en viewport de celular con la huella de
  lo aprobado; sin errores de consola y sin peticiones de red al aprobar.
- **Documentación**: guía del dueño y READMEs, con su índice pegado.
- `npm run validate` en verde **después del commit**; `grafo.json` con estados y evidencia.
- Reporte de decisiones, formas en que podría estar mal (resueltas) y lo que queda bloqueado.

## COMANDO DE VALIDACION

`npm run typecheck && npm run lint && npm run prueba:laboratorio-pymes` más `npm run empaqueta <x>` de lo
que tocaste, tras cada cambio grande, con el output pegado. `npm run validate` antes de cerrar, con todo
commiteado (el escaneo de fugas e identificadores solo lee archivos versionados).

## RESTRICCIONES REALES

- **Candado**: nada que el PRP marque bloqueado se construye. Bloqueados de entrada: el reel con voz o
  cara de personas (C4, propuesta sin firmar) y la redacción con LLM (sin llave, sin CDC).
- **Sin personas en video**: ni cámara, ni voz, ni rostro; solo producto, texto y marca.
- **Nada sale**: no se publica, programa ni envía; ningún servicio de pago ni API externa; ningún MCP.
- **Licencias**: nada copiado de god-animation, edicion-de-video ni sfstudio; nada de GSAP; toda fuente,
  música o recurso incluido con licencia compatible y su texto; lo generado por código, propio.
- No tocar skills, reglas, `AGENTS.md`, `settings.json` ni `.mcp.json` (eso es CDC: se propone para firma).
- Datos sintéticos y declarados; secretos jamás en pantalla; español de México, sin jerga.
