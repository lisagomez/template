# @tu-scope/conocimiento

**Fuente única** del conocimiento del grafo (spec 004, PRP-005): reglas con fuente citada, por
dominio y versionadas. Se siembra **aquí**, una vez. Cada proyecto registra los dominios que usa y
fija la versión exacta. Se lee con `@tu-scope/grafo-conocimiento`.

## Qué hace

- Guarda las reglas con las que un proyecto responde «¿esto está permitido?», cada una con su fuente citada, por
  dominio y versionadas (los 17 dominios de hoy, en «Qué hay»).
- Deja que cada proyecto elija los dominios que usa y fije la versión exacta, y le avisa de una versión nueva sin
  moverla.
- Protege el pasado: solo se añade, y lo que cambia un veredicto va firmado.

### Qué no hace

- No da veredictos: los calcula `@tu-scope/grafo-conocimiento` sobre estas reglas.
- No se actualiza solo en ningún proyecto: `vigila:versiones` avisa y subir el pin es firma humana.
- No le da «todos los dominios» a un consumidor público: solo el recorte que pide.
- No se siembra en Hermes: la fuente única es este paquete.

## Casos de uso

- **Un proyecto que responde con reglas citadas** (p. ej. «¿puedo repartir paquetes con un dron?»): registra sus
  dominios con `seleccionaDominios` y fija la versión exacta del paquete.
- **El laboratorio siembra o retira una regla**: investiga con la plantilla, escribe el dominio, sube la versión en
  `CAMBIOS.md` y firma lo que cambia un veredicto; el gate de siembra rechaza borrar o editar en su sitio.
- **Sale una versión nueva**: `vigila:versiones` avisa una sola vez con el tamaño del salto; subirla es una decisión con
  su diff, su regresión y su firma.
- **Un repo público (Hermes)**: vendoriza solo el recorte de sus dominios, con su pin (`npm run recorta`).

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` (`engines`).
- **Dependencias del sistema**: ninguna en ejecución: es un paquete de datos. Para construir y probar,
  `@tu-scope/grafo-conocimiento` del mismo repo; la paridad, además, un clon de Hermes con el motor de su corte
  pineado.
- **CPU, GPU y memoria**: no medido.
- **Servicios externos**: ninguno en ejecución. El registro de npm solo para instalar y para que `vigila:versiones`
  avise; mientras no se publique, no hay aviso.
- **Variables de entorno**: ninguna.
- **Almacenamiento**: el JSON ensamblado dentro del paquete (`dist/conocimiento.json`: 233434 bytes en 0.2.0, medido
  el 2026-09-29) y `versiones.json`, el registro de huellas de cada versión, de solo añadir.
- **Salida del perímetro (C4)**: no hay datos de personas que salgan: son reglas con fuente pública o interna. El
  recorte para un repo público publica solo los dominios que ese consumidor pide.

## Uso

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
| `politica-cita.mjs` | qué cita cada dominio y con qué corte, y de qué fuentes salen las reglas de un dominio que nace aquí (`DOMINIOS_PROPIOS`) |
| `investigacion/` | el método de investigación → regla, y el dictamen de la frontera financiera |
| `origen/` | la migración única desde Hermes, conservada para auditoría |

17 dominios: drones de reparto, agentes de seguros, logística de carga, comercio exterior, T-MEC,
corporativo-mercantil, fiduciario-inmobiliario-sucesorio, ambiental, cabildeo y política,
servicios financieros, propiedad industrial, servicios legales, deducibilidad (MX y CO), registro
contable, cláusulas contractuales y datos personales en prospección.

## Cómo lo consume un proyecto (y cómo se entera de una versión nueva)

```bash
npm install --save-exact @tu-scope/conocimiento@0.2.0   # desde el registro, versión EXACTA
npm run vigila:versiones                                  # avisa si hay una nueva; no toca nada
```

- **Versión exacta, nunca un rango.** En `0.x`, `^0.2.0` deja entrar un parche sin que nadie lo decida.
- `vigila:versiones`, el script del template que hereda todo proyecto derivado, **avisa** de una versión
  nueva con exit 1 y el tamaño del salto, **una sola vez**, y no mueve el pin. Subirlo es una decisión, con
  su diff, su regresión y su firma.
- **Mientras no se publique** (publicar es gate humano), el paquete se instala desde el tarball de
  `npm run empaqueta`. Sin registro no hay versión nueva que consultar: el vigilante lo dice («sin registro no
  hay aviso») en vez de dar una falsa alarma. El aviso nace el día que se publique.

Lo prueba `pruebas/aviso.ts`, un ensayo con un registro falso en 127.0.0.1: publica 0.3.0 y avisa; lo repite y
calla; publica 1.0.0 y avisa como MAYOR; el pin no se mueve; el tarball no da falsa alarma.

### Un consumidor público: vendoriza el recorte, nunca el paquete

Un repo público (Hermes) no instala el paquete: con cada subida del pin publicaría los dominios que
siembran otros proyectos. Vendoriza solo el **recorte** de los suyos, con su pin:

```bash
npm run recorta -- --dominios mx-drones-de-reparto,mx-agentes-de-seguros --salida <dir>
```

- Escribe `recorte.json`, que es `seleccionaDominios` del motor, y `PIN.json`, con la versión, los dominios, la
  huella del paquete ensamblado (la de `dist/conocimiento.json`) y la del recorte.
- **Se niega** si el árbol no es exactamente una versión registrada en `versiones.json`: el recorte sale siempre de
  una versión que pasó el gate.
- **Se rehace**: la misma versión y los mismos dominios dan las mismas huellas. El consumidor no ve el paquete, así
  que quien firma una subida del pin lo comprueba aquí.
- No hay «todos los dominios» a propósito: un dominio que se siembre mañana no le llega a nadie que no lo pida.

Lo prueba `pruebas/recorte.ts`. Del lado de Hermes, `seed/actualiza_paquete.py` recibe el recorte, mide qué
respuestas cambian y exige la firma del laboratorio (`prp-grafo-lee-paquete.md` de ese repo).

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

La **política de citas** (`politica-cita.mjs`, en la misma suite: `pruebas/conocimiento.ts` y `pruebas/cita.ts`) se
pone roja si un dominio migrado de Hermes no cita `publica` con el corte de Hermes, o si aparece un dominio nuevo sin
declarar en `DOMINIOS_PROPIOS`. Declarar uno abre la suite, así que es un **CDC**. El único declarado es `sap-soporte`
(D-SS-3, 2026-10-22): cita `interna`, corta desde el 2026-10-22, y cada regla suya sale de una SAP Note (solo el
número y el enlace a `me.sap.com/notes/N`, con el número en la cita), de SAP Help (`help.sap.com`) o de la
«Experiencia documentada del experto» anotada en `CAMBIOS.md`. **sapstack nunca basta por sí solo** (D-SS-2), y toda
regla del dominio aparece en `CAMBIOS.md`, donde firma el laboratorio. La suite mira la forma de la fuente, no que
sea buena: eso lo decide quien firma.

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
