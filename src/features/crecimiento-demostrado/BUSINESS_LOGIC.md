# BUSINESS_LOGIC.md — Crecimiento demostrado

> **Hipótesis del 2026-10-02, sin pyme real todavía.** Redactado por el agente a partir del goal
> (`docs/goals/crecimiento-demostrado.md`), del diseño del laboratorio que ese goal condensa y de
> lo construido en `tools/crecimiento-demostrado`. Lo medido se midió con dos pymes **sintéticas**
> con la verdad plantada. Lo que ninguna fuente dice va marcado **[supuesto]** o **pendiente**.
> Cubre `tools/crecimiento-demostrado` y `src/features/crecimiento-demostrado`.

---

## 1. Problema de Negocio

**Dolor:** el dueño de una pyme decide sobre cifras de crecimiento que nadie puede reproducir:
- un tablero que no cuadra con su facturación;
- un «70 % del crecimiento viene de los mayoristas» calculado sobre un trimestre que cayó;
- una «caída real» que con 12 clientes es ruido;
- y un «sube precios» presentado como dato cuando es una apuesta.

Un asistente con IA lo empeora si redacta cifras que no salen de los datos.

**Costo actual:** **pendiente, no medido** en una pyme real.

## 2. Solución

**Propuesta de valor:** el copiloto analítico de PREGUNTA (ERP-8). El dueño pregunta en español y
recibe una de dos cosas:
- una respuesta **demostrada**: una derivación que un kernel sin IA verificó sobre un snapshot
  sellado, y un texto cuyas cifras son todas hechos verificados;
- un **no tipado** que dice por qué: evidencia insuficiente, hipótesis con su experimento, rechazo
  o falta de un supuesto.

**Flujo principal:**
1. La pyme entrega sus fuentes: CFDI, caja, catálogo de clientes y lista de cancelados (o el ERP en
   solo lectura). Se sella Γ solo si cumple los 12 invariantes.
2. El dueño pregunta.
3. Un proponente arma el plan, en un vocabulario cerrado y sin SQL.
4. El motor calcula los hechos.
5. El proponente arma la derivación y el kernel la verifica (y si la rechaza, se reintenta con el
   motivo).
6. El narrador redacta, y la inclusión de números decide si el texto se publica.
7. Una acción posible sale como propuesta para una persona, nunca se ejecuta.

## 3. Usuario Objetivo

**Rol:** dueño o administrador de una pyme mexicana, B2B o B2C, que factura con CFDI 4.0.
**Contexto:** quiere saber qué pasó con su ingreso y qué tan seguro puede estar, sin analista.
**[supuesto]** Lee la respuesta en el celular o en la computadora, y pide factura de su caja.

## 4. Arquitectura de Datos

**Input:**
- XML de CFDI 4.0 (ingreso, egreso, pago);
- CSV de caja;
- catálogo de clientes con su segmento;
- lista de cancelados;
- o, en su lugar, las filas de `erp.cfd_timbre` en solo lectura.

**Output:** la respuesta, su estado, su certificado (hashes), el árbol de la prueba y, si la hay,
una propuesta con la forma de `sis_propuesta`.
**Storage:** **ninguno.** Γ vive en memoria y se reconstruye de las fuentes. Ninguna tabla nueva y
ninguna escritura al ERP.
**Respaldo:** nada que respaldar en el servidor hoy. **Pendiente:** con una pyme real, decidir si
los certificados y sus Γ se conservan para auditoría, y entonces se declaran en el inventario de
`BUSINESS_LOGIC.md` raíz §4.

## 5. KPI de Éxito

**Pendiente con una pyme real.** Lo que se puede medir hoy (laboratorio, 2026-10-02):
- 19/19 trampas detenidas;
- 12/12 snapshots sucios no sellados;
- el puente igual a la verdad plantada en 60/60 filas;
- 19/19 siembras tumbadas;
- replay idéntico entre procesos.

**[supuesto]** El KPI de negocio sería la proporción de decisiones del dueño que se apoyan en una
respuesta demostrada, contra las que se apoyan en una hipótesis sin experimento.

## 6. Gobernanza (controles C4 y C7)

**AISIA (C4), que se firma con este contrato**, como hipótesis. La decisión C4 de mandar datos a un LLM real
sigue pendiente (fila «¿Sale algo del perímetro?»):

| Pregunta | Respuesta |
|---|---|
| **¿Sobre quién decide algo?** | No decide: describe y propone. Sus respuestas tocan a terceros, los **clientes de la pyme**: un «cliente perdido» o un «decreció» son afirmaciones sobre personas morales o físicas identificadas por RFC. |
| **¿Qué daño puede hacer?** | Que el dueño trate distinto a un cliente por una clasificación (por ejemplo, retirarle crédito por «decreció»). Por eso la clasificación sale con su certificado, sin afirmar causas, y toda acción sale como **propuesta para un humano**. |
| **¿Qué datos personales usa?** | El RFC del receptor, solo para un seudónimo HMAC con la llave de la pyme. Γ, el texto y A2A llevan seudónimos, nunca RFC ni nombre. Los nombres del receptor no se leen al construir Γ. |
| **¿Sale algo del perímetro?** | Hoy no: datos sintéticos, agentes simulados y sin red. Con un LLM real, el plan y los hechos agregados (seudonimizados) irían al proveedor del modelo. **Decisión C4 pendiente**, junto con el CDC de la clase de routing. |
| **¿Hay entrada no autenticada?** | La pasarela A2A exige token (pyme + skills) y está apagada sin configuración. Exponerla a un partner o a internet es gate humano, con C3 + C4. |
| **¿Qué no es firmable?** | Ejecutar una acción sobre un cliente (contactarlo, cambiarle el precio o el crédito) desde la respuesta. No se construye: solo existe la propuesta. |

**C7 (service_role):** no se usa. Ni la app ni la herramienta tocan Supabase. El adaptador del ERP
pide una credencial de **solo lectura** (`rol_bi` o `erp_lector`), fuerza la sesión a `read_only` y
rechaza cualquier sentencia que no sea SELECT.

## 7. Especificación Técnica (Para el Agente)

- **Núcleo:** `tools/crecimiento-demostrado`. Γ, invariantes, motor, kernel de 11 reglas, narración
  restringida, agentes y `./a2a`. Teoremas demostrados en `lean/` con Lean 4.34.1.
- **App:** `/crecimiento`, `/laboratorio-crecimiento` y `/api/crecimiento/a2a`.
- **Determinismo:**
  - snapshot por hash;
  - spec versionada;
  - ejecución fuera del LLM;
  - narración restringida;
  - replay comprobado entre procesos.
- **Sin LLM real** (decisión del laboratorio, 2026-10-02). Los tres prompts entraron apagados con su
  CDC (2026-10-14). Encenderlos espera el CDC-1, con las clases de routing y su medición
  (`tools/crecimiento-demostrado/piloto/propuesta-cdc.md`), y la decisión C4.

---

**Firma:** lisagomez (responsable del proyecto), como hipótesis, 2026-10-14.
