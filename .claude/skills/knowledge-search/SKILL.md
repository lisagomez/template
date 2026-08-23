---
name: knowledge-search
description: >
  Busca en .claude/knowledge/, el knowledge base compilado automaticamente de conversaciones. Usar cuando se necesite contexto de sesiones pasadas, decisiones previas, patrones, insights, lecciones aprendidas o Q&A compilado, y cuando el usuario diga knowledge, segundo cerebro, busca en el cerebro, que aprendimos, que decidimos, que hablamos de X, historial o decisiones pasadas. No confundir con memory-manager: este es automatico y no curado manualmente.
allowed-tools: Bash(cat *), Read, Glob, Grep
metadata:
  author: tu-agente
  version: "1.0"
  project: tu-repo
---

# Knowledge Search — Segundo Cerebro de tu agente

> Busca en el knowledge base compilado automaticamente de todas las conversaciones.
> Diferente a `.claude/memory/` (curada manualmente). Esto es COMPILADO automaticamente.

## Arquitectura

```
.claude/knowledge/
├── index.md              ← LEER PRIMERO. Tabla con todos los articulos + resumen de 1 linea.
├── log.md                ← Historial de compilaciones (cuando se creo cada articulo)
├── concepts/             ← Conocimiento atomico (un tema = un archivo)
│   ├── video-conversion-model.md
│   ├── funnel-bottleneck-analysis.md
│   └── ...
├── connections/          ← Relaciones entre conceptos (no obvias)
│   ├── content-drives-revenue.md
│   └── ...
└── qa/                   ← Preguntas respondidas y archivadas
    └── ...
```

## Como Buscar

### Paso 1: Leer el Index
```
Read .claude/knowledge/index.md
```
El index tiene una tabla con TODOS los articulos, un summary de 1 linea, y la fecha.
Usa esto como MAPA para saber donde buscar.

### Paso 2: Leer Articulos Relevantes
Basandote en el index, lee los 2-5 articulos que sean relevantes a la pregunta:
```
Read .claude/knowledge/concepts/nombre-del-articulo.md
Read .claude/knowledge/connections/nombre-de-conexion.md
```

### Paso 3: Si el Index No Basta
Busca por contenido en todos los articulos:
```
Grep "termino de busqueda" .claude/knowledge/
```

O busca en los daily logs crudos (conversaciones sin procesar):
```
Grep "termino" .claude/daily/
```

### Paso 4: Sintetizar Respuesta
Combina informacion de multiples articulos. Cita fuentes con [[wikilinks]].

## Diferencia con Memory Manager

| Aspecto | memory-manager | knowledge-search |
|---------|---------------|-----------------|
| **Fuente** | el usuario decide que guardar | Compilacion AUTOMATICA de conversaciones |
| **Contenido** | Correcciones, decisiones, referencias | Conceptos, patrones, lecciones, metricas |
| **Ubicacion** | `.claude/memory/` | `.claude/knowledge/` |
| **Frecuencia** | Manual (el usuario aprueba) | Cada noche a las 11 PM |
| **Tamano** | ~15 archivos curados | Crece automaticamente (ilimitado) |

## Cuando Usar Este Skill

- el usuario pregunta sobre algo que se discutio en sesiones pasadas
- Necesitas contexto historico antes de tomar una decision
- Quieres saber que patrones se han descubierto
- Buscas una leccion aprendida o gotcha documentada
- el usuario dice "que sabe el cerebro sobre X"

## Cuando NO Usar

- Para metricas en tiempo real → usa `business-intelligence`
- Para correcciones del usuario (formato, reglas) → usa `memory-manager`
- Para datos de Supabase → usa `supabase`
