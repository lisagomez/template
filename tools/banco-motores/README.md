# Banco de motores

Declaras una función con su esquema Zod y salen solas su pantalla de bloques etiquetados y su ruta API.
La idea de Gradio, sin Gradio.

## Qué hace (y qué no)

- Convierte un esquema Zod en la lista de **bloques** que pinta la pantalla (texto, número, opción,
  booleano, imagen, audio, archivo, lista, tabla, objeto), pasando por `z.toJSONSchema`.
- **Ejecuta** una función con dos barreras: valida la entrada antes de tocar el motor y la salida
  después. Lo que el motor devuelva fuera de su esquema se rechaza y su valor crudo no viaja.
- Da la **ruta API** con el mismo esquema (`creaApi`): web estándar, `Request` → `Response`, y cerrada por
  defecto (`habilitado()` falso → 404).
- Trae la forma común de un **caso de laboratorio** ya corrido y un **generador de datos de peor caso**
  determinista y sintético, con su CLI.

No hace: pintar la pantalla (eso es de la app que lo consume: `src/features/banco`), alojar motores, abrir
enlaces públicos, mandar analítica ni hablar con un LLM. No es un clon de Gradio: toma el 20 % que el repo
usa (función, componentes, API, ejemplos y progreso).

## Casos de uso

- **Probar un motor local con datos sintéticos** antes de que llegue a un producto: OCR de una factura
  inventada, interpretar un código GS1, por el mismo adaptador que usa producción.
- **Dar pantalla y API a un motor que no las tenía** escribiendo solo su esquema y su `ejecuta`.
- **Probar una interfaz con datos extremos**: nombres de 50 letras, árabe, cifras de 13 dígitos, listas
  vacías (`peorCaso`).
- **Pintar los casos de un laboratorio** con una sola tarjeta (`CasoCorridoVisible`).

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18`. El núcleo también corre en el navegador y en un Worker: no importa Node.
- **Dependencias del sistema**: ninguna para el núcleo. Los motores que registre quien lo consuma traen
  las suyas (en este repo, Tesseract para el OCR).
- **CPU, GPU y memoria**: no medido para el núcleo. El OCR de una factura sintética con Tesseract 5.5.0 por
  el adaptador de proceso tardó 617 ms en esta máquina (2026-11-02).
- **Servicios externos**: ninguno.
- **Variables de entorno**: ninguna en el núcleo. Quien lo consume decide cuándo está habilitado (en este
  repo, `BANCO_LABORATORIO`).
- **Almacenamiento**: ninguno. No guarda entradas ni salidas.
- **Salida del perímetro (C4)**: el núcleo no saca nada de la máquina. Lo que sale depende del motor que se
  registre; los del repo corren en local.

## Uso

```ts
import { z } from 'zod'
import { creaApi, defineFuncion, describeFuncion } from '@tu-scope/banco-motores'

const eco = defineFuncion({
  id: 'eco', titulo: 'Eco', descripcion: 'Devuelve el texto en mayúsculas.', motor: 'función pura',
  entrada: z.object({ texto: z.string().min(1).meta({ title: 'Texto' }) }),
  salida: z.object({ resultado: z.string() }),
  ejemplos: [{ id: 'hola', titulo: 'Hola', entrada: { texto: 'hola' }, sintetico: true }],
  async ejecuta({ texto }) { return { resultado: texto.toUpperCase() } },
})

const api = creaApi([eco], { habilitado: () => process.env.BANCO_LABORATORIO === '1' })
// GET  → api.lista()                 descriptores con bloques, ejemplos y JSON Schema
// POST → api.ejecuta(request, 'eco')  200 · 422 entrada · 502 motor · 500 salida · 499 cancelada
```

Peor caso por CLI: `node tools/banco-motores/dist/cli/peor-caso.js nombres --semilla 25`.

## Pruebas

`npm run prueba` dentro de la herramienta (y dentro de `npm run prueba:tools`). Incluyen dos siembras: un
motor que devuelve basura no llega a la pantalla, y el núcleo no importa React, Next ni Node.

## Estado

0.1.0, de laboratorio. No se empaqueta ni se publica todavía: tiene un solo consumidor (`src/features/banco`).
