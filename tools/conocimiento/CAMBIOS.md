# Cambios del conocimiento

Semver del paquete, según la Fase 0 de PRP-005:
- **parche**: una cita o un texto que no cambia ningún veredicto;
- **menor**: una regla nueva o cerrada;
- **mayor**: un cambio de significado o de vocabulario.

Mientras la versión sea `0.x`, lo mayor sube la menor. Cada versión lista las reglas añadidas,
cerradas y cambiadas, y quién firmó lo que cambia un veredicto.

## 0.1.0 — 2026-09-27

Migración única desde `lisagomez/hermes-os-a2a@97d9f9e`. Es el corte que Hermes tiene congelado
desde su PR #317, con la misma huella del seed.

- **Importado con su historial**, filtrado con git-filter-repo 2.47.0: `reglas.json` (y su
  predecesor `reglas_mx.json`), la plantilla de investigación y el dictamen de la frontera
  financiera, 16 commits de historia de las reglas. Archivos byte a byte idénticos al origen, y
  `audita:secretos` limpio sobre toda la historia.
- **Repartido en 17 dominios** (un archivo por dominio) y 4 archivos de reglas generales por ámbito,
  con 98 reglas y 61 categorías. Cada dominio cita (todas sus fuentes son leyes publicadas) y
  lleva su fecha de corte y su parte de la procedencia. La procedencia partida vuelve a unirse
  en el texto original sin perder un carácter.
- **Sin cambiar ningún veredicto**: el motor de Hermes, corrido sobre este paquete, da 576 de 782
  respuestas idénticas y 206 iguales salvo el orden de sus listas, con 0 diferencias de contenido.
- **Pendiente, a propósito**: el conflicto de `INTERESES` sigue como en Hermes. La regla de 2010
  que Hermes borró (`MX-LFPDPPP-21-CONFIDENCIALIDAD`) no está, porque el `_bajas` de Hermes la
  borraba y el contrato no admite bajas. Las dos correcciones cambian veredictos y van con firma.
