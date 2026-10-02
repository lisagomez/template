# @tu-scope/crecimiento-demostrado (0.1.0)

Analítica de growth revenue para pymes mexicanas donde **ninguna cifra llega al dueño sin prueba**:
cada respuesta es una derivación que verifica un kernel pequeño sin IA, o un «no» que dice por qué.

## Qué hace

- **Sella Γ**: de los CFDI 4.0 de la pyme (leídos con `@tu-scope/extractor-documental/xml`, que el
  proyecto inyecta), su caja, su catálogo de clientes y su lista de cancelados, construye un snapshot
  con hash. Antes comprueba **12 invariantes** de conjuntos: cliente es función, UUID únicos, notas
  que corrigen facturas que existen, global que cuadra con la caja… Si uno se viola, **no sella**.
- **Calcula sin LLM**, en un motor determinista y en centavos enteros:
  - el **revenue bridge**: nuevos, crecieron, decrecieron, estables, perdidos, «solo ajustes» y
    público en general, que parten T y cierran **al centavo**;
  - **clientes × frecuencia × ticket** por LMDI, cerrado al centavo por mayor residuo;
  - **pruebas de permutación con semilla**, con el cliente como unidad.
- **Verifica derivaciones Γ ⊢ φ** con un kernel de **11 reglas y 2 teoremas**. Recalcula cada hecho
  citado, exige los supuestos (SA) que la spec declara, rechaza particiones que no lo son y
  proporciones sin dominio, y separa lo **descriptivo** de lo **inferencial** y de lo **causal**.
- **Narra con restricción**: números(texto) ⊆ hechos verificados, con el sentido del verbo y sin
  lenguaje causal fuera de una hipótesis.
- **Orquesta agentes** (proponente y narrador) con permisos hijo ⊆ padre, y lazo de rechazo →
  retroalimentación → reintento.
- **Expone un agente A2A** (`./a2a`): Agent Card firmada, JSON-RPC, y cada veredicto como estado de
  tarea.

### Qué no hace

- **No ejecuta nada.** Una acción sale como *propuesta* con la forma de `sis_propuesta` (ERP D-42),
  para un humano.
- **No deja que un modelo dé cifras ni veredictos.** El proponente solo propone; el kernel no tiene
  LLM.
- **No demuestra causas.** «¿Debo subir precios?» es siempre una hipótesis, con su experimento.
- **No verifica el sello de los CFDI.** Leer bien no es autenticar.
- **No trae un modelo real activo.** El adaptador existe y responde «no medido» sin modelo
  inyectado.
- **No es un warehouse ni ML** (ERP D-41). Es el copiloto analítico de **pregunta**, de solo
  lectura.

## Casos de uso

- **«¿De dónde salió el crecimiento del trimestre?»**: el bridge por clase, que cierra al centavo,
  con su certificado. Si un cliente perdido recibió una nota de crédito, la forma clásica no aplica
  y el kernel lo exige así (está plantado en 2025-4T → 2026-1T).
- **«¿El 70 % del crecimiento viene de la expansión?»**: sí o no, con la proporción exacta. En un
  trimestre que cayó, la proporción es **indeterminada**, no un número.
- **«¿La caída de frecuencia de los mayoristas es real?»**: con 12 mayoristas (n < 20), **evidencia
  insuficiente**, aunque p salga chico.
- **«¿Debo subir precios?»**: hipótesis, con un experimento escalonado y su grupo de control.
- **Otro agente** (el de un ERP, un banco o una agencia) le entrega su derivación por A2A, y el
  kernel la juzga: REJECTED, INPUT_REQUIRED o COMPLETED con certificado.
- **Una tienda B2C** con «público en general»: lo anónimo es una clase propia de la partición, y el
  sistema dice dónde no hay N, K ni L.

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` (`engines`).
- **Dependencias del sistema**:
  - `zod` 4.6.1;
  - `@a2a-js/sdk` 1.1.0, peer opcional, solo para `./a2a`;
  - el lector `@tu-scope/extractor-documental/xml`, que el proyecto inyecta (sin dependencia
    declarada);
  - Lean 4.34.1 para comprobar las demostraciones (`lean/`), fuera de la ejecución.
- **CPU, GPU y memoria**: sin GPU. Medido el 2026-10-02 en un Ryzen 7 5700G:
  - sellar Γ, ~0.5 s por pyme (3,390 CFDI; 41,763 tickets);
  - las 19 trampas, 1.9 s;
  - RSS de 243 MB con las dos pymes cargadas;
  - las 19 siembras, ~51 s.
- **Servicios externos**: ninguno. El modelo real, si un día se activa, lo inyecta el proyecto.
- **Variables de entorno**: ninguna en el núcleo. La pasarela de la app pide
  `CRECIMIENTO_A2A_SECRETO` y `CRECIMIENTO_A2A_LLAVE`.
- **Almacenamiento**: ninguno. Γ vive en memoria y se reconstruye de las fuentes.
- **Salida del perímetro (C4)**:
  - el núcleo no sale a la red;
  - Γ y la narración llevan seudónimos HMAC, nunca RFC ni nombres;
  - con un LLM real, los hechos agregados irían al proveedor del modelo: es decisión C4 del
    proyecto (AISIA en borrador: `src/features/crecimiento-demostrado/BUSINESS_LOGIC.md` §6).

## Estado

**Laboratorio** (2026-10-02), con dos pymes **sintéticas** y la verdad plantada:

- 19/19 trampas;
- 12/12 snapshots sucios detenidos por su invariante;
- puente = verdad en 60/60 filas;
- 19/19 siembras tumbadas;
- replay idéntico entre procesos.

Sin LLM real, por decisión del laboratorio. El adaptador del ERP de solo lectura está listo y
**no se ha corrido contra producción**.

## Cómo se usa

```ts
import * as xml from '@tu-scope/extractor-documental/xml';
import { gammaDesdeFuentes, creaOrquestador, ProponenteSimulado, NarradorSimulado } from '@tu-scope/crecimiento-demostrado';

const c = gammaDesdeFuentes(xml, especificacion, { documentos, caja, catalogo, cancelados }, { rfcPropio, llaveDeSeudonimo });
if (!c.ok) throw new Error(c.violaciones.map((v) => `${v.invariante}: ${v.detalle}`).join('\n'));
const r = await creaOrquestador({ proponente: new ProponenteSimulado(), narrador: new NarradorSimulado() })
  .responde('¿De dónde salió el crecimiento del trimestre?', c.gamma, especificacion);
// r.estado: demostrada | evidencia_insuficiente | hipotesis | rechazada | requiere_entrada | sin_plan | no_medido | narracion_bloqueada
```

Los subpaths:

- `.`: el núcleo.
- `./sinteticos`: las pymes y su verdad. **El núcleo nunca lo importa**, y una prueba lo
  comprueba leyendo los imports.
- `./laboratorio`: trampas, cotejo, sucios y replay.
- `./a2a`: la pasarela.

## Arquitectura (el grafo del producto)

`fuentes → Γ (invariantes) → plan (DSL cerrado, nunca SQL) → hechos (motor) → derivación → kernel →
narración (inclusión de números) → respuesta`.

Ningún agente llega a los hechos, al veredicto ni al texto publicado sin pasar por un paso
determinista. La base de confianza es `src/kernel/` + `src/motor/` + `src/datos/`.

El grafo con estados está en `docs/grafos/crecimiento-demostrado.json`.

## Pruebas

`npm run prueba`: 11 archivos. Incluye:

- las siembras, mutaciones del `dist` que la batería tiene que tumbar;
- el replay entre dos procesos;
- la estructura: el núcleo no importa la verdad, y los agentes no tocan el kernel.

Además:

- `node e2e/a2a-http.mjs`: A2A por HTTP real.
- `node e2e/capturas.mjs [url]`: las capturas de la app con Playwright.
- `lean/comprueba.sh`: las demostraciones; sin el binario, «no medido».

## Hallazgos que quedan abiertos

- **El extractor no traduce `CfdiRelacionados` ni `InformacionGlobal`** (`noLeido`). Aquí se leen
  con su mismo analizador XML. Su skill A2A tampoco los devuelve, así que no basta para esta
  ontología.
- **El estatus de cancelación ante el SAT no viene en el XML.** Es un supuesto (SA-03) con su
  lista de cancelados.
- **La narración se comprueba sobre magnitudes, verbos de dirección y conectores causales**, no
  sobre todo el significado del texto. Una cifra verdadera puesta en la frase equivocada (otro hecho
  con el mismo valor) pasa.
