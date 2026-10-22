# Soporte SAP × sapstack: anexos de la propuesta

Anexos de `soporte-sap-sapstack-propuesta.md`. Las secciones 1 a 4 son la salida, sin tocar, de
`node docs/goals/soporte-sap-sapstack-evidencia/mide.mjs` (solo lectura, determinista) sobre la copia de sapstack en
`5be80773025a3ace996f02a5b0a8557779eaa334`.

## 1. sapstack, contado (Fioriuser2021/sapstack@5be80773025a)
- archivos 146 · módulos 14 (sap-abap, sap-basis, sap-bc, sap-btp, sap-co, sap-fi, sap-gts, sap-hcm, sap-mm, sap-pp, sap-s4-migration, sap-sd, sap-sfsf, sap-tr) · SKILL.md 14 · agentes 9 · comandos 10 · escenarios 5 · guiones 13 · flujos de CI 2
- T-codes: 290 líneas de clave, 289 únicos (README:7 dice 279); repetidas: MRBR (539, 933)
- T-codes por módulo: AA 4 · ABAP 26 · BASIS 52 · BC 58 · CO 17 · FI 72 · GTS 16 · HCM 13 · MM 48 · PP 30 · SD 36 · TR 9 · WM 1
- T-codes por release: both 270 · ecc_only 14 · s4_only 5
- SAP Notes: 46 (README:36 dice «50+») · por categoría: config 12 · dump 5 · korea 6 · migration 14 · performance 5 · security 4
- licencia: Copyright (c) 2026 BoxLogoDev · los badges apuntan a BoxLogoDev/sapstack (README:9)
- check-tcodes.sh revisa 1418 de las 2912 líneas de cuerpo de los 14 SKILL.md (49 %): cada `---` vuelve a encender su filtro de frontmatter

## 2. La transcripción, contra el código
| # | Afirmación | Veredicto | Por qué | Evidencia |
|---|---|---|---|---|
| A1 | Existe `sapstack-ci-reusable.yml` y se invoca desde repos corporativos externos | **a medias** | Es reusable (workflow_call), pero su ejemplo apunta a BoxLogoDev/sapstack, que da 404, y `sapstack-ref` vale `main` por defecto. Las actions van por tag, no por SHA (3). | .github/workflows/sapstack-ci-reusable.yml:16 · .github/workflows/sapstack-ci-reusable.yml:8 · .github/workflows/sapstack-ci-reusable.yml:36 · .github/workflows/ci.yml:16, .github/workflows/sapstack-ci-reusable.yml:46 (+1) |
| A2 | Hay una guía para Jenkins o GitLab CI | **falsa** | Ni Jenkins ni GitLab aparecen en el repo: es una sugerencia, no algo que exista. | — |
| A3 | El repo tiene «unos 279 T-codes confirmados» | **a medias** | 290 líneas de clave y 289 códigos únicos: MRBR está 2 veces. Un lector YAML estricto rechaza el archivo; uno tolerante se queda con la última. «Confirmados» lo dice el archivo, sin fuente por entrada. | README.md:7 · data/tcodes.yaml:539, data/tcodes.yaml:933 |
| A4 | Una jerarquía programática bien documentada, resumida por módulos | **cierta** | Los T-codes van agrupados por secciones de módulo y cada uno lleva `modules` y `release`. | data/tcodes.yaml:19 |
| A5 | En un entorno coreano, la herramienta busca primero en la carpeta de excepciones locales y si no, aplica la regla global | **falsa** | No hay carpeta de excepciones ni lógica de respaldo. Lo coreano es un perfil de entorno que el asistente lee (`korea:`); nada resuelve un choque entre reglas. Las palabras «fallback/override» solo salen con otro sentido (.github/ISSUE_TEMPLATE/feature_request.md:26, commands/sap-abap-review.md:28 (+4)). | .sapstack/config.schema.yaml:105 · carpetas de excepciones: — |
| A6 | `resolve-note.sh` interactúa con las actualizaciones generales, y la guía debe explicar cómo no rompe lo local | **falsa** | Solo busca palabras clave en `data/sap-notes.yaml` y devuelve número, título y URL. No lee reglas locales ni globales, ni participa en ninguna actualización. | scripts/resolve-note.sh:17 |
| A7 | Al actualizar el módulo global, el sistema verifica y aísla las dependencias para no romperlas | **falsa** | No existe ese mecanismo: no hay dependencias declaradas entre reglas. | — |
| A8 | `data/tcodes.yaml` es el archivo maestro de datos | **a medias** | Es la lista contra la que `check-tcodes.sh` revisa los SKILL.md: valida, no genera. Ninguna regla de las plataformas sale de él. | scripts/check-tcodes.sh:2 |
| A9 | `build-multi-ai.sh` captura un cambio en el YAML y reescribe las reglas para todas las plataformas | **falsa** | No lee `tcodes.yaml`: solo inyecta bloques de lista de plugins y estadísticas entre marcadores. Y ningún archivo de las plataformas tiene esos marcadores (0). | scripts/build-multi-ai.sh:11 · marcadores fuera de scripts/docs: — |
| A10 | Los archivos generados llevan (o deben llevar) un banner «ALTO: autogenerado» | **falsa** | Ninguno de los 7 archivos de destino de la capa multi-IA lleva banner: hoy nada distingue lo generado de lo escrito a mano. | — |
| A11 | `CONTRIBUTING.md` es el lugar para el diagrama de mantenimiento | **cierta** | Existe, pero sin diagrama de fuente única. | CONTRIBUTING.md:1 |
| A12 | Hay validaciones locales que mapear a un CI empresarial | **cierta** | 8 guiones de validación en `scripts/`, y un `ci.yml` que los corre. | .github/workflows/ci.yml:9 |

## 3. El cruce con Soporte SAP (medido con su dist)
- triage (`transaccionDe`): reconoce 16 de 289 T-codes de sapstack: BD87, F-02, FB01, FBL1N, ME21N, MIGO, MMPV, OB52, PA30, SM37, SU01, VA01, VA02, VF01, WE02, XD02
- anonimizador: T-codes tapados como nombre o usuario (en 3 cajas) 45 de 289 (ABAVN, AFAB, AJAB, CKMLCP, COGI, FAGLGVTR, FBCJ, FBMP)
- anonimizador: nombres de transacción tapados 274 de 276; p. ej.:
  - ABAP Editor → Abrí ABAP [NOMBRE] y sale el error
  - ABAP Runtime Error (Dump) Analysis → Abrí ABAP [NOMBRE] (Dump) [NOMBRE] y sale el error
  - AP Aging Report → Abrí AP [NOMBRE] y sale el error
  - AR Aging Report → Abrí AR [NOMBRE] y sale el error
  - Account Assignment Model → [NOMBRE] y sale el error
  - Account Determination → [NOMBRE] y sale el error
  - Account Determination for Material Management → [NOMBRE] for [NOMBRE] y sale el error
  - Activity Type Price Planning → [NOMBRE] y sale el error
- anonimizador: títulos de SAP Note tapados 46 de 46
- candidatos por módulo (primer módulo; entra = un módulo que Soporte SAP atiende):
  - ABAP: entran 19, no entran 0
  - BASIS: entran 52, no entran 0
  - CO: entran 1, no entran 16
  - FI: entran 60, no entran 0
  - GTS: entran 0, no entran 16
  - HCM: entran 13, no entran 0
  - MM: entran 46, no entran 0
  - PP: entran 0, no entran 29
  - SD: entran 31, no entran 0
  - TR: entran 0, no entran 6
  - total T-codes: entran 222, no entran 67 · SAP Notes: entran 44, no entran 2

## 4. El grafo, corrido (paquete de prueba 0.0.1-candidato, sin registrar)
- validaConocimiento: ok=true · 222 categorías y 222 reglas · problemas: ninguno
- contenciones sin cubrir (el gate las pediría declaradas): 1 · keywords que chocan con el catálogo real: 0
| Escenario | Hoy (categoriza) | Con candidatos: categoría | Motivo | Destino | Razón |
|---|---|---|---|---|---|
| 01-miro-tax-code | módulo —, transacción — | TC_ME23N | regla | al experto (hipótesis sin validar) | ME23N: Display Purchase Order (sapstack v1.4.0 (5be8077), data/tcodes.yaml:518; fuente secundaria sin verificar) |
| 02-f110-payment-failure | módulo —, transacción — | TC_F110 | regla | al experto (hipótesis sin validar) | F110: Automatic Payment Transactions (sapstack v1.4.0 (5be8077), data/tcodes.yaml:271; fuente secundaria sin verificar) |
| 03-afab-dump | módulo BASIS, transacción — | TC_AFAB | regla | al experto (hipótesis sin validar) | AFAB: Post Depreciation (sapstack v1.4.0 (5be8077), data/tcodes.yaml:357; fuente secundaria sin verificar) |
| 04-bp-migration | módulo —, transacción — | — | sin_regla | al experto (sin_regla) | sin regla aplicable |
| 05-korean-unicode-dump | módulo —, transacción — | — | sin_regla | al experto (sin_regla) | sin regla aplicable |
- herencia (choque global ↔ local sin declarar): gate conflicto_de_veredicto · motor conflicto → al experto (conflicto)
- herencia (declarado: la global se cierra y la local la reemplaza): gate sin problemas · motor regla → solución conocida

## 5. Los fragmentos de CI, completos

Ejemplos de la propuesta (sección 7.1): **no se conectan a nada**. Cada uno saldría generado de `.claude/gates.json` con
`proyecta:gates`, con su banner, y todo fijado: las actions por SHA y la imagen por digest (la misma base que ya fija
`scripts/laboratorio-alojado/Dockerfile`).

GitHub Actions (`.github/workflows/gates.yml`):

```yaml
# ALTO: ARTEFACTO AUTOGENERADO desde .claude/gates.json (npm run proyecta:gates -- --ci github). No lo edites.
name: gates
on: [pull_request]
permissions: { contents: read }
jobs:
  validate:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with: { node-version: '22.18.0' }
      - run: npm ci
      - run: node scripts/corre-gates.mjs validate
```

GitLab CI (`.gitlab-ci.yml`):

```yaml
# ALTO: ARTEFACTO AUTOGENERADO desde .claude/gates.json (npm run proyecta:gates -- --ci gitlab). No lo edites.
gates:
  image: node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - npm ci
    - node scripts/corre-gates.mjs validate
```

Jenkins (`Jenkinsfile`, declarativo):

```groovy
// ALTO: ARTEFACTO AUTOGENERADO desde .claude/gates.json (npm run proyecta:gates -- --ci jenkins). No lo edites.
pipeline {
  agent { docker { image 'node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5' } }
  options { timeout(time: 45, unit: 'MINUTES') }
  stages {
    stage('gates') {
      steps {
        sh 'npm ci'
        sh 'node scripts/corre-gates.mjs validate'
      }
    }
  }
}
```

Por qué así y no el reusable de sapstack: aquel valida **su** checkout y no el del que llama, baja los guiones de `main`
si no se le pasa `sapstack-ref`, y fija las actions por tag. Aquí el CI corre el mismo padrón que `npm run validate`, en
el repo que lo llama, y lo que se fija no se mueve solo.

## 6. Cómo reproducir

```
npm ci && npm run prepara:gate                                         # los dist/ de tools/
git clone --depth 1 https://github.com/Fioriuser2021/sapstack <copia>   # en una carpeta propia; no se corre nada de ella
git -C <copia> rev-parse HEAD                                          # debe ser el pin de fuente.json
node docs/goals/soporte-sap-sapstack-evidencia/mide.mjs <copia>
node src/features/soporte-sap/mesa/fuentes/extrae.mjs sapstack <copia>  # el catálogo; sin cambios, no hay diff
```
