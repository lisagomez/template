# Propuesta de CDC: marca Turno 25, banco de motores, humanizer y skills de Emil Kowalski

> PROPUESTA, FUERA DEL REGISTRO. No se pega en `.claude/gobernanza/BITACORA-CDC.md` hasta que el
> laboratorio la firme: una entrada sin firma tumba `verify:gobernanza` (aprendizaje del 2026-09-20).
> Al firmar se pega como entrada y este archivo se borra.

### 2026-11-02 — la marca Turno 25 como fuente única, el banco de motores, dos revisores en `validate` y doce skills de terceros vendorizados — radio: design system (re-auditoría), padrón de gates (dos gates nuevos en `validate`, un artefacto nuevo en `generados`, un grupo `fuera` ampliado), dos skills que se cargan (CDC estándar), un estante de diez skills sin coste por sesión, herramienta nueva (`tools/banco-motores`) y la capa del laboratorio

- **Cambio** (lo construido, rama `turno25/marca-banco`, sin push):
  1. **Design system `turno-25`** en `.claude/design-systems/turno-25/`: `tokens.json` (fuente única, transcrita
     de la guía v1.0), `turno-25.md`, capturas e `inventario-interfaz.json`. Fila nueva en su README.
  2. **Generador** `scripts/marca/genera.mjs` → `src/app/marca.generada.css` y `src/shared/marca/tokens.generado.ts`,
     con banner `ALTO` y `--comprueba`. **Alta en `generados`** (`marca-turno25`), con banner explícito porque el
     CSS lo lleva en `/* */`.
  3. **La app**: `globals.css` sin tokens a mano (los importa `layout.tsx`), fuentes autoalojadas (OFL),
     `lang="es"`, `tailwind.config.ts` con familias, curvas, duraciones, colores de marca y estados, y
     `hoverOnlyWhenSupported`. Migrados a tokens: acceso (login, alta y su layout, que arregla el título
     invisible en oscuro), la capa del laboratorio (`marca-laboratorio.css`, acotada a `data-capa-ventana="laboratorio"`;
     el acento de `productos/composiciones/laboratorio.json` pasa de `#0f766e` a `#F26419`) y las tarjetas de caso.
  4. **`tools/banco-motores`** (0.1.0, sin empaquetar) y **`src/features/banco`** (`/laboratorio-banco`,
     `/api/banco`), cerrados fuera del laboratorio (`BANCO_LABORATORIO=1` y no producción). Enchufe nuevo
     (`banco`) en la composición del laboratorio; tres activos nuevos en `inventario/activos.json`.
  5. **Dos gates nuevos en `validate`**: `revisa:interfaz` y `revisa:voz`, con `--prueba` (siembras).
  6. **Skills**: `humanizer` (`blader/humanizer@225a6f39`) y `emil-design-eng` (`emilkowalski/skills@f1090bec`)
     en `.claude/skills/`; diez de Emil en `.claude/estante/emil-kowalski/`. Texto del upstream sin tocar,
     `LICENSE` y `ORIGEN.md` con sha256. Conteo de skills a 30 en `CLAUDE.md`, `AGENTS.md`, `README.md` y
     `.claude/README.md`; `GEMINI.md` regenerado.
  7. **Grupo `fuera` ampliado** con `public/banco/ejemplos/**` (render de Chromium, no determinista byte a byte).
- **Motivo**: el goal `docs/goals/gradio-marca-turno25.md`, compilado y lanzado por el laboratorio el 2026-11-02
  (Gradio estudiado y no instalado; humanizer y skills de Emil pedidos por el laboratorio).
- **Lo que decide el laboratorio al firmar**:
  - si el **banco** se queda con esta forma (núcleo en `tools/`, pantalla en la app y no en un entry `./react`);
  - si las **dos skills cargadas** compensan su coste (169 tokens por sesión; el total queda en 11 477 de 12 000);
  - si los **dos gates** entran a `validate` con su alcance actual (voz: diez superficies; interfaz: trinquete
    sobre 230 archivos heredados).
- **Lo que esta entrada NO aprueba** (cada uno es su propia decisión):
  - subir el techo de 12 000 tokens de `presupuesto-contexto.json`;
  - mover un skill del estante a `.claude/skills/`;
  - la v1.1 de la marca (subir `fg-3`, los estados oscuros derivados, las curvas de Emil);
  - migrar Ágora, Soporte SAP, Recepción o el portal de clínicas a Turno 25;
  - redesplegar cualquier superficie;
  - elegir logo.
- **Salida del perímetro (C4)**: ninguna. Fuentes autoalojadas, sin CDN y sin analítica. El banco corre los
  motores en local; medido con Playwright: 37 peticiones en un recorrido completo, todas a `localhost`.
- **Gate aplicado** (las casillas vacías son del laboratorio):
  - [x] diff completo en la rama (`git diff main...turno25/marca-banco`)
  - [x] `npm run regresion` (capa A) en verde, con los 30 skills
  - [x] `npm run validate` completo en verde tras el commit, en worktree con `npm ci` real
  - [ ] `npm run regresion -- --trampa` (capa B, en sesión fría)
  - [ ] lectura de los doce `SKILL.md` vendorizados por el laboratorio
  - [ ] firma
- **Regresión** (cómo se corre): `npm run validate`; `node scripts/marca/revisa-interfaz.mjs --prueba`;
  `node scripts/marca/revisa-voz.mjs --prueba`; `npm run marca:comprueba`; `npm run prueba:tools -- banco-motores`.
- **Aprobado por**: lo escribe el laboratorio.

## Nota C3: la superficie del banco

| | |
|---|---|
| **Qué expone** | `GET /api/banco`, `POST /api/banco/<id>` y `/laboratorio-banco` |
| **Quién llega** | Solo quien corre la app en local con `BANCO_LABORATORIO=1`. En producción (`NODE_ENV=production`) no existe aunque la variable esté puesta: 404 |
| **Qué entra** | JSON validado por Zod; imágenes en data URL con MIME en lista cerrada (PNG, JPEG, WebP) y tope de 4 MB; cuerpo con tope de 8 MB |
| **Qué ejecuta** | Tesseract por `motorPorProceso` (temporal solo del usuario, borrado siempre; errores sin stdout), el parser GS1 (TS puro) y el generador de peor caso. Ningún comando lo elige quien llama |
| **Qué devuelve** | Solo la salida que cumple su esquema; un error del motor, recortado a su primera línea |
| **Riesgos que quedan** | Cancelar deja de esperar, pero el proceso de Tesseract sigue hasta su tope de 120 s. Sin límite de peticiones por minuto (aceptable en local; no lo sería expuesto) |
| **Lo que haría falta para exponerlo** | Auth de la app, límite de peticiones, revisión C3 completa y C4: por eso está cerrado |
