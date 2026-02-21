# Qualia Holding Board

Board visual de gestión con 6 vistas: Cockpit, Kanban, Proyectos, Ecosistema, Brainstorm, Done.

## Requisitos

- Node.js 18+
- QualIA Hub (Express, puerto 18795) o cualquier servidor Express que monte este proyecto

## Instalación

1. Copiar esta carpeta en `~/.openclaw/hub/projects/qualia-board/`
2. El hub lo descubre automáticamente via `manifest.json`
3. O correr standalone: `node server.mjs` (puerto 3100 por defecto)

## Estructura

- `server.mjs` — API backend (tasks CRUD, ecosystem boards, brainstorm, projects)
- `web/` — Frontend vanilla JS (6 páginas HTML + shared.js)
- `board-data.json` — Fuente de verdad (auto-generado si no existe)
- `branding/` — Identidad visual personalizada (gitignored, propietaria de cada instancia)
- `branding.template/` — Ejemplo de theme.json para nuevas instancias
- `manifest.json` — Descriptor para QualIA Hub
- `parse-backlogs.mjs` — Importador de BACKLOG.md → tasks
- `sync-backlogs.mjs` — Sync tasks → BACKLOG.md

## Branding personalizado

Cada instancia puede aplicar su propia identidad visual sin modificar el código:

1. Copiar `branding.template/` → `branding/`
2. Editar `branding/theme.json` con colores, fuentes y logo propios
3. Reiniciar el servidor

El `branding/` folder está en .gitignore — cada cliente mantiene su identidad separada del código.

### theme.json soporta:
- **brand** — nombre, wordmark, versión
- **colors** — todos los colores del UI (fondo, texto, accent, status)
- **fonts** — heading, body, mono + URL de Google Fonts
- **logo** — SVG inline (con variables {{accent}}) o imagen (`"type": "image", "src": "branding/logo.png"`)
- **backgroundGradient** — gradiente del body

## Vistas

- **Cockpit** — KPIs, items que necesitan atención
- **Kanban** — Drag & drop por estado
- **Proyectos** — Acordeones por proyecto
- **Ecosistema** — Canvas visual con nodos, conexiones, sub-boards recursivos
- **Brainstorm** — Canvas de ideas con boards múltiples
- **Done** — Archivo de tareas completadas
