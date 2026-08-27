# Crear una herramienta

Este template hace dos cosas distintas. Una ya la conoces: **una app** — un sitio que se
despliega, con su servidor, su dominio y su base de datos. La otra es esta: **una
herramienta** — un paquete que se instala *dentro de tus otros proyectos*.

Si llegaste aquí es porque algo que construiste una vez lo quieres volver a usar sin
copiarlo y pegarlo. Este documento es la puerta de entrada: **qué dices, qué apruebas tú, y
dónde está el riesgo que no se ve**.

> **No vas a teclear nada.** Los comandos que aparecen aquí son los que el agente ejecutará
> delante de ti. Están en el documento para que reconozcas lo que pasa por pantalla y sepas
> leer el resultado — no para que los copies.

---

## 1. Antes de nada: puede que todavía no la necesites

Empaquetar tiene un coste permanente: una versión que mantener, un contrato que no romper y
un sitio más donde arreglar un bug. Ese coste se paga solo cuando hay reúso **real**, no
cuando lo intuyes.

| Lo que te está pasando | Qué es en realidad | Qué hacer |
|---|---|---|
| Resolviste la misma clase de problema **3 o más veces** en proyectos distintos | Reúso real, ya demostrado | Herramienta. Sigue leyendo |
| Lo usas en **un** proyecto y crees que quizá en otro | Una carpeta con pasos extra | Déjalo dentro del proyecto. Vuelve cuando ocurra la tercera vez |
| Quieres separarlo para "tenerlo ordenado" | Una decisión de estructura, no de empaquetado | `src/features/` o `src/shared/` ya te dan eso, gratis |
| Quieres que **otra persona** lo instale | Reúso real aunque solo haya un proyecto | Herramienta, y lee con atención la sección 4 |

Si estás en la segunda o tercera fila, dile al agente que lo deje donde está. Que te sepa
decir *"todavía no"* es parte de por qué existe esta puerta.

---

## 2. Cómo se hace: se lo dices

En lenguaje normal, describiendo **qué tiene que hacer la herramienta y quién la va a
usar**. Por ejemplo:

> «Quiero convertir el validador de facturas en algo que pueda instalar en mis otros dos
> proyectos.»

> «Esto de generar slugs lo he reescrito tres veces. Hazlo una herramienta.»

> «Necesito un paquete con la lógica de reintentos, y que traiga también el componente que
> muestra el estado.»

**Lo que no hace falta que digas** — y es mejor que no lo digas, porque le pone techo a algo
que el agente resuelve mejor: cómo se llaman los archivos, cómo se parte el código entre
núcleo y componentes, qué campos lleva el `package.json`, qué versión de TypeScript, o si
debe usar tal o cual librería.

**Lo que sí conviene que digas**, porque solo tú lo sabes: en qué proyectos tuyos va a
acabar instalada, si alguno de ellos es viejo o usa una versión distinta de React, y si
la herramienta va a tocar datos de personas.

---

## 3. Quién decide qué

La frontera importa, porque las decisiones de la derecha no las puede tomar nadie más que tú.

| Lo decide **el agente** | Lo decides **tú** |
|---|---|
| La arquitectura y cómo se parte el código | **Si esto debe ser una herramienta** (sección 1) |
| Qué va en el núcleo y qué en un punto de entrada aparte | **Si se publica**, y dónde |
| El contenido del `package.json`: `exports`, `files`, tipos | **Quién la consume** y con qué versión exacta |
| Qué exporta, cómo se llama cada cosa, los tipos | Si el nombre y el alcance son los correctos |
| Correr el empaquetador y arreglar lo que salga rojo | Aprobar lo irreversible |

---

## 4. Los tres momentos en que el agente se detiene a preguntarte

No son burocracia: son los tres sitios donde una decisión equivocada no se puede deshacer
sola.

**1. La forma.** Antes de construir, el agente te dirá qué va a ir en el núcleo y qué en un
punto de entrada aparte, y cómo se va a llamar. Es el momento barato de decir "eso no es lo
que quiero": después, cambiar la forma de lo que exporta un paquete ya instalado es una
versión mayor.

**2. La publicación.** El agente **nunca publica por su cuenta**. Publicar es irreversible
en la práctica: un `unpublish` no borra lo que ya se descargó, y a partir de ese momento
hay gente —tú, dentro de seis meses, incluido— dependiendo de lo que subiste. Antes de
publicar, la herramienta ya se puede instalar y usar en tus proyectos (sección 6): la
publicación es para cuando quieras que la instale alguien más.

**3. El pineo.** Cuando la herramienta entre en otro proyecto tuyo, la versión se escribe
**exacta**: `0.3.1`. No `^0.3.1`, y nunca `latest`. Con un rango, una publicación tuya de un
martes se convierte en un cambio de comportamiento en tres proyectos a la vez, sin que nadie
haya revisado un diff ni aprobado nada. Es la misma regla que protege el modelo de la
fábrica (control C1), aplicada a tus propios paquetes.

---

## 5. Dónde está el riesgo (no está donde crees)

El riesgo no está en tu código. Tu código lo pruebas, lo lees y lo entiendes. Lo que falla
es **el contrato del paquete**: cómo se declara, cómo se instala y qué recibe el otro
proyecto. Y falla **en el proyecto de destino**, que es el peor sitio para enterarse, porque
allí el error casi nunca menciona a tu paquete.

Tres cosas muerden, siempre las mismas:

**El núcleo que importa React.** Si el corazón de la herramienta necesita React, Next o
Supabase para funcionar, no es una herramienta: es un trozo de una app concreta con otro
nombre, y solo encajará en proyectos idénticos al de origen. El núcleo va en TypeScript
puro; lo que necesite React vive aparte y solo lo carga quien lo pida.

**Dos Reacts en el mismo árbol.** Si el paquete se lleva su propia copia de React dentro, el
proyecto de destino acaba con dos, y los hooks empiezan a fallar de una forma que se lleva
una tarde entera de depuración sin pistas. Por eso React se declara como algo que **aporta
el consumidor**, no como algo que el paquete trae.

**Que "funciona en mi máquina" sea un espejismo.** Hay un atajo clásico para probar un
paquete sin publicarlo (`npm link`) que **miente**: resuelve por enlaces simbólicos y hace
funcionar cosas que en una instalación de verdad fallan. Por eso el agente no lo usa: instala
el paquete real, empaquetado, en un proyecto limpio. Ahí "es compatible" deja de ser una
opinión.

---

## 6. Qué vas a ver pasar

Cuando la herramienta esté escrita, el agente corre el empaquetador. Puedes verlo ahora
mismo con el andamio que ya viene en el template:

```bash
npm run empaqueta ejemplo-herramienta
```

```
Herramienta: @tu-scope/ejemplo-herramienta@0.1.0  (tools/ejemplo-herramienta)
✓ contrato del package.json
✓ build (8 archivos en dist/)
✓ 'use client' conservada en react.js
✓ tarball (9 archivos) ./tools/ejemplo-herramienta/tu-scope-ejemplo-herramienta-0.1.0.tgz
✓ integracion: instalado e importado en un proyecto limpio
  exporta: aSlug
✓ tipos incluidos (2 .d.ts)

✓ Empaquetada y probada. Para integrarla en otro proyecto:
    npm install <ruta-a-este-repo>/tools/ejemplo-herramienta/tu-scope-ejemplo-herramienta-0.1.0.tgz
```

La línea que importa es **`integracion`**: el empaquetador creó un proyecto vacío de verdad,
instaló ahí el paquete e importó su API. Las otras comprobaciones las puede tener en verde
un paquete que luego no se instala; esa no.

Con eso ya puedes usar la herramienta en otro proyecto tuyo **sin publicar nada**: se
instala desde el archivo empaquetado. Publicar viene después, y solo si hace falta.

---

## 7. Cuando sale en rojo

El empaquetador no dice "falló": dice qué se rompería en el proyecto de destino. Los avisos
que más vas a ver, traducidos:

| Lo que dice | Lo que significa para ti |
|---|---|
| `exports` no declara `types` | Quien la instale pierde el autocompletado y la verificación de tipos, **en silencio**. Nadie se queja; simplemente deja de haber red |
| `files` no incluye "dist" | El paquete saldría sin lo construido. Se instala y no hay nada dentro |
| `react` está en dependencies y debe ser peerDependency | Es el bug de los dos Reacts de la sección 5, antes de que ocurra |
| la directiva 'use client' se perdió en el build | El componente reventaría en el servidor del proyecto de destino, con un error que no menciona tu paquete |
| la prueba de integración falló | El paquete **no es consumible tal cual**. Es el aviso más valioso de todos: llegó aquí y no a tu otro proyecto |

Ninguno de estos hay que arreglarlo a mano. Se los enseñas al agente —o simplemente le dices
que salió en rojo— y los cierra.

---

## 8. Lo que este documento no cubre

El **contrato técnico** —los campos exactos del `package.json`, cómo se declara la
compatibilidad, cómo se versiona, qué hace y qué no hace el empaquetador— vive en
**[`EMPAQUETAR-HERRAMIENTA.md`](EMPAQUETAR-HERRAMIENTA.md)**. Es el documento del agente;
está ahí para cuando quieras mirar por encima del hombro, no porque tengas que leerlo.

Si lo que quieres construir es una app y no una herramienta, la puerta es otra:
**[`DEPLOY-HETZNER.md`](DEPLOY-HETZNER.md)**.
