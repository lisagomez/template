# BUSINESS_LOGIC.md — Índice del portafolio

> Desde el 2026-09-24 este repo es el **monorepo privado del laboratorio**: el ERP, las apps y las
> herramientas. Cada **producto** lleva su propio contrato de negocio junto a su feature principal,
> porque la evaluación de impacto (C4) depende de a quién afecta cada uno y eso cambia de producto
> a producto. Este archivo los relaciona y guarda solo lo que es de todos: lo que cualquier producto
> hereda de la fábrica y el respaldo del servidor.
>
> **Una herramienta no lleva contrato propio.** Qué hace y qué no lo dicen su README product first y
> su spec; si el dato sale del perímetro lo decide el producto que la usa, no ella. **La base común
> (auth, dashboard, parametrización) tampoco.** Lo cruza `npm run verify:gobernanza` contra
> `inventario/activos.json`: todo activo de clase PRODUCTO en beta o producción aparece aquí, en un
> producto o en el §2 con su motivo.
>
> **Qué es un producto** (desde el 2026-10-04): una fila de esta tabla. Un modelo de negocio que compone
> activos para un cliente que paga; «activo de clase PRODUCTO» es una pieza vendible, no un producto, y el
> campo `producto` del inventario nombra al **dueño** del activo. El concepto y su vocabulario:
> [`productos/CONCEPTO.md`](productos/CONCEPTO.md); cada producto se declara en un manifiesto de
> `productos/` que verifica `npm run verifica:productos`.

---

## 1. Productos

Un contrato **pendiente** se declara con lo que falta y **no cuenta como uno que existe**: el
verificador lo lista aparte, igual que un gate inactivo.

| Producto | Contrato | Activos que cubre | Estado |
|---|---|---|---|
| Asesor de ventas por voz | [`src/features/dictado/BUSINESS_LOGIC.md`](src/features/dictado/BUSINESS_LOGIC.md) | `TPL-asesor-ventas` `TPL-voz` `TPL-dictado` `TPL-feature-dictado` `TPL-feature-laboratorio-voz` | firmado el 2026-09-20 como hipótesis del piloto |
| ERP agéntico | [`erp/ERP-MAESTRO.md`](erp/ERP-MAESTRO.md) | `TPL-erp` | maestro propio: lo gobierna su fuente, no este índice |
| Etiquetas GS1 | [`src/features/etiquetas/BUSINESS_LOGIC.md`](src/features/etiquetas/BUSINESS_LOGIC.md) | `TPL-etiquetas-gs1` `TPL-feature-etiquetas` `TPL-feature-laboratorio-etiquetas` | hipótesis del 2026-09-30, sin cadena real; firmado como hipótesis el 2026-10-13, se vuelve a firmar con la primera cadena real |
| Extractor documental | [`src/features/a2a/BUSINESS_LOGIC.md`](src/features/a2a/BUSINESS_LOGIC.md) | `TPL-extractor-documental` `TPL-feature-a2a` `TPL-piloto-buzon-cfdi` | producto por decisión del laboratorio (2026-09-30); hipótesis sin corpus real; firmado como hipótesis el 2026-10-13, se vuelve a firmar con el corpus real del cliente; la AISIA del piloto del buzón se firma aparte |
| Reel del celular | [`src/features/reel/BUSINESS_LOGIC.md`](src/features/reel/BUSINESS_LOGIC.md) | `TPL-reel` `TPL-feature-reel` | hipótesis del 2026-10-02 que consolida lo firmado el 2026-09-27; firmado como hipótesis el 2026-10-13, con su tabla de respaldo; se vuelve a firmar tras el estreno con clips reales |
| Estudio pymes | [`src/features/estudio-pymes/BUSINESS_LOGIC.md`](src/features/estudio-pymes/BUSINESS_LOGIC.md) | `TPL-pymes-marketing` `TPL-feature-estudio-pymes` `TPL-feature-laboratorio-pymes` | hipótesis del 2026-10-02 que consolida lo firmado el 2026-09-26 y el 2026-09-27, sin datos reales; firmado como hipótesis el 2026-10-14, con la AISIA de ventas, contenido, anuncios y visibilidad y la tabla de respaldo |
| Soporte SAP | [`src/features/soporte-sap/BUSINESS_LOGIC.md`](src/features/soporte-sap/BUSINESS_LOGIC.md) | `TPL-soporte-sap` `TPL-sala-a2a` `TPL-feature-soporte-sap` | construida en laboratorio (corrida A, cerrada por el PRP-010); **C3 v4 y AISIA v3 firmados** por lisagomez el 2026-10-10; opera solo en laboratorio (AISIA §5) |
| Crecimiento demostrado | [`src/features/crecimiento-demostrado/BUSINESS_LOGIC.md`](src/features/crecimiento-demostrado/BUSINESS_LOGIC.md) | `TPL-crecimiento-demostrado` `TPL-feature-crecimiento-demostrado` | hipótesis del 2026-10-02 con dos pymes sintéticas, sin pyme real ni LLM real; firmado como hipótesis el 2026-10-14, con su AISIA; los prompts entraron apagados (CDC del mismo día) |
| Sistema integrado ISO (SGI) | pendiente | `TPL-sistema-integrado` `TPL-feature-sgi` `TPL-feature-laboratorio-sgi` | falta: el contrato, antes del estreno con una pyme real (borrador en `.claude/goals/sistema-integrado-iso/propuestas.md`, §20a); datos sintéticos únicamente (PRP-013) |
| Vendedor con IA en WhatsApp | pendiente | `TPL-ventas-whatsapp` `TPL-feature-ventas-whatsapp` | falta: `/new-app` al salir de blueprint (goal `docs/goals/ventas-ia-waba.md`; C3 y C4 en borrador, sin firmar) |

## 2. Lo que no es producto

| Activos | Por qué no lleva contrato propio |
|---|---|
| `TPL-app-base` `TPL-feature-auth` `TPL-feature-dashboard` `TPL-feature-project-settings` | base común de la app: la usan todos los productos, y sus datos (las cuentas de usuario) entran en la evaluación de impacto de cada producto que la usa |
| `TPL-grafo-conocimiento` | motor de reglas: da veredictos a quien lo consulta, y el contrato es el del producto que lo consulta |
| `TPL-calendario` | motor de agenda: lo usan los productos que agendan (vendedor por WhatsApp, asesor por voz); qué datos de quien reserva salen hacia Google lo decide el contrato y la AISIA del producto que lo consume |

## 3. Lo que todo producto hereda de la fábrica

### Del corpus de pruebas (C2)

Los casos-trampa que miden si los controles disparan **no viven en el árbol de trabajo**:
están en la rama **`golden-sets`** y se leen con `npm run regresion -- --trampa`. Dos cosas
que un proyecto derivado tiene que saber, porque las rompe sin querer:

- **Si clonas con `--single-branch` o forkeas sin esa rama, C2 capa B queda inaccesible.**
  No falla en silencio —el verificador lo detecta— pero el proyecto se queda sin la mitad
  del control.
- **Ningún identificador de caso puede aparecer en los archivos de este proyecto.** Ni uno,
  ni siquiera acompañado de su veredicto: el par caso→regla se reconstruye leyendo el repo
  y la prueba deja de ser ciega. La traza hacia un caso es el commit de `corridas.md` en la
  rama. **`npm run verify:gobernanza` falla si encuentra uno** — no depende del criterio de
  quien escriba.

### De la imprenta de CLIs

- **Un CLI instalado de la librería pública entra SIN grado.** Esa librería no publica
  ninguno (verificado el 2026-08-26). Instalar es más barato que imprimir, pero es adoptar
  algo **no medido**: o se puntúa en local (`/printing-press-import` +
  `/printing-press-score`), o se declara no medido y se deja fuera de producción. Instalar
  es un CDC (C1), igual que imprimir.
- **Lo que escribe a terceros no se instala "para probar".** Un flag de auto-confirmación en
  un CLI ajeno convierte un envío a tus clientes en algo que el agente dispara solo. Se
  revisa la superficie destructiva ANTES de adoptarlo: ese daño no es firmable (límite de C5).

## 4. Respaldo del servidor

> No hay respaldo implícito. **Lo que no esté en esta tabla ni en la tabla de respaldo de un
> producto del §1, no se respalda.** El inventario completo, la regla para decidir criticidad y
> los gates de verificación están en **[`docs/FASE0-INFRAESTRUCTURA.md`](docs/FASE0-INFRAESTRUCTURA.md) §9**.

Regla de criticidad, en una pregunta: **¿se puede reconstruir?**
Sin pérdida → no se respalda · Con trabajo → respaldo normal · **No** → respaldo inmutable.

Aquí va lo que es de todo el servidor o de todo el repo; lo de cada producto va en su contrato:
[asesor de ventas por voz](src/features/dictado/BUSINESS_LOGIC.md) (§4),
[etiquetas GS1](src/features/etiquetas/BUSINESS_LOGIC.md) (§4),
[extractor documental](src/features/a2a/BUSINESS_LOGIC.md) (§4),
[reel del celular](src/features/reel/BUSINESS_LOGIC.md) (§4),
[estudio pymes](src/features/estudio-pymes/BUSINESS_LOGIC.md) (§4),
[Soporte SAP](src/features/soporte-sap/BUSINESS_LOGIC.md) (§4) y
[crecimiento demostrado](src/features/crecimiento-demostrado/BUSINESS_LOGIC.md) (§4).

| Activo | ¿Reconstruible? | Criticidad | Destino |
|---|---|---|---|
| **Ficheros en Storage** (buckets) | **No — son la evidencia** | **Crítica** | **Sincronización propia del bucket. `pg_dump` NO los incluye** |
| `.env.production` | No — contiene secretos | Crítica | Cifrado con `age`, fuera del servidor |
| Trayectorias (`trayectorias/datos`) | Sí — están en git | Baja | git |

> **Los ficheros de Storage van en línea propia y no colgando de «la base de datos».** No es
> pedantería de inventario: los bytes viven **fuera de Postgres**, así que un `pg_dump` en verde
> deja fuera todas las evidencias — y eso es **peor** que no tenerlas respaldadas, porque parece
> que están. Si este proyecto guarda originales (facturas escaneadas, fotos, adjuntos), montar esa
> segunda vía es **operación del proyecto**, no algo que traiga la herramienta que los sube.
> Borra esta fila solo si de verdad no usas Storage.

**RPO / RTO:** [desconocidos hasta cerrar GATE 3 — no se declaran antes de medirlos]

---

**Firma del índice:**  lisagomez (el laboratorio) · Fecha: 2026-09-30 · CDC del mismo día. Cada contrato de producto lleva la suya.