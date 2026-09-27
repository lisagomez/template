# @tu-scope/conocimiento

**Fuente única** del conocimiento del grafo (spec 004, PRP-005): reglas con fuente citada, por
dominio y versionadas. Se siembra **aquí**, una vez. Cada proyecto registra los dominios que usa y
fija la versión exacta. Se lee con `@tu-scope/grafo-conocimiento`.

```ts
import conocimiento from '@tu-scope/conocimiento'
import { validaConocimiento, seleccionaDominios } from '@tu-scope/grafo-conocimiento'

const v = validaConocimiento(conocimiento)          // exportado sin tipo a propósito: se valida siempre
const mio = seleccionaDominios(v.conocimiento!, ['mx-drones-de-reparto', 'mx-agentes-de-seguros'])
```

## Qué hay

| Ruta | Qué es |
|---|---|
| `catalogo.json` | jurisdicciones, dimensiones con su **vocabulario** de veredictos y categorías (keywords y exclusiones) |
| `dominios/<dominio>.json` | un dominio (cita, fecha de corte, procedencia, categorías) y las reglas que dictan sobre sus categorías |
| `generales/<ámbito>.json` | reglas que aportan requisitos a todo su ámbito, sin categoría |
| `CAMBIOS.md` | qué cambió en cada versión y quién firmó lo que cambia un veredicto |
| `investigacion/` | el método de investigación → regla, y el dictamen de la frontera financiera |
| `origen/` | la migración única desde Hermes, conservada para auditoría |

17 dominios: drones de reparto, agentes de seguros, logística de carga, comercio exterior, T-MEC,
corporativo-mercantil, fiduciario-inmobiliario-sucesorio, ambiental, cabildeo y política,
servicios financieros, propiedad industrial, servicios legales, deducibilidad (MX y CO), registro
contable, cláusulas contractuales y datos personales en prospección.

## Reglas de la casa

- **Solo se añade.** Retirar es cerrar `vigente_hasta`; un significado nuevo es una regla nueva con
  `reemplaza`. Nada se borra: el pasado tiene que seguir encontrando su regla.
- **Nada se actualiza solo.** `vigila:versiones` avisa de una versión nueva y subirla es firma humana.
- **Lo que cambia un veredicto va firmado** y sube la versión en `CAMBIOS.md`.

## Cómo se siembra (y qué lo impide)

1. Investiga con `investigacion/PLANTILLA-INVESTIGACION-SEED.md` y escribe la regla en
   `dominios/<dominio>.json`, o en `generales/` si no dicta sobre una categoría. Una categoría nueva
   va a `catalogo.json`.
2. Retirar es cerrar `vigente_hasta`; un significado nuevo es una regla nueva con `reemplaza`.
3. Sube la versión en `package.json` y anota el cambio en `CAMBIOS.md`. Lo que cambia un veredicto
   va con firma del laboratorio.
4. `npm run registra -- [--firmadas CLAVE,...]` añade las huellas de la versión a `versiones.json`,
   un registro de solo añadir.
5. `npm run prueba`, que también corre dentro de `npm run validate`.

El **gate de siembra** (`pruebas/gate.ts`, spec 004 RF-12 y RF-14) se pone rojo si:

- el conocimiento cambió **sin subir de versión**;
- una versión **borra** algo de la anterior (regla, categoría, dominio, keyword, exclusión o veredicto
  del vocabulario) o **edita una regla en su sitio** sin firmarla. Borrar no se firma nunca;
- una firma no corresponde a ningún cambio (firma en blanco);
- aparece una **contención** de keywords entre categorías del mismo ámbito que ni una exclusión cubre
  ni `contenciones-aceptadas.json` acepta con su porqué.

Los conflictos de veredicto, el vocabulario por dimensión, las referencias y las cifras sin
verificar los caza `validaConocimiento`, en la misma suite.

## Pruebas y paridad

```bash
npm run prueba                                              # contrato, conteo, estructura, registro
npm run paridad:migracion -- --hermes ~/code/hermes-os-a2a  # el motor de Hermes sobre este paquete
```

La paridad corre el motor **real** de Hermes, del corte pineado, sobre este paquete, y lo compara
con lo que ese motor respondía sobre su propio seed. Una diferencia de contenido que no esté en
`pruebas/diferencias-esperadas.json` pone roja la prueba.
