# PRP-012: D8, retención y salida de los datos (Soporte SAP)

> **Estado**: **APROBADO** (2026-10-10) por el laboratorio, con las recomendaciones de DP-1 a DP-4.
> **Decisión de origen**: D8, decidida por el laboratorio el 2026-10-10 en sesión:
> - **en vigencia**, los documentos originales se borran **N días después de resolver** la incidencia. La
>   incidencia, su cadena de eventos y los campos revisados viven lo que dure el contrato;
> - **al salir**, export firmado de quien se va y **borrado tras un periodo de gracia**. El sandbox anonimizado y el
>   núcleo se quedan (DP-1 del PRP-011);
> - **en los respaldos inmutables**, el borrado llega **cuando vence su bloqueo**, y una restauración nunca resucita
>   lo borrado (lista de bajas, como el reel en #206).
>
> **Proyecto**: Soporte SAP (`productos/soporte-sap.json`).
> **CDC aplicable**: no cambian skills, prompts, `gates.json` ni el modelo. Si el manifiesto necesita un campo que la
> plantilla de producto no tiene, eso **sí** es CDC (la plantilla está bajo C1): la fase 2 lo comprueba antes de
> tocarla. Cambia la **AISIA firmada**: la revisión la firma el laboratorio al final, como en D1.

## Objetivo

Que los datos de un cliente no vivan más de lo que el contrato dice, y que el borrado llegue a todas partes: la base,
Storage y las copias de respaldo. Hoy no hay retención: los documentos se quedan para siempre, el rol de plataforma
tiene el privilegio de borrar y ningún job lo usa (C3, fila `c3-plataforma-retencion`, «depende de D8»).

## Por qué

- **Es infirmable**: los documentos traen datos de empleados del N3 (nómina, RFC, CURP) que no firmaron nada.
  Guardarlos años sin necesidad agranda el daño de cualquier fuga.
- **Es portabilidad (ERP-6)**: quien se va se lleva sus datos, y lo que queda se borra.
- **Es honestidad del contrato**: hoy diría «se borra al salir» y una copia anual lo guardaría 7 años.

## Qué

### Criterios de éxito

- [ ] El original de una incidencia resuelta se borra de Storage N días después de `resuelta_en`, **no antes**, y
      nunca con una impugnación abierta. Su fila de metadatos y los campos revisados se quedan, marcados «original
      borrado».
- [ ] Una salida la registra **una persona** (DP-2), con la fecha que pone la base. El export firmado de quien se va
      existe antes de borrar. Antes de que termine la gracia, la base no deja borrar nada de ese tenant.
- [ ] Tras la gracia, del tenant no queda nada en la base ni en Storage, salvo la lista de bajas (sin datos
      personales), el sandbox anonimizado, el núcleo y las métricas agregadas.
- [ ] Una restauración, por tenant o de la base entera, **no resucita** un tenant ni un original dados de baja. La
      lista de bajas viaja a todos los niveles de respaldo, y se aplica la más reciente.
- [ ] El contrato dice N, la gracia y el **plazo máximo** en que el borrado llega a las copias (DP-1). El perfil de
      despliegue rechaza un bloqueo de respaldo mayor que ese plazo.
- [ ] La matriz: cada frase nueva con su fila, que pasa sin sabotaje y cae con él. `c3-plataforma-retencion` pasa a
      «probado».
- [ ] La revisión de la AISIA, firmada por el laboratorio; `validate` en verde después del último commit; el
      recorrido, con un original que vence y una salida con su gracia.

### Decisiones del laboratorio (recomendación primero)

| Id | Pregunta | Recomendación | Alternativa |
|---|---|---|---|
| DP-1 | Los respaldos del servidor guardan copias **anuales 7 años** (FASE0 §9.3). ¿En cuánto llega el borrado a todas las copias? | **Soporte SAP no entra al archivo anual**: el plazo máximo es el del archivo mensual (12 meses más su bloqueo), y el contrato lo dice. El archivo anual es la retención legal de **la casa**, no de datos de terceros | Mantener los 7 años y que el contrato diga «hasta 7 años» |
| DP-2 | ¿Quién registra una salida? | **Una persona**: la de un cliente, su consultora a su nombre o el propio cliente; la de una consultora, el superadministrador. Ni el agente ni un rol de servicio | Solo el superadministrador, a petición |
| DP-3 | ¿Desde cuándo cuentan los N días? | **Desde `resuelta_en`**, y el plazo **no corre** mientras haya una impugnación abierta de esa incidencia: el original es la evidencia de la queja | Desde el cierre (`cerrada_en`) |
| DP-4 | ¿Dónde viven N y la gracia? | **En el contrato N2–N3** (`ss_contrato_sla.contenido`, versionado). Sin plazo declarado **no se borra nada**, y el job lo dice; los valores, con asesoría legal | Un valor fijo del producto para todos |

### Comportamiento esperado

1. Una incidencia se resuelve. Su original muestra «se borra el AAAA-MM-DD (contrato §14)».
2. Pasan N días sin una impugnación abierta. El job de retención (dry-run por defecto) lista lo que vence y por qué.
   Con `--ejecutar`, el rol de plataforma borra los bytes, y la base solo se lo deja hacer con lo vencido.
3. Un cliente deja a su consultora. Una persona registra la salida; se genera su export firmado, y el cliente lo
   descarga. La pantalla dice cuándo termina la gracia.
4. Termina la gracia. El job borra el tenant de la base y de Storage, y agrega la baja a la lista.
5. Meses después se restaura un respaldo viejo. El paso «tras restaurar» aplica la lista de bajas más reciente, y
   lo dado de baja no vuelve.

## Contexto

### Lo que ya existe

- `exportaTenant` / `restauraTenant` / `verificaRestauracion` (`tools/soporte-sap/src/respaldo.ts`, PRP-010 H-08):
  export firmado **por consultora**. El export **por cliente** no existe.
- `ss_adjunto` guarda los metadatos del original (sha256, ruta por tenant). `ss_campo_extraido` cuelga de él con
  `on delete cascade`: **borrar la fila del adjunto borra los campos**. Por eso se borran los bytes y se marca la
  fila; la fila no se borra.
- `soporte_sap_plataforma` tiene `select, delete` sobre las tablas del tenant, acotado por su token de tarea, sin
  `insert`. Le falta un `update` acotado para marcar «original borrado».
- `ss_incidencia.resuelta_en` y `ss_impugnacion.estado = 'abierta'` existen.
- El perfil de despliegue (`scripts/despliegue/perfil.mjs`) exige `RESPALDO_S3_BLOQUEO_DIAS ≥ 1`. No tiene tope.
- El reel resolvió lo mismo: los retiros sobreviven a una restauración (`reel:tras-restaurar`, #206).

### Modelo de datos (propuesta SQL, no se aplica a ninguna base)

- `ss_baja`:
  - quién se va: `consultora_id`, `cliente_id` nullable (null = la consultora entera);
  - quién la registra, con la hora de la base (`registrada_por`, `registrada_en`);
  - `borrar_desde`, que calcula la base (registro más gracia del contrato vigente);
  - `export_sha256` y `borrada_en`.
- `ss_adjunto.original_borrado_en`: lo pone la base al borrar los bytes.
- `ss_priv.original_vencido(adjunto)` y `ss_priv.baja_vencida(consultora, cliente)`. Las políticas de borrado del rol
  de plataforma (filas y `storage.objects`) las exigen.
- **La lista de bajas** es tenant, fecha y huellas de los originales borrados, sin datos personales. Se exporta como
  archivo aparte a todos los niveles de respaldo.

### Referencias

- Spec, D8: `docs/goals/soporte-sap.md`. Retención por defecto: SDD §12; respaldo: SDD §13 y FASE0 §9.
- C3 v4 (PRP-008), «Jobs de plataforma». AISIA firmada, §4 «Restauración» («La retención no existe todavía (D8)»).
- Contrato N2–N3: `tools/soporte-sap/contratos/plantilla-contrato-sla.md` §14.

## Gobernanza

### Modelo de amenazas (C3) de este PRP

- **Activos**: los originales (evidencia y datos personales); la cadena (evidencia del SLA); la lista de bajas.
- **Atacantes**:
  - O2: una consultora que registra la salida de su cliente para borrar la evidencia de una disputa;
  - O6: el job de plataforma comprometido, que borra antes de tiempo o a otro tenant;
  - quien restaura un respaldo viejo y, sin querer, resucita lo borrado.
- **Controles**:
  - la base solo deja borrar lo vencido, con su gracia y su export;
  - una impugnación abierta frena el plazo;
  - el cliente recibe su propio export antes de que se borre nada;
  - el token de tarea acota a una consultora;
  - la restauración aplica la lista de bajas.
- **Brecha**: una copia inmutable no se puede borrar antes de que venza su bloqueo. El contrato lo dice (DP-1).

### AISIA (C4) de este PRP

- **Partes**: los empleados del N3 (sus datos en los documentos), el N3 (su evidencia y su portabilidad), la
  consultora (su evidencia ante una disputa).
- **Daños sin atacante**:
  - borrar un original que todavía hacía falta (lo mitigan DP-3 y la gracia);
  - creer que se borró algo que sigue en un respaldo (lo mitigan DP-1 y el contrato).
- **Reversibilidad**: el borrado no se revierte; por eso hay plazo, gracia, export y dry-run.
- **Decisión**: mitigar.

## Blueprint

### Fase 1: La base
`ss_baja`, `original_borrado_en`, las funciones de vencimiento y las políticas de borrado del rol de plataforma
(filas y Storage). Las pruebas intentan cada atacante de arriba (y su control positivo), y cada una tiene su fila en
la matriz.

### Fase 2: El job, el export por cliente y la restauración
- `src/retencion.ts`: el plan puro de qué vence y por qué.
- `clis/ss-retencion.mjs`: dry-run por defecto.
- `exportaCliente`.
- La lista de bajas como archivo, y el paso «tras restaurar» que la aplica.
- El perfil de despliegue: rechaza un bloqueo de respaldo mayor que el plazo máximo del contrato (DP-1). Antes de
  tocar el manifiesto, se comprueba si hace falta un campo nuevo en la plantilla (CDC).

### Fase 3: La app y el contrato
- La fecha de vencimiento de cada original.
- Registrar una salida, con su export y su gracia.
- El §14 del contrato: N, gracia y plazo máximo en respaldo.
- Pruebas que ejecutan el runtime, y un paso del recorrido.

### Fase 4: La AISIA y la firma
- La revisión de la AISIA y del C3.
- La matriz entera, el `validate` y el kit de una línea para que el laboratorio firme.

## Gotchas

- **`on delete cascade` en `ss_campo_extraido`**: borrar la fila del adjunto borra los campos revisados, que D8 dice
  que se quedan. Se borran los bytes; la fila se marca.
- **La lista de bajas no puede vivir solo en la base que se restaura**: si se restaura una base vieja, la lista
  también vuelve atrás. Viaja aparte, y se aplica la más reciente.
- **Borrar es irreversible**: el job va en dry-run por defecto, y la salida la decide una persona. El plazo de los
  originales lo decide el contrato firmado, no el job.
- **Una prueba de retención se escribe contra el ataque que hoy funciona**: hoy la plataforma borra cualquier cosa de
  su consultora en cualquier momento, así que esa prueba tiene que caer antes de construir la regla.

## Notas de ejecución

### Fase 1 (base), en `main` por #251
- **Hallazgo**: `ss_exportes_plataforma` era `for all` sobre exportes **y originales**. La plataforma borraba un
  original en cualquier momento, y ninguna prueba lo intentaba. Lo destapó la prueba escrita contra ese ataque; ahora la
  plataforma solo sube su export.
- **Brecha declarada**: el crudo de importación y su procedencia son de la consultora y no tienen cliente. Los tickets
  crudos de un cliente que se va se quedan hasta que se va su consultora.

### Fase 2 (job, export por cliente y restauración)
- **Registrar la salida congela el tenant.** Si después siguiera entrando actividad, el export quedaría viejo; y un
  export final hecho al terminar la gracia se borraría con el tenant. Por eso, desde el registro, nada suyo se escribe
  ni cambia (`ss_priv.congelado_por_baja`), su export es el último, y la gracia sirve para descargarlo y discutir con él
  en la mano. El job del SLA omite al tenant congelado y dice por qué.
- **N y la gracia viven en el `ContratoSla`** (`retencionOriginalesDias`, `graciaSalidaDias`), como los demás números
  legales: `{ valor, quienDecide }`, y `valor` null es «por decidir» (DP-4). En la fase 1 iban en snake_case fuera del
  tipo; el job del SLA lee el contrato con ese tipo, así que pasan a él.
- **La restauración por tenant exige la lista de bajas** y la aplica antes del commit, después de verificar que el
  export entró entero. `trasRestaurar` hace lo mismo tras restaurar la base entera, con filas y bytes.
- **Depende**: quien lleva la lista a los niveles de respaldo es el job de respaldo del servidor, que todavía no
  existe en el repo (D10, D12, GATE 3).
- **DP-1 pasa a la fase 3.** El tope del bloqueo de respaldo necesita un campo en la plantilla de producto, que está
  bajo CDC, y va junto con la cláusula del contrato que declara el plazo máximo.

### Fase 3 (la app, el contrato y el tope del respaldo)
- **CDC de la plantilla v4** (`retencion`): Soporte SAP declara D8 con un tope de 365 días y fuera del archivo legal, y
  el vendedor la declara en null porque su P-07 sigue abierta. `configura:deploy` rechaza un bloqueo mayor que el tope;
  con Soporte SAP, el de 2555 días que FASE0 §9.4 pone por defecto ya no pasa. Se adelanta a B-6, que pedía esperar
  al siguiente manifiesto: sin el campo, el tope viviría en el código del perfil. La firma es del laboratorio.
- **Las reglas de los plazos viven una sola vez** (`src/vencimiento.ts`): el job y la pantalla usan las mismas
  (`estadoDeBaja`, `vencimientoDeOriginal`), y son las de la base.
- **La app no inventa cifras legales**: los contratos del laboratorio siguen sin N ni gracia (DP-4), así que en la
  pantalla nada vence y la salida queda «sin gracia: no se borra nada». La regla con N se prueba sobre la misma
  función, y la base con sus plazos en `pruebas/retencion*.ts`.
- **La salida en la app** (`services/salida.ts`): la registran el cliente o su consultora, nunca el laboratorio. Desde
  ese momento el cliente queda congelado: no levanta, nadie atiende ni impugna lo suyo, su reloj se detiene y la
  pantalla esconde los botones. El export se descarga por la ruta (`?export=`), solo él y su consultora; el
  laboratorio ve la baja, no el export. En el laboratorio el export lleva su huella sha256; el firmado con
  `SS_SECRETO_RESPALDOS` es el de la base (`exportaCliente`).
- **La salida de una consultora entera** está en la base (la registra el superadministrador), no en la pantalla del
  laboratorio.
- **`clis/ss-retencion.mjs` no se construye todavía**: no hay base contra la que correr el job en dry-run, y un
  simulacro repetiría `pruebas/retencion.ts`. Llega con el job de respaldo del servidor (la fila «depende»: D10,
  D12, GATE 3).
- **Para la fase 4**: el BUSINESS_LOGIC de la app dice «Acciones irreversibles: ninguna automática», y el job de
  retención borra solo. Borra únicamente lo que el contrato firmado dice y la base deja (lo vencido), y con dry-run;
  la revisión de la AISIA lo tiene que decir, junto con el daño nuevo (un dato que vive más de lo que dice el
  contrato, o que vuelve con una restauración).

### Fase 4 (la AISIA y la firma)
- **Revisión 5 de la AISIA** (borrador en `docs/goals/soporte-sap-AISIA-revision-d8.md`, lo firma y lo mueve el
  laboratorio): entra el daño «Dato que vive de más o que vuelve» (§2 y §3). La §4 gana «Retención y salida», y la
  restauración ya no dice «la retención no existe». La §5 tiene una fila infirmable nueva, y en la lista de salida
  D8 queda decidida, con N y la gracia por fijar (DP-4) y el job de respaldo del servidor.
- **La AISIA dice que el job de retención borra solo**: es la única acción irreversible sin una persona en el
  momento. La base acota lo que borra (solo lo vencido); el contrato firmado fija el cuándo, y una persona registra
  la salida. El BUSINESS_LOGIC de la app deja de decir «ninguna automática».
- **El C3** (PRP-008): la plataforma borra solo lo vencido; la salida es un acto de una persona; el perfil compara
  el bloqueo con el tope de la plantilla v4.
- **8 filas nuevas** del daño nuevo: 6 probadas, 1 brecha (el crudo) y 1 depende (el job en un servidor).

## Aprendizajes

### 2026-10-10: `node --test` no comprueba los tipos
- **Error**: una prueba pasaba con `node --test` y el `validate` cayó en `typecheck` (un parámetro con el tipo literal
  de `ORG.CA`).
- **Fix**: anotar el tipo, y correr `npx tsc --noEmit` antes de la matriz entera, no solo el `validate` al final.
- **Aplicar en**: toda prueba de `tools/`: Node quita los tipos sin comprobarlos.

### 2026-10-11: el arnés solo sabotea lo que está en un commit
- **Error**: la fila nueva de `perfil.mjs` dio «no se pudo sembrar: tiene cambios sin commit».
- **Fix**: hacer commit en la rama antes de correr `--fila`. En un CDC, el commit local va antes de la firma, y la
  firma antes del PR.
- **Aplicar en**: toda fila nueva de la matriz.

### 2026-10-11: un 400 esperado es un error de consola para el recorrido
- **Error**: el paso que comprueba el rechazo de un cliente congelado dejó el recorrido en rojo por el 400 que provoca.
- **Fix**: apartar ese error, y solo ese, alrededor del paso, y comprobar que hubo exactamente uno.
- **Aplicar en**: todo paso del recorrido que pruebe un rechazo.
