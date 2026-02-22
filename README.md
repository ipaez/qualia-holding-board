# Qualia Holding Board

Board visual de gestion con 6 vistas: Cockpit, Kanban, Proyectos, Ecosistema, Brainstorm, Done.

Zero dependencias npm. Corre 100% con Node nativo.

## Instalacion

```bash
# Clonar
git clone https://github.com/ipaez/qualia-holding-board.git
cd qualia-holding-board

# Configurar branding (opcional - usa defaults si no existe)
cp -r branding.template/ branding/
# Editar branding/theme.json para cambiar colores, logo, nombre

# Crear board-data.json (fuente de verdad, gitignored)
cat > board-data.json << 'EOF'
{
  "tasks": [],
  "projects": [],
  "ecosystem": {
    "boards": [{
      "id": "root",
      "name": "Mi Holding",
      "created": "2026-01-01T00:00:00.000Z",
      "type": "ecosystem",
      "nodes": [],
      "connections": []
    }]
  },
  "config": {
    "workspacesBase": "~/.openclaw",
    "backlogFilename": "BACKLOG.md"
  }
}
EOF

# Iniciar
node start.mjs
```

Abrir http://127.0.0.1:18795

## Config

El archivo `board-data.json` es la fuente de verdad. Se auto-genera vacio si no existe, pero sin la seccion `config` el sync bidireccional no funciona.

### config.workspacesBase

Directorio donde el board busca archivos BACKLOG.md para sync bidireccional. Escanea `<workspacesBase>/workspace*/BACKLOG.md`.

Default: `~/.openclaw`

### config.backlogFilename

Nombre del archivo de backlog a buscar en cada workspace.

Default: `BACKLOG.md`

## Sync bidireccional (Board <-> BACKLOG.md)

El board sincroniza tareas con archivos BACKLOG.md en los workspaces de agentes:

- Cada BACKLOG.md debe tener `<!-- sync:qualia-board -->` en la primera linea para activar sync
- Los tasks usan markers inline: `<!-- qb:XXXXXXXX:status -->`
- Cambios en el board actualizan los BACKLOG.md automaticamente
- Cambios en los BACKLOG.md actualizan el board en tiempo real (file watcher)
- El campo `agent` en cada task determina a que workspace se escribe

## Branding personalizado

Cada instancia tiene su identidad visual sin tocar codigo:

1. `cp -r branding.template/ branding/`
2. Editar `branding/theme.json` - colores, fuentes, logo
3. Reiniciar el servidor

El folder `branding/` esta en .gitignore.

### theme.json soporta:
- **brand** - nombre, wordmark, version
- **colors** - todos los colores del UI (fondo, texto, accent, status)
- **fonts** - heading, body, mono + URL de Google Fonts
- **logo** - SVG inline (con variables `{{accent}}`) o imagen

## Estructura

```
server.mjs            # API backend (handler exportable + standalone via start.mjs)
start.mjs             # Launcher standalone (puerto 18795)
sync-backlogs.mjs     # Sync board <-> BACKLOG.md
backlog-watcher.mjs   # Watch cambios en BACKLOG.md en tiempo real
board-data.json       # Fuente de verdad (gitignored, local por instancia)
branding/             # Theme personalizado (gitignored)
branding.template/    # Template de theme.json para nuevas instancias
web/                  # Frontend vanilla JS (6 vistas HTML + shared.js)
manifest.json         # Descriptor para QualIA Hub (opcional)
tests/                # Tests de sync (run-sync-tests.sh)
```

## Vistas

- **Cockpit** - KPIs, items que necesitan atencion
- **Kanban** - Drag & drop por estado
- **Proyectos** - Acordeones por proyecto
- **Ecosistema** - Canvas visual con nodos, conexiones, sub-boards recursivos
- **Brainstorm** - Canvas de ideas (mismo motor que Ecosistema, boards tipo brainstorm)
- **Done** - Historial de tareas completadas

## Variables de entorno (opcionales)

- `PORT` - Puerto del servidor (default: 18795)
- `BIND` - IP de bind (default: 127.0.0.1)

## Tests

```bash
cd tests && bash run-sync-tests.sh
```

## Uso con QualIA Hub (opcional)

Si tienes QualIA Hub corriendo, clona en `~/.openclaw/hub/projects/qualia-board/` y el hub lo monta automaticamente via `manifest.json` (type: backend). No necesitas `start.mjs` en ese caso.
