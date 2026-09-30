# Lo que queda bloqueado, con quién firma (PRP-008 fases 10-21)

Cada punto trae lo que ya está listo, por qué no se hizo y la respuesta que recomiendo. **Nada de esto se construyó
ni se activó.**

| # | Qué | Por qué está bloqueado | Lo que ya está listo | Firma | Recomiendo |
|---|---|---|---|---|---|
| 10 | Catálogo apto para clientes | Una paráfrasis equivocada hace fallar la auditoría de una pyme (daño a terceros) | Catálogo 0.1.0 con L2 en verde, revisión dedicada aplicada, 61 referencias a 2026 marcadas «supuestas», `SGI_NORMAS_LICENCIADAS` para medir L1 contra la copia licenciada | Auditor líder competente + el laboratorio | Cotejo por un auditor líder de 9001 y 42001, con la copia licenciada en español, antes del primer cliente |
| 11 | Supabase en la nube (proyecto nuevo) | Infraestructura y datos de terceros | 3 migraciones idempotentes, RLS medida 42/42, siembra por sesiones (sin `service_role`) | El laboratorio | Proyecto aparte del reel (no mezclar productos). Aplicar con el job de plataforma declarado, igual que el reel |
| 12 | Archivos de evidencia (Storage) | Datos de empleados en archivos: cifrado, retención y borrado | La evidencia hoy es texto con huella | El laboratorio (C4) | Bucket privado por organización, retención ligada a la tabla de retención del cliente, borrado al terminar el contrato |
| 13 | Agent Card expuesta a partners o a internet (A2A) | Superficie nueva hacia agentes ajenos (C3 + C4) | Cada agente ya tiene su tarjeta con forma de Agent Card (`AGENTES`); el puente A2A del repo está pineado | El laboratorio | No hasta que haya un partner concreto con modelo de amenazas propio |
| 14 | Datos reales de clientes hacia el proveedor LLM | El dato sale del perímetro (C4) | Minimización (CURP, RFC, NSS, CLABE, correo, teléfono), competencias por puesto, AISIA en el PRP | El laboratorio con la AISIA | Primero el aviso de privacidad revisado por un abogado y un contrato de encargo con el proveedor |
| 15 | CDC: prompts + 2 clases del routing | C1 | `propuesta-cdc.md` con el diff | El laboratorio | Firmar cuando los 46 casos con LLM pasen |
| 16 | Conectores Drive, correo y calendario | C4 + credenciales OAuth + envíos | El calendario interno ya muestra auditorías, tareas, reevaluaciones y vencimientos | El laboratorio | Solo lectura primero (importar evidencia desde Drive); enviar correos al final |
| 17 | Cobros (por empresa y por asiento de consultor) | Irreversible y con dinero de terceros | `/add-payments` (Polar) existe en el repo | El laboratorio | Después del estreno con una pyme real (fase 21) |
| 18 | Ingesta de PDF y escaneos + búsqueda semántica | Los embeddings también sacan el dato | `tools/extractor-documental` ya lee PDF, escaneos y CFDI con el motor inyectado | El laboratorio (C4) | Ingesta con el extractor en local (sin salida); embeddings solo con un modelo local |
| 19 | Licencia del contenido ISO | Legal | La app funciona sin el texto: el usuario usa su copia | El laboratorio con asesoría | Consultar con el organismo nacional de normalización si hay licencia para software |
| 20 | `BUSINESS_LOGIC.md` del producto, gates nuevos, respaldo | Contrato del producto y CDC de gates | Ver abajo | El laboratorio | Ver abajo |
| 21 | Estreno con una pyme real | Manual | Todo lo anterior | El laboratorio | Una pyme conocida del laboratorio, solo 9001 primero |

## 20a. `BUSINESS_LOGIC.md` del producto (propuesta, no se escribe sin firma)

El `BUSINESS_LOGIC.md` vigente es el del asesor de ventas por voz (firmado el 2026-09-20). Este producto necesita
el suyo; hay un CDC en curso en otra rama para tener uno por producto. Lo esencial:

- **Problema**: la pyme mexicana que usa IA necesita dos sistemas (9001 y 42001) y los hace por separado, o no los
  hace. Los generadores de documentos le entregan textos que un auditor detecta al instante. Los certificados
  9001:2015 caducan el 30-sep-2029.
- **Solución**: un solo sistema sobre la estructura común, con agentes que proponen con sus datos y personas que
  aprueban, y avance calculado.
- **Usuario**: la admin de una pyme de 10 a 200 personas, y el consultor que acompaña a varias.
- **Modelo**: suscripción por empresa y asiento de consultor por número de clientes. **[supuesto]** El precio sale
  del estreno (fase 21).
- **Respaldo (§4)**: tablas `sgi_*` (organizaciones, proyectos, documentos y sus versiones, evidencias,
  aprobaciones, trazas). Las aprobaciones y las trazas son la evidencia de auditoría del cliente: **no se pierden**.
  Sin GATE 3 cerrado, RPO y RTO son **desconocidos**.

## 20b. Gates nuevos para `validate` (propuesta de CDC del manifiesto)

| Gate | Qué guarda | Por qué no se agregó |
|---|---|---|
| `prueba:laboratorio-sgi` | 5+ casos por pieza, las 10 trampas, cero fallas, y L8 en 32 archivos | Cambiar `.claude/gates.json` es CDC |
| `sgi:catalogo` | L2 cobertura + espejo SQL sin deriva (L1 queda «no medido» sin copia) | Igual |
| `npm --prefix tools/sistema-integrado run prueba` | Ya lo corre `prueba:tools` dentro de `validate` | — (ya entra) |

`sgi:rls` y `sgi:agentes` se quedan **fuera** a propósito. El primero necesita Docker y el segundo red y gasto.
