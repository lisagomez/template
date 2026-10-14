-- PRP-013 fase 7: esquema multiempresa del sistema integrado ISO 9001 + ISO/IEC 42001 (prefijo sgi_).
-- Todo lo aprobable se aprueba como VERSIÓN EXACTA (huella SHA-256) en sgi_aprobacion, que es inmutable; los estados
-- «aprobado/firmado/eficaz» solo los escribe el disparador de aprobación (migración 20260930100100). RLS en toda tabla,
-- ninguna superficie usa service_role (C7). Idempotente y no destructiva.

create table if not exists public.sgi_despacho (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 2 and 120),
  -- Marca blanca: {nombre_corto, color_primario (#rrggbb), color_acento, lema}. Nunca un logo remoto (sin salida de datos).
  marca jsonb not null default '{}'::jsonb check (jsonb_typeof(marca) = 'object'),
  creado_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_despacho_miembro (
  despacho_id uuid not null references public.sgi_despacho (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (despacho_id, user_id)
);

create table if not exists public.sgi_organizacion (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 2 and 120),
  sector text not null default '' check (char_length(sector) <= 120),
  empleados integer not null default 1 check (empleados between 1 and 100000),
  ubicacion text not null default '' check (char_length(ubicacion) <= 120),
  -- Perfil para los agentes: procesos, productos, puestos, clientes tipo, proveedores clave. Puestos, nunca personas.
  perfil jsonb not null default '{}'::jsonb check (jsonb_typeof(perfil) = 'object'),
  despacho_id uuid references public.sgi_despacho (id) on delete set null,
  -- La app misma como su primer inquilino 42001.
  es_casa boolean not null default false,
  -- Quien la dio de alta la ve desde el primer instante (la membresía la crea un disparador DESPUÉS del insert, y
  -- `insert … returning` evalúa la política de lectura antes: medido, 42501).
  creado_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_membresia (
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rol text not null check (rol in ('consultor', 'admin_pyme', 'alta_direccion', 'dueno_proceso', 'auditor_interno')),
  puesto text check (puesto is null or char_length(puesto) <= 80),
  creado_en timestamptz not null default now(),
  primary key (organizacion_id, user_id, rol)
);

-- Espejo de los IDs del catálogo (tools/sistema-integrado): integridad referencial y la puerta en SQL.
create table if not exists public.sgi_requisito (
  id text primary key check (id ~ '^SGI-(C|Q|IA|A)-[0-9][0-9.]*-[0-9]{2}$'),
  familia text not null check (familia in ('C', 'Q', 'IA', 'A')),
  fase integer not null check (fase between 0 and 8),
  obligatorio boolean not null,
  ediciones text[] not null,
  tema text not null
);

create table if not exists public.sgi_proyecto (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 2 and 120),
  ediciones text[] not null check (
    cardinality(ediciones) between 1 and 3
    and ediciones <@ array['iso-9001:2015+a1:2024', 'iso-9001:2026', 'iso-iec-42001:2023']::text[]
  ),
  usa_ia boolean not null default false,
  disena boolean not null default false,
  diagnostico jsonb not null default '{}'::jsonb check (jsonb_typeof(diagnostico) = 'object'),
  diagnostico_completo boolean not null default false,
  -- {id_requisito: justificación}. Una justificación vacía no excluye nada.
  no_aplica jsonb not null default '{}'::jsonb check (jsonb_typeof(no_aplica) = 'object'),
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_tarea (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  proyecto_id uuid not null references public.sgi_proyecto (id) on delete cascade,
  fase integer not null check (fase between 0 and 8),
  titulo text not null check (char_length(titulo) between 2 and 200),
  responsable_puesto text check (responsable_puesto is null or char_length(responsable_puesto) <= 80),
  vence date,
  hecha boolean not null default false,
  requisitos text[] not null default '{}',
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_traza (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  proyecto_id uuid references public.sgi_proyecto (id) on delete cascade,
  agente text not null check (agente in ('orquestador', 'diagnostico', 'contexto', 'riesgos', 'documental', 'capacitacion', 'proveedores', 'kpis', 'auditoria', 'portafolio')),
  version_prompt text not null,
  modelo text not null check (modelo !~* 'latest'),
  insumos jsonb not null default '[]'::jsonb,
  salida_huella text check (salida_huella is null or salida_huella ~ '^sha256:[0-9a-f]{64}$'),
  requisitos_citados text[] not null default '{}',
  -- null = el proveedor no reportó uso: se guarda así, nunca como cero.
  uso jsonb,
  costo_usd numeric(12, 6),
  intentos integer not null default 1 check (intentos between 1 and 5),
  alertas jsonb not null default '{}'::jsonb,
  ok boolean not null,
  salida jsonb,
  errores text[] not null default '{}',
  creado_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  check ((uso is null) = (costo_usd is null))
);

create table if not exists public.sgi_documento (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  proyecto_id uuid not null references public.sgi_proyecto (id) on delete cascade,
  tipo text not null check (tipo in ('politica', 'procedimiento', 'formato', 'soa', 'evaluacion_impacto', 'objetivos', 'riesgos',
    'plan_proyecto', 'plan_capacitacion', 'contexto', 'alcance', 'informe')),
  titulo text not null check (char_length(titulo) between 2 and 200),
  requisitos text[] not null default '{}',
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_documento_version (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.sgi_documento (id) on delete cascade,
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  numero integer not null check (numero >= 1),
  -- {secciones: [{titulo, parrafos[]}]}
  contenido jsonb not null check (jsonb_typeof(contenido) = 'object'),
  huella text not null check (huella ~ '^sha256:[0-9a-f]{64}$'),
  estado text not null default 'borrador' check (estado in ('borrador', 'en_revision', 'aprobado', 'rechazado')),
  generico boolean not null default false,
  motivo_generico text,
  traza_id uuid references public.sgi_traza (id) on delete set null,
  creado_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  unique (documento_id, numero),
  -- L7: un documento genérico no pasa a revisión ni se aprueba.
  check (not (generico and estado in ('en_revision', 'aprobado')))
);

create table if not exists public.sgi_evidencia (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  proyecto_id uuid not null references public.sgi_proyecto (id) on delete cascade,
  titulo text not null check (char_length(titulo) between 2 and 200),
  tipo text not null check (tipo in ('documento', 'registro', 'acta', 'foto', 'otro')),
  -- Texto de la evidencia (escrito por terceros: NO confiable). Archivos = PRP-013 fase 12, bloqueada.
  contenido text not null default '' check (char_length(contenido) <= 20000),
  huella text not null check (huella ~ '^sha256:[0-9a-f]{64}$'),
  origen text not null default 'subida' check (origen in ('subida', 'documento_aprobado')),
  documento_version_id uuid references public.sgi_documento_version (id) on delete set null,
  subida_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_evidencia_requisito (
  evidencia_id uuid not null references public.sgi_evidencia (id) on delete cascade,
  requisito_id text not null references public.sgi_requisito (id),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  primary key (evidencia_id, requisito_id)
);

create table if not exists public.sgi_aprobacion (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  proyecto_id uuid references public.sgi_proyecto (id) on delete cascade,
  objeto_tipo text not null check (objeto_tipo in ('politica', 'soa', 'evaluacion_impacto', 'objetivos', 'riesgos', 'plan_proyecto',
    'procedimiento', 'documento_general', 'evidencia', 'plan_capacitacion', 'proveedor', 'hallazgo', 'eficacia_accion', 'cierre_fase')),
  objeto_id uuid,
  fase integer check (fase is null or fase between 0 and 8),
  version integer check (version is null or version >= 1),
  huella text check (huella is null or huella ~ '^sha256:[0-9a-f]{64}$'),
  decision text not null check (decision in ('aprobado', 'rechazado')),
  motivo text check (motivo is null or char_length(motivo) <= 1000),
  rol text not null check (rol in ('admin_pyme', 'alta_direccion', 'dueno_proceso', 'auditor_interno')),
  aprobado_por uuid not null default auth.uid() references auth.users (id) on delete restrict,
  creado_en timestamptz not null default now(),
  revocada_en timestamptz,
  check (decision = 'aprobado' or char_length(coalesce(motivo, '')) > 0),
  check ((objeto_tipo = 'cierre_fase') = (fase is not null and objeto_id is null and proyecto_id is not null)),
  check (objeto_tipo = 'cierre_fase' or (objeto_id is not null and huella is not null))
);
create unique index if not exists sgi_aprobacion_un_cierre on public.sgi_aprobacion (proyecto_id, fase)
  where objeto_tipo = 'cierre_fase' and decision = 'aprobado' and revocada_en is null;

-- Contexto y planificación: filas de trabajo (propuestas o editadas por personas). Lo que se APRUEBA es la
-- versión del documento que las fotografía (matriz de riesgos v2, SoA v1…), con su huella.
create table if not exists public.sgi_asunto (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  proyecto_id uuid not null references public.sgi_proyecto (id) on delete cascade,
  tipo text not null check (tipo in ('interno', 'externo')),
  categoria text not null default '' check (char_length(categoria) <= 40),
  descripcion text not null check (char_length(descripcion) between 2 and 1000),
  efecto text not null default 'negativo' check (efecto in ('positivo', 'negativo')),
  requisitos text[] not null default '{}',
  traza_id uuid references public.sgi_traza (id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_parte_interesada (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  proyecto_id uuid not null references public.sgi_proyecto (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 2 and 120),
  necesidades text not null default '' check (char_length(necesidades) <= 1000),
  se_atiende boolean not null default true,
  requisitos text[] not null default '{}',
  traza_id uuid references public.sgi_traza (id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_sistema_ia (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 2 and 120),
  proposito text not null check (char_length(proposito) between 2 and 500),
  papel text not null check (papel in ('desarrolla', 'provee', 'usa', 'integra')),
  proveedor text check (proveedor is null or char_length(proveedor) <= 120),
  datos text not null default '' check (char_length(datos) <= 1000),
  estado_ciclo text not null default 'produccion' check (estado_ciclo in ('idea', 'desarrollo', 'pruebas', 'produccion', 'retirado')),
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_riesgo (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  proyecto_id uuid not null references public.sgi_proyecto (id) on delete cascade,
  tipo text not null check (tipo in ('riesgo', 'oportunidad', 'riesgo_ia')),
  descripcion text not null check (char_length(descripcion) between 2 and 1000),
  probabilidad integer not null check (probabilidad between 1 and 5),
  impacto integer not null check (impacto between 1 and 5),
  nivel integer generated always as (probabilidad * impacto) stored,
  tratamiento text not null default '' check (char_length(tratamiento) <= 1000),
  sistema_ia_id uuid references public.sgi_sistema_ia (id) on delete set null,
  requisitos text[] not null default '{}',
  traza_id uuid references public.sgi_traza (id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_evaluacion_impacto (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  proyecto_id uuid not null references public.sgi_proyecto (id) on delete cascade,
  sistema_ia_id uuid not null references public.sgi_sistema_ia (id) on delete cascade,
  afectados text not null check (char_length(afectados) between 2 and 500),
  descripcion text not null check (char_length(descripcion) between 2 and 2000),
  severidad text not null check (severidad in ('baja', 'media', 'alta')),
  medidas text not null default '' check (char_length(medidas) <= 2000),
  requisitos text[] not null default '{}',
  traza_id uuid references public.sgi_traza (id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_control_soa (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  proyecto_id uuid not null references public.sgi_proyecto (id) on delete cascade,
  control text not null check (control ~ '^A\.[0-9]+(\.[0-9]+)+$'),
  requisito_id text not null references public.sgi_requisito (id),
  aplica boolean not null,
  justificacion text not null check (char_length(justificacion) between 5 and 1000),
  estado_impl text not null default 'no_iniciado' check (estado_impl in ('no_iniciado', 'en_curso', 'implementado')),
  traza_id uuid references public.sgi_traza (id) on delete set null,
  creado_en timestamptz not null default now(),
  unique (proyecto_id, control)
);

create table if not exists public.sgi_objetivo (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  proyecto_id uuid not null references public.sgi_proyecto (id) on delete cascade,
  descripcion text not null check (char_length(descripcion) between 2 and 500),
  meta text not null check (char_length(meta) between 1 and 200),
  plazo date,
  requisitos text[] not null default '{}',
  traza_id uuid references public.sgi_traza (id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_indicador (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  proyecto_id uuid not null references public.sgi_proyecto (id) on delete cascade,
  objetivo_id uuid references public.sgi_objetivo (id) on delete set null,
  nombre text not null check (char_length(nombre) between 2 and 160),
  formula text not null check (char_length(formula) between 2 and 500),
  meta numeric not null,
  unidad text not null default '%' check (char_length(unidad) <= 20),
  -- mayor = más es mejor; menor = menos es mejor
  sentido text not null default 'mayor' check (sentido in ('mayor', 'menor')),
  frecuencia text not null default 'mensual' check (frecuencia in ('mensual', 'trimestral', 'semestral', 'anual')),
  requisitos text[] not null default '{}',
  traza_id uuid references public.sgi_traza (id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_medicion (
  id uuid primary key default gen_random_uuid(),
  indicador_id uuid not null references public.sgi_indicador (id) on delete cascade,
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  periodo text not null check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  valor numeric not null,
  creado_en timestamptz not null default now(),
  unique (indicador_id, periodo)
);

create table if not exists public.sgi_competencia (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  proyecto_id uuid not null references public.sgi_proyecto (id) on delete cascade,
  -- Por PUESTO, nunca por persona (AISIA de PRP-013).
  puesto text not null check (char_length(puesto) between 2 and 80),
  competencia text not null check (char_length(competencia) between 2 and 300),
  nivel_requerido text not null default '' check (char_length(nivel_requerido) <= 80),
  como_se_evalua text not null default '' check (char_length(como_se_evalua) <= 300),
  brecha boolean not null default true,
  requisitos text[] not null default '{}',
  traza_id uuid references public.sgi_traza (id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_proveedor (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 2 and 120),
  tipo text not null check (tipo in ('material', 'servicio', 'ia', 'otro')),
  suministra text not null default '' check (char_length(suministra) <= 300),
  puntaje integer check (puntaje is null or puntaje between 0 and 100),
  recomendacion text check (recomendacion is null or recomendacion in ('aprobar', 'condicionar', 'no_aprobar')),
  -- Solo lo cambia el disparador de aprobación.
  estado text not null default 'propuesto' check (estado in ('propuesto', 'aprobado', 'no_aprobado')),
  huella text not null check (huella ~ '^sha256:[0-9a-f]{64}$'),
  reevaluar_en date,
  traza_id uuid references public.sgi_traza (id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_auditoria (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  proyecto_id uuid not null references public.sgi_proyecto (id) on delete cascade,
  tipo text not null check (tipo in ('interna', 'simulacro')),
  alcance text not null check (char_length(alcance) between 2 and 1000),
  fecha date not null,
  auditor_id uuid references auth.users (id) on delete set null,
  estado text not null default 'planeada' check (estado in ('planeada', 'realizada')),
  checklist jsonb not null default '[]'::jsonb,
  traza_id uuid references public.sgi_traza (id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_hallazgo (
  id uuid primary key default gen_random_uuid(),
  auditoria_id uuid not null references public.sgi_auditoria (id) on delete cascade,
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  requisito_id text not null references public.sgi_requisito (id),
  clasificacion text not null check (clasificacion in ('no_conformidad_mayor', 'no_conformidad_menor', 'observacion', 'oportunidad_de_mejora')),
  descripcion text not null check (char_length(descripcion) between 5 and 2000),
  evidencia_observada text not null default '' check (char_length(evidencia_observada) <= 2000),
  huella text not null check (huella ~ '^sha256:[0-9a-f]{64}$'),
  -- borrador → firmado: SOLO por la aprobación del auditor interno.
  estado text not null default 'borrador' check (estado in ('borrador', 'firmado')),
  traza_id uuid references public.sgi_traza (id) on delete set null,
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_no_conformidad (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  proyecto_id uuid not null references public.sgi_proyecto (id) on delete cascade,
  hallazgo_id uuid references public.sgi_hallazgo (id) on delete set null,
  requisito_id text references public.sgi_requisito (id),
  descripcion text not null check (char_length(descripcion) between 5 and 2000),
  correccion text not null default '' check (char_length(correccion) <= 2000),
  causa text not null default '' check (char_length(causa) <= 2000),
  -- abierta → en_tratamiento (cualquier miembro) → cerrada (SOLO el disparador, cuando todas sus acciones son eficaces).
  estado text not null default 'abierta' check (estado in ('abierta', 'en_tratamiento', 'cerrada')),
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_accion_correctiva (
  id uuid primary key default gen_random_uuid(),
  no_conformidad_id uuid not null references public.sgi_no_conformidad (id) on delete cascade,
  organizacion_id uuid not null references public.sgi_organizacion (id) on delete cascade,
  accion text not null check (char_length(accion) between 5 and 1000),
  responsable_puesto text not null default '' check (char_length(responsable_puesto) <= 80),
  vence date,
  huella text not null check (huella ~ '^sha256:[0-9a-f]{64}$'),
  -- pendiente → hecha (cualquier miembro) → eficaz / no_eficaz (SOLO por aprobación de eficacia).
  estado text not null default 'pendiente' check (estado in ('pendiente', 'hecha', 'eficaz', 'no_eficaz')),
  creado_en timestamptz not null default now()
);

create table if not exists public.sgi_plantilla (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.sgi_despacho (id) on delete cascade,
  tipo text not null check (tipo in ('politica', 'procedimiento', 'formato', 'informe', 'otro')),
  titulo text not null check (char_length(titulo) between 2 and 200),
  contenido jsonb not null check (jsonb_typeof(contenido) = 'object'),
  creado_en timestamptz not null default now()
);

-- Índices por organización (RLS filtra por ahí en cada consulta).
do $$
declare t text;
begin
  foreach t in array array['sgi_proyecto', 'sgi_tarea', 'sgi_traza', 'sgi_documento', 'sgi_documento_version', 'sgi_evidencia',
    'sgi_evidencia_requisito', 'sgi_aprobacion', 'sgi_asunto', 'sgi_parte_interesada', 'sgi_sistema_ia', 'sgi_riesgo',
    'sgi_evaluacion_impacto', 'sgi_control_soa', 'sgi_objetivo', 'sgi_indicador', 'sgi_medicion', 'sgi_competencia',
    'sgi_proveedor', 'sgi_auditoria', 'sgi_hallazgo', 'sgi_no_conformidad', 'sgi_accion_correctiva']
  loop
    execute format('create index if not exists %I on public.%I (organizacion_id)', t || '_org', t);
  end loop;
end $$;
create index if not exists sgi_membresia_user on public.sgi_membresia (user_id);
create index if not exists sgi_aprobacion_objeto on public.sgi_aprobacion (objeto_id);
