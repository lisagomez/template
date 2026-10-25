# Entrada de CDC — PROPUESTA, fuera de la bitácora

> Goal `docs/goals/capa-arbrain.md`, nodo `gobernanza` (arista `e-gob-skill` y convergencia de la fase 7). **Propuesta,
> no registro**: la firma la escribe el laboratorio. Al firmar, el bloque de abajo se pega al final de
> `.claude/gobernanza/BITACORA-CDC.md` con el nombre en «Aprobado por», y se borra este archivo.

---

### 2026-10-25 — la capa común (`tools/capa`, Arbrain v0.2.10 pineado) y sus enchufes, Recepción, la conversación de la mesa y la voz alineada — radio: padrón de gates (`verifica:enchufes` nuevo en `validate`, `prueba:instancias` inactivo, un artefacto nuevo en `generados`), herramienta y producto (paquete `@tu-scope/capa`, 23 enchufes, el producto Recepción, `tools/{dictado,bucle-voz}`, la mesa de Soporte SAP) e infraestructura de laboratorio (`infra/cerebro-personal`, solo contenedores)

- **Cambio** (rama `capa/arbrain` desde `origin/main` `4b446fb`; commit `1f2c84b`, árbol `a877ff863d53`):
  - **`tools/capa`** (`@tu-scope/capa` 0.1.0, activo base `TPL-capa`): una ventana (conversación, lienzo, explorador
    y panel), ranuras con dueño, intención sin LLM, el freno (cita textual y clic humano), memoria por inquilino con
    almacén inyectado, primer arranque, la ranura de voz con el botón Modo conversación y el resumen de solo conteos.
    Núcleo sin React, Next ni Supabase; interfaz en `./react`. Adapta piezas de Arbrain **v0.2.10** (`829a9e9`,
    etiqueta SSH verificada): 21 adoptadas y 72 reimplementadas, cada archivo con su procedencia; `NOTICE` y
    `LICENSE-FUENTE` (Apache-2.0); sin marca de Arbrain.
  - **El pin de Arbrain**: `tools/capa/upstream.lock.json` (etiqueta, commit, objeto de etiqueta, llave y ruta y huella
    del ancla) y `scripts/capa/{firma,pinea}.mjs`. Subir de versión es otro CDC.
  - **El contrato de módulo**: 23 `enchufe.json` (22 activos con pantalla más Recepción), el verificador
    `scripts/capa/verifica-enchufes.mjs` (10 siembras), el registro generado `src/shared/capa/enchufes.ts` y el montaje
    de la app (`src/app/(main)/layout.tsx`, `src/app/mesa/layout.tsx`, `src/shared/capa/*`).
  - **Gates**:
    - `verifica:enchufes`, **activo en `validate`** (menos de un segundo, sin red);
    - `prueba:instancias`, **inactivo**, con motivo (Docker y ~350 MB) y lo que falta (el perfil con Docker);
    - `capa-registro-de-enchufes` entra a `generados` (banner y comparación por `verifica:enchufes`);
    - el CI (`.github/workflows/gates.yml`), regenerado como proyección del padrón;
    - `/api/recepcion/resumen` declarada en `RUTAS_FUERA_DEL_BRIDGE` (`scripts/prueba-a2a.ts`, RF-20: misma app y mismo
      puerto, solo lee conteos).
  - **Recepción** (`productos/recepcion.json`, composición, `src/features/recepcion`, `/recepcion` y
    `/api/recepcion/resumen`): producto sintético que compone la capa, `tools/calendario`, la voz local y
    `estudio-pymes`; fila en el índice del portafolio y activos en el inventario.
  - **La mesa del experto**: su ranura de conversación sin modelo (`soporte-sap.prueba-caso`, `explica-paso`,
    `ensenado`), montada en la capa con la marca de Soporte SAP; nada de lo que escribe el experto en el navegador.
  - **Voz**: el enchufe compatible con OpenAI en el servicio de dictado (`/v1/audio/transcriptions`,
    `/v1/audio/speech`, `GET /v1/models`, con su Bearer), los adaptadores de nube **apagados** con proveedor simulado,
    el acuse inmediato elegido por el enrutador sin LLM, la voz del dispositivo solo si es local, el cerebro simulado
    para medir (`CEREBRO_SIMULADO_MS`), el módulo `src/shared/capa/modulos/voz.ts` y el corpus D del enrutador.
  - **Infraestructura de laboratorio**: `infra/cerebro-personal/` (dos instancias en contenedores, el job que
    sincroniza solo el cerebro, la puerta de Cloudflare validada sin conexión y el resumen hacia la agenda) y
    `docs/CEREBRO-PERSONAL.md`. Nada encendido fuera de la máquina.
  - **Herramientas del laboratorio**: `scripts/capa/actualiza.mjs` (trae lo firmado y se para en el CDC) y
    `scripts/capa/lee-cerebro.mjs` (lee un espejo del cerebro en solo lectura).
- **Por qué**: el laboratorio decidió el 25/10 que toda herramienta, app y producto se sienta como Arbrain y que
  intercambiar módulos no toque la capa (spec, «Decidido por el laboratorio»). La capa es el activo base que lo hace
  posible; el enchufe es lo que vuelve el intercambio un dato.
- **Lo que decide el laboratorio al firmar**:
  1. que la capa entra como activo base, y que el pin de Arbrain es v0.2.10;
  2. que `verifica:enchufes` corre en cada `validate` (un activo con pantalla sin enchufe pone el `validate` en rojo);
  3. que `prueba:instancias` queda fuera del `validate` hasta que haya un perfil con Docker;
  4. que el servicio de dictado gana `/v1/audio/*` y `/v1/models` (superficie nueva, solo `127.0.0.1` y con Bearer:
     C3 T-11);
  5. que `/buzon/[pyme]` queda como brecha del recorrido (61/62), decidido el 2026-10-25.
- **Lo que esta entrada NO aprueba** (cada una es su propio CDC o gate):
  - aplicar la skill de actualización (`docs/goals/capa-arbrain-propuestas/skill-actualiza-capa/SKILL.md`) ni las
    skills realineadas del proyecto o de `~/.claude/skills` (`docs/goals/capa-arbrain-propuestas/global/`);
  - el C3 de las instancias y el C4 de la voz en la nube (borradores en la misma carpeta, se firman aparte);
  - la revisión 14 de la AISIA de Soporte SAP (nota en la misma carpeta);
  - encender el VPS, Tailscale o Cloudflare, desplegar la mesa con la conversación y un modelo real en la capa.
- **Demostrado** (2026-10-25; las salidas están en `docs/goals/capa-arbrain-evidencia/`):
  - `FIRMA_OK v0.2.10 829a9e9 (lock vigente)`;
  - capa: `prueba:tools -- capa` 33 pruebas y `empaqueta capa` en verde (3 subpaths en un proyecto limpio; `./react` sin
    probar ahí por falta del peer opcional);
  - enchufes `23/23` y `10/10` siembras;
  - recorrido de la app: 62/63 rutas dentro de la capa y 0 errores de consola (brecha `/buzon/[pyme]`, decidida); en
    una corrida anterior apareció un aviso de hidratación intermitente que no se reprodujo (R13);
  - Recepción: 11 pasos de capturas en verde y la recomposición con `git diff --stat -- tools/capa` vacío;
  - mesa: la conversación 12/12, su recorrido 26/26 y la prueba de que nada sale (red sin salida, 51 peticiones al
    origen local, almacén con 9 archivos y ninguno de la conversación);
  - instancias `PRUEBA_OK: (a)-(h)`, 69 comprobaciones, sobre el código final;
  - voz: bucle-voz 95, dictado 169 y voz 98 pruebas en verde; acuse p50 630 ms en la corrida comparable (646 en la
    cargada); «para» 16/16 sin tardías y eco 0/6 en las cuatro corridas; órdenes y reacción del «para» más lentas que
    la base y **no atribuidas** (`voz.md`, «Control del coordinador»); enrutador 71,6 % en el corpus D (caída declarada);
  - skill: simulacro v0.2.9 → v0.2.10 parado en el CDC y etiqueta sin firma o llave ajena → `FALLA` sin escribir nada.
- **Lo que cuesta o queda abierto**: `validate` gana un gate de menos de un segundo; las brechas declaradas en
  `docs/goals/capa-arbrain-evidencia/decisiones.md` §2.
- **Salida del perímetro (C4)**: ninguna nueva. La capa no saca nada de la máquina; los adaptadores de voz en la nube
  quedan apagados (su C4 es aparte); el resumen hacia el cerebro personal solo existe en contenedores.
- **Gate aplicado**:
  - diff revisado ☐ (el laboratorio, en el chat, antes de firmar);
  - regresión capa A ☑ 166/166 (dentro del `validate`);
  - `npm run validate` ☑ 34/34 gates activos (11 inactivos declarados) sobre `1f2c84b` (árbol `a877ff863d53`), en
    16 min, en la máquina del laboratorio; gobernanza 171/171;
  - capa B: no corrida por el agente: no cambia `AGENTS.md`, ningún skill ni ningún prompt; decide el laboratorio ☐;
  - aprobación humana ☐;
  - pineo ☑ (Arbrain por etiqueta firmada y commit; `zod` 4.6.1 exacto; sin modelo).
- **Regresión**: `verifica:enchufes` 23/23 y 10/10 siembras; `verifica:gates` 12/12; `verifica:generados` 65 y 8/8
  siembras; `verify:gobernanza` 171/171; `verifica:productos` 43/43 siembras; `verifica:inventario` 301 unidades;
  `prueba:tools` 19 suites y 2350 pruebas; `audita:secretos` limpio en toda la historia.
- **Aprobado por**: (lo escribe el laboratorio al firmar)
