# Propuestas para firma (Etapa 3)

Aquí deja el agente los borradores de bitácora, AISIA, modelo de amenazas y aviso legal de la
Etapa 3. Nada de esto entra en `.claude/gobernanza/` hasta que una persona lo firme; entonces se
pega en el registro que toque y se borra de aquí. Ninguno deja nada sin decidir: cada uno
lleva una decisión propuesta y una línea de firma.

| Archivo | Control | Qué decide quien firma |
|---|---|---|
| `AISIA-educacion-menores.md` | C4 | Si el caso 10 (competencias orales) se ofrece a menores, y con qué seis condiciones. Decisión propuesta: **no ofrecer a menores hasta firma**. |
| `bitacora-caso-10-segundo-motor.md` | C1 | Que el caso 10 ofrezca el segundo motor (faster-whisper small, ya en el banco) como opción para medir muletillas, y que el demonio cargue ese respaldo por idioma. Con la medición que lo justifica. |
| `modelo-amenazas-llamadas.md` | C3 | Condiciones del futuro ayudante de Windows para capturar llamadas (indicador, tecla de corte, hash pineado, sin audio persistente, kill-switch). |
| `AISIA-llamadas.md` | C4 | Impacto sobre el interlocutor que no consintió y los terceros mencionados. Decisión propuesta: **no ofrecer hasta ayudante + firmas**. |
| `aviso-legal-grabacion.md` | revisión jurídica | El texto que la máquina lee al inicio de una llamada y los seis puntos que un jurista debe resolver. |

Lo que NO hay aquí, y por qué: ninguna propuesta de cambiar el defecto de ganancia ni los
umbrales del VAD (se añade solo si `mide-ganancia.mjs` y `calibra.mjs --campo` cumplen su regla,
ver `resultados-etapa-3.md`), y ninguna propuesta de Silero en el navegador: con el suelo
calibrado, el detector por energía se calló 10/10 con ruido rosa a SNR 8 y 18 dB, así que el
CDC no hace falta todavía (ruido continuo y estacionario; con voces de fondo no está medido).
