/**
 * El léxico del anonimizador: lo que NO es un nombre de persona. Un nombre se reconoce porque no
 * está aquí (español común de los tickets, vocabulario SAP y de soporte, palabras de nombres de
 * empresa del laboratorio), NO porque esté en una lista de nombres: una lista de nombres deja pasar
 * a quien no está en ella (hallazgo de la revisión adversarial del 2026-10-04).
 */

const ESPANOL = `a al algo alguna alguno algunos ante antes aqui asi aun ayer bajo bien cada casi como con contra cual
cuando cuanto de del desde donde dos el ella ellas ellos en entre era es esa ese eso esta este esto estos fue fueron
ha hace hacia han hasta hay hoy la las le les lo los mas me mi mis mucho muy nada ni no nos nuestra nuestro o otra otro
para pero poco por porque pues que quien se segun ser si sido sin sobre solo son su sus tambien tanto te tiene tienen
todo todos tras tu un una uno unos usted ustedes ya y yo
hola favor gracias saludos buenos buenas dias tardes noches urgente ayuda apoyo necesito necesitamos pide pedimos
dice dicen reporta reporto solicita solicito comenta indica escribe escribir llamar mandar enviar revisar revisa
checar validar valida desbloquear bloquear resetear crear creo grabar guardar abrir abre cerrar liberar libera
contabilizar contabiliza compensa compensar timbrar timbra calcular calcula calculo pagar pago pagaron aparece
aparecer muestra mostrar falla fallo truena funciona deja dejo puede pueden tiene sale salio rechaza rechazado
rechazada bloqueado bloqueada vencido vencio cancelado detenido detenida mal bien nuevo nueva viejo primera primero
error errores mensaje mensajes problema incidencia incidente ticket caso alta baja cambio cambios
almacen central principal proveedor proveedores cliente clientes acreedor deudor compras ventas finanzas contabilidad
planta sucursal area departamento equipo gerencia direccion oficina tienda
pedido pedidos orden ordenes factura facturas documento documentos material materiales entrada entradas salida
salidas mercancia mercancias stock inventario recibo recepcion reporte reportes campo campos vista vistas pantalla
layout personalizacion cuadro contingentes rol roles perfil autorizacion autorizaciones contrasena usuario usuarios
sistema servidor job jobs fondo log logs dump transaccion transacciones sociedad sociedades periodo periodos
cuenta cuentas banco bancaria pago pagos deposito nomina quincena sueldo salario incapacidad vacaciones
empleado empleada trabajador trabajadora contacto correo telefono celular extension ext tel
norte sur centro golfo bajio alimentos aceros farmacias bebidas textiles grupo industrias comercial servicios
consultora andina boreal laboratorio
mesa servicio prioridad media cordiales zona zonas yendo final contable general lacteos enviado enviada reenviado
asunto original whatsapp chofer almacenista capturista gerente jefe jefa supervisor supervisora companero companera
encargado encargada comprador compradora vendedor vendedora cajero cajera becario becaria secretario secretaria
tesorero tesorera
enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre lunes martes miercoles
jueves viernes sabado domingo`

const SAP = `sap gui fiori launchpad easy access business partner partners hana s4hana s4 ecc erp abap basis netweaver
cockpit edoc monitor workflow idoc idocs bapi rfc odata alv spool transporte transportes mandante cliente
fi co mm sd pp pm qm hcm hr ps wm ewm tm ariba concur successfactors py pt pa om ess mss bw bi crm srm
migo miro mmpv ob52 su01 su53 sm37 bd87 we02 va01 va02 vf01 vf02 vkoa me21n me23n me29n me2n mb52 mm03 fb60 f110
vl02n snro pa20 pa30 pa40 pc00 infotipo cfdi pac lco sat imss idse sua infonavit ptu uuid xml pdf
grafo matriz sandbox sala badi cocd plnt sloc`

export const LEXICO: ReadonlySet<string> = new Set(`${ESPANOL} ${SAP}`.split(/\s+/).filter(Boolean))

/** Normaliza para comparar con el léxico: minúsculas, sin acentos ni signos. */
export const normalizaPalabra = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '').replace(/[^a-z0-9ñ]/g, '')

/** ¿Es vocabulario (no un posible nombre)? Una sola letra (una inicial) NO cuenta como vocabulario. */
export const esVocabulario = (palabra: string): boolean => {
  const p = normalizaPalabra(palabra)
  return p.length > 1 && LEXICO.has(p)
}
