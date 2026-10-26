# Instancias del Arbrain personal («local» y «vps») y el relevo de la red privada simulada.
# Lo construye `prueba.mjs` con el builder clásico (aquí no hay buildx) sobre un contexto que arma FUERA del repo:
# este Dockerfile, job/, imagen/ y arbrain/ (el bundle de cada etiqueta, sacado del espejo de solo lectura, y una
# copia del ancla de firmas). Ninguna llave ni sesión entra al contexto. Nada de esto se despliega.
#
#   base          Node pineado (versión exacta + digest) + git, ssh-keygen, python3, ss, ps. Usuario sin privilegios.
#   red           el relevo (como un DERP de Tailscale): el ÚNICO proceso que escucha en la red interna.
#   clon          clona el bundle y RE-VERIFICA la firma de la etiqueta con la misma ancla del lock (su sha256 se
#                 comprueba). Si algo no cuadra, la imagen no se construye.
#   arbrain-base  base + la copia verificada (sin el bundle) + el ancla, en el home de «arbrain».
#   programa      baja el programa ya compilado de ESA etiqueta y lo acepta solo si su sha256 y su tamaño son los de
#                 la línea «programa linux-x64 <sha256> <bytes>» del mensaje de la etiqueta firmada.
#   fuente        arbrain-base + el job (la instancia «antigua», v0.2.9: sin programa, no arranca la app).
#   instancia     arbrain-base + el programa extraído (sin el tar) donde lo espera el modo servidor + el job.
# El job se copia al final: cambiarlo no invalida la capa del programa (350 MB).

ARG BASE=node:22.23.2-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5

FROM ${BASE} AS base
# Paquetes de bookworm (la base va pineada por digest; apt trae lo de esa rama estable).
RUN apt-get update \
 && apt-get install -y --no-install-recommends git openssh-client python3 iproute2 procps ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# El usuario «node» de la imagen ocupa el uid 1000: se reemplaza por «arbrain» (sin sudo, sin privilegios).
RUN userdel -r node \
 && useradd --create-home --uid 1000 --shell /bin/bash arbrain \
 && install -d -o arbrain -g arbrain -m 0700 /srv/cerebro
ENV CEREBRO_SYNC=/opt/cerebro-sync

FROM base AS red
COPY job/ /opt/cerebro-sync/
USER arbrain
WORKDIR /home/arbrain
CMD ["node", "/opt/cerebro-sync/tunel.mjs", "relevo"]

FROM base AS clon
ARG ETIQUETA
ARG COMMIT
ARG ANCLA_SHA256
COPY arbrain/ /contexto/
RUN set -eu; \
    test -n "${ETIQUETA}" && test -n "${COMMIT}" && test -n "${ANCLA_SHA256}"; \
    echo "${ANCLA_SHA256}  /contexto/firmas-permitidas" | sha256sum -c --quiet -; \
    git bundle list-heads "/contexto/arbrain-${ETIQUETA}.bundle" | grep -q " refs/tags/${ETIQUETA}$"; \
    git clone -q --origin dani --branch "${ETIQUETA}" "/contexto/arbrain-${ETIQUETA}.bundle" /Arbrain 2>/dev/null; \
    cd /Arbrain; \
    git remote set-url dani https://github.com/arbrain-ai/arbrain.git; \
    test "$(git cat-file -t "refs/tags/${ETIQUETA}")" = tag; \
    git -c gpg.format=ssh -c gpg.ssh.program=ssh-keygen -c gpg.ssh.allowedSignersFile=/contexto/firmas-permitidas \
        verify-tag "${ETIQUETA}" 2>&1 | grep -q '^Good "git" signature for arbrain-'; \
    test "$(git rev-parse HEAD)" = "${COMMIT}"; \
    test "$(git rev-parse "${ETIQUETA}^{commit}")" = "${COMMIT}"; \
    test "v$(cat VERSION)" = "${ETIQUETA}"; \
    echo "FIRMA_OK ${ETIQUETA} $(git rev-parse --short HEAD) (re-verificada dentro de la imagen con el ancla del lock)"

FROM base AS arbrain-base
USER arbrain
WORKDIR /home/arbrain
# Las carpetas se crean antes y como «arbrain»: COPY --chown deja de root las intermedias que él crea.
# ~/.cerebro-sync: estado del job (repo del cerebro, avisos), fuera de ~/Arbrain y de la carpeta de datos de la app.
RUN mkdir -p /home/arbrain/.config/arbrain /home/arbrain/.cerebro-sync /home/arbrain/.local/share/ai.arbrain.servidor/programa \
 && chmod 700 /home/arbrain/.config /home/arbrain/.cerebro-sync /home/arbrain/.local/share/ai.arbrain.servidor
COPY --from=clon --chown=arbrain:arbrain /Arbrain /home/arbrain/Arbrain
COPY --from=clon --chown=arbrain:arbrain /contexto/firmas-permitidas /home/arbrain/.config/arbrain/firmas-permitidas

# El builder clásico construye toda etapa anterior al objetivo: «fuente» (v0.2.9, sin programa) va antes de «programa».
FROM arbrain-base AS fuente
COPY job/ /opt/cerebro-sync/
COPY imagen/ /opt/cerebro-sync/imagen/
# El resumen de producto (PASO 5b): la capa empaquetada y su zod pineado, junto al job, sin red al construir.
COPY capa-paquete/ /opt/cerebro-sync/node_modules/@tu-scope/capa/
COPY zod/ /opt/cerebro-sync/node_modules/zod/
ENTRYPOINT ["/opt/cerebro-sync/imagen/arranque.sh"]

FROM arbrain-base AS programa
ARG ETIQUETA
ARG PROGRAMA_SHA256
ARG PROGRAMA_BYTES
COPY imagen/baja-programa.mjs /opt/descarga/baja-programa.mjs
RUN set -eu; \
    test -n "${PROGRAMA_SHA256}" && test -n "${PROGRAMA_BYTES}"; \
    cd /home/arbrain/Arbrain; \
    git tag -l --format='%(contents)' "${ETIQUETA}" | grep -qx "programa linux-x64 ${PROGRAMA_SHA256} ${PROGRAMA_BYTES}"; \
    mkdir -p /home/arbrain/descarga /home/arbrain/programa; \
    node /opt/descarga/baja-programa.mjs \
      "https://github.com/arbrain-ai/arbrain/releases/download/${ETIQUETA}/arbrain-programa-${ETIQUETA}-linux-x64.tar.gz" \
      /home/arbrain/descarga/programa.tgz "${PROGRAMA_SHA256}" "${PROGRAMA_BYTES}"; \
    tar -xzf /home/arbrain/descarga/programa.tgz -C /home/arbrain/programa; \
    test -x /home/arbrain/programa/node/node; \
    printf '%s\n' "${PROGRAMA_SHA256}" > /home/arbrain/programa/.verificado; \
    echo "PROGRAMA_OK ${ETIQUETA} linux-x64 (sha256 y tamaño de la etiqueta firmada)"

FROM arbrain-base AS instancia
ARG ETIQUETA
# Disposición del modo servidor (arbrain/scripts/servidor/rutas.mjs y programa.mjs): <datos>/programa/vX-linux-x64
# con la marca `.verificado` = la huella firmada. servidor.mjs vuelve a verificar la etiqueta al arrancar.
COPY --from=programa --chown=arbrain:arbrain /home/arbrain/programa /home/arbrain/.local/share/ai.arbrain.servidor/programa/${ETIQUETA}-linux-x64
COPY job/ /opt/cerebro-sync/
COPY imagen/ /opt/cerebro-sync/imagen/
# El resumen de producto (PASO 5b): la capa empaquetada y su zod pineado, junto al job, sin red al construir.
COPY capa-paquete/ /opt/cerebro-sync/node_modules/@tu-scope/capa/
COPY zod/ /opt/cerebro-sync/node_modules/zod/
ENTRYPOINT ["/opt/cerebro-sync/imagen/arranque.sh"]
