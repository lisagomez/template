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

## Pruebas y paridad

```bash
npm run prueba                                              # contrato, conteo, estructura, registro
npm run paridad:migracion -- --hermes ~/code/hermes-os-a2a  # el motor de Hermes sobre este paquete
```

La paridad corre el motor **real** de Hermes, del corte pineado, sobre este paquete, y lo compara
con lo que ese motor respondía sobre su propio seed. Una diferencia de contenido que no esté en
`pruebas/diferencias-esperadas.json` pone roja la prueba.
