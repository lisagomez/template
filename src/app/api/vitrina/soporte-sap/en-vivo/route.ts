/**
 * La sección en vivo de la vitrina de Soporte SAP: firma y pasa al laboratorio local por el túnel
 * (`src/features/soporte-sap/vitrina/en-vivo/proxy.ts`). No es `/api/soporte-sap`: esa ruta sigue apagada aquí.
 */
import { atiendeEnVivo, entornoEnVivo } from '@/features/soporte-sap/vitrina/en-vivo/proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const GET = (req: Request) => atiendeEnVivo(req, entornoEnVivo())
export const POST = (req: Request) => atiendeEnVivo(req, entornoEnVivo())
