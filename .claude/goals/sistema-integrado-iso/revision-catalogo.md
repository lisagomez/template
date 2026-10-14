# Revisión del catálogo de requisitos (`src/catalogo/datos.ts`)

Fecha: 2026-09-30
Revisor: subagente dedicado (modelo distinto del que redactó)

Alcance: los 59 requisitos del cuerpo (9001 y 42001) y los 38 controles del Anexo A, más las ediciones y la estructura por edición. Se leyó `datos.ts` completo y `investigacion.md`. No se editó ningún otro archivo.

Convención: en las tablas NO se reproduce texto de las normas. Cuando dice «cercano a la norma» se refiere a estructura, orden o secuencia de palabras que el revisor recuerda de las normas, sin tenerlas a la vista.

---

## 1. Derechos de autor

Resultado general: no se encontró ninguna copia literal larga (8 palabras seguidas o más) que el revisor pueda asegurar. Sí hay cuatro casos de traducción muy cercana al enunciado oficial (severidad media) y varios de estructura calcada (baja). El texto es, en su mayoría, redacción propia real.

| ID | campo | hallazgo | severidad | sugerencia (palabras propias) |
|---|---|---|---|---|
| SGI-Q-9.3-03 | pregunta | Lista de temas de entrada de la revisión con el mismo orden y casi la misma selección que la lista de la norma (cliente, objetivos, procesos, no conformidades, auditorías, proveedores, recursos, riesgos). La lista completa es la parte expresiva de la cláusula. | media | Agrupar por tema propio (clientes / operación / proveedores y recursos) y cambiar el orden. Bajar a tres o cuatro grupos en lugar de ocho elementos. |
| SGI-C-10.3-01 | pregunta | La tríada «conveniente, adecuado y eficaz» equivale palabra por palabra a la tríada oficial en español, y «resultados del análisis y de la revisión por la dirección» sigue la frase de la norma. | media | «¿La empresa aprovecha lo que encuentra al medir y al revisar para que el sistema sirva y rinda cada vez más?» |
| A.10.3 | pregunta | Enunciado casi traducido del control: la enumeración «servicios, productos o materiales» seguida de «alineados al enfoque responsable». | media | «¿Se revisa que lo que le compra o contrata a proveedores de IA respete las mismas reglas de cuidado que la empresa se pone?» |
| A.5.2 | pregunta | «Posibles consecuencias … sobre personas y sociedad durante su vida útil» sigue de cerca el enunciado del control (consecuencias, individuos y sociedades, ciclo de vida). | media | «¿Hay una forma fija de preguntarse, antes y durante el uso de cada IA, a quién podría perjudicar o beneficiar?» |
| SGI-C-7.5-02 | pregunta | El ejemplo entre paréntesis «título, fecha, autor» es la lista de ejemplos de la nota de la norma. | baja | Usar otros ejemplos propios: «nombre, versión, quién lo escribió y quién lo autorizó». |
| SGI-Q-9.1-03 | pregunta | Seis elementos de análisis en el mismo orden que la lista de la norma. | baja | Reordenar por pregunta que se quiere responder (¿cumplimos?, ¿satisfacemos?, ¿funciona el sistema?, ¿qué mejorar?). |
| SGI-C-9.2-02 | pregunta | La terna «frecuencia, métodos, responsables» y la secuencia siguiente siguen el orden de la cláusula. | baja | Redactar como calendario, personas y qué hacer con lo encontrado. |
| SGI-Q-8.2-01 | pregunta | Cinco elementos (informar, pedidos y cambios, opinión y quejas, propiedad del cliente) en el orden de la norma. | baja | Separar en dos preguntas con otro agrupamiento. |
| SGI-Q-7.1-06 | pregunta | Secuencia de acciones (calibrar o verificar, identificar, proteger de ajustes o daño) igual a la de la norma. | baja | «¿Los instrumentos clave se revisan con un patrón confiable, se marcan con su estado y se cuidan para que nadie los mueva?» |
| A.2.2, A.6.1.2, A.6.1.3, A.6.2.3, A.7.4, A.7.6, A.9.3 | tema | Títulos de control traducidos casi palabra por palabra («Política sobre IA», «Metas de desarrollo responsable», «Proceso de diseño responsable», «Diseño de la IA documentado», «Calidad de los datos», «Preparación de datos», «Metas de uso responsable»). Son cortos y genéricos, pero el encabezado promete «no se copiaron títulos». | baja | Reescribir con verbo o pregunta: «¿Qué dice la empresa de la IA?», «¿Para qué queremos que la IA se haga con cuidado?», «¿Los datos sirven?», etc. |
| A.6.2.2, A.8.3, A.8.4 | pregunta | Enunciados muy próximos a la traducción del control (requisitos de sistema «nuevo o mejora importante»; «partes externas reportan efectos adversos»; «plan para comunicar incidentes a usuarios»). Cada uno es corto. | baja | Reformular con ejemplos concretos de una pyme (por ejemplo, «si un cliente se queja de que la IA lo trató mal, ¿sabe a dónde escribir?»). |
| SGI-C-9.3-01, SGI-C-9.2-01, SGI-Q-8.2-01, SGI-IA-6.1-08 | tema | Títulos de cláusula o términos definidos por la norma tal cual («Revisión por la dirección», «Auditorías internas», «Comunicación con clientes», «Declaración de aplicabilidad»). Son términos técnicos que un usuario tiene que reconocer, así que es difícil evitarlos. | baja | Mantenerlos como término técnico, pero corregir la afirmación del encabezado («no se copió … títulos de cláusulas») para que diga «salvo términos técnicos definidos». |
| encabezado | comentario | Afirma que no hay títulos ni texto copiados; ya se ve que hay términos y estructuras cercanas. Una afirmación categórica que no se sostiene puede ser peor que la desviación misma. | baja | Suavizar: «redacción propia; los términos técnicos se conservan; las listas se agrupan por tema propio». |

Nota sobre `evidencias`: son ejemplos propios de la pyme (matriz, minuta, acta). No se detectó problema.

---

## 2. Corrección de contenido

Cobertura estructural: E9001 (61 cláusulas 2015) y las estructuras 42001 tienen al menos un requisito. Los 38 controles del Anexo A (A.2.2 a A.10.4) están todos, sin duplicados ni faltantes, y el tema de cada uno corresponde al número. Ningún mapeo a cláusula está claramente equivocado, con una excepción de fondo (C-6.1-02 para 2026). Las marcas `doc` son mayormente correctas; hay tres a corregir.

| ID | campo | hallazgo | severidad | sugerencia (palabras propias) |
|---|---|---|---|---|
| SGI-IA-6.1-07 | doc | Marcado `null`. Según el revisor, 42001 6.1.3 pide conservar información documentada del proceso de tratamiento de riesgos de IA (mismo patrón que 27001). El propio catálogo pone `conservar` en 6.1.2 (evaluación). Confianza aproximada: 75 %. | media | Marcar `conservar` (o dividir: proceso = `conservar`, declaración = `mantener`). Verificar contra la norma. |
| SGI-Q-8.3-02 | doc | Marcado `conservar`. 8.3.2 pide considerar si hace falta información documentada para demostrar el cumplimiento del diseño, no exige conservarla; la conservación obligatoria está en 8.3.3 a 8.3.6. | media | Marcar `null` y anotar en `sencillo` que conviene dejar el plan por escrito; o dejarlo como «recomendado». |
| SGI-A.8.5 (SGI-A-8.5-01) | doc | Marcado `null`. El control habla de determinar y documentar las obligaciones de informar; los otros controles del mismo tipo están en `mantener`. | media | Marcar `mantener` (matriz de obligaciones de reporte ya es su evidencia). |
| SGI-IA-5.2-03 | pregunta | Parece atribuir a la cláusula 5.2 las consideraciones de la guía del control A.2.2 (estrategia, cultura, riesgo aceptable, efecto en personas, leyes), y «remite a los controles adoptados» no corresponde: la cláusula, según el revisor, pide que la política refiera a otras políticas de la organización, no a controles. No se puede confirmar sin el texto. | media | Quitar «remite a los controles adoptados»; poner «y se relaciona con las demás políticas de la empresa». Mover las consideraciones a A.2.2/A.2.3 como «recomendado». |
| SGI-Q-7.1-06 | pregunta / falta | Falta la obligación de evaluar qué pasó con los resultados anteriores cuando un instrumento resulta no apto, y de actuar. Es de las obligaciones más auditadas de 7.1.5.2. | media | Añadir: «Si un instrumento estaba mal, ¿se revisó qué mediciones anteriores quedaron en duda y se hizo algo?». |
| SGI-Q-8.7-01 | pregunta / falta | Cubre separar y registrar, pero omite avisar al cliente cuando el producto ya salió y la autorización para aceptar algo fuera de lo pedido (concesión). | media | Añadir: «Si algo defectuoso ya llegó al cliente, ¿se le avisó? Si se acepta con desvío, ¿quién lo autorizó?». |
| SGI-C-6.1-02 | refs | Mapeado a 6.1.2 de 2026, pero según `investigacion.md` 6.1.2 es solo riesgos y las oportunidades pasan a 6.1.3. La pregunta habla de riesgos y oportunidades a la vez y duplica lo de Q-6.1-03 y Q-6.1-04. | media | Referenciar 6.1.1 de 2026 (o 6.1.2 y 6.1.3 de 2026) y dejar a Q-6.1-03/04 solo lo que 2026 separa. |
| SGI-IA-8.3-01 | pregunta | «Se verifica si funcionó … si surgen riesgos nuevos se vuelve a evaluar» parece añadido: según el revisor 8.3 pide aplicar el plan y conservar resultados; la re-evaluación va en 8.2. | baja | Quitar la verificación de esta pregunta o remitirla a 8.2 y 9.1. |
| SGI-IA-6.1-09 | doc | Marcado `conservar`; no se puede confirmar que la norma lo exija en esos términos. Es buena práctica (firma) y sano para el SoA. | baja | Anotar «práctica recomendada» en vez de obligación. |
| SGI-Q-8.2-01 | pregunta / falta | Omite los requisitos específicos de contingencia cuando aplican. | baja | Añadir una mención propia: «¿Hay un plan si algo sale mal con el pedido del cliente?». |
| SGI-C-4.1-01 | refs | La parte «los revisa de vez en cuando» viene solo de 9001; 42001 4.1 no pediría seguimiento (no confirmado). | baja | Separar en dos requisitos, o dejarlo solo en 9001. |
| SGI-Q-4.1-02 / falta 4.2 | refs / falta | La enmienda climática toca también 4.2 (una nota); el catálogo solo cubre 4.1. Y no queda claro si 42001 recibió el mismo cambio (`investigacion.md` dice «no confirmado»). | baja | Añadir el punto en 4.2 (o ampliar refs) y marcar la duda de 42001. |
| SGI-Q-4.4-03 | doc | Una sola marca (`conservar`), pero la cláusula pide mantener documentos de apoyo y conservar registros. | baja | Dividir en dos requisitos, o permitir `mantener+conservar` en el tipo. |
| SGI-IA-4.3 (SGI-C-4.3-01) | pregunta | No menciona interfaces y dependencias con otras organizaciones, que 42001 exige considerar en el alcance. | baja | Añadir: «y de qué terceros depende». |
| SGI-C-5.3-01 | pregunta | Cubre reportar a la dirección; omite asegurar que los procesos den lo previsto, el enfoque al cliente y la integridad del sistema en cambios. | baja | Añadir una segunda pregunta o ampliar. |
| SGI-C-5.2-04 | pregunta | «Disponible para quien la pida» es más estrecho que «disponible para las partes interesadas que corresponda». Además, la marca `mantener` de 5.2.2 vive en C-5.2-01/Q-5.2-02 (mapeados a 5.2.1). | baja | Ajustar el texto; mover la marca a este requisito. |
| SGI-C-7.3-01 | pregunta | 9001 incluye los objetivos entre lo que debe conocer la gente; no aparecen. | baja | Añadir «y las metas que le tocan». |
| SGI-C-9.2-02 | pregunta | Omite considerar la importancia de los procesos, los cambios y los resultados de auditorías previas al armar el programa. | baja | Añadir. |
| SGI-C-9.3-05 | pregunta | Omite las decisiones sobre necesidades de recursos. | baja | Añadir. |
| SGI-Q-8.5-02 | pregunta | Cubre trazabilidad; omite identificar el estado de lo producido respecto a las inspecciones. | baja | Añadir. |
| SGI-Q-8.3-03 | pregunta | Omite consecuencias posibles de una falla y las normas o códigos aplicables como entrada de diseño. | baja | Añadir. |
| A.3.3 (SGI-A-3.3-01) | pregunta | «Con protección para quien reporta» parece guía de implementación, no el control. | baja | Mantener como recomendación. |
| A.6.2.4, A.6.2.6 | doc | Ambos `conservar`, pero el control pide definir y documentar (mantener) criterios/elementos; los resultados son lo que se conserva. | baja | Mantener el tipo, añadir nota o dividir. |
| Controles A.x en general | diseño | Todos se modelan como obligatorios, pero el Anexo A es condicional a la Declaración de aplicabilidad; y la pyme que solo usa IA no necesita casi ningún control de A.6 ni A.7. | baja | Indicar en el modelo que aplican según SoA y rol (usuario vs. desarrollador). |
| SGI-Q-5.2-02 / investigación | consistencia | `investigacion.md` cuenta «política coherente con la dirección estratégica» como cambio de 2026; según el revisor ya estaba en 2015. El catálogo la trata igual en ambas ediciones, lo cual es correcto, pero el motor no podrá mostrar ese «cambio». No contradice al catálogo; sí la investigación. | baja | Revisar la lista de cambios de `investigacion.md`. |
| IDs SGI-IA-8.2/8.3/8.4-01 | IDs | Mismo número de cláusula que Q-8.2, Q-8.3 y Q-8.4 pero con tema distinto (riesgos de IA vs. requisitos, diseño y proveedores). Sin la edición al lado, se confunden. | baja | Mostrar siempre norma + edición junto al número en la interfaz. |
| Referencias a 2026 | refs | Unas 60 referencias a 9001:2026 en las cláusulas 4 a 10 son suposición (`nueve()` copia la de 2015). La bandera `verificada:false` está a nivel de edición, no de referencia. | baja | Marcar cada referencia Q26 como «supuesta» hasta cotejar. |

Sobre ISO 9001:2026: lo catalogado no contradice `investigacion.md` (cultura y ética en 5.1.1 y 7.3, separación de 6.1 en tres, consolidación de 10.1 y 10.3, sin 10.3 en la estructura de 2026). Falta reflejar que 6.3 se «refuerza» y el aviso de 4.2.

---

## 3. Calidad para una pyme

Resultado general: el tono es bueno («sencillo» en español de México, ejemplos útiles como inundaciones, básculas, minuta). El problema principal es que muchas `pregunta` son compuestas (cuatro a ocho ideas en una), lo que impide contestar sí/no. Los cinco peores:

| ID | campo | hallazgo | severidad | sugerencia (palabras propias) |
|---|---|---|---|---|
| SGI-Q-6.1-03 | pregunta / sencillo | Confunde: «riesgos (lo que puede dañar)» se llama amenaza en el tema, y el dueño no ve la diferencia con Q-6.1-04 ni con C-6.1-01. El sencillo («atender aparte lo que puede hacer daño») es vago. | media | Explicar con ejemplo: «¿Para lo que puede salir mal, ya definió qué hará, quién y cuándo?» y aclarar que esto solo aplica en la edición 2026. |
| SGI-Q-4.4-02 | pregunta | Siete preguntas en una (entradas, salidas, orden, control, recursos, responsable, riesgos, evaluación). Inservible como pregunta guía. | media | Dividir en tres: qué entra y sale; quién lo lleva y con qué; cómo se sabe que va bien. |
| SGI-Q-9.3-03 | pregunta | Lista de ocho temas; el dueño no sabrá si contestar «sí» cuando cubre siete. | media | Convertir en lista de verificación breve (casillas) en lugar de pregunta. |
| SGI-Q-8.5-01 | pregunta | Enumera seis condiciones con jerga («validación de procesos especiales», «medidas contra errores humanos»). | media | «¿Quien produce tiene instrucciones, equipo en buen estado y capacitación? ¿Se revisó dos veces lo que no se puede verificar al final?» |
| SGI-IA-6.1-08 | pregunta / sencillo | «Declaración de aplicabilidad» y «Anexo A» sin explicar; una pyme no sabe qué es. El sencillo lo resuelve a medias. | media | Explicar en una línea: «una lista de los cuidados con IA que la norma sugiere, con un sí o no y la razón de cada uno». |
| SGI-C-8.1-02 | pregunta | Tres temas distintos (cambios planeados, cambios sorpresa, procesos de terceros) y sencillo vago. | baja | Dividir y dar ejemplo (subcontratar el empaque). |
| SGI-C-5.1-02 | sencillo | «Que el sistema no sea algo aparte» es abstracto. | baja | «Que las reglas de calidad se usen en el trabajo diario, no en un manual olvidado.» |
| SGI-IA-6.1-09 | pregunta | «Riesgo residual» sin explicar. | baja | «El riesgo que sigue existiendo después de cuidarse.» |
| SGI-A-6.2-05, A.6.2.6, A.7.5 | pregunta / evidencia | Jerga de desarrollo («despliegue», «procedencia de datos», «cómputo») para pymes que solo usan IA. | baja | Ofrecer una versión de «usuario de IA» separada de la de «desarrolladora». |
| SGI-C-5.1-01 | pregunta | «No con firmas sueltas» es una expresión vaga. | baja | Dar un ejemplo de hecho concreto (asignó presupuesto, asistió a la revisión). |

---

## Veredicto: apto como borrador

Se puede usar como borrador interno (ya está marcado como «borrador sin revisión experta»). No sirve todavía para ofrecerlo a un cliente ni publicarlo como catálogo de requisitos verificado.

Lo que DEBE corregirse antes de usarlo:

1. Derechos de autor: reformular SGI-Q-9.3-03, SGI-C-10.3-01, A.10.3 y A.5.2 (pregunta), y ajustar el encabezado que afirma que no hay títulos ni texto cercanos.
2. Marcas `doc`: SGI-IA-6.1-07 (`conservar`), SGI-Q-8.3-02 (`null`), A.8.5 (`mantener`).
3. Contenido: SGI-IA-5.2-03 (quitar lo que parece guía o inventado), SGI-Q-7.1-06 (resultados previos), SGI-Q-8.7-01 (aviso al cliente y concesión), SGI-C-6.1-02 (mapeo a 2026).
4. Marcar por referencia cuáles de 2026 son suposición.
5. Reescribir los cinco textos peores para una pyme (Q-6.1-03, Q-4.4-02, Q-9.3-03, Q-8.5-01, IA-6.1-08).
6. Que un auditor líder cotejé contra las normas licenciadas todo lo que aquí dice «según el revisor».

## Límite de esta revisión

Soy un modelo de lenguaje. No tengo a la vista ninguna de las normas (ni en inglés ni en la traducción oficial ni NMX-CC-9001-IMNC) ni pude compararlas: mis juicios sobre cercanía a la norma y sobre el contenido salen de memoria y pueden equivocarse, especialmente en 42001 (5.2, 6.1.3, 8.3) y en cualquier cosa de 9001:2026, que es posterior a mi conocimiento. Esto NO sustituye la revisión de un auditor líder competente.

---

## Respuesta del redactor: correcciones aplicadas (2026-09-30)

Aplicadas en `tools/sistema-integrado/src/catalogo/datos.ts` (catálogo 0.1.0, 130 requisitos). La prueba `L2 cobertura` sigue verde.

| Punto del veredicto | Qué se hizo |
|---|---|
| 1. Derechos de autor | Se reescribieron SGI-Q-9.3-03 (tres grupos propios en otro orden), SGI-C-10.3-01, SGI-A-10.3-01 y SGI-A-5.2-01 con las sugerencias. El encabezado ya no afirma «sin títulos»: dice que se conservan los términos técnicos y que las listas se agrupan por temas propios. De paso se atendieron las bajas: C-7.5-02 (otros ejemplos), Q-9.1-03 y C-9.2-02 (reordenadas por pregunta), Q-8.2-01 (reagrupada), Q-7.1-06, A.8.3 (ejemplo de pyme) y los 7 temas del Anexo A traducidos casi literal (A.2.2, A.6.1.2, A.6.1.3, A.6.2.3, A.7.4, A.7.6, A.9.3). |
| 2. Marcas `doc` | SGI-IA-6.1-07 → `conservar` · SGI-Q-8.3-02 → `null` (la evidencia dice «conviene dejarlo por escrito») · SGI-A-8.5-01 → `mantener`. |
| 3. Contenido | SGI-IA-5.2-03 sin «remite a los controles» y con la relación con otras políticas · SGI-Q-7.1-06 con la revisión de las mediciones anteriores · SGI-Q-8.7-01 con el aviso al cliente y la concesión · SGI-C-6.1-02 ahora apunta a 6.1.1 de 2026 (la migración lo muestra como remapeo 6.1.2 → 6.1.1). También: IA-8.3-01 sin la reevaluación, C-4.3-01 con terceros, C-7.3-01 con metas, C-9.3-05 con recursos, Q-8.3-03 con fallas y normas, Q-8.5-02 con el estado de inspección, A.3.3 con las represalias como recomendación. |
| 4. Referencias 2026 | Nuevo campo `supuesta` en cada referencia: 61 referencias a 9001:2026 quedan marcadas como supuestas. Solo quedan sin marca las cláusulas que mencionan los resúmenes consultados (4.1, 4.2, 5.1.1, 5.2.1, 6.1.1-6.1.3, 6.3, 7.3, 10.1). |
| 5. Los cinco peores para una pyme | Q-4.4-02 se partió en tres (Q-4.4-02, nuevas Q-4.4-04 y Q-4.4-05) · Q-6.1-03 con ejemplo y «solo en 2026» · Q-9.3-03 en tres grupos · Q-8.5-01 sin jerga · IA-6.1-08 con la explicación de la SoA en el `sencillo`. |
| Diseño: Anexo A condicional | El motor ya excluye un requisito con justificación escrita. La app pasa a `noAplica` cada control que la SoA declara «no aplica», con su justificación, así que solo cuentan los controles que la SoA incluye. |

**Pendientes a propósito, para el auditor líder**:
- todo lo que este informe dice «según el revisor» (42001 5.2, 6.1.3, 8.3; la enmienda climática en 42001; dividir Q-4.4-03 en `mantener` + `conservar`);
- las versiones «usuario de IA» contra «desarrolladora» de los controles A.6 y A.7.

Mientras tanto el catálogo sigue en `borrador-sin-revision-experta` y cada edición en `verificada: false`.
