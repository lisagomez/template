# Piloto del estudio pymes: plan

> **Propuesta del 2026-10-02, todavía sin negocio.** Firma del laboratorio pendiente (al pie).
> Ya decidido por el laboratorio el 2026-10-02: el **costo actual** y el **KPI** (contrato,
> [`src/features/estudio-pymes/BUSINESS_LOGIC.md`](../../../src/features/estudio-pymes/BUSINESS_LOGIC.md)
> §1 y §5), los **cuatro tipos de datos** (facturas XML, archivo de la caja, reseñas y exportación de
> anuncios) y que **los datos reales se procesan en el equipo del dueño**. Lo que no se ha decidido va
> marcado **pendiente** o **[supuesto]**.

## 1. Para qué

Para cambiar lo que el contrato hoy dice «sin medir» por cifras de un negocio real:

1. **El costo actual**: las horas del dueño al mes y el gasto mensual en campañas con veredicto
   «problema».
2. **La meta del KPI**: el laboratorio la fija con la cifra del «antes» delante.
3. **El cotejo de columnas** de las exportaciones de anuncios, que es el riesgo más grande del
   contrato (§6, daño 3).
4. **Los defectos que solo salen con datos reales.** Cada uno vuelve al laboratorio como un caso
   **sintético** que lo reproduce: el Auto-Blindaje, sin que entre un solo dato real.

Al cerrar, el contrato se vuelve a firmar con esas cifras.

## 2. Qué negocio buscar

- Una pyme mexicana **sin equipo de marketing**: si ya le paga a alguien, ese pago quedó fuera de la
  medición y las horas que se miden no serían las suyas.
- Que emita CFDI 4.0 o tenga una caja que exporte CSV o Excel.
- Que publique en redes, o quiera hacerlo.
- **Para el cotejo**: que pague anuncios en Meta (y, si los tiene, en Google o TikTok), y que tenga
  reseñas en alguna plataforma. Si le falta alguno de esos datos, esa parte simplemente no se prueba.
- Que acepte **anotar sus horas** durante el piloto. Sin eso no hay KPI.

## 3. Calendario

| Etapa | Duración | Qué pasa |
|---|---|---|
| 0. Arranque | 1 semana **[supuesto]** | El dueño firma el permiso (anexo A). El laboratorio confirma que el requisito previo (§6) está construido |
| 1. El «antes» | 4 semanas **[supuesto]** | El dueño hace su marketing como siempre y anota sus horas (anexo B). **No usa el estudio** |
| 2. El «después» | el mes siguiente | Usa el estudio para su mes y anota sus horas en la misma hoja, sobre las mismas tareas |
| 3. Cierre | 1 semana **[supuesto]** | Cifras agregadas, cotejo, defectos convertidos en casos, re-firma del contrato |

Si el «antes» arranca a principios de mes, el «después» cae en el mes siguiente completo. Conviene
que ese mes traiga una temporada (Día de Muertos, Buen Fin, Navidad): es cuando el estudio tiene más
que decir.

## 4. Qué se mide y qué llega al laboratorio

| Medida | Cómo | Lo anota | Lo único que llega al laboratorio |
|---|---|---|---|
| Horas del «antes» | Hoja de horas, 4 semanas | el dueño | el total por tarea |
| Horas del «después» | La misma hoja y las mismas tareas: el estudio hasta el mes aprobado (con las respuestas a reseñas) **más** subir lo aprobado | el dueño | el total por tarea |
| Gasto en anuncios por veredicto | El estudio, en su equipo, con la exportación de 90 días | el dueño, con el laboratorio acompañando | el gasto mensual sumado por veredicto (funciona · vigilar · problema · sin veredicto), **sin nombres de campaña** |
| Cotejo de columnas | La primera línea de cada exportación de anuncios y de reseñas: los nombres de las columnas, sin un solo dato | el dueño la copia | esa línea, y lo que el estudio dijo que no reconoció |
| Defectos | Lo que salió raro: una cifra que no cuadra, un aviso que no se entiende, una pieza mal | el dueño y el laboratorio | la descripción, **sin datos**; el caso sintético lo arma el laboratorio |

Las horas no las registra el estudio: no tiene cuentas ni telemetría, a propósito (contrato §5).

## 5. Los datos: qué sale y qué no

- **No sale del equipo del dueño:** facturas, archivo de la caja, reseñas, exportaciones, nombres de
  clientes, de campañas o de productos, RFC, ni capturas de pantalla con datos.
- **Sí llega al laboratorio:** las cifras agregadas de §4, las líneas de encabezados y la descripción
  de los defectos.
- Si el laboratorio acompaña una sesión (en persona o por llamada), **no graba la pantalla ni copia
  archivos**.
- **Nada real entra al repo.** Ni las cifras con el nombre del negocio: en el contrato el negocio
  aparece por su giro («una panadería») **[supuesto: el nivel de detalle]**.
- Las reseñas son datos de terceros: se procesan en el equipo del dueño bajo la AISIA de reseñas
  firmada el 2026-09-27, y nada se publica solo.

## 6. Requisito previo: lo que el estudio hoy no le enseña al dueño

**Hallazgo del 2026-10-02, al preparar este plan.** Los lectores del paquete sí reportan lo que no
pudieron leer, pero la app lo tira antes de mostrarlo:

| Sección | Qué reporta el paquete | Qué hace hoy la app | Por qué rompe el piloto |
|---|---|---|---|
| Anuncios | columnas no reconocidas (`faltan`) | no las muestra | sin ellas no hay cotejo: si no reconoce la columna de resultados, todo sale «sin veredicto» y no se ve por qué |
| Anuncios | filas que no pudo leer (`rechazadas`) | las descarta | el gasto sale menor y el veredicto se calcula con datos parciales, en silencio |
| Anuncios | la moneda (`MXN` o `USD`) | el gasto de la tabla siempre se pinta en pesos | una exportación en dólares se lee como pesos |
| Reseñas | avisos (p. ej. «no encontré la columna del texto») y reseñas no leídas | los descarta | con una exportación real que no reconoce, analiza cero reseñas sin decirlo |

Ventas ya muestra sus avisos y lo que falta. **Sin este arreglo no se puede hacer el cotejo ni medir el
gasto por veredicto**: va en un PR aparte, antes del arranque.

**Pendiente: dónde corre el estudio para el dueño.** Hoy solo corre en local. Las dos salidas son
desplegar la app en el servidor (los datos siguen sin salir de su navegador, pero desplegar tiene su
gate y el render del video ahí responde 501) o llevarlo en un equipo del laboratorio, y entonces los
archivos del dueño pasarían por ese equipo, que es justo lo que §5 descarta.

## 7. Cierre

- Las horas del «antes» y del «después» por tarea, o **pendiente** si el dueño no anotó. No se
  estiman.
- El gasto mensual por veredicto, **solo si el cotejo pasó**.
- El cotejo: qué columnas reconoció el estudio y cuáles no. Los sinónimos que falten se agregan con su
  caso sintético.
- Los defectos convertidos en casos sintéticos del laboratorio.
- El contrato con las cifras, la meta del KPI fijada por el laboratorio y la firma de nuevo.

**Si el dueño se retira**, el piloto se detiene ahí y no se usa nada de lo suyo. Si lo pide, lo
agregado que ya entregó se borra **[supuesto]**.

---

## Anexo A: permiso del dueño (texto llano)

> Acepto probar el estudio de marketing del laboratorio con los datos de mi negocio, en estas
> condiciones:
>
> 1. Uso el estudio **en mi propio equipo**. Mis facturas, el archivo de mi caja, mis reseñas y mis
>    exportaciones de anuncios **no salen de él**.
> 2. Le comparto al laboratorio solo: mis horas totales por tarea, el gasto sumado de mis anuncios
>    por veredicto (sin nombres de campañas), la primera línea de mis archivos de anuncios y reseñas
>    (los nombres de las columnas) y lo que me haya salido raro.
> 3. El laboratorio no graba mi pantalla ni copia mis archivos, y en sus documentos menciona mi
>    negocio solo por su giro.
> 4. El estudio no publica nada por mí. Lo que suba a mis redes lo subo yo.
> 5. Puedo dejar el piloto cuando quiera, sin dar explicaciones.
>
> Negocio (giro): ____________ · Fecha: ____________ · Firma: ____________

## Anexo B: hoja de horas

Una línea por vez que trabaje en su marketing. Minutos, no horas: «20 min» se anota mejor que «un rato».

| Fecha | Tarea | Minutos | Nota (opcional) |
|---|---|---|---|
| | Decidir qué publicar | | |
| | Hacer las piezas (fotos, textos, diseños) | | |
| | Contestar reseñas | | |
| | Subir a mis redes | | |

En el «después», el tiempo dentro del estudio va en la tarea que tocaba (decidir, hacer, contestar),
y **subir sigue contando aparte**.

---

**Firma:** pendiente del laboratorio.
