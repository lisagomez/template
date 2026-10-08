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
    afirmacion: 'anonimizador fail-closed: lo que no se resuelve con certeza va a cuarentena; 0 fugas en el corpus sembrado',
    control: 'src/anonimiza.ts · anonimiza(): veredicto «cuarentena» con cualquier señal',
    comprobacion: prueba('anonimiza.ts', '0 fugas: ningún valor sembrado sale en un texto que entra al sandbox'),
    sabotaje: { que: 'todo entra al sandbox, con o sin señales', ediciones: [ed(dist('anonimiza.js'), "veredicto: senales.length ? 'cuarentena' : 'entra'", "veredicto: 'entra'")] },
  },
  {
    id: 'aisia-dato-adversarial', doc: 'AISIA', ref: 'Dato personal en el sandbox', infirmable: true, estado: 'probado',
    afirmacion: 'las 63 entradas del revisor adversarial no fugan (la referencia la puso quien no escribió el detector)',
    control: 'src/anonimiza.ts · reemplazaNombres(): un nombre se reconoce porque no es vocabulario',
    comprobacion: prueba('anonimiza.ts', 'las 63 entradas del revisor adversarial: ninguna fuga, una por una'),
    sabotaje: { que: 'sin el detector de nombres por exclusión', ediciones: [ed(dist('anonimiza.js'), 'return reemplazaNombres(t, c);', 'return t;')] },
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
    afirmacion: 'un caso de RR. HH. o nómina va a revisión humana antes del sandbox, aunque esté bien anonimizado',
    control: 'src/anonimiza.ts · CONTEXTO_PERSONAL',
    comprobacion: prueba('anonimiza.ts', 'todo caso de RR. HH. o nómina va a revisión humana, aunque esté bien anonimizado'),
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
    sabotaje: { que: 'el caso en cuarentena deja de atenderse', ediciones: [ed('src/features/soporte-sap/services/runtime.ts', "  i.sla.push({ tipo: 'PRIMERA_RESPUESTA', fecha: ahora() })\n  i.estado = 'en_atencion'\n}", "  if (a.veredicto === 'entra') i.sla.push({ tipo: 'PRIMERA_RESPUESTA', fecha: ahora() })\n  if (a.veredicto === 'entra') i.estado = 'en_atencion'\n}")] },
  },
  {
    id: 'aisia-dato-corpus-real', doc: 'AISIA', ref: 'Dato personal en el sandbox', infirmable: true, estado: 'depende',
    afirmacion: 'antes de salir del laboratorio el anonimizador se mide sobre un corpus real con consentimiento, con revisión humana',
    control: 'D9', nota: 'en laboratorio no hay corpus real: el riesgo infirmable queda contenido porque no se opera con datos reales',
  },
  {
    id: 'aisia-secreto-generaliza', doc: 'AISIA', ref: 'Secreto del N3 en el núcleo', estado: 'probado',
    afirmacion: 'lo que va al núcleo se generaliza además de anonimizarse: transacciones Z, sociedades y nombres del cliente',
    control: 'src/anonimiza.ts · generaliza()',
    comprobacion: prueba('anonimiza.ts', 'generalizar para el núcleo quita también lo que identifica al cliente'),
    sabotaje: { que: 'las transacciones Z pasan tal cual', ediciones: [ed(dist('anonimiza.js'), "let t = a.texto.replace(/\\b(Z[A-Z0-9_]{2,30})\\b/g, '[TRANSACCION_Z]').replace(", 'let t = a.texto.replace(')] },
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
      ed(dist('categoriza.js'), "const pisoNomina = CONTEXTO_PERSONAL.test(texto) || modulo === 'HCM'", "const pisoNomina = /(n[oó]mina|pc00_m32)/i.test(texto) || modulo === 'HCM'")] },
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
    id: 'aisia-sla-persona', doc: 'AISIA', ref: 'SLA mal medido', infirmable: true, estado: 'probado',
    afirmacion: "la primera respuesta, la pausa del reloj y la resolución son actos de una persona: el agente no las emite (DP-4)",
    control: "SQL · ss_priv.evento_de_quien_puede()",
    comprobacion: prueba('cierre-base.ts', 'H-17 · el agente no marca la primera respuesta, ni pausa el reloj, ni resuelve (DP-4)'),
    sabotaje: { que: "el agente emite cualquier evento", ediciones: [
      ed(SQL, "     and not (current_user = 'authenticated' and ss_priv.rol_en(new.consultora_id) = 'consultor') then", "     and false then")] },
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
    id: 'aisia-impugna-queja', doc: 'AISIA', ref: 'Prioridad mal asignada', infirmable: true, estado: 'probado',
    afirmacion: "la consultora no reescribe la queja del cliente: de una impugnación solo decide su estado, a su nombre",
    control: "SQL · grant update (estado, resuelta_por) on ss_impugnacion",
    comprobacion: prueba('cierre-base.ts', 'H-10 · la consultora no reescribe la queja del cliente; la resuelve a su nombre y no se reabre'),
    sabotaje: { que: "la consultora puede reescribir la impugnación", ediciones: [
      ed(SQL, "grant update (estado, resuelta_por) on public.ss_impugnacion to authenticated;", "grant update on public.ss_impugnacion to authenticated;")] },
  },
  {
    id: 'aisia-impugna-cierre', doc: 'AISIA', ref: 'Prioridad mal asignada', infirmable: true, estado: 'probado',
    afirmacion: "una impugnación resuelta queda fechada por la base y no se reabre; el cliente puede impugnar también una pausa del reloj",
    control: "SQL · ss_priv.impugnacion_fechas() y campo «pausa»",
    comprobacion: prueba('cierre-base.ts', 'H-10 · la consultora no reescribe la queja del cliente; la resuelve a su nombre y no se reabre'),
    sabotaje: { que: "una impugnación resuelta se reabre", ediciones: [
      ed(SQL, "    raise exception 'una impugnación resuelta no se reabre ni se cambia';", "    null;")] },
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
    control: 'src/pricing.ts · controlDeCosto()',
    comprobacion: prueba('pricing.ts', 'control de costos: avisa al 80 %; al tope, P1 y P2 pasan a una persona y P3 y P4 esperan; sin fila, nada llama al modelo'),
    sabotaje: { que: 'al tope, P1 y P2 también se cortan', ediciones: [ed(dist('pricing.js'), "if (prioridad === 'P1' || prioridad === 'P2')", 'if (false)')] },
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
    afirmacion: "el rol de plataforma no inserta nada: ni un mapeo aprobado, ni un campo confirmado, ni horas, ni un evento con el seudónimo de un consultor",
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
    afirmacion: 'un PDF que agote memoria en el parser',
    control: 'la memoria acotada del contenedor (fila de arriba) contiene el daño al VPS',
    nota: 'no hay prueba con un PDF hostil: la contención es del contenedor, no del parser',
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
    control: 'el corte no aplica todavía un tamaño mínimo de grupo', nota: 'depende de D9 (corpus real) para fijar el mínimo',
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
    afirmacion: 'lo que cambia un veredicto lo firma el laboratorio en tools/conocimiento',
    control: 'control de la fábrica (dominio, versión, CAMBIOS y `npm run registra`), fuera del producto',
    nota: 'esta matriz no lo sabotea: lo vigila el gate de la fábrica sobre tools/conocimiento',
  },
  {
    id: 'c3-superficie', doc: 'C3', ref: 'Superficie', estado: 'brecha',
    afirmacion: 'Realtime y el JWT de Supabase no se prueban sin un Supabase real',
    control: 'nada expuesto: exponer la sala o el canal N1–N2 es gate humano con este C3 y la AISIA firmados',
    nota: 'brecha declarada hasta conectar un Supabase real',
  },
]
