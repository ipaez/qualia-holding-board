import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, 'board-data.json');

const d = JSON.parse(readFileSync(DATA_FILE, 'utf8'));

// 1. Migrate projects from string[] to objects
const projAgents = {};
for (const t of d.tasks || []) {
  if (!t.project) continue;
  if (!projAgents[t.project]) projAgents[t.project] = {};
  const a = t.agent || 'main';
  projAgents[t.project][a] = (projAgents[t.project][a] || 0) + 1;
}

const newProjects = [];
for (const name of Object.keys(projAgents).sort()) {
  const agents = projAgents[name];
  const agent = Object.entries(agents).sort((a, b) => b[1] - a[1])[0][0];
  const id = name.toLowerCase().replace(/\s+/g, '-').replace(/&/g, 'and').replace(/\//g, '-');
  newProjects.push({ id, name, agent });
}
d.projects = newProjects;

// 2. Migrate statuses
const statusMap = { idea: 'backlog', review: 'in-progress', ready: 'todo' };
for (const t of d.tasks) {
  t.status = statusMap[t.status] || t.status;
}

// 3. Simplify ecosystem nodes
const keepFields = new Set(['id', 'name', 'description', 'color', 'x', 'y', 'refs', 'w', 'h']);
for (const board of d.ecosystem.boards) {
  for (const node of board.nodes || []) {
    // Convert projectName -> projects[]
    node.projects = node.projectName ? [node.projectName] : [];
    node.links = [];
    // Remove deprecated fields
    for (const k of Object.keys(node)) {
      if (!keepFields.has(k) && k !== 'projects' && k !== 'links') {
        delete node[k];
      }
    }
  }
}

// 4. Add config
d.config = {
  workspacesBase: '~/.openclaw',
  backlogFilename: 'BACKLOG.md'
};

// 5. Remove agents array (derived from projects now)
delete d.agents;

writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));

// Report
console.log('Migration v2 done');
console.log(`Projects: ${newProjects.length}`);
for (const p of newProjects) console.log(`  ${p.id}: ${p.name} -> ${p.agent}`);
const sc = {};
for (const t of d.tasks) sc[t.status] = (sc[t.status] || 0) + 1;
console.log('Statuses:', sc);
console.log(`Nodes simplified across ${d.ecosystem.boards.length} boards`);
