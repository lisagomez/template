# El job de la capa semántica de Soporte SAP (perfil `semantica` del compose). Imagen base pineada por
# digest y dependencias por lock con hashes: lo que corre es exactamente lo que se probó.
FROM python@sha256:57cd7c3a7a273101a6485ba99423ee568157882804b1124b4dd04266317710de

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    DBT_SEND_ANONYMOUS_USAGE_STATS=false \
    DO_NOT_TRACK=1 \
    DBT_PROFILES_DIR=/semantica/perfil \
    SS_DBT_TARGET=produccion \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /semantica
COPY requirements.lock ./
RUN pip install --require-hashes -r requirements.lock
COPY dbt_project.yml consultas.json job.py ./
COPY macros ./macros
COPY modelos ./modelos
COPY pruebas ./pruebas
COPY perfil ./perfil
COPY semillas/_semillas.yml ./semillas/_semillas.yml

# Sin privilegios: escribe solo en su directorio de trabajo (target/ y logs/ de dbt).
RUN chown -R nobody:nogroup /semantica
USER nobody
ENTRYPOINT ["python", "job.py"]
