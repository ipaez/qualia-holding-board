# Skill: Qualia Holding Board Manager

## Descripción
Gestionar el Qualia Holding Board — task board visual con ecosistema, brainstorm, kanban, cockpit y proyectos. El agente que use este skill puede crear/editar tareas, nodos del ecosistema, boards de brainstorm y proyectos via API.

## API Base
El board corre dentro de QualIA Hub. Base URL: `http://127.0.0.1:18795/qualia-board`

## Endpoints

### Tasks
- `GET /api/tasks` — Lista todas las tareas. Query params: `?project=X&status=Y`
- `POST /api/tasks` — Crear tarea. Body: `{title, project, status, priority, description}`
- `PUT /api/tasks/:id` — Editar tarea
- `DELETE /api/tasks/:id` — Eliminar tarea

Status válidos: `backlog`, `todo`, `in-progress`, `review`, `done`
Prioridades: `critical`, `high`, `medium`, `low`

### Projects
- `GET /api/projects` — Lista nombres de proyectos
- `POST /api/projects` — Crear proyecto. Body: `{name}`
- `PUT /api/projects/:name` — Renombrar. Body: `{name: "nuevo nombre"}`
- `DELETE /api/projects/:name` — Eliminar proyecto (y sus tareas)

### Ecosystem
Boards recursivos con nodos y conexiones en canvas visual.

- `GET /api/ecosystem/boards` — Lista todos los boards
- `GET /api/ecosystem/boards/:bid` — Un board específico
- `POST /api/ecosystem/boards` — Crear board. Body: `{name}`
- `PUT /api/ecosystem/boards/:bid` — Editar board
- `DELETE /api/ecosystem/boards/:bid` — Eliminar board

#### Nodos (dentro de un board)
- `POST /api/ecosystem/boards/:bid/nodes` — Crear nodo. Body: `{name, x, y, w, h, color, desc, stage, agent, projectName, boardId}`
- `PUT /api/ecosystem/boards/:bid/nodes/:nid` — Editar nodo
- `DELETE /api/ecosystem/boards/:bid/nodes/:nid` — Eliminar nodo

Campos del nodo:
- `name` (string) — nombre visible
- `x, y` (number) — posición en canvas
- `w, h` (number) — tamaño (default 260x160)
- `color` (hex string) — color de fondo
- `desc` (string) — descripción
- `stage` (string) — etapa: idea, mvp, activo, escalando, maduro
- `revenue` (string) — info de revenue
- `agent` (string) — agente asignado
- `projectName` (string) — proyecto asociado (del listado de projects)
- `boardId` (string) — si tiene sub-board, el id del board hijo (drill-down)
- `objective, notes` (string) — texto libre
- `metrics` (array) — [{label, value}]

#### Conexiones
- `POST /api/ecosystem/boards/:bid/connections` — Body: `{from, to, label}`
- `PUT /api/ecosystem/boards/:bid/connections/:cid` — Editar
- `DELETE /api/ecosystem/boards/:bid/connections/:cid` — Eliminar

### Brainstorm
Misma estructura que ecosystem pero para ideas.

- `GET /api/brainstorm/boards` — Lista boards
- `POST /api/brainstorm/boards` — Crear board
- Nodos y conexiones: mismos endpoints bajo `/api/brainstorm/boards/:bid/...`

Campos adicionales de cards de brainstorm:
- `principal` (boolean) — card principal del board
- `refs` (array) — [{boardId, cardId}] referencias cruzadas

## Data
- Fuente de verdad: `board-data.json` en la raíz del proyecto
- Se auto-crea vacío si no existe al arrancar el servidor

## Importar Backlogs
Para importar tareas desde archivos BACKLOG.md:
```bash
node parse-backlogs.mjs /path/to/BACKLOG.md "Nombre Proyecto"
```

## Ejemplo: Crear estructura inicial
```bash
# Crear proyectos
curl -X POST http://127.0.0.1:18795/qualia-board/api/projects \
  -H 'Content-Type: application/json' -d '{"name":"Mi Proyecto"}'

# Crear nodo en ecosistema
curl -X POST http://127.0.0.1:18795/qualia-board/api/ecosystem/boards/root/nodes \
  -H 'Content-Type: application/json' \
  -d '{"name":"Mi Proyecto","x":60,"y":60,"w":260,"h":160,"color":"#1a3a4a","projectName":"Mi Proyecto"}'

# Crear tarea
curl -X POST http://127.0.0.1:18795/qualia-board/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Primera tarea","project":"Mi Proyecto","status":"todo","priority":"medium"}'
```

## Branding

Cada instancia tiene su propia identidad visual en `branding/theme.json` (gitignored).

### Instalación de branding
```bash
cp -r branding.template/ branding/
# Editar branding/theme.json con los colores/fuentes/logo del cliente
```

### API
- `GET /api/branding` — Devuelve el theme.json actual (null si no existe)

### Estructura de theme.json
```json
{
  "brand": {
    "name": "Nombre del Board",
    "wordmarkPrimary": "Palabra1",
    "wordmarkSecondary": "Palabra2",
    "version": "v1.0.0"
  },
  "logo": {
    "type": "svg-inline",
    "svg": "<polygon .../>"
  },
  "colors": {
    "bgDeep": "#050508",
    "bgBase": "#0a0b0f",
    "bgCard": "#111318",
    "accent": "#c9a94e",
    "accentDim": "rgba(201,169,78,0.15)",
    "...": "..."
  },
  "fonts": {
    "heading": "'Outfit', sans-serif",
    "body": "'Figtree', sans-serif",
    "mono": "'JetBrains Mono', monospace",
    "googleImport": "https://fonts.googleapis.com/css2?family=..."
  },
  "backgroundGradient": "radial-gradient(...)"
}
```

Logo soporta `"type": "image"` con `"src": "branding/logo.png"` (archivos en branding/ se sirven como estáticos).

### Al configurar branding para un cliente:
1. Preguntar colores principales (accent, fondo, texto)
2. Preguntar nombre del board/empresa
3. Logo: SVG inline o imagen en branding/
4. Fuentes: Google Fonts URL + nombres
5. Escribir theme.json y reiniciar

## Notas
- El frontend es vanilla JS, sin frameworks
- Canvas del ecosistema soporta drag, zoom, pan
- Nodos con boardId generan drill-down (click para entrar al sub-board)
- `branding/` y `board-data.json` son propietarios de cada instancia (gitignored)
