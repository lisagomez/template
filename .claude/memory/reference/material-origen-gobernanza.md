# Dónde vive el material de origen de la gobernanza

**Ruta:** `/home/gsore/code/a2aboths/businessos/gobernanza/` (proyecto Hermes OS, 9 docs)

> **No disponible en esta máquina** (comprobado 2026-08-26: `/home/gsore` no existe). La ruta
> es la de la máquina donde se destiló la capa; aquí vale como referencia histórica. Si hace
> falta releer un original, pedirlo a la responsable del proyecto.

Es material de **lectura**, no se modifica desde este repo. Si hay que revisar por qué un
control quedó como quedó, la fuente está ahí y es más densa que el destilado.

## Qué se conservó

| Documento origen | Se convirtió en |
|---|---|
| `gobernanza-ciclo-de-vida.md` | C1 (CDC con gate proporcional al radio) y C2 (golden sets) |
| `modelo-amenazas-v1.md` | C3 — el método de 5 pasos y el catálogo O1-O6/G1-G6 |
| `adenda-iso42001.md` | C4 (plantilla AISIA) y el mapa de etapas AIMS-lite |
| `decision-service-role.md` | C7 — es el que más directo aplica a este stack |
| `procedimiento-incidente-inyeccion.md` | C6, generalizado más allá del correo |
| `registro-decisiones-riesgo-buzon.md` | C5 — el formato append-only |
| `politica-correo-agentico.md` | El patrón (agente sin credenciales, firma humana, allowlist, interruptor) |

## Qué se descartó y por qué

- `anclas-de-confianza.md` — ceremonia PKI de Hyperledger Fabric, YubiKeys, MSP. Un
  boilerplate Next.js + Supabase no tiene nada de eso. Solo se rescataron 3 principios:
  *un respaldo no probado no es un respaldo*, *el control negativo que DEBE fallar*, y
  *el error silencioso se evita por estructura, no por configuración*.
- `adenda-web-agentica.md` — x402, ERC-8004, A2A, AP2. Roadmap de un proyecto blockchain.

**Fue una decisión, no un olvido.** Si algún día el template sirve a un proyecto con
cadena o PKI propia, esos dos documentos son el punto de partida.
