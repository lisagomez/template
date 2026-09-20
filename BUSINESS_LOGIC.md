# BUSINESS_LOGIC.md — Asesor de estrategia de ventas por voz

> ✅ **Firmado como hipótesis del piloto el 2026-09-20** por quien decide (firma al pie).
> Redactado por el agente a partir de las decisiones ya tomadas (plan del asesor, PRs
> #123-#129, laboratorio de voz). Es el contrato contra el que se valida lo que se construya en
> el piloto interno; lo marcado **[supuesto]** se confirma con las cifras del piloto y la
> entrevista **`/new-app`** antes de la Etapa 2 (terceros), y entonces se vuelve a firmar.

---

## 1. Problema de Negocio

**Dolor:** después de una reunión o llamada de ventas, la estrategia se pierde: el vendedor
no anota qué dolió al prospecto, qué objeción quedó sin responder ni quién decide. El acta se
escribe tarde o no se escribe, y el seguimiento sale de memoria. Cuando sí se usa una
herramienta de «inteligencia de reuniones», el audio del prospecto viaja a la nube de un
tercero: en sectores regulados eso descarta la herramienta entera.
**Costo actual:** [supuesto, a medir en el piloto] media hora por reunión escribiendo el acta,
oportunidades sin siguiente paso claro y descubrimientos incompletos que se pagan en la
negociación. La cifra real sale del piloto (trayectorias + veredictos del laboratorio).

## 2. Solución

**Propuesta de valor:** un asesor de estrategia de ventas **por voz y local** que, a partir
de lo que se dijo en la reunión (dictado, grabación o llamada), devuelve en segundos los
hallazgos con su cita, el puntaje de descubrimiento con su desglose, la pregunta que faltó,
las acciones con responsable y fecha, los riesgos del trato y el mapa de quién decide —
**sin que ninguna palabra del prospecto salga de la máquina**.

**Flujo principal (Happy Path):**
1. El vendedor dicta la reunión desde el celular (o sube la grabación, o la llamada entra a dos
   canales); el motor local la transcribe y separa quién habla.
2. El cerebro por reglas analiza los turnos y presenta el acta: hallazgos con evidencia,
   puntaje 0-100 con desglose, huecos y siguiente mejor pregunta, acciones, riesgos, personas.
3. El vendedor corrige lo que haga falta, exporta el acta y las acciones quedan en su
   seguimiento (en la Fase 3, en el CRM local del producto).

## 3. Usuario Objetivo

**Rol:** vendedor o asesor comercial B2B en campo (persona del producto) y, en el piloto,
quien decide el producto dictando y probando desde el laboratorio. **Tercero afectado, no
usuario:** el prospecto, cuyas palabras se procesan.
**Contexto:** justo después de la reunión, en el coche o en la oficina, con el celular o la PC;
llamadas desde el escritorio; a veces con ruido. Sectores regulados [supuesto]: despachos,
salud, finanzas, donde «la nube de un tercero» es un no.

## 4. Arquitectura de Datos

**Input:** audio (micrófono de PC o celular, grabación, llamada a dos canales) que se
transcribe en la máquina; o turnos ya diarizados. El audio va a un temporal y se borra.
**Output:** transcripción por turnos, análisis (`AnalisisReunion`: insights con evidencia,
score, acciones, riesgos, stakeholders) y acta exportable. Trayectorias de FORMA (sin
contenido) para medir el piloto.

**Storage (Fase 3, pendiente de proyecto Supabase; hoy todo es local en `DICTADO_DATOS`):**
- `reuniones`: reunión, cuenta, tipo, participantes — RLS habilitada
- `transcripciones` y `segmentos`: turnos con hablante, texto y confianza — RLS habilitada
- `analisis`: insights, score, acciones, riesgos por reunión — RLS habilitada
- `leads`/`cuentas`: el CRM mínimo — RLS habilitada
- **Retención [supuesto]:** el audio nunca se guarda; texto y análisis se borran a petición
  del vendedor y por defecto a los 12 meses. Lo fija la AISIA de Fase 0.

### Respaldo — qué pierde ESTE proyecto si arde el servidor

> No hay respaldo implícito. **Lo que no esté en esta tabla, no se respalda.** El
> inventario completo, la regla para decidir criticidad y los gates de verificación
> están en **[`docs/FASE0-INFRAESTRUCTURA.md`](docs/FASE0-INFRAESTRUCTURA.md) §9**.

Regla de criticidad, en una pregunta: **¿se puede reconstruir?**
Sin pérdida → no se respalda · Con trabajo → respaldo normal · **No** → respaldo inmutable.

| Activo del proyecto | ¿Reconstruible? | Criticidad | Destino |
|---|---|---|---|
| Datos en Supabase (Fase 3) | No — actas y análisis de reuniones | Crítica | PITR + dump lógico |
| Datos locales del dictado (`DICTADO_DATOS`: historial, diccionario, snippets) | Con trabajo — se rehacen dictando | Normal | copia de la carpeta, fuera de la máquina |
| Modelos y runtimes del banco (`tools/dictado/medicion/banco`) | Sí — se descargan pineados con `npm run mide` | Baja | no se respalda |
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

## 5. KPI de Éxito

**Métrica principal:** tiempo de reunión terminada a acta lista con puntaje y acciones,
medido por las trayectorias del dictado y los veredictos del laboratorio. Umbrales del piloto
(dos semanas): latencia fin-de-habla→texto p50 < 700 ms; WER con voz propia < 6 % en PC
limpio y < 12 % con ruido o celular; puntaje del asesor dentro de ±10 del veredicto humano en
4 de 5 reuniones; cero veces abrir una terminal desde el día 3.

## 6. Gobernanza (controles C4 y C7)

> Se llena SIEMPRE, aunque el proyecto sea chico. Plantilla completa en
> `.claude/gobernanza/plantillas/aisia.md`. La pregunta que responde esta sección no es
> *¿quién nos ataca?* sino **¿a quién dañamos si el sistema opera bien y se equivoca?**

| Punto | Respuesta |
|---|---|
| **Datos personales que toca** | Del prospecto: nombre, cargo, empresa, lo que dijo (dolores, presupuesto, proceso de decisión). Del vendedor: su voz y sus dictados. |
| **Partes afectadas** | El prospecto (no es usuario y no firmó nada); el vendedor; la empresa del prospecto. |
| **Daño con el sistema operando bien** | Un insight mal atribuido o un riesgo inventado orienta mal la venta; un puntaje bajo desanima al vendedor por un error de transcripción; el acta filtra información del prospecto si se comparte sin cuidado. Mitigación: cada hallazgo cita su frase, el puntaje nunca sin desglose, turnos inaudibles nunca adivinados. |
| **Acciones irreversibles** | Ninguna automática. Enviar correos, crear eventos o registrar en CRM: solo vista previa hasta un gate humano por acción. |
| **Vía de apelación humana** | El vendedor edita el acta y las acciones; corrige la transcripción y sus palabras nuevas alimentan el diccionario. Un análisis se puede descartar entero. |
| **Aislamiento de datos** | RLS en toda tabla; las superficies NO usan `service_role` (C7) |

### Lo que este proyecto hereda del corpus de pruebas (C2)

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

### Lo que este proyecto hereda de la imprenta de CLIs

- **Un CLI instalado de la librería pública entra SIN grado.** Esa librería no publica
  ninguno (verificado el 2026-08-26). Instalar es más barato que imprimir, pero es adoptar
  algo **no medido**: o se puntúa en local (`/printing-press-import` +
  `/printing-press-score`), o se declara no medido y se deja fuera de producción. Instalar
  es un CDC (C1), igual que imprimir.
- **Lo que escribe a terceros no se instala "para probar".** Un flag de auto-confirmación en
  un CLI ajeno convierte un envío a tus clientes en algo que el agente dispara solo. Se
  revisa la superficie destructiva ANTES de adoptarlo: ese daño no es firmable (límite de C5).

## 7. Especificación Técnica (Para el Agente)

### Tipo de proyecto

**Tipo:** herramienta + aplicación. Los núcleos son herramientas empaquetables (`@tu-scope/voz`,
`@tu-scope/dictado`, `@tu-scope/asesor-ventas`, en `tools/`); la aplicación del template las
consume (`/dictar`, `/laboratorio-voz`, y en la Fase 3 el CRM). Sin VPS mientras el piloto sea
interno; el servicio remoto de dictado existe para cuando haga falta GPU.
**Registro:** aquí y, cuando haya Supabase, en `project_settings` desde `/configuracion` (PRP-002: la base impide mezclar campos de VPS con campos de paquete)

### Features a implementar (Feature-First)

```
src/features/
├── auth/              # Autenticación Email/Password (Supabase) — Fase 3
├── dictado/           # PWA del celular, emparejamiento, botón de dictado (hecho)
├── laboratorio-voz/   # 20 casos con estado real, WER, veredictos, datos personales (hecho)
└── asesor/            # [Fase 3] reuniones, actas, CRM mínimo sobre tools/asesor-ventas
```

### Stack confirmado

Golden Path del template — ver `CLAUDE.md`. No se discute stack: Next.js 16 + React 19 +
TypeScript + Tailwind 3.4, Supabase (Auth + DB + RLS), Zod, Zustand, Playwright.

### Próximos pasos

1. [ ] Configurar Supabase
2. [ ] Implementar Auth (`/add-login`)
3. [ ] Feature principal
4. [ ] Testing E2E (`/playwright-cli`)
5. [ ] `npm run validate` en verde (typecheck + build + gobernanza)
6. [ ] Entrega según el tipo: aplicación → `npm run configura:deploy` + `npm run deploy` ·
   herramienta → `npm run empaqueta [nombre]` (y `-- --en <ruta>` contra el proyecto que la consume)
7. [ ] Infraestructura de agentes, si aplica, y **respaldo con GATE 3 cerrado**
   (`docs/FASE0-INFRAESTRUCTURA.md`). Un respaldo sin restauración probada no cuenta
   como paso hecho
8. [ ] **Vigilancia de las versiones pineadas** (`docs/SDD-hermes-verificacion.md`).
   Todo lo que este proyecto pinea —modelo, imágenes, servidores MCP— gana estabilidad y
   **pierde noticias**: sin algo que avise, el rezago no se nota hasta que duele. Decidir
   quién mira y cada cuánto es parte de poner esto en producción, no un extra
9. [ ] **Decidir qué MCP se queda** (`docs/SDD-imprenta-de-clis.md`). Cada servidor MCP
   configurado cuesta tokens en **cada sesión, se use o no**: cinco de los del ejemplo suman
   20 363, casi el doble que todas las instrucciones juntas. La decisión es **por servidor y
   según frecuencia de uso**, no global — corre `node scripts/mide-mcp.mjs` y decide con la
   cifra delante, no con un factor heredado

---

*Generado por SaaS Factory V4 · Fecha: [FECHA] · Llenar con `/new-app`*

---

**Firma:** lisagomez (responsable del proyecto), como hipótesis del piloto · Fecha: 2026-09-20 · Se vuelve a firmar tras la entrevista `/new-app`, antes de la Etapa 2.
