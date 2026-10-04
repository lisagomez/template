# Propuesta de CDC — Soporte SAP, corrida A

> **Propuesta FUERA del registro.** No es una entrada de `.claude/gobernanza/BITACORA-CDC.md`: la firma la
> escribe el laboratorio, con el diff delante, y al firmar se pega allá y se borra este archivo. Un agente no
> escribe «pendiente» dentro del registro.

### 2026-10-04 — Soporte SAP (corrida A): inventario por producto, una superficie declarada, chequeos de deploy, un job con imagen y lock nuevos, extractor 0.8.0 → CDC PROPUESTO — radio: verificador de inventario, declaración de superficie (C3), deploy, cadena de suministro

- **Cambio** (rama `soporte/sap`, 17 commits sobre `main`; lo que toca gobernanza: 12 archivos, +188 −12):
  1. **Gate `verifica:inventario`** (`scripts/inventario/nucleo.mjs`, `vista.mjs`, `scripts/prueba-inventario.ts`,
     `inventario/activos.json`): dos campos opcionales nuevos en el índice, `producto` (slug: el clasificador de
     producto) y `grado` (`A`–`F` o «no medido»); **un asiento que cubre un CLI sin `grado` se rechaza**; la fuente
     `tools/*/clis/*.mjs` descubre cada CLI como unidad, y los 7 de Soporte SAP tienen su asiento («no medido»);
     la vista gana la sección «Por producto». La exportación al ERP lista sus campos y no cambia.
  2. **Superficie declarada (C3)** (`scripts/prueba-a2a.ts`): `/api/soporte-sap` entra a `RUTAS_FUERA_DEL_BRIDGE`
     con su justificación: misma app y puerto, 404 sin `SOPORTE_SAP_LABORATORIO=1`, estado sintético en memoria,
     sin base ni `service_role`. Exponerla sigue siendo gate humano (C3 + C4).
  3. **Deploy** (`scripts/configura-deploy.mjs`, `docker-compose.yml`): `configura:deploy` **rechaza
     `SOPORTE_SAP_LABORATORIO=1`** en producción y exige usuario y contraseña del job si hay `SS_PG_HOST` (solo
     presencia); el compose gana el perfil `semantica` (un disparo, sin puertos).
  4. **Cadena de suministro**: una imagen base nueva pineada por digest (`python@sha256:57cd…`) y un lock de Python
     con hashes (`tools/soporte-sap/semantica/requirements.lock`: dbt-core 1.12.5, dbt-postgres 1.11.0,
     dbt-metricflow 0.15.0, metricflow 0.213.0, Apache 2.0); el Postgres efímero, por digest
     (`postgres@sha256:b0f9…`). Nada de esto entra al bundle de la app.
  5. **Extractor documental 0.8.0** (`tools/extractor-documental`): `clasePorBytes` sube al núcleo (la ingesta de
     Soporte SAP la pidió como versión nueva en vez de parchearla); `lote-corpus` la reusa. Sin cambio de conducta
     (779 pruebas).
  6. **Opcional, no aplicado** (es `gates.json`, CDC por sí mismo): declarar como gates **inactivos** con motivo
     «necesita Docker» el corredor de la capa semántica (`node tools/soporte-sap/semantica/corre.mjs`) y el ensayo
     del job contra el esquema del producto (`node tools/soporte-sap/semantica/ensayo-produccion.mjs`), para que
     queden en el padrón como `erp:prueba`.
- **Motivo**: el DoF de la corrida A pide los CLIs del producto inventariados con su clasificador y su grado, la
  app en laboratorio (una ruta nueva) y la configuración para cualquier VPS; las tres tocan verificadores.
- **Fuera de este CDC, con su propia firma**: el C3 del PRP-008 (v3, con el rol de métricas y la ruta del
  laboratorio) y la AISIA (`docs/goals/soporte-sap-AISIA.md`, borrador con la firma en blanco). No se tocaron
  `AGENTS.md`, `gates.json`, skills, prompts, `routing-modelos.json` ni el modelo.
- **Gate aplicado**: diff visible ☐ (**se enseña completo antes de pedir la firma**:
  `git diff main...soporte/sap -- scripts/ docker-compose.yml inventario/activos.json tools/extractor-documental/src tools/extractor-documental/package.json .gitignore`)
  · regresión capa A ☑ 147/147 · capa B ☑ el corpus está completo (22/22); **los casos no se corrieron en sesiones
  frías**: decide el laboratorio si basta la capa A (no toca skills, prompts, modelo ni instrucciones) ·
  aprobación humana ☐ · pineo ☑ (digests y lock con hashes; sin modelo).
- **Regresión y demostración**:
  - `scripts/prueba-inventario.ts` ☑ 15/15, con la siembra nueva: un CLI sin grado, un producto que no es slug y un
    grado fuera del enum se rechazan; `verifica:inventario` ☑ 241 unidades, 0 nuevas, 0 huérfanas, 0 ambiguas;
  - `prueba:a2a` ☑ 14/14: la ruta nueva **puso el gate en rojo** hasta declararla (2026-10-04, validate de la fase 11);
  - `configura:deploy`: con `SOPORTE_SAP_LABORATORIO=1` sale con 1 y lo nombra; sin ella, exit 0 (caso malo y
    control positivo, con un `.env` sintético que no se commitea);
  - el job en Docker contra el esquema del producto: 1 186 valores en `ss_metrica`, iguales al corte del laboratorio;
  - `npm run validate` ☑ 28/28 activos (8 inactivos declarados) tras el último commit de la corrida.
- **Aprobado por**: _(en blanco: lo escribe el laboratorio)_
