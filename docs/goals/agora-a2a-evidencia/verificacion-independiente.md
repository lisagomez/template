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

## La re-corrida después de los arreglos

(Se agrega abajo al terminar: las suites, los sabotajes en PGlite y en PostgreSQL 17.11 y el `validate` tras el último
commit.)
