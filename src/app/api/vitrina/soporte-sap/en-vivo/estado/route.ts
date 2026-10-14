/** ¿Está encendida la sección en vivo? Siempre 200: con la vista si lo está, con el motivo si no (`proxy.ts`). */
import { entornoEnVivo, estadoEnVivo } from '@/features/soporte-sap/vitrina/en-vivo/proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const GET = () => estadoEnVivo(entornoEnVivo())
