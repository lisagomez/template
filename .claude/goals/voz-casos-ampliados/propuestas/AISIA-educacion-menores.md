# AISIA — Evaluación de competencias orales en educación (caso 10), con menores

> Fecha: 2026-09-20 · Estado: borrador para firma · Revisión: al activar el caso 10 para un
> centro educativo, al cambiar la rúbrica o el motor, o tras un incidente.
> Redactado por el agente en la Etapa 3; **la decisión y la firma son de una persona.** Hasta que
> se firme, el caso 10 del laboratorio dice «adultos; menores solo con AISIA firmada» y no se
> ofrece a un centro escolar.

## 1. Partes afectadas

- **Alumnos, que pueden ser menores de edad.** Reciben una medición de cómo hablan (ritmo,
  muletillas, pausas, tiempo hablado) que no pidieron, hecha sobre su voz. No firman nada; lo
  hace el centro o un tutor.
- **Docentes.** Usan la cifra para dar retroalimentación; la tentación es usarla como nota.
- **Padres o tutores.** Consienten (o no) en nombre del menor y pueden no entender qué se mide.
- **El centro educativo.** Responsable del tratamiento de datos de menores ante la ley.
- **Compañeros mencionados** en una exposición grabada: aparecen en la transcripción sin saberlo.

## 2. Daños posibles SIN atacante

| Daño | Cómo ocurre operando «bien» |
|---|---|
| **Calificar con una medida que no califica** | La rúbrica es orientativa por franjas; un docente con prisa la convierte en nota. Un alumno con tartamudez, TDAH, o que habla otro idioma en casa cae en «bajo» sin que la herramienta sepa por qué. |
| **Medir muletillas que el motor no oye** | Medido el 2026-09-20: los motores tienden a omitir muletillas. Una cifra baja «por diseño» premia al que no fue medido y castiga al que sí. |
| **Etiquetar a un menor** | «Muletillas frecuentes» pegado a un nombre y repetido en cada clase se vuelve identidad, no medida. |
| **Retener la voz de un menor** | El laboratorio borra el audio al transcribir, pero el historial guarda TEXTO (lo que dijo). Un texto de un menor con retención de 365 días es un dato personal sensible retenido sin plazo pensado para ese caso. |
| **Comparar entre alumnos** | Nada en la herramienta compara, pero una hoja con 30 filas invita a ordenarlas. |
| **Exclusión** | Quien no habla español como primera lengua, o tiene una discapacidad del habla, sale «peor» en todas las franjas y no aparece en ninguna métrica de la herramienta. |
| **Opacidad** | El alumno no sabe que una máquina lo está midiendo ni con qué reglas. |

## 3. Severidad × probabilidad × reversibilidad

| Daño | Severidad | Probabilidad | ¿Reversible? |
|---|---|---|---|
| Calificar con la medida | **Alta** (afecta expediente) | **Alta**: es el uso más natural | Parcial: la nota se corrige, la experiencia no |
| Muletillas no medidas mostradas como cifra | Media | Alta con Parakeet | Sí, si no se muestra |
| Etiquetar | Alta | Media | **No**: la etiqueta queda |
| Retener texto de menores | Alta (dato sensible) | Alta con el defecto actual | Sí, borrando; no si ya se compartió |
| Comparar | Media | Alta | Sí |
| Exclusión | Alta | Media | Parcial |
| Opacidad | Media | Alta | Sí |

## 4. Mitigaciones (las que ya existen y las que faltan)

- **Ya existe**: rúbrica por franjas con el aviso «no es una calificación» en pantalla; nunca un
  número global; muletillas marcadas «no medible» cuando el motor no las conserva (medido);
  audio borrado tras transcribir; nada sale de la máquina; sin modelo de lenguaje.
- **Falta antes de ofrecerlo a menores** (condiciones de la firma):
  1. Consentimiento informado del tutor y del alumno, con el texto de qué se mide y qué no.
  2. Retención **cero** de texto en el caso 10 (no guardar la transcripción de un menor), o
     retención de días con borrado automático, distinta del defecto de 365 días del dictado.
  3. Sin nombre del alumno en la pantalla ni en el informe: un código que solo el docente resuelve.
  4. Vía de apelación humana: el alumno puede pedir que se descarte la medición.
  5. Guía docente de una página: «esto orienta; la nota la pones tú; no compares».
  6. Adaptaciones declaradas: la herramienta no detecta condiciones del habla; el docente las
     marca y la rúbrica se omite.
- **Lo que no se hará**: detectar edad, reconocer al alumno por la voz (biométrico de un tercero,
  límite de C5: ninguna firma lo cubre), enviar audio o texto fuera de la máquina.

## 5. Decisión

**No ofrecer a menores hasta que esta AISIA esté firmada y las seis condiciones del punto 4
estén implementadas y probadas.** Mientras tanto el caso 10 se ofrece solo a adultos que se
evalúan a sí mismos, con la rúbrica orientativa y el aviso a la vista. Justificación: el daño
recae sobre quien no firma (un menor) y la medida principal (muletillas) hoy no es fiable con el
motor por defecto.

Firmada por: ____________  Rol: ____________  Fecha: ____________
