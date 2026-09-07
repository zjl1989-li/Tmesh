// split of public/app.js (original section comment preserved below)
import { API, api } from './api.js';
import { t } from './i18n.js';
import { resetChatPane, selectGroup } from './center.js';
import { $, esc, ic } from './core.js';
import { notifyOn, ping, setNotifyOn, setSoundOn, soundOn } from './flags.js';
import { toast } from './modals.js';
import { curGroupId, renderGroups, setCurGroupId } from './state.js';
import { avHtml, openTaskPop, refreshAgents, trafficHtml } from './status.js';
import { WIZ_TYPES, openWizard } from './wizard.js';

// ---------------- MODAL: settings (agent registry) ----------------
// Observed capabilities come from the backend's tool-call tally, not from the
// hand-written skills tag. Empty means "never watched this one work yet".
export function observedHtml(observed) {
  const rows = Object.entries(observed || {}).sort((x, y) => y[1] - x[1]);
  if (!rows.length) return '<span class="skill muted">尚无记录</span>';
  return rows.map(([t, n]) => `<span class="skill obs" title="实际调用 ${n} 次">${esc(t)}<b>${n}</b></span>`).join('');
}

// Delegation spends an extra LLM turn per summon, so it is opt-in. The cost is
// printed on the switch itself - a toggle that silently spends money is a bad one.
export function delegationRow(settings) {
  const row = document.createElement('label');
  row.className = 'member-row delegate-row';
  row.innerHTML = `<input type="checkbox" ${settings?.delegation ? 'checked' : ''} />
    <span>允许 agent 互相点名（回复里 @名字）
    <b>每点名一次多花一轮调用，只传递一层，不会来回踢皮球</b></span>`;
  row.querySelector('input').onchange = (e) => api.setSettings({ delegation: e.target.checked });
  return row;
}

// ---------------- SETTINGS: agent registry + access entries ----------------
// Users only care about one axis: can this agent operate my computer?
// Adapter classes (A/B/C/D/E/W) are an internal detail — they are chosen by
// the backend probe and never shown in the UI.
export const LOCAL_CAPABLE = new Set(['A', 'C', 'D', 'E', 'G', 'W']);
export const capabilityOf = (type) => (LOCAL_CAPABLE.has(type) ? t('capLocal') : t('capCloud'));
export const capClass = (type) => (LOCAL_CAPABLE.has(type) ? 'local' : 'cloud');
// 接入类型小标签：WIZ_TYPES 的简短名，hover 显示完整说明。
export const TYPE_LABELS = { A: 'typeA', W: 'typeW', E: 'typeE', G: 'typeG', C: 'typeC', D: 'typeD', B: 'typeB' };
export const typeLabelOf = (ty) => { const k = TYPE_LABELS[ty]; return k ? t(k) : t('typeOther'); };
export const typeDescOf = (t) => { const w = WIZ_TYPES.find((x) => x.key === t); return w ? w.label : ''; };
// 按真实 config 判断实际接入通道（比类型键更准确：如 WorkBuddy 类型键是 W，
// 但本机走 cliPath 即 CLI 通道）。
export const channelOf = (a) => {
  const c = a.config || {};
  if (c.cliCmd || c.cliPath) return 'typeG';
  if (c.mcpServer) return 'typeE';
  if (c.bridge) return 'typeD';
  if (c.ports && c.ports.length) return 'typeA';
  if (c.localDir) return 'typeC';
  if (c.baseURL || c.apiBaseUrl) return 'typeB';
  return TYPE_LABELS[a.adapterType] || 'typeOther';
};
// 接入标签的能力排序（从强到弱）：以"操作本地电脑的能力"为核心标准
// （做任何项目都依赖操作本机能力）。本地程序/协议通道 > 弱通道的本机客户端
// > 纯工具 > 纯云端模型。归类不写死：channelOf 按实际 config 通道判断，
// 豆包/Codex 等以后走 CLI/ACP 时会自动落到对应档位。
export const CAP_ORDER = { typeA: 6, typeG: 5, typeW: 5, typeD: 4, typeE: 3, typeB: 2, typeC: 1 };
export const capRank = (a) => CAP_ORDER[channelOf(a)] || 0;
export let registrySort = localStorage.getItem('zjl_registry_sort') === 'cap' ? 'cap' : 'default'; // 'default' | 'cap'

// The only menu the user ever sees: four plain entries, no jargon groups.
export const SETUP_ENTRIES = [
  { icon: 'search', title: '本地 agent', sub: '扫描本机已装的 AI 客户端，勾选即接入', act: 'discover' },
  { icon: 'plug', title: 'MCP 服务 / CLI', sub: '接入 MCP 工具服务或本地命令行 agent', type: 'E' },
  { icon: 'cloud', title: '模型 API', sub: 'DeepSeek / Qwen / OpenAI 兼容等云端模型', type: 'B' },
  { icon: 'box', title: '其他', sub: '说不清是哪一类，手动描述它怎么连', act: 'manual' },
];

export function agentCard(a) {
  const on = a.enabled !== false; // absent flag => enabled by default
  // 合并开关：接入 + 本地服务启停，一个开关控制到底（避免与启停按钮重复）。
  // 开 = 已接入 且（无本地服务 或 服务在跑）；服务停了开关就自动显示为关。
  const la = a.config && a.config.launcher;
  const swOn = on && (!la || a.launched);
  const swTitle = la
    ? (swOn ? '退出接入并停止本地服务' : '接入并拉起本地服务')
    : (on ? '退出接入' : '重新接入');
  const card = document.createElement('div'); card.className = 'agent-card' + (on ? '' : ' off');
  card.innerHTML = `
    <div class="ac-top" title="点击展开 / 收起配置">
      <span class="ac-avhead">${avHtml(a)}</span>
      <span class="ac-name">${esc(a.name)}</span>${trafficHtml(a.id)}
      <span class="ac-cap ${capClass(a.adapterType)}">${capabilityOf(a.adapterType)}</span>
      <span class="ac-type" title="${esc(typeDescOf(a.adapterType))}">${t(channelOf(a))}</span>
      <label class="toggle" title="${swTitle}"><input type="checkbox" ${swOn ? 'checked' : ''} /><i></i></label>
      <span class="ac-edit">${ic('chevdown', 13, 13)}</span>
    </div>
    <div class="ac-role">${esc(a.role) || '<span class="ac-none">未填写说明</span>'}</div>
    <div class="ac-detail">
      <div class="ac-avrow">${avHtml(a, 'lg')}<button type="button" class="ac-avbtn">${ic('image', 12, 12)} 更换头像</button></div>
      <div class="field"><label>名称</label><input data-f="name" value="${esc(a.name)}" /></div>
      <div class="ac-grid">
        <div class="field"><label>角色 / 说明</label><input data-f="role" value="${esc(a.role)}" /></div>
        <div class="field"><label>模型</label><input data-f="model" value="${esc(a.model)}" /></div>
      </div>
      <label>系统提示词</label><textarea data-f="system">${esc(a.system)}</textarea>
      <label>已装技能（点击切换）</label>
      <div class="skills">${(a.skills || []).map((s) => `<span class="skill on" data-skill="${esc(s)}">${esc(s)}</span>`).join('') || '<span class="skill muted">未声明</span>'}</div>
      <label>实测能力（工具实际调用次数）</label>
      <div class="skills">${observedHtml(a.observed)}</div>
      <div class="ac-danger"><button type="button" class="ac-del">${ic('trash', 13, 13)} 删除</button></div>
    </div>
    <input type="file" accept="image/*" class="ac-avfile" hidden />`;
  card.querySelector('.ac-top').onclick = (e) => {
    if (e.target.closest('.toggle')) return; // the switch is its own control
    card.classList.toggle('open');
  };
  card.querySelectorAll('input,textarea').forEach((inp) => {
    if (inp.closest('.toggle') || inp.classList.contains('ac-avfile')) return;
    inp.onchange = () => api.updateAgent(a.id, { [inp.dataset.f]: inp.value });
  });
  // 开关 = 接入 + 本地服务联动：开→接入并拉起服务；关→退出接入并停服务。状态灯随服务启停由后端推送自动联动。
  card.querySelector('.toggle input').onchange = async (e) => {
    const want = e.target.checked;
    const ok = await api.updateAgent(a.id, { enabled: want }).then(() => true).catch(() => { e.target.checked = !e.target.checked; return false; });
    if (!ok) return;
    if (la) {
      if (want) await api.launchAgent(a.id).catch(() => {});
      else if (a.launched) await api.stopAgent(a.id).catch(() => {});
    }
    renderRegistry();
  };
  const fileInp = card.querySelector('.ac-avfile');
  fileInp.onchange = async () => {
    const f = fileInp.files && fileInp.files[0]; if (!f) return;
    if (f.size > 512 * 1024) { toast('头像图片请小于 512KB'); return; }
    const dataUrl = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f); });
    await api.updateAgent(a.id, { avatar: dataUrl }); renderRegistry();
  };
  card.querySelector('.ac-avbtn').onclick = () => fileInp.click();
  const del = card.querySelector('.ac-del');
  if (del) del.onclick = async () => {
    if (!confirm(`确定删除「${a.name}」？它会退出接入且无法撤销。`)) return;
    await api.deleteAgent(a.id);
    renderRegistry();
    await refreshAgents(); // stale agentsCache would keep painting its avatar
    // The agent just left every group server-side (store.deleteAgent cleans
    // memberIds); refresh whatever is on screen so the middle pane and the
    // group list stop showing it.
    if (curGroupId) {
      const g = await api.getGroup(curGroupId).catch(() => null);
      if (g) await selectGroup(curGroupId);
      else { setCurGroupId(null); resetChatPane(); }
    }
    await renderGroups();
  };
  const light = card.querySelector('.traffic');
  if (light) light.onclick = () => openTaskPop(a.id, light);
  return card;
}

export let regRefreshTimer = null;
// 服务状态变化（agent_status）时，若设置页打开则重新拉列表，让开关 / 计数
// 与真实服务状态同步。防抖避免高频事件下反复重建 DOM。
export function scheduleRegRefresh() {
  const modal = $('#settingsModal');
  if (!modal || modal.classList.contains('hidden')) return;
  clearTimeout(regRefreshTimer);
  regRefreshTimer = setTimeout(() => { renderRegistry().catch(() => {}); }, 400);
}

export async function renderRegistry() {
  const agents = await api.listAgents();
  // 默认：启用的在上、退出接入的沉底；「能力」模式：纯按接入标签能力从高到低排。
  let sorted;
  if (registrySort === 'cap') {
    sorted = [...agents].sort((x, y) => (capRank(y) - capRank(x)));
  } else {
    sorted = [...agents].sort((x, y) => ((x.enabled === false) - (y.enabled === false)));
  }
  const configured = document.createElement('div'); configured.className = 'reg-sec';
  // 计数 = 当前已接入配置的 agent 总数（本区块渲染全部已接入/已配置卡片，
  // 退出接入或服务停的都算已接入过的，沉底展示）。与卡片数量保持一致。
  const onCount = agents.length;
  configured.innerHTML = `<div class="reg-title">已接入 agent / 模型 <span class="reg-count">${onCount}</span>
    <span class="reg-sort">
      <button type="button" class="reg-sort-btn${registrySort === 'default' ? ' on' : ''}" data-sort="default" title="默认排序：启用在上、退出的沉底">默认</button>
      <button type="button" class="reg-sort-btn${registrySort === 'cap' ? ' on' : ''}" data-sort="cap" title="按操作本地电脑能力从高到低排序">能力</button>
    </span></div>`;
  configured.querySelectorAll('.reg-sort-btn').forEach((b) => {
    b.onclick = () => { registrySort = b.dataset.sort; localStorage.setItem('zjl_registry_sort', registrySort); renderRegistry(); };
  });
  if (!agents.length) {
    configured.insertAdjacentHTML('beforeend', '<div class="reg-empty">还没有接入任何 agent / 模型，从下面选一个入口开始。</div>');
  }
  sorted.forEach((a) => configured.appendChild(agentCard(a)));
  const box = $('#agentRegistry');
  const onboarding = box.querySelector('.reg-sec:last-child'); // keeps "接入新 agent" section below
  box.innerHTML = '';
  box.appendChild(configured);
  if (onboarding) box.appendChild(onboarding);
}

export async function openSettings() {
  const box = $('#agentRegistry'); box.innerHTML = '';
  // notification / sound preferences - two plain toggles, opt-in, remembered
  const prefs = document.createElement('div'); prefs.className = 'reg-sec';
  prefs.innerHTML = '<div class="reg-title">通知与提醒</div>';
  const mkPref = (title, get, flip) => {
    const r = document.createElement('div'); r.className = 'pref-row';
    const btn = document.createElement('button');
    const paint = () => { btn.textContent = get() ? '已开启' : '已关闭'; btn.classList.toggle('on', get()); };
    btn.className = 'pref-toggle'; paint();
    btn.onclick = async () => { if (await flip()) paint(); };
    r.innerHTML = `<span class="pref-name">${title}</span>`;
    r.appendChild(btn);
    return r;
  };
  prefs.appendChild(mkPref('桌面通知 · agent 回复时弹系统通知（后台群也会提醒）',
    () => notifyOn,
    async () => {
      if (notifyOn) { setNotifyOn(false); localStorage.setItem('zjl_notify', '0'); return true; }
      if (!('Notification' in window)) { toast('此浏览器不支持桌面通知'); return false; }
      const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (p !== 'granted') { toast('通知权限被拒绝，请在浏览器地址栏的权限设置里放开'); return false; }
      setNotifyOn(true); localStorage.setItem('zjl_notify', '1'); return true;
    }));
  prefs.appendChild(mkPref('提示音 · 新消息轻响一声',
    () => soundOn,
    () => { setSoundOn(!soundOn); localStorage.setItem('zjl_sound', soundOn ? '1' : '0'); if (soundOn) ping(); return true; }));
  box.appendChild(prefs);
  await renderRegistry();
  // onboarding: one flat grid of plain-language entries
  const add = document.createElement('div'); add.className = 'reg-sec';
  add.innerHTML = '<div class="reg-title">接入新 agent / 模型</div>';
  const grid = document.createElement('div'); grid.className = 'entry-grid';
  SETUP_ENTRIES.forEach((e) => {
    const c = document.createElement('div'); c.className = 'entry-card';
    c.innerHTML = `<div class="ec-ico">${ic(e.icon, 17, 17)}</div>
      <div class="ec-main"><div class="ec-title">${esc(e.title)}</div><div class="ec-sub">${esc(e.sub)}</div></div>
      <div class="ec-go">›</div>`;
    c.onclick = () => openWizard(e);
    grid.appendChild(c);
  });
  add.appendChild(grid);
  box.appendChild(add);
  $('#settingsModal').classList.remove('hidden');
}
