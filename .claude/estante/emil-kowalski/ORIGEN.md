# Origen (vendorizado y pineado)

- **Repositorio**: `github.com/emilkowalski/skills`
- **Commit**: `f1090bec277140d02ed202440185ad9d02ac1490`
- **Ruta en el upstream**: `skills/<skill>/`
- **Licencia**: MIT (`LICENSE` al lado, copiada del mismo commit)
- **Vendorizado**: 2026-11-02, goal `docs/goals/gradio-marca-turno25.md`
- **Texto del upstream**: sin tocar. Se actualiza por diff contra un commit nuevo, como CDC; nunca sigue al HEAD.

ESTANTE: fuera de `.claude/skills/`, así que no cuesta contexto por sesión. Se lee por ruta cuando toca (la doc de `turno-25` dice cuándo). Su parte comprobable vive en `scripts/marca/revisa-interfaz.mjs` y en el generador de peor caso de `tools/banco-motores`. Pasar uno a `.claude/skills/` es un CDC y tiene que caber en el presupuesto de contexto.

| Archivo | sha256 |
|---|---|
| `LICENSE` | `sha256:4ff5bdb7887ec1435c9cab0e8d1a7caee704d894d65c2a008ccc68b1cc2f260b` |
| `animate/RECIPES.md` | `sha256:21ff63d84391db8d96ecdf9170095f55a42c836ccc36fd3269c4772bab031ba2` |
| `animate/SKILL.md` | `sha256:39138996033e0dbe53e73217514116eaeca774bae84a0687c80d445a4e0cc3a6` |
| `animation-performance/SKILL.md` | `sha256:6c60f45ab416ff3f7d7765a5427beead77fab0d82487fe610d2a298397558d0a` |
| `animation-vocabulary/SKILL.md` | `sha256:40d2b27adfdfeb0570a9f20e7d0255109d9233c50603878bcd0dcd04c923fd94` |
| `break-ui/CATALOG.md` | `sha256:7358efcc6bb48e35187be1c064cf60022dcb18c72c18fab58b606dfc5f421f15` |
| `break-ui/SKILL.md` | `sha256:e7eec1d70ac56a04255e9c0dbe98084ea3d544cc04aaad34f32c95d6fa9dff5e` |
| `find-animation-opportunities/SKILL.md` | `sha256:d52a377819b84a71930f0c822cfe2849f40301605a2d5c7eccbfa3b257700df2` |
| `improve-animations/AUDIT.md` | `sha256:63fa8fcf7e7b3a3e252938e55c60e1f399f607e73553163e8dacf9df40f3ebed` |
| `improve-animations/PLAN-TEMPLATE.md` | `sha256:0a08ac8e23fd2082d7ffb86aeed7b789de77328c3cf874b16f1a755f2ef0a6ad` |
| `improve-animations/SKILL.md` | `sha256:73962447464433476343e2c12cd08ab39cc99a9e5f3c118c5fb54ed897574ef6` |
| `mobile-native/SKILL.md` | `sha256:888b7651d66d66dbac4e72b7c554638eb19bd971d686d6cbdf030a5ef3788f55` |
| `prototype/PICKER.md` | `sha256:31a55eec94715cc79942e91e172e539e3031dcd5e2e5ee7c1446cf2caee960a6` |
| `prototype/SKILL.md` | `sha256:bba39c955eb1871c5a02733976ceec5d0324198e0812e667604756489c89f7b9` |
| `remove-animations/SKILL.md` | `sha256:dea95b7a7ef81cba312c7f70a3c5c67d7e06a287cb16b16d2f90f2b1fb0afff9` |
| `review-animations/SKILL.md` | `sha256:5f9fb98b69cace7107af8b393a4196fd42fa42d98bce0e5afc1f866ff3b8a41c` |
| `review-animations/STANDARDS.md` | `sha256:8f5fe3f5a04537556dd4e6a37f7a8d6f616d840eb80f2f68b5b594febb170657` |
