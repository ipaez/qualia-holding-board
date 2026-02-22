# Backlog Sync — Especificacion

Sistema de sincronizacion bidireccional entre archivos BACKLOG.md de agentes y el board-data.json central del Qualia Holding Board.

## Formato BACKLOG.md

### Marcador de sincronizacion
La primera linea del archivo debe contener:
```
<!-- sync:qualia-board -->
```
Este marcador habilita la auto-discovery. Sin el, el archivo no es monitoreado.

### Formato de tareas
Cada tarea tiene un ID unico en un comentario HTML:
```markdown
- [ ] Titulo de la tarea <!-- qb:a1b2c3d4 -->
- [x] Tarea completada <!-- qb:e5f6g7h8 -->
- [ ] Tarea bloqueada [BLOQUEADO] <!-- qb:i9j0k1l2 -->
- [ ] Tarea en progreso [EN PROGRESO] <!-- qb:m3n4o5p6 -->
```

- `[ ]` = idea/todo/ready
- `[x]` = done
- `[BLOQUEADO]` = blocked
- `[EN PROGRESO]` = in-progress
- El ID `qb:XXXXXXXX` son los primeros 8 caracteres del UUID en board-data.json

### Tareas nuevas
Si un agente agrega una linea sin ID:
```markdown
- [ ] Mi nueva tarea
```
El sistema le asigna un ID en el proximo ciclo de sync y la crea en board-data.json.

## Auto-Discovery de Workspaces

El sistema escanea `~/.openclaw/workspace*/BACKLOG.md` buscando archivos con el marcador `<!-- sync:qualia-board -->`.

- `workspace/` → agente `main`
- `workspace-infraqualia/` → agente `infraqualia`
- `workspace-NOMBRE/` → agente `NOMBRE`

No se necesita configuracion manual de paths.

## Como agregar un nuevo agente/workspace

1. Crear el directorio: `~/.openclaw/workspace-nuevo-agente/`
2. Crear `BACKLOG.md` con el marcador `<!-- sync:qualia-board -->` en la primera linea
3. (Opcional) Agregar mapping de proyectos en `AGENT_PROJECTS` dentro de `sync-backlogs.mjs`
4. Reiniciar el hub: `launchctl kickstart -k gui/$(id -u)/com.openclaw.hub`

## Sincronizacion Bidireccional

### Board → Agentes (sync-backlogs.mjs)
- Se ejecuta automaticamente 2s despues de cada cambio en board-data.json via API
- Cada agente recibe solo las tareas de sus proyectos asignados
- El agente `main` recibe todas las tareas agrupadas por empresa
- Se preservan IDs `<!-- qb:... -->` en cada linea

### Agentes → Board (backlog-watcher.mjs)
- Monitorea todos los BACKLOG.md descubiertos con `fs.watch()`
- Debounce de 1 segundo por archivo
- Cambios detectados:
  - Tarea nueva (sin ID) → se crea en board-data.json, se escribe ID de vuelta
  - `[x]` marcado → status cambia a `done`
  - `[BLOQUEADO]` agregado → status cambia a `blocked`
  - Titulo modificado → se actualiza en board-data.json
- Despues de actualizar board-data.json, sincroniza a OTROS agentes (no al que cambio, para evitar loops)

## Ciclo de Vida de una Tarea

1. **Creacion**: Via API web, o escribiendo `- [ ] titulo` en BACKLOG.md
2. **Asignacion**: El campo `agent` y `project` determinan a que BACKLOG.md se escribe
3. **Progreso**: Cambiar status via web o marcar `[EN PROGRESO]` en el archivo
4. **Completada**: Marcar `[x]` en archivo o mover a Done en web
5. **Eliminada**: Solo via API web (DELETE). No se elimina al borrar la linea del archivo.

## Configuracion

En `sync-backlogs.mjs`:
- `AGENT_PROJECTS`: Mapeo de agente → proyectos que recibe
- `AGENT_FILTERS`: Filtros adicionales (ej: solo tareas con "voicenotes" en titulo)
- `COMPANIES`: Agrupacion por empresa para el workspace main
- `HEADERS`: Header personalizado por agente

## Notas Tecnicas

- Sin dependencias npm, solo Node.js built-ins
- IDs son los primeros 8 chars del UUID (suficiente para unicidad practica)
- El watcher se inicia automaticamente al cargar server.mjs
- Para testing: `http://127.0.0.1:18795/qualia-board/backlog`
