-- La espina de tiempo de MetricFlow: un día por fila, sin paquetes externos.
select gs::date as date_day
from generate_series('2026-01-01'::date, '2027-12-31'::date, interval '1 day') gs
