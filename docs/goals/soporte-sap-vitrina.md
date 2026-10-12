# Soporte SAP en Vercel: vitrina, en vivo, journey, deck y manual — Spec

> Compilado el 2026-10-11 con `/goal-compiler`. Decisiones del laboratorio: Vercel hace de puerta, protegido, y la
> sección en vivo pasa al laboratorio local por un túnel; el deck es para las consultoras que lo comprarían.

## MISIÓN

Cuando termines existe una URL de Vercel, protegida (solo la abre quien el laboratorio invite), que es la mejor
demostración posible de Soporte SAP para una consultora que lo compraría. Una consultora la abre y en cinco minutos
entiende el producto sin que nadie se lo explique, y nada de lo que ve es falso.

1. **La vitrina de los tres niveles**, en bento-grid: el laboratorio (N1), la consultora (N2) y su cliente (N3), cada
   uno con su bento. Se pinta desde un estado sintético congelado que el laboratorio genera en local **con el mismo
   código del producto**: no es una maqueta dibujada aparte, y si el producto cambia se regenera. Siempre disponible.
2. **En vivo**: una sección de la misma URL que pasa al laboratorio que corre en la máquina del laboratorio, por un
   túnel, mientras esté encendido. Ahí se hace el recorrido de verdad: el N3 levanta una incidencia con adjuntos, se
   extrae la evidencia, el agente categoriza, el plan pasa por la sala, una persona aprueba, el simulador aplica y el
   SLA corre. Si la máquina está apagada, la sección lo dice y todo lo demás sigue.
3. **El journey de experiencia de usuario**, de punta a punta y a través de los tres niveles: qué hace, ve y necesita
   cada persona en cada paso; dónde se mide (el SLA, la respuesta del laboratorio de D13); dónde decide una persona y no
   el agente; dónde se protege un dato (anonimizador, cuarentena, grupos de 3 o más). Cada paso enlaza a su captura y a
   la vista real.
4. **El deck para consultoras** (la N2, quien paga), en bento-grid, en la misma URL y exportable a PDF. Cuenta su
   dolor, cómo trabaja cada nivel, el journey, lo que se mide, lo que el producto no hace (como parte de la propuesta) y
   lo que todavía no se promete.
5. **El manual de usuario por rol**: laboratorio (superadmin y experto), consultor y usuario del cliente. Va en la misma
   URL y en el repo, paso a paso y con capturas reales.

## LO QUE YA EXISTE (hechos, verificados el 2026-10-11)

- **Dónde se trabaja**:
  - Worktree `/home/gsore/code/template/.claude/worktrees/soporte-vitrina`, rama `soporte/vitrina-vercel` desde `main`
    (`cdefd05`).
  - No tiene `node_modules`. Haz un `npm ci` real: un `node_modules` enlazado rompe Turbopack.
- **La app**:
  - La página `/soporte-sap` está en `src/app/(main)/soporte-sap/page.tsx`.
  - Los componentes están en `src/features/soporte-sap/components/`; el bento de cada nivel, en `soporte-sap.tsx`.
  - La API está en `src/app/api/soporte-sap/route.ts`.
  - El runtime de laboratorio es `src/features/soporte-sap/services/runtime.ts`: en memoria, con identidades de
    laboratorio, OCR por un proceso local (Tesseract) y `node:crypto`/`node:child_process`. No corre en serverless ni
    en el navegador sin reescribir un núcleo firmado, y no se reescribe.
- **El recorrido**: `src/features/soporte-sap/pruebas/recorrido.mjs`.
  - Hace los pasos 1–12 con Playwright, una captura por paso, y cuenta los errores de consola.
  - Necesita el laboratorio encendido (`SOPORTE_SAP_LABORATORIO=1`) y Tesseract.
  - Las capturas de hoy están en `docs/goals/soporte-sap-capturas/`.
- **El contrato del producto** (léelo entero antes de escribir el deck o el manual):
  - `src/features/soporte-sap/BUSINESS_LOGIC.md`;
  - `productos/soporte-sap.json`, con su lista `fuera`;
  - la AISIA, `.claude/gobernanza/AISIA-soporte-sap.md` (§1 y §5);
  - el C3, `.claude/PRPs/PRP-008-soporte-sap.md`;
  - la matriz de firmas, `tools/soporte-sap/firmas/matriz.ts`.
- **El design system**: `.claude/design-systems/bento-grid/bento-grid.md`.
- **Las cifras**: el corte semántico `tools/soporte-sap/semantica/corte.json` y el estimado
  `tools/soporte-sap/medicion/estimado.json`.
- **Los documentos sintéticos de muestra**: `tools/soporte-sap/documentos/`.
- **Vercel**: no hay CLI instalado ni proyecto enlazado.
- **Las guardas que ya existen y siguen**:
  - la ruta del laboratorio responde 404 sin `SOPORTE_SAP_LABORATORIO=1` (fila `c3-ruta-404`);
  - `scripts/configura-deploy.mjs` rechaza esa variable en producción, porque cualquiera elige su identidad y el estado
    vive en memoria.

## LIBERTAD TÉCNICA

Tú eliges la arquitectura y las librerías. Eso incluye:

- cómo se congela y se regenera el estado de la vitrina;
- qué túnel se usa y cómo Vercel pasa lo en vivo (rewrite, proxy, middleware o lo que sea mejor);
- cómo se hacen el deck y su PDF;
- qué forma toma el journey.

Lo que se nombre aquí es una sugerencia descartable, salvo las RESTRICCIONES. Optimiza por el mejor resultado, no por
el camino más corto.

## INVESTIGA ANTES DE CONSTRUIR

- Busca 2 o 3 referencias world-class de:
  - demos de producto B2B (vitrinas interactivas);
  - journey maps de servicio con varios actores;
  - decks de SaaS B2B para un comprador técnico;
  - túneles con acceso restringido.
- Mide, no supongas: qué plan de Vercel permite proteger el despliegue e invitar a personas de fuera del equipo, y
  cuánto cuesta.
- Reafirma el objetivo en una línea antes de cada edición grande.

## LA SECCIÓN EN VIVO: lo que la hace segura

- **El túnel solo acepta lo que trae el secreto** que comparten Vercel y la máquina del laboratorio.
  - El secreto lo añade el servidor de Vercel y nunca llega al navegador.
  - Sin él, el laboratorio local responde como si no existiera, así que una URL del túnel filtrada no abre nada.
- **Solo pasa lo de Soporte SAP**: ninguna otra ruta de la app local se alcanza por el túnel.
- **Adjuntos: solo los documentos sintéticos de muestra**, sin subidas arbitrarias. Así un invitado no mete archivos
  en la máquina del laboratorio, ni datos reales de sus clientes.
- **Un aviso visible y permanente**: datos sintéticos, no escribas datos reales, y el estado vive en memoria y se pierde
  al apagar.
- **Si la máquina está apagada o el túnel caído**, la sección lo dice con claridad, sin errores de consola, y la
  vitrina, el journey, el deck y el manual siguen.
- **El despliegue de Vercel NO lleva `SOPORTE_SAP_LABORATORIO`**: allí el runtime sigue apagado, y lo vivo solo existe
  en la máquina del laboratorio.
- **El riesgo residual se declara, no se esconde**:
  - Dentro del laboratorio, un invitado elige su identidad, también la de superadmin.
  - El texto libre puede llevar un dato real.
  - Los dos van a la revisión del C3 y a la nota de la AISIA, para que el laboratorio decida y firme.

## EL DECK Y EL MANUAL: ninguna cifra inventada

- **Cada número tiene fuente.** Sale del corte o del estimado, con su fuente y diciendo que es sintético; si no, dice
  «por decidir» y quién lo decide. Una certeza inventada le hace daño a quien compra.
- **No se promete nada de esto**:
  - el precio ni la forma de cobro (plan comercial, ERP-7 y D5);
  - la disponibilidad, el RPO/RTO ni la cifra de la respuesta del laboratorio de D13 (todo espera a GATE 3);
  - la conexión a un SAP real (D6);
  - una aprobación sin una persona;
  - mandar lo crudo a un modelo externo (D7).
- **Lo que el laboratorio no vería, no se muestra.** El laboratorio solo ve agregados de 3 clientes o más (D14), y ni el
  deck ni el manual enseñan un agregado así.
- **El manual describe el laboratorio tal cual** y marca dónde producción será distinta: `auth.uid()` y la RLS en vez
  de identidades elegibles.

## DEFINICIÓN DE HECHO (evidencia visible en la conversación)

1. **El comando de validación en verde**, con el output pegado.
2. **Una fila nueva en la matriz por cada afirmación nueva de seguridad**: el túnel rechaza sin secreto, solo pasa
   Soporte SAP, solo se usan documentos de muestra y Vercel no lleva la variable.
   - Cada fila está verde sin su sabotaje y roja con él (`--fila <id>`).
   - La matriz entera, en verde, con el conteo pegado:
     `node tools/soporte-sap/evidencia/firmas.ts --md docs/goals/soporte-sap-firmas-matriz.md`.
3. **La revisión del C3 y la nota de la AISIA**, en borrador en `docs/goals/` y firmadas por el laboratorio **antes de
   abrir el túnel**.
4. **Capturas pegadas de Playwright contra la URL de Vercel**:
   - las tres vistas de la vitrina;
   - el journey;
   - una lámina del deck y su PDF;
   - una página del manual por rol;
   - en vivo con la máquina encendida: una incidencia que el N3 levanta, el consultor ve y pasa por la sala;
   - en vivo con la máquina apagada: el mensaje.

   Con 0 errores de consola.
5. **Las negativas, pegadas**:
   - la URL de Vercel sin sesión no abre (401 o el login de Vercel);
   - el túnel sin el secreto no responde a Soporte SAP;
   - `/api/soporte-sap` del despliegue de Vercel, fuera de lo en vivo, da 404.
6. **En verde**: el recorrido local (`recorrido.mjs`) y `npm run validate` corrido en primer plano después del último
   commit.
7. **El reporte de decisiones**: el túnel, el mecanismo en vivo, cómo se congela la vitrina, el deck y su PDF, el plan
   de Vercel y su costo.
8. **La lista de lo que podría estar mal o incompleto**, cada punto resuelto o declarado.

## COMANDO DE VALIDACIÓN

```
npx tsc --noEmit -p . && npm --prefix tools/soporte-sap run -s build && npm --prefix tools/soporte-sap run -s prueba
```

Córrelo después de cada cambio grande y pega su output. Después de cada cambio de UI, corre también el recorrido
contra el laboratorio local.

## RESTRICCIONES REALES

- **La gobernanza del repo (`AGENTS.md`)**:
  - Responde en español.
  - Nunca imprimas un secreto: solo presente o ausente, y su largo. Los secretos se pasan sin chat: `read -rsp` en una
    terminal aparte, o el CLI que los pide.
  - Los CLIs y las dependencias van pineados; nunca `latest`.
  - No toques `gates.json`, skills, settings ni prompts sin CDC.
- **Las firmas son del laboratorio.** Nunca edites `.claude/gobernanza/`: los borradores van en `docs/goals/`, y el
  laboratorio los firma y los mueve.
- **Las guardas no se tocan**: la 404 sin la variable y `configura:deploy`. Ninguna fila de la matriz puede caer.
- **No generes entradas de estrés para el lector de PDF** (H-22).
- **Los gates humanos los corre el laboratorio con `!`.** Tú los dejas listos con un comando de una línea y ruta
  relativa, y compruebas antes que el cwd de la sesión es la raíz del worktree. Son:
  - el login de Vercel y enlazar el proyecto;
  - poner los secretos;
  - firmar;
  - cada deploy;
  - abrir el túnel;
  - el push.

  El PR lo abres tú con `gh pr create` y el texto en `~/pr.md`; el merge, solo cuando el laboratorio lo escriba.
- **Nada de pago sin el sí del laboratorio**, ni el plan de Vercel ni el túnel.
- **Solo datos sintéticos.** Producción con datos de clientes sigue esperando la lista de salida de la AISIA §5.
- **El código**: archivos de 500 líneas como máximo y funciones de 50; los commits, en la rama.

## RED DE SEGURIDAD

- Si un paso necesita al laboratorio (login, secreto, firma, deploy, túnel o push), detente, da el comando y espera. No
  lo simules ni lo esquives.
- Detente y reporta el bloqueo si en 40 turnos no convergiste, o si para pasar hay que tocar una guarda o una fila de la
  matriz.

## Lo que se decidió al construirlo (2026-10-12)

| Decisión | Por qué |
|---|---|
| La vitrina pinta el **mismo componente** de la app (`SoporteSap`), con dos fuentes nuevas: `vitrina` (solo lectura) y `en-vivo` | Lo que se ve es el producto, no una maqueta que se desincroniza |
| Los momentos se **congelan recorriendo el journey por la API real** (`genera.mjs`): 9 momentos × 4 vistas | Si el producto cambia, se regenera; nada se dibuja a mano |
| Las rutas viven en `/vitrina/soporte-sap/*`, fuera del layout `(main)` | Sin el botón de dictado ni nada de otros productos |
| **Vercel Hobby con Vercel Authentication en All Deployments** | Gratis en todos los planes desde 2026-09 (docs de Vercel); protege también producción. Playwright entra con el bypass de automatización |
| **Se construye en la máquina del laboratorio** y se sube con `--prebuilt` | A Vercel no llega el código fuente, solo el resultado; `VITRINA_SOPORTE_SAP=1` queda horneado |
| En ese despliegue **solo existe la vitrina** (`next.config.ts`), y el build **falla con la variable del laboratorio** | La guarda de `configura:deploy` no cubre Vercel; esta sí |
| **Firma HMAC por petición** (método, ruta, cuerpo, instante; 60 s; una vez), no un secreto fijo en una cabecera | La llave no viaja: copiar una firma no sirve para otra petición ni para repetirla |
| **Portero** en 127.0.0.1:8787: solo `/api/soporte-sap`, solo JSON, documentos de muestra, filtro de datos, y **exige que la vitrina responda «protegida»** | El laboratorio no se expone; si alguien apagara la protección, lo en vivo se cierra solo |
| El filtro de datos usa **el anonimizador del producto** | Una sola definición de «forma de dato», ya medida y con sus cerrojos |
| La ruta `estado` responde siempre 200 | Un laboratorio apagado no es un error de consola |
| Túnel recomendado: **Tailscale Funnel** | Gratis, URL estable y el TLS termina en la máquina del laboratorio: su relevo no ve el contenido. Alternativa: `cloudflared` (cambia de URL en cada arranque: hay que volver a sembrar y desplegar) |
| El deck es una página HTML 16:9 en bento-grid; el PDF lo imprime Playwright (13 páginas) | Un solo origen; `contenido/propuesta.ts` concentra lo que se afirma, y una prueba rechaza precios, RPO/RTO y disponibilidades con cifra |
| El manual tiene una sola fuente (`contenido/manual.ts`) para la página y para `MANUAL.md` | Una prueba exige que digan lo mismo |
| Las huellas sha256 de los momentos van abreviadas a 16 caracteres | La pantalla muestra 10 o 12; un hex de 64 suelto es, para `audita:secretos`, una llave |
| `vercel@63.1.2` fijado en los guiones, sin añadirlo a `package.json` | CLI del golden path, pineado; no entra a las dependencias de la app |

## Lo que podría estar mal

- **La protección de Vercel no se prueba desde el código** (se configura en su panel). La comprueban `despliega.sh`
  después de cada despliegue y el portero al arrancar y cada 5 minutos; brecha declarada en el C3.
- **`vercel build` con `output: 'standalone'`** no se ha corrido todavía: necesita el proyecto enlazado. Se verá en el
  primer despliegue.
- **Dentro de lo en vivo, un invitado elige su identidad** (también superadministrador): brecha declarada.
- **Un dato real sin forma de dato pasa el filtro**: brecha declarada en la AISIA (revisión 10).
- **En Hobby hay un solo enlace para compartir por cuenta**: invitar a varias consultoras a la vez puede pedir el
  plan Pro (asientos de lectura). Es un costo: lo decide el laboratorio.
- **Los momentos se congelan en un instante**: los minutos «desde la escalada» son los de ese instante. La vitrina dice
  cuándo y desde qué commit se congelaron.
- **`public/vitrina` (unos 4 MB) también viaja en la imagen del producto**, y `/vitrina` existe en sus despliegues (lo en
  vivo, apagado sin su configuración). Es sintético; se declara.
- **El layout raíz dice `lang="en"`** y la vitrina está en español: es compartido con el resto de la app; no se tocó.
- **El paso 1 del recorrido era intermitente** (la espera se cumplía antes de tiempo): arreglado, 34/34 en la primera
  corrida contra un servidor recién levantado.
