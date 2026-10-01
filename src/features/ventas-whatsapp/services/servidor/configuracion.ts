/**
 * La configuración del canal, leída del entorno UNA vez y validada con Zod. Sin ella completa, el
 * canal no arranca (503): no hay valores por defecto para secretos.
 *
 * Guarda de gobierno (AGENTS.md, canales de chat externos): apuntar el transporte a la Graph API
 * REAL exige declarar que C3 y C4 están firmados. Sin eso, solo se habla con el simulador.
 */
import { z } from 'zod';

/** Un secreto del entorno: largo mínimo y sin valor por omisión. */
const secreto = z.string().min(16);
const opcional = secreto.optional();
const texto = (minimo: number) => z.string().min(minimo);

const esquema = z.object({
  VENTAS_WA_APP_SECRET: secreto,
  VENTAS_WA_VERIFY_TOKEN: secreto,
  VENTAS_WA_FLOW_SECRET: secreto,
  /** Llave privada RSA del endpoint de Flows, PEM en base64. */
  VENTAS_WA_FLOWS_LLAVE: z.string().min(100),
  VENTAS_WA_GRAPH_URL: z.string().url(),
  /** `{"<phone_number_id o dataset_id>": "<token>"}`. En producción, un vault (P-02 abierta). */
  VENTAS_WA_TOKENS: texto(2),
  VENTAS_WA_PAGOS_URL: z.string().url(),
  VENTAS_WA_PAGOS_SECRETO: secreto,
  /** `pyme_x:<token>,pyme_y:<token>`: el token del panel decide el inquilino. */
  VENTAS_WA_PANEL_TOKENS: texto(3),
  VENTAS_WA_DOMINIOS_LIGA: z.string().default('pagos.simulado.test'),
  VENTAS_WA_LABORATORIO: z.enum(['0', '1']).default('0'),
  VENTAS_WA_C3_C4_FIRMADOS: z.enum(['0', '1']).default('0'),
  VENTAS_WA_A2A_LLAVE: z.string().optional(),
  VENTAS_WA_A2A_SECRETO: z.string().min(16).optional(),
  /** Llave de las huellas de la cadena de hashes (HMAC). Sin ella, no hay cadena y el panel lo dice. */
  VENTAS_WA_TRAZA_LLAVE: z.string().min(16).optional(),
  /** Llave Ed25519 (PEM en base64) que firma las anclas de la cadena. */
  VENTAS_WA_ANCLA_LLAVE: z.string().min(40).optional(),
  /** Token de quien opera la plataforma (altas por BSP, números, factura). Sin él, la página no abre. */
  VENTAS_WA_PLATAFORMA_TOKEN: opcional,
});

export type Configuracion = z.infer<typeof esquema> & { tokens: Record<string, string>; panel: Map<string, string> };

let cache: { ok: true; valor: Configuracion } | { ok: false; error: string } | null = null;

export function configuracion(): { ok: true; valor: Configuracion } | { ok: false; error: string } {
  if (cache) return cache;
  const r = esquema.safeParse(process.env);
  if (!r.success) return (cache = { ok: false, error: `canal sin configurar: ${r.error.issues.map((i) => i.path.join('.')).join(', ')}` });
  const graph = new URL(r.data.VENTAS_WA_GRAPH_URL);
  if (/facebook\.com$/.test(graph.hostname) && r.data.VENTAS_WA_C3_C4_FIRMADOS !== '1') {
    return (cache = { ok: false, error: 'la Graph API real exige C3 y C4 firmados y gate humano: el canal queda contra el simulador' });
  }
  let tokens: Record<string, string>;
  try { tokens = z.record(z.string(), z.string().min(8)).parse(JSON.parse(r.data.VENTAS_WA_TOKENS)); } catch { return (cache = { ok: false, error: 'VENTAS_WA_TOKENS no es un JSON válido' }); }
  const panel = new Map<string, string>();
  for (const par of r.data.VENTAS_WA_PANEL_TOKENS.split(',')) {
    const [inquilino, token] = par.split(':');
    if (inquilino && token && token.length >= 16) panel.set(token, inquilino);
  }
  return (cache = { ok: true, valor: { ...r.data, tokens, panel } });
}
