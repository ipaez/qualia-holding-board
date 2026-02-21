import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, 'board-data.json');
const WEB_DIR = join(__dirname, 'web');

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const DEFAULT_ECOSYSTEM = {
  nodes: [
    { id: "infraqualia", name: "InfraQualia", description: "Servicio managed de IA para empresas", objective: "", notes: "", color: "#1abc9c", x: 400, y: 200, active: true },
    { id: "qualia-academy", name: "Qualia Academy", description: "Academy as a Service para fondos VC y startups", objective: "", notes: "", color: "#e74c3c", x: 200, y: 300, active: true },
    { id: "qualia-wealth", name: "Qualia Wealth", description: "Dashboard de inversiones personales", objective: "", notes: "", color: "#c9a94e", x: 600, y: 300, active: true },
    { id: "prisma-pipeline", name: "Prisma Pipeline", description: "Pipeline automatizado de contenido desde videos", objective: "", notes: "", color: "#3498db", x: 300, y: 450, active: true },
    { id: "prisma-engine", name: "Prisma Engine", description: "Motor de procesamiento de video con n8n", objective: "", notes: "", color: "#9b59b6", x: 500, y: 450, active: true },
    { id: "visual-mapping", name: "Visual Mapping WTW", description: "Medicion por foto y cotizador geometrico de telas", objective: "", notes: "", color: "#e67e22", x: 700, y: 200, active: true },
    { id: "curso-ia", name: "Curso de IA", description: "Curso fundamentos a agentes (n8n, Make, RAG, fine-tuning)", objective: "", notes: "", color: "#e056a0", x: 100, y: 200, active: true },
    { id: "libro", name: "Libro", description: "Que la suerte nos pille preparados", objective: "", notes: "", color: "#f39c12", x: 100, y: 400, active: true },
  ],
  connections: [
    { id: "conn1", from: "qualia-academy", to: "infraqualia", label: "Startups necesitan infra IA", type: "client-flow" },
    { id: "conn2", from: "prisma-pipeline", to: "prisma-engine", label: "Pipeline usa el engine", type: "dependency" },
    { id: "conn3", from: "qualia-academy", to: "prisma-pipeline", label: "Asesorias generan contenido", type: "content-flow" },
  ]
};

function loadData() {
  let data;
  try { data = JSON.parse(readFileSync(DATA_FILE, 'utf8')); }
  catch { data = { tasks: [], projects: [], agents: [] }; }
  if (!data.ecosystem) {
    data.ecosystem = JSON.parse(JSON.stringify(DEFAULT_ECOSYSTEM));
    saveData(data);
  }
  return data;
}

function saveData(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function readBody(req) {
  // Hub uses express.json() which pre-parses body
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

    // GET /api/tasks
    if (path === '/api/tasks' && req.method === 'GET') {
      let tasks = [...data.tasks];
      const s = url.searchParams;
      if (s.get('status')) tasks = tasks.filter(t => t.status === s.get('status'));
      if (s.get('project')) tasks = tasks.filter(t => t.project === s.get('project'));
      if (s.get('agent')) tasks = tasks.filter(t => t.agent === s.get('agent'));
      if (s.get('priority')) tasks = tasks.filter(t => t.priority === s.get('priority'));
      return json(res, 200, tasks);
    }

    // GET /api/tasks/:id
    const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch && req.method === 'GET') {
      const task = data.tasks.find(t => t.id === taskMatch[1]);
      return task ? json(res, 200, task) : json(res, 404, { error: 'Not found' });
    }

    // POST /api/tasks
    if (path === '/api/tasks' && req.method === 'POST') {
      const body = await readBody(req);
      const now = new Date().toISOString();
      const task = {
        id: crypto.randomUUID(),
        title: body.title || 'Untitled',
        description: body.description || '',
        project: body.project || '',
        agent: body.agent || 'main',
        status: body.status || 'idea',
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

    // PUT /api/tasks/:id
    if (taskMatch && req.method === 'PUT') {
      const task = data.tasks.find(t => t.id === taskMatch[1]);
      if (!task) return json(res, 404, { error: 'Not found' });
      const body = await readBody(req);
      for (const key of ['title','description','project','agent','status','blockedBy','priority','type','deadline','notes']) {
        if (body[key] !== undefined) task[key] = body[key];
      }
      task.updatedAt = new Date().toISOString();
      saveData(data);
      return json(res, 200, task);
    }

    // DELETE /api/tasks/:id
    if (taskMatch && req.method === 'DELETE') {
      const idx = data.tasks.findIndex(t => t.id === taskMatch[1]);
      if (idx === -1) return json(res, 404, { error: 'Not found' });
      data.tasks.splice(idx, 1);
      saveData(data);
      return json(res, 200, { ok: true });
    }

    // POST /api/tasks/:id/move
    const moveMatch = path.match(/^\/api\/tasks\/([^/]+)\/move$/);
    if (moveMatch && req.method === 'POST') {
      const task = data.tasks.find(t => t.id === moveMatch[1]);
      if (!task) return json(res, 404, { error: 'Not found' });
      const body = await readBody(req);
      if (body.status) {
        task.status = body.status;
        task.updatedAt = new Date().toISOString();
        saveData(data);
      }
      return json(res, 200, task);
    }

    // GET /api/projects
    if (path === '/api/projects') return json(res, 200, data.projects);

    // GET /api/agents
    if (path === '/api/agents') return json(res, 200, data.agents);

    // GET /api/stats
    if (path === '/api/stats') {
      const stats = { byStatus: {}, byProject: {}, byAgent: {}, total: data.tasks.length };
      for (const t of data.tasks) {
        stats.byStatus[t.status] = (stats.byStatus[t.status] || 0) + 1;
        stats.byProject[t.project] = (stats.byProject[t.project] || 0) + 1;
        stats.byAgent[t.agent] = (stats.byAgent[t.agent] || 0) + 1;
      }
      return json(res, 200, stats);
    }

    // --- Ecosystem API ---
    // GET /api/ecosystem
    if (path === '/api/ecosystem' && req.method === 'GET') {
      return json(res, 200, data.ecosystem);
    }

    // POST /api/ecosystem/nodes
    if (path === '/api/ecosystem/nodes' && req.method === 'POST') {
      const body = await readBody(req);
      const node = {
        id: body.id || crypto.randomUUID(),
        name: body.name || 'Nuevo Proyecto',
        description: body.description || '',
        objective: body.objective || '',
        notes: body.notes || '',
        color: body.color || '#c9a94e',
        x: body.x ?? 300 + Math.random() * 200,
        y: body.y ?? 200 + Math.random() * 200,
        active: body.active !== false,
        stage: body.stage || 'idea',
        revenue: body.revenue || '',
        agent: body.agent || '',
        tags: body.tags || [],
        metrics: body.metrics || [],
      };
      data.ecosystem.nodes.push(node);
      saveData(data);
      return json(res, 201, node);
    }

    // PUT /api/ecosystem/nodes/:id
    const ecoNodeMatch = path.match(/^\/api\/ecosystem\/nodes\/([^/]+)$/);
    if (ecoNodeMatch && req.method === 'PUT') {
      const node = data.ecosystem.nodes.find(n => n.id === ecoNodeMatch[1]);
      if (!node) return json(res, 404, { error: 'Not found' });
      const body = await readBody(req);
      for (const key of ['name','description','objective','notes','color','x','y','active','stage','revenue','agent','tags','metrics']) {
        if (body[key] !== undefined) node[key] = body[key];
      }
      saveData(data);
      return json(res, 200, node);
    }

    // DELETE /api/ecosystem/nodes/:id
    if (ecoNodeMatch && req.method === 'DELETE') {
      const idx = data.ecosystem.nodes.findIndex(n => n.id === ecoNodeMatch[1]);
      if (idx === -1) return json(res, 404, { error: 'Not found' });
      data.ecosystem.nodes.splice(idx, 1);
      data.ecosystem.connections = data.ecosystem.connections.filter(c => c.from !== ecoNodeMatch[1] && c.to !== ecoNodeMatch[1]);
      saveData(data);
      return json(res, 200, { ok: true });
    }

    // POST /api/ecosystem/connections
    if (path === '/api/ecosystem/connections' && req.method === 'POST') {
      const body = await readBody(req);
      const conn = {
        id: body.id || 'conn-' + crypto.randomUUID().slice(0,8),
        from: body.from,
        to: body.to,
        label: body.label || '',
        type: body.type || 'strategic',
      };
      data.ecosystem.connections.push(conn);
      saveData(data);
      return json(res, 201, conn);
    }

    // PUT /api/ecosystem/connections/:id
    const ecoConnMatch = path.match(/^\/api\/ecosystem\/connections\/([^/]+)$/);
    if (ecoConnMatch && req.method === 'PUT') {
      const conn = data.ecosystem.connections.find(c => c.id === ecoConnMatch[1]);
      if (!conn) return json(res, 404, { error: 'Not found' });
      const body = await readBody(req);
      for (const key of ['from','to','label','type']) {
        if (body[key] !== undefined) conn[key] = body[key];
      }
      saveData(data);
      return json(res, 200, conn);
    }

    // DELETE /api/ecosystem/connections/:id
    if (ecoConnMatch && req.method === 'DELETE') {
      const idx = data.ecosystem.connections.findIndex(c => c.id === ecoConnMatch[1]);
      if (idx === -1) return json(res, 404, { error: 'Not found' });
      data.ecosystem.connections.splice(idx, 1);
      saveData(data);
      return json(res, 200, { ok: true });
    }

    // ====== BRAINSTORM API ======
    // GET /api/brainstorm/boards
    if (path === '/api/brainstorm/boards' && req.method === 'GET') {
      if (!data.brainstorm) data.brainstorm = { boards: [] };
      return json(res, 200, data.brainstorm.boards.map(b => ({ id: b.id, name: b.name, created: b.created, cardCount: (b.cards||[]).length, principalId: b.principalId || null })));
    }

    // POST /api/brainstorm/resolve-refs - resolve card refs across boards
    if (path === '/api/brainstorm/resolve-refs' && req.method === 'POST') {
      if (!data.brainstorm) data.brainstorm = { boards: [] };
      const body = await readBody(req);
      const refs = body.refs || []; // [{boardId, cardId}]
      const results = refs.map(ref => {
        const board = data.brainstorm.boards.find(b => b.id === ref.boardId);
        if (!board) return { ...ref, found: false };
        const card = (board.cards||[]).find(c => c.id === ref.cardId);
        if (!card) return { ...ref, found: false };
        return { ...ref, found: true, title: card.title, summary: card.summary, color: card.color, tags: card.tags, boardName: board.name };
      });
      return json(res, 200, results);
    }

    // POST /api/brainstorm/boards
    if (path === '/api/brainstorm/boards' && req.method === 'POST') {
      if (!data.brainstorm) data.brainstorm = { boards: [] };
      const body = await readBody(req);
      const board = {
        id: crypto.randomUUID().slice(0,8),
        name: body.name || 'Nuevo Board',
        created: new Date().toISOString(),
        cards: [],
        connections: [],
      };
      data.brainstorm.boards.push(board);
      saveData(data);
      return json(res, 201, board);
    }

    // GET /api/brainstorm/boards/:id
    const bsBoardMatch = path.match(/^\/api\/brainstorm\/boards\/([^/]+)$/);
    if (bsBoardMatch && req.method === 'GET') {
      if (!data.brainstorm) data.brainstorm = { boards: [] };
      const board = data.brainstorm.boards.find(b => b.id === bsBoardMatch[1]);
      if (!board) return json(res, 404, { error: 'Board not found' });
      return json(res, 200, board);
    }

    // PUT /api/brainstorm/boards/:id
    if (bsBoardMatch && req.method === 'PUT') {
      if (!data.brainstorm) data.brainstorm = { boards: [] };
      const board = data.brainstorm.boards.find(b => b.id === bsBoardMatch[1]);
      if (!board) return json(res, 404, { error: 'Board not found' });
      const body = await readBody(req);
      if (body.name !== undefined) board.name = body.name;
      if (body.principalId !== undefined) board.principalId = body.principalId;
      saveData(data);
      return json(res, 200, board);
    }

    // DELETE /api/brainstorm/boards/:id
    if (bsBoardMatch && req.method === 'DELETE') {
      if (!data.brainstorm) data.brainstorm = { boards: [] };
      const idx = data.brainstorm.boards.findIndex(b => b.id === bsBoardMatch[1]);
      if (idx === -1) return json(res, 404, { error: 'Board not found' });
      data.brainstorm.boards.splice(idx, 1);
      saveData(data);
      return json(res, 200, { ok: true });
    }

    // POST /api/brainstorm/boards/:id/cards
    const bsCardsMatch = path.match(/^\/api\/brainstorm\/boards\/([^/]+)\/cards$/);
    if (bsCardsMatch && req.method === 'POST') {
      if (!data.brainstorm) data.brainstorm = { boards: [] };
      const board = data.brainstorm.boards.find(b => b.id === bsCardsMatch[1]);
      if (!board) return json(res, 404, { error: 'Board not found' });
      const body = await readBody(req);
      const card = {
        id: 'c-' + crypto.randomUUID().slice(0,8),
        title: body.title || 'Nueva idea',
        summary: body.summary || '',
        detail: body.detail || '',
        source: body.source || '',
        color: body.color || '#c9a94e',
        tags: body.tags || [],
        icon: body.icon || 'idea',
        x: body.x ?? 200 + Math.random() * 300,
        y: body.y ?? 150 + Math.random() * 200,
        refs: body.refs || [],
      };
      board.cards.push(card);
      saveData(data);
      return json(res, 201, card);
    }

    // PUT /api/brainstorm/boards/:bid/cards/:cid
    const bsCardMatch = path.match(/^\/api\/brainstorm\/boards\/([^/]+)\/cards\/([^/]+)$/);
    if (bsCardMatch && req.method === 'PUT') {
      if (!data.brainstorm) data.brainstorm = { boards: [] };
      const board = data.brainstorm.boards.find(b => b.id === bsCardMatch[1]);
      if (!board) return json(res, 404, { error: 'Board not found' });
      const card = board.cards.find(c => c.id === bsCardMatch[2]);
      if (!card) return json(res, 404, { error: 'Card not found' });
      const body = await readBody(req);
      for (const key of ['title','summary','detail','source','color','tags','icon','x','y','refs']) {
        if (body[key] !== undefined) card[key] = body[key];
      }
      saveData(data);
      return json(res, 200, card);
    }

    // DELETE /api/brainstorm/boards/:bid/cards/:cid
    if (bsCardMatch && req.method === 'DELETE') {
      if (!data.brainstorm) data.brainstorm = { boards: [] };
      const board = data.brainstorm.boards.find(b => b.id === bsCardMatch[1]);
      if (!board) return json(res, 404, { error: 'Board not found' });
      const idx = board.cards.findIndex(c => c.id === bsCardMatch[2]);
      if (idx === -1) return json(res, 404, { error: 'Card not found' });
      board.cards.splice(idx, 1);
      board.connections = board.connections.filter(c => c.from !== bsCardMatch[2] && c.to !== bsCardMatch[2]);
      saveData(data);
      return json(res, 200, { ok: true });
    }

    // POST /api/brainstorm/boards/:id/connections
    const bsConnsMatch = path.match(/^\/api\/brainstorm\/boards\/([^/]+)\/connections$/);
    if (bsConnsMatch && req.method === 'POST') {
      if (!data.brainstorm) data.brainstorm = { boards: [] };
      const board = data.brainstorm.boards.find(b => b.id === bsConnsMatch[1]);
      if (!board) return json(res, 404, { error: 'Board not found' });
      const body = await readBody(req);
      const conn = {
        id: 'cx-' + crypto.randomUUID().slice(0,8),
        from: body.from,
        to: body.to,
        label: body.label || '',
        detail: body.detail || '',
      };
      board.connections.push(conn);
      saveData(data);
      return json(res, 201, conn);
    }

    // PUT /api/brainstorm/boards/:bid/connections/:cid
    const bsConnMatch = path.match(/^\/api\/brainstorm\/boards\/([^/]+)\/connections\/([^/]+)$/);
    if (bsConnMatch && req.method === 'PUT') {
      if (!data.brainstorm) data.brainstorm = { boards: [] };
      const board = data.brainstorm.boards.find(b => b.id === bsConnMatch[1]);
      if (!board) return json(res, 404, { error: 'Board not found' });
      const conn = board.connections.find(c => c.id === bsConnMatch[2]);
      if (!conn) return json(res, 404, { error: 'Conn not found' });
      const body = await readBody(req);
      if (body.label !== undefined) conn.label = body.label;
      if (body.detail !== undefined) conn.detail = body.detail;
      saveData(data);
      return json(res, 200, conn);
    }

    // DELETE /api/brainstorm/boards/:bid/connections/:cid
    if (bsConnMatch && req.method === 'DELETE') {
      if (!data.brainstorm) data.brainstorm = { boards: [] };
      const board = data.brainstorm.boards.find(b => b.id === bsConnMatch[1]);
      if (!board) return json(res, 404, { error: 'Board not found' });
      const idx = board.connections.findIndex(c => c.id === bsConnMatch[2]);
      if (idx === -1) return json(res, 404, { error: 'Conn not found' });
      board.connections.splice(idx, 1);
      saveData(data);
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: 'Unknown API route' });
  }

  // --- Static files ---
  if (path === '/' || path === '') {
    return serveStatic(res, join(WEB_DIR, 'index.html'));
  }
  if (path === '/kanban') {
    return serveStatic(res, join(WEB_DIR, 'kanban.html'));
  }
  if (path === '/projects') {
    return serveStatic(res, join(WEB_DIR, 'projects.html'));
  }
  if (path === '/done') {
    return serveStatic(res, join(WEB_DIR, 'done.html'));
  }
  if (path === '/ecosystem') {
    return serveStatic(res, join(WEB_DIR, 'ecosystem.html'));
  }
  if (path === '/brainstorm' || path.startsWith('/brainstorm/')) {
    return serveStatic(res, join(WEB_DIR, 'brainstorm.html'));
  }

  const served = serveStatic(res, join(WEB_DIR, path));
  if (!served) {
    res.writeHead(404); res.end('Not found');
  }
}
