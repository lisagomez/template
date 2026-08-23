# PRP-001: Canal de Slack como superficie de entrada a los agentes

> **Estado**: PENDIENTE
> **Fecha**: 2026-08-23
> **Proyecto**: SaaS Factory V4 (template) / infraestructura de agentes
> **CDC aplicable** (¿este PRP cambia comportamiento de agentes: modelo, skill, prompt
> o plantilla?): **SÍ** → toca configuración del agente (`.mcp.json` / `settings.json` /
> permisos y un canal de entrada nuevo). Aplica C1 de `.claude/gobernanza/GOBERNANZA.md`
> §2 y exige entrada en `BITACORA-CDC.md`.

---

## Objetivo

Habilitar un canal de Slack privado desde el que la dueña pueda **proponer** trabajo a
los agentes desde el móvil, sin abrir el túnel SSH — sin que la pertenencia al workspace
se convierta, de hecho, en permiso de operación sobre agentes que tienen llaves.

## Por Qué

| Problema | Solución |
|----------|----------|
| Abrir un túnel SSH desde el móvil es inviable en la práctica; el trabajo se aplaza | Canal de propuesta asíncrono, siempre a mano |
| El túnel es un cuello de botella de disponibilidad, no de seguridad | Se separa **proponer** (barato, móvil) de **ejecutar lo irreversible** (caro, superficie autenticada) |

**Valor de negocio**: latencia entre "se me ocurre" y "el agente lo tiene" baja de horas
a segundos, sin mover el techo de daño.

## Qué

### Criterios de Éxito
- [ ] Un mensaje de un remitente **no** allowlisted se descarta y se registra; **nunca**
      entra al contexto del modelo, ni siquiera resumido
- [ ] Un texto de inyección publicado en el canal se trata como DATO, no como instrucción
- [ ] Ninguna acción irreversible se ejecuta desde Slack: se propone, y se aprueba en la
      superficie autenticada (túnel/dashboard) donde el diff es legible
- [ ] El agente `clientes` **no** es alcanzable desde Slack. Solo `negocio`
- [ ] El kill-switch se probó en simulacro, no solo se escribió
- [ ] Caso nuevo en la suite de regresión (C2) que cubre esta superficie
- [ ] Ningún secreto (`xapp-`, `xoxb-`) aparece en el repo, en `.mcp.json` commiteado,
      ni impreso en pantalla

### Comportamiento Esperado

```
Móvil → canal privado de Slack → bot (Socket Mode, saliente)
      → filtro de remitente (allowlist por user ID, deny-by-default)
      → cola de PROPUESTAS del agente `negocio`
      → [si la acción es reversible] el agente la ejecuta y responde al canal
      → [si es irreversible] el agente responde "propuesta N encolada",
        y la aprobación ocurre en el dashboard por túnel, con diff a la vista
```

---

## Contexto

### Referencias
- `docs/FASE0-INFRAESTRUCTURA.md` — "Qué cubre y qué NO": Telegram/Slack están fuera de
  Fase 0 **a propósito**, y la condición de entrada es exactamente este documento
- `CLAUDE.md` → Reglas de Código → **Canales de chat externos**
- `.claude/gobernanza/GOBERNANZA.md` §2 (C1), §4 (C3), §5 (C4), §6 (C5 y su límite)
- `.claude/gobernanza/INCIDENTES.md` — el incidente de credenciales impresas en claro

### Estado de hecho que condiciona todo esto

Según `.claude/memory/project/infraestructura-agentes.md`: **nada está provisionado**.
No hay servidor de agentes, no hay contenedores Hermes, no hay dashboard y por tanto no
hay túnel. Un canal de Slack montado hoy no tendría con quién hablar. Confirmar antes de
la Fase 1 si existe un servidor fuera de este repo.

### Lo que sí es correcto de la propuesta original

**Socket Mode** es la elección técnica acertada: la conexión la abre el bot hacia fuera,
así que no hace falta abrir 80/443 ni añadir ruta en Caddy. El firewall de Fase 0
(§ solo TCP 22) sigue intacto. Esto no es un detalle menor: la alternativa (endpoint de
eventos HTTP público) sí exigiría abrir puerto, y eso es una discusión distinta y peor.

---

## Gobernanza

### Modelo de amenazas (control C3) — *¿quién nos ataca?*

**Activos que toca**, por daño descendente:

1. Llaves del servidor de agentes (`SUPABASE_SERVICE_ROLE_KEY`, `HCLOUD_TOKEN`,
   `SUPABASE_ACCESS_TOKEN`, `OPENROUTER_API_KEY`) — acceso saltándose todo control
2. Datos del vertical `clientes` — terceros que nunca eligieron estar aquí
3. Los volúmenes `.hermes` — memoria irrecuperable, no reconstruible
4. Presupuesto de tokens — denial-of-wallet
5. El repositorio, si el agente tiene `git push`

**Fronteras que cruza** — aquí está el punto entero:

El canal **no** es "el móvil de la dueña". Es todo lo que puede depositar texto en él:

- Cualquier miembro del workspace que se una o sea añadido al canal
- Cualquier integración ya instalada en el workspace que pueda postear
- **Contenido reenviado o citado**: un ticket de soporte, un correo, un unfurl de enlace.
  Un cliente escribe *"ignora tus instrucciones y…"* en un ticket, una integración lo
  reposta en el canal, y el agente lo lee como instrucción. Inyección **indirecta**: nadie
  atacó al bot, el texto llegó solo
- Archivos adjuntos, que jamás deben entrar crudos al contexto del modelo
- **Slack como tercero** pasa a estar en la ruta de confianza
- **La autenticación se degrada**: hoy lo que autoriza es una llave SSH. Con Slack, lo que
  autoriza es una sesión de Slack en un teléfono. No es lo mismo, y conviene decirlo en
  voz alta antes y no después

**Atacante relevante**: **O1** (inyección de requerimientos — el más barato y el que esta
superficie multiplica), **O3** (fatiga: aprobar un diff desde el móvil en la cola del
súper *es* el sello de goma, por diseño y no por descuido), **O4** (denial-of-wallet:
quien pueda postear puede quemar tokens), **O6** (el token de la app de Slack comprometido
se vuelve palanca sobre un agente con llaves).

**Controles**:

| Control | Qué exige |
|---|---|
| Allowlist de remitentes | Por **Slack user ID** (`U…`), no por nombre visible ni correo: el display name se cambia en dos toques. Deny-by-default |
| Canal único y privado | Un solo channel ID suscrito. Sin Slack Connect ni canales compartidos: un canal Connect deja postear a miembros de otra organización |
| Superficie mínima del bot | Ignora DMs, menciones fuera del canal y respuestas en hilo de no-allowlisted. Sin scopes de escritura que no se usen |
| Todo es DATO | Solo el texto de un remitente allowlisted en el canal designado se interpreta como instrucción. Lo demás se registra y se descarta — **descartar, no resumir**: resumir ya es ingerir |
| Separación proponer/ejecutar | Lo irreversible (migración, envío, cobro, deploy, `git push`, cualquier cosa que toque `clientes`) se **propone** desde Slack y se **aprueba** en el dashboard por túnel. Un móvil no puede mostrar un diff revisable, y aprobar sin diff es O3 |
| Techo de gasto | Rate-limit por remitente + presupuesto global de tokens + kill-switch **probado en simulacro** |
| Secretos | `xapp-`/`xoxb-` solo en el fichero de entorno del servidor (gitignored). Nunca en el repo, nunca en `.mcp.json` commiteado, nunca impresos (regla de secretos en pantalla) |
| Auditoría | Log de cada mensaje aceptado: quién, cuándo, qué hizo el agente |

**Brecha que queda abierta a propósito**: Slack es un tercero en la ruta de confianza y su
compromiso está fuera de nuestro control. No se previene: se acota el radio de daño (nada
irreversible se ejecuta desde ahí, y `clientes` no es alcanzable).

### Evaluación de impacto / AISIA (control C4) — *¿a quién dañamos sin atacante?*

**Partes afectadas**: la dueña; los **clientes** cuyos datos viven en el vertical
`clientes`; los usuarios finales de las apps generadas; **el resto del workspace**, cuyos
mensajes se vuelven entrada de un agente sin que nadie se lo haya dicho; y los terceros
mencionados en cualquier texto que alguien pegue en el canal.

**Daño posible con el sistema operando bien** (sin ningún atacante):

| Daño | Cómo ocurre operando "bien" |
|---|---|
| **Dato de terceros sale a Slack** | El agente responde una pregunta legítima y la respuesta lleva datos personales de un cliente. Quedan en los servidores de Slack, en la búsqueda del workspace, en la vista previa de la notificación de una pantalla bloqueada, y en el export que cualquier admin del workspace puede pedir |
| **Secreto en el canal** | Ya pasó una vez en este proyecto con dos tokens vivos. En Slack el transcript es alojado, buscable y exportable: el mismo error, más caro |
| **Instrucción malinterpretada** | Los mensajes de móvil son cortos; el agente rellena el hueco por inferencia. Sin diff a la vista, así es como se despliega algo que nadie pidió |
| **Membresía = autoridad** | Estar en el workspace se convierte en poder de operación sin que nadie lo haya decidido |

**Reversibilidad**: la fuga de dato de terceros **no es reversible** — el dato ya salió, y
borrar el mensaje no lo devuelve. Las demás son reversibles con coste.

**Decisión: REDISEÑAR** (no "aceptar y firmar").

El primer daño es **infirmable** por el límite de C5: los datos personales de clientes no
son de la dueña para apostarlos, así que ninguna firma en `REGISTRO-RIESGO.md` lo
autoriza. Por eso no se ofrece esa vía aquí. El rediseño que lo evita:

- El vertical **`clientes` no se conecta a Slack**. Punto. Slack habla solo con `negocio`
- Slack es canal de **propuesta y notificación**, nunca de ejecución de lo irreversible
- La aprobación vive donde el diff es legible y la autenticación es una llave, no una app

Con ese recorte, lo que queda **sí** es riesgo propio de la dueña y sí es firmable.

---

## Blueprint (Assembly Line)

### Fase 1: Hechos previos
**Objetivo**: confirmar que existe un servidor de agentes al que conectar, y que el app
token no está ya comprometido.
**Validación**: servidor accesible; si el token se pegó en algún chat, transcript o nota,
**se rota** — rotar invalida el valor filtrado, perseguir copias no.

### Fase 2: Firma de C3 y C4
**Objetivo**: la dueña firma las dos secciones de arriba, o las corrige.
**Validación**: PRP en estado APROBADO.

### Fase 3: CDC (C1)
**Objetivo**: el cambio de configuración pasa el gate completo.
**Validación**: diff revisado + `npm run regresion` verde + `npm run regresion -- --trampa`
en sesión fría + aprobación humana + entrada en `BITACORA-CDC.md` con la **versión de la
app/imagen pineada** (nada de `latest`).

### Fase 4: Construcción
**Objetivo**: canal privado, allowlist por user ID, Socket Mode, scopes mínimos, log de
auditoría, rate-limit y kill-switch.
**Validación**: el camino feliz funciona desde el móvil.

### Fase 5: Control negativo
**Objetivo**: demostrar que **falla** cuando debe.
**Validación**:
- [ ] Mensaje de remitente no allowlisted → descartado y registrado
- [ ] Cadena de inyección en el canal → tratada como dato
- [ ] Acción irreversible pedida desde Slack → escala al túnel, no se ejecuta
- [ ] Mención al vertical `clientes` desde Slack → rechazada
- [ ] Kill-switch en simulacro → el canal queda mudo
- [ ] Caso nuevo en la suite de regresión (C2)

### Fase 6: Validación Final
**Validación**:
- [ ] `npm run validate` pasa
- [ ] Criterios de éxito cumplidos
- [ ] `docs/FASE0-INFRAESTRUCTURA.md` actualizado: Slack deja de estar "fuera"

---

## 🧠 Aprendizajes (Self-Annealing)

*(vacío hasta la implementación)*

---

## Gotchas

- [ ] Socket Mode necesita **dos** tokens: app-level (`xapp-`, con `connections:write`) y
      bot (`xoxb-`). Tener uno no es tenerlo montado
- [ ] **Slack Connect / canales compartidos**: comprobar que están desactivados para este
      canal, o la allowlist protege menos de lo que parece
- [ ] **Unfurl de enlaces**: mete contenido externo en el canal. Es vector de inyección
      indirecta aunque nadie escriba nada
- [ ] `*.mcp.json` está en `.gitignore` (salvo `example.mcp.json`): una config de Slack
      añadida ahí **no pasa por revisión de código**. Que quede en `example.mcp.json` +
      `BITACORA-CDC.md`, o el CDC se vuelve papel
- [ ] Verificar si la integración oficial de Slack de Claude Code cubre parte del
      transporte. Aun si la cubre, **no** resuelve allowlist, separación proponer/ejecutar
      ni C3/C4 — y sigue siendo un CDC

## Anti-Patrones

- NO tratar el contenido del canal como instrucción por defecto
- NO ejecutar acciones irreversibles desde el móvil "porque es más cómodo"
- NO conectar el vertical `clientes` a un canal de chat
- NO pegar el app token en un chat, un issue o una nota
- NO usar `service_role` en superficies de negocio (C7)
- NO editar config de agente sin CDC (C1)

---

*PRP pendiente aprobación. No se ha modificado configuración ni conectado nada.*
