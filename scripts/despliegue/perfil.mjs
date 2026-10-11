/**
 * El perfil de despliegue de un producto (PRP-010, fase 3). Es lo que `configura:deploy` mide contra el bloque
 * `despliegue` de su manifiesto (`productos/<slug>.json`, plantilla v4), y el tope del bloqueo de su `retencion`. Puro:
 * no lee el disco ni imprime; decide quien llama.
 *
 *   · la máquina contra el tamaño contratado (`DESPLIEGUE_TAMANO`): vCPU, RAM y disco;
 *   · el modo (`DESPLIEGUE`; gestionado si no se dice) entre los que admite el producto;
 *   · la región declarada (`DESPLIEGUE_REGION`) contra su decisión: mientras esté abierta, «pendiente», nunca «cumple»;
 *   · el destino de respaldo por S3 con bloqueo de objetos (`RESPALDO_S3_*`): una URL y unas llaves, sin código por
 *     proveedor; si falta, se avisa. El bloqueo no pasa el tope que el producto promete (`retencion.bloqueoMaximoDias`,
 *     D8): una copia bloqueada más tiempo no se puede borrar, y el borrado no llegaría en el plazo del contrato;
 *   · los secretos del producto: presentes y largos, sin imprimirlos.
 *
 * El proveedor (`DESPLIEGUE_PROVEEDOR`) es texto libre: se anota en la medición y en el inventario, no decide nada.
 */

/** El destino de respaldo inmutable fuera de sitio, por protocolo S3 (FASE0 §9.2, N2). */
export const RESPALDO_S3 = ['RESPALDO_S3_URL', 'RESPALDO_S3_BUCKET', 'RESPALDO_S3_LLAVE', 'RESPALDO_S3_SECRETO', 'RESPALDO_S3_BLOQUEO_DIAS'];
export const LARGO_MINIMO_SECRETO = 32;
export const TAMANOS = ['S', 'M', 'L'];

/** La máquina contra el tamaño contratado. `null` si no hay contra qué medir. */
function cabe(d, tamano, maquina, slug, problemas, avisos) {
  if (d.tamanos === null) { avisos.push(`${slug} no tiene tamaños medidos (${d.falta}): la máquina no se compara con un perfil`); return null; }
  if (!TAMANOS.includes(tamano)) { problemas.push('DESPLIEGUE_TAMANO falta o no es S, M o L: sin el tamaño contratado no hay contra qué medir la máquina'); return null; }
  const p = d.tamanos[tamano];
  const cortos = [];
  if (maquina.vcpu < p.vcpu) cortos.push(`${maquina.vcpu} vCPU de ${p.vcpu}`);
  if (maquina.ramMB < p.ramGb * 1024) cortos.push(`${(maquina.ramMB / 1024).toFixed(1)} GB de RAM de ${p.ramGb}`);
  if (maquina.discoGb !== null && maquina.discoGb < p.discoGb) cortos.push(`${maquina.discoGb} GB de disco de ${p.discoGb}`);
  if (maquina.discoGb === null) avisos.push('no pude medir el disco: el tamaño se compara solo por vCPU y RAM');
  if (cortos.length) problemas.push(`la máquina no cabe en el tamaño ${tamano} de ${slug}: ${cortos.join(', ')} (${d.tamanos.fuente})`);
  return cortos.length === 0;
}

/** La región declarada contra su decisión. Abierta: «pendiente», nunca «cumple». */
function region(r, declarada, problemas, avisos) {
  if (!declarada) { problemas.push(`DESPLIEGUE_REGION falta: dónde quedan los datos lo fija una decisión (${r.decision}), y la instalación lo declara`); return 'sin declarar'; }
  if (r.estado !== 'decidida') { avisos.push(`región «${declarada}»: pendiente de ${r.decision}. No se compara mientras la decisión siga abierta, y no «cumple»`); return `pendiente de ${r.decision}`; }
  if (r.regiones.includes(declarada)) return 'cumple';
  problemas.push(`región «${declarada}» fuera de las que fija ${r.decision}: ${r.regiones.join(', ')}`);
  return 'fuera';
}

/** El destino de respaldo: si falta, aviso; si está, https, con días de bloqueo y sin pasar el tope. Nunca imprime una llave. */
function respaldo(v, tope, slug, problemas, avisos) {
  const faltan = RESPALDO_S3.filter((k) => !v(k));
  if (faltan.length) { avisos.push(`falta el destino de respaldo inmutable fuera de sitio (${faltan.join(', ')}): sin él no hay respaldo (FASE0 §9.2, N2)`); return 'falta'; }
  let estado = 'declarado';
  if (!/^https:\/\//i.test(v('RESPALDO_S3_URL'))) { problemas.push('RESPALDO_S3_URL no es https: las llaves del respaldo viajarían en claro'); estado = 'mal'; }
  const dias = Number(v('RESPALDO_S3_BLOQUEO_DIAS'));
  if (!(Number.isInteger(dias) && dias >= 1)) { problemas.push('RESPALDO_S3_BLOQUEO_DIAS no es un número de días ≥ 1: sin bloqueo, el respaldo se borra con la misma llave que lo sube'); estado = 'mal'; }
  else if (!Number.isInteger(tope)) avisos.push(`${slug} no declara hasta cuándo llega el borrado a las copias (retencion.bloqueoMaximoDias): el bloqueo de ${dias} días no se compara con nada`);
  else if (dias > tope) { problemas.push(`RESPALDO_S3_BLOQUEO_DIAS=${dias} pasa el tope de ${tope} días que promete ${slug}: una copia bloqueada no se borra, y el borrado no llegaría en el plazo del contrato (D8)`); estado = 'mal'; }
  return estado;
}

/**
 * Mide una instalación contra el perfil de su producto. `valores` es el `.env.production` leído (un Map); `maquina`,
 * lo medido (`vcpu`, `ramMB`, `discoGb` o null). Devuelve los problemas, los avisos y la medición (sin secretos).
 */
export function revisaPerfil(manifiesto, valores, maquina, fecha) {
  const problemas = [], avisos = [];
  const slug = manifiesto?.slug ?? '¿?';
  const d = manifiesto?.despliegue;
  if (!d) return { problemas: [`${slug} no declara su despliegue (plantilla v3)`], avisos, medicion: null };
  const v = (k) => String(valores.get(k) ?? '').trim();
  const modo = v('DESPLIEGUE') || 'gestionado';
  if (!d.modos.includes(modo)) problemas.push(`DESPLIEGUE=${modo}: ${slug} se despliega en modo ${d.modos.join(' o ')}`);
  const tamano = v('DESPLIEGUE_TAMANO').toUpperCase();
  const cabeLaMaquina = cabe(d, tamano, maquina, slug, problemas, avisos);
  const regionEstado = region(d.exige.region, v('DESPLIEGUE_REGION'), problemas, avisos);
  const respaldoEstado = respaldo(v, manifiesto.retencion?.bloqueoMaximoDias, slug, problemas, avisos);
  for (const k of d.secretos) {
    const largo = v(k).length;
    if (!largo) problemas.push(`${k} falta: ${slug} lo necesita en producción`);
    else if (largo < LARGO_MINIMO_SECRETO) problemas.push(`${k} tiene ${largo} caracteres: con menos de ${LARGO_MINIMO_SECRETO} se adivina (\`openssl rand -hex 32\`)`);
  }
  const medicion = {
    producto: slug, fecha, modo, tamano: TAMANOS.includes(tamano) ? tamano : null,
    proveedor: v('DESPLIEGUE_PROVEEDOR') || null, region: v('DESPLIEGUE_REGION') || null,
    maquina: { vcpu: maquina.vcpu, ramGb: Math.round((maquina.ramMB / 1024) * 10) / 10, discoGb: maquina.discoGb },
    cabe: cabeLaMaquina, region_estado: regionEstado, respaldo: respaldoEstado,
  };
  return { problemas, avisos, medicion };
}
