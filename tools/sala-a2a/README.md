# @tu-scope/sala-a2a

Una sala donde personas y agentes trabajan en el mismo hilo, y donde **solo una persona** puede aprobar
lo que un agente propone: la aprobación es una fila con su sesión y la huella exacta de lo aprobado.

## Qué hace

- **Canales por tenant** (en Soporte SAP, uno por consultora) con el laboratorio, los consultores y el
  agente; hilos de un solo nivel, impuestos por la base.
- **Aprobaciones que ningún modelo puede fabricar.** Un mensaje del agente ofrece acciones (aprobar,
  rechazar, a revisión) sobre un artefacto con su sha256; la decisión es una fila humana a nombre de la
  sesión (`as restrictive`, `decidida_por = auth.uid()`) y ningún rol de servicio tiene `insert` sobre la
  tabla. Hacen falta los dos cierres.
- **Contenido como dato.** El cuerpo de un mensaje se delimita como dato antes de llegar a un agente; un
  espejo (Slack, Telegram, correo) nunca crea tareas y una mención externa a un departamento se ignora
  con aviso.
- **Presupuesto fail-closed** antes de cada llamada a un modelo, con aviso al 80 %.
- **Una suite que se pone roja cuando debe**: cada comprobación es de conducta o de estructura, y cada
  sabotaje (S1–S7, incluido «darle al chat permiso de aprobar») la tumba.

### Qué no hace

- No es un chat 1:1 con el agente: esa conversación es otra superficie (el chat del HIL de Soporte SAP),
  que promueve a la sala lo que pide aprobación y no aprueba.
- No ejecuta nada: dice si hay una aprobación humana para una tarea y un artefacto; ejecutar es de quien
  la consulta.
- No expone más que `{card, rpc, health}`; publicarla a un tercero es gate humano (C3 + C4).

## Casos de uso

- **Aprobar el plan de un agente** con la certeza de que lo aprobado es exactamente lo que se aplicará (la
  huella viaja con la aprobación).
- **Mandar a revisión con motivo**: el agente corrige y vuelve a proponer en el mismo hilo, con otra huella.
- **Consultoras distintas en la misma sala**: cada tenant ve solo su canal (RLS, también para Realtime).

## Requerimientos de infraestructura

- **Runtime**: Node `>=22.18` (`engines`).
- **Dependencias del sistema**: ninguna para el núcleo; las pruebas usan PGlite (Postgres efímero en
  proceso).
- **CPU, GPU y memoria**: no medido (el núcleo es en memoria y sin modelo).
- **Servicios externos**: en producción, Postgres con Supabase Auth (Realtime para la entrega); en el
  laboratorio, ninguno.
- **Variables de entorno**: ninguna.
- **Almacenamiento**: tablas `sala_*` con RLS forzada (`migraciones/propuesta-sala-a2a.sql`, propuesta no
  aplicada).
- **Salida del perímetro (C4)**: ninguna desde la sala; lo que un agente haga con un mensaje lo decide su
  propia superficie, con el mensaje delimitado como dato.

## Estado

Laboratorio (`blueprint`): 18 pruebas, la suite S1–S9 en verde y cada sabotaje en rojo. Alineada con
`SPEC-sala-a2a` r2 de hermes-os-a2a (e122f54), llevada al stack de este monorepo.

## Cómo está hecho

- `src/sala.ts`: canales, participantes, publicación (hilos de un nivel, autor coherente, departamento
  solo de agente), `registraAprobacion` (solo un principal humano, a su nombre) y `aprobado` (la única
  llave que desbloquea).
- `src/presupuesto.ts`: la guardia fail-closed; `src/tarjeta.ts`: rutas y fronteras de la Agent Card.
- `pruebas/_suite.ts` y `pruebas/sabotajes.ts`: conducta + estructura, y la prueba de que cada sabotaje cae.
