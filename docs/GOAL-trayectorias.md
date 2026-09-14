# Trayectorias — Spec para `/goal`

> Compilado con `/goal-compiler` el 2026-09-13. Este archivo es el spec completo; el bloque
> `/goal` corto que se pega en la sesión apunta aquí por ruta absoluta. Grafo del sistema en
> `docs/grafos/trayectorias.json`; el plan de §GRAFO lo derivó `grafo2plan.py`, no una persona.
>
> Decisión de la dueña (2026-09-13): «trayectorias» son **trazas de ejecución** —qué se pidió,
> qué hizo el agente o la herramienta, qué costó, qué salió y si acertó— registradas como dataset
> versionado que cierra el lazo de mejora. No son rutas de producto ni recorridos de usuario.

## MISION

Que la fábrica **sepa lo que hace** y mejore a partir de eso, sin que nadie tenga que
acordarse de mirar. Hoy el Auto-Blindaje es manual: un error ocurre, alguien lo escribe en
`aprendizajes-*.md`, y el mismo error puede repetirse en otra sesión antes de que nadie lo
lea. Y la eficiencia se mide por partes: la contabilidad sabe cuánto costó una llamada, la
medición sabe cuánto tardó una herramienta, los transcripts saben qué herramientas usó una
sesión, y **ninguna de las tres se junta con las otras**. El resultado a construir:

1. **Toda ejecución deja trayectoria**, en las tres líneas y con **un solo formato**:
   - **La fábrica**: cada sesión y cada invocación de skill del arnés (qué skill, qué
     herramientas, qué modelo pineado, tokens de entrada, salida y caché, gates que corrió y
     cómo salieron, veredicto humano si lo hubo). La materia prima ya existe: 21 transcripts
     en esta máquina y un hook `PostToolUse` que hoy solo escribe una línea inútil.
   - **La línea de aplicación**: cada llamada al modelo desde una feature con IA y cada
     acción de agente sobre un usuario, por el `Registrador` que `contabilidad.ts` ya inyecta.
     Con la regla que ya rige ahí: una llamada sin datos de uso lleva coste `null`, nunca cero.
   - **La línea de herramientas**: cada corrida de `medicion/*.mjs` (extractor, voz y las
     que vengan) emite su trayectoria además de su `resumen.json`: hardware, corpus (forma),
     páginas por minuto, latencias, CER, campos correctos, evidencia, correlaciones.

2. **Solo forma, nunca contenido.** Una trayectoria dice «leyó un PDF de 3 páginas, sacó 11
   campos, 8 a revisión», jamás qué decía el PDF. Ni valores de documentos, ni prompts de
   usuarios finales, ni secretos, ni los identificadores del corpus de casos-trampa. Un
   verificador lo exige y el gate lo corre. Esto es lo que hace que el dataset pueda vivir
   en git.

3. **Un evaluador que no es el ejecutor.** Sobre las trayectorias corren evals **binarias y
   estructurales** declaradas por skill, feature y herramienta (3 a 6 criterios ortogonales,
   como manda `autoresearch`), en sesión aparte y sin el contexto de lo que se evalúa, que
   es el protocolo ciego que C2 aprendió a golpes. Un agente que evalúa su propio trabajo
   es un sello, no una medición.

4. **Un informe que compara periodos** y marca regresiones: tokens y aciertos de caché,
   coste por clase de tarea, latencia por etapa, tasa de acierto de evals, tasa de revisión
   humana, gates rojos, incidentes. Por skill, feature, herramienta y periodo. Cada cifra con
   su fuente, y el verde nunca tapa la cifra.

5. **Propuestas de mejora derivadas de la evidencia**, no de la intuición: «este skill falla
   el criterio X en 4 de 10 trayectorias desde el cambio Y», «esta clase de tarea gasta 3×
   lo previsto en el routing», «esta herramienta perdió 20 % de páginas por minuto desde tal
   commit». Cada propuesta sale con la trayectoria que la sostiene y, cuando la señal es de
   un skill, con `autoresearch` como motor de mutación. Y **ninguna se aplica sola**:
   cambiar un skill, un prompt, el routing o `settings.json` es un CDC con diff, regresión
   y firma. **Automejorado no es autoaprobado.** El precedente es el hipocampo: crea y
   propone; editar y aprobar es de la dueña.

Nivel de referencia: las plataformas de observabilidad de agentes que capturan trazas por
llamada, las evalúan con jueces separados y alimentan loops de optimización de prompts.
Con dos diferencias que aquí son requisito: el dataset es de forma (cabe en git, no filtra
a nadie) y el lazo termina en un gate humano, no en un deploy automático.

## LIBERTAD TECNICA

Tú eliges el esquema de la trayectoria, dónde y cómo se almacena lo crudo, cómo se
convierten los transcripts, cómo se cablea la captura en el arnés, cómo se agregan las
métricas y cómo se presenta el informe. Probablemente sabes mejor que yo qué conviene.
Cualquier tecnología nombrada aquí es sugerencia descartable, NO requisito, salvo la
sección RESTRICCIONES REALES. Optimiza por el mejor resultado posible.

Lo que **ya existe y se reutiliza**:

- `src/lib/ai/contabilidad.ts` (`EventoDeUso`, `Registrador` inyectable, coste `null`) y
  `src/lib/ai/routing.ts` (`ClaseDeTarea`, precios pineados); `scripts/prueba-contabilidad.ts`.
- `.claude/skills/autoresearch/SKILL.md`: reglas de evals binarias, loop de mutación con un
  cambio por iteración y `autoresearch-results.tsv`.
- `scripts/regresion-skills.mjs` y `scripts/lib/corpus.mjs`: capa A (contratos) y capa B
  (casos-trampa en la rama `golden-sets`, que **no se nombra desde el árbol**).
- `tools/extractor-documental/medicion/*.mjs` y `tools/voz/medicion/mide.mjs`: el patrón
  «imprime forma, nunca valores» y el `resumen.json` por corrida.
- `.claude/hooks/log-tool-usage.sh` (existe, no está cableado, no registra nada útil) y los
  transcripts `~/.claude/projects/<proyecto>/*.jsonl` (mensajes con `usage`: tokens de
  entrada, salida, creación y lectura de caché, y bloques `tool_use` con nombre y entrada).
- `scripts/mide-contexto.mjs` y `.claude/presupuesto-contexto.json`: el precedente de
  «leer la cifra, no solo el verde».
- El Auto-Blindaje de `AGENTS.md` y `.claude/rules/aprendizajes-*.md`: el destino natural
  de un aprendizaje derivado de trayectorias.

Lo que **no existe y es el corazón del trabajo**: el formato común, las tres capturas, el
almacén, el evaluador separado, el informe por periodos y el generador de propuestas.

## INVESTIGA ANTES DE CONSTRUIR

- Lee entero `.claude/gobernanza/GOBERNANZA.md` §2 (C1) y §3 (C2, protocolo ciego), la
  skill `autoresearch`, `contabilidad.ts`, un `medicion/*.mjs` y un transcript real de esta
  máquina para ver su forma exacta (tipos de evento, `usage`, `tool_use`).
- Investiga 2-3 referencias world-class de trazas de agentes y evaluación con juez
  separado (por ejemplo los formatos abiertos de trazas de LLM y los frameworks de evals),
  y decide qué adoptar y qué no. Un formato ajeno que arrastre contenido de usuarios no
  sirve aquí.
- Mide antes de decidir el almacén: cuánto pesa una trayectoria de forma frente a su
  transcript, y cuántas caben en el repo sin engordar el contexto ni el clon.

Reafirma el objetivo en una línea antes de cada edición grande para no derivar.

## GRAFO DEL SISTEMA (es un grafo, y por qué)

Cuatro preguntas de `loop-vs-grafo`: hay contextos especializados (la captura en el arnés,
la captura en la app y la captura en las herramientas son tres instrumentaciones distintas),
hay fan-out y fan-in reales (las tres capturas convergen en el almacén y el evaluador), el
flujo se lee como diagrama, y el criterio cambia por nodo (un formato válido, una sesión que
deja traza sola, un eval ciego, un informe que compara). Y falla el test de colapso por una
razón de gobernanza, no de tamaño: **el evaluador no puede ser el mismo agente que produjo
las trayectorias**, y C2 exige que no lea el contexto del cambio. **Es un grafo.**

```
repo ─agente─► spec-011 ─mixta─► formato ─┬─mixta─► captura-fabrica ──script─┐
                                          ├─mixta─► captura-app ──────script─┼─► almacen ─agente─► evaluador
                                          └─mixta─► captura-herramientas ─script┘        (sesion aparte)
                                                                                              │
                                                                            informe ◄─script──┘
                                                                              │
                                                                     propuestas ─agente
                                                                              │
                                                              ══ GATE HUMANO: CDC (C1) ══
```

### Plan de orquestación (derivado por `grafo2plan.py`)

- **Fase 1** `spec-011`. Gate: `npm run verifica:specs`.
- **Fase 2** `formato` + verificador. Gate: una trayectoria con un valor de documento, un
  secreto o un identificador del corpus es rechazada; una llamada sin uso lleva coste `null`.
- **Fase 3, en paralelo** `captura-fabrica`, `captura-app`, `captura-herramientas`. Gates:
  una sesión nueva deja trayectoria sola y las históricas cuadran por conteos con sus
  transcripts; prueba con `Registrador` falso; una corrida real de medición del extractor
  emite trayectoria válida.
- **Fase 4** `almacen`: forma y métricas en el repo, lo crudo fuera de git y con caducidad.
- **Fase 5** `evaluador`, corrido por un agente distinto y sin el contexto del cambio.
- **Fase 6** `informe` por periodos, con regresiones marcadas y cada cifra con fuente.
- **Fase 7** `propuestas` con evidencia y **sin aplicar**. Gate humano: CDC.

Reglas del grafo: un nodo cierra solo con su gate en verde pegado; las tres capturas
escriben artefactos disjuntos y solo se hablan por el formato común; el evaluador es un
subagente o una sesión fría, nunca el mismo contexto.

## DEFINICION DE HECHO (evidencia visible en la conversación)

El evaluador solo ve esta conversación. Todo se **pega**, no se afirma:

1. **Spec 011** en `.claude/specs/011-…/` con EARS, «Impacto sobre terceros» (qué NO entra
   en una trayectoria y por qué) y el output de `npm run verifica:specs` en verde.
2. **El formato y su verificador**: el esquema pegado; una prueba en verde que rechaza una
   trayectoria con un valor de documento, otra con algo con forma de secreto, otra con un
   identificador del corpus de casos-trampa, y que acepta coste `null`. Y el verificador
   dentro de `npm run validate`, con su línea de salida pegada.
3. **Captura en la fábrica**: tabla pegada de las sesiones históricas convertidas (por
   sesión: skills invocados, herramientas por nombre, tokens de entrada/salida/caché, gates
   corridos), y una sesión nueva que deja su trayectoria sin intervención, con la línea del
   hook pegada.
4. **Captura en la app**: la prueba con `Registrador` falso en verde, pegada, mostrando que
   cada llamada emite trayectoria y el resumen sigue declarando filas sin costo.
5. **Captura en herramientas**: una corrida real de `medicion/servicio.mjs` del extractor que
   emite su trayectoria; el JSON de forma pegado.
6. **Evaluador separado**: los criterios binarios declarados para al menos un skill, una
   feature y una herramienta; el veredicto de un subagente o sesión fría sobre ≥10
   trayectorias, pegado, y la constancia de que no vio el contexto del cambio.
7. **Informe** pegado comparando dos periodos: tokens y caché, coste por clase de tarea,
   latencia, aciertos de evals, tasa de revisión humana, gates rojos; con al menos una
   regresión o mejora marcada y su fuente.
8. **Una propuesta de mejora derivada**, pegada, con la trayectoria que la sostiene, y la
   demostración de que **no se aplicó**: diff vacío en `AGENTS.md`, skills, routing y
   `settings.json`, y una entrada de CDC redactada con aprobación pendiente.
9. **`npm run validate` en verde, pegado**, y `npm run verify:gobernanza` sin ningún
   identificador del corpus en el árbol.
10. **Reporte de decisiones**: formato, almacén, cómo se cableó la captura en el arnés, qué
    referencias se adoptaron y cuáles no, y por qué.
11. **Lista las formas en que podría estar mal, y resuélvelas**: una trayectoria que filtra
    contenido por un campo libre; un evaluador que en realidad tuvo el contexto; una métrica
    sumada con huecos como ceros; un hook que ralentiza cada llamada; un informe que compara
    periodos con distinta cobertura sin decirlo.

## COMANDO DE VALIDACION

Infraestructura conocida:

```
npm run validate                                   # el gate completo, con el verificador nuevo dentro
cd tools/extractor-documental && npm run prueba    # si se toca la medición de herramientas
```

Cada nodo declara además su comando en su primer checkpoint. Córrelo tras cada cambio
grande y **pega su output**.

## RESTRICCIONES REALES

- **Solo forma (C4)**: ninguna trayectoria lleva contenido de documentos, prompts de
  usuarios finales, valores de campos, secretos ni datos personales. Conteos, claves,
  tiempos, tokens, veredictos.
- **El corpus de casos-trampa no se nombra fuera de `golden-sets`**: ni un identificador de
  caso en una trayectoria, en un informe ni en una propuesta. El verificador de gobernanza
  ya falla si aparece; este trabajo no puede hacerlo fallar.
- **Automejorado no es autoaprobado**: ninguna propuesta modifica `AGENTS.md`, un skill, un
  prompt, `routing-modelos.json`, `settings.json` ni `.mcp.json`. Se proponen con CDC
  redactado y aprobación pendiente (C1). `autoresearch`, si se usa, corre en su rama y no
  se mezcla.
- **El evaluador no es el ejecutor** y no recibe el contexto del cambio (C2).
- **Los huecos se declaran**: una llamada sin uso lleva coste `null`; un periodo con menos
  cobertura lo dice. Nada se estima como cero.
- **Lo crudo no entra al repo**: transcripts y salidas completas quedan fuera de git y con
  caducidad. Al repo entra forma y métricas, dentro del presupuesto de contexto.
- **Modelos y versiones pineados** en cualquier evaluador o juez que se invoque.
- **La captura no puede degradar la sesión**: un hook que añada latencia visible por
  llamada se mide y se declara; si no cabe, se hace asíncrono o por lote.

## RED DE SEGURIDAD

Si tras 40 turnos no converge, detente y reporta qué nodos del grafo cerraron con gate en
verde y cuáles no. Y un límite que no es de turnos: **si en algún punto el único camino para
avanzar exige guardar contenido de terceros o aplicar un cambio de comportamiento sin CDC,
para y repórtalo.** No hay atajo ahí.
