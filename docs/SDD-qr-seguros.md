# QR seguros: qué sistema usar y el control que lo obliga

> Investigación del 2026-09-23. Cuatro casos de uso pedidos: boletos y control de acceso,
> autenticidad de documentos, emparejar dispositivos o login, y pagos o enlaces a clientes.
> No es una herramienta todavía: `docs/CREAR-UNA-HERRAMIENTA.md` pide reuso real 3+ veces
> antes de empaquetar. Lo que sí es: el criterio para elegir y la lista que se cumple al
> generar o leer un QR en este repo (§6).

## 1. La idea que manda: el QR es un sobre, no una cerradura

Un QR (ISO/IEC 18004) es **solo transporte**: no cifra ni firma. Su corrección de errores
(Reed-Solomon, niveles L/M/Q/H) repara manchas, y el CRC de los QR de pago EMVCo detecta
errores de lectura. Ninguno de los dos frena una falsificación: cualquiera genera un QR
válido con lo que quiera dentro. La seguridad sale **de lo que va dentro** y de **quién lo
comprueba**. Lo lee cualquiera con una cámara, así que tampoco guarda secretos.

## 2. Los tres sistemas

| Sistema | Qué lleva el QR | Verifica sin red | Revocable | Tamaño |
|---|---|---|---|---|
| **A. Token opaco** | Un identificador aleatorio de ≥128 bits (`crypto.randomBytes(16)`) que apunta a un registro en el servidor | No: el servidor decide | Sí, al instante | Pequeño |
| **B. Carga firmada** | Los datos + una firma digital (Ed25519) | **Sí**, con la llave pública | Solo con lista de revocación | Mediano-grande |
| **C. QR dinámico** | A o B que se regenera cada ~30 s (como un código TOTP) | Según la base | Sí | Igual que su base |

**Cuándo cada uno:**
- **A** siempre que el punto de lectura tenga red. Es el más simple, el más pequeño y el único
  que se revoca al momento. El QR no dice nada por sí solo: sin el servidor no vale.
- **B** cuando hay que verificar **sin red** o lo verifica **un tercero** que no tiene acceso a
  tu base (un documento que otra institución comprueba). El patrón probado a escala es el del
  certificado COVID de la UE: CBOR + firma COSE (CWT, RFC 8392), comprimido con zlib, en
  Base45 para que el QR use el modo alfanumérico, corrección Q ([especificación eHealth
  Network][dcc], [decisión 2021/1073][eurlex]). Para documentos de viaje, ICAO define el
  *Visible Digital Seal* (VDS): firma ECDSA sobre un código 2D, verificable fuera de línea con
  la PKI de pasaportes ([ICAO VDS][vds]). En un proyecto nuestro, la forma más simple es un
  **JWS compacto con EdDSA** (`jose`) o la firma cruda de `node:crypto`.
- **C** encima de A o B cuando la amenaza es **capturar la pantalla y reenviarla** (boletos,
  acceso). Solo sirve si el QR se muestra en una pantalla viva, no impreso.

**Librerías** (versiones de npm consultadas el 2026-09-23; ninguna instalada todavía, y al
instalarlas se **pinean**, C1):

| Qué | Opción | Nota |
|---|---|---|
| Dibujar el QR | `uqr` 0.1.3 (ya en el repo, MIT) | Genera SVG sin dependencias; ya lo usa `qr-emparejar.tsx` |
| Firmar Ed25519 en servidor | `node:crypto` (`generateKeyPairSync('ed25519')`, `sign(null, …)`) | **Sin dependencia nueva**: primera opción |
| Firmar en navegador o edge | `@noble/curves` 2.4.0 (MIT) | Auditada varias veces por firmas externas según su autor ([noble][noble]); su hermana `@noble/ed25519` v3 **no** está auditada como reescritura |
| Formato estándar de token | `jose` 6.2.12 (JWS/JWT, MIT) | Útil si el verificador es de otra organización |
| Formato compacto tipo DCC | `cbor-x` 1.6.6 + Base45 | Solo si el tamaño manda; `base45` en npm no se toca desde 2022: **no verificado** si conviene |

Lo que **no está medido** y hay que medir antes de elegir en firme: el tamaño del QR con cada
formato (una firma Ed25519 son 64 bytes, ~86 caracteres en base64url, y sube la versión del
QR), si se lee bien impreso a 2-3 cm, y la latencia de verificar en el punto de lectura.

## 3. Amenazas

| Amenaza | Qué pasa | Qué la frena |
|---|---|---|
| **Falsificación** | Alguien genera un QR con datos inventados | A (el servidor no lo conoce) o B (la firma no cuadra) |
| **Reuso / captura de pantalla** | El mismo QR entra dos veces o se reenvía | Un solo uso marcado en servidor, caducidad corta, C |
| **Quishing** | Una calcomanía falsa se pega encima del QR legítimo y lleva a una página de fraude. La FTC alertó el 3 de septiembre de 2026 por parquímetros ([resumen][quishing]) | **Ninguna firma lo frena**: el teléfono de la víctima no verifica firmas, abre la URL. Solo mitigación física y de diseño (§4.4) |
| **Datos personales en claro** | El QR de un documento lleva nombre, CURP, montos: cualquiera los lee | Poner solo un identificador o un hash; los datos, tras la verificación |
| **QRLJacking** | En el "login con QR" donde el dispositivo nuevo muestra el QR y el ya autenticado lo escanea, el atacante le hace escanear SU QR a la víctima y se queda la sesión ([OWASP][qrlj]) | Confirmar en el dispositivo autenticado **qué** se está autorizando (dispositivo, lugar), vida de segundos |
| **Dominio parecido** | `pag0s-empresa.com` en vez de `pagos-empresa.com` | Un solo dominio corto y propio, impreso también en texto |
| **Llave de firma filtrada** | Quien la tenga firma documentos "auténticos" | Llave fuera del código y del repo, rotación, identificador de llave (`kid`) en la carga |
| **Carga maliciosa al leer** | El QR que lee **nuestra** app trae una URL o texto para que la app lo abra o lo pinte | El lector clasifica y muestra; **nunca abre** la URL. El extractor ya lo hace así (`tools/extractor-documental/src/codigos.ts`: «abrirlo es el fraude entero») |

## 4. Los cuatro casos de uso

### 4.1 Boletos y control de acceso
- **Sistema**: A si la puerta tiene red; B + C si hay que validar sin red (con una lista de
  boletos ya usados que se sincroniza después).
- **Obligatorio**: un solo uso marcado en servidor **en la misma operación** que lo valida (si
  no, dos lectores a la vez dejan pasar a dos personas); caducidad; ligado a una persona o
  asiento. C cuando el boleto se muestra en el teléfono.
- **Sobre terceros (C4)**: negar la entrada a alguien con un boleto legítimo por un falso
  positivo es un daño con víctima. Hace falta una vía manual en la puerta.

### 4.2 Autenticidad de documentos (constancias, diplomas, facturas)
- **Sistema**: B. El documento se verifica años después, por gente que no tiene tu base.
- **Obligatorio**: sin datos personales en claro en el QR; la verificación en una página de
  **tu** dominio, o mejor en una app que valide la firma sin abrir enlaces; identificador de
  llave para poder rotarla.
- **La referencia mexicana y su límite**: el QR del CFDI lleva la URL del verificador del SAT
  con `id` (UUID), `re`, `rr`, `tt` (total) y `fe` (los últimos 8 caracteres del sello)
  (Anexo 20; [cryptosys][cfdi]). **Esos 8 caracteres no autentican nada**: la autenticidad
  la da la consulta al SAT o el sello completo del XML. Y el QR lleva los RFC en claro. El
  extractor ya trata ese QR como una fuente para **corroborar**, no como prueba.

### 4.3 Emparejar dispositivos o login
- **Sistema**: A, de un solo uso y con vida de ≤2 minutos, **distinto por dispositivo** y
  revocable uno por uno.
- **Obligatorio**: mostrarlo solo al pedirlo; confirmación en el dispositivo ya autenticado;
  que el token del QR se cambie por una credencial propia del dispositivo nuevo, y el del QR
  muera.
- **Hallazgo en este repo (pendiente, no se arregla en esta tarea)**:
  `src/features/dictado/components/qr-emparejar.tsx` pone en el QR el **secreto único del
  servidor** (`DICTADO_MOVIL_TOKEN`, comprobado en `src/shared/lib/token-dictado.ts`). No
  caduca, es el mismo para todos los dispositivos, y la única forma de revocar uno es rotarlo
  y desemparejar a todos. Una foto del QR da acceso permanente al pipeline de voz. Lo que ya
  está bien: el token va en el fragmento `#t=` (no llega al servidor ni a los logs), el QR
  solo se dibuja al pedirlo y lleva el aviso a la vista. **Riesgo**: bajo mientras la app
  corra solo en la red de casa; sube si se expone a internet. Arreglo propuesto: tokens de
  emparejamiento de un solo uso y 2 minutos que se canjean por un token por dispositivo.

### 4.4 Pagos o enlaces a clientes
- **Sistema**: A. El QR lleva a `https://<tu-dominio-corto>/p/<id-opaco>`, nunca los datos
  del cobro.
- **La verdad incómoda**: la amenaza principal es el quishing, y **no hay criptografía que lo
  frene**: el cliente escanea con la cámara del teléfono, que abre lo que diga el QR. Lo que
  funciona: un solo dominio, corto y propio, **impreso en texto junto al QR** para que el
  cliente pueda escribirlo; la página de pago muestra el beneficiario y el monto antes de
  cobrar; QR impresos a prueba de calcomanía (dentro del material, no pegados); y revisión
  física de los lugares donde se imprimen.
- **Límite de C5**: el dinero en riesgo es **de los clientes**. Ninguna firma de la dueña
  acepta ese riesgo por ellos: si el diseño no lo mitiga, se rediseña o no se hace.
- **Mover dinero es irreversible**: el QR nunca dispara un cobro solo; el cliente confirma.

## 5. Recomendación

1. **Por defecto, A** (token opaco de 128 bits, un solo uso, caducidad), dibujado con `uqr`.
2. **B con Ed25519 de `node:crypto`** solo para documentos que un tercero verifica sin red.
3. **C** solo para boletos en pantalla.
4. **Nunca** datos personales ni secretos duraderos dentro del QR.
5. Empaquetar una herramienta (`tools/qr-seguro`) **todavía no**: hoy hay un generador en el
   repo (`qr-emparejar`) y un lector (el extractor). Cuando aparezca el tercer uso real, la
   herramienta nace con A y B y este documento como spec.

## 6. El control: lista obligatoria al generar o leer un QR

Se cumple en cualquier cambio que genere o lea un QR. Lo que no se cumpla se declara en el
PR con su motivo; lo que dañe a terceros no se declara, se rediseña (límite de C5).

- [ ] **Sistema elegido y escrito**: A, B o C, y por qué (§2).
- [ ] **Nada que no deba leer un desconocido**: ni datos personales ni secretos duraderos en
      el QR.
- [ ] **Caducidad** y, si da acceso o dinero, **un solo uso** marcado en servidor de forma
      atómica.
- [ ] **Aleatoriedad**: ≥128 bits de `crypto.randomBytes` / `crypto.getRandomValues`; nunca
      `Math.random` ni identificadores secuenciales.
- [ ] **Firma** (si es B): Ed25519, llave privada fuera del código y del repo (nunca
      `NEXT_PUBLIC_*`), `kid` en la carga, y verificación probada con una carga alterada.
- [ ] **Dominio**: uno, propio, corto, y en texto junto al QR impreso.
- [ ] **Lector**: clasifica y muestra; **nunca abre** la URL ni ejecuta la carga; valida con
      Zod antes de usarla.
- [ ] **Terceros (C4)**: si el QR decide sobre alguien (entrar, pagar, validar un documento),
      hay vía manual cuando falla.
- [ ] **Prueba**: una prueba que falsifica, reusa o deja caducar el QR y ve el rechazo.

[dcc]: https://health.ec.europa.eu/document/download/c0a07892-a01c-4bc8-8e9f-1e91d9597d17_en
[eurlex]: https://eur-lex.europa.eu/eli/dec_impl/2021/1073/oj
[vds]: https://www.icao.int/sites/default/files/TRIP/Publications/Guidance-for-Visible-Digital-Seals-VDS-NC-for-Travel-Related-Public-Health-Proofs.pdf
[noble]: https://github.com/paulmillr/noble-curves
[quishing]: https://scamwatchhq.com/parking-meter-qr-code-sticker-scam-ftc-2026/
[qrlj]: https://owasp.org/www-community/attacks/Qrljacking
[cfdi]: https://cryptosys.net/firmasat/qrcode-for-cfdi.html
