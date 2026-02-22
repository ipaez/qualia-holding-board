# Holding Board v2 - Migration Plan

## Principio rector
El mapeo nodo<>proyecto<>agente vive en datos (board-data.json), no en codigo. El sistema es generico - cualquiera lo descarga y arma su holding.

---

## Modelo mental

Tres capas independientes:
1. **Nodos** - arbol flexible, solo estructura visual/organizativa. Sub-nodos, info, links. No saben de agentes ni backlogs.
2. **Agentes + Backlog** - viven en su mundo. Cada agente tiene su BACKLOG.md con items agrupados por "proyecto" (que es solo un titulo/categoria).
3. **Proyectos** - el pegamento. Un proyecto es un nombre que existe en el backlog de un agente. Cuando se asigna a un nodo, el nodo "hereda" visibilidad de esos items.

El sync es bidireccional:
- Agente mueve un item en su BACKLOG.md -> el sistema holding lo refleja
- Usuario mueve algo desde el sistema holding -> se escribe al BACKLOG.md del agente
- El agente no sabe que existe un holding. Solo ve que su backlog cambio.

---

## Estados

5 estados, ciclo de vida claro:
- **backlog** - se me ocurrio algo, lo anoto para aterrizar despues
- **todo** - ya esta aterrizado y redondo
- **in-progress** - el agente ya comenzo a trabajar
- **blocked** - falta algo por parte del usuario
- **done** - lista

Quien tiene la pelota:
- backlog -> nadie (parking lot)
- todo -> agente (listo para tomar)
- in-progress -> agente (trabajando)
- blocked -> usuario (necesita input)
- done -> nadie (cerrado)

---

## Fase 1 - Modelo de datos

### 1.1 Simplificar nodos del ecosistema

Campos de un nodo:
```
id, name, description, color, x, y
links: [{label, url, type}]    // logo, web, dashboard, etc
projects: [string]              // nombres de proyectos asociados
refs: [{boardId, cardId}]       // sub-nodos (ya existe)
```

Campos eliminados: agent, projectName, stage, revenue, metrics, initiatives, objective, active, tags, notes.

### 1.2 Proyectos como entidad con metadata

De string[] a objetos:
```json
{
  "projects": [
    {
      "id": "iq-setup",
      "name": "IQ Setup",
      "agent": "infraqualia"
    }
  ]
}
```

Tres campos. `agent` indica en que BACKLOG.md vive ese proyecto.

### 1.3 Migrar estados existentes

idea -> backlog, review -> in-progress, ready -> todo

---

## Fase 2 - Sync generico

### 2.1 Reescribir sync-backlogs.mjs

Eliminar AGENT_PROJECTS, AGENT_FILTERS, COMPANIES, HEADERS. Reemplazar con:
1. Leer data.projects
2. Agrupar projects por agent
3. Para cada agent, filtrar tasks de sus projects
4. Escribir BACKLOG.md agrupado por project name

Header dinamico, sin templates hardcodeados.

### 2.2 Actualizar backlog-watcher.mjs

Misma logica de parseo y write-back. Cambios:
- Nuevos tasks sin proyecto se asignan al agent que los creo
- Status mapping usa los 5 estados

### 2.3 Eliminar parse-backlogs.mjs

Import inicial hardcodeado. Ya no se necesita.

---

## Fase 3 - Scope filtering (API)

### 3.1 GET /api/nodes/:nodeId/backlog

1. Encontrar el nodo en su board
2. Recolectar todos los projects del nodo
3. Recorrer refs recursivamente, recolectar projects de sub-nodos
4. Filtrar tasks que pertenezcan a esos projects
5. Retornar agrupado

### 3.2 GET /api/nodes/:nodeId/tree

Retorna el arbol completo de un nodo con sub-nodos resueltos.

---

## Fase 4 - Portabilidad

### 4.1 board-data.template.json

Actualizar con nueva estructura.

### 4.2 Config de workspaces

```json
{
  "config": {
    "workspacesBase": "~/.openclaw",
    "backlogFilename": "BACKLOG.md"
  }
}
```

### 4.3 Branding - se mantiene igual.

---

## Fase 5 - Skill

Actualizar SKILL.md:
- Como crear nodos (campos simplificados)
- Como crear/asignar proyectos a nodos
- Como funciona el sync (transparente para el agente)
- Como consultar backlog por scope
- Los 5 estados y su significado
- Ejemplo de uso para construir dashboard de un cliente

---

## Orden de ejecucion

| Paso | Que | Dependencia |
|------|-----|-------------|
| 1 | Migrar schema de nodos y projects en board-data.json | - |
| 2 | Migrar estados (backlog, todo, in-progress, blocked, done) | 1 |
| 3 | Reescribir sync-backlogs.mjs (data-driven) | 1 |
| 4 | Actualizar backlog-watcher.mjs | 2, 3 |
| 5 | Eliminar parse-backlogs.mjs | 3 |
| 6 | Agregar endpoints scope (/nodes/:id/backlog, /nodes/:id/tree) | 1 |
| 7 | Actualizar server.mjs (API nodos simplificada) | 1 |
| 8 | Actualizar template y config de portabilidad | 1 |
| 9 | Reescribir SKILL.md | todo lo anterior |

No se toca interfaz. Todo es backend + datos + documentacion.
