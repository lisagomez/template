# Sistema integrado ISO 9001 + ISO/IEC 42001 (`/sgi`)

La pyme lleva un solo sistema de gestión para calidad e IA, guiada y en su idioma; el consultor lleva a varias desde un panel con su marca.

## Qué hace

- **Roadmap de 9 fases con puerta** (diagnóstico → preparación para la certificación), con avance por cláusula, por
  norma y global y lo que traba cada puerta. Lo calcula el motor de `tools/sistema-integrado` con evidencia
  **aprobada**, nada más.
- **Diagnóstico adaptativo**: quien no usa IA no ve las preguntas del Anexo A, y quien no diseña no ve las de diseño.
  La madurez sale de una regla fija y el agente redacta el informe de brechas.
- **Documentos con versión exacta**: los agentes redactan borradores con los datos de la empresa. Un borrador
  genérico no pasa a revisión. La aprobación queda ligada a la huella de la versión y se exporta a DOCX o PDF.
- **Evidencias** ligadas a requisitos: una sola puede cubrir las dos normas.
- **Contexto e inventario de IA, riesgos y oportunidades con mapa de calor, evaluación de impacto de IA, declaración
  de aplicabilidad (SoA), objetivos e indicadores, auditoría con hallazgos firmados, NC y acciones correctivas con
  verificación de eficacia, calendario y migración de edición** (9001:2015+A1 → 9001:2026).
- **Dos modos de lectura**: «Sin jerga» para la pyme y «Experto» para el consultor.
- **Panel del consultor**: sus clientes con avance y puertas, marca blanca (nombre, lema y colores que ve cada
  cliente), biblioteca de plantillas y reporte de avance redactado por un agente.
- **Humano en el ciclo, en la base**: el rol, la huella y la puerta se verifican en SQL. Las aprobaciones son
  inmutables (solo se revocan). Cada propuesta de un agente guarda su traza: agente, modelo pineado, versión de
  prompts, huellas de insumos y salida, IDs citados y costo, o `null` si no se reportó.

### Qué no hace

- **No certifica** ni promete certificación: prepara para la auditoría de un organismo acreditado.
- **No deja aprobar a un agente ni al consultor**: el consultor propone y la organización aprueba.
- **No sube archivos**: la evidencia es texto con huella. El almacenamiento cifrado de archivos es la fase 12,
  bloqueada.
- **No se conecta a Drive, correo ni calendarios, no envía nada y no cobra**: todo eso es propuesta.
- **No expone sus agentes a otros agentes** (A2A) fuera de localhost: es gate humano (C3 + C4).

## Casos de uso

- **La admin de una pyme** (Maquinados del Bajío, 45 personas): entra, ve en qué fase está y qué le falta, pide a
  los agentes los borradores y los manda a revisión.
- **La alta dirección**: aprueba la política de IA, la SoA y la evaluación de impacto con su propio rol. Si la
  versión cambió desde que la revisó, la base rechaza la aprobación.
- **El auditor interno**: prepara el simulacro con el agente, firma los hallazgos (solo él puede) y verifica la
  eficacia de las acciones correctivas.
- **El consultor** (Calidad Norte Consultores): ve a sus 3 clientes con su avance, les manda el reporte del mes con
  su marca y no puede ver clientes que no le asignaron, aunque sean de su mismo despacho.
- **La app misma** («la casa»): lleva su propio sistema de gestión de IA con sus 9 agentes en el inventario.

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` (`engines` del repo), Next.js 16.
- **Dependencias del sistema**: Supabase. En desarrollo va local en Docker con el CLI pineado `supabase@2.118.0`
  (`npm run sgi:local:reinicia`).
- **CPU, GPU y memoria**: no medido.
- **Servicios externos**: el proveedor de modelos (OpenRouter), solo cuando alguien pide una propuesta a un agente.
  Nada más.
- **Variables de entorno**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENROUTER_API_KEY`. Sin la
  última, los agentes no corren y se dice. Ninguna superficie usa `SUPABASE_SERVICE_ROLE_KEY` (C7).
- **Almacenamiento**: tablas `sgi_*` en Supabase con RLS en todas (migraciones `20260930100000`–`100200`).
- **Salida del perímetro (C4)**: al pedir una propuesta sale, hacia el proveedor del modelo, el perfil de la
  organización (procesos, productos, puestos, nunca nombres) y el texto de las evidencias, minimizado. En este goal
  solo con datos sintéticos. Mandar datos reales de clientes es la fase 14 del PRP-013, que el laboratorio no ha
  firmado.

## Uso

```bash
npm run sgi:local:reinicia     # base local + siembra sintética (3 pymes, despacho, la casa) + .env.local del worktree
npm run dev                    # y entra en /sgi con una cuenta de supabase/.temp/sgi-cuentas.json
```

Las cuentas sintéticas (`@example.com`) y sus claves aleatorias quedan en `supabase/.temp/sgi-cuentas.json`, que git
ignora y nunca se imprime.

## Pruebas

- `npm run sgi:rls`: aislamiento entre organizaciones, matriz de roles, huella exacta (O3), puerta en SQL e
  igualdad de la base con el motor (quién aprueba qué y el espejo del catálogo) contra la base local.
- `npm run prueba:laboratorio-sgi`: el laboratorio (`src/features/laboratorio-sgi`) y `/laboratorio-sgi`.
- `npm run sgi:catalogo`: gates L1/L2 del catálogo y la migración espejo sin deriva.

## Documentos del producto

- Guía de la pyme: `docs/GUIA-PYME-SGI.md` · guía del consultor: `docs/GUIA-CONSULTOR-SGI.md`
- Aviso de privacidad (borrador): `docs/AVISO-PRIVACIDAD-SGI.md`
- Qué, por qué y qué está bloqueado: `.claude/PRPs/PRP-013-sistema-integrado-iso.md`
