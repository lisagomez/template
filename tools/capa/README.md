# @tu-scope/capa

La capa común de la fábrica: toda herramienta, app y producto se usa igual —una ventana con conversación, lienzo, explorador y panel; pedir el resultado en lenguaje simple; memoria propia; plan; voz; el freno; un primer arranque guiado— y en sus ranuras se enchufa lo que cada módulo ya hizo.

## Qué hace

- **Una sola ventana** (`./react`): cabecera con la marca del producto y la ranura de voz, explorador de pantallas, lienzo donde se pinta la pantalla del módulo, y al lado el panel («Espera tu clic», plan) y la conversación. Estilos propios con prefijo `capa-`: no depende del Tailwind del consumidor.
- **Ranuras con dueño** (`resuelveComposicion`): conversación, lienzo, explorador, panel, plan, voz, memoria, freno, primer arranque, ajustes e intención. Cada producto declara en su **composición** qué módulos lleva y quién llena cada ranura; lo que no se dice lo llena el primer módulo que la declara o, si nadie, la versión de la capa. **Intercambiar módulos es cambiar ese dato, nunca la capa.**
- **Contrato de enchufe** (`enchufe.json` junto a cada módulo): qué ranuras llena, qué intenciones atiende, qué acciones pasan por el freno, qué memoria lee o escribe y qué sale de la máquina. Lo verifica `node scripts/capa/verifica-enchufes.mjs` contra las rutas reales y el inventario, con sus siembras.
- **Operar por intención, sin LLM** (`creaEnrutador`): compara lo pedido con los ejemplos que declaran los enchufes. Si no está seguro no adivina: dice que no sabe (y lo que sí sabe) o pregunta entre dos. Un modelo (C8) se puede inyectar para lo que las reglas no resuelven.
- **El freno** (`creaFreno`): lo irreversible pide la **cita textual** de la persona —cotejada contra lo que ella dijo, no contra lo que dijo el asistente o una página— y **un clic humano**. Ni la voz, ni el texto, ni el teclado, ni un `click()` sintético lo confirman. Vale 15 minutos y una sola vez. Lo invisible de la cita (bidi, ancho cero) se hace visible.
- **Memoria del producto** por inquilino (`creaMemoria`): cada módulo toca solo las claves que su enchufe declara; tope de 64 KB por recuerdo; almacén inyectado (memoria, archivo con `./almacenes/archivo`, navegador o el servidor del producto).
- **Cuánto pregunta** y **primer arranque**: tres niveles (antes de todo, lo importante, solo lo irreversible); lo irreversible va al freno en los tres. Cada paso de la guía nombra una sola decisión.
- **La ranura de voz**: dictar en el chat, «Escuchar» cada respuesta, el botón **Modo conversación** (estados visibles, `aria-pressed`, atajo `Alt+C`, permiso del micrófono al primer clic, apagarlo lo cierra al instante, no salta el freno) y Ajustes › Voz con «Probar». El motor lo pone el módulo que llena la ranura; el enchufe de motor es el de OpenAI (`/v1/audio/transcriptions`, `/v1/audio/speech`, y `GET /v1/models` para probar una llave sin gastar cuota).
- **Resumen de solo conteos** (`validaResumen`): lo único que un producto puede mandar hacia el cerebro personal. Claves declaradas, enteros y enlaces sin consulta: un texto libre se rechaza.

### Qué no hace

- **No lleva LLM ni elige modelo.** El enrutador es de reglas; un cerebro se inyecta por el routing del template (C8) y, sin medir, se dice «no medido». Nunca usa la suscripción personal de nadie.
- **No llena la voz sola con la nube.** Sin motor local declarado el botón no aparece y la ranura explica por qué; un adaptador de nube (Groq, LemonFox, ElevenLabs, el reconocimiento del navegador) solo cuenta si el producto lo enciende, y **nunca** si guarda datos sensibles de terceros.
- **No toca la lógica de ningún módulo** ni se importa desde el núcleo de una herramienta: un módulo sin la capa sigue funcionando.
- **No es el cerebro personal.** Ningún producto lo lee, y a él solo llegan conteos y enlaces (límite de C5: no firmable).
- **No confirma lo irreversible sin ratón.** Sigue la regla de Arbrain (`esClicHumano`): un Enter a destiempo no manda nada. Sin ratón, lo irreversible no se confirma: es una brecha declarada.
- **No lleva la marca de Arbrain** (ni «Arbrain», ni «Levy», ni sus retratos): cada producto pone la suya.

## Casos de uso

- **Componer un producto nuevo** con piezas del monorepo: una composición en `productos/composiciones/<slug>.json` (módulos, ranuras, memoria, modelo, voz, marca) y el producto ya se usa como los demás: ventana, intención, freno, memoria y primer arranque incluidos.
- **Intercambiar un módulo** (otro calendario, otra voz): se edita la composición; `git diff --stat tools/capa` queda vacío.
- **Una app existente** del template: su layout monta la ventana, su `enchufe.json` dice qué pantallas y qué intenciones son suyas, y «llévame a las etiquetas» la encuentra.
- **La mesa del experto** de Soporte SAP: su ranura de conversación con la marca y el asistente del producto, sin LLM y sin que nada salga de su almacén.

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` (`engines.node`); el núcleo y la interfaz corren también en el navegador.
- **Dependencias del sistema**: ninguna. `zod` 4.6.1 y React `^19` solo para `./react` (peer opcional).
- **CPU, GPU y memoria**: no medido (el núcleo es puro y en memoria; la voz pesa lo que pese el motor del módulo que llena la ranura).
- **Servicios externos**: ninguno. La voz llama al motor que declare el producto (por defecto el servicio local de `tools/dictado`).
- **Variables de entorno**: ninguna.
- **Almacenamiento**: el que se inyecte. En el navegador, `localStorage` con prefijo `capa:<producto>:`; con `./almacenes/archivo`, un JSON que se escribe por temporal y renombre.
- **Salida del perímetro (C4)**: la capa no saca nada de la máquina. Lo que sale lo declara cada enchufe (`sale`) y cada adaptador de voz encendido (`ADAPTADORES_NUBE`, con qué sale y a quién); el producto lo decide en su composición, su contrato y su AISIA.

## Instalar

```bash
npm run empaqueta capa      # construye, prueba el contrato e instala el tarball en un proyecto limpio
```

En el consumidor, la versión va exacta (`"@tu-scope/capa": "0.1.0"`), nunca `^` ni `latest`.

## Uso

```tsx
import { compone } from '@tu-scope/capa'
import { CapaProveedor, Ventana } from '@tu-scope/capa/react'

const r = compone(composicion, enchufes)            // la composición del producto y los enchufes de sus módulos
if (!r.ok) throw new Error(r.problemas.join(' · '))  // lo que no cuadra se dice, no se calla
<CapaProveedor producto={r.producto} inquilino="norte" manejadores={manejadores} voz={moduloDeVoz}>
  <Ventana>{pantallaDelModulo}</Ventana>
</CapaProveedor>
```

## Procedencia y licencia

Lo adoptado de **Arbrain** (Apache-2.0, `https://github.com/arbrain-ai/arbrain`) se lee solo de la etiqueta firmada del lock (`upstream.lock.json`: v0.2.10, `829a9e9`, firma verificada contra `~/.config/arbrain/firmas-permitidas`). Cada pieza adoptada dice en su cabecera de qué archivo y commit sale y qué se cambió; el mapa completo (lo adoptado, lo reimplementado y lo excluido por ser personal o por marca) está en `mapa.json` y `MAPA.md`. La atribución va en `NOTICE` y la licencia de lo adoptado en `LICENSE-FUENTE`. «Arbrain» y «Levy» son marcas de su autor: la licencia no concede su uso, y la capa no las lleva.

Subir de versión es un CDC: `node scripts/capa/pinea.mjs --comprueba` verifica el lock vigente, y la skill de actualización (propuesta) trae cada versión firmada y enseña qué cambió en lo adoptado.
