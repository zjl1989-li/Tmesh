// split of public/app.js (original section comment preserved below)
import { API, api, on } from './api.js';
import { selectGroup } from './center.js';
import { $, $$, esc, ic } from './core.js';
import { toast } from './modals.js';
import { capabilityOf, openSettings } from './settings.js';
import { curGroupId } from './state.js';
import { avHtml, refreshAgents } from './status.js';

// ---------------- WIZARD: user-driven agent onboarding ----------------
// The user picks an entry (local agent / MCP / model API / other) and we
// walk them through only the fields that entry needs. We never ask them to
// name an adapter class or hand-write a connection descriptor.
export const WIZ_TYPES = [
  { key: 'A', label: '本机跑的 agent 服务（如 DSH）', desc: '它自己带调用接口', cap: '可操作本机',
    fields: [{ f: 'ports', label: 'RPC 端口', ph: '3080', def: '3080' }],
    assist: '我在配置一个多 agent 协作工具，需要接入本机运行的「DeepSeek Harness (DSH)」agent 服务。请帮我：\n1. 找到 DSH 的 RPC 服务端口（默认 3080），确认该端口上的服务是否在运行；\n2. 如果实际端口不是 3080，探测出真实端口。\n只回复一段 JSON（不要多余文字、不要 markdown 代码块）：\n{"ports": [实际端口号]}' },
  { key: 'W', label: '桌面 AI 客户端（WorkBuddy / CodeBuddy）', desc: '装在本机、能替你动手', cap: '可操作本机',
    fields: [{ f: 'apiKey', label: 'API Key（可选，留空自动探测 ACP 端口）', ph: 'CODEBUDDY_API_KEY', def: '' }],
    assist: '我在配置一个多 agent 协作工具，需要接入本机的「WorkBuddy / CodeBuddy」桌面 AI。请帮我探测：\n1. 环境变量 CODEBUDDY_API_KEY 是否已设置？已设置则返回其值，未设置则返回 null；\n2. WorkBuddy 的 ACP 服务监听的本地端口（如有）。\n只回复一段 JSON（不要多余文字、不要 markdown 代码块）：\n{"apiKey": "值或null", "port": "端口或null"}' },
  { key: 'E', label: 'MCP 服务', desc: '通过 MCP 提供工具能力', cap: '可操作本机',
    modes: [{ key: 'E', label: 'MCP 服务', hint: '接入 MCP 工具服务' }, { key: 'G', label: 'CLI 工具', hint: '接入命令行 agent' }],
    fields: [{ f: 'mcpServer', label: 'MCP server 命令 或 SSE 地址', ph: 'npx -y @modelcontextprotocol/server-...', def: '' }],
    assist: '我在配置一个多 agent 协作工具，需要接入一个 MCP 服务来提供工具能力。请帮我：\n1. 列出本机已安装、或你确认可用的 MCP server；\n2. 给出其中一个的启动命令（npx / node 命令）或 SSE 地址。\n只回复一段 JSON（不要多余文字、不要 markdown 代码块）：\n{"mcpServer": "完整的启动命令或地址"}' },
  { key: 'G', label: 'CLI 工具（命令行 agent）', desc: '本机命令行的 AI agent', cap: '可操作本机',
    fields: [{ f: 'cliCmd', label: '命令或可执行文件路径', ph: 'codex 或 D:\\tools\\agent.exe', def: '' },
             { f: 'cliArgs', label: '附加参数（可选，用 {prompt} 放提示词，留空则提示词追加在末尾）', ph: 'exec --full-auto {prompt}', def: '' }],
    assist: '我在配置一个多 agent 协作工具，需要接入一个本地「CLI 工具 / 命令行 agent」（如 Codex CLI、CodeBuddy CLI 等）。请帮我：\n1. 找到本机可用的 CLI 可执行命令或完整路径（cliCmd）；\n2. 给出调用它的附加参数模板（cliArgs，用 {prompt} 表示提示词位置，不填则提示词追加在末尾）。\n只回复一段 JSON（不要多余文字、不要 markdown 代码块）：\n{"cliCmd": "命令或路径", "cliArgs": "参数模板或null"}' },
  { key: 'C', label: '文件桥（本地目录互传）', desc: '用 inbox / outbox 目录和它通信', cap: '可操作本机',
    fields: [{ f: 'localDir', label: '桥接目录', ph: 'bridge/myagent', def: '' }],
    assist: '我在配置一个多 agent 协作工具，需要接入一个「文件桥」用于本地目录互传消息。请帮我：\n1. 确定一个用于消息互传的目录（建议在项目 bridge/ 下）；\n2. 给出它的绝对路径。\n只回复一段 JSON（不要多余文字、不要 markdown 代码块）：\n{"localDir": "目录绝对路径"}' },
  { key: 'D', label: '没有接口的桌面 AI（豆包 / Codex 等）', desc: '靠文件或界面转发消息', cap: '可操作本机',
    fields: [{ f: 'bridge', label: '产品标识', ph: 'doubao', def: '' }],
    assist: '我在配置一个多 agent 协作工具，需要接入本机一个「没有 API 的桌面 AI」（豆包 / Codex / 通义 等）。请帮我：\n1. 识别本机已安装的是哪一款；\n2. 给出它的产品标识（doubao / qwen / kuaishou / codex 之一）。\n只回复一段 JSON（不要多余文字、不要 markdown 代码块）：\n{"bridge": "产品标识"}' },
  { key: 'B', label: '云端模型 API', desc: '给它一个模型身份', cap: '仅云端',
    fields: [{ f: 'baseURL', label: 'API 地址', ph: 'https://api.deepseek.com/v1', def: '' },
             { f: 'apiKey', label: 'API Key（可留空，用环境变量 DEEPSEEK_API_KEY）', ph: 'sk-...', def: '' },
             { f: 'model', label: '模型名', ph: 'deepseek-chat', def: '' }],
    assist: '我在配置一个多 agent 协作工具，需要接入一个云端大模型 API（OpenAI 兼容）。请帮我：\n1. 给出 API 地址 baseURL（例如 https://api.deepseek.com/v1）；\n2. 给出 API Key（你已知的，没有就填 null，我自己填）；\n3. 推荐一个模型名 model。\n只回复一段 JSON（不要多余文字、不要 markdown 代码块）：\n{"baseURL": "https://...", "apiKey": "sk-...或null", "model": "模型名"}' },
];
export let wiz = null;
export let wizSeq = 0;
export function wizReset(entry) { wiz = { entry: entry || null, flow: [], step: null, discovered: [], chosenType: null, config: {}, picks: [], skipped: 0, connectChoices: {}, proxyChoices: {}, seq: ++wizSeq }; }
export function showWizStep(step) {
  // Backing out of the first step returns the user to the settings menu.
  if (step === 'settings') { $('#wizardModal').classList.add('hidden'); openSettings(); return; }
  wiz.step = step;
  $$('#wizardModal .wstep').forEach((s) => s.classList.add('hidden'));
  const el = $(`#wizardModal .wstep[data-step="${step}"]`);
  if (el) el.classList.remove('hidden');
}
export function wizBack() {
  const i = wiz.flow.indexOf(wiz.step);
  showWizStep(i > 0 ? wiz.flow[i - 1] : 'settings');
}
export const WIZ_TITLES = { discover: '本地 agent', E: 'MCP 服务 / CLI', B: '模型 API', manual: '手动接入' };
export function openWizard(entry) {
  wizReset(entry);
  $('#wizTitle').textContent = WIZ_TITLES[entry && entry.act === 'discover' ? 'discover' : (entry ? entry.type : '')] || WIZ_TITLES.manual;
  $('#wizardModal').classList.remove('hidden');
  if (!entry || entry.act === 'manual') { wiz.flow = ['kind', 'cfg']; wizManual(); return; }
  if (entry.act === 'discover') { wiz.flow = ['pick']; wizDiscover(); return; }
  wiz.flow = ['cfg'];
  wiz.chosenType = WIZ_TYPES.find((t) => t.key === entry.type);
  wizRenderFields(); showWizStep('cfg');
}
export async function wizDiscover() {
  const my = wiz.seq;
  const list = await api.discoverAgents().catch(() => []);
  if (!wiz || wiz.seq !== my || wiz.flow[0] !== 'pick') return; // user switched away while scanning
  wiz.discovered = list;
  // 已接入的 agent 标「已接入」并置灰不勾选，避免与"未接入"混淆。
  const existing = new Set((await api.listAgents().catch(() => [])).map((a) => a.name));
  const box = $('#discList'); box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = '<div class="wiz-empty">本机未检测到已知 agent。可回到上一页选「其他」手动接入，或先确认程序已安装。</div>';
  }
  list.forEach((a, i) => {
    const joined = existing.has(a.name);
    const card = document.createElement('label'); card.className = 'wiz-card' + (joined ? ' joined' : '');
    card.innerHTML = `<input type="checkbox" data-i="${i}" ${joined ? '' : 'checked'} ${joined ? 'disabled' : ''} />
      <span class="wc-av">${avHtml({ name: a.name, avatar: a.avatar, color: '#888888' }, 'wc')}</span>
      <div class="wc-main"><div class="wc-name">${esc(a.name)}</div><div class="wc-meta">${joined ? '已接入' : (a.running ? '运行中' : '已安装')} · ${capabilityOf(a.suggestedType)}</div></div>
      <div class="wc-path" title="${esc((a.paths || []).join('\n'))}">${esc((a.paths || []).slice(0, 1).join(''))}</div>`;
    box.appendChild(card);
  });
  renderWizAssistHelper($('#assistDiscover'), 'discover');
  showWizStep('pick');
}
// Assist cards ask the user's local AI to wire up the agent directly by
// calling the backend API — no JSON round-trip for the user. The API base is
// derived from the page's own origin, so any port/deployment works.
export function assistSoftware() {
  return '我在配置「tmesh」——一个在本机运行的多 agent 协作聊天工具（界面 ' + location.origin + '）。它把多个 AI agent 接入同一个群聊，让它们协作对话、共享任务。';
}
export function assistTypes() {
  return '可用的接入类型与技术：\nA 本机 agent 服务：自带 RPC HTTP 接口（如 DSH 默认端口 3080），功能最完整\nW 桌面 AI 客户端（WorkBuddy / CodeBuddy）：经 API Key 或本机 ACP 端口连接\nE MCP 服务：经 npx / node 启动命令或 SSE 地址提供工具能力\nG CLI 工具：经命令行命令 + 参数模板调用\nC 文件桥：经 inbox / outbox 目录互传消息\nD 无接口桌面 AI（豆包 / Codex）：经产品标识 + 文件桥 / 桌面转发\nB 云端模型 API：OpenAI 兼容接口（baseURL + apiKey + model）';
}
export function assistPick() {
  return '请探测目标 agent 的实际连接方式并选择最匹配类型；有多种方式时优先功能最完整的（有 RPC / API 接口优先，其次 MCP / CLI，最后才用文件桥 / 桌面转发）。';
}
export function assistCreate() {
  return '确定后调用接口创建：\nPOST ' + location.origin + '/api/agents\nContent-Type: application/json\nbody: { "name": "显示名称", "adapterType": "类型键", "config": { "该类型字段": "值" } }\n\n接入成功直接回复「接入成功：<名称>」，失败说明原因。';
}
export function discoverAssistPrompt() {
  const lines = (wiz.discovered || []).map((a) => `- ${a.name}（建议：${capabilityOf(a.suggestedType)}，路径 ${(a.paths || []).join('; ') || '未知'}）`).join('\n');
  return assistSoftware() + '现在要接入一个本机 agent。\n\n本机检测到以下候选（部分自动接入可能失败，请逐个确认真实接入方式）：\n' +
    (lines || '- （列表为空，请直接探测本机已装的 agent）') + '\n\n' +
    assistTypes() + '\n\n' + assistPick() + '\n\n' + assistCreate();
}
export function kindAssistPrompt() {
  return assistSoftware() + '我不确定要接入的 agent 属于哪种类型，请你探测本机已装的 AI / agent（豆包、Codex、WorkBuddy、DSH、CLI 工具、MCP 服务等），检查安装路径与启动方式，并判断它属于哪种类型。\n\n' +
    assistTypes() + '\n\n' + assistPick() + '\n\n' + assistCreate();
}
export function mcpCliAssistPrompt() {
  return assistSoftware() + '现在要接入一个 MCP 服务或 CLI 工具，让群里的 agent 能调用它的能力。\n\n请探测本机可用的 MCP 服务（已装的 npx / npm 包、SSE 服务）或 CLI 工具（PATH 里的命令、已装程序），选择最合适的一个。\n\n接入方式：\nE MCP 服务：字段 mcpServer = 启动命令（如 npx -y @modelcontextprotocol/server-...）或 SSE 地址\nG CLI 工具：字段 cliCmd = 命令或可执行文件路径；cliArgs = 参数模板（用 {prompt} 放提示词，可省略）\n\n' + assistCreate();
}
export function modelApiAssistPrompt() {
  return assistSoftware() + '现在要接入一个云端大模型 API，作为群里的一个 agent。\n\n请探测本机可用的模型 API 配置（如 ~/.opencodereview/config.json 中的 llm.auth_token、环境变量 DEEPSEEK_API_KEY 等），给出可用的一套。\n\n接入类型 B（云端模型 API），字段：\nbaseURL = API 地址（如 https://api.deepseek.com/v1）\napiKey = API Key（没有就留空，服务端会自动用环境变量）\nmodel = 模型名（如 deepseek-chat）\n\n' + assistCreate();
}
export function typeAssistPrompt(t) {
  if (t.key === 'E' || t.key === 'G') return mcpCliAssistPrompt();
  if (t.key === 'B') return modelApiAssistPrompt();
  const fieldDescs = t.fields.map((f) => `${f.f} = ${f.label}`).join('；');
  return assistSoftware() + `已确定要接入的类型是「${t.label}」（${t.desc}），创建时 adapterType 用「${t.key}」。\n该类型需要填的连接字段（能探测到就填）：${fieldDescs}\n\n` + assistPick() + '\n\n' + assistCreate();
}
export function copyText(text) {
  const ok = navigator.clipboard && navigator.clipboard.writeText(text);
  if (ok) navigator.clipboard.writeText(text).then(() => toast('提示词已复制')).catch(() => fallbackCopy(text));
  else fallbackCopy(text);
}
export function renderWizAssistHelper(box, mode) {
  if (!box) return;
  box.innerHTML = '';
  let prompt, title, refresh;
  if (mode === 'discover') {
    prompt = discoverAssistPrompt();
    title = '接入失败？让本机 AI 直接接入';
    refresh = () => wizDiscover();
  } else {
    prompt = kindAssistPrompt();
    title = '不清楚用哪种？让本机 AI 直接接入';
    refresh = () => wizManual();
  }
  const card = document.createElement('div'); card.className = 'wiz-assist';
  card.innerHTML = `
    <div class="wa-head"><span>${title}</span>
      <button type="button" class="wa-copy">${ic('clipboard', 12, 12)} 复制提示词</button></div>
    <div class="wa-desc">把提示词发给本机已装的 AI（豆包 / WorkBuddy / Codex 等），它会直接探测本机并调用接口帮你完成接入。完成后点「刷新列表」即可看到已接入的 agent。</div>
    <button type="button" class="wa-refresh">刷新列表</button>`;
  card.querySelector('.wa-copy').onclick = () => copyText(prompt);
  card.querySelector('.wa-refresh').onclick = () => { refresh(); refreshAgents(); toast('已刷新'); };
  box.appendChild(card);
}
export function wizManual() {
  const box = $('#typeList'); box.innerHTML = '';
  WIZ_TYPES.forEach((t) => {
    const card = document.createElement('div'); card.className = 'wiz-card wiz-type';
    card.innerHTML = `<div class="wc-main"><div class="wc-name">${esc(t.label)}</div><div class="wc-meta">${esc(t.desc)} · ${capabilityOf(t.key)}</div></div>`;
    card.onclick = () => { wiz.chosenType = t; wizRenderFields(); showWizStep('cfg'); };
    box.appendChild(card);
  });
  renderWizAssistHelper($('#assistKind'), 'kind');
  showWizStep('kind');
}
export function wizRenderFields() {
  const t = wiz.chosenType; if (!t) return;
  const box = $('#fieldList'); box.innerHTML = '';
  if (t.modes) renderWizModes(t, box);
  t.fields.forEach((f) => {
    const wrap = document.createElement('div'); wrap.className = 'field';
    wrap.innerHTML = `<label>${esc(f.label)}</label><input data-f="${f.f}" placeholder="${esc(f.ph)}" value="${esc(f.def || '')}" />`;
    const inp = wrap.querySelector('input');
    inp.oninput = () => { wiz.config[f.f] = inp.value.trim(); wizProbe(); };
    box.appendChild(wrap);
  });
  // "Let a local AI wire this up": the agent probes the machine and creates
  // the agent via the backend API directly — no JSON round-trip for the user.
  const as = $('#assistBox');
  if (as) {
    as.innerHTML = '';
    if (t.assist) {
      const card = document.createElement('div'); card.className = 'wiz-assist';
      // 概念统一：接入模型 API 是"接入云端模型"，其他类型是"接入某类 agent"
      const verb = t.key === 'B' ? '接入云端模型' : `接入「${esc(t.label)}」`;
      card.innerHTML = `
        <div class="wa-head"><span>让本机 AI 直接帮你接入</span>
          <button type="button" class="wa-copy">${ic('clipboard', 12, 12)} 复制提示词</button></div>
        <div class="wa-desc">把提示词发给本机已装的 AI（豆包 / WorkBuddy / Codex 等），它会直接探测本机并调用接口帮你${verb}。完成后点「刷新列表」即可看到。也可以手动填写上方字段。</div>
        <button type="button" class="wa-refresh">刷新列表</button>`;
      card.querySelector('.wa-copy').onclick = () => copyText(typeAssistPrompt(t));
      card.querySelector('.wa-refresh').onclick = () => { refreshAgents(); toast('已刷新'); };
      as.appendChild(card);
    }
  }
  $('#probeHint').textContent = '';
}
export function renderWizModes(t, box) {
  const m = document.createElement('div'); m.className = 'wiz-modes';
  m.innerHTML = `<span class="wm-title">接入方式</span>` + t.modes.map((x) =>
    `<button type="button" class="wm-btn${x.key === wiz.chosenType.key ? ' on' : ''}" data-m="${x.key}">${esc(x.label)}</button>`).join('');
  m.querySelectorAll('.wm-btn').forEach((b) => b.onclick = () => {
    const nx = WIZ_TYPES.find((z) => z.key === b.dataset.m);
    if (nx && nx.key !== wiz.chosenType.key) { wiz.chosenType = nx; wizRenderFields(); }
  });
  box.appendChild(m);
}
export function fallbackCopy(text) {
  const ta = document.createElement('textarea'); ta.value = text;
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('提示词已复制'); } catch { toast('复制失败，请手动选中复制'); }
  document.body.removeChild(ta);
}
export async function wizProbe() {
  const cfg = { ...wiz.config };
  if (wiz.chosenType) cfg.adapterType = wiz.chosenType.key;
  const hint = $('#probeHint');
  try {
    const p = await api.probeAdapter(cfg, true);
    const ok = p.type === wiz.chosenType.key;
    hint.className = 'wiz-probe ' + (ok ? 'ok' : 'warn');
    // capability, not adapter class — the user never sees A/B/C/D/E/W
    let html = ok ? ic('check', 11, 11) + ' 可以接入' : ic('warn', 11, 11) + ' 按已填信息，它会被当成「' + esc(capabilityOf(p.type)) + '」的 agent';
    // G class: the cheap check only proves the binary exists - run one real
    // roundtrip so a dead model path (proxy down, key expired) shows NOW,
    // not as a mystery 502 on the first message.
    if (ok && p.type === 'G' && p.deep) {
      html += p.deep.ok
        ? ' · 模型通路 <b>✅ 通</b>（' + (p.deep.ms / 1000).toFixed(1) + 's）'
        : ' · 模型通路 <b>❌ 不通</b>：' + esc(String(p.deep.note || '').slice(0, 80));
      hint.className = 'wiz-probe ' + (p.deep.ok ? 'ok' : 'warn');
    }
    hint.innerHTML = html;
  } catch { hint.textContent = ''; }
}
export async function wizOnboardDiscovered() {
  const existing = await api.listAgents();
  const names = new Set(existing.map((a) => a.name));
  const picks = $$('#discList input[type=checkbox]:checked').map((c) => wiz.discovered[Number(c.dataset.i)]);
  if (!picks.length) { toast('请至少勾选一个'); return; }
  wiz.picks = picks.filter((a) => !names.has(a.name));
  wiz.skipped = picks.length - wiz.picks.length;
  // Foreign agents pop a connect-mode card first: official account vs domestic
  // proxy. With a proxy picked, the backend spins up the proxy, waits for its
  // port, then silently launches the app — so we ask before creating.
  const asking = wiz.picks.filter((a) => a.connect);
  if (asking.length) { renderConnectCard(asking); $('#connectModal').classList.remove('hidden'); return; }
  await wizCreatePicks();
}
export function renderConnectCard(asking) {
  const box = $('#connectCardList'); box.innerHTML = '';
  asking.forEach((a) => {
    const apps = a.connect.proxyApps || [];
    wiz.connectChoices[a.name] = wiz.connectChoices[a.name] || (apps.length ? 'proxy' : 'official');
    wiz.proxyChoices[a.name] = wiz.proxyChoices[a.name] || (apps[0] && apps[0].key) || null;
    const sec = document.createElement('div'); sec.className = 'connect-group';
    sec.innerHTML = `<div class="section-label" style="padding-left:0">${esc(a.name)}</div>
      <div class="cc-q">这个 agent 怎么连模型？</div>`;
    const mkMode = (key, label, desc, disabled) => {
      const row = document.createElement('label'); row.className = 'wiz-card';
      row.innerHTML = `<input type="radio" name="cc-${esc(a.name)}" value="${key}" ${key === wiz.connectChoices[a.name] ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
        <div class="wc-main"><div class="wc-name">${esc(label)}${disabled ? '（未检测到代理软件）' : ''}</div><div class="wc-meta">${esc(desc)}</div></div>`;
      row.querySelector('input').onchange = () => {
        wiz.connectChoices[a.name] = key;
        sec.querySelectorAll('.proxy-sub').forEach((el) => el.classList.toggle('hidden', key !== 'proxy'));
      };
      return row;
    };
    if ((a.connect.modes || []).some((m) => m.key === 'cli')) {
      sec.appendChild(mkMode('cli', 'CLI 直连（codex exec）', '每条消息跑一轮 codex exec，模型/代理由 ~/.codex/config.toml 决定'));
    }
    sec.appendChild(mkMode('official', '直连官方模型', '用自己的官方账号，直接拉起主程序静默运行'));
    sec.appendChild(mkMode('proxy', '走代理软件接国内模型', apps.length ? `已检测到 ${apps.length} 个代理软件，接入后自动拉起` : '', !apps.length));
    if (apps.length) {
      const sub = document.createElement('div'); sub.className = 'proxy-sub' + (wiz.connectChoices[a.name] === 'proxy' ? '' : ' hidden');
      sub.innerHTML = '<div class="wc-meta" style="padding:2px 0">选择要拉起的代理软件：</div>';
      apps.forEach((p) => {
        const row = document.createElement('label'); row.className = 'wiz-card';
        row.innerHTML = `<input type="radio" name="pp-${esc(a.name)}" value="${p.key}" ${p.key === wiz.proxyChoices[a.name] ? 'checked' : ''} />
          <div class="wc-main"><div class="wc-name">${esc(p.name)}</div><div class="wc-meta">${p.selfHosted ? '代理内置于主程序，拉起即就绪（端口 ' + p.port + '）' : '独立程序，先拉代理再拉主程序（端口 ' + p.port + '）'}</div></div>`;
        row.querySelector('input').onchange = () => { wiz.proxyChoices[a.name] = p.key; };
        sub.appendChild(row);
      });
      sec.appendChild(sub);
    }
    box.appendChild(sec);
  });
}
export async function wizConnectConfirm() {
  let added = 0;
  const launches = [];
  for (const a of wiz.picks) {
    const cfg = { ...(a.prefill || {}) };
    let type = a.suggestedType;
    let wantLaunch = false;
    if (a.connect) {
      cfg.connectMode = wiz.connectChoices[a.name] || 'official';
      if (cfg.connectMode === 'proxy') { cfg.proxyApp = wiz.proxyChoices[a.name] || undefined; wantLaunch = true; }
      if (cfg.connectMode === 'cli') {
        // G class: one `codex exec` turn per message. No launcher, no
        // persistent service — codex resolves model + proxy from its own
        // ~/.codex/config.toml (codex++ local proxy at 127.0.0.1:57321).
        type = 'G';
        delete cfg.bridge; delete cfg.launcherExe;
        cfg.cliCmd = 'codex';
        cfg.cliArgs = ['exec', '--skip-git-repo-check', '{prompt}'];
        cfg.outFileFlag = '-o';
        cfg.timeoutMs = 300000;
      }
    }
    const created = await api.createAgent({
      name: a.name, color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'),
      avatar: a.avatar || undefined, adapterType: type, role: a.notes || '',
      model: (a.prefill && a.prefill.model) || 'deepseek-chat', skills: [], system: '你是一个乐于助人的智能体。',
      status: 'online', guiPath: '', config: cfg,
    });
    added++;
    // Proxy mode: spin up the proxy first, then silently launch the app.
    if (wantLaunch && created && created.id) launches.push(api.launchAgent(created.id).catch(() => {}));
  }
  await Promise.all(launches);
  toast(`已接入 ${added} 个${wiz.skipped ? `，跳过 ${wiz.skipped} 个已存在` : ''}${wantLaunch ? '' : ''}`);
  $('#connectModal').classList.add('hidden');
  $('#wizardModal').classList.add('hidden');
  await refreshAgents(); if (curGroupId) selectGroup(curGroupId);
}
export async function wizCreatePicks() {
  let added = 0;
  for (const a of wiz.picks) {
    await api.createAgent({
      name: a.name, color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'),
      avatar: a.avatar || undefined, // start with the agent's own icon when we found one
      adapterType: a.suggestedType, role: a.notes || '', model: (a.prefill && a.prefill.model) || 'deepseek-chat',
      skills: [], system: '你是一个乐于助人的智能体。', status: 'online', guiPath: '',
      config: { ...(a.prefill || {}) }, // connect mode is auto-resolved by the backend
    });
    added++;
  }
  toast(`已接入 ${added} 个${wiz.skipped ? `，跳过 ${wiz.skipped} 个已存在` : ''}`);
  $('#wizardModal').classList.add('hidden');
  await refreshAgents(); if (curGroupId) selectGroup(curGroupId);
}
export async function wizSave() {
  const t = wiz.chosenType; if (!t) return;
  const cfg = { ...wiz.config };
  const existing = await api.listAgents();
  // Name is auto-derived from what was configured; rename later in the card.
  let name = defaultWizName(t, cfg);
  if (existing.some((a) => a.name === name)) {
    let n = 2; while (existing.some((a) => a.name === `${name} ${n}`)) n++;
    name = `${name} ${n}`;
  }
  await api.createAgent({
    name, color: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'),
    adapterType: t.key, role: '', model: cfg.model || 'deepseek-chat',
    skills: [], system: '你是一个乐于助人的智能体。', status: 'online', guiPath: '', config: cfg,
  });
  toast('已接入：' + name);
  $('#wizardModal').classList.add('hidden');
  await refreshAgents(); if (curGroupId) selectGroup(curGroupId);
}
export function defaultWizName(t, cfg) {
  const tail = (p) => { const s = String(p).replace(/[\\/]+$/, ''); const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/')); return i >= 0 ? s.slice(i + 1) : s; };
  const noExt = (p) => String(p).replace(/\.(exe|bat|cmd|ps1|js)$/i, '');
  if (t.key === 'G' && cfg.cliCmd) return noExt(tail(cfg.cliCmd));
  if (t.key === 'B' && cfg.model) return cfg.model;
  if (t.key === 'E' && cfg.mcpServer) {
    const toks = String(cfg.mcpServer).trim().split(/\s+/);
    const last = tail(toks[toks.length - 1] || '').replace(/[:,].*$/, '');
    return last && !/^(npx|node|yarn|pnpm|uvx|deno)$/i.test(last) ? last : 'MCP 服务';
  }
  if (t.key === 'C' && cfg.localDir) return tail(cfg.localDir);
  if (t.key === 'D' && cfg.bridge) return cfg.bridge;
  return t.label;
}
