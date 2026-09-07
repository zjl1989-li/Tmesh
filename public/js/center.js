// split of public/app.js (original section comment preserved below)
import { api, on, subscribe } from './api.js';
import { $, USER, dayLabel, esc, fmtTime, ic, lastMsg, mdEsc, renderMd, senderKey, setLastMsg, setStickBottom, stickBottom, syncStick } from './core.js';
import { openAgentCard, openCtxMenu, toast } from './modals.js';
import { capabilityOf, renderRegistry } from './settings.js';
import { t } from './i18n.js';
import { closePreview, renderSpace } from './space.js';
import { curGroupData, curGroupId, renderGroups, setCurGroupData, setCurGroupId } from './state.js';
import { avHtml, findAgent, openTaskPop, paintAllTraffic, refreshAgents, trafficHtml } from './status.js';

// ---------------- auto-capture artifacts from agent output ----------------
// agent 在回复 / 工具结果里给出的文件路径、图片、URL，自动登记成群空间产物，
// 落回右栏分类（参照 WorkBuddy：agent 产出的文件会进 workspace/文件区）。
export const EXT_KIND = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image',
  mp4: 'media', mov: 'media', webm: 'media', avi: 'media',
  mp3: 'media', wav: 'media', m4a: 'media', ogg: 'media',
  md: 'file', txt: 'file', pdf: 'file', doc: 'file', docx: 'file',
  js: 'file', ts: 'file', py: 'file', json: 'file', css: 'file', html: 'file', yaml: 'file', yml: 'file',
};
export const seenArt = {}; // groupId -> Set("name|ownerId")
// groupId -> Map(msgId -> Set(path)) : paths an agent claimed that do not exist
// on disk. Kept out of the artefact list on purpose -- but silently dropping
// them means a hallucinated deliverable is indistinguishable from a quiet UI.
export const missingArt = {};

export function markMissing(groupId, msgId, path) {
  if (!groupId || !msgId) return;
  const g = missingArt[groupId] || (missingArt[groupId] = new Map());
  const s = g.get(msgId) || new Set();
  s.add(path); g.set(msgId, s);
  renderMissingChip(groupId, msgId);
}

export function renderMissingChip(groupId, msgId) {
  if (curGroupId !== groupId) return;
  const host = document.querySelector(`.msg[data-mid="${msgId}"]`);
  if (!host) return;
  const paths = [...(missingArt[groupId].get(msgId) || [])];
  let chip = host.querySelector('.art-missing');
  if (!chip) { chip = document.createElement('div'); chip.className = 'art-missing'; host.appendChild(chip); }
  chip.innerHTML = `${ic('warn', 11, 11)} 这里提到的 ${paths.length} 个文件在磁盘上不存在，未登记为产物：`
    + paths.slice(0, 3).map((p) => `<code>${esc(p)}</code>`).join('、')
    + (paths.length > 3 ? ` 等 ${paths.length} 个` : '');
}

export function addHit(map, src, kind) {
  if (!src) return;
  if (!map.has(src)) map.set(src, { kind: kind || null });
  else if (kind && !map.get(src).kind) map.get(src).kind = kind;
}

export function captureArtifacts(groupId, agentId, text, msgId) {
  if (!groupId || !agentId || !text) return;
  const a = findAgent(agentId);
  const owner = a ? a.id : (agentId === 'user' ? 'user' : agentId);
  const color = a ? (a.colorTag || a.color) : (owner === 'user' ? USER.color : '#888');
  const hits = new Map();
  let m;
  const reMd = /!\[[^\]]*\]\(([^)\s]+)\)/g;            // markdown image
  while ((m = reMd.exec(text))) addHit(hits, m[1], 'image');
  const reUrl = /https?:\/\/[^\s)]+\.([A-Za-z0-9]{1,8})(?:\?[^)\s]*)?/g; // url with ext
  while ((m = reUrl.exec(text))) addHit(hits, m[0], EXT_KIND[m[1].toLowerCase()] || null);
  // The middle segment must allow separators. Without it only `D:\file.png`
  // matched, so every real path (D:\Projects\x\y.png) was silently skipped
  // while shallow junk scraped out of prose still got registered.
  const rePath = /(?:[A-Za-z]:[\\/](?:[\w.\-]+[\\/])*|\/(?:[\w.\-]+\/)+)[\w.\-]+\.([A-Za-z0-9]{1,8})/g; // file path
  while ((m = rePath.exec(text))) addHit(hits, m[0], EXT_KIND[m[1].toLowerCase()] || 'file');
  if (!hits.size) return;
  seenArt[groupId] = seenArt[groupId] || new Set();
  hits.forEach((h, src) => {
    const name = src.split(/[\\/]/).pop() || src;
    const key = name + '|' + owner;
    if (seenArt[groupId].has(key)) return;
    seenArt[groupId].add(key);
    api.addArtifact(groupId, { name, kind: h.kind || 'file', ownerId: owner, colorTag: color, src })
      .catch((e) => { if (e.status === 422 && e.reason === 'file not found') markMissing(groupId, msgId, src); });
  });
}

// ---------------- CENTER ----------------
// Clear the middle chat pane + right space pane when nothing is selected
// (group deleted / archived, or the selected group vanished server-side).
// Without this, stale members/messages masquerade as a live group.
export function resetChatPane() {
  setCurGroupData(null);
  $('#convTitle').textContent = '选择一个群';
  const av = $('#memberAvatars'); if (av) av.innerHTML = '';
  const box = $('#messages'); if (box) box.innerHTML = '<div class="empty">从左侧选择一个群开始聊天</div>';
  renderSendTarget({ memberIds: [] });
  renderNegotiation(null);
  renderStageBar(null);
  const sp = $('#spaceBody'); if (sp) sp.innerHTML = '';
}

export async function selectGroup(id) {
  setCurGroupId(id);
  windowCount = PAGE_SIZE; // each group starts at the newest page
  closePreview();
  api.subscribe(id);
  const g = await api.getGroup(id);
  setCurGroupData(g);
  $('#convTitle').textContent = g.name;
  renderMembers(g);
  renderMessages(g);
  renderSpace(g);
  renderSendTarget(g);
  renderNegotiation(null);
  renderStageBar(g);
  taskMode = false;
  const tmBtn = $('#btnTaskMode'); if (tmBtn) tmBtn.classList.remove('active');
  renderGroups();
}

export function renderMembers(g) {
  const el = $('#memberAvatars'); el.innerHTML = '';
  (g.memberIds || []).forEach((id) => {
    const a = findAgent(id); if (!a) return;
    const wrap = document.createElement('span');
    wrap.className = 'av-wrap';
    wrap.innerHTML = `${avHtml(a)}${trafficHtml(id, true)}`;
    const av = wrap.querySelector('.av');
    av.title = a.name + ' · 左键状态卡 / 右键设置+启动';
    av.onclick = (e) => { e.stopPropagation(); openAgentCard(a.id, av); };
    av.oncontextmenu = (e) => { e.preventDefault(); openCtxMenu(a.id, e.clientX, e.clientY); };
    const light = wrap.querySelector('.traffic');
    light.onclick = (e) => { e.stopPropagation(); openTaskPop(a.id, light); };
    el.appendChild(wrap);
  });
  paintAllTraffic();
}

// Start/stop an agent's own local service + monitor (no window, no LLM cost).
// Lives in the settings panel, one switch per agent — the group header stays clean.
export async function toggleAgent(a) {
  const r = a.launched
    ? await api.stopAgent(a.id).catch(() => ({ stopped: false }))
    : await api.launchAgent(a.id).catch(() => ({ launched: false }));
  if (a.launched) {
    if (r.stopped) { a.launched = false; if (a.config.launcher) a.config.launcher.enabled = false; toast(r.note || `已停止「${a.name}」（本地进程与服务已关闭）`); }
    else toast(`「${a.name}」停止失败`);
  } else {
    if (r.launched) { a.launched = true; if (a.config.launcher) a.config.launcher.enabled = true; toast(r.note || `已启动「${a.name}」（静默运行，零 LLM 成本）`); }
    else toast(`「${a.name}」${r.note || '启动失败'}`);
  }
  // Persist the switch so a server restart keeps the agent's on/off state.
  if (a.config && a.config.launcher) {
    await api.updateAgent(a.id, { config: { launcher: { enabled: a.config.launcher.enabled } } }).catch(() => {});
  }
  await refreshAgents();
  renderRegistry();
  paintAllTraffic();
}

// Render window: painting every message at once makes long groups sluggish.
// Show the latest PAGE and prepend older batches on demand ("加载更早消息").
// Pure rendering concern - the backend already returns the full history.
export const PAGE_SIZE = 80;
export let windowCount = PAGE_SIZE;

export function renderMessages(g, jump = true) {
  const box = $('#messages'); box.innerHTML = '';
  const msgs = g.messages || [];
  if (!msgs.length) { box.innerHTML = `<div class="empty">${t('emptyChat')}</div>`; return; }
  setLastMsg({ day: '', key: null, ts: 0 }); // fresh grouping state per render
  const hidden = Math.max(0, msgs.length - windowCount);
  if (hidden > 0) {
    const more = document.createElement('button');
    more.className = 'load-earlier';
    more.textContent = `加载更早消息（还有 ${hidden} 条）`;
    more.onclick = () => {
      const anchor = box.querySelector('.msg');
      const anchorId = anchor ? anchor.dataset.mid : null;
      windowCount += PAGE_SIZE;
      renderMessages(g, false);
      const nb = $('#messages');
      const target = anchorId ? nb.querySelector(`.msg[data-mid="${anchorId}"]`) : null;
      nb.scrollTop = target ? target.offsetTop - 8 : nb.scrollHeight;
    };
    box.appendChild(more);
  }
  msgs.slice(-windowCount).forEach((m) => appendMessage(m, false));
  // 历史消息里的产物也补登进群空间
  msgs.forEach((m) => { if (m.agentId) captureArtifacts(g.id, m.agentId, m.text, m.id); });
  if (jump) box.scrollTop = box.scrollHeight;
  setStickBottom(jump);
  syncStick();
}
// A summoned reply looks exactly like one the user asked for. Without this the
// reader cannot tell that another agent pulled this one into the turn.
export function delegatedTag(m) {
  if (!m.delegatedBy) return '';
  const a = findAgent(m.delegatedBy);
  const by = esc(a ? a.name : m.delegatedBy);
  return `<span class="delegated" title="被 ${by} 点名后接手">${ic('deleg', 10, 10)} 被 ${by} 点名</span>`;
}

// An agent's question, rendered as an answerable card. Options come from DSH's
// ask tool; a question recognised in plain model output has none, so the reply
// itself is the card body. Either way the shape is the same, which is the
// point - the channel does not care where the question came from.
export function askCard(m) {
  if (!m.ask) return '';
  const opts = (m.ask.options || []).filter((o) => o.label);
  const btns = opts.map((o) =>
    `<button class="ask-opt" data-answer="${esc(o.label)}" title="${esc(o.description || '')}">${esc(o.label)}</button>`).join('');
  return `<div class="ask-card">
      <div class="ask-head">等待你的回答</div>
      ${btns ? `<div class="ask-opts">${btns}</div>` : ''}
      <div class="ask-hint">也可以直接在下面输入框里回答</div>
    </div>`;
}

// Build the message DOM element (pure, reused by append + in-place update).
export function buildMsgEl(m, thinking) {
  const div = document.createElement('div');
  let who, cls, color;
  if (m.sender === 'user') { who = '我'; cls = 'user'; color = USER.color; }
  else if (m.sender === 'system') { cls = 'system'; }
  else { const a = findAgent(m.agentId); who = a ? a.name : 'agent'; cls = 'agent'; color = a ? a.color : '#888'; }
  if (cls === 'system') {
    const meta = m.meta || {};
    if (meta.consensus && meta.kind === 'round') {
      div.className = 'msg consensus-frame';
      div.innerHTML = `<div class="cf-pill">${ic('users', 11, 11)} 协商</div><div class="cf-text">${renderMd(m.text)}</div>`;
      div.dataset.mid = m.id; return div;
    }
    if (meta.consensus && meta.kind === 'conclusion') {
      div.className = 'msg consensus-frame cf-conclusion-frame';
      div.innerHTML = `<div class="cf-pill">${ic('clipboard', 11, 11)} 综合阶段</div><div class="cf-text">${renderMd(m.text)}</div>`;
      div.dataset.mid = m.id; return div;
    }
    // Batch B: the confirm gate after a passed vote — user approves/rejects.
    if (meta.consensus && meta.confirm) {
      div.className = 'msg consensus-frame cf-confirm';
      div.innerHTML = `<div class="cf-pill">${ic('flag', 11, 11)} 确认门 · 方案待你审批</div><div class="cf-text">${renderMd(m.text)}</div>
        <div class="confirm-opts">
          <button class="ask-opt ok" data-act="approve">确认执行</button>
          <button class="ask-opt no" data-act="reject">打回重议</button>
        </div>`;
      div.querySelectorAll('.confirm-opts .ask-opt').forEach((b) => {
        b.onclick = () => {
          const approve = b.dataset.act === 'approve';
          if (approve) delibAction('confirm', { ok: true });
          else {
            const note = prompt('打回意见（会带给全体成员重新商议，可留空）：');
            if (note === null) return;
            delibAction('confirm', { ok: false, note });
          }
          const opts = div.querySelector('.confirm-opts');
          if (opts) opts.remove();
        };
      });
      div.dataset.mid = m.id; return div;
    }
    // Batch B: rework cap reached — user adjudicates.
    if (meta.consensus && meta.deliberation === 'stuck') {
      div.className = 'msg consensus-frame cf-confirm';
      div.innerHTML = `<div class="cf-pill">${ic('bell', 11, 11)} 需要你裁决</div><div class="cf-text">${renderMd(m.text)}</div>
        <div class="confirm-opts">
          <button class="ask-opt ok" data-act="force">直接拍板采纳</button>
          <button class="ask-opt no" data-act="terminate">终止协商</button>
        </div>`;
      div.querySelectorAll('.confirm-opts .ask-opt').forEach((b) => {
        b.onclick = () => {
          delibAction('adjudicate', { choice: b.dataset.act });
          const opts = div.querySelector('.confirm-opts');
          if (opts) opts.remove();
        };
      });
      div.dataset.mid = m.id; return div;
    }
    // Batch C: work-order cards with status-appropriate actions.
    if (meta.taskCard) {
      const st = meta.taskStatus || '';
      const stCls = { pending_approval: 'warn', queued: '', running: 'run', review: 'hot', done: 'ok', rejected: 'off', cancelled: 'off', aborted: 'off' }[st] || '';
      const actions = [];
      if (st === 'pending_approval') actions.push(['approve', '批准执行', 'ok'], ['reject', '拒绝', 'no']);
      if (st === 'queued') actions.push(['cancel', '取消排队', 'no']);
      if (st === 'running') actions.push(['abort', '中断执行', 'no']);
      if (st === 'review') actions.push(['review-ok', '验收通过', 'ok'], ['review-no', '要求重做', 'no']);
      const btns = actions.map(([a, l, k]) => `<button class="ask-opt ${k}" data-act="${a}">${l}</button>`).join('');
      div.className = 'msg consensus-frame cf-task';
      div.innerHTML = `<div class="cf-pill">${ic('clipboard', 11, 11)} 派工单 <span class="task-st ${stCls}">${esc({ pending_approval: '待审批', queued: '排队中', running: '执行中', review: '待验收', done: '已完成', rejected: '已拒绝', cancelled: '已取消', aborted: '已中断' }[st] || st)}</span></div>
        <div class="cf-text">${renderMd(m.text)}</div>
        ${btns ? `<div class="confirm-opts">${btns}</div>` : ''}`;
      div.querySelectorAll('.confirm-opts .ask-opt').forEach((b) => {
        b.onclick = async () => {
          const act = b.dataset.act;
          try {
            if (act === 'review-ok') await api.taskAction(curGroupId, meta.taskCard, 'review', { ok: true });
            else if (act === 'review-no') {
              const note = prompt('重做要求（会带给指挥和执行 agent，可留空）：');
              if (note === null) return;
              await api.taskAction(curGroupId, meta.taskCard, 'review', { ok: false, note });
            } else await api.taskAction(curGroupId, meta.taskCard, act);
            toast('已执行：' + b.textContent);
          } catch (e) { toast('操作失败：' + e.message); }
          b.closest('.confirm-opts').remove();
        };
      });
      div.dataset.mid = m.id; return div;
    }
    // Context reset (/clear): thin divider, not a system bubble.
    if (meta.ctxReset) {
      div.className = 'msg ctx-reset';
      div.innerHTML = `<div class="ctx-reset-line">${m.text}</div>`;
      div.dataset.mid = m.id; return div;
    }
    div.className = 'msg system';
    div.innerHTML = `<div class="sys-badge">${ic('bell', 10, 10)} ${t('sysNotice')}</div><div class="bubble sys-bubble">${renderMd(m.text)}</div>`;
  } else {
    const isConcl = !!(m.meta && m.meta.consensusConclusion);
    const tag = isConcl ? `<span class="concl-tag">${ic('flag', 11, 11)} 共识结论</span>` : '';
    // sender role badge: one compact tag so identity reads at a glance
    const senderA = m.sender === 'agent' ? findAgent(m.agentId) : null;
    // badge shows the agent's own role; the adapter class stays internal
    const roleTag = senderA
      ? `<span class="role-tag" title="${mdEsc([capabilityOf(senderA.adapterType), senderA.role].filter(Boolean).join(' · '))}">${mdEsc(senderA.role || capabilityOf(senderA.adapterType) || 'agent')}</span>`
      : '';
    div.className = 'msg ' + cls + (isConcl ? ' consensus-conclusion' : '');
    div.innerHTML = `${senderA ? avHtml(senderA, 'msg-av') : `<span class="msg-av" style="background:${color}">${esc(who[0])}</span>`}
      <div class="msg-col">
        <div class="who"><span class="who-name">${esc(who)}</span>${roleTag}${delegatedTag(m)}${tag}<span class="time">${fmtTime(m.ts)}</span></div>
        <div class="bubble">${renderMd(m.text)}</div>${askCard(m)}${thinking ? thinkingBlockHtml(thinking.entries, thinking.collapsed) : ''}
      </div>`;
    // collapse toggle for the thinking panel baked into the final message
    const th = div.querySelector('.thinking');
    if (th) th.querySelector('.thinking-head').onclick = () => th.classList.toggle('collapsed');
    const col = div.querySelector('.msg-col');
    const cp = document.createElement('button'); cp.className = 'copy'; cp.textContent = '复制';
    cp.onclick = (e) => { e.stopPropagation(); navigator.clipboard && navigator.clipboard.writeText(m.text || ''); toast('已复制到剪贴板'); };
    col.appendChild(cp);
  }
  div.dataset.mid = m.id;
  return div;
}

// Cap over-long message bubbles so a giant agent reply scrolls inside its
// own box instead of stretching the whole message. Adds a 展开/收起 toggle.
export function maybeCapBubble(div) {
  const b = div.querySelector('.bubble');
  if (!b || b.scrollHeight <= 250) return;
  b.classList.add('capped');
  const tg = document.createElement('button');
  tg.className = 'bubble-toggle';
  tg.innerHTML = '展开全部 ' + ic('chevdown', 10, 10);
  tg.style.alignSelf = div.classList.contains('user') ? 'flex-end' : 'flex-start';
  tg.onclick = () => {
    const capped = b.classList.toggle('capped');
    tg.innerHTML = capped ? '展开全部 ' + ic('chevdown', 10, 10) : '收起 ' + ic('chevup', 10, 10);
  };
  b.insertAdjacentElement('afterend', tg);
}

export function appendMessage(m, scroll = true) {
  const box = $('#messages');
  if (box.querySelector('.empty')) box.innerHTML = '';
  // date separator: a pill appears only when the calendar day changes
  const day = dayLabel(m.ts);
  if (day !== lastMsg.day) {
    const sep = document.createElement('div');
    sep.className = 'date-sep';
    sep.innerHTML = `<span>${day}</span>`;
    box.appendChild(sep);
    setLastMsg({ day, key: null, ts: m.ts || Date.now() });
  }
  // grouping: consecutive same-sender messages inside a short window get a
  // tighter rhythm so a burst from one agent reads as one unit.
  const key = senderKey(m);
  const same = key === lastMsg.key && (m.ts - lastMsg.ts) < 10 * 60 * 1000;
  const turnSep = !same && lastMsg.key !== null && m.sender !== 'system';
  setLastMsg({ day, key, ts: m.ts || Date.now() });
  // Only the newest question stays answerable. Once anything newer is on
  // screen, clicking an old card would fire a bare answer off as a new topic.
  box.querySelectorAll('.ask-card:not(.done)').forEach((el) => {
    el.classList.add('done');
    el.textContent = '曾提问';
  });
  // consume the live thinking trace for this agent's turn (if any) so the
  // final message keeps its tool-call history as a collapsible block.
  let thinking = null;
  if (m.agentId && traceStore[m.agentId] && traceStore[m.agentId].entries.length) {
    thinking = { entries: traceStore[m.agentId].entries, collapsed: traceStore[m.agentId].collapsed };
    delete traceStore[m.agentId];
  }
  const div = buildMsgEl(m, thinking);
  if (same) div.classList.add('same');
  else if (turnSep) div.classList.add('turn');
  box.appendChild(div);
  maybeCapBubble(div);
  // A question card's option buttons are real controls, not decoration:
  // clicking one sends that answer straight away. Without this binding the
  // buttons render but do nothing, so the user has to retype the label by
  // hand - a dead control that looks exactly like a bug. The card is marked
  // done immediately so a slow agent turn cannot eat a second click.
  div.querySelectorAll('.ask-opt').forEach((b) => {
    b.addEventListener('click', () => {
      const card = b.closest('.ask-card');
      if (!card || card.classList.contains('done')) return;
      card.classList.add('done');
      card.textContent = '已回答';
      send(b.dataset.answer);
    });
  });
  if (scroll) { if (stickBottom) { box.scrollTop = box.scrollHeight; } else { syncStick(); } }
}

export function renderSendTarget(g) {
  const sel = $('#sendTarget'); sel.innerHTML = '<option value="">@ 所有人</option>';
  const roles = (g && g.memberRoles) || {};
  (g.memberIds || []).forEach((id) => {
    const a = findAgent(id); if (!a) return;
    // One selector now carries both chat target and dispatch target, so each
    // entry announces what the member is: capable of local ops or a pure model.
    const tag = execCapable(a, roles) ? '可操作' : '模型';
    const o = document.createElement('option'); o.value = id; o.textContent = '@ ' + a.name + '（' + tag + '）';
    sel.appendChild(o);
  });
  fitSendTarget();
}

// Executor-capable = holds the group's executor role, or is executor-kind /
// reaches the machine via adapter A (DSH) / C (bridge). Shared by the target
// dropdown annotation and the task-mode gate.
export function execCapable(a, roles) {
  return !!(a && (roles[a.id] === 'executor' || a.kind === 'executor' || a.adapterType === 'A' || a.adapterType === 'C'));
}

// Native <select> sizes itself to the LONGEST option, which makes the
// "发送对象" pill look stretched when "@ 所有人" is selected. Re-size it to
// the currently selected option's text so it hugs its label.
export function fitSendTarget() {
  const sel = $('#sendTarget'); if (!sel) return;
  const opt = sel.options[sel.selectedIndex] || sel.options[0];
  if (!opt) return;
  const cs = getComputedStyle(sel);
  const span = document.createElement('span');
  span.textContent = opt.textContent;
  span.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:' + cs.font;
  document.body.appendChild(span);
  const w = span.getBoundingClientRect().width;
  span.remove();
  // text + left padding 8 + right padding 20 + 2px border
  sel.style.width = Math.ceil(w + 30) + 'px';
}

// override: text supplied by an answer button instead of the input box.
export async function send(override) {
  const txt = String(override || $('#input').value).trim(); if (!txt || !curGroupId) return;
  const target = $('#sendTarget').value || null;
  $('#input').value = '';
  autosizeInput && autosizeInput();
  // Task mode: the message becomes an exclusive work order instead of chat.
  // The executor is whoever is picked in the unified @ dropdown.
  if (taskMode) {
    const executorId = target;
    try {
      const r = await api.createTask(curGroupId, { text: txt, executorId });
      if (r && r.error) toast('派工失败：' + r.error);
    } catch (e) { toast('派工失败：' + e.message); }
    return;
  }
  await api.sendMessage(curGroupId, txt, { toAgentId: target });
}

export function showTyping(agentId, done) {
  if (done) { const t = $('#typing-' + agentId); if (t) t.remove(); return; }
  if ($('#typing-' + agentId)) return;
  const a = findAgent(agentId);
  const box = $('#messages');
  const div = document.createElement('div');
  div.className = 'msg agent'; div.id = 'typing-' + agentId;
  div.innerHTML = `<div class="who">${avHtml(a, 'sm')}${esc(a.name)}</div><div class="bubble"><span class="typing"><span></span><span></span><span></span></span></div>`;
  box.appendChild(div); box.scrollTop = box.scrollHeight;
}

// ---------------- agent thinking / tool-call trace ----------------
// Each agent turn produces a "thinking panel": a fixed-height, scrollable,
// collapsible block listing steps + tool calls. We keep the data model
// separately from the DOM so the SAME render feeds both the live typing
// bubble and the final, persisted message.
export const traceStore = {}; // agentId -> { entries:[{kind,name,detail,callId,step,state}], collapsed }

export function tracePush(agentId, ev) {
  const t = traceStore[agentId] || (traceStore[agentId] = { entries: [], collapsed: false });
  if (ev.kind === 'tool_result') {
    const c = t.entries.find((e) => e.kind === 'tool_call' && String(e.callId) === String(ev.callId));
    if (c) c.state = 'done';
  } else {
    t.entries.push(ev);
    if (t.entries.length > 60) t.entries.shift(); // long turns must not grow forever
  }
}

export function renderTraceBody(body, entries) {
  body.innerHTML = '';
  entries.forEach((e) => {
    if (e.kind === 'step') {
      const s = document.createElement('div'); s.className = 'tool-step'; s.textContent = `步骤 ${e.step}`; body.appendChild(s);
    } else if (e.kind === 'tool_call') {
      const done = e.state === 'done';
      const row = document.createElement('div'); row.className = 'tool-row' + (done ? ' done' : '');
      row.innerHTML = (done ? '<span class="tick">' + ic('check', 11, 11) + '</span>' : '<span class="spin"></span>') +
        `<span class="tn">${esc(e.name)}</span><span class="td">${esc(e.detail || '')}</span>`;
      body.appendChild(row);
    }
  });
}

export function thinkingBlockHtml(entries, collapsed) {
  if (!entries || !entries.length) return '';
  const nTool = entries.filter((e) => e.kind === 'tool_call').length;
  return `<div class="thinking${collapsed ? ' collapsed' : ''}">
      <div class="thinking-head"><span class="th-ico">${ic('cpu', 12, 12)}</span><span class="th-title">思考 / 工具调用</span>
        <span class="th-count">${nTool ? nTool + ' 次调用' : ''}</span><span class="th-toggle">${ic('chevdown', 10, 10)}</span></div>
      <div class="thinking-body">${entries.map((e) => {
        if (e.kind === 'step') return `<div class="tool-step">步骤 ${esc(e.step)}</div>`;
        const done = e.state === 'done';
        return `<div class="tool-row${done ? ' done' : ''}">${done ? '<span class="tick">' + ic('check', 11, 11) + '</span>' : '<span class="spin"></span>'}<span class="tn">${esc(e.name)}</span><span class="td">${esc(e.detail || '')}</span></div>`;
      }).join('')}</div></div>`;
}

// Live trace of what the agent is doing, appended under its typing bubble.
// Rows are keyed by callId so a tool/result can tick the matching tool/call off.
export function showToolCall(agentId, ev) {
  const t = $('#typing-' + agentId);
  if (!t) return;                        // typing bubble gone -> nothing to hang the trace on
  tracePush(agentId, ev);

  const bubble = t.querySelector('.bubble');
  let panel = t.querySelector('.thinking');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'thinking' + (traceStore[agentId].collapsed ? ' collapsed' : '');
    panel.innerHTML = `<div class="thinking-head"><span class="th-ico">${ic('cpu', 12, 12)}</span><span class="th-title">思考 / 工具调用</span><span class="th-count"></span><span class="th-toggle">${ic('chevdown', 10, 10)}</span></div><div class="thinking-body"></div>`;
    bubble.appendChild(panel);
    panel.querySelector('.thinking-head').onclick = () => {
      panel.classList.toggle('collapsed');
      traceStore[agentId].collapsed = panel.classList.contains('collapsed');
    };
  }
  renderTraceBody(panel.querySelector('.thinking-body'), traceStore[agentId].entries);
  const nTool = traceStore[agentId].entries.filter((e) => e.kind === 'tool_call').length;
  panel.querySelector('.th-count').textContent = nTool ? `${nTool} 次调用` : '';
  $('#messages').scrollTop = $('#messages').scrollHeight;
}

export const inputEl = $('#input');
// Enter 发送：中文输入法组词（isComposing）时回车是选字，绝不能误发
inputEl.addEventListener('keydown', (e) => {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
// 输入框自适应高度：单行 56px 起，随内容长到最多 5 行再内部滚动
export function autosizeInput() {
  const el = $('#input');
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 132) + 'px';
}
inputEl.addEventListener('input', autosizeInput);
export function renderNegotiation(n) {
  const bar = $('#negotiationBar'); if (!bar) return;
  if (!n || n.status === 'done') {
    if (n && n.status === 'done') {
      bar.className = 'negotiation-bar done';
      bar.innerHTML = `${ic('check', 12, 12)} 协商完成 · 共 ${n.rounds || ''} 轮 · 议题：${esc(n.topic || '')}`;
      clearTimeout(bar._t);
      bar._t = setTimeout(() => bar.classList.add('hidden'), 6000);
    } else {
      bar.classList.add('hidden');
    }
    return;
  }
  bar.classList.remove('hidden');
  if (n.phase === 'conclusion') {
    const s = findAgent(n.synthesizer) || { name: n.synthesizer };
    bar.innerHTML = `${ic('users', 12, 12)} 综合阶段 · 正在由 <b>${esc(s.name)}</b> 汇总共识结论…`;
  } else {
    bar.innerHTML = `${ic('users', 12, 12)} 协商中 · 第 <b>${n.round || 1}</b>/<b>${n.rounds}</b> 轮 · 议题：${esc(n.topic || '')}`;
  }
}

// ---------------- task mode (batch C, merged into the @ dropdown) ----------------
// One selector: @ entries are annotated （可操作）/（模型）; the dispatch
// button only arms when an executor-capable member is the target.
export let taskMode = false;
export function currentTargetAgent() {
  const g = curGroupData || {};
  const id = $('#sendTarget').value;
  const a = id ? findAgent(id) : null;
  return { a, roles: g.memberRoles || {} };
}
export function setTaskMode(on) {
  if (on) {
    const { a, roles } = currentTargetAgent();
    if (!a || !execCapable(a, roles)) {
      toast('派工需先在 @ 下拉里选中一个（可操作）成员');
      return;
    }
  }
  taskMode = !!on;
  const tmBtn = $('#btnTaskMode');
  if (tmBtn) {
    tmBtn.classList.toggle('active', on);
    tmBtn.title = on
      ? t('taskOnTitle')
      : t('taskOffTitle');
  }
  $('#input').placeholder = on
    ? t('taskOnPh')
    : t('taskOffPh');
}

// ---------------- stage engine UI (batch B) ----------------
export const STAGE_LABEL = { idle: '空闲', discuss: '探讨协商', await_confirm: '待你确认', execute: '执行中', review: '审核', retro: '复盘' };
export function renderStageBar(g) {
  const badge = $('#stageBadge'), bar = $('#delibBar');
  if (!badge || !bar) return;
  const stage = (g && g.stage) || 'idle';
  const d = g && g.deliberation;
  const paused = d && d.status === 'paused';
  const stuck = d && d.status === 'stuck';
  const active = d && d.active && d.status === 'running';
  badge.classList.toggle('hidden', stage === 'idle');
  badge.textContent = STAGE_LABEL[stage] || stage;
  badge.className = 'stage-badge' + (stage === 'await_confirm' ? ' hot' : '') + (stage === 'execute' ? ' run' : '');
  badge.title = d && d.topic ? `议题：${d.topic}` : '项目阶段';
  // control bar: visible while a deliberation exists and is not concluded
  const showBar = !!(d && (active || paused || stuck));
  bar.classList.toggle('hidden', !showBar);
  if (showBar) {
    $('#btnDelibPause').classList.toggle('hidden', !active);
    $('#btnDelibResume').classList.toggle('hidden', !paused);
    $('#btnDelibStop').classList.remove('hidden');
    bar.title = paused ? '协商已暂停（进度保留）' : stuck ? '协商已回炉 2 次仍存在反对票，需要你裁决' : `协商进行中 · 周期 ${d.cycle || 0}/2`;
  }
}

export async function delibAction(action, p) {
  if (!curGroupId) return;
  try {
    const r = await api.delibControl(curGroupId, action, p);
    if (r && r.note) toast(r.note);
    const g = await api.getGroup(curGroupId);
    setCurGroupData(g);
    renderStageBar(g);
  } catch (e) { toast('操作失败：' + e.message); }
}
