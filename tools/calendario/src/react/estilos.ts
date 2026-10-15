/**
 * Estilos propios, con prefijo `cal-` y variables CSS: la UI no depende de que el consumidor tenga
 * Tailwind (ni de su configuracion). Se inyectan una sola vez con `<style href precedence>` (React 19).
 * Tema claro/oscuro por `prefers-color-scheme` o por un ancestro `.dark`; se re-tematiza con las variables.
 */
export const CSS_CALENDARIO = `
.cal-tema{--cal-fondo:#ffffff;--cal-fondo-2:#f6f7f9;--cal-texto:#111827;--cal-tenue:#6b7280;--cal-borde:#e5e7eb;--cal-linea:#f0f1f4;
--cal-acento:#2563eb;--cal-hoy:#2563eb;--cal-ahora:#ef4444;--cal-ok:#15803d;--cal-aviso:#b45309;--cal-peligro:#b91c1c;--cal-hora:48px;
font:14px/1.35 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--cal-texto)}
.cal-raiz{background:var(--cal-fondo);border:1px solid var(--cal-borde);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;min-height:0}
@media (prefers-color-scheme:dark){.cal-tema{--cal-fondo:#111318;--cal-fondo-2:#181b22;--cal-texto:#e5e7eb;--cal-tenue:#9ca3af;--cal-borde:#2a2f3a;--cal-linea:#1d212a;--cal-acento:#60a5fa;--cal-hoy:#60a5fa}}
.dark .cal-tema{--cal-fondo:#111318;--cal-fondo-2:#181b22;--cal-texto:#e5e7eb;--cal-tenue:#9ca3af;--cal-borde:#2a2f3a;--cal-linea:#1d212a;--cal-acento:#60a5fa;--cal-hoy:#60a5fa}
.cal-barra{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--cal-borde);flex-wrap:wrap}
.cal-titulo{font-size:17px;font-weight:650;margin:0 6px;flex:1;white-space:nowrap}.cal-titulo::first-letter{text-transform:uppercase}
.cal-boton{appearance:none;border:1px solid var(--cal-borde);background:var(--cal-fondo);color:var(--cal-texto);border-radius:8px;padding:5px 10px;font:inherit;cursor:pointer}
.cal-boton:hover{background:var(--cal-fondo-2)}.cal-boton:focus-visible{outline:2px solid var(--cal-acento);outline-offset:1px}
.cal-boton[aria-pressed=true]{background:var(--cal-acento);border-color:var(--cal-acento);color:#fff}
.cal-boton-primario{background:var(--cal-acento);border-color:var(--cal-acento);color:#fff}.cal-boton-primario:hover{filter:brightness(1.08);background:var(--cal-acento)}
.cal-boton-peligro{color:var(--cal-peligro)}
.cal-grupo{display:inline-flex;border:1px solid var(--cal-borde);border-radius:9px;overflow:hidden}
.cal-grupo .cal-boton{border:0;border-radius:0}.cal-grupo .cal-boton+.cal-boton{border-left:1px solid var(--cal-borde)}
.cal-cabecera-dias{display:grid;border-bottom:1px solid var(--cal-borde);background:var(--cal-fondo)}
.cal-cabecera-dia{padding:6px 4px;text-align:center;font-size:12px;color:var(--cal-tenue);text-transform:uppercase;letter-spacing:.04em}
.cal-cabecera-dia b{display:block;font-size:20px;color:var(--cal-texto);letter-spacing:0;font-weight:600}
.cal-cabecera-dia[data-hoy=true] b{color:#fff;background:var(--cal-hoy);border-radius:999px;width:34px;height:34px;line-height:34px;margin:2px auto 0}
.cal-todo-dia{display:grid;border-bottom:1px solid var(--cal-borde);min-height:28px}
.cal-cuerpo{overflow:auto;position:relative;flex:1;min-height:0}
.cal-rejilla{display:grid;position:relative}
.cal-horas{position:relative}.cal-hora{height:var(--cal-hora);font-size:11px;color:var(--cal-tenue);text-align:right;padding-right:6px;transform:translateY(-7px)}
.cal-columna{position:relative;border-left:1px solid var(--cal-borde);background-image:linear-gradient(var(--cal-linea) 1px,transparent 1px);background-size:100% var(--cal-hora)}
.cal-columna[data-hoy=true]{background-color:color-mix(in srgb,var(--cal-hoy) 4%,transparent)}
.cal-evento{position:absolute;border-radius:7px;padding:3px 6px;font-size:12px;overflow:hidden;cursor:pointer;user-select:none;touch-action:none;
background:color-mix(in srgb,var(--cal-color) 18%,var(--cal-fondo));border-left:3px solid var(--cal-color);color:var(--cal-texto);box-shadow:0 1px 0 rgba(0,0,0,.04)}
.cal-evento:hover{background:color-mix(in srgb,var(--cal-color) 28%,var(--cal-fondo))}.cal-evento:focus-visible{outline:2px solid var(--cal-acento)}
.cal-evento strong{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cal-evento small{color:var(--cal-tenue);font-variant-numeric:tabular-nums}
.cal-evento[data-arrastrando=true]{opacity:.85;box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:5}
.cal-evento[data-recurrente=true] strong::after{content:" ↻";color:var(--cal-tenue);font-weight:400}
.cal-tirador{position:absolute;left:0;right:0;bottom:0;height:7px;cursor:ns-resize}
.cal-chip{display:block;margin:2px 3px;padding:2px 6px;border-radius:6px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;
background:color-mix(in srgb,var(--cal-color) 20%,var(--cal-fondo));border-left:3px solid var(--cal-color)}
.cal-actividad{position:absolute;right:2px;width:46%;min-width:44px;border-radius:5px;font-size:10px;padding:1px 4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;pointer-events:auto;
color:#3b2a00;background:repeating-linear-gradient(135deg,#fde68a 0 6px,#fcd34d 6px 12px);border:1px solid #f59e0b;opacity:.92}
.cal-actividad[data-grupo=ventas]{color:#3b0764;background:repeating-linear-gradient(135deg,#e9d5ff 0 6px,#d8b4fe 6px 12px);border-color:#a855f7}
.cal-actividad[data-grupo=espejo]{color:#0c4a6e;background:repeating-linear-gradient(135deg,#bae6fd 0 6px,#7dd3fc 6px 12px);border-color:#0ea5e9}
.cal-ahora{position:absolute;left:0;right:0;height:2px;background:var(--cal-ahora);z-index:4}.cal-ahora::before{content:"";position:absolute;left:-5px;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--cal-ahora)}
.cal-mes{display:grid;grid-template-columns:repeat(7,1fr);flex:1}
.cal-mes-dia{min-height:104px;border-right:1px solid var(--cal-borde);border-bottom:1px solid var(--cal-borde);padding:4px 2px;font-size:12px}
.cal-mes-dia[data-fuera=true]{background:var(--cal-fondo-2);color:var(--cal-tenue)}
.cal-mes-num{display:inline-block;min-width:24px;text-align:center;border-radius:999px;margin:0 0 2px 4px}.cal-mes-dia[data-hoy=true] .cal-mes-num{background:var(--cal-hoy);color:#fff}
.cal-lista{padding:8px 14px;overflow:auto}.cal-lista h4{margin:14px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--cal-tenue)}
.cal-fila{display:flex;gap:10px;align-items:center;padding:6px 8px;border-radius:8px;cursor:pointer}.cal-fila:hover{background:var(--cal-fondo-2)}
.cal-punto{width:9px;height:9px;border-radius:50%;background:var(--cal-color);flex:none}
.cal-salud{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:4px 10px;font-size:12px;border:1px solid var(--cal-borde)}
.cal-salud::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--cal-estado)}
.cal-salud[data-estado=fresco]{--cal-estado:var(--cal-ok)}.cal-salud[data-estado=rancio]{--cal-estado:var(--cal-aviso)}.cal-salud[data-estado=error]{--cal-estado:var(--cal-peligro);border-color:var(--cal-peligro)}
.cal-velo{position:fixed;inset:0;background:rgba(15,23,42,.45);display:grid;place-items:center;z-index:50;padding:16px}
.cal-dialogo{background:var(--cal-fondo);color:var(--cal-texto);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.3);width:min(520px,100%);max-height:92vh;overflow:auto;padding:18px}
.cal-dialogo h3{margin:0 0 12px;font-size:17px}
.cal-campo{display:grid;gap:4px;margin:0 0 10px;font-size:12px;color:var(--cal-tenue)}
.cal-campo input,.cal-campo select,.cal-campo textarea{font:inherit;font-size:14px;color:var(--cal-texto);background:var(--cal-fondo);border:1px solid var(--cal-borde);border-radius:8px;padding:7px 9px}
.cal-fila-campos{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.cal-aviso{border-radius:9px;padding:8px 10px;font-size:13px;background:color-mix(in srgb,var(--cal-aviso) 12%,var(--cal-fondo));border:1px solid color-mix(in srgb,var(--cal-aviso) 40%,transparent)}
.cal-error{border-radius:9px;padding:8px 10px;font-size:13px;background:color-mix(in srgb,var(--cal-peligro) 10%,var(--cal-fondo));border:1px solid color-mix(in srgb,var(--cal-peligro) 45%,transparent);color:var(--cal-texto)}
.cal-acciones{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}
.cal-huecos{display:grid;gap:10px}.cal-huecos-dia{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.cal-huecos-dia span{width:100%;font-size:12px;color:var(--cal-tenue)}.cal-huecos-dia span::first-letter{text-transform:uppercase}
.cal-hueco{font-variant-numeric:tabular-nums}.cal-hueco[aria-pressed=true]{background:var(--cal-acento);color:#fff;border-color:var(--cal-acento)}
@media (max-width:640px){.cal-fila-campos{grid-template-columns:1fr}.cal-titulo{font-size:15px}}
`
