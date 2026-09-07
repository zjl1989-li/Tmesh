// split of public/app.js (original section comment preserved below)
import { API, api, del, on, req } from './api.js';
import { appendMessage, buildMsgEl, captureArtifacts, currentTargetAgent, delibAction, execCapable, fitSendTarget, maybeCapBubble, renderNegotiation, renderStageBar, selectGroup, send, setTaskMode, showToolCall, showTyping, taskMode } from './center.js';
import { $, $$, USER, esc, ic, setStickBottom, syncStick } from './core.js';
import { notifyOn, ping, soundOn } from './flags.js';
import { maybeUsageWarn, openConsensusModal, openGroupModal, startConsensus, toast, toastEl } from './modals.js';
import { agentCard, openSettings } from './settings.js';
import { closePreview, detectKind, renderSpace } from './space.js';
import { curGroupData, curGroupId, curTab, groupSearch, renderGroups, setCurTab, setGroupSearch } from './state.js';
import { findAgent } from './status.js';
import { wizBack, wizConnectConfirm, wizOnboardDiscovered, wizSave } from './wizard.js';

// ---------------- wire up ----------------
$('#btnNewGroup').onclick = async () => {
  const name = prompt('新群名称', '新群'); if (!name) return;
  const g = await api.createGroup(name, []);
  await selectGroup(g.id); openGroupModal(g.id);
};
$('#btnSettings').onclick = openSettings;
$('#btnGroupSettings').onclick = () => { if (curGroupId) openGroupModal(curGroupId); };
$('#btnConsensus').onclick = openConsensusModal;
$('#btnDelibPause').onclick = () => delibAction('pause');
$('#btnDelibResume').onclick = () => delibAction('resume');
$('#btnDelibStop').onclick = () => { if (confirm('确定中止当前协商？已完成轮次保留，可改议题重开。')) delibAction('stop'); };
$('#btnTaskMode').onclick = () => setTaskMode(!taskMode);
$('#closeConsensus').onclick = $('#btnCloseConsensus2').onclick = () => $('#consensusModal').classList.add('hidden');
$('#btnStartConsensus').onclick = startConsensus;
$('#closeSettings').onclick = () => $('#settingsModal').classList.add('hidden');
$('#closeGroup').onclick = $('#btnCloseGroup2').onclick = () => $('#groupModal').classList.add('hidden');
$('#ac-close').onclick = () => $('#agentCard').classList.add('hidden');

$('#btnSaveGroup').onclick = async () => {
  const id = $('#groupModal').dataset.gid;
  const name = $('#grpNameInput').value.trim();
  const ids = $$('#groupMembers input[type=checkbox]').filter((c) => c.checked).map((c) => c.dataset.id);
  const memberRoles = {};
  $$('#groupMembers .role-sel').forEach((s) => { if (ids.includes(s.dataset.id)) memberRoles[s.dataset.id] = s.value; });
  const approval = $('#grpApproval') ? $('#grpApproval').value : 'before';
  if (name) await api.renameGroup(id, name);
  await api.patchGroup(id, { memberIds: ids, memberRoles, approval });
  $('#groupModal').classList.add('hidden');
  await selectGroup(id);
};
$('#closeWizard').onclick = () => $('#wizardModal').classList.add('hidden');
$('#wizBackHead').onclick = wizBack;
$('#btnOnboardDisc').onclick = wizOnboardDiscovered;
$('#btnSaveWiz').onclick = wizSave;
$('#closeConnect').onclick = () => $('#connectModal').classList.add('hidden');
$('#btnConnectDone').onclick = wizConnectConfirm;

$('#btnSend').onclick = () => send();
// 群搜索：输入即过滤群列表
$('#groupSearch').addEventListener('input', (e) => {
  setGroupSearch(e.target.value);
  renderGroups();
});
// 回到底部：悬浮按钮 + 滚动位置跟踪
$('#jumpDown').onclick = () => {
  const box = $('#messages');
  box.scrollTop = box.scrollHeight;
  setStickBottom(true);
  $('#jumpDown').classList.add('hidden');
};
$('#messages').addEventListener('scroll', syncStick);
// 窄窗口抽屉：右栏「群空间」折叠为悬浮按钮
$('#drawerToggle').onclick = () => document.body.classList.toggle('drawer-open');
// 发送对象下拉：按当前选中项收窄宽度
$('#sendTarget').addEventListener('change', () => {
  fitSendTarget();
  // Boss's rule: the dispatch BUTTON is the only way into work orders.
  // With it off, @-ing an executor-capable member is plain Q&A chat. If a
  // work order is armed and the user switches to a non-executor target
  // (model member or @all), silently disarm - dispatch needs one executor.
  const { a, roles } = currentTargetAgent();
  if (taskMode && !(a && execCapable(a, roles))) setTaskMode(false);
});
// 主题切换：body.light 与深色主题互切，localStorage 记忆选择
export function syncThemeBtn() {
  const b = $('#btnTheme'); if (!b) return;
  b.title = document.body.classList.contains('light') ? '切换到深色主题' : '切换到浅色主题';
}
if (localStorage.getItem('zjl_theme') === 'light') document.body.classList.add('light');
syncThemeBtn();
$('#btnTheme').onclick = () => {
  document.body.classList.toggle('light');
  localStorage.setItem('zjl_theme', document.body.classList.contains('light') ? 'light' : 'dark');
  syncThemeBtn();
};

// + 上传菜单（文件/图片/视频/音频）—— 默认收起，点 + 展开
$('#btnPlus').onclick = (e) => { e.stopPropagation(); $('#plusMenu').classList.toggle('hidden'); };
document.addEventListener('click', (e) => {
  if (!e.target.closest('#plusMenu') && !e.target.closest('#btnPlus')) $('#plusMenu').classList.add('hidden');
});
// 自动识别文件类型 -> 群空间产物分类
export function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1]);
    fr.onerror = () => reject(new Error('读取失败'));
    fr.readAsDataURL(file);
  });
}
$$('#plusMenu button').forEach((b) => {
  b.onclick = () => {
    $('#plusMenu').classList.add('hidden');
    const kind = b.dataset.kind;            // file/image/video/audio：直接指定；artifact：自动识别
    const inp = document.createElement('input'); inp.type = 'file';
    inp.accept = { image: 'image/*', video: 'video/*', audio: 'audio/*', file: '*/*', artifact: '*/*' }[kind];
    inp.onchange = async (e2) => {
      const f = e2.target.files[0]; if (!f || !curGroupId) return;
      if (f.size > 80 * 1024 * 1024) { toast('文件过大（>80MB），已跳过'); return; }
      // 分类永远按真实类型来（扩展名/MIME），菜单选择只决定文件选择器
      // 的过滤范围。以前点「文件」菜单传 .png 会盲信 kind=file，图片直接
      // 掉进文件标签且无法预览。
      const finalKind = detectKind(f);
      // 大文件 base64 编码 + 上传需要时间，给个不自动消失的进行中提示。
      const pending = toastEl('正在上传「' + f.name + '」…');
      try {
        const b64 = await readAsBase64(f);
        await api.addArtifact(curGroupId, { name: f.name, kind: finalKind, ownerId: 'user', colorTag: USER.color, content_base64: b64 });
        const g = await api.getGroup(curGroupId); renderSpace(g);
        pending.remove(); toast('已上传：' + f.name);
      } catch (err) { pending.remove(); toast('上传失败：' + err.message); }
    };
    inp.click();
  };
});
$('#btnVoice').onclick = () => alert('语音输入占位：接 Web Speech API 或豆包 ASR（后端契约预留）');
// 右栏「打开产物文件夹」：直接打开本群产物目录
$('#btnOpenFolder').onclick = async () => {
  if (!curGroupId) { toast('请先选择一个群'); return; }
  try {
    await api.revealFolder(curGroupId);
    toast('已打开产物文件夹');
  } catch { toast('打开文件夹失败，请查看服务端日志'); }
};
// 群列表头的「归档文件夹」按钮：打开全局归档目录
$('#btnOpenArchive').onclick = async (e) => {
  e.stopPropagation(); // 不触发群列表头折叠
  try { await api.openArchive(); toast('已打开归档文件夹'); }
  catch { toast('打开归档文件夹失败，请查看服务端日志'); }
};

// ---------- draggable column dividers ----------
export function makeResizer(el, side) {
  if (!el) return;
  el.addEventListener('mousedown', (e) => {
    if (e.target.closest('.fold-btn')) return; // the fold button handles itself
    e.preventDefault();
    // dragging a rail implies expanding it again if it was folded
    const foldCls = side === 'left' ? 'left-fold' : 'right-fold';
    if (document.body.classList.contains(foldCls)) {
      document.body.classList.remove(foldCls);
      const fb = document.getElementById(side === 'left' ? 'foldLeft' : 'foldRight');
      if (fb) fb.classList.remove('folded');
    }
    el.classList.add('active');
    // IMPORTANT: the --left-w / --right-w custom properties are declared on
    // #app (not :root), so the live value used by #left / #right resolves
    // from #app's own declaration. Setting them on <html> is shadowed by
    // #app and has zero effect -- which is why the divider never moved.
    // We must write the variables onto #app itself.
    const root = document.getElementById('app');
    const startX = e.clientX;
    const startW = parseInt(getComputedStyle(root).getPropertyValue(side === 'left' ? '--left-w' : '--right-w')) || (side === 'left' ? 250 : 320);
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      let w = side === 'left' ? startW + dx : startW - dx;
      w = Math.max(180, Math.min(560, w));
      root.style.setProperty(side === 'left' ? '--left-w' : '--right-w', w + 'px');
    };
    const onUp = () => {
      el.classList.remove('active');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
}
makeResizer($('#resLeft'), 'left');
makeResizer($('#resRight'), 'right');

// fold / expand the side rails via the pill on each hairline divider
// state is remembered per side; first run = right rail folded, left open
export function makeFoldBtn(btn, side) {
  if (!btn) return;
  btn.addEventListener('mousedown', (e) => e.stopPropagation()); // don't start a drag
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const foldCls = side === 'left' ? 'left-fold' : 'right-fold';
    const folded = document.body.classList.toggle(foldCls);
    btn.classList.toggle('folded', folded);
    localStorage.setItem('zjl_' + side + '_fold', folded ? '1' : '0');
  });
}
makeFoldBtn($('#foldLeft'), 'left');
makeFoldBtn($('#foldRight'), 'right');
[['left', '0'], ['right', '1']].forEach(([side, dflt]) => {
  if ((localStorage.getItem('zjl_' + side + '_fold') ?? dflt) === '1') {
    document.body.classList.add(side + '-fold');
    document.getElementById(side === 'left' ? 'foldLeft' : 'foldRight')?.classList.add('folded');
  }
});

// 右栏分标签切换（刷新后记住上次停留的标签）
$$('#spaceTabs .stab').forEach((t) => {
  t.onclick = async () => {
    $$('#spaceTabs .stab').forEach((x) => x.classList.remove('active'));
    t.classList.add('active'); setCurTab(t.dataset.tab);
    localStorage.setItem('zjl_space_tab', curTab);
    closePreview();
    if (curGroupId) renderSpace(await api.getGroup(curGroupId));
  };
});
// 初始化时把记忆的标签设为 active（index.html 默认高亮 overview）
{
  const saved = document.querySelector(`#spaceTabs .stab[data-tab="${curTab}"]`);
  $$('#spaceTabs .stab').forEach((x) => x.classList.remove('active'));
  if (saved) saved.classList.add('active');
}

// 竖排标签栏收起/展开（收起后整条缩成细边，只留箭头；状态记忆）
export const spaceWrap = $('#spaceWrap');
export const stabFoldBtn = $('#btnStabFold');
stabFoldBtn.onclick = () => {
  const folded = spaceWrap.classList.toggle('folded');
  stabFoldBtn.title = folded ? '展开标签栏' : '收起标签栏';
  localStorage.setItem('zjl_space_rail_fold', folded ? '1' : '0');
};
if (localStorage.getItem('zjl_space_rail_fold') === '1') {
  spaceWrap.classList.add('folded');
  stabFoldBtn.title = '展开标签栏';
}

// ---------------- desktop notification & sound ----------------
// Agents reply while the user is in another group or another window. Opt-in
// switches live at the top of the settings panel; state in localStorage.
export function maybeNotify({ groupId, message }) {
  if (!message || !message.agentId) return;
  const active = document.hasFocus() && groupId === curGroupId;
  if (active) return;
  if (soundOn) ping();
  if (!notifyOn || !('Notification' in window) || Notification.permission !== 'granted') return;
  const a = findAgent(message.agentId);
  const text = String(message.text || '').replace(/[#*`>\[\]!]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  try {
    const n = new Notification(a ? a.name : 'Agent', { body: text || '（新消息）', tag: 'achat-' + groupId });
    n.onclick = () => { window.focus(); selectGroup(groupId); n.close(); };
  } catch { /* some platforms require a service worker - ignore */ }
}

// event bus -> UI
api.on('message', ({ groupId, message, artifact, update }) => {
  maybeNotify({ groupId, message });
  if (groupId !== curGroupId) return;
  // In-place update (e.g. a consensus conclusion tagged after the fact):
  // replace the existing element instead of appending a duplicate.
  if (update && message) {
    const el = $(`.msg[data-mid="${message.id}"]`);
    if (el) { const n = buildMsgEl(message); el.replaceWith(n); maybeCapBubble(n); return; }
  }
  if (message) {
    appendMessage(message);
    // agent 产出的文件/图片/URL 自动落回群空间分类
    if (message.agentId) {
      captureArtifacts(groupId, message.agentId, message.text, message.id);
      maybeUsageWarn(message.agentId);
    }
  }
  if (artifact) api.getGroup(groupId).then(renderSpace);
});
api.on('typing', ({ agentId, done }) => showTyping(agentId, done));
api.on('tool', ({ groupId, agentId, kind, name, detail, step, callId }) => {
  if (groupId !== curGroupId) return;
  showToolCall(agentId, { kind, name, detail, step, callId });
  // 工具结果 / 调用里出现的路径也登记为产物
  if ((kind === 'tool_result' || kind === 'tool_call') && detail) captureArtifacts(groupId, agentId, detail);
});
api.on('negotiation', ({ groupId, negotiation }) => {
  if (groupId !== curGroupId) return;
  renderNegotiation(negotiation);
  if (curGroupData) { curGroupData.deliberation = negotiation; renderStageBar(curGroupData); }
});
api.on('stage', ({ groupId, stage }) => {
  if (groupId !== curGroupId || !curGroupData) return;
  curGroupData.stage = stage;
  renderStageBar(curGroupData);
});

// Progress banner for an in-flight / completed multi-agent negotiation.
// ---------------- 三库面板（左栏竖排 + 悬停浮出）：资料库 / 技能库 / 权限库 ----------------
export let libTab = 'kb';
export let libKbQuery = '';
export let libTimer = null;
export let libCloseTimer = null;

export function initLibPanel() {
  const nav = $('#libNav'), fly = $('#libFlyout'), left = $('#left');
  if (!nav || !fly || !left) return;
  const hide = () => {
    clearTimeout(libCloseTimer);
    fly.classList.add('hidden');
    nav.querySelectorAll('.lib-row.active').forEach((r) => r.classList.remove('active'));
  };
  const openLib = (lib) => {
    libTab = lib;
    nav.querySelectorAll('.lib-row').forEach((r) => r.classList.toggle('active', r.dataset.lib === lib));
    fly.classList.remove('hidden');
    renderLib();
  };
  nav.querySelectorAll('.lib-row').forEach((row) => {
    row.addEventListener('mouseenter', () => {
      clearTimeout(libCloseTimer);
      const lr = row.getBoundingClientRect(), ll = left.getBoundingClientRect();
      fly.style.top = Math.max(4, lr.top - ll.top) + 'px';
      if (fly.classList.contains('hidden') || libTab !== row.dataset.lib) openLib(row.dataset.lib);
    });
    row.addEventListener('mouseleave', () => { clearTimeout(libCloseTimer); libCloseTimer = setTimeout(hide, 260); });
    row.addEventListener('click', () => { clearTimeout(libCloseTimer); openLib(row.dataset.lib); });
  });
  fly.addEventListener('mouseenter', () => clearTimeout(libCloseTimer));
  fly.addEventListener('mouseleave', () => { clearTimeout(libCloseTimer); libCloseTimer = setTimeout(hide, 260); });
  document.addEventListener('click', (ev) => {
    if (!fly.contains(ev.target) && !nav.contains(ev.target)) hide();
  });
  $('#btnDistill').onclick = async () => {
    if (!curGroupId) { toast('先选一个群再蒸馏'); return; }
    try {
      const note = await api.distill(curGroupId);
      toast(`已沉淀进资料库：${note.title}（同名追加日期小节）`);
      if (libTab === 'kb' && !fly.classList.contains('hidden')) renderLib();
    } catch (e) { toast('蒸馏失败：' + e.message); }
  };
}

export async function renderLib() {
  const body = $('#libBody');
  if (!body) return;
  body.innerHTML = '<div class="lib-empty">加载中…</div>';
  try {
    let n = 0;
    if (libTab === 'kb') n = await renderLibKb(body);
    else if (libTab === 'skills') n = await renderLibSkills(body);
    else n = await renderLibAcl(body);
    const badge = document.querySelector(`.lib-row[data-lib="${libTab}"] .lr-count`);
    if (badge) badge.textContent = n ? String(n) : '';
  } catch (e) {
    body.innerHTML = `<div class="lib-empty">加载失败：${esc(e.message)}</div>`;
  }
}

export async function renderLibKb(body) {
  body.innerHTML = `
    <div class="lib-search"><span class="ls-ico">${ic('search', 12, 12)}</span>
      <input id="kbQ" type="search" placeholder="检索沉淀的知识…" value="${esc(libKbQuery)}" /></div>
    <div class="lib-list" id="kbList"></div>`;
  const list = body.querySelector('#kbList');
  const items = libKbQuery ? await api.kbSearch(libKbQuery) : await api.kbRecent(12);
  if (!items.length) {
    list.innerHTML = `<div class="lib-empty">${libKbQuery ? '没有命中的笔记。' : '还没有沉淀。群聊顶栏点漏斗图标，把对话蒸馏进资料库。'}</div>`;
  } else {
    list.innerHTML = items.map((it) => `
      <div class="lib-item" data-title="${esc(it.title)}">
        <span class="lib-ico">${ic('book', 12, 12)}</span>
        <span class="lib-main"><span class="lib-name">${esc(it.title)}</span>
          ${it.snippet ? `<span class="lib-snippet">${esc(it.snippet)}</span>` : ''}</span>
        <button class="lib-del" title="删除该笔记">${ic('trash', 11, 11)}</button>
      </div>`).join('');
    list.querySelectorAll('.lib-item').forEach((el) => {
      el.onclick = async (ev) => {
        if (ev.target.closest('.lib-del')) return;
        await previewLibNote(el.dataset.title);
      };
    });
    list.querySelectorAll('.lib-del').forEach((btn) => {
      btn.onclick = async (ev) => {
        ev.stopPropagation();
        const title = btn.closest('.lib-item').dataset.title;
        if (!confirm(`删除笔记「${title}」？`)) return;
        try { await api.kbRemove(title); toast('已删除'); renderLib(); }
        catch (e) { toast('删除失败：' + e.message); }
      };
    });
  }
  const input = body.querySelector('#kbQ');
  input.oninput = () => {
    libKbQuery = input.value.trim();
    clearTimeout(libTimer);
    libTimer = setTimeout(renderLib, 250);
  };
  return items.length;
}

// KB note preview: a lightweight dynamic modal, closed by click / Esc.
export async function previewLibNote(title) {
  let note;
  try { note = await api.kbRead(title); } catch (e) { toast('读取失败：' + e.message); return; }
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `<div class="modal-box" style="max-width:640px">
      <div class="modal-head">${esc(note.title)} <button class="icon-x" title="关闭">${ic('x', 12, 12)}</button></div>
      <pre class="lib-note-body">${esc(note.body)}</pre>
    </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelector('.icon-x').onclick = close;
  wrap.onclick = (ev) => { if (ev.target === wrap) close(); };
  document.addEventListener('keydown', function onEsc(ev) { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
}

export async function renderLibSkills(body) {
  const items = await req('/skills');
  body.innerHTML = `
    <div class="lib-list" id="skList"></div>
    <div class="lib-form">
      <div class="lib-form-title">注册技能（JSON 声明，改配置不改代码）</div>
      <input id="skId" placeholder="id，如 daily-brief" />
      <input id="skName" placeholder="名称（可省）" />
      <textarea id="skPrompt" placeholder="prompt（技能正文，必须）或 tools"></textarea>
      <button id="skSave" class="lib-save">保存技能</button>
    </div>`;
  const list = body.querySelector('#skList');
  if (!items.length) list.innerHTML = '<div class="lib-empty">还没有技能。下方表单注册第一个。</div>';
  else {
    list.innerHTML = items.map((s) => `
      <div class="lib-item" data-id="${esc(s.id)}">
        <span class="lib-ico">${ic('plug', 12, 12)}</span>
        <span class="lib-main"><span class="lib-name">${esc(s.name || s.id)}</span>
          <span class="lib-snippet">${esc(s.desc || s.prompt || (s.tools || []).join(', ')).slice(0, 80)}</span></span>
        <button class="lib-del" title="删除技能">${ic('trash', 11, 11)}</button>
      </div>`).join('');
    list.querySelectorAll('.lib-del').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.closest('.lib-item').dataset.id;
        if (!confirm(`删除技能「${id}」？`)) return;
        try { await api.skillRemove(id); renderLib(); } catch (e) { toast('删除失败：' + e.message); }
      };
    });
  }
  body.querySelector('#skSave').onclick = async () => {
    const id = body.querySelector('#skId').value.trim();
    const name = body.querySelector('#skName').value.trim();
    const prompt = body.querySelector('#skPrompt').value.trim();
    if (!id || !prompt) { toast('id 和 prompt 必填'); return; }
    try { await api.skillUpsert({ id, name, prompt }); toast('技能已保存'); renderLib(); }
    catch (e) { toast('保存失败：' + e.message); }
  };
  return items.length;
}

export async function renderLibAcl(body) {
  const [trail, groups, agents] = await Promise.all([api.aclAudit(), api.listGroups(), api.listAgents()]);
  body.innerHTML = `
    <div class="lib-list" id="aclList"></div>
    <div class="lib-form">
      <div class="lib-form-title">新增授权（群 × agent × 能力，默认拒绝）</div>
      <select id="aclConv"><option value="">选群…</option>${groups.map((g) => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}</select>
      <select id="aclAgent"><option value="">选 agent…</option>${agents.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select>
      <input id="aclCap" placeholder="能力名，如 kb.write / shell.run" />
      <button id="aclSave" class="lib-save">授权</button>
    </div>`;
  const list = body.querySelector('#aclList');
  if (!trail.length) list.innerHTML = '<div class="lib-empty">还没有授权记录。所有能力默认拒绝。</div>';
  else {
    const nameOf = (id) => { const a = agents.find((x) => x.id === id); return a ? a.name : id; };
    const gNameOf = (id) => { const g = groups.find((x) => x.id === id); return g ? g.name : (id === '*' ? '全部群' : id); };
    list.innerHTML = trail.map((g, i) => `
      <div class="lib-item" data-i="${i}">
        <span class="lib-ico">${ic('shield', 12, 12)}</span>
        <span class="lib-main"><span class="lib-name">${esc(gNameOf(g.convId))} · ${esc(nameOf(g.agentId))} · ${esc(g.cap)}</span>
          <span class="lib-snippet">由 ${esc(g.grantedBy || '未知')} 授权于 ${g.ts ? new Date(g.ts).toLocaleString() : ''}</span></span>
        <button class="lib-del" title="撤销该授权">${ic('x', 11, 11)}</button>
      </div>`).join('');
    list.querySelectorAll('.lib-del').forEach((btn) => {
      btn.onclick = async () => {
        const g = trail[Number(btn.closest('.lib-item').dataset.i)];
        try { await api.aclRevoke(g); renderLib(); } catch (e) { toast('撤销失败：' + e.message); }
      };
    });
  }
  body.querySelector('#aclSave').onclick = async () => {
    const convId = body.querySelector('#aclConv').value;
    const agentId = body.querySelector('#aclAgent').value;
    const cap = body.querySelector('#aclCap').value.trim();
    if (!convId || !agentId || !cap) { toast('群、agent、能力三项都要选/填'); return; }
    try { await api.aclGrant({ convId, agentId, cap, grantedBy: 'user' }); toast('已授权'); renderLib(); }
    catch (e) { toast('授权失败：' + e.message); }
  };
  return trail.length;
}

// ---------------- 关于 / 检查更新（设置弹窗底部） ----------------
export let applyReady = false;

export function initAbout() {
  const ver = $('#aboutVer');
  if (!ver) return;
  api.version().then((r) => { ver.textContent = 'v' + r.version; }).catch(() => { ver.textContent = ''; });
  $('#btnCheckUpdate').onclick = () => checkUpdate(false);
  $('#btnPlugins').onclick = openPluginsModal;
}

// Read-only plugin inventory: install/uninstall stays a folder operation
// (server/adapters.d/), activation stays an agent-config key. The UI only
// answers "what is installed, how do I turn it on, did it load".
export async function openPluginsModal() {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `<div class="modal-box" style="max-width:560px">
      <div class="modal-head">已装适配器插件 <button class="icon-x" title="关闭">${ic('x', 12, 12)}</button></div>
      <div class="plug-list"><div class="lib-empty">加载中…</div></div>
      <div class="plug-hint">安装 = 在 server/adapters.d/ 下放插件文件夹（plugin.json + adapter.mjs）；卸载 = 删文件夹；重启后生效。启用 = 在 agent 配置里加对应的 configKey。</div>
    </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelector('.icon-x').onclick = close;
  wrap.onclick = (ev) => { if (ev.target === wrap) close(); };
  document.addEventListener('keydown', function onEsc(ev) { if (ev.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); } });
  const list = wrap.querySelector('.plug-list');
  try {
    const items = await api.plugins();
    if (!items.length) {
      list.innerHTML = '<div class="lib-empty">还没有插件。把插件文件夹放进 server/adapters.d/ 即可，参考自带的 example。</div>';
      return;
    }
    list.innerHTML = items.map((p) => `
      <div class="plug-item">
        <div class="plug-head"><span class="plug-id">${esc(p.id)}</span>
          <span class="plug-state ${p.loaded ? 'on' : 'off'}">${p.loaded ? '已加载' : '未加载'}</span></div>
        <div class="plug-desc">${esc(p.description || '（无描述）')}</div>
        <div class="plug-match">激活：agent 配置加 <code>"${esc((p.match && p.match.configKey) || '?')}": true</code></div>
      </div>`).join('');
  } catch (e) {
    list.innerHTML = `<div class="lib-empty">加载失败：${esc(e.message)}</div>`;
  }
}

export async function checkUpdate(auto) {
  const msg = $('#aboutMsg'), check = $('#btnCheckUpdate'), apply = $('#btnApplyUpdate');
  check.disabled = true;
  msg.textContent = '检查中…';
  try {
    const r = await api.updateCheck();
    if (!r.isNewer) {
      msg.textContent = '已是最新版本';
      apply.classList.add('hidden');
      applyReady = false;
    } else {
      msg.innerHTML = `发现新版 <b>${esc(r.latest)}</b>${r.publishedAt ? ' · ' + esc(String(r.publishedAt).slice(0, 10)) : ''} · <a href="${esc(r.url)}" target="_blank" rel="noopener">更新日志</a>`;
      apply.textContent = '一键更新';
      apply.classList.remove('hidden');
      applyReady = true;
    }
  } catch (e) {
    msg.textContent = '检查失败（网络不通可手动 git pull）';
    apply.classList.add('hidden');
    applyReady = false;
  } finally {
    check.disabled = false;
    if (!applyReady) return;
    // bind once per discovery: each check rewrites the button state
    apply.onclick = () => doApply();
  }
}

export async function doApply() {
  const msg = $('#aboutMsg'), apply = $('#btnApplyUpdate');
  apply.disabled = true;
  msg.textContent = '更新中…';
  const r = await api.updateApply().catch((e) => ({ ok: false, code: 'error', message: e.message }));
  if (!r.ok) {
    const why = {
      dirty: '本地有未提交改动，已拒绝更新（先 git stash / commit）',
      diverged: '本地历史已分叉，已拒绝更新（手动处理）',
      network: 'git fetch 失败（离线？），可手动 git pull',
      'git-missing': 'git 不可用：' + (r.message || ''),
      error: r.message || '更新失败',
    }[r.code] || '更新失败';
    msg.textContent = why + (r.files && r.files.length ? '：' + r.files.slice(0, 3).join('、') : '');
    apply.disabled = false;
    return;
  }
  if (!r.updated) {
    msg.textContent = '已是最新版本';
    apply.classList.add('hidden');
    apply.disabled = false;
    return;
  }
  msg.textContent = '已更新到 v' + r.version + '，重启服务生效…';
  apply.classList.add('hidden');
  const cur = r.version;
  await api.updateRestart().catch(() => {});
  // The server dies for ~2s then comes back fresh; poll until it answers
  // with the new version (or give up after a minute and just reload).
  const deadline = Date.now() + 60000;
  const timer = setInterval(async () => {
    try {
      const v = await api.version();
      if (v.version === cur || Date.now() > deadline) { clearInterval(timer); location.reload(); }
    } catch { /* down during restart - keep polling */ }
  }, 2000);
}
