# Capa de Gobernanza Agéntica del SaaS Factory — Spec

> Destilado de 9 documentos de gobernanza del proyecto Hermes OS
> (`/home/gsore/code/a2aboths/businessos/gobernanza/`), convertidos en el
> núcleo portable que entra al boilerplate de TODOS los proyectos futuros.

---

## MISION

El SaaS Factory V4 ya practica, sin nombrarlos, la mitad de los controles de un
sistema de gestión de IA serio: Auto-Blindaje **es** literalmente la cláusula 10
de ISO/IEC 42001 (mejora continua), los gates del bucle agéntico son el ciclo de
vida del sistema, "SIEMPRE habilitar RLS" es gobernanza de datos (A.7). Lo que
falta no es ingeniería: es **papel bien hecho, cableado al flujo**, y el cierre de
tres huecos que son invisibles justamente porque no rompen nada el día que se
descuidan — rompen semanas después, sin ruido.

Al terminar debe existir una **capa de gobernanza viva** en el boilerplate: no un
documento que nadie lee, sino un conjunto de reglas que el propio flujo de la
fábrica obliga a consultar, con un verificador que falla si el papel y el código
divergen. Cualquier proyecto que nazca de este template hereda, el día uno, una
postura de gobernanza que un comprador enterprise puede auditar — y que la dueña
puede sostener sola, sin equipo de compliance.

### Los tres huecos que esta capa cierra

1. **No hay gate para cambios de comportamiento.** Cambiar el modelo, editar un
   skill, retocar un prompt de sistema o una plantilla altera el comportamiento de
   TODO lo que la fábrica produce — y hoy nada de eso pasa por ningún control. El
   código generado (menos alcance) tiene gates; el prompt que lo genera (todo el
   alcance) tiene cero.
2. **Nadie verifica a los agentes.** Se verifican artefactos, no skills. Nadie
   sabe si un skill sigue produciendo lo mismo tras un cambio de modelo.
3. **`service_role` anula la regla de RLS.** En Supabase, `service_role` tiene
   `BYPASSRLS`: ninguna política lo detiene. Mientras las superficies conecten con
   esa llave, "SIEMPRE habilitar RLS" es decorativo y el aislamiento vive
   **exclusivamente** en el código de la aplicación. Hoy eso no está escrito en
   ninguna parte del template.

### Los siete controles que entran (el núcleo portable)

**C1 · CDC — Cambio de Comportamiento.** Todo cambio de modelo, skill, prompt de
sistema, SOUL o plantilla es un cambio del sistema de IA, y el gate es
proporcional al radio del cambio:

| Cambio | Radio | Gate |
|---|---|---|
| Versión de modelo | Todo el sistema | CDC completo: diff + suite de regresión verde + aprobación humana + **pineo explícito de la versión** |
| Skill / prompt de sistema | Ese skill y sus salidas | CDC estándar: diff + regresión de ese skill + aprobación |
| Plantilla / design-system | Todo lo futuro de esa plantilla | Re-auditoría registrada |
| Parámetros menores (temperatura, límites) | Acotado | Bitácora + revisión trimestral |

Regla de oro: los prompts y skills viven en git y se despliegan como código — el
CDC añade que se **revisan** como código. Nadie edita un skill en caliente, ni
siquiera la dueña, sin que quede diff, regresión y aprobación. El modelo en
producción SIEMPRE está pineado: `latest` es anti-patrón también aquí.

**C2 · Suite de regresión de skills (golden sets).** El equivalente del Supervisor
para los que no escriben código. Conversaciones/entradas grabadas → la salida
producida se compara contra la esperada por **match estructural, no textual**.
Incluye **casos-trampa**: entradas adversariales que DEBEN producir escalada o
bandera, no salida limpia — el modelo de amenazas convertido en test ejecutable.
Verde = promovible. Rojo = el cambio NO se promueve, sin excepciones ni "se ve bien".

**C3 · Modelo de amenazas en miniatura, por PRP.** Los 5 pasos (activos →
fronteras → flujos → objetivos del atacante → controles) como sección fija de
`prp-base.md`. Con el catálogo de atacantes genéricos adaptado al contexto SaaS:
O1 inyección de requerimientos (el ataque más barato: no hackea nada, conversa),
O2 evidencia falsificada, O3 fatiga de aprobación (el sello de goma: no es malicia,
es estadística), O4 denial-of-wallet (quemar tokens sin hackear), O5 cadena de
suministro, O6 compromiso de un servicio con privilegio.

**C4 · AISIA — Evaluación de Impacto.** La hermana del modelo de amenazas y la
distinción que hay que hacer explícita: el modelo de amenazas protege **al sistema
de los atacantes**; la AISIA protege **a las personas del sistema** — daños que
ocurren con el sistema operando *bien* y sin ningún atacante presente. Plantilla:
partes afectadas · daños sin atacante · severidad × probabilidad × reversibilidad ·
mitigaciones (qué gate, qué plazo de gracia, qué vía de apelación, qué se le
comunica al afectado) · decisión (aceptar/mitigar/rediseñar/no ofrecer) · firma.

**C5 · Registro de decisiones de riesgo (append-only).** Formato fijo: decisión ·
riesgo aceptado · mitigaciones vigentes · firmado por (nombre y rol) · vigencia y
próxima revisión. Nunca se edita una entrada pasada. Con la lista explícita de qué
decisiones SIEMPRE exigen entrada firmada.

**C6 · Procedimiento de incidente.** Contención (pausar primero: reanudar es
barato, un envío no se deshace) → clasificación → cierre. Y el paso que no se
salta: **todo incidente termina con un caso nuevo en la suite de regresión**. Un
incidente cerrado sin caso de regresión no está cerrado: está olvidado, y volverá
en el próximo cambio de modelo. Cuando ningún gate lo cazó, el cierre incluye
**el gate nuevo**, con su prueba y su caso negativo.

**C7 · Regla `service_role` / RLS.** Entra al Golden Path y a la skill de Supabase:
`service_role` tiene BYPASSRLS. Las superficies de negocio no lo usan para dato de
negocio; queda para migraciones y jobs de plataforma que operan *sobre* todos los
tenants, cada uno declarado, no heredado. El disparador de la migración no es una
fecha: es el alta del segundo tenant. Y la prueba tiene que vivir del lado de la
aplicación, porque la base no puede verificarlo.

### Principios rectores (heredados, no negociables)

- **Verificar antes de confiar.** Las salidas del LLM no se confían por diseño;
  el que verifica re-ejecuta los gates de cero.
- **Un control no probado no cuenta como control.** El interruptor se prueba en
  simulacro; un respaldo no probado no es un respaldo.
- **Control negativo, no solo positivo.** Toda garantía se demuestra también con
  algo que DEBE fallar, y el fallo esperado se anota.
- **Si la garantía depende de que nadie se equivoque, es una costumbre, no una
  garantía.** Se prefiere la separación estructural sobre la configuración
  correcta: equivocarse en una configuración no produce ningún síntoma.
- **La fatiga se combate con diseño** (diffs chicos, banderas primero), no con
  regaños.
- **El documento y el código son un solo cambio.** Cambiar un gate sin declararlo
  en la política deja el sistema y el papel divergentes — que es exactamente el
  hallazgo que un auditor busca.

### Lo que se DESCARTA del material de origen (y por qué)

De los 9 documentos, dos son instanciación de un proyecto blockchain y **no entran**:
la ceremonia PKI de `anclas-de-confianza.md` (Hyperledger Fabric, YubiKeys, MSP,
guion de ceremonia) y `adenda-web-agentica.md` (x402, ERC-8004, A2A, AP2). De ellos
solo se rescatan los tres principios transferibles ya listados arriba (respaldo no
probado, control negativo, error silencioso). No arrastres su vocabulario: un
boilerplate Next.js + Supabase no tiene MSP ni oráculo.

Del resto, descarta también toda referencia concreta a Hermes: `contrato_sc.py`,
PRP-013/014, `sc_incidentes`, el buzón `atencion@digifixapp.com`, la vertical
clientes, el catálogo de plantillas de smart contracts. Lo que se conserva es el
**mecanismo**, traducido al vocabulario de esta fábrica: skills, PRPs, bucle
agéntico, Supabase, Auto-Blindaje.

---

## LIBERTAD TECNICA

Tú eliges la estructura de archivos, cuántos documentos, cómo se llaman, dónde
viven, en qué formato se escriben las plantillas, y cómo se implementa el
verificador de cableado: probablemente sabes mejor que yo qué conviene. Cualquier
nombre de archivo o ruta que aparezca en este spec es **sugerencia descartable**,
NO requisito, salvo lo que diga RESTRICCIONES REALES.

En particular, **decide tú si la capa es un documento único o varios**: el pedido
original fue "un solo documento", pero si al construirlo resulta que las plantillas
(AISIA, registro de riesgo, incidente) funcionan mejor como archivos aparte que se
copian por proyecto, hazlo y explica por qué en el reporte de decisiones. Lo que
NO es negociable es que la capa esté **cableada**: que el flujo de la fábrica la
obligue a consultarse.

Optimiza por el mejor resultado posible, no por el camino más corto.

---

## INVESTIGA ANTES DE CONSTRUIR

1. **Lee los 9 documentos de origen completos** en
   `/home/gsore/code/a2aboths/businessos/gobernanza/`. Están densos y bien escritos:
   el tono, la contundencia y los ejemplos concretos son parte del valor. No los
   parafrasees blandamente — destílalos conservando su filo.
2. **Lee el estado real del template**: `CLAUDE.md` (decision tree, Golden Path,
   Reglas de Código, sección Aprendizajes), `.claude/PRPs/prp-base.md`,
   `.claude/skills/` (especialmente `supabase`, `prp`, `bucle-agentico`,
   `memory-manager`), `README.md`, `GEMINI.md`.
3. **Investiga 2-3 referencias world-class** de cómo se documenta gobernanza de IA
   operable (no aspiracional): estructura de un SoA, cómo se escribe una política
   corta que un auditor acepta, cómo otros equipos pequeños sostienen un AIMS-lite
   sin equipo de compliance.
4. Reafirma el objetivo en una línea antes de cada edición grande, para no driftar
   hacia un documento largo y ceremonioso. El criterio de calidad es: **¿esto lo
   puede sostener una persona sola, y un auditor lo puede verificar?**

---

## DEFINICION DE HECHO (evidencia visible en la conversación)

El evaluador solo ve esta conversación: no corre comandos, no lee archivos, no abre
nada por su cuenta. Todo tiene que estar **surfeado en el transcript**.

1. **La capa existe**: pega el árbol de archivos creados/modificados y el índice
   (encabezados) del documento principal, para que se vea la estructura completa.
2. **Los 7 controles están cubiertos**: una tabla que mapee C1..C7 → dónde quedó
   cada uno (archivo y sección). Sin huecos.
3. **Está cableada, no suelta**: pega los diffs de `CLAUDE.md` (decision tree +
   Golden Path + Reglas de Código) y de `prp-base.md` (secciones nuevas "Modelo de
   amenazas" y "Evaluación de impacto"), mostrando que un PRP nuevo ahora obliga a
   responder ambas preguntas: *¿quién nos ataca?* y *¿a quién podemos dañar sin
   que nadie nos ataque?*
4. **Las plantillas están probadas con un caso real, no vacías**: una AISIA llena
   tomando como sujeto **este mismo template** (¿a quién puede dañar una fábrica
   que genera SaaS a partir de una conversación?), y una entrada del registro de
   decisiones de riesgo firmada con una decisión real de este repo.
5. **El verificador corre y pasa**: pega el output del comando de validación en
   verde.
6. **Control negativo — el punto que demuestra que el verificador sirve**: rompe a
   propósito un cable (borra una sección requerida o una referencia), corre el
   verificador, **pega el output mostrando que FALLA**, restaura, corre de nuevo y
   pega el verde. Un control no probado no cuenta como control.
7. **Trazabilidad del destilado**: tabla de los 9 documentos de origen → qué se
   conservó, qué se descartó y por qué. Que se vea que los 2 descartados fueron una
   decisión, no un olvido.
8. **Reporte de decisiones**: qué estructura elegiste y por qué; uno o varios
   documentos y por qué; qué dejaste fuera a propósito.
9. **Autocrítica**: lista las formas en que esta capa podría estar mal o incompleta
   (¿qué control es teatro? ¿qué regla nadie va a seguir? ¿qué se pudre en 6 meses?)
   y resuélvelas antes de cerrar.

---

## COMANDO DE VALIDACION

Base conocida (proyecto npm, Next 16 + TypeScript):

```
npm run typecheck && npm run build
```

Eso solo prueba que no rompiste el proyecto. **Además construye un verificador de
cableado** (tú eliges lenguaje y forma) que falle con exit code ≠ 0 si:

- el documento principal de gobernanza no existe o le falta alguno de los 7 controles;
- `CLAUDE.md` no referencia la capa de gobernanza en su decision tree;
- `prp-base.md` no contiene las secciones "Modelo de amenazas" y "Evaluación de impacto";
- alguna plantilla referenciada desde los documentos no existe en disco.

**Declara tu comando de validación completo (typecheck + build + verificador en uno)
en tu primer checkpoint**, correlo tras cada cambio grande y surfea su output. Ese
verificador es, él mismo, el control que impide que el papel y el código diverjan —
la regla C6/§8 aplicada a esta capa.

---

## RESTRICCIONES REALES

- **Todo en español**, con el tono del template (directo, sin ceremonia corporativa,
  tablas antes que párrafos). Los documentos de origen son el estándar de calidad.
- **Vive dentro de `/home/gsore/code/template`** y se versiona en git. Nada fuera.
- **Es boilerplate**: cada proyecto nuevo lo hereda, así que no puede depender de
  nada específico de Hermes ni de ningún cliente. Genérico y accionable, no abstracto.
- **No toques** `/home/gsore/code/a2aboths/` — es solo material de lectura.
- **No rompas el build.** `npm run build` estaba roto antes y ya se reparó (ver
  Aprendizajes de `CLAUDE.md`): no reintroduzcas nada de eso.
- **Sostenible por una persona sola.** Si un control exige un equipo de compliance
  o un rito que nadie va a hacer, no entra — o entra explícitamente marcado como
  "se activa cuando un cliente enterprise lo exija" (etapa 2/3, no etapa 1).
- **No implementes features de producto.** Esta tarea produce la capa de gobernanza
  y su cableado. No es momento de construir la suite de regresión de skills
  completa: se documenta el control C2 y se deja el esqueleto, no el sistema.
