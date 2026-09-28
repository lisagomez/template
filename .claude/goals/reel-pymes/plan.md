# Plan de orquestación — Reel del celular para pymes: cuentas, reel, privacidad, tarjetas, sala de aprobación, laboratorio y app

> Derivado DETERMINISTA del grafo `reel-pymes` por grafo2plan.py — no es juicio, es topología.
> Regla: dentro de una fase, grupos hacia artefactos DISTINTOS corren EN PARALELO;
> los gates de la fase se corren ANTES de avanzar a la siguiente.

## Fase 1

**→ produce `PRP-007 del reel: fases con candado (firmado / bloqueado), C3 de la superficie nueva (cuentas + subida de video) y AISIA`**
- ◆ spawnear subagente (Sonnet) · **lo existente medido y las 14 respuestas firmadas** (desde Base existente: video por código 0.2.0 (escena, cuadro, MP4 determinista), aprobación con huella, /estudio; tools/dictado + voz 0.5.0 (transcriptor, diarización); propuesta-video.md firmada)

**Gates al cerrar la fase:**
- ↻ candado [gris] — referencia: solo se construye lo firmado: sin LLM, transcripción remota, video generativo, GSAP, render en producción ni publicar

## Fase 2 · ⚡ GRUPOS EN PARALELO

**→ produce `/add-login acotado: correo y contraseña, profiles, RLS, proxy.ts solo sobre las rutas nuevas; sin service_role en superficies (C7)`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **fase 1 del PRP: /add-login acotado** (desde PRP-007 del reel: fases con candado (firmado / bloqueado), C3 de la superficie nueva (cuentas + subida de video) y AISIA)
- ⏸ checkpoint humano (el laboratorio) · **URL y llaves en el entorno; si faltan, el goal se detiene y las pide** (desde Proyecto Supabase en la nube creado por el laboratorio, llaves en el entorno (presencia enmascarada))

**→ produce `Motores locales pineados con licencia y huella: transcripción con marcas por palabra, conteo de hablantes, detección de caras (no reconocimiento), lectura de pantalla`**
- ◆ subagente con scripts · **instalar pineado (script de tools/dictado) y medir marcas por palabra** (desde PRP-007 del reel: fases con candado (firmado / bloqueado), C3 de la superficie nueva (cuentas + subida de video) y AISIA)

**→ produce `Tarjetas animadas: versión video de cada pieza del calendario y temporadas firmadas, sobre el video por código existente`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **escena/cuadro de 0.2.0** (desde Base existente: video por código 0.2.0 (escena, cuadro, MP4 determinista), aprobación con huella, /estudio; tools/dictado + voz 0.5.0 (transcriptor, diarización); propuesta-video.md firmada)
- ◆ spawnear subagente (Sonnet) · **fase del PRP: tarjetas animadas (respuestas 1 y 13)** (desde PRP-007 del reel: fases con candado (firmado / bloqueado), C3 de la superficie nueva (cuentas + subida de video) y AISIA)

## Fase 3 · ⚡ GRUPOS EN PARALELO

**→ produce `Esquema del reel: proyectos, versiones, aprobaciones (quién, cuándo, huella, versión) y estado de consentimientos, con RLS probada entre dos cuentas`**
- ◆ spawnear subagente (Sonnet) · **migraciones no destructivas + prueba de RLS entre dos cuentas** (desde /add-login acotado: correo y contraseña, profiles, RLS, proxy.ts solo sobre las rutas nuevas; sin service_role en superficies (C7))

**→ produce `Herramienta reel-del-celular: ingesta sin metadatos, transcripción, cortes por reglas, subtítulos de marca en zona segura, cotejo de precios, máster declarativo, QA`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **contratos inyectados (Transcriptor, ContadorDeHablantes, DetectorDeCaras, LectorDePantalla)** (desde Motores locales pineados con licencia y huella: transcripción con marcas por palabra, conteo de hablantes, detección de caras (no reconocimiento), lectura de pantalla)
- ◆ spawnear subagente (Sonnet) · **render y codificación deterministas ya medidos** (desde Base existente: video por código 0.2.0 (escena, cuadro, MP4 determinista), aprobación con huella, /estudio; tools/dictado + voz 0.5.0 (transcriptor, diarización); propuesta-video.md firmada)

**Gates al cerrar la fase:**
- ↻ aislamiento [gris] — referencia: RLS en toda tabla; la cuenta B no lee nada de la cuenta A (prueba pegada); service_role fuera de superficies
- ↻ perímetro [gris] — referencia: video, transcripción y documento de consentimiento no salen del servidor; render con la red bloqueada; peticiones capturadas
- ↻ determinismo [gris] — referencia: mismo máster, misma huella en dos renders

## Fase 4

**→ produce `Controles de la AISIA: desenfoque o bloqueo de caras sin consentimiento, bloqueo por datos en pantalla, consentimientos, retención de 30 días y borrar proyecto`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **QA que bloquea el borrador** (desde Herramienta reel-del-celular: ingesta sin metadatos, transcripción, cortes por reglas, subtítulos de marca en zona segura, cotejo de precios, máster declarativo, QA)
- ◆ spawnear subagente (Sonnet) · **estado de consentimiento por persona** (desde Esquema del reel: proyectos, versiones, aprobaciones (quién, cuándo, huella, versión) y estado de consentimientos, con RLS probada entre dos cuentas)

**Gates al cerrar la fase:**
- ↻ consentimiento [gris] — referencia: no se aprueba un borrador con más caras o voces que consentimientos registrados; menores nunca
- ↻ datos en pantalla [gris] — referencia: la lectura de pantalla bloquea tickets, teléfonos, RFC y chats, y reporta enmascarado a 4 caracteres
- ↻ retención [gris] — referencia: bruto y transcripción se borran a los 30 días de aprobar; borrar proyecto verificable con antes y después

## Fase 5

**→ produce `Sala de aprobación en el celular con sesión: marcar corte o texto en el segundo exacto, aprobar o pedir cambio, registro y revocación`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **registro de aprobación con sesión** (desde Esquema del reel: proyectos, versiones, aprobaciones (quién, cuándo, huella, versión) y estado de consentimientos, con RLS probada entre dos cuentas)
- ◆ spawnear subagente (Sonnet) · **no se aprueba con caras o datos sin cubrir** (desde Controles de la AISIA: desenfoque o bloqueo de caras sin consentimiento, bloqueo por datos en pantalla, consentimientos, retención de 30 días y borrar proyecto)

## Fase 6

**→ produce `Laboratorio: ≥5 casos por herramienta con las 6 trampas firmadas, material sintético con licencia, estado real y referencias`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **casos del reel** (desde Herramienta reel-del-celular: ingesta sin metadatos, transcripción, cortes por reglas, subtítulos de marca en zona segura, cotejo de precios, máster declarativo, QA)
- ◆ spawnear subagente (Sonnet) · **las 6 trampas firmadas** (desde Controles de la AISIA: desenfoque o bloqueo de caras sin consentimiento, bloqueo por datos en pantalla, consentimientos, retención de 30 días y borrar proyecto)
- ◆ spawnear subagente (Sonnet) · **casos de tarjetas** (desde Tarjetas animadas: versión video de cada pieza del calendario y temporadas firmadas, sobre el video por código existente)
- ◆ spawnear subagente (Sonnet) · **casos de la sala** (desde Sala de aprobación en el celular con sesión: marcar corte o texto en el segundo exacto, aprobar o pedir cambio, registro y revocación)

## Fase 7

**→ produce `App: el reel como pieza del calendario en /estudio y la sala en el celular, recorrida con Playwright`** ⚠ CONVERGENCIA: varias transformaciones al mismo artefacto (mismo worker o merge explícito — un merge que tira una fuente en silencio es EL fallo de grafo)
- ◆ spawnear subagente (Sonnet) · **la app usa solo lo que el laboratorio aprueba** (desde Laboratorio: ≥5 casos por herramienta con las 6 trampas firmadas, material sintético con licencia, estado real y referencias)
- ◆ spawnear subagente (Sonnet) · **rutas protegidas sin romper las existentes** (desde /add-login acotado: correo y contraseña, profiles, RLS, proxy.ts solo sobre las rutas nuevas; sin service_role en superficies (C7))

**Gates al cerrar la fase:**
- ↻ gate [gris] — referencia: validate en verde después del commit

## Fase 8

**→ produce `Guía del dueño para grabar y aprobar, formato de consentimiento (por verificar con asesoría legal), READMEs, propuesta de respaldo`**
- ◆ spawnear subagente (Sonnet) · **guía y formatos con lo que de verdad hace** (desde App: el reel como pieza del calendario en /estudio y la sala en el celular, recorrida con Playwright)

## Fase 9

**→ produce `Gate humano: estreno con clips del laboratorio, asesoría legal, respaldo, publicar (siempre el dueño) y lo que sigue bloqueado`**
- ⏸ checkpoint humano (el laboratorio) · **estreno, asesoría legal, respaldo, publicar** (desde Guía del dueño para grabar y aprobar, formato de consentimiento (por verificar con asesoría legal), READMEs, propuesta de respaldo)
