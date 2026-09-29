---
name: readme
description: "Escribe, reordena y audita el README de una herramienta (tools/*) o una app (src/features/*) con enfoque product first: qué hace y qué no, casos de uso, requerimientos de infraestructura, y después lo demás. Comandos: /readme nuevo <ruta>, /readme reestructura <ruta>|todos, /readme revisa [ruta]. Activar al crear o editar el README de una herramienta o feature, o cuando digan: haz el README, reestructura el README, README product first, revisa los README. NO: README raíz ni de .claude/ (los lee la gobernanza), SKILL.md, specs (spec-generator), docs de arquitectura."
---

# README product first

Quien llega a una herramienta o a una app tiene que saber **en la primera pantalla** qué resuelve,
para quién, en qué situaciones sirve y qué necesita para correr. Lo técnico va después.

## El contrato (decisión del laboratorio, no se negocia el orden)

Tras el título y **una** línea de propuesta de valor, en este orden:

**Qué hace → Casos de uso → Requerimientos de infraestructura → lo demás**

1. **Qué hace**: qué resuelve y para quién, en palabras de quien lo usa. Dice también **qué NO
   hace** (una subsección `### Qué no hace` o la frase «no hace»): los límites son producto.
2. **Casos de uso**: escenarios concretos — quién, en qué situación, qué obtiene.
3. **Requerimientos de infraestructura**: siete viñetas con la etiqueta en negrita —
   **Runtime** (`engines`), **Dependencias del sistema** (motores, binarios, modelos),
   **CPU, GPU y memoria** (cifra medida con su fecha, o «no medido»), **Servicios externos**,
   **Variables de entorno**, **Almacenamiento** y **Salida del perímetro (C4)**.
4. **Lo demás**, sin perder nada: instalar, puntos de entrada o API, configuración, pruebas,
   desarrollo, mediciones, avisos, licencias, cambios.

El contrato declarado vive en `contrato.json` (títulos admitidos, rubros, alcance y exclusiones
con motivo) y el esqueleto en `plantilla.md`, los dos junto a este archivo. El auditor
determinista es `npm run revisa:readmes`: sin modelo, lo corre cualquier arnés y un gate.

## Reglas que no se negocian

- **No se inventa.** Ni casos de uso, ni requerimientos, ni cifras. Lo que no esté en el código,
  el `package.json`, el SDD, las specs o una medición escrita queda **«pendiente»** o
  **«no medido»**. Un hueco visible es información; una suposición es deuda.
- **Variables de entorno: solo por nombre, jamás el valor.** Ni en el README ni al depurar ni
  en la evidencia: nunca imprimas el valor de una variable de entorno, ni con `printenv` ni con
  `echo`. Presencia se confirma enmascarando (presente/ausente y largo). El auditor rechaza un
  valor sensible escrito, y lo informa por nombre y largo, no por valor.
- **Las cifras medidas se conservan tal cual, con su fecha.** Se citan, no se redondean.
- **No se pierde contenido.** Reordenar y reescribir para producto se admite; borrar en
  silencio no. Toda línea que no sobrevive tal cual lleva su motivo.

## `/readme nuevo <ruta>`

Escribe el README product first de una herramienta o feature que no lo tiene.

1. **Lee antes de escribir**: el código, el `package.json` (`engines`, `dependencies`, `peers`,
   `bin`), el SDD y las specs o goals que la nombran, las mediciones escritas y los nombres de
   variables que el código lee (`process.env[...]`), sin mirar nunca sus valores.
2. **Lo que solo sabe el laboratorio** —para quién es, qué decisión resuelve, qué caso de uso
   manda— se le **pregunta, una cosa a la vez y con respuesta recomendada**. Si la sesión no
   tiene a quién preguntar, se escribe «pendiente» y la pregunta va al informe con su
   recomendación.
3. Escribe desde `plantilla.md`, respetando el orden del contrato.
4. `npm run revisa:readmes -- <ruta>` tiene que salir conforme. Informa qué salió del código,
   qué del SDD, qué se preguntó y qué quedó «no medido» o «pendiente».

## `/readme reestructura <ruta>|todos`

Reordena un README existente al contrato y **demuestra** que no se perdió nada.

1. `npm run revisa:readmes -- <ruta>` para ver qué falta. `todos` = cada README que salga no
   conforme, uno por uno.
2. Mueve las líneas **tal cual**: sin reflujo de párrafos (reflujar convierte una línea movida en
   una reescrita). El preámbulo técnico (estado, arquitectura, ejemplos) baja a una sección de
   «lo demás». Los bloques que un script reescribe entre marcadores (`<!-- MEDICION -->` y
   similares) se mueven enteros, con sus marcadores.
3. Escribe las tres secciones de producto con lo que el README ya dice, más el `package.json` y
   el SDD. Nada nuevo sin fuente.
4. Por cada línea original que no sobreviva tal cual, un motivo en un JSON
   `{ "motivos": [{ "antes": "<línea original>", "motivo": "<por qué>" }] }`.
5. `npm run readme:no-perdida -- <ruta> --motivos <archivo> --detalle`: tiene que dar **0 borradas
   sin justificar y 0 cifras perdidas**. Esa salida, con el esqueleto antes/después, es la
   evidencia.
6. `npm run revisa:readmes -- <ruta>` conforme.

Si un README **no se puede** reestructurar sin perder contenido que importa, no se fuerza: se deja
como está y se dice por qué.

## `/readme revisa [ruta]`

Corre `npm run revisa:readmes` (o `-- <ruta>`) y lo informa tal cual: por README, conforme o no
conforme y qué le falta; los excluidos con su motivo; las carpetas de producto **sin README**
(pendientes: se listan, no se crean solas); y los README **sin clasificar**, que son rojo. No
escribe nada. `-- --prueba` demuestra que el auditor caza: siembra violaciones y exige que caigan.

## Qué NO hace

- No toca el `README.md` raíz ni `.claude/README.md`: la gobernanza lee sus cifras. Tampoco la
  documentación de skills, goals ni arquitectura: el contrato los excluye con motivo.
- No crea README por su cuenta para las features que no lo tienen: las lista; `nuevo` es a pedido.
- No publica paquetes ni sube versiones.
- No cambia el contrato: editar `contrato.json` (una exclusión para callar al auditor, un título
  admitido más) es cambiar este skill, y eso es un **CDC (C1)**: diff, `npm run regresion`,
  aprobación del laboratorio y entrada en `BITACORA-CDC.md`. Lo mismo para volverlo gate en
  `.claude/gates.json`.
