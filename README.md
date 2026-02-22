# Qualia Holding Board

Board visual de gestion con 6 vistas: Cockpit, Kanban, Proyectos, Ecosistema, Brainstorm, Done.

Zero dependencias npm. Corre 100% con Node nativo.

## Instalacion

```bash
git clone https://github.com/ipaez/qualia-holding-board.git
cd qualia-holding-board
node start.mjs
```

Abrir http://127.0.0.1:3100

Todo se auto-genera en el primer arranque (`board-data.json`, ecosystem root board, etc).

## Branding (opcional)

Para personalizar colores, logo y fuentes:

```bash
cp -r branding.template/ branding/
```

Editar `branding/theme.json` y reiniciar. Si no existe la carpeta, usa el theme por defecto.

## Sync bidireccional con BACKLOG.md (opcional)

Para sincronizar tareas con archivos BACKLOG.md de agentes, agregar en `board-data.json`:

```json
{
  "config": {
    "workspacesBase": "~/.openclaw",
    "backlogFilename": "BACKLOG.md"
  }
}
```

El board busca `<workspacesBase>/workspace*/BACKLOG.md` con el marker `<!-- sync:qualia-board -->` en la primera linea.

## Variables de entorno

- `PORT` - default 3100
- `BIND` - default 127.0.0.1

## Estructura

```
start.mjs             # Launcher standalone
server.mjs            # API backend
sync-backlogs.mjs     # Sync board <-> BACKLOG.md
backlog-watcher.mjs   # Watch cambios en tiempo real
board-data.json       # Fuente de verdad (gitignored)
branding/             # Theme personalizado (gitignored)
branding.template/    # Template para nuevas instancias
web/                  # Frontend (6 vistas HTML)
manifest.json         # Descriptor para QualIA Hub (opcional)
tests/                # Tests de sync
```
