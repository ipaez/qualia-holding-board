import { readFileSync, writeFileSync, watchFile, unwatchFile } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { discoverWorkspaces, syncBoardToBacklogs, recentSyncWrites } from './sync-backlogs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, 'board-data.json');
const QB_RE = /<!-- qb:([a-f0-9]{8})(?::(\w[\w-]*))? -->/;
const SYNC_MARKER = '<!-- sync:qualia-board -->';
const VALID_STATUSES = new Set(['backlog', 'todo', 'in-progress', 'blocked', 'done']);

const _timers = new Map();
const _watchers = [];

function parseBacklogFile(content) {
  const tasks = [];
  let currentSection = '';

  for (const line of content.split('\n')) {
    const headerMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headerMatch) {
      currentSection = headerMatch[1].replace(/[^\w\s&/-]/g, '').trim();
      continue;
    }

    const taskMatch = line.match(/^[-*]\s+\[([^\]]*)\]\s+(.+)/i);
    if (!taskMatch) continue;

    const raw = taskMatch[1].trim().toLowerCase();
    const text = taskMatch[2].trim();

    const qbMatch = text.match(QB_RE);
    const qbId = qbMatch ? qbMatch[1] : null;
    const qbStatus = qbMatch ? qbMatch[2] || null : null;

    let title = text
      .replace(QB_RE, '')
      .replace(/\s*\[BLOQUEADO\]\s*/i, '')
      .replace(/\s*\[EN PROGRESO\]\s*/i, '')
      .trim();

    let status;
    if (raw === 'x') {
      status = 'done';
    } else if (qbStatus && VALID_STATUSES.has(qbStatus)) {
      status = qbStatus;
    } else if (/bloqueado/i.test(text)) {
      status = 'blocked';
    } else if (/en progreso/i.test(text)) {
      status = 'in-progress';
    } else {
      status = 'backlog';
    }

    tasks.push({ qbId, title, status, section: currentSection });
  }

  return tasks;
}

function handleFileChange(agent, backlogPath) {
  const lastSync = recentSyncWrites.get(backlogPath);
  if (lastSync && Date.now() - lastSync < 5000) {
    recentSyncWrites.delete(backlogPath);
    return;
  }

  let content;
  try { content = readFileSync(backlogPath, 'utf8'); } catch { return; }
  if (!content.includes(SYNC_MARKER)) return;

  const fileTasks = parseBacklogFile(content);
  let data;
  try { data = JSON.parse(readFileSync(DATA_FILE, 'utf8')); } catch { return; }

  const boardTasks = data.tasks || [];
  let changed = false;
  let fileChanged = false;

  const boardByShortId = new Map();
  for (const t of boardTasks) {
    boardByShortId.set(t.id.substring(0, 8), t);
  }

  for (const ft of fileTasks) {
    if (ft.qbId && boardByShortId.has(ft.qbId)) {
      const bt = boardByShortId.get(ft.qbId);
      if (bt.title !== ft.title && ft.title) {
        bt.title = ft.title;
        bt.updatedAt = new Date().toISOString();
        changed = true;
      }
      if (bt.status !== ft.status) {
        bt.status = ft.status;
        bt.updatedAt = new Date().toISOString();
        changed = true;
      }
    } else if (!ft.qbId && ft.title) {
      const newId = crypto.randomUUID();
      const now = new Date().toISOString();
      boardTasks.push({
        id: newId,
        title: ft.title,
        description: '',
        project: ft.section || '',
        agent: agent,
        status: ft.status,
        blockedBy: '',
        priority: 'medium',
        type: 'feature',
        deadline: null,
        notes: '',
        createdAt: now,
        updatedAt: now,
      });
      ft.assignedId = newId.substring(0, 8);
      ft.assignedStatus = ft.status;
      changed = true;
      fileChanged = true;
    }
  }

  if (changed) {
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`[watcher] Updated board from ${agent}'s BACKLOG.md`);
  }

  if (fileChanged) {
    let lines = content.split('\n');
    let taskIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      const taskMatch = lines[i].match(/^([-*]\s+\[[^\]]*\]\s+)(.+)/);
      if (!taskMatch) continue;
      if (taskIdx < fileTasks.length) {
        const ft = fileTasks[taskIdx];
        taskIdx++;
        if (ft.assignedId && !QB_RE.test(lines[i])) {
          lines[i] = lines[i].trimEnd() + ` <!-- qb:${ft.assignedId}:${ft.assignedStatus || 'backlog'} -->`;
        }
      }
    }
    writeFileSync(backlogPath, lines.join('\n'));
    console.log(`[watcher] Wrote IDs back to ${agent}'s BACKLOG.md`);
  }

  if (changed) {
    try { syncBoardToBacklogs({ excludeAgent: agent }); }
    catch (e) { console.error(`[watcher] Sync error:`, e.message); }
  }
}

export function startWatching() {
  const workspaces = discoverWorkspaces();
  console.log(`[watcher] Watching ${Object.keys(workspaces).length} BACKLOG.md files`);

  for (const [agent, backlogPath] of Object.entries(workspaces)) {
    try {
      watchFile(backlogPath, { interval: 2000 }, (curr, prev) => {
        if (curr.mtimeMs === prev.mtimeMs) return;
        clearTimeout(_timers.get(backlogPath));
        _timers.set(backlogPath, setTimeout(() => {
          handleFileChange(agent, backlogPath);
        }, 1000));
      });
      _watchers.push(backlogPath);
      console.log(`[watcher] Watching: ${agent} -> ${backlogPath}`);
    } catch (e) {
      console.error(`[watcher] Could not watch ${backlogPath}:`, e.message);
    }
  }
}

export function stopWatching() {
  for (const p of _watchers) { try { unwatchFile(p); } catch {} }
  _watchers.length = 0;
  for (const t of _timers.values()) clearTimeout(t);
  _timers.clear();
}
