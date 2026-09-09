# @tu-scope/extractor-documental

Carga masiva de documentos (PDF, imagenes, carpetas), revision humana de lo extraido, y mapeo
contra los catalogos que el proyecto **ya tiene**.

> **Estado: nucleo construido, herramienta incompleta.** Existen el nucleo puro y el manifiesto del
> plugin, con 46 pruebas en verde. **No existen todavia** los entry points de React, los adaptadores
> de OCR ni el de persistencia. Ver `.claude/specs/007-extractor-documental/tareas.md`.

## La regla que ordena todo

El nucleo **no importa nada**: ni React, ni Next, ni Supabase, ni ningun proveedor de OCR. Eso es
lo que lo hace instalable en cualquier proyecto. Lo que necesite React ira en un entry point
aparte, detras de un `peerDependency` opcional. Hay una prueba que lo vigila (`pruebas/contrato.ts`).

## Entry points

| Subpath | Estado | Que es |
|---|---|---|
| `.` | **construido** | Nucleo: tipos, puertos, maquina de estados, clasificacion, plantilla, esquema, reconciliacion |
| `./plugin` | **construido** | Manifiesto con icono SVG en linea. Importable sin React |
| `./react` | pendiente | `ZonaDeIngesta`, `TablaDeRevision`, `EditorDeCampo` |
| `./react/lienzo` | pendiente | Lienzo de modelado tipo Power BI |
| `./motores/*` | pendiente | Adaptadores de `MotorOcr` |
| `./almacenes/supabase` | pendiente | Adaptador de persistencia con RLS |

## Los cuatro puertos

Interfaces, sin implementacion. Es lo que deja que cada proyecto decida si el documento sale de su
perimetro (control C4) en vez de venir cocido aqui.

```
MotorOcr           extrae(documento, opciones) -> PaginaExtraida[]
AlmacenDocumentos  guarda / lee / lista
AlmacenPlantillas  guarda / lee la plantilla por defecto
EsquemaExistente   describe() -> DescriptorDeEsquema
```

`EsquemaExistente` **no consulta nada** por defecto: devuelve el descriptor que el integrador
declaro. No hay via sin privilegio para introspeccionar un esquema de Supabase (el OpenAPI por
anon key esta bloqueado y la introspeccion GraphQL viene desactivada), y exigir una clave secreta
ampliaria el privilegio en todo proyecto consumidor.

## El descriptor de esquema

Un proyecto sin catalogos **no es un caso especial**: es `tablas: []`, y recorre el mismo codigo
que uno poblado. Hay una prueba que lo demuestra pasando los dos fixtures por las mismas
funciones, porque en cuanto existan dos caminos, uno se queda roto y es el que nadie mira.

```ts
import { validaDescriptor, catalogos, detectaDesalineacion } from '@tu-scope/extractor-documental'

const declarado = JSON.parse(await leerMiDescriptor())
if (!validaDescriptor(declarado).ok) { /* ... */ }
```

## Reconciliar valores contra un catalogo

Lo dificil no es mapear el campo a la columna: es resolver que `"ACME S.A. de C.V."` **es la fila
1874** y no una nueva.

```ts
import { resuelveValor } from '@tu-scope/extractor-documental'

const r = resuelveValor('ACME SA', filasDeProveedores, {
  umbral: 0.6,              // OBLIGATORIO: no hay default defendible sin medirlo
  margenDeAmbiguedad: 0.08,
})
// r.estado: 'resuelto' | 'ambiguo' | 'sin_resolver'
// r.elegida es null salvo en 'resuelto'. Nunca se ofrece "el mejor" en los otros dos.
```

El umbral es un parametro obligatorio a proposito. Un default inventado falla en las dos
direcciones: llena la cola de revision de falsos ambiguos, o deja pasar duplicados.

## Pruebas

```bash
npm run prueba   # construye dist/ y prueba CONTRA EL, sin red, sin base de datos, sin navegador
```

Las pruebas importan de `../dist/`, no de `../src/`: se prueba lo que se publica, que es la
convencion de `tools/voz`. Las fuentes importan con extension `.js` aunque los archivos sean `.ts`
— `tsc` las resuelve, y usar `.ts` ahi hace imposible emitir `dist/`.
