// split of public/app.js (original section comment preserved below)
import { api } from './api.js';
import { selectGroup, toggleAgent } from './center.js';
import { $, $$, esc } from './core.js';
import { agentCard, capClass, capabilityOf, delegationRow } from './settings.js';
import { curGroupId } from './state.js';
import { ST_LABEL, avHtml, findAgent, stateOf } from './status.js';

// ---------------- MODAL: group settings ----------------
export const ROLE_LABELS = [['commander', '指挥'], ['executor', '执行'], ['reviewer', '审核'], ['advisor', '参谋']];
export async function openGroupModal(id) {
  const g = await api.getGroup(id);
  $('#grpNameInput').value = g.name;
  const [settings] = await Promise.all([api.getSettings()]);
  const slot = $('#delegateSlot'); if (slot) { slot.innerHTML = ''; slot.appendChild(delegationRow(settings)); }
  // approval gate (batch C): ask before executing vs accept-then-review
  const appr = $('#grpApproval');
  if (appr) appr.value = g.approval === 'after' ? 'after' : 'before';
  const box = $('#groupMembers'); box.innerHTML = '';
  const agents = await api.listAgents();
  agents.forEach((a) => {
    const checked = (g.memberIds || []).includes(a.id) ? 'checked' : '';
    const isExec = a.kind === 'executor' || a.adapterType === 'A' || a.adapterType === 'C';
    const kindBadge = `<span class="ac-cap ${isExec ? 'cap-exec' : 'cap-adv'}" title="${isExec ? '可操作本地电脑' : '无本地操作能力'}">${isExec ? '执' : '谋'}</span>`;
    const roleSel = ROLE_LABELS.map(([v, l]) =>
      `<option value="${v}" ${g.memberRoles && g.memberRoles[a.id] === v ? 'selected' : ''}>${l}</option>`).join('');
    const row = document.createElement('div'); row.className = 'member-row';
    row.innerHTML = `<label class="member-check"><input type="checkbox" data-id="${a.id}" ${checked}/>
      ${avHtml(a)}<span class="mname">${esc(a.name)}</span></label>
      ${kindBadge}
      <select class="role-sel" data-id="${a.id}" title="群内角色（可随时临时调换）\n指挥：流程复盘与派单调度，不审代码\n执行：干活的\n审核：阶段质量关卡——代码审核/安全审核/查bug\n参谋：出方案、参与协商">${roleSel}</select>`;
    box.appendChild(row);
  });
  $('#groupModal').dataset.gid = id;
  $('#groupModal').classList.remove('hidden');
}

// ---------------- MODAL: usage ledger (all agents, today + month) -----------
export const fmtNum = (n) => (n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(n));
export const todayKey = () => new Date().toISOString().slice(0, 10);
export function usageDay(u, agentId, day) {
  const b = (u[agentId] || {})[day] || {};
  return { toks: (b.prompt || 0) + (b.completion || 0) + (b.total || 0), turns: b.turns || 0 };
}
export function usageMonth(u, agentId, month) {
  const by = u[agentId] || {};
  let toks = 0, turns = 0;
  for (const [d, b] of Object.entries(by)) {
    if (!d.startsWith(month)) continue;
    toks += (b.prompt || 0) + (b.completion || 0) + (b.total || 0);
    turns += b.turns || 0;
  }
  return { toks, turns };
}
// Fire at most once per agent per day (localStorage guard). Advisory only:
// the ledger never blocks a turn, it just tells you who is burning.
export async function maybeUsageWarn(agentId) {
  try {
    const a = findAgent(agentId); if (!a) return;
    const [u, settings] = await Promise.all([api.getUsage(), api.getSettings()]);
    const day = todayKey();
    const { toks, turns } = usageDay(u, agentId, day);
    const overTok = settings.warnTokensDay > 0 && toks >= settings.warnTokensDay;
    const overTurn = settings.warnTurnsDay > 0 && turns >= settings.warnTurnsDay;
    if (!overTok && !overTurn) return;
    const key = 'zjl_usage_warn_' + agentId;
    if (localStorage.getItem(key) === day) return;
    localStorage.setItem(key, day);
    const tip = a.adapterType === 'B'
      ? '可在 agent 卡片的「模型」字段换更便宜的模型'
      : '建议在其产品内切换更便宜的模型';
    toast(`⚠ ${a.name} 今日已消耗 ${fmtNum(toks)} tokens · ${turns} 轮，${tip}`);
  } catch { /* ledger is advisory; never break chat over it */ }
}

// Global ledger panel: every agent's today/month tokens+turns, sorted by
// recent burn. Bridge agents (C class) legitimately have 0 tokens - show
// turns so they don't look dead. A grand-total row closes the table.
export async function openUsageModal() {
  const [u, agents, settings] = await Promise.all([api.getUsage(), api.listAgents(), api.getSettings()]);
  const warnTok = settings?.warnTokensDay > 0 ? settings.warnTokensDay : Infinity;
  const day = todayKey(), month = day.slice(0, 7);
  const rows = agents.map((a) => ({ a, d: usageDay(u, a.id, day), m: usageMonth(u, a.id, month) }))
    .filter((r) => r.d.toks || r.m.toks || r.d.turns || r.m.turns)
    .sort((x, y) => ((y.d.toks + y.m.toks) - (x.d.toks + x.m.toks)) || ((y.d.turns + y.m.turns) - (x.d.turns + x.m.turns)));
  const el = $('#usageList');
  if (!rows.length) { el.innerHTML = `<div class="usage-empty">还没有消耗记录 — 群里 @ 一次 agent 就会有。</div>`; }
  else {
    const sum = rows.reduce((s, r) => ({ d: s.d + r.d.toks, m: s.m + r.m.toks, dt: s.dt + r.d.turns, mt: s.mt + r.m.turns }), { d: 0, m: 0, dt: 0, mt: 0 });
    el.innerHTML = `<table class="usage-table"><thead><tr><th>agent</th><th>今日</th><th>本月</th></tr></thead><tbody>`
      + rows.map((r) => `<tr${r.d.toks >= warnTok ? ' class="over"' : ''}><td class="u-name">${esc(r.a.name)}</td><td>${fmtNum(r.d.toks)} tk · ${r.d.turns} 轮</td><td>${fmtNum(r.m.toks)} tk · ${r.m.turns} 轮</td></tr>`).join('')
      + `<tr class="u-sum"><td>合计</td><td>${fmtNum(sum.d)} tk · ${sum.dt} 轮</td><td>${fmtNum(sum.m)} tk · ${sum.mt} 轮</td></tr></tbody></table>`;
  }
  $('#usageModal').classList.remove('hidden');
}

// ---------------- POPOVER: agent status card (left-click avatar) ----------------
export let cardAgentId = null;
export function openAgentCard(id, anchorEl) {
  const a = findAgent(id); if (!a) return;
  cardAgentId = id;
  const acAv = $('#ac-av');
  if (a.avatar) {
    acAv.classList.add('img'); acAv.style.background = 'transparent'; acAv.style.borderColor = a.color;
    acAv.innerHTML = `<img src="${esc(a.avatar)}" alt="" />`;
  } else {
    acAv.classList.remove('img'); acAv.style.background = a.color; acAv.textContent = a.name[0];
  }
  $('#ac-name').textContent = a.name;
  const s = stateOf(a.id);
  $('#ac-status').className = 'pop-status ' + (s === 'idle' ? 'online' : s === 'offline' ? 'offline' : 'running');
  $('#ac-status-text').textContent = ST_LABEL[s];
  $('#ac-in-name').value = a.name;
  $('#ac-in-kind').value = a.kind === 'executor' ? 'executor' : 'advisor';
  $('#ac-in-notes').value = a.notes || '';
  $('#ac-cap').textContent = capabilityOf(a.adapterType);
  $('#ac-cap').className = 'ac-cap ' + capClass(a.adapterType);
  $('#ac-in-model').value = a.model; $('#ac-in-role').value = a.role; $('#ac-in-sys').value = a.system;
  $('#ac-in-rate').value = a.rateNote || '';
  // Usage lines: today + this month. Bridge agents show turns only - their
  // credit meter lives inside the product, tokens would be a lie.
  api.getUsage().then((u) => api.getSettings().then((st) => [u, st])).then(([u, st]) => {
    const el = $('#ac-usage'); if (!el) return;
    const day = todayKey(), month = day.slice(0, 7);
    const t = usageDay(u, id, day), m = usageMonth(u, id, month);
    const tPart = t.toks ? `${fmtNum(t.toks)} tokens · ` : '';
    const mPart = m.toks ? `${fmtNum(m.toks)} tokens · ` : '';
    el.textContent = `今日 ${tPart}${t.turns} 轮 ｜ 本月 ${mPart}${m.turns} 轮${a.rateNote ? `（${a.rateNote}）` : ''}`;
    el.classList.toggle('warn', !!(st?.warnTokensDay > 0 && t.toks >= st.warnTokensDay));
  }).catch(() => { const el = $('#ac-usage'); if (el) el.textContent = '消耗：—'; });
  const pop = $('#agentCard'); pop.classList.remove('hidden');
  const r = anchorEl.getBoundingClientRect();
  const w = 320, h = pop.offsetHeight || 320;
  let left = Math.min(r.left, window.innerWidth - w - 12);
  let top = r.bottom + 6; if (top + h > window.innerHeight) top = Math.max(12, r.top - h - 6);
  pop.style.left = Math.max(12, left) + 'px'; pop.style.top = top + 'px';
  $('#ac-save').onclick = async () => {
    await api.updateAgent(id, { name: $('#ac-in-name').value, model: $('#ac-in-model').value, role: $('#ac-in-role').value, system: $('#ac-in-sys').value, kind: $('#ac-in-kind').value, notes: $('#ac-in-notes').value, rateNote: $('#ac-in-rate').value });
    pop.classList.add('hidden'); if (curGroupId) selectGroup(curGroupId);
  };
  $('#ac-dm').onclick = async () => { const dm = await api.openDM(id); pop.classList.add('hidden'); await selectGroup(dm.id); };
}

// ---------------- CTX MENU: avatar right-click ----------------
export let ctxAgentId = null;
export function openCtxMenu(id, x, y) {
  ctxAgentId = id;
  const m = $('#ctxMenu'); m.classList.remove('hidden');
  m.style.left = Math.min(x, window.innerWidth - 170) + 'px';
  m.style.top = Math.min(y, window.innerHeight - 70) + 'px';
}
$$('#ctxMenu .ctx-item').forEach((item) => {
  item.onclick = async () => {
    const act = item.dataset.act;
    $('#ctxMenu').classList.add('hidden');
    if (!ctxAgentId) return;
    if (act === 'settings') { openAgentCard(ctxAgentId, $('#chatHead')); }
    else if (act === 'launch') {
      const a = findAgent(ctxAgentId);
      if (a) toggleAgent(a);
    }
  };
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#ctxMenu')) $('#ctxMenu').classList.add('hidden');
  if (!e.target.closest('#groupMenu') && !e.target.closest('.gmore')) $('#groupMenu').classList.add('hidden');
  if (!e.target.closest('#agentCard') && !e.target.closest('.av')) $('#agentCard').classList.add('hidden');
});

export function toastEl(msg) {
  const t = document.createElement('div');
  t.textContent = msg; t.style.cssText = 'position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:var(--panel3);color:var(--text);border:1px solid var(--border);padding:10px 16px;border-radius:9px;z-index:90;font-size:13px;max-width:70vw';
  document.body.appendChild(t); return t;
}
export function toast(msg) { const t = toastEl(msg); setTimeout(() => t.remove(), 2600); }

// ---------------- MODAL: consensus / negotiation ----------------
export async function openConsensusModal() {
  if (!curGroupId) { toast('请先选择一个群'); return; }
  const g = await api.getGroup(curGroupId);
  const members = g.memberIds || [];
  const box = $('#csMembers'); box.innerHTML = '';
  members.forEach((id) => {
    const a = findAgent(id); if (!a) return;
    const row = document.createElement('label'); row.className = 'member-row';
    row.innerHTML = `<input type="checkbox" data-id="${a.id}" checked/>
      ${avHtml(a)}<span class="mname">${esc(a.name)}</span>
      <span class="ac-cap ${capClass(a.adapterType)}" style="margin-left:auto">${capabilityOf(a.adapterType)}</span>`;
    box.appendChild(row);
  });
  $('#csTopic').value = '';
  $('#consensusModal').classList.remove('hidden');
}

export async function startConsensus() {
  const topic = $('#csTopic').value.trim();
  if (!topic) { toast('请填写议题'); return; }
  const ids = $$('#csMembers input[type=checkbox]').filter((c) => c.checked).map((c) => c.dataset.id);
  if (ids.length < 2) { toast('至少选择 2 个参与 agent'); return; }
  $('#consensusModal').classList.add('hidden');
  await api.deliberate(curGroupId, { topic, participantIds: ids });
  toast('协商已启动：黑盒提案 → 轮流改善 → 投票');
}
