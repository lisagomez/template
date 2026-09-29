# Propuesta de respaldo del reel — para firma del laboratorio

> Redactada fuera del contrato: `BUSINESS_LOGIC.md` es el del asesor y está firmado; no se edita. Al firmar, esto
> entra al inventario de respaldo (`BUSINESS_LOGIC.md` §4 / `docs/FASE0-INFRAESTRUCTURA.md` §9.1).
> **Sin GATE 3 cerrado no se declaran RPO ni RTO: hoy son «desconocidos».** Lo que no esté en el inventario no se respalda.

| Qué | Dónde | Por qué importa | Propuesta |
|---|---|---|---|
| `profiles`, `reel_proyectos`, `reel_versiones`, `reel_aprobaciones`, `reel_marcas`, `reel_consentimientos` | Supabase (nube) | Quién aprobó qué versión y el estado de cada consentimiento: es la constancia ante un reclamo | Respaldo del proyecto Supabase (plan gratis: sin respaldo automático; verificar el plan antes de prometer nada) |
| Máster aprobado, `master.json`, `registro.json` | `REEL_DATOS` en el servidor | El archivo exacto que el dueño aprobó (su huella está en Supabase) | Respaldo diario cifrado del almacén, **excluyendo** lo que la retención borra |
| Documentos de consentimiento | `REEL_DATOS/<dueño>/<proyecto>/consentimientos/` | Son de terceros: se conservan mientras dure la vigencia y se borran al retirarse | Mismo respaldo, con borrado propagado cuando alguien retira su consentimiento |
| Bruto, copia normalizada, transcripción, cuadros | `REEL_DATOS` | Datos de terceros sin aprobar | **No se respaldan**: se borran a los 30 días de aprobado (retención firmada) |

Pendiente para GATE 3: una restauración probada de punta a punta (tablas + almacén) antes de declarar RPO/RTO.
Riesgo abierto: si se respalda el bruto por error, la retención de 30 días deja de cumplirse en la copia.

Firmada por: ____________  Rol: ____________  Fecha: ____________
