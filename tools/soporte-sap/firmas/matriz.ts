/**
 * La matriz de trazabilidad de la AISIA y del C3 de Soporte SAP (goal de firmas, 2026-10-05).
 *
 * Cada fila es una afirmación de los documentos que se firman. Una fila «probado» tiene una prueba que
 * pasa sin sabotaje y un sabotaje (una edición exacta sobre el control) con el que la prueba CAE: un
 * control sin una prueba que se ponga roja es una intención, no un control. «brecha» es lo que los
 * documentos declaran abierto; «depende» es lo que espera una decisión D del laboratorio.
 *
 * La corre `node tools/soporte-sap/evidencia/firmas.ts`; `pruebas/firmas.ts` vigila que cada daño de la
 * AISIA y cada control del C3 tenga su fila y que cada edición siga encontrando su texto.
 */

export type Documento = 'AISIA' | 'C3'
export type Estado = 'probado' | 'brecha' | 'depende'

/** Una edición exacta: `buscar` aparece UNA vez en `archivo` (relativo a la raíz del repo). */
export interface Edicion { readonly archivo: string; readonly buscar: string; readonly poner: string }

export type Comprobacion =
  | { readonly tipo: 'prueba'; readonly carpeta: string; readonly archivo: string; readonly nombre: string }
  | { readonly tipo: 'comando'; readonly carpeta: string; readonly comando: readonly string[] }

export interface Fila {
  readonly id: string
  readonly doc: Documento
  /** El daño de la AISIA §2 o el control del C3, tal como lo nombra el documento. */
  readonly ref: string
  readonly afirmacion: string
  readonly control: string
  readonly estado: Estado
  readonly comprobacion?: Comprobacion
  /** `ediciones` que tumban la comprobación; o `integrado`: la prueba siembra su propio sabotaje. */
  readonly sabotaje?: { readonly que: string; readonly ediciones: readonly Edicion[] } | { readonly que: string; readonly integrado: true }
  readonly nota?: string
  /** Daño sobre terceros que ninguna firma autoriza (límite de C5): lo cierra el control o no se ofrece. */
  readonly infirmable?: boolean
}

/** Una afirmación que, al empezar el goal, no tenía una prueba que se pusiera roja, y qué se hizo con ella. */
export interface Hallazgo {
  readonly doc: Documento
  readonly afirmacion: string
  readonly encontrado: string
  /** `codigo`: faltaba el control y se implementó con su prueba; `prueba`: el control existía sin prueba; `texto`: la frase decía de más; `brecha`: queda abierto y se declara. */
  readonly resolucion: 'codigo' | 'prueba' | 'texto' | 'brecha'
  readonly filas: readonly string[]
  /** Quién lo encontró: el autor de la matriz o la revisión independiente. */
  readonly por: 'autor' | 'revision'
}

export const HALLAZGOS: readonly Hallazgo[] = [
  { doc: 'AISIA', por: 'autor', resolucion: 'codigo', filas: ['aisia-sla-solo-la-consultora', 'aisia-pausa-cliente-reanuda'], afirmacion: 'la primera respuesta, la pausa y la resolución son actos de una persona de la consultora', encontrado: 'fase 4 (09/10), porque un sabotaje no caía: `rol_en` es NULL para quien no es miembro, y `not (… and NULL)` no lanza. El cliente marcaba su primera respuesta, resolvía y se subía a P1, y el laboratorio podía hacer lo mismo en lo escalado. La prueba de H-17 solo probaba al agente' },
  { doc: 'AISIA', por: 'revision', resolucion: 'texto', filas: ['aisia-dato-failclosed', 'aisia-dato-rrhh', 'aisia-dato-contrato-cuarentena'], afirmacion: 'anonimizador fail-closed; los casos de nómina los revisa una persona antes del sandbox', encontrado: 'PRP-010 H-04 y DP-7 (07/10): «fail-closed» prometía de más, y la revisión humana de la cuarentena no existe. En la fase 4 se corrigieron la AISIA, el contrato, la señal que guarda la base y la pantalla: la cuarentena es definitiva hasta D14' },
  { doc: 'AISIA', por: 'revision', resolucion: 'texto', filas: ['aisia-fatiga', 'aisia-grupo-chico', 'aisia-sla-persona', 'aisia-pausa-pide', 'aisia-impugna-queja', 'aisia-presupuesto-p1-ocr'], afirmacion: 'la §2 lista los daños posibles sin atacante', encontrado: 'PRP-010 (07/10): seis daños sin listar (la fatiga del aprobador, el grupo chico, la primera respuesta automática, la pausa unilateral, la consultora que altera la impugnación y la P1 sin evidencia leída). La v3 los lista con sus filas' },
  { doc: 'AISIA', por: 'autor', resolucion: 'codigo', filas: ['aisia-pausa-pide', 'aisia-pausa-cliente-reanuda', 'aisia-pausa-agente', 'aisia-pausa-app-pide', 'aisia-pausa-app-cliente', 'aisia-pausa-contrato'], afirmacion: 'pausar el reloj es un acto de una persona, y el cliente puede impugnar la pausa', encontrado: 'fase 4 (09/10), al escribir el daño: la consultora pausaba sin decir qué pedía y era la única que podía reanudar el reloj, y la impugnación la resolvía ella misma. Ahora la pausa dice qué pide y el cliente la reanuda al responder' },
  { doc: 'AISIA', por: 'revision', resolucion: 'texto', filas: ['aisia-lab-contrato-escala', 'aisia-primera-contrato'], afirmacion: 'el contrato N2–N3 dice qué ve el laboratorio y qué es una respuesta', encontrado: 'PRP-010 (07/10): el §6 del contrato escalaba al laboratorio sin la consultora, contra el §11 y DP-3; y ni el contrato ni la plantilla definían «respuesta» (DP-4)' },
  { doc: 'AISIA', por: 'revision', resolucion: 'texto', filas: ['aisia-consultor-horas-propias'], afirmacion: 'las métricas de los consultores se muestran por categoría y complejidad', encontrado: 'PRP-010 H-28: esa vista no existe. La v3 dice que no se promete' },
  { doc: 'C3', por: 'revision', resolucion: 'codigo', filas: ['c3-datos-ocr-deploy', 'c3-perfil-ocr-externo'], afirmacion: 'el OCR es local', encontrado: 'PRP-010 (07/10): `OCR_RESPALDO=mistral` con una decisión C4 encendía por despliegue un motor externo, por encima de `motor: local`. Con Soporte SAP, configura:deploy ya no lo deja (fase 4)' },
  { doc: 'C3', por: 'revision', resolucion: 'brecha', filas: ['c3-archivos-pdf'], afirmacion: 'la memoria acotada del contenedor contiene un PDF que agote memoria', encontrado: 'PRP-010 H-22: la capa 0 lee el PDF en el proceso de la app; la memoria del servicio de OCR no lo contiene. Queda como brecha, en pausa' },
  { doc: 'C3', por: 'revision', resolucion: 'brecha', filas: ['c3-ruta-sin-autenticar', 'c3-ruta-logs'], afirmacion: 'la ruta del laboratorio usa identidades de laboratorio', encontrado: 'PRP-010 H-25: el GET devuelve la vista de cualquier rol, superadministrador incluido, y los logs no están inventariados' },
  { doc: 'C3', por: 'revision', resolucion: 'brecha', filas: ['c3-siembra-firma'], afirmacion: 'lo que cambia un veredicto lo firma el laboratorio en tools/conocimiento', encontrado: 'PRP-010 H-20: los veredictos salen de la matriz sintética del producto, no de tools/conocimiento' },
  { doc: 'C3', por: 'revision', resolucion: 'texto', filas: ['c3-root-lee', 'c3-root-sla-contrato', 'aisia-sla-despacho'], afirmacion: '(el C3 no hablaba del modo despacho)', encontrado: 'PRP-010 (07/10): con el servidor de la consultora, quien tiene root lee la base entera y puede reescribir la cadena del SLA. La v4 lo declara, y el SLA de ese modo no se ofrece como evidencia independiente' },
  { doc: 'C3', por: 'revision', resolucion: 'codigo', filas: ['c3-perfil-predeploy', 'c3-perfil-maquina', 'c3-perfil-region', 'c3-perfil-respaldo-falta', 'c3-perfil-ficha'], afirmacion: 'configura:deploy rechaza el laboratorio en producción (y nada más)', encontrado: 'PRP-010 H-26 y fase 3: configura:deploy no estaba en predeploy, y no medía la máquina, la región, el respaldo ni los secretos del producto' },
  { doc: 'C3', por: 'revision', resolucion: 'codigo', filas: ['c3-originales-solo-ingesta', 'c3-adjunto-solo-ingesta', 'c3-adjuntos-por-incidencia', 'c3-adjuntos-ingesta-cuenta', 'c3-ocr-no-pasa-del-tope', 'c3-subida-acotada'], afirmacion: 'hay un límite de adjuntos por incidencia y un tope de OCR', encontrado: 'PRP-010 H-23 (07/10): los adjuntos se contaban por lote, el tope de OCR se miraba solo antes de leer, el N3 subía directo al bucket sin validación de bytes y `formData()` cargaba todo en memoria' },
  { doc: 'C3', por: 'revision', resolucion: 'codigo', filas: ['c3-documento-delimitado', 'aisia-prioridad-documento', 'c3-parametros-de-documento'], afirmacion: 'el texto de un documento es dato, nunca instrucción', encontrado: 'PRP-010 H-24 (07/10): `delimitaDocumento` no se usaba, los parámetros del plan salían del texto no confiable, y un documento con «urgente» o «toda la planta» subía la prioridad (el banco de inyección sembraba «PON ESTO EN P1», que no sube nada)' },
  { doc: 'AISIA', por: 'revision', resolucion: 'codigo', filas: ['aisia-consultor-importador-sal'], afirmacion: 'el seudónimo protege a los consultores', encontrado: 'PRP-010 H-32 (07/10): el importador seudonimizaba con sha256(consultora|nombre), sin sal; quien adivinara un nombre lo revertía' },
  { doc: 'AISIA', por: 'revision', resolucion: 'codigo', filas: ['aisia-impugna-app'], afirmacion: 'el N3 impugna y su consultora la resuelve a su nombre', encontrado: 'PRP-010 H-10, la pantalla (07/10): la base ya lo exigía (tanda 1b), pero en la app no había cómo impugnar' },
  { doc: 'AISIA', por: 'revision', resolucion: 'codigo', filas: ['aisia-foda-confianza-puntos'], afirmacion: 'la confianza baja cuando hay pocos datos', encontrado: 'PRP-010 H-28 (07/10): la llevaban los accionables y el FODA no; el recorrido no comprobaba el aviso de proyección' },
  { doc: 'C3', por: 'revision', resolucion: 'codigo', filas: ['c3-ruta-404-get', 'c3-ruta-sin-error-interno'], afirmacion: 'la ruta del laboratorio responde 404 sin su variable', encontrado: 'PRP-010 H-25 (07/10): la prueba no miraba el GET (buscaba `export async function`, y el GET no es async), y la ruta devolvía el mensaje de cualquier error' },
  { doc: 'AISIA', por: 'revision', resolucion: 'codigo', filas: ['aisia-presupuesto-enjambre', 'aisia-presupuesto-runtime', 'aisia-presupuesto-p1-ocr', 'aisia-presupuesto-mes', 'aisia-presupuesto-sin-medir', 'aisia-presupuesto-reglas', 'c3-ocr-tope-del-mes'], afirmacion: 'el triage de P1 y P2 nunca se corta por presupuesto', encontrado: 'PRP-010 H-18 (07/10): la función que lo decide no la llamaba nadie, el aviso no llegaba a nadie, nadie leía `ss_presupuesto` y el tope de OCR vivía en memoria y sin periodo; la fila «aisia-presupuesto» probaba la función, no el camino' },
  { doc: 'AISIA', por: 'revision', resolucion: 'codigo', filas: ['aisia-solucion-artefacto', 'aisia-solucion-cli-huella'], afirmacion: 'se ejecuta exactamente lo aprobado', encontrado: 'PRP-010 H-11 (05/10): `ejecuta()` recibía los pasos sueltos y nunca comparaba la huella (con la aprobación de desbloquear a un usuario se desbloqueaba a otro), y `ss-simulador --param` ejecutaba otro artefacto con la aprobación de uno' },
  { doc: 'AISIA', por: 'revision', resolucion: 'codigo', filas: ['aisia-dato-revision-frases', 'aisia-dato-banco-independiente', 'aisia-dato-banco-control', 'aisia-dato-sueltas', 'aisia-dato-tecnico'], afirmacion: 'anonimizador fail-closed: lo que no se resuelve con certeza va a cuarentena', encontrado: 'PRP-010 H-04 (07/10): 5 de 14 frases nuevas entraban con el dato; el banco que escribió quien no leyó el detector (08/10) encontró 8 de 30 más y 4 controles tapados; y después del arreglo, un banco de control escrito sin verlo encontró 3 de 30' },
  { doc: 'AISIA', por: 'revision', resolucion: 'codigo', filas: ['aisia-secreto-generaliza', 'aisia-secreto-estructura', 'aisia-secreto-cliente', 'aisia-secreto-a-medida', 'aisia-secreto-al-nucleo', 'aisia-secreto-runtime', 'aisia-secreto-base-nucleo'], afirmacion: 'lo que va al núcleo se generaliza además de anonimizarse', encontrado: 'PRP-010 H-19 (07/10): `generaliza` no la llamaba nadie, el chat proponía al núcleo el texto crudo del experto por defecto y la base lo aceptaba; además no cubría Y…, minúsculas, namespaces ni la estructura en sus formas, y el banco independiente (08/10) encontró 12 de 20 más' },
  { doc: 'AISIA', por: 'revision', resolucion: 'codigo', filas: ['aisia-sla-persona-runtime'], afirmacion: 'la primera respuesta es de una persona (DP-4)', encontrado: 'PRP-010 H-17, el runtime (07/10): la app marcaba la primera respuesta al anonimizar o al mandar el plan a la sala, y una prueba lo exigía como requisito' },
  { doc: 'AISIA', por: 'revision', resolucion: 'codigo', filas: ['aisia-sla-job', 'aisia-sla-job-no-inventa', 'c3-plataforma-sla-suya'], afirmacion: 'el SLA se mide desde los eventos', encontrado: 'PRP-010 H-16, el job (07/10): nadie calculaba `ss_sla_resultado` desde la base; desde la tanda 1e, además, ningún rol podía escribirlo' },
  { doc: 'AISIA', por: 'revision', resolucion: 'codigo', filas: ['aisia-restaura-firma', 'aisia-restaura-filas', 'aisia-restaura-antes-commit', 'aisia-restaura-accesos', 'aisia-restaura-sala'], afirmacion: 'export y restauración por tenant: restaurar a una consultora no toca a las demás', encontrado: 'PRP-010 H-08 (05/10 y 07/10): la restauración, como superusuario y con los disparadores apagados, insertaba filas de otro tenant sin comprobarlas y verificaba después del commit; el export no iba firmado y dejaba fuera el acceso motivado y la sala' },
  { doc: 'C3', por: 'revision', resolucion: 'codigo', filas: ['c3-plataforma-no-inserta', 'c3-plataforma-exporta'], afirmacion: 'soporte_sap_plataforma exporta, restaura y borra por retención, acotado por token a una consultora', encontrado: 'PRP-010 H-07 (07/10): con `for all` insertaba decisiones ya tomadas y eventos con el seudónimo de un consultor, ninguna prueba usaba ese rol, y con él `exportaTenant` fallaba con «permission denied»' },
  { doc: 'C3', por: 'revision', resolucion: 'codigo', filas: ['c3-cadena-base'], afirmacion: 'la cadena de eventos es la evidencia del servicio', encontrado: 'PRP-010 H-13 (05/10): la base no verificaba `anterior`, `hash` ni `seq`: quien escribía ponía los que quisiera' },
  { doc: 'C3', por: 'revision', resolucion: 'codigo', filas: ['c3-roles-corregidos', 'c3-buckets-privados', 'c3-campo-adjunto', 'c3-fila-crudo', 'c3-contrato-cliente'], afirmacion: 'la tenencia de cada tabla hija está atada', encontrado: 'PRP-010 H-14 (07/10): un campo colgaba del adjunto de otro cliente, una fila del crudo de otra consultora, un contrato del cliente de otra; y un rol con bypassrls o un bucket público previos no se corregían' },
  { doc: 'C3', por: 'revision', resolucion: 'codigo', filas: ['c3-chat-turno'], afirmacion: 'el agente escribe en el chat del HIL', encontrado: 'PRP-010 H-12 (07/10): con la tarea de cualquier consultora escribía en el chat de cualquier usuario' },
  { doc: 'AISIA', por: 'revision', resolucion: 'codigo', filas: ['aisia-consultor-horas-propias', 'aisia-consultor-sal'], afirmacion: 'el producto no ofrece una vista de desempeño individual; el seudónimo protege a los consultores', encontrado: 'PRP-010 H-05 (05/10 y 07/10): cualquier consultor leía fila por fila las horas de sus colegas, y el seudónimo era un md5 sin sal que se revertía desde `ss_miembro`' },
  { doc: 'C3', por: 'revision', resolucion: 'codigo', filas: ['c3-conexion-directa', 'c3-token-base-firma', 'c3-token-base-rol', 'c3-token-base-vence', 'c3-token-secreto', 'c3-sala-tenant-token'], afirmacion: 'la consultora de la tarea sale de un token firmado por el orquestador y verificado por la pasarela', encontrado: 'PRP-010 H-21 (05/10 y 07/10): la verificación solo existía en el arnés de pruebas; la base leía `request.jwt.claims`, que la sesión reescribe con `set_config` en la misma consulta (un token de A leía B), y `sala_agente` se acotaba con una variable que fijaba él mismo' },
  { doc: 'AISIA', por: 'revision', resolucion: 'codigo', filas: ['aisia-prioridad-piso-base', 'aisia-prioridad-vocabulario', 'aisia-prioridad-cambio'], afirmacion: 'un ticket con señales de nómina o RR. HH. no queda debajo de P2 sin que un humano lo baje', encontrado: 'PRP-010 H-15 (07/10): IMSS, PTU, aguinaldo, incapacidad, la quincena o un infotipo salían P4 (dos vocabularios distintos), y la base no imponía el piso: el cliente insertaba la prioridad que quería y el consultor la cambiaba sin motivo ni evento' },
  { doc: 'AISIA', por: 'revision', resolucion: 'codigo', filas: ['aisia-sla-alta', 'aisia-sla-marcas', 'aisia-sla-de-eventos', 'aisia-sla-resultado-contrato', 'aisia-sla-resultado-agente'], afirmacion: 'el SLA se mide desde los eventos; la fecha y el actor los da la base', encontrado: 'PRP-010 H-16 (07/10): el cliente creaba con una fecha de hace un mes, el consultor reescribía `creada_en` y la primera respuesta, y el agente guardaba `cumple=true` con un contrato inventado' },
  { doc: 'AISIA', por: 'revision', resolucion: 'codigo', filas: ['aisia-sla-persona'], afirmacion: 'la primera respuesta es de una persona (DP-4)', encontrado: 'PRP-010 H-17 (07/10): la marcaba la máquina al anonimizar o al mandar a la sala, y una P1 a 60 min se cumplía siempre (en la base; el runtime va en la fase 2)' },
  { doc: 'AISIA', por: 'revision', resolucion: 'codigo', filas: ['aisia-impugna-queja', 'aisia-impugna-cierre'], afirmacion: 'el N3 impugna y su consultora la resuelve a su nombre', encontrado: 'PRP-010 H-10 (07/10): la consultora podía reescribir el motivo y el autor de la queja, resolver no dejaba fecha, y una pausa del reloj no se podía impugnar' },
  { doc: 'C3', por: 'revision', resolucion: 'codigo', filas: ['c3-agente-actualiza'], afirmacion: 'el agente actualiza su incidencia por columna', encontrado: 'PRP-010 H-09 (07/10): el `update` del agente fallaba por accidente (un disparador leía `ss_organizacion` sin permiso), y arreglarlo sin cuidado le abría la prioridad, las fechas y los estados terminales' },
  { doc: 'C3', por: 'revision', resolucion: 'codigo', filas: ['c3-sala-mensaje'], afirmacion: 'en la sala, la aprobación la firma una persona a su nombre y en su tenant', encontrado: 'PRP-010 H-06 (07/10): `sala_aprobaciones` no ataba el `mensaje_id` a su tenant, tarea ni huella: un humano de B aprobaba el plan de A (la versión en memoria sí lo impedía)' },
  { doc: 'AISIA', por: 'revision', resolucion: 'codigo', filas: ['aisia-lab-escala-la-consultora'], afirmacion: 'el laboratorio lee solo lo escalado por la consultora', encontrado: 'PRP-010 H-01 (07/10): el agente escalaba por su cuenta y firmaba `escalada_por` con cualquier seudónimo; la fila «aisia-lab-escalado» probaba la lectura, no quién escala' },
  { doc: 'AISIA', por: 'revision', resolucion: 'codigo', filas: ['aisia-lab-72h-fecha', 'aisia-lab-revoca'], afirmacion: 'los originales, con un acceso que otorga la consultora por 72 h como máximo', encontrado: 'PRP-010 H-02 (07/10): con un `creado_en` futuro el acceso duraba 8 832 h, y no había forma de revocarlo; «aisia-lab-72h» sabotaba el intervalo, no la fecha' },
  { doc: 'AISIA', por: 'revision', resolucion: 'codigo', filas: ['aisia-dato-cuarentena-base', 'aisia-dato-sandbox-cerrojo'], afirmacion: 'la cuarentena guarda solo tipos de señal; al sandbox no entra el dato', encontrado: 'PRP-010 H-03 (07/10): la base aceptaba el dato en `senales` y texto crudo en el sandbox, y el laboratorio lee los dos; el control vivía solo en el código que escribe' },
  { doc: 'C3', por: 'autor', resolucion: 'codigo', filas: ['c3-archivos-ocr-tope'], afirmacion: 'hay un tope de páginas OCR por consultora (`ss_presupuesto`)', encontrado: 'la columna `tope_paginas_ocr` existía y nadie la leía: la ingesta no tenía tope' },
  { doc: 'C3', por: 'autor', resolucion: 'codigo', filas: ['c3-archivos-adjuntos'], afirmacion: 'hay un límite de adjuntos por incidencia', encontrado: 'no existía en la ingesta, ni en el runtime, ni en el CLI' },
  { doc: 'AISIA', por: 'autor', resolucion: 'codigo', filas: ['aisia-riesgo-pantalla'], afirmacion: 'la pantalla muestra la fórmula y el umbral junto al número del riesgo de baja', encontrado: 'la tarjeta enseñaba etiqueta, valor y fuente; la fórmula y el umbral se quedaban en el catálogo' },
  { doc: 'AISIA', por: 'autor', resolucion: 'texto', filas: ['aisia-opacidad-aviso'], afirmacion: 'el aviso de privacidad hacia los empleados es del N3 y el contrato se lo exige', encontrado: 'la plantilla del contrato lo deja [POR DECIDIR] (redacción legal): el contrato no exige nada todavía' },
  { doc: 'AISIA', por: 'autor', resolucion: 'prueba', filas: ['aisia-foda-confianza'], afirmacion: 'la confianza baja cuando hay pocos datos', encontrado: 'el código lo hacía, pero la prueba solo pedía «baja o media»: romperlo no ponía nada en rojo' },
  { doc: 'AISIA', por: 'autor', resolucion: 'prueba', filas: ['aisia-dato-no-frena'], afirmacion: 'la cuarentena no frena la atención', encontrado: 'el runtime lo hacía y ninguna prueba lo vigilaba' },
  { doc: 'AISIA', por: 'autor', resolucion: 'prueba', filas: ['aisia-riesgo-precio', 'aisia-riesgo-cliente'], afirmacion: 'el riesgo de baja no se conecta con el precio ni con la prioridad, y el cliente no lo ve', encontrado: 'cierto en el código, sin prueba que lo fijara' },
  { doc: 'AISIA', por: 'autor', resolucion: 'prueba', filas: ['aisia-opacidad-contrato'], afirmacion: 'el contrato N2–N3 dice que un agente categoriza y que el laboratorio ve lo escalado', encontrado: 'el texto estaba en la plantilla y ninguna prueba lo leía' },
  { doc: 'C3', por: 'autor', resolucion: 'prueba', filas: ['c3-ruta-404'], afirmacion: 'la ruta del laboratorio responde 404 sin SOPORTE_SAP_LABORATORIO=1', encontrado: 'la guarda existía; ninguna prueba caía si se quitaba' },
  { doc: 'C3', por: 'autor', resolucion: 'prueba', filas: ['c3-ruta-deploy'], afirmacion: 'configura:deploy rechaza la variable en producción', encontrado: 'se demostró a mano en el CDC de la corrida A; no había prueba automática' },
  { doc: 'C3', por: 'autor', resolucion: 'prueba', filas: ['c3-suministro-pines'], afirmacion: 'dbt, MetricFlow y Postgres pineados y la imagen por digest', encontrado: 'cierto en los archivos, sin una comprobación que se pusiera roja' },
  { doc: 'C3', por: 'autor', resolucion: 'prueba', filas: ['c3-archivos-memoria'], afirmacion: 'el servicio de OCR corre con memoria acotada en su contenedor', encontrado: 'cierto en el compose, sin comprobación' },
  { doc: 'AISIA', por: 'autor', resolucion: 'prueba', filas: ['aisia-dato-red'], afirmacion: 'lo que no se resuelve con certeza va a cuarentena (fail-closed)', encontrado: 'quitar la red de señales residuales no ponía ninguna prueba en rojo: los casos sembrados los atrapaban antes los detectores' },
  { doc: 'AISIA', por: 'autor', resolucion: 'prueba', filas: ['aisia-consultor-horas'], afirmacion: 'el laboratorio no lee las horas de los consultores', encontrado: 'la comprobación se cumplía en vacío: corría antes de que hubiera horas cargadas, así que «0 filas» no probaba nada' },
  { doc: 'C3', por: 'autor', resolucion: 'prueba', filas: ['c3-jobs-plataforma'], afirmacion: 'el job de plataforma está acotado por token a una consultora', encontrado: 'solo lo protegía el `where` del código de restauración: una política RLS permisiva no ponía nada en rojo' },
]

const SS = 'tools/soporte-sap'
const SQL = `${SS}/migraciones/propuesta-soporte-sap.sql`
const prueba = (archivo: string, nombre: string): Comprobacion => ({ tipo: 'prueba', carpeta: SS, archivo: `pruebas/${archivo}`, nombre })
const AISLAMIENTO = prueba('aislamiento.ts', 'aislamiento de tres niveles: cada intento cruzado, rechazado')
const ed = (archivo: string, buscar: string, poner: string): Edicion => ({ archivo, buscar, poner })
const dist = (f: string) => `${SS}/dist/${f}`

export const FILAS: readonly Fila[] = [
  // ─────────────────────────────── AISIA ───────────────────────────────
  {
    id: 'aisia-dato-failclosed', doc: 'AISIA', ref: 'Dato personal en el sandbox', infirmable: true, estado: 'probado',
    afirmacion: 'el anonimizador reduce el riesgo, no lo garantiza: 0 fugas en el corpus sintético (277 casos, 155 con datos sembrados)',
    control: 'src/anonimiza.ts · anonimiza(): veredicto «cuarentena» con cualquier señal',
    comprobacion: prueba('anonimiza.ts', '0 fugas: ningún valor sembrado sale en un texto que entra al sandbox'),
    sabotaje: { que: 'todo entra al sandbox, con o sin señales', ediciones: [ed(dist('anonimiza.js'), "veredicto: senales.length ? 'cuarentena' : 'entra'", "veredicto: 'entra'")] },
  },
  {
    id: 'aisia-dato-adversarial', doc: 'AISIA', ref: 'Dato personal en el sandbox', infirmable: true, estado: 'probado',
    afirmacion: 'las 63 entradas del revisor adversarial no fugan (la referencia la puso quien no escribió el detector)',
    control: 'src/anonimiza.ts · reemplazaNombres(): un nombre se reconoce porque no es vocabulario',
    comprobacion: prueba('anonimiza.ts', 'las 63 entradas del revisor adversarial: ninguna fuga, una por una'),
    sabotaje: { que: 'sin el detector de nombres por exclusión', ediciones: [ed(dist('anonimiza.js'), 'return reemplazaNombres(reemplazaUsuarios(t, c), c);', 'return reemplazaUsuarios(t, c);')] },
  },
  {
    id: 'aisia-dato-red', doc: 'AISIA', ref: 'Dato personal en el sandbox', infirmable: true, estado: 'probado',
    afirmacion: 'lo que queda con forma de dato personal después de los detectores manda el caso a cuarentena (la red de señales residuales)',
    control: 'src/anonimiza.ts · senalesResiduales()',
    comprobacion: prueba('anonimiza.ts', 'la red de señales residuales: un dominio que ningún detector reconoce deja el caso en cuarentena'),
    sabotaje: { que: 'sin red de señales residuales', ediciones: [ed(dist('anonimiza.js'), 'const senales = senalesResiduales(t);', 'const senales = [];')] },
  },
  {
    id: 'aisia-dato-rrhh', doc: 'AISIA', ref: 'Dato personal en el sandbox', infirmable: true, estado: 'probado',
    afirmacion: 'un caso de RR. HH. o nómina va a cuarentena, aunque esté bien anonimizado: no entra al sandbox y nadie la revisa hasta D14 (DP-7)',
    control: 'src/anonimiza.ts · CONTEXTO_PERSONAL',
    comprobacion: prueba('anonimiza.ts', 'todo caso de RR. HH. o nómina va a cuarentena, aunque esté bien anonimizado'),
    sabotaje: { que: 'el contexto de personal deja de mandar a revisión', ediciones: [ed(dist('anonimiza.js'), 'if (CONTEXTO_PERSONAL.test(texto))', 'if (false)')] },
  },
  {
    id: 'aisia-dato-cuarentena-tipos', doc: 'AISIA', ref: 'Dato personal en el sandbox', infirmable: true, estado: 'probado',
    afirmacion: 'la cuarentena guarda solo tipos de señal, nunca el dato',
    control: 'src/anonimiza.ts · las señales son frases fijas',
    comprobacion: prueba('anonimiza.ts', 'la cuarentena dice tipos de señal, nunca el dato'),
    sabotaje: { que: 'la cuarentena copia el texto original', ediciones: [ed(dist('anonimiza.js'), 'return { texto: t, reemplazos: cuenta, senales, veredicto', 'return { texto: t, reemplazos: cuenta, senales: [...senales, texto], veredicto')] },
  },
  {
    id: 'aisia-dato-cuarentena-base', doc: 'AISIA', ref: 'Dato personal en el sandbox', infirmable: true, estado: 'probado',
    afirmacion: 'la cuarentena guarda solo tipos de señal, y la BASE lo exige: un dato no entra disfrazado de señal',
    control: 'SQL · constraint ss_cuarentena_solo_senales (la lista de SENALES del anonimizador)',
    comprobacion: prueba('cierre-base.ts', 'H-03 · la cuarentena solo guarda señales del vocabulario fijo, nunca el dato'),
    sabotaje: { que: 'la cuarentena acepta cualquier texto', ediciones: [ed(SQL, 'check (cardinality(senales) > 0 and senales <@ array[', 'check (cardinality(senales) > 0 or senales <@ array[')] },
  },
  {
    id: 'aisia-dato-sandbox-cerrojo', doc: 'AISIA', ref: 'Dato personal en el sandbox', infirmable: true, estado: 'probado',
    afirmacion: 'al sandbox no entra un identificador con forma (correo, RFC, CURP, NSS, CLABE, teléfono), aunque lo escriba el agente',
    control: 'SQL · constraint ss_sandbox_sin_identificadores (segundo cerrojo, independiente del anonimizador)',
    comprobacion: prueba('cierre-base.ts', 'H-03 · el sandbox rechaza un identificador formal aunque lo escriba el agente'),
    sabotaje: { que: 'el sandbox acepta lo que le llegue', ediciones: [ed(SQL, '  constraint ss_sandbox_sin_identificadores check (\n', '  constraint ss_sandbox_sin_identificadores check (true or\n')] },
    nota: 'los nombres sin forma siguen siendo trabajo del anonimizador (H-04, fase 2)',
  },
  {
    id: 'aisia-dato-no-frena', doc: 'AISIA', ref: 'Dato personal en el sandbox', estado: 'probado',
    afirmacion: 'la cuarentena no frena la atención: el caso sigue con su consultora y su reloj de SLA; solo no entra al sandbox',
    control: 'src/features/soporte-sap/services/runtime.ts · alSandbox(); src/sla.ts no conoce la cuarentena',
    comprobacion: prueba('anonimiza.ts', 'la cuarentena no frena la atención: el reloj de SLA no la conoce y el caso sigue en atención con su consultora'),
    sabotaje: { que: 'el caso en cuarentena deja de atenderse', ediciones: [ed('src/features/soporte-sap/services/runtime.ts', "  // persona le responda al cliente (DP-4, PRP-010 H-17).\n  i.estado = 'en_atencion'\n}", "  // persona le responda al cliente (DP-4, PRP-010 H-17).\n  if (a.veredicto === 'entra') i.estado = 'en_atencion'\n}")] },
  },
  {
    id: 'aisia-dato-corpus-real', doc: 'AISIA', ref: 'Dato personal en el sandbox', infirmable: true, estado: 'depende',
    afirmacion: 'antes de salir del laboratorio el anonimizador se mide sobre un corpus real con consentimiento, con revisión humana',
    control: 'D9', nota: 'en laboratorio no hay corpus real: el riesgo infirmable queda contenido porque no se opera con datos reales',
  },
  {
    id: 'aisia-dato-revision-frases', doc: 'AISIA', ref: 'Dato personal en el sandbox', infirmable: true, estado: 'probado',
    afirmacion: 'las 5 frases que la revisión del 07/10 vio entrar con el dato ya no entran, solas ni dentro de un ticket («pepe gonzalez de almacen», «jgarcia», «doña Lupita», «El chofer Ramiro», «rosa punto elena en gmail»)',
    control: 'src/anonimiza.ts · nombres comunes en cualquier caja (src/nombres.ts), usuario «inicial+apellido», tratamientos y puestos sin punto, correo dicho con el proveedor',
    comprobacion: prueba('anonimiza.ts', 'H-04 · las 5 frases de la revisión del 07/10 ya no entran con el dato, solas ni dentro de un ticket'),
    sabotaje: { que: 'sin los nombres comunes en cualquier caja', ediciones: [ed(dist('anonimiza.js'), '    t = reemplazaConocidos(t, c);\n', '')] },
  },
  {
    id: 'aisia-dato-banco-independiente', doc: 'AISIA', ref: 'Dato personal en el sandbox', infirmable: true, estado: 'probado',
    afirmacion: 'el banco que escribió quien no leyó el detector (30 casos difíciles) no fuga, y sus casos de nómina van a cuarentena',
    control: 'src/anonimiza.ts · detectores tolerantes a separadores, ofuscación y caja',
    comprobacion: prueba('anonimiza.ts', 'H-04 · el banco independiente: ningún dato personal entra al sandbox, y lo de nómina va a cuarentena'),
    sabotaje: { que: 'los separadores de un procesador de texto (·) vuelven a partir un teléfono', ediciones: [ed(dist('anonimiza.js'), 'const SEP = String.raw `[\\s\\-.()·•–]`;', 'const SEP = String.raw `[\\s\\-.()]`;')] },
    nota: 'no es «cero fugas»: un nombre en minúsculas, sin contexto y fuera de la lista de nombres comunes pasa (límite declarado; D9: corpus real antes de salir del laboratorio)',
  },
  {
    id: 'aisia-dato-banco-control', doc: 'AISIA', ref: 'Dato personal en el sandbox', infirmable: true, estado: 'probado',
    afirmacion: 'el banco de control, escrito después y sin ver el detector ni el primer banco, no fuga, y sus casos de nómina van a cuarentena (medido antes del arreglo: 3 fugas de 30)',
    control: 'src/anonimiza.ts · números leídos con errores de OCR, `usr=`, diminutivos, menciones de chat',
    comprobacion: prueba('anonimiza.ts', 'H-04 · el banco de control (escrito después, sin ver el detector): ningún dato entra, lo de nómina va a cuarentena y lo técnico se queda'),
    sabotaje: { que: 'un teléfono leído con O por 0 y l por 1 vuelve a pasar', ediciones: [ed(dist('anonimiza.js'), '    t = t.replace(NUMERO_OCR, (m) => (/[OolI]/.test(m) && comoDigitos(m).length >= 7 ? marca(c, tipoDeNumero(comoDigitos(m), v)) : m));\n', '')] },
  },
  {
    id: 'aisia-dato-sueltas', doc: 'AISIA', ref: 'Dato personal en el sandbox', infirmable: true, estado: 'probado',
    afirmacion: 'un nombre que no está en ninguna lista se reconoce por la mayúscula a media frase, aunque venga solo',
    control: 'src/anonimiza.ts · reemplazaSueltas()',
    comprobacion: prueba('anonimiza.ts', 'H-04 · un nombre que no está en la lista de nombres comunes se reconoce por la mayúscula a media frase'),
    sabotaje: { que: 'sin el nombre suelto con mayúscula', ediciones: [ed(dist('anonimiza.js'), '    return reemplazaSueltas(t, c);', '    return t;')] },
  },
  {
    id: 'aisia-dato-tecnico', doc: 'AISIA', ref: 'Dato personal en el sandbox', estado: 'probado',
    afirmacion: 'lo técnico entra y no se tapa: una transacción, un dump o un apellido que es tabla (MIRO, MARC) no se vuelven [NOMBRE]',
    control: 'src/anonimiza.ts · una palabra de nombre lleva minúscula y termina en límite de palabra («En VA01» no es un nombre)',
    comprobacion: prueba('anonimiza.ts', 'H-04 · los controles del banco: lo técnico entra y no se tapa (MIRO, «dolores de cabeza», M7 053, «En VA01»)'),
    sabotaje: { que: 'la palabra de nombre vuelve a la v2 (sin minúscula ni límite)', ediciones: [ed(dist('anonimiza.js'), "(?:[${MAYUS}](?=[\\p{L}'-]*\\p{Ll})[\\p{L}'-]+|[${MAYUS}]\\.)(?![\\p{L}\\p{N}_])`;", "(?:[${MAYUS}][\\p{L}'-]+|[${MAYUS}]\\.)`;")] },
  },
  {
    id: 'aisia-secreto-generaliza', doc: 'AISIA', ref: 'Secreto del N3 en el núcleo', estado: 'probado',
    afirmacion: 'lo que va al núcleo se generaliza además de anonimizarse: objetos propios (Z…, Y…, /NS/…, campos ZZ), estructura y nombres de la consultora y del cliente; lo estándar se queda',
    control: 'src/generaliza.ts · generaliza()',
    comprobacion: prueba('anonimiza.ts', 'H-19 · el banco independiente de la generalización: nada que identifique al cliente sube al núcleo, y lo estándar se queda'),
    sabotaje: { que: 'los objetos Y… pasan tal cual', ediciones: [ed(dist('generaliza.js'), '([ZzYy][\\p{L}\\p{N}_]{2,40})', '([Zz][\\p{L}\\p{N}_]{2,40})')] },
  },
  {
    id: 'aisia-secreto-estructura', doc: 'AISIA', ref: 'Secreto del N3 en el núcleo', estado: 'probado',
    afirmacion: 'la estructura del cliente no sube: sociedad, centro, almacén y organización, con su código en cualquier forma y en listas',
    control: 'src/generaliza.ts · quitaEstructura()',
    comprobacion: prueba('anonimiza.ts', 'H-19 · el banco independiente de la generalización: nada que identifique al cliente sube al núcleo, y lo estándar se queda'),
    sabotaje: { que: 'de una lista de sociedades solo se quita la primera', ediciones: [ed(dist('generaliza.js'), '(${CODIGO}(?:${ENTRE_CODIGOS}${CODIGO})*)`', '(${CODIGO})`')] },
  },
  {
    id: 'aisia-secreto-cliente', doc: 'AISIA', ref: 'Secreto del N3 en el núcleo', estado: 'probado',
    afirmacion: 'el nombre del cliente no sube: completo o sin razón social, sin acentos, en cualquier caja, su palabra distintiva o sus siglas',
    control: 'src/generaliza.ts · quitaOrganizaciones()',
    comprobacion: prueba('anonimiza.ts', 'H-19 · el banco independiente de la generalización: nada que identifique al cliente sube al núcleo, y lo estándar se queda'),
    sabotaje: { que: 'las siglas del cliente pasan', ediciones: [ed(dist('generaliza.js'), 'for (const s of siglas)', 'for (const s of [])')] },
  },
  {
    id: 'aisia-secreto-a-medida', doc: 'AISIA', ref: 'Secreto del N3 en el núcleo', estado: 'probado',
    afirmacion: 'lo que enseña el experto queda A MEDIDA de la consultora del caso por defecto, y anonimizado; sin caso, no se guarda',
    control: 'src/chat.ts · ensena()',
    comprobacion: prueba('chat.ts', 'H-19 · la enseñanza queda a medida de la consultora del caso que nombra y anonimizada; sin caso, no se guarda'),
    sabotaje: { que: 'la enseñanza vuelve a proponerse al núcleo por defecto', ediciones: [ed(dist('chat.js'), "alcance: 'a_medida', consultora: caso.consultora", "alcance: 'nucleo', consultora: null")] },
  },
  {
    id: 'aisia-secreto-al-nucleo', doc: 'AISIA', ref: 'Secreto del N3 en el núcleo', estado: 'probado',
    afirmacion: 'al núcleo una enseñanza sube generalizada y sin consultora; si al generalizar queda una señal, no sube',
    control: 'src/chat.ts · alNucleo() llama a generaliza()',
    comprobacion: prueba('chat.ts', 'H-19 · al núcleo sube generalizada y sin consultora; si al generalizar queda una señal, no sube'),
    sabotaje: { que: 'sube el texto tal cual', ediciones: [ed(dist('chat.js'), 'const g = generaliza(p.contenido, v, nombres);', "const g = { veredicto: 'entra', senales: [], texto: p.contenido };")] },
  },
  {
    id: 'aisia-secreto-runtime', doc: 'AISIA', ref: 'Secreto del N3 en el núcleo', estado: 'probado',
    afirmacion: 'en la app, al núcleo solo sube el superadministrador, y sube generalizada',
    control: 'src/features/soporte-sap/services/runtime.ts · subeAlNucleo()',
    comprobacion: prueba('anonimiza.ts', 'H-19 · en la app, al núcleo solo sube el superadministrador, y sube con alNucleo (generalizada)'),
    sabotaje: { que: 'la app sube el texto sin generalizar', ediciones: [ed('src/features/soporte-sap/services/runtime.ts', 'n = alNucleo(p, VALIDADORES, NOMBRES_DE_ORGANIZACION)', "n = { ...p, alcance: 'nucleo', consultora: null }")] },
  },
  {
    id: 'aisia-secreto-base-nucleo', doc: 'AISIA', ref: 'Secreto del N3 en el núcleo', estado: 'probado',
    afirmacion: 'la base rechaza al núcleo lo que llega sin generalizar, al proponerlo y al promoverlo: un nombre de organización, un objeto propio, la estructura o un identificador',
    control: 'SQL · ss_priv.propuesta_nucleo_generalizada (disparador de ss_propuesta)',
    comprobacion: prueba('nucleo.ts', 'H-19 · la base rechaza al núcleo lo que llega sin generalizar: un nombre, un objeto propio, la estructura o un identificador'),
    sabotaje: { que: 'sin el disparador', ediciones: [ed(SQL, 'create trigger ss_propuesta_nucleo_generalizada before insert or update on public.ss_propuesta\n  for each row execute function ss_priv.propuesta_nucleo_generalizada();', 'select 1;')] },
  },
  {
    id: 'aisia-secreto-superadmin', doc: 'AISIA', ref: 'Secreto del N3 en el núcleo', estado: 'probado',
    afirmacion: 'lo que va al núcleo lo decide el superadministrador, a su nombre (D2: el experto valida, el laboratorio firma)',
    control: 'SQL · ss_propuesta_decide (alcance núcleo → es_superadmin) y ss_propuesta_a_su_nombre',
    comprobacion: AISLAMIENTO,
    sabotaje: { que: 'cualquiera del laboratorio decide lo del núcleo', ediciones: [ed(SQL, "  using (case when alcance = 'nucleo' then ss_priv.es_superadmin() else ss_priv.es_laboratorio() end)\n  with check (case when alcance = 'nucleo' then ss_priv.es_superadmin() else ss_priv.es_laboratorio() end);", '  using (ss_priv.es_laboratorio())\n  with check (ss_priv.es_laboratorio());')] },
  },
  {
    id: 'aisia-prioridad-itil', doc: 'AISIA', ref: 'Prioridad mal asignada', estado: 'probado',
    afirmacion: 'la regla de prioridad es determinista y visible: matriz ITIL de impacto × urgencia',
    control: 'src/categoriza.ts · prioridadItil()',
    comprobacion: prueba('categoriza.ts', 'matriz ITIL de impacto × urgencia'),
    sabotaje: { que: 'todo sale P4', ediciones: [ed(dist('categoriza.js'), "return suma <= 2 ? 'P1' : suma === 3 ? 'P2' : suma === 4 ? 'P3' : 'P4';", "return 'P4';")] },
  },
  {
    id: 'aisia-prioridad-piso', doc: 'AISIA', ref: 'Prioridad mal asignada', estado: 'probado',
    afirmacion: 'un ticket con señales de nómina o RR. HH. no queda debajo de P2 sin que un humano lo baje',
    control: 'src/categoriza.ts · piso de nómina',
    comprobacion: prueba('categoriza.ts', 'piso de nómina: un caso de nómina sin urgencia no baja de P2'),
    sabotaje: { que: 'sin piso de nómina', ediciones: [ed(dist('categoriza.js'), "if (pisoNomina && (prioridad === 'P3' || prioridad === 'P4')) {", 'if (false) {')] },
  },
  {
    id: 'aisia-prioridad-piso-base', doc: 'AISIA', ref: 'Prioridad mal asignada', infirmable: true, estado: 'probado',
    afirmacion: "el piso de nómina lo sostiene también la BASE: ni el agente ni un consultor dejan una incidencia de nómina en P3 o P4 sin un evento con motivo",
    control: "SQL · ss_priv.incidencia_campos_de_la_base() con ss_priv.contexto_personal()",
    comprobacion: prueba('cierre-base.ts', 'H-15 · una incidencia de nómina no queda en P3 ni P4 al categorizarla'),
    sabotaje: { que: "la base deja de sostener el piso", ediciones: [
      ed(SQL, "  if new.prioridad in ('P3', 'P4') and ss_priv.contexto_personal(new.titulo || ' ' || new.descripcion) then", "  if false then")] },
  },
  {
    id: 'aisia-prioridad-vocabulario', doc: 'AISIA', ref: 'Prioridad mal asignada', infirmable: true, estado: 'probado',
    afirmacion: "un solo vocabulario de nómina y RR. HH. (IMSS, PTU, aguinaldo, incapacidad, la quincena, infotipos…) para el categorizador, el anonimizador y la base",
    control: "src/categoriza.ts usa CONTEXTO_PERSONAL de src/anonimiza.ts",
    comprobacion: prueba('cierre-base.ts', 'H-15 · el categorizador pone en P2 lo que la revisión vio en P4 (IMSS, PTU, aguinaldo, la quincena…)'),
    sabotaje: { que: "el categorizador vuelve a su lista corta", ediciones: [
      ed(dist('categoriza.js'), "const pisoNomina = CONTEXTO_PERSONAL.test(todo) || modulo === 'HCM'", "const pisoNomina = /(n[oó]mina|pc00_m32)/i.test(todo) || modulo === 'HCM'")] },
  },
  {
    id: 'aisia-prioridad-documento', doc: 'AISIA', ref: 'Prioridad mal asignada', infirmable: true, estado: 'probado',
    afirmacion: 'un documento con «urgente», «toda la planta» u «hoy» no sube la prioridad: la urgencia y el impacto los declara el cliente',
    control: 'src/categoriza.ts · categoriza(texto, documentos)',
    comprobacion: prueba('ingesta.ts', 'H-24 · un documento con las palabras de urgencia e impacto no sube la prioridad: la declara el cliente'),
    sabotaje: { que: 'la urgencia y el impacto salen también de los documentos', ediciones: [
      ed(dist('categoriza.js'), 'const impacto = IMPACTO_ALTO.test(texto) ? 1 : IMPACTO_MEDIO.test(texto) ? 2 : 3;', 'const impacto = IMPACTO_ALTO.test(todo) ? 1 : IMPACTO_MEDIO.test(todo) ? 2 : 3;'),
      ed(dist('categoriza.js'), 'const urgencia = URGENCIA_ALTA.test(texto) ? 1 : URGENCIA_MEDIA.test(texto) ? 2 : 3;', 'const urgencia = URGENCIA_ALTA.test(todo) ? 1 : URGENCIA_MEDIA.test(todo) ? 2 : 3;')] },
  },
  {
    id: 'aisia-prioridad-cambio', doc: 'AISIA', ref: 'Prioridad mal asignada', infirmable: true, estado: 'probado',
    afirmacion: "fijada la prioridad, solo una persona la cambia, con un evento CAMBIO_PRIORIDAD y su motivo: queda en la cadena",
    control: "SQL · ss_priv.incidencia_campos_de_la_base() y ss_priv.evento_de_quien_puede()",
    comprobacion: prueba('cierre-base.ts', 'H-15 · la prioridad, una vez fijada, cambia solo con un evento de una persona y con motivo'),
    sabotaje: { que: "la prioridad se cambia directo, sin evento", ediciones: [
      ed(SQL, "  if old.prioridad is not null and new.prioridad is distinct from old.prioridad then", "  if false then")] },
  },
  {
    id: 'c3-agente-actualiza', doc: 'C3', ref: 'Decisiones humanas (doble cierre en todas)', estado: 'probado',
    afirmacion: "el agente actualiza su incidencia (categoría, prioridad inicial) por columna, sin fechas ni estados terminales; antes fallaba por un disparador que leía sin permiso",
    control: "SQL · ss_priv.cliente_de_su_consultora() security definer, grant por columna",
    comprobacion: prueba('cierre-base.ts', 'H-15 · una incidencia de nómina no queda en P3 ni P4 al categorizarla'),
    sabotaje: { que: "el disparador de tenencia vuelve a leer con los permisos del agente", ediciones: [
      ed(SQL, "create or replace function ss_priv.cliente_de_su_consultora() returns trigger language plpgsql security definer set search_path = '' as $$", "create or replace function ss_priv.cliente_de_su_consultora() returns trigger language plpgsql set search_path = '' as $$")] },
  },
  {
    id: 'aisia-prioridad-impugna', doc: 'AISIA', ref: 'Prioridad mal asignada', estado: 'probado',
    afirmacion: 'el N3 puede impugnar la prioridad de lo suyo (no la de otro), y la resuelve su consultora a su nombre',
    control: 'SQL · ss_impugnacion_alta, ss_impugnacion_resuelve, ss_impugnacion_a_su_nombre',
    comprobacion: AISLAMIENTO,
    sabotaje: { que: 'cualquiera impugna cualquier incidencia: se quitan la política y el disparador que exige ver la incidencia (doble cierre)', ediciones: [
      ed(SQL, "with check (ss_priv.rol_en(cliente_id) = 'usuario_cliente' and creada_por = auth.uid() and estado = 'abierta');", 'with check (true);'),
      ed(SQL, "  if c is null then raise exception 'la incidencia % no existe o no es visible', new.incidencia_id; end if;", '  if c is null then return new; end if;'),
    ] },
    nota: 'doble cierre: la política de alta y el disparador de tenencia, que no deja escribir sobre una incidencia que no se ve; quitar uno solo no basta',
  },
  {
    id: 'aisia-solucion-aprobacion', doc: 'AISIA', ref: 'Solución equivocada aprobada', infirmable: true, estado: 'probado',
    afirmacion: 'nada se ejecuta en el simulador sin la fila de aprobación humana de la sala; en un SAP real no está cableado (D6)',
    control: 'src/simulador.ts · ejecuta() exige la aprobación',
    comprobacion: prueba('simulador.ts', 'ejecutar sin aprobación humana no corre'),
    sabotaje: { que: 'el simulador ejecuta sin aprobación', ediciones: [ed(dist('simulador.js'), 'if (!aprobacion)', 'if (false)')] },
  },
  {
    id: 'aisia-solucion-artefacto', doc: 'AISIA', ref: 'Solución equivocada aprobada', infirmable: true, estado: 'probado',
    afirmacion: 'se ejecuta exactamente lo aprobado: la huella se recalcula sobre lo que va a correr, y otro parámetro, otra versión u otra tarea no ejecutan',
    control: 'src/simulador.ts · ejecuta() compara la huella del artefacto (src/artefacto.ts)',
    comprobacion: prueba('simulador.ts', 'H-11 · una aprobación de otro artefacto no ejecuta: otro parámetro, otra versión u otra tarea invalidan la huella'),
    sabotaje: { que: 'el simulador ejecuta cualquier artefacto con una aprobación', ediciones: [ed(dist('simulador.js'), 'if (aprobacion.taskId !== plan.taskId || aprobacion.sha256 !== huellaDePlan(plan)) {', 'if (false) {')] },
  },
  {
    id: 'aisia-solucion-cli-huella', doc: 'AISIA', ref: 'Solución equivocada aprobada', infirmable: true, estado: 'probado',
    afirmacion: 'el CLI del simulador ejecuta por el mismo camino: un `--param` distinto del aprobado no corre',
    control: 'clis/ss-simulador.mjs · arma el artefacto y llama a ejecuta()',
    comprobacion: prueba('clis.ts', 'ss-simulador: sin --ejecutar simula; con --ejecutar y sin aprobación no corre; con la fila humana sí'),
    sabotaje: { que: 'el CLI corre los pasos sin pasar por ejecuta()', ediciones: [ed(`${SS}/clis/ss-simulador.mjs`, '    const r = ejecuta(sap, artefacto, fila ? { taskId: fila.taskId, sha256: fila.sha256, decididaPor: fila.decididaPor } : null)', '    const r = simula(sap, artefacto.pasos)')] },
  },
  {
    id: 'aisia-solucion-supervisor', doc: 'AISIA', ref: 'Solución equivocada aprobada', infirmable: true, estado: 'probado',
    afirmacion: 'el supervisor re-verifica contra el simulador y detiene lo que no cuadra; el humano ve el antes y el después',
    control: 'src/enjambre.ts · supervisa()',
    comprobacion: prueba('enjambre.ts', 'el supervisor detiene lo que no cuadra: un plan alterado, un parámetro que falta, un síntoma que no se reproduce'),
    sabotaje: { que: 'el supervisor manda todo a la sala', ediciones: [ed(dist('enjambre.js'), "resultado: c.every((x) => x.ok) ? 'a_la_sala' : 'a_revision'", "resultado: 'a_la_sala'")] },
  },
  {
    id: 'aisia-solucion-sap-real', doc: 'AISIA', ref: 'Solución equivocada aprobada', infirmable: true, estado: 'depende',
    afirmacion: 'la aplicación en un SAP real será por acción, con gate humano y solo sobre lo que se pueda revertir',
    control: 'D6', nota: 'no está cableada: en laboratorio el daño es al simulador',
  },
  {
    id: 'aisia-cruzado-sandbox', doc: 'AISIA', ref: 'Conocimiento de una consultora usado para otra', infirmable: true, estado: 'probado',
    afirmacion: 'el sandbox está aislado por consultora: cada una ve solo lo que nació de sus incidencias',
    control: 'SQL · ss_sandbox_lee',
    comprobacion: AISLAMIENTO,
    sabotaje: { que: 'toda consultora ve el sandbox entero', ediciones: [ed(SQL, "  using (ss_priv.es_laboratorio() or ss_priv.rol_en(origen_consultora_id) = 'consultor');", '  using (true);')] },
  },
  {
    id: 'aisia-cruzado-fde', doc: 'AISIA', ref: 'Conocimiento de una consultora usado para otra', estado: 'probado',
    afirmacion: 'el registro FDE dice qué fue a medida y qué al núcleo, y nada se registra sin motivo',
    control: 'src/fde.ts · registra()',
    comprobacion: prueba('fde.ts', 'sin motivo no se registra; las etapas imponen su alcance'),
    sabotaje: { que: 'se registra sin motivo', ediciones: [ed(dist('fde.js'), 'if (!t.motivo.trim())', 'if (false)')] },
  },
  {
    id: 'aisia-cruzado-consentimiento', doc: 'AISIA', ref: 'Conocimiento de una consultora usado para otra', infirmable: true, estado: 'depende',
    afirmacion: 'a la matriz común solo pasa lo general con consentimiento por contrato de la consultora y de su cliente',
    control: 'D1', nota: 'sin D1 decidida, lo aprendido queda aislado por consultora (la fila de arriba)',
  },
  {
    id: 'aisia-lab-escalado', doc: 'AISIA', ref: 'El laboratorio lee lo que no necesita', estado: 'probado',
    afirmacion: 'el laboratorio lee solo lo escalado por la consultora, no toda la operación',
    control: 'SQL · ss_priv.lab_trabaja() en las políticas de lectura',
    comprobacion: AISLAMIENTO,
    sabotaje: { que: 'el laboratorio lee todo', ediciones: [ed(SQL, '  select ss_priv.es_laboratorio() and exists (select 1 from public.ss_escalamiento e where e.incidencia_id = inc)', '  select ss_priv.es_laboratorio()')] },
  },
  {
    id: 'aisia-lab-72h', doc: 'AISIA', ref: 'El laboratorio lee lo que no necesita', estado: 'probado',
    afirmacion: 'los originales, con un acceso que otorga la consultora por 72 h como máximo',
    control: 'SQL · constraint ss_acceso_con_tope',
    comprobacion: AISLAMIENTO,
    sabotaje: { que: 'el tope pasa a 720 h', ediciones: [ed(SQL, "check (vence_en <= creado_en + interval '72 hours')", "check (vence_en <= creado_en + interval '720 hours')")] },
  },
  {
    id: 'aisia-lab-escala-la-consultora', doc: 'AISIA', ref: 'El laboratorio lee lo que no necesita', infirmable: true, estado: 'probado',
    afirmacion: 'lo escalado lo escala la consultora a su nombre: el agente no escala, ni con el seudónimo de un consultor',
    control: 'SQL · ss_escalamiento fuera de las políticas y del grant de escritura del agente (DP-3)',
    comprobacion: prueba('cierre-base.ts', 'H-01 · el agente no escala al laboratorio, ni a su nombre ni al de un consultor'),
    sabotaje: { que: 'el agente vuelve a escalar', ediciones: [
      ed(SQL, "  foreach t in array array['ss_evento', 'ss_cuarentena', 'ss_procedencia'] loop\n    execute format('drop policy if exists %I on public.%I', t || '_agente_escribe', t);",
        "  foreach t in array array['ss_escalamiento', 'ss_evento', 'ss_cuarentena', 'ss_procedencia'] loop\n    execute format('drop policy if exists %I on public.%I', t || '_agente_escribe', t);"),
      ed(SQL, 'grant insert on public.ss_evento, public.ss_cuarentena, public.ss_caso_sandbox, public.ss_propuesta,',
        'grant insert on public.ss_escalamiento, public.ss_evento, public.ss_cuarentena, public.ss_caso_sandbox, public.ss_propuesta,')] },
  },
  {
    id: 'aisia-lab-72h-fecha', doc: 'AISIA', ref: 'El laboratorio lee lo que no necesita', infirmable: true, estado: 'probado',
    afirmacion: 'las 72 h no se estiran: la fecha de alta la pone la base, no quien otorga',
    control: 'SQL · disparador ss_acceso_fechas (creado_en := now())',
    comprobacion: prueba('cierre-base.ts', 'H-02 · un acceso a originales no dura más de 72 h aunque quien lo otorga declare otra fecha de alta'),
    sabotaje: { que: 'quien otorga vuelve a elegir la fecha de alta', ediciones: [ed(SQL, '    new.creado_en := now();\n', '')] },
  },
  {
    id: 'aisia-lab-revoca', doc: 'AISIA', ref: 'El laboratorio lee lo que no necesita', infirmable: true, estado: 'probado',
    afirmacion: 'la consultora revoca el acceso antes de que venza, y revocado el laboratorio deja de ver los originales',
    control: 'SQL · revocado_en en ss_priv.baja_original() y la política ss_acceso_revoca',
    comprobacion: prueba('cierre-base.ts', 'H-02 · la consultora revoca un acceso y el laboratorio deja de ver los originales'),
    sabotaje: { que: 'revocar deja de cortar el acceso', ediciones: [ed(SQL, ' and a.vence_en > now() and a.revocado_en is null))', ' and a.vence_en > now()))')] },
  },
  {
    id: 'aisia-lab-se-otorga', doc: 'AISIA', ref: 'El laboratorio lee lo que no necesita', estado: 'probado',
    afirmacion: 'el acceso lo otorga la consultora, nunca el laboratorio a sí mismo',
    control: 'SQL · ss_acceso_otorga',
    comprobacion: AISLAMIENTO,
    sabotaje: { que: 'cualquiera se otorga acceso', ediciones: [ed(SQL, "  with check (otorgado_por = auth.uid()\n    and ss_priv.rol_en(ss_priv.padre_de(cliente_id)) = 'consultor'\n    and ss_priv.es_del_laboratorio(usuario_id));", '  with check (otorgado_por = auth.uid());')] },
  },
  {
    id: 'aisia-lab-d14', doc: 'AISIA', ref: 'El laboratorio lee lo que no necesita', estado: 'depende',
    afirmacion: 'qué ve el superadministrador del dato crudo de un N3 (por defecto, mínimo privilegio)',
    control: 'D14', nota: 'lo escalado trae texto con datos personales: es el diseño, y su alcance lo decide D14',
  },
  {
    id: 'aisia-foda-cita', doc: 'AISIA', ref: 'FODA o accionable que afirma de más', estado: 'probado',
    afirmacion: 'cada punto del FODA cita su métrica del corte semántico y su criterio',
    control: 'src/impactos.ts · foda()',
    comprobacion: prueba('impactos.ts', 'el FODA del N3 cita su dato en cada punto, con el criterio a la vista, y solo con lo que el cliente ve'),
    sabotaje: { que: 'una debilidad sin su dato', ediciones: [ed(dist('impactos.js'), "D.push({ texto: 'Hay incidencias críticas que se respondieron tarde', datos: [sla],", "D.push({ texto: 'Hay incidencias críticas que se respondieron tarde', datos: [],")] },
  },
  {
    id: 'aisia-foda-confianza-puntos', doc: 'AISIA', ref: 'FODA o accionable que afirma de más', estado: 'probado',
    afirmacion: 'cada punto del FODA lleva la confianza del volumen del cliente: con pocos datos, baja (la llevaban los accionables y el FODA no)',
    control: 'src/impactos.ts · foda()',
    comprobacion: prueba('impactos.ts', 'H-28 · cada punto del FODA lleva su confianza: con pocos datos, «baja»; con suficientes, «media»'),
    sabotaje: { que: 'el FODA dice «media» con pocos datos', ediciones: [ed(dist('impactos.js'), "const confianza = confianzaDe(ev(corte, n3, 'volumen', periodo, d)?.valor ?? 0);", "const confianza = 'media';")] },
  },
  {
    id: 'aisia-foda-confianza', doc: 'AISIA', ref: 'FODA o accionable que afirma de más', estado: 'probado',
    afirmacion: 'la confianza baja cuando hay pocos datos',
    control: 'src/impactos.ts · confianzaDe()',
    comprobacion: prueba('impactos.ts', 'con pocos datos la confianza baja: un cliente de 8 incidencias da «baja», uno de 45 da «media»'),
    sabotaje: { que: 'la confianza siempre «media»', ediciones: [ed(dist('impactos.js'), "const confianzaDe = (volumen) => (volumen < 15 ? 'baja' : 'media');", "const confianzaDe = (volumen) => 'media';")] },
  },
  {
    id: 'aisia-proyeccion-aviso', doc: 'AISIA', ref: 'Proyección tomada por promesa', estado: 'probado',
    afirmacion: 'cada impacto muestra su fórmula, sus supuestos y su rango, y dice que una proyección no es una promesa',
    control: 'src/impactos.ts · AVISO en cada accionable',
    comprobacion: prueba('impactos.ts', 'cada accionable trae evidencia del corte, fórmula, supuestos, rango, confianza y responsable'),
    sabotaje: { que: 'el aviso deja de decirlo', ediciones: [ed(dist('impactos.js'), "const AVISO = 'Proyección con supuestos, no una promesa: cambia si cambian los parámetros.';", "const AVISO = 'Proyección.';")] },
  },
  {
    id: 'aisia-sla-pausa', doc: 'AISIA', ref: 'SLA mal medido', estado: 'probado',
    afirmacion: 'el reloj se prueba en sus bordes: la espera del cliente pausa la resolución',
    control: 'src/sla.ts · relojSla()',
    comprobacion: prueba('sla.ts', 'la espera del cliente pausa la resolución, y los tramos lo muestran'),
    sabotaje: { que: 'la espera no pausa', ediciones: [ed(dist('sla.js'), "if (e.tipo === 'ESPERA_CLIENTE' && estado === 'corre')", "if (false && e.tipo === 'ESPERA_CLIENTE' && estado === 'corre')")] },
  },
  {
    id: 'aisia-sla-fecha', doc: 'AISIA', ref: 'SLA mal medido', estado: 'probado',
    afirmacion: 'la fecha de cada evento la da la base, no quien escribe',
    control: 'SQL · ss_priv.evento_encadena() pone la fecha (y ss_priv.evento_honesto() vigila la ventana)',
    comprobacion: AISLAMIENTO,
    sabotaje: { que: 'cualquiera fecha su evento: se quitan los dos cerrojos', ediciones: [
      ed(SQL, "  new.fecha := date_trunc('milliseconds', now());\n", ''),
      ed(SQL, "  if new.fecha < now() - interval '5 minutes' or new.fecha > now() + interval '1 minute' then", '  if false then')] },
  },
  {
    id: 'aisia-sla-alta', doc: 'AISIA', ref: 'SLA mal medido', infirmable: true, estado: 'probado',
    afirmacion: "el cliente no elige la fecha de alta, la prioridad ni el estado de su incidencia: los pone la base",
    control: "SQL · ss_priv.incidencia_campos_de_la_base() al insertar",
    comprobacion: prueba('cierre-base.ts', 'H-16 · el cliente no elige la fecha de alta, la prioridad ni el estado al levantar una incidencia'),
    sabotaje: { que: "quien levanta elige fecha, prioridad y estado", ediciones: [
      ed(SQL, "    new.creada_en := now();\n    new.primera_respuesta_en := null; new.resuelta_en := null; new.cerrada_en := null;\n    new.estado := 'nueva'; new.prioridad := null;\n", "")] },
  },
  {
    id: 'aisia-sla-marcas', doc: 'AISIA', ref: 'SLA mal medido', infirmable: true, estado: 'probado',
    afirmacion: "nadie reescribe la fecha de alta ni las marcas del reloj de una incidencia, ni el consultor ni el agente",
    control: "SQL · grant por columna (sin fechas) y ss_priv.incidencia_campos_de_la_base()",
    comprobacion: prueba('cierre-base.ts', 'H-16 · nadie reescribe las fechas de una incidencia: ni el consultor ni el agente'),
    sabotaje: { que: "las fechas se pueden escribir directo", ediciones: [
      ed(SQL, "  regla_aplicada, estado) on public.ss_incidencia to authenticated;", "  regla_aplicada, estado, creada_en, primera_respuesta_en) on public.ss_incidencia to authenticated;"),
      ed(SQL, "impacto, urgencia, prioridad, complejidad)\n  on public.ss_incidencia to soporte_sap_agente;", "impacto, urgencia, prioridad, complejidad, resuelta_en)\n  on public.ss_incidencia to soporte_sap_agente;"),
      ed(SQL, "    raise exception 'las fechas de la incidencia las pone la base desde sus eventos';", "    null;")] },
  },
  {
    id: 'aisia-sla-de-eventos', doc: 'AISIA', ref: 'SLA mal medido', infirmable: true, estado: 'probado',
    afirmacion: "las marcas del reloj (primera respuesta, resuelta, cerrada) salen de los eventos de la cadena, y resolver o cerrar es un evento",
    control: "SQL · disparador ss_evento_aplica",
    comprobacion: prueba('cierre-base.ts', 'H-16 · las marcas del reloj salen de los eventos de una persona de la consultora'),
    sabotaje: { que: "los eventos dejan de marcar el reloj", ediciones: [
      ed(SQL, "create trigger ss_evento_aplica after insert on public.ss_evento\n  for each row execute function ss_priv.evento_aplica();", "select 1;")] },
  },
  {
    id: 'aisia-sla-persona', doc: 'AISIA', ref: 'Primera respuesta automática', infirmable: true, estado: 'probado',
    afirmacion: "la primera respuesta, la pausa del reloj y la resolución son actos de una persona: el agente no las emite (DP-4)",
    control: "SQL · ss_priv.evento_de_quien_puede()",
    comprobacion: prueba('cierre-base.ts', 'H-17 · el agente no marca la primera respuesta, ni pausa el reloj, ni resuelve (DP-4)'),
    sabotaje: { que: "el agente emite cualquier evento", ediciones: [
      ed(SQL, "     and not (current_user = 'authenticated' and ss_priv.rol_en(new.consultora_id) is not distinct from 'consultor') then", "     and false then")] },
  },
  {
    id: 'aisia-sla-solo-la-consultora', doc: 'AISIA', ref: 'SLA mal medido', infirmable: true, estado: 'probado',
    afirmacion: 'responder, pausar, resolver y cambiar la prioridad son actos de una persona de la CONSULTORA: ni el cliente ni el laboratorio los emiten',
    control: 'SQL · ss_priv.evento_de_quien_puede() con `is not distinct from`',
    comprobacion: prueba('cierre-base.ts', 'H-17 · ni el cliente ni el laboratorio responden, pausan, resuelven o cambian la prioridad: solo una persona de la consultora'),
    sabotaje: { que: 'vuelve el `=` que dejaba pasar el NULL', ediciones: [
      ed(SQL, "     and not (current_user = 'authenticated' and ss_priv.rol_en(new.consultora_id) is not distinct from 'consultor') then", "     and not (current_user = 'authenticated' and ss_priv.rol_en(new.consultora_id) = 'consultor') then")] },
  },
  {
    id: 'aisia-sla-resultado-contrato', doc: 'AISIA', ref: 'SLA mal medido', infirmable: true, estado: 'probado',
    afirmacion: "el resultado de SLA es de un contrato que existe",
    control: "SQL · constraint ss_sla_de_un_contrato",
    comprobacion: prueba('cierre-base.ts', 'H-16 · el resultado de SLA no lo guarda el agente, y es de un contrato que existe'),
    sabotaje: { que: "un resultado con un contrato inventado", ediciones: [
      ed(SQL, "foreign key (contrato_id, contrato_version) references public.ss_contrato_sla (id, version)", "check (true)")] },
  },
  {
    id: 'aisia-sla-resultado-agente', doc: 'AISIA', ref: 'SLA mal medido', infirmable: true, estado: 'probado',
    afirmacion: "el resultado de SLA no lo escribe el agente: lo calcula el job de la plataforma desde los eventos",
    control: "SQL · ss_sla_resultado fuera de la política y del grant de escritura del agente",
    comprobacion: prueba('cierre-base.ts', 'H-16 · el resultado de SLA no lo guarda el agente, y es de un contrato que existe'),
    sabotaje: { que: "el agente vuelve a escribir el «cumple»", ediciones: [
      ed(SQL, "  foreach t in array array['ss_evento', 'ss_cuarentena', 'ss_procedencia'] loop\n    execute format('drop policy if exists %I on public.%I', t || '_agente_escribe', t);", "  foreach t in array array['ss_evento', 'ss_cuarentena', 'ss_sla_resultado', 'ss_procedencia'] loop\n    execute format('drop policy if exists %I on public.%I', t || '_agente_escribe', t);"),
      ed(SQL, "grant insert on public.ss_evento, public.ss_cuarentena, public.ss_caso_sandbox, public.ss_propuesta,\n  public.ss_mapeo,", "grant insert on public.ss_evento, public.ss_cuarentena, public.ss_caso_sandbox, public.ss_propuesta,\n  public.ss_sla_resultado, public.ss_mapeo,")] },
  },
  {
    id: 'aisia-impugna-queja', doc: 'AISIA', ref: 'La consultora altera la impugnación', infirmable: true, estado: 'probado',
    afirmacion: "la consultora no reescribe la queja del cliente: de una impugnación solo decide su estado, a su nombre",
    control: "SQL · grant update (estado, resuelta_por) on ss_impugnacion",
    comprobacion: prueba('cierre-base.ts', 'H-10 · la consultora no reescribe la queja del cliente; la resuelve a su nombre y no se reabre'),
    sabotaje: { que: "la consultora puede reescribir la impugnación", ediciones: [
      ed(SQL, "grant update (estado, resuelta_por) on public.ss_impugnacion to authenticated;", "grant update on public.ss_impugnacion to authenticated;")] },
  },
  {
    id: 'aisia-impugna-app', doc: 'AISIA', ref: 'La consultora altera la impugnación', infirmable: true, estado: 'probado',
    afirmacion: 'en la app el cliente impugna (también una pausa del reloj) con su motivo, y la consultora la resuelve a su nombre; una resuelta no se reabre',
    control: 'src/features/soporte-sap/services/runtime.ts · impugna() y resuelveImpugnacion()',
    comprobacion: prueba('pantallas.ts', 'H-10 · en la app, impugna el cliente de la incidencia con su motivo, y la consultora la resuelve a su nombre sin reabrirla'),
    sabotaje: { que: 'una impugnación resuelta se vuelve a resolver', ediciones: [ed('src/features/soporte-sap/services/runtime.ts', "  if (m.estado !== 'abierta') throw new Rechazo('una impugnación resuelta no se reabre ni se cambia')\n", '')] },
  },
  {
    id: 'aisia-impugna-cierre', doc: 'AISIA', ref: 'La consultora altera la impugnación', infirmable: true, estado: 'probado',
    afirmacion: "una impugnación resuelta queda fechada por la base y no se reabre; el cliente puede impugnar también una pausa del reloj",
    control: "SQL · ss_priv.impugnacion_fechas() y campo «pausa»",
    comprobacion: prueba('cierre-base.ts', 'H-10 · la consultora no reescribe la queja del cliente; la resuelve a su nombre y no se reabre'),
    sabotaje: { que: "una impugnación resuelta se reabre", ediciones: [
      ed(SQL, "    raise exception 'una impugnación resuelta no se reabre ni se cambia';", "    null;")] },
  },
  {
    id: 'aisia-sla-persona-runtime', doc: 'AISIA', ref: 'Primera respuesta automática', infirmable: true, estado: 'probado',
    afirmacion: "en la app, ni anonimizar ni mandar el plan a la sala marcan la primera respuesta: la marca el consultor al responderle al cliente (DP-4)",
    control: "src/features/soporte-sap/services/runtime.ts · respondeAlCliente()",
    comprobacion: prueba("anonimiza.ts", "H-17 · ni anonimizar ni mandar a la sala marcan la primera respuesta: solo la da el consultor, respondiéndole al cliente"),
    sabotaje: { que: "anonimizar vuelve a marcar la primera respuesta", ediciones: [
      ed('src/features/soporte-sap/services/runtime.ts', "  // persona le responda al cliente (DP-4, PRP-010 H-17).\n  i.estado = 'en_atencion'", "  // persona le responda al cliente (DP-4, PRP-010 H-17).\n  i.sla.push({ tipo: 'PRIMERA_RESPUESTA', fecha: ahora() })\n  i.estado = 'en_atencion'")] },
  },
  {
    id: 'aisia-sla-job', doc: 'AISIA', ref: 'SLA mal medido', infirmable: true, estado: 'probado',
    afirmacion: "el resultado de SLA lo calcula un job desde la base (fecha de alta, eventos de la cadena y contrato vigente) con la misma función que la app, y lo escribe con el rol de plataforma",
    control: "src/sla-job.ts · calculaResultadosSla() con relojSla()",
    comprobacion: prueba("sla-job.ts", "H-16 · el job calcula el resultado desde los eventos de la base, igual que relojSla, y lo escribe con el rol de plataforma"),
    sabotaje: { que: "el job deja de leer la primera respuesta", ediciones: [
      ed(dist('sla-job.js'), "'PRIMERA_RESPUESTA', ", "")] },
  },
  {
    id: 'aisia-sla-job-no-inventa', doc: 'AISIA', ref: 'SLA mal medido', estado: 'probado',
    afirmacion: "sin contrato válido o sin prioridad inicial, el job no inventa un resultado: lo omite y dice por qué (ausente no es cero)",
    control: "src/sla-job.ts · omitidas",
    comprobacion: prueba("sla-job.ts", "H-16 · sin contrato válido o sin prioridad inicial, el job no inventa un resultado: lo omite y dice por qué"),
    sabotaje: { que: "el job inventa la prioridad que falta", ediciones: [
      ed(dist('sla-job.js'), "prioridadInicial: PRIORIDADES.has(String(categorizada)) ? String(categorizada) : null", "prioridadInicial: PRIORIDADES.has(String(categorizada)) ? String(categorizada) : 'P4'")] },
  },
  {
    id: 'c3-plataforma-sla-suya', doc: 'C3', ref: 'Jobs de plataforma (C7, declarados)', estado: 'probado',
    afirmacion: "el job del SLA de una consultora no escribe resultados de otra",
    control: "SQL · ss_sla_resultado_plataforma_calcula con consultora_de_tarea()",
    comprobacion: prueba("sla-job.ts", "H-16 · el job de una consultora no escribe resultados de otra"),
    sabotaje: { que: "el job escribe resultados de cualquiera: se abren los dos cerrojos (la política y lo que la plataforma ve)", ediciones: [
      ed(SQL, "for select to soporte_sap_plataforma using (consultora_id = ss_priv.consultora_de_tarea())', t || '_plataforma_lee', t);", "for select to soporte_sap_plataforma using (true)', t || '_plataforma_lee', t);"),
      ed(SQL, "create policy ss_sla_resultado_plataforma_calcula on public.ss_sla_resultado for insert to soporte_sap_plataforma\n  with check (consultora_id = ss_priv.consultora_de_tarea());", "create policy ss_sla_resultado_plataforma_calcula on public.ss_sla_resultado for insert to soporte_sap_plataforma\n  with check (true);")] },
  },
  {
    id: 'aisia-sla-cifras', doc: 'AISIA', ref: 'SLA mal medido', estado: 'probado',
    afirmacion: 'las cifras del contrato (créditos, exclusiones, disponibilidad) no las pone un agente: van en blanco hasta D13',
    control: 'contratos/plantilla-contrato-sla.md',
    comprobacion: prueba('sla.ts', 'la plantilla del contrato lleva las cifras y el texto legal EN BLANCO'),
    sabotaje: { que: 'un agente compromete una cifra en el contrato', ediciones: [ed(`${SS}/contratos/plantilla-contrato-sla.md`, '- [POR DECIDIR: aviso de privacidad, responsable y encargado, transferencias — redacción legal]', '- Crédito del 10 % de la cuota por cada incumplimiento.')] },
  },
  {
    id: 'aisia-consultor-columnas', doc: 'AISIA', ref: 'Consultor juzgado por una métrica', estado: 'probado',
    afirmacion: 'la capa semántica no lee nombres de consultores (privilegios por columna): no hay métrica por persona que publicar',
    control: 'SQL · grant select (sin `consultor`) on ss_horas to soporte_sap_metricas',
    comprobacion: prueba('metricas-rls.ts', 'el job de métricas lee a todos los tenants, pero ninguna columna de texto'),
    sabotaje: { que: 'el job lee la tabla de horas entera', ediciones: [ed(SQL, 'grant select (consultora_id, cliente_id, incidencia_id, minutos, fecha) on public.ss_horas to soporte_sap_metricas;', 'grant select on public.ss_horas to soporte_sap_metricas;')] },
  },
  {
    id: 'aisia-consultor-horas', doc: 'AISIA', ref: 'Consultor juzgado por una métrica', estado: 'probado',
    afirmacion: 'las horas son de la consultora: ni el cliente ni el laboratorio las leen fila por fila',
    control: 'SQL · ss_horas_lee',
    comprobacion: AISLAMIENTO,
    sabotaje: { que: 'cualquiera lee las horas', ediciones: [ed(SQL, "create policy ss_horas_lee on public.ss_horas for select to authenticated\n  using (ss_priv.rol_en(consultora_id) = 'consultor' and consultor = ss_priv.seudonimo(auth.uid()));", 'create policy ss_horas_lee on public.ss_horas for select to authenticated\n  using (true);')] },
  },
  {
    id: 'aisia-presupuesto', doc: 'AISIA', ref: 'Corte por presupuesto', infirmable: true, estado: 'probado',
    afirmacion: 'el triage de P1 y P2 nunca se corta: al tope pasa a una persona; P3 y P4 esperan con aviso',
    control: 'src/pricing.ts · accionAnteElPresupuesto()',
    comprobacion: prueba('pricing.ts', 'control de costos: avisa al 80 %; al tope, P1 y P2 pasan a una persona y P3 y P4 esperan; sin fila, nada llama al modelo'),
    sabotaje: { que: 'al tope, P1 y P2 también se cortan', ediciones: [ed(dist('pricing.js'), "if (prioridad === 'P1' || prioridad === 'P2')", 'if (false)')] },
  },
  {
    id: 'aisia-presupuesto-enjambre', doc: 'AISIA', ref: 'Corte por presupuesto', infirmable: true, estado: 'probado',
    afirmacion: 'el enjambre no prepara ni corrige un plan sin el visto bueno del presupuesto del mes',
    control: 'src/enjambre.ts · preparaPlan() exige la decisión del presupuesto',
    comprobacion: prueba('presupuesto.ts', 'H-18 · el enjambre no prepara ni corrige un plan sin el visto bueno del presupuesto'),
    sabotaje: { que: 'el enjambre prepara el plan sin mirar el presupuesto', ediciones: [ed(dist('enjambre.js'), "if (o.presupuesto.accion !== 'llama_modelo')", 'if (false)')] },
  },
  {
    id: 'aisia-presupuesto-runtime', doc: 'AISIA', ref: 'Corte por presupuesto', infirmable: true, estado: 'probado',
    afirmacion: 'en la app, todo paso que gasta modelo pasa por el presupuesto del mes de su consultora; al tope, P1 y P2 a una persona y P3 y P4 en espera, con el aviso en la cadena y a la vista del consultor y del superadministrador',
    control: 'src/features/soporte-sap/services/runtime.ts · conPresupuesto()',
    comprobacion: prueba('presupuesto.ts', 'H-18 · en la app, todo paso que gasta modelo pasa por el presupuesto del mes, el aviso queda en la cadena y el OCR lee su tope del mes'),
    sabotaje: { que: 'la app ignora el presupuesto', ediciones: [ed('src/features/soporte-sap/services/runtime.ts', '  const decision = accionAnteElPresupuesto(veredictoDelMes(presupuestoDe(i.consultora), TOKENS_POR_PLAN), i.clasificacion.prioridad)', "  const decision: AccionDeTriage = { accion: 'llama_modelo', aviso: null }")] },
  },
  {
    id: 'aisia-presupuesto-p1-ocr', doc: 'AISIA', ref: 'P1 sin evidencia leída', infirmable: true, estado: 'probado',
    afirmacion: 'un P1 o un P2 con una imagen sin leer por el tope de OCR del mes pasa a una persona ahora, y se dice',
    control: 'src/features/soporte-sap/services/runtime.ts · levanta()',
    comprobacion: prueba('presupuesto.ts', 'H-18 · en la app, todo paso que gasta modelo pasa por el presupuesto del mes, el aviso queda en la cadena y el OCR lee su tope del mes'),
    sabotaje: { que: 'la evidencia sin leer no pasa a nadie', ediciones: [ed('src/features/soporte-sap/services/runtime.ts', "  if (sinLeer.length && (clasificacion.prioridad === 'P1' || clasificacion.prioridad === 'P2')) {", '  if (false) {')] },
  },
  {
    id: 'aisia-presupuesto-mes', doc: 'AISIA', ref: 'Corte por presupuesto', infirmable: true, estado: 'probado',
    afirmacion: 'el tope sale de la base por mes (`ss_presupuesto`) y lo gastado de la cadena del mes; lo de otro mes no cuenta, y el agente no lee el presupuesto de otra consultora',
    control: 'src/presupuesto.ts · leePresupuesto()',
    comprobacion: prueba('presupuesto.ts', 'H-18 · el tope sale de la base por mes y lo gastado de la cadena del mes: otro mes no cuenta'),
    sabotaje: { que: 'lo gastado de otros meses cuenta en este', ediciones: [ed(dist('presupuesto.js'), "fecha < ($2::date + interval '1 month')", "fecha < ($2::date + interval '10 years')")] },
  },
  {
    id: 'aisia-presupuesto-sin-medir', doc: 'AISIA', ref: 'Corte por presupuesto', infirmable: true, estado: 'probado',
    afirmacion: 'sin tope del mes, o con un plan sin sus tokens, no se llama al modelo: lo gastado sin medir no cuenta como cero',
    control: 'src/presupuesto.ts · usoDelMes() y veredictoDelMes()',
    comprobacion: prueba('presupuesto.ts', 'H-18 · sin tope del mes, o con un plan sin sus tokens, no se llama al modelo: P1 y P2 a una persona, P3 y P4 esperan'),
    sabotaje: { que: 'un plan sin sus tokens cuenta como cero', ediciones: [ed(dist('presupuesto.js'), '                tokensSinMedir++;', '                tokensSinMedir += 0;')] },
  },
  {
    id: 'aisia-presupuesto-reglas', doc: 'AISIA', ref: 'Corte por presupuesto', estado: 'probado',
    afirmacion: 'el presupuesto del mes sigue las reglas de la guardia de la sala: fail-closed y aviso al 80 %',
    control: 'src/presupuesto.ts · veredictoDelMes()',
    comprobacion: prueba('presupuesto.ts', 'H-18 · veredictoDelMes sigue las reglas de la guardia de la sala (fail-closed, aviso al 80 %)'),
    sabotaje: { que: 'el aviso llega al 90 %', ediciones: [ed(dist('presupuesto.js'), '(p.tokens + costo) / p.topeTokens >= 0.8', '(p.tokens + costo) / p.topeTokens >= 0.9')] },
  },
  {
    id: 'aisia-restauracion', doc: 'AISIA', ref: 'Restauración que toca a los demás', estado: 'probado',
    afirmacion: 'export y restauración por tenant: restaurar a una consultora no toca a las demás',
    control: 'src/respaldo.ts · restauraTenant()',
    comprobacion: prueba('respaldo.ts', 'restaurar solo a la consultora A: A vuelve a su export y B no cambia'),
    sabotaje: { que: 'restaurar borra a todos', ediciones: [ed(dist('respaldo.js'), 'delete from public.${tabla[0]} t where ${condicion(tabla)} returning 1', 'delete from public.${tabla[0]} t where ${condicion(tabla)} or true returning 1')] },
  },
  {
    id: 'aisia-restaura-firma', doc: 'AISIA', ref: 'Restauración que toca a los demás', infirmable: true, estado: 'probado',
    afirmacion: "un export alterado no se restaura: va firmado por el job, y quien lo cambie no puede recalcular la huella y hacerlo pasar",
    control: "src/respaldo.ts · exportIntegro() antes de abrir la transacción",
    comprobacion: prueba('cierre-base.ts', "H-08 · un export alterado no se restaura: la firma no cuadra"),
    sabotaje: { que: "la restauración deja de mirar la firma", ediciones: [
      ed(dist('respaldo.js'), "if (!exportIntegro(e, secreto))", "if (false)")] },
  },
  {
    id: 'aisia-restaura-filas', doc: 'AISIA', ref: 'Restauración que toca a los demás', infirmable: true, estado: 'probado',
    afirmacion: "una restauración solo pone filas del tenant que restaura: con los disparadores apagados, nada más lo ataría",
    control: "src/respaldo.ts · filasAjenas() antes de escribir",
    comprobacion: prueba('cierre-base.ts', "H-08 · un export firmado con filas de otra consultora no se restaura"),
    sabotaje: { que: "la restauración acepta filas de otra consultora", ediciones: [
      ed(dist('respaldo.js'), "if (ajenas.length)", "if (false)")] },
  },
  {
    id: 'aisia-restaura-antes-commit', doc: 'AISIA', ref: 'Restauración que toca a los demás', estado: 'probado',
    afirmacion: "la restauración se verifica ANTES del commit: si la huella del tenant no es la del export, rollback y nada a medias",
    control: "src/respaldo.ts · huellaTenant() dentro de la transacción",
    comprobacion: prueba('cierre-base.ts', "H-08 · la verificación ocurre ANTES del commit: si la huella no cuadra, rollback"),
    sabotaje: { que: "la restauración confirma sin comparar la huella", ediciones: [
      ed(dist('respaldo.js'), "if (despues.total !== e.huella.total)", "if (false)")] },
  },
  {
    id: 'aisia-restaura-accesos', doc: 'AISIA', ref: 'Restauración que toca a los demás', estado: 'probado',
    afirmacion: "el export por tenant lleva los accesos motivados de sus clientes (el registro de quién vio los originales)",
    control: "src/respaldo.ts · ss_acceso_motivado en TABLAS_DE_TENANT, por cliente",
    comprobacion: prueba('cierre-base.ts', "H-08 · el export lleva los accesos motivados de los clientes del tenant, no los de otro"),
    sabotaje: { que: "los accesos motivados se quedan fuera del export", ediciones: [
      ed(dist('respaldo.js'), "['ss_propuesta', 'consultora_id'], ['ss_acceso_motivado', 'cliente_id', 'cliente'],", "['ss_propuesta', 'consultora_id'],")] },
  },
  {
    id: 'aisia-restaura-sala', doc: 'AISIA', ref: 'Restauración que toca a los demás', estado: 'probado',
    afirmacion: "con la sala en la misma base, las aprobaciones de la consultora viajan en su export y vuelven al restaurar, sin tocar las de otra",
    control: "src/respaldo.ts · tablasDelRespaldo() con TABLAS_DE_LA_SALA",
    comprobacion: prueba('cierre-base.ts', "H-08 · con la sala en la misma base, las aprobaciones de la consultora viajan en su export y vuelven al restaurar"),
    sabotaje: { que: "la sala se queda fuera del export", ediciones: [
      ed(dist('respaldo.js'), "return r?.sala ? [...TABLAS_DE_TENANT, ...TABLAS_DE_LA_SALA] : TABLAS_DE_TENANT;", "return TABLAS_DE_TENANT;")] },
  },
  {
    id: 'c3-plataforma-no-inserta', doc: 'C3', ref: 'Jobs de plataforma (C7, declarados)', infirmable: true, estado: 'probado',
    afirmacion: "el rol de plataforma no inserta decisiones ni eventos (ni un mapeo aprobado, ni un campo confirmado, ni horas, ni un evento con el seudónimo de un consultor): lo único que escribe es el resultado de SLA que calcula su job",
    control: "SQL · políticas *_plataforma_lee (select) y *_plataforma_borra (delete); grants sin insert",
    comprobacion: prueba('cierre-base.ts', "H-07 · la plataforma no inserta decisiones ni eventos: un mapeo aprobado, un evento ajeno, horas, un campo confirmado"),
    sabotaje: { que: "la plataforma vuelve a tener for all e insert", ediciones: [
      ed(SQL, "'create policy %I on public.%I for select to soporte_sap_plataforma using (consultora_id = ss_priv.consultora_de_tarea())', t || '_plataforma_lee', t);", "'create policy %I on public.%I for all to soporte_sap_plataforma using (consultora_id = ss_priv.consultora_de_tarea())', t || '_plataforma_lee', t);"),
      ed(SQL, "grant select, delete on public.ss_incidencia,", "grant select, insert, delete on public.ss_incidencia,"),
      ed(SQL, "grant select on public.ss_evento, public.ss_crudo, public.ss_contrato_sla,", "grant select, insert on public.ss_evento, public.ss_crudo, public.ss_contrato_sla,")] },
  },
  {
    id: 'c3-plataforma-exporta', doc: 'C3', ref: 'Jobs de plataforma (C7, declarados)', estado: 'probado',
    afirmacion: "la plataforma exporta con su propio rol: lee todo lo de su consultora (antes fallaba con «permission denied») y nada de otra",
    control: "SQL · grant select del export y políticas por consultora_de_tarea()",
    comprobacion: prueba('cierre-base.ts', "H-07 · la plataforma exporta con su propio rol: todo lo de su consultora y nada de otra"),
    sabotaje: { que: "a la plataforma le vuelven a faltar tablas", ediciones: [
      ed(SQL, "grant select on public.ss_evento, public.ss_crudo, public.ss_contrato_sla, public.ss_presupuesto, public.ss_propuesta,\n  public.ss_caso_sandbox, public.ss_acceso_motivado to soporte_sap_plataforma;", "grant select on public.ss_evento, public.ss_crudo to soporte_sap_plataforma;")] },
  },
  {
    id: 'aisia-opacidad-contrato', doc: 'AISIA', ref: 'Opacidad', estado: 'probado',
    afirmacion: 'el contrato N2–N3 dice que un agente categoriza y que el laboratorio ve lo escalado',
    control: 'contratos/plantilla-contrato-sla.md §11',
    comprobacion: prueba('sla.ts', 'el contrato le dice al cliente que un agente categoriza y qué ve el laboratorio; el aviso de privacidad queda por decidir (AISIA, opacidad)'),
    sabotaje: { que: 'el contrato deja de decirlo', ediciones: [ed(`${SS}/contratos/plantilla-contrato-sla.md`, '- En N2–N3, un agente categoriza las incidencias y ', '- En N2–N3, ')] },
  },
  {
    id: 'aisia-opacidad-aviso', doc: 'AISIA', ref: 'Opacidad', estado: 'brecha',
    afirmacion: 'el aviso de privacidad hacia los empleados del N3',
    control: 'contratos/plantilla-contrato-sla.md §11',
    nota: 'la v2 decía que el contrato se lo exige al N3; la plantilla lo deja [POR DECIDIR] (redacción legal). Corregido en el texto: queda abierto',
  },
  {
    id: 'aisia-riesgo-pantalla', doc: 'AISIA', ref: 'Riesgo de baja como etiqueta', estado: 'probado',
    afirmacion: 'la pantalla muestra la fórmula y el umbral supuesto junto al número',
    control: 'src/features/soporte-sap/components/ui.tsx · Metricas (definición y supuesto)',
    comprobacion: prueba('riesgo-de-baja.ts', 'el riesgo de baja llega al tablero de la consultora con su fórmula y su umbral supuesto, y la pantalla los enseña'),
    sabotaje: { que: 'la tarjeta deja de enseñar el supuesto', ediciones: [ed('src/features/soporte-sap/components/ui.tsx', '{t.supuestos && <p data-supuesto={t.nombre}', '{false && <p data-supuesto={t.nombre}')] },
  },
  {
    id: 'aisia-riesgo-cliente', doc: 'AISIA', ref: 'Riesgo de baja como etiqueta', estado: 'probado',
    afirmacion: 'el cliente no ve su riesgo de baja (es un aviso para su consultora)',
    control: 'catálogo semántico · visibleAlCliente: false; SQL · ss_metrica_lee',
    comprobacion: prueba('riesgo-de-baja.ts', 'el cliente no ve su propio riesgo de baja'),
    sabotaje: { que: 'el catálogo lo declara visible al cliente', ediciones: [ed(`${SS}/semantica/corte.json`, '   "unidad": "bandera",\n   "visibleAlCliente": false,\n   "etapa": "renovacion",\n   "supuestos": "umbral de riesgo 0.85 (laboratorio)",', '   "unidad": "bandera",\n   "visibleAlCliente": true,\n   "etapa": "renovacion",\n   "supuestos": "umbral de riesgo 0.85 (laboratorio)",')] },
  },
  {
    id: 'aisia-riesgo-precio', doc: 'AISIA', ref: 'Riesgo de baja como etiqueta', estado: 'probado',
    afirmacion: 'el producto no conecta el riesgo con el precio ni con la prioridad de atención',
    control: 'src/pricing.ts y src/categoriza.ts no leen el riesgo ni la salud',
    comprobacion: prueba('riesgo-de-baja.ts', 'el riesgo de baja no entra al precio ni a la prioridad: ni el pricing ni el categorizador lo leen'),
    sabotaje: { que: 'el pricing lee la salud de la cuenta', ediciones: [ed(`${SS}/src/pricing.ts`, 'const QUIEN_PRECIO_INFRA = ', "const _salud = 'salud_cuenta'\nconst QUIEN_PRECIO_INFRA = ")] },
  },

  {
    id: 'aisia-primera-contrato', doc: 'AISIA', ref: 'Primera respuesta automática', infirmable: true, estado: 'probado',
    afirmacion: 'el contrato define la primera respuesta como un mensaje de una persona al cliente: una acción automática no cuenta (DP-4)',
    control: 'contratos/plantilla-contrato-sla.md §5',
    comprobacion: prueba('sla.ts', 'el contrato define la primera respuesta (DP-4), la pausa que el cliente ve y reanuda, y a quién escala la consultora (DP-3)'),
    sabotaje: { que: 'el contrato deja de decir que es de una persona', ediciones: [ed(`${SS}/contratos/plantilla-contrato-sla.md`, '8. La **primera respuesta** es un mensaje de una **persona** de quien', '8. La **primera respuesta** es un mensaje de quien')] },
  },
  {
    id: 'aisia-pausa-pide', doc: 'AISIA', ref: 'Pausa unilateral', infirmable: true, estado: 'probado',
    afirmacion: 'pausar el reloj dice qué se le pide al cliente: sin eso, la base no lo acepta',
    control: 'SQL · ss_priv.evento_de_quien_puede()',
    comprobacion: prueba('cierre-base.ts', 'pausa unilateral · pausar dice qué se le pide al cliente, y el cliente reanuda el reloj sin depender de nadie'),
    sabotaje: { que: 'se pausa sin pedir nada', ediciones: [ed(SQL, "  if new.tipo = 'ESPERA_CLIENTE' and length(coalesce(new.datos->>'pide', '')) < 10 then", '  if false then')] },
  },
  {
    id: 'aisia-pausa-cliente-reanuda', doc: 'AISIA', ref: 'Pausa unilateral', infirmable: true, estado: 'probado',
    afirmacion: 'el cliente de la incidencia reanuda el reloj él mismo al responder: no depende de su consultora',
    control: 'SQL · ss_priv.evento_de_quien_puede()',
    comprobacion: prueba('cierre-base.ts', 'pausa unilateral · pausar dice qué se le pide al cliente, y el cliente reanuda el reloj sin depender de nadie'),
    sabotaje: { que: 'solo la consultora reanuda', ediciones: [ed(SQL, "(ss_priv.rol_en(new.consultora_id) is not distinct from 'consultor' or ss_priv.rol_en(new.cliente_id) is not distinct from 'usuario_cliente')) then", "ss_priv.rol_en(new.consultora_id) is not distinct from 'consultor') then")] },
  },
  {
    id: 'aisia-pausa-agente', doc: 'AISIA', ref: 'Pausa unilateral', infirmable: true, estado: 'probado',
    afirmacion: 'la respuesta del cliente la registra una persona, del cliente o de su consultora: el agente no reanuda el reloj',
    control: 'SQL · ss_priv.evento_de_quien_puede()',
    comprobacion: prueba('cierre-base.ts', 'pausa unilateral · pausar dice qué se le pide al cliente, y el cliente reanuda el reloj sin depender de nadie'),
    sabotaje: { que: 'cualquiera reanuda', ediciones: [ed(SQL, "  if new.tipo = 'RESPUESTA_CLIENTE' and not (current_user = 'authenticated'", "  if false and not (current_user = 'authenticated'")] },
  },
  {
    id: 'aisia-pausa-app-pide', doc: 'AISIA', ref: 'Pausa unilateral', infirmable: true, estado: 'probado',
    afirmacion: 'en la app, el consultor pausa diciendo qué pide, y lo pedido queda en la cadena',
    control: 'src/features/soporte-sap/services/runtime.ts · pideAlCliente()',
    comprobacion: prueba('pantallas.ts', 'pausa unilateral · en la app, pausar dice qué se le pide al cliente, y el cliente de la incidencia la reanuda al responder'),
    sabotaje: { que: 'la app pausa sin pedir nada', ediciones: [ed('src/features/soporte-sap/services/runtime.ts', "  if (pide.trim().length < 10) throw new Rechazo('pausar el reloj lleva lo que se le pide al cliente')\n", '')] },
  },
  {
    id: 'aisia-pausa-app-cliente', doc: 'AISIA', ref: 'Pausa unilateral', infirmable: true, estado: 'probado',
    afirmacion: 'en la app, el cliente ve lo que se le pidió y reanuda el reloj al responder',
    control: 'src/features/soporte-sap/services/runtime.ts · respuestaDelCliente() y la pantalla',
    comprobacion: prueba('pantallas.ts', 'pausa unilateral · en la app, pausar dice qué se le pide al cliente, y el cliente de la incidencia la reanuda al responder'),
    sabotaje: { que: 'en la app solo reanuda la consultora', ediciones: [ed('src/features/soporte-sap/services/runtime.ts', "\n    && ((s.rol === 'consultor' && x.consultora === s.organizacion) || (s.rol === 'cliente' && x.cliente === s.organizacion)))", "\n    && (s.rol === 'consultor' && x.consultora === s.organizacion))")] },
  },
  {
    id: 'aisia-pausa-impugna', doc: 'AISIA', ref: 'Pausa unilateral', infirmable: true, estado: 'probado',
    afirmacion: 'el cliente puede impugnar una pausa del reloj; la queja queda en la cadena aunque la resuelva la misma consultora',
    control: 'SQL · ss_impugnacion.campo',
    comprobacion: prueba('cierre-base.ts', 'H-10 · la consultora no reescribe la queja del cliente; la resuelve a su nombre y no se reabre'),
    sabotaje: { que: 'una pausa no se puede impugnar', ediciones: [ed(SQL, "check (campo in ('prioridad', 'categoria', 'complejidad', 'pausa'))", "check (campo in ('prioridad', 'categoria', 'complejidad'))")] },
  },
  {
    id: 'aisia-pausa-contrato', doc: 'AISIA', ref: 'Pausa unilateral', infirmable: true, estado: 'probado',
    afirmacion: 'el contrato dice que lo pedido queda escrito, que el cliente lo ve y que registra su respuesta él mismo',
    control: 'contratos/plantilla-contrato-sla.md §5',
    comprobacion: prueba('sla.ts', 'el contrato define la primera respuesta (DP-4), la pausa que el cliente ve y reanuda, y a quién escala la consultora (DP-3)'),
    sabotaje: { que: 'el contrato deja la respuesta en manos de la consultora', ediciones: [ed(`${SS}/contratos/plantilla-contrato-sla.md`, 'su respuesta la registra **él mismo** (o su consultor)', 'su respuesta la registra su consultor')] },
  },
  {
    id: 'aisia-sla-despacho', doc: 'AISIA', ref: 'SLA mal medido', infirmable: true, estado: 'probado',
    afirmacion: 'en modo despacho la medición no se ofrece como evidencia independiente, y el contrato lo dice',
    control: 'contratos/plantilla-contrato-sla.md §5 (cláusula 9)',
    comprobacion: prueba('sla.ts', 'el contrato define la primera respuesta (DP-4), la pausa que el cliente ve y reanuda, y a quién escala la consultora (DP-3)'),
    sabotaje: { que: 'el contrato calla el modo despacho', ediciones: [ed(`${SS}/contratos/plantilla-contrato-sla.md`, '9. Si el servicio corre en un servidor de quien lo presta (**modo despacho**), la medición', '9. Si el servicio corre en un servidor de quien lo presta, la medición')] },
  },
  {
    id: 'aisia-lab-contrato-escala', doc: 'AISIA', ref: 'El laboratorio lee lo que no necesita', estado: 'probado',
    afirmacion: 'el contrato dice que al laboratorio lo escala la consultora, a su nombre, y que un agente no escala (DP-3)',
    control: 'contratos/plantilla-contrato-sla.md §6',
    comprobacion: prueba('sla.ts', 'el contrato define la primera respuesta (DP-4), la pausa que el cliente ve y reanuda, y a quién escala la consultora (DP-3)'),
    sabotaje: { que: 'el contrato vuelve a escalar solo', ediciones: [ed(`${SS}/contratos/plantilla-contrato-sla.md`, 'cuando **la consultora** lo escala, a su nombre', 'cuando hace falta')] },
  },
  {
    id: 'aisia-dato-contrato-cuarentena', doc: 'AISIA', ref: 'Dato personal en el sandbox', estado: 'probado',
    afirmacion: 'el contrato no promete que una persona revise la cuarentena (DP-7): lo que no se anonimiza con certeza no sirve para aprender',
    control: 'contratos/plantilla-contrato-sla.md §11',
    comprobacion: prueba('sla.ts', 'el contrato define la primera respuesta (DP-4), la pausa que el cliente ve y reanuda, y a quién escala la consultora (DP-3)'),
    sabotaje: { que: 'el contrato vuelve a prometer la revisión', ediciones: [ed(`${SS}/contratos/plantilla-contrato-sla.md`, '**no sirve para aprender**: queda en cuarentena', '**no sirve para aprender** hasta que la revisa una persona: queda en cuarentena')] },
  },
  {
    id: 'aisia-fatiga', doc: 'AISIA', ref: 'Fatiga del aprobador', estado: 'brecha',
    afirmacion: 'la fatiga del aprobador no la cierra una política',
    control: 'la mitigan el veredicto del supervisor, el antes y el después en el mismo mensaje y la huella de lo aprobado (filas de «Solución equivocada aprobada»)',
    nota: 'una persona que aprueba en verde tras cuarenta planes buenos no es comprobable con una prueba; mientras no haya SAP real (D6) su daño es al simulador, por eso no es infirmable hoy',
  },
  {
    id: 'aisia-grupo-chico', doc: 'AISIA', ref: 'Reidentificación por grupo chico', estado: 'depende',
    afirmacion: 'un agregado por tamaño con un solo cliente le da al laboratorio las cifras de ese cliente',
    control: 'D14', nota: 'el corte no aplica todavía un tamaño mínimo de grupo: fijarlo es parte de qué ve el superadministrador (D14). Son cifras de operación, no datos personales',
  },
  {
    id: 'aisia-grupo-chico-contrato', doc: 'AISIA', ref: 'Reidentificación por grupo chico', estado: 'probado',
    afirmacion: 'el contrato le dice al N3 que el laboratorio ve agregados de operación, sin textos ni nombres',
    control: 'contratos/plantilla-contrato-sla.md §11',
    comprobacion: prueba('sla.ts', 'el contrato define la primera respuesta (DP-4), la pausa que el cliente ve y reanuda, y a quién escala la consultora (DP-3)'),
    sabotaje: { que: 'el contrato calla los agregados', ediciones: [ed(`${SS}/contratos/plantilla-contrato-sla.md`, 'El laboratorio ve además **agregados de operación**', 'El laboratorio ve además')] },
  },
  // ──────────────────────────────── C3 ─────────────────────────────────
  {
    id: 'c3-token-firma', doc: 'C3', ref: 'Alcance de los roles de servicio (O6)', estado: 'probado',
    afirmacion: 'la consultora de la tarea sale del claim de un token firmado por el orquestador; cambiarla rompe la firma',
    control: 'src/token-tarea.ts · verificaTokenDeTarea()',
    comprobacion: prueba('token-tarea.ts', 'cambiar la consultora del cuerpo rompe la firma'),
    sabotaje: { que: 'la firma no se compara', ediciones: [ed(dist('token-tarea.js'), 'if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido))', 'if (false)')] },
  },
  {
    id: 'c3-token-alcance', doc: 'C3', ref: 'Alcance de los roles de servicio (O6)', estado: 'probado',
    afirmacion: 'con una tarea de A, el agente ve 0 filas de B: nunca fija su alcance',
    control: 'SQL · políticas *_agente_lee con ss_priv.consultora_de_tarea()',
    comprobacion: AISLAMIENTO,
    sabotaje: { que: 'el agente lee todas las consultoras', ediciones: [ed(SQL, "'create policy %I on public.%I for select to soporte_sap_agente using (consultora_id = ss_priv.consultora_de_tarea())', t || '_agente_lee', t);", "'create policy %I on public.%I for select to soporte_sap_agente using (true)', t || '_agente_lee', t);")] },
  },
  {
    id: 'c3-bypassrls', doc: 'C3', ref: 'Alcance de los roles de servicio (O6)', estado: 'probado',
    afirmacion: 'ninguno de los roles de servicio tiene bypassrls',
    control: 'SQL · create role … nobypassrls',
    comprobacion: prueba('esquema.ts', 'ningún rol de servicio sale con bypassrls ni puede decidir'),
    sabotaje: { que: 'los roles nacen con bypassrls y nada los corrige', ediciones: [
      ed(SQL, "execute format('create role %I nologin nobypassrls', r);", "execute format('create role %I nologin bypassrls', r);"),
      ed(SQL, "    execute format('alter role %I nologin nobypassrls', r);\n", '')] },
  },
  {
    id: 'c3-conexion-directa', doc: 'C3', ref: 'Alcance de los roles de servicio (O6)', infirmable: true, estado: 'probado',
    afirmacion: "con SQL, una sesión que fija sus variables (set_config, en la misma consulta) no cambia su alcance: la base verifica el token de su tarea (antes era una brecha declarada)",
    control: "SQL · ss_priv.consultora_de_tarea() lee ss_priv.claims_de_tarea(), no request.jwt.claims",
    comprobacion: prueba('cierre-base.ts', "H-21 · con set_config en la misma sesión, una tarea de A no lee B"),
    sabotaje: { que: "el alcance vuelve a salir de request.jwt.claims", ediciones: [
      ed(SQL, "  select ss_priv.uuid_o_nulo(ss_priv.claims_de_tarea() ->> 'consultora')", "  select ss_priv.uuid_o_nulo(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'consultora')")] },
  },
  {
    id: 'c3-token-base-firma', doc: 'C3', ref: 'Alcance de los roles de servicio (O6)', infirmable: true, estado: 'probado',
    afirmacion: "la firma del orquestador se verifica DENTRO de la base: un token firmado con otro secreto no da alcance (DP-2)",
    control: "SQL · ss_priv.firma_valida() (security definer, pgcrypto)",
    comprobacion: prueba('cierre-base.ts', "H-21 · un token falso, vencido o de otro rol no da alcance"),
    sabotaje: { que: "la base deja de comprobar la firma", ediciones: [
      ed(SQL, "  if not ss_priv.firma_valida(split_part(token, '.', 1), split_part(token, '.', 2)) then return null; end if;\n", "")] },
  },
  {
    id: 'c3-token-base-rol', doc: 'C3', ref: 'Alcance de los roles de servicio (O6)', infirmable: true, estado: 'probado',
    afirmacion: "el token es del rol de la sesión: uno legítimo de la ingesta no le sirve al agente",
    control: "SQL · ss_priv.claims_de_tarea() compara claims->>'rol' con current_user",
    comprobacion: prueba('cierre-base.ts', "H-21 · un token falso, vencido o de otro rol no da alcance"),
    sabotaje: { que: "la base deja de comprobar el rol", ediciones: [
      ed(SQL, "  if claims ->> 'rol' is distinct from current_user then return null; end if;\n", "")] },
  },
  {
    id: 'c3-token-base-vence', doc: 'C3', ref: 'Alcance de los roles de servicio (O6)', infirmable: true, estado: 'probado',
    afirmacion: "un token vencido no da alcance",
    control: "SQL · ss_priv.claims_de_tarea() compara exp con el reloj",
    comprobacion: prueba('cierre-base.ts', "H-21 · un token falso, vencido o de otro rol no da alcance"),
    sabotaje: { que: "la base deja de mirar el vencimiento", ediciones: [
      ed(SQL, "  if coalesce((claims ->> 'exp')::bigint, 0) <= (extract(epoch from clock_timestamp()) * 1000)::bigint then return null; end if;\n  return claims;", "  return claims;")] },
  },
  {
    id: 'c3-token-secreto', doc: 'C3', ref: 'Alcance de los roles de servicio (O6)', infirmable: true, estado: 'probado',
    afirmacion: "el secreto que firma los tokens no lo lee ningún rol de la API: solo la función que verifica",
    control: "SQL · ss_priv.secreto_tareas sin grants; revoke all from public",
    comprobacion: prueba('cierre-base.ts', "H-21 · el secreto de firma no lo lee ningún rol de la API"),
    sabotaje: { que: "el secreto queda legible", ediciones: [
      ed(SQL, "revoke all on ss_priv.secreto_tareas from public;", "grant select on ss_priv.secreto_tareas to public;")] },
  },
  {
    id: 'c3-sala-tenant-token', doc: 'C3', ref: 'Alcance de los roles de servicio (O6)', infirmable: true, estado: 'probado',
    afirmacion: 'en la sala, el agente no fija su tenant: lo verifica la base desde el token firmado de su tarea (S11)',
    control: 'tools/sala-a2a · sala_priv.tenant_de_tarea() con sala_priv.firma_valida()',
    comprobacion: { tipo: 'comando', carpeta: 'tools/sala-a2a', comando: ['node', 'evidencia/sabotajes.ts'] },
    sabotaje: { que: 'la suite de la sala siembra S11 (el tenant vuelve a ser una variable de sesión) y exige que caiga', integrado: true },
  },
  {
    id: 'c3-decision-mapeo', doc: 'C3', ref: 'Decisiones humanas (doble cierre en todas)', estado: 'probado',
    afirmacion: 'un rol de servicio solo inserta en estado inicial: el agente no inserta un mapeo ya aprobado',
    control: 'SQL · ss_mapeo_agente_propone',
    comprobacion: AISLAMIENTO,
    sabotaje: { que: 'el agente inserta mapeos aprobados', ediciones: [ed(SQL, "  with check (consultora_id = ss_priv.consultora_de_tarea() and estado = 'propuesto' and aprobado_por is null);", '  with check (consultora_id = ss_priv.consultora_de_tarea());')] },
  },
  {
    id: 'c3-decision-a-su-nombre', doc: 'C3', ref: 'Decisiones humanas (doble cierre en todas)', estado: 'probado',
    afirmacion: 'una persona decide a su nombre: decidida_por = auth.uid() (política restrictiva)',
    control: 'SQL · ss_propuesta_a_su_nombre',
    comprobacion: AISLAMIENTO,
    sabotaje: { que: 'se decide a nombre de otro', ediciones: [ed(SQL, '  with check (decidida_por is null or decidida_por = auth.uid());', '  with check (true);')] },
  },
  {
    id: 'c3-sala-mensaje', doc: 'C3', ref: 'Decisiones humanas (doble cierre en todas)', infirmable: true, estado: 'probado',
    afirmacion: 'una aprobación es del tenant, de la tarea y de la huella de su mensaje: un humano de B no aprueba el plan de A',
    control: 'tools/sala-a2a · disparador tg_sala_aprobacion_del_mensaje (S10, S10b)',
    comprobacion: { tipo: 'comando', carpeta: 'tools/sala-a2a', comando: ['node', 'evidencia/sabotajes.ts'] },
    sabotaje: { que: 'la suite de la sala siembra S10 (sin el disparador) y exige que S10 y S10b caigan', integrado: true },
  },
  {
    id: 'c3-sala', doc: 'C3', ref: 'Decisiones humanas (doble cierre en todas)', estado: 'probado',
    afirmacion: 'en la sala, la fila de aprobación no la fabrica ningún componente que ejecuta un modelo (sabotajes S1–S11)',
    control: 'tools/sala-a2a · política as restrictive, sin insert para servicios',
    comprobacion: { tipo: 'comando', carpeta: 'tools/sala-a2a', comando: ['node', 'evidencia/sabotajes.ts'] },
    sabotaje: { que: 'la suite de la sala siembra cada sabotaje en una base nueva y exige que caiga', integrado: true },
  },
  {
    id: 'c3-chat', doc: 'C3', ref: 'Decisiones humanas (doble cierre en todas)', estado: 'probado',
    afirmacion: 'aprobar desde el chat no aprueba: se promueve al hilo del plan en la sala',
    control: 'src/chat.ts · PIDE_APROBAR → promueve()',
    comprobacion: prueba('chat.ts', 'aprobar desde el chat NO aprueba: se promueve al hilo del plan y decide una persona en la sala'),
    sabotaje: { que: 'el chat deja de promover', ediciones: [ed(dist('chat.js'), 'if (PIDE_APROBAR.test(t))', 'if (false)')] },
  },
  {
    id: 'c3-fde-humano', doc: 'C3', ref: 'Decisiones humanas (doble cierre en todas)', estado: 'probado',
    afirmacion: 'el FDE propone y solo un humano decide',
    control: 'src/fde.ts · decide()',
    comprobacion: prueba('fde.ts', 'el FDE propone y solo un humano decide'),
    sabotaje: { que: 'el FDE decide', ediciones: [ed(dist('fde.js'), "if (quien.tipo !== 'humano')", 'if (false)')] },
  },
  {
    id: 'c3-fatiga', doc: 'C3', ref: 'Decisiones humanas (doble cierre en todas)', estado: 'brecha',
    afirmacion: 'la fatiga del aprobador (O3) no la cierra una política',
    control: 'la mitigan el veredicto del supervisor y el antes y el después del simulador en el mismo mensaje',
    nota: 'una persona que aprueba en verde tras cuarenta planes buenos no es comprobable con una prueba',
  },
  {
    id: 'c3-nulos-fallan-cerrado', doc: 'C3', ref: 'Decisiones humanas (doble cierre en todas)', estado: 'probado',
    afirmacion: 'en un disparador, lo que devuelve una función de ss_priv se compara con `is (not) distinct from`: ante un NULL, la regla falla cerrada',
    control: 'propuesta-soporte-sap.sql y propuesta-sala-a2a.sql, todos los disparadores',
    comprobacion: prueba('esquema.ts', 'en un disparador, lo que devuelve una función de ss_priv no se compara con = ni <>: con NULL no falla cerrado'),
    sabotaje: { que: 'vuelve el `=` en una regla de quién emite', ediciones: [
      ed(SQL, "or ss_priv.rol_en(new.cliente_id) is not distinct from 'usuario_cliente')) then", "or ss_priv.rol_en(new.cliente_id) = 'usuario_cliente')) then")] },
  },
  {
    id: 'c3-tenencia-hijas', doc: 'C3', ref: 'Tenencia atada (O2)', estado: 'probado',
    afirmacion: 'un disparador ata la tenencia de cada tabla hija a su incidencia',
    control: 'SQL · ss_priv.tenencia_de_incidencia()',
    comprobacion: prueba('esquema.ts', 'las tablas hijas no pueden contradecir la tenencia de su incidencia'),
    sabotaje: { que: 'la tenencia de la hija no se compara', ediciones: [ed(SQL, '  if c <> new.consultora_id or cl <> new.cliente_id then', '  if false then')] },
  },
  {
    id: 'c3-tenencia-bucket', doc: 'C3', ref: 'Tenencia atada (O2)', estado: 'probado',
    afirmacion: 'el bucket exige que la carpeta 2 sea cliente de la carpeta 1',
    control: 'SQL · ss_originales_sube',
    comprobacion: AISLAMIENTO,
    sabotaje: { que: 'se sube a cualquier carpeta', ediciones: [ed(SQL, '    and ss_priv.padre_de(ss_priv.carpeta(name, 2)) = ss_priv.carpeta(name, 1)\n', '')] },
  },
  {
    id: 'c3-cadena-base', doc: 'C3', ref: 'Tenencia atada (O2)', estado: 'probado',
    afirmacion: "la cadena de eventos la calcula la base (seq, anterior, hash y fecha), con la fórmula del código: quien escribe no elige ninguno, y el verificador del código acepta lo que deja la base",
    control: "SQL · disparador ss_evento_cadena con ss_priv.canonico()",
    comprobacion: prueba('cierre-base.ts', "H-13 · la base calcula la cadena, y el verificador del código la acepta"),
    sabotaje: { que: "la base vuelve a aceptar la cadena que le den", ediciones: [
      ed(SQL, "create trigger ss_evento_cadena before insert on public.ss_evento\n  for each row execute function ss_priv.evento_encadena();", "select 1;")] },
  },
  {
    id: 'c3-roles-corregidos', doc: 'C3', ref: 'Alcance de los roles de servicio (O6)', estado: 'probado',
    afirmacion: "un rol de servicio que ya existía con bypassrls o login queda corregido al aplicar el esquema",
    control: "SQL · alter role … nologin nobypassrls tras crearlos",
    comprobacion: prueba('cierre-base.ts', "H-14 · un rol de servicio que ya existía con bypassrls queda corregido al aplicar el esquema"),
    sabotaje: { que: "el esquema deja los roles como estaban", ediciones: [
      ed(SQL, "    execute format('alter role %I nologin nobypassrls', r);\n", "")] },
  },
  {
    id: 'c3-buckets-privados', doc: 'C3', ref: 'Tenencia atada (O2)', estado: 'probado',
    afirmacion: "los tres buckets son privados aunque ya existieran públicos",
    control: "SQL · on conflict (id) do update set public = false",
    comprobacion: prueba('cierre-base.ts', "H-14 · un bucket que ya existía público queda privado al aplicar el esquema"),
    sabotaje: { que: "un bucket público se queda público", ediciones: [
      ed(SQL, "on conflict (id) do update set public = false;", "on conflict (id) do nothing;")] },
  },
  {
    id: 'c3-campo-adjunto', doc: 'C3', ref: 'Tenencia atada (O2)', infirmable: true, estado: 'probado',
    afirmacion: "un campo extraído cuelga de un adjunto de su incidencia: el valor leído del documento de un cliente no aparece en la incidencia de otro",
    control: "SQL · disparador ss_campo_extraido_adjunto",
    comprobacion: prueba('cierre-base.ts', "H-14 · un campo extraído cuelga de un adjunto de SU incidencia"),
    sabotaje: { que: "el campo cuelga de cualquier adjunto", ediciones: [
      ed(SQL, "create trigger ss_campo_extraido_adjunto before insert or update on public.ss_campo_extraido\n  for each row execute function ss_priv.campo_de_su_adjunto();", "select 1;")] },
  },
  {
    id: 'c3-fila-crudo', doc: 'C3', ref: 'Tenencia atada (O2)', estado: 'probado',
    afirmacion: "una fila importada cuelga de un crudo de su consultora",
    control: "SQL · disparador ss_importacion_fila_crudo",
    comprobacion: prueba('cierre-base.ts', "H-14 · una fila importada no cuelga del crudo de otra consultora, ni un contrato del cliente de otra"),
    sabotaje: { que: "la fila cuelga de cualquier crudo", ediciones: [
      ed(SQL, "create trigger ss_importacion_fila_crudo before insert or update on public.ss_importacion_fila\n  for each row execute function ss_priv.fila_de_su_crudo();", "select 1;")] },
  },
  {
    id: 'c3-contrato-cliente', doc: 'C3', ref: 'Tenencia atada (O2)', estado: 'probado',
    afirmacion: "un contrato N2-N3 no se firma con el cliente de otra consultora",
    control: "SQL · ss_contrato_sla en la tenencia cliente-consultora",
    comprobacion: prueba('cierre-base.ts', "H-14 · una fila importada no cuelga del crudo de otra consultora, ni un contrato del cliente de otra"),
    sabotaje: { que: "el contrato se firma con cualquier cliente", ediciones: [
      ed(SQL, "  foreach t in array array['ss_importacion_fila', 'ss_metrica', 'ss_contrato_sla'] loop", "  foreach t in array array['ss_importacion_fila', 'ss_metrica'] loop")] },
  },
  {
    id: 'c3-chat-turno', doc: 'C3', ref: 'Decisiones humanas (doble cierre en todas)', estado: 'probado',
    afirmacion: "el agente escribe solo en el chat del usuario de su turno (el token de la tarea de chat lo nombra)",
    control: "SQL · ss_chat_agente con claims_de_tarea()->>'usuario'",
    comprobacion: prueba('cierre-base.ts', "H-12 · el agente escribe solo en el chat del usuario de su turno"),
    sabotaje: { que: "el agente escribe en cualquier chat", ediciones: [
      ed(SQL, "  with check (autor = 'agente' and usuario_id = ss_priv.uuid_o_nulo(ss_priv.claims_de_tarea() ->> 'usuario'));", "  with check (autor = 'agente');")] },
  },
  {
    id: 'aisia-consultor-horas-propias', doc: 'AISIA', ref: 'Consultor juzgado por una métrica', estado: 'probado',
    afirmacion: "cada consultor ve sus horas, no las de sus colegas una por una: no hay vista de desempeño individual",
    control: "SQL · ss_horas_lee compara consultor con el seudónimo de la sesión",
    comprobacion: prueba('cierre-base.ts', "H-05 · cada consultor ve sus horas, no las de sus colegas"),
    sabotaje: { que: "un consultor lee las horas de todos", ediciones: [
      ed(SQL, " using (ss_priv.rol_en(consultora_id) = 'consultor' and consultor = ss_priv.seudonimo(auth.uid()));", " using (ss_priv.rol_en(consultora_id) = 'consultor');")] },
  },
  {
    id: 'aisia-consultor-importador-sal', doc: 'AISIA', ref: 'Consultor juzgado por una métrica', estado: 'probado',
    afirmacion: 'el importador seudonimiza al consultor con HMAC y su sal: sin sal no se calcula, y adivinar el nombre ya no lo revierte',
    control: 'src/mapeo.ts · seudonimoDe()',
    comprobacion: prueba('mapeo.ts', 'H-32 · el seudónimo del importador lleva sal: sin ella no se calcula, y adivinar el nombre ya no lo revierte'),
    sabotaje: { que: 'el importador seudonimiza sin sal', ediciones: [ed(dist('mapeo.js'), 'if (s.sal.length < 16)', 'if (false)')] },
  },
  {
    id: 'aisia-consultor-sal', doc: 'AISIA', ref: 'Consultor juzgado por una métrica', estado: 'probado',
    afirmacion: "el seudónimo lleva una sal que solo lee la base: no se revierte con un md5 del id ni leyendo ss_miembro",
    control: "SQL · ss_priv.seudonimo() con ss_priv.sal_seudonimos",
    comprobacion: prueba('cierre-base.ts', "H-05 · el seudónimo no se revierte con un md5 del id, y la sal no la lee ningún rol de la API"),
    sabotaje: { que: "el seudónimo vuelve a ser el md5 del id", ediciones: [
      ed(SQL, "  select 'usr-' || left(encode(extensions.hmac(u::text, s.sal, 'sha256'), 'hex'), 12) from ss_priv.sal_seudonimos s where s.id = 1", "  select 'usr-' || left(md5(u::text), 12)")] },
  },
  {
    id: 'c3-tenencia-actor', doc: 'C3', ref: 'Tenencia atada (O2)', estado: 'probado',
    afirmacion: 'el actor de un evento lo da la base: una persona no firma con el seudónimo de otra',
    control: 'SQL · ss_priv.evento_honesto()',
    comprobacion: AISLAMIENTO,
    sabotaje: { que: 'cualquiera firma como otro', ediciones: [ed(SQL, "  if current_user = 'authenticated' and new.actor is distinct from ss_priv.seudonimo(auth.uid()) then", '  if false then')] },
  },
  {
    id: 'c3-datos-exportes', doc: 'C3', ref: 'Datos personales', estado: 'probado',
    afirmacion: 'los exportes son de la consultora y el laboratorio no los lee',
    control: 'SQL · ss_exportes_lee',
    comprobacion: AISLAMIENTO,
    sabotaje: { que: 'cualquiera lee los exportes', ediciones: [ed(SQL, "  using (bucket_id = 'ss-exportes' and ss_priv.rol_en(ss_priv.carpeta(name, 1)) = 'consultor');", "  using (bucket_id = 'ss-exportes');")] },
  },
  {
    id: 'c3-datos-ocr-local', doc: 'C3', ref: 'Datos personales', estado: 'probado',
    afirmacion: 'el OCR es local: un motor externo no entra, ni con decisión C4',
    control: 'src/ingesta.ts · validaConfig()',
    comprobacion: prueba('ingesta.ts', 'un motor externo no entra: sin decisión C4, ni con ella'),
    sabotaje: { que: 'se acepta un motor externo', ediciones: [ed(dist('ingesta.js'), "if (c.motor === 'externo') {", 'if (false) {')] },
  },
  {
    id: 'c3-datos-forma-desconocida', doc: 'C3', ref: 'Datos personales', estado: 'brecha',
    afirmacion: 'un dato sensible con una forma que ningún detector conoce',
    control: 'la cuarentena, y no un «probablemente limpio» (filas del dato personal de la AISIA)',
    nota: 'la referencia real la pone el corpus con consentimiento (D9)',
  },
  {
    id: 'c3-inyeccion-categoria', doc: 'C3', ref: 'Inyección (O1)', estado: 'probado',
    afirmacion: 'categoría y prioridad son deterministas y no leen instrucciones: una orden en el texto no sube la prioridad',
    control: 'src/categoriza.ts',
    comprobacion: prueba('categoriza.ts', 'una orden en el texto no sube la prioridad'),
    sabotaje: { que: 'el texto que pide P1 la obtiene', ediciones: [ed(dist('categoriza.js'), "if (pisoNomina && (prioridad === 'P3' || prioridad === 'P4')) {", "if (/\\bP1\\b/.test(texto)) prioridad = 'P1';\n    if (pisoNomina && (prioridad === 'P3' || prioridad === 'P4')) {")] },
  },
  {
    id: 'c3-inyeccion-documentos', doc: 'C3', ref: 'Inyección (O1)', estado: 'probado',
    afirmacion: 'el contenido de adjuntos es dato delimitado: instrucciones sembradas en texto, imagen y XML, 0 obedecidas',
    control: 'src/ingesta.ts · delimitaDocumento(); src/categoriza.ts',
    comprobacion: prueba('ingesta.ts', 'instrucciones sembradas en el texto, la imagen y el XML: 0 obedecidas'),
    sabotaje: { que: 'el texto que pide P1 la obtiene', ediciones: [ed(dist('categoriza.js'), "if (pisoNomina && (prioridad === 'P3' || prioridad === 'P4')) {", "if (/\\bP1\\b/.test(texto)) prioridad = 'P1';\n    if (pisoNomina && (prioridad === 'P3' || prioridad === 'P4')) {")] },
  },
  {
    id: 'c3-inyeccion-modelo', doc: 'C3', ref: 'Inyección (O1)', estado: 'brecha',
    afirmacion: 'el día que el modelo sea real, el corpus de inyecciones se corre contra él antes de encenderlo',
    control: 'hoy no hay modelo (D7)', nota: 'sin LLM real no hay qué medir: es brecha hasta D7',
  },
  {
    id: 'c3-archivos-bytes', doc: 'C3', ref: 'Archivos maliciosos y abuso (O1, O4)', estado: 'probado',
    afirmacion: 'se valida por bytes: un archivo que miente en su extensión se rechaza',
    control: 'src/ingesta.ts · ingiere()',
    comprobacion: prueba('ingesta.ts', 'un archivo que miente en su extensión se rechaza; uno que pasa del máximo, también'),
    sabotaje: { que: 'la extensión manda', ediciones: [ed(dist('ingesta.js'), 'if (real !== declarado)', 'if (false)')] },
  },
  {
    id: 'c3-archivos-tamano', doc: 'C3', ref: 'Archivos maliciosos y abuso (O1, O4)', estado: 'probado',
    afirmacion: 'se valida por tamaño: lo que pasa del máximo se rechaza',
    control: 'src/ingesta.ts · ingiere()',
    comprobacion: prueba('ingesta.ts', 'un archivo que miente en su extensión se rechaza; uno que pasa del máximo, también'),
    sabotaje: { que: 'sin tamaño máximo', ediciones: [ed(dist('ingesta.js'), 'if (bytes.byteLength > c.bytesMaximos)', 'if (false)')] },
  },
  {
    id: 'c3-archivos-adjuntos', doc: 'C3', ref: 'Archivos maliciosos y abuso (O1, O4)', estado: 'probado',
    afirmacion: 'hay un límite de adjuntos por incidencia (se implementó en este goal: la v3 lo afirmaba sin control)',
    control: 'src/ingesta.ts · adjuntosMaximos',
    comprobacion: prueba('ingesta.ts', 'una incidencia no pasa de su máximo de adjuntos: el siguiente se rechaza y se dice (C3, O4)'),
    sabotaje: { que: 'sin máximo de adjuntos', ediciones: [ed(dist('ingesta.js'), 'if (uso.adjuntos >= c.adjuntosMaximos)', 'if (false)')] },
  },
  {
    id: 'c3-archivos-ocr-tope', doc: 'C3', ref: 'Archivos maliciosos y abuso (O1, O4)', estado: 'probado',
    afirmacion: 'hay un tope de páginas de OCR por consultora (se implementó en este goal: la v3 lo afirmaba sin control)',
    control: 'src/ingesta.ts · paginasOcrMaximas',
    comprobacion: prueba('ingesta.ts', 'al tope de páginas de OCR de la consultora, la imagen queda como adjunto sin motor y se dice (C3, O4)'),
    sabotaje: { que: 'sin tope de OCR', ediciones: [ed(dist('ingesta.js'), 'if (paginasOcrRestantes <= 0)', 'if (false)')] },
  },
  {
    id: 'c3-ocr-tope-del-mes', doc: 'C3', ref: 'Archivos maliciosos y abuso (O1, O4)', estado: 'probado',
    afirmacion: 'el tope de OCR es el del mes de la consultora; sin tope declarado, o con lecturas sin medir, el OCR no corre',
    control: 'src/presupuesto.ts · ocrDelMes()',
    comprobacion: prueba('presupuesto.ts', 'H-18 · sin tope del mes, o con un plan sin sus tokens, no se llama al modelo: P1 y P2 a una persona, P3 y P4 esperan'),
    sabotaje: { que: 'sin tope del mes, el OCR corre igual', ediciones: [ed(dist('presupuesto.js'), '(p.topePaginasOcr ?? 0)', '(p.topePaginasOcr ?? 500)')] },
  },
  {
    id: 'c3-originales-solo-ingesta', doc: 'C3', ref: 'Archivos maliciosos y abuso (O1, O4)', estado: 'probado',
    afirmacion: 'al bucket de originales solo sube la ingesta, después de validar los bytes: ni el cliente ni su consultora suben directo',
    control: 'SQL · ss_originales_ingesta_sube (la política del cliente se quitó)',
    comprobacion: prueba('adjuntos.ts', 'H-23 · ni el cliente ni su consultora suben al bucket ni registran un adjunto: solo la ingesta, que valida los bytes'),
    sabotaje: { que: 'el cliente vuelve a subir directo', ediciones: [ed(SQL, 'drop policy if exists ss_originales_sube on storage.objects;\n', "drop policy if exists ss_originales_sube on storage.objects;\ncreate policy ss_originales_sube on storage.objects for insert to authenticated with check (bucket_id = 'ss-originales');\n")] },
  },
  {
    id: 'c3-adjunto-solo-ingesta', doc: 'C3', ref: 'Archivos maliciosos y abuso (O1, O4)', estado: 'probado',
    afirmacion: 'el adjunto lo registra la ingesta, que validó sus bytes: ni el cliente ni su consultora',
    control: 'SQL · ss_adjunto_ingesta_alta (la política de alta del cliente se quitó)',
    comprobacion: prueba('adjuntos.ts', 'H-23 · ni el cliente ni su consultora suben al bucket ni registran un adjunto: solo la ingesta, que valida los bytes'),
    sabotaje: { que: 'el cliente vuelve a registrar adjuntos', ediciones: [ed(SQL, 'drop policy if exists ss_adjunto_alta on public.ss_adjunto;\n', 'drop policy if exists ss_adjunto_alta on public.ss_adjunto;\ncreate policy ss_adjunto_alta on public.ss_adjunto for insert to authenticated with check (true);\n')] },
  },
  {
    id: 'c3-adjuntos-por-incidencia', doc: 'C3', ref: 'Archivos maliciosos y abuso (O1, O4)', estado: 'probado',
    afirmacion: 'una incidencia no pasa de 10 adjuntos, vengan en el lote que vengan: lo exige la base, y la ingesta cuenta desde los que ya tiene',
    control: 'SQL · ss_adjunto_tope; src/ingesta.ts · ingiereTodos(uso)',
    comprobacion: prueba('adjuntos.ts', 'H-23 · la base no admite más de 10 adjuntos por incidencia, vengan en el lote que vengan'),
    sabotaje: { que: 'sin el tope por incidencia en la base', ediciones: [ed(SQL, 'create trigger ss_adjunto_tope before insert on public.ss_adjunto\n  for each row execute function ss_priv.adjuntos_por_incidencia();', 'select 1;')] },
  },
  {
    id: 'c3-adjuntos-ingesta-cuenta', doc: 'C3', ref: 'Archivos maliciosos y abuso (O1, O4)', estado: 'probado',
    afirmacion: 'la ingesta cuenta los adjuntos desde los que ya tiene la incidencia, no desde cero en cada lote; y lo que el OCR lee de más no cuenta ni se usa',
    control: 'src/ingesta.ts · ingiereTodos() y lee()',
    comprobacion: prueba('ingesta.ts', 'H-23 · los adjuntos se cuentan por incidencia, y el OCR no pasa del tope aunque el motor lea más páginas'),
    sabotaje: { que: 'cada lote cuenta desde cero', ediciones: [ed(dist('ingesta.js'), 'let adjuntos = uso.adjuntos, paginasOcr = uso.paginasOcr;', 'let adjuntos = 0, paginasOcr = uso.paginasOcr;')] },
  },
  {
    id: 'c3-ocr-no-pasa-del-tope', doc: 'C3', ref: 'Archivos maliciosos y abuso (O1, O4)', estado: 'probado',
    afirmacion: 'el OCR no registra más páginas de las que le quedan al periodo, aunque el motor lea más: el resto queda sin extracción, y se dice',
    control: 'src/ingesta.ts · lee()',
    comprobacion: prueba('ingesta.ts', 'H-23 · los adjuntos se cuentan por incidencia, y el OCR no pasa del tope aunque el motor lea más páginas'),
    sabotaje: { que: 'cuenta todas las páginas que lea el motor', ediciones: [ed(dist('ingesta.js'), 'const paginas = leidas.slice(0, paginasOcrRestantes);', 'const paginas = leidas;')] },
  },
  {
    id: 'c3-subida-acotada', doc: 'C3', ref: 'Archivos maliciosos y abuso (O1, O4)', estado: 'probado',
    afirmacion: 'la ruta mira el tamaño de la subida antes de leerla: sin tamaño declarado o más grande que cinco adjuntos, responde 413 sin cargarla en memoria',
    control: 'src/app/api/soporte-sap/route.ts · MAX_CUERPO antes de formData()',
    comprobacion: prueba('superficie.ts', 'H-23 · la ruta mira el tamaño de la subida ANTES de leerla: sin tamaño declarado o más grande, no entra'),
    sabotaje: { que: 'la ruta lee la subida sin mirar su tamaño', ediciones: [ed('src/app/api/soporte-sap/route.ts', "      if (!(largo > 0 && largo <= MAX_CUERPO)) return NextResponse.json({ error: `la subida no declara su tamaño o pasa de ${MAX_CUERPO} bytes`, vista: vista(s) }, { status: 413 })\n", '')] },
  },
  {
    id: 'c3-documento-delimitado', doc: 'C3', ref: 'Inyección (O1)', estado: 'probado',
    afirmacion: 'lo leído de un documento entra a la incidencia delimitado como dato, y la prioridad sale de lo que declara el cliente',
    control: 'src/features/soporte-sap/services/runtime.ts · levanta()',
    comprobacion: prueba('superficie.ts', 'H-24 · en la app, lo leído de un documento entra delimitado como dato, y la prioridad sale de lo que declara el cliente'),
    sabotaje: { que: 'la app categoriza el texto mezclado', ediciones: [ed('src/features/soporte-sap/services/runtime.ts', '  const clasificacion = categoriza(declarado, documentos)', '  const clasificacion = categoriza(texto)')] },
  },
  {
    id: 'c3-parametros-de-documento', doc: 'C3', ref: 'Inyección (O1)', estado: 'brecha',
    afirmacion: 'un parámetro del plan (usuario SAP, BP, RFC) no sale de un documento del cliente sin que nadie lo vea',
    control: 'ninguno en el código: el ejecutor lee los parámetros del texto, documentos incluidos',
    nota: 'O1/O2, declarada (PRP-010 H-24): lo cubre la aprobación humana del plan, que muestra sus parámetros y se ata a su huella (H-11). Distinguir el origen de cada parámetro queda para cuando haya un modelo que lo extraiga',
  },
  {
    id: 'c3-archivos-doctype', doc: 'C3', ref: 'Archivos maliciosos y abuso (O1, O4)', estado: 'probado',
    afirmacion: 'el lector de XML rechaza <!DOCTYPE y toda declaración <!: no resuelve entidades externas',
    control: 'tools/extractor-documental/src/xml/lexico.ts',
    comprobacion: { tipo: 'prueba', carpeta: 'tools/extractor-documental', archivo: 'pruebas/xml-lexico.ts', nombre: 'el rechazo del DOCTYPE dice que no hay forma de permitirlo' },
    sabotaje: { que: 'el lector deja de rechazar el DOCTYPE por su nombre', ediciones: [ed('tools/extractor-documental/dist/xml/lexico.js', "if (fuente.startsWith('<!DOCTYPE', i)) {", 'if (false) {')] },
    nota: 'detrás hay dos barreras más: toda declaración <! se rechaza (fila siguiente) y una entidad desconocida es error',
  },
  {
    id: 'c3-archivos-declaraciones', doc: 'C3', ref: 'Archivos maliciosos y abuso (O1, O4)', estado: 'probado',
    afirmacion: 'cualquier otra declaración <! también se rechaza',
    control: 'tools/extractor-documental/src/xml/lexico.ts',
    comprobacion: { tipo: 'prueba', carpeta: 'tools/extractor-documental', archivo: 'pruebas/xml-lexico.ts', nombre: 'cualquier otra declaracion tambien se rechaza' },
    sabotaje: { que: 'el lector acepta declaraciones', ediciones: [ed('tools/extractor-documental/dist/xml/lexico.js', "if (fuente.startsWith('<!', i)) {", 'if (false) {')] },
  },
  {
    id: 'c3-archivos-memoria', doc: 'C3', ref: 'Archivos maliciosos y abuso (O1, O4)', estado: 'probado',
    afirmacion: 'el servicio de OCR corre con memoria acotada en su contenedor',
    control: 'docker-compose.yml · ocr.deploy.resources.limits.memory',
    comprobacion: prueba('superficie.ts', 'el OCR y el job de la capa semántica corren con memoria acotada en su contenedor'),
    sabotaje: { que: 'el OCR sin límite de memoria', ediciones: [ed('docker-compose.yml', '          cpus: "${OCR_CPUS:-2}"\n          memory: ${OCR_MEM:-2G}\n', '          cpus: "${OCR_CPUS:-2}"\n')] },
  },
  {
    id: 'c3-archivos-pdf', doc: 'C3', ref: 'Archivos maliciosos y abuso (O1, O4)', estado: 'brecha',
    afirmacion: 'un PDF de unos 300 KB tumba la app de todos los tenants: la capa 0 lo lee en el proceso de la app y el inflado no tiene tope',
    control: 'ninguno todavía: la memoria acotada del servicio de OCR (fila de arriba) no contiene lo que pasa en el proceso de la app',
    nota: 'PRP-010 H-22, en pausa: el tope de inflado se mide sobre el corpus real del extractor, no con entradas de estrés',
  },
  {
    id: 'c3-suministro-pines', doc: 'C3', ref: 'Cadena de suministro (O5)', estado: 'probado',
    afirmacion: 'dbt, MetricFlow y Postgres van pineados por versión y la imagen por digest',
    control: 'semantica/Dockerfile, semantica/requirements.lock, semantica/imagen.mjs',
    comprobacion: prueba('superficie.ts', 'el job de la capa semántica va pineado: imagen base por digest, lock con hashes y Postgres de los ensayos por digest'),
    sabotaje: { que: 'la imagen base por etiqueta', ediciones: [ed(`${SS}/semantica/Dockerfile`, 'FROM python@sha256:', 'FROM python:3.12-slim # ')] },
  },
  {
    id: 'c3-suministro-avisos', doc: 'C3', ref: 'Cadena de suministro (O5)', estado: 'brecha',
    afirmacion: 'nadie avisa de un parche de seguridad de dbt, MetricFlow o Postgres',
    control: 'hasta que un CDC adopte `vigila:versiones` para estas piezas', nota: 'brecha declarada',
  },
  {
    id: 'c3-jobs-plataforma', doc: 'C3', ref: 'Jobs de plataforma (C7, declarados)', estado: 'probado',
    afirmacion: 'el job de plataforma está acotado por su token a una consultora, también al borrar',
    control: 'SQL · políticas *_plataforma_lee y *_plataforma_borra con ss_priv.consultora_de_tarea()',
    comprobacion: AISLAMIENTO,
    sabotaje: { que: 'la plataforma ve y borra a todas', ediciones: [
      ed(SQL, "for select to soporte_sap_plataforma using (consultora_id = ss_priv.consultora_de_tarea())', t || '_plataforma_lee', t);", "for select to soporte_sap_plataforma using (true)', t || '_plataforma_lee', t);"),
      ed(SQL, "for delete to soporte_sap_plataforma using (consultora_id = ss_priv.consultora_de_tarea())', t || '_plataforma_borra', t);", "for delete to soporte_sap_plataforma using (true)', t || '_plataforma_borra', t);")] },
  },
  {
    id: 'c3-jobs-ingesta', doc: 'C3', ref: 'Jobs de plataforma (C7, declarados)', estado: 'probado',
    afirmacion: 'la ingesta está acotada por su token: con tarea de A no lista originales de B',
    control: 'SQL · ss_originales_ingesta',
    comprobacion: AISLAMIENTO,
    sabotaje: { que: 'la ingesta ve todos los originales', ediciones: [ed(SQL, "  using (bucket_id = 'ss-originales' and ss_priv.carpeta(name, 1) = ss_priv.consultora_de_tarea());", "  using (bucket_id = 'ss-originales');")] },
  },
  {
    id: 'c3-jobs-metricas-columnas', doc: 'C3', ref: 'Jobs de plataforma (C7, declarados)', estado: 'probado',
    afirmacion: 'el job de métricas lee a todas las consultoras pero ninguna columna de texto (títulos, descripciones, nombres, motivos)',
    control: 'SQL · grant select (columnas) on ss_incidencia to soporte_sap_metricas',
    comprobacion: prueba('metricas-rls.ts', 'el job de métricas lee a todos los tenants, pero ninguna columna de texto'),
    sabotaje: { que: 'el job lee la incidencia entera', ediciones: [ed(SQL, 'grant select (id, consultora_id, cliente_id, sistema, modulo, prioridad, complejidad, regla_aplicada, estado, creada_en,\n  primera_respuesta_en, resuelta_en, cerrada_en) on public.ss_incidencia to soporte_sap_metricas;', 'grant select on public.ss_incidencia to soporte_sap_metricas;')] },
  },
  {
    id: 'c3-jobs-metricas-escribe', doc: 'C3', ref: 'Jobs de plataforma (C7, declarados)', estado: 'probado',
    afirmacion: 'el job de métricas solo inserta en ss_metrica, que nadie cambia ni borra',
    control: 'SQL · ss_metrica_escribe (solo insert) y revoke update, delete',
    comprobacion: prueba('metricas-rls.ts', 'el job de métricas solo escribe el corte, y no lo cambia ni lo borra'),
    sabotaje: { que: 'el job puede cambiar y borrar el corte', ediciones: [
      ed(SQL, 'create policy ss_metrica_escribe on public.ss_metrica for insert to soporte_sap_metricas with check (true);', 'create policy ss_metrica_escribe on public.ss_metrica for all to soporte_sap_metricas using (true) with check (true);'),
      ed(SQL, 'revoke update, delete on public.ss_metrica from authenticated, soporte_sap_agente, soporte_sap_ingesta, soporte_sap_plataforma, soporte_sap_metricas;', 'grant update, delete on public.ss_metrica to soporte_sap_metricas;'),
    ] },
  },
  {
    id: 'c3-jobs-metricas-cliente', doc: 'C3', ref: 'Jobs de plataforma (C7, declarados)', estado: 'probado',
    afirmacion: 'el corte se lee por nivel, y el cliente solo lo que la métrica declara visible para él (en la base, no en el lector)',
    control: 'SQL · ss_metrica_lee con visible_al_cliente',
    comprobacion: prueba('metricas-rls.ts', 'el corte se lee por nivel: agregados, lo suyo y lo de sus clientes, solo lo suyo'),
    sabotaje: { que: 'el cliente lee lo interno', ediciones: [ed(SQL, "      or (alcance = 'cliente' and visible_al_cliente and ss_priv.ve_cliente(cliente_id)));", "      or (alcance = 'cliente' and ss_priv.ve_cliente(cliente_id)));")] },
  },
  {
    id: 'c3-jobs-grupo-chico', doc: 'C3', ref: 'Jobs de plataforma (C7, declarados)', estado: 'brecha',
    afirmacion: 'un agregado sobre un grupo muy chico puede delatar a ese cliente ante el laboratorio',
    control: 'el corte no aplica todavía un tamaño mínimo de grupo', nota: 'depende de D14 (qué ve el superadministrador): fijar el mínimo es parte de esa decisión',
  },
  {
    id: 'c3-ruta-declarada', doc: 'C3', ref: 'La ruta del laboratorio (`/api/soporte-sap`)', estado: 'probado',
    afirmacion: 'la ruta está declarada fuera del puente A2A (RF-20): una ruta sin declarar pone el gate en rojo',
    control: 'scripts/prueba-a2a.ts · RUTAS_FUERA_DEL_BRIDGE',
    comprobacion: { tipo: 'comando', carpeta: '.', comando: ['node', '--test', '--test-skip-pattern=^SERVICIO:', 'scripts/prueba-a2a.ts'] },
    sabotaje: { que: 'la ruta deja de estar declarada', ediciones: [ed('scripts/prueba-a2a.ts', "  '/api/soporte-sap',\n", '')] },
  },
  {
    id: 'c3-ruta-404', doc: 'C3', ref: 'La ruta del laboratorio (`/api/soporte-sap`)', estado: 'probado',
    afirmacion: 'responde 404 sin SOPORTE_SAP_LABORATORIO=1',
    control: 'src/app/api/soporte-sap/route.ts · guarda al principio de cada método',
    comprobacion: prueba('superficie.ts', 'la ruta del laboratorio responde 404 sin SOPORTE_SAP_LABORATORIO=1: cada método empieza con la guarda'),
    sabotaje: { que: 'el POST sin guarda', ediciones: [ed('src/app/api/soporte-sap/route.ts', 'export async function POST(req: NextRequest) {\n  if (!encendido()) return apagado()\n', 'export async function POST(req: NextRequest) {\n')] },
  },
  {
    id: 'c3-ruta-404-get', doc: 'C3', ref: 'La ruta del laboratorio (`/api/soporte-sap`)', estado: 'probado',
    afirmacion: 'el GET también responde 404 sin SOPORTE_SAP_LABORATORIO=1 (la prueba no lo veía: el GET no es async)',
    control: 'src/app/api/soporte-sap/route.ts · la guarda es la primera línea de cada método',
    comprobacion: prueba('superficie.ts', 'la ruta del laboratorio responde 404 sin SOPORTE_SAP_LABORATORIO=1: cada método empieza con la guarda'),
    sabotaje: { que: 'el GET sin guarda', ediciones: [ed('src/app/api/soporte-sap/route.ts', 'export function GET(req: NextRequest) {\n  if (!encendido()) return apagado()\n', 'export function GET(req: NextRequest) {\n')] },
  },
  {
    id: 'c3-ruta-sin-error-interno', doc: 'C3', ref: 'La ruta del laboratorio (`/api/soporte-sap`)', estado: 'probado',
    afirmacion: 'la ruta no le devuelve al usuario un error interno: solo los rechazos del laboratorio llevan su mensaje; lo demás va al log del servidor',
    control: 'src/app/api/soporte-sap/route.ts · Rechazo (runtime)',
    comprobacion: prueba('superficie.ts', 'H-25 · la ruta del laboratorio no le devuelve al usuario un error interno: solo los rechazos del laboratorio llevan su mensaje'),
    sabotaje: { que: 'la ruta devuelve el mensaje de cualquier error', ediciones: [ed('src/app/api/soporte-sap/route.ts', "e instanceof Rechazo ? e.message : null", "e instanceof Error ? e.message : null")] },
  },
  {
    id: 'c3-ruta-deploy', doc: 'C3', ref: 'La ruta del laboratorio (`/api/soporte-sap`)', estado: 'probado',
    afirmacion: 'configura:deploy rechaza la variable en producción',
    control: 'scripts/configura-deploy.mjs',
    comprobacion: prueba('superficie.ts', 'configura:deploy rechaza el laboratorio en producción y un SS_PG_HOST sin su usuario, sin imprimir la contraseña'),
    sabotaje: { que: 'configura:deploy deja pasar la variable', ediciones: [ed('scripts/configura-deploy.mjs', "if (valores.get('SOPORTE_SAP_LABORATORIO') === '1') {", 'if (false) {')] },
  },
  {
    id: 'c3-siembra-propuesta', doc: 'C3', ref: 'Siembra (frontera sandbox → núcleo)', estado: 'probado',
    afirmacion: 'el agente solo deja propuestas: no inserta una propuesta ya decidida',
    control: 'SQL · ss_propuesta_agente',
    comprobacion: AISLAMIENTO,
    sabotaje: { que: 'el agente inserta propuestas aprobadas', ediciones: [ed(SQL, "  with check (estado = 'propuesta' and decidida_por is null and (consultora_id is null or consultora_id = ss_priv.consultora_de_tarea()));", '  with check (true);')] },
  },
  {
    id: 'c3-siembra-firma', doc: 'C3', ref: 'Siembra (frontera sandbox → núcleo)', estado: 'brecha',
    afirmacion: 'hoy los veredictos salen de la matriz sintética del laboratorio (src/laboratorio/matriz.ts), no de tools/conocimiento: un commit la cambia sin el gate de firma',
    control: 'ninguno en el producto; en tools/conocimiento sí hay gate (dominio, versión, CAMBIOS y `npm run registra`)',
    nota: 'PRP-010 H-20: en el laboratorio las notas son sintéticas (dominio .invalid); antes de resolver incidencias reales, la matriz tiene que venir de tools/conocimiento',
  },
  {
    id: 'c3-superficie', doc: 'C3', ref: 'Superficie', estado: 'brecha',
    afirmacion: 'Realtime y el JWT de Supabase no se prueban sin un Supabase real',
    control: 'nada expuesto: exponer la sala o el canal N1–N2 es gate humano con este C3 y la AISIA firmados',
    nota: 'brecha declarada hasta conectar un Supabase real',
  },
  {
    id: 'c3-datos-ocr-deploy', doc: 'C3', ref: 'Datos personales', infirmable: true, estado: 'probado',
    afirmacion: 'configura:deploy no deja encender con Soporte SAP un motor de OCR fuera de la máquina, ni con una decisión C4 (límite de C5)',
    control: 'scripts/configura-deploy.mjs · OCR_RESPALDO con PRODUCTO=soporte-sap',
    comprobacion: prueba('despliegue.ts', 'con Soporte SAP, configura:deploy no deja encender un motor de OCR fuera de la máquina, ni con una decisión C4'),
    sabotaje: { que: 'configura:deploy deja encender un motor externo', ediciones: [ed('scripts/configura-deploy.mjs', "if (producto === 'soporte-sap' && valores.get('OCR_RESPALDO')) {", 'if (false) {')] },
  },
  {
    id: 'c3-procedencia', doc: 'C3', ref: 'Tenencia atada (O2)', estado: 'brecha',
    afirmacion: 'ss_procedencia no tiene a qué atarse: su registro es texto libre',
    control: 'la tenencia de la fila (consultora) sí se exige; el vínculo con lo que describe, no',
    nota: 'PRP-010 H-14, lo que quedó: no hay una fila a la que apunte',
  },
  {
    id: 'c3-buckets-limites', doc: 'C3', ref: 'Tenencia atada (O2)', estado: 'brecha',
    afirmacion: 'los buckets no fijan tamaño ni tipo en Storage',
    control: 'los valida la ingesta, que es la única que sube a originales (filas de «Archivos maliciosos y abuso»)',
    nota: 'depende de la versión de Storage; sin un Supabase real no se prueba',
  },
  {
    id: 'c3-plataforma-retencion', doc: 'C3', ref: 'Jobs de plataforma (C7, declarados)', estado: 'depende',
    afirmacion: 'la plataforma tiene el privilegio de borrar por retención, pero ningún job lo usa todavía',
    control: 'D8', nota: 'el plazo de retención y el job que borra esperan D8; en el respaldo inmutable los datos vencen con su bloqueo, no antes',
  },
  {
    id: 'c3-ruta-sin-autenticar', doc: 'C3', ref: 'La ruta del laboratorio (`/api/soporte-sap`)', estado: 'brecha',
    afirmacion: 'la ruta no autentica: con la variable encendida, cualquiera elige el rol, superadministrador incluido, y el GET le devuelve su vista',
    control: 'no se enciende fuera del laboratorio: configura:deploy rechaza la variable en producción (fila de arriba)',
    nota: 'PRP-010 H-25: identidades de laboratorio, no personas; autenticar es trabajo del producto real',
  },
  {
    id: 'c3-ruta-logs', doc: 'C3', ref: 'La ruta del laboratorio (`/api/soporte-sap`)', estado: 'brecha',
    afirmacion: 'lo que la ruta manda al log del servidor no está inventariado (ni retención ni dueño)',
    control: 'ninguno: el log del servidor no está en el inventario de respaldo ni de retención',
    nota: 'PRP-010 H-25, texto: hoy solo escribe errores internos del laboratorio, con datos sintéticos',
  },
  {
    id: 'c3-perfil-maquina', doc: 'C3', ref: 'Perfil de despliegue', estado: 'probado',
    afirmacion: 'configura:deploy compara la máquina con el tamaño contratado (vCPU, RAM y disco) y dice qué le falta',
    control: 'scripts/despliegue/perfil.mjs · cabe()',
    comprobacion: prueba('despliegue.ts', 'una máquina chica no cabe en el tamaño contratado, y se dice qué le falta'),
    sabotaje: { que: 'una máquina chica pasa', ediciones: [ed('scripts/despliegue/perfil.mjs', '  if (cortos.length) problemas.push(', '  if (false) problemas.push(')] },
  },
  {
    id: 'c3-perfil-region', doc: 'C3', ref: 'Perfil de despliegue', estado: 'probado',
    afirmacion: 'mientras D10 siga abierta, la región sale «pendiente de D10», nunca «cumple»',
    control: 'scripts/despliegue/perfil.mjs · region()',
    comprobacion: prueba('despliegue.ts', 'la región frente a D10: abierta, «pendiente» y nunca «cumple»; decidida, cumple o queda fuera; sin declarar, no pasa'),
    sabotaje: { que: 'la región se compara con una decisión abierta', ediciones: [ed('scripts/despliegue/perfil.mjs', "  if (r.estado !== 'decidida') {", '  if (false) {')] },
  },
  {
    id: 'c3-perfil-respaldo-falta', doc: 'C3', ref: 'Perfil de despliegue', estado: 'probado',
    afirmacion: 'sin destino de respaldo inmutable fuera de sitio, configura:deploy avisa',
    control: 'scripts/despliegue/perfil.mjs · respaldo()',
    comprobacion: prueba('despliegue.ts', 'sin destino de respaldo, aviso; un destino sin https o sin días de bloqueo, no pasa'),
    sabotaje: { que: 'la falta de respaldo pasa callada', ediciones: [ed('scripts/despliegue/perfil.mjs', '  if (faltan.length) { avisos.push(', '  if (false) { avisos.push(')] },
  },
  {
    id: 'c3-perfil-respaldo-https', doc: 'C3', ref: 'Perfil de despliegue', estado: 'probado',
    afirmacion: 'un destino de respaldo sin https no pasa',
    control: 'scripts/despliegue/perfil.mjs · respaldo()',
    comprobacion: prueba('despliegue.ts', 'sin destino de respaldo, aviso; un destino sin https o sin días de bloqueo, no pasa'),
    sabotaje: { que: 'las llaves viajan en claro', ediciones: [ed('scripts/despliegue/perfil.mjs', "  if (!/^https:\\/\\//i.test(v('RESPALDO_S3_URL'))) {", '  if (false) {')] },
  },
  {
    id: 'c3-perfil-respaldo-bloqueo', doc: 'C3', ref: 'Perfil de despliegue', estado: 'probado',
    afirmacion: 'un destino de respaldo sin días de bloqueo no pasa: sin bloqueo, se borra con la misma llave que lo sube',
    control: 'scripts/despliegue/perfil.mjs · respaldo()',
    comprobacion: prueba('despliegue.ts', 'sin destino de respaldo, aviso; un destino sin https o sin días de bloqueo, no pasa'),
    sabotaje: { que: 'un respaldo sin bloqueo pasa', ediciones: [ed('scripts/despliegue/perfil.mjs', '  if (!(Number.isInteger(dias) && dias >= 1)) {', '  if (false) {')] },
  },
  {
    id: 'c3-perfil-secretos', doc: 'C3', ref: 'Perfil de despliegue', estado: 'probado',
    afirmacion: 'los secretos del producto tienen que estar y tener 32 caracteres o más',
    control: 'scripts/despliegue/perfil.mjs · revisaPerfil()',
    comprobacion: prueba('despliegue.ts', 'los secretos del producto: si faltan o son cortos no pasa, y la medición no lleva ninguno'),
    sabotaje: { que: 'un secreto corto pasa', ediciones: [ed('scripts/despliegue/perfil.mjs', '    else if (largo < LARGO_MINIMO_SECRETO) problemas.push(', '    else if (false) problemas.push(')] },
  },
  {
    id: 'c3-perfil-no-imprime', doc: 'C3', ref: 'Perfil de despliegue', estado: 'probado',
    afirmacion: 'la medición, los avisos y los problemas no llevan ningún secreto',
    control: 'scripts/despliegue/perfil.mjs · revisaPerfil()',
    comprobacion: prueba('despliegue.ts', 'los secretos del producto: si faltan o son cortos no pasa, y la medición no lleva ninguno'),
    sabotaje: { que: 'la medición guarda una llave', ediciones: [ed('scripts/despliegue/perfil.mjs', "    proveedor: v('DESPLIEGUE_PROVEEDOR') || null,", "    proveedor: v('DESPLIEGUE_PROVEEDOR') || null, llave: v('RESPALDO_S3_LLAVE'),")] },
  },
  {
    id: 'c3-perfil-ocr-externo', doc: 'C3', ref: 'Perfil de despliegue', infirmable: true, estado: 'probado',
    afirmacion: 'con Soporte SAP, configura:deploy no deja encender un motor de OCR fuera de la máquina, ni con una decisión C4',
    control: 'scripts/configura-deploy.mjs · OCR_RESPALDO con PRODUCTO=soporte-sap',
    comprobacion: prueba('despliegue.ts', 'con Soporte SAP, configura:deploy no deja encender un motor de OCR fuera de la máquina, ni con una decisión C4'),
    sabotaje: { que: 'configura:deploy deja encender un motor externo', ediciones: [ed('scripts/configura-deploy.mjs', "if (producto === 'soporte-sap' && valores.get('OCR_RESPALDO')) {", 'if (false) {')] },
  },
  {
    id: 'c3-perfil-predeploy', doc: 'C3', ref: 'Perfil de despliegue', estado: 'probado',
    afirmacion: 'configura:deploy corre en predeploy siempre, también con el sello vigente (H-26)',
    control: '.claude/gates.json · perfiles.predeploy.siempre',
    comprobacion: prueba('superficie.ts', 'H-26 · configura:deploy corre en predeploy SIEMPRE, también con el sello vigente: mide la máquina y el .env del servidor'),
    sabotaje: { que: 'con sello, predeploy se lo salta', ediciones: [ed('.claude/gates.json', '"siempre": ["verifica:privado", "configura:deploy"],', '"siempre": ["verifica:privado"],')] },
  },
  {
    id: 'c3-perfil-ficha', doc: 'C3', ref: 'Perfil de despliegue', estado: 'probado',
    afirmacion: 'la ficha de servidor no dice «apto» sin una restauración probada en esa máquina (GATE 3)',
    control: 'src/ficha.ts · veredictoDeFicha()',
    comprobacion: prueba('despliegue.ts', 'la ficha de servidor no dice «apto» sin la restauración probada en esa máquina, aunque todo lo demás esté'),
    sabotaje: { que: 'la ficha dice apto sin GATE 3', ediciones: [ed(dist('ficha.js'), '    if (!f.restauracion)', '    if (false)')] },
  },
  {
    id: 'c3-perfil-autodeclarado', doc: 'C3', ref: 'Perfil de despliegue', estado: 'brecha',
    afirmacion: 'la región, el proveedor y las respuestas sobre snapshots los declara quien instala',
    control: 'ninguno desde la máquina: los verifica quien contrata', nota: 'O2: es texto que nadie puede comprobar desde el servidor',
  },
  {
    id: 'c3-root-lee', doc: 'C3', ref: 'Root ajeno (modo despacho)', estado: 'brecha',
    afirmacion: 'en modo despacho, quien tiene root lee la base entera, los secretos y los respaldos, y la RLS no lo impide',
    control: 'ninguno: va al contrato y a D3',
    nota: 'lo que ve es la operación de su propia consultora (sus clientes, las horas de cada consultor y quién es cada seudónimo); lo que no se ofrece por eso es la fila siguiente',
  },
  {
    id: 'c3-root-sla-contrato', doc: 'C3', ref: 'Root ajeno (modo despacho)', infirmable: true, estado: 'probado',
    afirmacion: 'en modo despacho la medición del SLA no se ofrece como evidencia independiente frente al N3, y el contrato lo dice',
    control: 'contratos/plantilla-contrato-sla.md §5 (cláusula 9)',
    comprobacion: prueba('sla.ts', 'el contrato define la primera respuesta (DP-4), la pausa que el cliente ve y reanuda, y a quién escala la consultora (DP-3)'),
    sabotaje: { que: 'el contrato calla que root puede reescribirla', ediciones: [ed(`${SS}/contratos/plantilla-contrato-sla.md`, '   tiene root en ese servidor puede reescribirla. En ese modo, la medición **no es evidencia independiente** frente', '   tiene root en ese servidor puede reescribirla. En ese modo, la medición es evidencia frente')] },
  },
]
