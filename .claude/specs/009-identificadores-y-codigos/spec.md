# Spec 009 — Identificadores y códigos antes que OCR

> Estado: en implementación · Fecha: 2026-09-11 · Origen: medición sobre 4 expedientes laborales
> reales (84 páginas) con Tesseract local, tras la spec 008. Continúa `docs/SDD-extractor-documental.md`
> y se lee contra `docs/constitution.md`. Stack y arquitectura NO van aquí: van en `plan.md`.

## Contexto y objetivo

Un expediente laboral escaneado se lee hoy con un motor de OCR, y el motor devuelve una confianza
que nadie calibra. Medido el 2026-09-11 sobre 84 páginas reales: la confianza media por página fue
73 a 81; las páginas de identificación quedaron bajo 60; y el preprocesado de imagen (binarizar,
filtrar, escalar, enderezar) la movió entre 0 y 3 puntos. Los modos que la «suben» leen la mitad
de palabras. El fallo no está en la imagen: está en **qué se le pide al motor y cómo se valida lo
que devuelve**.

Lo que decide si un expediente se puede cargar son sus identificadores: RFC, CURP y NSS. Y ahí el
motor falla más: la CURP salió en 4 de 4 expedientes, el RFC del empleado en 1 de 4, el NSS en 3
de 4. Mientras tanto, las hojas oficiales del mismo expediente —constancia de CURP, constancia de
situación fiscal— llevan el identificador **exacto** en un QR y en un código de barras, y nadie lo
leía.

Objetivo: invertir el orden. Fuente determinista antes que estimada (los códigos), validación
externa al motor (dígito verificador), lectura por zonas para lo que importa, un segundo motor
solo donde el proyecto lo decida, y coste por omitir clases de página y no leer dos veces la misma
hoja. Todo declarado; ningún umbral inventado; ningún byte fuera de la máquina.

## Usuarios / actores

- **Quien integra** la herramienta en un proyecto: decide qué claves son identificadores, qué
  clases de página existen y cuáles se omiten, y con qué regla se deriva al respaldo.
- **Quien revisa** en la cola humana: recibe lo que no pasó el validador, lo que discrepó entre
  dos fuentes y lo que se corrigió por checksum, cada cosa marcada como lo que es.
- **Los titulares del expediente** (empleados) y el patrón: no usan la herramienta; sus datos son
  los que están en juego.
- **El operador de la medición**: corre los scripts sobre documentos que no entran al repositorio.

## Historias de usuario

1. Como integrador, quiero que la constancia de situación fiscal y la de CURP den el RFC y la CURP
   desde su QR, con procedencia `codigo`, para no depender del OCR en el dato que más importa.
2. Como integrador, quiero validar RFC, CURP y NSS por su dígito verificador, para tener una
   confianza que no dependa de cómo se escaneó la hoja.
3. Como revisor, quiero que un identificador corregido por checksum me llegue **marcado** y sin
   auto-validarse, porque un checksum puede «arreglar» hacia el identificador de otra persona.
4. Como integrador, quiero clasificar páginas por su título y omitir las que no aportan (cartas de
   recomendación), para no pagar motor por ellas.
5. Como integrador, quiero enchufar Tesseract como motor local por el mismo puerto que un modelo
   de visión, con la misma barrera de validación, para elegir por medición y no por arquitectura.
6. Como integrador, quiero que el motor de visión solo lea las páginas que **yo** decida, para que
   el coste sea predecible.
7. Como operador, quiero medir todo eso sobre expedientes reales sin que un valor aparezca en un
   transcript.

## Requisitos funcionales (criterios de aceptación en EARS)

### Códigos antes que OCR

- RF-1: CUANDO se lee una página con un lector de códigos inyectado, EL SISTEMA deberá leer los
  códigos de la imagen ANTES de llamar al motor de OCR.
- RF-2: CUANDO un código decodifica a la URL de la constancia de situación fiscal del SAT
  (`D3=<idCIF>_<RFC>` o `||fecha|RFC|nombre|sello`), EL SISTEMA deberá devolver tipo `csf` con los
  campos `rfc` y, si vienen, `id_cif`, `fecha_emision` y `nombre`, con procedencia `codigo` y
  confianza 1.
- RF-3: CUANDO un código decodifica al texto de la constancia de CURP (campos por `|` con la
  CURP primero, o etiquetas «Número de Validación Legal / Nombre / CURP»), EL SISTEMA deberá
  devolver tipo `curp` con el campo `curp` y los datos impresos que traiga.
- RF-4: CUANDO un código de barras decodifica exactamente a un valor con forma de RFC, EL SISTEMA
  deberá devolver tipo `rfc` con el campo `rfc`.
- RF-5: EL SISTEMA deberá tratar cualquier otro código (INE, CFE, SEP, vacunación) como `url` o
  `texto` sin campos, y no deberá navegar nunca a su destino.
- RF-6: SI una página no trae código, ENTONCES EL SISTEMA deberá seguir exactamente igual que
  sin lector, sin declarar error.
- RF-7: SI el lector de códigos falla, ENTONCES EL SISTEMA deberá declararlo en los avisos de la
  página y continuar con el OCR.
- RF-8: MIENTRAS corre en Node, EL SISTEMA (lector de códigos) deberá cargar el binario wasm desde el
  paquete instalado y no deberá salir a la red.

### Validadores y corrección

- RF-9: EL SISTEMA deberá validar un RFC por forma, fecha embebida y dígito verificador con la
  tabla del SAT, devolviendo el motivo (`forma`, `fecha`, `digito`) cuando no pasa.
- RF-10: EL SISTEMA deberá validar una CURP por forma, fecha (con el siglo resuelto por la
  posición 17), entidad federativa y dígito verificador de RENAPO, devolviendo el motivo.
- RF-11: EL SISTEMA deberá validar un NSS por 11 dígitos y Luhn, admitiendo los separadores que
  imprime el IMSS.
- RF-12: CUANDO un RFC es uno de los genéricos del SAT, EL SISTEMA deberá rechazarlo salvo que
  el proyecto pase `admiteGenericos`.
- RF-13: CUANDO un identificador de procedencia `ocr` no pasa, EL SISTEMA deberá intentar UNA
  sustitución de una sola posición entre confusiones típicas de OCR y aceptarla solo si
  exactamente una variante pasa.
- RF-14: SI hay dos o más variantes que pasan, ENTONCES EL SISTEMA deberá declarar `ambiguo` y
  no deberá corregir.
- RF-15: EL SISTEMA deberá conservar la confianza original de un campo corregido y deberá
  declararlo en `corregidos` con su valor original.
- RF-16: CUANDO un identificador de procedencia `codigo` o `xml` no pasa, EL SISTEMA deberá
  declararlo inválido con esa procedencia y no deberá intentar corregirlo.
- RF-17: EL SISTEMA deberá excluir de `campos` todo identificador que no pasó y no se corrigió.

### Clasificación de páginas

- RF-18: EL SISTEMA deberá clasificar una página por la primera clase declarada cuyo título
  case con su texto, devolviendo el fragmento que casó como evidencia.
- RF-19: SI ninguna clase casa, ENTONCES EL SISTEMA deberá devolver `sin_clasificar` con
  evidencia nula.
- RF-20: CUANDO se declara una clase repetida o llamada `sin_clasificar`, EL SISTEMA deberá
  rechazarla al declarar.
- RF-21: CUANDO la clase de una página está en `omiteClases`, EL SISTEMA deberá conservar la
  lectura principal, no aportar campos y no derivar al respaldo.

### Motor local por proceso

- RF-22: EL SISTEMA deberá exponer un adaptador de `MotorOcr` que ejecute un proceso local con
  la imagen en un directorio temporal solo legible por el usuario y lea JSON por stdout.
- RF-23: EL SISTEMA deberá borrar el directorio temporal al terminar, también tras un fallo o
  un corte por tiempo.
- RF-24: CUANDO el proceso falla, EL SISTEMA deberá incluir en el error solo el código de salida
  y la primera línea de stderr con prefijo `extractor:`, nunca stdout.
- RF-25: EL SISTEMA deberá rechazar al construir un modelo con alias autoactualizable.
- RF-26: EL SISTEMA deberá llamar a `alConsumirTokens` con `null` para un proceso local.
- RF-27: CUANDO la respuesta trae una confianza de página que no es número en [0,1], EL SISTEMA
  deberá descartarla sin romper.
- RF-28: CUANDO el adaptador compatible recibe `usage` con entrada y salida a cero, EL SISTEMA
  deberá tratarlo como no declarado.

### Cableado en el lote

- RF-29: EL SISTEMA deberá derivar una página al motor de respaldo únicamente cuando exista
  una regla `derivaAlRespaldo` del proyecto que lo pida; sin regla no deberá derivar nunca.
- RF-30: CUANDO existen campos de código y de OCR en una página, EL SISTEMA deberá cotejarlos
  emparejando por clave y valor, y deberá excluir de `campos` las claves en discrepancia.
- RF-31: CUANDO una imagen es idéntica byte a byte a otra ya leída en el lote, EL SISTEMA
  deberá reutilizar la lectura y declararla en `paginasReutilizadas`.
- RF-32: EL SISTEMA deberá aplicar los validadores también a las vías `xml` y `capa-cero`, sin
  corregir.
- RF-33: EL SISTEMA deberá declarar por documento las clases de página, los códigos por tipo,
  los cotejos, las páginas al respaldo, omitidas y reutilizadas, los inválidos, los corregidos y
  los milisegundos de respaldo, y totales por lote.

### Medición

- RF-34: EL SISTEMA (script de medición) deberá imprimir conteos y nunca valores de identificadores,
  nombres ni cargas de códigos.
- RF-35: EL SISTEMA deberá exigir que el corpus real de la medición quedar fuera del repositorio.

## Requisitos no funcionales

- **RNF-1** Todo lo nuevo del núcleo es lógica pura, sin `node:fs`, sin red, probable sin
  navegador; el contrato de `pruebas/contrato.ts` lo vigila. Los adaptadores nuevos viven en
  `src/motores/` y `src/lectores/`.
- **RNF-2** Ningún umbral con valor por defecto: derivar, omitir y validar lo decide el proyecto.
- **RNF-3** Ningún dato del documento en errores, logs ni pantalla de medición.
- **RNF-4** Sin dependencias en el núcleo. `zxing-wasm` sigue siendo peer opcional.
- **RNF-5** Archivos de hasta 500 líneas; sin `any`.

## Casos límite

- Página con dos RFC (empleado y patrón) y un solo QR: se empareja el que coincide; el otro queda
  en `soloOcr`, no como discrepancia.
- QR de un tercero (vacunación, INE): se cuenta por tipo y largo; su contenido no se conserva.
- `D3` sin guion bajo ni forma de RFC: queda como `url`, no se adivina.
- RFC genérico `XEXX010101000`: su dígito cuadra por coincidencia aritmética; la opción
  `admiteGenericos` mira la lista, no el dígito.
- Un 29 de febrero en una CURP con siglo resuelto a un año no bisiesto: inválida por fecha.
- Corrección con dos posiciones posibles hacia dos valores válidos distintos: `ambiguo`.
- Proceso local colgado: se mata por tiempo y el temporal desaparece igual.
- Tres imágenes idénticas en el lote: una llamada al motor, dos reutilizaciones declaradas.

## Impacto sobre terceros (control C4)

Los expedientes llevan datos de empleados que no decidieron nada sobre esta herramienta, y del
patrón. Por eso: (1) ningún byte sale de la máquina —Tesseract es un proceso local, el lector de
códigos no toca la red, el motor de visión es autohospedado—; (2) un identificador **corregido por
checksum nunca se auto-valida**, porque la corrección puede llevar al identificador de otra
persona: lo cierra el QR o una persona; (3) el `id_cif` del QR del SAT y el número de validación de
RENAPO se tratan como identificadores y no se consultan contra ningún servicio; (4) los QR de
terceros (salud, INE) no se parsean ni se conservan; (5) la medición imprime solo forma. Esta clase
de riesgo no se firma en el registro: se diseña para que no exista.

## Fuera de alcance

- Parsear el QR o el PDF417 de la INE: datos personales densos; se declara `url`/`texto`.
- Consultar RENAPO, SAT o IMSS para verificar existencia: es sacar el dato a un tercero.
- Corrección de dos o más posiciones: su tasa de falsos positivos no está medida.
- RapidOCR como motor: condicionado a que corra en Python 3.14 sin red; si no, no medido.
- Cambiar `AGENTS.md`: es un CDC aparte.

## Criterios de finalización

- `npm run prueba` en verde con las pruebas de: validadores (incluido el cotejo cruzado contra la
  implementación Python de 600 válidos y 600 inválidos), códigos, clasificación, lector zxing
  (con la red bloqueada), motor por proceso, flujo por página y lote.
- `npm run validate` en verde, incluida esta spec.
- Medición sobre los 4 expedientes reales, en `tareas.md`: identificadores válidos por clave
  antes y después, cuántos vienen de código, corregidos, páginas al respaldo y páginas por
  minuto.

## Dudas abiertas

- Formato del QR de la CURP en constancias de otros años: medido sobre dos formas; una tercera
  caería en `texto` con el campo `curp` igual (el token se busca dentro de la carga).
- Si conviene reutilizar lecturas entre lotes distintos (hoy solo dentro del lote).
- Qué regla de derivación adoptar en producción: la medición compara «clase sin identificador»
  con «confianza de página por debajo de n»; la elección queda para quien opera.
