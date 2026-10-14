# Laboratorio del sistema integrado (`/laboratorio-sgi`)

Aquí se prueba, con casos reales y trampas, qué parte del sistema integrado ISO puede usar la app y cuál todavía no.

## Qué hace

- **Corre los casos deterministas cada vez**: catálogo, motor, documentos, salvaguardas, orquestador y la base (RLS
  y la igualdad de la base con el motor, medidas contra la Supabase local). Son 33 casos.
- **Verifica las corridas reales de los agentes**: 46 casos, de 5 a 6 por agente, contra el modelo pineado por
  routing y con datos sintéticos. Las corridas las graba `npm run sgi:agentes` y se revisan con reglas fijas: IDs que
  existen, sin promesas de certificación, documento no genérico, instrucción escondida detectada, datos personales
  minimizados.
- **Cubre las 10 trampas del spec**. Las que dependen del modelo se corren contra el modelo de verdad.
- **Aprueba por pieza con los resultados**: con 5 casos o más y todos en «pasa». Nunca con una lista escrita a mano.

### Qué no hace

- **No simula respuestas del modelo.** Sin corrida grabada, el caso es «no medido», se ve así y no aprueba nada.
- **No gasta de más**: el corredor se detiene antes del tope (US$15 en este goal) y avisa al 80 %.

## Casos de uso

- **El laboratorio decide si firma el CDC** de los prompts y del routing: mira aquí qué pasa, qué falla y cuánto
  costó.
- **Quien cambia un prompt** vuelve a correr `npm run sgi:agentes -- --rehace` y compara.

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18`.
- **Dependencias del sistema**: la Supabase local solo para volver a medir la base (`npm run sgi:rls`). Los casos
  deterministas no la necesitan: leen `public/laboratorio-sgi/rls.json`.
- **CPU, GPU y memoria**: no medido.
- **Servicios externos**: el proveedor de modelos, solo al correr `npm run sgi:agentes`.
- **Variables de entorno**: `OPENROUTER_API_KEY`, solo para `sgi:agentes`, que también la busca en el `.env.local`
  del checkout principal sin imprimirla. `SGI_EXIGE_CORRIDAS` (encendida) hace que un «no medido» cuente como falla.
- **Almacenamiento**: `public/laboratorio-sgi/corridas.json` y `rls.json`, versionados. Son datos sintéticos, sin
  secretos.
- **Salida del perímetro (C4)**: solo los perfiles sintéticos de `datos/perfiles.ts`, hacia el proveedor del
  modelo.

## Pruebas

`npm run prueba:laboratorio-sgi`: exige 5 casos o más por pieza, las 10 trampas cubiertas y ningún caso en «falla».
Imprime la tabla completa y lo no medido.
