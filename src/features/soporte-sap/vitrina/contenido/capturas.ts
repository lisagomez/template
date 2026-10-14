/**
 * Las capturas del recorrido (`src/features/soporte-sap/pruebas/recorrido.mjs`), copiadas a la vitrina. Las saca
 * Playwright contra el laboratorio corriendo, cada una con su comprobación: no se dibujan aparte. Una prueba exige que
 * cada una de estas exista.
 */
export const RAIZ_DE_LA_VITRINA = '/vitrina/soporte-sap'
const ARCHIVOS = {
  '01': 'paso-01-n3-levanta-una-incidencia-con-adjuntos.jpg',
  '02': 'paso-02-evidencia-extraida-por-campo-y-en-revisi.jpg',
  '03': 'paso-03-el-agente-categoriza-con-la-evidencia-y-.jpg',
  '03.5': 'paso-03-5-la-consultora-escala-al-laboratorio-a-su.jpg',
  '04': 'paso-04-plan-del-caso-conocido-en-la-sala-con-ve.jpg',
  '04.5': 'paso-04-5-aprobado-por-el-hil-y-aplicado-al-simula.jpg',
  '05': 'paso-05-caso-desconocido-anonimizado-al-sandbox-.jpg',
  '05.01': 'paso-05-01-sin-consentimiento-la-ensenanza-no-sube-.jpg',
  '05.02': 'paso-05-02-el-cliente-y-su-consultora-consienten-ca.jpg',
  '05.1': 'paso-05-1-el-superadministrador-sube-la-ense-anza-.jpg',
  '06': 'paso-06-a-revision-el-agente-corrige-y-propone-l.jpg',
  '07': 'paso-07-workspace-del-consultor-con-sla-y-horas.jpg',
  '07.1': 'paso-07-1-el-riesgo-de-baja-con-su-formula-y-su-um.jpg',
  '08': 'paso-08-tablero-del-n3-con-metricas-y-foda-que-c.jpg',
  '09': 'paso-09-vista-del-superadministrador.jpg',
  '09.1': 'paso-09-1-la-ficha-de-servidor-no-dice-apto-sin-la.jpg',
  '09.5': 'paso-09-5-vista-del-experto.jpg',
  '10': 'paso-10-chat-del-hil-metrica-con-definicion-y-pe.jpg',
  '10.5': 'paso-10-5-la-v2-se-aprueba-en-la-sala-con-la-sesio.jpg',
  '11': 'paso-11-reloj-de-una-incidencia-corre-se-pausa-y.jpg',
  '11.1': 'paso-11-1-con-el-plan-ya-en-la-sala-nadie-le-ha-re.jpg',
  '11.2': 'paso-11-2-la-primera-respuesta-la-marca-el-consult.jpg',
  '11.5': 'paso-11-5-incumplimiento-de-sla-con-su-evidencia.jpg',
  '12': 'paso-12-accionables-con-impacto-en-mxn-en-el-tab.jpg',
  '12.5': 'paso-12-5-accionables-con-impacto-en-mxn-en-el-tab.jpg',
  '13': 'paso-13-al-tope-del-presupuesto-el-p1-pasa-a-una.jpg',
  '14': 'paso-14-el-cliente-impugna-y-la-consultora-la-re.jpg',
  '14.2': 'paso-14-2-el-cliente-ve-que-se-le-pide-y-reanuda-e.jpg',
  '14.3': 'paso-14-3-el-cliente-lee-la-respuesta-de-su-consul.jpg',
  '14.4': 'paso-14-4-aplicar-no-resuelve-lo-da-por-resuelto-e.jpg',
  '14.5': 'paso-14-5-el-foda-lleva-su-confianza-y-la-proyecci.jpg',
  '14.6': 'paso-14-6-cada-original-dice-cuando-vence.jpg',
  '14.7': 'paso-14-7-la-salida-registrada-con-su-export-y-su-.jpg',
  '14.8': 'paso-14-8-con-la-salida-registrada-el-cliente-no-l.jpg',
} as const
export type PasoDelRecorrido = keyof typeof ARCHIVOS
export const ARCHIVOS_DE_CAPTURA: Readonly<Record<PasoDelRecorrido, string>> = ARCHIVOS
export const captura = (paso: PasoDelRecorrido): string => `${RAIZ_DE_LA_VITRINA}/capturas/${ARCHIVOS[paso]}`
