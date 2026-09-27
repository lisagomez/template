# Plan de orquestación — Pymes — familia de contenido y marketing (small-business@1.35.1 + analisis de god-animation, edicion-de-video y sfstudio)

> Derivado DETERMINISTA del grafo `pymes-marketing` por grafo2plan.py — no es juicio, es topología.
> Regla: dentro de una fase, grupos hacia artefactos DISTINTOS corren EN PARALELO;
> los gates de la fase se corren ANTES de avanzar a la siguiente.

## Fase 1

**→ produce `Mapa de adaptacion: 9 skills del plugin + 2 de video + sfstudio; por fuente, que se conserva / reemplaza / descarta, riesgo y entrada local`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **leer las 9 skills + shared/ y clasificar** (desde Fuente pineada: 9 skills de small-business @da38ec1 (Apache-2.0))
- ◆ spawnear subagente (Sonnet) · **leer las 2 skills de video y clasificarlas con columnas extra** (desde Skills de video fijadas por huella: god-animation + edicion-de-video (fuera del repo, no instaladas))
- ◆ subagente con scripts · **leer sfstudio, correr sus pruebas de la etapa de edicion en un clon aislado y clasificarlo** (desde sfstudio (github.com/daniel-carreon/sfstudio) fijado en 2a751fd; clon fuera del repo, sin licencia (UNLICENSED))

**Gates al cerrar la fase:**
- ↻ cada una de las 12 fuentes tiene fila y veredicto [gris] — referencia: 12/12 filas; ningun conector queda sin sustituto local o sin motivo de descarte; huellas de fuentes-video y commit de sfstudio verificados

## Fase 2 · ⚡ GRUPOS EN PARALELO

**→ produce `Perfil de marca y voz del negocio (brand-style + voice-profile)`**
- ◆ spawnear subagente (Sonnet) · **adaptar brand-style y voice-profile** (desde Mapa de adaptacion: 9 skills del plugin + 2 de video + sfstudio; por fuente, que se conserva / reemplaza / descarta, riesgo y entrada local)

**→ produce `Ventas normalizadas (CFDI XML via extractor-documental, CSV de caja/tienda)`**
- ◆ subagente con scripts · **sustituir PayPal/QuickBooks por CFDI y CSV** (desde Mapa de adaptacion: 9 skills del plugin + 2 de video + sfstudio; por fuente, que se conserva / reemplaza / descarta, riesgo y entrada local)

**→ produce `Senales de clientes (resenas pegadas o exportadas, mensajes)`**
- ◆ subagente con scripts · **sustituir Google/Yelp/HubSpot por entrada pegada o exportada** (desde Mapa de adaptacion: 9 skills del plugin + 2 de video + sfstudio; por fuente, que se conserva / reemplaza / descarta, riesgo y entrada local)

**→ produce `Auditoria SEO + visibilidad en IA (seo-ai-visibility)`**
- ◆ subagente con scripts · **auditar un sitio por URL (solo lectura)** (desde Mapa de adaptacion: 9 skills del plugin + 2 de video + sfstudio; por fuente, que se conserva / reemplaza / descarta, riesgo y entrada local)

**→ produce `Diagnostico de anuncios + copys (ad-manager, desde exportacion)`**
- ◆ subagente con scripts · **leer exportacion CSV de Meta/Google/TikTok** (desde Mapa de adaptacion: 9 skills del plugin + 2 de video + sfstudio; por fuente, que se conserva / reemplaza / descarta, riesgo y entrada local)

**→ produce `Propuesta de herramientas de video y animacion para pymes (analisis, sin construir)`**
- ◆ spawnear subagente (Sonnet) · **que herramienta seria para una pyme, que le falta y que cuesta** (desde Mapa de adaptacion: 9 skills del plugin + 2 de video + sfstudio; por fuente, que se conserva / reemplaza / descarta, riesgo y entrada local)

**Gates al cerrar la fase:**
- ↻ lo que el paquete no dice, declarado [gris] — referencia: licencia (skills, sfstudio UNLICENSED, GSAP, fuentes), servicios de pago y su precio, datos que salen (voz y cara del dueno = C4), piezas ausentes (video-use, biblioteca), lo que publica (sfpublish) fuera; ninguna API llamada

## Fase 3 · ⚡ GRUPOS EN PARALELO

**→ produce `Brief de contenido a 30 dias (content-strategy)`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **top y lentos + temporada MX -> brief** (desde Ventas normalizadas (CFDI XML via extractor-documental, CSV de caja/tienda))
- ▸ correr script (determinista) · **inyectar marca y voz** (desde Perfil de marca y voz del negocio (brand-style + voice-profile))

**→ produce `Temas con citas + borradores de respuesta (review-reputation)`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **temas + borradores en la voz del dueno** (desde Senales de clientes (resenas pegadas o exportadas, mensajes))
- ▸ correr script (determinista) · **inyectar voz** (desde Perfil de marca y voz del negocio (brand-style + voice-profile))

**→ produce `Pulso de crecimiento (growth-pulse)`**
- ◆ spawnear subagente (Sonnet) · **tendencia, canal, embudo** (desde Ventas normalizadas (CFDI XML via extractor-documental, CSV de caja/tienda))

**Gates al cerrar la fase:**
- ↻ C4: se escribe sobre terceros [gris] — referencia: nada se publica; datos personales minimizados; AISIA corta

## Fase 4 · ⚡ GRUPOS EN PARALELO

**→ produce `Calendario editorial + piezas en borrador (social-content-engine + canva-creator)`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **brief -> calendario y piezas** (desde Brief de contenido a 30 dias (content-strategy))
- ▸ correr script (determinista) · **inyectar marca y voz** (desde Perfil de marca y voz del negocio (brand-style + voice-profile))

**→ produce `Brief semanal de marketing (marketing-monday)`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **fusion** (desde Pulso de crecimiento (growth-pulse))
- ◆ spawnear subagente (Sonnet) · **fusion** (desde Temas con citas + borradores de respuesta (review-reputation))
- ◆ spawnear subagente (Sonnet) · **fusion** (desde Auditoria SEO + visibilidad en IA (seo-ai-visibility))
- ◆ spawnear subagente (Sonnet) · **fusion** (desde Diagnostico de anuncios + copys (ad-manager, desde exportacion))

**Gates al cerrar la fase:**
- ↻ la fusion no tira fuentes en silencio [gris] — referencia: fuente ausente = 'sin datos', nunca cero ni omitida (shared/absent-is-not-zero.md)
- ↻ coste de generacion [gris] — referencia: modelo por routing-modelos.json, uso a contabilidad; sin datos = null

## Fase 5

**→ produce `Herramientas empaquetadas (tarballs en verde, sin publicar)`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ▸ correr script (determinista) · **npm run empaqueta** (desde Calendario editorial + piezas en borrador (social-content-engine + canva-creator))
- ▸ correr script (determinista) · **npm run empaqueta** (desde Brief semanal de marketing (marketing-monday))

**Gates al cerrar la fase:**
- ↻ contrato del paquete [gris] — referencia: npm run empaqueta <x> en verde por herramienta, nucleo sin React/Next/Supabase

## Fase 6

**→ produce `Laboratorio de pruebas por herramienta (casos, estado real, veredictos)`**
- ◆ subagente con scripts · **casos por herramienta, corridos de verdad** (desde Herramientas empaquetadas (tarballs en verde, sin publicar))

**Gates al cerrar la fase:**
- ↻ casos con estado real [gris] — referencia: >= 5 casos por herramienta incluidos casos-trampa; veredicto medido, no supuesto

## Fase 7

**→ produce `App para el cliente pyme que las usa`**
- ◆ spawnear subagente (Sonnet) · **la app usa solo lo que el laboratorio aprobo** (desde Laboratorio de pruebas por herramienta (casos, estado real, veredictos))

## Fase 8

**→ produce `Gate humano: publicar, conectar un servicio, enviar a terceros`**
- ⏸ checkpoint humano (lisagomez) · **publicar / conectar / enviar** (desde App para el cliente pyme que las usa)

**Gates al cerrar la fase:**
- ↻ nada sale sin firma [gris] — referencia: cero envios, publicaciones o conexiones en todo el goal
