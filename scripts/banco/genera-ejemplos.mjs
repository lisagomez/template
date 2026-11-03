#!/usr/bin/env node
/**
 * Los ejemplos SINTÉTICOS del banco de motores: una factura inventada (proveedor, RFC genérico XAXX010101000,
 * conceptos y montos de mentira) renderizada a PNG por Chromium, para probar el OCR sin un solo documento real.
 *
 * No es un artefacto con banner: el render de Chromium no es determinista byte a byte entre máquinas, así que
 * no hay `--comprueba` honesto posible. Se declara en el registro de generados como `fuera`, con su motivo.
 *
 * Uso: node scripts/banco/genera-ejemplos.mjs   (escribe public/banco/ejemplos/factura-sintetica.png)
 */
import { chromium } from 'playwright';

const FACTURA = `<!doctype html><html lang="es"><meta charset="utf-8"><style>
body{margin:0;background:#fff;color:#141312;font:22px/1.45 Arial,Helvetica,sans-serif;padding:48px;width:1000px}
h1{font-size:40px;margin:0 0 8px}.dato{margin:2px 0}.tabla{width:100%;border-collapse:collapse;margin-top:24px}
.tabla td,.tabla th{border-bottom:2px solid #141312;padding:10px 6px;text-align:left}.der{text-align:right}
.aviso{margin-top:28px;font-size:18px}</style>
<h1>FACTURA SINTETICA</h1>
<p class="dato">Proveedor: Papeleria Ejemplo SA de CV</p>
<p class="dato">RFC: XAXX010101000</p>
<p class="dato">Folio: A-2026-0001</p>
<p class="dato">Fecha: 2026-11-02</p>
<table class="tabla"><tr><th>Concepto</th><th class="der">Importe</th></tr>
<tr><td>Hojas blancas carta, 10 paquetes</td><td class="der">$1,250.00</td></tr>
<tr><td>Toner negro para impresora</td><td class="der">$2,480.50</td></tr>
<tr><td>Subtotal</td><td class="der">$3,730.50</td></tr>
<tr><td>IVA 16%</td><td class="der">$596.88</td></tr>
<tr><td>Total</td><td class="der">$4,327.38</td></tr></table>
<p class="aviso">Documento de prueba. Ningun dato pertenece a una persona o empresa real.</p></html>`;

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1100, height: 900 } });
await pagina.setContent(FACTURA);
await pagina.screenshot({ path: 'public/banco/ejemplos/factura-sintetica.png', fullPage: true });
await navegador.close();
console.log('✓ public/banco/ejemplos/factura-sintetica.png (sintética)');
