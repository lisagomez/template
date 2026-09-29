# «Nombre de la feature» (`/«ruta»`)

«Una línea: qué resuelve y para quién, en palabras de quien la usa.» Este README es el molde: al copiar `.template`
se rellena con `/readme nuevo src/features/<nombre>`, y `npm run revisa:readmes` lo vigila.

## Qué hace

- «Capacidad dicha como resultado para quien la usa, no como componente.»

### Qué no hace

- «Límite deliberado y su porqué. Si no hay, se dice.»

## Casos de uso

- **«Quién»**, cuando «situación»: «qué obtiene». *(pendiente hasta que el código, el SDD o el laboratorio lo sostengan)*

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` (`engines` del template) y la app Next.js.
- **Dependencias del sistema**: pendiente («ninguna» si no hay).
- **CPU, GPU y memoria**: no medido.
- **Servicios externos**: pendiente (Supabase, si guarda en la base).
- **Variables de entorno**: pendiente (solo los nombres, jamás un valor).
- **Almacenamiento**: pendiente.
- **Salida del perímetro (C4)**: pendiente (si algún dato sale de la máquina, qué, a quién y la decisión C4).

## Estructura

Esta es la estructura estándar para cada feature en el proyecto.

```
features/[nombre-feature]/
├── components/      # Componentes React específicos de la feature
├── hooks/           # Custom hooks específicos de la feature
├── services/        # API calls y lógica de negocio
├── types/           # TypeScript types/interfaces específicos
└── store/           # Estado local de la feature (Zustand)
```

## Ejemplo de uso

Para crear una nueva feature llamada `dashboard`:

```bash
cp -r src/features/.template src/features/dashboard
```

## Principios

1. **Autocontenido**: Todo lo relacionado con la feature vive aquí
2. **Colocalización**: Componentes, hooks, types juntos
3. **No dependencias circulares**: Features no deben importar de otras features
4. **Usar shared/**: Para código reutilizable entre features

## Ejemplo: Feature "auth"

```
features/auth/
├── components/
│   ├── LoginForm.tsx
│   └── SignupForm.tsx
├── hooks/
│   ├── useAuth.ts
│   └── useSession.ts
├── services/
│   └── authService.ts
├── types/
│   ├── User.ts
│   └── Session.ts
└── store/
    └── authStore.ts
```
