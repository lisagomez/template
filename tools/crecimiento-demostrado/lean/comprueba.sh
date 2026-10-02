#!/usr/bin/env bash
# Comprueba las demostraciones con el toolchain PINEADO de `lean-toolchain`. Sin el binario, el
# resultado es «no medido» (salida 2), no un verde: un teorema sin comprobar no está demostrado.
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)"
version="$(sed -E 's/.*:v//' "$dir/lean-toolchain")"
lean="${LEAN:-$HOME/.local/lean/lean-${version}-linux/bin/lean}"
if [ ! -x "$lean" ]; then echo "no medido: falta Lean ${version} (${lean})"; exit 2; fi
real="$("$lean" --version)"
case "$real" in *"version ${version}"*) ;; *) echo "no medido: se pidió Lean ${version} y hay «${real}»"; exit 2;; esac
"$lean" "$dir/Puente.lean"
echo "✓ ${real}: Puente.lean comprobado (suma_particion, suma_delta, delta_total, puente_clasico y su contraejemplo)"
