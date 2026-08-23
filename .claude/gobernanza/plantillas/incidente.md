# Procedimiento de incidente

> Control **C6** de `../GOBERNANZA.md`. Aplica a fugas, roturas en producción, cobros
> indebidos y a cualquier señal de que una entrada intentó **dirigir** al agente.

---

## 1. Qué cuenta como incidente

1. **Fuga o exposición**: dato de un usuario alcanzable por otro; secreto en un log, en
   el cliente o en un repo.
2. **Acción irreversible no autorizada**: se escribió, borró, envió o cobró sin el gate
   humano que correspondía.
3. **Inyección detectada**: una entrada logró que el agente hiciera algo fuera de su
   catálogo de acciones — aunque no haya causado daño.
4. **Sospecha sin gate**: alguien del equipo detecta algo raro y **ningún control saltó**.

> El caso 4 importa tanto como los otros tres: un vector que ningún gate cazó es
> precisamente el que hay que cerrar.

## 2. Contención (primeros minutos)

1. **Pausar.** Deshabilita el flujo afectado, revoca la llave, baja el job. Ante la duda
   se pausa: reanudar es barato; un dato filtrado, un correo enviado o un cobro no se
   deshacen.
2. **No "arreglar" en caliente.** El primer parche destruye evidencia.
3. **Congelar evidencia**: logs, IDs de las filas afectadas, hash o copia del input
   original, hora exacta, versión desplegada.

## 3. Clasificación

| Pregunta | Si la respuesta es sí |
|---|---|
| ¿Salió dato fuera de su dueño? | Es fuga: ir a §4 |
| ¿Se ejecutó algo irreversible? | Alcance y reversión primero, causa después |
| ¿Un gate lo detuvo antes de consecuencias? | **Intento contenido**: documentar y cerrar (§5) |
| ¿Ningún gate lo detectó? | **Vector abierto**: escalar, no cerrar |

## 4. Exposición de datos personales

1. Determinar **qué** datos, de **quién**, y a **quién** llegaron.
2. Notificar al titular. En México aplica la LFPDPPP; el plazo y la forma los fija la
   persona responsable, no este documento.
3. Registrar la notificación en `../REGISTRO-RIESGO.md`.

> No se omite la notificación porque "fue poco" o "fue a alguien conocido". Esa
> valoración le toca a la responsable, con el hecho documentado delante.

## 5. Cierre — el paso que no se salta

Todo incidente termina con **tres cosas**, no con una:

1. **Un caso nuevo en la suite de regresión** (C2), con su entrada y su salida esperada.
   Si el vector no lo cazaba ningún gate, el cierre incluye **el gate nuevo**, con su
   prueba y su **caso negativo** (algo que debe fallar).
2. **Una entrada en Aprendizajes** de `CLAUDE.md` o del PRP relevante: error, fix, dónde
   más aplica.
3. **Una entrada en `REGISTRO-RIESGO.md`** si al reanudar queda algún riesgo aceptado.

> Un incidente cerrado sin caso de regresión no está cerrado: está olvidado, y volverá
> en el próximo cambio de modelo.

## 6. Reanudar

Solo cuando: la causa está identificada, el caso está en la suite, la suite pasa en
verde, y la persona responsable lo autoriza. La reanudación se anota.
