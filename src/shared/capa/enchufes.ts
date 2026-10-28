// ALTO: ARTEFACTO AUTOGENERADO por `node scripts/capa/registra-enchufes.mjs`. No lo edites a mano: se regenera.
/**
 * Registro de los enchufes de la app. GENERADO por `node scripts/capa/registra-enchufes.mjs`: no se edita a mano
 * (el verificador de enchufes lo compara con los `enchufe.json` del árbol). Cada uno se valida al cargar.
 */
import { EsquemaEnchufe, type Enchufe } from '../../../tools/capa/dist/index.js';
import e0 from '../../features/agora-agentes/enchufe.json' with { type: 'json' };
import e1 from '../../features/agora-buzon/enchufe.json' with { type: 'json' };
import e2 from '../../features/agora-contabilidad/enchufe.json' with { type: 'json' };
import e3 from '../../features/agora-costos/enchufe.json' with { type: 'json' };
import e4 from '../../features/agora-metricas/enchufe.json' with { type: 'json' };
import e5 from '../../features/agora-tablero/enchufe.json' with { type: 'json' };
import e6 from '../../features/agora/enchufe.json' with { type: 'json' };
import e7 from '../../features/buzon-cfdi/enchufe.json' with { type: 'json' };
import e8 from '../../features/centro-de-mando/enchufe.json' with { type: 'json' };
import e9 from '../../features/clinica-dental/enchufe.json' with { type: 'json' };
import e10 from '../../features/crecimiento-demostrado/enchufe.json' with { type: 'json' };
import e11 from '../../features/dashboard/enchufe.json' with { type: 'json' };
import e12 from '../../features/dictado/enchufe.json' with { type: 'json' };
import e13 from '../../features/estudio-dashboards/enchufe.json' with { type: 'json' };
import e14 from '../../features/estudio-pymes/enchufe.json' with { type: 'json' };
import e15 from '../../features/etiquetas/enchufe.json' with { type: 'json' };
import e16 from '../../features/laboratorio-calendario/enchufe.json' with { type: 'json' };
import e17 from '../../features/laboratorio-etiquetas/enchufe.json' with { type: 'json' };
import e18 from '../../features/laboratorio-pymes/enchufe.json' with { type: 'json' };
import e19 from '../../features/laboratorio-sgi/enchufe.json' with { type: 'json' };
import e20 from '../../features/laboratorio-voz/enchufe.json' with { type: 'json' };
import e21 from '../../features/project-settings/enchufe.json' with { type: 'json' };
import e22 from '../../features/recepcion/enchufe.json' with { type: 'json' };
import e23 from '../../features/reel/enchufe.json' with { type: 'json' };
import e24 from '../../features/sgi/enchufe.json' with { type: 'json' };
import e25 from '../../features/soporte-sap/enchufe.json' with { type: 'json' };
import e26 from '../../features/ventas-whatsapp/enchufe.json' with { type: 'json' };
import e27 from '../../../tools/calendario/enchufe.json' with { type: 'json' };
import e28 from '../../../tools/ejemplo-herramienta/enchufe.json' with { type: 'json' };
import e29 from '../../../tools/extractor-documental/enchufe.json' with { type: 'json' };

export const ARCHIVOS = [
  'src/features/agora-agentes/enchufe.json',
  'src/features/agora-buzon/enchufe.json',
  'src/features/agora-contabilidad/enchufe.json',
  'src/features/agora-costos/enchufe.json',
  'src/features/agora-metricas/enchufe.json',
  'src/features/agora-tablero/enchufe.json',
  'src/features/agora/enchufe.json',
  'src/features/buzon-cfdi/enchufe.json',
  'src/features/centro-de-mando/enchufe.json',
  'src/features/clinica-dental/enchufe.json',
  'src/features/crecimiento-demostrado/enchufe.json',
  'src/features/dashboard/enchufe.json',
  'src/features/dictado/enchufe.json',
  'src/features/estudio-dashboards/enchufe.json',
  'src/features/estudio-pymes/enchufe.json',
  'src/features/etiquetas/enchufe.json',
  'src/features/laboratorio-calendario/enchufe.json',
  'src/features/laboratorio-etiquetas/enchufe.json',
  'src/features/laboratorio-pymes/enchufe.json',
  'src/features/laboratorio-sgi/enchufe.json',
  'src/features/laboratorio-voz/enchufe.json',
  'src/features/project-settings/enchufe.json',
  'src/features/recepcion/enchufe.json',
  'src/features/reel/enchufe.json',
  'src/features/sgi/enchufe.json',
  'src/features/soporte-sap/enchufe.json',
  'src/features/ventas-whatsapp/enchufe.json',
  'tools/calendario/enchufe.json',
  'tools/ejemplo-herramienta/enchufe.json',
  'tools/extractor-documental/enchufe.json'
] as const;

export const ENCHUFES: Enchufe[] = [e0, e1, e2, e3, e4, e5, e6, e7, e8, e9, e10, e11, e12, e13, e14, e15, e16, e17, e18, e19, e20, e21, e22, e23, e24, e25, e26, e27, e28, e29].map((e) => EsquemaEnchufe.parse(e));
