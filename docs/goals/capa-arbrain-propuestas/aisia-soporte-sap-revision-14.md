# Nota para la revisión 14 de la AISIA de Soporte SAP — PROPUESTA, sin firma

> **Al día (2026-10-26):** la **parte 1** (la conversación de la mesa, sin modelo) ya está redactada dentro de la AISIA,
> en el borrador `docs/goals/soporte-sap-AISIA-revision-14.md`, con cinco filas nuevas en la matriz, todas probadas. Al
> firmarse, ese borrador reemplaza a `.claude/gobernanza/AISIA-soporte-sap.md`. Lo que sigue en esta nota como
> propuesta es la **parte 2** (la lectura de solo conteos hacia el cerebro personal): se firma antes de encenderla, con
> el VPS decidido.

> Fecha: 2026-10-25 · Goal `docs/goals/capa-arbrain.md` (nodo `mesa`, arista `e-gob-mesa`) · Registro al que iría:
> `.claude/gobernanza/AISIA-soporte-sap.md`. **Propuesta, no registro**: la firma la escribe el laboratorio, y al
> firmarse se pega allá como «Revisión 14» y se borra esta nota.
>
> **Qué abre firmarla y qué no.** La revisión 14 cubre dos cosas distintas, y conviene firmarlas por separado si el
> laboratorio quiere:
> 1. **La ranura de conversación de la mesa** (construida y probada en local en este goal). No cambia qué sale ni
>    adónde: puede firmarse junto con el CDC de la capa, antes de desplegar la mesa con ella.
> 2. **La lectura de solo conteos de la mesa hacia el cerebro personal** (FUERA DEL HECHO §2). NO está construida para
>    la mesa: hoy solo la tiene el producto sintético Recepción, y la mesa no está en la lista de productos que el
>    job acepta (`infra/cerebro-personal/job/resumenes-permitidos.json`). Esta parte se firma antes de encenderla, no
>    antes de mergear.

## Resumen para el encabezado de la AISIA

> **Revisión 14** (2026-10-25, propuesta): **la mesa dentro de la capa común y su conversación**. La mesa del experto
> se monta en la capa común de la fábrica (la misma ventana que los demás productos) con la marca y el asistente de
> Soporte SAP, y gana una ranura de conversación que resuelve SIN modelo, con el enrutador de intención de la capa: «prueba
> este caso», «¿por qué dijiste no lo sé en el paso N?» y «muéstrame lo que te enseñé». La conversación usa la memoria de
> la mesa, por identidad del experto; no se guarda en el navegador, y lo que se guarda va solo al almacén de la mesa. El
> experto no habla con ningún asistente personal del laboratorio. La mesa no lleva voz: su contenedor (1 GiB) no cabe
> el reconocimiento local, y el del navegador cuenta como nube. Además, se define (sin encender) la **lectura de solo
> conteos** que un día llevaría a la agenda personal del laboratorio cuántos casos nuevos y cuántas enseñanzas por
> firmar hay, con enlaces: entra un daño nuevo, «La actividad del experto, en el cerebro personal».

## Qué cambia, sección por sección

### §1 (qué es) y §2 (quién decide qué)

- La mesa se ve y se opera dentro de la capa común: una ventana con conversación, panel y explorador; el freno de la
  capa (cita textual y clic) está disponible, aunque ninguna intención de la mesa es irreversible hoy.
- **La conversación no decide nada sobre terceros.** Corre casos en el mismo laboratorio sintético sin modelo que ya
  usa la mesa, explica una traza que ya existe y lista lo que el experto enseñó. No da veredictos nuevos: el veredicto
  sigue saliendo del motor de reglas (sin cambios en la §2).

### §3 (datos)

- **Lo que escribe el experto en la conversación** sigue el camino de lo que ya escribe en la mesa: pasa el filtro del
  anonimizador y, si se guarda, se guarda en el almacén de la mesa (R2 en la mesa alojada; disco en local), con la
  misma retención (180 días) y la misma regla de quién lee qué. **Nada del experto en `localStorage` ni
  `sessionStorage`** (comprobado en local; la evidencia está en `docs/goals/capa-arbrain-evidencia/mesa.md`).
- **La lectura de solo conteos (no encendida):** números enteros por clave declarada (por ejemplo `casos-nuevos`,
  `ensenanzas-por-firmar`) y enlaces a pantallas de la mesa, sin consulta ni fragmento. El esquema es el cerrado de la
  capa (`validaResumen`): cualquier texto libre, clave no declarada o campo de más se rechaza entero y se queda en la
  cuarentena del VPS, fuera del cerebro (probado con Recepción, `docs/goals/capa-arbrain-evidencia/resumen.md`).

### §4 (daños) — una fila nueva

| Daño | Cómo pasaría | Control | Brecha |
|---|---|---|---|
| **La actividad del experto, en el cerebro personal** | Los conteos (cuántos casos al día, cuándo) dicen cuánto y cuándo trabaja el experto, y se guardarían en el cerebro personal del laboratorio, en un VPS (un tercero que hoy no recibe nada de la mesa) | Solo conteos agregados y enlaces; nunca texto, nombres ni identificadores del experto; la mesa entra a la lista del job solo con esta revisión firmada; token de servicio de solo lectura por producto (no construido); el experto sabe que el laboratorio ve conteos (aviso en la mesa) | Con un solo experto, «cuántos casos hoy» ES su actividad: no hay agregación que la esconda. Por eso se propone conteo **por día** como mínimo, nunca por hora, y que el aviso lo diga |

Y una brecha que ya estaba y conviene repetir aquí: el experto puede contar en la conversación el caso de un cliente
suyo; el filtro caza lo que tiene forma de dato (correos, teléfonos, RFC), no un relato.

### §5 (decisión)

- (a) Conversación sin modelo: **se propone aceptarla** con los mismos controles de la revisión 11. Con un modelo real,
  es otra revisión (el texto saldría a un proveedor; la D7 dice «solo anonimizado»), con su asignación en C8.
- (b) Conteos hacia el cerebro personal: **se propone aceptarlos** solo por día, solo con las dos claves de arriba, con
  el aviso en la mesa, con el C3 de las instancias firmado y con el VPS ya decidido (proveedor y región, con su C4).
  Hasta entonces la mesa no está en la lista del job.

## Lo que esta nota NO abre

- Desplegar la mesa con la ranura de conversación: es el candado de despliegue de siempre (`docs/MESA-DEL-EXPERTO.md`).
- Un modelo real en la conversación del experto (FUERA DEL HECHO §3).
- Voz en la mesa: no cabe el motor local y la nube no se enciende con datos sensibles (C4 de voz, firmado el 2026-10-26).
