# Spec 008 — Del corpus al modelo: carga masiva, lectura por vía e inferencia entidad-relación

> **Origen**: [`docs/GOAL-corpus-a-modelo.md`](../../../docs/GOAL-corpus-a-modelo.md), compilado
> con `/goal-compiler` el 2026-09-11. **Diseño de la herramienta base**:
> [`docs/SDD-extractor-documental.md`](../../../docs/SDD-extractor-documental.md).
> **Continúa** la spec 007: no la reescribe. Todo lo que 007 ya cierra —puertos, capa 0, XML,
> corroboración, propuesta de modelo desde una plantilla— se reutiliza tal cual.
>
> Esta spec cierra el **QUÉ**. El motor que gana, el servidor de inferencia y la estrategia de
> lote viven en el plan, y se deciden **midiendo**, no leyendo benchmarks de vendedor.

## Contexto y objetivo

Un negocio tiene miles de documentos heterogéneos —PDF generados por software, escaneos, fotos de
móvil y XML fiscales— y quiere dos cosas: los datos de cada documento, y **el modelo de datos
que esos documentos, en conjunto, implican**. Hoy la herramienta lee un documento a la vez y
propone una tabla por plantilla; las relaciones entre entidades las pone un humano a mano. No hay
nada que mire trescientas facturas y descubra que el mismo proveedor aparece en todas.

Y hay una restricción que lo gobierna todo: **los documentos llevan datos de terceros**. Ningún
byte sale del perímetro. El motor de OCR es autohospedado, en hardware propio, y un motor
autohospedado sin GPU tarda minutos por página. «Masivo», por tanto, no se consigue con un motor
más rápido en la nube: se consigue enrutando fuera del motor todo lo que no lo necesite, midiendo
el techo real del hardware, y diciendo la verdad sobre lo que no se sabe.

El objetivo es que un corpus entre por un extremo y salgan por el otro: (1) cada documento leído
por la vía que le corresponde, con sus campos citables; (2) JSON por documento alineado con los
tipos del extractor; (3) una **propuesta** de modelo inferida del corpus entero —entidades,
atributos con tipo, relaciones con cardinalidad observada y dudas declaradas— que pasa por la
misma barrera que la propuesta de una plantilla y que **nadie aplica** desde aquí.

## Usuarios / actores

- **Dueño del corpus** — quien tiene los documentos y quiere el modelo. Aprueba o rechaza la
  propuesta; nunca la ve aplicarse sola.
- **Integrador** — quien conecta el motor autohospedado y decide los patrones y los
  identificadores de su dominio.
- **Titular del documento** — la persona o empresa sobre la que trata el papel. **No usa el
  sistema y no eligió estar aquí.** Es a quien protege la sección de impacto.
- **Revisor** — quien recibe la cola humana: campos que no coincidieron con la transcripción,
  dudas de la inferencia, documentos que no se pudieron leer.
- **Agente de la fábrica** — implementa y mide.

## Historias de usuario

- Como **dueño del corpus**, quiero soltar una carpeta con miles de archivos mezclados y que cada
  uno se lea por la vía más barata que lo lea bien, para no pagar minutos de motor por un PDF
  que ya trae su texto.
- Como **dueño del corpus**, quiero ver qué entidades aparecen repetidas en mis documentos y
  cómo se relacionan, con la evidencia contada, para decidir un modelo de datos sin inventarlo.
- Como **dueño del corpus**, quiero que la propuesta me diga dónde duda —una relación que a
  veces no es uno a muchos, un dato que casi siempre acompaña al mismo proveedor— en vez de
  forzar una respuesta.
- Como **integrador**, quiero declarar qué claves son identificadores en mi dominio y qué
  patrones sacan campos del texto exacto, sin tocar el paquete.
- Como **integrador**, quiero saber cuántas páginas por minuto da mi hardware con cada motor
  antes de prometer un plazo, y cuánto ahorro enrutando fuera del motor.
- Como **revisor**, quiero que un campo que el motor compuso —y que no está en el papel— llegue a
  mi cola y no al resultado.
- Como **titular del documento**, quiero que mi papel no salga de la máquina donde lo subieron, y
  que un dato mal leído no funde una entidad ni decida nada sin que alguien lo mire.

## Requisitos funcionales (criterios de aceptación en EARS)

### Lectura del corpus por vía

- RF-1: CUANDO entra un archivo al corpus, EL SISTEMA decidirá la vía por sus **bytes** —PDF,
  imagen o XML— y nunca por su nombre ni su extensión.
- RF-2: CUANDO un PDF trae capa de texto que supera la prueba de imprimibilidad, EL SISTEMA lo
  resolverá por la capa 0 sin llamar al motor, y declarará esa vía en la lectura.
- RF-3: CUANDO un PDF no trae capa de texto pero contiene una imagen de página extraíble, EL
  SISTEMA enviará al motor **la imagen**, nunca el PDF entero.
- RF-4: CUANDO un XML es un CFDI 4.0, EL SISTEMA lo leerá con el lector y el registro de esquemas
  de 007, sin motor, y declarará los complementos sin lector.
- RF-5: SI un archivo no es PDF, imagen ni XML, o no se pudo leer por ninguna vía, ENTONCES EL
  SISTEMA lo devolverá con vía `ninguna` y su motivo, en su posición del lote.
- RF-6: SI no hay motor inyectado, ENTONCES EL SISTEMA declarará los escaneos como no leídos con
  ese motivo, sin tratarlo como error del lote.
- RF-7: SI el motor falla sobre un documento, ENTONCES EL SISTEMA declarará el fallo **en ese
  documento** y seguirá con los demás.
- RF-8: EL SISTEMA devolverá las lecturas en el orden de entrada, con el tiempo de cada una y el
  recuento por vía, sea cual sea el número de peticiones en vuelo.
- RF-9: DONDE el integrador declare patrones, EL SISTEMA sacará campos deterministas del texto
  exacto de la capa 0, con procedencia `codigo` y confianza 1, y un patrón que no case no
  producirá campo.
- RF-10: DONDE el integrador declare claves identificadoras, EL SISTEMA marcará esas claves como
  `identificador` en lo que salga por cualquier vía, sin pisar una marca previa del lector.

### Segunda lectura y honestidad del motor

- RF-11: CUANDO el motor devuelve campos junto a su transcripción, EL SISTEMA cotejará cada valor
  contra la transcripción, y solo los que aparezcan en ella entrarán al resultado.
- RF-12: CUANDO un campo del motor no aparece en la transcripción, EL SISTEMA lo enviará a la
  cola humana con su clave, y no al resultado.
- RF-13: SI no hay transcripción, ENTONCES EL SISTEMA lo declarará y ningún campo del motor
  coincidirá.
- RF-14: DONDE el motor sea de OCR puro y solo transcriba, EL SISTEMA sacará los campos por
  patrón sobre esa transcripción, con procedencia `ocr` y **confianza 0** —la mínima— porque el
  motor no declara ninguna y no se inventa.
- RF-15: EL SISTEMA medirá la correlación confianza-error sobre el corpus con referencia antes de
  usar la confianza del motor como señal, y si es cercana a cero no fijará umbral y lo dirá.

### Inferencia del modelo desde el corpus

- RF-16: CUANDO un campo marcado `identificador` toma **el mismo valor exacto** en dos documentos
  distintos, EL SISTEMA propondrá una entidad fundada en esa clave, con el número de documentos
  y de valores distintos como evidencia.
- RF-17: EL SISTEMA no fundará una entidad en un campo de texto libre aunque se repita: lo
  declarará como duda para que alguien lo marque identificador si lo es.
- RF-18: EL SISTEMA no fundará una entidad en un valor sin letra ni dígito, porque un `...`
  copiado de la plantilla se repite en todos los documentos sin identificar nada.
- RF-19: CUANDO un campo toma siempre el mismo valor dentro de cada grupo de documentos que
  comparten el identificador, en **todos** los grupos comprobables, EL SISTEMA lo propondrá como
  atributo de esa entidad, con el número de grupos en que se comprobó.
- RF-20: SI la dependencia se cumple en unos grupos y en otros no, ENTONCES EL SISTEMA la
  declarará como duda con los documentos que la rompen, y dejará el campo en el documento.
- RF-21: CUANDO un campo vale lo mismo en todos los documentos del corpus, EL SISTEMA lo dejará
  en el documento y avisará, sin decidir si es constante del negocio.
- RF-22: EL SISTEMA propondrá la relación documento → entidad como N:1 con la cardinalidad
  **observada**, y si un documento toma varios valores del identificador lo declarará como duda
  con ese documento.
- RF-23: SI un identificador toma un solo valor en todo el corpus, ENTONCES EL SISTEMA declarará
  la duda entre entidad de un miembro y constante del negocio.
- RF-24: CUANDO dos tipos de documento comparten el identificador, EL SISTEMA propondrá **una**
  entidad referenciada desde ambos, y dirá desde qué tipos.
- RF-25: EL SISTEMA contará todos los documentos que entraron a la inferencia, y un documento sin
  campos se declarará, no desaparecerá.
- RF-26: SI dos documentos llegan con el mismo identificador de documento, ENTONCES EL SISTEMA
  fallará con ese identificador en el mensaje, en vez de pisar uno en silencio.

### Propuesta, barrera y salida

- RF-27: EL SISTEMA emitirá la inferencia como `PropuestaDeModelo` —entidades, relaciones, SQL
  como texto y avisos— de modo que el lienzo y la barrera de 007 sirvan sin tocarlos.
- RF-28: EL SISTEMA emitirá las tablas de entidad **antes** que las de documento, con clave
  foránea a la entidad y RLS en todas, y la pasará por `revisaSql` antes de devolverla.
- RF-29: SI una entidad inferida ya existe en el descriptor del proyecto, ENTONCES EL SISTEMA la
  referenciará por su clave primaria real, no la creará, y avisará.
- RF-30: EL SISTEMA no tendrá, en ningún módulo de este trabajo, una ruta que ejecute SQL contra
  una base: aplicar la propuesta es gate humano (RF-19 de 007).
- RF-31: EL SISTEMA escribirá un JSON por documento y uno por propuesta cuya forma sea la de
  `CampoExtraido`, `PaginaExtraida` y `PropuestaDeModelo`, y una prueba que valide esa forma
  desde `dist/` fallará si deja de encajar.

### Medición y perímetro

- RF-32: EL SISTEMA rechazará al construir el motor un identificador de modelo con alias
  autoactualizable (`latest` y parientes), también para el motor de OCR puro.
- RF-33: EL SISTEMA medirá páginas por minuto por la vía del motor en el hardware real, con una
  y con varias peticiones en vuelo, y publicará ambas cifras junto al ahorro por enrutar fuera
  del motor.
- RF-34: EL SISTEMA comparará al menos dos motores autohospedables sobre el mismo corpus con
  verdad conocida —CER, porcentaje de campos correctos, latencia— y la elección se justificará
  con esas cifras.
- RF-35: EL SISTEMA mantendrá el corpus de medición fuera del repositorio, y los documentos
  sintéticos declararán que lo son.
- RF-36: EL SISTEMA no imprimirá, en ninguna corrida de medición, valores de un documento que no
  sea sintético: solo forma —claves, conteos, tiempos y métricas—.

## Requisitos no funcionales

- **Núcleo puro**: la inferencia, el cotejo con la transcripción, los patrones y el enrutado del
  lote viven en el núcleo, sin dependencias, probables sin red, base ni navegador.
  `pruebas/contrato.ts` lo vigila: una carpeta nueva bajo `src/` es núcleo salvo que se declare
  adaptador.
- **Sin umbrales cocidos**: ninguna función de este trabajo lleva un umbral de confianza ni de
  similitud por defecto. La única heurística es de forma (RF-18), no de número.
- **Declarar, no descartar**: todo lo que no se pudo leer, cotejar o decidir se devuelve con
  nombre y motivo.
- **Trazabilidad**: cada campo del motor conserva su región; al recomponer páginas de un PDF
  escaneado, la página de la región se reescribe a su posición real.
- **Perímetro**: el motor se inyecta y corre en hardware propio; el adaptador contra API externa
  queda fuera de este trabajo para documentos con datos de terceros.
- **Tamaño**: archivos por debajo de 500 líneas y funciones por debajo de 50.
- **Reproducibilidad**: el corpus sintético se genera con semilla fija; la misma semilla da los
  mismos documentos y la misma verdad.

## Casos límite

- Un PDF con capa de texto que solo contiene fontanería (fuentes, metadatos) y ningún flujo de
  contenido: la capa 0 lo rechaza y va al motor, del lado seguro de la asimetría.
- Un PDF escaneado con más de una imagen por página, o con JPEG2000/CCITT: se declaran menos
  imágenes que páginas; no se inventan bytes.
- Un XML con BOM o con espacio antes del prólogo: sigue siendo XML por sus bytes.
- Un identificador que se repite por copia de plantilla del motor (`...`, `N/A`): RF-18 lo
  descarta por forma; un `N/A` sí tiene letras y **sí** fundaría una entidad —queda como duda
  abierta, ver abajo—.
- Un corpus de un solo emisor: la entidad tiene un miembro y la duda RF-23 lo dice.
- Un documento con dos RFC de emisor: RF-22 lo declara; la relación no se fuerza a 1:N.
- Un campo que cambia con el tiempo (razón social tras una fusión): RF-20 lo deja en el documento
  con los documentos que rompen la dependencia.
- Motor que corta a los cinco minutos por el `headersTimeout` de Node: el adaptador lo traduce; el
  script de medición inyecta un `fetch` con dispatcher propio.
- Motor que devuelve HTML o JSON malformado (medido con GLM-OCR): en modo `campos` la respuesta
  se rechaza y se declara; en modo `transcripcion` no se le pide JSON.
- Cero documentos: la propuesta dice «Nada que crear» y pasa la barrera igual.

## Impacto sobre terceros (control C4)

Los afectados son **los titulares de los documentos**: proveedores, clientes, empleados y personas
citadas en minutas. No usan el sistema y no eligieron estar aquí.

| Daño, sin ningún atacante | Mitigación en esta spec |
|---|---|
| El documento sale del perímetro hacia un proveedor de OCR y el titular pierde el control de sus datos | Motor **autohospedado** e inyectado; el adaptador contra API externa no se usa para este corpus. «Autohospedado» describe quién corre el modelo, no por dónde viaja el byte: apuntar a un servidor ajeno lo saca igual |
| Una entidad inferida de una alucinación del motor acaba como tabla con datos de una persona que no existe | RF-16, RF-18: solo un identificador que se repite **exacto** en dos documentos funda algo; RF-11: el valor tiene que estar en la transcripción |
| Un dato compuesto por el motor —no leído— decide algo sobre el titular | RF-11, RF-12: no entra al resultado; va a la cola humana |
| Un atributo que cambió con el tiempo se «normaliza» a un valor viejo y el titular queda mal descrito | RF-20: la dependencia rota es duda, no decisión |
| Un umbral inventado deja pasar errores con apariencia de certeza | RF-15: la correlación se mide primero; RF-14: sin confianza declarada, confianza 0 y todo a revisión |
| Una propuesta aplicada sin mirar altera tablas de las que dependen los datos de terceros | RF-28, RF-29, RF-30: barrera, ninguna sentencia sobre lo preexistente, ninguna ruta que ejecute |
| Valores de documentos reales quedan escritos en un transcript o en el repositorio | RF-35, RF-36: corpus fuera de git; las corridas imprimen forma, no contenido |
| Un documento perdido en silencio deja a su titular sin el registro que le correspondía | RF-5, RF-7, RF-8, RF-25: cada documento vuelve con su vía o con su motivo |

**Límite de C5**: sacar estos documentos del perímetro no es un riesgo firmable por el dueño del
corpus: el daño recae sobre terceros que no firmaron. Esta spec no ofrece la vía del registro de
riesgo para ese caso; se rediseña o no se hace.

## Fuera de alcance

- Aplicar la propuesta de modelo a ninguna base. Es gate humano, fuera de este trabajo.
- Elegir el motor por lectura de benchmarks: se elige midiendo, y la medición está en el plan.
- Un servidor de inferencia con lotes continuos (vLLM, SGLang) **instalado y medido con GPU**: no
  hay GPU en el hardware disponible; se documenta como techo y como siguiente paso.
- PaddleOCR-VL: no está publicado en la biblioteca de Ollama a fecha de hoy; se declara no
  medido, no se estima.
- Reanudación de un corpus a medias y cola persistente: la orquestación es libre y vive fuera
  del núcleo; este trabajo entrega el lote en memoria con orden y tiempos.
- Nómina y Carta Porte: siguen como en 007, declarados sin lector.
- Cambiar `AGENTS.md`, un skill o un prompt: es un CDC con su propio gate.

## Criterios de finalización

- **DoF-1**: esta carpeta pasa `npm run verifica:specs`.
- **DoF-2**: una corrida real sobre un corpus con al menos un documento por vía —capa 0, XML,
  motor— con tabla por documento: vía, campos, tiempo.
- **DoF-3**: páginas por minuto por la vía del motor con una y con varias peticiones en vuelo,
  y el ahorro por enrutar fuera del motor, medidos en el hardware disponible.
- **DoF-4**: al menos dos motores autohospedables comparados sobre el mismo corpus con verdad
  conocida: CER, campos correctos, latencia; elección justificada con las cifras.
- **DoF-5**: propuesta inferida del corpus con entidades, atributos con tipo, relaciones con
  cardinalidad observada y dudas; SQL emitido y `revisaSql` sin excepción.
- **DoF-6**: prueba que valida el JSON de salida contra la forma de `CampoExtraido`,
  `PaginaExtraida` y `PropuestaDeModelo` importando desde `dist/`, en verde.
- **DoF-7**: para los documentos del motor, cuántos campos coincidieron con la transcripción y
  cuántos fueron a la cola humana.
- **DoF-8**: `correlacionConfianzaError` medida y su conclusión escrita.
- **DoF-9**: `npm run validate` y `npm run prueba` en verde.
- **DoF-10**: ninguna ruta de este trabajo ejecuta SQL; demostrado por búsqueda en el código.

## Dudas abiertas

- Un valor de relleno con letras (`N/A`, `SIN DATOS`) sí pasa la heurística de forma de RF-18 y,
  si el motor lo repite en dos documentos, fundaría una entidad. El cotejo con la transcripción
  (RF-11) lo frena cuando no está en el papel; cuando **sí** está impreso, queda como entidad
  y hay que verlo en la revisión. Una lista de valores de relleno por dominio sería del
  integrador, no del núcleo.
- Cuántos documentos hacen falta para que una cardinalidad observada sea creíble. Hoy se cuenta
  la evidencia (grupos comprobados) y se deja al humano; un mínimo sería un umbral, y los
  umbrales se miden.
- Si el rendimiento con lote continuo en GPU (vLLM/SGLang) cambia la decisión de motor: sin GPU no
  se puede medir, y la literatura no sustituye a la medición.
- Cómo nombrar las entidades: hoy sale de la clave (`rfc_emisor` → `emisor`) y lo renombra el
  humano. Un catálogo de nombres por dominio es del integrador.
