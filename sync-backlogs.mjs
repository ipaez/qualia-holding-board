import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;
const DATA_FILE = join(__dirname, 'board-data.json');

// Project -> workspace mapping
// Each workspace gets tasks from specific projects
const WORKSPACE_MAP = {
  // Main (QualIA) gets everything as overview
  'main': {
    path: join(HOME, '.openclaw/workspace/BACKLOG.md'),
    projects: null, // null = ALL projects
    header: '# 📌 Backlog\n\nArchivo persistente de tareas, ideas y mejoras pendientes.\nOrganizado por empresa y linea de negocio del holding.\nNo se compacta, no se archiva. QualIA lo mantiene actualizado.\nFuente de verdad: Holding Board Dashboard.\n\n---\n',
    groupByCompany: true,
  },
  'infraqualia': {
    path: join(HOME, '.openclaw/workspace-infraqualia/BACKLOG.md'),
    projects: ['IQ Setup', 'IQ Consola', 'IQ Monitoreo', 'IQ Managed', 'IQ Herramientas', 'IQ Demos'],
    header: '# 📌 Backlog - InfraQualia\n\nFuente de verdad: Holding Board Dashboard.\n\n---\n',
  },
  'prisma-academy': {
    path: join(HOME, '.openclaw/workspace-prisma-academy/BACKLOG.md'),
    projects: ['Qualia Academy', 'Contenido & Distribucion', 'SaaS Tools Academy'],
    header: '# 📌 Backlog - Prisma QualIA Academy\n\nFuente de verdad: Holding Board Dashboard.\n\n---\n',
  },
  'prisma-engine': {
    path: join(HOME, '.openclaw/workspace-prisma-engine/BACKLOG.md'),
    projects: ['Contenido & Distribucion'],
    header: '# 📌 Backlog - Prisma Engine\n\nFuente de verdad: Holding Board Dashboard.\n\n---\n',
  },
  'visual-mapping': {
    path: join(HOME, '.openclaw/workspace-visual-mapping/BACKLOG.md'),
    projects: ['IQ Demos'],
    filter: t => t.title.toLowerCase().includes('visual mapping') || t.title.toLowerCase().includes('wtw') || t.title.toLowerCase().includes('cotizador') || t.title.toLowerCase().includes('measurebot'),
    header: '# 📌 Backlog - Visual Mapping WTW\n\nFuente de verdad: Holding Board Dashboard.\n\n---\n',
  },
  'voicenotes': {
    path: join(HOME, '.openclaw/workspace-voicenotes/BACKLOG.md'),
    projects: ['IQ Herramientas'],
    filter: t => t.title.toLowerCase().includes('voicenotes'),
    header: '# 📌 Backlog - VoiceNotes-IA\n\nFuente de verdad: Holding Board Dashboard.\n\n---\n',
  },
  'holding-board': {
    path: join(HOME, '.openclaw/workspace-holding-board/BACKLOG.md'),
    projects: ['IQ Herramientas'],
    filter: t => t.title.toLowerCase().includes('holding board') || t.title.toLowerCase().includes('local dev server'),
    header: '# 📌 Backlog - Holding Board\n\nFuente de verdad: Holding Board Dashboard.\n\n---\n',
  },
};

// Company grouping for main workspace
const COMPANIES = {
  '🎓 QUALIA ACADEMY': ['Qualia Academy', 'Contenido & Distribucion', 'SaaS Tools Academy'],
  '🏗 INFRAQUALIA': ['IQ Setup', 'IQ Consola', 'IQ Monitoreo', 'IQ Managed', 'IQ Herramientas', 'IQ Demos'],
  '💰 QUALIA WEALTH': ['Qualia Wealth', 'Qualia Fund'],
};

const STATUS_ORDER = { 'in-progress': 0, 'todo': 1, 'blocked': 2, 'idea': 3, 'backlog': 4, 'done': 5 };

function formatTask(t) {
  const check = t.status === 'done' ? 'x' : ' ';
  let line = `- [${check}] ${t.title}`;
  if (t.status === 'blocked') line += ' [BLOQUEADO]';
  if (t.status === 'in-progress') line += ' [EN PROGRESO]';
  return line;
}

function sortTasks(tasks) {
  return tasks.sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3));
}

// Load data
const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
const allTasks = data.tasks || [];

console.log(`Loaded ${allTasks.length} tasks`);

for (const [agent, config] of Object.entries(WORKSPACE_MAP)) {
  // Filter tasks for this workspace
  let tasks;
  if (config.projects === null) {
    tasks = allTasks.filter(t => t.status !== 'done');
  } else {
    tasks = allTasks.filter(t => config.projects.includes(t.project) && t.status !== 'done');
  }

  // Apply additional filter if exists
  if (config.filter) {
    tasks = tasks.filter(config.filter);
  }

  let content = config.header;

  if (config.groupByCompany) {
    // Main workspace: group by company then project
    for (const [company, projects] of Object.entries(COMPANIES)) {
      const companyTasks = tasks.filter(t => projects.includes(t.project));
      if (companyTasks.length === 0) continue;

      content += `\n## ${company}\n`;

      for (const proj of projects) {
        const projTasks = sortTasks(companyTasks.filter(t => t.project === proj));
        if (projTasks.length === 0) continue;
        content += `\n### ${proj}\n`;
        for (const t of projTasks) {
          content += formatTask(t) + '\n';
        }
      }
    }

    // Parking lot (tasks without a company match)
    const allCompanyProjects = Object.values(COMPANIES).flat();
    const parkingLot = tasks.filter(t => !allCompanyProjects.includes(t.project));
    if (parkingLot.length > 0) {
      content += '\n## 🅿️ PARKING LOT\n\n';
      for (const t of sortTasks(parkingLot)) {
        content += formatTask(t) + '\n';
      }
    }
  } else {
    // Other workspaces: group by project
    const byProject = {};
    for (const t of tasks) {
      const p = t.project || 'Otros';
      if (!byProject[p]) byProject[p] = [];
      byProject[p].push(t);
    }

    for (const [proj, projTasks] of Object.entries(byProject)) {
      content += `\n### ${proj}\n`;
      for (const t of sortTasks(projTasks)) {
        content += formatTask(t) + '\n';
      }
    }
  }

  // Only write if path exists (workspace exists)
  const wsDir = dirname(config.path);
  if (existsSync(wsDir)) {
    writeFileSync(config.path, content);
    console.log(`✓ ${agent}: ${tasks.length} tasks → ${config.path}`);
  } else {
    console.log(`⚠ ${agent}: workspace not found at ${wsDir}`);
  }
}
