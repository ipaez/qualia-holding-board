import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;

const SOURCES = [
  { path: join(HOME, '.openclaw/workspace/BACKLOG.md'), agent: 'main' },
  { path: join(HOME, '.openclaw/workspace-infraqualia/BACKLOG.md'), agent: 'infraqualia' },
  { path: join(HOME, '.openclaw/workspace-prisma-academy/BACKLOG.md'), agent: 'prisma-academy' },
  { path: join(HOME, '.openclaw/workspace-visual-mapping/BACKLOG.md'), agent: 'visual-mapping' },
  { path: join(HOME, '.openclaw/workspace-prisma-engine/BACKLOG.md'), agent: 'prisma-engine' },
];

// Map section headers to projects
const SECTION_PROJECT_MAP = {
  'pipeline prisma': 'Prisma Pipeline',
  'pipeline engine': 'Prisma Engine',
  'prisma engine': 'Prisma Engine',
  'modelo academy': 'Qualia Academy',
  'distribucion': 'Qualia Academy',
  'academy': 'Qualia Academy',
  'levanta26': 'Qualia Academy',
  'asesorias': 'Qualia Academy',
  'coaching': 'Qualia Academy',
  'qualia-wealth': 'Qualia Wealth',
  'wealth': 'Qualia Wealth',
  'inversiones': 'Qualia Wealth',
  'infraqualia': 'InfraQualia',
  'producto': 'InfraQualia',
  'ventas': 'InfraQualia',
  'revenue': 'InfraQualia',
  'portal': 'InfraQualia',
  'dashboard': 'InfraQualia',
  'visual mapping': 'Visual Mapping WTW',
  'measurebot': 'Visual Mapping WTW',
  'cotizador': 'Visual Mapping WTW',
  'growth': 'Growth/Monetizacion',
  'monetizacion': 'Growth/Monetizacion',
  'infra': 'Infra/Core',
  'servicios': 'Infra/Core',
  'tokens': 'Infra/Core',
  'consumo': 'Infra/Core',
  'fixes': 'Infra/Core',
  'tech debt': 'Infra/Core',
  'tech': 'Infra/Core',
  'proceso instalacion': 'InfraQualia',
  'instalacion': 'InfraQualia',
  'pagos': 'Qualia Academy',
  'revenue split': 'Qualia Academy',
  'saas tools': 'Qualia Academy',
  'anti-churn': 'Qualia Academy',
  'ideas': 'Prisma Engine',
  'futuro': 'Prisma Engine',
};

function detectProject(sectionHeader) {
  const lower = sectionHeader.toLowerCase();
  for (const [key, project] of Object.entries(SECTION_PROJECT_MAP)) {
    if (lower.includes(key)) return project;
  }
  return '';
}

function parseBacklog(content, agent) {
  const tasks = [];
  let currentSection = '';
  let currentProject = '';

  for (const line of content.split('\n')) {
    // Detect section headers
    const headerMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headerMatch) {
      currentSection = headerMatch[1].replace(/[🎬📊🎓💳🧲🔧💰🏗🚀✅✨💬📐🎪🖥🔐📦💡👥]/g, '').trim();
      currentProject = detectProject(currentSection);
      continue;
    }

    // Skip completed section
    if (currentSection.toLowerCase().startsWith('completado')) continue;

    // Parse task lines
    const taskMatch = line.match(/^[-*]\s+\[([x ])\]\s+(.+)/i);
    if (!taskMatch) {
      // Also match lines without checkboxes (main backlog style)
      const plainMatch = line.match(/^[-*]\s+(?!\[)(.+)/);
      if (plainMatch && currentProject) {
        const text = plainMatch[1].trim();
        if (text.length < 5) continue; // skip noise
        
        let status = 'idea';
        let blockedBy = '';
        const blockedMatch = text.match(/BLOQUEADO:?\s*(.+)/i);
        if (blockedMatch) {
          status = 'blocked';
          blockedBy = blockedMatch[1].trim();
        }

        const title = text.replace(/\s*[-–]\s*BLOQUEADO:?\s*.+/i, '').replace(/\*\*/g, '').trim();
        if (!title) continue;

        tasks.push({
          id: crypto.randomUUID(),
          title,
          description: '',
          project: currentProject,
          agent,
          status,
          blockedBy,
          priority: 'medium',
          type: 'feature',
          deadline: null,
          notes: `Section: ${currentSection}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      continue;
    }

    const done = taskMatch[1].toLowerCase() === 'x';
    const text = taskMatch[2].trim();

    let status = done ? 'done' : 'idea';
    let blockedBy = '';
    const blockedMatch = text.match(/BLOQUEADO:?\s*(.+)/i);
    if (blockedMatch) {
      status = 'blocked';
      blockedBy = blockedMatch[1].trim();
    }

    const title = text.replace(/\s*[-–]\s*BLOQUEADO:?\s*.+/i, '').replace(/\*\*/g, '').trim();
    if (!title) continue;

    tasks.push({
      id: crypto.randomUUID(),
      title,
      description: '',
      project: currentProject || (agent === 'main' ? 'Infra/Core' : ''),
      agent,
      status,
      blockedBy,
      priority: 'medium',
      type: 'feature',
      deadline: null,
      notes: `Section: ${currentSection}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return tasks;
}

// --- Main ---
const allTasks = [];
const projectsSet = new Set([
  'Prisma Pipeline', 'Prisma Engine', 'InfraQualia', 'Visual Mapping WTW',
  'Qualia Wealth', 'Qualia Academy', 'Infra/Core', 'Growth/Monetizacion'
]);
const agentsSet = new Set(['main', 'infraqualia', 'prisma-academy', 'prisma-engine', 'visual-mapping']);

for (const source of SOURCES) {
  if (!existsSync(source.path)) {
    console.log(`⚠ Not found: ${source.path}`);
    continue;
  }
  const content = readFileSync(source.path, 'utf8');
  const tasks = parseBacklog(content, source.agent);
  console.log(`✓ ${source.agent}: ${tasks.length} tasks parsed`);
  allTasks.push(...tasks);
  
  for (const t of tasks) {
    if (t.project) projectsSet.add(t.project);
  }
}

// Deduplicate by title (prefer checkbox versions, keep first occurrence)
const seen = new Map();
const deduped = [];
for (const t of allTasks) {
  const key = t.title.toLowerCase().substring(0, 60);
  if (!seen.has(key)) {
    seen.set(key, true);
    deduped.push(t);
  }
}

const data = {
  tasks: deduped,
  projects: [...projectsSet].sort(),
  agents: [...agentsSet].sort(),
};

const outPath = join(__dirname, 'board-data.json');
writeFileSync(outPath, JSON.stringify(data, null, 2));

const statusCounts = {};
for (const t of deduped) {
  statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
}

console.log(`\n📊 Total: ${deduped.length} tasks (deduped from ${allTasks.length})`);
console.log('   By status:', JSON.stringify(statusCounts));
console.log(`   Projects: ${data.projects.length}`);
console.log(`   Agents: ${data.agents.length}`);
console.log(`✓ Written to ${outPath}`);
