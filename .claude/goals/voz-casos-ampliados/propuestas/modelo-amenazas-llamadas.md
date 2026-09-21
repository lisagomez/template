# Modelo de amenazas — Llamadas en vivo a dos canales (caso 19, control C3)

> Borrador para firma, redactado el 2026-09-20 en la Etapa 3. Hoy NO existe la captura de una
> llamada: en WSLg solo se ve el micrófono (`RDPSource`) y lo que WSL reproduce; el audio de
> Zoom, Teams o el teléfono en Windows no pasa por ahí. Capturarlo exige un **ayudante del lado
> Windows** (dos flujos WASAPI: micrófono y loopback del altavoz) que aún no se ha escrito. Este
> documento fija qué tendría que cumplir ANTES de existir, y se firma antes de escribirlo.

## Activos que toca (ordenados por daño)

1. **La voz y las palabras del interlocutor**, que no es usuario y no firmó nada. Si se filtran,
   el daño es a un tercero y no hay firma que lo cubra (límite de C5).
2. **Datos de terceros mencionados** en la llamada (clientes, colegas, montos, contratos).
3. **El token del demonio** (`DICTADO_MOVIL_TOKEN`): quien lo tenga transcribe lo que quiera en
   esta máquina.
4. **El ayudante de Windows en sí**: un binario o DLL con acceso al micrófono y al altavoz de
   todo el sistema. Si se sustituye, escucha todo el tiempo y nadie lo nota.
5. **La reputación** del vendedor y de la empresa: «me grabaron sin decirme».

## Fronteras que cruza

- **Windows → WSL**: el audio de la llamada entra desde otro sistema operativo por una tubería
  local. Es dato no confiable en forma (puede ser cualquier cosa) y sensible en fondo.
- **Red local**: si el ayudante hablara con el demonio por HTTP, el token cruza esa frontera. Se
  exige loopback (127.0.0.1) o tubería con nombre, nunca una interfaz de red.
- **Acta y análisis → personas**: lo que el asesor produce (insights, riesgos, score) sale hacia
  el vendedor y, si se exporta, hacia terceros.

## Atacantes relevantes (catálogo C3)

| # | Quién | Qué querría aquí |
|---|---|---|
| **O2** Contraparte deshonesta | Meter en la llamada frases diseñadas para que el asesor produzca un insight falso («ya aprobaron el presupuesto») o para inyectar comandos si algún día hubiera un LLM detrás (hoy no lo hay: reglas). |
| **O3** Fatiga / insider | El vendedor deja el ayudante encendido «porque ya está», y graba llamadas personales o de colegas. No es malicia: es costumbre. |
| **O4** Bots y externos | Un proceso en Windows que encuentre la tubería o el puerto del demonio y lo use como transcriptor gratuito, o que lea el audio en tránsito. |
| **O5** Cadena de suministro | El ayudante se distribuye como binario o DLL: uno sustituido escucha todo. Igual que el tag de una imagen de agente: **CDC con hash pineado**. |
| **O6** Compromiso de un servicio | Si el demonio cae en manos ajenas (token filtrado), transcribe y, con el ayudante, oye. El techo de permisos del demonio (loopback, sin escritura de audio) acota el daño. |

## Controles (y la brecha que queda)

| Control | Qué exige | Brecha típica |
|---|---|---|
| **Indicador visible + tecla de corte** | Mientras se captura, un indicador que no se puede ocultar (icono rojo en la barra, y en pantalla del laboratorio) y una tecla que corta al instante. El interlocutor lo oye como aviso al inicio. | Un indicador que el vendedor «acomoda» en segundo plano. Se exige que la captura pare sola si el indicador no responde. |
| **Ayudante pineado por hash** | El binario o DLL se distribuye con SHA-256 publicado; `dictado instala` lo verifica antes de copiarlo y `diagnostico` lo vuelve a comprobar. Cambiarlo es CDC (C1). | Un desarrollador que lo recompila «rápido» sin anotar. |
| **Sin audio persistente** | Igual que el demonio: el audio se procesa en memoria por turnos y no se escribe; el acta es texto y vive donde el usuario decida, con la retención declarada. | Un temporal de depuración que se queda. Se cubre con la auditoría de fugas del `validate`. |
| **Token y loopback** | El ayudante entrega audio por tubería local; el demonio sigue solo en 127.0.0.1 con Bearer. Nada escucha en la red. | Un «por comodidad» que lo abra a la LAN. El verificador de gobernanza ya rechaza el `service_role` en superficies; aquí se añadiría el mismo control para `DICTADO_ESCUCHA`. |
| **Kill-switch probado** | Parar el ayudante, el demonio y el dictado con un comando (`en-vivo --parar` ya lo hace para los dos últimos) y **probarlo** cada vez que cambie el ayudante. | Un kill-switch que nunca se ejercitó (§9 de la gobernanza). |
| **Validación de entrada** | Lo que dice el interlocutor es DATO: alimenta reglas, nunca instrucciones. Si un día hay LLM (Fase 4), esto pasa por la AISIA de Fase 4 y por seudonimización. | Ninguna hoy, porque no hay LLM. Se anota para que nadie lo olvide. |

## Priorización

Primero **O3 y O5**: son los que no requieren atacante hábil. O3 se mitiga con el indicador
que no se oculta y con el aviso hablado al inicio; O5 con el hash pineado y el CDC. O2 es el
siguiente cuando exista un LLM: hoy las reglas del asesor citan evidencia y no ejecutan nada.

## Decisión que se pide

Firmar este modelo como condición para abrir el PRP del ayudante de Windows. Sin firma, el caso
19 sigue en PUERTA HUMANA y solo existe el spike con audio propio (`scripts/laboratorio-voz/spike-llamada.mjs`).

Firmado por: ____________  Rol: ____________  Fecha: ____________
