# @tu-scope/agora

El núcleo de Ágora: el espacio de trabajo donde el equipo, sus agentes internos y los agentes de sus socios planean y ejecutan juntos en un buzón y un tablero, y donde cada peso —lo que gasta un agente y lo que compromete un plan— tiene centro de costo, presupuesto, aprobación de Finanzas y una póliza propuesta que Contabilidad revisa y asienta. **Laboratorio con datos ficticios.**

## Qué hace

- **La base impone las reglas, no la pantalla.** Postgres con RLS **forzada** en cada tabla: una organización no ve ni escribe nada de otra, el alcance manda dentro de la organización y un agente solo ve lo suyo. Su identidad la verifica la base (un token de tarea con HMAC), no el proceso que lo llama.
- **Buzón y tablero con propuestas.** Un agente nunca edita: propone. Cada propuesta lleva su texto canónico (JCS) y su sha256; aprobar es una fila humana sobre ESA huella, según una **matriz de aprobación** que es dato de la organización. Quien pide no aprueba (segregación de funciones). Lo reversible de bajo riesgo (A2) se aplica solo y se deshace en 24 h.
- **Libro de costos por compromisos.** Presupuesto (versionado), comprometido (solo de una propuesta aprobada), ejercido (solo con evidencia: UUID de CFDI, comprobante con sha256 o uso de modelo) y disponible. El gasto de cada agente en MXN con su tipo de cambio, fuente y fecha; una llamada sin datos de uso es `null`, nunca cero.
- **Paquete para Contabilidad.** El cierre del periodo (de Finanzas, por el freno) deja una **póliza propuesta** con partida doble, código agrupador del SAT y cada UUID ligado; la exporta con su huella para el ERP. **Ágora no asienta**: acepta o rechaza Contabilidad, y quien cerró no acepta.
- **Coordinador sin modelo de pago.** Un grafo con puntos de control en la base (se interrumpe y se reanuda releyéndola), un modelo **determinista inyectado** y la guardia de gasto antes de cada llamada.
- **La Puerta A2A, cerrada.** JSON-RPC (A2A 1.0) con nueve comprobaciones —idCard vivo sin caché, huella de tarjeta y llave fijadas, jti de un solo uso, alcance, cuotas con `Retry-After`— y un «no existe» uniforme. Solo laboratorio y loopback.
- **El vigía (sin modelo).** Calendariza cada fecha con clave por versión (un reintento no duplica), programa recordatorios, avisa al 80 % del gasto también a Finanzas, propone reprogramar lo atrasado, avisa del cierre y **suspende** al socio cuya tarjeta cambió de huella.
- **Métricas desde una capa semántica.** Un catálogo declarado (definición, la decisión que apoya, su modelo y sus dimensiones) que se compila a SQL sobre vistas `security_invoker`; una métrica que no existe no se sustituye por una parecida.
- **El testigo del freno.** Cerrar, revocar, quitar la segregación o avisar a un tercero exigen una cita que **esta persona** dijo en la conversación, de un solo uso y de hace 15 minutos o menos. Quitada la segregación, Finanzas tiene un aviso fijo y cada póliza aceptada sale marcada. La base solo guarda la huella, nunca el texto.

### Qué no hace

- **No paga, no mueve dinero, no asienta, no cierra un periodo ni aprueba por nadie.** Ningún agente tiene con qué: no hay permiso en la base, no solo un botón escondido.
- **No construye la contabilidad del ERP.** Propone la póliza con el contrato de exportación; asentarla es del ERP y de Contabilidad.
- **No abre la Puerta a un socio real** ni conecta espejos, correo o un modelo real: cada cosa es una firma del laboratorio (C3, C4/AISIA, CDC).
- **No trae interfaz propia.** Las pantallas son módulos de `src/features/agora*` montados en la capa común (`tools/capa`); este paquete no importa React, Next ni Supabase.
- **No está medido en producción.** Las cifras de abajo son del laboratorio.

## Casos de uso

- **Una distribuidora que planea su expansión** con su equipo y dos socios externos (medios y fletes): el socio propone en el hilo de su categoría, la persona con el rol que pide la matriz lo aprueba con un clic, y el comprometido sube en el libro en ese momento.
- **Finanzas que cierra el mes**: ve el disponible por centro de costo con lo comprometido y lo ejercido, cierra por el freno con su cita y deja la póliza para Contabilidad, con las llamadas de modelo sin costo declaradas.
- **Contabilidad** que recibe una póliza cuadrada, con cada UUID ligado y su huella, y la acepta o la rechaza sin que Ágora asiente nada.
- **Quien administra agentes**: da de alta uno con dos firmas, le pone topes, lo suspende o lo revoca; la siguiente llamada del revocado falla y `llamadas_tras_revocar` queda en 0.

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` (corre los `.ts` de las pruebas sin transpilar).
- **Dependencias del sistema**: PostgreSQL con `pgcrypto`, probado en **PostgreSQL 17.11** (Docker, `npm run agora:laboratorio`) y en **PGlite 0.5.8** (las pruebas de `validate`, sin Docker). Paquetes: `pg` 8.16.3 y `zod` 4.6.1, con versión exacta; PGlite es peer opcional (solo pruebas).
- **CPU, GPU y memoria**: no medido. Las 133 pruebas de las fases 1 a 7 corren en minutos en una laptop (PGlite, una base nueva por comprobación).
- **Servicios externos**: ninguno. El calendario del laboratorio es el simulador de `tools/calendario`; el modelo es determinista.
- **Variables de entorno** (solo el laboratorio de la app): `AGORA_LABORATORIO` (encendido o apagado; sin él, la siembra ficticia tampoco corre), `AGORA_PG_URL` (la base del laboratorio) y `AGORA_SECRETO` (firma los tokens de tarea; ≥ 32 caracteres). `npm run agora:laboratorio` las escribe en `tools/agora/.laboratorio/entorno` (ignorado por git) y solo dice si están presentes.
- **Almacenamiento**: dos esquemas, `agora` (datos, RLS forzada) y `agora_priv` (funciones). La bitácora es encadenada y solo crece. El testigo del freno guarda huellas, no texto, y se poda a las 24 h.
- **Salida del perímetro (C4)**: ninguna. La Puerta está cerrada, la voz es local y el modelo es determinista.

## Cómo se prueba

```bash
npm --prefix tools/agora run prueba       # las suites por fase (PGlite): conducta y estructura
npm --prefix tools/agora run sabotajes    # cada defecto sembrado en una base nueva tiene que tumbar su comprobación
npm run agora:pg                          # lo mismo contra PostgreSQL real (Docker)
```

Cada fase tiene su suite (`pruebas/_suite-*.ts`) y sus **sabotajes**: un defecto en SQL sembrado sobre una base nueva, que debe tumbar la comprobación que apunta. Una suite que no se pone roja cuando debe no cuenta.

## Lo que la base nos enseñó

- **Dentro de una función `security definer`, `current_user` es el dueño**: `confiable()` daba siempre verdadero y las funciones que decidían con él dejaban pasar a cualquiera. Las definer preguntan `rol_que_llama()`; los triggers, `confiable()`. Una comprobación estructural lo vigila.
- **En plpgsql, `if <algo con null>` no rechaza.** `not (falso or null)` es null, y el `if` no lanza. Las comprobaciones de acceso usan `coalesce(…, false)`.
- **Un parámetro que se llama como una columna la sombrea** (`origen`, `clave`, `estado`): la plantilla abonaba a la cuenta equivocada y un `on conflict (clave)` se volvía ambiguo. Los parámetros van con prefijo.
