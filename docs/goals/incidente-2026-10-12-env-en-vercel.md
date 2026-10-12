# Borrador: incidente del 2026-10-12, el `.env.local` en la vitrina de Vercel

> Propuesta para `.claude/gobernanza/INCIDENTES.md` (C6). La pasa el laboratorio: este borrador no es el registro.
> **Cómo:** pega la entrada de abajo bajo `## Entradas`, en lugar de `*(ninguna todavía)*` y por encima del comentario
> `<!-- Añadir aquí… -->`, que se queda: es la marca append-only que lee `verify:gobernanza`. Antes, elige una de las
> dos líneas de «Riesgo residual» y borra la otra. Después borra este archivo.

```markdown
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
  #259). Se arregló antes de abrir este procedimiento, que pide no arreglar en caliente; la evidencia sigue en pie: los
  dos despliegues conservan su contenido en Vercel y el hallazgo está en los commits.
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
  - Riesgo residual: ninguno. Los dos despliegues que llevaban el token se borraron el <fecha>.
  - Riesgo residual: ninguno. Los dos despliegues que llevan el token se dejaron hasta que caducara (2026-10-12, 22:12
    UTC); después de esa hora no queda nada que aceptar.
```

## Lo que hay en el PR

- `scripts/vitrina/sin-env.mjs`: el candado, que antes estaba en línea en `despliega.sh` y solo se había probado a mano.
- Dos pruebas en `vitrina-despliegue.ts` y dos filas del C3 en la matriz, cada una con su sabotaje.
- PRP-008: la frase del candado en el control de la vitrina, la nota de versión y el aprendizaje.
