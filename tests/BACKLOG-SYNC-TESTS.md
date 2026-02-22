# Backlog Sync - Plan de Test

Validacion end-to-end del sistema de sync bidireccional.
Ejecutar estos tests despues de cada cambio al sync system.

Base URL: `http://127.0.0.1:18795/qualia-board`
Data file: `board-data.json`
Test workspace: `~/.openclaw/workspace-holding-board/BACKLOG.md` (poco trafico, ideal para tests)

---

## Pre-condiciones

Antes de cada test run:
1. Hub corriendo: `curl -s http://127.0.0.1:18795/qualia-board/api/stats | head -1`
2. Watcher activo: verificar logs `[watcher] Watching X BACKLOG.md files`
3. Backup board-data: `cp board-data.json tests/board-data-pretest.json`

---

## T01: Sync marker presente en todos los BACKLOG.md

**Que verifica:** Todos los archivos descubiertos tienen `<!-- sync:qualia-board -->`.

**Comando:**
```bash
for f in ~/.openclaw/workspace*/BACKLOG.md; do
  echo -n "$f: "
  head -1 "$f" | grep -q 'sync:qualia-board' && echo "OK" || echo "FAIL"
done
```

**Esperado:** Todos OK.

---

## T02: Todos los tasks tienen qb ID

**Que verifica:** Cada linea `- [ ]` o `- [x]` tiene `<!-- qb:XXXXXXXX -->`.

**Comando:**
```bash
for f in ~/.openclaw/workspace*/BACKLOG.md; do
  count_tasks=$(grep -cE '^\s*-\s+\[[x ]\]' "$f" 2>/dev/null || echo 0)
  count_ids=$(grep -cE '<!-- qb:[a-f0-9]{8} -->' "$f" 2>/dev/null || echo 0)
  echo "$f: tasks=$count_tasks ids=$count_ids $([ "$count_tasks" = "$count_ids" ] && echo OK || echo FAIL)"
done
```

**Esperado:** tasks == ids en cada archivo.

---

## T03: Board → Agent sync (API change reflects in file)

**Que verifica:** Cambiar status via API se refleja en BACKLOG.md del agente.

**Pasos:**
1. Elegir una tarea del workspace-holding-board:
   ```bash
   curl -s "$BASE/api/tasks?agent=holding-board" | python3 -c "import sys,json; t=json.load(sys.stdin); print(t[0]['id'], t[0]['title'], t[0]['status']) if t else print('NO TASKS')"
   ```
2. Cambiar status a `in-progress`:
   ```bash
   curl -s -X POST "$BASE/api/tasks/$TASK_ID/move" -H 'Content-Type: application/json' -d '{"status":"in-progress"}'
   ```
3. Esperar 3s (debounce sync)
4. Verificar en archivo:
   ```bash
   grep 'EN PROGRESO' ~/.openclaw/workspace-holding-board/BACKLOG.md
   ```
5. Revertir status original.

**Esperado:** Tarea aparece con `[EN PROGRESO]` en el archivo.

---

## T04: Agent → Board sync (file change reflects in API)

**Que verifica:** Editar BACKLOG.md manualmente actualiza board-data.json.

**Pasos:**
1. Agregar tarea nueva al final de workspace-holding-board/BACKLOG.md:
   ```bash
   echo '- [ ] TEST-SYNC-TASK-T04' >> ~/.openclaw/workspace-holding-board/BACKLOG.md
   ```
2. Esperar 2s (watcher debounce)
3. Verificar en API:
   ```bash
   curl -s "$BASE/api/tasks" | python3 -c "import sys,json; ts=[t for t in json.load(sys.stdin) if 'TEST-SYNC-TASK-T04' in t['title']]; print(len(ts), 'found', ts[0]['id'][:8] if ts else 'NONE')"
   ```
4. Verificar que se le asigno un qb ID en el archivo:
   ```bash
   grep 'TEST-SYNC-TASK-T04' ~/.openclaw/workspace-holding-board/BACKLOG.md
   ```
5. Cleanup: eliminar tarea via API.

**Esperado:** Tarea creada en board-data.json con ID nuevo. Archivo actualizado con `<!-- qb:ID -->`.

---

## T05: Agent marca tarea como done

**Que verifica:** Cambiar `[ ]` a `[x]` en archivo actualiza status a `done` en board.

**Pasos:**
1. Crear tarea de test via API:
   ```bash
   TASK=$(curl -s -X POST "$BASE/api/tasks" -H 'Content-Type: application/json' -d '{"title":"TEST-DONE-T05","agent":"holding-board","project":"IQ Herramientas","status":"idea"}')
   TASK_ID=$(echo $TASK | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
   ```
2. Esperar 3s para sync a archivo
3. Verificar que existe en archivo: `grep TEST-DONE-T05 ~/.openclaw/workspace-holding-board/BACKLOG.md`
4. Marcar como done en archivo:
   ```bash
   sed -i '' 's/\[ \] TEST-DONE-T05/[x] TEST-DONE-T05/' ~/.openclaw/workspace-holding-board/BACKLOG.md
   ```
5. Esperar 2s
6. Verificar en API:
   ```bash
   curl -s "$BASE/api/tasks/$TASK_ID" | python3 -c "import sys,json; t=json.load(sys.stdin); print(t['status'])"
   ```
7. Cleanup: eliminar tarea.

**Esperado:** Status = `done` en API.

---

## T06: Cross-agent propagation

**Que verifica:** Cambio en un agente se propaga a otro que comparte el proyecto.

**Pasos:**
1. Crear tarea en proyecto compartido (`Contenido & Distribucion`, compartido por prisma-engine y prisma-academy):
   ```bash
   TASK=$(curl -s -X POST "$BASE/api/tasks" -H 'Content-Type: application/json' -d '{"title":"TEST-CROSS-T06","agent":"main","project":"Contenido & Distribucion","status":"idea"}')
   TASK_ID=$(echo $TASK | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
   SHORT_ID=$(echo $TASK_ID | cut -c1-8)
   ```
2. Esperar 3s
3. Verificar que aparece en ambos archivos:
   ```bash
   grep TEST-CROSS-T06 ~/.openclaw/workspace-prisma-engine/BACKLOG.md
   grep TEST-CROSS-T06 ~/.openclaw/workspace-prisma-academy/BACKLOG.md
   ```
4. Marcar done en prisma-engine:
   ```bash
   sed -i '' "s/\[ \] TEST-CROSS-T06/[x] TEST-CROSS-T06/" ~/.openclaw/workspace-prisma-engine/BACKLOG.md
   ```
5. Esperar 3s
6. Verificar: tarea done en API, y REMOVIDA de prisma-academy (done tasks se filtran)
7. Cleanup.

**Esperado:** Tarea en ambos archivos. Al marcar done en uno, desaparece del otro (sync via board-data).

---

## T07: ID preservation on full rewrite

**Que verifica:** sync-backlogs.mjs preserva IDs al reescribir archivos.

**Pasos:**
1. Capturar IDs actuales:
   ```bash
   grep -oE 'qb:[a-f0-9]{8}' ~/.openclaw/workspace-holding-board/BACKLOG.md | sort > /tmp/ids_before.txt
   ```
2. Forzar sync:
   ```bash
   cd /Users/ai-ivanpaezmora/.openclaw/hub/projects/qualia-board && node -e "import('./sync-backlogs.mjs').then(m => m.syncBoardToBacklogs())"
   ```
3. Capturar IDs despues:
   ```bash
   grep -oE 'qb:[a-f0-9]{8}' ~/.openclaw/workspace-holding-board/BACKLOG.md | sort > /tmp/ids_after.txt
   ```
4. Comparar:
   ```bash
   diff /tmp/ids_before.txt /tmp/ids_after.txt
   ```

**Esperado:** Sin diferencias. Los IDs son estables.

---

## T08: Discovery de nuevo workspace

**Que verifica:** Un workspace nuevo con BACKLOG.md + sync marker es detectado.

**Pasos:**
1. Crear workspace temporal:
   ```bash
   mkdir -p ~/.openclaw/workspace-test-agent
   echo -e '<!-- sync:qualia-board -->\n# Backlog - Test\n\n- [ ] Tarea fantasma T08' > ~/.openclaw/workspace-test-agent/BACKLOG.md
   ```
2. Reiniciar hub: `launchctl kickstart -k gui/$(id -u)/com.openclaw.hub`
3. Esperar 5s
4. Verificar que la tarea fue importada:
   ```bash
   curl -s "$BASE/api/tasks" | python3 -c "import sys,json; ts=[t for t in json.load(sys.stdin) if 'T08' in t['title']]; print(len(ts), 'found')"
   ```
5. Cleanup: eliminar workspace y tarea.

**Esperado:** Tarea importada. Workspace descubierto automaticamente.

---

## T09: Sin sync marker = ignorado

**Que verifica:** Un BACKLOG.md sin `<!-- sync:qualia-board -->` no es procesado por el watcher.

**Pasos:**
1. Crear archivo sin marker:
   ```bash
   mkdir -p ~/.openclaw/workspace-test-nosync
   echo -e '# Backlog\n- [ ] NO SYNC TASK T09' > ~/.openclaw/workspace-test-nosync/BACKLOG.md
   ```
2. Reiniciar hub, esperar 5s
3. Verificar que NO fue importada:
   ```bash
   curl -s "$BASE/api/tasks" | python3 -c "import sys,json; ts=[t for t in json.load(sys.stdin) if 'T09' in t['title']]; print(len(ts), 'found - should be 0')"
   ```
4. Cleanup.

**Esperado:** 0 tareas. El archivo es ignorado.

---

## T10: Vista backlog.html renderiza correctamente

**Que verifica:** La vista web carga y muestra tareas.

**Pasos:**
1. `curl -s "$BASE/backlog" | grep -c 'Backlog Unificado'` → debe ser 1
2. `curl -s "$BASE/api/tasks" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))"` → debe ser > 0
3. `curl -s "$BASE/api/agents" | python3 -c "import sys,json; print(json.load(sys.stdin))"` → lista de agentes
4. `curl -s "$BASE/api/projects" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))"` → debe ser > 0

**Esperado:** Todo retorna datos validos.

---

## T11: Anti-loop (cambio no rebota infinitamente)

**Que verifica:** El watcher no genera loops de escritura.

**Pasos:**
1. Obtener mtime de dos archivos:
   ```bash
   stat -f '%m' ~/.openclaw/workspace-holding-board/BACKLOG.md > /tmp/mtime1.txt
   stat -f '%m' ~/.openclaw/workspace-infraqualia/BACKLOG.md > /tmp/mtime2.txt
   ```
2. Modificar una tarea en holding-board:
   ```bash
   sed -i '' 's/\[ \] \(.*holding.board\)/[ ] \1/' ~/.openclaw/workspace-holding-board/BACKLOG.md
   ```
3. Esperar 10s
4. Capturar mtimes de nuevo:
   ```bash
   stat -f '%m' ~/.openclaw/workspace-holding-board/BACKLOG.md > /tmp/mtime3.txt
   stat -f '%m' ~/.openclaw/workspace-infraqualia/BACKLOG.md > /tmp/mtime4.txt
   ```
5. Esperar otros 5s, capturar de nuevo:
   ```bash
   stat -f '%m' ~/.openclaw/workspace-holding-board/BACKLOG.md > /tmp/mtime5.txt
   stat -f '%m' ~/.openclaw/workspace-infraqualia/BACKLOG.md > /tmp/mtime6.txt
   ```
6. mtime5 == mtime3 y mtime6 == mtime4

**Esperado:** Los archivos se estabilizan. No hay escrituras infinitas.

---

## Cleanup

Despues de todos los tests:
```bash
# Restaurar board-data si es necesario
cp tests/board-data-pretest.json board-data.json
# Eliminar workspaces de test
rm -rf ~/.openclaw/workspace-test-agent ~/.openclaw/workspace-test-nosync
# Forzar sync limpio
node -e "import('./sync-backlogs.mjs').then(m => m.syncBoardToBacklogs())"
# Reiniciar hub
launchctl kickstart -k gui/$(id -u)/com.openclaw.hub
```

---

## Script automatizado

Para correr todos los tests de una vez, ver `tests/run-sync-tests.sh`.
