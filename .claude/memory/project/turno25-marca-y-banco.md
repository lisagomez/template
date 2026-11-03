# Turno 25, el banco de motores y las fechas de Ágora — en qué quedamos

**En `main` desde el 2026-11-03**: #293 (pruebas de Ágora), #294 (marca, banco, revisores y skills) y #295 (dos
arreglos de gobernanza). Lo construido está en el código, en `docs/goals/gradio-marca-turno25-reporte.md` y en la
bitácora; aquí vive lo que el código no dice.

## Lo que decidió el laboratorio

- **Turno 25 es la marca única** del repo; su fuente es `.claude/design-systems/turno-25/tokens.json` y lo demás se
  genera. Ágora, Soporte SAP, Recepción y clínicas **conservan su acento** (marca blanca): migrarlas es otra decisión.
- **El banco de motores toma la idea de Gradio sin Gradio**: núcleo en `tools/banco-motores`, pantalla en
  `src/features/banco`. Solo laboratorio y solo datos sintéticos; exponerlo exige auth, límite de peticiones, C3 y C4.
- **Skills de terceros:** `humanizer` y `emil-design-eng` cargados; diez de Emil Kowalski en `.claude/estante/`, sin
  coste por sesión. Pasar uno del estante a `.claude/skills/` es un CDC.
- Los CDC de #294 y #295 se firmaron con **«capa A basta»**.

## Abierto (lo decide el laboratorio)

- **La v1.1 de la marca:** subir `fg-3` (4,04:1 en claro; hoy la regla `sutil-chico` lo limita a texto grande),
  adoptar los estados oscuros derivados (pasan AA, de 6,80:1 a 8,33:1) y las curvas de Emil. El logo, sin elegir.
- **Las fechas de Ágora:** la siembra de su laboratorio tiene el gasto fijo en octubre (`HOY_DEL_PROTOTIPO`) y los
  tipos de cambio acaban el 2026-10-28. Por eso tres pruebas cayeron el 1/11 y el 3/11, y `main` estuvo en rojo hasta
  el #293, que lo arregló solo en las pruebas. **Pueden quedar más.** El arreglo de fondo es un reloj fijo en la base de
  pruebas o una siembra relativa a hoy, y los dos cambian Ágora más allá de sus pruebas. Su laboratorio muestra el
  gasto del mes en 0 desde noviembre.
- **El banco:** llevar la señal de cancelar al propio extractor (hoy el banco la inyecta por `ejecuta`). Y no cierra a
  quien falsea Host y `x-forwarded-for` desde la red: esa barrera es la red (nota C3, en la entrada de la bitácora).
