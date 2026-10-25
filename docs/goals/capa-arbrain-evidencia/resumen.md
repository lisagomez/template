# Evidencia · fase 6 «resumen» (capa Arbrain)

> Nodo `resumen` y lazo `l-resumen` de `docs/goals/capa-arbrain-grafo.json`: convergen la lectura de solo conteos del
> producto nuevo (`/api/recepcion/resumen`, arista `e-resumen-producto`) y el job del VPS (`infra/cerebro-personal/job/
> resumenes.mjs`, PASO 5b, arista `e-resumen-instancias`). Merge hecho por el coordinador; fuentes integradas: la ruta y
> la composición de Recepción (agente del producto), el enganche del job (agente de instancias) y `validaResumen` /
> `lineaDeAgenda` de la capa.
>
> Reproducir: `CAPA_RESUMEN_URL=http://localhost:3011/api/recepcion/resumen node infra/cerebro-personal/prueba.mjs`
> (con el servidor del worktree arriba). Sin Docker: `node --test infra/cerebro-personal/job/resumenes.test.mjs`.

## Cómo funciona

- El producto declara en su composición qué puede contar (`resumen: { conteos: [citas-hoy, citas-manana], enlaces:
  [mostrador] }`) y su ruta devuelve solo eso, validado con `validaResumen` antes de salir.
- El laboratorio decide QUÉ productos informan (`job/resumenes-permitidos.json`: hoy solo `recepcion`, sintético). Un
  producto no se autoriza solo, y la mesa real de Soporte SAP no está: entra con la revisión 14 de su AISIA.
- El VPS valida con la MISMA capa empaquetada (`@tu-scope/capa` y su `zod` 4.6.1 dentro de la imagen, sin red), escribe
  una tarea `resumen-<producto>-<fecha>` cuyo texto genera el job (`lineaDeAgenda`: números y claves declaradas) y la
  tarea viaja a local con el cerebro, unida por registro.
- Un archivo con cualquier campo de más, una clave inventada, un texto en un conteo, una consulta en un enlace o de un
  producto no permitido se rechaza ENTERO y se queda en la cuarentena del VPS, fuera del cerebro, con su motivo.
- El transporte es simulado: la prueba trae la lectura del servidor del producto y la deja en la entrada del VPS. En la
  realidad la trae el job con un token de solo lectura (FUERA DEL HECHO §2).

## Prueba sin Docker

```text
ok 1 - un resumen válido llega a la agenda como tarea de números y enlaces, con id estable
ok 2 - texto libre, clave inventada, consulta en el enlace, producto no permitido o JSON roto: se rechaza entero y la agenda no cambia
# pass 2
# fail 0
```

## La corrida en contenedores (caso (h) y el resumen final, salida real sin editar)

```text
═══ (h) Resumen de producto: del producto a la agenda del cerebro, solo conteos y enlaces ═══
  ✓ CAPA_RESUMEN_URL apunta a la lectura de conteos del producto (http://localhost:3011/api/recepcion/resumen)
  ✓ GET http://localhost:3011/api/recepcion/resumen → 200
    │ {"resumen":1,"producto":"recepcion","generado":"2026-10-25T16:10:43.129Z","conteos":{"citas-hoy":3,"citas-manana":1},"enlaces":{"mostrador":"/recepcion"}}
    │ $ (vps) node sincroniza.mjs 
    │ [vps] Arbrain 0.2.10 (829a9e9) verificado; el centro declara la misma versión
    │ [vps] RESUMEN_RECHAZADO sabotaje.json: 1 motivo(s); queda en la cuarentena del VPS, fuera del cerebro
    │ [vps] sin cambios locales
    │ [vps] del centro: nada que traer
    │ [vps] now.md regenerado en este lado (no viaja): 0 evento(s) hoy, 0 tarea(s)
    │ SINCRONIZADO vps main=9682224 centro=9682224
    │ → exit 0
  ✓ un resumen con un campo de texto libre: RESUMEN_RECHAZADO
  ✓ el cerebro de vps, igual antes y después del rechazo (be70bec1d4ab)
    │ sabotaje.json
    │ sabotaje.json.motivo.json
    │ {
    │   "motivos": [
    │     "(raíz): Unrecognized key: \"nota\""
    │   ]
    │ }
  ✓ el archivo rechazado se queda en la cuarentena del VPS, fuera del cerebro, con su motivo
    │ $ (vps) node sincroniza.mjs 
    │ [vps] Arbrain 0.2.10 (829a9e9) verificado; el centro declara la misma versión
    │ [vps] RESUMEN_ACEPTADO producto.json → tarea resumen-recepcion-2026-10-25
    │ [vps] cambios locales: 1 archivo(s) → commit 7f6f678
    │ [vps] del centro: nada que traer
    │ [vps] empujado al centro: 7f6f678
    │ [vps] now.md regenerado en este lado (no viaja): 0 evento(s) hoy, 1 tarea(s)
    │ SINCRONIZADO vps main=7f6f678 centro=7f6f678
    │ → exit 0
  ✓ la lectura del producto: RESUMEN_ACEPTADO
    │ [
    │   {
    │     "id": "resumen-recepcion-2026-10-25",
    │     "titulo": "recepcion: 3 citas hoy, 1 citas manana · /recepcion",
    │     "descripcion": "Resumen de producto: solo conteos y enlaces.",
    │     "fecha": "2026-10-25",
    │     "duracionMin": 0,
    │     "prioridad": 4,
    │     "hecha": false,
    │     "hechaEn": null,
    │     "etiquetas": [
    │       "resumen-de-producto"
    │     ]
    │   }
    │ ]
  ✓ en la agenda del cerebro del VPS: una tarea con los conteos y el enlace del producto
  ✓ ninguna tarea lleva el texto libre del sabotaje
    │ $ (local) node sincroniza.mjs 
    │ [local] Arbrain 0.2.10 (829a9e9) verificado; el centro declara la misma versión
    │ [local] sin cambios locales
    │ [local] del centro: avance rápido a 7f6f678
    │ [local] now.md regenerado en este lado (no viaja): 0 evento(s) hoy, 1 tarea(s)
    │ SINCRONIZADO local main=7f6f678 centro=7f6f678
    │ → exit 0
  ✓ la tarea del resumen viajó a local con el cerebro (unión por registro)

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
  ✓ (h) 9/9 comprobaciones
  · contenedores y red bajados (ok); las imágenes quedan en caché

PRUEBA_OK: (a)-(h) en verde
```
