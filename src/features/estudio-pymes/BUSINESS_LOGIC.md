# BUSINESS_LOGIC.md — Estudio de marketing para pymes

> **Hipótesis del 2026-10-02, sin datos reales todavía.** La firma va al pie y se vuelve a firmar
> tras el piloto con datos reales de un negocio. Este contrato **consolida lo que el laboratorio ya
> firmó**: el qué en `.claude/goals/pymes-marketing/spec.md` (adaptar la familia de marketing del
> plugin `small-business@1.35.1`, CDC del 2026-09-26), la **AISIA de reseñas**
> (`.claude/goals/pymes-marketing/aisia-resenas.md`, firmada el 2026-09-27), el **CDC del redactor**
> (`BITACORA-CDC.md`, 2026-09-27) y el **candado del PRP-006** (`.claude/PRPs/PRP-006-generacion-de-contenido.md`:
> qué fases están autorizadas y cuáles esperan firma). El diseño está en `docs/SDD-generacion-de-contenido.md`.
> Entra aquí **sin firma previa**: la evaluación de impacto de ventas, contenido, anuncios y
> visibilidad (antes solo se había firmado la de reseñas) y la tabla de respaldo. Las dos se firman
> con este contrato. Lo que ninguna fuente dice va marcado **[supuesto]** o **pendiente**. Todo lo
> medido es con datos **sintéticos**.
> Cubre `tools/pymes-marketing`, `/estudio`, `/estudio/aprobar`, `/api/contenido/video` y el
> laboratorio `/laboratorio-pymes`.

---

## 1. Problema de Negocio

**Dolor:** una pyme mexicana sin equipo de marketing publica a ciegas: no sabe qué de lo que vende
conviene empujar, se le pasan las fechas que le venden (Día de Muertos, Buen Fin, quincenas), las
piezas no tienen su marca ni la medida de cada red, las reseñas se quedan sin contestar y paga
anuncios sin saber cuáles queman dinero. Las herramientas que resuelven esto asumen Estados Unidos,
dólares y QuickBooks, Canva o HubSpot conectados. La pyme tiene sus facturas XML, el archivo de su
caja y capturas de pantalla (spec, MISION).
**Costo actual:** **pendiente, no medido.** Ninguna fuente lo cuantifica: ni las horas del dueño
al mes, ni lo que paga a un tercero, ni las ventas de temporada que se le escapan.

## 2. Solución

**Propuesta de valor:** el dueño sube sus facturas o el archivo de su caja y sale con **su mes de
contenido listo para aprobar**: qué publicar y por qué, las piezas con su marca y en su forma de
escribir, en la medida de cada red, y una lista que aprueba desde el celular con constancia exacta
de qué aprobó. Además: sabe qué dicen sus clientes, si lo encuentran en buscadores y asistentes de
IA, y qué anuncios no rinden. **Lo publica él.** Cuesta **$0 por pieza**: todo es local y sin
llamadas a modelos (SDD §7).

**Flujo principal (Happy Path):**
1. El dueño abre `/estudio`, pega el HTML de su página (Ctrl+U; leerla sola desde la liga está
   pendiente, §7) o escribe una frase («verde bosque y crema»), y confirma su marca con un «sí» tras
   ver la vista previa. Pega unas muestras de cómo escribe.
2. Sube sus CFDI 4.0 o el CSV de su caja. **En su navegador** salen el resumen de 90 días, 30 días
   contra 30, y el brief de 30 días: qué empujar, qué mantener, qué reposicionar, temporada y
   ofertas, con la temporada comercial de México.
3. Del brief sale el calendario (2 por semana, con reuso por canal) y las piezas: PNG en 4:5, 1:1,
   1.91:1 y 9:16, carruseles y una promo de video 9:16 de 6 s **sin personas**. Cada pieza pasa una
   revisión automática: texto que desborda, contraste bajo, precio sin confirmar.
4. Si quiere más: temas y borradores de respuesta para sus reseñas (uno por uno), la auditoría de
   visibilidad, el veredicto de sus anuncios exportados y el brief del lunes que funde todo.
5. Aprueba o pide cambio pieza por pieza desde el celular. Queda la huella SHA-256 de lo aprobado, y
   si la pieza cambia la aprobación se revoca. Descarga el CSV del mes y **sube cada pieza él**.

## 3. Usuario Objetivo

**Rol:** el **dueño de una pyme mexicana sin equipo de marketing** (la panadería que vende pan de
muerto, la tienda de barrio con caja registradora). No sabe de colores en hexadecimal ni de
formatos: nunca se le piden.
**Terceros afectados, no usuarios:** **sus clientes**, que aparecen como receptores en los CFDI y
como autores de reseñas, y a quienes se perfila por su ritmo de compra («callados»); **quien ve las
piezas** (un precio publicado obliga ante PROFECO); y los **competidores** que el dueño nombra en
sus notas del brief del lunes.
**Contexto:** desde su computadora o su celular, con lo que ya tiene: XML, un Excel o CSV y
capturas. Aprueba desde el teléfono.
**Primer cliente real: pendiente.** Todo está probado con CFDI, reseñas y exportaciones sintéticas.

## 4. Arquitectura de Datos

**Input:** CFDI 4.0 (los lee el lector real de `@tu-scope/extractor-documental/xml`); el CSV de la
caja; el HTML de su sitio (pegado) o una frase para la marca; muestras de cómo escribe; reseñas
exportadas o pegadas; las exportaciones de anuncios (Meta, Google, TikTok); `robots.txt` y el HTML
del sitio para la auditoría; las notas del dueño.
**Output:** el resumen de ventas y el brief de 30 días; el calendario; piezas SVG y PNG,
carruseles y el MP4 1080×1920 de 30 fps, determinista (misma escena, mismos bytes); borradores de
respuesta a reseñas; los arreglos de visibilidad como archivos (`robots.txt`, `llms.txt`, JSON-LD)
con «POR CONFIRMAR»; el veredicto de cada anuncio con su impacto mensual en MXN; el brief del lunes;
el CSV del mes con lo aprobado.

**Storage: ninguno, a propósito.** No hay tablas en Supabase ni archivos en el servidor:
- Todo lo que sube el dueño **se lee en su navegador** y vive en la memoria de la pestaña. Se va al
  cerrarla, porque trae datos de terceros (CFDI con RFC, reseñas con nombres).
- La aprobación vive en esa sesión del navegador. Aprobar desde otro teléfono, o que aprueben dos
  personas, necesita cuentas: es la fase 9 del PRP-006, **bloqueada**.
- **Única excepción:** el MP4 de la promo se renderiza en el servidor **local** con la marca y el
  producto, nunca con datos de clientes, en un temporal que se borra al terminar.

### Respaldo — qué pierde ESTE producto si arde el servidor

> No hay respaldo implícito. **Lo que no esté en esta tabla ni en la del servidor (§4 del
> [índice de la raíz](../../../BUSINESS_LOGIC.md)), no se respalda.** El inventario completo, la
> regla para decidir criticidad y los gates de verificación están en
> **[`docs/FASE0-INFRAESTRUCTURA.md`](../../../docs/FASE0-INFRAESTRUCTURA.md) §9**. Esta tabla no se
> había firmado: se firma con este contrato.

Regla de criticidad, en una pregunta: **¿se puede reconstruir?**
Sin pérdida → no se respalda · Con trabajo → respaldo normal · **No** → respaldo inmutable.

| Activo del producto | ¿Reconstruible? | Criticidad | Destino |
|---|---|---|---|
| Lo que sube el dueño (CFDI, CSV, reseñas, exportaciones) | — | — | **No se respalda**: nunca llega al servidor |
| Aprobaciones y CSV del mes | Sí: el dueño descarga el CSV con la huella de cada pieza | — | **No se respalda**: vive en su navegador y en su descarga |
| Temporal del render del MP4 | Sí: el render es determinista | — | **No se respalda**: se borra al terminar |
| Casos del laboratorio y referencias visuales con su huella | Sí: están en git | Baja | git |

**Riesgo abierto:** el día que se construya la fase 9 (aprobación con cuentas), las decisiones del
dueño pasan a Supabase y se vuelven constancia **no reconstruible**. Esa fila entra aquí **antes**
de construirla, no después.

**RPO / RTO:** los del servidor, en el §4 del índice de la raíz. Este producto no guarda nada propio
en el servidor.

## 5. KPI de Éxito

**Métrica principal: pendiente.** Sale del piloto con datos reales y la fija el laboratorio.
**[supuesto]** El candidato natural es el tiempo del dueño desde que sube sus facturas hasta que
tiene su mes aprobado, y cuántas piezas aprueba sin pedir cambio. Ninguno está medido.

Ya medido, con datos sintéticos (SDD §10, 2026-09-27): 65 casos de laboratorio, 64 pasan, 1 no
medido (el LLM, sin llave), 0 fallan, 35 con trampa y al menos 5 por herramienta. Render de la promo
de ~17,5 a 19,5 s en CPU, con la misma huella en dos renders. La comparación visual da 0,27 a 0,36 %
de píxeles distintos contra la referencia. Aprobar hace 0 salidas de red. Pruebas del paquete:
49/49 (otra vez el 2026-10-02).

## 6. Gobernanza (controles C4 y C7)

> Se llena SIEMPRE, aunque el proyecto sea chico. Plantilla completa en
> `.claude/gobernanza/plantillas/aisia.md`. La pregunta que responde esta sección no es
> *¿quién nos ataca?* sino **¿a quién dañamos si el sistema opera bien y se equivoca?**
> La parte de reseñas es la AISIA **firmada el 2026-09-27**; el resto entra con este contrato.

| Punto | Respuesta |
|---|---|
| **Datos personales que toca** | El RFC y el nombre de los receptores de los CFDI (en el resumen solo queda su huella); nombres y a veces teléfonos de clientes en el CSV de caja y en las reseñas (se tapan teléfono, correo, RFC, CURP, CLABE y tarjeta al leer y otra vez al redactar; el autor queda como «Nombre I.»); el ritmo de compra de cada cliente (los «callados», solo con alias y huella). El teléfono **del negocio** sí queda. Las piezas no llevan datos personales. |
| **Partes afectadas** | El dueño; sus clientes (receptores, autores de reseñas, callados); quien ve las piezas publicadas; los competidores que el dueño anota. |
| **Daño con el sistema operando bien** | **1.** Un brief que empuja el producto equivocado: las reglas solo se han probado con ventas sintéticas. **2.** Un precio publicado equivocado o sin IVA (PROFECO): solo entra el precio que el dueño confirmó, con impuestos; si no hay, la pieza sale sin precio y avisa. **3.** Un anuncio declarado «quema dinero» por leer mal una columna: las columnas de las exportaciones vienen de la documentación y **nunca se cotejaron con un archivo real de Meta**; hay mínimos antes de concluir y «sin veredicto». **4.** Una respuesta a reseña que repite un dato personal, inventa una política o contesta con plantilla un caso de salud o legal (mitigado en la AISIA de reseñas). **5.** Una temporada genérica que no le toca a ese negocio: se marca «¿coincide con tu negocio?», y las fechas móviles «aproximada». |
| **Riesgos que ninguna firma autoriza** (límite de C5) | Se **rediseñan**, no se aceptan: **1.** publicar respuestas a reseñas automáticamente, o mandar mensajes a los clientes callados sin revisión: el daño cae sobre terceros que no firmaron (AISIA de reseñas, §5); **2.** personas en pantalla: los tipos de capa del video están cerrados (etiqueta, titular, apoyo, precio, marca) y una capa de foto no pasa la revisión de la escena. La foto de producto (que puede traer personas) es la fase 8, bloqueada; el reel con voz y cara es otro producto, con su contrato ([reel del celular](../reel/BUSINESS_LOGIC.md)). |
| **Salida del perímetro** | Nada sale del navegador del dueño, salvo la escena del video al servidor local (marca y producto, sin datos de clientes). El **redactor con LLM está apagado**: sus prompts se firmaron (CDC del 2026-09-27), pero activarlo es otro CDC con llave y corrida medida, y **una decisión C4**: los textos del negocio y las reseñas de terceros irían al proveedor del modelo. La AISIA de reseñas se revisa en ese momento. |
| **Acciones irreversibles** | **Publicar** y **cambiar el presupuesto de anuncios**, y las dos están **fuera** de la herramienta: el dueño las hace a mano (los anuncios salen como un bloque «cómo hacerlo tú»). Aprobar no publica ni sale a la red. |
| **Vía de apelación humana** | El dueño pide cambio con una nota, y editar revoca lo aprobado. Las respuestas a reseñas se aprueban una por una; lo de salud o legal se escala sin borrador, y una reseña con órdenes escondidas se retiene. Quien escribió una reseña no tiene vía dentro del sistema: responde el dueño, en público y con su nombre, y por eso nada sale solo. |
| **Aislamiento de datos** | Sin tablas y sin `service_role`. `/estudio` **no pide cuenta**: cada quien solo ve lo que carga en su propia pestaña. La ruta del video acepta solo peticiones del mismo origen, valida la escena con Zod (sin URL ni archivos), renderiza en Chromium **con la red bloqueada** y hace un render a la vez. En producción responde 501 hasta la fase 10. Con la fase 9 llegan RLS por dueño y el aislamiento medido entre dos cuentas, como en el reel (C7). |

## 7. Especificación Técnica (Para el Agente)

### Tipo de proyecto

**Tipo:** herramienta + aplicación. El núcleo es `@tu-scope/pymes-marketing` (0.3.0 en
`tools/pymes-marketing`, empaquetada el 2026-10-02: 11 subpaths instalados e importados en un proyecto
limpio, 53 `.d.ts`): TypeScript puro sin dependencias, con el redactor y cualquier almacén
**inyectados**. Lo consume la app del template
en `/estudio` y `/estudio/aprobar`, sin cuentas, y el laboratorio `/laboratorio-pymes` le corre los
casos y apaga las secciones que no pasan. Usa `@tu-scope/extractor-documental/xml` para los CFDI.
Atribución Apache-2.0 al plugin `small-business` en `NOTICE`.
**Solo local para el video:** el render del MP4 en producción está bloqueado hasta la fase 10
(Chromium y ffmpeg en la imagen).
**Cobro en línea: pendiente.** Dos preguntas distintas y abiertas: cómo cobra el laboratorio por el
estudio, y la pasarela con la que la pyme cobraría a **sus** clientes. Para la segunda,
`/add-payments` **no aplica**: Polar no permite bienes físicos ni servicios presenciales
(`resultados.md` del goal).

### Features (Feature-First)

```
src/features/
├── estudio-pymes/       # marca, ventas, calendario, carruseles y video, reseñas, visibilidad,
│                        # anuncios y brief del lunes; aprobación en el celular (hecho)
└── laboratorio-pymes/   # casos, estado real y veredictos; decide qué secciones prende el estudio (hecho)
```

### Stack confirmado

Golden Path del template (ver `CLAUDE.md`). Sin Supabase hasta la fase 9. El redactor de serie es el
de plantillas; el de LLM va por `routing-modelos.json` (clases `redaccion-de-marketing` y
`respuesta-a-resenas`, nivel `capaz`, modelo pineado), apagado.

### Próximos pasos

1. [ ] **Piloto con datos reales** de un negocio, con su permiso: XML, reseñas y exportaciones de
   anuncios. De ahí salen el costo actual (§1), el KPI (§5) y el ajuste de las columnas de Meta.
   Día de Muertos y Buen Fin son buen momento para hacerlo
2. [ ] Leer el sitio por URL con protección SSRF: superficie nueva con su modelo de amenazas (C3)
3. [ ] Lista guardada de competidores
4. [ ] Fases bloqueadas del PRP-006, cada una con su firma: 8 (foto de producto, C4), 9 (redactor con
   LLM = CDC con corrida medida; aprobación con cuentas = C4 y C7, y su fila en la tabla de respaldo)
   y 10 (render en producción, infraestructura)
5. [ ] Decidir el cobro (§7)
6. [ ] Las otras familias del plugin (finanzas, ventas, operación), cada una con su goal

---

**Firma:** pendiente del laboratorio.
