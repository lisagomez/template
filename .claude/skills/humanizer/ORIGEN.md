# Origen (vendorizado y pineado)

- **Repositorio**: `github.com/blader/humanizer`
- **Commit**: `225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8`
- **Ruta en el upstream**: `SKILL.md (el plugin solo declara `"skills": ["./"]`)`
- **Licencia**: MIT (`LICENSE` al lado, copiada del mismo commit)
- **Vendorizado**: 2026-11-02, goal `docs/goals/gradio-marca-turno25.md`
- **Texto del upstream**: sin tocar. Se actualiza por diff contra un commit nuevo, como CDC; nunca sigue al HEAD.

Se carga en cada sesión (116 tokens de descripción). La voz de Turno 25 entra como MUESTRA (sección Voz de `.claude/design-systems/turno-25/turno-25.md`), no editando este texto. Su parte comprobable vive en `scripts/marca/revisa-voz.mjs`.

| Archivo | sha256 |
|---|---|
| `LICENSE` | `sha256:4ac4810254ab36d45419141aeb8e69bf50652cfafe5b2dab947d06d44e5cbf96` |
| `SKILL.md` | `sha256:0612f1dfb1672b0ea9b97e139bf1f06cabe98d8b27424fe8ff01e1fb4cc99cad` |
