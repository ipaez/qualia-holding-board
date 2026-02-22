import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;
const DATA_FILE = join(__dirname, 'board-data.json');
const SYNC_MARKER = '<!-- sync:qualia-board -->';
const QB_RE = /<!-- qb:([a-f0-9]{8})(?::(\w[\w-]*))? -->/;

// ── Config: which projects go to which agent ──
const AGENT_PROJECTS = {
  'infraqualia': ['IQ Setup', 'IQ Consola', 'IQ Monitoreo', 'IQ Managed', 'IQ Herramientas', 'IQ Demos'],
  'prisma-academy': ['Qualia Academy', 'Contenido & Distribucion', 'SaaS Tools Academy'],
  'prisma-engine': ['Contenido & Distribucion'],
  'visual-mapping': ['IQ Demos'],
  'voicenotes': ['IQ Herramientas'],
  'holding-board': ['IQ Herramientas'],
};

// Extra filters for agents that share a project
const AGENT_FILTERS = {
  'visual-mapping': t => /visual.mapping|wtw|cotizador|measurebot/i.test(t.title),
  'voicenotes': t => /voicenotes/i.test(t.title),
  'holding-board': t => /holding.board|local.dev.server/i.test(t.title),
  'prisma-engine': t => true, // gets all Contenido & Distribucion
};

// Company grouping for main workspace
const COMPANIES = {
  '🎓 QUALIA ACADEMY': ['Qualia Academy', 'Contenido & Distribucion', 'SaaS Tools Academy'],
  '🏗 INFRAQUALIA': ['IQ Setup', 'IQ Consola', 'IQ Monitoreo', 'IQ Managed', 'IQ Herramientas', 'IQ Demos'],
  '💰 QUALIA WEALTH': ['Qualia Wealth', 'Qualia Fund'],
};

const HEADERS = {
  'main': '# 📌 Backlog\n\nArchivo persistente de tareas, ideas y mejoras pendientes.\nOrganizado por empresa y linea de negocio del holding.\nNo se compacta, no se archiva. QualIA lo mantiene actualizado.\nFuente de verdad: Holding Board Dashboard.\n\n---\n',
  'infraqualia': '# 📌 Backlog - InfraQualia\n\nFuente de verdad: Holding Board Dashboard.\n\n---\n',
  'prisma-academy': '# 📌 Backlog - Prisma QualIA Academy\n\nFuente de verdad: Holding Board Dashboard.\n\n---\n',
  'prisma-engine': '# 📌 Backlog - Prisma Engine\n\nFuente de verdad: Holding Board Dashboard.\n\n---\n',
  'visual-mapping': '# 📌 Backlog - Visual Mapping WTW\n\nFuente de verdad: Holding Board Dashboard.\n\n---\n',
  'voicenotes': '# 📌 Backlog - VoiceNotes-IA\n\nFuente de verdad: Holding Board Dashboard.\n\n---\n',
  'holding-board': '# 📌 Backlog - Holding Board\n\nFuente de verdad: Holding Board Dashboard.\n\n---\n',
};

const STATUS_ORDER = { 'in-progress': 0, 'todo': 1, 'ready': 1, 'blocked': 2, 'idea': 3, 'backlog': 4, 'done': 5 };

// Write lock: tracks files recently written by sync so the watcher can skip them
export const recentSyncWrites = new Map(); // path → timestamp

// ── Dynamic workspace discovery ──
export function discoverWorkspaces() {
  const base = join(HOME, '.openclaw');
  const workspaces = {};
  try {
    const entries = readdirSync(base);
    for (const entry of entries) {
      if (!entry.startsWith('workspace')) continue;
      const backlogPath = join(base, entry, 'BACKLOG.md');
      if (!existsSync(backlogPath)) continue;
      // Determine agent name from directory
      const agent = entry === 'workspace' ? 'main' : entry.replace('workspace-', '');
      workspaces[agent] = backlogPath;
    }
  } catch { /* dir doesn't exist */ }
  return workspaces;
}

function genId() {
  return crypto.randomBytes(4).toString('hex');
}

function formatTask(t) {
  const check = t.status === 'done' ? 'x' : ' ';
  let line = `- [${check}] ${t.title}`;
  if (t.status === 'blocked') line += ' [BLOQUEADO]';
  if (t.status === 'in-progress') line += ' [EN PROGRESO]';
  // Add qb ID with encoded status for roundtrip fidelity
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
  const workspaces = discoverWorkspaces();

  console.log(`Loaded ${allTasks.length} tasks, ${Object.keys(workspaces).length} workspaces`);

  for (const [agent, backlogPath] of Object.entries(workspaces)) {
    if (agent === excludeAgent) continue;

    // Filter tasks for this agent
    let tasks;
    if (agent === 'main') {
      tasks = allTasks.filter(t => t.status !== 'done');
    } else {
      const projects = AGENT_PROJECTS[agent];
      if (!projects) {
        // Unknown agent, give them tasks assigned to them
        tasks = allTasks.filter(t => t.agent === agent && t.status !== 'done');
      } else {
        // Include tasks matching project config OR directly assigned to this agent
        tasks = allTasks.filter(t => {
          if (t.status === 'done') return false;
          // Always include tasks explicitly assigned to this agent
          if (t.agent === agent) return true;
          // Include tasks from configured projects (with optional title filter)
          if (projects.includes(t.project)) {
            return AGENT_FILTERS[agent] ? AGENT_FILTERS[agent](t) : true;
          }
          return false;
        });
      }
    }

    const header = HEADERS[agent] || `# 📌 Backlog - ${agent}\n\nFuente de verdad: Holding Board Dashboard.\n\n---\n`;
    let content = SYNC_MARKER + '\n' + header;

    if (agent === 'main') {
      // Group by company then project
      for (const [company, projects] of Object.entries(COMPANIES)) {
        const companyTasks = tasks.filter(t => projects.includes(t.project));
        if (companyTasks.length === 0) continue;
        content += `\n## ${company}\n`;
        for (const proj of projects) {
          const projTasks = sortTasks(companyTasks.filter(t => t.project === proj));
          if (projTasks.length === 0) continue;
          content += `\n### ${proj}\n`;
          for (const t of projTasks) content += formatTask(t) + '\n';
        }
      }
      // Parking lot
      const allCompanyProjects = Object.values(COMPANIES).flat();
      const parkingLot = tasks.filter(t => !allCompanyProjects.includes(t.project));
      if (parkingLot.length > 0) {
        content += '\n## 🅿️ PARKING LOT\n\n';
        for (const t of sortTasks(parkingLot)) content += formatTask(t) + '\n';
      }
    } else {
      // Group by project
      const byProject = {};
      for (const t of tasks) {
        const p = t.project || 'Otros';
        if (!byProject[p]) byProject[p] = [];
        byProject[p].push(t);
      }
      for (const [proj, projTasks] of Object.entries(byProject)) {
        content += `\n### ${proj}\n`;
        for (const t of sortTasks(projTasks)) content += formatTask(t) + '\n';
      }
    }

    const wsDir = dirname(backlogPath);
    if (existsSync(wsDir)) {
      writeFileSync(backlogPath, content);
      recentSyncWrites.set(backlogPath, Date.now());
      console.log(`✓ ${agent}: ${tasks.length} tasks → ${backlogPath}`);
    } else {
      console.log(`⚠ ${agent}: workspace not found at ${wsDir}`);
    }
  }
}

// Run directly
if (process.argv[1] && process.argv[1].endsWith('sync-backlogs.mjs')) {
  syncBoardToBacklogs();
}
