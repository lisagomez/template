/**
 * Los estilos de la capa: propios, con prefijo `capa-` y variables CSS. No dependen del Tailwind del consumidor
 * (el template sigue en 3.4) y se inyectan una vez con `<style href precedence>` (React 19), como los de
 * `tools/calendario`.
 *
 * Tokens ADAPTADOS de `arbrain/src/app/globals.css` de Arbrain v0.2.10 (829a9e9), Apache-2.0: la escala de
 * elevación de tres capas, los tiempos (`--duration-*`, `--ease-*`), los estados semánticos y la «gramática de
 * página» (ceja en versalitas, titular en serif, descripción breve, acciones a la derecha; un solo foco de luz
 * por pantalla). Cambios: paleta neutra y el ACENTO lo pone cada producto (`--capa-acento`): el morado de
 * Arbrain es su marca y no se usa.
 */
export const CSS_CAPA = `
.capa-tema{--capa-fondo:#f4f4f5;--capa-superficie:#fafafa;--capa-tarjeta:#ffffff;--capa-borde:#e4e4e7;--capa-texto:#0f172a;--capa-tenue:#64748b;
--capa-acento:#0f766e;--capa-ok:#10b981;--capa-error:#ef4444;--capa-aviso:#f59e0b;--capa-serif:ui-serif,'New York','Iowan Old Style',Georgia,'Times New Roman',serif;
--capa-sombra-xs:0 0 0 1px rgba(15,23,42,.04),0 1px 2px rgba(50,50,93,.06),0 1px 1px rgba(0,0,0,.04);
--capa-sombra-md:0 0 0 1px rgba(15,23,42,.08),0 4px 12px rgba(50,50,93,.10),0 2px 4px rgba(0,0,0,.06);
--capa-sombra-lg:0 0 0 1px rgba(15,23,42,.12),0 8px 24px rgba(50,50,93,.12),0 4px 8px rgba(0,0,0,.07);
--capa-rapido:120ms;--capa-normal:200ms;--capa-curva:cubic-bezier(.16,1,.3,1);--capa-radio:14px;--capa-cabecera:52px;
font:14px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--capa-texto)}
@media (prefers-color-scheme:dark){.capa-tema{--capa-fondo:#09090b;--capa-superficie:#131318;--capa-tarjeta:#16161c;--capa-borde:#2a2a30;--capa-texto:#f7f8f8;--capa-tenue:#a1a1aa}}
.dark .capa-tema{--capa-fondo:#09090b;--capa-superficie:#131318;--capa-tarjeta:#16161c;--capa-borde:#2a2a30;--capa-texto:#f7f8f8;--capa-tenue:#a1a1aa}
.capa-ventana{display:grid;grid-template-rows:var(--capa-cabecera) minmax(0,1fr);grid-template-columns:var(--capa-col-explorador,220px) minmax(0,1fr) var(--capa-col-conversacion,380px);
grid-template-areas:"cabecera cabecera cabecera" "explorador lienzo conversacion";height:100dvh;background:var(--capa-fondo);overflow:hidden}
.capa-ventana[data-explorador=cerrado]{--capa-col-explorador:0px}.capa-ventana[data-conversacion=cerrada]{--capa-col-conversacion:0px}
.capa-ventana[data-conversacion=auto]{--capa-col-conversacion:380px}
.capa-cabecera{grid-area:cabecera;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid var(--capa-borde);background:var(--capa-superficie);min-width:0}
.capa-marca{display:flex;align-items:center;gap:8px;font-weight:650;white-space:nowrap;min-width:0}
.capa-marca i{width:10px;height:10px;border-radius:50%;background:var(--capa-acento);flex:none}
.capa-marca small{font-weight:500;color:var(--capa-tenue);overflow:hidden;text-overflow:ellipsis}
.capa-espacio{flex:1}
.capa-icono{display:inline-grid;place-items:center;min-width:34px;height:34px;padding:0 8px;border-radius:10px;border:1px solid transparent;background:transparent;color:var(--capa-tenue);cursor:pointer;font:inherit;gap:6px}
.capa-icono:hover{background:var(--capa-tarjeta);border-color:var(--capa-borde);color:var(--capa-texto)}
.capa-icono:focus-visible,.capa-boton:focus-visible,.capa-entrada:focus-visible{outline:2px solid var(--capa-acento);outline-offset:2px}
.capa-explorador{grid-area:explorador;border-right:1px solid var(--capa-borde);background:var(--capa-superficie);overflow:auto;padding:10px 8px;min-width:0}
.capa-ventana[data-explorador=cerrado] .capa-explorador{display:none}
.capa-ceja{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--capa-tenue);margin:10px 8px 6px;font-weight:600}
.capa-enlace{display:block;padding:7px 10px;border-radius:9px;color:var(--capa-texto);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.capa-enlace:hover{background:var(--capa-tarjeta)}.capa-enlace[aria-current=page]{background:var(--capa-tarjeta);box-shadow:var(--capa-sombra-xs);font-weight:600}
.capa-lienzo{grid-area:lienzo;overflow:auto;min-width:0;background:var(--capa-fondo);position:relative}
.capa-conversacion{grid-area:conversacion;display:flex;flex-direction:column;border-left:1px solid var(--capa-borde);background:var(--capa-superficie);min-width:0;min-height:0}
.capa-ventana[data-conversacion=cerrada] .capa-conversacion{display:none}
.capa-panel{border-bottom:1px solid var(--capa-borde);padding:8px 12px;max-height:38%;overflow:auto}
.capa-panel h4,.capa-titulo-seccion{margin:6px 0;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--capa-tenue)}
.capa-hilo{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:10px;min-height:0}
.capa-mensaje{max-width:92%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}
.capa-mensaje[data-de=persona]{align-self:flex-end;background:color-mix(in srgb,var(--capa-texto) 7%,var(--capa-tarjeta))}
.capa-mensaje[data-de=asistente]{align-self:flex-start;background:var(--capa-tarjeta);box-shadow:var(--capa-sombra-xs)}
.capa-mensaje-pie{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center}
.capa-mensaje a{color:var(--capa-acento)}
.capa-chip{appearance:none;border:1px solid var(--capa-borde);background:var(--capa-tarjeta);color:var(--capa-texto);border-radius:999px;padding:3px 10px;font:inherit;font-size:12.5px;cursor:pointer}
.capa-chip:hover{border-color:var(--capa-acento)}
.capa-freno{border:1px solid color-mix(in srgb,var(--capa-error) 45%,var(--capa-borde));border-radius:12px;padding:10px;margin-top:8px;background:color-mix(in srgb,var(--capa-error) 5%,var(--capa-tarjeta))}
.capa-freno blockquote{margin:6px 0;padding:6px 10px;border-left:3px solid var(--capa-error);background:var(--capa-tarjeta);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;white-space:pre-wrap}
.capa-freno small{color:var(--capa-tenue)}
.capa-compositor{border-top:1px solid var(--capa-borde);padding:10px;display:flex;gap:6px;align-items:flex-end;background:var(--capa-superficie)}
.capa-entrada{flex:1;resize:none;min-height:40px;max-height:140px;border:1px solid var(--capa-borde);border-radius:12px;padding:9px 11px;font:inherit;background:var(--capa-tarjeta);color:var(--capa-texto)}
.capa-boton{appearance:none;border:1px solid var(--capa-borde);background:var(--capa-tarjeta);color:var(--capa-texto);border-radius:10px;padding:7px 12px;font:inherit;cursor:pointer;white-space:nowrap}
.capa-boton:hover{border-color:var(--capa-acento)}.capa-boton:disabled{opacity:.5;cursor:not-allowed}
.capa-boton-primario{background:var(--capa-acento);border-color:var(--capa-acento);color:#fff}.capa-boton-primario:hover{filter:brightness(1.07)}
.capa-boton-peligro{background:var(--capa-error);border-color:var(--capa-error);color:#fff}
.capa-conversar{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:6px 12px 6px 10px;border:1px solid var(--capa-borde);background:var(--capa-tarjeta);color:var(--capa-texto);font:inherit;cursor:pointer;transition:background var(--capa-rapido)}
.capa-conversar[aria-pressed=true]{border-color:var(--capa-acento);background:color-mix(in srgb,var(--capa-acento) 12%,var(--capa-tarjeta))}
.capa-conversar:focus-visible{outline:2px solid var(--capa-acento);outline-offset:2px}
.capa-microfono{width:10px;height:10px;border-radius:50%;background:var(--capa-tenue);flex:none}
.capa-conversar[data-estado=escuchando] .capa-microfono{background:var(--capa-error);box-shadow:0 0 0 0 color-mix(in srgb,var(--capa-error) 60%,transparent);animation:capa-latido 1.4s infinite}
.capa-conversar[data-estado=pensando] .capa-microfono{background:var(--capa-aviso)}
.capa-conversar[data-estado=hablando] .capa-microfono{background:var(--capa-acento)}
.capa-conversar kbd{font:11px ui-monospace,monospace;color:var(--capa-tenue);border:1px solid var(--capa-borde);border-radius:5px;padding:0 4px}
@keyframes capa-latido{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--capa-error) 55%,transparent)}70%{box-shadow:0 0 0 8px transparent}100%{box-shadow:0 0 0 0 transparent}}
@media (prefers-reduced-motion:reduce){.capa-conversar[data-estado=escuchando] .capa-microfono{animation:none}}
.capa-velo{position:fixed;inset:0;background:rgba(15,23,42,.45);display:grid;place-items:center;z-index:60;padding:16px}
.capa-dialogo{background:var(--capa-tarjeta);color:var(--capa-texto);border-radius:var(--capa-radio);box-shadow:var(--capa-sombra-lg);width:min(520px,100%);max-height:92vh;overflow:auto;padding:20px}
.capa-dialogo h2{font-family:var(--capa-serif);font-weight:600;font-size:24px;margin:2px 0 8px}
.capa-dialogo p{margin:0 0 14px;color:var(--capa-tenue)}
.capa-dialogo-pie{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.capa-pasos{display:flex;gap:4px;margin-bottom:12px}.capa-pasos i{height:3px;flex:1;border-radius:2px;background:var(--capa-borde)}.capa-pasos i[data-hecho=true]{background:var(--capa-acento)}
.capa-opcion{display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid var(--capa-borde);border-radius:12px;margin-bottom:8px;cursor:pointer}
.capa-opcion:has(input:checked){border-color:var(--capa-acento);background:color-mix(in srgb,var(--capa-acento) 7%,var(--capa-tarjeta))}
.capa-aviso{font-size:12.5px;color:var(--capa-tenue)}
.capa-dato{display:flex;justify-content:space-between;gap:8px;padding:4px 0;font-size:13px}.capa-dato b{font-variant-numeric:tabular-nums}
.capa-oculto{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:900px){.capa-ventana{grid-template-columns:minmax(0,1fr);grid-template-areas:"cabecera" "lienzo";--capa-col-explorador:0px}
.capa-explorador{display:none}.capa-conversacion{position:fixed;right:0;bottom:0;top:var(--capa-cabecera);width:min(420px,100vw);z-index:40;box-shadow:var(--capa-sombra-lg)}
.capa-ventana[data-conversacion=cerrada] .capa-conversacion,.capa-ventana[data-conversacion=auto] .capa-conversacion{display:none}.capa-solo-ancho{display:none}}
`
