---
paths:
  - "**/*qr*"
  - "src/features/dictado/**"
  - "tools/extractor-documental/src/codigos.ts"
---
# QR seguros (control)

Al generar o leer un QR se cumple la lista de `docs/SDD-qr-seguros.md` §6. Lo que no se
cumpla se declara en el PR; lo que dañe a terceros se rediseña (límite de C5).

- El QR es transporte, no cerradura: la seguridad es lo que lleva dentro. Por defecto,
  **token opaco** de ≥128 bits (`crypto.randomBytes`), un solo uso atómico y caducidad.
  **Firma Ed25519** (`node:crypto`) solo si un tercero verifica sin red.
- **Nunca** datos personales ni secretos duraderos dentro del QR: lo lee cualquier cámara.
- El lector **nunca abre** la URL ni ejecuta la carga; la valida con Zod y la muestra.
- Pagos: ninguna firma frena una calcomanía encima (quishing). Dominio propio y corto,
  impreso en texto; beneficiario y monto a la vista antes de cobrar.
- Pendiente conocido: `qr-emparejar.tsx` lleva `DICTADO_MOVIL_TOKEN` (secreto único, sin
  caducidad). No copiar ese patrón.
