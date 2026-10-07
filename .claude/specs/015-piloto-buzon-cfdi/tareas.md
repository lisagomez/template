# Tareas 015 — Piloto medido del buzón de CFDI recibidos

> Orden por fases del plan. Cada tarea cierra con evidencia pegada en la sesión, no con una promesa. Las
> fases 2 a 8 se construyen y prueban con corpus **sintético**. Ningún documento real entra antes del
> checkpoint de la fase 9.

## Fase 1 — Spec, plan y tareas

- [x] **TAR-1 · Spec aprobada** por el laboratorio el 2026-10-06, con cinco dudas abiertas.
- [x] **TAR-2 · Plan y tareas aprobados** por el laboratorio el 2026-10-06. `npm run verifica:specs`:
      136/136; `npm run validate`: 30/30 gates activos.

## Fase 2 — Despliegue en el despacho

- [x] **TAR-3 · Supabase autohospedado en el compose**, con imágenes pineadas por digest y la app en la
      red `interna`. Prueba: con el compose arriba, ningún servicio de documentos tiene ruta a internet.
      Hecho el 2026-10-07 en un archivo propio, `docker-compose.despacho.yml`, con db, auth, rest y storage, y
      Caddy como pasarela. Prueba en vivo con datos sintéticos:
      - desde auth, storage, la base y un contenedor nuevo en `frente` o en `interna`: **no sale**; desde Caddy
        y desde `web`, sí;
      - a través de Caddy, el operador da de alta una cuenta (200), el autorregistro se niega
        (`signup_disabled`), el inicio de sesión da un token `authenticated`, y rest y storage responden 200;
      - el dominio resuelve a Caddy desde `frente`, sin salida;
      - en reposo: base 86 MB, storage 106, rest 25, auth 11 y Caddy 17.
- [x] **TAR-4 · `configura:deploy` para el despacho**: mide la RAM, comprueba que `EXTRACTOR_RESPALDO`
      está apagado y rechaza un `SUPABASE_URL` gestionado. Prueba con el caso malo de cada uno.
      Hecho el 2026-10-07: se activa con `DESPLIEGUE=despacho` (`scripts/despacho/reglas.mjs`), y
      `scripts/despacho/llaves.mjs` genera los secretos sin imprimirlos. `prueba:buzon` da 26 en verde, con 7
      siembras del perímetro y 11 del `.env` y de la máquina.

## Fase 3 — Consentimiento y buzón

- [x] **TAR-5 · Migración del buzón**: pymes, consentimientos (se revocan, nunca se reescriben) y buzón
      por pyme, con RLS por organización. Ninguna policy usa `service_role`.
      Hecho el 2026-10-07 (`supabase/migrations/20261007100000_buzon_cfdi.sql`). Dos decisiones del camino:
      - **esquema propio, no el del extractor**: la persistencia del extractor guarda quién corrigió cada campo
        (`versiones_de_campo.autor`), y eso chocaría con el RF-21; el extractor se usa como servicio de lectura;
      - **la organización es la lista de miembros del despacho**, porque un despliegue es un despacho.

      Las políticas usan una función SECURITY INVOKER: no hace falta ninguna SECURITY DEFINER expuesta.
      `prueba:migraciones`: 5 migraciones en verde.
- [x] **TAR-6 · Ingesta solo con consentimiento** (RF-1, RF-2): un documento de una pyme sin
      consentimiento no se lee y avisa.
      En la base (2026-10-07): sin consentimiento vigente, el RLS rechaza el documento. **El aviso en pantalla
      va en la fase 4**, con la zona de ingesta.
- [x] **TAR-7 · Retiro del consentimiento** (RF-3 a RF-5): deja de leerse, se borra lo suyo con
      constancia y sale de las cifras.
      En la base (2026-10-07): revocar dispara un SECURITY DEFINER sin EXECUTE para nadie. Borra los documentos
      de la pyme y escribe la constancia, que ningún miembro puede inventar ni borrar. Un consentimiento revocado
      no se des-revoca. **Salir de las cifras (RF-5) va en la fase 6**, donde nacen las cifras.
      `prueba:buzon`: 13 pruebas de comportamiento en PGlite (miembro, ajena y anónimo), con 3 siembras que
      quitan cada regla y exigen que la conducta cambie. El gate pasa a 39.
      **Y sobre el Supabase real** (el stack de la fase 2, con datos sintéticos): las 5 migraciones del repo se
      aplican. Por la API REST, a través de Caddy, como contadora miembro:
      - documento sin consentimiento: 403 (RLS);
      - reescribir el consentimiento: 403;
      - revocar: 200, y después 0 documentos y la constancia con 1 borrado;
      - inventar una constancia: 403; un anónimo: 401;
      - la función del disparador no existe como RPC (404).

## Fase 4 — Lectura, cotejo, revisión y confirmación

- [x] **TAR-8 · Lectura por el servicio del extractor**: manda el XML (RF-9); sin XML, confianza y
      evidencia por campo (RF-10); lo que solo sale de una imagen va a revisión (RF-11); se ve «sello no
      verificado» (RF-15).
      Hecho el 2026-10-07 con `extraeConElServicio` de `src/features/a2a`, sin importar el `dist` del extractor.
      **El consentimiento se comprueba ANTES de llamar al extractor (RF-1)**: sin él, el extractor ni se llama.
      Un identificador que no pasa su validación entra marcado para revisión, en vez de perderse.
- [x] **TAR-9 · Cotejo al entrar al buzón**: receptor igual a la pyme (RF-12), folio fiscal único por
      buzón (RF-13) y discrepancia entre XML e impresa a revisión (RF-14).
      En la base (`20261007120000_buzon_lectura.sql`): el folio entra una vez por tipo; no se confirma con un
      receptor ajeno. El emparejamiento XML↔impresa (uuid, RFC, total) lo hace la app.
- [x] **TAR-10 · Revisión y confirmación por CFDI**: monta `TablaDeRevision`, sin «confirmar todos»;
      un campo en revisión bloquea la confirmación (RF-16, RF-17).
      **Desviación declarada: revisión propia, no `TablaDeRevision`.** Esa tabla marca por umbral de confianza
      (contra el RF-11 y la decisión de no fijar umbrales), y sus botones de «Eliminar» y «predeterminada» no se
      pueden ocultar. La base exige el RF-17 aunque se llame a la API a mano. Lo confirmado ya no cambia.
- [x] **TAR-11 · Exportación de confirmados** para el sistema contable del despacho. El formato lo
      decide el despacho elegido: hasta entonces, un CSV con los campos del CFDI.
      Solo lo confirmado, cada folio una vez (manda el XML) y sin fórmulas ejecutables.

      **Evidencia de la fase 4** (2026-10-07):
      - `prueba:buzon` sube a 62 pruebas: 8 de la base, 2 de ellas siembras, y 15 de la lógica y del orden de la
        ingesta;
      - **recorrido en el navegador contra el stack real**, con el Supabase del despacho, el servicio del
        extractor con Tesseract y la app (`scripts/buzon/recorrido.mjs`): **15 de 15 pasos**. Entre ellos, el
        RF-17 por la pantalla y por la API a mano (la base lo rechaza), y el folio repetido, el receptor ajeno, el
        CSV y el retiro que borra.

      **Desviación declarada: tampoco se monta `ZonaDeIngesta`.** Exigiría construir el `dist` del extractor antes
      de `next build`, y la imagen de la app no lo hace. Un selector de archivos sube de uno en uno.

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

- [x] **TAR-18 · Gate `prueba:buzon` en `validate`**. **CDC (C1)**: entrada en la bitácora con la firma del
      laboratorio. **Adelantado a la fase 2** (2026-10-07): el padrón pone en rojo un archivo de pruebas que
      ningún gate corre, así que el gate entra con su primera prueba. CDC firmado el 2026-10-07 («capa A basta»). Las
      pruebas de las fases siguientes se suman a este mismo gate. Su `guarda` en el padrón describe solo la fase 2:
      se pone al día en un solo CDC al cerrar la fase 8, no uno por fase.
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
