# Registro de incidentes

> Control **C6** de `GOBERNANZA.md`. **Append-only**: se añade una entrada por incidente;
> **nunca se edita una pasada**.
>
> El procedimiento (`plantillas/incidente.md`) decía qué hacer y no tenía dónde escribirlo.
> Este archivo es ese hueco cerrado.

## Este archivo nace vacío en cada proyecto

Y es a propósito. Un registro de incidentes es **del proyecto que los sufre**: heredar los
de otro no aporta nada y sí confunde — nadie sabe si esa fuga le ocurrió a él.

Lo que **sí** viaja de un incidente pasado es su aprendizaje, y viaja donde muerde: una
regla en *Reglas de Código*, un caso en el corpus, una comprobación en el verificador. Si
un incidente ajeno no dejó ninguna de esas tres cosas, tampoco tenía nada que enseñarte.

> El historial de la instancia donde nació este template está en la rama `golden-sets`,
> archivo `historial-incidentes.md`. Se conserva por trazabilidad, no como herencia.

## Formato

```markdown
### <fecha ISO> — <título> — <contenido | vector abierto>
- **Qué pasó**:
- **Cómo se detectó**:
- **Contención**:
- **Clasificación**: ¿salió dato? ¿lo detuvo un gate? ¿ningún gate lo vio?
- **Cierre** (las tres, o no está cerrado):
  - Caso de regresión: <identificador; el contenido vive en `golden-sets`>
  - Aprendizaje: <dónde quedó, y que sea un sitio que obligue>
  - Riesgo residual: <entrada en REGISTRO-RIESGO.md, o "ninguno">
```

**Un incidente cerrado sin caso de regresión no está cerrado: está olvidado.** Y un caso
que existe pero nunca se ha ejecutado no es evidencia de nada — solo prueba que alguien lo
escribió.

---

## Entradas

### 2026-10-12 — Un token de Vercel viajó dentro de las funciones de la vitrina — vector abierto, cerrado con gate nuevo
- **Qué pasó**: al enlazar el proyecto de Vercel de la vitrina de Soporte SAP, `vercel link` (63.1.2) dejó en la raíz
  del worktree un `.env.local` con `VERCEL_OIDC_TOKEN`: un token de desarrollo de ese mismo proyecto, emitido para
  12 horas. `@vercel/next` (22.0.1) mete todo `.env` y `.env.*` de la raíz en cada función del servidor, sin mirar
  `outputFileTracingExcludes` ni `.dockerignore`. En su nube construye desde Git y no los ve; la vitrina se construye en
  la máquina del laboratorio y se sube con `--prebuilt`. El token viajó en los dos primeros despliegues
  (`dpl_GWe5bQGWVkiMFVGw2zoqqmuSc2Zc` y `dpl_6e7gMZZqt9WszNvUaeoKDLRxhNXC`).
- **Cómo se detectó**: lo encontró el agente revisando qué se había subido después del segundo despliegue. La primera
  búsqueda dio 0 coincidencias en falso: el código de las funciones no está copiado en `.vercel/output`, lo nombra el
  `filePathMap` de cada `.vc-config.json`. La segunda búsqueda recorrió esos archivos, con un control positivo (un
  texto que el código sí lleva) para demostrar que la búsqueda encontraba, y halló el token y los `.env*`.
- **Contención**: se borró el `.env.local` (nada lo usaba) y se redesplegó limpio (`dpl_487zFUD7X55UrF5y3LJJC4SCyo3L`),
  con un candado en `despliega.sh` que no sube si una función lleva un `.env*` fuera de Git (`b43c5b5`, en main por
  #259). Se arregló antes de abrir este procedimiento, que pide no arreglar en caliente; la evidencia se conservó hasta
  cerrar la clasificación: los dos despliegues guardaron su contenido en Vercel hasta su borrado, y el hallazgo está en
  los commits.
- **Clasificación**: ¿salió dato? No a un tercero: el token es del propio proyecto y llegó a la infraestructura del
  mismo dueño, en archivos de función que Vercel no sirve por HTTP y detrás de Vercel Authentication en todos los
  despliegues. No hay datos personales: no aplica la §4. ¿Lo detuvo un gate? No. ¿Ningún gate lo vio? Ninguno: vector
  abierto, que se cierra con el gate nuevo.
- **Cierre** (las tres, o no está cerrado):
  - Caso de regresión: el gate nuevo con su prueba y su caso negativo, en `tools/soporte-sap/pruebas/vitrina-despliegue.ts`
    («a Vercel no sube un .env fuera de Git…», con un `.env.local` detrás de un enlace que tiene que salir nombrado, y
    «despliega.sh corre el candado de .env entre el build y la subida»), y las filas `c3-vitrina-sin-env` y
    `c3-vitrina-sin-env-al-subir` de la matriz, verdes sin su sabotaje y rojas con él (`55abd16`). No es conducta del
    agente ni de un skill: no lleva caso en `golden-sets`.
  - Aprendizaje: PRP-008, «Aprendizajes» (2026-10-12), y una frase nueva en el control del C3 «La vitrina y la sección
    en vivo», con su fila en la matriz.
  - Riesgo residual: ninguno. Los dos despliegues que llevaban el token se borraron el 2026-10-13 (`vercel rm`),
    con el token ya caducado desde el 2026-10-12 a las 22:12 UTC. Los dos dan 404; el vigente sigue detrás de Vercel
    Authentication.

<!-- Añadir aquí los incidentes siguientes. NO editar los anteriores. -->
