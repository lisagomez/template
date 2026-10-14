# BUSINESS_LOGIC.md — Control de caducidades con etiquetas GS1

> **Hipótesis del 2026-09-30, sin cadena real todavía.** La firma va al pie y se vuelve a firmar
> con la primera cadena real. Redactado por el agente a partir de lo ya
> decidido y construido: el spec del 2026-09-25 (`docs/goals/etiquetas-gs1-caducidades.md`), el
> diseño (`docs/SDD-etiquetas-gs1.md`), los README de la herramienta y de la app, y las decisiones
> del laboratorio del 25 al 28 de septiembre. Nada de aquí se inventa: lo que ninguna fuente dice
> va marcado **[supuesto]** o **pendiente**, y lo confirma el laboratorio con la primera cadena
> real. Todo lo medido hasta hoy es con datos **ficticios** (prefijo 952).
> Cubre `tools/etiquetas-gs1`, `/etiquetas/*` y `/laboratorio-etiquetas`.

---

## 1. Problema de Negocio

**Dolor:** en un CEDIS y sus sucursales la caducidad de cada caja vive en la etiqueta del
proveedor, cuando la trae, y en la memoria de quien acomoda. Lo que el sistema no filtra se surte
vencido: SAP EWM, por ejemplo, surte lotes vencidos si nadie los filtra (SDD §1). El piso no sabe
qué retirar ni qué lote bajar primero, la mercancía que llega sin GS1-128 obliga a teclear fechas,
y cuando algo se pierde nadie puede reconstruir qué pasó con un lote. El laboratorio quiere el día
operado con el celular, sin menús, y la caducidad controlada dentro del trabajo diario, no en una
revisión aparte.
**Costo actual:** **pendiente, no medido.** No hay cifras de merma, de producto vencido en anaquel
ni de horas de conteo de una cadena real. Lo único calculado es lo que costaría operar la
solución en la dulcería ficticia del SDD §8: 10,432 etiquetas y $2,306.96 al mes, sin IVA
confirmado.

## 2. Solución

**Propuesta de valor:** cada caja y cada tarima lleva un código GS1-128 que cualquier lector
entiende, con la fecha y el lote dentro, y cualquiera con un celular sabe qué tiene en la mano y
cuánto le queda de vida. El sistema dice qué retirar, qué lote surtir primero y qué pasó con cada
lote, en una historia que nadie puede reescribir sin que se note.

**Flujo principal (Happy Path):**
1. **Recibo**: se escanea la caja. Si trae (17)(10), queda recibida. Si solo trae el EAN del
   proveedor, se fotografía la caducidad y el motor local propone fecha y lote. Quien registra
   confirma o corrige, y sale la etiqueta de la casa, revisada antes de imprimir.
2. **Almacén y piso**: cada escaneo hace lo que toca en esa zona según el rol del dispositivo. La
   ronda del día dice qué retirar (rojo → almacén, vencido → merma) y qué lote bajar primero
   (FEFO), y cada tarea se cierra con el escaneo que la prueba.
3. **Conteo cíclico**: cada día se cuentan solo las 3 ubicaciones de más riesgo, a ciegas. El
   supervisor abre, concilia y autoriza. Nadie autoriza lo que contó.
4. **Expediente y riesgo**: cada lote tiene su historia en una cadena de hashes anclada cada noche.
   El agente de riesgo, determinista, recomienda transferir, promover o exhibir antes de que un
   lote llegue a rojo.

## 3. Usuario Objetivo

**Rol:** el personal de una cadena de CEDIS y sucursales que controla caducidades. Los roles los
decide el servidor por el código con que se emparejó el dispositivo:

| Rol | Qué hace |
|---|---|
| Recibo | escanea, recibe (directo o con foto), confirma la fecha leída, vincula códigos |
| Almacenista | escanea en almacén, piso y merma; sigue la ronda; cuenta a ciegas, sin ver cantidades |
| Supervisor (operación) | ve el día del sitio, abre y concilia conteos, autoriza; alta de catálogo e impresoras |
| Conteo | solo cuenta |
| Calidad o auditoría | lee el expediente de un lote, sus anclas firmadas y la integridad del sitio |

**Tercero afectado, no usuario:** el consumidor que compra en la sucursal lo que el sistema dejó
en el anaquel.
**Contexto:** con el celular en una mano o con una pistola, en el andén o en el pasillo, a veces sin
señal (los escaneos se encolan y suben al volver). Impresoras Zebra en el sitio, por Browser
Print o por el agente de impresión.
**Qué cadena lo usa primero: pendiente.** Lo decide el laboratorio.

## 4. Arquitectura de Datos

**Input:** escaneos de GS1-128, EAN-13, UPC-A, EAN-8, ITF-14 y GS1 Digital Link, por cámara o
pistola; fotos de la caducidad y del artículo; el catálogo desde Excel o CSV; y las ventas por
artículo para el agente de riesgo (hoy ficticias; leer las del ERP en solo lectura es una
propuesta con gate humano, SDD §10.2).
**Output:** etiquetas en ZPL y SVG que codifican lo mismo; semáforo por lote, FEFO y ronda del día;
conteos conciliados; el expediente de cada lote con su cadena de hashes y anclas firmadas;
recomendaciones del agente de riesgo; presupuesto contra gasto de etiquetas.

**Storage:** hoy todo es **local** en `ETIQUETAS_DATOS` (sin Supabase y sin tocar la base
compartida):
- `estado.json`: cadena de eventos por sitio, catálogo, asignaciones y números emitidos, rondas y
  conteos (escritura atómica, un solo proceso);
- `fotos/`: fotos normalizadas por su huella SHA-256, sin EXIF ni GPS (~150-300 KB cada una);
- el **central de anclas** (`central.json`): en producción debe vivir donde la sucursal no escriba,
  en otra máquina o en `eti_ancla` del ERP;
- `operadores.json`: el mapeo de seudónimos a nombres, borrable;
- la **cola sin señal** vive en el navegador de cada celular (IndexedDB), no en el servidor.

Integración al ERP: pack `eti_*` en el esquema `erp` con `cliente_id` y RLS forzada en toda tabla y
ledgers solo-agregar. **Es una propuesta validada en un Postgres efímero y no aplicada a ninguna
base** (SDD §6).

**Retención:** la cadena es solo-agregar, así que sus eventos se conservan. Las fotos que cita la
cadena viven lo que el expediente, y las que nadie cita se podan a mano, porque borrar es
irreversible (SDD §11). Los seudónimos se borran con `olvida()` y la cadena sigue verificando.
**Plazo máximo de retención de la cadena: pendiente** (lo fija el laboratorio).

### Respaldo — qué pierde ESTE producto si arde el servidor

> No hay respaldo implícito. **Lo que no esté en esta tabla ni en la del servidor (§4 del
> [índice de la raíz](../../../BUSINESS_LOGIC.md)), no se respalda.** El inventario completo, la
> regla para decidir criticidad y los gates de verificación están en
> **[`docs/FASE0-INFRAESTRUCTURA.md`](../../../docs/FASE0-INFRAESTRUCTURA.md) §9**.

Regla de criticidad, en una pregunta: **¿se puede reconstruir?**
Sin pérdida → no se respalda · Con trabajo → respaldo normal · **No** → respaldo inmutable.

| Activo del producto | ¿Reconstruible? | Criticidad | Destino |
|---|---|---|---|
| Estado del sitio (`ETIQUETAS_DATOS/estado.json`: cadena, catálogo, asignaciones, emitidos, rondas, conteos) | **No**: la cadena es la evidencia y un número emitido no se vuelve a usar | Crítica | Respaldo inmutable, en **la misma copia que las fotos** (SDD §11: «respaldarlos juntos») |
| Fotos (`ETIQUETAS_DATOS/fotos/`) | **No**: son la evidencia de cada recepción y corrección, citadas por huella | Crítica | Junto con el estado: uno sin el otro deja huellas sin foto o fotos sin historia |
| Central de anclas (`central.json`, o `eti_ancla` en el ERP) | **No**: es lo que delata una cadena recalculada | Crítica | Su propio respaldo, en la máquina del central y **nunca junto al del sitio**: si comparten copia, quien la escribe puede recalcular las dos |
| Seudónimos (`operadores.json`) | **No**: sin el mapeo, la cadena ya no dice quién hizo qué | Normal, **con caducidad** | **Respaldo con caducidad corta** (decisión del laboratorio, 2026-09-30). Es la excepción a «no reconstruible → inmutable»: es dato personal, y una copia inmutable impediría cumplir `olvida()`, que se cumple del todo cuando vence la última copia. Plazo exacto: **pendiente** |
| Llave del sitio (`ETIQUETAS_LLAVE_<SITIO>`) | No: es un secreto | Crítica | Va en `.env.production`, ya cubierto por la fila del servidor |
| Cola sin señal (IndexedDB de cada celular) | — | — | No se respalda: vive en el navegador; lo que no subió se ve «por subir» |
| Motor RapidOCR (Python aislado) | Sí: `motores/instala-rapidocr.sh` con versiones exactas | Baja | No se respalda |

**RPO / RTO:** los del servidor, en el §4 del índice de la raíz.

## 5. KPI de Éxito

**Métrica principal: pendiente.** Ninguna fuente fija un KPI de negocio. Sale de la primera
cadena real y lo decide el laboratorio. Lo que el sistema **ya puede medir**, como candidatos:
- cajas vencidas o en retiro encontradas en piso por la ronda, contra las que llegaron a merma sin
  pasar por piso;
- tareas de la ronda cerradas en el día, contra las atrasadas;
- diferencias del conteo cíclico por ubicación, y faltantes repetidos;
- recepciones con foto confirmadas sin corregir la fecha propuesta.

Ya medido, pero sobre las pantallas anteriores de la propia app y no sobre una operación real
(SDD §12): contar pasa de 27 toques y 25 escaneos a 15 y 14, y retirar de piso un lote en rojo, de
3 toques y 2 pantallas a 0 toques y 1 pantalla.

## 6. Gobernanza (controles C4 y C7)

> Se llena SIEMPRE, aunque el proyecto sea chico. Plantilla completa en
> `.claude/gobernanza/plantillas/aisia.md`. La pregunta que responde esta sección no es
> *¿quién nos ataca?* sino **¿a quién dañamos si el sistema opera bien y se equivoca?**

| Punto | Respuesta |
|---|---|
| **Datos personales que toca** | Del personal: el nombre que declara cada operador, que en la cadena va solo como seudónimo aleatorio (`op-` + 8 hex; la base rechaza un nombre como operador), y su traza de acciones. Fotos: si la foto completa capta a una persona, es dato personal (su huella queda en la cadena; la foto se puede quitar del almacén). **Del consumidor: ninguno.** |
| **Partes afectadas** | El **consumidor** de la sucursal (no es usuario y no firmó nada); el **personal** (almacenista, recibo), cuyas acciones quedan en una cadena inmutable y cuyos faltantes repetidos abren incidentes; los **proveedores**, a los que se rechaza lo que llega con menos vida de la mínima; la cadena (merma y dinero). |
| **Daño con el sistema operando bien** | **1. Consumidor:** una fecha mal leída y confirmada, o un umbral mal puesto, deja a la venta algo vencido o en retiro. Mitigación: la fecha por foto es una propuesta hasta que la persona confirma; lo vencido o en retiro no sube a piso; el rojo bloquea la venta normal; los umbrales siguen marcados como ejemplo hasta que calidad los fije. **Ninguna firma autoriza relajar esto**: el daño recae en quien no firmó (límite de C5); se rediseña, no se acepta. **2. Personal:** un patrón de faltantes puede señalar a una persona por un error del sistema, y la foto del inventario es la del sistema, no un conteo físico. Mitigación: reconteo por otra persona, autoriza quien no contó, el patrón abre un incidente y no una sanción. **Regla (decisión del laboratorio, 2026-09-30):** la traza no sirve para atribuir culpa individual ni para sancionar mientras la identidad sea un código compartido por dispositivo más un nombre declarado (SDD §5, riesgo 18): un faltante abre un incidente, nunca una sanción. **3. Proveedor:** el rechazo por vida mínima (2/3 por defecto) usa un umbral de ejemplo. **4. Merma evitable:** el agente de riesgo recomienda promociones con porcentajes de ejemplo (10/20/30 %); recomienda, no ejecuta. |
| **Acciones irreversibles** | Ninguna automática. Con gate humano: aplicar las diferencias de un conteo a la contabilidad del ERP, borrar fotos (poda a mano), aplicar el pack `eti_*` al ERP y leer ventas de producción (C4). Liquidar o donar un lote en rojo exige quién lo autoriza. Labelary (servicio externo) viene apagado y pide confirmación cada vez; los avisos por web push no se hicieron (C4). |
| **Vía de apelación humana** | Nada se edita: una `CORRECCION` referencia el evento corregido. Deshacer el propio movimiento dentro de 15 minutos. La fecha propuesta se confirma o se corrige, y un hallazgo lo resuelve el supervisor. Los conflictos de catálogo (GTIN repetido, prefijo ajeno, código anterior dado a otro artículo) se detienen para decisión humana. `olvida()` borra el mapeo de un seudónimo. |
| **Aislamiento de datos** | Hoy no usa Supabase ni `service_role`: guarda en archivos locales, y el rol lo decide el servidor por el código del dispositivo (fuera de su lista, 403). En el ERP (propuesta): RLS forzada por `cliente_id` en toda tabla, y el central de anclas escrito solo por el job de plataforma (C7). |

## 7. Especificación Técnica (Para el Agente)

### Tipo de proyecto

**Tipo:** herramienta + aplicación. El núcleo es la herramienta empaquetable
`@tu-scope/etiquetas-gs1` (0.2.0, en `tools/etiquetas-gs1`), con el agente de impresión del
sitio; la aplicación del template la consume en `/etiquetas/*` y usa solo lo que aprueba
`/laboratorio-etiquetas`. Dónde se despliega: **pendiente**, con la primera cadena.
**Cobro en línea:** no aplica **[supuesto]**: es una herramienta de operación interna de la
cadena.

### Features (Feature-First)

```
src/features/
├── etiquetas/              # etiqueta, leer, recibir, escanear, día, mover, caducidades,
│                           # conteo, catálogo, rollos, expediente, riesgo, integridad (hecho)
└── laboratorio-etiquetas/  # 68 casos en 11 herramientas, referencias visuales, compuerta (hecho)
```

### Stack confirmado

Golden Path del template (ver `CLAUDE.md`), sin sus cuentas de Supabase: la identidad es el código
del dispositivo más el nombre declarado. Versiones pineadas en el SDD §4 (decisión 11) y en el
README de la herramienta.

### Próximos pasos

1. [ ] **Decidir la primera cadena** y, con ella, el KPI (§5) y el costo actual (§1)
2. [ ] Probar en físico (SDD §7): Zebra de 203 y 300 dpi, Browser Print, pistolas con teclado en
   español y verificación de calidad del símbolo
3. [ ] Que calidad fije los umbrales del semáforo, la vida mínima y los porcentajes de promoción
4. [ ] Identidad: integrar con el login y los roles del ERP (SDD §5, riesgo 18)
5. [ ] Aplicar el pack `eti_*` al ERP (**gate humano**), con el central de anclas separado del sitio
6. [ ] Fijar el plazo de caducidad del respaldo de seudónimos (§4) y cerrar **GATE 3** para el
   estado, las fotos y el central (`docs/FASE0-INFRAESTRUCTURA.md`)
7. [ ] Conectar las ventas del ERP para el agente de riesgo (C4, **gate humano**)

---

**Firma:** lisagomez (responsable del proyecto), como hipótesis · Fecha: 2026-10-13 · Se vuelve a firmar con la primera cadena real.
