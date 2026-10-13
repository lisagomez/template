# P-03 · Piloto medido: un producto, un cliente, el costo del dolor antes y después

> El laboratorio deja de elegir productos por intuición: uno sale con un cliente real y vuelve con
> el costo de su dolor medido. Puntuación 18 · solidez 3 (medida) · siguiente paso: `/spec-generator`.

## Usuario

El laboratorio, frente a su primer cliente real, y ese cliente (un despacho, una cadena o una
pyme), que presta su operación y sus datos.

## La tarea que hoy le cuesta

Decidir en qué producto invertir. Hoy ningún producto tiene medido el costo del dolor que promete
resolver (D-01) ni un primer cliente (D-02); tres contratos esperan la firma y dos productos no
tienen contrato (D-03); la app casi no deja uso registrado (D-04); el vendedor de WhatsApp solo
conoce un simulador (D-20); y este analista no puede oír al cliente (D-22).

## Cuánto le cuesta

Para el cliente: **no medido**, ese es el punto. Para la fábrica: cada sesión de construcción sin
señal de demanda cuesta del orden de [C-01] USD.

## Promesa

Un protocolo de piloto que llena las casillas que hoy dicen «pendiente» en cada contrato: costo
actual, primer cliente, métrica principal y firma. Se mide el antes, se opera un mes y se mide el
después con las trayectorias de la línea `aplicacion`. **No hace:** vender. Elige al cliente el
laboratorio.

## Métrica de éxito

Que al cerrar el piloto el contrato del producto tenga el «Costo actual» con cifra y fuente, y que
la línea `aplicacion` de trayectorias pase el mínimo de tres por periodo que hoy no alcanza (D-04).

## Qué se recombina

- `TPL-trayectorias`: la línea `aplicacion`, que ya captura y compara periodos.
- `TPL-analista-producto`: la segunda corrida dice qué dolor se cerró y con qué evidencia.
- `TPL-app-base`: cuentas para el cliente.
- `TPL-feature-laboratorio-pymes`: el patrón de laboratorio con casos y veredictos, que sirve de
  banco antes de abrir al cliente.
- **Falta construir**: el protocolo (consentimiento, qué se mide y cómo se borra) y la primera
  entrevista `/new-app` del producto elegido.

## App o herramienta

Ninguna de las dos: es el método que convierte una hipótesis de producto en contrato firmado.
Cambia el contrato del producto elegido.

## Amenazas (C3)

Un piloto abre la primera superficie a un tercero real. Se hace con lo que ya está gobernado (sin
canal de chat externo sin C3 y C4) y sin `service_role` en lo que vea el cliente.

## Terceros (C4)

El cliente y quienes aparecen en sus datos. El consentimiento y el borrado van antes de la primera
medición, como en el reel.

## Fuera de alcance

Cobrar el piloto, escalar a un segundo cliente (dispara la migración de C7, D-16) y elegir el
producto: lo decide el laboratorio (pregunta 1).

## Siguiente paso

`/spec-generator`, después de que el laboratorio elija producto y cliente: el QUÉ depende de esa
elección.
