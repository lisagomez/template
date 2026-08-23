# google-workspace — skill para tu agente

Paquete listo para instalar. Copia esta carpeta dentro de
`.claude/skills/` de tu proyecto y tu agente la detecta sola.

```bash
unzip google-workspace.zip -d .claude/skills/
```

Contiene 1 archivos.

## Lo que NO viene (y por qué)

Algunas piezas de la skill original no viajan en el paquete. Se
quitaron a propósito; si alguna referencia del texto apunta a ellas, no es un
error del paquete: es material que no sale de su casa.

- `references/calendar-ids.md` — los IDs reales de los 9 calendarios personales. Dato privado sin utilidad para nadie más: cada quien genera los suyos
