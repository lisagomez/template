# comando: npm run revisa:readmes
# fecha: 2026-10-02T15:16:42.099Z
# commit: f2ba87ff462b81e9937d32c29c4d091bbb6a549f
# salida: 0
# capturado por scripts/analista-producto/medidores.mjs; colores ANSI quitados

> saas-factory-app@0.1.0 revisa:readmes
> node scripts/revisa-readmes.mjs

Contrato product first (.claude/skills/readme/contrato.json): Qué hace → Casos de uso → Requerimientos de infraestructura → lo demás

  ✓ src/features/.template/README.md
  ✓ src/features/estudio-pymes/README.md
  ✓ src/features/etiquetas/README.md
  ✓ src/features/laboratorio-pymes/README.md
  ✓ src/features/reel/README.md
  ✓ src/features/ventas-whatsapp/README.md
  ✓ tools/asesor-ventas/README.md
  ✓ tools/conocimiento/README.md
  ✓ tools/dictado/README.md
  ✓ tools/ejemplo-herramienta/README.md
  ✓ tools/etiquetas-gs1/README.md
  ✓ tools/extractor-documental/README.md
  ✓ tools/grafo-conocimiento/README.md
  ✓ tools/pymes-marketing/README.md
  ✓ tools/reel/README.md
  ✓ tools/ventas-whatsapp/README.md
  ✓ tools/voz/README.md

Excluidos con motivo (13):
  · .claude/README.md — documentación de la fábrica; la gobernanza lee sus cifras
  · .claude/design-systems/README.md — catálogo de referencias de diseño, no un producto
  · .claude/goals/voz-casos-ampliados/propuestas/README.md — material de trabajo de un goal, no un producto
  · .claude/skills/SKILLS_README.md — documentación de skills: se rige por SKILL.md y los contratos C2, no por este contrato
  · .claude/skills/goal-compiler/README-PAQUETE.md — documentación de skills: se rige por SKILL.md y los contratos C2, no por este contrato
  · .claude/skills/google-workspace/README-PAQUETE.md — documentación de skills: se rige por SKILL.md y los contratos C2, no por este contrato
  · .claude/skills/knowledge-search/README-PAQUETE.md — documentación de skills: se rige por SKILL.md y los contratos C2, no por este contrato
  · .claude/skills/spec-generator/README.md — documentación de skills: se rige por SKILL.md y los contratos C2, no por este contrato
  · README.md — README raíz: lo lee la gobernanza (cifras de comprobaciones, conteo de skills, sección de la capa); no es de un producto
  · erp/migrations/README.md — reglas de las migraciones del ERP (documentación de arquitectura)
  · src/features/README.md — arquitectura feature-first, no una feature
  · src/shared/README.md — arquitectura del código compartido, no un producto
  · trayectorias/README.md — formato de datos de la fábrica, no un producto

Sin README: pendientes, se listan y no se crean solos (9):
  · src/features/a2a
  · src/features/ajustes
  · src/features/auth
  · src/features/dashboard
  · src/features/dictado
  · src/features/historial
  · src/features/laboratorio-etiquetas
  · src/features/laboratorio-voz
  · src/features/project-settings

README product first al día: 17 en alcance · 17 conformes · 0 no conformes · 13 excluidos · 9 sin README (pendientes).
