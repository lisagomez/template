# Anexo técnico · Licencia del ERP y soporte

> **Plantilla.** `[COMPLETAR]` = dato comercial que fija el proveedor; `[ABOGADO]` = texto legal que
> redacta el asesor jurídico. Nada de lo que está en blanco se rellena con una cifra que no se haya
> medido. El resto describe lo que la entrega hace de verdad y se verifica antes de firmar.

**Proveedor:** `[COMPLETAR]` · **Cliente:** `[COMPLETAR]` · **Contrato:** `[COMPLETAR]` ·
**Versión del esquema entregada:** migraciones `001-[COMPLETAR]` · **Fecha:** `[COMPLETAR]`

## 1. Qué es esto

El cliente recibe, bajo **licencia de uso**, el esquema de base de datos del ERP y su instalador,
y lo instala en **su propia** base PostgreSQL. El proveedor no opera la infraestructura del cliente.
Este anexo dice qué se entrega, qué no, qué garantiza el soporte y qué queda del lado del cliente.

Términos de la licencia (no exclusiva, intransferible, territorio, duración, renovación):
`[ABOGADO]`.

## 2. Qué se entrega

| Pieza | Contenido |
|---|---|
| Esquema | migraciones SQL: facturación CFDI 4.0, cobranza, pedidos e inventario, folios, bitácora de auditoría, tarjetas de agente y catálogo de activos; multi-tenant con aislamiento por fila forzado en la base |
| Instalador | instala desde cero o encima de una instalación previa sin borrar nada (idempotente) |
| Pruebas de cierre | diez comprobaciones que corren dentro de una transacción que se deshace (no dejan datos) |
| Referencia | la estructura esperada, para comprobar que una instalación es equivalente |
| Guía | `INSTALAR.md` |

La lista exacta de archivos de esta versión se adjunta al firmar (la produce el verificador de la
entrega) junto con la evidencia de la prueba de instalación en una base desechable.

## 3. Qué NO se entrega

- Las fuentes de las reglas de negocio y de la documentación interna de diseño del proveedor.
- Las herramientas con que el proveedor opera y mantiene sus propios sistemas.
- Datos de ningún otro cliente: cada instalación nace vacía.
- **Operación de la infraestructura**: el proveedor no aloja, no respalda y no vigila la base del
  cliente.

## 4. Responsabilidades del cliente

- Una base **PostgreSQL 13 o superior** (probado en 17), y quien la administre.
- **Disponibilidad y respaldos** de esa base, incluida la restauración. Se recomienda activar la
  recuperación a un punto en el tiempo del proveedor de base de datos.
- Custodia de credenciales. Ninguna aplicación del cliente se conecta con una llave que salte el
  aislamiento por fila (en Supabase: `service_role`); cada sesión declara rol y tenant.
- Como responsable de los datos personales de sus propios clientes (facturas, RFC, cobros), el
  aviso de privacidad y el cumplimiento de la LFPDPPP: `[ABOGADO]`.
- No modificar el esquema entregado fuera de las actualizaciones del proveedor; si lo hace, las
  pruebas de cierre dejan de garantizar el comportamiento.

## 5. Nivel de servicio de soporte

El nivel de servicio cubre **solo lo que el proveedor controla**. No cubre disponibilidad ni
respaldos de la infraestructura del cliente.

| Severidad | Qué es | Primera respuesta | Resolución o plan |
|---|---|---|---|
| Crítica | el ERP no permite facturar o cobrar, o hay riesgo de fuga entre tenants | `[COMPLETAR]` | `[COMPLETAR]` |
| Alta | una función del ERP falla sin alternativa | `[COMPLETAR]` | `[COMPLETAR]` |
| Media | una función falla con alternativa | `[COMPLETAR]` | `[COMPLETAR]` |
| Baja | dudas, mejoras | `[COMPLETAR]` | `[COMPLETAR]` |

- Horario y canal de soporte: `[COMPLETAR]`.
- Cómo se mide cada tiempo (desde qué registro y hasta cuál): `[COMPLETAR]`. Un tiempo sin
  registro que lo mida no se compromete.
- Consecuencias de incumplimiento (créditos, penalizaciones): `[ABOGADO]`.

## 6. Actualizaciones

- Cadencia: `[COMPLETAR]`.
- Cada versión trae sus migraciones nuevas, las instrucciones y la evidencia de la prueba de
  instalación. El instalador se puede volver a correr sin perder datos, y el comentario del esquema
  registra qué versión quedó instalada.
- Las aplica el cliente o, a petición suya, el proveedor mediante el acceso de soporte (sección 8).

## 7. Avisos de seguridad

El proveedor avisa al cliente de una vulnerabilidad que afecte al esquema entregado en un plazo
máximo de `[COMPLETAR]` desde que la conoce, con la mitigación o la versión que la corrige.

## 8. Acceso de soporte

- Solo cuando el cliente lo solicita para una incidencia o actualización concreta.
- **Solo lectura**: un login miembro del rol de lectura del ERP, creado por el cliente para esa
  incidencia y **con vencimiento** (la guía de instalación trae los comandos); se revoca al cerrarla.
  Si una actualización exige escribir, el cliente la aplica o autoriza por escrito ese cambio.
- Nunca credenciales de administración ni llaves que salten el aislamiento por fila.
- Mientras el acceso está abierto, el proveedor trata datos personales de los clientes del cliente
  **como encargado**, solo para atender la incidencia: `[ABOGADO]` (cláusula de encargo del
  tratamiento, confidencialidad, registro de accesos).

## 9. Protección de lo entregado

Confidencialidad, prohibición de redistribuir o sublicenciar, propiedad intelectual del proveedor
sobre el esquema y el instalador, y uso de la documentación: `[ABOGADO]`.

## 10. Fin del contrato

Los datos son del cliente y ya viven en su base: no hay migración de salida. Qué pasa con la
licencia y con las actualizaciones al terminar: `[ABOGADO]`.

## 11. Si el cliente necesita disponibilidad garantizada

Este anexo no la ofrece. Si el cliente la requiere, el proveedor puede proponer un servicio operado
por él, con su propio anexo, cifras medidas de recuperación y encargo del tratamiento completo.
