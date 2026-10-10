# Kit de firma — Soporte SAP

> **Fuera de todo registro.** Prepara la firma de la AISIA v3 y del C3 v4 de Soporte SAP (PRP-010, fase 5). **La
> firma la escribes tú**: este kit no firma nada, y el guion que lo acompaña no hace nada si falta una firma.
>
> **Usado el 2026-10-10**: lisagomez firmó las dos y la AISIA está ya en
> [`.claude/gobernanza/AISIA-soporte-sap.md`](../../.claude/gobernanza/AISIA-soporte-sap.md) (PR #243). Lo de abajo
> queda como registro de lo que se firmó.

## Qué firmas

Dos firmas, cada una en su línea:

| Firma | Qué firma | Dónde está hoy | Línea que escribes |
|---|---|---|---|
| **La AISIA v3** (C4) | a quién puede dañar el producto sin que nadie lo ataque, y qué lo impide | `docs/goals/soporte-sap-AISIA.md`, §5 (hoy en `.claude/gobernanza/`) | `Firmada por: <nombre>  Rol: <rol>  Fecha: <AAAA-MM-DD>` |
| **El contrato** | el producto, con su C3 v4 (quién lo ataca y qué lo impide) y su AISIA v3 | [`src/features/soporte-sap/BUSINESS_LOGIC.md`](../../src/features/soporte-sap/BUSINESS_LOGIC.md), la línea `**Firma:**`; el C3 vive en el [PRP-008](../../.claude/PRPs/PRP-008-soporte-sap.md) | `**Firma:** <nombre> (<rol>) · Fecha: <AAAA-MM-DD> · firma el contrato con su C3 v4 y su AISIA v3.` |

**Lo que decides al firmar** es lo que dice la AISIA §5: **mitigar y operar solo en laboratorio**. Firmar **no**
autoriza a salir del laboratorio. Para eso la §5 lista lo que falta:
- D1, D3, D6, D7, D8, D10, D12, D13 y D14;
- el anonimizador medido sobre un corpus real (D9);
- el aviso de privacidad;
- los veredictos desde `tools/conocimiento` (H-20);
- el tope del lector de PDF (H-22);
- GATE 3.

## Primero, los infirmables: lo que ninguna firma autoriza

Son los daños que caen sobre quien no firmó: los empleados del N3, las contrapartes de un CFDI, el dinero del SLA
entre la consultora y su cliente. **Tu firma no los cubre** (límite de C5). Por eso cada uno está cerrado en código
o el producto no lo ofrece, y aquí está su resultado de hoy. Hay 91 filas, 87 probadas, 4 que esperan una decisión y
**0 brechas**. «Probada» quiere decir que su prueba pasa sin sabotaje y cae con él.

| Documento | Daño o control | Filas probadas | Lo que espera una decisión |
|---|---|---|---|
| AISIA | Dato personal en el sandbox | 16 | **D9**: medir el anonimizador sobre un corpus real con consentimiento, antes de salir del laboratorio |
| AISIA | Prioridad mal asignada | 7 | — |
| AISIA | SLA mal medido | 9 | — |
| AISIA | Pausa unilateral | 8 | — |
| AISIA | Primera respuesta automática | 5 | — |
| AISIA | Resolución unilateral | 3 | — |
| AISIA | Incumplimiento borrado | 2 | — |
| AISIA | La consultora altera la impugnación | 4 | — |
| AISIA | El laboratorio lee lo que no necesita | 5 | — |
| AISIA | Corte por presupuesto | 5 | — |
| AISIA | P1 sin evidencia leída | 1 | — |
| AISIA | Restauración que toca a los demás | 2 | — |
| AISIA | Solución equivocada aprobada | 4 | **D6**: en un SAP real, por acción, con gate humano y solo lo reversible. Hoy **no se ofrece** |
| AISIA | Conocimiento de una consultora usado para otra | 2 | **D1**: a la matriz común, solo con el consentimiento por contrato de la consultora y su cliente |
| AISIA | Opacidad | 0 | **El aviso de privacidad** hacia los empleados del N3 (redacción legal). Sin él, el producto no opera con datos reales |
| C3 | Alcance de los roles de servicio (O6) | 6 | — |
| C3 | Datos personales | 3 | — |
| C3 | Decisiones humanas | 1 | — |
| C3 | Tenencia atada (O2) | 1 | — |
| C3 | Jobs de plataforma (C7) | 1 | — |
| C3 | Perfil de despliegue | 1 | — |
| C3 | Root ajeno (modo despacho) | 1 | — |

Cada fila, con su prueba y su sabotaje, está en la [matriz](soporte-sap-firmas-matriz.md).

## Lo que queda abierto, y por qué no es infirmable

Son brechas declaradas o decisiones pendientes. Ninguna cae sobre quien no firmó, o no se ofrece mientras siga abierta.

| Abierto | Por qué no lo cubre un infirmable |
|---|---|
| La fatiga del aprobador (O3) | Sin SAP real (D6), su daño es al simulador. La mitigan el supervisor, el antes y el después, y la huella de lo aprobado |
| Los tiempos por consultor, en la cadena | Es entre la consultora y sus empleados. Quitar el actor rompería la evidencia del SLA |
| Un agregado de un grupo chico ante el laboratorio (D14) | Son cifras de operación, no datos personales, y el contrato le dice al N3 que el laboratorio ve agregados |
| Qué más ve el superadministrador (D14) | Por defecto, mínimo privilegio: lo escalado y, con acceso motivado, los originales |
| Un dato con una forma que ningún detector conoce | Lo contienen la cuarentena y el cerrojo de la base, y el producto no sale del laboratorio sin D9 |
| Inyección contra un modelo real (D7) | Hoy no hay modelo. El corpus de inyecciones se corre antes de encenderlo |
| Un parámetro del plan que sale de un documento | Lo ve y lo aprueba una persona en la sala, atado a su huella |
| Un PDF que tumba la app (H-22, en pausa) | Es disponibilidad (O4), no un dato ni dinero. Se cierra antes de recibir documentos de fuera |
| Los parches de dbt, MetricFlow y Postgres (O5) | Las versiones van pineadas; falta quién avise |
| Los veredictos fuera de `tools/conocimiento` (H-20) | En el laboratorio son notas sintéticas. Es condición de salida |
| Realtime y el JWT de Supabase | Nada está expuesto sin un Supabase real |
| `ss_procedencia` y los límites de los buckets | La tenencia de la fila sí se exige, y la ingesta valida tamaño y tipo |
| La retención (D8) | La plataforma tiene el privilegio, y ningún job borra |
| La ruta del laboratorio sin autenticar, y sus logs | `configura:deploy` rechaza la variable en producción: no se enciende fuera del laboratorio |
| La región, el proveedor y los snapshots, autodeclarados | Los verifica quien contrata; la ficha no dice «apto» sin GATE 3 |
| Root ajeno en modo despacho | Ve lo que su consultora ya ve por su rol, más los datos de sus propios empleados. El SLA de ese modo **no se ofrece** como evidencia independiente, y el contrato lo dice |
| S8 y S9 de la sala, sin sabotaje propio | Se comprueban en cada corrida; la sala no está expuesta |
| El resultado de SLA sin atar a los eventos | No es la evidencia: la evidencia es la cadena, que la plataforma no toca, y el resultado se recalcula desde ella |

## Qué cambió desde la última versión que viste

La v2 de la AISIA y la v3 del C3 prometían controles que no existían. Tres revisiones contra el código (05/10, 07/10
y 09/10) encontraron **50 hallazgos**: los cerró el PRP-010, en código, o los declara el texto. Para ver el diff de
cada documento:

- la AISIA: `git diff b4558d9 71c0a73 -- docs/goals/soporte-sap-AISIA.md`
- el C3 (PRP-008): `git diff b4558d9 71c0a73 -- .claude/PRPs/PRP-008-soporte-sap.md`
- el contrato: `git diff b4558d9 -- src/features/soporte-sap/BUSINESS_LOGIC.md`

Por qué cambió cada afirmación está en los hallazgos de la [matriz](soporte-sap-firmas-matriz.md) y en las notas de
fase del PRP-010.

## Dónde aterriza cada cosa

| Qué | Dónde | Quién |
|---|---|---|
| La AISIA firmada | `.claude/gobernanza/AISIA-soporte-sap.md` (se mueve desde `docs/goals/`) | el guion, después de tu firma |
| El C3 v4 | se queda en el PRP-008; su encabezado dice quién lo firmó y cuándo | el guion |
| La firma del contrato | la línea `**Firma:**` del `BUSINESS_LOGIC.md` del producto | **tú** |
| El estado | la fila del índice (`BUSINESS_LOGIC.md` de la raíz) y `contrato.aisia` y `contrato.firma` del manifiesto (`productos/soporte-sap.json`) | el guion |

## Los pasos, en orden

Antes de empezar, Claude te deja una rama `soporte/firma` desde `main`, con el `validate` en verde.

1. Lee este kit y, si quieres, el diff de arriba.
2. Firma la AISIA. Abre el documento, ve a la última línea y escribe la tuya. Guarda **sin formatear**
   (Ctrl+K S):
   `! code /home/gsore/code/template/.claude/worktrees/cierre-base/docs/goals/soporte-sap-AISIA.md`
3. Firma el contrato. Reemplaza la línea `**Firma:** pendiente…` por la tuya y guarda sin formatear:
   `! code /home/gsore/code/template/.claude/worktrees/cierre-base/src/features/soporte-sap/BUSINESS_LOGIC.md`
4. Mira qué haría el guion, sin escribir nada:
   `! node /home/gsore/code/template/.claude/worktrees/cierre-base/tools/soporte-sap/firmas/aterriza.mjs --prueba`
5. Aterriza la firma:
   `! node /home/gsore/code/template/.claude/worktrees/cierre-base/tools/soporte-sap/firmas/aterriza.mjs`
6. Dile a Claude «listo». Corre el `validate` y la matriz, hace el commit con tu firma tal como la escribiste y
   prepara el PR; el push y el PR los decides tú.

Si el guion dice «No aterrizo», no tocó nada: te dice qué línea falta o qué texto no encontró.
