/**
 * Banco adversarial INDEPENDIENTE del anonimizador y del generalizador (PRP-010 H-04 y H-19), 2026-10-08. Lo escribió
 * un agente que NO leyó `anonimiza.ts`, `lexico.ts` ni sus pruebas: un banco escrito por quien escribió el detector
 * es circular (la v1 daba 0 fugas sobre su banco y 54 de 63 sobre el de un revisor). Todo es inventado.
 *
 * Es fixture PERMANENTE: un caso no se borra ni se afloja para que pase; si el detector no lo cubre, el caso va a
 * cuarentena (falla seguro) o se arregla el detector. `noDebeQuedar` y `debeQuedar` se comparan sin mayúsculas.
 * Los controles (`noDebeQuedar: []`) miden lo contrario: que el detector no tape lo técnico.
 */

/** Las 5 frases de la revisión del 2026-10-07 que entraban al sandbox con el dato (H-04), solas y dentro de un ticket. */
export const FRASES_DE_LA_REVISION: ReadonlyArray<{ readonly texto: string; readonly noDebeQuedar: readonly string[] }> = [
  { texto: 'pepe gonzalez de almacen', noDebeQuedar: ['pepe', 'gonzalez'] },
  { texto: 'reporta pepe gonzalez de almacen que la MIGO no contabiliza la 101', noDebeQuedar: ['pepe', 'gonzalez'] },
  { texto: 'jgarcia', noDebeQuedar: ['jgarcia'] },
  { texto: 'favor de desbloquear a jgarcia, no puede entrar a la VA01', noDebeQuedar: ['jgarcia'] },
  { texto: 'doña Lupita', noDebeQuedar: ['lupita'] },
  { texto: 'doña Lupita de compras no puede liberar el pedido en ME29N', noDebeQuedar: ['lupita'] },
  { texto: 'El chofer Ramiro', noDebeQuedar: ['ramiro'] },
  { texto: 'El chofer Ramiro no puede confirmar la entrega en la VL02N', noDebeQuedar: ['ramiro'] },
  { texto: 'rosa punto elena en gmail', noDebeQuedar: ['rosa', 'elena'] },
  { texto: 'mándenle el layout a rosa punto elena en gmail, ella lo revisa', noDebeQuedar: ['rosa', 'elena'] },
]

/** Lo que la misma revisión encontró que `generaliza` dejaba pasar al núcleo (H-19). */
export const GENERALIZA_DE_LA_REVISION: ReadonlyArray<{ readonly texto: string; readonly noDebeQuedar: readonly string[] }> = [
  { texto: 'El job YFI_PAGOS termina con dump', noDebeQuedar: ['yfi_pagos'] },
  { texto: 'el reporte zmm_precios no trae nada', noDebeQuedar: ['zmm_precios'] },
  { texto: 'La clase /ACME/CL_FACTURA no se activa', noDebeQuedar: ['acme'] },
  { texto: 'falla en la sociedad MX01', noDebeQuedar: ['mx01'] },
  { texto: 'el campo BUKRS 2000 no se llena', noDebeQuedar: ['2000'] },
  { texto: 'Sociedad: 2000 no tiene el periodo abierto', noDebeQuedar: ['2000'] },
  { texto: 'en el centro 1010 no hay stock', noDebeQuedar: ['1010'] },
]

/** Los casos de nómina o RR. HH. del banco («→ revisión»): además de no fugar, NO entran al sandbox. */
export const DE_REVISION_HUMANA: readonly string[] = ['Maru', 'PA40 la CURP', 'infotipo 0185', 'neto de la quincena']

/** Los nombres con los que se llama a `generaliza` en `BANCO_GENERALIZA`: la razón social del cliente y su marca. */
export const NOMBRES_DEL_CLIENTE: readonly string[] = ['Lácteos La Huasteca, S.A. de C.V.', 'Huastequita']

export const BANCO_ANONIMIZA: ReadonlyArray<{ readonly texto: string; readonly noDebeQuedar: readonly string[]; readonly debeQuedar?: readonly string[] }> = [
  // --- nombres, apodos, iniciales ---
  { texto: 'favor de darle acceso a la VA02 a juan carlos mendoza ruiz, entra el lunes a almacén', noDebeQuedar: ['juan', 'carlos', 'mendoza', 'ruiz'] }, // nombre completo en minúsculas
  { texto: 'Lo reportó Chuy, el del turno de noche: la MIGO se queda pensando con la 101', noDebeQuedar: ['chuy'] }, // apodo (Jesús)
  { texto: 'No me deja liberar la solicitud de pedido en ME54N, ya intenté dos veces. saludos, Toño', noDebeQuedar: ['toño'] }, // firma con apodo
  { texto: 'Pregúntale a la de nóminas, Maru, por qué no corrió el cálculo en PC00_M32_CALC', noDebeQuedar: ['maru'] }, // apodo entre comas; nómina → revisión
  { texto: 'El pedido 4500087712 lo aprobó J.L.R. ayer en la ME29N pero sigue bloqueado', noDebeQuedar: ['j.l.r'] }, // iniciales con puntos
  { texto: 'Quedo atento a sus comentarios. Atte. A. Domínguez R.', noDebeQuedar: ['domínguez'] }, // firma inicial + apellido + inicial
  { texto: 'Comenta el ing quintanilla que la orden de mantenimiento no libera en IW32', noDebeQuedar: ['quintanilla'] }, // apellido solo, título sin punto, minúsculas
  { texto: 'Hola,Fernanda:no puedo entrar a PRD desde ayer, me sale contraseña bloqueada', noDebeQuedar: ['fernanda'] }, // nombre pegado a coma y dos puntos
  { texto: 'Buenas tardes Inge Paty, le comparto el log de la SM35 con los errores del batch input', noDebeQuedar: ['paty'] }, // saludo con título coloquial + diminutivo
  { texto: 'Ya quedó el ajuste en la MB1A (cc: Ximena Ugalde y Rebeca)', noDebeQuedar: ['ximena', 'ugalde', 'rebeca'] }, // entre paréntesis; nombre suelto tras «y»
  { texto: 'Solicita María de la Luz Treviño de la Garza que le habiliten la F-53 para pagos manuales', noDebeQuedar: ['maría', 'de la luz', 'treviño', 'garza'] }, // nombre y apellidos compuestos con «de la»
  { texto: 'URGENTE!!! SOY BEATRIZ DE CUENTAS POR PAGAR Y NO SALE LA F110 DESDE AYER', noDebeQuedar: ['beatriz'] }, // nombre en mayúsculas, parece código
  // --- usuarios de sistema ---
  { texto: 'Se bloqueó el usuario MLOPEZ01 por intentos fallidos, favor de desbloquear en SU01', noDebeQuedar: ['mlopez'] }, // usuario SAP = inicial + apellido + dígitos
  { texto: 'bloquearon a fernando.ibarra en el sistema de calidad y no puede probar la VL02N', noDebeQuedar: ['fernando', 'ibarra'] }, // usuario con punto, sin arroba
  { texto: 'Al modificar el pedido sale que lo está tratando el usuario RTORRESV desde la mañana', noDebeQuedar: ['rtorres'] }, // usuario dentro de mensaje de bloqueo
  { texto: 'el job lo dejó programado CORP\\dsalinas con su usuario de red y ya no trabaja aquí', noDebeQuedar: ['dsalinas'] }, // usuario de dominio Windows
  // --- correos ofuscados ---
  { texto: 'Mándenle el reporte a gabriela.sanchez arroba gmail punto com, ella lo revisa', noDebeQuedar: ['gabriela', 'sanchez'] }, // «arroba» y «punto» en palabras
  { texto: 'Mi correo alterno es hector_villa[at]outlook[dot]com por si no llega el de la empresa', noDebeQuedar: ['hector', 'villa'] }, // [at] [dot]
  { texto: 'escríbanle a lmartinez @ hotmail . com, ella tiene el layout del banco', noDebeQuedar: ['lmartinez'] }, // espacios alrededor de @ y .
  { texto: 'CONTACTO PARA DUDAS: ADRIANA.FUENTES(AT)YAHOO.COM.MX', noDebeQuedar: ['adriana', 'fuentes'] }, // (AT) en mayúsculas
  { texto: '-----Mensaje original----- De: Valeria Ochoa <vochoa@proveedor-ejemplo.mx> Enviado: martes', noDebeQuedar: ['valeria', 'ochoa'] }, // cabecera de correo reenviado
  // --- teléfonos ---
  { texto: 'Si no contesto márquenle a mi jefe al 55·4821·3907 ext. 210', noDebeQuedar: ['4821', '3907'] }, // separador punto medio
  { texto: 'Mi WhatsApp es +52 1 (81) 2468-1357, ahí me mandan la captura del dump', noDebeQuedar: ['2468', '1357'] }, // lada internacional con paréntesis
  // --- RFC, CURP, NSS, CLABE ---
  { texto: 'El proveedor es persona física, RFC GUMA-850712-HK3, y no lo deja dar de alta en la XK01', noDebeQuedar: ['guma', '850712'] }, // RFC con guiones
  { texto: 'rfc:hegj7804156t2 ya está en la LFA1 pero el SAT lo rechaza', noDebeQuedar: ['hegj', '780415'] }, // RFC en minúsculas pegado a «rfc:»
  { texto: 'Para el alta en PA40 la CURP es ROSL 921105 MDFDRS 07', noDebeQuedar: ['rosl', '921105', 'mdfdrs'] }, // CURP partida en bloques; RR. HH. → revisión
  { texto: 'Su NSS sale como 62-19-88-0453-7 en el infotipo 0185 y el IMSS lo rechaza', noDebeQuedar: ['62-19', '0453'] }, // NSS con guiones; RR. HH. → revisión
  { texto: 'Le cayó el reembolso de viáticos a la CLABE 014 320 6543 2109 8765 que no es la suya', noDebeQuedar: ['6543', '2109', '8765'] }, // CLABE en bloques
  // --- domicilio y monto de nómina ---
  { texto: 'Mándenle el equipo a su casa: Calle Fresno 214 int. 3, col. Las Arboledas, Zapopan', noDebeQuedar: ['fresno', 'arboledas'] }, // domicilio
  { texto: 'A Ernesto le salió el neto de la quincena en $18,450.30 y debía ser $21,300.00', noDebeQuedar: ['ernesto', '18,450', '21,300'] }, // monto de nómina de una persona → revisión

  // --- CONTROLES: sin datos personales; lo técnico debe sobrevivir ---
  { texto: 'Al contabilizar la entrada de mercancías en MIGO con movimiento 101 sale el mensaje M7 053; el pedido es 4500012345.', noDebeQuedar: [], debeQuedar: ['MIGO', 'M7 053', 'entrada de mercancías'] },
  { texto: 'En VA01 el pedido de cliente no determina precio: falta la condición PR00 en el esquema de cálculo.', noDebeQuedar: [], debeQuedar: ['VA01', 'PR00', 'esquema de cálculo'] },
  { texto: 'La propuesta de pago de F110 no selecciona partidas abiertas para la vía de pago T.', noDebeQuedar: [], debeQuedar: ['F110', 'propuesta de pago', 'partidas abiertas'] },
  { texto: 'Dump MESSAGE_TYPE_X en ST22 al contabilizar en MIRO la factura 5105600123.', noDebeQuedar: [], debeQuedar: ['MESSAGE_TYPE_X', 'ST22', 'MIRO'] }, // MIRO también es apellido
  { texto: 'El usuario no tiene autorización para ME21N; la SU53 muestra que falta el objeto M_BEST_BSA.', noDebeQuedar: [], debeQuedar: ['no tiene autorización', 'ME21N', 'SU53', 'M_BEST_BSA'] }, // «usuario» sin usuario detrás
  { texto: 'Saludos cordiales, Mesa de Servicio SAP. Prioridad Media, categoría FI-AP.', noDebeQuedar: [], debeQuedar: ['Saludos cordiales', 'Mesa de Servicio', 'Prioridad Media', 'FI-AP'] }, // firma sin persona
  { texto: 'En FB60 la cuenta de mayor está bloqueada para contabilización: mensaje F5 351.', noDebeQuedar: [], debeQuedar: ['FB60', 'cuenta de mayor', 'F5 351'] },
  { texto: 'El cierre de mes nos está dando dolores de cabeza: el job SAP_REORG_JOBS se canceló en SM37 y AFAB no corrió.', noDebeQuedar: [], debeQuedar: ['dolores de cabeza', 'SAP_REORG_JOBS', 'SM37', 'AFAB'] }, // «dolores» no es nombre; job en mayúsculas no es usuario
]

// Los casos de nombre del cliente suponen generaliza(texto, clientes) con clientes =
// razón social «Lácteos La Huasteca, S.A. de C.V.» y su marca «Huastequita».
// Lo adversarial son las variantes (minúsculas, sin acentos, siglas, dominio, RFC).

export const BANCO_GENERALIZA: ReadonlyArray<{ readonly texto: string; readonly noDebeQuedar: readonly string[]; readonly debeQuedar?: readonly string[] }> = [
  // --- transacciones y programas propios ---
  { texto: 'Al entrar con /nzsd_factura_cfdi sale dump; con la VF01 sí factura', noDebeQuedar: ['zsd_factura'], debeQuedar: ['VF01'] }, // pegada al /n del OK-code
  { texto: 'Usamos la ZVA01 en lugar de la VA01 porque valida crédito antes', noDebeQuedar: ['zva01'], debeQuedar: ['VA01'] }, // copia Z de una estándar
  { texto: 'El FM /tlx/fm_get_tipo_cambio regresa vacío desde el lunes', noDebeQuedar: ['tlx'] }, // namespace en minúsculas
  // --- sociedad, centro, almacén, organización ---
  { texto: "En el report la condición es WHERE bukrs = 'MX10' AND gjahr = '2026' y no trae nada", noDebeQuedar: ['mx10'] }, // sociedad dentro de código ABAP
  { texto: 'En la soc 2300 no deja abrir el periodo 10 en la OB52', noDebeQuedar: ['2300'], debeQuedar: ['OB52'] }, // «soc» abreviado sin punto
  { texto: 'Para CoCd 3100 no se actualiza el tipo de cambio en la OB08', noDebeQuedar: ['3100'], debeQuedar: ['OB08'] }, // abreviatura de la interfaz en inglés
  { texto: 'Pasa en las sociedades 1100, 1200 y 1300; en la 1400 no', noDebeQuedar: ['1100', '1200', '1300', '1400'] }, // plural y lista
  { texto: 'El centro MX12 no tiene la vista de compras del material en la MM03', noDebeQuedar: ['mx12'], debeQuedar: ['MM03'] }, // centro alfanumérico
  { texto: 'En Plnt 4100 / SLoc 0002 el stock no cuadra contra la MB52', noDebeQuedar: ['4100', '0002'], debeQuedar: ['MB52'] }, // centro y almacén en inglés abreviado
  { texto: 'Traspaso del alm. MP02 al alm. PT01 en la MIGO con movimiento 311', noDebeQuedar: ['mp02', 'pt01'], debeQuedar: ['MIGO'] }, // almacenes
  { texto: 'La org. vtas. NAC1 con canal 10 no determina la ruta de entrega', noDebeQuedar: ['nac1'] }, // organización de ventas abreviada
  // --- nombre de la empresa cliente y su marca ---
  { texto: 'en lacteos la huasteca nos pasa lo mismo desde el upgrade a S/4', noDebeQuedar: ['huasteca'] }, // minúsculas y sin acento
  { texto: 'El pedido de Huastequita Light 1L no toma el descuento por volumen', noDebeQuedar: ['huastequita'] }, // marca
  { texto: 'En LLH ya lo probamos en QAS y funciona; en PRD no', noDebeQuedar: ['llh'] }, // siglas de la razón social: si no se derivan, a cuarentena
  { texto: 'No abre portal.lacteoshuasteca.com.mx desde el servidor de aplicaciones', noDebeQuedar: ['huasteca'] }, // nombre dentro de un dominio
  { texto: 'El RFC de la empresa, LHU920815AB3, no coincide con el del certificado de sello', noDebeQuedar: ['lhu920815'] }, // RFC de persona moral (12 caracteres)
  // --- objetos propios ---
  { texto: 'El append ZAMARA_EXT de la MARA no se activa tras el upgrade', noDebeQuedar: ['zamara'], debeQuedar: ['MARA'] }, // append Z sobre tabla estándar
  { texto: 'El campo vbak-zzruta_reparto no se llena desde la interfaz de pedidos', noDebeQuedar: ['zzruta'], debeQuedar: ['vbak'] }, // campo ZZ en minúsculas con tabla-campo
  { texto: 'La implementación ZEI_ME_PROCESS_PO_CUST de la BAdI ME_PROCESS_PO_CUST bloquea la grabación', noDebeQuedar: ['zei_me'], debeQuedar: ['ME_PROCESS_PO_CUST'] }, // implementación propia de BAdI estándar
  { texto: 'Sale el mensaje ZSD 017 al grabar la entrega en VL01N', noDebeQuedar: ['zsd'], debeQuedar: ['VL01N'] }, // clase de mensajes propia

  // --- CONTROLES: objetos estándar que no identifican a nadie ---
  { texto: 'Al grabar en ME21N con BAPI_PO_CREATE1 falla la validación de la BAdI ME_PROCESS_PO_CUST.', noDebeQuedar: [], debeQuedar: ['ME21N', 'BAPI_PO_CREATE1', 'ME_PROCESS_PO_CUST'] },
  { texto: 'En MIRO la factura no cuadra: el documento en BKPF y BSEG no coincide con la posición MSEG-ZEILE de la entrada.', noDebeQuedar: [], debeQuedar: ['MIRO', 'BKPF', 'BSEG', 'MSEG-ZEILE'] }, // ZEILE es estándar aunque empiece con Z
  { texto: 'La tabla MARA y la MARC no tienen el material extendido al centro; usar MM01 o la BAPI_MATERIAL_SAVEDATA.', noDebeQuedar: [], debeQuedar: ['MARA', 'MARC', 'MM01', 'BAPI_MATERIAL_SAVEDATA'] }, // «centro» sin código detrás; MARC parece nombre
  { texto: 'F110 no toma la partida: BSEG-ZLSCH viene vacío, BSEG-ZFBDT es de 2027 y la condición EKKO-ZTERM no existe en la T052.', noDebeQuedar: [], debeQuedar: ['F110', 'BSEG-ZLSCH', 'BSEG-ZFBDT', 'EKKO-ZTERM', 'T052'] }, // campos estándar con Z inicial
  { texto: 'Ya se revisó y ya quedó la zona de transporte; en la VL02N la entrega no hereda la ruta de la zona.', noDebeQuedar: [], debeQuedar: ['Ya se revisó', 'y ya quedó', 'zona de transporte', 'VL02N'] }, // palabras en español que empiezan con y/z
]
