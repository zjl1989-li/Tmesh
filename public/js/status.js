// split of public/app.js (original section comment preserved below)
import { API, api, bump, on, watchSse } from './api.js';
import { $, $$, esc } from './core.js';
import { toast } from './modals.js';
import { scheduleRegRefresh } from './settings.js';

// ---------------- traffic lights: live agent status ----------------
// backend states: busy (red) / error (yellow) / idle (green) / offline (dark)
// asking (purple) = the agent asked the user something and is waiting on it
export const ST_LABEL = { busy: '执行中', error: '上次失败', idle: '空闲', offline: '离线', asking: '等你回答' };
export let statusMap = {};
export let statusSrc = null;

export function subscribeStatus() {
  if (statusSrc) statusSrc.close();
  const back = bump();
  statusSrc = new EventSource(`${API}/agent-status`);
  statusSrc.addEventListener('snapshot', (e) => {
    try { statusMap = JSON.parse(e.data) || {}; } catch { statusMap = {}; }
    paintAllTraffic();
  });
  statusSrc.addEventListener('agent_status', (e) => {
    let ups = [];
    try { ups = JSON.parse(e.data) || []; } catch { return; }
    ups.forEach((u) => { statusMap[u.agentId] = u.status; });
    paintAllTraffic();
    scheduleRegRefresh(); // 服务启停会改变开关/计数，设置页开着时同步刷新
  });
  watchSse(statusSrc, back, subscribeStatus);
}

export const stateOf = (id) => (statusMap[id] || {}).state || 'offline';

// Agent avatar: show the agent's own picture when it has one, otherwise the
// colored initial. cls is an extra class (e.g. 'sm' / 'msg-av').
export const avHtml = (a, cls) => {
  if (!a) return `<span class="av ${cls || ''}">?</span>`;
  const name = a.name || '?';
  if (a.avatar) return `<span class="av img ${cls || ''}" style="border-color:${a.color || 'var(--border)'}" title="${esc(name)}"><img src="${esc(a.avatar)}" alt="" /></span>`;
  return `<span class="av ${cls || ''}" style="background:${a.color || '#888'}" title="${esc(name)}">${esc(String(name)[0])}</span>`;
};

export function trafficHtml(id, onAvatar) {
  const s = stateOf(id);
  const cls = 'traffic' + (onAvatar ? ' on-avatar' : ' lg');
  return `<span class="${cls}" data-s="${s}" data-agent="${esc(id)}" title="${esc(id)} · ${ST_LABEL[s]}"><i></i><i></i><i></i></span>`;
}

export function paintAllTraffic() {
  $$('.traffic').forEach((el) => {
    const id = el.dataset.agent;
    const s = stateOf(id);
    el.dataset.s = s;
    el.title = `${(findAgent(id) || { name: id }).name} · ${ST_LABEL[s]}`;
  });
  if (taskAgentId) refreshTaskPop();
}

// ---------------- popover: interrupt / rewrite a running turn ----------------
export let taskAgentId = null;
export function taskPopEl() {
  let p = $('#taskPop');
  if (!p) {
    p = document.createElement('div');
    p.id = 'taskPop';
    p.className = 'task-pop hidden';
    document.body.appendChild(p);
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#taskPop') && !e.target.closest('.traffic')) p.classList.add('hidden');
    });
  }
  return p;
}

export function openTaskPop(id, anchor) {
  taskAgentId = id;
  const p = taskPopEl();
  refreshTaskPop();
  p.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  const w = 268, h = p.offsetHeight || 160;
  let left = Math.min(r.left, window.innerWidth - w - 12);
  let top = r.bottom + 6;
  if (top + h > window.innerHeight) top = Math.max(12, r.top - h - 6);
  p.style.left = Math.max(12, left) + 'px';
  p.style.top = top + 'px';
}

export function refreshTaskPop() {
  const p = $('#taskPop');
  if (!p || !taskAgentId) return;
  const a = findAgent(taskAgentId);
  if (!a) return;
  const st = statusMap[taskAgentId] || {};
  const s = st.state || 'offline';
  p.dataset.s = s;
  const secs = st.since ? Math.max(0, Math.round((Date.now() - st.since) / 1000)) : 0;
  const running = s === 'busy';
  p.innerHTML = `
    <div class="tp-head">${trafficHtml(taskAgentId)}<span>${esc(a.name)}</span><span class="st">${ST_LABEL[s]}</span></div>
    ${st.preview
      ? `<div class="tp-prev">${esc(st.preview)}</div>`
      : `<div class="tp-prev">${running ? '（该 agent 未上报任务内容）' : '当前没有执行中的任务'}</div>`}
    <div class="tp-foot">
      <button class="danger" data-act="abort">中断</button>
      <button data-act="rewrite">改内容重发</button>
    </div>
    <div class="tp-meta">${running
      ? `已运行 ${secs}s · 中断后这条不会写入记录`
      : (st.error ? esc(st.error) : '仅在「执行中」时中断有效')}</div>`;

  p.querySelector('[data-act="abort"]').onclick = async () => {
    const r = await api.abortAgent(taskAgentId).catch(() => ({ ok: false }));
    toast(r.ok ? `已中断「${a.name}」` : `「${a.name}」当前不在执行`);
    p.classList.add('hidden');
  };
  p.querySelector('[data-act="rewrite"]').onclick = async () => {
    await api.abortAgent(taskAgentId).catch(() => ({}));
    const sel = $('#sendTarget');
    if ([...sel.options].some((o) => o.value === taskAgentId)) sel.value = taskAgentId;
    $('#input').value = st.preview || $('#input').value;
    $('#input').focus();
    p.classList.add('hidden');
    toast(`已中断并回填原文，改完回车只重发给「${a.name}」`);
  };
}

// keep the running timer ticking without rebuilding the buttons
export function tickTaskPop() {
  const p = $('#taskPop');
  if (!p || p.classList.contains('hidden') || !taskAgentId) return;
  const st = statusMap[taskAgentId] || {};
  const s = st.state || 'offline';
  if (s !== p.dataset.s) return refreshTaskPop();
  const meta = p.querySelector('.tp-meta');
  if (meta && s === 'busy' && st.since) {
    meta.textContent = `已运行 ${Math.max(0, Math.round((Date.now() - st.since) / 1000))}s · 中断后这条不会写入记录`;
  }
}
setInterval(tickTaskPop, 1000);

// agent cache: refreshed on boot and after any agent mutation, so the
// synchronous render helpers keep working unchanged.
export let agentsCache = [];
export const findAgent = (id) => agentsCache.find((a) => a.id === id);
export async function refreshAgents() { agentsCache = await api.listAgents(); return agentsCache; }