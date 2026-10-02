/**
 * Los invariantes de calidad de datos, como enunciados de conjuntos. Cada uno tiene nombre, el
 * enunciado que se comprueba y el defecto que lo viola. Un Γ que viola uno NO se sella: un bridge
 * que no cierra es un bug en los datos, y aquí se detiene antes de llegar a una cifra.
 */
export interface Invariante {
  readonly id: string;
  readonly nombre: string;
  readonly enunciado: string;
  readonly defecto: string;
}

export const INVARIANTES: readonly Invariante[] = [
  { id: 'INV-01', nombre: 'funcion-cliente', enunciado: '∀ t ∈ Tx : |{c : (t, c) ∈ cliente}| = 1 — cliente es una función, no una relación', defecto: 'el mismo ticket o factura aparece con dos clientes' },
  { id: 'INV-02', nombre: 'uuid-unico', enunciado: 'los UUID de los comprobantes forman un conjunto: dos documentos distintos no comparten UUID', defecto: 'dos XML distintos con el mismo UUID' },
  { id: 'INV-03', nombre: 'nota-referencia', enunciado: '∀ n ∈ Notas : ∅ ≠ relacionadas(n) ⊆ UUID(Ingresos vigentes)', defecto: 'nota de crédito huérfana, sin relación o relacionada con una factura cancelada' },
  { id: 'INV-04', nombre: 'nota-mismo-cliente', enunciado: '∀ n ∈ Notas, ∀ f ∈ relacionadas(n) : cliente(n) = cliente(f)', defecto: 'la nota corrige la factura de otro cliente' },
  { id: 'INV-05', nombre: 'moneda-normalizada', enunciado: '∀ monto : moneda = MXN ∨ ∃ tipo de cambio en el propio comprobante', defecto: 'un CFDI en USD sin TipoCambio' },
  { id: 'INV-06', nombre: 'fecha-valida', enunciado: '∀ documento : fecha ∈ calendario', defecto: 'fecha ilegible o imposible' },
  { id: 'INV-07', nombre: 'anonimo-no-es-cliente', enunciado: 'seudónimo(RFC genérico) ∉ Clientes — público en general es la clase anónima', defecto: 'XAXX010101000 contado como un cliente' },
  { id: 'INV-08', nombre: 'global-concilia', enunciado: '∀ global g : neto(g) = Σ tickets anónimos del periodo de g', defecto: 'la factura global no cuadra con la caja' },
  { id: 'INV-09', nombre: 'ticket-factura', enunciado: '∀ ticket con UUID u : u ∈ Ingresos nominativos ∧ Σ tickets(u) = neto(u)', defecto: 'el ticket cita una factura que no existe o que no cuadra' },
  { id: 'INV-10', nombre: 'pago-referencia', enunciado: '∀ p ∈ Pagos : documento(p) ∈ Ingresos PPD ∧ Σ pagado(f) ≤ total(f)', defecto: 'complemento de pago de una factura que no existe, o que paga de más' },
  { id: 'INV-11', nombre: 'segmento-funcion', enunciado: 'segmento : Clientes → Segmentos es una función total', defecto: 'el mismo RFC en dos segmentos del catálogo' },
  { id: 'INV-12', nombre: 'ticket-unico', enunciado: 'los tickets forman un conjunto: el mismo folio no trae dos importes', defecto: 'el mismo ticket dos veces con importes distintos' },
];

export const invariante = (id: string): Invariante => {
  const i = INVARIANTES.find((x) => x.id === id);
  if (!i) throw new Error(`invariante desconocido: ${id}`);
  return i;
};
