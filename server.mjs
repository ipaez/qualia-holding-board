import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { startWatching } from './backlog-watcher.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, 'board-data.json');
const WEB_DIR = join(__dirname, 'web');
const BRANDING_DIR = join(__dirname, 'branding');
const BRANDING_FILE = join(BRANDING_DIR, 'theme.json');

// Start backlog file watcher
try { startWatching(); } catch(e) { console.error('[qualia-board] Watcher start error:', e.message); }

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const VALID_STATUSES = new Set(['backlog', 'todo', 'in-progress', 'blocked', 'done']);

function loadData() {
  let data;
  try { data = JSON.parse(readFileSync(DATA_FILE, 'utf8')); }
  catch { data = { tasks: [], projects: [], config: {} }; }
  if (!data.ecosystem) {
    data.ecosystem = { boards: [{ id: 'root', name: 'Mi Holding', created: new Date().toISOString(), nodes: [], connections: [] }] };
  }
  if (!data.ecosystem.boards) {
    data.ecosystem = { boards: [{ id: 'root', name: 'Mi Holding', created: new Date().toISOString(), nodes: data.ecosystem.nodes || [], connections: data.ecosystem.connections || [] }] };
  }
  // Ensure all boards have a type (default: ecosystem)
  let dirty = false;
  for (const b of data.ecosystem.boards) {
    if (!b.type) { b.type = 'ecosystem'; dirty = true; }
  }
  // Migrate brainstorm boards into ecosystem with type=brainstorm
  if (data.brainstorm && data.brainstorm.boards && data.brainstorm.boards.length > 0) {
    for (const bs of data.brainstorm.boards) {
      const nodes = (bs.cards || []).map(c => ({
        id: c.id,
        name: c.title || c.name || 'Sin titulo',
        description: c.summary || c.description || '',
        detail: c.detail || '',
        source: c.source || '',
        tags: c.tags || [],
        color: c.color || '#c9a94e',
        x: c.x ?? 0, y: c.y ?? 0,
        projects: [], links: [],
        refs: c.refs || [],
      }));
      data.ecosystem.boards.push({
        id: bs.id,
        name: bs.name,
        type: 'brainstorm',
        created: bs.created || new Date().toISOString(),
        nodes,
        connections: bs.connections || [],
      });
    }
    delete data.brainstorm;
    dirty = true;
  }
  if (dirty) saveData(data);
  return data;
}

let _syncTimer = null;
function saveData(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    execFile('node', [join(__dirname, 'sync-backlogs.mjs')], { timeout: 10000 }, () => {});
  }, 2000);
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function serveStatic(res, filePath) {
  try {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;
    const ext = extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    const content = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
    return true;
  } catch { return false; }
}

// ── Scope helpers ──

/**
 * Collect all project names from a node and all its descendants (via refs)
 */
function collectProjectsRecursive(data, boardId, nodeId, visited = new Set()) {
  const key = `${boardId}:${nodeId}`;
  if (visited.has(key)) return [];
  visited.add(key);

  const board = (data.ecosystem.boards || []).find(b => b.id === boardId);
  if (!board) return [];
  const node = (board.nodes || []).find(n => n.id === nodeId);
  if (!node) return [];

  const projects = [...(node.projects || [])];

  // Recurse into refs (sub-nodes)
  for (const ref of node.refs || []) {
    projects.push(...collectProjectsRecursive(data, ref.boardId, ref.cardId, visited));
  }

  return projects;
}

/**
 * Build full tree for a node (resolved refs)
 */
function buildNodeTree(data, boardId, nodeId, visited = new Set()) {
  const key = `${boardId}:${nodeId}`;
  if (visited.has(key)) return null;
  visited.add(key);

  const board = (data.ecosystem.boards || []).find(b => b.id === boardId);
  if (!board) return null;
  const node = (board.nodes || []).find(n => n.id === nodeId);
  if (!node) return null;

  const children = [];
  for (const ref of node.refs || []) {
    const child = buildNodeTree(data, ref.boardId, ref.cardId, visited);
    if (child) children.push(child);
  }

  return {
    id: node.id,
    boardId,
    name: node.name,
    description: node.description,
    projects: node.projects || [],
    links: node.links || [],
    children,
  };
}

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // --- API routes ---
  if (path.startsWith('/api/')) {
    const data = loadData();

    // ====== TASKS ======
    if (path === '/api/tasks' && req.method === 'GET') {
      let tasks = [...data.tasks];
      const s = url.searchParams;
      if (s.get('status')) tasks = tasks.filter(t => t.status === s.get('status'));
      if (s.get('project')) tasks = tasks.filter(t => t.project === s.get('project'));
      if (s.get('agent')) tasks = tasks.filter(t => t.agent === s.get('agent'));
      if (s.get('priority')) tasks = tasks.filter(t => t.priority === s.get('priority'));
      return json(res, 200, tasks);
    }

    const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch && req.method === 'GET') {
      const task = data.tasks.find(t => t.id === taskMatch[1]);
      return task ? json(res, 200, task) : json(res, 404, { error: 'Not found' });
    }

    if (path === '/api/tasks' && req.method === 'POST') {
      const body = await readBody(req);
      const now = new Date().toISOString();
      const status = VALID_STATUSES.has(body.status) ? body.status : 'backlog';
      const task = {
        id: crypto.randomUUID(),
        title: body.title || 'Untitled',
        description: body.description || '',
        project: body.project || '',
        agent: body.agent || 'main',
        status,
        blockedBy: body.blockedBy || '',
        priority: body.priority || 'medium',
        type: body.type || 'feature',
        deadline: body.deadline || null,
        notes: body.notes || '',
        createdAt: now,
        updatedAt: now,
      };
      data.tasks.push(task);
      saveData(data);
      return json(res, 201, task);
    }

    if (taskMatch && req.method === 'PUT') {
      const task = data.tasks.find(t => t.id === taskMatch[1]);
      if (!task) return json(res, 404, { error: 'Not found' });
      const body = await readBody(req);
      for (const key of ['title','description','project','agent','status','blockedBy','priority','type','deadline','notes']) {
        if (body[key] !== undefined) task[key] = body[key];
      }
      if (task.status && !VALID_STATUSES.has(task.status)) task.status = 'backlog';
      task.updatedAt = new Date().toISOString();
      saveData(data);
      return json(res, 200, task);
    }

    if (taskMatch && req.method === 'DELETE') {
      const idx = data.tasks.findIndex(t => t.id === taskMatch[1]);
      if (idx === -1) return json(res, 404, { error: 'Not found' });
      data.tasks.splice(idx, 1);
      saveData(data);
      return json(res, 200, { ok: true });
    }

    const moveMatch = path.match(/^\/api\/tasks\/([^/]+)\/move$/);
    if (moveMatch && req.method === 'POST') {
      const task = data.tasks.find(t => t.id === moveMatch[1]);
      if (!task) return json(res, 404, { error: 'Not found' });
      const body = await readBody(req);
      if (body.status && VALID_STATUSES.has(body.status)) {
        task.status = body.status;
        task.updatedAt = new Date().toISOString();
        saveData(data);
      }
      return json(res, 200, task);
    }

    // ====== PROJECTS ======
    if (path === '/api/projects' && req.method === 'GET') return json(res, 200, data.projects);

    if (path === '/api/projects' && req.method === 'POST') {
      const body = await readBody(req);
      const name = (body.name || '').trim();
      if (!name) return json(res, 400, { error: 'name required' });
      if (data.projects.some(p => p.name === name)) return json(res, 409, { error: 'already exists' });
      const id = body.id || name.toLowerCase().replace(/\s+/g, '-').replace(/&/g, 'and').replace(/\//g, '-');
      data.projects.push({ id, name });
      data.projects.sort((a, b) => a.name.localeCompare(b.name));
      saveData(data);
      return json(res, 201, data.projects);
    }

    const projMatch = path.match(/^\/api\/projects\/([^/]+)$/);
    if (projMatch && req.method === 'PUT') {
      const projId = decodeURIComponent(projMatch[1]);
      const proj = data.projects.find(p => p.id === projId || p.name === projId);
      if (!proj) return json(res, 404, { error: 'not found' });
      const body = await readBody(req);
      const oldName = proj.name;
      if (body.name !== undefined) proj.name = body.name.trim();
      // Update tasks referencing old name
      if (body.name && body.name !== oldName) {
        data.tasks.filter(t => t.project === oldName).forEach(t => t.project = proj.name);
      }
      data.projects.sort((a, b) => a.name.localeCompare(b.name));
      saveData(data);
      return json(res, 200, data.projects);
    }

    if (projMatch && req.method === 'DELETE') {
      const projId = decodeURIComponent(projMatch[1]);
      const idx = data.projects.findIndex(p => p.id === projId || p.name === projId);
      if (idx === -1) return json(res, 404, { error: 'not found' });
      data.projects.splice(idx, 1);
      saveData(data);
      return json(res, 200, data.projects);
    }

    // ====== SCOPE / NODES ======

    // GET /api/nodes/:boardId/:nodeId/backlog - filtered backlog for a node and descendants
    const nodeBacklogMatch = path.match(/^\/api\/nodes\/([^/]+)\/([^/]+)\/backlog$/);
    if (nodeBacklogMatch && req.method === 'GET') {
      const [, boardId, nodeId] = nodeBacklogMatch;
      const projectNames = [...new Set(collectProjectsRecursive(data, boardId, nodeId))];
      const tasks = data.tasks.filter(t => projectNames.includes(t.project));
      return json(res, 200, { projects: projectNames, tasks });
    }

    // GET /api/nodes/:boardId/:nodeId/tree - full resolved tree
    const nodeTreeMatch = path.match(/^\/api\/nodes\/([^/]+)\/([^/]+)\/tree$/);
    if (nodeTreeMatch && req.method === 'GET') {
      const [, boardId, nodeId] = nodeTreeMatch;
      const tree = buildNodeTree(data, boardId, nodeId);
      if (!tree) return json(res, 404, { error: 'Node not found' });
      return json(res, 200, tree);
    }

    // ====== BRANDING ======
    if (path === '/api/branding') {
      if (existsSync(BRANDING_FILE)) {
        try { return json(res, 200, JSON.parse(readFileSync(BRANDING_FILE, 'utf8'))); }
        catch { return json(res, 500, { error: 'Invalid theme.json' }); }
      }
      return json(res, 200, null);
    }

    // ====== STATS ======
    if (path === '/api/stats') {
      const stats = { byStatus: {}, byProject: {}, total: data.tasks.length };
      for (const t of data.tasks) {
        stats.byStatus[t.status] = (stats.byStatus[t.status] || 0) + 1;
        stats.byProject[t.project] = (stats.byProject[t.project] || 0) + 1;
      }
      return json(res, 200, stats);
    }

    // ====== CONFIG ======
    if (path === '/api/config' && req.method === 'GET') {
      return json(res, 200, data.config || {});
    }

    // ====== ECOSYSTEM API ======
    const ecoBoards = data.ecosystem.boards;
    const findEcoBoard = id => ecoBoards.find(b => b.id === id);

    if (path === '/api/ecosystem/boards' && req.method === 'GET') {
      let filtered = ecoBoards;
      const typeFilter = url.searchParams.get('type');
      if (typeFilter) filtered = ecoBoards.filter(b => b.type === typeFilter);
      return json(res, 200, filtered.map(b => ({ id: b.id, name: b.name, type: b.type || 'ecosystem', created: b.created, cardCount: (b.nodes||[]).length, principalId: b.principalId || null })));
    }

    if (path === '/api/ecosystem/resolve-refs' && req.method === 'POST') {
      const body = await readBody(req);
      const refs = body.refs || [];
      const results = refs.map(ref => {
        const board = ecoBoards.find(b => b.id === ref.boardId);
        if (!board) return { boardId: ref.boardId, cardId: ref.cardId, found: false };
        const card = (board.nodes || []).find(c => c.id === ref.cardId);
        if (!card) return { boardId: ref.boardId, cardId: ref.cardId, found: false };
        return { boardId: ref.boardId, cardId: ref.cardId, found: true, title: card.name, summary: card.description, color: card.color, tags: card.tags, boardName: board.name };
      });
      return json(res, 200, results);
    }

    if (path === '/api/ecosystem/boards' && req.method === 'POST') {
      const body = await readBody(req);
      const board = { id: body.id || crypto.randomUUID(), name: body.name || 'Nuevo Board', type: body.type || 'ecosystem', created: new Date().toISOString(), nodes: [], connections: [] };
      ecoBoards.push(board);
      saveData(data);
      return json(res, 201, board);
    }

    const ecoBoardMatch = path.match(/^\/api\/ecosystem\/boards\/([^/]+)$/);
    if (ecoBoardMatch && req.method === 'GET') {
      const board = findEcoBoard(ecoBoardMatch[1]);
      if (!board) return json(res, 404, { error: 'Not found' });
      return json(res, 200, board);
    }
    if (ecoBoardMatch && req.method === 'PUT') {
      const board = findEcoBoard(ecoBoardMatch[1]);
      if (!board) return json(res, 404, { error: 'Not found' });
      const body = await readBody(req);
      if (body.name !== undefined) board.name = body.name;
      if (body.type !== undefined) board.type = body.type;
      if (body.principalId !== undefined) board.principalId = body.principalId;
      saveData(data);
      return json(res, 200, board);
    }
    if (ecoBoardMatch && req.method === 'DELETE') {
      if (ecoBoardMatch[1] === 'root') return json(res, 400, { error: 'Cannot delete root board' });
      const idx = ecoBoards.findIndex(b => b.id === ecoBoardMatch[1]);
      if (idx === -1) return json(res, 404, { error: 'Not found' });
      ecoBoards.splice(idx, 1);
      saveData(data);
      return json(res, 200, { ok: true });
    }

    // Nodes
    const ecoNodesMatch = path.match(/^\/api\/ecosystem\/boards\/([^/]+)\/nodes$/);
    if (ecoNodesMatch && req.method === 'POST') {
      const board = findEcoBoard(ecoNodesMatch[1]);
      if (!board) return json(res, 404, { error: 'Board not found' });
      const body = await readBody(req);
      const node = {
        id: body.id || crypto.randomUUID(),
        name: body.name || 'Nuevo Nodo',
        description: body.description || '',
        detail: body.detail || '',
        source: body.source || '',
        tags: body.tags || [],
        color: body.color || '#c9a94e',
        x: body.x ?? 300 + Math.random() * 200,
        y: body.y ?? 200 + Math.random() * 200,
        projects: body.projects || [],
        links: body.links || [],
        refs: body.refs || [],
      };
      if (!board.nodes) board.nodes = [];
      board.nodes.push(node);
      saveData(data);
      return json(res, 201, node);
    }

    const ecoNodeMatch = path.match(/^\/api\/ecosystem\/boards\/([^/]+)\/nodes\/([^/]+)$/);
    if (ecoNodeMatch && req.method === 'PUT') {
      const board = findEcoBoard(ecoNodeMatch[1]);
      if (!board) return json(res, 404, { error: 'Board not found' });
      const node = (board.nodes || []).find(n => n.id === ecoNodeMatch[2]);
      if (!node) return json(res, 404, { error: 'Node not found' });
      const body = await readBody(req);
      for (const key of ['name','description','detail','source','tags','color','x','y','projects','links','refs','w','h']) {
        if (body[key] !== undefined) node[key] = body[key];
      }
      saveData(data);
      return json(res, 200, node);
    }
    if (ecoNodeMatch && req.method === 'DELETE') {
      const board = findEcoBoard(ecoNodeMatch[1]);
      if (!board) return json(res, 404, { error: 'Board not found' });
      const idx = (board.nodes || []).findIndex(n => n.id === ecoNodeMatch[2]);
      if (idx === -1) return json(res, 404, { error: 'Node not found' });
      const nodeId = board.nodes[idx].id;
      board.nodes.splice(idx, 1);
      board.connections = (board.connections || []).filter(c => c.from !== nodeId && c.to !== nodeId);
      saveData(data);
      return json(res, 200, { ok: true });
    }

    // Connections
    const ecoConnsMatch = path.match(/^\/api\/ecosystem\/boards\/([^/]+)\/connections$/);
    if (ecoConnsMatch && req.method === 'POST') {
      const board = findEcoBoard(ecoConnsMatch[1]);
      if (!board) return json(res, 404, { error: 'Board not found' });
      const body = await readBody(req);
      const conn = { id: 'conn-' + crypto.randomUUID().slice(0,8), from: body.from, to: body.to, label: body.label || '', type: body.type || 'strategic', detail: body.detail || '' };
      if (!board.connections) board.connections = [];
      board.connections.push(conn);
      saveData(data);
      return json(res, 201, conn);
    }

    const ecoConnMatch = path.match(/^\/api\/ecosystem\/boards\/([^/]+)\/connections\/([^/]+)$/);
    if (ecoConnMatch && req.method === 'PUT') {
      const board = findEcoBoard(ecoConnMatch[1]);
      if (!board) return json(res, 404, { error: 'Board not found' });
      const conn = (board.connections || []).find(c => c.id === ecoConnMatch[2]);
      if (!conn) return json(res, 404, { error: 'Connection not found' });
      const body = await readBody(req);
      for (const key of ['from','to','label','type','detail']) { if (body[key] !== undefined) conn[key] = body[key]; }
      saveData(data);
      return json(res, 200, conn);
    }
    if (ecoConnMatch && req.method === 'DELETE') {
      const board = findEcoBoard(ecoConnMatch[1]);
      if (!board) return json(res, 404, { error: 'Board not found' });
      const idx = (board.connections || []).findIndex(c => c.id === ecoConnMatch[2]);
      if (idx === -1) return json(res, 404, { error: 'Connection not found' });
      board.connections.splice(idx, 1);
      saveData(data);
      return json(res, 200, { ok: true });
    }

    // Backward compat
    if (path === '/api/ecosystem' && req.method === 'GET') {
      const root = findEcoBoard('root') || ecoBoards[0];
      return json(res, 200, root || { nodes: [], connections: [] });
    }

    return json(res, 404, { error: 'Unknown API route' });
  }

  // --- Static files ---
  if (path === '/' || path === '') return serveStatic(res, join(WEB_DIR, 'index.html'));
  if (path === '/kanban') return serveStatic(res, join(WEB_DIR, 'kanban.html'));
  if (path === '/projects') return serveStatic(res, join(WEB_DIR, 'projects.html'));
  if (path === '/done') return serveStatic(res, join(WEB_DIR, 'done.html'));
  if (path === '/ecosystem') return serveStatic(res, join(WEB_DIR, 'ecosystem.html'));
  if (path === '/backlog') return serveStatic(res, join(WEB_DIR, 'backlog.html'));
  if (path === '/brainstorm' || path.startsWith('/brainstorm/')) return serveStatic(res, join(WEB_DIR, 'ecosystem.html'));

  if (path.startsWith('/branding/')) {
    const brandPath = join(BRANDING_DIR, path.slice(10));
    if (serveStatic(res, brandPath)) return;
  }

  const served = serveStatic(res, join(WEB_DIR, path));
  if (!served) { res.writeHead(404); res.end('Not found'); }
}
