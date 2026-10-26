# Evidencia · fase 2 «instancias» (capa Arbrain)

> Nodo `instancias` y lazo `l-instancias` de `docs/goals/capa-arbrain-grafo.json`. Corrida del 2026-10-25 en el
> worktree `capa/arbrain` (base `4b446fb`), con Arbrain **v0.2.10** (`829a9e9`) del lock de la fase 1.
> Todo en `infra/cerebro-personal/` (el detalle, en `docs/CEREBRO-PERSONAL.md`). Datos 100 % sintéticos: ninguno de clientes ni del experto.
>
> Reproducir: `node infra/cerebro-personal/prueba.mjs` (exit 0 = `PRUEBA_OK`). Abajo va la salida real de la última
> corrida, sin editar; las imágenes ya estaban en caché, así que la construcción en frío va aparte, con sus líneas reales.

## Resultado

**`PRUEBA_OK`, exit 0, 44 s** con las imágenes en caché. 73/73 comprobaciones en verde. Al terminar quedaron 0
contenedores, ninguna red del proyecto y el temporal borrado (las imágenes se quedan).

| Punto | Lo que se demostró | Comprobaciones |
|---|---|---|
| Lock y app | `FIRMA_OK v0.2.10 829a9e9 (lock vigente)`; la firma se re-verifica dentro de cada contenedor; el **servidor real** de Arbrain responde en `127.0.0.1:4310` en los dos lados («Corriendo … daemon vivo»), sin login, sin llaves y sin modelo | 11/11 + 2/2 |
| (a) ida y vuelta | La nota hecha en local está en vps con el mismo hash (`f7dee97cd3c0`), la hecha en vps está en local (`124e7be4eda4`). El calendario se une por registro: `["ev-vps-1","ev-local-1"]` en los dos lados. Una skill propia viaja; `daily/`, `settings.local.json` y un `.env` no viajan. `now.md` dice «local» en un lado y «vps» en el otro, y no está en el repo. Los tres en el mismo commit (`6bf49cd`) | 16/16 |
| (b) choque | Mismo evento y misma nota distintos: **exit 2**, nombra `calendario.json eventos[ev-local-1]` y la nota. Hashes antes = después en local (`7196708084ac`, `e76f6c2ca0a2`), vps (`613faf1a937d`, `ebba058ef385`) y centro (ídem vps); el centro no se movió (`1f38438`); la versión local quedó en su rama sin empujar; las copias de choques/ son exactamente las dos versiones. Repetir: exit 2 sin cambios. Luego una persona decide, hace la unión a mano y el job sincroniza (exit 0) | 16/16 |
| (c) versiones | Instancia con **v0.2.9** (`642e7e3`, firma verificada): **exit 3**, refs del centro iguales, cerebros de vps (`46f720898d8f`) y de antigua (`01a0c3fa6a5c`) iguales antes y después, y antigua ni siquiera creó su repo. Además el centro rechaza solo cuatro empujes a mano por el túnel: commit con v0.2.9, código de la app y `now.md`, borrar `main`, y una ref nueva para declarar otra versión | 12/12 |
| (d) datos de la app | Carpeta de datos de cada instancia (12 archivos: lienzos, SQLite del daemon con su WAL, configuración y contraseña): vps `6543eab2dc28` y local `fbd34639cc2b`, iguales antes y después de todo el trabajo del job. Fuera del hash, declarado: `logs/` y `programa/` | 3/3 |
| (e) red | `ss -ltn` en local y vps: los 3 oyentes propios en `127.0.0.1` (más el DNS interno de Docker en `127.0.0.11`). `docker ps` y `docker inspect`: ningún puerto publicado. Red `Internal=true`: sin DNS externo (`EAI_AGAIN`) y sin ruta (`ENETUNREACH`). El relevo rechaza un flujo sin token | 9/9 |
| (f) Cloudflare | `cloudflared 2026.10.0` (pineado por digest) con `--network none`: `ingress validate` → `OK`. Validador propio: `ACCESS_OK` (1/1 reglas con Access) y, con la copia sin Access, `ACCESS_FALLA`, exit 1. `cloudflared` solo da `OK` también a la saboteada: por eso el validador propio | 3/3 |
| (g) órdenes prohibidas | 0 apariciones de `reset --hard`, `push --force`, `clean`, `checkout --ours/--theirs`, `-X ours/theirs`, `stash` o refspecs con `+` en el código del job | 1/1 |

## Construcción en frío (corrida anterior del mismo día)

Con las capas en caché, la corrida de abajo no repite estas verificaciones de construcción (las repite vivas en el
paso 2: `git verify-tag` dentro de cada contenedor). La corrida anterior, el mismo día y con el mismo código salvo el
orden en que se imprimen estas líneas, tuvo que reconstruir todo (había limpiado imágenes huérfanas y se llevó parte de
la caché): `PRUEBA_OK`, exit 0 en 269 s, con la descarga del programa verificada otra vez. Sus líneas de construcción:

```text
FIRMA_OK v0.2.10 829a9e9 (re-verificada dentro de la imagen con el ancla del lock)
descarga verificada: 350039748 bytes, sha256:9759df443ff61613… = la de la etiqueta firmada
PROGRAMA_OK v0.2.10 linux-x64 (sha256 y tamaño de la etiqueta firmada)
FIRMA_OK v0.2.9 642e7e3 (re-verificada dentro de la imagen con el ancla del lock)
```

Y una prueba de humo aparte, con la imagen sola y `--network none` (sin red de ningún tipo):
`listo tras ~6 s: 200 {"build":"mvmkdgl8"}` · `[arbrain] Corriendo (pid 44) en http://127.0.0.1:4310 · daemon vivo`, y
`ss -ltn` con tres oyentes, los tres en `127.0.0.1`.

## Pruebas unitarias (sin Docker)

`node --test infra/cerebro-personal/job/*.test.mjs`:

```text
ok 1 - eventos distintos de cada lado se unen, en el orden de este lado y los nuevos del otro al final
ok 2 - el mismo evento cambiado distinto en los dos lados es choque, y no elige lado
ok 3 - el mismo cambio en los dos lados no es choque
ok 4 - borrado en un lado y sin tocar en el otro: se borra; borrado y cambiado: choque
ok 5 - alta en los dos lados sin base (primera unión): igual se une, distinto choca
ok 6 - ids repetidos: no se puede unir por registro y es choque
ok 7 - hábitos: marcas de días o claves distintas se unen; la misma marca distinta choca
ok 8 - la lista permitida: memoria y plan viajan; now.md, daily, llaves y datos de la app no
ok 9 - CAPAS.json con una ruta de alumno nueva o una skill del autor nueva: la lista no lo cubre
# tests 9
# pass 9
# fail 0
```

## Brechas (declaradas, con su motivo)

- **Tailscale simulado**: el relevo con token imita la forma (los nodos salen, nadie escucha en las instancias), pero
  los bytes no van cifrados ni hay identidad por nodo; en la realidad son WireGuard y la ACL de Tailscale.
- **Windows no probado**: «local» es Linux en un contenedor. Rutas, saltos de línea, tarea programada y llavero de
  Windows quedan para la fase de encender.
- **`logs/` y `programa/` fuera del hash de datos**: los logs los escribe el servidor en marcha y el programa es el
  binario verificado. Ninguna ruta del job los alcanza, pero no se comparan.
- **Sin conversaciones en la app**: los datos de la app son los que ella misma crea al arrancar (lienzos de inicio,
  SQLite, configuración). Crear un chat pide entrar con la contraseña de la app: no se hizo.
- **Lectura del centro sin distinción de nodo**: cualquier nodo con el token puede leer; lo decide la ACL en la realidad.
- **`now.md` mínimo**: sin repeticiones RRULE ni calendarios conectados.
- **La construcción baja de internet**: paquetes de Debian, el programa del release de la etiqueta (aceptado solo con la
  huella firmada) y la imagen de cloudflared. En ejecución no hay salida.

## Salida completa de la corrida final

```text

═══ 0 · Preparación: lock verificado y contexto de construcción fuera del repo ═══
    │ FIRMA_OK v0.2.10 829a9e9 (lock vigente)
  ✓ el lock de la fase 1 sigue vigente (firma, commit y ancla)
  ✓ FIRMA_OK v0.2.9 642e7e3 (solo para la prueba de versiones distintas)
  ✓ pruebas del driver de merge y de la lista permitida: 9 pasan, 0 fallan
  · programa ya compilado de v0.2.10 según la etiqueta firmada: sha256:9759df443ff61613… (350039748 bytes)
  ✓ bundles de las dos etiquetas sacados del espejo sin escribir en él (refs, estado y .git iguales)

═══ 1 · Construcción de las imágenes (las capas quedan en caché) ═══
  ✓ imagen cerebro-personal-red:capa-1 lista (7 pasos en caché)
  ✓ imagen cerebro-personal-programa:v0.2.10 lista (25 pasos en caché)
  ✓ imagen cerebro-personal-instancia:v0.2.10 lista (30 pasos en caché)
  ✓ imagen cerebro-personal-fuente:v0.2.9 lista (20 pasos en caché)
  · tamaño: cerebro-personal-fuente:v0.2.9 742MB · cerebro-personal-instancia:v0.2.10 2GB · cerebro-personal-programa:v0.2.10 2.7GB · cerebro-personal-red:capa-1 541MB

═══ 2 · Arranque: red interna, relevo, vps y local ═══
  ✓ docker compose up (red, vps, local)
    │ VERSION 0.2.10 HEAD-etiqueta 829a9e99f0f6805325e24bd851eb5d1e88c3c67c
    │ Good "git" signature for arbrain-publicacion with ED25519 key SHA256:4P8nBVDwu6QSpWvwbNtSqauB2uznLzx7ubE0tR6lNbg
  ✓ vps: Arbrain v0.2.10 (829a9e9) con su firma verificada dentro del contenedor
    │ VERSION 0.2.10 HEAD-etiqueta 829a9e99f0f6805325e24bd851eb5d1e88c3c67c
    │ Good "git" signature for arbrain-publicacion with ED25519 key SHA256:4P8nBVDwu6QSpWvwbNtSqauB2uznLzx7ubE0tR6lNbg
  ✓ local: Arbrain v0.2.10 (829a9e9) con su firma verificada dentro del contenedor
    │ [arbrain] Corriendo (pid 45) en http://127.0.0.1:4310 · daemon vivo
    │ [arbrain] Datos: /home/arbrain/.local/share/ai.arbrain.servidor
  ✓ vps: el servidor real de Arbrain responde en 127.0.0.1:4310 (/api/version → 200 {"build":"mvmkdgl8"})
    │ [arbrain] Corriendo (pid 31) en http://127.0.0.1:4310 · daemon vivo
    │ [arbrain] Datos: /home/arbrain/.local/share/ai.arbrain.servidor
  ✓ local: el servidor real de Arbrain responde en 127.0.0.1:4310 (/api/version → 200 {"build":"mvmkdgl8"})

═══ (d) Carpeta de datos de la app: huella ANTES de todo el trabajo del job ═══
  · vps: 12 archivos ({"daemon":9,"web":3}), 6543eab2dc28 — fuera del hash: logs, programa
  · local: 12 archivos ({"daemon":9,"web":3}), fbd34639cc2b — fuera del hash: logs, programa

═══ (a) Un cambio de memoria de ida y vuelta (y el plan unido por registro) ═══
  Centro y primera pasada de cada lado:
    │ $ (vps) node sincroniza.mjs crea-centro
    │ CENTRO_LISTO /srv/cerebro/centro.git (sin forzar, sin borrar, hook de política; entrada de resúmenes vacía: /srv/cerebro/entrada-resumenes)
    │ VERSION_DECLARADA 0.2.10 829a9e9 en /srv/cerebro/centro.git
    │ → exit 0
    │ $ (vps) node sincroniza.mjs 
    │ [vps] Arbrain 0.2.10 (829a9e9) verificado; el centro declara la misma versión
    │ [vps] repo del cerebro creado (separado de la copia de Arbrain; árbol = la copia)
    │ [vps] cambios locales: 20 archivo(s) → commit 43cbcce
    │ [vps] del centro: nada que traer
    │ [vps] empujado al centro: 43cbcce
    │ [vps] now.md regenerado en este lado (no viaja): 0 evento(s) hoy, 0 tarea(s)
    │ SINCRONIZADO vps main=43cbcce centro=43cbcce
    │ → exit 0
  ✓ vps funda el cerebro del centro
    │ $ (local) node sincroniza.mjs 
    │ [local] Arbrain 0.2.10 (829a9e9) verificado; el centro declara la misma versión
    │ [local] repo del cerebro creado (separado de la copia de Arbrain; árbol = la copia)
    │ [local] cambios locales: 20 archivo(s) → commit e81bbb6
    │ [local] del centro: unión por registro limpia (a070197)
    │ [local] empujado al centro: a070197
    │ [local] now.md regenerado en este lado (no viaja): 0 evento(s) hoy, 0 tarea(s)
    │ SINCRONIZADO local main=a070197 centro=a070197
    │ → exit 0
  ✓ local se une (las dos semillas de la misma versión coinciden)

  En local: una nota de memoria, un evento, una skill propia y tres cosas que NO viajan. En vps: otra nota, otro evento y una marca de hábito.

  Pasadas: local (sube lo suyo) → vps (une por registro y baja lo de local) → local (avance rápido):
    │ $ (local) node sincroniza.mjs 
    │ [local] Arbrain 0.2.10 (829a9e9) verificado; el centro declara la misma versión
    │ [local] cambios locales: 3 archivo(s) → commit d02ce9e
    │ [local] del centro: nada que traer
    │ [local] empujado al centro: d02ce9e
    │ [local] now.md regenerado en este lado (no viaja): 0 evento(s) hoy, 0 tarea(s)
    │ SINCRONIZADO local main=d02ce9e centro=d02ce9e
    │ → exit 0
  ✓ pasada en local sin choque
    │ $ (vps) node sincroniza.mjs 
    │ [vps] Arbrain 0.2.10 (829a9e9) verificado; el centro declara la misma versión
    │ [vps] cambios locales: 3 archivo(s) → commit 6eac5bb
    │ [vps] del centro: unión por registro limpia (6bf49cd)
    │ [vps] empujado al centro: 6bf49cd
    │ [vps] now.md regenerado en este lado (no viaja): 0 evento(s) hoy, 0 tarea(s)
    │ SINCRONIZADO vps main=6bf49cd centro=6bf49cd
    │ → exit 0
  ✓ pasada en vps sin choque
    │ $ (local) node sincroniza.mjs 
    │ [local] Arbrain 0.2.10 (829a9e9) verificado; el centro declara la misma versión
    │ [local] sin cambios locales
    │ [local] del centro: avance rápido a 6bf49cd
    │ [local] now.md regenerado en este lado (no viaja): 0 evento(s) hoy, 0 tarea(s)
    │ SINCRONIZADO local main=6bf49cd centro=6bf49cd
    │ → exit 0
  ✓ pasada en local sin choque
  ✓ .claude/memory/project/prueba-ida-desde-local.md: local f7dee97cd3c0 = vps f7dee97cd3c0
  ✓ .claude/memory/feedback/prueba-vuelta-desde-vps.md: local 124e7be4eda4 = vps 124e7be4eda4
  ✓ .claude/skills/rutina-sintetica/SKILL.md: local 3ba344a88258 = vps 3ba344a88258
  ✓ .claude/plan/calendario.json: local aed05a3753c9 = vps aed05a3753c9
  ✓ .claude/plan/habitos.json: local e5d466073e4d = vps e5d466073e4d
  ✓ calendario.json en vps tiene los eventos de los dos lados: ["ev-vps-1","ev-local-1"]
  ✓ .claude/daily/prueba-sintetica.md: existe en local y NO viajó al vps
  ✓ .claude/settings.local.json: existe en local y NO viajó al vps
  ✓ .claude/memory/notas-sinteticas.env: existe en local y NO viajó al vps
    │ local now.md: > _Generado por el job del cerebro en **local** el 2026-10-25 a las 09:51. No viaja entre
    │ vps   now.md: > _Generado por el job del cerebro en **vps** el 2026-10-25 a las 09:51. No viaja entre
  ✓ now.md se regeneró en cada lado y no está en el repo del cerebro
  ✓ local, vps y el centro en el mismo commit del cerebro (6bf49cd)

═══ (c) Versiones distintas: una instancia con Arbrain v0.2.9, también verificada ═══
  ✓ instancia «antigua» levantada en la misma red privada
    │ VERSION 0.2.9
    │ Good "git" signature for arbrain-publicacion with ED25519 key SHA256:4P8nBVDwu6QSpWvwbNtSqauB2uznLzx7ubE0tR6lNbg
    │ $ (antigua) node sincroniza.mjs 
    │ [antigua] DETENIDO (version): las versiones de Arbrain de los dos lados difieren: no sincronizo
    │ [antigua]   · este lado: 0.2.9 (642e7e3), firma verificada
    │ [antigua]   · el centro declara otra versión (marca b1a61aa53110); este lado esperaba 0578102eb3e9
    │ [antigua]   · Actualiza las dos instancias a la misma versión con el procedimiento oficial (es un CDC) y vuelve a correr el job.
    │ [antigua]   · No se tocó el cerebro de ningún lado ni el centro.
    │ → exit 3
  ✓ el job de antigua se detiene con exit 3: versiones distintas, no sincroniza
  ✓ el centro: refs iguales antes y después (6bf49cd refs/heads/main · b1a61aa refs/meta/version-arbrain)
  ✓ el cerebro de vps: 46f720898d8f antes = 46f720898d8f después
  ✓ el cerebro de antigua: 01a0c3fa6a5c antes = 01a0c3fa6a5c después
  ✓ antigua ni siquiera creó su repo del cerebro: la versión se comprueba antes de tocar nada
    │ # Aviso del cerebro (antigua): las versiones de Arbrain de los dos lados difieren: no sincronizo
    │ - Cuándo: 2026-10-25T15:51:14.874Z
    │ - Tipo: version
    │ - este lado: 0.2.9 (642e7e3), firma verificada
    │ - el centro declara otra versión (marca b1a61aa53110); este lado esperaba 0578102eb3e9
    │ - Actualiza las dos instancias a la misma versión con el procedimiento oficial (es un CDC) y vuelve a correr el job.
    │ - No se tocó el cerebro de ningún lado ni el centro.
  ✓ dejó el archivo de aviso (AVISO.md y AVISO.json)

  Y el centro se defiende solo: empujes hechos A MANO desde antigua por el túnel, sin el job:
    │ un commit hecho con v0.2.9:
    │ remote: CENTRO_RECHAZA empuje de «antigua» por el túnel:        
    │ remote:   · 752c278: hecho con Arbrain 0.2.9 y el centro declara 0.2.10        
    │  ! [remote rejected] HEAD -> main (pre-receive hook declined)
    │ error: failed to push some refs to 'ext::node /opt/cerebro-sync/tunel.mjs conecta vps %S'
  ✓ el centro rechaza: un commit hecho con v0.2.9
    │ código de la app y now.md con la versión correcta:
    │ remote: CENTRO_RECHAZA empuje de «antigua» por el túnel:        
    │ remote:   · 5e0fa4c: .claude/now.md → no viaja: Es una proyección (hitos, hoy, semana) de las fuentes que sí viajan: cada lado la regenera; sincronizarla solo produciría choques.        
    │ remote:   · 5e0fa4c: arbrain/server/src/inyectado.ts → fuera de la lista permitida        
    │  ! [remote rejected] HEAD -> main (pre-receive hook declined)
  ✓ el centro rechaza: código de la app y now.md con la versión correcta
    │ borrar main:
    │ remote: CENTRO_RECHAZA empuje de «antigua» por el túnel:        
    │ remote:   · refs/heads/main: no se borra        
    │  ! [remote rejected] main (pre-receive hook declined)
    │ error: failed to push some refs to 'ext::node /opt/cerebro-sync/tunel.mjs conecta vps %S'
  ✓ el centro rechaza: borrar main
    │ declarar otra versión con una ref nueva (refs/meta/version-v029):
    │ remote: CENTRO_RECHAZA empuje de «antigua» por el túnel:        
    │ remote:   · refs/meta/version-v029: solo se acepta refs/heads/main        
    │  ! [remote rejected] 0578102eb3e98528c7e99d1250b19f83960721b6 -> refs/meta/version-v029 (pre-receive hook declined)
    │ error: failed to push some refs to 'ext::node /opt/cerebro-sync/tunel.mjs conecta vps %S'
  ✓ el centro rechaza: declarar otra versión con una ref nueva (refs/meta/version-v029)
  ✓ tras los cuatro intentos, las refs del centro siguen iguales
    · cambiar la ref que declara la versión (refs/meta/version-arbrain) ni se intenta: el cliente se niega sin --force, y
      con --force el hook la rechazaría igual (solo acepta refs/heads/main). La versión la declara el VPS en local: declara-version.

═══ (b) Choque provocado: el mismo evento y la misma nota, cambiados distinto en cada lado ═══
    │ $ (vps) node sincroniza.mjs 
    │ [vps] Arbrain 0.2.10 (829a9e9) verificado; el centro declara la misma versión
    │ [vps] cambios locales: 2 archivo(s) → commit 1f38438
    │ [vps] del centro: nada que traer
    │ [vps] empujado al centro: 1f38438
    │ [vps] now.md regenerado en este lado (no viaja): 0 evento(s) hoy, 0 tarea(s)
    │ SINCRONIZADO vps main=1f38438 centro=1f38438
    │ → exit 0
  ✓ vps sube primero su versión al centro
  ANTES:
    .claude/memory/project/prueba-ida-desde-local.md
      local 7196708084ac · vps 613faf1a937d · centro 613faf1a937d
    .claude/plan/calendario.json
      local e76f6c2ca0a2 · vps ebba058ef385 · centro ebba058ef385
    centro main 1f38438 · local main 6bf49cd
    │ $ (local) node sincroniza.mjs 
    │ [local] Arbrain 0.2.10 (829a9e9) verificado; el centro declara la misma versión
    │ [local] cambios locales: 2 archivo(s) → commit 026f996
    │ [local] DETENIDO (choque): el mismo contenido cambió distinto en los dos lados: me detengo sin elegir
    │ [local]   · archivo en choque: .claude/memory/project/prueba-ida-desde-local.md
    │ [local]   · archivo en choque: .claude/plan/calendario.json
    │ [local]   · registro en choque: .claude/plan/calendario.json eventos[ev-local-1]
    │ [local]   · la versión local sigue en el disco y en la rama local (026f996, sin empujar); la del centro, en el centro (1f38438)
    │ [local]   · copias de las dos versiones (y la base): /home/arbrain/.cerebro-sync/choques/026f996d8395-contra-1f384383a426
    │ [local]   · Resolverlo es de una persona: decide el contenido, haz la unión a mano en este repo y vuelve a correr el job.
    │ → exit 2
  DESPUÉS:
    .claude/memory/project/prueba-ida-desde-local.md
      local 7196708084ac · vps 613faf1a937d · centro 613faf1a937d
    .claude/plan/calendario.json
      local e76f6c2ca0a2 · vps ebba058ef385 · centro ebba058ef385
    centro main 1f38438 · local main 026f996
  ✓ el job de local se detiene con exit 2 (choque) y no empuja
  ✓ nombra el registro en choque: calendario.json eventos[ev-local-1]
  ✓ nombra la nota en choque
  ✓ .claude/memory/project/prueba-ida-desde-local.md: local, vps y centro iguales antes y después
  ✓ .claude/memory/project/prueba-ida-desde-local.md: las dos versiones siguen distintas (nadie eligió un lado)
  ✓ .claude/plan/calendario.json: local, vps y centro iguales antes y después
  ✓ .claude/plan/calendario.json: las dos versiones siguen distintas (nadie eligió un lado)
  ✓ el centro no se movió
  ✓ la versión local quedó en su rama del cerebro, sin empujar (1 commit pendiente)
    │ # Aviso del cerebro (local): el mismo contenido cambió distinto en los dos lados: me detengo sin elegir
    │ - Cuándo: 2026-10-25T15:51:22.248Z
    │ - Tipo: choque
    │ - archivo en choque: .claude/memory/project/prueba-ida-desde-local.md
    │ - archivo en choque: .claude/plan/calendario.json
    │ - registro en choque: .claude/plan/calendario.json eventos[ev-local-1]
    │ - la versión local sigue en el disco y en la rama local (026f996, sin empujar); la del centro, en el centro (1f38438)
    │ - copias de las dos versiones (y la base): /home/arbrain/.cerebro-sync/choques/026f996d8395-contra-1f384383a426
    │ - Resolverlo es de una persona: decide el contenido, haz la unión a mano en este repo y vuelve a correr el job.
    │ ./026f996d8395-contra-1f384383a426/.claude/memory/project/prueba-ida-desde-local.md.base
    │ ./026f996d8395-contra-1f384383a426/.claude/memory/project/prueba-ida-desde-local.md.centro
    │ ./026f996d8395-contra-1f384383a426/.claude/memory/project/prueba-ida-desde-local.md.local
    │ ./026f996d8395-contra-1f384383a426/.claude/plan/calendario.json.base
    │ ./026f996d8395-contra-1f384383a426/.claude/plan/calendario.json.centro
    │ ./026f996d8395-contra-1f384383a426/.claude/plan/calendario.json.local
  ✓ las copias de choques/ son exactamente las dos versiones (local y centro)

  Otra pasada en local (el choque sigue) y una en vps (el centro sigue sirviendo al otro lado):
    │ $ (local) node sincroniza.mjs 
    │ [local] Arbrain 0.2.10 (829a9e9) verificado; el centro declara la misma versión
    │ [local] sin cambios locales
    │ [local] DETENIDO (choque): el mismo contenido cambió distinto en los dos lados: me detengo sin elegir
    │ [local]   · archivo en choque: .claude/memory/project/prueba-ida-desde-local.md
    │ [local]   · archivo en choque: .claude/plan/calendario.json
    │ [local]   · registro en choque: .claude/plan/calendario.json eventos[ev-local-1]
    │ [local]   · la versión local sigue en el disco y en la rama local (026f996, sin empujar); la del centro, en el centro (1f38438)
    │ [local]   · copias de las dos versiones (y la base): /home/arbrain/.cerebro-sync/choques/026f996d8395-contra-1f384383a426
    │ [local]   · Resolverlo es de una persona: decide el contenido, haz la unión a mano en este repo y vuelve a correr el job.
    │ → exit 2
  ✓ local: exit 2 otra vez, sin cambiar nada (las copias siguen en 1 carpeta: el mismo choque no se duplica)
    │ $ (vps) node sincroniza.mjs 
    │ [vps] Arbrain 0.2.10 (829a9e9) verificado; el centro declara la misma versión
    │ [vps] sin cambios locales
    │ [vps] del centro: nada que traer
    │ [vps] now.md regenerado en este lado (no viaja): 0 evento(s) hoy, 0 tarea(s)
    │ SINCRONIZADO vps main=1f38438 centro=1f38438
    │ → exit 0
  ✓ vps: exit 0

  Y cuando una persona decide (simulada aquí: un título nuevo para el evento y su propio texto para la nota),
  la unión la hace ELLA a mano en el repo del cerebro, con los comandos del README; luego el job vuelve a sincronizar:
    │ Auto-merging .claude/plan/calendario.json
    │ CONFLICT (content): Merge conflict in .claude/plan/calendario.json
    │ Automatic merge failed; fix conflicts and then commit the result.
    │ (la unión a mano se detiene en el choque, como debe)
    │ commit de la persona: 8fe9ea0
    │ $ (local) node sincroniza.mjs 
    │ [local] Arbrain 0.2.10 (829a9e9) verificado; el centro declara la misma versión
    │ [local] sin cambios locales
    │ [local] del centro: nada que traer
    │ [local] empujado al centro: 8fe9ea0
    │ [local] now.md regenerado en este lado (no viaja): 0 evento(s) hoy, 0 tarea(s)
    │ [local] el aviso anterior quedó resuelto y archivado en avisos/
    │ SINCRONIZADO local main=8fe9ea0 centro=8fe9ea0
    │ → exit 0
    │ $ (vps) node sincroniza.mjs 
    │ [vps] Arbrain 0.2.10 (829a9e9) verificado; el centro declara la misma versión
    │ [vps] sin cambios locales
    │ [vps] del centro: avance rápido a 8fe9ea0
    │ [vps] now.md regenerado en este lado (no viaja): 0 evento(s) hoy, 0 tarea(s)
    │ SINCRONIZADO vps main=8fe9ea0 centro=8fe9ea0
    │ → exit 0
  ✓ tras la decisión de la persona, local y vps sincronizan (exit 0)
  ✓ los dos lados tienen lo que decidió la persona (ni la versión de local ni la del VPS)
  ✓ el aviso del choque quedó archivado en avisos/

═══ (d) Carpeta de datos de la app: huella DESPUÉS ═══
  ✓ vps: 12 archivos, 6543eab2dc28 antes = 6543eab2dc28 después
  ✓ local: 12 archivos, fbd34639cc2b antes = fbd34639cc2b después
  ✓ el repo del cerebro no rastrea nada de la carpeta de datos, llaves ni bases

═══ (e) Red privada simulada: qué escucha, qué se publica y si hay salida ═══
    │ $ (local) ss -ltn
    │ State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess
    │ LISTEN 0      511        127.0.0.1:4310       0.0.0.0:*          
    │ LISTEN 0      511        127.0.0.1:46407      0.0.0.0:*          
    │ LISTEN 0      511        127.0.0.1:44153      0.0.0.0:*          
    │ LISTEN 0      4096      127.0.0.11:39393      0.0.0.0:*
  ✓ local: 3 oyentes propios, todos en 127.0.0.1 (127.0.0.1:4310, 127.0.0.1:46407, 127.0.0.1:44153)
    · 127.0.0.11:39393: el DNS interno de Docker (127.0.0.11, lo pone dockerd en cada red de usuario; en la realidad no existe)
    │ $ (vps) ss -ltn
    │ State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess
    │ LISTEN 0      511        127.0.0.1:35043      0.0.0.0:*          
    │ LISTEN 0      511        127.0.0.1:35055      0.0.0.0:*          
    │ LISTEN 0      4096      127.0.0.11:42577      0.0.0.0:*          
    │ LISTEN 0      511        127.0.0.1:4310       0.0.0.0:*
  ✓ vps: 3 oyentes propios, todos en 127.0.0.1 (127.0.0.1:35043, 127.0.0.1:35055, 127.0.0.1:4310)
    · 127.0.0.11:42577: el DNS interno de Docker (127.0.0.11, lo pone dockerd en cada red de usuario; en la realidad no existe)
    │ $ (red) ss -ltn
    │ State  Recv-Q Send-Q Local Address:Port  Peer Address:PortProcess
    │ LISTEN 0      4096      127.0.0.11:35017      0.0.0.0:*          
    │ LISTEN 0      511          0.0.0.0:7443       0.0.0.0:*
  ✓ red (el relevo, no es una instancia): su único oyente es el 7443 de la red interna
    │ $ docker ps --filter label=com.docker.compose.project=cerebro-personal --format '{{.Names}} {{.Ports}}'
    │ cerebro-personal-antigua-1  puertos: «»
    │ cerebro-personal-vps-1  puertos: «»
    │ cerebro-personal-local-1  puertos: «»
    │ cerebro-personal-red-1  puertos: «»
  ✓ docker ps: 4 contenedores y ninguno publica puertos
  ✓ docker inspect: PortBindings vacío en todos
    │ $ docker stats --no-stream (memoria y CPU en este momento, informativo)
    │ cerebro-personal-antigua-1 5.512MiB / 2GiB CPU 0.00%
    │ cerebro-personal-vps-1 163.2MiB / 2GiB CPU 0.05%
    │ cerebro-personal-local-1 152.8MiB / 2GiB CPU 0.06%
    │ cerebro-personal-red-1 12.19MiB / 15.55GiB CPU 0.00%
  ✓ la red «privada» es interna (Internal=true: sin salida a internet)
  ✓ local: sin DNS externo (EAI_AGAIN); 9.9.9.9:443 sin salida (ENETUNREACH)
  ✓ vps: sin DNS externo (EAI_AGAIN); 9.9.9.9:443 sin salida (ENETUNREACH)
  ✓ el relevo rechaza un flujo sin el token de la red: {"ok":false,"error":"token de la red no válido"}

═══ (f) Puerta de Cloudflare (solo configuración): Access obligatorio, validada sin conexión ═══
  · copia saboteada: la misma configuración sin el bloque originRequest.access de la regla 1 (6 líneas menos)
    │ $ docker run --rm --network none cloudflare/cloudflared:2026.10.0@sha256:… --version
    │ cloudflared version 2026.10.0 (built 2026-10-05-17:58 UTC)
    │ $ … tunnel --config config.yml ingress validate   (sin red)
    │ Validating rules from /etc/cloudflared/config.yml
    │ OK
  ✓ cloudflared pineado (versión y digest) valida las reglas sin conexión: OK
    │ $ … ingress rule https://cerebro.example.com/
    │ Using rules from /etc/cloudflared/config.yml
    │ Matched rule #0
    │ 	hostname: cerebro.example.com
    │ 	service: http://127.0.0.1:4310
    │ $ node cloudflared/valida-access.mjs config.yml
    │   ✓ regla 1: cerebro.example.com → http://127.0.0.1:4310
    │   ✓ regla 2: (sin hostname) → http_status:404 (final)
    │ ACCESS_OK config.yml: 1/1 regla(s) de servicio con Access obligatorio, solo 127.0.0.1, final http_status:404
  ✓ validador propio: ACCESS_OK, Access obligatorio en cada regla de servicio
    │ $ node cloudflared/valida-access.mjs config-saboteada.yml
    │   ✗ regla 1: cerebro.example.com → http://127.0.0.1:4310
    │       · sin originRequest.access: la regla no exige Access
    │   ✓ regla 2: (sin hostname) → http_status:404 (final)
    │ ACCESS_FALLA config-saboteada.yml: 1 problema(s)
    │ → exit 1
  ✓ con la copia saboteada (una regla sin Access) el validador sale en ROJO
  · cloudflared solo, con la saboteada: «OK» (exit 0). No revisa Access: por eso el validador propio.

═══ (g) El código del job no contiene órdenes prohibidas ═══
    │ centro-pre-receive.mjs, fusiona-registros.mjs, politica.mjs, regenera-now.mjs, sincroniza.mjs, tunel.mjs: 0 apariciones
  ✓ ni reset --hard, ni push --force, ni clean, ni checkout --ours/--theirs, ni -X ours/theirs, ni stash, ni refspecs con «+» (6 archivos)

═══ Resumen ═══
  ✓ (0) 11/11 comprobaciones
  ✓ (app) 2/2 comprobaciones
  ✓ (a) 16/16 comprobaciones
  ✓ (b) 16/16 comprobaciones
  ✓ (c) 12/12 comprobaciones
  ✓ (d) 3/3 comprobaciones
  ✓ (e) 9/9 comprobaciones
  ✓ (f) 3/3 comprobaciones
  ✓ (g) 1/1 comprobaciones
  · contenedores y red bajados (ok); las imágenes quedan en caché

PRUEBA_OK: (a)-(g) en verde
```

## Repetida sobre el código final (2026-10-25, coordinador)

Tras reiniciar la máquina (10:17) y tras el último cambio de `imagen/escena.mjs` (la hora ISO armada por partes, commit
en la rama `capa/arbrain`), con el servidor del worktree arriba para el caso (h):

```text
$ CAPA_RESUMEN_URL=http://localhost:3011/api/recepcion/resumen npm run prueba:instancias
  ✓ (a) 16/16 comprobaciones
  ✓ (b) 16/16 comprobaciones
  ✓ (c) 12/12 comprobaciones
  ✓ (d) 3/3 comprobaciones
  ✓ (e) 9/9 comprobaciones
  ✓ (f) 3/3 comprobaciones
  ✓ (g) 1/1 comprobaciones
  ✓ (h) 9/9 comprobaciones
PRUEBA_OK: (a)-(h) en verde
```

Sin el servidor, (h) sale en rojo («`CAPA_RESUMEN_URL` … sin definir») y la prueba da `PRUEBA_FALLA`: no correr no es
pasar. Al terminar no queda ningún contenedor del proyecto.
