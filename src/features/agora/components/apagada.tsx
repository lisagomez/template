/** Lo que se ve donde Ágora no corre: el motivo, sin datos. */
export function AgoraApagada({ motivo }: { motivo: string }) {
  return (
    <div className="mx-auto max-w-xl p-8" data-agora-apagada>
      <h1 className="text-lg font-semibold text-slate-900">Ágora</h1>
      <p className="mt-2 text-sm text-slate-600">{motivo}</p>
      <p className="mt-4 text-xs text-slate-500">Ágora es un producto de laboratorio con datos ficticios. La Puerta A2A está cerrada: no se expone a nadie.</p>
    </div>
  );
}
