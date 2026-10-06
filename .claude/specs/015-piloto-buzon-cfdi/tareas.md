# Tareas 015 — Piloto medido del buzón de CFDI recibidos

> Orden por fases del plan. Cada tarea cierra con evidencia pegada en la sesión, no con una promesa. Las
> fases 2 a 8 se construyen y prueban con corpus **sintético**. Ningún documento real entra antes del
> checkpoint de la fase 9.

## Fase 1 — Spec, plan y tareas

- [x] **TAR-1 · Spec aprobada** por el laboratorio el 2026-10-06, con cinco dudas abiertas.
- [ ] **TAR-2 · Plan y tareas aprobados** (este directorio). `npm run verifica:specs` en verde.

## Fase 2 — Despliegue en el despacho

- [ ] **TAR-3 · Supabase autohospedado en el compose**, con imágenes pineadas por digest y la app en la
      red `interna`. Prueba: con el compose arriba, ningún servicio de documentos tiene ruta a internet.
- [ ] **TAR-4 · `configura:deploy` para el despacho**: mide la RAM, comprueba que `EXTRACTOR_RESPALDO`
      está apagado y rechaza un `SUPABASE_URL` gestionado. Prueba con el caso malo de cada uno.

## Fase 3 — Consentimiento y buzón

- [ ] **TAR-5 · Migración del buzón**: pymes, consentimientos (se revocan, nunca se reescriben) y buzón
      por pyme, con RLS por organización. Ninguna policy usa `service_role`.
- [ ] **TAR-6 · Ingesta solo con consentimiento** (RF-1, RF-2): un documento de una pyme sin
      consentimiento no se lee y avisa.
- [ ] **TAR-7 · Retiro del consentimiento** (RF-3 a RF-5): deja de leerse, se borra lo suyo con
      constancia y sale de las cifras.

## Fase 4 — Lectura, cotejo, revisión y confirmación

- [ ] **TAR-8 · Lectura por el servicio del extractor**: manda el XML (RF-9); sin XML, confianza y
      evidencia por campo (RF-10); lo que solo sale de una imagen va a revisión (RF-11); se ve «sello no
      verificado» (RF-15).
- [ ] **TAR-9 · Cotejo al entrar al buzón**: receptor igual a la pyme (RF-12), folio fiscal único por
      buzón (RF-13) y discrepancia entre XML e impresa a revisión (RF-14).
- [ ] **TAR-10 · Revisión y confirmación por CFDI**: monta `TablaDeRevision`, sin «confirmar todos»;
      un campo en revisión bloquea la confirmación (RF-16, RF-17).
- [ ] **TAR-11 · Exportación de confirmados** para el sistema contable del despacho. El formato lo
      decide el despacho elegido: hasta entonces, un CSV con los campos del CFDI.

## Fase 5 — Banderas 69-B

- [ ] **TAR-12 · Importación de la lista pública fechada** (RF-18): se guardan la fuente y la fecha de
      la lista, y se marca al proveedor que aparece en ella.
- [ ] **TAR-13 · Sin veredicto** (RF-19): el tipo de la bandera no tiene campo de veredicto, y una
      prueba rechaza cualquier texto de «no deducible» o de «riesgoso».

## Fase 6 — Medición

- [ ] **TAR-14 · Registro de tiempo** por pyme y por mes, sin persona (RF-20, RF-21). Prueba: la tabla no
      tiene ninguna columna que identifique a quien capturó.
- [ ] **TAR-15 · Cifras agregadas** con seudónimo (RF-8, RF-22, RF-30), y una prueba anti-fuga que
      rechaza valores con forma de RFC o UUID en el archivo.

## Fase 7 — Parar, cerrar y borrar

- [ ] **TAR-16 · Parar el piloto** (RF-25, RF-26): cada CFDI del mes queda confirmado o en la lista de
      vuelta a captura manual, sin ninguno perdido.
- [ ] **TAR-17 · Borrado al cierre** (RF-27 a RF-29): borra todo lo generado, no toca los originales y
      deja constancia sin datos.

## Fase 8 — Gate y demo

- [ ] **TAR-18 · Gate `prueba:buzon` en `validate`**. **CDC (C1)**: entrada en la bitácora con la firma del
      laboratorio.
- [ ] **TAR-19 · Recorrido con Playwright** del flujo completo sobre corpus sintético, con capturas.
- [ ] **TAR-20 · Inventario y contrato**: el activo de la feature, con dueño el Extractor documental, y
      `npm run inventario:vista`.

## Fase 9 — Checkpoint humano (sin código)

- [ ] **TAR-21 · Antes del primer documento real**:
  - despacho elegido;
  - su máquina medida (duda 5);
  - duda 1 resuelta;
  - acuerdo del piloto firmado;
  - consentimiento escrito de al menos una pyme;
  - AISIA del piloto firmada (`plantillas/aisia.md`).

## Fase 10 — Piloto y cierre

- [ ] **TAR-22 · Mes previo**: el despacho registra el tiempo de captura manual por pyme.
- [ ] **TAR-23 · Mes del piloto**: buzón en uso, con el mismo registro de tiempo.
- [ ] **TAR-24 · Cierre**:
  - cifras entregadas al laboratorio;
  - constancia de cada borrado;
  - «Costo actual» en el contrato, con cifra y fuente (RF-23) o «desconocido» con el motivo (RF-24).
