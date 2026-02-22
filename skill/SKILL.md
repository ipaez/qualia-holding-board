# Skill: Holding Board Manager

## Descripcion
Gestionar un Holding Board - sistema visual de nodos con backlog sincronizado bidireccional con agentes AI. El board organiza empresas, negocios y proyectos como un arbol de nodos generico. Los agentes trabajan con su BACKLOG.md y el sistema sincroniza automaticamente.

## Conceptos clave

### Tres capas independientes
1. **Nodos** - arbol flexible, solo estructura visual. Sub-nodos, info, links. No saben de agentes.
2. **Agentes + Backlog** - cada agente tiene su BACKLOG.md con items agrupados por proyecto.
3. **Proyectos** - el pegamento. Un proyecto tiene un nombre y un agente asignado. Al asociar proyectos a un nodo, el nodo hereda visibilidad del backlog correspondiente.

### Estados del backlog
- `backlog` - anotado, por aterrizar
- `todo` - aterrizado y listo para tomar
- `in-progress` - en ejecucion
- `blocked` - falta input del usuario
- `done` - completado

### Sync bidireccional
- Agente edita BACKLOG.md → se refleja en el board
- Usuario mueve algo en el board → se escribe al BACKLOG.md del agente
- Los agentes no saben que existe el holding. Solo ven su backlog.

## API Base
Base URL: `http://127.0.0.1:18795/qualia-board`

## Endpoints

### Tasks
- `GET /api/tasks` - Lista tareas. Query: `?status=X&project=Y&agent=Z&priority=P`
- `POST /api/tasks` - Crear tarea. Body: `{title, project, agent, status, description, priority, type}`
- `PUT /api/tasks/:id` - Editar tarea
- `DELETE /api/tasks/:id` - Eliminar tarea
- `POST /api/tasks/:id/move` - Cambiar status. Body: `{status}`

Status validos: `backlog`, `todo`, `in-progress`, `blocked`, `done`
Prioridades: `critical`, `high`, `medium`, `low`

### Projects
Proyectos son el pegamento entre nodos y backlogs de agentes.

- `GET /api/projects` - Lista proyectos (objetos con id, name)
- `POST /api/projects` - Crear. Body: `{name}`
- `PUT /api/projects/:id` - Editar. Body: `{name}`
- `DELETE /api/projects/:id` - Eliminar

El proyecto es solo una agrupacion. El campo `agent` en cada tarea determina a que BACKLOG.md se sincroniza.

Ejemplo:
```json
{"id": "iq-setup", "name": "IQ Setup"}
```

### Scope (filtrado por nodo)
- `GET /api/nodes/:boardId/:nodeId/backlog` - Backlog filtrado para un nodo y todos sus descendientes. Retorna `{projects, tasks}`.
- `GET /api/nodes/:boardId/:nodeId/tree` - Arbol completo del nodo con sub-nodos resueltos.

Ejemplo: `GET /api/nodes/root/n-academy/backlog` retorna todas las tareas de Qualia Academy y sus sub-nodos.

### Ecosystem (arbol de nodos)
- `GET /api/ecosystem/boards` - Lista boards
- `GET /api/ecosystem/boards/:id` - Un board
- `POST /api/ecosystem/boards` - Crear board. Body: `{name}`
- `PUT /api/ecosystem/boards/:id` - Editar board
- `DELETE /api/ecosystem/boards/:id` - Eliminar (no root)

#### Nodos
- `POST /api/ecosystem/boards/:bid/nodes` - Crear nodo
- `PUT /api/ecosystem/boards/:bid/nodes/:nid` - Editar nodo
- `DELETE /api/ecosystem/boards/:bid/nodes/:nid` - Eliminar nodo

Campos del nodo:
- `name` (string) - nombre visible
- `description` (string) - descripcion corta
- `color` (hex) - color del nodo
- `x, y` (number) - posicion en canvas
- `projects` (string[]) - nombres de proyectos asociados
- `links` (array) - `[{label, url, type}]` recursos del nodo (logo, web, dashboard, etc)
- `refs` (array) - `[{boardId, cardId}]` sub-nodos referenciados

Colores: `#c9a94e` (gold), `#3498db` (azul), `#2ecc71` (verde), `#e74c3c` (rojo), `#9b59b6` (morado), `#e67e22` (naranja), `#1abc9c` (teal), `#e056a0` (rosa), `#f39c12` (amarillo), `#06d6d6` (cyan)

#### Conexiones
- `POST /api/ecosystem/boards/:bid/connections` - Body: `{from, to, label}`
- `PUT /api/ecosystem/boards/:bid/connections/:cid` - Editar
- `DELETE /api/ecosystem/boards/:bid/connections/:cid` - Eliminar

### Brainstorm
Boards de ideas con cards y conexiones.

- `GET /api/brainstorm/boards` - Lista boards
- `POST /api/brainstorm/boards` - Crear board
- Cards y conexiones: mismos endpoints bajo `/api/brainstorm/boards/:bid/...`

Campos de cards: `title, summary, detail, source, color, tags, icon, x, y, refs`

### Stats
- `GET /api/stats` - Resumen: `{byStatus, byProject, total}`

### Config
- `GET /api/config` - Configuracion del sistema

### Branding
- `GET /api/branding` - Theme actual (colores, logo, nombre)

## Data
- Fuente de verdad: `board-data.json`
- Template: `board-data.template.json`
- Branding: `branding/theme.json`
- Backups: `versions/`

## Como construir el dashboard de un cliente

1. Crear boards del ecosistema con la estructura del holding
2. Crear nodos para cada empresa/negocio/iniciativa
3. Usar refs para crear sub-nodos (arbol recursivo)
4. Crear proyectos con `POST /api/projects` asignando el agente correspondiente
5. Asociar proyectos a nodos via `PUT /api/ecosystem/boards/:bid/nodes/:nid` con `{projects: ["nombre"]}`
6. Crear tareas con `POST /api/tasks` asignando proyecto y agente
7. El sync se encarga del resto - los BACKLOG.md se actualizan automaticamente

## Ejemplo de flujo

```
# 1. Crear proyecto
POST /api/projects
{"name": "Mi Proyecto"}

# 2. Asignar a un nodo existente
PUT /api/ecosystem/boards/root/nodes/n-infraqualia
{"projects": ["Mi Proyecto"]}

# 3. Crear tarea
POST /api/tasks
{"title": "Implementar feature X", "project": "Mi Proyecto", "agent": "infraqualia", "status": "todo"}

# 4. Ver backlog filtrado por nodo
GET /api/nodes/root/n-infraqualia/backlog
# -> retorna todas las tareas de los proyectos asociados a InfraQualia y sus sub-nodos
```
