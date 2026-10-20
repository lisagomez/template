{# Margen bruto en porcentaje, protegido contra división entre cero. #}
{% macro margen_pct(ventas, costo) -%}
    round(100.0 * ({{ ventas }} - {{ costo }}) / nullif({{ ventas }}, 0), 2)
{%- endmacro %}
