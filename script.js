/* ============================================
   NODEFLOW — Complete App Logic
   Infinite Canvas, Nodes, Connections, Draw
   ============================================ */

// ===== STATE =====
const state = {
  nodes: [],
  connections: [],
  drawings: [],
  selectedNodes: new Set(),
  tool: 'select',
  zoom: 1,
  panX: 0,
  panY: 0,
  dragging: null,
  resizing: null,
  connecting: null,
  isPanning: false,
  panStart: null,
  isSpaceDown: false,
  selectionBox: null,
  undoStack: [],
  redoStack: [],
  nodeCounter: 0,
  connCounter: 0,
  clipboard: null,
  contextNode: null,
  rightClickPos: { x: 0, y: 0 }
};

// ===== ELEMENTS =====
const canvas = document.getElementById('canvas');
const viewport = document.getElementById('viewport');
const wrapper = document.getElementById('canvas-wrapper');
const connCanvas = document.getElementById('connection-canvas');
const drawCanvas = document.getElementById('draw-canvas');
const ctx = connCanvas.getContext('2d');
const dctx = drawCanvas.getContext('2d');

// ===== INIT =====
function init() {
  resizeCanvases();
  updateTransform();
  setupEvents();
  setupTopbar();
  setupSidebar();
  setupContextMenus();
  setupDrawing();
  setupKeyboard();
  loadFromStorage();
  renderConnections();
  updateStatus();
}

// ===== RESIZE CANVASES =====
function resizeCanvases() {
  const r = wrapper.getBoundingClientRect();
  connCanvas.width = drawCanvas.width = r.width;
  connCanvas.height = drawCanvas.height = r.height;
}
window.addEventListener('resize', () => { resizeCanvases(); renderConnections(); });

// ===== TRANSFORM =====
function updateTransform() {
  canvas.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  document.getElementById('zoom-label').textContent = Math.round(state.zoom * 100) + '%';
  renderConnections();
}

function screenToCanvas(sx, sy) {
  const r = wrapper.getBoundingClientRect();
  return {
    x: (sx - r.left - state.panX) / state.zoom,
    y: (sy - r.top - state.panY) / state.zoom
  };
}

function canvasToScreen(cx, cy) {
  const r = wrapper.getBoundingClientRect();
  return {
    x: cx * state.zoom + state.panX + r.left,
    y: cy * state.zoom + state.panY + r.top
  };
}

// ===== NODE CREATION =====
function createNode(type, x, y, data = {}) {
  saveUndo();
  const id = 'node_' + (++state.nodeCounter);
  const defaults = {
    note: { w: 260, h: null, title: 'Note', color: '#0e0e0e' },
    todo: { w: 240, h: null, title: 'Todo List', color: '#0e0e0e' },
    sticky: { w: 220, h: null, title: 'Sticky', color: '#1f1c0a' },
    image: { w: 260, h: null, title: 'Image', color: '#0e0e0e' },
    embed: { w: 300, h: null, title: 'Embed', color: '#0e0e0e' },
    heading: { w: 300, h: null, title: '', color: 'transparent' }
  };
  const def = defaults[type] || defaults.note;
  const node = {
    id, type,
    x: x - (def.w / 2),
    y: y - 30,
    w: data.w || def.w,
    pinned: false,
    color: data.color || def.color,
    title: data.title !== undefined ? data.title : def.title,
    ...data
  };
  state.nodes.push(node);
  renderNode(node);
  updateStatus();
  autoSave();
  return node;
}

function renderNode(node) {
  let el = document.getElementById(node.id);
  if (!el) {
    el = document.createElement('div');
    el.id = node.id;
    el.className = `node node-${node.type}`;
    canvas.appendChild(el);
  }

  el.style.left = node.x + 'px';
  el.style.top = node.y + 'px';
  el.style.width = node.w + 'px';
  if (node.color && node.color !== 'transparent') el.style.background = node.color;
  if (node.pinned) el.classList.add('pinned'); else el.classList.remove('pinned');

  el.innerHTML = buildNodeHTML(node);
  attachNodeEvents(el, node);
}

function buildNodeHTML(node) {
  const dots = `
    <div class="connect-dot top" data-dir="top"></div>
    <div class="connect-dot bottom" data-dir="bottom"></div>
    <div class="connect-dot left" data-dir="left"></div>
    <div class="connect-dot right" data-dir="right"></div>
  `;
  const resize = `<div class="resize-handle"></div>`;

  if (node.type === 'heading') {
    return `
      ${dots}
      <div class="node-header" style="border:none;padding:4px 8px">
        <div class="node-actions">
          <button class="node-action-btn danger" data-action="delete">✕</button>
        </div>
      </div>
      <input class="heading-text" placeholder="Heading..." value="${escHtml(node.title || '')}" data-field="title" spellcheck="false">
      ${resize}
    `;
  }

  const icons = {
    note: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="13" y2="14"/></svg>`,
    todo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    sticky: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8z"/></svg>`,
    image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    embed: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`
  };

  const header = `
    <div class="node-header">
      <div class="node-icon">${icons[node.type] || icons.note}</div>
      <input class="node-title-input" value="${escHtml(node.title || '')}" data-field="title" spellcheck="false" placeholder="${node.type.charAt(0).toUpperCase() + node.type.slice(1)}">
      <div class="node-actions">
        <button class="node-action-btn" data-action="pin" title="Pin">📌</button>
        <button class="node-action-btn danger" data-action="delete" title="Delete">✕</button>
      </div>
    </div>
  `;

  let body = '';

  if (node.type === 'note') {
    body = `
      <div class="text-toolbar">
        <button class="fmt-btn" data-cmd="bold" title="Bold (Ctrl+B)"><b>B</b></button>
        <button class="fmt-btn" data-cmd="italic" title="Italic (Ctrl+I)"><i>I</i></button>
        <button class="fmt-btn" data-cmd="underline" title="Underline (Ctrl+U)"><u>U</u></button>
        <button class="fmt-btn" data-cmd="strikeThrough" title="Strike"><s>S</s></button>
        <span class="fmt-sep"></span>
        <button class="fmt-btn" data-cmd="insertUnorderedList" title="Bullet List">≡</button>
        <button class="fmt-btn" data-cmd="insertOrderedList" title="Numbered List">№</button>
        <span class="fmt-sep"></span>
        <button class="fmt-btn" data-cmd="justifyLeft" title="Left">◁</button>
        <button class="fmt-btn" data-cmd="justifyCenter" title="Center">▷◁</button>
        <button class="fmt-btn" data-cmd="justifyRight" title="Right">▷</button>
      </div>
      <div class="node-body">
        <div class="note-editor" contenteditable="true" data-field="content" spellcheck="false" style="user-select:text">${node.content || '<br>'}</div>
      </div>
    `;
  } else if (node.type === 'todo') {
    const items = node.todos || [];
    const done = items.filter(t => t.done).length;
    const pct = items.length ? Math.round(done / items.length * 100) : 0;
    body = `
      <div class="node-body">
        <div class="todo-progress"><div class="todo-progress-fill" style="width:${pct}%"></div></div>
        <div class="todo-list" id="todo-list-${node.id}">
          ${items.map((t, i) => `
            <div class="todo-item">
              <input type="checkbox" class="todo-checkbox" ${t.done ? 'checked' : ''} data-idx="${i}">
              <textarea class="todo-text ${t.done ? 'done' : ''}" data-idx="${i}" rows="1" spellcheck="false" style="user-select:text">${escHtml(t.text || '')}</textarea>
              <button class="todo-delete" data-idx="${i}">✕</button>
            </div>
          `).join('')}
        </div>
        <button class="todo-add-btn">+ Add item</button>
      </div>
    `;
  } else if (node.type === 'sticky') {
    body = `
      <div class="sticky-color-strip"></div>
      <div class="node-body">
        <textarea class="sticky-body" placeholder="Write anything..." data-field="content" spellcheck="false" style="user-select:text">${node.content || ''}</textarea>
      </div>
    `;
  } else if (node.type === 'image') {
    body = `
      <div class="node-body">
        ${node.imageData ? `
          <img src="${node.imageData}" alt="${escHtml(node.title)}">
          <input class="image-caption" placeholder="Caption..." value="${escHtml(node.caption || '')}" data-field="caption" style="user-select:text">
        ` : `
          <div class="image-drop-zone" id="drop-${node.id}">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span>Click or paste image</span>
            <span style="font-size:0.65rem;opacity:0.5">PNG, JPG, GIF supported</span>
          </div>
        `}
      </div>
    `;
  } else if (node.type === 'embed') {
    body = `
      <div class="embed-input-area">
        <input class="embed-url-input" placeholder="Paste URL..." value="${escHtml(node.embedUrl || '')}" data-field="embedUrl" style="user-select:text">
        <button class="embed-go-btn" data-action="embed-go">Go</button>
      </div>
      ${node.embedUrl ? `<iframe src="${node.embedUrl}" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>` : ''}
    `;
  }

  return `${dots}${header}${body}${resize}`;
}

function attachNodeEvents(el, node) {
  // Drag
  const header = el.querySelector('.node-header');
  if (header) {
    header.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
      if (state.tool === 'connect') return;
      e.preventDefault();
      e.stopPropagation();
      startDrag(e, node);
    });
  }
  // For heading — drag on the whole el
  if (node.type === 'heading') {
    const htxt = el.querySelector('.heading-text');
    if (htxt) {
      el.addEventListener('mousedown', e => {
        if (e.target === htxt || state.tool === 'connect') return;
        e.preventDefault();
        startDrag(e, node);
      });
    }
  }

  // Select
  el.addEventListener('mousedown', e => {
    if (e.button === 2) return;
    if (e.target.closest('.node-action-btn') || e.target.closest('.connect-dot') || e.target.closest('.resize-handle')) return;
    if (state.tool === 'connect') return;
    if (!e.shiftKey) {
      if (!state.selectedNodes.has(node.id)) {
        clearSelection();
        selectNode(node.id);
      }
    } else {
      if (state.selectedNodes.has(node.id)) deselectNode(node.id);
      else selectNode(node.id);
    }
  });

  // Connect dots
  el.querySelectorAll('.connect-dot').forEach(dot => {
    dot.addEventListener('mousedown', e => {
      e.stopPropagation();
      e.preventDefault();
      if (state.tool !== 'connect' && state.tool !== 'select') return;
      state.connecting = { fromId: node.id, fromDir: dot.dataset.dir };
    });
  });

  // Resize
  const rh = el.querySelector('.resize-handle');
  if (rh) {
    rh.addEventListener('mousedown', e => {
      e.stopPropagation();
      e.preventDefault();
      state.resizing = {
        nodeId: node.id,
        startX: e.clientX,
        startW: node.w
      };
    });
  }

  // Delete / Pin
  el.querySelectorAll('.node-action-btn').forEach(btn => {
    btn.addEventListener('mousedown', e => { e.stopPropagation(); });
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'delete') deleteNode(node.id);
      if (action === 'pin') {
        node.pinned = !node.pinned;
        renderNode(node);
        showToast(node.pinned ? '📌 Pinned' : 'Unpinned');
      }
    });
  });

  // Node-type specific events
  if (node.type === 'note') {
    const editor = el.querySelector('.note-editor');
    if (editor) {
      editor.addEventListener('input', () => {
        node.content = editor.innerHTML;
        autoSave();
      });
      editor.addEventListener('mousedown', e => e.stopPropagation());
      el.querySelectorAll('.fmt-btn').forEach(btn => {
        btn.addEventListener('mousedown', e => e.preventDefault());
        btn.addEventListener('click', e => {
          e.stopPropagation();
          document.execCommand(btn.dataset.cmd, false, null);
          node.content = editor.innerHTML;
          autoSave();
        });
      });
    }
  }

  if (node.type === 'todo') {
    const list = el.querySelector('.todo-list');
    const addBtn = el.querySelector('.todo-add-btn');
    if (!node.todos) node.todos = [];

    if (addBtn) {
      addBtn.addEventListener('click', e => {
        e.stopPropagation();
        addTodoItem(node);
      });
    }
    if (list) {
      list.addEventListener('mousedown', e => e.stopPropagation());
      list.addEventListener('change', e => {
        if (e.target.classList.contains('todo-checkbox')) {
          const idx = +e.target.dataset.idx;
          node.todos[idx].done = e.target.checked;
          renderNode(node);
          autoSave();
        }
      });
      list.addEventListener('input', e => {
        if (e.target.classList.contains('todo-text')) {
          const idx = +e.target.dataset.idx;
          node.todos[idx].text = e.target.value;
          autoTextarea(e.target);
          autoSave();
        }
      });
      list.addEventListener('click', e => {
        if (e.target.classList.contains('todo-delete')) {
          const idx = +e.target.dataset.idx;
          node.todos.splice(idx, 1);
          renderNode(node);
          autoSave();
        }
      });
      list.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.classList.contains('todo-text')) {
          e.preventDefault();
          addTodoItem(node);
        }
      });
    }
  }

  if (node.type === 'sticky') {
    const sb = el.querySelector('.sticky-body');
    if (sb) {
      sb.addEventListener('input', () => {
        node.content = sb.value;
        autoSave();
      });
      sb.addEventListener('mousedown', e => e.stopPropagation());
    }
  }

  if (node.type === 'image') {
    const dz = el.querySelector('.image-drop-zone');
    if (dz) {
      dz.addEventListener('click', e => {
        e.stopPropagation();
        const fi = document.getElementById('image-file-input');
        fi._targetNode = node.id;
        fi.click();
      });
      dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = 'var(--accent)'; });
      dz.addEventListener('dragleave', () => { dz.style.borderColor = ''; });
      dz.addEventListener('drop', e => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) loadImageFile(file, node);
      });
    }
    const cap = el.querySelector('.image-caption');
    if (cap) {
      cap.addEventListener('input', () => { node.caption = cap.value; autoSave(); });
      cap.addEventListener('mousedown', e => e.stopPropagation());
    }
  }

  if (node.type === 'embed') {
    const goBtn = el.querySelector('.embed-go-btn');
    const urlInput = el.querySelector('.embed-url-input');
    if (goBtn && urlInput) {
      goBtn.addEventListener('click', e => {
        e.stopPropagation();
        node.embedUrl = urlInput.value.trim();
        renderNode(node);
        autoSave();
      });
      urlInput.addEventListener('mousedown', e => e.stopPropagation());
      urlInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { node.embedUrl = urlInput.value.trim(); renderNode(node); autoSave(); }
      });
    }
  }

  if (node.type === 'heading') {
    const ht = el.querySelector('.heading-text');
    if (ht) {
      ht.addEventListener('input', () => { node.title = ht.value; autoSave(); });
      ht.addEventListener('mousedown', e => e.stopPropagation());
    }
  }

  // Title for non-heading
  if (node.type !== 'heading') {
    const ti = el.querySelector('.node-title-input');
    if (ti) {
      ti.addEventListener('input', () => { node.title = ti.value; autoSave(); });
      ti.addEventListener('mousedown', e => e.stopPropagation());
    }
  }

  // Right-click on node
  el.addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    state.contextNode = node.id;
    showNodeContextMenu(e.clientX, e.clientY);
  });
}

function addTodoItem(node) {
  if (!node.todos) node.todos = [];
  node.todos.push({ text: '', done: false });
  renderNode(node);
  autoSave();
  setTimeout(() => {
    const el = document.getElementById(node.id);
    const textareas = el.querySelectorAll('.todo-text');
    const last = textareas[textareas.length - 1];
    if (last) { last.focus(); autoTextarea(last); }
  }, 30);
}

function loadImageFile(file, node) {
  const reader = new FileReader();
  reader.onload = e => {
    node.imageData = e.target.result;
    renderNode(node);
    autoSave();
  };
  reader.readAsDataURL(file);
}

// ===== DRAG =====
function startDrag(e, node) {
  if (node.pinned) return;
  const cp = screenToCanvas(e.clientX, e.clientY);
  state.dragging = {
    nodeId: node.id,
    startX: e.clientX,
    startY: e.clientY,
    origX: node.x,
    origY: node.y,
    cpStart: cp
  };
  selectNode(node.id);
}

// ===== SELECTION =====
function selectNode(id) {
  state.selectedNodes.add(id);
  const el = document.getElementById(id);
  if (el) el.classList.add('selected');
}
function deselectNode(id) {
  state.selectedNodes.delete(id);
  const el = document.getElementById(id);
  if (el) el.classList.remove('selected');
}
function clearSelection() {
  state.selectedNodes.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('selected');
  });
  state.selectedNodes.clear();
}

// ===== DELETE NODE =====
function deleteNode(id) {
  saveUndo();
  state.nodes = state.nodes.filter(n => n.id !== id);
  state.connections = state.connections.filter(c => c.fromId !== id && c.toId !== id);
  const el = document.getElementById(id);
  if (el) el.remove();
  state.selectedNodes.delete(id);
  renderConnections();
  updateStatus();
  autoSave();
}

function deleteSelected() {
  if (state.selectedNodes.size === 0) return;
  state.selectedNodes.forEach(id => {
    state.nodes = state.nodes.filter(n => n.id !== id);
    state.connections = state.connections.filter(c => c.fromId !== id && c.toId !== id);
    const el = document.getElementById(id);
    if (el) el.remove();
  });
  state.selectedNodes.clear();
  renderConnections();
  updateStatus();
  autoSave();
}

// ===== CONNECTIONS =====
function renderConnections() {
  const r = wrapper.getBoundingClientRect();
  ctx.clearRect(0, 0, connCanvas.width, connCanvas.height);

  state.connections.forEach(conn => {
    const fromNode = state.nodes.find(n => n.id === conn.fromId);
    const toNode = state.nodes.find(n => n.id === conn.toId);
    if (!fromNode || !toNode) return;

    const fromEl = document.getElementById(conn.fromId);
    const toEl = document.getElementById(conn.toId);
    if (!fromEl || !toEl) return;

    const fp = getDotScreenPos(fromNode, conn.fromDir);
    const tp = getDotScreenPos(toNode, conn.toDir);

    if (!fp || !tp) return;

    ctx.beginPath();
    ctx.strokeStyle = conn.selected ? 'rgba(205,255,0,0.9)' : 'rgba(205,255,0,0.35)';
    ctx.lineWidth = conn.selected ? 2.5 : 1.5;
    ctx.setLineDash([]);

    // Bezier curve
    const dx = tp.x - fp.x, dy = tp.y - fp.y;
    const cx1 = fp.x + dx * 0.5, cy1 = fp.y;
    const cx2 = tp.x - dx * 0.5, cy2 = tp.y;
    ctx.moveTo(fp.x - r.left, fp.y - r.top);
    ctx.bezierCurveTo(cx1 - r.left, cy1 - r.top, cx2 - r.left, cy2 - r.top, tp.x - r.left, tp.y - r.top);
    ctx.stroke();

    // Arrow
    drawArrow(ctx, { x: cx2 - r.left, y: cy2 - r.top }, { x: tp.x - r.left, y: tp.y - r.top }, conn.selected);
  });

  // Preview line while connecting
  if (state.connecting && state.connecting.mouseX !== undefined) {
    const fromNode = state.nodes.find(n => n.id === state.connecting.fromId);
    if (fromNode) {
      const fp = getDotScreenPos(fromNode, state.connecting.fromDir);
      if (fp) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(205,255,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.moveTo(fp.x - r.left, fp.y - r.top);
        ctx.lineTo(state.connecting.mouseX, state.connecting.mouseY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
}

function getDotScreenPos(node, dir) {
  const el = document.getElementById(node.id);
  if (!el) return null;
  const er = el.getBoundingClientRect();
  const positions = {
    top: { x: er.left + er.width / 2, y: er.top },
    bottom: { x: er.left + er.width / 2, y: er.bottom },
    left: { x: er.left, y: er.top + er.height / 2 },
    right: { x: er.right, y: er.top + er.height / 2 }
  };
  return positions[dir] || { x: er.left + er.width / 2, y: er.top + er.height / 2 };
}

function drawArrow(ctx, from, to, selected) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const len = 8;
  ctx.beginPath();
  ctx.strokeStyle = selected ? 'rgba(205,255,0,0.9)' : 'rgba(205,255,0,0.5)';
  ctx.lineWidth = selected ? 2 : 1.5;
  ctx.moveTo(to.x - len * Math.cos(ang - 0.4), to.y - len * Math.sin(ang - 0.4));
  ctx.lineTo(to.x, to.y);
  ctx.lineTo(to.x - len * Math.cos(ang + 0.4), to.y - len * Math.sin(ang + 0.4));
  ctx.stroke();
}

function getNodeUnderMouse(clientX, clientY) {
  const cp = screenToCanvas(clientX, clientY);
  for (let i = state.nodes.length - 1; i >= 0; i--) {
    const n = state.nodes[i];
    const el = document.getElementById(n.id);
    if (!el) continue;
    if (cp.x >= n.x && cp.x <= n.x + el.offsetWidth && cp.y >= n.y && cp.y <= n.y + el.offsetHeight) {
      return n;
    }
  }
  return null;
}

// ===== ZOOM =====
function setZoom(newZoom, cx, cy) {
  const minZ = 0.1, maxZ = 4;
  newZoom = Math.max(minZ, Math.min(maxZ, newZoom));
  const r = wrapper.getBoundingClientRect();
  const px = (cx !== undefined ? cx : r.width / 2) - r.left;
  const py = (cy !== undefined ? cy : r.height / 2) - r.top;
  const prevZoom = state.zoom;
  state.panX = px - (px - state.panX) * (newZoom / prevZoom);
  state.panY = py - (py - state.panY) * (newZoom / prevZoom);
  state.zoom = newZoom;
  updateTransform();
}

// ===== EVENTS =====
function setupEvents() {
  wrapper.addEventListener('wheel', e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(state.zoom * factor, e.clientX, e.clientY);
    } else {
      state.panX -= e.deltaX;
      state.panY -= e.deltaY;
      updateTransform();
    }
  }, { passive: false });

  wrapper.addEventListener('mousedown', e => {
    if (e.button === 2) return;
    const target = e.target;

    // If clicking a connect dot, handled in attachNodeEvents
    if (target.classList.contains('connect-dot')) return;

    if (state.tool === 'pan' || (e.button === 1) || (state.isSpaceDown && e.button === 0)) {
      e.preventDefault();
      state.isPanning = true;
      state.panStart = { x: e.clientX - state.panX, y: e.clientY - state.panY };
      document.body.classList.add('panning');
      return;
    }

    // Canvas click (not on node)
    if (target === canvas || target === viewport || target === wrapper || target.classList.contains('canvas-surface')) {
      clearSelection();
      // Start selection box
      if (state.tool === 'select') {
        const cp = screenToCanvas(e.clientX, e.clientY);
        state.selectionBox = { startX: cp.x, startY: cp.y, x: cp.x, y: cp.y, w: 0, h: 0 };
        const sb = document.createElement('div');
        sb.className = 'selection-box';
        sb.id = 'sel-box';
        canvas.appendChild(sb);
      }
    }
  });

  document.addEventListener('mousemove', e => {
    if (state.isPanning) {
      state.panX = e.clientX - state.panStart.x;
      state.panY = e.clientY - state.panStart.y;
      updateTransform();
      return;
    }

    if (state.dragging) {
      const node = state.nodes.find(n => n.id === state.dragging.nodeId);
      if (node && !node.pinned) {
        const dx = (e.clientX - state.dragging.startX) / state.zoom;
        const dy = (e.clientY - state.dragging.startY) / state.zoom;
        node.x = state.dragging.origX + dx;
        node.y = state.dragging.origY + dy;
        const el = document.getElementById(node.id);
        if (el) { el.style.left = node.x + 'px'; el.style.top = node.y + 'px'; }
        renderConnections();
      }
      return;
    }

    if (state.resizing) {
      const node = state.nodes.find(n => n.id === state.resizing.nodeId);
      if (node) {
        const dx = (e.clientX - state.resizing.startX) / state.zoom;
        node.w = Math.max(180, state.resizing.startW + dx);
        const el = document.getElementById(node.id);
        if (el) el.style.width = node.w + 'px';
        renderConnections();
      }
      return;
    }

    if (state.connecting) {
      const r = wrapper.getBoundingClientRect();
      state.connecting.mouseX = e.clientX - r.left;
      state.connecting.mouseY = e.clientY - r.top;
      renderConnections();
      return;
    }

    if (state.selectionBox) {
      const cp = screenToCanvas(e.clientX, e.clientY);
      const sb = state.selectionBox;
      sb.x = Math.min(cp.x, sb.startX);
      sb.y = Math.min(cp.y, sb.startY);
      sb.w = Math.abs(cp.x - sb.startX);
      sb.h = Math.abs(cp.y - sb.startY);
      const el = document.getElementById('sel-box');
      if (el) {
        el.style.left = sb.x + 'px';
        el.style.top = sb.y + 'px';
        el.style.width = sb.w + 'px';
        el.style.height = sb.h + 'px';
      }
      // select nodes in box
      clearSelection();
      state.nodes.forEach(n => {
        const nel = document.getElementById(n.id);
        if (!nel) return;
        if (n.x + nel.offsetWidth >= sb.x && n.x <= sb.x + sb.w &&
            n.y + nel.offsetHeight >= sb.y && n.y <= sb.y + sb.h) {
          selectNode(n.id);
        }
      });
    }
  });

  document.addEventListener('mouseup', e => {
    if (state.isPanning) {
      state.isPanning = false;
      document.body.classList.remove('panning');
    }

    if (state.dragging) {
      autoSave();
      state.dragging = null;
    }

    if (state.resizing) {
      autoSave();
      state.resizing = null;
    }

    if (state.connecting) {
      // Find target node
      const targetNode = getNodeUnderMouse(e.clientX, e.clientY);
      if (targetNode && targetNode.id !== state.connecting.fromId) {
        const conn = {
          id: 'conn_' + (++state.connCounter),
          fromId: state.connecting.fromId,
          fromDir: state.connecting.fromDir,
          toId: targetNode.id,
          toDir: 'top'
        };
        state.connections.push(conn);
        updateStatus();
        autoSave();
        showToast('Nodes connected');
      }
      state.connecting = null;
      renderConnections();
    }

    if (state.selectionBox) {
      const el = document.getElementById('sel-box');
      if (el) el.remove();
      state.selectionBox = null;
    }
  });

  // Right-click canvas
  wrapper.addEventListener('contextmenu', e => {
    e.preventDefault();
    const pos = screenToCanvas(e.clientX, e.clientY);
    state.rightClickPos = pos;
    showContextMenu(e.clientX, e.clientY);
  });

  // Image file input
  document.getElementById('image-file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    const nodeId = e.target._targetNode;
    if (file && nodeId) {
      const node = state.nodes.find(n => n.id === nodeId);
      if (node) loadImageFile(file, node);
    }
    e.target.value = '';
  });

  // Paste global
  document.addEventListener('paste', e => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        const cp = screenToCanvas(wrapper.getBoundingClientRect().width / 2, wrapper.getBoundingClientRect().height / 2);
        const node = createNode('image', cp.x, cp.y, { title: 'Pasted Image' });
        loadImageFile(file, node);
        return;
      }
    }
    const text = e.clipboardData.getData('text');
    if (text && document.activeElement === document.body) {
      const cp = screenToCanvas(wrapper.getBoundingClientRect().width / 2, wrapper.getBoundingClientRect().height / 2);
      createNode('note', cp.x, cp.y, { title: 'Pasted', content: text });
    }
  });
}

// ===== TOOLBAR =====
function setupTopbar() {
  document.getElementById('btn-zoom-in').addEventListener('click', () => setZoom(state.zoom * 1.2));
  document.getElementById('btn-zoom-out').addEventListener('click', () => setZoom(state.zoom / 1.2));
  document.getElementById('btn-zoom-reset').addEventListener('click', () => { state.zoom = 1; state.panX = 0; state.panY = 0; updateTransform(); });
  document.getElementById('btn-fit').addEventListener('click', fitAll);

  document.getElementById('btn-save').addEventListener('click', saveToFile);
  document.getElementById('btn-load').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('btn-export').addEventListener('click', exportJSON);
  document.getElementById('btn-new').addEventListener('click', newCanvas);
  document.getElementById('btn-present').addEventListener('click', () => {
    document.body.classList.toggle('focus-mode');
    resizeCanvases();
    renderConnections();
  });

  // nav-support scroll
  document.getElementById('nav-support-btn').addEventListener('click', () => {
    showToast('Support via UPI — anmolsri@fam');
  });

  document.getElementById('file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        loadData(data);
        showToast('✓ Loaded', 'success');
      } catch { showToast('Invalid file'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
}

function setupSidebar() {
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      setTool(btn.dataset.tool);
    });
  });

  document.querySelectorAll('.tool-btn.node-add[data-node]').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = wrapper.getBoundingClientRect();
      const cp = screenToCanvas(r.left + r.width / 2, r.top + r.height / 2);
      createNode(btn.dataset.node, cp.x + Math.random() * 40 - 20, cp.y + Math.random() * 40 - 20);
    });
  });

  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('btn-clear-connections').addEventListener('click', () => {
    if (state.selectedNodes.size > 0) {
      state.connections = state.connections.filter(c => !state.selectedNodes.has(c.fromId) && !state.selectedNodes.has(c.toId));
    } else {
      state.connections = [];
    }
    renderConnections();
    updateStatus();
    autoSave();
    showToast('Connections cleared');
  });
}

function setTool(tool) {
  state.tool = tool;
  document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.tool-btn[data-tool="${tool}"]`);
  if (btn) btn.classList.add('active');
  document.getElementById('status-tool').textContent = 'Tool: ' + tool.charAt(0).toUpperCase() + tool.slice(1);

  const dc = document.getElementById('draw-canvas');
  const dt = document.getElementById('draw-toolbar');
  if (tool === 'draw') {
    dc.classList.add('active');
    if (dt) dt.classList.add('visible');
  } else {
    dc.classList.remove('active');
    if (dt) dt.classList.remove('visible');
  }
}

// ===== CONTEXT MENU =====
function setupContextMenus() {
  // Canvas context menu
  document.getElementById('context-menu').querySelectorAll('.ctx-item').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      const action = item.dataset.action;
      const pos = state.rightClickPos;
      if (action.startsWith('add-')) {
        createNode(action.replace('add-', ''), pos.x, pos.y);
      } else if (action === 'paste') {
        if (state.clipboard) {
          const n = JSON.parse(JSON.stringify(state.clipboard));
          n.id = 'node_' + (++state.nodeCounter);
          n.x = pos.x - 30; n.y = pos.y - 30;
          state.nodes.push(n);
          renderNode(n);
          updateStatus(); autoSave();
        }
      } else if (action === 'select-all') {
        state.nodes.forEach(n => selectNode(n.id));
      } else if (action === 'clear-all') {
        if (confirm('Clear all nodes and connections?')) newCanvas();
      }
      hideContextMenus();
    });
  });

  // Node context menu
  document.getElementById('node-context-menu').querySelectorAll('.ctx-item').forEach(item => {
    item.addEventListener('click', e => {
      e.stopPropagation();
      const action = item.dataset.action;
      const nodeId = state.contextNode;
      const node = state.nodes.find(n => n.id === nodeId);
      if (!node) { hideContextMenus(); return; }

      if (action === 'delete-node') deleteNode(nodeId);
      else if (action === 'pin-node') { node.pinned = !node.pinned; renderNode(node); showToast(node.pinned ? '📌 Pinned' : 'Unpinned'); }
      else if (action === 'color-node') showColorPicker(node);
      else if (action === 'duplicate-node') {
        const copy = JSON.parse(JSON.stringify(node));
        copy.id = 'node_' + (++state.nodeCounter);
        copy.x += 30; copy.y += 30;
        state.nodes.push(copy);
        renderNode(copy);
        updateStatus(); autoSave();
      } else if (action === 'copy-node') {
        state.clipboard = JSON.parse(JSON.stringify(node));
        showToast('Copied node');
      }
      hideContextMenus();
    });
  });

  document.addEventListener('click', hideContextMenus);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideContextMenus(); });
}

function showContextMenu(x, y) {
  hideContextMenus();
  const cm = document.getElementById('context-menu');
  cm.style.left = x + 'px';
  cm.style.top = y + 'px';
  cm.classList.add('visible');
}

function showNodeContextMenu(x, y) {
  hideContextMenus();
  const cm = document.getElementById('node-context-menu');
  cm.style.left = x + 'px';
  cm.style.top = y + 'px';
  cm.classList.add('visible');
}

function hideContextMenus() {
  document.querySelectorAll('.context-menu').forEach(m => m.classList.remove('visible'));
  const cp = document.getElementById('color-picker-popup');
  if (cp) cp.classList.remove('visible');
}

function showColorPicker(node) {
  const cp = document.getElementById('color-picker-popup');
  const el = document.getElementById(node.id);
  const r = el ? el.getBoundingClientRect() : { left: 100, bottom: 100 };
  cp.style.left = r.left + 'px';
  cp.style.top = (r.bottom + 5) + 'px';
  cp.classList.add('visible');

  cp.querySelectorAll('.swatch').forEach(s => {
    s.onclick = () => {
      node.color = s.dataset.color;
      renderNode(node);
      cp.classList.remove('visible');
      autoSave();
    };
  });
}

// ===== KEYBOARD =====
function setupKeyboard() {
  document.addEventListener('keydown', e => {
    const active = document.activeElement;
    const isEditing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.getAttribute('contenteditable') === 'true');

    if (e.key === ' ' && !isEditing) {
      e.preventDefault();
      state.isSpaceDown = true;
      wrapper.style.cursor = 'grab';
    }

    if (isEditing) return;

    // Shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 's': e.preventDefault(); saveToFile(); break;
        case 'o': e.preventDefault(); document.getElementById('file-input').click(); break;
        case 'n': e.preventDefault(); newCanvas(); break;
        case 'z': e.preventDefault(); e.shiftKey ? redo() : undo(); break;
        case 'y': e.preventDefault(); redo(); break;
        case 'a': e.preventDefault(); state.nodes.forEach(n => selectNode(n.id)); break;
        case 'c': e.preventDefault();
          if (state.selectedNodes.size === 1) {
            const id = [...state.selectedNodes][0];
            state.clipboard = JSON.parse(JSON.stringify(state.nodes.find(n => n.id === id)));
            showToast('Copied');
          }
          break;
        case 'v': e.preventDefault();
          if (state.clipboard) {
            const copy = JSON.parse(JSON.stringify(state.clipboard));
            copy.id = 'node_' + (++state.nodeCounter);
            copy.x += 40; copy.y += 40;
            state.nodes.push(copy);
            renderNode(copy);
            updateStatus(); autoSave();
          }
          break;
        case '.': e.preventDefault(); document.getElementById('btn-present').click(); break;
      }
      return;
    }

    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        deleteSelected(); break;
      case 'v': case 'V': setTool('select'); break;
      case 'h': case 'H': setTool('pan'); break;
      case 'c': case 'C': setTool('connect'); break;
      case 'd': case 'D': setTool('draw'); break;
      case 'n': case 'N': {
        const r = wrapper.getBoundingClientRect();
        const cp = screenToCanvas(r.width / 2, r.height / 2);
        createNode('note', cp.x, cp.y); break;
      }
      case 't': case 'T': {
        const r = wrapper.getBoundingClientRect();
        const cp = screenToCanvas(r.width / 2, r.height / 2);
        createNode('todo', cp.x, cp.y); break;
      }
      case 's': case 'S': {
        const r = wrapper.getBoundingClientRect();
        const cp = screenToCanvas(r.width / 2, r.height / 2);
        createNode('sticky', cp.x, cp.y); break;
      }
      case 'i': case 'I': {
        const r = wrapper.getBoundingClientRect();
        const cp = screenToCanvas(r.width / 2, r.height / 2);
        createNode('image', cp.x, cp.y); break;
      }
      case 'e': case 'E': {
        const r = wrapper.getBoundingClientRect();
        const cp = screenToCanvas(r.width / 2, r.height / 2);
        createNode('embed', cp.x, cp.y); break;
      }
      case '0': state.zoom = 1; state.panX = 0; state.panY = 0; updateTransform(); break;
      case '+': case '=': setZoom(state.zoom * 1.2); break;
      case '-': setZoom(state.zoom / 1.2); break;
      case 'f': case 'F': fitAll(); break;
      case 'Escape': clearSelection(); hideContextMenus(); break;
    }
  });

  document.addEventListener('keyup', e => {
    if (e.key === ' ') {
      state.isSpaceDown = false;
      wrapper.style.cursor = '';
    }
  });
}

// ===== DRAWING =====
function setupDrawing() {
  const dc = drawCanvas;
  let drawing = false;
  let lastX, lastY;
  let drawColor = '#cdff00';
  let drawSize = 3;
  let isEraser = false;

  // Add draw toolbar
  const dt = document.createElement('div');
  dt.className = 'draw-toolbar';
  dt.id = 'draw-toolbar';
  dt.innerHTML = `
    <span class="draw-label">Draw</span>
    ${['#cdff00','#ffffff','#ff4444','#4488ff','#ff8800'].map(c =>
      `<div class="draw-color ${c==='#cdff00'?'active':''}" data-color="${c}" style="background:${c}"></div>`
    ).join('')}
    <input class="draw-size" type="range" min="1" max="20" value="3">
    <button class="draw-eraser">Eraser</button>
    <button class="draw-clear">Clear</button>
  `;
  document.body.appendChild(dt);

  dt.querySelectorAll('.draw-color').forEach(d => {
    d.addEventListener('click', () => {
      dt.querySelectorAll('.draw-color').forEach(x => x.classList.remove('active'));
      d.classList.add('active');
      drawColor = d.dataset.color;
      isEraser = false;
      dt.querySelector('.draw-eraser').classList.remove('active');
    });
  });
  dt.querySelector('.draw-size').addEventListener('input', e => { drawSize = +e.target.value; });
  dt.querySelector('.draw-eraser').addEventListener('click', function() {
    isEraser = !isEraser;
    this.classList.toggle('active', isEraser);
  });
  dt.querySelector('.draw-clear').addEventListener('click', () => {
    dctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    state.drawings = [];
    autoSave();
  });

  dc.addEventListener('mousedown', e => {
    if (state.tool !== 'draw') return;
    drawing = true;
    const r = dc.getBoundingClientRect();
    lastX = e.clientX - r.left;
    lastY = e.clientY - r.top;
  });

  dc.addEventListener('mousemove', e => {
    if (!drawing || state.tool !== 'draw') return;
    const r = dc.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    dctx.beginPath();
    dctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    dctx.strokeStyle = drawColor;
    dctx.lineWidth = isEraser ? drawSize * 3 : drawSize;
    dctx.lineCap = 'round';
    dctx.lineJoin = 'round';
    dctx.moveTo(lastX, lastY);
    dctx.lineTo(x, y);
    dctx.stroke();
    lastX = x; lastY = y;
  });

  document.addEventListener('mouseup', () => {
    if (drawing) { drawing = false; }
  });
}

// ===== FIT ALL =====
function fitAll() {
  if (state.nodes.length === 0) {
    state.zoom = 1; state.panX = 0; state.panY = 0;
    updateTransform(); return;
  }
  const r = wrapper.getBoundingClientRect();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  state.nodes.forEach(n => {
    const el = document.getElementById(n.id);
    const w = el ? el.offsetWidth : 260;
    const h = el ? el.offsetHeight : 150;
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + w);
    maxY = Math.max(maxY, n.y + h);
  });
  const pad = 80;
  const bw = maxX - minX + pad * 2;
  const bh = maxY - minY + pad * 2;
  const zoom = Math.min(r.width / bw, r.height / bh, 1.5);
  state.zoom = zoom;
  state.panX = (r.width - bw * zoom) / 2 - (minX - pad) * zoom;
  state.panY = (r.height - bh * zoom) / 2 - (minY - pad) * zoom;
  updateTransform();
}

// ===== UNDO/REDO =====
function saveUndo() {
  const snap = JSON.stringify({ nodes: state.nodes, connections: state.connections });
  state.undoStack.push(snap);
  if (state.undoStack.length > 50) state.undoStack.shift();
  state.redoStack = [];
}

function undo() {
  if (state.undoStack.length === 0) { showToast('Nothing to undo'); return; }
  const snap = JSON.stringify({ nodes: state.nodes, connections: state.connections });
  state.redoStack.push(snap);
  const prev = JSON.parse(state.undoStack.pop());
  loadStateData(prev);
  showToast('Undo');
}

function redo() {
  if (state.redoStack.length === 0) { showToast('Nothing to redo'); return; }
  const snap = JSON.stringify({ nodes: state.nodes, connections: state.connections });
  state.undoStack.push(snap);
  const next = JSON.parse(state.redoStack.pop());
  loadStateData(next);
  showToast('Redo');
}

function loadStateData(data) {
  state.nodes = data.nodes;
  state.connections = data.connections;
  canvas.innerHTML = '';
  state.nodes.forEach(n => renderNode(n));
  renderConnections();
  updateStatus();
}

// ===== SAVE/LOAD =====
function buildSaveData() {
  return {
    version: 1,
    title: document.getElementById('canvas-title').value,
    nodes: state.nodes,
    connections: state.connections,
    zoom: state.zoom,
    panX: state.panX,
    panY: state.panY
  };
}

function saveToFile() {
  const data = buildSaveData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (document.getElementById('canvas-title').value || 'nodeflow') + '.json';
  a.click();
  showToast('✓ Saved to file', 'success');
}

function exportJSON() {
  saveToFile();
}

function newCanvas() {
  if (state.nodes.length > 0 && !confirm('Start a new canvas? Unsaved changes will be lost.')) return;
  saveUndo();
  state.nodes = [];
  state.connections = [];
  canvas.innerHTML = '';
  state.zoom = 1; state.panX = 0; state.panY = 0;
  document.getElementById('canvas-title').value = 'Untitled Canvas';
  renderConnections();
  updateStatus();
  localStorage.removeItem('nodeflow_autosave');
  showToast('New canvas');
}

function loadData(data) {
  if (data.title) document.getElementById('canvas-title').value = data.title;
  state.nodes = data.nodes || [];
  state.connections = data.connections || [];
  state.zoom = data.zoom || 1;
  state.panX = data.panX || 0;
  state.panY = data.panY || 0;
  state.nodeCounter = state.nodes.length + 100;
  state.connCounter = state.connections.length + 100;
  canvas.innerHTML = '';
  state.nodes.forEach(n => renderNode(n));
  updateTransform();
  renderConnections();
  updateStatus();
}

function autoSave() {
  try {
    const data = buildSaveData();
    localStorage.setItem('nodeflow_autosave', JSON.stringify(data));
  } catch(e) {}
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem('nodeflow_autosave');
    if (raw) {
      const data = JSON.parse(raw);
      loadData(data);
      showToast('Auto-save restored');
    }
  } catch(e) {}
}

// ===== STATUS =====
function updateStatus() {
  document.getElementById('status-nodes').textContent = state.nodes.length + ' node' + (state.nodes.length !== 1 ? 's' : '');
  document.getElementById('status-connections').textContent = state.connections.length + ' connection' + (state.connections.length !== 1 ? 's' : '');
}

// ===== TOAST =====
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.classList.remove('show'); }, 2000);
}

// ===== HELPERS =====
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function autoTextarea(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// ===== START =====
init();
