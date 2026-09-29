# Propuesta de CDC — skill `readme`: README product first (SIN FIRMAR)

> **Estado: SIN FIRMAR.** Rama `readme-product-first`, commits locales sobre `58174c9` (sin push, sin PR, sin
> merge). Nada de esto se promueve hasta que el laboratorio firme con este diff delante. La entrada de la
> bitácora va redactada en el §5 con «Aprobado por: pendiente» y se copia a `BITACORA-CDC.md` solo al firmar.

## 1. Qué cambia, por qué y con qué radio

**Pedido del laboratorio (2026-09-29):** que los README de herramientas y apps se estructuren product first —qué
hace, casos de uso, requerimientos de infraestructura, y después lo demás— con un skill con comandos, y que se
reestructuren **todos** los que existen.

| Pieza | Qué es | Control |
|---|---|---|
| `.claude/skills/readme/` (`SKILL.md`, `contrato.json`, `plantilla.md`) | skill nuevo con tres comandos: `nuevo`, `reestructura`, `revisa` | C1 (skill nuevo) |
| `.claude/skills/crear-herramienta/SKILL.md` | paso 5 nuevo: el README con `/readme nuevo` antes de empaquetar | C1 (skill) |
| `.claude/gobernanza/golden-sets/contratos.json` | +9 contratos para `readme` (8 `patron`, 1 `prohibido`) y +1 para `crear-herramienta` | C2 capa A |
| `AGENTS.md` (+3 líneas en el árbol, conteo 26 → 27) · `CLAUDE.md` (conteo) · `GEMINI.md` (regenerado) | la rama corta que enruta al skill | C1 (instrucciones de todos los agentes) |
| `README.md`, `.claude/README.md` | conteo 26 → 27 y la fila del skill en su tabla de skills | conteos (3e) |
| `scripts/revisa-readmes.mjs` + `scripts/lib/readmes.mjs` | auditor determinista (`npm run revisa:readmes`), con `--prueba` | código |
| `scripts/no-perdida-readme.mjs` + `scripts/lib/no-perdida.mjs` | prueba de no pérdida (`npm run readme:no-perdida`), con `--prueba` | código |
| `docs/CREAR-UNA-HERRAMIENTA.md`, `docs/EMPAQUETAR-HERRAMIENTA.md` | la puerta y el contrato mandan al skill; el tarball del andamio pasa de 9 a 10 archivos | doc |
| `inventario/activos.json` + `INVENTARIO.md` | los dos scripts nuevos, asentados en `TPL-skills` | inventario |
| 12 README de la tabla + el molde `src/features/.template/README.md` | reestructurados, 0 líneas borradas sin justificar, 0 cifras perdidas | contenido |
| `tools/ejemplo-herramienta/README.md` (nuevo) | el andamio nace product first | contenido |
| `src/features/etiquetas/README.md` (nuevo) | `/readme nuevo` estrenado en un caso real | contenido |

**Radio:** skills (2), instrucciones de sistema (`AGENTS.md`, espejo `GEMINI.md`), contratos C2. Ningún modelo,
dependencia ni imagen cambia. `+218` tokens en el prefijo de cada sesión (10623 → 10841, 90 % de 12000).

## 2. Lo que se pide firmar (dos decisiones separadas)

1. **Promover el skill y sus cambios** (§7, diff completo): el skill `readme`, el paso nuevo de
   `crear-herramienta`, la rama de `AGENTS.md`, los contratos C2 y los conteos.
2. **Volver gate el auditor** (§4, diff SIN APLICAR): `revisa:readmes` en el perfil `validate` de
   `.claude/gates.json`. Es radio sistema: decide qué pasa y qué no en todo el repo. Hasta la firma, la regla
   dispara al crear (skill, `crear-herramienta`, andamio y molde), pero nada la hace cumplir en cada integración.

## 3. Evidencia

### 3.1 El auditor ANTES, sobre el estado de partida (`npm run revisa:readmes -- --desde 58174c9`)

Los 12 README de la tabla del spec no conformes, y el molde de features (el 13.º en alcance) tampoco:

```
Contrato product first (.claude/skills/readme/contrato.json): Qué hace → Casos de uso → Requerimientos de infraestructura → lo demás

  ✗ src/features/.template/README.md
      · falta «Qué hace»
      · falta «Casos de uso»
      · falta «Requerimientos de infraestructura»
  ✗ src/features/estudio-pymes/README.md
      · antes de «Qué hace» solo va la propuesta de valor: 11 líneas (máximo 4); lo técnico va después de las tres de producto
      · falta «Qué hace»
      · falta «Casos de uso»
      · falta «Requerimientos de infraestructura»
  ✗ src/features/laboratorio-pymes/README.md
      · falta «Qué hace»
      · falta «Casos de uso»
      · falta «Requerimientos de infraestructura»
  ✗ src/features/reel/README.md
      · antes de «Qué hace» solo va la propuesta de valor: 15 líneas (máximo 4); lo técnico va después de las tres de producto
      · el preámbulo lleva código, tabla o subsección: va después de las tres de producto
      · falta «Qué hace»
      · falta «Casos de uso»
      · falta «Requerimientos de infraestructura»
  ✗ tools/asesor-ventas/README.md
      · antes de «Qué hace» solo va la propuesta de valor: 15 líneas (máximo 4); lo técnico va después de las tres de producto
      · el preámbulo lleva código, tabla o subsección: va después de las tres de producto
      · falta «Qué hace»
      · falta «Casos de uso»
      · falta «Requerimientos de infraestructura»
  ✗ tools/conocimiento/README.md
      · antes de «Qué hace» solo va la propuesta de valor: 9 líneas (máximo 4); lo técnico va después de las tres de producto
      · el preámbulo lleva código, tabla o subsección: va después de las tres de producto
      · falta «Qué hace»
      · falta «Casos de uso»
      · falta «Requerimientos de infraestructura»
  ✗ tools/dictado/README.md
      · antes de «Qué hace» solo va la propuesta de valor: 9 líneas (máximo 4); lo técnico va después de las tres de producto
      · falta «Casos de uso»
      · falta «Requerimientos de infraestructura»
  ✗ tools/etiquetas-gs1/README.md
      · antes de «Qué hace» solo va la propuesta de valor: 6 líneas (máximo 4); lo técnico va después de las tres de producto
      · falta «Qué hace»
      · falta «Casos de uso»
      · falta «Requerimientos de infraestructura»
  ✗ tools/extractor-documental/README.md
      · antes de «Qué hace» solo va la propuesta de valor: 7 líneas (máximo 4); lo técnico va después de las tres de producto
      · falta «Qué hace»
      · falta «Casos de uso»
      · falta «Requerimientos de infraestructura»
  ✗ tools/grafo-conocimiento/README.md
      · antes de «Qué hace» solo va la propuesta de valor: 20 líneas (máximo 4); lo técnico va después de las tres de producto
      · el preámbulo lleva código, tabla o subsección: va después de las tres de producto
      · falta «Qué hace»
      · falta «Casos de uso»
      · falta «Requerimientos de infraestructura»
  ✗ tools/pymes-marketing/README.md
      · antes de «Qué hace» solo va la propuesta de valor: 19 líneas (máximo 4); lo técnico va después de las tres de producto
      · el preámbulo lleva código, tabla o subsección: va después de las tres de producto
      · falta «Qué hace»
      · falta «Casos de uso»
      · falta «Requerimientos de infraestructura»
  ✗ tools/reel/README.md
      · falta «Casos de uso»
      · falta «Requerimientos de infraestructura»
      · «Qué hace» no dice qué NO hace
  ✗ tools/voz/README.md
      · antes de «Qué hace» solo va la propuesta de valor: 5 líneas (máximo 4); lo técnico va después de las tres de producto
      · falta «Casos de uso»
      · falta «Requerimientos de infraestructura»

Excluidos con motivo (13):
  · .claude/README.md — documentación de la fábrica; la gobernanza lee sus cifras
  · .claude/design-systems/README.md — catálogo de referencias de diseño, no un producto
  · .claude/goals/voz-casos-ampliados/propuestas/README.md — material de trabajo de un goal, no un producto
  · .claude/skills/SKILLS_README.md — documentación de skills: se rige por SKILL.md y los contratos C2, no por este contrato
  · .claude/skills/goal-compiler/README-PAQUETE.md — documentación de skills: se rige por SKILL.md y los contratos C2, no por este contrato
  · .claude/skills/google-workspace/README-PAQUETE.md — documentación de skills: se rige por SKILL.md y los contratos C2, no por este contrato
  · .claude/skills/knowledge-search/README-PAQUETE.md — documentación de skills: se rige por SKILL.md y los contratos C2, no por este contrato
  · .claude/skills/spec-generator/README.md — documentación de skills: se rige por SKILL.md y los contratos C2, no por este contrato
  · README.md — README raíz: lo lee la gobernanza (cifras de comprobaciones, conteo de skills, sección de la capa); no es de un producto
  · erp/migrations/README.md — reglas de las migraciones del ERP (documentación de arquitectura)
  · src/features/README.md — arquitectura feature-first, no una feature
  · src/shared/README.md — arquitectura del código compartido, no un producto
  · trayectorias/README.md — formato de datos de la fábrica, no un producto

Sin README: pendientes, se listan y no se crean solos (11):
  · src/features/a2a
  · src/features/ajustes
  · src/features/auth
  · src/features/dashboard
  · src/features/dictado
  · src/features/etiquetas
  · src/features/historial
  · src/features/laboratorio-etiquetas
  · src/features/laboratorio-voz
  · src/features/project-settings
  · tools/ejemplo-herramienta

README NO conformes: 13 en alcance · 0 conformes · 13 no conformes · 13 excluidos · 11 sin README (pendientes).
exit 1
```

### 3.2 El auditor DESPUÉS (`npm run revisa:readmes`)

Los 12, el molde, el andamio y la feature de etiquetas: 15 de 15 conformes. Las features sin README quedan
**listadas como pendientes**, no creadas:

```
Contrato product first (.claude/skills/readme/contrato.json): Qué hace → Casos de uso → Requerimientos de infraestructura → lo demás

  ✓ src/features/.template/README.md
  ✓ src/features/estudio-pymes/README.md
  ✓ src/features/etiquetas/README.md
  ✓ src/features/laboratorio-pymes/README.md
  ✓ src/features/reel/README.md
  ✓ tools/asesor-ventas/README.md
  ✓ tools/conocimiento/README.md
  ✓ tools/dictado/README.md
  ✓ tools/ejemplo-herramienta/README.md
  ✓ tools/etiquetas-gs1/README.md
  ✓ tools/extractor-documental/README.md
  ✓ tools/grafo-conocimiento/README.md
  ✓ tools/pymes-marketing/README.md
  ✓ tools/reel/README.md
  ✓ tools/voz/README.md

Excluidos con motivo (13):
  · .claude/README.md — documentación de la fábrica; la gobernanza lee sus cifras
  · .claude/design-systems/README.md — catálogo de referencias de diseño, no un producto
  · .claude/goals/voz-casos-ampliados/propuestas/README.md — material de trabajo de un goal, no un producto
  · .claude/skills/SKILLS_README.md — documentación de skills: se rige por SKILL.md y los contratos C2, no por este contrato
  · .claude/skills/goal-compiler/README-PAQUETE.md — documentación de skills: se rige por SKILL.md y los contratos C2, no por este contrato
  · .claude/skills/google-workspace/README-PAQUETE.md — documentación de skills: se rige por SKILL.md y los contratos C2, no por este contrato
  · .claude/skills/knowledge-search/README-PAQUETE.md — documentación de skills: se rige por SKILL.md y los contratos C2, no por este contrato
  · .claude/skills/spec-generator/README.md — documentación de skills: se rige por SKILL.md y los contratos C2, no por este contrato
  · README.md — README raíz: lo lee la gobernanza (cifras de comprobaciones, conteo de skills, sección de la capa); no es de un producto
  · erp/migrations/README.md — reglas de las migraciones del ERP (documentación de arquitectura)
  · src/features/README.md — arquitectura feature-first, no una feature
  · src/shared/README.md — arquitectura del código compartido, no un producto
  · trayectorias/README.md — formato de datos de la fábrica, no un producto

Sin README: pendientes, se listan y no se crean solos (9):
  · src/features/a2a
  · src/features/ajustes
  · src/features/auth
  · src/features/dashboard
  · src/features/dictado
  · src/features/historial
  · src/features/laboratorio-etiquetas
  · src/features/laboratorio-voz
  · src/features/project-settings

README product first al día: 15 en alcance · 15 conformes · 0 no conformes · 13 excluidos · 9 sin README (pendientes).
exit 0
```

### 3.3 La prueba de la prueba del auditor (`npm run revisa:readmes -- --prueba`)

Las cinco violaciones del spec, y tres más (sin clasificar, cómputo sin cifra, qué hace sin «no hace»), todas
sobre una copia conforme de la plantilla del skill; cuenta solo faltas NUEVAS frente a la línea base:

```
CAZADA casos de uso antes que qué hace — tools/herramienta-de-prueba/README.md: «Casos de uso» antes que «Qué hace»
CAZADA falta la sección de infraestructura — tools/herramienta-de-prueba/README.md: falta «Requerimientos de infraestructura»
CAZADA «Instalar» antes de las tres de producto — tools/herramienta-de-prueba/README.md: «Instalar» (lo demás) va antes que las tres de producto
CAZADA un valor de variable de entorno escrito en el README — tools/herramienta-de-prueba/README.md: línea 48: OPENROUTER_API_KEY con valor escrito (largo 45) — solo el nombre, jamás el valor
CAZADA cómputo sin cifra ni «no medido» — tools/herramienta-de-prueba/README.md: «CPU, GPU y memoria» sin cifra medida ni «no medido»
CAZADA qué hace sin decir qué no hace — tools/herramienta-de-prueba/README.md: «Qué hace» no dice qué NO hace
CAZADA README nuevo en alcance, sin conformar, que entra solo por el glob — tools/herramienta-sembrada/README.md: falta «Qué hace»
CAZADA README fuera de alcance y sin motivo de exclusión — sin clasificar: apps/nueva/README.md

prueba de la prueba: 8 de 8 siembras cazadas
exit 0
```

### 3.4 No pérdida, README por README (`npm run readme:no-perdida -- <ruta> --desde 58174c9 --detalle`)

Método: multiconjunto de líneas normalizadas (espacios plegados, nivel de encabezado fuera) más subsecuencia común
más larga; más el multiconjunto de cifras. Rojo si una línea del original no sobrevive tal cual sin motivo
declarado, o si falta una cifra.

| README | líneas no vacías | conservadas en su sitio | movidas | reescritas con motivo | borradas sin justificar | nuevas | cifras perdidas |
|---|---:|---:|---:|---:|---:|---:|---:|
| `tools/asesor-ventas/README.md` | 44 → 70 | 44 | 0 | 0 | **0** | 26 | **0** |
| `tools/conocimiento/README.md` | 84 → 117 | 84 | 0 | 0 | **0** | 33 | **0** |
| `tools/dictado/README.md` | 460 → 488 | 452 | 8 | 0 | **0** | 28 | **0** |
| `tools/etiquetas-gs1/README.md` | 94 → 140 | 94 | 0 | 0 | **0** | 46 | **0** |
| `tools/extractor-documental/README.md` | 633 → 681 | 633 | 0 | 0 | **0** | 48 | **0** |
| `tools/grafo-conocimiento/README.md` | 89 → 124 | 89 | 0 | 0 | **0** | 35 | **0** |
| `tools/pymes-marketing/README.md` | 55 → 81 | 48 | 7 | 0 | **0** | 26 | **0** |
| `tools/reel/README.md` | 32 → 55 | 29 | 3 | 0 | **0** | 23 | **0** |
| `tools/voz/README.md` | 389 → 413 | 385 | 4 | 0 | **0** | 24 | **0** |
| `src/features/estudio-pymes/README.md` | 12 → 46 | 12 | 0 | 0 | **0** | 34 | **0** |
| `src/features/laboratorio-pymes/README.md` | 33 → 62 | 33 | 0 | 0 | **0** | 29 | **0** |
| `src/features/reel/README.md` | 16 → 53 | 16 | 0 | 0 | **0** | 37 | **0** |
| `src/features/.template/README.md` | 38 → 54 | 36 | 1 | 1 | **0** | 17 | **0** |

La única línea reescrita es el título del molde (motivo en
`.claude/goals/readme-product-first/no-perdida/src__features__.template.json`). Salida completa, con el esqueleto
antes y después de cada README:

```
No pérdida: tools/asesor-ventas/README.md (58174c9 → árbol de trabajo)
  líneas no vacías: antes 44 · después 70
  conservadas en su sitio 44 · movidas 0 · reescritas con motivo 0 · borradas sin justificar 0 · nuevas 26 · cifras perdidas 0
  esqueleto antes:
    # @tu-scope/asesor-ventas
    ## Uso
    ## Por qué sin LLM (y qué viene después)
    ## Instalar
    ## Comandos
  esqueleto después:
    # @tu-scope/asesor-ventas
    ## Qué hace
    ### Qué no hace
    ## Casos de uso
    ## Requerimientos de infraestructura
    ## Uso
    ## Por qué sin LLM (y qué viene después)
    ## Instalar
    ## Comandos
  sin pérdida: 0 borradas sin justificar, 0 cifras perdidas
exit 0

No pérdida: tools/conocimiento/README.md (58174c9 → árbol de trabajo)
  líneas no vacías: antes 84 · después 117
  conservadas en su sitio 84 · movidas 0 · reescritas con motivo 0 · borradas sin justificar 0 · nuevas 33 · cifras perdidas 0
  esqueleto antes:
    # @tu-scope/conocimiento
    ## Qué hay
    ## Cómo lo consume un proyecto (y cómo se entera de una versión nueva)
    ### Un consumidor público: vendoriza el recorte, nunca el paquete
    ## Reglas de la casa
    ## Cómo se siembra (y qué lo impide)
    ## Pruebas y paridad
  esqueleto después:
    # @tu-scope/conocimiento
    ## Qué hace
    ### Qué no hace
    ## Casos de uso
    ## Requerimientos de infraestructura
    ## Uso
    ## Qué hay
    ## Cómo lo consume un proyecto (y cómo se entera de una versión nueva)
    ### Un consumidor público: vendoriza el recorte, nunca el paquete
    ## Reglas de la casa
    ## Cómo se siembra (y qué lo impide)
    ## Pruebas y paridad
  sin pérdida: 0 borradas sin justificar, 0 cifras perdidas
exit 0

No pérdida: tools/dictado/README.md (58174c9 → árbol de trabajo)
  líneas no vacías: antes 460 · después 488
  conservadas en su sitio 452 · movidas 8 · reescritas con motivo 0 · borradas sin justificar 0 · nuevas 28 · cifras perdidas 0
  esqueleto antes:
    # @tu-scope/dictado
    ## Qué hace y qué no
    ## Instalar
    ## Los seis usos
    ### 1. Dictar (WSL2 → Windows)
    ### 2. Programático
    ### 3. Archivo y reunión
    ### 4. Remoto: tu VPS, con o sin GPU
    ### 5. El agente habla
    ### 5b. Conversar con el agente (PRP-003)
    ### 6. Medir
    ### 7. El demonio local: el modelo cargado una vez
    ### 8. Ganancia automática y micrófono cerrado en espera
    ### 9. Pruebas sin micrófono, trayectorias y calibración
    ### 10. Qué se guarda y dónde (y cómo se borra)
    ### 11. Ajustes: lo que decides una vez y el dictado recuerda
    ## Medición (2026-09-15)
    ### Valores por defecto, y de dónde salen
    ## Los mandos que de verdad importan
    ## Avisos que ahorran una tarde
    ## Variables de entorno
    ## Desarrollo
    ## Lo que no está (todavía)
  esqueleto después:
    # @tu-scope/dictado
    ## Qué hace y qué no
    ## Casos de uso
    ## Requerimientos de infraestructura
    ## Instalar
    ## El núcleo y de dónde viene
    ## Los seis usos
    ### 1. Dictar (WSL2 → Windows)
    ### 2. Programático
    ### 3. Archivo y reunión
    ### 4. Remoto: tu VPS, con o sin GPU
    ### 5. El agente habla
    ### 5b. Conversar con el agente (PRP-003)
    ### 6. Medir
    ### 7. El demonio local: el modelo cargado una vez
    ### 8. Ganancia automática y micrófono cerrado en espera
    ### 9. Pruebas sin micrófono, trayectorias y calibración
    ### 10. Qué se guarda y dónde (y cómo se borra)
    ### 11. Ajustes: lo que decides una vez y el dictado recuerda
    ## Medición (2026-09-15)
    ### Valores por defecto, y de dónde salen
    ## Los mandos que de verdad importan
    ## Avisos que ahorran una tarde
    ## Variables de entorno
    ## Desarrollo
    ## Lo que no está (todavía)
  sin pérdida: 0 borradas sin justificar, 0 cifras perdidas
exit 0

No pérdida: tools/etiquetas-gs1/README.md (58174c9 → árbol de trabajo)
  líneas no vacías: antes 94 · después 140
  conservadas en su sitio 94 · movidas 0 · reescritas con motivo 0 · borradas sin justificar 0 · nuevas 46 · cifras perdidas 0
  esqueleto antes:
    # @tu-scope/etiquetas-gs1
    ## Puntos de entrada
    ## Pruebas
    ## Recepción con foto de la caducidad
    ## Escanear por zona, rondas y conteo cíclico
    ## Laboratorio
    ## Instalar en un sitio nuevo
    ## Licencias de terceros
  esqueleto después:
    # @tu-scope/etiquetas-gs1
    ## Qué hace
    ### Qué no hace
    ## Casos de uso
    ## Requerimientos de infraestructura
    ## Puntos de entrada
    ## Pruebas
    ## Recepción con foto de la caducidad
    ## Escanear por zona, rondas y conteo cíclico
    ## Laboratorio
    ## Instalar en un sitio nuevo
    ## Licencias de terceros
  sin pérdida: 0 borradas sin justificar, 0 cifras perdidas
exit 0

No pérdida: tools/extractor-documental/README.md (58174c9 → árbol de trabajo)
  líneas no vacías: antes 633 · después 681
  conservadas en su sitio 633 · movidas 0 · reescritas con motivo 0 · borradas sin justificar 0 · nuevas 48 · cifras perdidas 0
  esqueleto antes:
    # @tu-scope/extractor-documental
    ## La regla que ordena todo
    ## Entry points
    ## Los puertos
    ## Capa 0: el PDF que ya trae su texto
    ## Leer un XML: el esquema se registra, no se codifica
    ### Los ocho lectores que trae el paquete
    ### Registrar un esquema propio
    ### Que NO hace, y no es temporal
    ### Que la estructura no envejezca en silencio
    ### El cotejo a tres bandas sale gratis
    ### Sin cotejo no se auto-valida
    ### Verificar la demo
    ### Catalogos configurables por el usuario, y uso de tokens: solo en la demo
    ### Por caso de uso: el servicio OCR entero, una tarjeta por clase (seccion 11)
    ## Motores
    ## Reconciliar valores contra un catalogo
    ## La propuesta de modelo E-R
    ## Del corpus al modelo: leer miles de documentos y proponer las entidades
    ### La via del motor tiene dos formas, y el motor decide cual
    ### Medido el 2026-09-11: tres motores autohospedados sobre el mismo corpus sintetico
    ### El corpus de medicion no entra al repositorio
    ## Identificadores y codigos antes que OCR
    ## Umbrales: los tres que NO vienen puestos
    ### Y un motor real puede devolver la confianza como CONSTANTE
    ## Que esperar de un motor autohospedado, medido
    ## Probarla, y fabricar el corpus mientras la pruebas
    ## El banco de pruebas: un negocio ficticio en una base embebida
    ## Pruebas
    ## Desplegar en el VPS del cliente (spec 010)
    ### La GPU como servicio del VPS
    ### Mistral: apagado por defecto
    ### Medido el 2026-09-13 (corpus sintetico de 33 paginas: NO CONCLUYENTE, hacen falta 100)
  esqueleto después:
    # @tu-scope/extractor-documental
    ## Qué hace
    ### Qué no hace
    ## Casos de uso
    ## Requerimientos de infraestructura
    ## Estado
    ## La regla que ordena todo
    ## Entry points
    ## Los puertos
    ## Capa 0: el PDF que ya trae su texto
    ## Leer un XML: el esquema se registra, no se codifica
    ### Los ocho lectores que trae el paquete
    ### Registrar un esquema propio
    ### Que NO hace, y no es temporal
    ### Que la estructura no envejezca en silencio
    ### El cotejo a tres bandas sale gratis
    ### Sin cotejo no se auto-valida
    ### Verificar la demo
    ### Catalogos configurables por el usuario, y uso de tokens: solo en la demo
    ### Por caso de uso: el servicio OCR entero, una tarjeta por clase (seccion 11)
    ## Motores
    ## Reconciliar valores contra un catalogo
    ## La propuesta de modelo E-R
    ## Del corpus al modelo: leer miles de documentos y proponer las entidades
    ### La via del motor tiene dos formas, y el motor decide cual
    ### Medido el 2026-09-11: tres motores autohospedados sobre el mismo corpus sintetico
    ### El corpus de medicion no entra al repositorio
    ## Identificadores y codigos antes que OCR
    ## Umbrales: los tres que NO vienen puestos
    ### Y un motor real puede devolver la confianza como CONSTANTE
    ## Que esperar de un motor autohospedado, medido
    ## Probarla, y fabricar el corpus mientras la pruebas
    ## El banco de pruebas: un negocio ficticio en una base embebida
    ## Pruebas
    ## Desplegar en el VPS del cliente (spec 010)
    ### La GPU como servicio del VPS
    ### Mistral: apagado por defecto
    ### Medido el 2026-09-13 (corpus sintetico de 33 paginas: NO CONCLUYENTE, hacen falta 100)
  sin pérdida: 0 borradas sin justificar, 0 cifras perdidas
exit 0

No pérdida: tools/grafo-conocimiento/README.md (58174c9 → árbol de trabajo)
  líneas no vacías: antes 89 · después 124
  conservadas en su sitio 89 · movidas 0 · reescritas con motivo 0 · borradas sin justificar 0 · nuevas 35 · cifras perdidas 0
  esqueleto antes:
    # @tu-scope/grafo-conocimiento
    ## El motor (`src/motor.ts`)
    ## La capa de lenguaje natural (`./lenguaje`)
    ## El contrato (`src/contrato.ts`, `src/valida.ts`)
    ## La paridad con Hermes (`pruebas/paridad/`)
    ## Pruebas
  esqueleto después:
    # @tu-scope/grafo-conocimiento
    ## Qué hace
    ### Qué no hace
    ## Casos de uso
    ## Requerimientos de infraestructura
    ## Estado
    ## Uso
    ## El motor (`src/motor.ts`)
    ## La capa de lenguaje natural (`./lenguaje`)
    ## El contrato (`src/contrato.ts`, `src/valida.ts`)
    ## La paridad con Hermes (`pruebas/paridad/`)
    ## Pruebas
  sin pérdida: 0 borradas sin justificar, 0 cifras perdidas
exit 0

No pérdida: tools/pymes-marketing/README.md (58174c9 → árbol de trabajo)
  líneas no vacías: antes 55 · después 81
  conservadas en su sitio 48 · movidas 7 · reescritas con motivo 0 · borradas sin justificar 0 · nuevas 26 · cifras perdidas 0
  esqueleto antes:
    # @tu-scope/pymes-marketing (0.2.0)
    ## Uso
    ## Lo que NO hace (a propósito)
    ## Pruebas
    ## Generación de contenido (0.2.0)
  esqueleto después:
    # @tu-scope/pymes-marketing (0.2.0)
    ## Qué hace
    ### Lo que NO hace (a propósito)
    ## Casos de uso
    ## Requerimientos de infraestructura
    ## Uso
    ## Pruebas
    ## Generación de contenido (0.2.0)
  sin pérdida: 0 borradas sin justificar, 0 cifras perdidas
exit 0

No pérdida: tools/reel/README.md (58174c9 → árbol de trabajo)
  líneas no vacías: antes 32 · después 55
  conservadas en su sitio 29 · movidas 3 · reescritas con motivo 0 · borradas sin justificar 0 · nuevas 23 · cifras perdidas 0
  esqueleto antes:
    # @tu-scope/reel
    ## Qué hace
    ## Uso
    ## Medido (clips sintéticos, 2026-09-27)
    ## Lo que no hace (bloqueado hasta firma)
  esqueleto después:
    # @tu-scope/reel
    ## Qué hace
    ### Lo que no hace (bloqueado hasta firma)
    ## Casos de uso
    ## Requerimientos de infraestructura
    ## Uso
    ## Medido (clips sintéticos, 2026-09-27)
  sin pérdida: 0 borradas sin justificar, 0 cifras perdidas
exit 0

No pérdida: tools/voz/README.md (58174c9 → árbol de trabajo)
  líneas no vacías: antes 389 · después 413
  conservadas en su sitio 385 · movidas 4 · reescritas con motivo 0 · borradas sin justificar 0 · nuevas 24 · cifras perdidas 0
  esqueleto antes:
    # @tu-scope/voz
    ## Que hace y que no
    ## Instalar
    ## Los cinco usos
    ### 1. Barge-in — solo VAD, ~2 MB
    ### 2. Dos canales — hablante sin diarizar
    ### 3. Reunion — diarizacion por lotes
    ### 4. En vivo — diarizacion en streaming
    ### 5. En vivo CON solape — segmentacion en streaming
    ## Ponerle nombre: voces que sobreviven a la sesion
    ## Dictar con el mismo detector: perfiles, transcriptor con opciones, nivel
    ## Los mandos que de verdad importan
    ## El umbral de diarizacion no se adivina
    ## Que se guarda y donde (y como se borra)
    ## Avisos que ahorran una tarde
    ## Pruebas
    ## Cambios
  esqueleto después:
    # @tu-scope/voz
    ## Que hace y que no
    ## Casos de uso
    ## Requerimientos de infraestructura
    ## Instalar
    ## El núcleo, sin dependencias
    ## Los cinco usos
    ### 1. Barge-in — solo VAD, ~2 MB
    ### 2. Dos canales — hablante sin diarizar
    ### 3. Reunion — diarizacion por lotes
    ### 4. En vivo — diarizacion en streaming
    ### 5. En vivo CON solape — segmentacion en streaming
    ## Ponerle nombre: voces que sobreviven a la sesion
    ## Dictar con el mismo detector: perfiles, transcriptor con opciones, nivel
    ## Los mandos que de verdad importan
    ## El umbral de diarizacion no se adivina
    ## Que se guarda y donde (y como se borra)
    ## Avisos que ahorran una tarde
    ## Pruebas
    ## Cambios
  sin pérdida: 0 borradas sin justificar, 0 cifras perdidas
exit 0

No pérdida: src/features/estudio-pymes/README.md (58174c9 → árbol de trabajo)
  líneas no vacías: antes 12 · después 46
  conservadas en su sitio 12 · movidas 0 · reescritas con motivo 0 · borradas sin justificar 0 · nuevas 34 · cifras perdidas 0
  esqueleto antes:
    # Estudio de marketing (`/estudio`) y aprobación en el celular (`/estudio/aprobar`)
  esqueleto después:
    # Estudio de marketing (`/estudio`) y aprobación en el celular (`/estudio/aprobar`)
    ## Qué hace
    ### Qué no hace
    ## Casos de uso
    ## Requerimientos de infraestructura
    ## Datos y aprobación
  sin pérdida: 0 borradas sin justificar, 0 cifras perdidas
exit 0

No pérdida: src/features/laboratorio-pymes/README.md (58174c9 → árbol de trabajo)
  líneas no vacías: antes 33 · después 62
  conservadas en su sitio 33 · movidas 0 · reescritas con motivo 0 · borradas sin justificar 0 · nuevas 29 · cifras perdidas 0
  esqueleto antes:
    # Laboratorio pymes (`/laboratorio-pymes`)
    ## Cómo leerlo
    ## Referencias visuales (cambiar el aspecto a propósito)
    ## Archivos
    ## Reel del celular (PRP-007)
  esqueleto después:
    # Laboratorio pymes (`/laboratorio-pymes`)
    ## Qué hace
    ### Qué no hace
    ## Casos de uso
    ## Requerimientos de infraestructura
    ## Cómo leerlo
    ## Referencias visuales (cambiar el aspecto a propósito)
    ## Archivos
    ## Reel del celular (PRP-007)
  sin pérdida: 0 borradas sin justificar, 0 cifras perdidas
exit 0

No pérdida: src/features/reel/README.md (58174c9 → árbol de trabajo)
  líneas no vacías: antes 16 · después 53
  conservadas en su sitio 16 · movidas 0 · reescritas con motivo 0 · borradas sin justificar 0 · nuevas 37 · cifras perdidas 0
  esqueleto antes:
    # Reel del celular (app)
  esqueleto después:
    # Reel del celular (app)
    ## Qué hace
    ### Qué no hace
    ## Casos de uso
    ## Requerimientos de infraestructura
    ## Piezas
  sin pérdida: 0 borradas sin justificar, 0 cifras perdidas
exit 0

No pérdida: src/features/.template/README.md (58174c9 → árbol de trabajo)
  líneas no vacías: antes 38 · después 54
  conservadas en su sitio 36 · movidas 1 · reescritas con motivo 1 · borradas sin justificar 0 · nuevas 17 · cifras perdidas 0
    reescrita (l.1) «Feature Template» — el título del molde pasa a marcador «Nombre de la feature»: al copiar `.template`, este README es el de la feature nueva, y un título fijo «Feature Template» nacería equivocado en cada copia. Qué es el molde lo dice ahora la línea de propuesta de valor.
  esqueleto antes:
    # Feature Template
    ## Estructura
    ## Ejemplo de uso
    ## Principios
    ## Ejemplo: Feature "auth"
  esqueleto después:
    # «Nombre de la feature» (`/«ruta»`)
    ## Qué hace
    ### Qué no hace
    ## Casos de uso
    ## Requerimientos de infraestructura
    ## Estructura
    ## Ejemplo de uso
    ## Principios
    ## Ejemplo: Feature "auth"
  sin pérdida: 0 borradas sin justificar, 0 cifras perdidas
exit 0
```

Y su prueba de la prueba (`-- --prueba`: una línea borrada, una cifra cambiada, un párrafo reflujado):

```
CAZADA línea borrada — 1 borrada(s), 1 cifra(s)
CAZADA cifra cambiada — 1 borrada(s), 1 cifra(s)
CAZADA párrafo reflujado — 2 borrada(s), 0 cifra(s)

prueba de la prueba: 3 de 3 pérdidas sembradas cazadas
exit 0
CAZADA línea borrada — 1 borrada(s), 1 cifra(s)
CAZADA cifra cambiada — 1 borrada(s), 1 cifra(s)
CAZADA párrafo reflujado — 2 borrada(s), 0 cifra(s)

prueba de la prueba: 3 de 3 pérdidas sembradas cazadas
exit 0
```

### 3.5 Gates

Pegados en el informe del goal con su salida real: `npm run regresion` (capa A 146/146), `npm run
verify:gobernanza` (156/156, conteo de skills en 27), `npm run sincroniza:gemini`, `npm run mide:contexto` (total
por sesión 10841 de 12000, descripciones de 27 skills 3766 de 7000) y el último `npm run validate`.

## 4. Propuesta de gate — `revisa:readmes` en `.claude/gates.json` (SIN APLICAR)

El manifiesto propuesto se cargó con `cargaManifiesto` (fail-closed) sin tocar el archivo: 27 gates activos en
`validate`, `revisa:readmes` entre ellos. `timeout_s` 120: el auditor lee ~30 archivos y termina en
fracciones de segundo.

```diff
--- .claude/gates.json	2026-09-29 07:05:14.030365612 -0600
+++ .claude/gates.json (propuesto)	2026-09-29 07:46:54.261617631 -0600
@@ -89,6 +89,16 @@
       "timeout_s": 300
     },
     {
+      "nombre": "revisa:readmes",
+      "runner": "comando",
+      "comando": "npm run revisa:readmes",
+      "guarda": "el contrato product first de los README de herramientas (`tools/*`) y apps (`src/features/*`) que declara el skill `readme`: que qué hace, casos de uso y requerimientos de infraestructura vayan antes que lo demás, que ningún README lleve el valor de una variable de entorno sensible, y que ningún README nuevo quede sin clasificar (en alcance o excluido con motivo)",
+      "evidencia": "README por README, conforme o no y qué le falta; los excluidos con su motivo y las carpetas de producto sin README como pendientes; exit 1 si alguno no es conforme o queda sin clasificar",
+      "perfiles": ["validate"],
+      "activo": true,
+      "timeout_s": 120
+    },
+    {
       "nombre": "regresion",
       "runner": "comando",
       "comando": "npm run regresion",
```

Al aplicarlo hace falta también que el papel nombre el gate (comprobación 3d-bis de `verify:gobernanza`): una
línea en el bloque de comandos de `README.md`:

```diff
 npm run verify:gobernanza   # falla si la capa quedo suelta (156 comprobaciones; el propio verificador vigila esta cifra)
 npm run regresion           # C2 capa A: contratos de los 27 skills
 npm run regresion -- --trampa   # C2 capa B: casos-trampa, para cada CDC
+npm run revisa:readmes      # README product first de tools/ y src/features/ (skill readme); -- --prueba lo prueba
```

Se deja fuera de `predeploy` a propósito: un README no cambia lo que se despliega. Opcional, en el mismo CDC:
añadir `revisa` a `FORMA_DE_GATE` de `scripts/verifica-gates.mjs`, para que un script `revisa:*` futuro no pueda
quedar fuera del padrón en silencio.

## 5. Entrada de `BITACORA-CDC.md` redactada (se copia al registro al firmar)

No se escribe hoy en el registro: la comprobación 6b de `verify:gobernanza` (CDC del 2026-08-23, «una entrada sin
firmar deja de pasar el gate») rechaza una entrada con «Aprobado por: pendiente», y `validate` saldría en rojo. Es
la misma vía que usó el CDC de pagos: la propuesta vive aquí y se borra al firmar.

```markdown
### 2026-09-29 — skill `readme`: README product first (nuevo, reestructura, revisa) → CDC PROPUESTO — radio: skills (2), sistema (`AGENTS.md`), contratos C2 (10)
- **Cambio** (rama `readme-product-first`, commits locales sobre `58174c9`):
  - skill nuevo `readme` con tres comandos (`nuevo`, `reestructura`, `revisa`), su contrato declarado
    (`contrato.json`: orden de las cuatro partes, siete rubros de infraestructura, alcance y exclusiones con
    motivo) y su plantilla;
  - `crear-herramienta`: paso 5 nuevo, el README con `/readme nuevo` antes de empaquetar;
  - `AGENTS.md`: +3 líneas en el árbol de decisión y conteo 26 → 27; `CLAUDE.md`, `README.md` y
    `.claude/README.md`: conteo y fila del skill; `GEMINI.md` regenerado con `npm run sincroniza:gemini`;
  - `golden-sets/contratos.json`: +10 contratos (9 de `readme`, 1 de `crear-herramienta`). Capa A de 131 a 146 (10 contratos, 3 genéricos del skill nuevo y 2 de contrato no huérfano);
  - `npm run revisa:readmes` (auditor sin modelo, `--prueba` 8/8) y `npm run readme:no-perdida` (`--prueba` 3/3);
  - los 12 README de producto y el molde de features reestructurados sin pérdida; README nuevos del andamio y de
    `src/features/etiquetas`.
- **Motivo**: pedido del laboratorio del 2026-09-29 (goal `readme-product-first`): que quien llega sepa en la
  primera pantalla qué resuelve, para quién, en qué casos y qué necesita para correr.
- **Gate aplicado**: diff visible ☑ (`propuesta-cdc.md`, ANTES de pedir la firma) · regresión capa A ☑ 146/146 ·
  capa B ☐ no corrida (lo decide el laboratorio: ninguna instrucción existente cambia de sentido, se suman un skill
  y una rama) · `verify:gobernanza` ☑ 156/156 · `mide:contexto` ☑ 10841/12000 · `validate` ☑ (ver el informe) ·
  aprobación humana ☐ · pineo ☑ (sin modelo ni dependencia nueva).
- **Gate `revisa:readmes` en `.claude/gates.json`**: propuesto con su diff, sin aplicar hasta esta firma.
- **Aprobado por**: pendiente
```

## 6. Capa B

`npm run regresion -- --trampa` confirma que el corpus está accesible y completo; ejecutar los casos exige sesiones
frías con el modelo y no se hizo. Recomendación: «capa A basta», con el mismo criterio que el CDC de pagos (se suman
un skill y una rama del árbol; ninguna regla existente cambia de sentido). La decisión es del laboratorio.

## 7. Diff completo del CDC (`git diff 58174c9 -- <skills, gobernanza, instrucciones, conteos, package.json, docs, inventario, scripts>`)

Los 15 README se ven con `git diff 58174c9 -- 'tools/*/README.md' 'src/features/*/README.md'`; su prueba es el §3.4
(git los enseña como borrado + alta al moverse, por eso la prueba es la de no pérdida y no el diff).

```diff
diff --git a/.claude/README.md b/.claude/README.md
index 897c08e..9da81e5 100644
--- a/.claude/README.md
+++ b/.claude/README.md
@@ -13,7 +13,7 @@ Template **production-ready** para crear aplicaciones SaaS modernas con desarrol
 - Next.js 16 (App Router) + TypeScript
 - Supabase (Database + Auth)
 - Tailwind CSS + shadcn/ui
-- 26 Skills de Claude Code (V4 Skills 2.0)
+- 27 Skills de Claude Code (V4 Skills 2.0)
 - Arquitectura Feature-First optimizada para IA
 - Auto port detection (3000-3006)
 - Capa de gobernanza agentica: 7 controles cableados y auto-verificados
@@ -141,7 +141,7 @@ npm run verifica:gates     # el padron y el codigo no divergen (`--prueba`: 6 si
 > V4 migra TODO a Skills 2.0. Hot reload, auto-discovery, zero config.
 > Cada skill es una carpeta con `SKILL.md` (frontmatter YAML + instrucciones).
 
-Los 26 skills son invocables con `/nombre` y activables por Claude segun
+Los 27 skills son invocables con `/nombre` y activables por Claude segun
 el `description` de su frontmatter.
 
 | Skill | Comando | Descripcion |
@@ -154,6 +154,7 @@ el `description` de su frontmatter.
 | `website-3d` | `/website-3d` | Landing cinematica: scroll-driven video + copy AIDA/PAS |
 | `spec-generator` | `/spec-generator` | Entrevista de requisitos → `spec.md` con RF en notacion EARS |
 | `crear-herramienta` | `/crear-herramienta` | Convertir algo ya reusado en paquete instalable (`tools/`) |
+| `readme` | `/readme` | README product first de `tools/` y `src/features/`: nuevo, reestructura, revisa |
 | `cli-audit` | `/cli-audit` | Estado de la imprenta de CLIs y coste en contexto de los MCP |
 | `prp` | `/prp` | Generar Product Requirements Proposal |
 | `bucle-agentico` | `/bucle-agentico` | Features complejas por fases (DB + API + UI) |
@@ -342,7 +343,7 @@ Sistemas de diseno visuales en `.claude/design-systems/`.
 
 ```
 .claude/
-├── skills/                    # Skills 2.0 (V4) - 26 skills
+├── skills/                    # Skills 2.0 (V4) - 27 skills
 │   ├── new-app/                 # Entrevista de negocio → BUSINESS_LOGIC.md
 │   ├── add-login/               # Auth completo Supabase: login, signup, password reset, profiles, RLS
 │   ├── add-payments/            # Pagos con Polar (MoR): checkout, webhooks, suscripciones
diff --git a/.claude/gobernanza/golden-sets/contratos.json b/.claude/gobernanza/golden-sets/contratos.json
index df742d7..fb3bba1 100644
--- a/.claude/gobernanza/golden-sets/contratos.json
+++ b/.claude/gobernanza/golden-sets/contratos.json
@@ -196,6 +196,50 @@
         "patron": "add-payments",
         "porque": "el CTA de venta directa necesita decir con que se cobra (y cuando no es Polar)"
       }
+    ],
+    "readme": [
+      {
+        "patron": "Qu[ée] hace[^\\n]*→[^\\n]*Casos de uso[^\\n]*→[^\\n]*Requerimientos de infraestructura[^\\n]*→[^\\n]*lo dem[áa]s",
+        "porque": "el orden de las cuatro partes es decision del laboratorio (2026-09-29): si el skill deja de declararlo, deja de producirlo"
+      },
+      {
+        "patron": "[Ss]olo por nombre, jam[áa]s el valor",
+        "porque": "variables de entorno solo por nombre: un valor escrito en un README viaja en el tarball y queda en el historial de git"
+      },
+      {
+        "patron": "nunca imprimas el valor de una variable de entorno",
+        "porque": "el skill lee el codigo buscando variables: la regla de secretos en pantalla de AGENTS.md tiene que ir inline donde se buscan"
+      },
+      {
+        "prohibido": "echo\\s+[\"']?\\$\\{?[A-Z0-9_]*(KEY|TOKEN|SECRET|SECRETO|PASSWORD|CLAVE|LLAVE)|printenv\\s+[A-Z]|\\bcat\\s+[^\\n]*\\.env\\b",
+        "porque": "un ejemplo que imprime una variable sensible ensena la fuga que la regla prohibe"
+      },
+      {
+        "patron": "No se inventa",
+        "porque": "casos de uso, requerimientos y cifras salen del codigo, el SDD o una medicion; lo demas es «pendiente» o «no medido»"
+      },
+      {
+        "patron": "una cosa a la vez y con respuesta recomendada",
+        "porque": "lo que solo sabe el laboratorio (para quien es, que decision resuelve) se pregunta; no se rellena"
+      },
+      {
+        "patron": "npm run revisa:readmes",
+        "porque": "el veredicto de conforme lo da el auditor determinista, no el juicio del modelo"
+      },
+      {
+        "patron": "npm run readme:no-perdida",
+        "porque": "reestructurar exige DEMOSTRAR la no perdida (0 borradas sin justificar, 0 cifras perdidas), no afirmarla"
+      },
+      {
+        "patron": "CDC \\(C1\\)",
+        "porque": "tocar contrato.json (una exclusion para callar al auditor) o volverlo gate es cambiar comportamiento: CDC"
+      }
+    ],
+    "crear-herramienta": [
+      {
+        "patron": "/readme nuevo",
+        "porque": "toda herramienta nace con README product first: si el skill que las crea no manda al skill readme, la regla vive en un documento y no dispara"
+      }
     ]
   }
 }
diff --git a/.claude/skills/crear-herramienta/SKILL.md b/.claude/skills/crear-herramienta/SKILL.md
index c13b690..762e8d5 100644
--- a/.claude/skills/crear-herramienta/SKILL.md
+++ b/.claude/skills/crear-herramienta/SKILL.md
@@ -58,7 +58,16 @@ Reacts en el mismo arbol rompen los hooks de una forma que se lleva una tarde en
 **`npm link` no se usa: miente.** Resuelve por enlaces simbolicos y da por bueno lo que en
 una instalacion real falla.
 
-## 5. Empaquetar y probar
+## 5. El README, product first, antes de empaquetar
+
+La herramienta nace con su `README.md` (el andamio ya lo trae) y se reescribe con
+**`/readme nuevo tools/<nombre>`**: que hace y que no, casos de uso y requerimientos de
+infraestructura, y despues lo demas. Lo que solo sabe el usuario (para quien es, que decision
+resuelve) se le pregunta; lo que no se sepa queda «pendiente» o «no medido».
+`npm run revisa:readmes -- tools/<nombre>/README.md` en verde antes de seguir: el README viaja
+en el tarball y es lo primero que lee quien la instala.
+
+## 6. Empaquetar y probar
 
 ```bash
 npm run empaqueta <nombre>                 # incluye la prueba de integracion real
@@ -70,7 +79,7 @@ importa. Las demas comprobaciones las puede tener en verde un paquete que luego
 instala; esa no. Si el usuario nombro proyectos de destino en el paso 2, usa `--en` contra
 uno: ahi npm dictamina los peers contra el arbol real.
 
-## 6. Si sale en rojo
+## 7. Si sale en rojo
 
 El empaquetador no dice "fallo": dice **que se romperia en el proyecto de destino**
 (`types` sin declarar, `dist` fuera de `files`, React en `dependencies`, `'use client'`
diff --git a/.claude/skills/readme/SKILL.md b/.claude/skills/readme/SKILL.md
new file mode 100644
index 0000000..9cad50c
--- /dev/null
+++ b/.claude/skills/readme/SKILL.md
@@ -0,0 +1,97 @@
+---
+name: readme
+description: "Escribe, reordena y audita el README de una herramienta (tools/*) o una app (src/features/*) con enfoque product first: qué hace y qué no, casos de uso, requerimientos de infraestructura, y después lo demás. Comandos: /readme nuevo <ruta>, /readme reestructura <ruta>|todos, /readme revisa [ruta]. Activar al crear o editar el README de una herramienta o feature, o cuando digan: haz el README, reestructura el README, README product first, revisa los README. NO: README raíz ni de .claude/ (los lee la gobernanza), SKILL.md, specs (spec-generator), docs de arquitectura."
+---
+
+# README product first
+
+Quien llega a una herramienta o a una app tiene que saber **en la primera pantalla** qué resuelve,
+para quién, en qué situaciones sirve y qué necesita para correr. Lo técnico va después.
+
+## El contrato (decisión del laboratorio, no se negocia el orden)
+
+Tras el título y **una** línea de propuesta de valor, en este orden:
+
+**Qué hace → Casos de uso → Requerimientos de infraestructura → lo demás**
+
+1. **Qué hace**: qué resuelve y para quién, en palabras de quien lo usa. Dice también **qué NO
+   hace** (una subsección `### Qué no hace` o la frase «no hace»): los límites son producto.
+2. **Casos de uso**: escenarios concretos — quién, en qué situación, qué obtiene.
+3. **Requerimientos de infraestructura**: siete viñetas con la etiqueta en negrita —
+   **Runtime** (`engines`), **Dependencias del sistema** (motores, binarios, modelos),
+   **CPU, GPU y memoria** (cifra medida con su fecha, o «no medido»), **Servicios externos**,
+   **Variables de entorno**, **Almacenamiento** y **Salida del perímetro (C4)**.
+4. **Lo demás**, sin perder nada: instalar, puntos de entrada o API, configuración, pruebas,
+   desarrollo, mediciones, avisos, licencias, cambios.
+
+El contrato declarado vive en `contrato.json` (títulos admitidos, rubros, alcance y exclusiones
+con motivo) y el esqueleto en `plantilla.md`, los dos junto a este archivo. El auditor
+determinista es `npm run revisa:readmes`: sin modelo, lo corre cualquier arnés y un gate.
+
+## Reglas que no se negocian
+
+- **No se inventa.** Ni casos de uso, ni requerimientos, ni cifras. Lo que no esté en el código,
+  el `package.json`, el SDD, las specs o una medición escrita queda **«pendiente»** o
+  **«no medido»**. Un hueco visible es información; una suposición es deuda.
+- **Variables de entorno: solo por nombre, jamás el valor.** Ni en el README ni al depurar ni
+  en la evidencia: nunca imprimas el valor de una variable de entorno, ni con `printenv` ni con
+  `echo`. Presencia se confirma enmascarando (presente/ausente y largo). El auditor rechaza un
+  valor sensible escrito, y lo informa por nombre y largo, no por valor.
+- **Las cifras medidas se conservan tal cual, con su fecha.** Se citan, no se redondean.
+- **No se pierde contenido.** Reordenar y reescribir para producto se admite; borrar en
+  silencio no. Toda línea que no sobrevive tal cual lleva su motivo.
+
+## `/readme nuevo <ruta>`
+
+Escribe el README product first de una herramienta o feature que no lo tiene.
+
+1. **Lee antes de escribir**: el código, el `package.json` (`engines`, `dependencies`, `peers`,
+   `bin`), el SDD y las specs o goals que la nombran, las mediciones escritas y los nombres de
+   variables que el código lee (`process.env[...]`), sin mirar nunca sus valores.
+2. **Lo que solo sabe el laboratorio** —para quién es, qué decisión resuelve, qué caso de uso
+   manda— se le **pregunta, una cosa a la vez y con respuesta recomendada**. Si la sesión no
+   tiene a quién preguntar, se escribe «pendiente» y la pregunta va al informe con su
+   recomendación.
+3. Escribe desde `plantilla.md`, respetando el orden del contrato.
+4. `npm run revisa:readmes -- <ruta>` tiene que salir conforme. Informa qué salió del código,
+   qué del SDD, qué se preguntó y qué quedó «no medido» o «pendiente».
+
+## `/readme reestructura <ruta>|todos`
+
+Reordena un README existente al contrato y **demuestra** que no se perdió nada.
+
+1. `npm run revisa:readmes -- <ruta>` para ver qué falta. `todos` = cada README que salga no
+   conforme, uno por uno.
+2. Mueve las líneas **tal cual**: sin reflujo de párrafos (reflujar convierte una línea movida en
+   una reescrita). El preámbulo técnico (estado, arquitectura, ejemplos) baja a una sección de
+   «lo demás». Los bloques que un script reescribe entre marcadores (`<!-- MEDICION -->` y
+   similares) se mueven enteros, con sus marcadores.
+3. Escribe las tres secciones de producto con lo que el README ya dice, más el `package.json` y
+   el SDD. Nada nuevo sin fuente.
+4. Por cada línea original que no sobreviva tal cual, un motivo en un JSON
+   `{ "motivos": [{ "antes": "<línea original>", "motivo": "<por qué>" }] }`.
+5. `npm run readme:no-perdida -- <ruta> --motivos <archivo> --detalle`: tiene que dar **0 borradas
+   sin justificar y 0 cifras perdidas**. Esa salida, con el esqueleto antes/después, es la
+   evidencia.
+6. `npm run revisa:readmes -- <ruta>` conforme.
+
+Si un README **no se puede** reestructurar sin perder contenido que importa, no se fuerza: se deja
+como está y se dice por qué.
+
+## `/readme revisa [ruta]`
+
+Corre `npm run revisa:readmes` (o `-- <ruta>`) y lo informa tal cual: por README, conforme o no
+conforme y qué le falta; los excluidos con su motivo; las carpetas de producto **sin README**
+(pendientes: se listan, no se crean solas); y los README **sin clasificar**, que son rojo. No
+escribe nada. `-- --prueba` demuestra que el auditor caza: siembra violaciones y exige que caigan.
+
+## Qué NO hace
+
+- No toca el `README.md` raíz ni `.claude/README.md`: la gobernanza lee sus cifras. Tampoco la
+  documentación de skills, goals ni arquitectura: el contrato los excluye con motivo.
+- No crea README por su cuenta para las features que no lo tienen: las lista; `nuevo` es a pedido.
+- No publica paquetes ni sube versiones.
+- No cambia el contrato: editar `contrato.json` (una exclusión para callar al auditor, un título
+  admitido más) es cambiar este skill, y eso es un **CDC (C1)**: diff, `npm run regresion`,
+  aprobación del laboratorio y entrada en `BITACORA-CDC.md`. Lo mismo para volverlo gate en
+  `.claude/gates.json`.
diff --git a/.claude/skills/readme/contrato.json b/.claude/skills/readme/contrato.json
new file mode 100644
index 0000000..afdaccc
--- /dev/null
+++ b/.claude/skills/readme/contrato.json
@@ -0,0 +1,50 @@
+{
+  "_comentario": "Contrato «product first» de los README de herramientas y apps. Lo leen el skill `readme` y el auditor determinista `scripts/revisa-readmes.mjs` (`npm run revisa:readmes`). El ORDEN de las tres secciones de producto es decisión del laboratorio (2026-09-29) y no se negocia: qué hace → casos de uso → requerimientos de infraestructura → lo demás. Vive en la carpeta del skill a propósito: añadir una exclusión para silenciar el auditor es cambiar el skill, y eso es un CDC (C1).",
+  "version": 1,
+  "preambulo": {
+    "_comentario": "Entre el título y la primera sección: la línea de propuesta de valor, nada más. Lo técnico (estado, arquitectura, ejemplos de código) va después de las tres de producto.",
+    "maxLineas": 4
+  },
+  "secciones": [
+    {
+      "id": "que-hace",
+      "titulo": "Qué hace",
+      "admitidos": ["Qué hace", "Qué hace y qué no", "Qué hace (y qué no)"],
+      "exige": "que diga también qué NO hace (la frase «no hace»): en esta fábrica los límites son parte del producto"
+    },
+    {
+      "id": "casos-de-uso",
+      "titulo": "Casos de uso",
+      "admitidos": ["Casos de uso"],
+      "exige": "al menos un escenario (lista, tabla o subsección); si nada lo sostiene, «pendiente», nunca inventado"
+    },
+    {
+      "id": "infraestructura",
+      "titulo": "Requerimientos de infraestructura",
+      "admitidos": ["Requerimientos de infraestructura", "Requisitos de infraestructura"],
+      "exige": "los siete rubros, cada uno como viñeta con su etiqueta en negrita; variables de entorno solo por nombre"
+    }
+  ],
+  "rubros": [
+    { "id": "runtime", "etiqueta": "Runtime" },
+    { "id": "sistema", "etiqueta": "Dependencias del sistema" },
+    { "id": "computo", "etiqueta": "CPU, GPU y memoria", "cifraONoMedido": true },
+    { "id": "servicios", "etiqueta": "Servicios externos" },
+    { "id": "entorno", "etiqueta": "Variables de entorno" },
+    { "id": "almacenamiento", "etiqueta": "Almacenamiento" },
+    { "id": "perimetro", "etiqueta": "Salida del perímetro (C4)" }
+  ],
+  "alcance": ["tools/*/README.md", "src/features/*/README.md"],
+  "carpetasDeProducto": ["tools/*", "src/features/*"],
+  "exclusiones": [
+    { "patron": "README.md", "motivo": "README raíz: lo lee la gobernanza (cifras de comprobaciones, conteo de skills, sección de la capa); no es de un producto" },
+    { "patron": ".claude/README.md", "motivo": "documentación de la fábrica; la gobernanza lee sus cifras" },
+    { "patron": ".claude/skills/**", "motivo": "documentación de skills: se rige por SKILL.md y los contratos C2, no por este contrato" },
+    { "patron": ".claude/goals/**", "motivo": "material de trabajo de un goal, no un producto" },
+    { "patron": ".claude/design-systems/README.md", "motivo": "catálogo de referencias de diseño, no un producto" },
+    { "patron": "src/features/README.md", "motivo": "arquitectura feature-first, no una feature" },
+    { "patron": "src/shared/README.md", "motivo": "arquitectura del código compartido, no un producto" },
+    { "patron": "erp/migrations/README.md", "motivo": "reglas de las migraciones del ERP (documentación de arquitectura)" },
+    { "patron": "trayectorias/README.md", "motivo": "formato de datos de la fábrica, no un producto" }
+  ]
+}
diff --git a/.claude/skills/readme/plantilla.md b/.claude/skills/readme/plantilla.md
new file mode 100644
index 0000000..7b6b6c6
--- /dev/null
+++ b/.claude/skills/readme/plantilla.md
@@ -0,0 +1,45 @@
+# «nombre de la herramienta o de la app»
+
+«Una línea: qué resuelve y para quién, en palabras de quien lo usa, no de quien lo programó.»
+
+## Qué hace
+
+- «Capacidad dicha como resultado para quien la usa, no como módulo.»
+
+### Qué no hace
+
+- «Límite deliberado y su porqué. Los límites son parte del producto: si no hay, se dice.»
+
+## Casos de uso
+
+- **«Quién»**, cuando «situación concreta»: «qué obtiene». *(pendiente: si el código, el SDD o
+  las specs no lo sostienen, se pregunta al laboratorio; nunca se inventa)*
+
+## Requerimientos de infraestructura
+
+- **Runtime**: Node «`engines.node` del `package.json`, tal cual».
+- **Dependencias del sistema**: pendiente («motores, binarios y modelos con su versión pineada;
+  "ninguna" si no hay»).
+- **CPU, GPU y memoria**: no medido («la cifra medida con su fecha y de dónde sale; si nadie la
+  midió, "no medido" y no una estimación»).
+- **Servicios externos**: pendiente («"ninguno" si no hay»).
+- **Variables de entorno**: pendiente («solo los NOMBRES, jamás un valor»).
+- **Almacenamiento**: pendiente («qué escribe, dónde y cómo se borra; "nada" si no escribe»).
+- **Salida del perímetro (C4)**: pendiente («si algún dato sale de la máquina: qué, a quién y la
+  decisión C4 que lo autoriza; es decisión de flujo de datos, no de precio»).
+
+## Instalar
+
+«El camino más corto que funciona.»
+
+## Uso
+
+«Puntos de entrada, API o comandos, con un ejemplo que corra.»
+
+## Pruebas
+
+«Cómo se prueba y qué cubre.»
+
+## Cambios
+
+«Qué cambió en cada versión.»
diff --git a/AGENTS.md b/AGENTS.md
index c4b0acd..13eeb29 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -119,6 +119,9 @@ Usuario dice algo
     |         proyecto limpio. Publicar es gate humano, no un paso de script.
     |         Pinear la version en el consumidor: `latest` es anti-patron aqui igual (C1)
     |
+    ├── "Haz / reestructura / revisa el README" de una herramienta (tools/) o app (src/features/)
+    |       → Ejecutar skill README: que hace → casos de uso → infraestructura → lo demas
+    |
     ├── "Quiero hacer deploy / publicar"
     |       → Vercel CLI o git push
     |       → Servidor propio (Hetzner u otro VPS): `npm run configura:deploy` (mide el
@@ -162,7 +165,7 @@ Usuario dice algo
 
 ---
 
-## Skills: 26 Herramientas Especializadas
+## Skills: 27 Herramientas Especializadas
 
 Viven en `.claude/skills/<nombre>/SKILL.md`. Su `description` ya entra en contexto en cada
 sesion (el arnes la carga sola), asi que la tabla que antes vivia aqui pagaba dos veces lo
diff --git a/CLAUDE.md b/CLAUDE.md
index 951eaba..6606bb9 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -10,7 +10,7 @@ y esta capa ya se llevo esa leccion.
 
 Lo especifico de este arnes, y solo eso:
 
-- **Skills**: `.claude/skills/` (26). Se invocan con `/nombre` o los activa el modelo.
+- **Skills**: `.claude/skills/` (27). Se invocan con `/nombre` o los activa el modelo.
 - **Rules**: `.claude/rules/*.md` cargan por `paths:` solo al tocar esos archivos (aprendizajes,
   arquitectura, flujos, QA). Lo que obliga sigue inline en `AGENTS.md`.
 - **Gobernanza**: `npm run validate` encadena typecheck, lint, build, verificador, regresion,
diff --git a/GEMINI.md b/GEMINI.md
index b12f490..cf7f6e8 100644
--- a/GEMINI.md
+++ b/GEMINI.md
@@ -128,6 +128,9 @@ Usuario dice algo
     |         proyecto limpio. Publicar es gate humano, no un paso de script.
     |         Pinear la version en el consumidor: `latest` es anti-patron aqui igual (C1)
     |
+    ├── "Haz / reestructura / revisa el README" de una herramienta (tools/) o app (src/features/)
+    |       → Ejecutar skill README: que hace → casos de uso → infraestructura → lo demas
+    |
     ├── "Quiero hacer deploy / publicar"
     |       → Vercel CLI o git push
     |       → Servidor propio (Hetzner u otro VPS): `npm run configura:deploy` (mide el
diff --git a/README.md b/README.md
index 6cd93cc..1f01ce1 100644
--- a/README.md
+++ b/README.md
@@ -18,7 +18,7 @@ segun cual sea:
 | Comando | `npm run configura:deploy` + `npm run deploy` | `npm run empaqueta <nombre>` |
 
 Lo que **no** cambia entre las dos: la capa de gobernanza, el gate `npm run validate`, las
-specs y los 26 skills. Se hereda entero, construyas lo que construyas.
+specs y los 27 skills. Se hereda entero, construyas lo que construyas.
 
 Un mismo repo puede llevar las dos: la app en `src/`, y en `tools/` lo que ya reusaste
 lo bastante como para sacarlo de ahi.
@@ -43,7 +43,7 @@ laboratorio lo prueba aqui y de aqui sale lo que se licencia a clientes. Vive en
 - Supabase (Database + Auth + RLS)
 - Tailwind CSS 3.4 + shadcn/ui **cableado**: tokens en variables CSS, tema claro/oscuro, `cn()` y `Button`
 - Zustand para el estado que comparten los componentes de una feature
-- 26 Skills de Claude Code (V4 Skills 2.0)
+- 27 Skills de Claude Code (V4 Skills 2.0)
 - Specs con requisitos en notacion EARS + `docs/constitution.md`
 - `tools/` + `npm run empaqueta`: el camino de paquete reutilizable, con su integracion probada
 - **Extractor documental** listo para instalar (`tools/extractor-documental/`): OCR, codigos de
@@ -164,7 +164,7 @@ src/
     └── types/
 ```
 
-## Skills (26 total)
+## Skills (27 total)
 
 Invocables con `/nombre`; Claude tambien los activa solo segun la tarea.
 
@@ -177,6 +177,7 @@ Invocables con `/nombre`; Claude tambien los activa solo segun la tarea.
 | `/add-mobile` | PWA instalable + push notifications |
 | `/website-3d` | Landing cinematica: scroll-driven video + copy AIDA/PAS |
 | `/crear-herramienta` | Convertir algo ya reusado en paquete instalable (`tools/`) |
+| `/readme` | README product first de herramientas y apps: nuevo, reestructura, revisa |
 | `/spec-generator` | Entrevista de requisitos → spec.md con RF en notacion EARS |
 | `/prp` | Planificar features complejas antes de implementar |
 | `/bucle-agentico` | Implementar features complejas por fases |
@@ -368,7 +369,7 @@ consultarse y un verificador falla si el papel y el codigo divergen.
 
 ```bash
 npm run verify:gobernanza   # falla si la capa quedo suelta (156 comprobaciones; el propio verificador vigila esta cifra)
-npm run regresion           # C2 capa A: contratos de los 26 skills
+npm run regresion           # C2 capa A: contratos de los 27 skills
 npm run regresion -- --trampa   # C2 capa B: casos-trampa, para cada CDC
 ```
 
@@ -598,7 +599,7 @@ o lo declara no medido y fuera de produccion.
 
 ```
 .claude/
-├── skills/                    # 26 Skills (V4 Skills 2.0)
+├── skills/                    # 27 Skills (V4 Skills 2.0)
 │   └── ai/references/         # AI Templates (11 bloques)
 ├── gobernanza/                # 7 controles, plantillas, registros y golden-sets
 ├── specs/                     # spec.md (EARS) + plan.md + tareas.md, por feature
diff --git a/docs/CREAR-UNA-HERRAMIENTA.md b/docs/CREAR-UNA-HERRAMIENTA.md
index c822213..e08a915 100644
--- a/docs/CREAR-UNA-HERRAMIENTA.md
+++ b/docs/CREAR-UNA-HERRAMIENTA.md
@@ -135,8 +135,10 @@ Herramienta: @tu-scope/ejemplo-herramienta@0.1.0  (tools/ejemplo-herramienta)
 ✓ contrato del package.json
 ✓ build (8 archivos en dist/)
 ✓ 'use client' conservada en react.js
-✓ tarball (9 archivos) ./tools/ejemplo-herramienta/tu-scope-ejemplo-herramienta-0.1.0.tgz
-✓ integracion: instalado e importado en un proyecto limpio
+✓ tarball (10 archivos) ./tools/ejemplo-herramienta/tu-scope-ejemplo-herramienta-0.1.0.tgz
+✓ integracion: 2 subpath(s) instalados e importados en un proyecto limpio
+  @tu-scope/ejemplo-herramienta → 1 export(s)
+  @tu-scope/ejemplo-herramienta/react → sin probar: falta el peer opcional `react`
   exporta: aSlug
 ✓ tipos incluidos (2 .d.ts)
 
@@ -151,6 +153,11 @@ un paquete que luego no se instala; esa no.
 Con eso ya puedes usar la herramienta en otro proyecto tuyo **sin publicar nada**: se
 instala desde el archivo empaquetado. Publicar viene después, y solo si hace falta.
 
+Uno de esos diez archivos es el **README**, y va **product first**: qué hace y qué no, casos de
+uso y requerimientos de infraestructura, y después lo demás. Es lo primero que lee quien la
+instala. El andamio ya lo trae; para la tuya lo escribe el agente con el skill `readme`, y lo que
+no se sepa queda «pendiente» o «no medido» en vez de inventarse.
+
 ---
 
 ## 7. Cuando sale en rojo
diff --git a/docs/EMPAQUETAR-HERRAMIENTA.md b/docs/EMPAQUETAR-HERRAMIENTA.md
index a94f5d3..aec8bea 100644
--- a/docs/EMPAQUETAR-HERRAMIENTA.md
+++ b/docs/EMPAQUETAR-HERRAMIENTA.md
@@ -20,6 +20,7 @@ Lo segundo es lo que casi nadie prueba: el código funciona, los tests pasan, y
 tools/
 └── mi-herramienta/
     ├── package.json      # el contrato: exports, files, peerDependencies
+    ├── README.md         # product first: qué hace, casos de uso, infraestructura, lo demás
     ├── tsconfig.json     # build propio, con declaration: true
     ├── src/
     │   ├── index.ts      # nucleo: TypeScript puro, CERO dependencias
@@ -30,6 +31,11 @@ tools/
 Copia **`tools/ejemplo-herramienta/`** como andamio. No es un ejemplo de mentira: es el que
 pasa el empaquetador en verde, así que su `package.json` ya tiene el contrato correcto.
 
+Su `README.md` también se copia, y se reescribe con **`/readme nuevo tools/<nombre>`** (skill
+`readme`): qué hace y qué no, casos de uso y requerimientos de infraestructura antes que nada
+técnico. `npm run revisa:readmes -- tools/<nombre>/README.md` lo audita sin modelo, y npm lo mete
+en el tarball aunque `files` no lo liste.
+
 ---
 
 ## 2. La regla que decide si tu herramienta es reusable
diff --git a/inventario/INVENTARIO.md b/inventario/INVENTARIO.md
index 24864e7..628572c 100644
--- a/inventario/INVENTARIO.md
+++ b/inventario/INVENTARIO.md
@@ -5,13 +5,13 @@
 > Costo y clasificacion (D+I, defensibilidad) no viven aqui: se calculan con
 > `npm run inventario:exporta` y viajan al ERP (spec 014, repo publico).
 
-**36 activos** cubren **220 unidades** del repo.
+**36 activos** cubren **224 unidades** del repo.
 
 | ID | Activo | Clase | Tipo | Estado | Unidades | Ubicacion |
 | --- | --- | --- | --- | --- | ---: | --- |
 | TPL-conocimiento | Conocimiento del grafo: fuente unica de reglas con fuente citada, por dominio y versionada (migrado de Hermes) | CONOCIMIENTO | datos | beta | 1 | `tools/conocimiento` |
 | TPL-doctrina | Doctrina de la fabrica: instrucciones del agente, reglas y memoria de proyecto | CONOCIMIENTO | config_agentica | produccion | 17 | `AGENTS.md` |
-| TPL-especificaciones | Especificaciones y disenos: specs, PRPs, goals, SDD e investigaciones | CONOCIMIENTO | documento | produccion | 64 | `.claude/specs` |
+| TPL-especificaciones | Especificaciones y disenos: specs, PRPs, goals, SDD e investigaciones | CONOCIMIENTO | documento | produccion | 65 | `.claude/specs` |
 | TPL-design-systems | Design systems de referencia (bento, glass, neobrutalismo...) | DISEÑO | documento | produccion | 5 | `.claude/design-systems` |
 | TPL-clis-impresos | CLIs impresos del manifiesto (externo: lo cataloga su fuente) | FABRICA | software | produccion | 5 | `cli:*` |
 | TPL-ejemplo-herramienta | Andamio de herramienta empaquetable (el ejemplo a copiar) | FABRICA | software | produccion | 1 | `tools/ejemplo-herramienta` |
@@ -24,7 +24,7 @@
 | TPL-inventario | Inventario de activos: indice, detector, costeo y export al ERP | FABRICA | software | beta | 3 | `inventario` |
 | TPL-manifiesto-gates | Manifiesto de gates: el padron de lo que el gate corre | FABRICA | software | produccion | 5 | `.claude/gates.json` |
 | TPL-motor-ia | Motor de IA: routing por nivel, contabilidad de tokens y trayectorias de la app | FABRICA | software | produccion | 4 | `src/lib/ai` |
-| TPL-skills | Catalogo de skills de la fabrica | FABRICA | config_agentica | produccion | 27 | `.claude/skills` |
+| TPL-skills | Catalogo de skills de la fabrica | FABRICA | config_agentica | produccion | 30 | `.claude/skills` |
 | TPL-trayectorias | Trayectorias: trazas de ejecucion, evaluador, informe y propuestas | FABRICA | software | produccion | 4 | `scripts/trayectorias` |
 | TPL-despliegue | Blueprint de despliegue self-hosted (Docker, Caddy, Hetzner, Hermes) | INFRA | infraestructura | produccion | 10 | `docker-compose.yml` |
 | TPL-app-base | App SaaS base (Next.js + Supabase, PWA) | PRODUCTO | software | produccion | 6 | `src/app` |
diff --git a/inventario/activos.json b/inventario/activos.json
index 41fd6b8..fd1fea8 100644
--- a/inventario/activos.json
+++ b/inventario/activos.json
@@ -227,7 +227,7 @@
    "nombre": "Catalogo de skills de la fabrica",
    "tipo": "config_agentica", "clase": "FABRICA", "estado": "produccion",
    "ubicacion": ".claude/skills", "responsable": "dep-sw",
-   "cubre": [".claude/skills/*", "scripts/regresion-skills.mjs"]
+   "cubre": [".claude/skills/*", "scripts/regresion-skills.mjs", "scripts/revisa-readmes.mjs", "scripts/no-perdida-readme.mjs"]
   },
   {
    "id": "TPL-doctrina",
diff --git a/package.json b/package.json
index 7fca10e..8fff6f9 100644
--- a/package.json
+++ b/package.json
@@ -30,6 +30,8 @@
     "erp:prueba": "bash erp/instalacion/prueba-efimera.sh",
     "erp:control": "bash erp/instalacion/control-reversion.sh",
     "verifica:marca-blanca": "node scripts/verifica-marca-blanca.mjs",
+    "revisa:readmes": "node scripts/revisa-readmes.mjs",
+    "readme:no-perdida": "node scripts/no-perdida-readme.mjs",
     "regresion": "node scripts/regresion-skills.mjs",
     "audita:fugas": "node scripts/audita-fugas.mjs",
     "audita:secretos": "node scripts/audita-secretos.mjs",
diff --git a/scripts/lib/no-perdida.mjs b/scripts/lib/no-perdida.mjs
new file mode 100644
index 0000000..7ef0728
--- /dev/null
+++ b/scripts/lib/no-perdida.mjs
@@ -0,0 +1,89 @@
+/**
+ * Prueba de no pérdida de un README reestructurado — núcleo puro.
+ *
+ * Método: multiconjunto de líneas normalizadas + subsecuencia común más larga (LCS).
+ *   - conservada: la línea sigue, en el mismo orden relativo (está en la LCS);
+ *   - movida: el mismo texto sigue, en otro sitio (fuera de la LCS, pero presente);
+ *   - reescrita con motivo: ya no está tal cual y hay un motivo declarado para ESA línea;
+ *   - borrada sin justificar: ya no está y nadie dijo por qué. Es el rojo.
+ * Además, cifras: todo número del original tiene que seguir en el nuevo (multiconjunto). Las
+ * cifras medidas se conservan tal cual; perder una es perder una medición.
+ *
+ * Normalizar es mínimo a propósito: espacios plegados y el nivel de encabezado fuera (subir un
+ * `###` a `##` es mover estructura, no reescribir). Cualquier otro cambio de texto cuenta.
+ */
+
+/** La forma comparable de una línea: sin marcas de encabezado y con los espacios plegados. */
+export const normalizaLinea = (l) => l.replace(/^#{1,6}\s+/, '').replace(/\s+/g, ' ').trim();
+
+const lineas = (texto) => texto.split('\n')
+  .map((l, i) => ({ n: i + 1, t: normalizaLinea(l) }))
+  .filter((x) => x.t !== '');
+
+/** Índices de A y de B que forman una subsecuencia común más larga. */
+function lcs(a, b) {
+  const m = b.length + 1;
+  const t = new Uint32Array((a.length + 1) * m);
+  for (let i = a.length - 1; i >= 0; i -= 1) {
+    for (let j = b.length - 1; j >= 0; j -= 1) {
+      t[i * m + j] = a[i] === b[j] ? t[(i + 1) * m + j + 1] + 1 : Math.max(t[(i + 1) * m + j], t[i * m + j + 1]);
+    }
+  }
+  const enA = new Set();
+  const enB = new Set();
+  let i = 0;
+  let j = 0;
+  while (i < a.length && j < b.length) {
+    if (a[i] === b[j]) { enA.add(i); enB.add(j); i += 1; j += 1; }
+    else if (t[(i + 1) * m + j] >= t[i * m + j + 1]) i += 1;
+    else j += 1;
+  }
+  return { enA, enB };
+}
+
+const suma = (mapa, k, d) => mapa.set(k, (mapa.get(k) ?? 0) + d);
+
+/** Multiconjunto de las cifras de un texto (enteros y decimales con coma o punto). */
+export function cifras(texto) {
+  const mapa = new Map();
+  for (const m of texto.matchAll(/\d+(?:[.,]\d+)*/g)) suma(mapa, m[0], 1);
+  return mapa;
+}
+
+/** Cifras del original que el nuevo tiene MENOS veces (con cuántas faltan). */
+function cifrasPerdidas(antes, despues) {
+  const a = cifras(antes);
+  const d = cifras(despues);
+  return [...a].filter(([k, n]) => (d.get(k) ?? 0) < n).map(([k, n]) => ({ cifra: k, faltan: n - (d.get(k) ?? 0) }));
+}
+
+/**
+ * Compara el README de antes con el de después. `motivos` es [{ antes, motivo }]: el texto de
+ * una línea original (se compara normalizado) y por qué ya no está tal cual.
+ */
+export function comparaNoPerdida(antes, despues, motivos = []) {
+  const A = lineas(antes);
+  const B = lineas(despues);
+  const { enA, enB } = lcs(A.map((x) => x.t), B.map((x) => x.t));
+  const restoB = new Map();
+  B.forEach((x, j) => { if (!enB.has(j)) suma(restoB, x.t, 1); });
+  const porMotivo = new Map(motivos.map((m) => [normalizaLinea(m.antes), m.motivo]));
+  const r = { conservadas: [], movidas: [], reescritas: [], sinJustificar: [] };
+  A.forEach((x, i) => {
+    if (enA.has(i)) r.conservadas.push(x);
+    else if ((restoB.get(x.t) ?? 0) > 0) { suma(restoB, x.t, -1); r.movidas.push(x); }
+    else if (porMotivo.has(x.t)) r.reescritas.push({ ...x, motivo: porMotivo.get(x.t) });
+    else r.sinJustificar.push(x);
+  });
+  const usados = new Set(r.reescritas.map((x) => x.t));
+  const motivosSobrantes = [...porMotivo.keys()].filter((t) => !usados.has(t));
+  const nuevas = B.filter((x, j) => !enB.has(j)).length - r.movidas.length;
+  return {
+    ...r,
+    antes: A.length,
+    despues: B.length,
+    nuevas,
+    motivosSobrantes,
+    cifrasPerdidas: cifrasPerdidas(antes, despues),
+  };
+}
diff --git a/scripts/lib/readmes.mjs b/scripts/lib/readmes.mjs
new file mode 100644
index 0000000..5f73c67
--- /dev/null
+++ b/scripts/lib/readmes.mjs
@@ -0,0 +1,225 @@
+/**
+ * Contrato «product first» de los README de herramientas y apps — el núcleo puro del auditor.
+ *
+ * Recibe textos y devuelve faltas; no lee disco ni git (eso es `revisa-readmes.mjs`). Así el
+ * mismo código audita el árbol de trabajo, una ref de git (`--desde`) y las siembras de
+ * `--prueba`, sin ramas distintas que puedan divergir.
+ *
+ * El contrato lo declara `.claude/skills/readme/contrato.json`; aquí solo se aplica.
+ */
+
+export const RUTA_CONTRATO = '.claude/skills/readme/contrato.json';
+
+/** Minúsculas, sin acentos ni marcas de markdown, espacios plegados, sin puntuación final. */
+export function normaliza(texto) {
+  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
+    .replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim().replace(/[.:]+$/, '');
+}
+
+/** Glob mínimo: `*` es un segmento (también los que empiezan por punto), `**` cualquier profundidad. */
+export function coincideGlob(patron, ruta) {
+  const fuente = patron.split('/').map((s) => {
+    if (s === '**') return '.*';
+    return s.split('*').map((t) => t.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*');
+  }).join('/');
+  return new RegExp(`^${fuente}$`).test(ruta);
+}
+
+/** Un archivo es un README si su nombre contiene README y es markdown. */
+export const esReadme = (ruta) => /README[^/]*\.md$/i.test(ruta.split('/').pop() ?? '');
+
+/** Título, preámbulo y secciones H2 de un markdown. Lo que va dentro de ``` no cuenta. */
+export function estructura(texto) {
+  const salida = { h1: [], preambulo: [], secciones: [], primeraNoVacia: null };
+  let enCodigo = false;
+  let actual = null;
+  texto.split('\n').forEach((linea, i) => {
+    if (salida.primeraNoVacia === null && linea.trim() !== '') salida.primeraNoVacia = i;
+    const valla = /^\s*(```|~~~)/.test(linea);
+    if (!enCodigo && !valla && /^# (?!#)/.test(linea)) {
+      salida.h1.push({ texto: linea.slice(2).trim(), linea: i });
+      return;
+    }
+    if (!enCodigo && !valla && /^## (?!#)/.test(linea)) {
+      actual = { titulo: linea.slice(3).trim(), linea: i + 1, cuerpo: [] };
+      salida.secciones.push(actual);
+      return;
+    }
+    if (valla) enCodigo = !enCodigo;
+    (actual ? actual.cuerpo : salida.preambulo).push(linea);
+  });
+  return salida;
+}
+
+/** Índice de cada sección de producto entre las H2 (-1 si falta). */
+function indicesDeProducto(secciones, contrato) {
+  return contrato.secciones.map((s) => {
+    const admitidos = s.admitidos.map(normaliza);
+    return secciones.findIndex((h) => admitidos.includes(normaliza(h.titulo)));
+  });
+}
+
+const esDeProducto = (titulo, contrato) =>
+  contrato.secciones.some((s) => s.admitidos.map(normaliza).includes(normaliza(titulo)));
+
+/** Faltas de título y preámbulo: un solo H1 arriba y, antes de la primera sección, solo la propuesta de valor. */
+function faltasDeCabecera(e, contrato) {
+  const faltas = [];
+  if (e.h1.length !== 1) faltas.push(`debe tener exactamente un título «# …» (tiene ${e.h1.length})`);
+  else if (e.h1[0].linea !== e.primeraNoVacia) faltas.push('el título «# …» debe ser la primera línea');
+  const llenas = e.preambulo.filter((l) => l.trim() !== '');
+  const max = contrato.preambulo.maxLineas;
+  if (llenas.length > max) {
+    faltas.push(`antes de «${contrato.secciones[0].titulo}» solo va la propuesta de valor: ${llenas.length} líneas (máximo ${max}); lo técnico va después de las tres de producto`);
+  }
+  if (llenas.some((l) => /^\s*(```|~~~|\|)/.test(l) || /^#{3,} /.test(l))) {
+    faltas.push('el preámbulo lleva código, tabla o subsección: va después de las tres de producto');
+  }
+  return faltas;
+}
+
+/** Faltas de presencia y orden de las tres secciones de producto frente a «lo demás». */
+function faltasDeOrden(e, contrato) {
+  const faltas = [];
+  const idx = indicesDeProducto(e.secciones, contrato);
+  contrato.secciones.forEach((s, i) => { if (idx[i] === -1) faltas.push(`falta «${s.titulo}»`); });
+  const presentes = idx.filter((i) => i !== -1);
+  const ultima = presentes.length ? Math.max(...presentes) : -1;
+  const otra = e.secciones.findIndex((h) => !esDeProducto(h.titulo, contrato));
+  if (otra !== -1 && otra < ultima) {
+    faltas.push(`«${e.secciones[otra].titulo}» (lo demás) va antes que las tres de producto`);
+  }
+  for (let a = 0; a < idx.length; a += 1) {
+    for (let b = a + 1; b < idx.length; b += 1) {
+      if (idx[a] !== -1 && idx[b] !== -1 && idx[b] < idx[a]) {
+        faltas.push(`«${contrato.secciones[b].titulo}» antes que «${contrato.secciones[a].titulo}»`);
+      }
+    }
+  }
+  return faltas;
+}
+
+/** El texto de la viñeta de un rubro: su línea y las que siguen hasta la próxima viñeta o un hueco. */
+function bloqueDeRubro(cuerpo, etiqueta) {
+  const buscada = normaliza(etiqueta);
+  const inicio = cuerpo.findIndex((l) => {
+    const m = l.match(/^\s*[-*]\s+\*\*([^*]+)\*\*/);
+    return m !== null && normaliza(m[1]) === buscada;
+  });
+  if (inicio === -1) return null;
+  const fin = cuerpo.findIndex((l, i) => i > inicio && (l.trim() === '' || /^\s*[-*]\s+\*\*/.test(l)));
+  return cuerpo.slice(inicio, fin === -1 ? undefined : fin).join(' ');
+}
+
+const SIN_CODIGO = (l) => l.replace(/`[^`]*`/g, '');
+
+/** Faltas de contenido de cada sección de producto. */
+function faltasDeContenido(e, contrato) {
+  const faltas = [];
+  const [qh, cu, inf] = indicesDeProducto(e.secciones, contrato).map((i) => (i === -1 ? null : e.secciones[i]));
+  if (qh && !/\bno hace\b/.test(normaliza(qh.cuerpo.join(' ')))) {
+    faltas.push(`«${qh.titulo}» no dice qué NO hace`);
+  }
+  if (cu && !cu.cuerpo.some((l) => /^\s*([-*]|\d+\.)\s+\S/.test(l) || /^\|/.test(l) || /^### /.test(l))) {
+    faltas.push('«Casos de uso» sin escenarios (lista, tabla o subsección; «pendiente» si nada lo sostiene)');
+  }
+  if (!inf) return faltas;
+  for (const r of contrato.rubros) {
+    const bloque = bloqueDeRubro(inf.cuerpo, r.etiqueta);
+    if (bloque === null) faltas.push(`infraestructura sin «${r.etiqueta}» (viñeta con la etiqueta en negrita)`);
+    else if (r.cifraONoMedido && !/\d/.test(SIN_CODIGO(bloque)) && !/no medid/.test(normaliza(bloque))) {
+      faltas.push(`«${r.etiqueta}» sin cifra medida ni «no medido»`);
+    }
+  }
+  const asignaciones = inf.cuerpo.flatMap((l) => [...l.matchAll(/\b([A-Z][A-Z0-9]*_[A-Z0-9_]*)=(?=\S)/g)].map((m) => m[1]));
+  for (const nombre of new Set(asignaciones)) {
+    faltas.push(`infraestructura con «${nombre}=…»: las variables de entorno van solo por nombre`);
+  }
+  return faltas;
+}
+
+/* ------------------------------------------------------------ valores sensibles */
+
+/** Nombres de variable que guardan un secreto (en inglés y en español). */
+const NOMBRE_SENSIBLE = /(KEY|TOKEN|SECRET|SECRETO|PASSWORD|PASSWD|PASS|PWD|CLAVE|LLAVE|CONTRASENA|CREDENTIAL|PRIVATE|PRIVADA|DSN)/;
+/** Lo que no es un valor sino su hueco: vacío, `<…>`, `…`, `$VAR`, `${…}`, xxx, ***, «tu-…». */
+const HUECO = /^(|…|\.{3}|<[^>]*>?|\$\{?[A-Za-z_][^}]*\}?|x{3,}|\*{3,}|(tu|your)[-_].*|ejemplo.*|example.*|changeme|placeholder)$/i;
+/** Formas de credencial que no necesitan nombre (las mismas familias que `audita-secretos.mjs`). */
+const FORMAS = [
+  ['clave con prefijo sk-', /\bsk-[A-Za-z0-9_-]{24,}/],
+  ['JWT con sus tres partes', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
+  ['token de GitHub', /\bgh[pos]_[A-Za-z0-9]{36}/],
+  ['token de Slack', /\bxox[baprs]-[A-Za-z0-9-]{12,}/],
+  ['clave privada PEM', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
+  ['URL con contraseña', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@<>]+:(?!<)[^\s@<>]{3,}@/i],
+];
+
+/**
+ * Valores de variables de entorno sensibles escritos en el texto. Devuelve línea, nombre y
+ * LARGO del valor — nunca el valor: el informe no puede ser la segunda fuga.
+ */
+export function valoresSensibles(texto) {
+  const hallazgos = [];
+  texto.split('\n').forEach((linea, i) => {
+    for (const m of linea.matchAll(/\b([A-Z][A-Z0-9_]{2,})=("[^"]*"|'[^']*'|[^\s`'"|)]*)/g)) {
+      const valor = m[2].replace(/^["']|["']$/g, '');
+      if (NOMBRE_SENSIBLE.test(m[1]) && !HUECO.test(valor)) {
+        hallazgos.push({ linea: i + 1, que: `${m[1]} con valor escrito (largo ${valor.length})` });
+      }
+    }
+    for (const [nombre, re] of FORMAS) if (re.test(linea)) hallazgos.push({ linea: i + 1, que: nombre });
+  });
+  return hallazgos;
+}
+
+/** Todas las faltas de un README contra el contrato. Vacío = conforme. */
+export function revisaReadme(texto, contrato) {
+  const e = estructura(texto);
+  return [
+    ...faltasDeCabecera(e, contrato),
+    ...faltasDeOrden(e, contrato),
+    ...faltasDeContenido(e, contrato),
+    ...valoresSensibles(texto).map((h) => `línea ${h.linea}: ${h.que} — solo el nombre, jamás el valor`),
+  ];
+}
+
+/** Esqueleto de secciones (H1, H2 y H3) para las evidencias de antes/después. */
+export function esqueleto(texto) {
+  let enCodigo = false;
+  return texto.split('\n').filter((l) => {
+    if (/^\s*(```|~~~)/.test(l)) enCodigo = !enCodigo;
+    return !enCodigo && /^#{1,3} /.test(l);
+  });
+}
+
+/** Carpetas de producto (según `carpetasDeProducto`) presentes en la lista de archivos. */
+function carpetasDe(archivos, patrones) {
+  const carpetas = new Set();
+  for (const p of patrones) {
+    const k = p.split('/').length;
+    for (const a of archivos) {
+      const partes = a.split('/');
+      if (partes.length > k && coincideGlob(p, partes.slice(0, k).join('/'))) carpetas.add(partes.slice(0, k).join('/'));
+    }
+  }
+  return [...carpetas].sort();
+}
+
+/**
+ * Audita el conjunto: cada README cae en alcance, en exclusión con motivo o en «sin clasificar»
+ * (que es rojo: un README nuevo fuera de los dos no puede quedar sin mirar en silencio).
+ */
+export function audita({ archivos, leer, contrato }) {
+  const evaluados = [];
+  const excluidos = [];
+  const sinClasificar = [];
+  for (const ruta of archivos.filter(esReadme).sort()) {
+    const exclusion = contrato.exclusiones.find((x) => coincideGlob(x.patron, ruta));
+    if (exclusion) excluidos.push({ ruta, motivo: exclusion.motivo });
+    else if (contrato.alcance.some((p) => coincideGlob(p, ruta))) evaluados.push({ ruta, faltas: revisaReadme(leer(ruta), contrato) });
+    else sinClasificar.push(ruta);
+  }
+  const conReadme = new Set(archivos.filter((a) => /(^|\/)README\.md$/.test(a)).map((a) => a.split('/').slice(0, -1).join('/')));
+  const sinReadme = carpetasDe(archivos, contrato.carpetasDeProducto).filter((c) => !conReadme.has(c));
+  return { evaluados, excluidos, sinClasificar, sinReadme };
+}
diff --git a/scripts/no-perdida-readme.mjs b/scripts/no-perdida-readme.mjs
new file mode 100644
index 0000000..5fa944e
--- /dev/null
+++ b/scripts/no-perdida-readme.mjs
@@ -0,0 +1,101 @@
+#!/usr/bin/env node
+/**
+ * Prueba de no pérdida de un README reestructurado (skill `readme`, comando `reestructura`).
+ *
+ * Compara el README de una ref (por defecto, la base de la rama: `git merge-base HEAD main`)
+ * con el del árbol de trabajo, línea a línea: conservadas, movidas, reescritas con motivo y
+ * borradas sin justificar, y las cifras del original que ya no aparecen. Rojo si hay alguna
+ * línea borrada sin motivo o alguna cifra perdida: reordenar para producto se admite,
+ * borrar en silencio no.
+ *
+ * Uso:  node scripts/no-perdida-readme.mjs <ruta> [--desde <ref>] [--motivos <archivo.json>] [--detalle] [--json]
+ *       node scripts/no-perdida-readme.mjs <ruta> --prueba   (siembra una línea borrada, una cifra
+ *         cambiada y un párrafo reflujado sobre ese README, y exige que las tres caigan)
+ *   --motivos  JSON { "motivos": [{ "antes": "<línea original>", "motivo": "<por qué>" }] }
+ *   --detalle  lista cada línea reescrita con su motivo, las borradas y las cifras perdidas
+ * Exit: 0 sin pérdida · 1 con pérdida · 2 uso incorrecto.
+ */
+import { readFileSync, existsSync } from 'node:fs';
+import { execFileSync } from 'node:child_process';
+import { join } from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { comparaNoPerdida } from './lib/no-perdida.mjs';
+import { esqueleto } from './lib/readmes.mjs';
+
+const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');
+const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
+const verde = (s) => `\x1b[32m${s}\x1b[0m`;
+const gris = (s) => `\x1b[2m${s}\x1b[0m`;
+const git = (args) => execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
+const valorDe = (b) => { const i = process.argv.indexOf(b); return i === -1 ? null : process.argv[i + 1]; };
+
+function entrada() {
+  const ruta = process.argv.slice(2).find((a, i, t) => !a.startsWith('--') && !['--desde', '--motivos'].includes(t[i - 1]));
+  if (!ruta || !existsSync(join(RAIZ, ruta))) {
+    console.error('uso: node scripts/no-perdida-readme.mjs <ruta-del-README> [--desde <ref>] [--motivos <archivo.json>]');
+    process.exit(2);
+  }
+  const desde = valorDe('--desde') ?? git(['merge-base', 'HEAD', 'main']);
+  const archivoMotivos = valorDe('--motivos');
+  const motivos = archivoMotivos ? JSON.parse(readFileSync(join(RAIZ, archivoMotivos), 'utf8')).motivos : [];
+  return { ruta, desde, motivos };
+}
+
+function imprimeDetalle(r) {
+  for (const x of r.reescritas) console.log(gris(`    reescrita (l.${x.n}) «${x.t.slice(0, 90)}» — ${x.motivo}`));
+  for (const x of r.sinJustificar) console.log(rojo(`    borrada sin motivo (l.${x.n}) «${x.t.slice(0, 90)}»`));
+  for (const c of r.cifrasPerdidas) console.log(rojo(`    cifra perdida «${c.cifra}» (faltan ${c.faltan})`));
+  for (const t of r.motivosSobrantes) console.log(gris(`    motivo sin uso (la línea sigue tal cual): «${t.slice(0, 90)}»`));
+}
+
+/**
+ * La prueba de la prueba: sobre el README de la ruta, tal cual está en la ref, siembra tres
+ * pérdidas —una línea borrada, una cifra cambiada y un párrafo reflujado— y exige que caigan.
+ */
+function prueba(ruta, desde) {
+  const antes = git(['show', `${desde}:${ruta}`]);
+  const lineas = antes.split('\n');
+  const i = lineas.findIndex((l) => /\d/.test(l) && !/^#/.test(l) && l.trim().length > 20);
+  const j = lineas.findIndex((l, k) => k > 0 && l.trim() && lineas[k - 1].trim() && !/^[#|`>-]/.test(l) && !/^[#|`>-]/.test(lineas[k - 1]));
+  const siembras = [
+    ['línea borrada', lineas.filter((_, k) => k !== i).join('\n')],
+    ['cifra cambiada', lineas.map((l, k) => (k === i ? l.replace(/\d/, (d) => String((Number(d) + 1) % 10)) : l)).join('\n')],
+    ['párrafo reflujado', lineas.map((l, k) => (k === j - 1 ? `${l} ${lineas[j]}` : l)).filter((_, k) => k !== j).join('\n')],
+  ];
+  let cazadas = 0;
+  for (const [nombre, texto] of siembras) {
+    const r = comparaNoPerdida(antes, texto);
+    const caza = r.sinJustificar.length > 0 || r.cifrasPerdidas.length > 0;
+    cazadas += caza ? 1 : 0;
+    console.log(caza ? `CAZADA ${nombre} — ${r.sinJustificar.length} borrada(s), ${r.cifrasPerdidas.length} cifra(s)` : rojo(`VIVA   ${nombre}`));
+  }
+  console.log(`\nprueba de la prueba: ${cazadas} de ${siembras.length} pérdidas sembradas cazadas`);
+  process.exit(cazadas === siembras.length ? 0 : 1);
+}
+
+function main() {
+  const { ruta, desde, motivos } = entrada();
+  if (process.argv.includes('--prueba')) return prueba(ruta, desde);
+  const antes = git(['show', `${desde}:${ruta}`]);
+  const despues = readFileSync(join(RAIZ, ruta), 'utf8');
+  const r = comparaNoPerdida(antes, despues, motivos);
+  const ok = r.sinJustificar.length === 0 && r.cifrasPerdidas.length === 0;
+  if (process.argv.includes('--json')) {
+    console.log(JSON.stringify({ ruta, desde, ok, ...r }, null, 2));
+    process.exit(ok ? 0 : 1);
+  }
+  console.log(`No pérdida: ${ruta} (${desde.slice(0, 7)} → árbol de trabajo)`);
+  console.log(`  líneas no vacías: antes ${r.antes} · después ${r.despues}`);
+  console.log(`  conservadas en su sitio ${r.conservadas.length} · movidas ${r.movidas.length}`
+    + ` · reescritas con motivo ${r.reescritas.length} · borradas sin justificar ${r.sinJustificar.length}`
+    + ` · nuevas ${r.nuevas} · cifras perdidas ${r.cifrasPerdidas.length}`);
+  if (process.argv.includes('--detalle') || !ok) imprimeDetalle(r);
+  console.log(gris('  esqueleto antes:'));
+  for (const l of esqueleto(antes)) console.log(gris(`    ${l}`));
+  console.log(gris('  esqueleto después:'));
+  for (const l of esqueleto(despues)) console.log(gris(`    ${l}`));
+  console.log(ok ? verde('  sin pérdida: 0 borradas sin justificar, 0 cifras perdidas') : rojo('  CON PÉRDIDA'));
+  process.exit(ok ? 0 : 1);
+}
+
+if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
diff --git a/scripts/revisa-readmes.mjs b/scripts/revisa-readmes.mjs
new file mode 100644
index 0000000..9cfaf7b
--- /dev/null
+++ b/scripts/revisa-readmes.mjs
@@ -0,0 +1,153 @@
+#!/usr/bin/env node
+/**
+ * Auditor de los README de producto contra el contrato «product first» (skill `readme`).
+ *
+ * Todo README de una herramienta o app abre con qué hace, casos de uso y requerimientos de
+ * infraestructura, y después lo demás. El contrato vive en `.claude/skills/readme/contrato.json`;
+ * este script lo aplica sin modelo, así que lo puede correr cualquier arnés y un gate.
+ *
+ * Cada README del repo cae en una de tres casillas: EN ALCANCE (se audita), EXCLUIDO (con su
+ * motivo declarado en el contrato) o SIN CLASIFICAR (rojo: un README nuevo que nadie decidió si
+ * es de producto no se queda sin mirar). Las carpetas de producto sin README se listan como
+ * pendientes: se avisan, no se crean solas.
+ *
+ * Uso:  node scripts/revisa-readmes.mjs                  (el árbol de trabajo, con lo no versionado)
+ *       node scripts/revisa-readmes.mjs <ruta>...         (solo esos README)
+ *       node scripts/revisa-readmes.mjs --desde <ref>     (el estado de una ref de git, sin checkout)
+ *       node scripts/revisa-readmes.mjs --json            (para otros arneses)
+ *       node scripts/revisa-readmes.mjs --prueba          (la prueba de la prueba: siembra ocho
+ *         violaciones —casos de uso antes que qué hace, sin infraestructura, «Instalar» antes de las
+ *         de producto, un README nuevo en alcance que entra solo por el glob, un valor de variable de
+ *         entorno, un README sin clasificar, cómputo sin cifra ni «no medido», y qué hace sin decir
+ *         qué no hace— y exige que las ocho caigan)
+ * Exit: 0 todo conforme · 1 algún README no conforme o sin clasificar.
+ */
+import { readFileSync, existsSync } from 'node:fs';
+import { execFileSync } from 'node:child_process';
+import { join } from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { RUTA_CONTRATO, audita, revisaReadme } from './lib/readmes.mjs';
+
+const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');
+const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
+const verde = (s) => `\x1b[32m${s}\x1b[0m`;
+const ambar = (s) => `\x1b[33m${s}\x1b[0m`;
+const gris = (s) => `\x1b[2m${s}\x1b[0m`;
+const git = (args) => execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
+
+/** Archivos y lector: del árbol de trabajo (versionados + nuevos no ignorados) o de una ref. */
+function fuente(ref) {
+  if (ref) {
+    const archivos = git(['ls-tree', '-r', '--name-only', ref]).split('\n').filter(Boolean);
+    return { archivos, leer: (a) => git(['show', `${ref}:${a}`]) };
+  }
+  const archivos = git(['ls-files', '-co', '--exclude-standard']).split('\n').filter(Boolean)
+    .filter((a) => existsSync(join(RAIZ, a)));
+  return { archivos, leer: (a) => readFileSync(join(RAIZ, a), 'utf8') };
+}
+
+const valorDe = (bandera) => {
+  const i = process.argv.indexOf(bandera);
+  return i === -1 ? null : process.argv[i + 1];
+};
+
+function imprime(r, contrato, soloRutas) {
+  const orden = contrato.secciones.map((s) => s.titulo).join(' → ');
+  console.log(gris(`Contrato product first (${RUTA_CONTRATO}): ${orden} → lo demás\n`));
+  for (const { ruta, faltas } of r.evaluados) {
+    console.log(faltas.length ? rojo(`  ✗ ${ruta}`) : verde(`  ✓ ${ruta}`));
+    for (const f of faltas) console.log(`      · ${f}`);
+  }
+  if (soloRutas) return;
+  console.log(gris(`\nExcluidos con motivo (${r.excluidos.length}):`));
+  for (const x of r.excluidos) console.log(gris(`  · ${x.ruta} — ${x.motivo}`));
+  console.log(ambar(`\nSin README: pendientes, se listan y no se crean solos (${r.sinReadme.length}):`));
+  for (const c of r.sinReadme) console.log(ambar(`  · ${c}`));
+  if (r.sinClasificar.length) {
+    console.log(rojo(`\nSin clasificar (${r.sinClasificar.length}): ¿de producto (alcance) o excluido con motivo?`));
+    for (const s of r.sinClasificar) console.log(rojo(`  · ${s}`));
+  }
+}
+
+function resumen(r) {
+  const mal = r.evaluados.filter((e) => e.faltas.length).length;
+  const texto = `${r.evaluados.length} en alcance · ${r.evaluados.length - mal} conformes · ${mal} no conformes`
+    + ` · ${r.excluidos.length} excluidos · ${r.sinReadme.length} sin README (pendientes)`
+    + (r.sinClasificar.length ? ` · ${r.sinClasificar.length} sin clasificar` : '');
+  const ok = mal === 0 && r.sinClasificar.length === 0;
+  console.log(`\n${ok ? verde(`README product first al día: ${texto}.`) : rojo(`README NO conformes: ${texto}.`)}`);
+  return ok;
+}
+
+/* -------------------------------------------------------------- la prueba de la prueba */
+
+const SEMBRADA = 'tools/herramienta-sembrada/README.md';
+const quita = (texto, titulo) => texto.replace(new RegExp(`\\n## ${titulo}\\n[\\s\\S]*?(?=\\n## )`), '');
+const seccion = (texto, titulo) => texto.match(new RegExp(`\\n## ${titulo}\\n[\\s\\S]*?(?=\\n## )`))[0];
+
+/** Las ocho siembras, todas sobre una copia CONFORME de la plantilla del skill. */
+function siembras(buena) {
+  const cu = seccion(buena, 'Casos de uso');
+  const clave = ['OPENROUTER', 'API', 'KEY'].join('_');
+  const valor = ['sk', 'or', 'v1', 'b7c4e9a1d3f2'.repeat(3)].join('-');
+  return [
+    ['casos de uso antes que qué hace', buena.replace(cu, '').replace('\n## Qué hace', `${cu}\n## Qué hace`)],
+    ['falta la sección de infraestructura', quita(buena, 'Requerimientos de infraestructura')],
+    ['«Instalar» antes de las tres de producto', buena.replace('\n## Qué hace', '\n## Instalar\n\n```bash\nnpm install x\n```\n\n## Qué hace')],
+    ['un valor de variable de entorno escrito en el README', `${buena}\n\`\`\`bash\n${clave}=${valor} npm run demo\n\`\`\`\n`],
+    // La viñeta entera, con sus líneas de continuación: si queda una, la siembra no siembra.
+    ['cómputo sin cifra ni «no medido»', buena.replace(/(\*\*CPU, GPU y memoria\*\*)[^\n]*(\n {2}[^\n]*)*/, '$1: lo que haga falta.')],
+    ['qué hace sin decir qué no hace', buena.replace(/\n### Qué no hace\n[\s\S]*?(?=\n## )/, '')],
+  ];
+}
+
+function prueba(contrato, base) {
+  const buena = readFileSync(join(RAIZ, '.claude/skills/readme/plantilla.md'), 'utf8');
+  const plantilla = `tools/herramienta-de-prueba/README.md`;
+  const conPlantilla = { archivos: [...base.archivos, plantilla], leer: (a) => (a === plantilla ? buena : base.leer(a)) };
+  const faltasPlantilla = revisaReadme(buena, contrato);
+  if (faltasPlantilla.length) {
+    console.log(rojo(`La plantilla del skill NO cumple su propio contrato: ${faltasPlantilla.join(' | ')}`));
+    process.exit(1);
+  }
+  const clave = (r) => new Set([
+    ...r.evaluados.flatMap((e) => e.faltas.map((f) => `${e.ruta}: ${f}`)),
+    ...r.sinClasificar.map((s) => `sin clasificar: ${s}`),
+  ]);
+  const antes = clave(audita({ ...conPlantilla, contrato }));
+  const casos = [
+    ...siembras(buena).map(([nombre, texto]) => [nombre, { archivos: conPlantilla.archivos, leer: (a) => (a === plantilla ? texto : conPlantilla.leer(a)) }]),
+    ['README nuevo en alcance, sin conformar, que entra solo por el glob', {
+      archivos: [...conPlantilla.archivos, SEMBRADA], leer: (a) => (a === SEMBRADA ? '# Nueva\n\n## Uso\n\n`npm i`\n' : conPlantilla.leer(a)),
+    }],
+    ['README fuera de alcance y sin motivo de exclusión', {
+      archivos: [...conPlantilla.archivos, 'apps/nueva/README.md'], leer: conPlantilla.leer,
+    }],
+  ];
+  let cazadas = 0;
+  for (const [nombre, caso] of casos) {
+    const nuevas = [...clave(audita({ ...caso, contrato }))].filter((f) => !antes.has(f));
+    if (nuevas.length) { cazadas += 1; console.log(`CAZADA ${nombre} — ${nuevas[0]}`); }
+    else console.log(rojo(`VIVA   ${nombre} — el auditor no la vio`));
+  }
+  if (antes.size) console.log(ambar(`  aviso: el árbol ya tiene ${antes.size} falta(s); no cuentan como cazas`));
+  console.log(`\nprueba de la prueba: ${cazadas} de ${casos.length} siembras cazadas`);
+  process.exit(cazadas === casos.length ? 0 : 1);
+}
+
+function main() {
+  const contrato = JSON.parse(readFileSync(join(RAIZ, RUTA_CONTRATO), 'utf8'));
+  const base = fuente(valorDe('--desde'));
+  if (process.argv.includes('--prueba')) return prueba(contrato, base);
+  const rutas = process.argv.slice(2).filter((a, i, t) => !a.startsWith('--') && t[i - 1] !== '--desde');
+  let r = audita({ ...base, contrato });
+  if (rutas.length) r = { ...r, evaluados: r.evaluados.filter((e) => rutas.includes(e.ruta)) };
+  if (process.argv.includes('--json')) {
+    console.log(JSON.stringify(r, null, 2));
+    process.exit(r.evaluados.every((e) => !e.faltas.length) && !r.sinClasificar.length ? 0 : 1);
+  }
+  imprime(r, contrato, rutas.length > 0);
+  process.exit(resumen(r) ? 0 : 1);
+}
+
+if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
```

