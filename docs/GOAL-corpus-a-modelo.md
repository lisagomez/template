# Corpus a modelo — Spec para `/goal`

> Compilado con `/goal-compiler` el 2026-09-11. Este archivo es el spec completo; el bloque
> `/goal` corto que se pega en la sesión apunta aquí por ruta absoluta.
>
> Continúa lo que `docs/INVESTIGACION-OCR-MISTRAL.md` §10 dejó abierto a propósito: «sin el QUÉ
> acordado, spec primero». Su punto 3 —¿pueden los documentos salir del perímetro?— ya está
> contestado: **no**. Llevan datos de terceros. Todo lo demás se diseña a partir de ahí.

## MISION

Que un negocio pueda soltar **miles de documentos heterogéneos** —PDF generados por software,
escaneos, fotos de móvil, XML fiscales— y obtener, sin que un solo byte salga de su perímetro:

1. **Cada documento leído por la vía que le corresponde**, y solo esa. Un PDF con capa de texto
   se resuelve sin motor y sin coste. Un CFDI en XML se lee exacto, sin estimar nada. Un escaneo
   va al motor de OCR autohospedado, y va como imagen, no como PDF. La ruta se decide por lo que
   el documento **es**, no por su extensión, y el sistema dice cuál tomó y por qué.

2. **Sus campos extraídos con trazabilidad**: cada dato sabe de qué documento, página y región
   salió. Un dato que no se puede citar no se puede auditar después, y a los seis meses nadie
   sabrá de dónde vino.

3. **Un modelo de datos inferido del corpus entero**, no de un documento: qué entidades
   aparecen, con qué atributos, de qué tipos, cómo se relacionan y con qué cardinalidad
   observada. Un proveedor que aparece en trescientas facturas es una entidad; un folio que nunca
   se repite es un atributo; una relación que en el 100 % de los casos es uno a muchos se propone
   como tal, y una que a veces no lo es se señala como duda, no se fuerza. Emitido como
   **propuesta revisable** en la forma que el extractor ya tiene —`PropuestaDeModelo`, con su SQL
   como texto y su lienzo—, y **jamás aplicado**: aplicarlo es una acción irreversible y va por
   gate humano.

4. **JSON estructurado por documento**, alineado con los tipos del extractor (`CampoExtraido`,
   `PaginaExtraida`, y la propuesta de modelo), de modo que un proyecto lo consuma directo sin
   traducir nada. Validado contra esos tipos, no contra una idea de esos tipos.

5. **Rendimiento diseñado para el perímetro, no contra él.** Con datos de terceros el motor es
   autohospedado, y un motor autohospedado en CPU tarda entre 8 y 12 minutos por página
   —medido ayer, no supuesto—. «Masivo» se consigue con ingeniería, no con deseo: enrutar
   fuera del motor todo lo que no lo necesite (capa 0 y XML, que en un corpus mixto son entre el
   30 % y el 50 %), agrupar peticiones para que el motor procese en lote y no de una en una,
   reutilizar el trabajo del codificador visual entre documentos parecidos, elegir un motor
   pequeño y especializado en documentos en vez de uno grande y generalista, y medir el techo
   real en el hardware que hay antes de prometer nada.

6. **Honestidad sobre lo que no se sabe.** Un modelo de visión al que se le piden veinticinco
   campos devuelve veinticinco, existan o no; rellenar es más fácil que admitir un hueco. Y su
   confianza puede ser una constante —ayer, veinticinco campos a `0.90` exacto—. El sistema no
   se fía de ninguna de las dos cosas: coteja cada extracción contra una segunda lectura del
   mismo documento, y mide si la confianza del motor correlaciona con el error real antes de
   usarla como señal. Si no correlaciona, lo dice, y no inventa un umbral.

Nivel de referencia: las plataformas de inteligencia documental que ingieren un corpus y
devuelven un modelo de datos propuesto con linaje por campo. Con una diferencia que aquí es
requisito y allí es opción: el documento no sale nunca.

## LIBERTAD TECNICA

Tú eliges arquitectura, motor de OCR, servidor de inferencia, estrategia de lotes, forma de la
cola, cómo se reanuda un corpus a medias, y cómo se infiere el modelo. Probablemente sabes mejor
que yo qué conviene. Cualquier tecnología nombrada en este spec es sugerencia descartable, NO
requisito, salvo la sección RESTRICCIONES REALES. Optimiza por el mejor resultado posible, no
por el camino más corto.

Lo que **ya existe y se reutiliza tal cual**, en `tools/extractor-documental/`:

- Ingesta y clasificación: `clasificaLote`, `troceaPaginas` en `src/archivos.ts`.
- Capa 0 (PDF con texto, sin motor): `leeCapaCero` en `src/capa-cero.ts`; y `imagenesDelPdf` en
  `src/pdf-flujos.ts`, que saca el JPEG de un escaneo para mandarlo al motor.
- XML fiscal con registro de esquemas: subpath `./xml`, `leeCfdi40` y `registroDeEsquemas`.
- Motor autohospedado: `motorCompatible` en `src/motores/openai-compat.ts`, contra cualquier
  servidor con API compatible. El motor se **inyecta**: el núcleo no trae ninguno.
- Corroboración entre fuentes: `corrobora` y `exigeRevision` en `src/corroboracion.ts`. Y la
  técnica para escaneos sin segunda fuente, en `docs/SDD-extractor-documental.md` §5.2.1.
- Reconciliación contra catálogos: `resuelveValor`, `resuelveIdentificador`.
- Propuesta de modelo: `proponeModelo`, `revisaSql` y los tipos `PropuestaDeModelo`,
  `EntidadPropuesta`, `RelacionPropuesta` en `src/modelo.ts`. El lienzo en `src/react/lienzo.ts`.
- Medición de calidad: `cer`, `wer`, `correlacionConfianzaError`, `curvaDeUmbral` en
  `src/calibracion.ts`.
- Banco de pruebas con negocio ficticio en SQLite: `banco/`.

Lo que **no existe y es el corazón del trabajo**: hoy `proponeModelo` proyecta una plantilla a una
tabla, y las relaciones las pone un humano a mano. **No hay inferencia inter-documental.** Nada
mira N extracciones para descubrir entidades repetidas, cardinalidades observadas, ni candidatos a
normalización. Eso es lo nuevo. Su salida debe caber en `PropuestaDeModelo` para que el lienzo y la
barrera `revisaSql` sirvan sin tocarlos.

## INVESTIGA ANTES DE CONSTRUIR

Investiga y **mide** —no leas benchmarks de vendedor— antes de elegir:

- **Motores de OCR de pesos abiertos, especializados en documentos, autohospedables**: GLM-OCR
  (0,9 mil millones de parámetros, cabe en pocos GB de memoria de vídeo, sirve por vLLM, SGLang
  u Ollama) y PaddleOCR-VL (mismo tamaño, del orden de 45 a 60 páginas por minuto en una GPU de
  centro de datos). Compáralos en el hardware disponible con un corpus real pequeño y
  estratificado, como pide `docs/INVESTIGACION-OCR-MISTRAL.md` §8. Los dos son candidatos; el
  que gane lo decide la medición, y el resultado se versiona en el repo.
- **Servidor de inferencia con lotes continuos**: vLLM o SGLang. La literatura mide del orden de
  20 a 26 veces más rendimiento con lote de 64 frente a lote de 1, y reutilización del
  codificador visual entre imágenes iguales. Prefijo compartido en SGLang para corpus de
  plantilla repetida. Todo eso es de lo que depende que «masivo» signifique algo.
- **Inferencia de esquema desde datos semiestructurados**: cómo se descubren entidades y claves
  a partir de registros heterogéneos. Reutiliza lo que el extractor ya sabe distinguir:
  `formato: 'identificador'` se compara por igualdad exacta, nunca por parecido.
- Lee entero `docs/INVESTIGACION-OCR-MISTRAL.md` y `docs/SDD-extractor-documental.md`, y las
  reglas de `AGENTS.md`. Este trabajo se rige por ellas.

Reafirma el objetivo en una línea antes de cada edición grande para no derivar.

## LA FORMA DEL SISTEMA (es un loop, y por qué)

Se aplicaron las cuatro preguntas de `loop-vs-grafo`. Hay fan-out real sobre documentos y el
flujo se lee como diagrama, pero el paralelismo es de **datos** —la misma operación sobre N
documentos, que el servidor de inferencia agrupa solo— y no de especialistas con contextos
separados. Pasa el test de colapso: un solo agente lo hace como bucle con etapas sin perder nada.
**Es un loop.** La topología se deja escrita para quien lo ejecute, no para orquestarla como grafo:

```
corpus ──► clasificar por lo que ES ──┬─► PDF con texto ──► capa 0 ──────────┐
                                      ├─► XML fiscal ─────► lector + registro ─┤
                                      └─► escaneo/foto ───► imagen ──► motor ──┤
                                                              (en lote, autohospedado)
                                                                              ▼
                        campos por documento, con documento/página/región ◄───┘
                                      │
                                      ├─► segunda lectura ──► cotejo ──► cola humana si discrepa
                                      │
                                      ▼
                        inferencia sobre el CORPUS: entidades, atributos, tipos,
                        relaciones, cardinalidades observadas, dudas
                                      │
                                      ▼
                        PropuestaDeModelo + JSON por documento
                                      │
                                      ▼
                        ══ GATE HUMANO ══  (aquí termina el sistema; aplicar no es suyo)
```

El único nodo que no colapsa es el gate humano del final, y ese no es del agente.

## DEFINICION DE HECHO (evidencia visible en la conversación)

El evaluador solo ve esta conversación. No corre comandos ni lee archivos. Todo lo de abajo se
**pega** en el transcript, no se afirma:

1. **La spec del repo existe y pasa su gate.** `.claude/specs/008-corpus-a-modelo/` con
   `spec.md`, `plan.md` y `tareas.md`, diez secciones, requisitos en EARS, y el output de
   `npm run verifica:specs` en verde pegado. La sección «Impacto sobre terceros» dice con quién
   se es cuidadoso y por qué el motor es autohospedado.

2. **Una corrida real sobre un corpus.** Tabla pegada, un documento por fila: qué ruta tomó
   (capa 0 / XML / motor), cuántos campos salieron, cuánto tardó. Con al menos un documento de
   cada ruta. El corpus puede ser el del banco de pruebas más documentos sintéticos; si se usan
   documentos reales, **no entran al repositorio**.

3. **El rendimiento, medido en el hardware que hay.** Páginas por minuto por la vía del motor,
   antes y después de agrupar en lote, pegado. Y el techo honesto: si no hay GPU, se dice cuánto
   tarda el corpus entero y cuánto se ahorra enrutando fuera del motor.

4. **La comparación de motores, medida.** Al menos dos candidatos autohospedables sobre el mismo
   corpus pequeño: CER, porcentaje de campos correctos, latencia. Tabla pegada. Cuál se eligió y
   por qué, con los números delante.

5. **La propuesta de modelo inferida del corpus**, pegada: entidades, atributos con tipo,
   relaciones con cardinalidad observada, y las dudas donde la cardinalidad no fue uniforme. El
   SQL propuesto pegado, y el output de `revisaSql` demostrando que no toca nada preexistente.

6. **El JSON validado contra los tipos del extractor.** Una prueba que importa `CampoExtraido`,
   `PaginaExtraida` y `PropuestaDeModelo` desde `dist/` y falla si el JSON no encaja. Su output
   en verde pegado.

7. **El cotejo de las dos lecturas.** Para los documentos que fueron por el motor: cuántos
   campos coinciden con la transcripción y cuántos no, pegado. Los que no coinciden van a la
   cola humana, no al resultado.

8. **La correlación confianza-error, medida.** Con `correlacionConfianzaError` sobre el corpus
   con referencia. El número pegado y la conclusión honesta: si es cercano a cero, **no se fija
   umbral** y se dice que el motor no da señal utilizable.

9. **El último output de `npm run validate` en verde, pegado.** Y `npm run prueba` de la
   herramienta.

10. **Reporte de decisiones**: motor, servidor, estrategia de lote, cómo se infiere el modelo, y
    qué se descartó y por qué.

11. **Lista las formas en que podría estar mal o incompleto, y resuélvelas** antes de declarar
    hecho. En particular: un documento que se pierde en silencio en el lote, una entidad
    inferida de una alucinación, un JSON que encaja por casualidad.

12. **Nada aplicado a ninguna base de datos.** Se afirma explícitamente y se demuestra que no
    existe la ruta.

## COMANDO DE VALIDACION

Infraestructura conocida, comando exacto:

```
npm run validate                                    # desde la raíz: el gate completo
cd tools/extractor-documental && npm run prueba     # la herramienta
```

Córrelo tras cada cambio grande y **pega su output** en la conversación. Es el latido del loop:
sin él, treinta turnos de deriva pasan desapercibidos.

## RESTRICCIONES REALES

No negociables. Todo lo demás es libre.

- **Los documentos llevan datos de terceros. Ningún byte sale del perímetro.** El motor es
  autohospedado y corre en hardware propio. Mistral OCR, y cualquier API externa de visión, queda
  **fuera**, y no por preferencia: el daño recaería sobre personas que no decidieron nada, y esa
  clase de riesgo no la autoriza ninguna firma (límite de C5 en `AGENTS.md`). No se ofrece la vía
  del registro de riesgo. Y «autohospedado» describe quién corre el modelo, no por dónde viaja el
  byte: apuntar a un servidor ajeno saca el documento igual.
- **La inferencia de modelo desde el corpus es lógica pura y vive en el núcleo del extractor**,
  sin dependencias, probable sin red ni base ni navegador, con `pruebas/contrato.ts` vigilando.
  La orquestación del corpus —cola, progreso, reanudación, servidor de inferencia— es libre y
  puede vivir donde convenga.
- **El modelo se propone, nunca se aplica.** Sale como `PropuestaDeModelo`, pasa por `revisaSql`,
  y no existe en este trabajo ninguna ruta que ejecute SQL. Aplicar es gate humano (RF-19).
- **Los umbrales se miden, no se inventan.** Ningún umbral de confianza ni de similitud lleva
  valor por defecto. Si la correlación no da señal, se declara y se sigue sin umbral.
- **Los documentos reales no entran al repositorio.** El corpus va ignorado por git. Los fixtures
  son sintéticos y lo dicen en su primera línea.
- **El modelo de OCR va pineado.** Un alias autoactualizable se rechaza al construir (C1).
- **Un documento que no se pudo procesar se declara, no desaparece.** Lo mismo para un
  complemento sin lector, un campo que no coincide con la transcripción, y una cardinalidad que
  no fue uniforme. Declarar, no descartar.
- **Cambiar `AGENTS.md`, un skill, un prompt o la configuración del agente es un CDC** con su
  propio gate, fuera de este loop. Si hace falta, se propone; no se hace dentro.

## RED DE SEGURIDAD

Si tras 40 turnos no converge, detente y reporta el bloqueo con precisión: qué está hecho, qué no,
y qué lo impide. Un reporte honesto de bloqueo vale más que un «hecho» en falso.

Y un límite que no es de turnos: **si en algún punto el único camino para avanzar exige sacar un
documento del perímetro, para y repórtalo.** No hay atajo ahí.
