# Soporte SAP — la AISIA y el C3, listos para firmar (solo laboratorio) — Spec

> Compilado el 2026-10-05 con `/goal-compiler`. Worktree `soporte-firmas`, rama `soporte/firmas`, sobre `main`
> en `bd1d3d9`: Soporte SAP mergeado (#211, #212) y sus dos CDC firmados en la bitácora.
> **Alcance decidido por el laboratorio: solo laboratorio.** La firma cubre operar con datos sintéticos, el
> simulador en lugar de SAP y sin LLM real. Salir del laboratorio sigue exigiendo las D que lista la AISIA (§5).

## MISIÓN

Cuando termines, el laboratorio abre un **kit de firma** y puede firmar sabiendo que **cada frase** de la AISIA y
del C3 de Soporte SAP es verdad sobre el código que hoy está en `main`. No firma porque «lo dice el documento»:
firma con la evidencia delante.

- **AISIA** (C4): `docs/goals/soporte-sap-AISIA.md`, borrador v2 del 2026-10-04.
- **C3** (modelo de amenazas): `.claude/PRPs/PRP-008-soporte-sap.md`, §Gobernanza, v3.

Lo que tiene que existir:

1. **Una matriz de trazabilidad** que nadie pueda leer como intención:
   - **AISIA**: cada daño del §2 → su severidad, probabilidad y reversibilidad (§3) → su mitigación (§4) → el
     control en el código (archivo y línea, o política SQL) → la prueba que lo demuestra → **el sabotaje que la
     pone en rojo** → el resultado de correrla hoy. Los riesgos infirmables del §5 (límite de C5) se marcan
     como tales: su control los cierra o el producto no los ofrece, y la matriz dice cuál de las dos.
   - **C3**: cada activo, frontera y atacante (O1–O6) → su control → la prueba → el sabotaje → la **brecha**
     declarada si existe.
   - Cada fila con un comando que la reproduce. Una afirmación sin prueba que se ponga roja es una intención,
     no un control: o se prueba, o se corrige el texto, o se declara brecha. Nada queda en «se supone».
2. **Una revisión independiente**: un agente con contexto fresco, que no escribió ni la AISIA ni el C3 ni esta
   matriz, intenta romper cada afirmación contra el código de `main`. Es la lección del 2026-10-04: la v1 del C3
   afirmaba cuatro controles que el SQL no tenía, y la v1 del anonimizador fugaba 54 de 63 entradas que el autor
   no imaginó. Cada hallazgo se resuelve de una de tres formas, y la matriz lo dice: arreglo en código con su
   prueba negativa, corrección del texto o brecha declarada.
3. **Los dos documentos al día con `main`.** Desde la v2 y la v3 entraron, entre otras cosas:
   - la RLS de `ss_metrica` con `visible_al_cliente` y la etapa;
   - el job de la capa semántica y su rol `soporte_sap_metricas`;
   - la ruta `/api/soporte-sap`, declarada y rechazada en producción por `configura:deploy`;
   - los terceros del manifiesto (`productos/soporte-sap.json`: la base gestionada D10, el VPS D12 y el modelo D7).

   Además, los dos quedan completos según sus plantillas: el C3 hoy no tiene **Flujos** ni **Priorización**
   (`.claude/gobernanza/plantillas/modelo-amenazas.md`, pasos 3 y final). La AISIA conserva sus cinco secciones
   (`plantillas/aisia.md`) y sus disparadores de revisión. El encabezado del PRP-008, que todavía dice «EN
   EJECUCIÓN», dice su estado real.
4. **El kit de firma**, fuera de todo registro:
   - el texto final de cada documento con la firma en blanco;
   - dónde aterriza cada uno al firmarse:
     - la AISIA en `.claude/gobernanza/AISIA-soporte-sap.md`, como la del asesor de voz
       (`AISIA-asesor-ventas-fase0.md`);
     - el C3 con su línea de firma en el PRP-008;
     - la línea `**Firma:**` del contrato `src/features/soporte-sap/BUSINESS_LOGIC.md`, que dice «pendiente»;
     - el estado de la fila del índice en `BUSINESS_LOGIC.md` raíz;
   - pasos de **una línea**, en el orden en que el laboratorio los corre, incluido qué archivos se borran o
     cambian después de firmar para que ningún enlace quede roto.

**Horizonte.** Que esta forma de cerrar una AISIA y un C3 sirva para el siguiente producto: la matriz como
artefacto reproducible, y quizá como gate. Si conviene que lo sea, su alta va con su **propuesta de CDC fuera del
registro**, y lo decides tú.

## LIBERTAD TÉCNICA

Eliges la forma de la matriz (un script que corre las pruebas y los sabotajes y la imprime, una tabla generada,
lo que mejor sirva), cómo sembrar cada sabotaje, cómo repartir la revisión independiente y cómo empaquetar el
kit. Lo que esta spec nombra es contexto, no requisito, salvo RESTRICCIONES. Reusa lo que ya existe antes de
escribir algo nuevo:
- las pruebas y evidencias de `tools/soporte-sap` (`pruebas/`, `evidencia/`);
- los sabotajes de la sala (`npm --prefix tools/sala-a2a run sabotajes`);
- el patrón de siembras de `scripts/verifica-productos.mjs`.

## INVESTIGA ANTES DE CONSTRUIR

- **Las fuentes:**
  - los dos documentos;
  - sus plantillas;
  - `GOBERNANZA.md` §C3–C5;
  - el informe A (`docs/goals/soporte-sap-informe-a.md`, §5 y §6);
  - el SDD (`docs/SDD-soporte-sap.md`, §13 y §16);
  - `.claude/rules/aprendizajes-gobernanza.md`.
- **Las referencias externas** sobre evaluación de impacto de IA y modelado de amenazas, para que la matriz no
  sea una invención local. Elige tú cuáles (por ejemplo ISO/IEC 42005, el NIST AI RMF o STRIDE/LINDDUN para los
  datos personales). Cítalas.
- **Antes de cada edición grande**, reafirma el objetivo en una línea.

## DEFINICIÓN DE HECHO (evidencia visible en la conversación)

1. **La matriz pegada**:
   - la AISIA completa (cada daño de §2) y el C3 completo (cada control y cada brecha);
   - cada fila con su comando y su resultado de hoy;
   - **cada sabotaje en rojo con el control quitado y en verde sin sabotaje**;
   - las afirmaciones que no tenían prueba, contadas, y qué se hizo con cada una.
2. **La revisión independiente**: quién la hizo (que no es el autor), sus hallazgos tal cual y la resolución de
   cada uno.
3. **Los diffs** de la AISIA y del C3, con lo que cambió respecto de la v2 y la v3 y por qué.
4. **El kit**: el texto final de cada documento con la firma en blanco y los pasos de una línea, pegados.
   Ninguna firma, «firmada» ni «PROMOVIDO» escritos por el agente.
5. **`npm run validate` en verde tras el último commit**, con el conteo de gates.
6. **Si tocaste un gate, un skill, un prompt, una plantilla o `settings.json`**: la propuesta de CDC fuera del
   registro, con `npm run regresion` y `npm run regresion -- --trampa` en verde y la firma en blanco.
7. **Las formas en que esto podría estar mal o incompleto**, y cuáles resolviste.

## COMANDO DE VALIDACIÓN

- **Una vez, al empezar:** `npm ci --no-audit --no-fund`. El worktree nace sin `node_modules`.
- **Tras cada cambio grande:** `npm run typecheck && npm run lint` más las pruebas del producto que toque
  (`npm --prefix tools/soporte-sap run prueba` y `npm --prefix tools/sala-a2a run prueba`), y la matriz.
- **Al cerrar cada fase:** commit y `npm run validate`, **después** del commit.

Surfea el output en la conversación.

## RESTRICCIONES REALES

- **No firmas nada ni das nada por firmado.** No escribes «Firmada por», «Estado: firmada», `**Firma:**` lleno ni
  «PROMOVIDO». Tampoco creas ni editas nada dentro de `.claude/gobernanza/` (bitácora, registro de riesgo,
  incidentes ni AISIA firmadas). El kit queda fuera de los registros. El clasificador lo bloquea, y es correcto
  que lo haga.
- **No decides D1–D15.** Si una mitigación depende de una D, la AISIA lo dice y la matriz la marca. No conviertes
  un riesgo infirmable (límite de C5: el daño cae sobre quien no firmó) en uno firmable.
- **Sin SAP, datos ni LLM reales, y sin exponer, desplegar, hacer push ni abrir PR.** Lo que no se puede probar
  sin un servicio real (Realtime, el JWT de Supabase, un modelo) se declara **brecha**, nunca evidencia
  inventada.
- **No reabres el producto** más allá de lo necesario para que una afirmación sea verdad: un control que falla se
  arregla con su prueba negativa, o se corrige la frase. No apagas ni borras un gate.
- **Lecciones de las corridas A y B:**
  - ningún identificador con forma de caso-trampa (`T` + uno o dos dígitos);
  - toda huella como `sha256:<hex>`;
  - `npm run inventario:vista` en cada commit que añade archivos;
  - ningún `prueba-*.mjs` huérfano;
  - `.next/dev` se borra antes de validar.
- **El revisor independiente** usa el modelo que `.claude/routing-modelos.json` asigna a gobernanza: lo que decide
  sobre riesgo no se abarata (C8).

## RED DE SEGURIDAD

- **Si un control no se puede probar tras 3 intentos**, déjalo en rojo en la matriz, explica por qué y propón
  qué haría falta: una prueba, una D o un servicio real.
- **Si la revisión encuentra algo que cambia el alcance de la firma** (un daño nuevo infirmable o un control que
  no existe), detente y repórtalo antes de reescribir la decisión de la AISIA.
