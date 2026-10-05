# Soporte SAP · la app

La pantalla de cada nivel del servicio: el cliente levanta y ve su servicio, el consultor atiende con SLA,
horas y accionables, y el laboratorio decide en la sala y conversa con el agente. Hoy corre como
laboratorio en `/soporte-sap`.

## Qué hace

- **N3 · cliente**: levanta incidencias con adjuntos y ve la evidencia que se leyó de cada uno (campo,
  valor y de dónde salió, todo por revisar), su prioridad con la razón, el reloj de SLA, su tablero, su
  contrato con las metas y sus fuentes, los accionables en MXN para él y un FODA donde cada punto cita su
  dato.
- **N2 · consultor**: la bandeja de su consultora con la categorización y la traza, el reloj que pausa con
  la espera del cliente y reanuda con su respuesta, el SLA y las horas, el tablero por cliente con su etapa
  del ciclo de vida, los accionables y la sala de su consultora.
- **N1 · superadministrador y experto**: la sala (decide una persona: aprobar, rechazar o a revisión con
  motivo), el chat con el agente (métrica con su definición, regla con su cita o «no lo sé»), el sandbox
  anonimizado, las propuestas de regla y de CLI, y los agregados del corte semántico.

### Qué no hace

- No calcula números en el navegador: cada métrica viene del corte semántico con su fuente, y una prueba
  falla si un componente agrega por su cuenta.
- No deja al laboratorio leer la operación de un cliente que no se le escaló, ni los adjuntos originales.
- No aprueba desde el chat, ni corre sin `SOPORTE_SAP_LABORATORIO=1` (y `configura:deploy` rechaza esa
  variable en producción).

## Casos de uso

- **El recorrido completo en laboratorio**: un cliente sube la captura del error y el CFDI, el agente
  categoriza y prepara el plan, el supervisor lo verifica, el superadministrador lo aprueba en la sala y el
  simulador muestra el antes y el después (`pruebas/recorrido.mjs`, 17 capturas).
- **La demo comercial por rol**: el mismo dato visto por el cliente, la consultora y el laboratorio, con el
  mismo número.
- **Enseñar un caso nuevo**: el experto conversa en el chat y quedan una propuesta de regla y otra de CLI.

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` y Next.js del monorepo (la página es dinámica; la API corre en `nodejs`).
- **Dependencias del sistema**: Tesseract local (`spa`) y Python 3 para leer imágenes; sin ellos, la imagen
  se guarda sin extracción y la pantalla lo dice.
- **CPU, GPU y memoria**: no medido para la app; el dominio, en `tools/soporte-sap` (SDD §14).
- **Servicios externos**: ninguno en el laboratorio (estado en memoria). En producción, Supabase con la
  propuesta de esquema aplicada y la identidad de `auth.uid()`.
- **Variables de entorno**: `SOPORTE_SAP_LABORATORIO`, `TESSERACT_CMD`, `TESSDATA_PREFIX`, `LD_LIBRARY_PATH`.
- **Almacenamiento**: en el laboratorio, memoria del proceso (se reinicia desde la pantalla). En
  producción, las tablas y buckets de `tools/soporte-sap`.
- **Salida del perímetro (C4)**: ninguna: los adjuntos se leen en el servidor con el motor local y no hay
  modelo.

## Cómo está hecho

| Pieza | Archivo |
|---|---|
| Página y API | `src/app/(main)/soporte-sap/page.tsx`, `src/app/api/soporte-sap/route.ts` (Zod en la entrada) |
| Runtime de laboratorio (compone las herramientas) | `services/runtime.ts` |
| Lo que ve cada nivel | `services/vistas.ts`, `services/tipos.ts` |
| Interfaz en bento | `components/` (sin aritmética: formatea con el locale) |
| Recorrido de punta a punta | `pruebas/recorrido.mjs` (Playwright, capturas y errores de consola) |
| Contrato de negocio | `BUSINESS_LOGIC.md` |
