# PRP-011: D1, el núcleo común con consentimiento (Soporte SAP)

> **Estado**: **COMPLETADO** (2026-10-10). Las tres fases están en `main` (#245, #246, #247), y la revisión 1 de la AISIA
> la firmó lisagomez. **Aprobado** (2026-10-10) por el laboratorio, en sesión: «apruebo el PRP-011 con tus
> recomendaciones». DP-1 a DP-4 quedan como su recomendación.
> **Decisión de origen**: D1, decidida por el laboratorio el 2026-10-10 en sesión: **«con consentimiento»**. Lo
> aprendido con una consultora llega al núcleo común solo generalizado, firmado por el superadministrador y con el
> consentimiento por contrato de la consultora de origen **y** de su cliente.
> **Proyecto**: Soporte SAP (`productos/soporte-sap.json`).
> **CDC aplicable**: no cambian skills, prompts, plantillas, `gates.json` ni el modelo. Sí cambia la **AISIA
> firmada** (la fila de D1 pasa de «depende» a «probado»): esa revisión la firma el laboratorio, como la v3.

## Objetivo

Que al núcleo común solo suba lo aprendido de una consultora si **la consultora de origen y su cliente lo
consintieron**, y que lo exijan la base, la app y el contrato. Hoy el núcleo solo se alimenta en el laboratorio, y la
AISIA deja esta fila «dependiendo de D1».

## Por qué

- **Es infirmable**: el conocimiento nace de los datos del N3, y usarlo para la competidora de su consultora sin que
  ninguno lo sepa es el daño «conocimiento de una consultora usado para otra» (AISIA §2).
- **Es el foso**: la matriz común (ERP §1.7) solo crece con casos reales si este control existe.

## Qué

### Criterios de éxito

- [ ] Sin el consentimiento vigente de la consultora **o** del cliente de origen, la base rechaza la promoción al
      núcleo, y la app también. Con los dos, sube (control positivo).
- [ ] Consiente una persona de **esa** organización, a su nombre, con la fecha que pone la base, y lo puede revocar.
      Nadie consiente por otra organización: ni el agente, ni el laboratorio, ni la consultora por su cliente.
- [ ] El origen de una propuesta (consultora y cliente del caso) no lo lee ninguna otra consultora ni ningún rol de la
      API; solo lo consulta la regla que decide la promoción.
- [ ] El contrato dice qué es el núcleo, que sube generalizado, que hace falta el consentimiento de los dos y qué pasa
      al revocar.
- [ ] La matriz: cada frase nueva con su fila, que pasa sin sabotaje y cae con él; la fila de D1 pasa a «probado».
- [ ] La revisión de la AISIA, firmada por el laboratorio; `validate` en verde después del último commit; el
      recorrido, con la promoción rechazada sin consentimiento y aceptada con él.

### Decisiones del laboratorio (recomendación primero)

| Id | Pregunta | Recomendación | Alternativa |
|---|---|---|---|
| DP-1 | Si alguien revoca, ¿qué pasa con lo que ya subió? | **Se queda**: está generalizado y ya no es de nadie. Revocar frena lo que no ha subido, y el contrato lo dice desde el principio | Retirar del núcleo lo que nació de esa organización (es posible, porque el origen se guarda); más trabajo, y ese conocimiento ya pudo usarse |
| DP-2 | ¿Quién consiente por la consultora? | **Un consultor de la consultora**, a su nombre, como el acceso motivado | Un rol nuevo de «responsable» de la consultora |
| DP-3 | ¿Con qué granularidad? | **Por organización y por versión de su contrato**: un sí general, que se renueva con el contrato | Por caso: cada enseñanza pide permiso; más control, mucha fricción |
| DP-4 | Lo que ya está «a medida» antes del consentimiento, ¿puede subir después? | **Sí**: el consentimiento se mira al promover, no al enseñar | Solo lo enseñado después de consentir |

### Comportamiento esperado

1. La consultora (un consultor) y su cliente (un usuario del cliente) dan su consentimiento en la app, cada uno por su
   organización.
2. El experto enseña un caso; queda **a medida** de la consultora, como hoy.
3. El superadministrador ve si la enseñanza puede subir y, si no, qué falta («falta el consentimiento del cliente de
   origen»), sin ver quién es el cliente.
4. Sube generalizada solo con los dos consentimientos vigentes; la base lo exige aunque la app no lo mire.

## Contexto

### Modelo de datos (propuesta SQL, no se aplica a ninguna base)

- `ss_consentimiento_nucleo`: `organizacion_id`, el contrato y su versión (N1–N2 para la consultora, N2–N3 para el
  cliente), `otorgado_por` (= `auth.uid()`), `otorgado_en` (lo pone la base) y `revocado_en`. Con RLS `enable` +
  `force`:
  - inserta solo una persona de esa organización: un consultor por su consultora (DP-2) y un usuario del cliente por
    su cliente;
  - de una fila solo se toca `revocado_en`, y la hora la pone la base;
  - la leen la propia organización y, sin el nombre de quien consintió, el superadministrador.
- **El origen de la propuesta**, en `ss_priv` (no expuesto): al insertarse una propuesta con su incidencia, un
  disparador guarda aparte la consultora y el cliente de esa incidencia, y la fila de la propuesta no se queda con la
  incidencia. Así una entrada del núcleo no dice de dónde vino.
- **La promoción** (`a_medida` → `nucleo`) exige, además de lo de hoy (superadministrador y generalizado), el
  consentimiento vigente de la consultora y del cliente de origen. Lo comprueba una función `security definer`.

### Referencias

- AISIA v3 firmada: `.claude/gobernanza/AISIA-soporte-sap.md` (§2, §4 «Conocimiento cruzado», §5).
- C3 v4: PRP-008, «Decisiones humanas» y «Siembra».
- Hoy: `ss_priv.propuesta_no_cambia_de_duena()` y `ss_priv.propuesta_nucleo_generalizada()`; en la app,
  `subeAlNucleo` y `alNucleo`.

## Gobernanza

### Modelo de amenazas (C3) de este PRP

- **Activos**: el núcleo común; los consentimientos (uno falso deja pasar datos de un tercero); el origen de cada
  propuesta.
- **Fronteras**: la app (quien consiente) y la base (quien promueve).
- **Atacantes**:
  - O2: una consultora que consiente por su cliente;
  - O6: el agente o un rol de servicio que fabrica un consentimiento;
  - el laboratorio, que querría el núcleo lleno y consentiría por otros.
- **Controles**: consiente una persona de la organización a su nombre, con la fecha de la base; ningún rol de servicio
  escribe consentimientos; el origen no se expone.
- **Brecha**: que el usuario del cliente que consiente tenga autoridad para hacerlo en nombre de su empresa es un
  asunto de contrato, no de código: el contrato lo dice.

### AISIA (C4) de este PRP

- **Partes**: las consultoras y sus clientes (su conocimiento), y las demás consultoras (lo reciben).
- **Daños sin atacante**:
  - un consentimiento dado sin entender qué es el núcleo (lo mitiga el texto del contrato y de la pantalla);
  - el origen guardado, que liga el conocimiento con un cliente (lo mitiga que solo lo lee la regla).
- **Reversibilidad**: con DP-1 recomendada, lo ya subido no se retira; por eso el contrato lo dice antes del sí.
- **Decisión**: mitigar.

## Blueprint

### Fase 1: La base
El consentimiento, el origen privado y la regla de promoción, con pruebas que intentan cada atacante de arriba (y su
control positivo), y sus filas en la matriz.

### Fase 2: La app y el contrato
Consentir y revocar en la vista de la consultora y del cliente; el superadministrador ve si puede subir y qué falta;
la sección «Conocimiento común» del contrato. Pruebas que ejecutan el runtime y un paso del recorrido.

**Fase 1, hecha (2026-10-10, #245)**: en la base.
- `ss_consentimiento_nucleo` y el origen privado (`ss_priv.propuesta_origen`).
- La regla de promoción (`ss_priv.falta_para_el_nucleo`).
- El agente ya no propone directo al núcleo: la regla se habría esquivado.
- Matriz 216/216.

**Fase 2, hecha (2026-10-10, rama `soporte/d1-fase2`)**:
- **El dominio** (`src/consentimiento.ts`) aplica la misma regla que la base, con los mismos mensajes. El chat devuelve
  el caso del que nace cada enseñanza, y la app registra su origen aparte.
- **La app**:
  - la consultora (un consultor) y el cliente consienten y revocan, cada uno por sí; la consultora ve el
    consentimiento de sus clientes, y el laboratorio ninguno;
  - el superadministrador ve qué le falta a cada enseñanza para subir, nunca de quién.
- **El contrato**: §12 «Conocimiento común», con DP-1 a DP-4.
- **Evidencia**: pruebas del dominio y de la app, ejecutadas; el recorrido con los pasos 5.01 (no sube y dice qué
  falta) y 5.02 (consienten las dos partes), 31 capturas dos veces seguidas sin rojo.

### Fase 3: La AISIA y la firma
La revisión de la AISIA y del C3 (la fila de D1 a «probado»), la matriz entera, el `validate` y el kit de una línea
para que el laboratorio firme la revisión.

**Fase 3, preparada (2026-10-10, rama `soporte/d1-fase3`)**: la fase 2 está en #246.
- **La revisión 1 de la AISIA**, como borrador fuera del registro (`docs/goals/soporte-sap-AISIA-revision-d1.md`): la
  §3, la §4 «Conocimiento cruzado» y la §5, con la firma de la v3 intacta y una línea «Revisión 1 (D1), firmada por»
  en blanco.
- **El C3 (PRP-008)**: el consentimiento en «Decisiones humanas» y en «Siembra».
- **El BUSINESS_LOGIC y la spec**: D1 decidida.
- **El laboratorio** firma la línea y mueve el borrador a `.claude/gobernanza/AISIA-soporte-sap.md`.

## Gotchas

- **La AISIA está firmada**: este PRP no la edita sin la firma del laboratorio. La revisión va en la fase 3, con su kit.
- **El origen no puede viajar con la propuesta**: si la fila del núcleo guarda su incidencia o su consultora, se
  pierde lo que el control protege.
- **Una prueba de consentimiento se escribe contra el ataque que funciona sin el control**: hoy la promoción sube sin
  consentimiento, así que esa prueba tiene que caer antes de construir la regla.
