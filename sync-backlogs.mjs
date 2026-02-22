import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;
const DATA_FILE = join(__dirname, 'board-data.json');
const SYNC_MARKER = '<!-- sync:qualia-board -->';
const QB_RE = /<!-- qb:([a-f0-9]{8})(?::(\w[\w-]*))? -->/;

const STATUS_ORDER = { 'in-progress': 0, 'todo': 1, 'blocked': 2, 'backlog': 3, 'done': 4 };
const VALID_STATUSES = new Set(['backlog', 'todo', 'in-progress', 'blocked', 'done']);

// Write lock: tracks files recently written by sync so the watcher can skip them
export const recentSyncWrites = new Map();

// ── Dynamic workspace discovery ──
export function discoverWorkspaces() {
  const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  const config = data.config || {};
  const basePath = (config.workspacesBase || '~/.openclaw').replace('~', HOME);
  const backlogFilename = config.backlogFilename || 'BACKLOG.md';

  const workspaces = {};
  try {
    const entries = readdirSync(basePath);
    for (const entry of entries) {
      if (!entry.startsWith('workspace')) continue;
      const backlogPath = join(basePath, entry, backlogFilename);
      if (!existsSync(backlogPath)) continue;
      const agent = entry === 'workspace' ? 'main' : entry.replace('workspace-', '');
      workspaces[agent] = backlogPath;
    }
  } catch { /* dir doesn't exist */ }
  return workspaces;
}

function formatTask(t) {
  const check = t.status === 'done' ? 'x' : ' ';
  let line = `- [${check}] ${t.title}`;
  if (t.status === 'blocked') line += ' [BLOQUEADO]';
  if (t.status === 'in-progress') line += ' [EN PROGRESO]';
  const shortId = t.id.substring(0, 8);
  line += ` <!-- qb:${shortId}:${t.status} -->`;
  return line;
}

function sortTasks(tasks) {
  return tasks.sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3));
}

export function syncBoardToBacklogs(options = {}) {
  const { excludeAgent } = options;
  const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  const allTasks = data.tasks || [];
  const projects = data.projects || [];
  const workspaces = discoverWorkspaces();

  // Build agent -> project names map from data
  const agentProjects = {};
  for (const p of projects) {
    const agent = p.agent || 'main';
    if (!agentProjects[agent]) agentProjects[agent] = new Set();
    agentProjects[agent].add(p.name);
  }

  console.log(`Loaded ${allTasks.length} tasks, ${Object.keys(workspaces).length} workspaces, ${projects.length} projects`);

  for (const [agent, backlogPath] of Object.entries(workspaces)) {
    if (agent === excludeAgent) continue;

    // Filter tasks for this agent
    const agentProjectNames = agentProjects[agent] || new Set();
    let tasks;

    if (agent === 'main') {
      // Main gets everything except done
      tasks = allTasks.filter(t => t.status !== 'done');
    } else {
      tasks = allTasks.filter(t => {
        if (t.status === 'done') return false;
        // Tasks from this agent's projects
        if (agentProjectNames.has(t.project)) return true;
        // Tasks explicitly assigned to this agent
        if (t.agent === agent) return true;
        return false;
      });
    }

    // Build content grouped by project
    const header = `# Backlog - ${agent}\n\nFuente de verdad: Holding Board Dashboard.\n\n---\n`;
    let content = SYNC_MARKER + '\n' + header;

    // Group by project
    const byProject = {};
    for (const t of tasks) {
      const p = t.project || 'Otros';
      if (!byProject[p]) byProject[p] = [];
      byProject[p].push(t);
    }

    for (const [proj, projTasks] of Object.entries(byProject).sort((a, b) => a[0].localeCompare(b[0]))) {
      content += `\n### ${proj}\n`;
      for (const t of sortTasks(projTasks)) content += formatTask(t) + '\n';
    }

    const wsDir = dirname(backlogPath);
    if (existsSync(wsDir)) {
      writeFileSync(backlogPath, content);
      recentSyncWrites.set(backlogPath, Date.now());
      console.log(`  ${agent}: ${tasks.length} tasks -> ${backlogPath}`);
    } else {
      console.log(`  ${agent}: workspace not found at ${wsDir}`);
    }
  }
}

// Run directly
if (process.argv[1] && process.argv[1].endsWith('sync-backlogs.mjs')) {
  syncBoardToBacklogs();
}
