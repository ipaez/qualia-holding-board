// Shared utilities for Qualia Holding Board v2
const API = 'api';

// --- Branding / Theming ---
let _brandingTheme = null;

async function loadBranding() {
  try {
    const r = await fetch(`${API}/branding`);
    const theme = await r.json();
    if (!theme) return;
    _brandingTheme = theme;
    applyBranding(theme);
  } catch(e) { /* no branding, use defaults */ }
}

function applyBranding(t) {
  const root = document.documentElement.style;
  if (t.colors) {
    const map = {
      bgDeep: '--bg-deep', bgBase: '--bg-base', bgCard: '--bg-card',
      bgCardHover: '--bg-card-hover', bgElevated: '--bg-elevated',
      border: '--border', borderHover: '--border-hover',
      textPrimary: '--text-primary', textSecondary: '--text-secondary',
      textTertiary: '--text-tertiary', accent: '--gold',
      accentDim: '--gold-dim', accentGlow: '--gold-glow',
      green: '--green', red: '--red', cyan: '--cyan',
    };
    for (const [k, v] of Object.entries(map)) {
      if (t.colors[k]) root.setProperty(v, t.colors[k]);
    }
  }
  if (t.fonts) {
    if (t.fonts.heading) root.setProperty('--font-heading', t.fonts.heading);
    if (t.fonts.body) root.setProperty('--font-body', t.fonts.body);
    if (t.fonts.mono) root.setProperty('--font-mono', t.fonts.mono);
    if (t.fonts.googleImport) {
      const existing = document.querySelector('link[data-branding-font]');
      if (!existing) {
        const link = document.createElement('link');
        link.rel = 'stylesheet'; link.href = t.fonts.googleImport;
        link.setAttribute('data-branding-font', '1');
        document.head.appendChild(link);
      }
    }
  }
  if (t.backgroundGradient) {
    document.body.style.backgroundImage = t.backgroundGradient;
  }
  // Update sidebar wordmark
  if (t.brand) {
    const wm = document.querySelector('.wordmark');
    if (wm) {
      const q = wm.querySelector('.brand-q');
      const b = wm.querySelector('.brand-b');
      if (q && t.brand.wordmarkPrimary) q.textContent = t.brand.wordmarkPrimary;
      if (b && t.brand.wordmarkSecondary) b.textContent = t.brand.wordmarkSecondary;
    }
    if (t.brand.version) {
      const sv = document.querySelector('.sidebar-version');
      if (sv) sv.textContent = t.brand.version;
    }
  }
  // Update logo
  if (t.logo) {
    const logoSvg = document.querySelector('.logo-svg');
    if (logoSvg && t.logo.type === 'svg-inline' && t.logo.svg) {
      let svg = t.logo.svg;
      svg = svg.replace(/\{\{accent\}\}/g, t.colors?.accent || '#c9a94e');
      svg = svg.replace(/\{\{accentDim\}\}/g, t.colors?.accentDim || 'rgba(201,169,78,0.15)');
      logoSvg.innerHTML = svg;
    } else if (t.logo.type === 'image' && t.logo.src) {
      const logoSvg = document.querySelector('.logo-svg');
      if (logoSvg) {
        const img = document.createElement('img');
        img.src = t.logo.src; img.width = 32; img.height = 32;
        img.style.borderRadius = '6px';
        logoSvg.replaceWith(img);
      }
    }
  }
  // Page title
  if (t.brand?.name) {
    document.title = document.title.replace(/Qualia Holding Board/, t.brand.name);
  }
}

const PROJECT_COLORS = {
  'Prisma Pipeline': '#3498db',
  'Prisma Engine': '#9b59b6',
  'InfraQualia': '#1abc9c',
  'Visual Mapping WTW': '#e67e22',
  'Qualia Wealth': '#c9a94e',
  'Qualia Academy': '#e74c3c',
  'Infra/Core': '#95a5a6',
  'Growth/Monetizacion': '#2ecc71',
};

function getProjectColor(name) {
  return PROJECT_COLORS[name] || '#666';
}

function projClass(p) {
  return 'proj-' + p.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let _tasks = [], _projects = [], _agents = [];

async function loadData() {
  [_tasks, _projects, _agents] = await Promise.all([
    fetch(`${API}/tasks`).then(r => r.json()),
    fetch(`${API}/projects`).then(r => r.json()),
    fetch(`${API}/agents`).then(r => r.json()),
  ]);
  return { tasks: _tasks, projects: _projects, agents: _agents };
}

// Modal
function populateModalSelects(projects, agents) {
  const fp = document.getElementById('fProject');
  const fa = document.getElementById('fAgent');
  if (fp) { fp.innerHTML = ''; projects.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; fp.appendChild(o); }); }
  if (fa) { fa.innerHTML = ''; agents.forEach(a => { const o = document.createElement('option'); o.value = a; o.textContent = a; fa.appendChild(o); }); }
}

function openEditModal(task) {
  document.getElementById('modalTitle').textContent = 'Editar tarea';
  document.getElementById('taskId').value = task.id;
  document.getElementById('fTitle').value = task.title;
  document.getElementById('fDesc').value = task.description || '';
  document.getElementById('fProject').value = task.project;
  // Show agent as read-only info
  document.getElementById('fAgent').style.display = 'none';
  document.getElementById('fAgent').value = task.agent;
  const info = document.getElementById('fAgentInfo');
  info.style.display = 'block';
  info.textContent = '@' + task.agent;
  document.getElementById('fPriority').value = task.priority;
  document.getElementById('fType').value = task.type;
  document.getElementById('fStatus').value = task.status;
  document.getElementById('fDeadline').value = task.deadline || '';
  document.getElementById('fBlockedBy').value = task.blockedBy || '';
  document.getElementById('fNotes').value = task.notes || '';
  document.getElementById('btnDelete').style.display = 'block';
  document.getElementById('modal').classList.add('active');
}

function openCreateModal(projects) {
  document.getElementById('modalTitle').textContent = 'Nueva tarea';
  document.getElementById('taskId').value = '';
  document.getElementById('fTitle').value = '';
  document.getElementById('fDesc').value = '';
  document.getElementById('fProject').value = projects[0] || '';
  // Show agent selector for new tasks
  document.getElementById('fAgent').style.display = '';
  document.getElementById('fAgent').value = 'main';
  document.getElementById('fAgentInfo').style.display = 'none';
  document.getElementById('fPriority').value = 'medium';
  document.getElementById('fType').value = 'feature';
  document.getElementById('fStatus').value = 'idea';
  document.getElementById('fDeadline').value = '';
  document.getElementById('fBlockedBy').value = '';
  document.getElementById('fNotes').value = '';
  document.getElementById('btnDelete').style.display = 'none';
  document.getElementById('modal').classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

async function saveTask(onDone) {
  const id = document.getElementById('taskId').value;
  const body = {
    title: document.getElementById('fTitle').value,
    description: document.getElementById('fDesc').value,
    project: document.getElementById('fProject').value,
    agent: document.getElementById('fAgent').value,
    priority: document.getElementById('fPriority').value,
    type: document.getElementById('fType').value,
    status: document.getElementById('fStatus').value,
    deadline: document.getElementById('fDeadline').value || null,
    blockedBy: document.getElementById('fBlockedBy').value,
    notes: document.getElementById('fNotes').value,
  };
  if (id) {
    await fetch(`${API}/tasks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } else {
    await fetch(`${API}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  closeModal();
  if (onDone) onDone();
}

async function deleteTask(onDone) {
  const id = document.getElementById('taskId').value;
  if (!id || !confirm('Eliminar esta tarea?')) return;
  await fetch(`${API}/tasks/${id}`, { method: 'DELETE' });
  closeModal();
  if (onDone) onDone();
}

function initModalListeners() {
  document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

function getModalHTML() {
  return `
<div class="modal-overlay" id="modal">
  <div class="modal">
    <h2 id="modalTitle">Nueva tarea</h2>
    <input type="hidden" id="taskId">
    <label>Titulo</label>
    <input type="text" id="fTitle">
    <label>Descripcion</label>
    <textarea id="fDesc"></textarea>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div><label>Proyecto</label><select id="fProject"></select></div>
      <div><label>Agente</label><div id="fAgentInfo" class="agent-info" style="display:none"></div><select id="fAgent"></select></div>
      <div><label>Prioridad</label>
        <select id="fPriority"><option value="low">Baja</option><option value="medium" selected>Media</option><option value="high">Alta</option></select>
      </div>
      <div><label>Tipo</label>
        <select id="fType"><option value="feature">Feature</option><option value="fix">Fix</option><option value="infra">Infra</option><option value="idea">Idea</option></select>
      </div>
      <div><label>Status</label>
        <select id="fStatus"><option value="idea">Idea</option><option value="ready">Ready</option><option value="in-progress">En progreso</option><option value="blocked">Bloqueada</option><option value="done">Done</option></select>
      </div>
      <div><label>Deadline</label><input type="date" id="fDeadline"></div>
    </div>
    <label>Bloqueada por</label>
    <input type="text" id="fBlockedBy">
    <label>Notas</label>
    <textarea id="fNotes"></textarea>
    <div class="modal-actions">
      <button class="btn-delete" id="btnDelete" style="display:none">Eliminar</button>
      <button class="btn-cancel">Cancelar</button>
      <button class="btn-save">Guardar</button>
    </div>
  </div>
</div>`;
}

function getNavHTML(active) {
  const icons = {
    cockpit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
    kanban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="15" rx="1"/></svg>',
    backlog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>',
    projects: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    ecosystem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="4" cy="6" r="2"/><circle cx="20" cy="6" r="2"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="18" r="2"/><line x1="6" y1="6" x2="9.5" y2="10"/><line x1="18" y1="6" x2="14.5" y2="10"/><line x1="6" y1="18" x2="9.5" y2="14"/><line x1="18" y1="18" x2="14.5" y2="14"/></svg>',
    brainstorm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 1 5 11.9V16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-2.1A7 7 0 0 1 12 2z"/><line x1="9" y1="21" x2="15" y2="21"/><line x1="10" y1="24" x2="14" y2="24"/></svg>',
    done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  };
  const sections = [
    { label: 'General', items: [
      { id: 'cockpit', label: 'Cockpit', href: './' },
      { id: 'kanban', label: 'Kanban', href: 'kanban' },
      { id: 'backlog', label: 'Backlog', href: 'backlog' },
    ]},
    { label: 'Proyectos', items: [
      { id: 'projects', label: 'Proyectos', href: 'projects' },
      { id: 'ecosystem', label: 'Ecosistema', href: 'ecosystem' },
      { id: 'brainstorm', label: 'Brainstorm', href: 'brainstorm' },
    ]},
    { label: 'Historial', items: [
      { id: 'done', label: 'Completadas', href: 'done' },
    ]},
  ];
  return `
<aside class="sidebar" id="qb-sidebar">
  <div class="sidebar-logo" onclick="toggleSidebar()">
    <svg class="logo-svg" width="32" height="32" viewBox="0 0 32 32" fill="none">
      <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="none" stroke="var(--gold)" stroke-width="2"/>
      <polygon points="16,7 23,11 23,21 16,25 9,21 9,11" fill="var(--gold-dim)" stroke="var(--gold)" stroke-width="1"/>
    </svg>
    <div class="wordmark"><span class="brand-q">Qualia</span> <span class="brand-b">Holding</span></div>
  </div>
  <div class="sidebar-new-task">
    <button class="btn-add-sidebar" onclick="openCreateModal(_projects)">+ Nueva tarea</button>
  </div>
  <nav class="sidebar-nav">
    ${sections.map(s => `
      <div class="nav-section">${s.label}</div>
      ${s.items.map(t => `<a href="${t.href}" class="nav-item${t.id === active ? ' active' : ''}" data-tip="${t.label}">${icons[t.id]}<span>${t.label}</span></a>`).join('')}
    `).join('')}
  </nav>
  <div class="sidebar-toggle" onclick="toggleSidebar()">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
    <span>Colapsar</span>
  </div>
  <div class="sidebar-version">v1.4.0</div>
</aside>
<div class="mobile-hamburger" id="mobileHamburger" onclick="toggleMobileSidebar()">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
</div>
<div class="sidebar-backdrop" id="sidebarBackdrop" onclick="toggleMobileSidebar()"></div>`;
}

function initSidebar() {
  const sidebar = document.getElementById('qb-sidebar');
  if (!sidebar) return;
  const stored = localStorage.getItem('qb_sidebar');
  if (stored === 'collapsed') sidebar.classList.add('collapsed');
  loadBranding();
}

function toggleSidebar() {
  const sidebar = document.getElementById('qb-sidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('collapsed');
  localStorage.setItem('qb_sidebar', sidebar.classList.contains('collapsed') ? 'collapsed' : 'open');
  window.dispatchEvent(new Event('resize'));
}

function toggleMobileSidebar() {
  const sidebar = document.getElementById('qb-sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar) return;
  sidebar.classList.toggle('mobile-open');
  backdrop.classList.toggle('active');
}

function getSharedCSS() {
  return `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Figtree:wght@300;400;500;600;700&display=swap');

:root {
  --bg-deep: #050508;
  --bg-base: #0a0b0f;
  --bg-card: #111318;
  --bg-card-hover: #161820;
  --bg-elevated: #1a1c24;
  --border: rgba(255,255,255,0.06);
  --border-hover: rgba(255,255,255,0.12);
  --text-primary: #f0f0f2;
  --text-secondary: #8a8d9b;
  --text-tertiary: #555868;
  --gold: #c9a94e;
  --gold-dim: rgba(201,169,78,0.15);
  --gold-glow: rgba(201,169,78,0.08);
  --green: #34d399;
  --red: #f87171;
  --cyan: #06d6d6;
  --radius: 14px;
  --radius-sm: 8px;
  --radius-pill: 100px;
  --sidebar-w: 240px;
  --sidebar-collapsed: 64px;
  /* compat aliases */
  --bg: var(--bg-base);
  --card: var(--bg-card);
  --card-hover: var(--bg-card-hover);
  --accent: var(--gold);
  --accent-dim: var(--gold-dim);
  --text: var(--text-primary);
  --text-dim: var(--text-secondary);
  --text-muted: var(--text-tertiary);
  --danger: var(--red);
  --success: var(--green);
  --warning: #f59e0b;
  --high: var(--red);
  --medium: var(--gold);
  --low: var(--text-tertiary);
  --font-heading: 'Outfit', sans-serif;
  --font-body: 'Figtree', sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', monospace;
  /* legacy aliases */
  --font: var(--font-body);
  --mono: var(--font-mono);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: var(--bg-base);
  background-image: radial-gradient(ellipse 80% 50% at 50% -20%, rgba(201,169,78,0.03), transparent);
  color: var(--text-primary);
  font-family: var(--font-body);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
::selection { background: var(--gold-dim); color: var(--gold); }
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.13); }

/* ── Sidebar ── */
.sidebar {
  position: fixed; top: 0; left: 0; bottom: 0;
  width: var(--sidebar-w);
  background: var(--bg-card);
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column;
  transition: width 0.25s cubic-bezier(0.4,0,0.2,1);
  z-index: 100;
  overflow: hidden;
}
.sidebar.collapsed { width: var(--sidebar-collapsed); }
.sidebar-logo {
  padding: 20px 16px 16px;
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 12px;
  cursor: pointer;
  min-height: 69px;
  overflow: hidden;
  white-space: nowrap;
}
.logo-svg { flex-shrink: 0; transition: all 0.25s; }
.wordmark {
  font-family: var(--font-heading); font-size: 1rem; font-weight: 600; letter-spacing: 1px;
  opacity: 1; transition: opacity 0.2s 0.05s;
  overflow: hidden; white-space: nowrap; display: flex; gap: 5px;
}
.brand-q { color: var(--gold); font-weight: 800; }
.brand-b { color: #fff; font-weight: 300; }
.sidebar.collapsed .wordmark { opacity: 0; transition-delay: 0s; }

.sidebar-new-task { padding: 12px 10px 4px; }
.btn-add-sidebar {
  width: 100%; background: var(--gold); color: var(--bg-deep); border: none;
  padding: 9px 14px; border-radius: var(--radius-sm);
  cursor: pointer; font-family: var(--font-body);
  font-weight: 600; font-size: 0.82rem;
  white-space: nowrap; transition: all .2s; letter-spacing: 0.2px;
  overflow: hidden;
}
.btn-add-sidebar:hover { background: #d4b45a; }
.sidebar.collapsed .btn-add-sidebar { font-size: 0; padding: 9px 0; }
.sidebar.collapsed .btn-add-sidebar::before { content: '+'; font-size: 1.1rem; font-weight: 700; }

.sidebar-nav { flex: 1; padding: 12px 8px; overflow-y: auto; }
.nav-section {
  font-family: var(--font-heading); font-size: 0.6rem; font-weight: 700;
  letter-spacing: 3px; text-transform: uppercase; color: var(--text-tertiary);
  padding: 16px 12px 8px; white-space: nowrap; overflow: hidden;
  transition: opacity 0.15s, max-height 0.25s, padding 0.25s;
  max-height: 40px;
}
.sidebar.collapsed .nav-section { opacity: 0; max-height: 0; padding: 0 12px; overflow: hidden; }

.nav-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; border-radius: 10px; cursor: pointer;
  transition: background 0.15s, color 0.15s; white-space: nowrap; overflow: hidden;
  color: var(--text-tertiary); font-size: 0.88rem; font-weight: 500;
  text-decoration: none; position: relative;
}
.nav-item:hover { background: var(--bg-elevated); color: var(--text-primary); text-decoration: none; }
.nav-item.active { background: var(--gold-dim); color: var(--gold); }
.nav-item svg { width: 20px; height: 20px; flex-shrink: 0; }
.nav-item span { transition: opacity 0.15s 0.05s; display: inline-block; }
.sidebar.collapsed .nav-item span { opacity: 0; transition-delay: 0s; }

/* Tooltip on collapsed */
.sidebar.collapsed .nav-item::after {
  content: attr(data-tip);
  position: absolute; left: calc(100% + 12px); top: 50%; transform: translateY(-50%);
  background: var(--bg-elevated); color: var(--text-primary); padding: 6px 12px;
  border-radius: 6px; font-size: 0.75rem; white-space: nowrap;
  opacity: 0; pointer-events: none; transition: opacity 0.15s;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  z-index: 200;
}
.sidebar.collapsed .nav-item:hover::after { opacity: 1; }

.sidebar-toggle {
  padding: 14px; border-top: 1px solid var(--border);
  display: flex; align-items: center; gap: 10px;
  cursor: pointer; color: var(--text-tertiary); font-size: 0.8rem;
  transition: background 0.15s, color 0.15s;
  padding-left: 18px;
}
.sidebar-toggle:hover { color: var(--text-primary); background: var(--bg-elevated); }
.sidebar-toggle svg { width: 18px; height: 18px; flex-shrink: 0; transition: transform 0.25s; }
.sidebar.collapsed .sidebar-toggle svg { transform: rotate(180deg); }
.sidebar-toggle span { transition: opacity 0.15s 0.05s; white-space: nowrap; }
.sidebar.collapsed .sidebar-toggle span { opacity: 0; transition-delay: 0s; }
.sidebar-version { padding: 8px 20px 12px; font-family: var(--font-mono); font-size: 0.62rem; color: var(--text-tertiary); opacity: 0.4; transition: opacity 0.15s; }
.sidebar.collapsed .sidebar-version { opacity: 0; }

/* Main content offset */
.qb-main {
  margin-left: var(--sidebar-w);
  transition: margin-left 0.25s cubic-bezier(0.4,0,0.2,1);
  min-height: 100vh;
}
.sidebar.collapsed ~ .sidebar-backdrop ~ .qb-main,
.sidebar.collapsed ~ .qb-main { margin-left: var(--sidebar-collapsed); }

/* Mobile hamburger */
.mobile-hamburger {
  display: none; position: fixed; top: 14px; left: 14px; z-index: 90;
  width: 40px; height: 40px; border-radius: 10px;
  background: var(--bg-card); border: 1px solid var(--border);
  cursor: pointer; align-items: center; justify-content: center;
  color: var(--text-secondary);
}
.mobile-hamburger svg { width: 20px; height: 20px; }
.sidebar-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 99; }
.sidebar-backdrop.active { display: block; }

/* ── Project Colors ── */
.proj-prisma-pipeline { border-left-color: #3498db !important; }
.proj-prisma-pipeline .badge-project { background: rgba(52,152,219,.1); color: #3498db; }
.proj-prisma-engine { border-left-color: #9b59b6 !important; }
.proj-prisma-engine .badge-project { background: rgba(155,89,182,.1); color: #9b59b6; }
.proj-infraqualia { border-left-color: #1abc9c !important; }
.proj-infraqualia .badge-project { background: rgba(26,188,156,.1); color: #1abc9c; }
.proj-visual-mapping-wtw { border-left-color: #e67e22 !important; }
.proj-visual-mapping-wtw .badge-project { background: rgba(230,126,34,.1); color: #e67e22; }
.proj-qualia-wealth { border-left-color: #c9a94e !important; }
.proj-qualia-wealth .badge-project { background: rgba(201,169,78,.1); color: #c9a94e; }
.proj-qualia-academy { border-left-color: #e74c3c !important; }
.proj-qualia-academy .badge-project { background: rgba(231,76,60,.1); color: #e74c3c; }
.proj-infra-core { border-left-color: #95a5a6 !important; }
.proj-infra-core .badge-project { background: rgba(149,165,166,.1); color: #95a5a6; }
.proj-growth-monetizacion { border-left-color: #2ecc71 !important; }
.proj-growth-monetizacion .badge-project { background: rgba(46,204,113,.1); color: #2ecc71; }

/* ── Badges & Pills ── */
.badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 12px; border-radius: 20px;
  font-family: var(--font-body); font-size: 0.75rem; font-weight: 600;
  letter-spacing: 0.2px;
}
.badge-project { background: rgba(255,255,255,.05); }
.priority-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.priority-dot.high { background: var(--red); box-shadow: 0 0 6px rgba(248,113,113,0.4); }
.priority-dot.medium { background: var(--gold); }
.priority-dot.low { background: var(--text-tertiary); }

/* ── Modal ── */
.modal-overlay {
  display: none; position: fixed; inset: 0;
  background: rgba(5,5,8,0.8); z-index: 100;
  justify-content: center; align-items: center;
  backdrop-filter: blur(16px) saturate(120%);
  -webkit-backdrop-filter: blur(16px) saturate(120%);
}
.modal-overlay.active { display: flex; }
.modal {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); width: 90%; max-width: 520px;
  max-height: 90vh; overflow-y: auto; padding: 28px;
}
.modal h2 {
  font-family: var(--font-heading); font-size: 1.1rem;
  margin-bottom: 20px; color: var(--gold); font-weight: 700;
  letter-spacing: -0.3px;
}
.modal label {
  display: block;
  font-family: var(--font-heading); font-size: 0.65rem;
  color: var(--text-tertiary); margin: 16px 0 6px;
  text-transform: uppercase; letter-spacing: 2px; font-weight: 700;
}
.modal input, .modal select, .modal textarea {
  width: 100%; background: var(--bg-base); color: var(--text-primary);
  border: 1px solid var(--border); padding: 10px 12px;
  border-radius: var(--radius-sm); font-family: var(--font-body);
  font-size: 0.875rem; transition: border-color .2s;
}
.modal textarea { min-height: 60px; resize: vertical; }
.modal input:focus, .modal select:focus, .modal textarea:focus { outline: none; border-color: var(--gold); }
.modal select { cursor: pointer; }
.modal-actions { display: flex; gap: 10px; margin-top: 24px; justify-content: flex-end; }
.modal-actions button {
  padding: 9px 20px; border-radius: var(--radius-sm); border: none;
  cursor: pointer; font-family: var(--font-body);
  font-weight: 600; font-size: 0.85rem; transition: all .2s;
}
.btn-save { background: var(--gold); color: var(--bg-deep); }
.btn-save:hover { background: #d4b45a; }
.btn-cancel { background: rgba(255,255,255,0.06); color: var(--text-secondary); }
.btn-cancel:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); }
.btn-delete { background: rgba(248,113,113,0.1); color: var(--red); margin-right: auto; }
.btn-delete:hover { background: rgba(248,113,113,0.2); }

/* Agent info badge (read-only in edit modal) */
.agent-info {
  background: var(--bg-elevated); color: var(--gold); border: 1px solid var(--border);
  padding: 10px 14px; border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: 0.85rem; font-weight: 600;
}

/* Undo toast */
.undo-toast {
  position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
  background: var(--bg-elevated); border: 1px solid var(--border);
  color: var(--text-primary); padding: 12px 20px; border-radius: 10px;
  font-family: var(--font-body); font-size: 0.88rem;
  display: flex; align-items: center; gap: 14px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5); z-index: 300;
  animation: toastIn 0.25s ease;
}
.undo-toast.hiding { animation: toastOut 0.2s ease forwards; }
@keyframes toastIn { from { opacity: 0; transform: translateX(-50%) translateY(20px); } }
@keyframes toastOut { to { opacity: 0; transform: translateX(-50%) translateY(20px); } }
.undo-toast button {
  background: var(--gold); color: var(--bg-deep); border: none;
  padding: 6px 16px; border-radius: 6px; cursor: pointer;
  font-family: var(--font-body); font-weight: 600; font-size: 0.82rem;
}
.undo-toast button:hover { background: #d4b45a; }

/* ── Responsive Sidebar ── */
@media (max-width: 768px) {
  .sidebar { width: var(--sidebar-w); transform: translateX(-100%); transition: transform 0.25s cubic-bezier(0.4,0,0.2,1); }
  .sidebar.collapsed { width: var(--sidebar-w); transform: translateX(-100%); }
  .sidebar.mobile-open { transform: translateX(0); }
  .qb-main { margin-left: 0 !important; padding-top: 56px; }
  .mobile-hamburger { display: flex; }
}
`;
}
