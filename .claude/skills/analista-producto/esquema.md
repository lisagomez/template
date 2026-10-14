# `analisis.json` — campo por campo

Una corrida vive en `docs/analisis/<fecha>/`: `analisis.json` (para la máquina y para comparar
corridas), `INFORME.md` (para el laboratorio), `propuestas/*.md` (los one-pagers) y
`mediciones/*.txt` (las capturas de los medidores). Lo comprueba
`scripts/analista-producto/verifica-evidencia.mjs`.

## Identificadores

`D-nn` hallazgo · `HP-nn` hipótesis · `CU-nn` caso de uso · `P-nn` candidato · `C-nn` cifra ·
`Hn` hipótesis de la petición. Estables entre corridas cuando el dolor es el mismo: es lo que
permite decir cuál se cerró. **Nunca** la letra T seguida de dígitos: ese patrón es de la capa B y
`verify:gobernanza` lo rechaza en cualquier archivo versionado.

## Citas (`evidencia`)

```jsonc
{ "tipo": "archivo",  "ruta": "tools/x/README.md", "cita": "literal que está en el archivo", "linea": 42 }
{ "tipo": "registro", "ruta": ".claude/gobernanza/REGISTRO-RIESGO.md", "cita": "…" }
{ "tipo": "commit",   "sha": "c870b84", "cita": "literal del mensaje" }
{ "tipo": "pr",       "numero": 206, "cita": "literal del merge (opcional)" }
{ "tipo": "medicion", "comando": "npm run mide:contexto", "archivo": "docs/analisis/<fecha>/mediciones/contexto.txt", "cita": "…" }
```

`linea` es opcional (las líneas se mueven, la frase no). Una `medicion` de un artefacto versionado
(por ejemplo, `trayectorias/informes/2026-09-30.md`) declara el `npm run` que lo produce.

## Raíz

```jsonc
{
  "version": 1,
  "fecha": "2026-10-02",
  "commit": "<sha que se analizó>",           // las citas se comprueban en ESTE commit: la corrida es una foto
  "estado": "completed",                     // completed | input-required | failed
  "peticion": { "texto": "…", "hipotesis": [{ "id": "H1", "texto": "…" }] },
  "inventario": { "archivo": "inventario/activos.json", "activos": 39 },
  "importancia_usuario": null,               // sin voz del cliente: null, y la pregunta va abajo
  "cobertura": [{ "activo": "TPL-x", "estado": "con-dolores", "hallazgos": ["D-01"], "evidencia": [], "motivo": null }],
  "hallazgos": [{
    "id": "D-01", "titulo": "…", "de_quien": "laboratorio | usuario | tercero | operador",
    "categoria": "…", "activos": ["TPL-x"], "grado": "medida", "evidencia": [ /* citas */ ], "sin_caso": null
  }],
  "hipotesis": [{ "id": "HP-01", "titulo": "…", "origen": "…", "falta": "qué la confirmaría" }],
  "cifras": [{ "id": "C-01", "valor": "10841", "que": "…", "evidencia": { "tipo": "medicion", /* … */ } }],
  "casos": [{
    "id": "CU-01", "categoria": "…", "quien": "…", "momento": "…", "intenta": "…", "impide": "…",
    "cuesta": "texto con [C-01], o «no medido»", "dolores": ["D-01"]
  }],
  "candidatos": [{
    "id": "P-01", "titulo": "…", "casos": ["CU-01"], "activos": ["TPL-x"], "sin_activos_motivo": null,
    "puntuacion": {
      "frecuencia": 3, "severidad": 2, "reuso": 3, "esfuerzo": 2, "solidez": 3, "total": 27,
      "porque": { "frecuencia": "…", "severidad": "…", "reuso": "…", "esfuerzo": "…" }
    },
    "veto": null,                            // o { "control": "C4", "motivo": "…" }
    "onepager": "propuestas/x.md",
    "siguiente_paso": "/prp | /spec-generator | /new-app"
  }],
  "ranking": ["P-01"],                        // los no vetados, de mayor a menor total
  "borrador": [{ "id": "H1", "veredicto": "confirmada | refutada | parcial | sin-evidencia", "hallazgos": ["D-01"], "evidencia": [], "nota": "…", "falta": null }],
  "preguntas_al_laboratorio": [{ "pregunta": "…", "recomendada": "…", "por_que": "…" }]
}
```

`total = frecuencia × severidad × solidez × reuso ÷ esfuerzo`, redondeado a dos decimales. La
solidez es el grado más alto entre los dolores de los casos del candidato.
