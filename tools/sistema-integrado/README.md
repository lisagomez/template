# @tu-scope/sistema-integrado (0.1.0)

Un solo sistema de gestión para ISO 9001 e ISO/IEC 42001: la pyme ve qué le falta, sus agentes proponen, sus personas aprueban.

## Qué hace

- **Catálogo propio de requisitos, versionado por edición**: 130 requisitos para ISO 9001:2015 + Amd 1:2024,
  ISO 9001:2026 (borrador, catalogado desde resúmenes públicos) e ISO/IEC 42001:2023 con sus 38 controles del
  Anexo A. Cada requisito tiene ID estable, pregunta guía y versión «sin jerga», redactadas con palabras propias; de
  la norma solo se usa el número de cláusula (`./catalogo`).
- **Una evidencia, varias normas**: 34 requisitos son comunes a 9001 y 42001 (estructura armonizada). El acta de
  revisión por la dirección sube el avance en las dos a la vez.
- **Motor determinista** (`.`): avance por cláusula, por norma y global; puertas por fase (evidencia obligatoria +
  el rol correcto); migración de edición como diff (qué sigue valiendo, qué cambia de número, qué es nuevo).
- **Gates del catálogo**: cobertura de toda cláusula y todo control (L2) y derechos de autor contra la copia
  licenciada de la norma (L1): «no medido» si no hay copia, nunca «pasa».
- **Capa agéntica que propone** (`./agentes`): 9 agentes con LLM y un orquestador determinista, con tarjeta tipo
  Agent Card, prompts versionados, traza completa y salvaguardas: IDs citados que existen, texto de terceros
  delimitado, datos personales minimizados antes de salir y ninguna promesa de certificación.
- **Documentos** (`./documentos`): DOCX y PDF sin dependencias, huella SHA-256 de la versión exacta y detector de
  documento genérico (L7).

### Qué no hace

- **No certifica.** Prepara para la auditoría de un organismo acreditado (en México, la EMA). Ninguna salida
  promete certificación: el validador la rechaza.
- **No incluye texto de las normas.** Quien la usa necesita su copia de la norma. Licenciar el contenido es otra
  decisión (PRP-008 fase 19).
- **No decide.** El avance y las puertas los calcula el motor. Los agentes proponen y aprobar es de una persona con
  el rol correcto, nunca de un agente ni del consultor.
- **No elige modelo ni lee llaves**: el modelo y `fetch` se inyectan (`./openrouter` es opcional).
- **No guarda nada**: el almacén lo pone el proyecto (en este repo, Supabase con RLS).

## Casos de uso

- **La pyme que usa IA** (p. ej. un taller con cotizador por chatbot e inspección visual), cuando tiene que
  ordenar su sistema para 9001 y 42001: obtiene un solo roadmap con 9 puertas, qué le falta en cada una y borradores
  con sus propios datos.
- **La pyme certificada en 9001:2015**, antes del 30-sep-2029: ve qué cambia con 9001:2026 sin rehacer su sistema
  (`migraEdicion`).
- **El consultor con varias pymes**: calcula el avance de cada una con el mismo motor y les manda un reporte que no
  inventa cifras.
- **Un producto de IA que quiere su propio 42001**: la app que usa este paquete se usa a sí misma como primer
  inquilino.

## Requerimientos de infraestructura

- **Runtime**: Node `>=20` (`engines`), o cualquier navegador moderno (Web Crypto para las huellas).
- **Dependencias del sistema**: ninguna. Cero dependencias de npm.
- **CPU, GPU y memoria**: no medido.
- **Servicios externos**: ninguno en el núcleo. `./openrouter` llama a una API compatible con OpenAI, y solo si el
  proyecto la importa y le inyecta llave, modelo y `fetch`.
- **Variables de entorno**: ninguna. El paquete no lee el entorno.
- **Almacenamiento**: nada. Todo es en memoria; el proyecto decide dónde guarda.
- **Salida del perímetro (C4)**: el núcleo no saca nada. Con `./agentes` + `./openrouter` sale, hacia el proveedor
  del modelo, el perfil de la organización (puestos, nunca nombres) y el texto de las evidencias que se le pasen,
  **minimizado** (CURP, RFC, NSS, CLABE, correos y teléfonos como marcadores). Mandar datos reales de clientes es
  decisión del laboratorio con la AISIA de PRP-008 (fase 14, bloqueada).

## Instalar

```bash
npm run empaqueta sistema-integrado   # deja el tarball y lo prueba en un proyecto limpio
```

## Uso

```ts
import { avance, puerta, autorizaCierre, migraEdicion } from '@tu-scope/sistema-integrado';
import { CATALOGO, verificaCobertura } from '@tu-scope/sistema-integrado/catalogo';
import { ejecutaAgente } from '@tu-scope/sistema-integrado/agentes';
import { modeloOpenAiCompat } from '@tu-scope/sistema-integrado/openrouter';
import { docx, pdf, huella, detectaGenerico } from '@tu-scope/sistema-integrado/documentos';

const estado = { ediciones: ['iso-9001:2015+a1:2024', 'iso-iec-42001:2023'], evidencias: [
  { id: 'acta', aprobada: true, requisitos: ['SGI-C-9.3-01', 'SGI-C-9.3-02', 'SGI-C-9.3-05'] } ], fasesCerradas: [] };
avance(estado).porNorma;                           // sube en las dos normas
puerta(estado, 0).faltan;                          // qué traba la fase 0
autorizaCierre(estado, 2, 'dueno_proceso');        // { ok: false, motivo: 'La fase 2 solo la cierra: alta_direccion' }
migraEdicion('iso-9001:2015+a1:2024', 'iso-9001:2026').nuevos;

const modelo = modeloOpenAiCompat({ llave, modelo: 'anthropic/claude-sonnet-5', fetch });  // pineado por TU routing
const r = await ejecutaAgente('documental', { organizacion, ediciones, tarea: 'Política de IA', requisitos }, { modelo });
if (r.ok) console.log(r.salida.documento, r.traza.requisitosCitados, r.traza.uso);
```

| Subpath | Qué exporta |
|---|---|
| `.` | motor: `avance`, `puerta`, `autorizaCierre`, `migraEdicion`, `madurez`, `preguntasDiagnostico`, `puedeAprobar`, `APROBADORES`, `ROL_CIERRE`, `APROBACION_DE_DOCUMENTO` |
| `./catalogo` | `CATALOGO`, `requisito`, `requisitosDe`, `mapeoCruzado`, `verificaCobertura` (L2), `verificaDerechos` (L1) |
| `./agentes` | `AGENTES` (tarjetas), `ejecutaAgente`, `planDeTareas` (orquestador), salvaguardas (`revisaCitas`, `minimiza`, `delimita`, `promesasDeCertificacion`), `SISTEMA_COMUN`/`INSTRUCCIONES`/`VERSION_PROMPTS` |
| `./documentos` | `docx`, `pdf`, `huella`, `detectaGenerico`, `textoDe` |
| `./openrouter` | `modeloOpenAiCompat` (red y costo: se importa a propósito) |

## Gobernanza

- **Prompts = CDC (C1)**: `src/agentes/prompts.ts` cambia el comportamiento de un sistema de IA que propone sobre
  terceros. Cada cambio sube `VERSION_PROMPTS`, que viaja en la traza, y exige diff, regresión y firma.
- **Catálogo = borrador** hasta que lo coteje un auditor líder contra la norma licenciada. La revisión del
  revisor dedicado está en `.claude/goals/sistema-integrado-iso/revision-catalogo.md`.

## Pruebas

`npm --prefix tools/sistema-integrado run prueba`: 23 pruebas sobre catálogo (L1, L2), motor (doble cobertura,
puertas, roles, migración, madurez), documentos (DOCX válido para `zipfile`, PDF con xref coherente, genéricos) y
agentes (citas, inyección, certificación, minimización, reintento con traza, orquestador). Las corridas con el
modelo real viven en el laboratorio de la app (`npm run prueba:laboratorio-sgi`).

## Cambios

- **0.1.0** (2026-09-30): primera versión. Catálogo 0.1.0 (130 requisitos, corregido tras la revisión dedicada),
  motor, agentes y documentos.
