# Soporte SAP × la web: anexos de la propuesta

Anexos de `soporte-sap-basis-web-propuesta.md`. Las secciones 1 a 6 son la salida, sin tocar, de
`node docs/goals/soporte-sap-basis-web-evidencia/mide.mjs <captura>` (solo lectura y determinista: dos corridas dan el
mismo texto) sobre la captura del 2026-10-23 fijada en `src/features/soporte-sap/mesa/fuentes/web/pin.json`. La
sección 7 es la revisión de vigencia real (con red) y simulada, sobre una copia del pin. La 8, la matriz.

## 1. Catálogo de fuentes (16 fuentes, revisado el 2026-10-23)

| Fuente | Tipo | Acceso | Captura | Términos (URL) | Cadencia | Última vista | Aporta | Releases | ¿Cita admitida? |
|---|---|---|---|---|---|---|---|---|---|
| CVE List V5: los registros que SAP publica como CNA | primaria | publica | automatica: repositorio público de GitHub: se baja con git, fijado por SHA, solo los archivos de SAP | https://www.cve.org/Legal/TermsOfUse (licencia perpetua, mundial y gratuita para reproducir y distribuir el CVE List, conservando el aviso de MITRE) | mensual: el Patch Day de SAP (segundo martes), y alguno fuera de ciclo | Patch Day del 2026-10-13 (20 registros de SAP) | por nota de seguridad: número (enlace a me.sap.com), título, CVE, CVSS 3.1 con vector, CWE, producto, versiones afectadas (kernel, Web Dispatcher, SAP_BASIS) y fecha | kernel 7.53–9.20, AS ABAP y AS Java, Web Dispatcher, HANA 2.0, SAP GUI, S/4HANA on-premise y private cloud | sí |
| NVD (NIST): API de CVE | secundaria | publica | automatica: API pública para uso programático (sin robots.txt que la cierre); solo se usa para saber qué CVE son de SAP en una ventana | https://nvd.nist.gov/developers/terms-of-use (dominio público; pide el aviso «This product uses data from the NVD API but is not endorsed or certified by the NVD» y respetar el límite de peticiones) | continua | 2026-10-23 (224 CVE de SAP del 2025-11-01 al 2026-10-23) | solo el descubrimiento: la lista de CVE cuyo CNA es SAP. No da candidatos |  | no (no da citas) |
| CISA Known Exploited Vulnerabilities (KEV) | secundaria | publica | automatica: el catálogo se publica también como repositorio de GitHub (cisagov/kev-data): se baja con git y se fija por SHA; el feed de cisa.gov solo sirve la versión del día | https://github.com/cisagov/kev-data/blob/fd12990e9c566a1ad3060e1a2073129778f438cc/LICENSE (CC0 1.0: uso libre; los enlaces a terceros dentro del catálogo siguen las reglas de cada tercero) | varias veces por semana; cada versión lleva su catalogVersion | catalogVersion 2026.10.21 (14 entradas de SAP) | qué CVE de SAP se explotan activamente y desde cuándo; marca la nota como explotada | NetWeaver AS Java, Solution Manager, AS ABAP | no (no da citas) |
| SAP-docs: Setup and Administration for SAP Cloud ALM | primaria | publica | automatica: repositorio público de GitHub con licencia abierta: se baja con git, fijado por SHA | https://github.com/SAP-docs/cloud-alm-setup-admin-guide/blob/main/LICENSE (CC BY 4.0: se puede reutilizar citando a SAP) | varias veces al mes | commit del 2026-10-14 | los T-codes de AS ABAP para conectar y operar sistemas gestionados (STRUST, SM59, SU01, PFCG, STMS, SM37, SLG1…) y 79 SAP Notes citadas por SAP | AS ABAP 7.40+ (ST-PI), S/4HANA on-premise y private cloud, SAP Cloud ALM (RISE) | sí |
| SAP-docs: SAP BTP Connectivity (Cloud Connector) | primaria | publica | automatica: repositorio público de GitHub con licencia abierta: se baja con git, fijado por SHA | https://github.com/SAP-docs/btp-connectivity/blob/main/LICENSE (CC BY 4.0: se puede reutilizar citando a SAP) | varias veces al mes | commit del 2026-10-14 | Cloud Connector y propagación del principal hacia AS ABAP: STRUST, CERTRULE, SICF, SMICM, RZ10, SNC; 22 SAP Notes citadas | AS ABAP, Cloud Connector 2.x | sí |
| SAP-docs: ABAP Platform Trial image | primaria | publica | automatica: repositorio público de GitHub con licencia abierta. No vive en help.sap.com: politica-cita no lo admite, así que menciona pero no corrobora | https://github.com/SAP-docs/abap-platform-trial-image/blob/main/LICENSE (CC BY 4.0) | con cada imagen de prueba (pocas veces al año) | commit del 2026-10-14 | la licencia del sistema (SLICENSE), dumps (ST22) y logs (SLG1) en un ABAP Platform de prueba | ABAP Platform 2022 y 2023 (trial) | no (no da citas) |
| SAP-docs: SAP Cloud Transport Management | primaria | publica | no: evaluada el 2026-10-23: no nombra ningún T-code de AS ABAP (cTMS, no STMS). Se queda fuera hasta que aporte | https://github.com/SAP-docs/btp-cloud-transport-management/blob/main/LICENSE (CC BY 4.0) | mensual | commit del 2026-07-29 | conceptos de transporte en la nube (nodos, rutas, colas); 0 T-codes de AS ABAP | SAP BTP | no (no da citas) |
| sapstack (Fioriuser2021/sapstack) | secundaria | publica | automatica: ya fijado por SHA (revisión 12); aquí solo se cruza | https://github.com/Fioriuser2021/sapstack/blob/5be80773025a3ace996f02a5b0a8557779eaa334/LICENSE (MIT) | quieto desde el 2026-04-11 | 5be8077 (v1.4.0) | 73 candidatos de BASIS/BC: 58 T-codes y 15 punteros a SAP Notes | ECC y S/4HANA | no (no da citas) |
| SAP Help Portal (help.sap.com): administración de AS ABAP, HANA y SUM | primaria | publica | lectura-humana: su robots.txt (2025-10-17) dice «User-agent: * / Disallow: /» y solo deja a buscadores con nombre, y los términos de SAP prohíben extraer o minar sus sitios con medios automáticos. Una persona la abre y la cita; ninguna herramienta la baja | https://www.sap.com/about/legal/terms-of-use.html (prohíbe la recolección o extracción automatizada, también para minería de texto y datos; solo los buscadores autorizados en robots.txt rastrean) | por release y por SPS | sin captura (lectura humana) | el procedimiento de cada tarea de BASIS (STMS, SPAM/SAINT, SUM, SCC4, SPAD, DBACOCKPIT, HANA cockpit) por release | NetWeaver 7.5, ABAP Platform / S/4HANA 2023, HANA 2.0 | sí |
| SAP Security Patch Day (support.sap.com) | primaria | publica | lectura-humana: su robots.txt (2025-03-19) dice «User-agent: * / Disallow: /» y los términos de SAP prohíben la extracción automatizada. Las notas con CVE llegan por el CVE List; las que no tienen CVE (actualizaciones, componentes de terceros) quedan como hueco | https://www.sap.com/about/legal/terms-of-use.html (igual que help.sap.com) | mensual, el segundo martes (octubre de 2026: el 13) | octubre de 2026 (por resultados de búsqueda: 16 notas nuevas, 2 actualizadas) | la lista mensual con prioridad y las notas sin CVE | todas | no (no da citas) |
| SAP Support Portal: estrategia y fin de mantenimiento | primaria | publica | lectura-humana: mismo robots.txt y mismos términos que support.sap.com; el detalle por producto está en la PAM, que pide S-user | https://www.sap.com/about/legal/terms-of-use.html (igual que help.sap.com) | con cada anuncio de SAP | sin captura (lectura humana) | fin de mantenimiento por release (Business Suite 7, NetWeaver 7.5, S/4HANA por versión) | ECC 6.0, NetWeaver 7.5, S/4HANA | no (no da citas) |
| Product Availability Matrix (PAM) | primaria | s-user | no: pide S-user: fuera del goal | https://www.sap.com/about/legal/terms-of-use.html (contenido para clientes con contrato de soporte) | continua | no se entra | plataformas, bases de datos y fechas de fin por producto | todas | no (no da citas) |
| SAP Notes en SAP for Me (me.sap.com) | primaria | s-user | no: el contenido está detrás del S-user y sujeto al contrato de soporte: de una nota solo entran su número, su título y su enlace, y la abre quien atiende con su propio S-user | https://www.sap.com/about/legal/terms-of-use.html (contenido para clientes con contrato de soporte) | continua | no se entra | el contenido de la nota (correcciones, pasos manuales) | todas | sí |
| SAP Learning (learning.sap.com) | primaria | registro | no: robots.txt «User-agent: * / Disallow: /» y no se confirmó un learning journey gratuito de BASIS (búsqueda del 2026-10-23) | https://www.sap.com/about/legal/terms-of-use.html (igual que help.sap.com) | trimestral | no se entra | cursos de administración | S/4HANA | no (no da citas) |
| SAP Community (community.sap.com) | secundaria | publica | no: su robots.txt deja rastrear con espera de 5 s, pero es un sitio de SAP (mismos términos contra la extracción) y politica-cita no la admite: daría candidatos, nunca reglas | https://www.sap.com/about/legal/terms-of-use.html (prohíbe la extracción automatizada) | diaria | no se entra | experiencias de administradores, sin revisar | todas | no (no da citas) |
| Resúmenes del Patch Day de terceros (SecurityBridge, Onapsis, Pathlock) | secundaria | publica | no: repiten lo que el CVE List ya trae de primera mano, con conteos que no cuadran entre sí (octubre: 21 o 22 según quién); no son fuente admitida | https://securitybridge.com/ (términos propios de cada sitio) | mensual | octubre de 2026, por búsqueda | contexto y conteos del Patch Day | todas | no (no da citas) |

## 2. Matriz de cobertura de BASIS (14 áreas)

| Área de BASIS | sapstack (hipótesis) | CVE List de SAP (+KEV) | SAP-docs | sapstack corroborado por SAP Help | Lectura humana (SAP Help…) | S-user | Estado |
|---|---|---|---|---|---|---|---|
| Copia de sistemas e instalación | 2 | 0 | 0 | 0 | SAP Help | contenido de las notas | **hueco** |
| Kernel, SPAM/SAINT y SUM | 4 | 0 | 0 | 1: SM51 | SAP Help | contenido de las notas | mínima |
| Transportes (STMS/CTS, tp, R3trans) | 4 | 1 | 1 | 1: STMS | SAP Help | contenido de las notas | mínima |
| Usuarios y roles (SU01, PFCG, SUIM) | 7 | 22 (1 explotadas) | 4 | 2: PFCG, SU01 | SAP Help | contenido de las notas | cubierta en parte |
| Seguridad (Patch Day, SNC, STRUST, gateway, SM59, UCON) | 3 | 73 (5 explotadas) | 22 | 2: SM59, STRUST | SAP Help; Patch Day (notas sin CVE) | contenido de las notas | cubierta en parte |
| Jobs (SM36/SM37) | 2 | 0 | 1 | 1: SM37 | SAP Help | contenido de las notas | mínima |
| Monitoreo y diagnóstico (ST22, SM21, SM50/SM66, ST03N, ST06, SM12, SM13, DBACOCKPIT) | 13 | 5 (1 explotadas) | 1 | 3: SLG1, SM12, SMICM | SAP Help | contenido de las notas | cubierta en parte |
| HANA (respaldo, revisiones, cockpit) | 1 | 19 | 9 | 0 | SAP Help | contenido de las notas | cubierta en parte |
| Clientes (SCC4, SCCL) | 6 | 0 | 0 | 1: SCC4 | SAP Help | contenido de las notas | mínima |
| Impresión (SPAD, SP01) | 0 | 0 | 0 | 0 | SAP Help | contenido de las notas | **hueco** |
| Licencias | 1 | 0 | 1 | 1: SLICENSE | SAP Help | contenido de las notas | mínima |
| AS Java (Visual Composer, Portal, NWA) | 0 | 22 (4 explotadas) | 0 | 0 | SAP Help | contenido de las notas | cubierta en parte |
| Ciclos de mantenimiento y fin de soporte | 0 | 0 | 0 | 0 | SAP Help; estrategia de mantenimiento | PAM | **hueco** |
| RISE y Cloud ALM | 0 | 15 | 77 | 0 | SAP Help; SAP Help (RISE) | contenido de las notas | cubierta en parte |

Huecos declarados (sin una fuente automática y citable): 3: Copia de sistemas e instalación; Impresión (SPAD, SP01); Ciclos de mantenimiento y fin de soporte

## 3. La extracción, dos veces, y con una captura alterada
- corrida 1: 213 candidatos · sha256:688035c495b205fc152f1409b2ed014c0cf4f176efbb1230ff925f453e87bad5
- corrida 2: 213 candidatos · sha256:688035c495b205fc152f1409b2ed014c0cf4f176efbb1230ff925f453e87bad5
- la del repo (candidatos-web.json): sha256:688035c495b205fc152f1409b2ed014c0cf4f176efbb1230ff925f453e87bad5 → las tres iguales
- captura alterada (CVSS de la 3797111 cambiado a 4.2 en una copia): se niega → «la captura de el CVE List fue alterada (1 archivo(s) distinto(s) de su SHA): no se extrae de ella»
- registros leídos 238 (de SAP 232, sin número de nota 9) · notas de seguridad 215 (fuera del alcance 110) · explotadas (KEV 2026.10.21) 6 · páginas de SAP-docs 603
- candidatos: total 213 · seguridad 105 · punteros 104 · tcodes 4 · enAlcance 211

## 4. El cruce con sapstack (73 candidatos de BASIS/BC)
- corroborados 14 · contradichos 0 · no encontrados 59 · huella sha256:e78013c2480c44bc (otra corrida: sha256:e78013c2480c44bc)
  - BASIS: corroborados 14, contradichos 0, no encontrados 47
  - BC: corroborados 14, contradichos 0, no encontrados 59
  - ABAP: corroborados 0, contradichos 0, no encontrados 19
  - SAP Notes: corroborados 0, contradichos 0, no encontrados 15
  - T-codes: corroborados 14, contradichos 0, no encontrados 44
  - ✓ PFCG: Setup and Administration for SAP Cloud ALM › Setting Up the Managed Systems (https://help.sap.com/docs/cloud-alm/setup-administration/21e0843b2009480282487a08044f3f34.html) | SAP BTP Connectivity › Assign Authorization Objects for Rule-based Mapping (https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/0ef22ae41b154cd5b78d6e04186a3ca3.html)
  - ✓ RZ10: SAP BTP Connectivity › Configure Identity Propagation for HTTPS (https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/a8bb87a72d094e0d981d2b1f67df7bc3.html) | SAP BTP Connectivity › Rule-Based Mapping of Certificates (https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/4f8540f4c01f447992ef2f3dff8ab4dd.html)
  - ✓ SCC4: Setup and Administration for SAP Cloud ALM › Configuring your Transport Management System (TMS) on the Managed Systems (https://help.sap.com/docs/cloud-alm/setup-administration/a9ae2e3deb5148829e2381666c27ac0a.html)
  - ✓ SLG1: Setup and Administration for SAP Cloud ALM › Setting Up the Managed Systems (https://help.sap.com/docs/cloud-alm/setup-administration/21e0843b2009480282487a08044f3f34.html) | Setup and Administration for SAP Cloud ALM › Solutions for Errors in the Managed System Setup Check (https://help.sap.com/docs/cloud-alm/setup-administration/93ae080ec391461bb4d56579deaa0b00.html)
  - ✓ SLICENSE: Setup and Administration for SAP Cloud ALM › Troubleshooting for ABAP Systems (https://help.sap.com/docs/cloud-alm/setup-administration/cb82fd21c2ce4a22ac47d136794a9273.html)
  - ✓ SM12: Setup and Administration for SAP Cloud ALM › Solutions for Errors in the Managed System Setup Check (https://help.sap.com/docs/cloud-alm/setup-administration/93ae080ec391461bb4d56579deaa0b00.html)
  - ✓ SM30: Setup and Administration for SAP Cloud ALM › Setting Up the Managed Systems (https://help.sap.com/docs/cloud-alm/setup-administration/21e0843b2009480282487a08044f3f34.html)
  - ✓ SM37: Setup and Administration for SAP Cloud ALM › Solutions for Errors in the Managed System Setup Check (https://help.sap.com/docs/cloud-alm/setup-administration/93ae080ec391461bb4d56579deaa0b00.html)
  - ✓ SM51: Setup and Administration for SAP Cloud ALM › Additional Setup for SAP HANA Database (https://help.sap.com/docs/cloud-alm/setup-administration/03b2e1f875954ea5b9af658041c581f8.html)
  - ✓ SM59: Setup and Administration for SAP Cloud ALM › Setting Up the Managed Systems (https://help.sap.com/docs/cloud-alm/setup-administration/21e0843b2009480282487a08044f3f34.html) | Setup and Administration for SAP Cloud ALM › Troubleshooting for ABAP Systems (https://help.sap.com/docs/cloud-alm/setup-administration/cb82fd21c2ce4a22ac47d136794a9273.html)
  - ✓ SMICM: Setup and Administration for SAP Cloud ALM › Troubleshooting for ABAP Systems (https://help.sap.com/docs/cloud-alm/setup-administration/cb82fd21c2ce4a22ac47d136794a9273.html) | SAP BTP Connectivity › Configure Identity Propagation for HTTPS (https://help.sap.com/docs/connectivity/sap-btp-connectivity-cf/a8bb87a72d094e0d981d2b1f67df7bc3.html)
  - ✓ STMS: Setup and Administration for SAP Cloud ALM › Configuring your Transport Management System (TMS) on the Managed Systems (https://help.sap.com/docs/cloud-alm/setup-administration/a9ae2e3deb5148829e2381666c27ac0a.html) | Setup and Administration for SAP Cloud ALM › Issues and Solutions (https://help.sap.com/docs/cloud-alm/setup-administration/f32dc37d10fa475f84819f46b2720095.html)
  - ✓ STRUST: Setup and Administration for SAP Cloud ALM › Setting Up the Managed Systems (https://help.sap.com/docs/cloud-alm/setup-administration/21e0843b2009480282487a08044f3f34.html) | Setup and Administration for SAP Cloud ALM › SAP NetWeaver Application Server for ABAP (7.40 and higher), including SAP BW/4HANA (https://help.sap.com/docs/cloud-alm/setup-administration/14001e1b12034c07ac97b81f5b44bb84.html)
  - ✓ SU01: Setup and Administration for SAP Cloud ALM › Setting Up the Managed Systems (https://help.sap.com/docs/cloud-alm/setup-administration/21e0843b2009480282487a08044f3f34.html)
  - no encontrados: 1723881, 1728283, 1785535, 1794432, 1814087, 1835730, 1982490, 2018937, 2065380, 2070597, 2161145, 2256002, 2327584, 2452523, 2925499, BD54, BD87, DB02, RSUSR002, RZ11, RZ20, SAINT, SAT, SCC1, SCC3, SCC7, SCC8, SCCL, SE06, SE09, SE10, SE91, SFW5, SICK, SM13, SM21, SM31, SM36, SM50, SM66, SMGW, SNOTE, SPAM, ST01, ST02, ST05, ST06, ST12, ST22, STMS_IMPORT, SU10, SU24, SU53, SUIM, SXMB_MONI, WE02, WE05, WE19, WE60
  - mencionados solo en una fuente que politica-cita no admite: ninguno
  - fuera de BASIS/BC, con evidencia: SE16: corroborado

## 5. El grafo, corrido (paquete de prueba 0.0.1-candidato, sin registrar)
- validaConocimiento: ok=true · 262 categorías y 262 reglas · grados: corroborada 14 · hipotesis 44 · hipotesis-citable 204 · problemas: ninguno
- politica-cita (sap-soporte): 306 problemas · cita a sapstack: es una fuente secundaria y nunca basta por sí sola (D-SS-2) 44 · no aparece en CAMBIOS.md: ahí la anota y la firma el laboratorio 262
| Escenario | Hoy (categoriza) | Con candidatos: categoría | Motivo | Grado | Destino | Cita |
|---|---|---|---|---|---|---|
| dump-time-out | módulo —, transacción — | TC_ST22 | regla | hipotesis | al experto (hipotesis) | https://github.com/Fioriuser2021/sapstack/blob/5be80773025a3ace996f02a5b0a8557779eaa334/data/tcodes.yaml#L73 |
| transporte-rc-8 | módulo —, transacción — | TC_STMS | regla | corroborada | al experto (corroborada) | https://help.sap.com/docs/cloud-alm/setup-administration/a9ae2e3deb5148829e2381666c27ac0a.html |
| nota-cvss-9 | módulo —, transacción — | NOTA_3797111 | regla | hipotesis-citable | al experto (hipotesis-citable) | https://me.sap.com/notes/3797111 |
| job-cancelado | módulo BASIS, transacción SM37 | TC_SM37 | regla | corroborada | al experto (corroborada) | https://help.sap.com/docs/cloud-alm/setup-administration/93ae080ec391461bb4d56579deaa0b00.html |
| usuario-bloqueado | módulo BASIS, transacción SU01 | TC_SU01 | regla | corroborada | al experto (corroborada) | https://help.sap.com/docs/cloud-alm/setup-administration/21e0843b2009480282487a08044f3f34.html |

## 6. La revisión de vigencia, sin red, sobre una copia del pin
- hoy 2026-10-23: al día · próximo Patch Day 2026-11-10
- hoy 2026-11-11: HAY VERSIÓN NUEVA · próximo Patch Day 2026-11-10 · Patch Day del 2026-11-10: SAP ya publicó sus notas de ese mes y el pin sigue en el del 2026-10-13
- lo fijado (capturadoEl, ventana, ultimoPatchDay, cvelist, kev, sapDocs) tras las dos revisiones: igual: avisa y no mueve

## 7. La revisión de vigencia con `extrae.mjs revisa web`, sobre una copia del pin

Con red (2026-10-23):

```
✓ la web de BASIS está al día (2026-10-23; el próximo Patch Day es el 2026-11-10)
  el pin no se movió: <copia temporal>/pin.json
```

Simulada, un día después del Patch Day de noviembre (`--hoy 2026-11-11 --sin-red`):

```
! hay versión nueva · Patch Day del 2026-11-10: SAP ya publicó sus notas de ese mes y el pin sigue en el del 2026-10-13
  el pin no se movió: <copia temporal>/pin.json
```

Lo fijado, comparado con el pin del repo después de las dos revisiones:

```
capturadoEl igual
ventana igual
ultimoPatchDay igual
cvelist igual
kev igual
sapDocs igual
revision: {"fecha":"2026-11-11","estado":"version_nueva","proximoPatchDay":"2026-11-10","avisos":["Patch Day del 2026-11-10: SAP ya publicó sus notas de ese mes y el pin sigue en el del 2026-10-13"]}
```

## 8. La matriz (`node tools/soporte-sap/evidencia/firmas.ts --md docs/goals/soporte-sap-firmas-matriz.md`)

Las filas nuevas de este goal y el conteo de la matriz entera, tal como los imprime la corrida del 2026-10-23. La tabla
completa está en `docs/goals/soporte-sap-firmas-matriz.md`.

```
✓ c3-mesa-web-fijada — ✓ verde (1 prueba(s), 0 en rojo) · ✓ ROJO (1 prueba(s), 1 en rojo)
✓ c3-mesa-web-sin-salida — ✓ verde (1 prueba(s), 0 en rojo) · ✓ ROJO (1 prueba(s), 1 en rojo)
✓ aisia-web-captura-alterada — ✓ verde (1 prueba(s), 0 en rojo) · ✓ ROJO (1 prueba(s), 1 en rojo)
✓ aisia-web-corrobora-admitida — ✓ verde (1 prueba(s), 0 en rojo) · ✓ ROJO (1 prueba(s), 1 en rojo)
✓ aisia-web-revisa-no-mueve — ✓ verde (1 prueba(s), 0 en rojo) · ✓ ROJO (1 prueba(s), 1 en rojo)
✓ aisia-web-propuesta — ✓ verde (1 prueba(s), 0 en rojo) · ✓ ROJO (1 prueba(s), 1 en rojo)
✓ aisia-web-sin-pasajes — ✓ verde (1 prueba(s), 0 en rojo) · ✓ ROJO (1 prueba(s), 1 en rojo)
✓ aisia-web-nota-solo-numero — ✓ verde (1 prueba(s), 0 en rojo) · ✓ ROJO (1 prueba(s), 1 en rojo)
✓ aisia-web-sin-s-user — ✓ verde (1 prueba(s), 0 en rojo) · ✓ ROJO (1 prueba(s), 1 en rojo)
· brecha aisia-web-lectura-humana — — · —
· brecha aisia-web-url-ayuda — — · —
· brecha aisia-web-prioridad-derivada — — · —

AISIA: 182 probadas · 15 brechas · 6 dependen de una D
C3:    146 probadas · 23 brechas · 1 dependen de una D
Afirmaciones sin prueba que se pusiera roja al empezar: 78 (52 con código y prueba, 13 solo con prueba, 7 corrigiendo el texto, 6 como brecha)
matriz escrita en docs/goals/soporte-sap-firmas-matriz.md

✓ 328/328 probadas: verdes sin sabotaje y rojas con él
```
