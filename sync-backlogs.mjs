import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME;
const DATA_FILE = join(__dirname, 'board-data.json');

const AGENT_PATHS = {
  'main': join(HOME, '.openclaw/workspace/BACKLOG.md'),
  'infraqualia': join(HOME, '.openclaw/workspace-infraqualia/BACKLOG.md'),
  'prisma-academy': join(HOME, '.openclaw/workspace-prisma-academy/BACKLOG.md'),
  'visual-mapping': join(HOME, '.openclaw/workspace-visual-mapping/BACKLOG.md'),
  'prisma-engine': join(HOME, '.openclaw/workspace-prisma-engine/BACKLOG.md'),
};

const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));

// Group tasks by agent, then by notes (section)
for (const [agent, path] of Object.entries(AGENT_PATHS)) {
  const agentTasks = data.tasks.filter(t => t.agent === agent);
  if (!agentTasks.length) continue;

  const sections = {};
  for (const t of agentTasks) {
    const sec = (t.notes || '').replace('Section: ', '') || t.project || 'Other';
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(t);
  }

  const lines = [`# 📌 Backlog${agent !== 'main' ? ' - ' + agent : ''}`, '', 'Archivo persistente de tareas, ideas y mejoras pendientes.', 'No se compacta, no se archiva.', '', '---', ''];

  for (const [section, tasks] of Object.entries(sections)) {
    lines.push(`### ${section}`);
    for (const t of tasks) {
      const check = t.status === 'done' ? 'x' : ' ';
      let line = `- [${check}] ${t.title}`;
      if (t.status === 'blocked' && t.blockedBy) line += ` - BLOQUEADO: ${t.blockedBy}`;
      lines.push(line);
    }
    lines.push('');
  }

  writeFileSync(path, lines.join('\n'));
  console.log(`✓ ${agent}: ${agentTasks.length} tasks → ${path}`);
}
