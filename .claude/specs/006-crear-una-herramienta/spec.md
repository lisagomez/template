# Spec 006 — Crear una herramienta con el boilerplate

> **Reexpresada al protocolo el 2026-08-30.** Derivada de la versión compilada por
> `/goal-compiler` el 2026-08-27 y **aprobada con CDC firmado** (PR #31). El texto exacto
> que se firmó sigue recuperable:
> `git show 461803f:.claude/PRPs/specs/spec-crear-una-herramienta.md`
>
> Se conserva **Libertad técnica**, núcleo del diseño original.
>
> **Estado: CONSTRUIDA.** Ver `plan.md` y `tareas.md`.

## Contexto y objetivo

Este template sirve para dos cosas: **apps** que se despliegan y **herramientas** que se
instalan. La segunda mitad no tenía puerta de entrada. Existía el runbook técnico y existía
el andamio, pero no el documento que convierte a alguien con una idea en dueño de un paquete
instalado y funcionando en otro proyecto suyo.

El objetivo es esa puerta: el documento de referencia para *"tengo una idea de herramienta
reusable, ¿qué digo, qué apruebo, y dónde está el riesgo que no veo?"*.

## Usuarios / actores

- **Alguien que nunca ha publicado un paquete**, que habla en vez de teclear.
- **El agente**, que decide arquitectura y ejecuta.
- **Los otros proyectos** del mismo dueño, que consumirán la herramienta.

## Historias de usuario

- H1: Como dueño quiero terminar con la herramienta instalada y corriendo en otro proyecto
  mío, habiendo entendido las tres decisiones que eran mías, sin teclear un comando.
- H2: Como dueño quiero que me digan **"todavía no"** cuando empaquetar solo me añadiría una
  versión que mantener.
- H3: Como dueño quiero enterarme del riesgo del contrato del paquete antes de publicar, no
  en el proyecto de destino.

## Requisitos funcionales (criterios de aceptación en EARS)

- RF-1: EL SISTEMA se dirigirá a quien **habla**, no a quien teclea: los comandos aparecen
  como lo que el agente ejecutará y cuya salida el lector verá.
- RF-2: SI el documento pide al lector teclear o editar un archivo como vía principal,
  ENTONCES EL SISTEMA lo tratará como mal escrito, aunque el contenido sea correcto.
- RF-3: EL SISTEMA dibujará explícitamente la frontera entre lo que decide el agente
  (arquitectura, qué va en el núcleo, qué tipos exporta) y lo que decide el humano.
- RF-4: EL SISTEMA reservará al humano tres decisiones: si esto debe ser una herramienta, si
  se publica, y quién la consume con qué versión pineada.
- RF-5: CUANDO la misma clase de problema no se haya resuelto **3+ veces**, EL SISTEMA dirá
  que no la empaquete todavía, y explicará por qué eso le ahorra trabajo.
- RF-6: EL SISTEMA nombrará los tres riesgos del contrato: el núcleo que importa React, dos
  Reacts en el mismo árbol, y que `npm link` miente.
- RF-7: EL SISTEMA mantendrá el núcleo sin importar React, Next ni Supabase; lo que los
  necesite va en un entry point aparte con peerDependency opcional.
- RF-8: CUANDO se empaquete, EL SISTEMA probará la integración instalando el tarball en un
  proyecto limpio.
- RF-9: EL SISTEMA tratará publicar como gate humano, nunca como paso de script.
- RF-10: EL SISTEMA exigirá pinear la versión en el consumidor; `latest` y los rangos `^`
  son anti-patrón también para los paquetes propios.
- RF-11: EL SISTEMA delegará el contrato técnico al runbook existente y no lo reescribirá.
- RF-12: SI el documento deja de estar enrutado desde el decision tree, ENTONCES EL SISTEMA
  fallará el gate.

## Requisitos no funcionales

- **Registro Agent-First, innegociable.**
- En español, con el registro de la carpeta de documentación, acentos incluidos.
- No inventar comandos, flags ni rutas: cada uno se verifica contra `--help` o el script
  real antes de escribirlo.
- Secretos: nunca imprimir un valor; presencia enmascarada.

## Libertad técnica *(sección conservada del diseño original)*

Estructura del documento, longitud, orden, ejemplos, tablas o diagramas, y qué herramienta
de prueba se construye para demostrarlo son decisiones de quien ejecuta.

Optimiza por que el lector **termine con la herramienta funcionando y entendiendo lo que
aprobó**, no por cubrir todos los casos ni por parecerse a la documentación de npm.

## Casos límite

- Un documento al que nada apunta es un archivo, no una puerta.
- `npm link` resuelve por symlink y hace funcionar cosas que en una instalación real fallan.
- Un `npm publish` de un martes se convierte en un cambio de comportamiento en tres
  proyectos a la vez, sin diff y sin aprobación.
- Un `unpublish` no borra lo que ya se descargó: publicar es irreversible en la práctica.
- Solape con el runbook: si lo hay, se recorta de UNO de los dos y se dice cuál y por qué.

## Impacto sobre terceros (control C4)

| Parte afectada | Daño con el sistema funcionando bien | Qué lo mitiga |
|---|---|---|
| **Cualquiera que instale el paquete publicado** | Publicar es irreversible en la práctica: un `unpublish` no borra lo ya descargado. Quien lo instaló queda con código que el autor ya no respalda | RF-9: publicar es **gate humano**, nunca un paso de script. La demostración llega hasta el tarball, no al registro |
| Los otros proyectos del mismo dueño | Un `publish` de un martes se convierte en cambio de comportamiento en tres proyectos a la vez, sin diff ni aprobación | RF-10: pineo obligatorio en el consumidor; `latest` y `^` son anti-patrón también aquí |
| Quien instala la herramienta | El paquete funciona en desarrollo por symlink y revienta en una instalación real | RF-8: la prueba instala el tarball en un proyecto limpio, porque `npm link` miente |
| El propio dueño | Empaquetar algo usado una sola vez le añade una versión que mantener a cambio de nada | RF-5: el "todavía no" va arriba y se explica |

**Nota sobre el límite de C5**: mientras la herramienta se quede en proyectos propios, el
riesgo es del dueño y es suyo firmarlo. **En el momento en que se publica a un registro
público**, quien la instala es un tercero que no firmó: por eso publicar es gate humano y no
una decisión que el agente pueda tomar por conveniencia.

## Fuera de alcance

- Publicar a cualquier registro npm. La demostración llega hasta el tarball instalado en un
  proyecto temporal limpio.
- Reescribir el runbook del contrato técnico.
- Dejar basura sin declarar en la carpeta de herramientas.

## Criterios de finalización

El documento existe con sus secciones vertebrales · **la prueba de fuego**: se construye una
herramienta real siguiendo solo el documento y el empaquetado pasa en verde, incluido el
paso de integración real · cero promesas sin ejecutar: cada comando nombrado, con su
evidencia · cableado cerrado con control negativo · CDC redactado **sin auto-aprobarse** ·
lectura en frío que llega al documento sin ayuda.

## Dudas abiertas

- [NECESITA ACLARACIÓN] Que un agente frío **obedezca** el "todavía no" —que diga *espera* a
  un usuario decidido en vez de empaquetar— no tiene caso-trampa que lo mida. Deuda
  declarada en su CDC y no cerrada por la firma.
