# Plan 015 — Piloto medido del buzón de CFDI recibidos

> Hace el papel del PRP para esta spec. Diagnóstico de forma: **LOOP**, un solo ejecutor. Casi todo lo
> que lee y revisa ya está construido en el extractor (specs 007 y 010), y el consentimiento y el
> borrado copian el patrón del reel. Lo nuevo es la arista que los junta en la máquina del despacho, más
> la medición.
>
> **Mapa de lo que existe, medido el 2026-10-06:**
> - el extractor lee el XML exacto (`./xml`, `leeCfdi40`), marca el sello como no verificado, coteja el
>   XML contra la representación impresa, devuelve confianza con evidencia por campo y trae la UI de
>   revisión (sin montar);
> - su servicio corre en una red sin salida;
> - **el buzón del ERP (5B.2) está especificado y sin código**;
> - **la lista 69-B no existe** en el repo.
>
> **Aprobado por el laboratorio el 2026-10-06.**

## Módulos y requisitos que cubren

| Módulo | Dónde | RF |
|---|---|---|
| Despliegue en el despacho: la app, un Supabase autohospedado y el servicio del extractor (perfil `ocr`, red `interna`) | `docker-compose.yml`, `scripts/configura-deploy.mjs`, `docs/DEPLOY-HETZNER.md` | RF-6, RF-7 |
| Consentimiento por pyme: registro, retiro y borrado en cascada | `src/features/buzon-cfdi/` + migración (patrón del reel: se revoca con `revocado_en`, nunca se reescribe) | RF-1 a RF-5 |
| Ingesta del buzón, solo con consentimiento | la feature, montando `ZonaDeIngesta` del extractor | RF-1, RF-2 |
| Lectura: XML exacto, y OCR con evidencia | el servicio del extractor (`/extraer`, `/lote`) y `leeCfdi40` | RF-9, RF-10, RF-11, RF-15 |
| Cotejo del buzón: receptor igual a la pyme, folio fiscal único, XML contra impresa | la feature (las dos primeras son nuevas) y `corroboracion.ts` | RF-12, RF-13, RF-14 |
| Revisión y confirmación por CFDI, y exportación de los confirmados al sistema contable del despacho | la feature, montando `TablaDeRevision` | RF-16, RF-17 |
| Banderas 69-B con fuente y fecha | la feature: la lista pública fechada se importa | RF-18, RF-19 |
| Registro de tiempo por pyme y por mes, sin persona | la feature, en una tabla propia | RF-20, RF-21 |
| Cifras agregadas, con la pyme bajo seudónimo | la feature (exportación) | RF-8, RF-22, RF-30 |
| Parar, cerrar y borrar con constancia | la feature (patrón de `supresion.ts` y del reel) | RF-25 a RF-29 |
| «Costo actual» en el contrato | `src/features/a2a/BUSINESS_LOGIC.md` (y el del ERP según la duda 4) | RF-23, RF-24 |

## Decisiones, y lo que se descartó

- **El buzón del piloto es una feature de la app, no el 5B.2 del ERP.** El 5B.2 no tiene código y su
  pila técnica está bloqueada (D-03). Además, su diseño choca con la spec en tres puntos:
  - consulta el estatus en el SAT (choca con el RF-7);
  - genera pólizas automáticas por reglas (choca con el RF-16);
  - su bitácora registra quién hizo cada operación (choca con el RF-21).

  Lo que el piloto aprenda vuelve al 5B.2 como insumo. Esta spec **no cambia el ERP**.
- **El piloto no contabiliza: confirma y exporta.** Contabilizar ocurre en el sistema del despacho, con
  el archivo de los CFDI confirmados. El RF-16 se cumple porque nada llega a ese archivo sin
  confirmación, y la confirmación es **por CFDI**: no hay «confirmar todos».
- **Todo corre en la máquina del despacho.** La app, un Supabase autohospedado (imágenes pineadas por
  digest) y el servicio del extractor. `EXTRACTOR_RESPALDO` queda apagado, y `configura:deploy` lo
  comprueba. Descartado:
  - **el Supabase gestionado**, porque saca los datos del despacho y no tiene región en México (la misma
    D10 de Soporte SAP);
  - **un Postgres sin Supabase**, porque la seguridad del extractor se apoya en `auth.uid()` y habría que
    reescribirla.
- **El folio fiscal único y el receptor igual a la pyme se comprueban al entrar al buzón.** Usan los
  identificadores exactos que ya devuelve `leeCfdi40`. El núcleo del extractor no cambia: su detección
  de duplicados por contenido sigue igual.
- **La lista 69-B es un archivo público fechado que el operador importa.** No hay descarga automática,
  porque la red de los documentos no tiene salida. Se guarda la fuente y la fecha de la lista, y el tipo
  de la bandera no tiene campo de veredicto, como el `veredicto: null` del grafo.
- **El registro de tiempo es propio y sin columna de persona.** Las trayectorias no sirven: no llevan
  cliente por diseño y la ruta de Tesseract no registra nada. El formulario pide pyme, mes y horas, nada
  más. Las horas del mes previo se cargan igual.
- **La pyme va bajo seudónimo.** Es aleatorio por piloto, y la tabla de correspondencia vive solo en el
  despacho y se borra al cierre. Una prueba rechaza cualquier valor con forma de RFC o UUID en el archivo
  de cifras, igual que hace el verificador de trayectorias.
- **El borrado sigue los patrones existentes**: el retiro del reel y las lápidas de `supresion.ts`. Se
  borra el contenido y queda constancia, sin datos, de que existió.
- **Sin umbrales de confianza.** Rige el RF-11. El piloto **mide** la correlación entre confianza y
  error sobre el corpus real (spec 010, RF-9) **dentro del despacho**; solo sale la cifra. Ese corpus no
  se lo queda el laboratorio, así que el piloto no cierra el RF-24 de la spec 010.

## Modelo de amenazas (C3)

**Activos.** Los CFDI y lo leído de ellos (datos de pymes y proveedores); las cuentas del despacho; el
archivo de confirmados, que entra a su contabilidad; el archivo de cifras para el laboratorio.

**Fronteras.**
- navegador del despacho ↔ app, en su red o su VPS;
- app ↔ servicio del extractor, en la red `interna`, sin salida;
- despacho → laboratorio: solo el archivo de cifras;
- importación de la lista 69-B: entra, no sale.

| Atacante | Cómo muerde aquí | Control |
|---|---|---|
| O2 · Contraparte deshonesta | Un CFDI falso, o un PDF que no corresponde a su XML | El piloto no autentica (RF-15): manda el XML, y la discrepancia va a revisión (RF-14); nada se confirma sin una persona |
| O1 · Entrada maliciosa | Un documento con texto que intenta mover a quien lo lee | En el camino no hay ningún modelo de lenguaje: el lector de XML es determinista y Tesseract no ejecuta nada; los campos se validan por esquema |
| O3 · Fatiga de aprobación | El contador confirma en lote sin mirar | La confirmación es por CFDI, sin «confirmar todos», y un campo en revisión la bloquea (RF-17) |
| Fuga hacia el laboratorio | El archivo de cifras arrastra un RFC, un nombre o un folio | Seudónimo y prueba anti-fuga en la exportación (RF-8) |
| O5 · Cadena de suministro | Una imagen de Supabase o del extractor cambiada | Las imágenes van pineadas por digest; cambiar el pineo es un CDC |
| Exposición | La app queda abierta a internet desde el VPS del despacho | Se publica solo en su red o detrás de Caddy con sesión; ningún puente A2A queda expuesto (spec 010, RF-20) |

Un solo despacho es una sola organización: el RLS separa por organización, ninguna superficie usa
`service_role` (C7), y la persona del despacho ve a todas sus pymes, que es lo correcto.

## Cobertura de los criterios de finalización

| Criterio | Cómo se cumple |
|---|---|
| Todos los RF con prueba en verde sobre corpus sintético | Las pruebas de la feature en un gate nuevo, `prueba:buzon` |
| Demo del flujo completo | Recorrido con Playwright: consentimiento → lectura → revisión → confirmación → cierre → borrado |
| Acuerdo, consentimiento, AISIA y C3 antes del primer documento real | Checkpoint humano en las tareas. El C3 es este plan; la AISIA, `plantillas/aisia.md` |
| Cifras, constancias y contrato al cierre | Fase final de las tareas |

## Gates y riesgos

- **El gate nuevo `prueba:buzon` es un CDC (C1)**, porque cambia el padrón de `.claude/gates.json`. Va
  con su entrada de bitácora y la firma del laboratorio.
- **Inventario**: el activo nuevo es la feature del buzón, cuyo dueño es el Extractor documental. Una
  unidad nueva pide `npm run inventario:vista`.
- **Riesgo · el peso del Supabase autohospedado** en la máquina de un despacho pequeño. `configura:deploy`
  mide la RAM real antes de prometer nada.
- **Riesgo · la duda 1** (el proceso manual en doble) invalida la medición si no se resuelve antes del mes
  previo.
- **Riesgo · el despacho no tiene máquina** (duda 5): el piloto no arranca hasta resolverlo.

## Las dudas abiertas de la spec, en el plan

| Duda | Qué hace el plan mientras sigue abierta |
|---|---|
| 1 · ¿El manual corre duplicado? | El checkpoint humano la exige resuelta antes del mes previo |
| 2 · ¿En qué plazo se borra? | El borrado es inmediato al pedirlo; el plazo solo cambiaría el aviso |
| 3 · ¿Basta una pyme? | La exportación lleva el número de pymes con los dos meses completos; el umbral lo pone el laboratorio |
| 4 · ¿Qué contrato recibe la cifra? | El del extractor seguro; el del ERP no tiene el campo, y añadirlo es decisión del laboratorio |
| 5 · ¿Qué pone el despacho? | `configura:deploy` dice si su máquina alcanza; sin máquina, el piloto no arranca |

## Aprendizajes

### 2026-10-07: `: ` dentro de un mensaje de `${VAR:?...}` rompe el YAML del compose
- **Error**: `${POSTGRES_PASSWORD:?falta POSTGRES_PASSWORD: corre ...}` no es YAML válido: el segundo `: ` abre un
  mapa. Lo cazó `prueba:buzon` al leer el compose. Docker tampoco lo habría aceptado.
- **Fix**: el mensaje va sin `: `, con paréntesis: `(corre scripts/despacho/llaves.mjs)`.
- **Aplicar en**: todo mensaje de variable obligatoria en un compose.

### 2026-10-07: el `roles.sql` oficial de Supabase corta la inicialización si falta un servicio
- **Error**: el `roles.sql` oficial cambia la contraseña de `supabase_functions_admin`, un rol que crea
  `webhooks.sql`. Sin ese script, el `ALTER` fallaba y cortaba el resto: storage se quedaba sin su contraseña
  (`28P01`) y las migraciones de la imagen no corrían. Por eso auth fallaba con «must be owner of function uid».
- **Fix**: `despacho/db/roles.sql` no lleva esa línea, y su cabecera dice por qué.
- **Aplicar en**: todo Supabase autohospedado recortado. Al quitar un servicio, se quita también lo que sus
  scripts de inicio dan por hecho.

### 2026-10-07: un identificador inválido desaparecía en silencio del buzón
- **Error**: el extractor no devuelve como campo un RFC que no pasa el dígito verificador: lo lista en
  `identificadoresInvalidos`. El buzón ignoraba esa lista, y el RFC del emisor se perdía sin aviso. Eso dejaba
  vacía la columna del CSV y habría dejado sin bandera 69-B al proveedor. Lo destapó el recorrido en el navegador,
  no las pruebas unitarias: su fixture no traía identificadores inválidos.
- **Fix**: `clasifica` mete cada identificador inválido como campo marcado para revisión, con lo leído y un aviso.
  Prueba nueva en `prueba:buzon`.
- **Aplicar en**: todo consumidor del extractor. Lo que el servicio separa en `identificadoresInvalidos` se lee
  también.

### 2026-10-07: Next 16 corta a 10 MB, sin error, el cuerpo de lo que pasa por `proxy.ts`
- **Error**: `proxyClientMaxBodySize` vale 10 MB por defecto y el cuerpo se trunca SIN fallar. Un CFDI puede pesar
  20 MB (el límite del extractor).
- **Fix**: `/api/buzon` no está en el matcher de `src/proxy.ts`, y cada ruta comprueba sesión, origen y pertenencia
  (`services/servidor/ruta.ts`).
- **Aplicar en**: toda ruta que reciba archivos de más de 10 MB.

