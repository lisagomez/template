# Firmar un CDC: lo que hace el agente y lo que no

Aprendido el 2026-11-03, al firmar los CDC de #294 y #295. La firma la escribe el laboratorio y el agente prepara la
propuesta fuera del registro; eso ya está en `.claude/rules/aprendizajes-gobernanza.md`. Aquí va lo que se sumó.

- **La capa B no la corre el agente que hizo el cambio.** `npm run regresion -- --trampa` decodifica e imprime las
  expectativas, y corrido en esa sesión, o con `!` dentro de ella, las deja en su contexto. Va en una terminal aparte y
  cada caso en una sesión `claude` nueva. Su verde solo dice que el corpus está completo (desde #295 lo dice así): no
  es la capa B corrida. **Por qué:** una capa B que conoce las respuestas no mide nada, y un verde mal leído se firma
  como evidencia. Al pedir una firma, decirlo otra vez.
- **Simulacro de la firma antes de pedirla:** `revisaFirmas` (de `scripts/lib/firmas.mjs`) sobre la bitácora más la
  propuesta, en memoria y sin escribir nada, en tres casos: sin firma, firmada sin marcar y marcada y firmada. Así salió
  el hueco de la 6b que arregló #295.
- **Ningún `☐` en la prosa de la propuesta:** el `sed` que marca las casillas lo cambia y le da la vuelta al sentido.
  Contar antes que solo queden las casillas.
- **Dos CDC en ramas distintas chocan al final de la bitácora:** se firma el segundo después de mergear el primero y de
  traer `main` a su rama.
