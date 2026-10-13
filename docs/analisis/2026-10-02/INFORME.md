# Dónde duele el repo, y qué producto lo resolvería — primera corrida

> **2026-10-02** · commit analizado `f2ba87f` · alcance: el repositorio entero · rol:
> `/analista-producto` (PRP-008). **Cobertura 39/39** activos del inventario · **22 hallazgos** con
> cita verificada · **3 hipótesis** aparte · **6 casos de uso** · **8 candidatos** (1 vetado). Cada
> cita la comprobó `verifica-evidencia.mjs`; cada cifra lleva el comando que la produjo (tabla al
> final). El dato para la máquina está en `analisis.json`.

## Lo que el laboratorio tiene que decidir

**Una advertencia antes del ranking.** Lo único **medido** en este repo es lo que le duele a la
fábrica. Lo que le duele a un cliente está **declarado** en los contratos, sin cifra y sin cliente.
Por eso el ranking pone arriba un producto interno. Eso no quiere decir que sea lo que más vale:
es lo único que se puede medir hoy. La importancia para el cliente es `null`, y este analista no
la puede inventar (D-22).

1. **¿El mes que viene se invierte en vender o en abaratar la fábrica?** Recomendado: las dos, en
   este orden de importancia. Primero **P-03** (piloto medido) con **P-01** (buzón de CFDI) como
   producto del piloto. En paralelo, **P-02** (observatorio de costo), solo como vista sobre datos
   que ya existen. Sin un piloto, el ranking seguirá premiando lo interno.
2. **¿Qué despacho contable o pyme puede probar el extractor con un mes real de CFDI recibidos?**
   Recomendado: un despacho conocido, con su permiso firmado y un mes cerrado, para medir las horas
   de captura antes y después. El extractor no tiene cliente ni corpus real (D-02, D-05).
3. **¿Cuánto le importa a ese cliente cada dolor?** Recomendado: cinco entrevistas de media hora
   antes del piloto, con las preguntas del caso CU-02.

## Lo que dice la evidencia, en cinco líneas

- **El portafolio no tiene ningún cliente que lo valide.** Ningún producto tiene medido el costo
  del dolor que resuelve (D-01) ni un primer cliente (D-02). Tres firmas y dos contratos esperan
  (D-03), y la app casi no deja uso (D-04).
- **La fábrica cuesta y se mide.** Hay sesiones de [C-01] y [C-02] USD, se pagan [C-04] tokens
  fijos en cada sesión y los MCP suman [C-05] (D-08, D-09, D-10).
- **Hay cosas que parecen funcionar y nadie las comprueba.** Hay [C-07] gates inactivos, Hermes
  deriva y hay controles marcados como hechos sin estar construidos (D-07, D-12, D-14).
- **El respaldo no tiene tiempo de recuperación conocido**, y el aislamiento entre clientes está
  diferido al segundo cliente (D-15, D-16).
- **El candidato externo con más reuso es el buzón de CFDI** (P-01): recombina el extractor, el ERP
  y el grafo. Su dolor está declarado, no medido.

## Los candidatos

| # | Candidato | Puntuación | Solidez | Casos | Siguiente paso |
|---|---|---:|---|---|---|
| 1 | **P-02** · Observatorio del costo de operar la fábrica — [one-pager](propuestas/P-02-observatorio-costo.md) | 54 | medida | CU-03 | `/prp` |
| 2 | **P-03** · Piloto medido: un producto, un cliente, el costo antes y después — [one-pager](propuestas/P-03-piloto-medido.md) | 18 | medida | CU-01 | `/spec-generator` |
| 3 | **P-04** · Nodo de integración: los gates apagados vuelven a correr — [one-pager](propuestas/P-04-nodo-de-integracion.md) | 18 | medida | CU-04 | `/prp` |
| 4 | **P-01** · Buzón de CFDI recibidos para el despacho contable — [one-pager](propuestas/P-01-buzon-cfdi.md) | 9 | declarada | CU-02 | `/spec-generator` |
| 5 | **P-05** · Dictado para cualquier escritorio | 8 | medida | CU-06 | `/prp` |
| 6 | **P-06** · Respaldo verificado como servicio (GATE 3 cerrado) | 6 | registrada | CU-05 | `/prp` |
| 7 | **P-08** · La capa de gobernanza empaquetada para otros repos | 6 | medida | CU-04 | `/spec-generator` |

`puntuación = frecuencia × severidad × solidez × reuso ÷ esfuerzo`, cada factor de 1 a 3 con su
porqué en `analisis.json`. La solidez la calcula el verificador como el grado más alto de los
dolores de cada candidato. Los siguientes pasos **se recomiendan, no se ejecutan**.

**Vetado (C4, no se pondera): P-07 · Descarga masiva automática de CFDI del SAT con las
credenciales del cliente.** Exige custodiar la e.firma o la CIEC de terceros, y el ERP lo condiciona
a un vault dedicado que no existe. Una fuga dañaría al cliente y a sus proveedores, que no firmaron.
Se rediseña (la carga del cliente, P-01) o no se hace.

## Casos de uso por categoría

| Caso | Categoría | Quién | Qué intenta | Qué se lo impide | Cuánto le cuesta |
|---|---|---|---|---|---|
| CU-01 | Validación de mercado | El laboratorio | Elegir con evidencia el producto que alguien pagaría | Sin costo del dolor ni cliente, contratos pendientes, app sin uso, WhatsApp solo contra simulador (D-01, D-02, D-03, D-04, D-20, D-22) | No medido para el cliente; para la fábrica, sesiones de [C-01] y [C-02] USD |
| CU-02 | Documentos fiscales y contables | El contador de una pyme y quien opera el extractor | Tener cada CFDI recibido en el buzón, leído y cotejado sin teclear | Carga manual, descarga del SAT condicionada, calidad solo sintética, OCR lento (D-05, D-06, D-21) | No medido |
| CU-03 | Costo y fricción de operar la fábrica | El laboratorio operando agentes | Construir sin que el contexto y los errores se coman la sesión | Sesiones caras, contexto al 92 %, MCP sin umbral, Bash que reincide, opencode pagando todas las reglas (D-08, D-09, D-10, D-11, D-17) | [C-03] USD por llamada, [C-10] errores de Bash en una sesión, [C-08] tokens extra en opencode, memoria al [C-09] |
| CU-04 | Confianza en lo construido | El laboratorio al firmar | Saber que un control funciona, no que está escrito | Gates apagados, Hermes que deriva, CLIs parciales, controles hechos sin existir (D-07, D-12, D-13, D-14) | [C-07] gates inactivos |
| CU-05 | Operación y respaldo | El cliente cuyos datos se guardan, y el laboratorio | Recuperar sus datos en un tiempo conocido y que nadie más los vea | GATE 3 abierto, salida de `service_role` diferida (D-15, D-16) | No medido: RPO y RTO son desconocidos por regla |
| CU-06 | Adopción por terceros | Un usuario o integrador nuevo | Entender qué resuelve y usarlo en su máquina | Features sin README, dictado solo en WSL2 (D-18, D-19) | [C-06] features sin README |

## Hallazgos, por grado de evidencia

**Medida (11):** D-03 contratos pendientes · D-04 la app sin uso registrado · D-07 gates de
integración apagados · D-08 sesiones de 162 y 354 USD · D-09 contexto al 92 % y memoria al 98 % ·
D-10 MCP sin umbral · D-11 Bash que falla y reincide · D-12 Hermes deriva · D-13 CLIs parciales y
dogfood de pagos en rojo · D-17 opencode paga todas las reglas · D-18 nueve features sin README.

**Registrada (3):** D-14 controles dados por hechos sin construir · D-16 aislamiento diferido al
segundo cliente · D-19 dictado solo en WSL2.

**Declarada (8):** D-01 ningún costo del dolor medido · D-02 ningún primer cliente · D-05 extractor
medido con corpus sintético · D-06 OCR lento en CPU · D-15 respaldo sin RPO ni RTO · D-20 WhatsApp
contra un simulador · D-21 CFDI recibidos a mano · D-22 el analista no oye al cliente.

Cada uno, con su literal y su fuente, en `analisis.json`.

## Hipótesis (sin cita que las sostenga: no son hallazgos)

- **HP-01** La tabla de skills del README no lista todos los skills. Hoy falta `add-a2a`, comprobado
  a mano, pero una ausencia no se puede citar con un literal. Falta un medidor que compare la tabla
  con los directorios.
- **HP-02** El registro de incidentes vacío esconde incidentes. Falta cotejar los aprendizajes y la
  bitácora contra los criterios de C6.
- **HP-03** Una pyme pagaría por el estudio de marketing. Falta un dueño real y la entrevista
  `/new-app`.

## Las hipótesis con que llegó el pedido

| | Hipótesis del borrador | Veredicto | Por qué |
|---|---|---|---|
| H1 | Capturar y conciliar CFDI a mano | **parcial** | El ERP declara la carga manual y el extractor lee el XML exacto (D-21). Pero no hay despacho ni corpus real con que medir el dolor (D-02, D-05) |
| H2 | La voz funciona en el laboratorio, no para usuarios | **parcial** | Los nueve huecos existieron (#127) y la instalación se cerró y se midió. Quedan WSL2 como única plataforma (D-19) y la interfaz sin README (D-18) |
| H3 | Operar agentes es caro | **confirmada** | La sesión de 162 USD existe ([C-01]) y hay otra de [C-02] USD; los MCP cuestan [C-05] tokens con cuatro sin medir (D-08, D-10) |
| H4 | Deriva silenciosa y controles que parecen funcionar | **parcial** | La deriva está viva (D-12) y las cuatro afirmaciones falsas, registradas. La cifra «151 comprobaciones» está vieja: hoy son [C-11]. Empaquetar la gobernanza (P-08) no tiene comprador |
| H5 | El respaldo es una creencia | **confirmada** | RPO y RTO son desconocidos hasta GATE 3, y ningún contrato lo tiene cerrado (D-15) |
| H6 | opencode no expande imports | **parcial** | Es cierto, pero hoy no se pierde ninguna regla porque `AGENTS.md` es autocontenido. El costo activo es otro: [C-08] tokens de reglas por sesión (D-17) |
| H7 | El extractor de CFDI es el candidato más vendible | **sin evidencia** | «Vendible» exige un comprador, y ninguna fuente nombra uno. Falta un despacho real midiendo horas antes y después. El único contrato firmado es el del asesor de ventas por voz |

## Cobertura del inventario

**39/39.** Los 34 activos con dolores aparecen en los hallazgos de arriba. Cinco se miraron y no
mostraron dolor con evidencia: `TPL-grafo-conocimiento`, `TPL-conocimiento`,
`TPL-ejemplo-herramienta`, `TPL-empaquetador` y `TPL-design-systems`. El inventario tiene [C-14]
unidades con asiento.

## Método y límites

- **Fuentes**: el inventario, los contratos de cada producto, los registros de gobernanza, las
  specs, los PRP, los goals y los SDD, las trayectorias y la historia de git ([C-12] commits, [C-13]
  merges). No se leyó la rama `golden-sets` ni ningún `.env*`.
- **Grados**, al estilo GRADE: **medida** (un script lo produjo), **registrada** (un registro, un
  commit o un PR), **declarada** (un documento lo afirma) e **hipótesis** (sin cita). El grado lo
  recalcula el verificador; declarar más es rojo.
- **El árbol** dolor → caso → candidato es el de Teresa Torres. La prioridad es una cuenta con los
  insumos a la vista, en la línea de Ulwick, pero **sin** la importancia del cliente, porque no hay
  encuesta.
- **Lo que el verificador no comprueba**: que una cita *signifique* lo que el hallazgo concluye. El
  literal va pegado junto a cada hallazgo para que se juzgue de un vistazo.
- **Sesgo conocido**: este rol se construyó y corrió en la misma sesión, y su propia descripción
  entra en el contexto que mide D-09.

### Cifras y el comando que las produjo

| Cifra | Valor | Qué mide | Comando |
|---|---|---|---|
| [C-01] | 162.1402 | USD de una sesión de fábrica (20-21 sep) | `npm run trayectorias:captura` |
| [C-02] | 354.5395 | USD de la sesión más cara registrada (10-12 sep) | `npm run trayectorias:captura` |
| [C-03] | 0.206 | USD por llamada en la fábrica (corte del 2026-09-13) | `npm run trayectorias:informe` |
| [C-04] | 11028 | tokens fijos por sesión (92 % de 12000) | `npm run mide:contexto` |
| [C-05] | 20363 | tokens de 5 servidores MCP, con 4 sin medir | `npm run mide:contexto` |
| [C-06] | 9 | features de producto sin README | `npm run revisa:readmes` |
| [C-07] | 8 | gates declarados inactivos | `npm run gates` |
| [C-08] | 5308 | tokens de reglas que opencode paga por sesión | `npm run mide:contexto` |
| [C-09] | 98% | del tope que ocupa la memoria del proyecto | `npm run mide:contexto` |
| [C-10] | 34 | errores de Bash, de 38, en la sesión más cara | `npm run trayectorias:captura` |
| [C-11] | 166/166 | comprobaciones del verificador de gobernanza | `npm run verify:gobernanza` |
| [C-12] | 644 | commits en la historia analizada | `git rev-list --count HEAD` |
| [C-13] | 243 | merges en la historia analizada | `git rev-list --count --merges HEAD` |
| [C-14] | 235 | unidades con asiento en el inventario | `npm run verifica:inventario` |
