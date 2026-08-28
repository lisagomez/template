# La imprenta de CLIs — tercera palanca de eficiencia

**Estado (2026-08-25):** medido y cableado. Manifiesto, auditor, medición, skill `cli-audit`
y reglas inline. Ver `docs/SDD-imprenta-de-clis.md`.

## Lo que hay que recordar

- **Los MCP cuestan 20 363 tokens/sesión** (5 medidos de 9; los otros 4 necesitan
  credenciales, así que el total real es MAYOR). Es casi el **doble** que todas las
  instrucciones de la fábrica juntas (~10 900). Nadie lo había medido nunca.
- **El "~100x" heredado está refutado.** Origen: `04-politica-cli-first.md` (Hermes OS),
  afirmación pelada sin medición. El rango real medido va de **2.8x** (releer el `--help`
  entero cada sesión) a **55.8x** (consultar un subcomando).
- **La aportación propia**: el coste del MCP es **incondicional**, el del CLI **condicional**.
  Quien use una herramienta en 1 de cada 20 sesiones ahorra ~49x. Por eso la decisión de
  retirar un MCP es **por servidor y por frecuencia de uso**, nunca global.
- ~~**Aquí no se imprime.**~~ **Corregido el 2026-08-25** (ver `docs/SDD-alineacion-imprenta.md`):
  el *repositorio* no lleva librería de binarios y no debe llevarla — eso sigue —, pero **esta
  máquina SÍ imprime**: binario `cli-printing-press` **4.28.0**, 11 skills `/printing-press*`
  y **cuatro CLIs impresos** (`hcloud`, `supabase`, `telegram-bot`, `digitalocean`). Lo único
  que faltaba era **Go**, instalado hoy (`go1.27.0` en `~/.local/go`; `apt` sólo daba 1.26.0 y
  la press exige ≥1.26.6).
- **El verde en vacío.** El auditor decía "Imprenta conforme: todo CLI del manifiesto está
  impreso" con **cero** declarados: cierto sobre el conjunto vacío e inútil. Un control que se
  aprueba a sí mismo cuando no hay nada que comprobar no es un control. Arreglado + caso.
- **Los cuatro grados, medidos por primera vez**: todos A (96/87/85/84) pero **todos
  parciales** — `auth_protocol` y `live_api_verification` sin puntuar en los cuatro, y
  **anti-reimplementación `skipped` en tres**. Declarados, no aprobados para producción.
- **`supabase-pp-cli` NO sustituye al MCP de Supabase**: es PostgREST sobre el schema público,
  cero novel features. Retirar el MCP "porque ya hay CLI" sería perder capacidad, no ahorrar.
- **Se imprimió `polar` el 2026-08-25** (5 CLIs en la librería). El escalón público funcionó
  antes: Resend, el primer candidato, **ya estaba publicado** — 30-60 min ahorrados. Polar no
  existía en ninguna parte y es con lo que cobra el golden path.
- **Go 1.27.0 ROMPE la imprenta** (`enetx/http2` usa `http.Server.DisableClientPriority`, que
  1.27.0 no expone). Usar **1.26.7**. Y **`generate --force` trunca archivos generados**:
  reimprimir siempre en directorio limpio.
- **La librería pública NO publica grados** (verificado el 2026-08-26: `registry.json`, 465
  entradas, sin campo de grade/scorecard/dogfood; el directorio del skill upstream solo trae
  `SKILL.md`, y `cli-library-index.json` da 404). Chocaba con *sin grado no es aprobado*: el
  escalón 2 era la única vía por la que un CLI entraba sin medir **y sin que nada lo dijera**.
  Instalar de ahí = adoptar un CLI **no medido**; se puntúa con `/printing-press-import` +
  `/printing-press-score`, o se declara y se deja fuera de producción. Regla inline en los dos
  documentos + una comprobación por documento (verificador 127).
- **Y lo que trae dentro se mira antes.** En `pp-resend`, `--agent` expande a `--yes` sobre
  `delete` de claves, contactos y dominios, y el fallback de instalación es
  `go install …@latest`. Un CLI ajeno puede traer auto-confirmación de acciones irreversibles
  sobre terceros: el grado ausente no es el único hueco.
- **Medido en rojo tampoco es aprobado.** `verdict` del dogfood se leía y no se usaba: un CLI
  fallando pasaba como conforme. Ahora un FAIL sin reconocer en el manifiesto rompe el gate.

## Estado en la máquina actual (medido 2026-08-27)

**Aquí SÍ se imprime**: Go **1.26.7** (la press exige ≥1.26.6 y 1.27 la rompe),
`cli-printing-press` **4.31.1** y `~/printing-press/library` con los **5 CLIs** declarados.
`npm run audita:imprenta` sale verde sobre 15 servicios: 5 impresos, los 5 en grado
**parcial**, con el `dogfood FAIL` de `polar` reconocido en el manifiesto. No hay
`.claude/imprenta/indice.json`: el auditor resuelve por librería, y eso basta.

Lo que sigue faltando son **credenciales**: sin ellas `auth_protocol` y
`live_api_verification` no se puntúan, así que el pendiente "grados parciales → aprobados"
no se cierra aquí. Eso es del entorno, no deuda del template. Ver [[entorno-git-y-red]].

> La versión anterior de este párrafo decía lo contrario (Go 1.24.6, sin librería, auditor
> "no verificable") porque describía **otra máquina**. Comprobar antes de citar.

## Cómo se corre

```bash
npm run mide:mcp          # necesita red; deja artefacto fechado
node scripts/audita-imprenta.mjs
npm run mide:contexto     # lee el artefacto, no vuelve a medir
```

## El caso de estudio que lo motivó

La fábrica ya decía "CLI preferido" para Playwright y el skill entero montaba un flujo QA
sobre `npx playwright navigate|click|fill|snapshot` — **comandos que no existen**, deducidos
de los nombres del MCP. Nadie los ejecutó nunca. Corregido y probado; dos contratos
`prohibido` impiden la recaída.

**La lección**: preferir un CLI inexistente cuesta más tokens que el MCP que reemplaza.
Antes de recomendar retirar un MCP, comprobar que el CLI existe de verdad.
