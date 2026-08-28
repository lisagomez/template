---
name: crear-herramienta
description: "Convierte algo que ya reusaste en una herramienta empaquetada e instalable en tus otros proyectos (tools/ + npm run empaqueta); empieza decidiendo si TODAVIA NO toca. Activar cuando el usuario dice: quiero hacer una herramienta, libreria, paquete reutilizable, reusar esto en otros proyectos, esto lo he escrito tres veces, publicar en npm, empaquetar esto. NO: desplegar una app, features de este proyecto (prp), imprimir un CLI (imprenta)."
---

# Crear una herramienta

> La puerta completa es **`docs/CREAR-UNA-HERRAMIENTA.md`**. **Leela antes de actuar** y
> apoyate en ella: este skill es el orden de ejecucion, no una copia. El contrato tecnico
> vive en `docs/EMPAQUETAR-HERRAMIENTA.md` y no se duplica aqui.

El humano describe **que hace la herramienta y quien la va a usar**. Todo lo demas lo
decides tu. No le pidas que teclee nada ni que edite un archivo.

## 1. Primero: puede que TODAVIA NO toque

**Esta es la pregunta de apertura, no un tramite.** Empaquetar cuesta para siempre: una
version que mantener, un contrato que no romper y un sitio mas donde arreglar un bug.

Pregunta **en cuantos proyectos distintos ya resolvio esta misma clase de problema**:

- **3 o mas veces**, o **lo va a instalar otra persona** → reuso real. Adelante.
- **Uno, y "quiza en otro"** → di **"todavia no"** y proponle dejarlo donde esta. Vuelve
  cuando ocurra la tercera vez.
- **"Para tenerlo ordenado"** → eso es estructura, no empaquetado: `src/features/` o
  `src/shared/` ya se lo dan gratis.

Saber decir *todavia no* es la razon de existir de esta puerta. No la saltes porque el
usuario suene decidido.

## 2. Lo unico que hace falta preguntarle

Solo el sabe tres cosas: **en que proyectos suyos** va a acabar instalada, si alguno usa
una **version distinta de React**, y si la herramienta va a **tocar datos de personas**
(si los toca, es decision de flujo de datos: control C4, no un detalle de implementacion).

Lo que NO le preguntas, porque le pone techo a lo que tu resuelves mejor: nombres de
archivos, particion del codigo, campos del `package.json`, o que libreria usar.

## 3. Los tres momentos en que te detienes

1. **La forma** — antes de construir, enseñale que va en el nucleo y que en un punto de
   entrada aparte, y como se llama. Cambiar eso despues es una version mayor.
2. **La publicacion** — **nunca publicas por tu cuenta**. Es irreversible en la practica.
   Y antes de publicar la herramienta ya se instala y se usa desde el tarball: publicar es
   solo para que la instale alguien mas.
3. **El pineo** — al entrar en otro proyecto, la version se escribe **exacta** (`0.3.1`).
   Nunca `^0.3.1`, nunca `latest`: con un rango, una publicacion tuya de un martes cambia
   el comportamiento de tres proyectos sin diff y sin aprobacion (misma regla que C1).

## 4. Construir

Vive en `tools/<nombre>/`. **El nucleo no importa React, Next ni Supabase**: si lo
necesita para funcionar no es una herramienta, es un trozo de una app con otro nombre. Lo
que necesite React va en un entry point aparte, con React como **peerDependency** — dos
Reacts en el mismo arbol rompen los hooks de una forma que se lleva una tarde entera.

**`npm link` no se usa: miente.** Resuelve por enlaces simbolicos y da por bueno lo que en
una instalacion real falla.

## 5. Empaquetar y probar

```bash
npm run empaqueta <nombre>                 # incluye la prueba de integracion real
npm run empaqueta <nombre> -- --en <ruta>  # ademas, contra su proyecto de destino real
```

La linea que importa es **`integracion`**: instala el paquete en un proyecto limpio y lo
importa. Las demas comprobaciones las puede tener en verde un paquete que luego no se
instala; esa no. Si el usuario nombro proyectos de destino en el paso 2, usa `--en` contra
uno: ahi npm dictamina los peers contra el arbol real.

## 6. Si sale en rojo

El empaquetador no dice "fallo": dice **que se romperia en el proyecto de destino**
(`types` sin declarar, `dist` fuera de `files`, React en `dependencies`, `'use client'`
perdida, integracion fallida). La tabla traducida esta en la seccion 7 de la puerta.
**Lo cierras tu.** No se lo pasas al usuario para que lo arregle.

## Que NO hace este skill

Desplegar una app (eso es `docs/DEPLOY-HETZNER.md`), crear features dentro de este
proyecto (`/prp`), ni imprimir un CLI contra una API de terceros (la imprenta, otra
escalera y otro CDC).
