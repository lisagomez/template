/**
 * Banco de CONTROL del anonimizador y del generalizador (PRP-010 H-04 y H-19), 2026-10-08. Lo escribió un agente
 * DESPUÉS del arreglo, sin ver el detector, sus pruebas ni el primer banco (`_banco-independiente.ts`), y lo midió una
 * sola vez como caja negra, antes de que nadie tocara el código por él. Esa es la medida honesta:
 *
 *   anonimiza  · 3 fugas de 30 (un `usr=`, un teléfono con O por 0 y l por 1, un diminutivo en minúsculas),
 *                0 de 4 casos de nómina fuera de revisión, 4 de 10 controles técnicos tapados
 *   generaliza · 0 fugas de 20, 1 de 6 controles tapados (campos estándar que empiezan con Z, sueltos)
 *
 * Después se arreglaron, así que ya no es independiente: queda como fixture permanente, igual que el primero.
 * Un caso no se borra ni se afloja para que pase. Todo dato es inventado; el texto de abajo es el del agente.
 */

export type CasoControl = {
  texto: string
  noDebeQuedar: string[]
  debeQuedar?: string[]
  revision?: boolean
}

// ---------------------------------------------------------------------------
// anonimiza: 30 adversariales + 10 controles tecnicos
// ---------------------------------------------------------------------------

const ADVERSARIALES_ANONIMIZA: CasoControl[] = [
  // 1. todo en minusculas, apellido nahuatl
  {
    texto:
      'hola buenas tardes, soy maricela tzompantzi de cuentas por pagar. la F110 no genera el archivo de pagos desde ayer.',
    noDebeQuedar: ['maricela', 'tzompantzi'],
    debeQuedar: ['F110'],
  },
  // 2. apodos y diminutivos; "Memo" tambien es palabra
  {
    texto:
      'Le pasé el error a Lupita y a Chuy, pero dicen que la MIGO no les marca nada. El Memo ya revisó la ME21N y tampoco.',
    noDebeQuedar: ['Lupita', 'Chuy', 'Memo'],
    debeQuedar: ['MIGO', 'ME21N'],
  },
  // 3. nombres indigenas con acentos
  {
    texto:
      'Buenos días: Xóchitl Itzel Cuauhtle Tlapale reporta que la VA01 se queda colgada al guardar el pedido.',
    noDebeQuedar: ['Xóchitl', 'Itzel', 'Cuauhtle', 'Tlapale'],
    debeQuedar: ['VA01'],
  },
  // 4. nombres y apellidos que tambien son palabras
  {
    texto:
      'Consuelo Prado y Salvador Reyes no pueden liberar las solicitudes en la ME54N; Amparo dice que es la estrategia de liberación.',
    noDebeQuedar: ['Consuelo', 'Prado', 'Salvador', 'Reyes', 'Amparo'],
    debeQuedar: ['ME54N', 'estrategia de liberación'],
  },
  // 5. iniciales y firma abreviada
  {
    texto: 'No sale el pago en la F-53. Lo autoriza J.A.M.R. desde Tesorería.\nAtte. A. Tlapanco H.',
    noDebeQuedar: ['J.A.M.R.', 'Tlapanco'],
    debeQuedar: ['F-53'],
  },
  // 6. firma de correo con cargo y celular
  {
    texto:
      'La KSU5 marca el error KI235 al repartir.\nQuedo atento.\n--\nIng. Fermín Ixtlahuaca Ruelas\nJefe de Costos | Ext. 4417\nCel. 55 3871 2290',
    noDebeQuedar: ['Fermín', 'Ixtlahuaca', 'Ruelas', '3871 2290'],
    debeQuedar: ['KSU5', 'KI235'],
  },
  // 7. saludo con dos puntos y despedida con apodo
  {
    texto:
      'Buen día Paco:\nla MIRO me rechaza la factura con el mensaje M8 108. ¿Me echas la mano?\nSaludos, Nacho',
    noDebeQuedar: ['Paco', 'Nacho'],
    debeQuedar: ['MIRO', 'M8 108'],
  },
  // 8. reenvio con cabeceras
  {
    texto:
      '---------- Mensaje reenviado ---------\nDe: Teodora Quiñones Lugo <tquinones.lugo@correo-ejemplo.mx>\nEnviado: martes, 6 de octubre de 2026 09:12\nPara: Mesa de Ayuda SAP\nAsunto: RV: error en FB60\n\nNo me deja contabilizar la factura del acreedor.',
    noDebeQuedar: ['Teodora', 'Quiñones', 'Lugo', 'tquinones'],
    debeQuedar: ['FB60'],
  },
  // 9. usuarios de red DOMINIO\usuario
  {
    texto:
      'El usuario de red CORPMX\\rgarciav no puede entrar al SAP GUI; el de su compañera es CORPMX\\ehuitron.',
    noDebeQuedar: ['rgarciav', 'ehuitron'],
    debeQuedar: ['SAP GUI'],
  },
  // 10. usuarios SAP en varias formas
  {
    texto:
      'Favor de desbloquear el usuario SAP RHERNANDEZ2 y el de su suplente (user: LTZINTZUN) en el mandante 300; también usr=pchimal_ext.',
    noDebeQuedar: ['RHERNANDEZ2', 'LTZINTZUN', 'pchimal_ext'],
    debeQuedar: ['mandante 300'],
  },
  // 11. usuario dentro de una salida de SU53
  {
    texto:
      'Salida de la SU53:\nUsuario: MOCTEZUMAJ\nObjeto de autorización: M_BEST_BSA\nCampo ACTVT valor 01',
    noDebeQuedar: ['MOCTEZUMAJ'],
    debeQuedar: ['SU53', 'M_BEST_BSA', 'ACTVT'],
  },
  // 12. correo ofuscado con "arroba" y "punto"
  {
    texto:
      'mándenme la respuesta a nayeli.cuevas arroba gmail punto com porque no tengo acceso al portal de proveedores',
    noDebeQuedar: ['nayeli', 'cuevas'],
  },
  // 13. correo ofuscado con [at] y (dot)
  {
    texto:
      'Escríbanle a h_zamarripa[at]outlook(dot)com, él lleva el tema del IDoc ORDERS05 con estatus 51.',
    noDebeQuedar: ['zamarripa'],
    debeQuedar: ['ORDERS05', 'estatus 51'],
  },
  // 14. correo con espacios alrededor de los separadores
  {
    texto: 'mi correo personal es eli . bautista @ hotmail . com, el corporativo no me llega',
    noDebeQuedar: ['bautista'],
  },
  // 15. telefonos con puntos y con +52 1 y espacios
  {
    texto:
      'Llámenme al 55.4189.2730 o al WhatsApp +52 1 81 2604 7193 si vuelve a caer el job; mándenme captura del ST22.',
    noDebeQuedar: ['4189.2730', '2604 7193'],
    debeQuedar: ['ST22'],
  },
  // 16. nomina sin nombre: aguinaldo de un grupo
  {
    texto:
      'Necesito que me ayuden: el aguinaldo de la gente de la planta salió con el ISR mal calculado en la PC00_M32_CAGI.',
    noDebeQuedar: [],
    revision: true,
  },
  // 17. RFC de persona fisica con OCR (O por 0)
  {
    texto: 'Datos del acreedor (persona física) escaneados: RFC GOMA81O923KJ7, no lo toma la FK01.',
    noDebeQuedar: ['GOMA81O923KJ7'],
    debeQuedar: ['FK01'],
  },
  // 18. CURP en minusculas
  {
    texto: 'la curp del contratista es tozl900415mdflrs08 y la XK02 la rechaza por longitud',
    noDebeQuedar: ['tozl900415mdflrs08'],
    debeQuedar: ['XK02'],
  },
  // 19. telefonos con OCR (O por 0, l por 1) y con guiones
  {
    texto: 'Tel. de contacto (escaneado): 55 2O48 6l93; alterno 33-1290-8847',
    noDebeQuedar: ['2O48', '6l93', '1290-8847'],
  },
  // 20. NSS con espacios, caso de nomina
  {
    texto:
      'El trabajador con NSS 4291 85 3317 6 no aparece en el cálculo de la nómina quincenal (PC00_M32_CALC).',
    noDebeQuedar: ['4291', '3317'],
    revision: true,
  },
  // 21. CLABE con espacios y nombre de pila
  {
    texto:
      'Para el reembolso de viáticos depositen a la CLABE 012 180 01547823916 4 a nombre de Octavio.',
    noDebeQuedar: ['01547823916', 'Octavio'],
  },
  // 22. domicilio completo
  {
    texto:
      'Enviar el lector de código de barras a Calle Tlacotalpan 47 int. 3, Col. Roma Sur, C.P. 06760, CDMX, con atención a la Sra. Benita.',
    noDebeQuedar: ['Tlacotalpan 47', '06760', 'Benita'],
  },
  // 23. monto de nomina de una persona (finiquito)
  {
    texto:
      'A Efrén le pagaron $18,450.32 de finiquito y el recibo de nómina no timbró; revisen la PC00_M32_CFDI.',
    noDebeQuedar: ['Efrén', '18,450.32'],
    revision: true,
  },
  // 24. RR. HH. con numero de personal
  {
    texto:
      'El número de personal 00045821 tiene incapacidad por maternidad y el infotipo 2001 no la toma en la PA30.',
    noDebeQuedar: ['00045821'],
    revision: true,
  },
  // 25. todo en MAYUSCULAS sin acentos
  {
    texto:
      'BUEN DIA, SOY GUADALUPE ESCAMILLA ROSAS DE TESORERIA, LA FF7A NO ME MUESTRA EL SALDO DE BANCOS.',
    noDebeQuedar: ['GUADALUPE', 'ESCAMILLA', 'ROSAS'],
    debeQuedar: ['FF7A'],
  },
  // 26. nombres pegados a puntuacion, apellidos mayas
  {
    texto:
      'La CO11N no notifica la operación 0010.\nRevisado por:Anselmo Ocampo/Rutilo Bernal;ok.(cc:Wilberth Canul Pech)',
    noDebeQuedar: ['Anselmo', 'Ocampo', 'Rutilo', 'Bernal', 'Wilberth', 'Canul', 'Pech'],
    debeQuedar: ['CO11N'],
  },
  // 27. titulos pegados al nombre
  {
    texto:
      'Lo valida el C.P.Heriberto Salgado y la Lic.Graciela Ugalde antes del cierre en la OB52.',
    noDebeQuedar: ['Heriberto', 'Salgado', 'Graciela', 'Ugalde'],
    debeQuedar: ['OB52'],
  },
  // 28. menciones de chat con @
  {
    texto:
      '@Yatziri Montes @fidel.ocaña ya quedó liberada la orden de transporte, pruébenla en QAS.',
    noDebeQuedar: ['Yatziri', 'Montes', 'fidel', 'ocaña'],
    debeQuedar: ['orden de transporte', 'QAS'],
  },
  // 29. cabecera en ingles "Apellido, Nombre" y apodo con apellido
  {
    texto:
      'From: Tepoz Alvarado, Ruth\nSent: 07/10/2026\nEl Güero Saldaña dice que la VL02N no contabiliza la salida de mercancías.',
    noDebeQuedar: ['Tepoz', 'Alvarado', 'Ruth', 'Saldaña'],
    debeQuedar: ['VL02N'],
  },
  // 30. diminutivos en minusculas y nombre partido por guion de OCR
  {
    texto:
      'la laptop de chuyita no abre el SAP Logon; dice tere que es el saplogon.ini. Solicitante: Maximi-\nliano Herrera',
    noDebeQuedar: ['chuyita', 'tere', 'Maximi', 'Herrera'],
    debeQuedar: ['saplogon.ini'],
  },
]

const CONTROLES_ANONIMIZA: CasoControl[] = [
  {
    texto:
      'Al contabilizar en la FB01 aparece el mensaje F5 702 «Saldo en moneda de transacción». La tabla BSEG no se actualiza y la BKPF sí.',
    noDebeQuedar: [],
    debeQuedar: ['FB01', 'F5 702', 'BSEG', 'BKPF'],
  },
  // tablas con forma de nombre propio (Mara, Marc)
  {
    texto:
      'Los datos de MARA y MARC no coinciden después de la carga; revisen también MARD y MAKT con la SE16N.',
    noDebeQuedar: [],
    debeQuedar: ['MARA', 'MARC', 'MARD', 'MAKT', 'SE16N'],
  },
  // palabras en mayuscula al inicio de frase
  {
    texto: 'Urgente. Mañana se corre el cierre de mes. Favor de no bloquear periodos en la OB52. Gracias.',
    noDebeQuedar: [],
    debeQuedar: ['Urgente', 'Mañana', 'OB52', 'Gracias'],
  },
  // siglas fiscales mexicanas
  {
    texto:
      'El CFDI 4.0 no timbra: el PAC responde CFDI40147 y el SAT rechaza el IVA 16% del complemento.',
    noDebeQuedar: [],
    debeQuedar: ['CFDI 4.0', 'PAC', 'CFDI40147', 'SAT', 'IVA 16%'],
  },
  {
    texto:
      'El job SAP_REORG_JOBS y el programa RSPO1041 fallan en la SM37 con el dump TSV_TNEW_PAGE_ALLOC_FAILED.',
    noDebeQuedar: [],
    debeQuedar: ['SAP_REORG_JOBS', 'RSPO1041', 'SM37', 'TSV_TNEW_PAGE_ALLOC_FAILED'],
  },
  // palabras comunes que tambien son nombres (luz)
  {
    texto:
      'Después del parche ya hay luz verde: la ST22 quedó limpia y el estatus del pedido cambió a «Liberado».',
    noDebeQuedar: [],
    debeQuedar: ['luz verde', 'ST22', 'Liberado'],
  },
  // palabras que tambien son apellidos, al inicio de frase
  {
    texto:
      'Campos obligatorios en la VBAP: Material, Centro y Cantidad. Mercado nacional usa la clase de documento de ventas OR.',
    noDebeQuedar: [],
    debeQuedar: ['Campos obligatorios', 'VBAP', 'Cantidad', 'Mercado nacional'],
  },
  // transacciones con forma de nombre (Miró)
  {
    texto:
      'Usar la MIGO con clase de movimiento 101 y después la MB51; la MIRO y la MIR7 quedan para cuentas por pagar.',
    noDebeQuedar: [],
    debeQuedar: ['MIGO', 'MB51', 'MIRO', 'MIR7'],
  },
  // numeros de documento de 10 digitos (forma de telefono) y fecha
  {
    texto:
      'El documento contable 5100004321 del ejercicio 2026 y la entrega 8000123456 no cuadran desde el 08/10/2026; ver la tabla VBFA.',
    noDebeQuedar: [],
    debeQuedar: ['5100004321', '8000123456', '08/10/2026', 'VBFA'],
  },
  // campos que hablan de nombres y correos, sin datos
  {
    texto:
      'El campo NAME1 de la KNA1 y el campo SMTP_ADDR de la ADR6 se truncan a 40 caracteres; en la SCOT y la SOST los correos salen con error.',
    noDebeQuedar: [],
    debeQuedar: ['NAME1', 'KNA1', 'SMTP_ADDR', 'ADR6', 'SCOT', 'SOST'],
  },
]

export const CONTROL_ANONIMIZA: ReadonlyArray<CasoControl> = [
  ...ADVERSARIALES_ANONIMIZA,
  ...CONTROLES_ANONIMIZA,
]

// ---------------------------------------------------------------------------
// generaliza: 20 adversariales + 6 controles de objetos estandar
// Cliente inventado: Panificadora Huaxtépec del Bajío (siglas PHB), marca Crujimiel.
// Consultora inventada: Ixtlán Consultores en Sistemas.
// ---------------------------------------------------------------------------

export const NOMBRES_CONTROL: string[] = [
  'Panificadora Huaxtépec del Bajío, S.A. de C.V.',
  'Crujimiel',
  'Ixtlán Consultores en Sistemas, S.C.',
]

const ADVERSARIALES_GENERALIZA: CasoControl[] = [
  // 1. reporte Z
  {
    texto:
      'El reporte ZFI_ANTIGUEDAD_SALDOS truena por TIME_OUT cuando corre en fondo desde la SM36.',
    noDebeQuedar: ['ZFI_ANTIGUEDAD_SALDOS'],
    debeQuedar: ['TIME_OUT', 'SM36'],
  },
  // 2. transaccion Y en minusculas
  {
    texto: 'corrí la ysd_reparto y luego la VL10B, pero no se crean las entregas',
    noDebeQuedar: ['ysd_reparto'],
    debeQuedar: ['VL10B'],
  },
  // 3. namespace propio con las siglas del cliente
  {
    texto:
      'La clase /PHB/CL_PRECIOS_ESP lanza CX_SY_ZERODIVIDE en el método CALCULA_DESCUENTO.',
    noDebeQuedar: ['/PHB/CL_PRECIOS_ESP', 'PHB'],
    debeQuedar: ['CX_SY_ZERODIVIDE'],
  },
  // 4. campos ZZ y YY
  {
    texto:
      'El campo ZZCANAL_PROMO de la VBAK viene vacío y el append YYDATOS_EXTRA de la EKKO tampoco se llena.',
    noDebeQuedar: ['ZZCANAL_PROMO', 'YYDATOS_EXTRA'],
    debeQuedar: ['VBAK', 'EKKO'],
  },
  // 5. sociedad con etiqueta en espanol
  {
    texto: 'En la sociedad MX17 no aparece el periodo abierto en la OB52.',
    noDebeQuedar: ['MX17'],
    debeQuedar: ['OB52'],
  },
  // 6. valores de estructura como parametros CAMPO = valor
  {
    texto: 'Parámetros del job: BUKRS = 4120, WERKS = P031, LGORT = AL07.',
    noDebeQuedar: ['4120', 'P031', 'AL07'],
    debeQuedar: ['BUKRS', 'WERKS', 'LGORT'],
  },
  // 7. centro numerico en minusculas + clase de mensaje propia
  {
    texto:
      'en el centro 1210 el MRP (MD01N) no genera solicitudes de pedido y sale el mensaje ZMM 017.',
    noDebeQuedar: ['1210', 'ZMM 017'],
    debeQuedar: ['MD01N'],
  },
  // 8. almacen + job Y
  {
    texto:
      'Hay stock en el almacén PT03 pero la MMBE lo muestra en cero; el job YMM_RECALCULA de la SM37 no ayudó.',
    noDebeQuedar: ['PT03', 'YMM_RECALCULA'],
    debeQuedar: ['MMBE', 'SM37'],
  },
  // 9. organizaciones de ventas y compras abreviadas + clase de pedido Z
  {
    texto:
      'Org. ventas VMX2, canal 10; org. compras CMX1: la VA01 y la ME21N (clase de pedido ZNB2) toman precios distintos.',
    noDebeQuedar: ['VMX2', 'CMX1', 'ZNB2'],
    debeQuedar: ['VA01', 'ME21N'],
  },
  // 10. area de control
  {
    texto: 'En el área de control HX00 la KSB1 no muestra los costos reales del mes.',
    noDebeQuedar: ['HX00'],
    debeQuedar: ['KSB1'],
  },
  // 11. centro de coste
  {
    texto:
      'El centro de coste 4100250 (Mantenimiento Planta Sur) no acepta la planificación en la KP06.',
    noDebeQuedar: ['4100250'],
    debeQuedar: ['KP06'],
  },
  // 12. cliente sin acentos y en minusculas
  {
    texto: 'aquí en panificadora huaxtepec usamos la VF01 para facturar y sale doble.',
    noDebeQuedar: ['huaxtepec'],
    debeQuedar: ['VF01'],
  },
  // 13. cliente en mayusculas con razon social abreviada sin puntos
  {
    texto:
      'PANIFICADORA HUAXTÉPEC DEL BAJÍO SA DE CV requiere el reporte de ventas por región desde la MCSI.',
    noDebeQuedar: ['HUAXTÉPEC'],
    debeQuedar: ['MCSI'],
  },
  // 14. siglas del cliente
  {
    texto: 'En PHB tienen el mismo problema que otros clientes con la F110 y los avisos de pago.',
    noDebeQuedar: ['PHB'],
    debeQuedar: ['F110'],
  },
  // 15. marca con complemento
  {
    texto: 'Las devoluciones de Crujimiel Integral no se reflejan en la VA01 con clase RE.',
    noDebeQuedar: ['Crujimiel'],
    debeQuedar: ['VA01'],
  },
  // 16. marca dentro de un numero de material
  {
    texto: 'El material CRUJIMIEL-500G no tiene vista de ventas en la MM03.',
    noDebeQuedar: ['CRUJIMIEL'],
    debeQuedar: ['MM03'],
  },
  // 17. consultora sin acento, solo palabra distintiva
  {
    texto:
      'Nos atendió el equipo de Ixtlan Consultores y dejaron un transporte abierto en la STMS.',
    noDebeQuedar: ['Ixtlan'],
    debeQuedar: ['STMS'],
  },
  // 18. consultora y cliente en la descripcion de un transporte
  {
    texto: 'La orden de transporte DEVK912345 tiene la descripción «IXTLAN PHB rollout ola 2».',
    noDebeQuedar: ['IXTLAN', 'PHB'],
    debeQuedar: ['orden de transporte'],
  },
  // 19. copia Z de una BAPI estandar + modulo de funciones Z
  {
    texto:
      'Se copió la BAPI_PO_CREATE1 a ZBAPI_PO_CREA_ESP y la BAdI ME_PROCESS_PO_CUST llama al FM ZMM_PO_VALIDA.',
    noDebeQuedar: ['ZBAPI_PO_CREA_ESP', 'ZMM_PO_VALIDA'],
    debeQuedar: ['BAPI_PO_CREATE1', 'ME_PROCESS_PO_CUST'],
  },
  // 20. persona + transaccion Z en minusculas + tabla y vista Z
  {
    texto:
      'Juvencio Tlapa reportó que la zmm045 y la tabla ZTSD_COMISIONES (vista ZV_COMIS en la SM30) no guardan.',
    noDebeQuedar: ['Juvencio', 'Tlapa', 'zmm045', 'ZTSD_COMISIONES', 'ZV_COMIS'],
    debeQuedar: ['SM30'],
  },
]

const CONTROLES_GENERALIZA: CasoControl[] = [
  {
    texto:
      'La VA01 crea registros en VBAK y VBAP; el flujo de documentos se ve en la VBFA y en la VA03.',
    noDebeQuedar: [],
    debeQuedar: ['VA01', 'VBAK', 'VBAP', 'VBFA', 'VA03'],
  },
  // nombres de campo de estructura (sin valor) deben quedarse
  {
    texto:
      'Los campos BUKRS, WERKS y LGORT son obligatorios en la BAPI_GOODSMVT_CREATE con clase de movimiento 261.',
    noDebeQuedar: [],
    debeQuedar: ['BUKRS', 'WERKS', 'LGORT', 'BAPI_GOODSMVT_CREATE'],
  },
  // namespaces estandar de SAP
  {
    texto:
      'El servicio OData basado en /IWBEP/CL_MGW_ABS_DATA y el monitor /SCWM/MON responden HTTP 500 desde el Fiori Launchpad.',
    noDebeQuedar: [],
    debeQuedar: ['/IWBEP/CL_MGW_ABS_DATA', '/SCWM/MON', 'HTTP 500', 'Fiori Launchpad'],
  },
  // campos ESTANDAR que empiezan con Z
  {
    texto:
      'En la F110 revisen ZLSCH, ZTERM y ZFBDT de la partida en BSEG; el campo ZUONR viene vacío y el ZLSPR bloquea el pago.',
    noDebeQuedar: [],
    debeQuedar: ['F110', 'ZLSCH', 'ZTERM', 'ZFBDT', 'BSEG', 'ZUONR', 'ZLSPR'],
  },
  {
    texto:
      'La BAdI ME_PROCESS_PO_CUST y el programa RFBIBL00 se ejecutan desde la SE38 en S/4HANA 2023 con SAP_BASIS 758.',
    noDebeQuedar: [],
    debeQuedar: ['ME_PROCESS_PO_CUST', 'RFBIBL00', 'SE38', 'S/4HANA 2023', 'SAP_BASIS 758'],
  },
  // claves estandar de 4 caracteres con forma de codigo de estructura
  {
    texto: 'La condición PR00 y el impuesto MWST no se calculan en el esquema RVAA01; la K007 sí aplica.',
    noDebeQuedar: [],
    debeQuedar: ['PR00', 'MWST', 'RVAA01', 'K007'],
  },
]

export const CONTROL_GENERALIZA: ReadonlyArray<CasoControl> = [
  ...ADVERSARIALES_GENERALIZA,
  ...CONTROLES_GENERALIZA,
]
