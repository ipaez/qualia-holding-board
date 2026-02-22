#!/bin/bash
# Backlog Sync - Automated Test Runner
# Usage: bash tests/run-sync-tests.sh

set -euo pipefail

BASE="http://127.0.0.1:18795/qualia-board"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="$HOME"
PASS=0
FAIL=0
CLEANUP_IDS=()
CLEANUP_DIRS=()

green() { echo -e "\033[32m✓ $1\033[0m"; }
red() { echo -e "\033[31m✗ $1\033[0m"; }

assert_eq() {
  if [ "$1" = "$2" ]; then
    green "$3"
    PASS=$((PASS + 1))
  else
    red "$3 (expected='$2' got='$1')"
    FAIL=$((FAIL + 1))
  fi
}

assert_gt() {
  if [ "$1" -gt "$2" ] 2>/dev/null; then
    green "$3"
    PASS=$((PASS + 1))
  else
    red "$3 (expected > $2, got '$1')"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  if echo "$1" | grep -q "$2"; then
    green "$3"
    PASS=$((PASS + 1))
  else
    red "$3 (string not found: '$2')"
    FAIL=$((FAIL + 1))
  fi
}

# Pre-check
echo "=== Pre-flight ==="
HUB_CHECK=$(curl -sf "$BASE/api/stats" 2>/dev/null || echo "FAIL")
if [ "$HUB_CHECK" = "FAIL" ]; then
  red "Hub not running at $BASE"
  exit 1
fi
green "Hub running"

# Backup
cp "$PROJECT_DIR/board-data.json" "$PROJECT_DIR/tests/board-data-pretest.json"
green "Backup created"

echo ""
echo "=== T01: Sync marker present ==="
T01_FAIL=0
for f in "$HOME_DIR"/.openclaw/workspace*/BACKLOG.md; do
  if head -1 "$f" | grep -q 'sync:qualia-board'; then
    true
  else
    T01_FAIL=1
    red "Missing marker: $f"
  fi
done
if [ "$T01_FAIL" = "0" ]; then
  green "T01: All BACKLOG.md files have sync marker"
  PASS=$((PASS + 1))
else
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== T02: All tasks have qb IDs ==="
T02_FAIL=0
for f in "$HOME_DIR"/.openclaw/workspace*/BACKLOG.md; do
  count_tasks=$(grep -cE '^\s*-\s+\[[x ]\]' "$f" 2>/dev/null || echo 0)
  count_ids=$(grep -cE '<!-- qb:[a-f0-9]{8}' "$f" 2>/dev/null || echo 0)
  bname=$(basename "$(dirname "$f")")
  if [ "$count_tasks" = "$count_ids" ]; then
    true
  else
    T02_FAIL=1
    red "$bname: tasks=$count_tasks ids=$count_ids"
  fi
done
if [ "$T02_FAIL" = "0" ]; then
  green "T02: All tasks have qb IDs"
  PASS=$((PASS + 1))
else
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== T03: Board → Agent sync ==="
# Create a test task via API
T03_RESP=$(curl -sf -X POST "$BASE/api/tasks" -H 'Content-Type: application/json' \
  -d '{"title":"TEST-BOARD2AGENT-T03","agent":"holding-board","project":"IQ Herramientas","status":"in-progress"}')
T03_ID=$(echo "$T03_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
CLEANUP_IDS+=("$T03_ID")
sleep 5
T03_FILE=$(cat "$HOME_DIR/.openclaw/workspace-holding-board/BACKLOG.md")
assert_contains "$T03_FILE" "TEST-BOARD2AGENT-T03" "T03: Task appears in agent file"
assert_contains "$T03_FILE" "EN PROGRESO" "T03: Status marker in file"

echo ""
echo "=== T04: Agent → Board sync (new task) ==="
# Pre-clean any leftover from previous runs
for old_id in $(curl -sf "$BASE/api/tasks" | python3 -c "import sys,json; [print(t['id']) for t in json.load(sys.stdin) if 'TEST-AGENT2BOARD-T04' in t['title']]" 2>/dev/null); do
  curl -sf -X DELETE "$BASE/api/tasks/$old_id" > /dev/null 2>&1 || true
done
# Wait for watcher to settle from T03 changes
sleep 4
echo '- [ ] TEST-AGENT2BOARD-T04' >> "$HOME_DIR/.openclaw/workspace-holding-board/BACKLOG.md"
sleep 8
T04_COUNT=$(curl -sf "$BASE/api/tasks" | python3 -c "import sys,json; ts=[t for t in json.load(sys.stdin) if 'TEST-AGENT2BOARD-T04' in t['title']]; print(len(ts))")
assert_eq "$T04_COUNT" "1" "T04: New task created in board"
# Check ID was assigned in file
T04_LINE=$(grep 'TEST-AGENT2BOARD-T04' "$HOME_DIR/.openclaw/workspace-holding-board/BACKLOG.md" || echo "")
assert_contains "$T04_LINE" "qb:" "T04: qb ID assigned in file"
# Get ID for cleanup
T04_ID=$(curl -sf "$BASE/api/tasks" | python3 -c "import sys,json; ts=[t for t in json.load(sys.stdin) if 'TEST-AGENT2BOARD-T04' in t['title']]; print(ts[0]['id'] if ts else '')")
[ -n "$T04_ID" ] && CLEANUP_IDS+=("$T04_ID")

echo ""
echo "=== T05: Agent marks task done ==="
T05_RESP=$(curl -sf -X POST "$BASE/api/tasks" -H 'Content-Type: application/json' \
  -d '{"title":"TEST-MARKDONE-T05","agent":"holding-board","project":"IQ Herramientas","status":"idea"}')
T05_ID=$(echo "$T05_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
CLEANUP_IDS+=("$T05_ID")
sleep 5
# Mark as done in file
sed -i '' 's/\[ \] TEST-MARKDONE-T05/[x] TEST-MARKDONE-T05/' "$HOME_DIR/.openclaw/workspace-holding-board/BACKLOG.md"
sleep 8
T05_STATUS=$(curl -sf "$BASE/api/tasks/$T05_ID" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
assert_eq "$T05_STATUS" "done" "T05: Task marked done in board"

echo ""
echo "=== T06: Cross-agent propagation ==="
# Pre-clean leftovers
for old_id in $(curl -sf "$BASE/api/tasks" | python3 -c "import sys,json; [print(t['id']) for t in json.load(sys.stdin) if 'TEST-CROSSAGENT-T06' in t['title']]" 2>/dev/null); do
  curl -sf -X DELETE "$BASE/api/tasks/$old_id" > /dev/null 2>&1 || true
done
sleep 3
T06_RESP=$(curl -sf -X POST "$BASE/api/tasks" -H 'Content-Type: application/json' \
  -d '{"title":"TEST-CROSSAGENT-T06","agent":"main","project":"Contenido & Distribucion","status":"idea"}')
T06_ID=$(echo "$T06_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
CLEANUP_IDS+=("$T06_ID")
sleep 5
T06_PE=$(grep -c 'TEST-CROSSAGENT-T06' "$HOME_DIR/.openclaw/workspace-prisma-engine/BACKLOG.md" 2>/dev/null || echo 0)
T06_PA=$(grep -c 'TEST-CROSSAGENT-T06' "$HOME_DIR/.openclaw/workspace-prisma-academy/BACKLOG.md" 2>/dev/null || echo 0)
assert_eq "$T06_PE" "1" "T06: Task in prisma-engine"
assert_eq "$T06_PA" "1" "T06: Task in prisma-academy"

echo ""
echo "=== T07: ID preservation on rewrite ==="
grep -oE 'qb:[a-f0-9]{8}' "$HOME_DIR/.openclaw/workspace-holding-board/BACKLOG.md" | sort > /tmp/qb_ids_before.txt
cd "$PROJECT_DIR" && node --input-type=module -e "import {syncBoardToBacklogs} from './sync-backlogs.mjs'; syncBoardToBacklogs();" 2>/dev/null
grep -oE 'qb:[a-f0-9]{8}' "$HOME_DIR/.openclaw/workspace-holding-board/BACKLOG.md" | sort > /tmp/qb_ids_after.txt
T07_DIFF=$(diff /tmp/qb_ids_before.txt /tmp/qb_ids_after.txt 2>&1 || true)
if [ -z "$T07_DIFF" ]; then
  green "T07: IDs preserved after rewrite"
  PASS=$((PASS + 1))
else
  red "T07: IDs changed after rewrite"
  echo "$T07_DIFF"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== T08: New workspace discovery ==="
mkdir -p "$HOME_DIR/.openclaw/workspace-test-agent"
CLEANUP_DIRS+=("$HOME_DIR/.openclaw/workspace-test-agent")
cat > "$HOME_DIR/.openclaw/workspace-test-agent/BACKLOG.md" << 'EOF'
<!-- sync:qualia-board -->
# Backlog - Test Agent

- [ ] TEST-DISCOVERY-T08
EOF
# Need hub restart for new watcher to discover the workspace
launchctl kickstart -k "gui/$(id -u)/com.openclaw.hub" 2>/dev/null || true
sleep 8
# Touch file to trigger watcher after it starts
touch "$HOME_DIR/.openclaw/workspace-test-agent/BACKLOG.md"
sleep 5
T08_COUNT=$(curl -sf "$BASE/api/tasks" | python3 -c "import sys,json; ts=[t for t in json.load(sys.stdin) if 'TEST-DISCOVERY-T08' in t['title']]; print(len(ts))")
assert_eq "$T08_COUNT" "1" "T08: New workspace discovered and task imported"
T08_ID=$(curl -sf "$BASE/api/tasks" | python3 -c "import sys,json; ts=[t for t in json.load(sys.stdin) if 'TEST-DISCOVERY-T08' in t['title']]; print(ts[0]['id'] if ts else '')")
[ -n "$T08_ID" ] && CLEANUP_IDS+=("$T08_ID")

echo ""
echo "=== T09: No sync marker = ignored ==="
mkdir -p "$HOME_DIR/.openclaw/workspace-test-nosync"
CLEANUP_DIRS+=("$HOME_DIR/.openclaw/workspace-test-nosync")
cat > "$HOME_DIR/.openclaw/workspace-test-nosync/BACKLOG.md" << 'EOF'
# Backlog
- [ ] NOSYNC-TASK-T09
EOF
sleep 3
T09_COUNT=$(curl -sf "$BASE/api/tasks" | python3 -c "import sys,json; ts=[t for t in json.load(sys.stdin) if 'NOSYNC-TASK-T09' in t['title']]; print(len(ts))")
assert_eq "$T09_COUNT" "0" "T09: File without marker ignored"

echo ""
echo "=== T10: Backlog view renders ==="
T10_HTML=$(curl -sf "$BASE/backlog" | grep -c 'Backlog Unificado' || echo 0)
assert_eq "$T10_HTML" "1" "T10: backlog.html loads"
T10_TASKS=$(curl -sf "$BASE/api/tasks" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
assert_gt "$T10_TASKS" "0" "T10: API returns tasks"

echo ""
echo "=== T11: Anti-loop ==="
MTIME_BEFORE=$(stat -f '%m' "$HOME_DIR/.openclaw/workspace-infraqualia/BACKLOG.md")
# Touch holding-board to trigger watcher
echo "" >> "$HOME_DIR/.openclaw/workspace-holding-board/BACKLOG.md"
sleep 15
MTIME_MID=$(stat -f '%m' "$HOME_DIR/.openclaw/workspace-infraqualia/BACKLOG.md")
sleep 10
MTIME_AFTER=$(stat -f '%m' "$HOME_DIR/.openclaw/workspace-infraqualia/BACKLOG.md")
if [ "$MTIME_MID" = "$MTIME_AFTER" ]; then
  green "T11: No infinite loop (files stabilized)"
  PASS=$((PASS + 1))
else
  red "T11: Files still changing after 13s - possible loop"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "=== Cleanup ==="
for tid in "${CLEANUP_IDS[@]}"; do
  curl -sf -X DELETE "$BASE/api/tasks/$tid" > /dev/null 2>&1 || true
done
for d in "${CLEANUP_DIRS[@]}"; do
  rm -rf "$d"
done
# Restore and sync
cp "$PROJECT_DIR/tests/board-data-pretest.json" "$PROJECT_DIR/board-data.json"
cd "$PROJECT_DIR" && node --input-type=module -e "import {syncBoardToBacklogs} from './sync-backlogs.mjs'; syncBoardToBacklogs();" 2>/dev/null
# Restart hub to clean state
launchctl kickstart -k "gui/$(id -u)/com.openclaw.hub" 2>/dev/null || true
green "Cleanup done"

echo ""
echo "==============================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "==============================="
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
