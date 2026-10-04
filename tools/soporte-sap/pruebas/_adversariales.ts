/**
 * Las entradas ADVERSARIALES del anonimizador, tal como las construyó el revisor independiente del
 * 2026-10-04 (54 fugas en 63 contra la v1). Datos SINTÉTICOS con dígito verificador válido. Quedan
 * como fixture permanente: la prueba exige 0 fugas sobre ellas, y un detector nuevo no puede volver
 * a medirse contra un banco hecho a su medida.
 */
// Identificadores sinteticos VALIDOS (checksum correcto), generados con ids.mjs
const RFC1 = 'TOCX850312K77'      // Xochitl Tzompantzi Cuauhtle
const RFC2 = 'CUOI900715A3A'      // Itzel Cuevas Ochoa
const RFC3 = 'PEGJ800101B2A'      // con ceros en la fecha
const CURP1 = 'TOCX850312MPLZHC07'
const CURP0 = 'CUOI900715MNLCCT40' // termina en 0
const NSS = '12345678903'
const CLABE = '012180001234567899'

// [id, texto, [sensibles tal como aparecen], tipo]
export const CASOS_ADVERSARIALES: Array<[id: string, texto: string, sensibles: string[], tipo: string]> = [
  // --- Nombres fuera de contexto de nomina
  ['N01', 'Xóchitl Tzompantzi reporta que MIGO no contabiliza la entrada 101', ['Xóchitl', 'Tzompantzi'], 'NOMBRE'],
  ['N02', 'JUAN PEREZ reporta que MIGO no contabiliza la entrada 101', ['JUAN', 'PEREZ'], 'NOMBRE'],
  ['N03', 'Paola Ibarra reporta que MIGO no contabiliza', ['Paola', 'Ibarra'], 'NOMBRE'],
  ['N04', 'Ing. Tzompantzi pide revisar la ME21N, el pedido no libera', ['Tzompantzi'], 'NOMBRE'],
  ['N05', 'Lic. Itzel Cuevas Ochoa no puede entrar a la VA01', ['Itzel', 'Cuevas', 'Ochoa'], 'NOMBRE'],
  ['N06', 'itzel cuevas (almacén) dice que la MB52 no muestra stock', ['itzel cuevas'], 'NOMBRE'],
  ['N07', 'Tzompantzi Cuauhtle, María: no le aparece la FB60', ['Tzompantzi', 'Cuauhtle', 'María'], 'NOMBRE'],
  ['N08', 'Según X. Tzompantzi C. la VL02N truena con dump', ['Tzompantzi'], 'NOMBRE'],
  ['N09', 'Ana María Ñúñez-Tzompantzi pide acceso a la F110', ['Ñúñez', 'Tzompantzi'], 'NOMBRE'],
  ['N10', 'Mensaje de MARIA DE LA LUZ CUAUHTLE: la MIRO no deja guardar', ['MARIA', 'LUZ', 'CUAUHTLE'], 'NOMBRE'],
  // --- Nombres en contexto de nomina/personal
  ['P01', 'FINIQUITO DE XOCHITL TZOMPANTZI CUAUHTLE NO SE CALCULÓ', ['XOCHITL', 'TZOMPANTZI'], 'NOMBRE'],
  ['P02', 'finiquito de xochitl tzompantzi cuauhtle no se calculó', ['xochitl', 'tzompantzi'], 'NOMBRE'],
  ['P03', 'La nómina de Tzompantzi salió en cero en PC00_M32_CALC', ['Tzompantzi'], 'NOMBRE'],
  ['P04', 'Vacaciones de I. Cuauhtle no se descuentan en PA30', ['Cuauhtle'], 'NOMBRE'],
  ['P05', 'Aguinaldo de Xóchitl Tzompantzi Cuauhtle no se calculó en el PY', ['Xóchitl', 'Tzompantzi'], 'NOMBRE'],
  ['P06', 'Baja IMSS de Itzel Cuevas Ochoa rechazada por el IDSE', ['Itzel', 'Cuevas'], 'NOMBRE'],
  ['P07', 'La trabajadora Itzel Cuevas no tiene PTU calculada', ['Itzel', 'Cuevas'], 'NOMBRE'],
  // --- RFC / CURP / NSS deformados
  ['I01', `el rfc ${RFC1.toLowerCase()} no timbra en el PAC`, [RFC1.toLowerCase()], 'RFC'],
  ['I02', `RFC ${RFC1.slice(0,4)} ${RFC1.slice(4,10)} ${RFC1.slice(10)} rechazado por el PAC`, [RFC1.slice(4,10) + ' ' + RFC1.slice(10)], 'RFC'],
  ['I03', `El proveedor ${RFC1.slice(0,4)}-${RFC1.slice(4,10)}-${RFC1.slice(10)} no timbra`, [`${RFC1.slice(0,4)}-${RFC1.slice(4,10)}-${RFC1.slice(10)}`], 'RFC'],
  ['I04', `RFC: ${RFC1.slice(0,8)}\n${RFC1.slice(8)} no aparece en el BP`, [RFC1.slice(0,8)], 'RFC'],
  ['I05', `En la nómina el RFC ${RFC3.slice(0,4)} ${RFC3.slice(4,10)} ${RFC3.slice(10)} no cuadra`, [RFC3.slice(4,10) + ' ' + RFC3.slice(10)], 'RFC'],
  ['I06', `curp ${CURP1.toLowerCase()} en el BP del proveedor persona física`, [CURP1.toLowerCase()], 'CURP'],
  ['I07', `Recibo con CURP ${CURP1.slice(0,4)} ${CURP1.slice(4,10)} ${CURP1.slice(10)}`, [CURP1.slice(4,10) + ' ' + CURP1.slice(10)], 'CURP'],
  ['I08', `La CURP ${CURP0.slice(0,17)}O del proveedor no valida en el timbrado`, [CURP0.slice(0,17)], 'CURP'],
  ['I09', `RFC del proveedor ${RFC2.slice(0,4)}9OO715${RFC2.slice(10)} rechazado`, [`${RFC2.slice(0,4)}9OO715${RFC2.slice(10)}`], 'RFC'],
  ['I10', `Incapacidad sin NSS: ${NSS.slice(0,2)}-${NSS.slice(2,4)}-${NSS.slice(4,6)}-${NSS.slice(6,10)}-${NSS.slice(10)}`, [`${NSS.slice(0,2)}-${NSS.slice(2,4)}-${NSS.slice(4,6)}-${NSS.slice(6,10)}-${NSS.slice(10)}`], 'NSS'],
  ['I11', `Alta IMSS rechazada, NSS ${NSS.slice(0,4)} ${NSS.slice(4,8)} ${NSS.slice(8)}`, [`${NSS.slice(0,4)} ${NSS.slice(4,8)} ${NSS.slice(8)}`], 'NSS'],
  ['I12', `Nómina: NSS ${NSS.slice(0,4)} ${NSS.slice(4,8)} ${NSS.slice(8)} duplicado`, [`${NSS.slice(0,4)} ${NSS.slice(4,8)} ${NSS.slice(8)}`], 'NSS'],
  // --- Correos ofuscados
  ['C01', 'Escribir a itzel.cuevas [arroba] aceros-norte.com.mx sobre la FB60', ['itzel.cuevas', 'aceros-norte.com.mx'], 'CORREO'],
  ['C02', 'Contacto: ITZEL.CUEVAS arroba acerosnorte punto com, por la MIRO', ['ITZEL.CUEVAS'], 'CORREO'],
  ['C03', 'Su correo es xtzompantzi(at)aceros.mx para lo del pedido', ['xtzompantzi(at)aceros.mx'], 'CORREO'],
  ['C04', 'Mandar el log a ITZEL.CUEVAS@ACEROS.COM.MX', ['ITZEL.CUEVAS@ACEROS.COM.MX'], 'CORREO'],
  // --- Telefonos
  ['TEL1', 'Llamar al (55) 1234-5678 por el error en VL02N', ['1234-5678'], 'TELEFONO'],
  ['TEL2', 'Tel 55-1234-5678 de quien levantó el ticket de MIRO', ['55-1234-5678'], 'TELEFONO'],
  ['TEL3', 'Celular +52 1 55 1234 5678 para lo del job', ['1234 5678'], 'TELEFONO'],
  ['TEL4', 'whatsapp 55.1234.5678, dice que la ME23N no abre', ['55.1234.5678'], 'TELEFONO'],
  ['TEL5', 'Ext. del área: 5512345678', ['5512345678'], 'TELEFONO'],
  ['TEL6', 'Nómina: el empleado da su cel 55 12 34 56 78', ['55 12 34 56 78'], 'TELEFONO'],
  // --- CLABE / cuentas
  ['B01', `Depósito de nómina rechazado, CLABE ${CLABE.match(/.{1,4}/g)!.join(' ')}`, [CLABE.match(/.{1,4}/g)!.join(' ')], 'CLABE'],
  ['B02', 'Pago a proveedor persona física, cuenta 1234-5678-90 no existe', ['1234-5678-90'], 'CUENTA'],
  ['B03', 'La cuenta bancaria 012345678901 del acreedor Itzel no se valida en F110', ['012345678901'], 'CUENTA'],
  ['B04', `F110 rechaza CLABE ${CLABE.slice(0,6)}-${CLABE.slice(6,12)}-${CLABE.slice(12)}`, [`${CLABE.slice(0,6)}-${CLABE.slice(6,12)}-${CLABE.slice(12)}`], 'CLABE'],
  // --- Numeros de personal
  ['E01', 'PERNR: 1234 tiene la nómina en cero', ['1234'], 'PERNR'],
  ['E02', 'El empleado 4521 no aparece en PA20', ['4521'], 'PERNR'],
  ['E03', 'empleado 00012345 sin recibo de nómina', ['00012345'], 'PERNR'],
  ['E04', 'PERNR 00012345 bloqueado en PA30', ['00012345'], 'PERNR'],
  ['E05', 'No. personal 12345 no tiene infotipo 0009', ['12345'], 'PERNR'],
  // --- Sueldos
  ['S01', 'Nómina: le pagaron 18 450 pesos en vez de 19 000', ['18 450'], 'MONTO'],
  ['S02', 'Sueldo $18450 mal calculado en la quincena', ['18450', '450'], 'MONTO'],
  ['S03', 'Recibo de nómina con MXN 18,450.00 de sueldo base', ['18,450.00'], 'MONTO'],
  ['S04', 'Su salario diario integrado es 615.50 y el IMSS dice otra cosa', ['615.50'], 'MONTO'],
  // --- Direcciones y fechas
  ['D01', 'Nómina: domicilio calle 5 de mayo 123, col. centro, cp 06000, cdmx mal capturado en PA30', ['5 de mayo 123', '06000'], 'DIRECCION'],
  ['D02', 'El acreedor vive en Av. Insurgentes Sur 1234 int. 5, Col. Del Valle', ['Insurgentes Sur 1234'], 'DIRECCION'],
  ['D03', 'Empleado con fecha de nacimiento 12/03/1985 mal capturada en PA0002', ['12/03/1985'], 'FECHA_NAC'],
  ['D04', 'nació el 12 de marzo de 1985, la nómina le calcula mal la edad', ['12 de marzo de 1985'], 'FECHA_NAC'],
  // --- Usuarios SAP
  ['U01', 'El usuario: ICUEVAS está bloqueado en SU01', ['ICUEVAS'], 'USUARIO'],
  ['U02', 'Desbloquear XTZOMPANTZI en SU01, se le venció la contraseña', ['XTZOMPANTZI'], 'USUARIO'],
  ['U03', 'Favor de dar rol Z_MM_COMPRAS al user ICUEVAS', ['ICUEVAS'], 'USUARIO'],
  ['U04', 'El ID SAP de la de compras es I.CUEVAS y no tiene rol', ['I.CUEVAS'], 'USUARIO'],
  ['U05', 'Usuario SAP JPEREZ01 no puede firmar', ['JPEREZ01'], 'USUARIO'],
  // --- Mezclas realistas
  ['M01', `Hola, soy Itzel Cuevas de compras, mi tel es 55-1234-5678 y mi usuario: ICUEVAS. La ME21N falla`, ['Itzel', 'Cuevas', '55-1234-5678', 'ICUEVAS'], 'MEZCLA'],
  ['M02', `RECIBO DE NOMINA DE TZOMPANTZI CUAUHTLE XOCHITL, RFC ${RFC1.toLowerCase()}`, ['TZOMPANTZI', RFC1.toLowerCase()], 'MEZCLA'],
]

// Falsos positivos: texto tecnico SAP sin datos personales
export const CASOS_TECNICOS: Array<[id: string, texto: string]> = [
  ['F01', 'El recibo de mercancía en MIGO para Almacén Central falla con error M7 021'],
  ['F02', 'Pedido 4500012345 no se puede liberar en ME29N'],
  ['F03', 'Material 000000000000012345 sin vista de contabilidad en MM03'],
  ['F04', 'Personalización del layout ALV en ME2N: el campo Proveedor Principal no aparece'],
  ['F05', 'Documento FI 1900000123 en sociedad 1000 no compensa en F-32'],
  ['F06', 'El job de nómina RPCIPE00 de la sociedad Aceros Norte termina con dump'],
  ['F07', 'El usuario que creó la orden 1000234 no tiene autorización M_BEST_BSA'],
  ['F08', 'La transacción PA30 no deja grabar el infotipo 0014 por el error PG 302'],
  ['F09', 'Error en Business Partner: Rol Proveedor no se crea en la sociedad 2000'],
  ['F10', 'Las vacaciones del periodo 2024 no se reflejan en el Cuadro Contingentes PT_QTA00'],
]
