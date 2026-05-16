// ─── STATE ───────────────────────────────────────────────────────────────────

let S = {
  projects: [],
  active: null,
  cfg: { work: 25, short: 5, long: 15, sessBeforeLong: 4 },
  stats: { sessions: 0, minutes: 0 }
};

let timerInt = null, running = false;
let phase = 'work', secs = 0, total = 0;

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
  if (!p || !confirm(`¿Eliminar "${p.name}"?`)) return;
  S.projects = S.projects.filter(x => x.id !== id);
  if (S.active === id) S.active = null;
  save();
  renderSidebar();
  renderView();
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
}

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
    return `<div class="task-card${t.done ? ' done' : ''}">
      <div class="task-main">
        <div class="t-check${t.done ? ' checked' : ''}" onclick="toggleTask('${t.id}')"></div>
        <div class="task-info">
          <div class="task-title">${esc(t.title)}</div>
          <div class="task-badges"><span class="badge ${pc}">${pl}</span>${sb}</div>
        </div>
        <div class="task-actions">
          <button class="btn-icon" onclick="toggleSub('${t.id}')">≡</button>
          <button class="btn-icon del" onclick="delTask('${t.id}')">✕</button>
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
      <button class="s-del" onclick="delSub('${t.id}','${s.id}')">✕</button>
    </div>`).join('');
}

// ─── TASKS ───────────────────────────────────────────────────────────────────

function addTask() {
  const inp = document.getElementById('new-task-inp'), v = inp.value.trim();
  if (!v) return;
  const p = getProj(); if (!p) return;
  p.tasks.push({
    id: uid(), title: v,
    prio: document.getElementById('new-task-prio').value,
    done: false, subOpen: false, subs: []
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

function delTask(id) {
  const p = getProj(); if (!p) return;
  p.tasks = p.tasks.filter(t => t.id !== id);
  save(); renderView(); renderSidebar();
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

function delSub(tid, sid) {
  const p = getProj(), t = p && p.tasks.find(t => t.id === tid);
  if (!t) return;
  t.subs = t.subs.filter(s => s.id !== sid);
  save(); renderView();
}

// ─── POMODORO ────────────────────────────────────────────────────────────────

function initTimer() {
  phase = 'work';
  secs = S.cfg.work * 60;
  total = secs;
  renderClock();
  document.getElementById('phase-label').textContent = 'SESIÓN DE TRABAJO';
  document.getElementById('phase-pill').textContent = 'Trabajo';
  document.getElementById('phase-pill').className = 'phase-pill';
  renderDots();
}

function toggleTimer() { running ? pauseTimer() : startTimer(); }

function startTimer() {
  running = true;
  document.getElementById('btn-play').innerHTML = '⏸ Pausar';
  document.getElementById('t-sub').textContent = 'En progreso';
  timerInt = setInterval(() => { secs--; secs <= 0 ? timerDone() : renderClock(); }, 1000);
}

function pauseTimer() {
  running = false;
  clearInterval(timerInt);
  document.getElementById('btn-play').innerHTML = '▶ Continuar';
  document.getElementById('t-sub').textContent = 'Pausado';
}

function resetTimer() {
  running = false;
  clearInterval(timerInt);
  initTimer();
  document.getElementById('btn-play').innerHTML = '▶ Iniciar';
  document.getElementById('t-sub').textContent = 'Listo';
}

function timerDone() {
  clearInterval(timerInt);
  running = false;

  if (phase === 'work') {
    S.stats.sessions++;
    S.stats.minutes += S.cfg.work;
    save();
    if (S.stats.sessions % S.cfg.sessBeforeLong === 0) {
      phase = 'long'; secs = S.cfg.long * 60;
      document.getElementById('phase-label').textContent = 'DESCANSO LARGO';
      document.getElementById('phase-pill').textContent = 'Descanso largo';
      document.getElementById('phase-pill').className = 'phase-pill brk';
      toast('🎉 ¡Descanso largo! Te lo ganaste.');
    } else {
      phase = 'short'; secs = S.cfg.short * 60;
      document.getElementById('phase-label').textContent = 'DESCANSO CORTO';
      document.getElementById('phase-pill').textContent = 'Descanso';
      document.getElementById('phase-pill').className = 'phase-pill brk';
      toast('✅ Sesión lista. ¡Breve descanso!');
    }
  } else {
    phase = 'work'; secs = S.cfg.work * 60;
    document.getElementById('phase-label').textContent = 'SESIÓN DE TRABAJO';
    document.getElementById('phase-pill').textContent = 'Trabajo';
    document.getElementById('phase-pill').className = 'phase-pill';
    toast('⏱ ¡A trabajar!');
  }

  total = secs;
  renderClock();
  renderDots();
  document.getElementById('btn-play').innerHTML = '▶ Iniciar';
  document.getElementById('t-sub').textContent = 'Listo';
  document.getElementById('ses-num').textContent = S.stats.sessions;
  updateStats();
}

function renderClock() {
  const m = Math.floor(secs / 60), s = secs % 60;
  document.getElementById('t-time').textContent =
    String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  const C = 2 * Math.PI * 66, off = C * (1 - secs / total);
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
