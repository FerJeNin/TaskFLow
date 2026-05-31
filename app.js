// ─── STATE ───────────────────────────────────────────────────────────────────

let S = {
  projects: [],
  active: null,
  cfg: { work: 25, short: 5, long: 15, sessBeforeLong: 4 },
  stats: { sessions: 0, minutes: 0 }
};

// NUEVO: timer preciso con performance.now()
let timerRAF = null, running = false;
let phase = 'work', secsLeft = 0, totalSecs = 0;
let startTime = null, pausedSecsLeft = 0;

// NUEVO: tarea vinculada al pomodoro
let linkedTaskId = null;

// NUEVO: confirmación pendiente
let pendingConfirm = null;

const CIRC = 2 * Math.PI * 66; // radio 66 igual que el original

// ─── PERSISTENCE ─────────────────────────────────────────────────────────────

const save = () => localStorage.setItem('tf3', JSON.stringify(S));

function load() {
  try {
    const d = localStorage.getItem('tf3');
    if (d) S = { ...S, ...JSON.parse(d) };
  } catch (e) {}
}

// ─── UTILS ───────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const getProj = () => S.projects.find(p => p.id === S.active) || null;

// ─── TOAST ───────────────────────────────────────────────────────────────────

let nT;
function toast(msg) {
  const el = document.getElementById('notif');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(nT);
  nT = setTimeout(() => el.classList.remove('show'), 3000);
}

// ─── NUEVO: SONIDO ───────────────────────────────────────────────────────────

function playDone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523, 659, 784, 1047].forEach((freq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.25, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.start(t); o.stop(t + 0.38);
    });
  } catch (e) {}
}

function playBreakEnd() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = 660;
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.85);
  } catch (e) {}
}

// ─── NUEVO: MODAL DE CONFIRMACIÓN ────────────────────────────────────────────

function openConfirm(icon, body, okLabel, fn) {
  document.getElementById('confirm-icon').textContent = icon;
  document.getElementById('confirm-body').innerHTML = body;
  document.getElementById('confirm-ok').textContent = okLabel;
  pendingConfirm = fn;
  document.getElementById('confirm-modal').classList.add('open');
}

function closeConfirm() {
  document.getElementById('confirm-modal').classList.remove('open');
  pendingConfirm = null;
}

function confirmAction() {
  if (pendingConfirm) pendingConfirm();
  closeConfirm();
}

document.getElementById('confirm-modal').addEventListener('click', e => {
  if (e.target.id === 'confirm-modal') closeConfirm();
});

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────

function renderSidebar() {
  document.getElementById('proj-list').innerHTML = S.projects.map(p => {
    const done = p.tasks.filter(t => t.done).length;
    return `<div class="proj-item${p.id === S.active ? ' active' : ''}" onclick="selProj('${p.id}')">
      <span class="proj-dot"></span>
      <span class="proj-name">${esc(p.name)}</span>
      <span class="proj-badge">${done}/${p.tasks.length}</span>
      <button class="proj-del" onclick="delProj('${p.id}',event)">✕</button>
    </div>`;
  }).join('');
}

function selProj(id) {
  S.active = id;
  save();
  renderSidebar();
  renderView();
}

function openProjModal() {
  document.getElementById('proj-modal').classList.add('open');
  setTimeout(() => document.getElementById('new-proj-inp').focus(), 40);
}

function closeProjModal() {
  document.getElementById('proj-modal').classList.remove('open');
  document.getElementById('new-proj-inp').value = '';
}

function saveProjModal() {
  const n = document.getElementById('new-proj-inp').value.trim();
  if (!n) return;
  const p = { id: uid(), name: n, tasks: [] };
  S.projects.push(p);
  save();
  closeProjModal();
  selProj(p.id);
  toast(`Proyecto "${n}" creado ✓`);
}

function delProj(id, e) {
  e.stopPropagation();
  const p = S.projects.find(x => x.id === id);
  if (!p) return;
  openConfirm('🗂️',
    `¿Eliminar el proyecto <span class="modal-name">"${esc(p.name)}"</span>?<br>Se perderán todas sus tareas.`,
    'Eliminar',
    () => {
      if (linkedTaskId && p.tasks.find(t => t.id === linkedTaskId)) linkedTaskId = null;
      S.projects = S.projects.filter(x => x.id !== id);
      if (S.active === id) S.active = null;
      save();
      renderSidebar();
      renderView();
      toast('Proyecto eliminado');
    }
  );
}

// ─── MAIN VIEW ───────────────────────────────────────────────────────────────

function renderView() {
  const p = getProj();
  document.getElementById('no-project').style.display = p ? 'none' : 'flex';
  document.getElementById('proj-view').style.display = p ? 'flex' : 'none';
  if (!p) { updateStats(); return; }

  document.getElementById('proj-title').textContent = p.name;
  const tot = p.tasks.length, done = p.tasks.filter(t => t.done).length;
  document.getElementById('cl-sub').textContent = `${done} de ${tot} tareas completadas`;
  document.getElementById('prog-fill').style.width = (tot > 0 ? Math.round(done / tot * 100) : 0) + '%';
  renderTasks(p);
  updateStats();
  renderLinkedBanner();
}

// BANNER DE TAREA VINCULADA (ACTUALIZADO CON EL NUEVO HTML)
function renderLinkedBanner() {
  const area = document.getElementById('linked-task-area');
  if (!linkedTaskId) { area.style.display = 'none'; return; }
  let task = null;
  S.projects.forEach(proj => {
    const t = proj.tasks.find(t => t.id === linkedTaskId);
    if (t) task = t;
  });
  if (!task) { linkedTaskId = null; area.style.display = 'none'; return; }
  
  area.style.display = 'flex'; // Cambiado a flex para la alineación
  area.innerHTML = `
    <div class="linked-task-name">🎯 ${esc(task.title)}</div>
    <button class="btn-unlink" onclick="unlinkTask()" title="Desvincular">×</button>
  `;
}

function unlinkTask() {
  linkedTaskId = null;
  renderLinkedBanner();
  renderView();
  toast('Tarea desvinculada');
}

// RENDER DE TAREAS (ACTUALIZADO CON EL BOTÓN PLAY)
function renderTasks(p) {
  const el = document.getElementById('tasks-list');
  if (!p.tasks.length) {
    el.innerHTML = `<div class="empty"><span>✅</span><p>Sin tareas. ¡Agrega la primera!</p></div>`;
    return;
  }
  el.innerHTML = p.tasks.map(t => {
    const sub = t.subs || [], sd = sub.filter(s => s.done).length;
    const sb = sub.length ? `<span class="badge b-sub">${sd}/${sub.length} sub</span>` : '';
    const pc = { high: 'b-high', mid: 'b-mid', low: 'b-low' }[t.prio] || 'b-mid';
    const pl = { high: 'Alta', mid: 'Media', low: 'Baja' }[t.prio] || 'Media';
    const pb = (t.pomodoroSessions > 0) ? `<span class="badge b-pomo">🍅 ${t.pomodoroSessions}</span>` : '';
    
    const isLinked = linkedTaskId === t.id;
    
    return `<div class="task-card${t.done ? ' done' : ''}${isLinked ? ' linked' : ''}">
      <div class="task-main">
        <div class="t-check${t.done ? ' checked' : ''}" onclick="toggleTask('${t.id}')"></div>
        <div class="task-info">
          <div class="task-title">${esc(t.title)}</div>
          <div class="task-badges"><span class="badge ${pc}">${pl}</span>${sb}${pb}</div>
        </div>
        <div class="task-actions">
          <button class="btn-play-task" onclick="iniciarPomodoroDesdeTarea('${t.id}')" title="Iniciar Pomodoro">▶</button>
          <button class="btn-icon link-btn${isLinked ? ' active' : ''}" onclick="linkTask('${t.id}')" title="${isLinked ? 'Desvincular' : 'Vincular al Pomodoro'}">🎯</button>
          <button class="btn-icon" onclick="toggleSub('${t.id}')">≡</button>
          <button class="btn-icon del" onclick="askDelTask('${t.id}')">✕</button>
        </div>
        <button class="btn-expand${t.subOpen ? ' open' : ''}" onclick="toggleSub('${t.id}')">▶</button>
      </div>
      <div class="sublist${t.subOpen ? ' open' : ''}">
        <div class="sub-add">
          <input type="text" placeholder="Agregar subtarea..." id="si-${t.id}"
            onkeydown="if(event.key==='Enter') addSub('${t.id}')">
          <button class="btn-sub" onclick="addSub('${t.id}')">+ Agregar</button>
        </div>
        <div>${renderSubs(t)}</div>
      </div>
    </div>`;
  }).join('');
}

function renderSubs(t) {
  return (t.subs || []).map(s => `
    <div class="subitem${s.done ? ' done' : ''}">
      <div class="s-check${s.done ? ' checked' : ''}" onclick="toggleSub2('${t.id}','${s.id}')"></div>
      <span class="s-text">${esc(s.text)}</span>
      <button class="s-del always-visible" onclick="askDelSub('${t.id}','${s.id}')">✕</button>
    </div>`).join('');
}

function linkTask(tid) {
  if (linkedTaskId === tid) { unlinkTask(); return; }
  linkedTaskId = tid;
  renderView();
  let task = null;
  S.projects.forEach(p => { const t = p.tasks.find(t => t.id === tid); if (t) task = t; });
  if (task) toast(`Tarea vinculada: "${task.title}"`);
}

// ─── TASKS ───────────────────────────────────────────────────────────────────

function addTask() {
  const inp = document.getElementById('new-task-inp'), v = inp.value.trim();
  if (!v) return;
  const p = getProj(); if (!p) return;
  p.tasks.push({
    id: uid(), title: v,
    prio: document.getElementById('new-task-prio').value,
    done: false, subOpen: false, subs: [],
    pomodoroSessions: 0 
  });
  inp.value = '';
  save(); renderView(); renderSidebar();
}

function toggleTask(id) {
  const p = getProj(); if (!p) return;
  const t = p.tasks.find(t => t.id === id);
  if (t) t.done = !t.done;
  save(); renderView(); renderSidebar();
}

function askDelTask(id) {
  const p = getProj(); if (!p) return;
  const t = p.tasks.find(t => t.id === id); if (!t) return;
  openConfirm('🗑️',
    `¿Eliminar la tarea <span class="modal-name">"${esc(t.title)}"</span>?`,
    'Eliminar',
    () => {
      if (linkedTaskId === id) linkedTaskId = null;
      p.tasks = p.tasks.filter(t => t.id !== id);
      save(); renderView(); renderSidebar();
      toast('Tarea eliminada');
    }
  );
}

function toggleSub(tid) {
  const p = getProj(); if (!p) return;
  const t = p.tasks.find(t => t.id === tid);
  if (t) t.subOpen = !t.subOpen;
  save(); renderView();
}

function addSub(tid) {
  const inp = document.getElementById(`si-${tid}`), v = inp.value.trim();
  if (!v) return;
  const p = getProj(), t = p && p.tasks.find(t => t.id === tid);
  if (!t) return;
  if (!t.subs) t.subs = [];
  t.subs.push({ id: uid(), text: v, done: false });
  inp.value = '';
  save(); renderView(); renderSidebar();
}

function toggleSub2(tid, sid) {
  const p = getProj(), t = p && p.tasks.find(t => t.id === tid);
  if (!t) return;
  const s = t.subs.find(s => s.id === sid);
  if (s) s.done = !s.done;
  save(); renderView();
}

function askDelSub(tid, sid) {
  const p = getProj(), t = p && p.tasks.find(t => t.id === tid);
  if (!t) return;
  const s = t.subs.find(s => s.id === sid); if (!s) return;
  openConfirm('🗑️',
    `¿Eliminar la subtarea <span class="modal-name">"${esc(s.text)}"</span>?`,
    'Eliminar',
    () => {
      t.subs = t.subs.filter(s => s.id !== sid);
      save(); renderView();
    }
  );
}

// ─── POMODORO ────────────────────────────────────────────────────────────────

function initTimer() {
  phase = 'work';
  secsLeft = S.cfg.work * 60;
  totalSecs = secsLeft;
  pausedSecsLeft = secsLeft;
  renderClock();
  document.getElementById('phase-label').textContent = 'SESIÓN DE TRABAJO';
  document.getElementById('phase-pill').textContent = 'Trabajo';
  document.getElementById('phase-pill').className = 'phase-pill';
  renderDots();
}

function toggleTimer() { running ? pauseTimer() : startTimer(); }

// NUEVO: Función para el botón Play dentro de la tarjeta de tarea
function iniciarPomodoroDesdeTarea(tid) {
  // Aseguramos que la tarea esté vinculada
  if (linkedTaskId !== tid) {
    linkTask(tid);
  }
  
  // Si no está corriendo el timer, lo iniciamos
  if (!running) {
    // Si estaba en descanso, forzamos a que vuelva a sesión de trabajo
    if (phase !== 'work') {
      initTimer();
    }
    startTimer();
  }
}

function startTimer() {
  running = true;
  startTime = performance.now();
  document.getElementById('btn-play').innerHTML = '⏸ Pausar';
  document.getElementById('t-sub').textContent = 'En progreso';
  tick();
}

function tick() {
  if (!running) return;
  const elapsed = (performance.now() - startTime) / 1000;
  secsLeft = Math.max(0, Math.round(pausedSecsLeft - elapsed));
  renderClock();
  if (secsLeft <= 0) { timerDone(); }
  else { timerRAF = requestAnimationFrame(tick); }
}

function pauseTimer() {
  running = false;
  cancelAnimationFrame(timerRAF);
  pausedSecsLeft = secsLeft;
  document.getElementById('btn-play').innerHTML = '▶ Continuar';
  document.getElementById('t-sub').textContent = 'Pausado';
}

function resetTimer() {
  running = false;
  cancelAnimationFrame(timerRAF);
  initTimer();
  document.getElementById('btn-play').innerHTML = '▶ Iniciar';
  document.getElementById('t-sub').textContent = 'Listo';
}

function timerDone() {
  cancelAnimationFrame(timerRAF);
  running = false;
  playDone();

  if (phase === 'work') {
    S.stats.sessions++;
    S.stats.minutes += S.cfg.work;

    if (linkedTaskId) {
      S.projects.forEach(proj => {
        const t = proj.tasks.find(t => t.id === linkedTaskId);
        if (t) t.pomodoroSessions = (t.pomodoroSessions || 0) + 1;
      });
    }
    save();

    if (S.stats.sessions % S.cfg.sessBeforeLong === 0) {
      phase = 'long'; secsLeft = S.cfg.long * 60;
      document.getElementById('phase-label').textContent = 'DESCANSO LARGO';
      document.getElementById('phase-pill').textContent = 'Descanso largo';
      document.getElementById('phase-pill').className = 'phase-pill brk';
      toast('🎉 ¡Descanso largo! Te lo ganaste.');
    } else {
      phase = 'short'; secsLeft = S.cfg.short * 60;
      document.getElementById('phase-label').textContent = 'DESCANSO CORTO';
      document.getElementById('phase-pill').textContent = 'Descanso';
      document.getElementById('phase-pill').className = 'phase-pill brk';
      toast('✅ Sesión lista. ¡Breve descanso!');
    }
  } else {
    playBreakEnd();
    phase = 'work'; secsLeft = S.cfg.work * 60;
    document.getElementById('phase-label').textContent = 'SESIÓN DE TRABAJO';
    document.getElementById('phase-pill').textContent = 'Trabajo';
    document.getElementById('phase-pill').className = 'phase-pill';
    toast('⏱ ¡A trabajar!');
  }

  totalSecs = secsLeft;
  pausedSecsLeft = secsLeft;
  renderClock();
  renderDots();
  document.getElementById('btn-play').innerHTML = '▶ Iniciar';
  document.getElementById('t-sub').textContent = 'Listo';
  document.getElementById('ses-num').textContent = S.stats.sessions;
  updateStats();
  renderView();
}

function renderClock() {
  const m = Math.floor(secsLeft / 60), s = secsLeft % 60;
  document.getElementById('t-time').textContent =
    String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  const off = CIRC * (1 - secsLeft / totalSecs);
  document.getElementById('t-arc').style.strokeDashoffset = off;
}

function renderDots() {
  const el = document.getElementById('dots');
  el.innerHTML = '';
  const n = S.cfg.sessBeforeLong, cur = S.stats.sessions % n;
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div');
    d.className = 'dot' + (i < cur ? ' on' : '');
    el.appendChild(d);
  }
  document.getElementById('ses-num').textContent = S.stats.sessions;
}

function updateStats() {
  const p = getProj(), tot = p ? p.tasks.length : 0, done = p ? p.tasks.filter(t => t.done).length : 0;
  document.getElementById('st-tasks').textContent = `${done}/${tot}`;
  document.getElementById('st-ses').textContent = S.stats.sessions;
  const h = Math.floor(S.stats.minutes / 60), m = S.stats.minutes % 60;
  document.getElementById('st-time').textContent = h > 0 ? `${h}h ${m}min` : `${m} min`;
}

// ─── CONFIG MODAL ─────────────────────────────────────────────────────────────

function openCfgModal() {
  document.getElementById('cfg-work').value = S.cfg.work;
  document.getElementById('cfg-short').value = S.cfg.short;
  document.getElementById('cfg-long').value = S.cfg.long;
  document.getElementById('cfg-sess').value = S.cfg.sessBeforeLong;
  document.getElementById('cfg-modal').classList.add('open');
}

function closeCfgModal() {
  document.getElementById('cfg-modal').classList.remove('open');
}

function saveCfg() {
  S.cfg.work = parseInt(document.getElementById('cfg-work').value) || 25;
  S.cfg.short = parseInt(document.getElementById('cfg-short').value) || 5;
  S.cfg.long = parseInt(document.getElementById('cfg-long').value) || 15;
  S.cfg.sessBeforeLong = parseInt(document.getElementById('cfg-sess').value) || 4;
  save();
  closeCfgModal();
  if (!running) initTimer();
  toast('Configuración guardada ✓');
}

// ─── MODAL CLOSE ON BACKDROP ─────────────────────────────────────────────────

document.getElementById('proj-modal').addEventListener('click', e => {
  if (e.target.id === 'proj-modal') closeProjModal();
});
document.getElementById('cfg-modal').addEventListener('click', e => {
  if (e.target.id === 'cfg-modal') closeCfgModal();
});

// ─── INIT ────────────────────────────────────────────────────────────────────

load();
renderSidebar();
renderView();
initTimer();
