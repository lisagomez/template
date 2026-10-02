# Crecimiento demostrado (`/crecimiento`) y su laboratorio (`/laboratorio-crecimiento`)

Para el dueño de una pyme: pregunta en español por su crecimiento y recibe una respuesta con su
prueba, o un «no se puede afirmar» que dice por qué. Para el laboratorio: las trampas y su defensa.

## Qué hace

- **`/crecimiento`**: el dueño elige la pyme (dos sintéticas: una distribuidora B2B y una tienda
  B2C) y pregunta. Cada visita corre en el servidor el pipeline completo:
  - plan → motor → kernel → narración;
  - el **estado** de la respuesta (demostrada, evidencia insuficiente, hipótesis, rechazada,
    requiere entrada, sin plan, no medido o narración bloqueada), con icono y texto;
  - el **texto**, que pasó la inclusión de números;
  - la **cascada del puente** (solo hechos del certificado) y su tabla gemela con valores exactos;
  - **lo que la respuesta NO afirma**;
  - los **supuestos** que usó, con el texto de la spec;
  - el **árbol de la prueba** paso por paso;
  - el **certificado** con sus hashes, los intentos y el **replay** (Γ reconstruido desde las
    fuentes, mismo certificado);
  - la **propuesta** para una persona, cuando la hay.
- **`/laboratorio-crecimiento`**: corre al abrirla:
  - las 19 trampas;
  - los 12 snapshots sucios;
  - el puente contra la verdad plantada (60 filas);
  - el replay de Γ;
  - la inyección.
- **`/api/crecimiento/a2a`**: el agente A2A local (JSON-RPC, Agent Card firmada en
  `/api/crecimiento/a2a/.well-known/agent-card.json`), con las skills `pregunta` y
  `verifica-derivacion`.

### Qué no hace

- **No ejecuta acciones.** El botón no existe: sale una propuesta con la forma de `sis_propuesta`
  para un humano.
- **No usa un modelo real** (decisión del laboratorio). Los agentes son simulados y el adaptador real
  dice «no medido».
- **No lee datos de una pyme real** ni el ERP de producción. El adaptador de solo lectura existe y no
  se corre.
- **No abre la pasarela A2A sin configuración.** Sin `CRECIMIENTO_A2A_SECRETO` y
  `CRECIMIENTO_A2A_LLAVE` responde 503, y no hay secreto por omisión. Exponerla fuera de la red
  interna es gate humano, con C3 + C4.
- **No pide cuenta.** Es una página del laboratorio, con datos sintéticos.

## Casos de uso

- **El dueño de la distribuidora**:
  - pregunta de dónde salió el crecimiento del trimestre y ve la cascada que cierra al centavo;
  - pregunta si el 70 % viene de la expansión y recibe sí o no con la proporción exacta;
  - pregunta por sus mayoristas y recibe «evidencia insuficiente»: son 12 y la spec pide 20.
- **La dueña de la tienda** pregunta si el ticket subió de verdad: una prueba de permutación con
  semilla dice que no es ruido, y no dice por qué.
- **Quien audita** abre el replay y ve el mismo certificado desde un Γ reconstruido, o abre el
  laboratorio y ve cada trampa detenida por su defensa.
- **Otro agente** le pregunta o le entrega su derivación por A2A.

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` y Next 16 (la app del repo).
- **Dependencias del sistema**:
  - `tools/crecimiento-demostrado` y `tools/extractor-documental` construidas (`npm run
    prepara:gate`);
  - `@a2a-js/sdk` 1.1.0 para la pasarela.
- **CPU, GPU y memoria**: sin GPU. Medido el 2026-10-02 en un Ryzen 7 5700G:
  - una respuesta, 20–400 ms (la prueba de dos muestras de la tienda es la más cara);
  - abrir el laboratorio, ~7 s;
  - las dos pymes en memoria, ~243 MB de RSS.
- **Servicios externos**: ninguno.
- **Variables de entorno**: `CRECIMIENTO_A2A_SECRETO` y `CRECIMIENTO_A2A_LLAVE`, solo para la
  pasarela A2A.
- **Almacenamiento**: ninguno; Γ se sella en memoria al primer uso.
- **Salida del perímetro (C4)**: nada sale. Los datos son sintéticos y los clientes aparecen como
  seudónimos HMAC.

## Estado

Laboratorio, sin estreno. Contrato en `BUSINESS_LOGIC.md` (firma pendiente). Capturas con
Playwright: `node tools/crecimiento-demostrado/e2e/capturas.mjs http://localhost:<puerto>`.
