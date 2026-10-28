# Verificación independiente de Ágora (2026-10-28)

> Un agente que **no construyó nada** de Ágora, en un clon nuevo fuera del repo con `npm ci` real, re-corrió los gates
> de cero sobre `eb062f7` e intentó romper controles por su cuenta. Abajo, lo que reportó (las líneas que importan,
> tal cual) y qué se hizo con cada hallazgo. La re-corrida de los gates después de los arreglos está al final.

## Lo que reportó

| Paso | Comando | Resultado del verificador |
| --- | --- | --- |
| 1 | `git clone --branch agora/a2a … /home/gsore/verificador-agora` | `eb062f7`. (La rama se llama `agora/a2a`; el brief decía `worktree-agora`: error mío en los documentos, ya corregido) |
| 2 | `npm ci --prefer-offline --no-audit --no-fund` | `EXIT=0 · added 466 packages in 14s · node v22.23.0` |
| 3 | `npm run validate` | **ROJO desde el clon limpio**: `✗ tools/agora no compila … Cannot find module '../../../calendario/dist/index.js'` (`prepara-gate` construye en orden alfabético). Construyendo antes el calendario y con la rama `golden-sets` (que el `--single-branch` del brief dejaba fuera): `pasaron: 34 · inactivos declarados: 11 · rojos: 0` |
| 4 | `npm --prefix tools/agora run prueba` y `run sabotajes` | `# tests 118 # pass 118 # fail 0`; 75 sabotajes cazados, ninguno «NO cae», «no se pudo sembrar» ni «apunta a nada» |
| 5 | `npm run agora:pg` | `Todo en verde… EXIT=0`, **pero** al importarse `laboratorio.ts` borró y recreó el contenedor `agora-pg-lab` (ver abajo) |
| 6 | `npm run verifica:enchufes`; `git diff --stat 2561724..HEAD -- tools/capa` | `30/30 … 10/10 siembras cazadas`; diff **vacío** |
| 7 | Ataque propio (PGlite sembrada) | Ver la tabla siguiente |

| Ataque del verificador | Resultado | Control |
| --- | --- | --- |
| A1: Medios Norte (externo) fija los claims de Paula | Aprobaciones visibles 3 → **15** (12 de propuestas que no puede ver); dependencias 1 → 6 | **cayó** |
| A1b: el mismo agente se pone los claims de Carla (Bajío) | Ve 1 de 1 aprobación de **otra organización** | **cayó** |
| A2: Empaques Regio (suspendido) se pone los claims de Paula | Aprobaciones 0 → **15** | **cayó** |
| A3: el coordinador con los claims de Mariana inserta una aprobación | `permission denied for table aprobacion` | aguantó |
| A4: el coordinador con los claims de Paula llama a `atestigua` | `permission denied for function atestigua` | aguantó |
| B: en la sesión del agente, `set_config('role','authenticated')` y aprobar | **Aprobó** (la conexión es `postgres`, superusuario) | **cayó** |
| C1': el coordinador propone lo que pidió Mariana sin `solicitada_por`; Mariana lo aprueba | Aprobó y aplicó | **cayó** |
| C2: el coordinador declara como solicitante a Carla (otra organización) | La base lo aceptó | **cayó** |
| D': dos ranuras `[propietario, administrador]` y Paula firma una vez | `aprobada` con una firma; se aplicó | **cayó** |

**Lo que rompió sin querer:** `scripts/agora/pg.ts` importaba `leeEntorno` de `scripts/agora/laboratorio.ts`, que al
importarse llamaba `levanta()`; en su árbol sin entorno, `levanta()` hizo `docker rm -f agora-pg-lab` y lo recreó con
otra clave. Datos ficticios del laboratorio de Ágora; ningún otro contenedor se tocó. Borró su clon al terminar.

## Qué se hizo con cada hallazgo

| Hallazgo | Estado | Dónde está la prueba |
| --- | --- | --- |
| `validate` rojo desde un clon limpio | **arreglado**: `prebuild` de `tools/agora` construye primero `tools/calendario` | `prepara-gate` con los dos `dist` borrados; la re-corrida de abajo |
| `laboratorio.ts` con efectos al importarse; borrar un contenedor ajeno | **arreglado**: `scripts/agora/entorno.ts` sin efectos, el script solo actúa si se ejecuta, y nunca borra un contenedor cuya clave no tiene | `composicion.ts`: «el laboratorio no actúa al importarse», que cae con la versión vieja |
| A1, A1b, A2 (claims de persona en una sesión de agente) | **arreglado**: `agora_priv.uid()` (la persona solo si la sesión es de persona); 54 usos de `auth.uid()` pasan por ahí | núcleo: la conducta (los tres ataques, tabla por tabla) y la estructura, con S16 y S17 |
| B (`SET ROLE` con SQL libre) | **declarado**: ningún agente tiene SQL; la defensa en profundidad (un rol de conexión por tipo de principal, sin superusuario) es de producción | `lo-que-podria-estar-mal.md`, punto 27; C3 D-4 |
| C1' (la segregación depende de lo que declara el agente) | **arreglado en parte**: con el mensaje de origen citado, la base deriva al solicitante; el coordinador lo cita. Queda el agente que no cita | buzón: «quien solicita es de la organización, y si la propuesta cita su mensaje, es quien lo escribió»; punto 28 |
| C2 (solicitante de otra organización) | **arreglado** | buzón, sabotaje B11 |
| D' (una firma para dos ranuras) | **arreglado** | buzón: «dos ranuras con los mismos roles piden dos PERSONAS distintas», sabotaje B10 |
| Clave de idempotencia global | **arreglado**: única por organización | buzón, sabotaje B12 |
| Imports sin usar en 5 suites | **arreglado** | `eslint tools/agora scripts/agora` sin avisos |
| La Puerta cerrada fuera del laboratorio | **confirmado y endurecido**: además de `AGORA_LABORATORIO=1` y Host local, el servidor del laboratorio escucha solo en `127.0.0.1` | `scripts/agora/dev.mjs` |
| `validate` no corre los sabotajes ni `agora:pg` | **del laboratorio** (CDC: `agora:pg` propuesto inactivo) | `riesgos-propuesta.md` |

## Segunda pasada (sobre `51a42ab`, clon limpio sin `--single-branch`, sin construir nada a mano)

| Paso | Resultado del verificador |
| --- | --- |
| `npm ci` + `npm run validate` | `✓ tools/agora construida · ✓ tools/calendario construida · Gobernanza cableada: 171/171 · ▸ tools/agora ✓ 124 pruebas · pasaron: 34 · inactivos declarados: 11 · rojos: 0 · Gate validate en VERDE: 34/34` |
| `prueba` / `sabotajes` | `# tests 124 # pass 124 # fail 0`; 80 sabotajes caen, 0 «NO cae» (S16, S17, B10, B11 y B12 incluidos) |
| Importar `laboratorio.ts` sin Docker | `sin efectos`, exit 0, sin crear `.laboratorio/` |
| `git diff --stat 2561724..HEAD -- tools/capa` / `verifica:enchufes` | vacío / 30/30 y 10/10 |

| Ataque | Resultado | Control |
| --- | --- | --- |
| A1, A1b, A2 (claims de persona en sesión de agente) | `agora_priv.uid()`=null; aprobaciones 3 → 3, ocultas 0; Bajío 0; suspendido 0 | aguantan |
| C1'-b / C1'-c (cita el mensaje de Mariana / lo cita y declara a Daniel) | `segregación de funciones…` / `quien la solicitó no es quien escribió…` | aguantan |
| C2 / C2b (solicitante o mensaje de otra organización) | rechazados | aguantan |
| D' (dos ranuras iguales) | pendiente con una firma; aprobada con dos | aguanta |
| C1'-a: sin citar el mensaje | Mariana aprobó lo que pidió | **cae** (declarado) |
| **C3: cita un saludo de Daniel en OTRA categoría** | Mariana aprobó lo que pidió | **cayó** |
| **C4: cita un mensaje del propio coordinador** | Mariana aprobó lo que pidió | **cayó** |
| **E: un socio ocupa la clave del coordinador** (`grafo:…:mensaje:<id>`, predecible) | el coordinador ligó en el hilo la propuesta del socio; Paula la aprobó y se aplicó la fecha del socio | **cayó** |
| D'': `[[administrador,propietario],[propietario]]`, firma primero Paula | Luis ya no puede firmar: la propuesta queda colgada (falla cerrado) | informativo |
| La suite de Ágora sola en un clon limpio | 110/111: `composicion.ts` no encuentra `tools/capa/dist` | informativo |
| `--apaga` | borra el contenedor desde cualquier árbol | informativo |

Qué se hizo:
- **C3 y C4 — arreglado:** el mensaje de origen tiene que ser **de una persona y del hilo de la MISMA categoría**
  (`agora_priv.solicitante_de`). Lo que queda (declarado, punto 28): un agente que no cita el mensaje, o que cita otro
  mensaje humano de la misma categoría.
- **E — arreglado:** la clave de idempotencia es **del autor** (índice único `org_id, autor, clave`); `propone` solo
  adopta una previa suya con la misma huella. Lo mismo para los mensajes, así que nadie silencia la respuesta del
  coordinador ocupando su clave.
- **D'' — arreglado:** `ranura_para` busca una asignación válida entre todas (`agora_priv.caben`) en vez de repartir a
  la primera.
- **La suite sola en un clon limpio — arreglado:** el `prebuild` de `tools/agora` construye `calendario` y `capa`.
- **`--apaga` — arreglado:** solo borra un contenedor que este árbol creó; un huérfano, solo con `--huerfano`.
- **B — sigue declarado** (punto 27).

Las pruebas nuevas, cada una con su sabotaje: «el mensaje de origen es el de una persona en el hilo de la misma
categoría» (dentro de la prueba del solicitante, B11), «la clave de idempotencia es de su AUTOR» (B12) y «el reparto de
ranuras no deja colgada una propuesta que sí se puede firmar» (B13).

## Tercera pasada (sobre `2179687`)

| Paso | Resultado del verificador |
| --- | --- |
| `npm ci` + `npm run validate` sin construir nada | `✓ tools/agora · ✓ tools/calendario · ✓ tools/capa construidas · Gobernanza cableada: 171/171 · ▸ tools/agora ✓ 125 pruebas · pasaron: 34 · inactivos declarados: 11 · rojos: 0 · Gate validate en VERDE: 34/34` |
| La suite de Ágora sola, en OTRO clon limpio (sin ningún `dist/`) | `# tests 125 # pass 125 # fail 0` (antes 110/111) |
| `sabotajes` | 81 caen, 0 «NO cae» (B10 a B13 incluidos) |

| Ataque | Resultado | Control |
| --- | --- | --- |
| A1, A1b, A2 | sin una fila más | aguantan |
| C3 (saludo de otra categoría), C4 (mensaje propio) | `el mensaje de origen es el de una persona en el hilo de la misma categoría` | aguantan |
| E (un socio ocupa la clave del coordinador) | el coordinador liga SU propuesta | aguanta |
| D'' (`[[administrador,propietario],[propietario]]`) | `aprobada` con dos firmas | aguanta |
| C1'-a (sin citar) y **C5 (cita a otra persona del mismo hilo)** | Mariana aprobó lo que pidió | **cae** (declarado: el agente elige qué cita) |
| **E2: el analista (interno) escribe los pasos del hilo del coordinador** | el coordinador quedó esperando la propuesta del analista; el pedido de Daniel no se atendió | **cayó** |
| **E3: el coordinador de Bajío escribe los pasos con el hilo de Golfo** | Golfo perdió su estado y un reintento **cobró el modelo dos veces** | **cayó** |
| **D''': `[[finanzas],[aprobador]]`, firma primero quien tiene los dos roles** | eligió «aprobador» (orden alfabético) y la otra persona ya no pudo firmar | **cayó** (falla cerrado) |
| `--apaga` | la guarda nueva solo exige *alguna* clave en el entorno, no la del contenedor | informativo |

Qué se hizo:
- **E2 y E3 — arreglado:** el estado del grafo es único por organización, agente, hilo y paso, y el coordinador solo
  lee sus propios puntos. Prueba en el coordinador: «el estado del grafo es de su agente…» (sabotaje C5); el reintento
  no vuelve a cobrar el modelo.
- **D''' — arreglado:** cada firmante entra a la asignación con TODOS sus roles (`agora_priv.firmantes_de`); el rol se
  elige para que la asignación completa siga siendo posible. Prueba «quien tiene dos roles llena la ranura que haga
  falta» (sabotaje B14).
- **`--apaga` — arreglado:** la clave del entorno tiene que ABRIR el contenedor; si no, no lo borra (salvo `--huerfano`).
- **C5 — declarado** con C1'-a (`lo-que-podria-estar-mal.md`, punto 28): la base no puede saber si el mensaje citado
  es el que de verdad pidió el cambio. Cierra solo si la propuesta del agente nace del mensaje en la base, no en el
  código del agente: es la propuesta abierta.

## Cuarta pasada (sobre `34bd39c`): ningún control se rompe

| Paso | Resultado del verificador |
| --- | --- |
| `npm ci` + `npm run validate` sin construir nada | `✓ tools/agora · ✓ tools/calendario · ✓ tools/capa construidas · Gobernanza cableada: 171/171 · ▸ tools/agora ✓ 127 pruebas · pasaron: 34 · inactivos declarados: 11 · rojos: 0 · Gate validate en VERDE: 34/34` |
| `sabotajes` | `suites: 21/21 17/17 11/11 13/13 8/8 10/10 11/11 7/7 8/8 7/7` · caen 83, 0 «NO cae», 0 «no se pudo sembrar», 0 «apunta a nada» |

| Ataque | Resultado | Control |
| --- | --- | --- |
| E2 (el analista escribe los pasos del coordinador) | el coordinador queda esperando SU propuesta | aguanta |
| E3 (Bajío ocupa los pasos con el hilo de Golfo) | Golfo guarda sus puntos; el modelo se cobra 1 vez | aguanta |
| D''' (`[[finanzas],[aprobador]]`, firma primero quien tiene los dos roles) | `aprobada` con 2 firmas | aguanta |
| A1, A1b, A2, C3, C4, E, D'' | sin cambios | aguantan |
| G2 (nuevo): el analista inserta un paso con `agente_id` = el coordinador | `new row violates row-level security policy for table "grafo_punto"` | aguanta |
| G3 (nuevo): el mismo mensaje atendido dos veces | la misma propuesta, 1 llamada cobrada | aguanta |
| R1 (nuevo): a quien firmó le quitan el rol antes de aplicar | ya no se puede aplicar («sin su fila de aprobación») | informativo (falla cerrado) |
| C1'-a y C5 (declarados) | el agente elige qué mensaje cita, o no cita | caen (declarado) |

Lo que dejó como observación, y su estado:
- `esMio()` dejaba pasar una clave vieja con el contenedor **parado**: **arreglado** (lo que no se puede comprobar no
  se borra).
- `rol_usado` no dice qué ranura llenó cada firma; las firmas se juzgan con los roles **actuales**; una propuesta
  puede quedar `aprobada` sin poder aplicarse si a quien firmó le quitan el rol: **declarados** (puntos 39 a 41 de
  `lo-que-podria-estar-mal.md`). Todos fallan cerrado: nada se aplica sin las firmas que la matriz pide hoy.

## La re-corrida después de los arreglos (mía, sobre `34bd39c`)

- PGlite y PostgreSQL 17.11: `tests 127 · pass 127 · fail 0` y 83 sabotajes cazados en los dos
  (`f10-pg.log`, `f10-sabotajes.log`).
- En el navegador, sobre el código final: capturas 12/12, e2e de la capa 9/9, recorrido de la capa 8/8
  (`recorridos.txt`).
- `npm run validate` tras el último commit: pegado en el reporte final del goal (el log queda fuera del árbol: guardarlo movería el commit que valida).
