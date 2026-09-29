# PRP-005 · propuesta: entrada de huecos desde el Pre-Discovery de Hermes (sin aplicar)

> **Estado: PROPUESTA.** Nada de esto está aplicado ni cambia el alcance del PRP-005, que está
> APROBADO (2026-09-26). Los enganches de la sección 1 entran en sus fases **solo con el visto
> bueno del laboratorio**; al incorporarlos, se pegan en el PRP-005 y se borra este archivo. La
> sección 2 es insumo para un PRP propio.
> **Origen**: sesión de hermes-os-a2a del 2026-09-27, tras congelar el seed (PR #317) y verificar que
> el Pre-Discovery ya genera propuestas de siembra que hoy se pierden en una descarga.
> **Contraparte en Hermes**: `.claude/PRPs/prp-cola-huecos-regulatorios.md` (PENDIENTE, con decisiones
> D1–D6 abiertas). Los nombres de abajo salen de ese PRP; su Fase 3 puede ajustarlos.

## Por qué

El Pre-Discovery de Hermes ya detecta huecos del grafo en conversaciones de venta reales, en tres
tipos: `nueva_senal`, `validar_regla` y `nuevo_ambito`. Hoy solo se descargan como JSONL y nadie los
procesa. Si llegan a la fuente única, el template deja de adivinar qué dominios investigar:
**investiga primero lo que más aparece en conversaciones reales**, y cada hueco cerrado mejora el
siguiente Pre-Discovery de ese sector.

## Lo que Hermes va a ofrecer (contrato de pull)

- **Solo registra lo observado contra el corte congelado.** Un hueco entra a la cola solo si el grafo
  que lo evaluó declara servir el conocimiento de `97d9f9e`. Un runtime atrasado generaría demanda
  falsa (hoy sirve 68 reglas de las 98 del corte). Cada fila lleva su `corte_grafo`.
- **Desidentificado por construcción.** La tabla que ve el laboratorio no tiene ninguna columna donde
  quepa un lead: ni id, ni URLs de su sitio, ni su giro escrito. El `caso_id` vive en otra tabla sin
  grant para el laboratorio. Las fechas van truncadas a semana ISO.
- **Lectura**: `lab.leer_huecos()`, en un esquema que la API pública de Supabase no expone. Devuelve
  `clave`, `tipo`, `sector_id`, `categoria`, `casos` (casos **distintos**),
  `casos_desde_ultimo_estado`, `primera_semana`/`ultima_semana`, `corte_grafo` y el estado vigente.
- **Estado de vuelta**: `lab.marcar_hueco(...)` agrega una fila a una tabla **solo-añadir**
  (`en_investigacion` · `sembrada` + versión · `descartada` + motivo cerrado:
  `ya_cubierto`, `fuera_de_alcance`, `sin_fuente_primaria`, `duplicado`, `ruido_del_escaneo`).
  `ruido_del_escaneo` le avisa a Hermes que su escaneo genera demanda falsa.
- **Apelación automática**: un hueco descartado que sigue acumulando casos vuelve a aparecer
  (`casos_desde_ultimo_estado`).
- **Credencial**: login `cli_lab_huecos`, miembro de un rol que solo puede ejecutar esas dos funciones
  (patrón `cli_fin` del ERP de Hermes). La contraseña se crea a mano y vive solo en el entorno del
  laboratorio. Hermes no conoce ni la dirección ni una llave del template.

## 1. Tres enganches dentro del PRP-005 (baratos, para no rehacer después)

- [ ] **Fase 2 — códigos estables.** Al dividir `reglas.json` por dominio, cada categoría del corte
      `97d9f9e` conserva su código, o declara un alias. La cola de Hermes agrupa por
      `(tipo, sector_id, categoria)` con esos códigos, observados contra ese mismo corte: si cambian
      sin alias, ningún hueco vuelve a casar con el paquete.
      *Validación*: prueba que recorre las categorías del corte y exige código o alias en el paquete.
- [ ] **Fase 2 — `CAMBIOS.md` admite un origen opcional por regla** (`origen: hueco:<clave>`). Permite
      decir «esta regla nació de N conversaciones», y es la versión que `lab.marcar_hueco` reporta
      como `sembrada`.
- [ ] **Fase 4 — el gate de procedencia rechaza una regla cuya única cita no es fuente primaria.** Un
      hueco de Hermes es **disparador** de la investigación, nunca su fuente; y por diseño no trae
      ninguna URL.
      *Control negativo*: una regla que solo cita una URL que no es fuente primaria pone rojo el gate.

## 2. Fuera de este PRP — entrada de huecos desde Hermes

Un PRP propio en template, que arranca **cuando la Fase 4 esté verde** (antes no hay dónde sembrar):

- **Pull, nunca push**: un job del laboratorio llama a `lab.leer_huecos()` con `cli_lab_huecos`.
- **Triage por tipo**, ordenado por `casos`:
  - `nueva_senal` → vocabulario (keywords de una categoría existente). Barato; lo cubre el gate RF-12.
  - `validar_regla` → vigencia de una regla existente (el caso LFPDPPP 2010). Costo medio; RF-13/14.
    Hermes decide en su D2 si este tipo viaja; si viaja, con prioridad baja.
  - `nuevo_ambito` → investigación completa con `PLANTILLA-INVESTIGACION-SEED.md` desde fuente
    primaria. Caro; si cambia veredictos, **va con firma**. Solo llega cuando el equipo de Hermes ya
    le asignó un sector (antes queda en su bandeja de triage).
- **Estado de vuelta** con `lab.marcar_hueco(...)`: `en_investigacion` al tomarlo, `sembrada <semver>`
  al publicar, o `descartada <motivo>`.
- **Sembrar sigue siendo acto humano.** Esto acelera la investigación; no automatiza la siembra ni la
  publicación de una versión (RF-16 intacto: el consumidor sube el pin a mano).

### Gobernanza que el PRP propio tendrá que cubrir (continúa la numeración de este PRP)

- **C3, frontera nueva**: demanda derivada del sitio de un tercero (no confiable) → cola → investigación.
  - **O6, envenenamiento de la cola**: un sitio planta texto para inducir un hueco y, con él, una regla
    falsa. Controles: vocabulario cerrado en la cola (no viaja texto libre), la propuesta nunca es
    fuente (enganche de la Fase 4), fuente primaria obligatoria y firma cuando cambia un veredicto.
  - **O7, inflado de demanda**: casos creados para empujar un hueco. Hermes ya cuenta casos
    **distintos** detrás de una sesión con allowlist; aquí, `casos` es señal de prioridad, nunca
    razón para sembrar.
  - **O8, credencial del laboratorio comprometida**: alcanza solo demanda desidentificada y marcar
    estados. Custodia y rotación: D4 del PRP de Hermes.
- **C4, terceros**: los leads no usan el sistema y su identidad no sale de Hermes; la desidentificación
  vive en la forma de la tabla, no en la disciplina de quien la lea.
- **Público/privado**: Hermes es **público** y template **privado** (verificado el 2026-09-27). Lo que
  template aprenda vuelve a Hermes solo como versión del paquete, por el PRP «Hermes lee del paquete».
