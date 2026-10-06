# P-04 · Nodo de integración: los gates apagados vuelven a correr

> Lo que hoy se prueba «a mano cuando alguien se acuerda» vuelve a ser puerta. Puntuación 18 ·
> solidez 3 (medida) · siguiente paso: `/prp`.

## Usuario

El laboratorio cuando firma un cambio al ERP, al extractor o a las etiquetas, y quien despliega.

## La tarea que hoy le cuesta

Saber que un cambio al ERP, al servicio del extractor o a la propuesta de etiquetas funciona contra
una base y un motor reales. Hoy esos gates están declarados inactivos porque la máquina del gate no
tiene Docker ni Tesseract (D-07). Al lado viven la deriva de Hermes (D-12), los CLIs con grado
parcial (D-13) y los controles marcados como hechos sin estar construidos (D-14): todo lo que
«parece funcionar» sin que algo lo compruebe.

## Cuánto le cuesta

[C-07] gates declarados inactivos, que **no cuentan como pasados**. El costo de un fallo que esos
gates habrían cazado: no medido.

## Promesa

Un perfil de gate con Docker y Tesseract, en una máquina propia, donde corren juntos los gates del
ERP, el inventario contra el ERP, la prueba efímera de etiquetas y el servicio real del extractor.
**No hace:** meterlos en `validate`, que sigue corriendo donde no hay Docker.

## Métrica de éxito

Gates inactivos por falta de infraestructura: de los que hoy declara el padrón a cero, y el
servicio del extractor con su camino feliz en verde contra el motor real.

## Qué se recombina

- `TPL-manifiesto-gates`: el padrón ya declara qué falta («un perfil de gate con Docker»), y los
  runners existen.
- `TPL-despliegue`: el compose, Caddy y la vigilancia de Hermes.
- `TPL-erp` y `TPL-extractor-documental`: sus pruebas ya escritas, que hoy esperan la máquina.
- **Falta construir**: la máquina (o el perfil en el servidor de despliegue) y el perfil nuevo del
  padrón, que es un CDC.

## App o herramienta

Infraestructura de la fábrica: ni app ni herramienta.

## Amenazas (C3)

Un nodo con Docker que corre pruebas del ERP maneja bases desechables con datos sintéticos.
Ningún dato real entra al nodo.

## Terceros (C4)

Ninguno directo. El beneficio es indirecto: los productos que tocan datos de terceros (ERP,
extractor) se prueban de verdad antes de llegar a ellos.

## Fuera de alcance

Arreglar la deriva de Hermes (mover el pin es un CDC propio) y puntuar los CLIs parciales.

## Siguiente paso

`/prp`: el QUÉ ya lo escribió el padrón en cada `falta:`.
