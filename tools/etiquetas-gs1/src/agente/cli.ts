#!/usr/bin/env node
/**
 * etiquetas-agente --config agente.json
 *
 * El secreto se lee de ETIQUETAS_AGENTE_SECRETO y NUNCA se imprime: solo se dice si esta y
 * cuanto mide. Se para con Ctrl+C o SIGTERM, terminando el envio en curso.
 */
import { avisosConfig, creaAgente, leeConfig } from './index.js'

const registra = (m: string) => console.log(`${new Date().toISOString()} ${m}`)

async function principal(): Promise<void> {
  const i = process.argv.indexOf('--config')
  const ruta = i >= 0 ? process.argv[i + 1] : undefined
  if (!ruta) {
    console.error('uso: etiquetas-agente --config agente.json   (secreto en ETIQUETAS_AGENTE_SECRETO)')
    process.exit(2)
  }
  const config = await leeConfig(ruta)
  const secreto = process.env['ETIQUETAS_AGENTE_SECRETO']
  registra(`secreto: ${secreto ? `presente (${secreto.length} caracteres)` : 'AUSENTE'}`)
  for (const a of avisosConfig(config)) registra(`aviso: ${a}`)
  const agente = await creaAgente(config, secreto, registra)
  const dir = await agente.escucha()
  registra(`agente del sitio ${config.sitio} escuchando en ${dir.address}:${dir.port} · impresoras: ${config.impresoras.map((p) => p.id).join(', ')}`)
  const para = async () => { registra('parando...'); await agente.detiene(); process.exit(0) }
  process.on('SIGINT', () => void para())
  process.on('SIGTERM', () => void para())
}

principal().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
