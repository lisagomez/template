# Propuesta de entrada en `BITACORA-CDC.md` — el caso 10 activa el segundo motor para muletillas

> Redactada por el agente el 2026-09-20 (Etapa 3, mejora 3.4). Se pega en la bitácora SOLO al
> firmarla una persona; hasta entonces vive aquí. No es un modelo nuevo: `faster-whisper:small`
> ya está en el banco y ya es el respaldo por idioma de `dictar` desde el 2026-09-16.

## Cambio

- `src/features/laboratorio-voz/services/competencias.ts`: la lista cerrada
  `MOTORES_QUE_CONSERVAN_MULETILLAS` pasa de vacía a `['faster-whisper']`.
- El panel del caso 10 gana la casilla «Medir muletillas con el segundo motor»: con ella, la
  transcripción con tiempos va por `lote --motor faster-whisper:small` (por proceso, más lenta) y
  la cifra de muletillas se muestra; sin ella, sigue Parakeet y las muletillas dicen «no medible».
- El demonio local gana un motor de respaldo opcional (`DICTADO_RESPALDO`, que `npm run demonio`
  pone a `faster-whisper:small` si el banco tiene el venv) que el cliente pide con `x-motor:
  respaldo`. Lo usa el picking para audio corto oído en inglés.

## Medición que lo justifica

`scripts/laboratorio-voz/mide-competencias.mjs`, 12 lecturas (6 guiones × 2 voces Piper, muletillas
escritas en conteo conocido), regla fijada antes de medir: recall ≥ 80 % y precisión ≥ 90 %.

| motor | recall | precisión | decisión |
|---|---|---|---|
| Parakeet (demonio) | 76 % | 100 % | no conserva → «no medible» |
| faster-whisper small | 82 % | 100 % | conserva → puede mostrar la cifra |

Tabla completa: `tools/dictado/medicion/corpus-propio/muletillas/medicion-2026-09-21.md`.

## Riesgos y límites

- Sintético: Piper pronuncia «eh» y «este» como palabras claras; una persona titubea con «ehh»
  alargado o a medias. La cifra real puede ser peor en los dos motores. Se vuelve a medir con
  voz propia antes de ofrecer el caso 10 fuera del laboratorio.
- El segundo motor tarda más (por proceso: ~14 s por lectura de 40 s en esta máquina, frente a
  ~2 s del demonio) y alucina en audio corto o ruidoso (visto en vivo el 2026-09-19). Por eso es
  opción explícita, no defecto.
- Regresión: `npm run regresion` no cubre muletillas; la prueba pura de la rúbrica (`no-medible`)
  y esta medición son la garantía.

## Decisión que se pide

Aprobar que el caso 10 ofrezca el segundo motor como opción explícita y que el demonio cargue el
respaldo por idioma. Sin firma, el código queda como está (la opción existe y está medida), pero
la entrada no entra en la bitácora.

Aprobado por: ____________  Rol: ____________  Fecha: ____________
