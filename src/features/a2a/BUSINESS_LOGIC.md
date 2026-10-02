# BUSINESS_LOGIC.md — Extractor documental

> **Hipótesis del 2026-09-30, sin corpus real todavía.** El laboratorio decidió ese día que el
> extractor es **producto** y no solo librería. La firma va al pie y se vuelve a firmar con el
> corpus real del cliente. Redactado por el agente a partir de lo ya decidido y construido: el
> diseño (`docs/SDD-extractor-documental.md`), las specs 007, 008 y 010, el README de la
> herramienta y la Agent Card del puente. Nada de aquí se inventa: lo que ninguna fuente dice va
> marcado **[supuesto]** o **pendiente**. Todo lo medido sobre calidad es con corpus **sintético**
> o no concluyente, salvo los identificadores de expedientes laborales (84 páginas reales).
> Cubre `tools/extractor-documental`, su servicio contenedorizado y el puente A2A (`/a2a`).

---

## 1. Problema de Negocio

**Dolor:** un negocio tiene miles de documentos heterogéneos (PDF generados por software,
escaneos, fotos de celular, manuscritos y XML fiscales) y necesita sus datos revisados por una
persona, sin reescribir un extractor en cada proyecto. Quiere además el modelo de datos que esos
documentos implican en conjunto, y que sus agentes usen la capacidad como una herramienta más. Y
hay una restricción que lo gobierna todo: **los documentos llevan datos de terceros y ningún byte
sale del perímetro** (spec 008). Por eso «masivo» no se logra con un motor más rápido en la nube:
se logra enrutando fuera del motor todo lo que no lo necesita.
**Costo actual:** **pendiente, no medido** en una operación real. Lo único calculado es el costo de
la alternativa que se descartó por C4: unas 5.000 páginas con un motor de API salen en ~20 USD
(SDD §2.18).

## 2. Solución

**Propuesta de valor:** carga masiva de documentos que se leen **por la vía que le toca a cada
uno** según sus bytes, con la evidencia de cada campo, revisión humana de lo que no se puede
cotejar, y mapeo contra los catálogos que el proyecto **ya tiene**. Corre en el VPS del cliente
sin que salga nada, y sus agentes la piden por A2A sin tener ninguna llave.

**Flujo principal (Happy Path):**
1. **Carga**: se arrastra una carpeta o un lote (PDF, imágenes, XML), o llega por el escáner o la
   cámara, con una cola que no se pierde sin conexión.
2. **Lectura por vía**: el texto que el PDF ya trae (capa 0), el XML fiscal, los QR y códigos de
   barras de la página, y solo al final un motor de OCR autohospedado. Los identificadores (RFC,
   CURP, NSS) salen de su código y se validan por dígito verificador antes que por OCR.
3. **Revisión**: cada campo llega con su confianza y la evidencia que la sostiene (código, exacto,
   corroboración, checksum o motor). Lo que no se puede cotejar con una segunda fuente va a
   revisión. Quien escanea no es quien valida.
4. **Mapeo y modelo**: «¿es esta fila?» contra los catálogos existentes, con los parecidos a la
   vista y ningún alta sin confirmación. Sobre el corpus entero se **propone** un modelo de
   entidades que nadie aplica desde aquí.
5. **Agentes**: Hermes, u otro agente tras gate humano, pide extracciones por A2A y recibe la
   confianza por campo y la marca `revisionHumana`, nunca un dato inventado con un 200.

## 3. Usuario Objetivo

| Actor | Qué hace |
|---|---|
| Operario | escanea y sube; **no valida lo que sube** |
| Revisor | corrige y valida, cierra, suprime a petición del titular |
| Consulta | lee y exporta sin poder alterar lo auditado |
| El laboratorio (o el cliente) | despliega el servicio en su VPS, con o sin GPU |
| Operador | mide por etapa y por hardware, y decide umbrales con cifras |
| Integrador | instala el paquete en otro proyecto y le inyecta el motor y el almacén |
| Hermes (agente del cliente) | pide extracciones por A2A; no recibe ninguna llave |

**Terceros afectados, no usuarios:** los **titulares de los documentos** (clientes, empleados,
proveedores, pacientes, solicitantes), que nunca eligieron estar aquí; el **proveedor legítimo**
de una factura, y el **dueño del esquema**, que paga un duplicado mal dado de alta.
**Contexto:** oficina con carpetas de expedientes o facturas; almacén con escáner o cámara; y
agentes en la misma red del compose.
**Qué cliente lo usa primero y con qué corpus: pendiente.**

## 4. Arquitectura de Datos

**Input:** PDF, PNG, JPEG, WebP y XML (CFDI); carpetas enteras; lecturas de escáner y cámara;
peticiones A2A (JSON-RPC) de agentes.
**Output:** campos con confianza, evidencia y región de origen; JSON por documento con esquema
por clase de página; una propuesta de modelo entidad-relación que pasa por `revisaSql` y **nadie
aplica**; exportación CSV con las celdas peligrosas neutralizadas; Tasks A2A que fallan con razón
legible cuando algo no está.

**Storage:** el almacén **se inyecta**. En producción son tablas de Supabase (migración
`001-extractor-documental.sql`: `organizaciones`, `membresias`, `lotes`, `documentos`, `plantillas`,
`versiones_de_campo`, `indice_identificadores`, `lapidas`), con RLS por organización en toda tabla,
y un **bucket privado** para los originales en `{organizacion_id}/{sha256}.{ext}`, con URL firmada
y caduca. Además:
- el **servicio** deja el documento en tránsito en un temporal (`--tmpfs`) y no guarda nada;
- el **puente A2A** guarda las Tasks sin historial, con tope y caducidad, así que no se queda con
  el documento (medido el 2026-09-13: el almacén por defecto del SDK retenía 39,7 MB con RFC y
  CURP de terceros);
- la **cola sin conexión** vive en el navegador (IndexedDB) y la PWA instalada la protege;
- la deduplicación por hash **no cruza organizaciones**: compartir objetos le diría a A que B
  tiene la misma factura.

**Retención:** se declara **por proyecto**, porque depende del tipo de documento y de la
jurisdicción, y **vencer no borra nada solo**: borrar es irreversible y va por gate humano. Una
supresión borra el contenido (original, valores, índice) y **deja la lápida** con quién lo pidió y
quién lo ejecutó. **Plazo por defecto: pendiente.**

### Respaldo — qué pierde ESTE producto si arde el servidor

> No hay respaldo implícito. **Lo que no esté en esta tabla ni en la del servidor (§4 del
> [índice de la raíz](../../../BUSINESS_LOGIC.md)), no se respalda.** El inventario completo, la
> regla para decidir criticidad y los gates de verificación están en
> **[`docs/FASE0-INFRAESTRUCTURA.md`](../../../docs/FASE0-INFRAESTRUCTURA.md) §9**.

Regla de criticidad, en una pregunta: **¿se puede reconstruir?**
Sin pérdida → no se respalda · Con trabajo → respaldo normal · **No** → respaldo inmutable.

| Activo del producto | ¿Reconstruible? | Criticidad | Destino |
|---|---|---|---|
| Tablas del extractor en Supabase (documentos, versiones, plantillas, índice, lápidas) | **No**: lo validado, su historial y las plantillas | Crítica | PITR + dump lógico |
| Originales en el bucket privado | **No**: son la evidencia | Crítica | Es la fila de Storage del servidor: su propia sincronización, porque `pg_dump` no los incluye (SDD §2.15) |
| Temporal del servicio (`--tmpfs`) y Tasks del puente | Sí: están de paso a propósito | — | No se respalda |
| Cola sin conexión (IndexedDB de cada equipo) | — | — | No se respalda: vive en el navegador |
| Imagen del servicio y motores autohospedados | Sí: pineados por digest | Baja | No se respalda |
| Corpus de medición del laboratorio (`corpus/`, fuera de git) | Con trabajo: se vuelve a reunir | — | **No se respalda** (decisión del laboratorio, 2026-09-30): son documentos reales de terceros, y copiarlos también es sacar datos (C4) |

**Pendiente, no diseñado:** restaurar una copia **anterior a una supresión** devolvería el contenido
que un titular pidió borrar. Cómo se vuelven a aplicar las lápidas al restaurar no está resuelto.

**RPO / RTO:** los del servidor, en el §4 del índice de la raíz.

## 5. KPI de Éxito

**Métrica principal: pendiente.** Sale del corpus real del cliente (al menos 100 páginas
estratificadas, spec 010) y la fija el laboratorio. Las tres calibraciones que la deciden **se
miden, no se eligen**, y siguen abiertas: el umbral de confianza (TAR-17), el de similitud (TAR-25)
y la ráfaga del escáner (TAR-34).

Ya medido, y dicho con su alcance:
- Tesseract por zonas, sin GPU: 197 páginas por minuto de base y 251,7 con 4 en vuelo
  (2026-09-13, 33 páginas sintéticas: **no concluyente**);
- motor autohospedado en CPU: ~110 s por página (2026-09-11), y por eso enrutar fuera del motor es
  el único ahorro;
- RFC, CURP y NSS de expedientes laborales leídos por su código: 84 páginas **reales**;
- GPU: no medido.

## 6. Gobernanza (controles C4 y C7)

> Se llena SIEMPRE, aunque el proyecto sea chico. Plantilla completa en
> `.claude/gobernanza/plantillas/aisia.md`. La pregunta que responde esta sección no es
> *¿quién nos ataca?* sino **¿a quién dañamos si el sistema opera bien y se equivoca?**
> El detalle está en el SDD §7 y en las specs 007, 008 y 010; aquí va lo que decide el producto.

| Punto | Respuesta |
|---|---|
| **Datos personales que toca** | Los de los titulares: nombres, RFC, CURP, NSS, importes, domicilios, números de guía (adyacentes: con ellos se consulta una dirección) y recibos de nómina, cuyas claves sensibles nombra `CLAVES_SENSIBLES_NOMINA`. En un CFDI, además, **la relación comercial** entre emisor y receptor. Según el proyecto, también documentos de salud. |
| **Partes afectadas** | Los **titulares** de los documentos; el **proveedor legítimo**, que no cobra si un código sustituido desvía el pago; los **empleados** cuya nómina se lee; el **dueño del esquema**, que paga un duplicado; y el **agente** que consume, que actuaría en casa de otro sobre un dato falso. |
| **Daño con el sistema operando bien** | **1.** Un dato mal extraído que pasa la revisión visual y decide algo sobre la persona (un importe, una fecha, una dosis). Mitigación: confianza y evidencia visibles, región de origen obligatoria, sin umbral por defecto hasta medirlo. **2.** Una factura tomada por auténtica porque su XML se leyó bien: **el sello no se verifica** y la Card y la respuesta lo dicen; no se consulta al SAT, para no revelar la relación entre dos terceros. **3.** Un alta que debió ser coincidencia parte en dos el historial de alguien: ninguna alta sin confirmación, con los parecidos a la vista. **4.** Un pago desviado por un QR sustituido: nunca se navega a la dirección de un código, y ningún dato de pago se promueve sin confirmación. **5.** Un campo apagado en la plantilla desaparece de mil documentos: queda quién lo apagó y cuándo. **6.** La evidencia perdida por creerla respaldada (§4). **7.** Un CSV exportado deja de estar bajo RLS: queda registrado quién exportó qué y cuándo. |
| **Salida del perímetro** | **Ningún documento con datos de terceros sale del perímetro, y ninguna firma lo autoriza** (límite de C5): el daño recae en quien no firmó. El motor es autohospedado; Mistral viene apagado y solo arrancaría con una decisión C4 escrita, que con datos de terceros no procede. |
| **Exponer el puente A2A** | Solo en la red interna del compose, con clave de API. **Desde el 2026-10-02 se hace cumplir**: Caddy responde 404 desde fuera y, en producción, sin clave el puente se apaga (revisión C3 de rutas públicas). Además, **por ahora no se ofrece a partners** (decisión del laboratorio, 2026-09-30). **Ofrecerlo a un partner o a internet es gate humano** (spec 005 RF-12, spec 010 RF-20) y va con modelo de amenazas (C3) y la evaluación de impacto de ese caso, que está **pendiente**: el documento de un partner trae datos de alguien que no firmó nada. Falta también la gestión de credenciales, cuota y límite por partner. |
| **Acciones irreversibles** | Ninguna automática. Con gate humano o confirmación: suprimir (otra operación y otra autoridad que corregir), borrar por retención, aplicar la propuesta de modelo, dar de alta en un catálogo, promover un dato de pago y exponer el puente. |
| **Vía de apelación humana** | Una corrección añade versión con quién, cuándo y por qué; lo validado no se edita. El titular puede pedir la supresión y queda la lápida. El agente recibe una Task fallida con razón legible, o `revisionHumana=true`, en vez de un dato inventado. |
| **Aislamiento de datos** | RLS por organización en toda tabla y en el bucket (primer segmento de la ruta). **Las policies de la migración 001 no se han ejecutado nunca** (SDD §8): hasta probarlas en un Postgres real, «lo aísla la base» es una afirmación. El worker de ingesta con `service_role` es un job de plataforma declarado (C7); la subida va con la sesión del usuario. Hermes no recibe llaves del extractor, del almacén ni `service_role`. |

## 7. Especificación Técnica (Para el Agente)

### Tipo de proyecto

**Tipo:** herramienta + servicio + aplicación. El núcleo es la herramienta empaquetable
`@tu-scope/extractor-documental` (0.7.1, en `tools/extractor-documental`, ocho entry points); el
servicio contenedorizado se levanta en el VPS del cliente con `docker compose up`, con o sin GPU
(spec 010); y la app del template expone el puente A2A en `/a2a`, con tres rutas exactas: la Card,
el JSON-RPC y el health.
**Cobro en línea: pendiente** (hoy no cobra; si se ofrece a partners, se decide entonces).

### Features (Feature-First)

```
src/features/
└── a2a/          # Agent Card (dos skills), JSON-RPC con el SDK pineado, Tasks efímeras (hecho)
src/app/a2a/      # las tres rutas del puente
```

### Stack confirmado

Golden Path del template (ver `CLAUDE.md`) para la app; el núcleo no importa React, Next ni
Supabase. `@a2a-js/sdk` pineado sin rangos; imagen del servicio y motores pineados por digest.

### Próximos pasos

1. [ ] **Corpus real del cliente** (al menos 100 páginas estratificadas, fuera del repo) y, con
   él, medir TAR-17, TAR-25 y TAR-34, y fijar el KPI (§5)
2. [ ] Ejecutar las policies de RLS de la migración 001 en un Postgres real (SDD §8)
3. [ ] Diseñar cómo se vuelven a aplicar las lápidas al restaurar un respaldo (§4)
4. [ ] Plazo de retención por tipo de documento y jurisdicción
5. [ ] Medir con GPU (el perfil `ocr-gpu` está declarado)
6. [ ] Si se ofrece a partners: modelo de amenazas (C3), evaluación de impacto del caso (C4),
   credenciales, cuota y límite por partner, y **gate humano** antes de exponerlo
7. [ ] Verificar el lector de nómina contra un recibo real
8. [ ] Cerrar **GATE 3** para las tablas y el bucket (`docs/FASE0-INFRAESTRUCTURA.md`)

---

**Firma:** pendiente del laboratorio.
