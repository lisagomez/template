<!-- ALTO: ARTEFACTO AUTOGENERADO por roadmapCostosMarkdown(). No lo edites a mano: node tools/ventas-whatsapp/e2e/genera-roadmaps.mjs -->
# Roadmap de costos y presupuesto del laboratorio — FICTICIO

> Generado por `roadmapCostosMarkdown()` (`src/laboratorio/documentos.ts`); no se edita a mano. **Todo es ficticio
> salvo lo marcado «medido»**: sirve para ver la forma de los costos por fase, no para fijar precios. El costo de Meta
> usa las reglas del simulador (entrada gratis por anuncio, cupo de 1,000 NO verificado, utilidad y marketing) y la
> tarjeta de tarifas NO verificada.

## Supuestos

| Supuesto | Valor | Naturaleza | Nota |
|---|---|---|---|
| tipoDeCambio | 18.5 | ficticio | MXN por USD, fijo para el ejercicio |
| pymesPorMes | [1,1,3,3,10,40,100,130,160,190,220,250] | ficticio | meses 1-4: piloto (fases 0-3); 5-7: multi-pyme (fase 4); 8-12: escala (fase 5) |
| conversacionesPorPymeMes | 600 | ficticio | 20 al día: una pyme de comida o boutique local |
| fraccionDesdeAnuncio | 0.4 | ficticio | conversaciones que nacen de un anuncio Click-to-WhatsApp (72 h gratis) |
| mensajesPorConversacion | 2.72 | medido | mensajes del negocio por conversación, laboratorio con cola larga |
| llamadasModeloPorConversacion | 0.3 | medido | con el enrutador determinista (sin él: 2.12) |
| tokensPorLlamada | 210 | medido | tokens ESTIMADOS del modelo simulado; el real: no medido |
| precioModeloUsdPorMillon | 3.2 | ficticio | mezcla 85 % entrada / 15 % salida de un nivel «capaz» (2 y 10 USD/M): referencial hasta el CDC |
| pedidosPorConversacion | 0.12 | ficticio | intención × conversión reales: se miden en el piloto |
| plantillasUtilidadPorPedido | 0.25 | ficticio | avisos de pedido que caen fuera de la ventana (plantilla de utilidad cobrada) |
| marketingPorPymeMesF5 | 150 | ficticio | reactivación con opt-in, solo en la fase 5 |
| infraUsdPorFase | {"piloto":20,"multipyme":90,"escala":450} | ficticio | VPS y base de datos; la fase 5 con trabajadores horizontales y alta disponibilidad |
| soporteHorasPorPymeMes | {"piloto":4,"multipyme":1,"escala":0.5} | ficticio | horas nuestras por pyme (llave en mano → autoservicio) |
| costoHoraSoporteMxn | 250 | ficticio | hora de soporte y operación |
| planMensualMxn | {"piloto":2500,"multipyme":1490,"escala":1490} | ficticio | llave en mano en el piloto; SaaS vertical después |
| kapsoUsdMes | {"hasta3":25,"hasta50":299,"porNumeroExtra":5} | fuente | planes publicados de Kapso (fuente §Kapso): lo que costaría COMPRAR el BSP en vez de construirlo (N-02) |
| numeros | {"sinNumeroPropio":0.35,"fraccionRenta":0.4,"altaVentaMxn":600,"costoAltaVentaMxn":250,"administracionMxn":99,"rentaMxn":249,"costoRentaMxn":70,"colchonPool":0.2} | ficticio | línea N-01: pymes que no traen número; venta (SIM a su nombre) o renta (pool nuestro, con 20 % de colchón y cuarentena). Precios y costo del proveedor: P-09 |
| bsp | {"solutionPartnerDesdeMes":8,"margenSobreMeta":0.12,"desarrolloHoras":240,"costoHoraDesarrolloMxn":450} | ficticio | línea N-02: Tech Provider desde el mes 1 (Meta le cobra a la pyme); Solution Partner desde la escala, con margen sobre lo que cobra Meta |

## Presupuesto del laboratorio y del piloto (una vez)

| Concepto | MXN | Nota |
|---|---:|---|
| Corrida real del arnés (200 conversaciones, niveles capaz y ligero) | $80.32 | tokens estimados con un prompt real (~800 por llamada); el primer gasto de IA, con CDC y firma |
| Campaña Click-to-WhatsApp de prueba (semana 11-13) | $3,000.00 | la paga la pyme piloto; sin ella no se mide la compuerta de la fase 3 |
| SIM dedicada o coexistencia | $150.00 | la pyme piloto trae su número; si no, lo compra con nosotros (N-01) |
| Números de prueba de la línea N-01 (uno en venta y uno en renta, 4 meses) | $530.00 | para probar alta, cuarentena y portabilidad con un proveedor real (P-09) |
| Desarrollo del BSP propio y alta como Tech Provider (N-02) | $108,000.00 | Embedded Signup, bóveda de tokens, cobro y conciliación, revisión de la app de Meta; lo ya construido en el laboratorio no cuenta |
| Revisión legal: aviso de privacidad y contrato con la pyme | $8,000.00 | requisito de la AISIA antes del piloto |
| Infraestructura del piloto (4 meses) | $1,480.00 | VPS y base de datos |
| Soporte y operación del piloto (4 meses, 1 pyme) | $4,000.00 | llave en mano: configuración, catálogo, bandeja |
| Mensajes de Meta en el piloto (4 meses, 1 pyme) | $11.32 | con el cupo de 1,000 (NO verificado) y 40 % por anuncio |
| **Total** | **$125,251.64** | |

## Roadmap mensual (12 meses)

| Mes | Fase | Pymes | Conversaciones | Meta | Meta sin cupo | IA | Infra | Soporte (MXN) | Total (MXN) | Por pyme | Por conversación | Ingreso (MXN) | Margen | BSP Kapso (sensibilidad) |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | piloto | 1 | 600 | USD 0.15 | USD 8.48 | USD 0.12 | USD 20.00 | $1,000.00 | $1,375.07 | $1,375.07 | $2.29 | $2,500.00 | 45 % | USD 25.00 |
| 2 | piloto | 1 | 600 | USD 0.15 | USD 8.48 | USD 0.12 | USD 20.00 | $1,000.00 | $1,375.07 | $1,375.07 | $2.29 | $2,500.00 | 45 % | USD 25.00 |
| 3 | piloto | 3 | 1,800 | USD 0.46 | USD 25.43 | USD 0.36 | USD 20.00 | $3,000.00 | $3,385.20 | $1,128.40 | $1.88 | $7,500.00 | 54.9 % | USD 25.00 |
| 4 | piloto | 3 | 1,800 | USD 0.46 | USD 25.43 | USD 0.36 | USD 20.00 | $3,000.00 | $3,385.20 | $1,128.40 | $1.88 | $7,500.00 | 54.9 % | USD 25.00 |
| 5 | multipyme | 10 | 6,000 | USD 1.53 | USD 84.76 | USD 1.21 | USD 90.00 | $2,500.00 | $4,215.68 | $421.57 | $0.70 | $14,900.00 | 71.7 % | USD 299.00 |
| 6 | multipyme | 40 | 24,000 | USD 6.12 | USD 339.05 | USD 4.84 | USD 90.00 | $10,000.00 | $11,867.73 | $296.69 | $0.49 | $59,600.00 | 80.1 % | USD 299.00 |
| 7 | multipyme | 100 | 60,000 | USD 15.30 | USD 847.62 | USD 12.10 | USD 90.00 | $25,000.00 | $27,171.83 | $271.72 | $0.45 | $149,000.00 | 81.8 % | USD 549.00 |
| 8 | escala | 130 | 78,000 | USD 794.04 | USD 1,876.06 | USD 15.72 | USD 450.00 | $16,250.00 | $39,555.65 | $304.27 | $0.51 | $193,700.00 | 79.6 % | USD 699.00 |
| 9 | escala | 160 | 96,000 | USD 977.28 | USD 2,308.99 | USD 19.35 | USD 450.00 | $20,000.00 | $46,762.72 | $292.27 | $0.49 | $238,400.00 | 80.4 % | USD 849.00 |
| 10 | escala | 190 | 114,000 | USD 1,160.52 | USD 2,741.93 | USD 22.98 | USD 450.00 | $23,750.00 | $53,969.79 | $284.05 | $0.47 | $283,100.00 | 80.9 % | USD 999.00 |
| 11 | escala | 220 | 132,000 | USD 1,343.76 | USD 3,174.86 | USD 26.61 | USD 450.00 | $27,500.00 | $61,176.87 | $278.08 | $0.46 | $327,800.00 | 81.3 % | USD 1,149.00 |
| 12 | escala | 250 | 150,000 | USD 1,527.00 | USD 3,607.80 | USD 30.24 | USD 450.00 | $31,250.00 | $68,383.94 | $273.54 | $0.46 | $372,500.00 | 81.6 % | USD 1,299.00 |

## Líneas de negocio: números (N-01) y BSP propio (N-02)

| Mes | Pymes con número nuestro | Números: ingreso (MXN) | Números: costo (MXN) | BSP | Margen BSP (MXN) | Margen SaaS | Margen con las tres líneas |
|---:|---:|---:|---:|---|---:|---:|---:|
| 1 | 0 | $0.00 | $0.00 | Tech Provider | $0.00 | 45 % | 45 % |
| 2 | 0 | $0.00 | $0.00 | Tech Provider | $0.00 | 45 % | 45 % |
| 3 | 1 | $699.00 | $250.00 | Tech Provider | $0.00 | 54.9 % | 55.7 % |
| 4 | 1 | $99.00 | $0.00 | Tech Provider | $0.00 | 54.9 % | 55.5 % |
| 5 | 4 | $1,896.00 | $710.00 | Tech Provider | $0.00 | 71.7 % | 70.7 % |
| 6 | 14 | $5,886.00 | $2,060.00 | Tech Provider | $0.00 | 80.1 % | 78.7 % |
| 7 | 35 | $13,365.00 | $4,440.00 | Tech Provider | $0.00 | 81.8 % | 80.5 % |
| 8 | 46 | $11,454.00 | $3,290.00 | Solution Partner | $1,762.77 | 79.6 % | 79.3 % |
| 9 | 56 | $12,444.00 | $3,390.00 | Solution Partner | $2,169.56 | 80.4 % | 80.2 % |
| 10 | 67 | $14,883.00 | $4,060.00 | Solution Partner | $2,576.35 | 80.9 % | 80.7 % |
| 11 | 77 | $15,873.00 | $4,160.00 | Solution Partner | $2,983.15 | 81.3 % | 81.2 % |
| 12 | 88 | $18,162.00 | $4,690.00 | Solution Partner | $3,389.94 | 81.6 % | 81.5 % |

## Lo que dice (con estos supuestos)

- **El costo lo domina la operación humana, no Meta ni la IA**: en el mes 1, soporte $1,000.00 de $1,375.07. La palanca de margen es pasar de llave en mano a autoservicio (fase 4), no negociar tarifas.
- **Meta casi no cuesta mientras la pyme viva en el cupo y en anuncios**: USD 0.15 por pyme al mes; **sin el cupo de 1,000** serían USD 8.48. Confirmar el cupo (P-06) mueve el costo de Meta ~57×.
- **En la fase 5 el marketing pasa a ser el mayor costo de Meta**: USD 1,527.00 al mes con 250 pymes. Va con opt-in, precio máximo y, si se cobra, trasladado a la pyme.
- **La IA con el enrutador determinista es marginal**: USD 30.24 al mes con 250 pymes (tokens ESTIMADOS; el real se mide con el arnés tras el CDC). Sin el enrutador serían ~7.1× más llamadas.
- **Números (N-01)**: $67,711.00 de margen en el año; en el piloto casi nada (0 pymes con número nuestro). Es una línea de acompañamiento, no de sustento: su valor es que la pyme sin número pueda arrancar el mismo día. La renta paga el pool entero (colchón y cuarentena incluidos), y por eso su margen por número es menor que el precio sugiere.
- **BSP propio (N-02)**: construirlo cuesta $108,000.00 una vez, sin contar su mantenimiento; comprarlo (Kapso) costaría $115,477.00 en el año. Como Tech Provider no hay ingreso por mensajes (Meta le cobra a la pyme); como Solution Partner, desde el mes 8, el margen sobre Meta suma $12,881.77 en el año y trae dos riesgos que Kapso no trae: el crédito de las pymes y el tipo de cambio (la línea de crédito no admite MXN).
