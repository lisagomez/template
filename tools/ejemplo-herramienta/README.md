# @tu-scope/ejemplo-herramienta

El andamio que se copia para empaquetar una herramienta propia: pasa el empaquetador en verde y ya trae el
contrato del paquete correcto y este README product first.

## Qué hace

- Convierte un texto en un slug estable para URLs (`aSlug`): sin acentos, en minúsculas, con guiones, recortado a
  `maxLongitud` (80 por defecto) y diciendo si recortó.
- Enseña la forma de una herramienta reusable: el núcleo en TypeScript puro y sin dependencias, y lo que necesita
  React en un punto de entrada aparte (`./react`, `VistaPreviaSlug`), con React como peer opcional.

### Qué no hace

- No es una herramienta de producción: es el ejemplo que se copia. Al copiarlo, este README se reescribe con
  `/readme nuevo tools/<nombre>`.
- No publica nada: publicar es un gate humano.
- No trae React: lo aporta quien use `./react`.

## Casos de uso

- **Quien va a empaquetar algo que ya reusó tres veces o más** copia `tools/ejemplo-herramienta/` y parte de un
  contrato que el empaquetador ya da por bueno (puerta: `docs/CREAR-UNA-HERRAMIENTA.md`).
- **Quien quiere ver qué pasa por pantalla antes de empaquetar lo suyo**: `npm run empaqueta ejemplo-herramienta`
  (§6 de la puerta).
- **Un slug que no se rompa al renombrar**: «camion» y «camión» dan el mismo slug.

## Requerimientos de infraestructura

- **Runtime**: Node `>=20` (`engines`).
- **Dependencias del sistema**: ninguna. React (`^19.0.0`) como peer opcional, solo para `./react`.
- **CPU, GPU y memoria**: no medido.
- **Servicios externos**: ninguno.
- **Variables de entorno**: ninguna.
- **Almacenamiento**: ninguno.
- **Salida del perímetro (C4)**: nada sale: es una función pura.

## Instalar

```bash
npm run empaqueta ejemplo-herramienta   # desde la raíz del repo: contrato + build + tarball + integración
npm install <ruta-a-este-repo>/tools/ejemplo-herramienta/tu-scope-ejemplo-herramienta-0.1.0.tgz
```

## Uso

```ts
import { aSlug } from '@tu-scope/ejemplo-herramienta';

aSlug('Camión rojo'); // { slug: 'camion-rojo', recortado: false }
```

```tsx
import { VistaPreviaSlug } from '@tu-scope/ejemplo-herramienta/react'; // 'use client'
```

## Copiarlo para una herramienta tuya

1. Copia la carpeta a `tools/<nombre>/` y cambia `name`, `version` y `description` del `package.json`.
2. Reescribe este README con `/readme nuevo tools/<nombre>`: qué hace y qué no, casos de uso, requerimientos de
   infraestructura, y después lo demás. Lo que no se sepa queda «pendiente» o «no medido».
3. `npm run revisa:readmes -- tools/<nombre>/README.md` y `npm run empaqueta <nombre>`, los dos en verde. El README
   viaja en el tarball: es lo primero que lee quien la instala.

El contrato técnico del paquete está en `docs/EMPAQUETAR-HERRAMIENTA.md`.
