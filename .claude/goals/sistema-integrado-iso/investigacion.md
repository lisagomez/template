# Investigación previa — sistema integrado ISO 9001 + ISO/IEC 42001

Consultado el **2026-09-30**. Todo está redactado con palabras propias: aquí no hay texto de ninguna norma.
Lo que no se pudo confirmar dice **no confirmado**. No se supuso nada.

## 1. Estado de hoy de cada edición

| Norma | Edición vigente hoy | Estado | Fuente (consultada 2026-09-30) |
|---|---|---|---|
| ISO 9001 | **ISO 9001:2026** (6.ª edición) | Publicada el **16-sep-2026**. Transición de **3 años**: los certificados 9001:2015 caducan el **30-sep-2029** | [ISO, noticia](https://www.iso.org/news/2026/09/ISO9001-2026) (403 al leerla; título y fecha vistos en el buscador) · [DNV](https://www.dnv.us/assurance/Management-Systems/new-iso/transition/iso-9001-revision/) · [NSF](https://www.nsf.org/knowledge-library/iso-90012026-published-on-september-16-2026-what-quality-leaders-need-to-know) · [ficha ISO 88464](https://www.iso.org/standard/88464.html) |
| ISO 9001:2015 (+ Amd 1:2024) | Válida para certificados vigentes hasta el 30-sep-2029 | La enmienda de 2024 añadió el cambio climático al análisis de contexto (4.1) y a las partes interesadas (4.2) | [WWise, enmienda climática](https://wwise-iso-e-learning.com/iso-management-system-standards-climate-amendment-amd-12024/) · [DNV](https://www.dnv.us/assurance/Management-Systems/new-iso/transition/iso-9001-revision/) |
| ISO/IEC 42001 | **ISO/IEC 42001:2023** | Vigente. **No confirmado**: si tiene una enmienda climática. La búsqueda no encontró ninguna. Aparece una adopción europea «EN ISO/IEC 42001:2026», pero no se pudo leer su contenido | [ISO 42001](https://www.iso.org/standard/42001) · [iTeh (catálogo CEN)](https://standards.iteh.ai/catalog/standards/cen/adc675e8-4669-4965-b4c1-c8f724832217/en-iso-iec-42001-2026) |
| ISO/IEC 23894 | ISO/IEC 23894:2023 (guía de gestión de riesgos de IA) | Vigente; no se encontró revisión | — (sin cambio conocido; **no confirmado** que no haya revisión en curso) |
| ISO/IEC 42005 | **ISO/IEC 42005:2025** (evaluación de impacto de sistemas de IA) | Publicada en abril de 2025 (las fuentes difieren: 17-abr o mayo) | [ISO 42005](https://www.iso.org/standard/42005) · [Nemko](https://digital.nemko.com/standards/iso-iec-42005) |
| ISO/IEC 42006 | **ISO/IEC 42006:2025** (requisitos para organismos que auditan y certifican SGIA) | Publicada el 7-jul-2025 | [ISO 42006](https://www.iso.org/standard/42006) · [ANSI](https://blog.ansi.org/anab/iso-iec-42006-2025-aims-audit-certification/) |
| ISO 19011 | **ISO 19011:2026** (4.ª edición) | Publicada en **mayo de 2026**; retira la de 2018; es una guía, sin transición | [ISO 19011](https://www.iso.org/standard/19011) · [ISO TC 176](https://committee.iso.org/sites/tc176/home/news/content-left-area/news-and-updates/iso-19011-2026-released.html) · [CQI/IRCA](https://knowledge.quality.org/article/iso-190112026-revision-guidance-management-system-auditing) |

### Qué cambió en ISO 9001:2026, según resúmenes de organismos de certificación

Esta lista sale de resúmenes públicos (DQS, DNV). **No se leyó la norma.** Se usa para el catálogo en borrador y para
el ejemplo de migración de edición, y cada cambio se tiene que verificar contra la norma licenciada antes de ofrecérselo a
un cliente.

- **4.1 / 4.2**: la consideración del cambio climático de la enmienda de 2024 queda integrada.
- **5.1.1**: la alta dirección tiene que **promover una cultura de la calidad y el comportamiento ético**. Deja de ser
  una recomendación.
- **5.2**: la política tiene que ser coherente con la **dirección estratégica**.
- **6.1**: riesgos y oportunidades se separan en subapartados (6.1.1 general, 6.1.2 riesgos, 6.1.3 oportunidades).
- **6.3**: se refuerza la planificación de cambios.
- **7.3**: la toma de conciencia incluye la cultura de la calidad y la ética.
- **10.1**: la mejora continua se consolida (lo que en 2015 estaba en 10.1 y 10.3).
- **Anexo A**: guía muy ampliada, sin requisitos nuevos.

Fuentes: [DQS](https://www.dqsglobal.com/en/explore/focus-area/iso-9001-revision-at-a-glance) ·
[DNV](https://www.dnv.us/assurance/Management-Systems/new-iso/transition/iso-9001-revision/).

**Consecuencia para el diseño.** El catálogo trae dos ediciones de 9001:

- **9001:2015 + Amd 1:2024**: la base, con certificados vigentes hasta 2029.
- **9001:2026**: en borrador, marcada «sin verificar contra la norma licenciada».

El paso de una a otra es justo la **migración de edición** que el motor tiene que resolver sin rehacer el sistema del
cliente. Que 9001 cambie tres años después de 42001 confirma que el catálogo **tiene** que ir versionado.

## 2. Derechos de autor y licencia

- ISO (y, en las normas ISO/IEC, ISO junto con IEC) tiene **todos** los derechos del texto: reproducir, distribuir,
  traducir y adaptar requieren autorización escrita. Fuentes: [ISO, copyright](https://www.iso.org/copyright.html) ·
  [ISO, guía de licencias y derechos (PUB100206)](https://www.iso.org/publication/PUB100206.html).
- Parafrasear cada requisito es la vía habitual. Tiene un costo: la paráfrasis puede **interpretar mal** el requisito.
  Fuente: [Elsmar Cove](https://elsmar.com/elsmarqualityforum/threads/iso-standards-copyright-limitations.34625/).
  Por eso el catálogo sale como «borrador sin revisión experta» hasta que lo firme un auditor competente.
- Qué hace la app, en consecuencia:
  - Cita **números de cláusula** como referencia.
  - Los rótulos, las preguntas y las explicaciones son **propios**.
  - **No copia** los títulos de los controles del Anexo A.
  - Pide que el usuario tenga **su copia** de la norma.
  - Para mostrar el texto oficial dentro de la app haría falta una licencia de contenido con ISO o con el organismo
    nacional. En México, la versión nacional de 9001:2015 se publicó como NMX-CC-9001-IMNC-2015 (según EMA, ver §4).
    **No confirmado**: quién otorga hoy la licencia para México y en qué condiciones → propuesta con asesoría.

## 3. LFPDPPP vigente

- La **nueva LFPDPPP** se publicó en el DOF el 20-mar-2025 y **entró en vigor el 21-mar-2025**. Desaparece el INAI y
  sus funciones sobre datos en posesión de particulares pasan a la **Secretaría Anticorrupción y Buen Gobierno**.
  Fuentes: [EY México](https://www.ey.com/es_mx/technical/tax/boletines-fiscales/nueva-ley-federal-proteccion-datos-personal-posesion-particulares) ·
  [Garrigues](https://www.garrigues.com/es_ES/noticia/mexico-nueva-ley-federal-proteccion-datos-personales-posesion-particulares-introduce) ·
  [texto en Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf).
- **No confirmado**: si ya se publicó un reglamento nuevo o si sigue aplicando el anterior en lo que no se oponga. Las
  fuentes mencionan obligaciones que «siguen en el reglamento», pero sin fecha de publicación.
- Qué implica para la app:
  - Las matrices de competencias, los registros de capacitación y las evidencias contienen **datos de empleados**. La
    pyme es la **responsable** y la app, **encargada**.
  - Hace falta un aviso de privacidad (borrador «por verificar con asesoría legal»).
  - Hay que minimizar lo que se manda al proveedor del LLM. Enviar datos al proveedor es una transferencia o remisión
    que tiene que declararse (C4).

## 4. Acreditación en México: quién certifica

- En México, la **Entidad Mexicana de Acreditación (EMA)** acredita a los organismos de certificación de sistemas de
  gestión bajo ISO/IEC 17021-1 (NMX-EC-17021-1-IMNC). Fuentes: [EMA](https://www.ema.org.mx/portal_v3/index.php/11-conozca-a-nuestros-acreditados/48-conozca-a-nuestros-acreditados) ·
  [IAAC](https://iaac.org.mx/members/full-members/entidad-mexicana-de-acreditacion-a-c-ema/) ·
  [Secretaría de Economía](https://platiica.economia.gob.mx/evaluacion-de-la-conformidad/entidades-de-acreditacion/).
- Para 42001, los organismos se rigen además por **ISO/IEC 42006:2025**.
- **La app nunca certifica.** Prepara a la pyme para las etapas 1 y 2 de la auditoría de un organismo acreditado y
  hace simulacros siguiendo la guía de ISO 19011:2026. Prometer certificación sería engañoso: el gate L8 lo prohíbe.

## 5. Plataformas de referencia

| Plataforma | Qué hace muy bien | Qué tomamos | Qué evitamos |
|---|---|---|---|
| **Vanta** (ISO 42001 y multimarco) | Mapeo cruzado: un control y una evidencia cubren varios marcos a la vez; dice reusar hasta 70 % del trabajo previo ([Vanta 42001](https://www.vanta.com/products/iso-42001) · [controles](https://www.vanta.com/collection/iso-42001/iso-42001-controls)) | **Una evidencia, varias normas**: requisitos comunes de la estructura armonizada ligados a las dos normas, y el avance se recalcula en ambas | La automatización que «certifica en semanas»; la integración masiva de conectores (aquí es propuesta, C4) |
| **QMS clásicos** (Qualio, isoTracker, ETQ, ComplianceQuest) | Control documental, CAPA, auditorías y proveedores como módulos de primera clase ([ComplianceQuest, QMS para pymes](https://www.compliancequest.com/cq-guide/affordable-qms-software-solutions-for-small-and-medium-businesses/)) | Flujo documental borrador → revisión → aprobación con versión y huella; CAPA ligada a la NC y al hallazgo; reevaluación de proveedores | Pantallas pensadas para la gran industria regulada; jerga que una pyme no entiende |
| **QMA** (plataforma mexicana de cumplimiento 9001) ([qma.mx](https://qma.mx/plataforma-cumplimiento/iso9001/)) | Contexto mexicano (EMA, NMX) | Lenguaje y rutas de certificación del mercado local | — (solo se vio la página pública; **no medido**) |

**Lo que ninguna resuelve en un solo sistema**, y es donde la app compite:

- la integración 9001 **+** 42001 sobre la misma estructura común, con una pyme que **usa** IA y no la desarrolla;
- agentes que redactan con los datos reales de la empresa y **no pueden** cerrar nada sin una persona;
- migración de edición (9001:2015 → 2026) sin rehacer el sistema.

## 6. Qué cambia en el spec por esta investigación

1. La auditoría usa **ISO 19011:2026**, no la de 2018.
2. El catálogo trae **tres ediciones**: 9001:2015+A1:2024, 9001:2026 (borrador sin verificar) e ISO/IEC 42001:2023.
3. La migración de edición del DoF es **9001:2015+A1 → 9001:2026**, el caso real que las pymes certificadas enfrentan
   hasta 2029.
