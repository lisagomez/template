#!/usr/bin/env node
/**
 * El banco de pruebas por linea de comandos.
 *
 * Sirve para dos cosas distintas y conviene no confundirlas:
 *   1. Ejercitar el extractor a mano sobre datos con forma real, sin montar Supabase ni pagar OCR.
 *   2. Producir la EVIDENCIA de que el camino entero funciona — que es lo que se pega en una
 *      revision, y para lo que un `npm run prueba` verde no basta: verde dice que las aserciones
 *      pasaron, no ENSEÑA el recorrido.
 *
 * La base vive en `banco/datos/` y no se versiona: es reproducible desde la semilla, asi que
 * guardarla solo añadiria un binario que se desincroniza.
 *
 * Uso:
 *   node banco/cli.mjs siembra [--semilla X] [--facturas N]
 *   node banco/cli.mjs corrida          (el camino completo, con REINICIO DE PROCESO real)
 *   node banco/cli.mjs determinismo     (dos siembras, dos huellas)
 *   node banco/cli.mjs descriptores     (vacio / poblado / desalineado)
 *   node banco/cli.mjs peligroso        (el escenario de §2.10)
 *   node banco/cli.mjs destruye
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..');
const datos = join(aqui, 'datos');
const RUTA = join(datos, 'banco.db');

const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const gris = (s) => `\x1b[2m${s}\x1b[0m`;
const negrita = (s) => `\x1b[1m${s}\x1b[0m`;
const paso = (s) => console.log(`\n${verde('▸')} ${negrita(s)}`);

/** Se prueba el paquete CONSTRUIDO, que es lo que acaba en el proyecto de destino. */
function construye() {
  try {
    execFileSync('npm', ['run', 'build'], { cwd: raiz, stdio: 'ignore' });
  } catch {
    console.log(rojo('\nNo se pudo construir dist/. Corre `npm run build` a mano para ver el error.\n'));
    process.exit(1);
  }
}

const argumento = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porDefecto : process.argv[i + 1];
};

/** Umbrales de ESTA demostracion. No son una recomendacion: ver el aviso del final. */
const UMBRALES = { umbralDeConfianza: 0.85, umbralDeSimilitud: 0.55, margenDeAmbiguedad: 0.08 };

async function main() {
  const comando = process.argv[2] ?? 'ayuda';
  construye();
  mkdirSync(datos, { recursive: true });

  const { siembra, huellaDe } = await import('./semilla.ts');
  const { abreBase, cuenta, tablasDe } = await import('./base.ts');
  const { motorDeBanco } = await import('./motor.ts');
  const { corre, corrigeCampo, valorVigente } = await import('./corrida.ts');
  const { repositorioDeRegistros } = await import('./adaptadores.ts');
  const { descriptorDesdeLaBase, descriptorDesalineado } = await import('./descriptor.ts');
  const { ORGANIZACION, GTIN_AUSENTES, PRODUCTOS } = await import('./negocio.ts');
  const { detectaDesalineacion, validaDescriptor, catalogos, resuelveValor, resuelveIdentificador } =
    await import('../dist/index.js');

  if (comando === 'destruye') {
    rmSync(RUTA, { force: true });
    console.log(`${verde('✓')} base borrada: ${gris(RUTA)}`);
    return;
  }

  if (comando === 'siembra') {
    rmSync(RUTA, { force: true });
    const semilla = argumento('semilla', 'abarrotes-2026');
    const facturas = Number(argumento('facturas', '12'));
    const { base, resumen } = siembra({ ruta: RUTA, semilla, facturas });
    paso('Siembra');
    console.log(`  semilla        ${negrita(resumen.semilla)}`);
    console.log(`  ruta           ${gris(resumen.ruta)}`);
    console.log(`  tablas         ${resumen.tablas.length} · ${gris(resumen.tablas.join(', '))}`);
    console.log(`  proveedores    ${resumen.proveedores}`);
    console.log(`  productos      ${resumen.productos}   ${gris('(GTIN-13 con digito de control valido)')}`);
    console.log(`  facturas ERP   ${resumen.facturas}`);
    console.log(`  documentos     ${resumen.documentos.length} ${gris('sinteticos, listos para extraer')}`);
    console.log(`  huella         ${negrita(huellaDe(base))}`);
    base.cierra();
    return;
  }

  if (comando === 'determinismo') {
    paso('Determinismo: dos siembras con la MISMA semilla');
    const a = siembra({ semilla: 'abarrotes-2026' });
    const b = siembra({ semilla: 'abarrotes-2026' });
    const ha = huellaDe(a.base);
    const hb = huellaDe(b.base);
    console.log(`  huella 1       ${ha}`);
    console.log(`  huella 2       ${hb}`);
    console.log(`  ${ha === hb ? verde('✓ identicas') : rojo('✗ divergen')}`);
    a.base.cierra();
    b.base.cierra();
    const c = siembra({ semilla: 'otra-semilla' });
    const hc = huellaDe(c.base);
    console.log(`\n  con semilla distinta: ${hc}  ${hc !== ha ? verde('✓ distinta, como debe') : rojo('✗ colision')}`);
    c.base.cierra();
    return;
  }

  if (comando === 'descriptores') {
    paso('Los tres estados del descriptor, LEIDOS de la base');
    const virgen = siembra({ sinNegocio: true });
    const dVirgen = descriptorDesdeLaBase(virgen.base);
    console.log(`  ${negrita('VACIO')}        tablas: ${dVirgen.tablas.length}  ${gris('un proyecto virgen es tablas: [], no una rama de codigo')}`);
    console.log(`               valido: ${validaDescriptor(dVirgen).ok ? verde('si') : rojo('no')}`);
    virgen.base.cierra();

    const poblado = siembra();
    const dReal = descriptorDesdeLaBase(poblado.base);
    console.log(`\n  ${negrita('POBLADO')}      tablas: ${dReal.tablas.map((t) => t.nombre).join(', ')}`);
    console.log(`               catalogos: ${catalogos(dReal).map((t) => t.nombre).join(', ')}`);
    for (const t of dReal.tablas) {
      console.log(gris(`               · ${t.nombre}(${t.columnas.map((c) => `${c.nombre}:${c.tipo}`).join(', ')})`));
    }

    const desalineado = descriptorDesalineado(poblado.base);
    const problemas = detectaDesalineacion(desalineado, dReal);
    console.log(`\n  ${negrita('DESALINEADO')}  valido de forma: ${validaDescriptor(desalineado).ok ? verde('si') : rojo('no')} ${gris('(el problema no es su sintaxis)')}`);
    for (const p of problemas) {
      console.log(`               ${rojo('✗')} ${p.tabla}${p.columna ? `.${p.columna}` : ''}: ${p.motivo}`);
    }
    console.log(gris('               falla legible, no explota: se sabe QUE columna y POR QUE'));
    poblado.base.cierra();
    return;
  }

  if (comando === 'peligroso') {
    paso('El escenario de §2.10: un identificador que NO esta en el catalogo');
    const { base } = siembra();
    const ausente = GTIN_AUSENTES[0];
    const pariente = PRODUCTOS.find((p) => p.id === ausente.parecidoA);
    const catalogo = PRODUCTOS.map((p) => ({ id: p.id, etiqueta: p.gtin }));
    console.log(`  GTIN leido     ${negrita(ausente.gtin)}  ${gris('(valido: pasa el digito de control)')}`);
    console.log(`  se parece a    ${pariente.gtin}  ${gris(`"${pariente.descripcion}"`)}`);
    console.log(`  esta en el catalogo: ${catalogo.some((c) => c.etiqueta === ausente.gtin) ? rojo('si') : verde('NO')}`);

    console.log(`\n  ${negrita('via EXACTA')} ${gris('(resuelveIdentificador — la del camino real)')}`);
    const exacta = resuelveIdentificador(ausente.gtin, catalogo);
    console.log(`     estado      ${verde(exacta.estado)}`);
    console.log(`     elegida     ${exacta.elegida === null ? verde('null') : rojo(exacta.elegida.id)}`);
    console.log(`     candidatos  ${exacta.candidatos.length}  ${gris('ofrecer "el mas parecido" es invitar a aceptarlo')}`);

    console.log(`\n  ${negrita('via DIFUSA')} ${gris('(lo que pasaria si alguien la enrutara mal)')}`);
    const soloTres = [
      { id: pariente.id, etiqueta: pariente.gtin },
      { id: 'otro-1', etiqueta: '8400991122334' },
      { id: 'otro-2', etiqueta: '5012345678900' },
    ];
    const difusa = resuelveValor(ausente.gtin, soloTres, { umbral: 0.7, margenDeAmbiguedad: 0.05 });
    console.log(`     estado      ${rojo(difusa.estado)}`);
    console.log(`     elegida     ${rojo(difusa.elegida?.id ?? 'null')}  ${rojo('← el producto EQUIVOCADO, y sin un solo error')}`);

    console.log(`\n  ${negrita('la barrera')}`);
    try {
      resuelveValor(ausente.gtin, soloTres, { umbral: 0.7, margenDeAmbiguedad: 0.05, formato: 'identificador' });
      console.log(`     ${rojo('✗ no lanzo: la barrera no esta')}`);
    } catch (error) {
      console.log(`     ${verde('✓ lanza')} ${gris(String(error.message).slice(0, 78))}`);
    }
    base.cierra();
    return;
  }

  if (comando === 'corrida') {
    rmSync(RUTA, { force: true });
    paso('Proceso 1 — ingesta, extraccion, mapeo, revision y correccion');
    const { base, resumen } = siembra({ ruta: RUTA, semilla: 'corrida-demo' });
    const resultado = await corre(resumen.documentos, { base, motor: motorDeBanco(), ...UMBRALES });

    console.log(`  documentos     ${resultado.procesados.length}`);
    console.log(`  campos totales ${resultado.procesados.reduce((n, d) => n + d.campos.length, 0)}`);
    console.log(`  en revision    ${resultado.camposEnRevision} ${gris('(confianza por debajo del umbral de esta demo)')}`);

    const primero = resultado.procesados[0];
    console.log(`\n  ${negrita('documento 1')} · folio ${primero.folio}`);
    console.log(`     identidad   ${gris(primero.identidad.slice(0, 32))}… ${gris('(sha256 del contenido)')}`);
    for (const campo of primero.campos) {
      const bajo = campo.confianza < UMBRALES.umbralDeConfianza;
      const marca = bajo ? rojo('▼ revision') : verde('✓');
      console.log(`     ${campo.clave.padEnd(12)} ${String(campo.valor).slice(0, 34).padEnd(36)} ${campo.confianza.toFixed(3)} ${marca}`);
    }
    console.log(`     proveedor →  ${primero.proveedor.estado} ${primero.proveedor.elegida ? verde(primero.proveedor.elegida.id) : gris('—')}`);
    console.log(`     gtin      →  ${primero.gtin?.estado ?? '—'} ${primero.gtin?.elegida ? verde(primero.gtin.elegida.id) : gris('sin resolver')}`);

    const ausentes = resultado.procesados.filter((d) => d.gtinAusente);
    console.log(`\n  ${negrita('GTIN ausentes del catalogo')}: ${ausentes.length}`);
    for (const d of ausentes) {
      const ok = d.gtin?.estado === 'sin_resolver' && d.gtin?.candidatos.length === 0;
      console.log(`     ${d.folio}  estado=${d.gtin?.estado}  candidatos=${d.gtin?.candidatos.length}  ${ok ? verde('✓ dice "no esta"') : rojo('✗ ofrecio un parecido')}`);
    }

    const conRevision = resultado.procesados.find((d) => d.enRevision.length > 0);
    const indice = resultado.procesados.indexOf(conRevision);
    const documentoId = `doc-${String(indice + 1).padStart(3, '0')}`;
    const clave = conRevision.enRevision[0].clave;
    console.log(`\n  ${negrita('correccion humana')} sobre ${documentoId}.${clave}`);
    corrigeCampo(base, documentoId, clave, conRevision.enRevision[0].valor, 'captura inicial');
    const v2 = corrigeCampo(base, documentoId, clave, 'CORREGIDO POR LA REVISORA', 'lo leyo mal el motor');
    console.log(`     v1 → ${gris(String(v2.anterior).slice(0, 40))}`);
    console.log(`     v2 → ${negrita(valorVigente(base, documentoId, clave))}  ${gris('append-only: la v1 sigue ahi')}`);
    console.log(`\n  ${gris(`persistido en ${RUTA}`)}`);
    base.cierra();

    paso('El proceso 1 ha terminado. Se lanza un proceso NUEVO que solo lee.');
    const salida = execFileSync(
      process.execPath,
      [join(aqui, 'cli.mjs'), 'recupera', resultado.lote.id, documentoId, clave],
      { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    process.stdout.write(salida);
    return;
  }

  if (comando === 'recupera') {
    const [, , , loteId, documentoId, clave] = process.argv;
    console.log(gris(`  pid ${process.pid} · abre ${RUTA} sin haber visto nada de lo anterior`));
    if (!existsSync(RUTA)) {
      console.log(rojo('  no hay base: corre `node banco/cli.mjs corrida` primero'));
      process.exit(1);
    }
    const base = abreBase({ ruta: RUTA });
    const repo = repositorioDeRegistros({ base, organizacionId: ORGANIZACION.id });
    const lote = await repo.leeLote(loteId);
    console.log(`  lote           ${lote ? verde('recuperado') : rojo('PERDIDO')} · ${lote?.titulo ?? '—'}`);
    console.log(`  estado         ${lote?.estado}`);
    console.log(`  documentos     ${cuenta(base, 'documentos')}`);
    console.log(`  tablas         ${tablasDe(base).length}`);
    console.log(`  ${clave} vigente  ${negrita(valorVigente(base, documentoId, clave) ?? rojo('PERDIDO'))}`);
    const versiones = base.db
      .prepare('select version, valor, motivo from versiones_de_campo where documento_id = ? and clave = ? order by version')
      .all(documentoId, clave);
    for (const v of versiones) {
      console.log(gris(`     v${v.version}  ${String(v.valor).slice(0, 36).padEnd(38)} ${v.motivo}`));
    }
    const encontrado = await repo.busca({ identificador: 'A-1000' });
    console.log(`  busqueda por identificador "A-1000": ${encontrado.length} lote(s)`);
    base.cierra();
    return;
  }

  if (comando === 'xml') {
    rmSync(RUTA, { force: true });
    paso('Las mismas facturas, por la via del XML');
    const { base, resumen } = siembra({ ruta: RUTA, semilla: 'corrida-demo' });
    const { leeComoXml } = await import('./corrida-xml.ts');
    const lecturas = leeComoXml(base, resumen.documentos, UMBRALES);

    console.log(`  documentos     ${lecturas.length}`);
    console.log(`  campos totales ${lecturas.reduce((n, l) => n + l.campos.length, 0)}`);
    console.log(`  bajo umbral    ${lecturas.reduce((n, l) => n + l.bajoUmbral, 0)} ${gris('(un XML analiza o no analiza: no hay 0,87)')}`);

    const primera = lecturas[0];
    console.log(`\n  ${negrita('documento 1')} · folio ${primera.folio}`);
    for (const campo of primera.campos.slice(0, 6)) {
      console.log(`     ${campo.clave.padEnd(14)} ${String(campo.valor).slice(0, 32).padEnd(34)} ${campo.confianza.toFixed(3)} ${verde('✓')}`);
    }
    console.log(`     proveedor →  ${primera.proveedorEstado} ${primera.proveedorResuelto ? verde(primera.proveedorResuelto) : gris('—')}`);
    console.log(`     gtin      →  ${primera.gtinEstado} ${primera.gtinResuelto ? verde(primera.gtinResuelto) : gris('sin resolver')}`);

    const mismoQueElOcr = lecturas.filter((l) => l.proveedorResuelto !== null).length;
    console.log(`\n  ${negrita('La reconciliacion funciona igual')}`);
    console.log(`     proveedores resueltos  ${mismoQueElOcr} de ${lecturas.length} ${gris('(el XML trae la VARIANTE, no la forma del catalogo)')}`);

    const sinCotejo = lecturas.filter((l) => l.seAutoValida).length;
    const conCotejo = lecturas.filter((l) => l.seAutoValidaCotejado).length;
    console.log(`\n  ${negrita('La barrera del cotejo, que es lo que esta corrida destapo')}`);
    console.log(`     sin cotejar contra nada  se auto-validan ${sinCotejo === 0 ? verde('0') : rojo(String(sinCotejo))} de ${lecturas.length}`);
    console.log(`     cotejadas                se auto-validan ${verde(String(conCotejo))} de ${lecturas.length}`);
    console.log(`     sello verificado                         ${rojo(String(primera.selloVerificado))} ${gris('(y no va a cambiar)')}`);
    console.log(gris('\n     Antes se promovian las doce sin que nadie las mirara. Los campos de un XML'));
    console.log(gris('     llegan con confianza 1 y sin region que citar, asi que pasaban las dos'));
    console.log(gris('     barreras que habia sin tocarlas.'));
    console.log(gris('\n     Para el DATO estaba bien: es una transcripcion, no hay lectura que revisar.'));
    console.log(gris('     Para el DOCUMENTO no decia nada — el sello no se verifica, y un CFDI'));
    console.log(gris('     inventado analiza igual de limpio. Lo que lo hace fiable no es su'));
    console.log(gris('     confianza: es que otra fuente independiente diga lo mismo.'));

    base.cierra();
    return;
  }

  console.log(`
${negrita('Banco de pruebas del extractor documental')}

  ${verde('siembra')}        crea la base con el negocio ficticio    ${gris('[--semilla X] [--facturas N]')}
  ${verde('corrida')}        el camino completo, con reinicio de PROCESO real
  ${verde('xml')}            las mismas facturas por la via del XML, y que cambia
  ${verde('determinismo')}   dos siembras con la misma semilla
  ${verde('descriptores')}   los tres estados, leidos de la base
  ${verde('peligroso')}      el escenario de §2.10 y su barrera
  ${verde('destruye')}       borra la base

${gris('Los umbrales que usa la demostracion NO son una recomendacion: se miden sobre corpus')}
${gris('real (TAR-17, TAR-25) y siguen sin fijarse. Este banco no los acerca.')}
`);
}

main().catch((error) => {
  console.error(rojo(`\n${error.stack ?? error.message}\n`));
  process.exit(1);
});
