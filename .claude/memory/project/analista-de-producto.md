# Analista de producto: en qué quedamos

**Añadido:** 2026-10-06 · **Estado:** construido el 2026-10-02 en la rama `paintpoints`, mergeada en `main` por el
**PR #214** (2026-10-06). CDC **firmado** el 2026-10-05 («capa A basta», en la bitácora).

`/analista-producto` lee el repo entero y responde dónde duele y qué producto lo resolvería, con cada dolor
citado. Diseño: `docs/SDD-analista-producto.md`; plan: `.claude/PRPs/PRP-008-analista-producto.md`.

## Decisiones que no se deducen del código

- **Contrato A2A sin servir.** La Card y las transiciones existen y se tipan con el SDK, pero ninguna ruta
  de `src/app` las expone. Servirlo sería otra superficie de entrada: pide su C3.
- **Una corrida es una foto.** `prueba:analista` la verifica contra **su** commit, no contra el árbol de
  hoy: si se cambia lo que una corrida citó, la corrida vieja sigue verde y la siguiente lo ve.
- **El gate va aplicado, no propuesto** (desviación del goal, declarada en la bitácora): `verifica:gates`
  pone en rojo un `prueba-*` que ningún gate corre, y renombrarlo para esquivarlo sería hacerle trampa.
- **Dolor sin cita = hipótesis**, y la importancia para el cliente queda en `null` mientras no se mida:
  el analista no la inventa.

## Lo que dijo la primera corrida (`docs/analisis/2026-10-02/`)

El ranking pone arriba un producto **interno** (P-02, observatorio de costo) porque lo único medido es lo
que le duele a la fábrica. El informe recomienda un piloto externo (P-03) con el buzón de CFDI (P-01), y
P-02 en paralelo como vista sobre datos que ya existen. **La decisión es del laboratorio y sigue abierta.**

## Lo que falta

- **PRP-008 repetido**: lo usan este rol y Soporte SAP. Renumerar el del analista toca el skill, el padrón
  y la corrida congelada: es CDC propio.
- el caso-trampa de la capa B está propuesto fuera del repo, sin sembrar en `golden-sets`;
- el hueco de la comprobación 6b de `verify:gobernanza`: `SIN_VALOR` no reconoce `<firma>` como hueco.
