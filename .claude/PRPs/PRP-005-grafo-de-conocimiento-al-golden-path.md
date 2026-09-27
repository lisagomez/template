# PRP-005: El grafo de conocimiento, portado al Golden Path con el conocimiento de Hermes como dato

> **Estado**: PROPUESTO — NO APROBADO. **No autoriza escribir código, crear tablas ni importar nada.**
> Requiere la firma de la dueña y cerrar antes la Fase 0 (decisiones humanas).
> **Fecha**: 2026-09-26
> **Proyecto**: template (fábrica) · origen del conocimiento: `lisagomez/hermes-os-a2a@97d9f9e`
> **Spec**: `.claude/specs/004-grafo-de-conocimiento/spec.md`. Cierra el QUÉ; este PRP no la reescribe.
> **Expediente**: `docs/SDD-grafo-hermes-a-template.md`. Ahí están la medición, la matriz RF por RF y
> por qué se eligió la opción D frente a importar (A), portar desde cero (B) o consumir como agente (C).
> **CDC aplicable**: **sí, acotado a la Fase 6**. Enrutar la capacidad desde `AGENTS.md` cambia el
> prompt de todos los agentes → C1: diff + `npm run regresion` + aprobación + `BITACORA-CDC.md`. Las
> fases 0-5 no tocan modelo, skills, prompts, plantillas ni `settings.json`.

---

## Objetivo

Que template tenga, como **herramienta opt-in** en `tools/`, el motor de reglas de la spec 004. Tiene
que decir **lo mismo** que el grafo en producción de Hermes sobre el mismo conocimiento, y **cerrar los
huecos que Hermes no sabe que tiene**. El conocimiento de Hermes entra como **dato pineado con
procedencia**, no como código.

## Por Qué

| Problema | Solución |
|----------|----------|
| La spec 004 lleva desde agosto como plano: 15 tareas abiertas | Un plan por fases que la construye sin reinventar lo que Hermes ya pagó |
| El valor de Hermes son 98 reglas leídas de fuente primaria y dos incidentes reales, no su runtime | Se trae el **esquema y los datos**; el motor, de 283 líneas puras, se porta |
| Importar el código mete Python, FastAPI, Postgres y Docker en una capacidad que instalan los derivados | Núcleo TS sin dependencias, como `tools/extractor-documental` (constitución art. 1 y 3) |
| Hermes tiene tres huecos medidos: conflictos que pasan el gate, vocabulario global y bajas que borran el pasado | El port se escribe **contra la spec**, y la paridad declara cada divergencia |

**Valor**: cualquier proyecto derivado con reglas propias (lo regulatorio, elegibilidad, políticas)
responde en oraciones libres con un veredicto que **nunca finge certeza**.

## Qué

Resume la spec 004. Los criterios salen de sus RF en EARS y el «Fuera de alcance» es el de la spec.

### Criterios de Éxito
- [ ] **Paridad**: sobre el corpus generado con el motor Python de Hermes, el motor TS da el mismo
      veredicto, razón, fuente y banderas. Cada diferencia es una **divergencia esperada** declarada con
      su RF (p. ej. el conflicto de INTERESES rechazado en la siembra)
- [ ] RF-1: el vocabulario de veredicto está acotado **por dimensión** en el contrato Zod. `deducible` en
      una regla regulatoria **no siembra**
- [ ] RF-6: «sin regla», «conflicto», «la regla dice dudoso» y «parser caído» son **tipos distintos**, no
      textos distintos del mismo `dudoso`
- [ ] RF-7: el caso real de «drones» se prueba **antes y después** de las exclusiones
- [ ] RF-12: el gate de siembra rechaza el conflicto de veredictos (control negativo: el INTERESES de
      Hermes **pone rojo** el gate), las keywords idénticas y las keywords contenidas en otra categoría
      sin exclusión
- [ ] Vigencia: retirar una regla **cierra** su `vigente_hasta`, nunca la borra. Control: un hecho de 2024
      sigue encontrando la regla de 2010
- [ ] Dos dominios de ejemplo, uno regulatorio y uno **no legal**; extremo a extremo con una oración real;
      conteo de reglas fijado en prueba
- [ ] `npm run empaqueta grafo-conocimiento` instala e importa en un proyecto limpio
- [ ] `npm run validate` en verde

### Comportamiento Esperado
Pregunta en lenguaje natural → **parser** (opcional, entry point aparte: solo estructura) → **motor
determinista** (veredicto) → **redactor** (opcional: solo redacta un veredicto ya calculado). Si el
parser o el almacén fallan, sale un **error tipado sin veredicto**, y el redactor no se ejecuta.

## Contexto

### Referencias
- `docs/SDD-grafo-hermes-a-template.md`: la medición entera, con `archivo:línea` de Hermes.
- Hermes, **solo lectura**, en `97d9f9e`:
  - `businessos/grafo/evaluador.py` (motor);
  - `seed/gen_seed_sql.py` (gate);
  - `seed/reglas.json` (conocimiento);
  - `grafo-a2a/executor.py` (el patrón «sin disclaimer ni fuentes no se entrega»).
- `tools/extractor-documental/`: el patrón de núcleo sin dependencias con motor y almacén **inyectados**,
  y el productor natural de `(código, fecha del hecho)`.
- `docs/CREAR-UNA-HERRAMIENTA.md` y `docs/EMPAQUETAR-HERRAMIENTA.md`.
- PRP-004: precedente de traer algo de Hermes con corte, procedencia y auditoría.

### Arquitectura Propuesta
```
tools/grafo-conocimiento/
├── src/contrato.ts        # Zod: categoría, regla, impacto, veredicto POR DIMENSIÓN, resultado tipado
├── src/motor.ts           # puro: clasificar, vigencia, rectora, conflicto, topes, fail-safe
├── src/gate.ts            # siembra: procedencia + colisiones + conflictos + vocabulario + bajas
├── src/almacen.ts         # interfaz inyectada (archivo versionado | Supabase en entry point aparte)
├── src/lenguaje/          # entry point aparte: parser (structured outputs) + redactor
├── dominios/              # ejemplo regulatorio (subconjunto de Hermes, pineado) + ejemplo no legal
└── pruebas/paridad/       # corpus generado con el motor Python de Hermes@97d9f9e + divergencias
```
La libertad técnica de la spec se mantiene. Dónde viven las reglas y cómo se implementa el parser lo
decide quien ejecute. Esto es la forma, no la implementación.

### Modelo de Datos (si aplica)
Si un derivado elige Supabase, el esquema sale del de Hermes (`01-schema.sql`) con tres cambios:
- **vigencia solo-añadir**: las bajas cierran `vigente_hasta`;
- **historial de categorías y keywords**;
- **RLS** habilitado y `service_role` fuera de la superficie de consulta (C7).

Las tablas se declaran en el §4 del `BUSINESS_LOGIC.md` del derivado para el respaldo. Si el almacén
es un archivo versionado, git **es** el historial.

---

## Gobernanza

### Modelo de amenazas (control C3) — *¿quién nos ataca?*

- **Activos que toca**: la integridad del conocimiento (qué dice cada regla y desde cuándo) y el
  veredicto que recibe un tercero.
- **Fronteras que cruza**:
  - la oración del usuario (no confiable) hacia el parser LLM;
  - el conocimiento importado desde un repo **público** hacia uno privado.
- **Atacante relevante**:
  - **O1**, inyección: una oración que intenta que el parser «decida»;
  - **O2**, evidencia falsa: una pregunta redactada para caer en la categoría favorable. Las exclusiones
    y el gate de colisiones la frenan;
  - **O5**, cadena de suministro: el seed de Hermes cambia río arriba;
  - **O4**, denial-of-wallet: las llamadas al parser.
- **Controles**:
  - el parser solo emite campos validados con Zod y **no tiene ruta** hacia el veredicto;
  - el seed se trae **pineado por commit y sha256**, y subir el pin es gate humano con paridad re-generada;
  - el gate corre antes de sembrar;
  - el parser pasa por el routing y la contabilidad de tokens (C8).
- **Brecha abierta a propósito**: el significado de un código que cambia sin cambiar de estructura
  (duda de la spec 004). Se mitiga con fecha de corte visible, no se elimina.

### Evaluación de impacto / AISIA (control C4) — *¿a quién dañamos sin atacante?*

- **Partes afectadas**: quien pregunta y actúa sobre la respuesta. Y, en los dominios regulatorios,
  terceros sobre los que se decide (un cliente, una contraparte), que no usan el sistema.
- **Daño posible con el sistema operando bien**:
  - un veredicto con la ley **de la fecha del pin** cuando la ley ya cambió;
  - la categoría equivocada con autoridad (el caso de «drones»);
  - una certeza improvisada cuando algo falla (el caso del motor caído).
- **Mitigaciones**:
  - fail-safe tipado;
  - fecha de corte del conocimiento en toda respuesta;
  - `salud_conocimiento` portado (reglas vencidas, montos sin cotejo);
  - disclaimer obligatorio: la respuesta sin él no se entrega.
- **Reversibilidad**: el veredicto es informativo y no ejecuta nada. Una decisión tomada sobre él puede
  no ser reversible, así que la vía de apelación es humana y el disclaimer lo dice.
- **Decisión**: **mitigar**. El fail-safe es **no firmable** (límite de C5): ninguna firma del dueño
  autoriza a devolver certezas inventadas a un tercero.

---

## Blueprint (Assembly Line)

> Solo fases. Las subtareas se generan al entrar a cada una (bucle agéntico).

### Fase 0: Decisiones humanas — GATE
**Objetivo**: cerrar lo que el expediente deja abierto y no le toca decidir a un agente:
- RF-5: si en dominios de fuente pública la respuesta cita la ley (§5.3 del expediente);
- si el caso de uso exige vigencia a la **fecha del hecho** (§5.2);
- si el dominio regulatorio de ejemplo es el subconjunto `DRONES_DELIVERY` + `AGENTES_SEGUROS` (lleva
  el incidente dentro) o más;
- quién sube el pin de Hermes y cada cuánto.

**Validación**: las respuestas escritas en la spec 004 (Dudas abiertas → resueltas) y este PRP pasa a APROBADO.

### Fase 1: Contrato y corpus de paridad
**Objetivo**: el contrato Zod, con el vocabulario por dimensión, y un corpus de paridad **generado
fuera del repo** con el motor Python de Hermes@97d9f9e. Solo entran al repo sus salidas, como datos,
con procedencia (commit y sha256 del seed).
**Validación**: el contrato valida el seed de Hermes salvo las divergencias declaradas (INTERESES,
vocabulario). `npm run verifica:specs` en verde.

### Fase 2: Motor determinista
**Objetivo**: el motor TS puro. Mismos veredictos que Hermes sobre el corpus, más los tipos de fallo
de la spec.
**Validación**:
- paridad verde con sus divergencias listadas;
- controles negativos de fail-safe, exclusiones (antes/después) y conflicto;
- vigencia de 2024 frente a 2026.

### Fase 3: Gate de siembra
**Objetivo**: RF-12 y RF-1 automáticos antes de sembrar, y bajas que cierran vigencia.
**Validación**:
- el seed de Hermes tal cual **pone rojo** el gate por INTERESES (control de reversión);
- con la divergencia declarada, verde;
- entra a `npm run validate`.

### Fase 4: Capa de lenguaje natural
**Objetivo**: parser y redactor en un entry point aparte. «Parser caído» se tipa y se prueba distinto
de «sin regla».
**Validación**:
- la pregunta H1 de la spec llega al motor estructurada;
- casos-trampa de inyección (O1) en `npm run regresion -- --trampa`;
- el redactor no puede ejecutarse sin veredicto.

### Fase 5: Dominios y extremo a extremo
**Objetivo**: un dominio regulatorio (subconjunto pineado de Hermes) y uno no legal, con el conteo fijado.
**Validación**: una oración real → respuesta natural, sin payload armado a mano. `npm run empaqueta
grafo-conocimiento` en verde en un proyecto limpio.

### Fase 6: Enrutado desde `AGENTS.md` — CDC (C1)
**Objetivo**: que el decision tree sepa que la herramienta existe.
**Validación**: diff, `npm run regresion`, aprobación humana y entrada en `BITACORA-CDC.md`.

### Fase 7: Validación Final
**Objetivo**: la herramienta funcionando de extremo a extremo.
**Validación**:
- [ ] `npm run validate` pasa
- [ ] Criterios de éxito cumplidos
- [ ] Autocrítica escrita: qué puede fallar en producción y cómo quedó (TAR-15)

---

## 🧠 Aprendizajes (Self-Annealing / Neural Network)

### 2026-09-26: Las memorias del origen no son el origen
- **Error evitado**: decidir con «26 reglas, 54 pruebas» (memorias de Hermes de julio) cuando el
  código tiene 98 y 132.
- **Fix**: medir sobre el corte, no sobre la memoria.
- **Aplicar en**: cualquier traída desde otro repo. Citar el commit, no el recuerdo.

### 2026-09-26: Borrar una regla retirada reescribe el pasado
- **Error medido en Hermes**: `_bajas` hace `DELETE`; un hecho de 2024 perdió su regla.
- **Fix**: retirar = cerrar `vigente_hasta`.
- **Aplicar en**: todo catálogo con vigencia (extractor, CFDI, ERP).

---

## Gotchas

- [ ] El enum `dudoso` de Hermes mezcla cuatro motivos. Portarlo tal cual pierde RF-6
- [ ] La regla rectora se elige por `vigente_desde` más reciente; con empate decide el orden del seed.
      Hay que fijarlo explícito
- [ ] La clasificación por keyword con frontera de palabra **sin acentos** es parte del contrato: en
      Hermes, «inmobiliario» no casaba «inmueble» y hubo que ampliar el vocabulario
- [ ] Un conflicto «intencional» (INTERESES) no se expresa por el mecanismo de conflicto: se expresa
      como una sola regla rectora `dudoso`

## Anti-Patrones

- NO importar `businessos/grafo*` como código (stack paralelo, doble fuente de verdad)
- NO consumir el grafo de Hermes desde un derivado (tercero en el camino del veredicto; C4)
- NO reinvestigar las reglas que Hermes ya leyó de fuente primaria
- NO dejar que el parser o el redactor toquen el veredicto
- NO escribir nada de template en Hermes (template es privado y Hermes público)
