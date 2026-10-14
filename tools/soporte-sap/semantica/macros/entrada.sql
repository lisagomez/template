{#- La entrada de un modelo de staging: la semilla del laboratorio o la tabla del producto. -#}
{% macro entrada(nombre) -%}
  {%- if var('laboratorio', true) -%}
    {{ ref(nombre) }}
  {%- else -%}
    {{ source('producto', nombre) }}
  {%- endif -%}
{%- endmacro %}
