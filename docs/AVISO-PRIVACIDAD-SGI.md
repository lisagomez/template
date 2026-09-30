# Aviso de privacidad — sistema integrado ISO (BORRADOR)

> **Borrador por verificar con asesoría legal.** Redactado el 2026-09-30 sobre la LFPDPPP vigente (publicada en el
> DOF el 20-mar-2025, en vigor desde el 21-mar-2025; la autoridad es la Secretaría Anticorrupción y Buen Gobierno).
> **No confirmado**: si ya hay reglamento nuevo o sigue aplicando el anterior en lo que no se oponga. No se publica
> ni se usa con datos reales hasta que lo revise un abogado y lo firme el laboratorio (PRP-008, fases 11 y 14).

## Quién es quién

- **Responsable** de los datos de sus empleados, clientes y proveedores: **cada organización** que usa la app.
- **Encargado**: quien opera la app, que trata esos datos por cuenta de cada organización y solo para lo que se
  describe aquí.

## Qué datos se tratan

- **Cuentas**: correo y nombre de quien usa la app, y su rol en cada organización.
- **Del sistema de gestión**: perfil de la organización (procesos, productos, puestos), documentos, evidencias,
  riesgos, indicadores, auditorías y aprobaciones (quién aprobó qué, cuándo y con qué rol).
- **De empleados**: la matriz de competencias es **por puesto**. Las evidencias pueden contener datos personales
  (listas de asistencia, registros de capacitación) si la organización las sube.

## Para qué

Operar el sistema de gestión de la organización: calcular su avance, guardar sus documentos y aprobaciones, y
proponerle borradores. **No** se usan para publicidad ni se venden.

## Transferencias y remisiones

- **Proveedor del modelo de lenguaje** (hoy OpenRouter y el modelo pineado en el routing): recibe el perfil de la
  organización y el texto que se le pase a un agente, **minimizado** (CURP, RFC, NSS, CLABE, correos y teléfonos se
  reemplazan por marcadores antes de salir). Es una remisión al encargado del encargado. En la versión actual del
  producto solo corre con **datos sintéticos**. Con datos reales requiere la firma del laboratorio y la revisión de
  este aviso.
- **Base de datos**: Supabase. Local en desarrollo; la nube es una decisión pendiente de firma.

## Derechos ARCO y revocación

Los ejerce cada titular ante la organización responsable, que puede pedir al encargado la corrección o supresión de
lo que esté en la app. Medio de contacto: **pendiente** (lo define cada organización).

## Conservación

Mientras la organización mantenga su sistema de gestión, más el tiempo que su propia tabla de retención indique para
cada registro. Las aprobaciones son inmutables por diseño (evidencia de auditoría): se revocan, no se borran.
**Pendiente**: el procedimiento de borrado al terminar el contrato.
