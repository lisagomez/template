# Spec 015 — Piloto medido del buzón de CFDI recibidos con un despacho contable

> **Origen**: decisión del laboratorio del 2026-10-06 sobre la primera corrida del analista de producto
> (`docs/analisis/2026-10-02/`). Primero va el piloto (P-03), con el buzón de CFDI recibidos (P-01) como
> producto, y después el observatorio de costo (P-02). Entrevista hecha con `/spec-generator` el mismo día.
>
> **Se apoya** en la spec 010 (el extractor en la infraestructura del cliente) y en el buzón único por
> cliente del ERP (5B.2). No los redefine: esta spec cierra el **QUÉ** del piloto, es decir, con quién se
> hace, qué se mide, qué consiente cada parte, qué se borra y qué no se hace. Cómo se monta en la
> infraestructura del despacho va en el plan.
>
> **Aprobada por el laboratorio el 2026-10-06**, con las cinco dudas de abajo abiertas. La primera (si el
> proceso manual corre duplicado) se resuelve antes de la primera medición.

## Contexto y objetivo

Ningún producto del portafolio tiene medido el costo del dolor que promete resolver, ni un primer
cliente. Por eso el ranking del analista premia lo único que se mide hoy, que es lo interno. El piloto
convierte en una cifra la hipótesis del buzón de CFDI: cuántas horas al mes le cuesta a un despacho
contable real capturar a mano los CFDI recibidos de cada pyme que lleva, cuántas le cuesta con el buzón,
y cuántos CFDI quedan pendientes al cierre. Al terminar, el contrato del producto tiene su «Costo actual»
con cifra y fuente, o el laboratorio sabe con datos que el dolor no era el que creía. Lo que se quiere
saber es una sola cosa: si leer los CFDI recibidos sin teclearlos le ahorra tiempo al despacho sin meter
errores en la contabilidad de sus clientes.

## Usuarios / actores

- **El laboratorio**: elige el despacho, acompaña el piloto, recibe solo cifras agregadas y decide qué
  sigue.
- **El despacho contable**: lleva la contabilidad de varias pymes mexicanas. Firma el acuerdo del piloto,
  consigue el consentimiento de cada pyme, registra el tiempo de captura y confirma cada CFDI antes de
  contabilizarlo.
- **La persona del despacho que opera el buzón**: sube los documentos y revisa lo dudoso.
- **Las pymes clientes del despacho**: son las dueñas de sus CFDI recibidos y entran solo si consienten.
- **Los proveedores que emitieron cada CFDI**: terceros que no eligieron estar aquí.

## Historias de usuario

- H1: Como laboratorio quiero medir en un despacho real cuántas horas al mes cuesta capturar los CFDI
  recibidos, para que el contrato del buzón tenga un costo con cifra y fuente.
- H2: Como despacho quiero subir una vez los CFDI recibidos de una pyme y recibirlos leídos y cotejados,
  para dejar de teclearlos.
- H3: Como contador quiero confirmar cada CFDI antes de que se contabilice, porque respondo de la
  contabilidad de mi cliente.
- H4: Como pyme quiero decidir si mis comprobantes entran al piloto y poder salirme, para que no se haga
  nada con ellos sin mi permiso.
- H5: Como despacho quiero poder parar el piloto en cualquier momento sin que se me quede el cierre a
  medias.

## Requisitos funcionales (criterios de aceptación en EARS)

**Consentimiento**

- RF-1: EL SISTEMA leerá únicamente los CFDI de las pymes cuyo consentimiento escrito conste registrado
  antes de su primera lectura.
- RF-2: SI llega un documento de una pyme sin consentimiento registrado, ENTONCES EL SISTEMA no lo leerá
  y avisará al despacho.
- RF-3: CUANDO una pyme retire su consentimiento, EL SISTEMA dejará de leer sus documentos.
- RF-4: CUANDO una pyme retire su consentimiento, EL SISTEMA borrará todo lo que el piloto generó con sus
  documentos.
- RF-5: CUANDO una pyme retire su consentimiento, EL SISTEMA la excluirá de las cifras agregadas.

**Perímetro**

- RF-6: EL SISTEMA no sacará de la infraestructura del despacho ningún CFDI, ningún dato leído de un CFDI
  ni ningún archivo derivado de uno.
- RF-7: EL SISTEMA no usará ningún servicio de lectura que corra fuera de la infraestructura del despacho.
- RF-8: EL SISTEMA entregará al laboratorio solo cifras agregadas por pyme anonimizada y por mes: horas de
  captura, número de CFDI recibidos y proporción de CFDI pendientes al cierre.

**Lectura y cotejo**

- RF-9: CUANDO un CFDI recibido llegue con su XML, EL SISTEMA tomará los datos del XML y no de su
  representación impresa ni de una imagen.
- RF-10: CUANDO un comprobante llegue sin XML, EL SISTEMA devolverá cada campo con su confianza y la
  evidencia de la que sale esa confianza.
- RF-11: SI la única evidencia de un campo es la lectura de una imagen, ENTONCES EL SISTEMA lo marcará
  para revisión humana.
- RF-12: SI el receptor de un CFDI no es la pyme del buzón al que llegó, ENTONCES EL SISTEMA no lo
  aceptará en ese buzón y lo marcará para revisión humana.
- RF-13: SI llega un CFDI cuyo folio fiscal ya está en el buzón, ENTONCES EL SISTEMA no lo duplicará y
  avisará del repetido.
- RF-14: SI el XML y la representación impresa de un mismo CFDI no coinciden, ENTONCES EL SISTEMA
  conservará los datos del XML y marcará la discrepancia para revisión humana.
- RF-15: EL SISTEMA dirá en cada CFDI leído que su sello no se verificó.

**Contabilización**

- RF-16: EL SISTEMA no contabilizará ningún CFDI sin la confirmación explícita de una persona del
  despacho.
- RF-17: MIENTRAS un CFDI tenga algún campo marcado para revisión humana, EL SISTEMA no permitirá
  confirmarlo para contabilizar.

**Proveedores**

- RF-18: CUANDO un proveedor aparezca en una lista publicada por el SAT, EL SISTEMA mostrará la bandera
  con su fuente y la fecha de la lista consultada.
- RF-19: EL SISTEMA no presentará una bandera de proveedor como veredicto sobre el CFDI ni sobre el
  proveedor.

**Medición**

- RF-20: EL SISTEMA medirá las horas de captura de CFDI recibidos por pyme y por mes, con el mismo
  registro el mes anterior al piloto y el mes del piloto.
- RF-21: EL SISTEMA no registrará qué persona hizo cada captura.
- RF-22: CUANDO cierre el mes del piloto, EL SISTEMA calculará por pyme la proporción de CFDI recibidos
  que quedaron sin confirmar.
- RF-23: CUANDO cierre el piloto con la medición completa, EL SISTEMA dejará en el contrato del producto
  el «Costo actual» con la cifra medida y su fuente.
- RF-24: SI al cerrar el piloto ninguna pyme tiene completos los dos meses de registro, ENTONCES EL
  SISTEMA dejará el «Costo actual» como «desconocido», con el motivo.

**Parar sin dejar el cierre a medias**

- RF-25: EL SISTEMA permitirá al despacho parar el piloto en cualquier momento.
- RF-26: CUANDO el despacho pare el piloto, EL SISTEMA dejará cada CFDI del mes en curso o confirmado en
  la contabilidad o devuelto a captura manual, sin ninguno perdido.

**Cierre y borrado**

- RF-27: CUANDO el piloto termine o se pare, EL SISTEMA borrará en la infraestructura del despacho todo lo
  que el piloto generó: copias, lecturas, colas de revisión y registros con datos.
- RF-28: EL SISTEMA no modificará ni borrará los CFDI originales del despacho.
- RF-29: CUANDO termine un borrado, EL SISTEMA dejará constancia de qué se borró y cuándo, sin datos de
  las pymes ni de los proveedores.
- RF-30: EL SISTEMA conservará en el laboratorio únicamente las cifras agregadas del RF-8.

## Requisitos no funcionales

- **Duración**: un mes de medición previa y un mes de piloto, como plantea el one-pager P-03.
- **Un solo despacho**: el segundo dispara la salida de `service_role` (C7, D-16) y deja de ser un piloto.
- **Sin umbrales de confianza de antemano**: no vienen puestos y son obligatorios, así que se miden sobre
  el corpus real del despacho. Hasta medirlos, rige el RF-11.
- **Tiempo de lectura**: no se promete, se mide. En CPU, el OCR medido ronda los 110 s por página, y el
  XML no pasa por OCR.
- **Idioma**: lo que vean el despacho y las pymes, en español.

## Casos límite

- Una pyme sin CFDI recibidos en un mes: cuenta con cero horas y cero CFDI, no como falta de datos.
- Un XML mal formado o con un complemento que el proyecto no registró: va a revisión humana y no se
  adivina.
- Un CFDI cancelado ante el SAT se lee igual que uno vigente, porque el piloto no consulta su estatus
  (RF-7). Lo cubre el RF-16: nadie lo contabiliza sin confirmarlo.
- Una foto ilegible: todos sus campos van a revisión humana.
- Un documento que no es un CFDI (una nota, un ticket): no entra al buzón como CFDI y se avisa.
- Una pyme que retira su consentimiento a mitad de mes: sus documentos salen (RF-3, RF-4) y no cuenta en
  la medición (RF-5).
- El despacho deja de registrar tiempo varios días: el mes de esa pyme queda incompleto y no cuenta para
  el RF-23.

## Impacto sobre terceros (control C4)

| Parte afectada | Daño con el piloto funcionando bien | Qué lo mitiga |
|---|---|---|
| Las pymes del despacho | Un dato mal leído o mal cotejado se contabiliza y les mueve impuestos: es dinero ajeno | RF-16 y RF-17: nada se contabiliza sin confirmación, y lo dudoso no se puede confirmar sin revisarlo; RF-9: manda el XML |
| Las pymes que no consintieron | Sus comprobantes pasan por una herramienta en prueba sin saberlo | RF-1 y RF-2: sin consentimiento escrito no se lee nada |
| Los proveedores emisores | Una bandera del SAT o un cotejo fallido los señala ante su cliente | RF-18 y RF-19: la bandera va con su fuente y nunca como veredicto |
| Toda persona que aparece en un CFDI | Sus datos salen del despacho | RF-6, RF-7 y RF-8: nada sale del perímetro, salvo cifras agregadas |
| El despacho | El piloto falla a mitad de mes y se le queda el cierre a medias | RF-25 y RF-26 |
| Los empleados del despacho | El laboratorio no lo marcó como daño, pero un registro de tiempo por persona serviría para evaluar a cada uno | RF-21: el registro es por pyme, nunca por persona |

Todos estos daños recaen sobre quien no firma el piloto: las pymes, los proveedores y las personas que
aparecen en los CFDI. **Ninguna firma del despacho ni del laboratorio los autoriza.** Por eso se
rediseñaron en vez de aceptarse como riesgo: lo que no se puede mitigar baja a «Fuera de alcance».

## Fuera de alcance

- Descargar los CFDI del SAT con las credenciales del cliente (P-07, vetado: exige custodiar la e.firma o
  la CIEC de terceros).
- Verificar el sello o consultar el estatus de un CFDI ante el SAT: leer bien no es autenticar, y
  consultar sacaría datos del perímetro.
- Emitir CFDI.
- Contabilizar sin confirmación humana.
- Procesar documentos fuera de la infraestructura del despacho.
- Registrar el tiempo por persona.
- Cobrar el piloto o venderlo.
- Un segundo despacho (ver «Un solo despacho»).
- Elegir el despacho: lo hace el laboratorio.
- Seguir usando el buzón después del piloto: es otra decisión, con contrato firmado.
- Conectar un canal de chat externo (exige C3 y C4 propios).

## Criterios de finalización

- Todos los RF con prueba en verde sobre un corpus sintético antes de entrar al despacho, y una demo del
  flujo completo: consentimiento, lectura, revisión, confirmación, cierre y borrado.
- Antes del primer documento real: acuerdo del piloto firmado con el despacho, consentimiento escrito de
  al menos una pyme, AISIA del piloto firmada (C4) y modelo de amenazas en el plan (C3).
- Al cierre:
  - cifras agregadas entregadas al laboratorio;
  - constancia de cada borrado;
  - contrato del producto con su «Costo actual», con cifra y fuente (RF-23) o «desconocido» con el motivo
    (RF-24).

## Dudas abiertas

- [NECESITA ACLARACIÓN] **¿El proceso manual corre duplicado o queda de respaldo?** En la entrevista se
  eligió que «el proceso manual sigue en paralelo todo el piloto». Si el despacho captura todo a mano
  también, las horas del mes del piloto no miden el buzón. La alternativa es que el manual esté listo
  para retomarse en cualquier momento (RF-25 y RF-26) sin hacerse en doble.
- [NECESITA ACLARACIÓN] ¿En qué plazo se borra lo generado al retirar un consentimiento (RF-4) y al cerrar
  el piloto (RF-27)?
- [NECESITA ACLARACIÓN] ¿Basta una pyme con los dos meses completos para que la cifra cuente (RF-23), o
  hace falta un mínimo de pymes o de CFDI?
- [NECESITA ACLARACIÓN] ¿Qué contrato recibe el «Costo actual»: el del Extractor documental, el del ERP
  agéntico o los dos? El buzón cambia los dos.
- [NECESITA ACLARACIÓN] ¿Qué tiene que poner el despacho? Si no tiene equipo ni servidor propio, ¿se
  descarta o el laboratorio le facilita uno que quede bajo su control?
