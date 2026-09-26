# Expediente de lote con cadena de hashes y agente de riesgo — Spec

> Compilado con `/goal-compiler` el 2026-09-26. Forma: **LOOP** (núcleo, agente, pantallas e
> integración comparten una línea de meta; test de colapso: juntos en un agente no se pierde nada).
> Se construye ENCIMA del sistema de etiquetas GS1-128 de la rama `etiquetas-gs1`
> (`tools/etiquetas-gs1/`, `/etiquetas/*`, `docs/SDD-etiquetas-gs1.md`): no es un sistema paralelo.
> Decisiones por defecto tomadas al compilar (el laboratorio puede cambiarlas): extender lo que ya
> existe; ventas ficticias detrás de un adaptador; raíces diarias ancladas en un «central» local
> más propuesta de tabla en el ERP; regla de 2/3 cuando se conoce la vida útil, mínimo absoluto si no.

## MISION

Cuando termines, cada lote de la cadena (CEDIS y sucursales) tiene un **expediente**: la historia
completa desde que entra hasta que sale, **evidente ante manipulación**, y un agente que lo vigila
por **riesgo**, no solo por fecha. Quien audite puede demostrar, sin confiar en nadie de la
sucursal, que nadie reescribió una caducidad, una recepción ni una merma.

1. **Cadena de eventos por hash (tamper-evident, no blockchain).** Cada evento (RECIBIDO,
   RECHAZADO, UBICADO, MOVIDO, TRANSFERIDO, VENDIDO, DEVUELTO, DONADO, MERMA, RECOMENDACION,
   RECOMENDACION_EJECUTADA/DESCARTADA, CORRECCION) se agrega a un registro **solo-agregar** por
   sitio, con número de secuencia y `hash_anterior`. El hash es SHA-256 sobre el **registro
   completo canonicalizado** (RFC 8785 JCS): lote, evento, datos, operador, fecha, secuencia,
   sitio y hash anterior. Hashear solo `datos + hash_anterior` dejaría alterar operador o fecha sin
   romper nada: eso no se acepta. El expediente de un lote es una vista (índice por lote) de la
   cadena del sitio, con enlace de cada evento al anterior del mismo lote.
2. **Nada se edita.** Un error se corrige con un evento CORRECCION que referencia al evento
   corregido. El estado (existencias, zonas, semáforo) es una **proyección** que se puede
   reconstruir desde la cadena; si el estado guardado no coincide con la reconstrucción, es
   manipulación y se dice dónde.
3. **Anclaje, que es lo que la hace real.** Una cadena sola no detiene a quien tiene acceso de
   escritura y la recalcula entera. Cada sitio calcula cada noche (y opcionalmente cada hora) la
   **raíz de Merkle** de sus eventos del periodo (RFC 6962: prefijo 0x00 en hojas y 0x01 en nodos),
   la **firma** con una llave del sitio (Ed25519) y la envía al central, que la guarda donde la
   sucursal no puede escribir. El central verifica: raíz recalculada = raíz anclada, firma válida,
   continuidad con la raíz anterior. Con **pruebas de inclusión** se demuestra que un evento de un
   lote estaba en la raíz de su día sin revelar el resto.
4. **Reglas por categoría.** Vida mínima al recibir con la **regla de 2/3** (con vida útil de 90
   días debe llegar con al menos 60) cuando el catálogo trae la vida útil; si no, el mínimo absoluto
   de la categoría. Semáforo de cinco estados configurable: verde, amarillo, naranja, rojo y
   vencido, cada uno con su **acción**: amarillo = prioridad de surtido y transferencia sugerida a
   la sucursal que más lo vende; naranja = promoción y exhibición especial identificada; rojo =
   separación y bloqueo para venta normal (solo liquidación, donación o merma); vencido = merma.
   Los umbrales por defecto se marcan como ejemplo.
5. **Flujo del lote.** Recepción por lectura GS1-128 (o captura de lote y caducidad): si no cumple
   la vida mínima queda RECHAZADO, se genera la **devolución al proveedor con evidencia** (datos
   leídos, regla aplicada, hash del evento) y la cadena del lote se cierra. Si cumple, se almacena
   con **ubicación rack-nivel-posición** (extensión de las zonas actuales; la etiqueta de ubicación
   sigue siendo (414)+(254)). Surtido FEFO. Salidas: venta, transferencia (enlaza la cadena de
   origen con la de destino por hash), devolución, donación o merma.
6. **El agente de riesgo (determinista).** Cada día calcula por lote y sitio *días de inventario =
   existencia ÷ venta promedio diaria* y lo compara con los días que le quedan. Si no se venderá a
   tiempo aunque esté en verde, lo detecta con semanas de anticipación y recomienda: transferir a la
   sucursal que más vende, promoción escalonada o exhibición. Cada recomendación, y si se ejecutó o
   se descartó (y por quién), entra a la cadena. Antes de cada acción verifica la integridad de la
   cadena del sitio; si está rota, no actúa y abre un incidente.
7. **Pantallas** (en la app existente): expediente de lote (línea de tiempo con hashes y veredicto
   de integridad), recepción con rechazo 2/3 y devolución, semáforo con acción por color, alertas
   del agente por riesgo con ejecutar/descartar, y tablero de integridad por sucursal (raíces del
   día ancladas y verificadas).

Horizonte: una cadena de un CEDIS y tres sucursales opera un mes con este sistema y, ante una
auditoría o una disputa con un proveedor, entrega el expediente de cualquier lote con su prueba
criptográfica, y el agente evitó mermas avisando a tiempo.

## LIBERTAD TECNICA

Tú eliges arquitectura, cómo se reparte entre núcleo, agente y app, el formato de las pruebas de
inclusión, cómo se programa el cálculo diario y el almacén del central. Sugerencias descartables:
la cadena y el Merkle en el núcleo sin dependencias (`tools/etiquetas-gs1`, almacén inyectado);
el firmado y el envío nocturno en el agente local de cada sitio; el central como adaptador. Salvo
RESTRICCIONES, nada aquí es receta.

## INVESTIGA ANTES DE CONSTRUIR

- RFC 8785 (JSON Canonicalization Scheme), RFC 6962 (Certificate Transparency: árboles de Merkle,
  pruebas de inclusión y de consistencia) y cómo lo usan Trillian o Sigstore Rekor.
- Registros tamper-evident en sistemas de trazabilidad alimentaria (GS1 EPCIS 2.0: eventos,
  `eventID` con hash) y cómo modelan transferencias entre sitios.
- Regla de vida mínima de recepción (2/3, 1/3) en retail de alimentos y cómo la aplican 2 WMS.
- Reafirma el objetivo en una línea antes de cada edición grande.

## DEFINICION DE HECHO (evidencia visible en la conversación)

- **Pruebas en verde, pegadas**: encadenado y verificación; alterar la caducidad de un evento
  viejo rompe la verificación **en esa secuencia exacta**; reordenar campos no cambia el hash;
  recalcular toda la cadena de una sucursal la deja «válida» localmente pero **el anclaje la
  delata**; borrar el último evento antes del anclaje se detecta al día siguiente (continuidad);
  raíz de Merkle con vectores de RFC 6962 y pruebas de inclusión; firma Ed25519 verificada y
  firma ajena rechazada; CORRECCION en lugar de edición; proyección reconstruida = estado guardado;
  regla 2/3; semáforo de cinco estados con acción; agente que marca un lote verde en riesgo con
  semanas de anticipación; transferencia enlazada entre dos sitios.
- **Demostración de manipulación**: se pega el antes y el después de alterar un registro en el
  almacén (y de reescribir una sucursal entera) con el veredicto del verificador.
- **Playwright** (escritorio y celular), capturas pegadas de: expediente de un lote con su
  cadena y veredicto ✓; recepción rechazada por 2/3 con su devolución; semáforo con acciones;
  alertas del agente por riesgo (una ejecutada y una descartada); tablero de integridad con una
  sucursal ✓ y otra ✗ tras la manipulación.
- **Integración ERP** como propuesta: tablas de eventos (solo-agregar, con validación de
  encadenado al insertar) y de raíces ancladas, validadas en Postgres efímero junto a
  `erp/migrations` y la propuesta de etiquetas existente; **no se aplican**.
- Último output del comando de validación, en verde.
- Reporte de decisiones y cómo se instala en un sitio (llave del sitio, central, horario).
- Lista de formas en que esto podría estar mal o incompleto, y cómo se resolvió cada una.

## COMANDO DE VALIDACION

`npm run validate` (el gate completo, ya incluye `prueba:etiquetas`) y, tras el build,
`npm run capturas:etiquetas`. Córrelos tras cada cambio grande y pega el output.

## RESTRICCIONES REALES

- **Extiende lo que existe** (`tools/etiquetas-gs1`, `/etiquetas/*`, sus pruebas y capturas); no un
  segundo sistema. Rama propia desde `etiquetas-gs1` (aún sin mergear), sin merge.
- **Sin blockchain ni servicios externos.** SHA-256 y Ed25519 de la plataforma. Las llaves de sitio
  llegan por variable de entorno y **nunca se imprimen** (presencia, largo, a lo sumo 4 caracteres).
- **La cadena no guarda datos personales**: operador por identificador seudónimo; el mapeo a
  personas vive aparte y se puede borrar (lo inmutable no puede contener lo que alguien tenga
  derecho a cancelar).
- **Solo datos ficticios** (prefijo 952). **Ventas ficticias detrás de un adaptador**; leer ventas
  reales del ERP (solo lectura) es una propuesta con gate humano. La BD compartida no se toca.
- **El agente es determinista**; si se usa un modelo de lenguaje para redactar, pasa por
  `.claude/routing-modelos.json` (C8) y la contabilidad de tokens.
- **Nada decide sobre terceros sin humano**: el agente recomienda; donar o liquidar lo decide una
  persona, y el bloqueo de venta vive en el sistema (la caja registradora no lee lote en EAN-13).
- No toques skills, prompts, `settings.json`, `.mcp.json` ni `AGENTS.md` (sería CDC, C1).
