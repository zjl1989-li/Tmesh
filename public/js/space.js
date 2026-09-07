// split of public/app.js (original section comment preserved below)
import { api } from './api.js';
import { send } from './center.js';
import { $, $$, USER, esc, ic } from './core.js';
import { toast } from './modals.js';
import { curGroupId, curTab } from './state.js';
import { findAgent } from './status.js';

// ---------------- RIGHT: group space (tabs) ----------------
export function renderSpace(g) {
  const el = $('#spaceBody'); el.innerHTML = '';
  const arts = g.artifacts || [];
  if (curTab === 'overview') {
    const grid = document.createElement('div'); grid.className = 'ov-grid';
    grid.innerHTML = `<div class="ov-card"><div class="num">${arts.length}</div><div class="lbl">产物总数</div></div>
      <div class="ov-card"><div class="num">${(g.memberIds || []).length}</div><div class="lbl">群内 agent</div></div>`;
    el.appendChild(grid);
    // 产物列表本身已带来源色点 + 类型图标，不再单独做「按来源 / 按类型」统计。
    const lbl = document.createElement('div'); lbl.className = 'section-label'; lbl.style.padding = '10px 0 4px'; lbl.textContent = '全部产物'; el.appendChild(lbl);
    if (!arts.length) el.innerHTML += '<div class="empty">还没有产物</div>';
    else appendArtGrid(el, arts);
    return;
  }
  if (curTab === 'tree') { renderTree(el, g); return; }
  if (curTab === 'browser') { renderBrowser(el); return; }
  if (curTab === 'history') { renderHistory(el, g); return; }
  // file / image / media 按 kind 过滤。kind 可能被历史数据标错（.png 标成
  // file 曾真实发生），所以每个标签都用「kind 或扩展名」双条件兜底。
  const VID_AUD_RE = /\.(mp4|webm|mov|mkv|avi|mp3|wav|m4a|ogg|flac|aac)$/i;
  const match = curTab === 'image' ? ((a) => a.kind === 'image' || IMG_NAME_RE.test(a.name || ''))
    : curTab === 'media' ? ((a) => a.kind === 'video' || a.kind === 'audio' || VID_AUD_RE.test(a.name || ''))
    : ((a) => ['file', 'doc', 'code'].includes(a.kind) && !IMG_NAME_RE.test(a.name || '') && !VID_AUD_RE.test(a.name || ''));
  const filtered = arts.filter(match);
  if (!filtered.length) { el.innerHTML = '<div class="empty">该分类暂无产物</div>'; return; }
  appendArtGrid(el, filtered);
}

// ---- 上下文：群聊历史（按日期生成的 markdown，agent 失忆 / 新入群可回顾） ----
export function renderHistory(el, g) {
  el.innerHTML = '<div class="empty">正在生成历史记录…</div>';
  api.getHistory(g.id).then((r) => {
    const files = r.files || [];
    el.innerHTML = '';
    const head = document.createElement('div'); head.className = 'history-head';
    head.innerHTML = `<span class="hh-t">群聊历史 · ${r.group && r.group.status === 'archived' ? '已归档' : '进行中'}</span>
      <button class="hh-ico" id="hhRefresh" title="重新生成">${ic('refresh', 13, 13)}</button>
      <button class="hh-ico" id="hhOpen" title="打开归档文件夹">${ic('folder', 13, 13)}</button>`;
    el.appendChild(head);
    if (!files.length) {
      const e = document.createElement('div'); e.className = 'empty'; e.textContent = '还没有可记录的历史对话，发几条消息试试';
      el.appendChild(e);
      bindHead(); return;
    }
    const list = document.createElement('div'); list.className = 'history-list';
    files.forEach((f) => {
      const row = document.createElement('div'); row.className = 'hitem';
      row.innerHTML = `<span class="h-date">${esc(f.date)}</span>
        <span class="h-meta">${f.msgs} 条消息 · ${f.arts} 个产物</span>
        <button class="h-down" title="下载此日 md">${ic('download', 12, 12)}</button>`;
      row.querySelector('.h-down').onclick = (e) => {
        e.stopPropagation();
        window.location.href = `/api/conversations/${encodeURIComponent(g.id)}/history/${f.date}?download=1`;
      };
      row.onclick = () => loadHistoryDay(el, g, f.date, row);
      list.appendChild(row);
    });
    el.appendChild(list);
    bindHead();
    function bindHead() {
      const rf = el.querySelector('#hhRefresh'); if (rf) rf.onclick = () => renderHistory(el, g);
      const op = el.querySelector('#hhOpen'); if (op) op.onclick = async (e) => { e.stopPropagation(); await api.openArchive(); toast('已打开归档文件夹'); };
    }
  }).catch((e) => { el.innerHTML = `<div class="empty">历史生成失败：${esc(e && e.message || e)}</div>`; });
}

export function loadHistoryDay(el, g, date, row) {
  const exist = row.querySelector('.h-body');
  if (exist) { exist.classList.toggle('hidden'); if (!exist.classList.contains('hidden')) exist.scrollIntoView({ block: 'nearest' }); return; }
  const body = document.createElement('div'); body.className = 'h-body';
  body.innerHTML = '<div class="h-loading">加载中…</div>';
  row.appendChild(body);
  fetch(`/api/conversations/${encodeURIComponent(g.id)}/history/${date}`)
    .then((r) => r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)))
    .then((txt) => { body.innerHTML = `<pre class="h-md">${esc(txt)}</pre>`; body.scrollIntoView({ block: 'nearest' }); })
    .catch((e) => { body.innerHTML = `<div class="empty">加载失败：${esc(e && e.message || e)}</div>`; });
}
// ---- 代码树：群产物目录的真实文件树（原来是写死的假结构） ----
export const fmtSize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
export const TREE_ICON = { image: ic('image', 12, 12), video: ic('video', 12, 12), audio: ic('audio', 12, 12), doc: ic('file', 12, 12), code: ic('cpu', 12, 12), file: ic('file', 12, 12) };

// 展开的目录路径记忆：切 tab / 重渲染后保持展开状态
export const treeOpen = new Set();
export function treeNode(entry, depth) {
  const row = document.createElement('div');
  row.className = 'tnode ' + entry.type;
  row.style.paddingLeft = 6 + depth * 14 + 'px';
  if (entry.type === 'dir') {
    const isOpen = treeOpen.has(entry.path);
    row.innerHTML = `<span class="tarrow">${isOpen ? ic('chevdown', 11, 11) : ic('arrowr', 11, 11)}</span><span class="tico">${ic('folder', 12, 12)}</span><span class="tname">${esc(entry.name)}</span><span class="tsize">${(entry.children || []).length} 项</span>`;
    const kids = document.createElement('div'); kids.style.display = isOpen ? 'block' : 'none';
    (entry.children || []).forEach((ch) => kids.appendChild(treeNode(ch, depth + 1)));
    row.onclick = () => {
      const open = kids.style.display !== 'none';
      kids.style.display = open ? 'none' : 'block';
      if (open) treeOpen.delete(entry.path); else treeOpen.add(entry.path);
      row.querySelector('.tarrow').innerHTML = open ? ic('arrowr', 11, 11) : ic('chevdown', 11, 11);
    };
    const wrap = document.createElement('div'); wrap.appendChild(row); wrap.appendChild(kids);
    return wrap;
  }
  const kind = detectKind(entry.name);
  row.innerHTML = `<span class="tarrow"></span><span class="tico">${TREE_ICON[kind] || ic('file', 12, 12)}</span><span class="tname">${esc(entry.name)}</span><span class="tsize">${fmtSize(entry.size || 0)}</span>`;
  row.title = entry.path;
  row.onclick = () => openTreeFile(entry, kind);
  return row;
}

// A file in the folder may not be a registered artefact yet. Registering on
// click reuses the server's existsSync check instead of a second file route.
export async function openTreeFile(entry, kind) {
  if (!curGroupId) return;
  const conv = await api.getGroup(curGroupId);
  const hit = (conv.artifacts || []).find((a) => a.src === entry.path);
  if (hit) return openPreview(hit);
  const r = await fetch('/api/conversations/' + curGroupId + '/space', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: entry.name, kind, ownerId: 'user', colorTag: USER.color, src: entry.path }),
  });
  if (!r.ok) { toast('该文件无法打开（可能已被删除）'); return; }
  openPreview(await r.json());
}

export async function renderTree(el, g) {
  let data;
  try { data = await (await fetch('/api/conversations/' + g.id + '/tree')).json(); }
  catch { el.innerHTML = '<div class="empty">无法读取文件树</div>'; return; }
  const head = document.createElement('div'); head.className = 'tree-head';
  head.innerHTML = '<span>群产物目录</span><button class="tbtn" id="treeReveal">打开文件夹</button>';
  el.appendChild(head);
  const p = document.createElement('div'); p.className = 'tree-path'; p.textContent = data.dir || '';
  el.appendChild(p);
  if (!data.exists || !(data.entries || []).length) {
    el.insertAdjacentHTML('beforeend', '<div class="empty">该群还没有落盘文件<br/>上传产物后这里显示真实目录结构</div>');
  } else {
    const box = document.createElement('div'); box.className = 'tree';
    data.entries.forEach((e) => box.appendChild(treeNode(e, 0)));
    el.appendChild(box);
  }
  $('#treeReveal').onclick = async () => {
    try { await api.revealFolder(g.id); toast('已打开产物文件夹'); }
    catch { toast('打开文件夹失败（' + (data.dir || '未知目录') + '）'); }
  };
}

// ---- 浏览器：真的 iframe 嵌入，被拦时用后端代抓兜底 ----
export function renderBrowser(el) {
  const key = 'achat.browser.' + (curGroupId || '');
  const box = document.createElement('div'); box.className = 'browser-box';
  box.innerHTML = `<div class="browser-bar">
      <button class="bbtn" id="brBack" title="后退">${ic('arrowl', 12, 12)}</button>
      <button class="bbtn" id="brFwd" title="前进">${ic('arrowr', 12, 12)}</button>
      <button class="bbtn" id="brReload" title="刷新">${ic('refresh', 12, 12)}</button>
      <input id="brUrl" placeholder="http://127.0.0.1:3080" />
      <button class="bbtn" id="brGo">前往</button>
      <button class="bbtn" id="brText" title="后端代抓为文本">文本</button>
      <button class="bbtn" id="brOpen" title="新窗口打开">${ic('ext', 12, 12)}</button>
    </div>
    <div class="browser-note" id="brNote">输入地址查看 agent 产出的本地网页。<br/>被 <code>X-Frame-Options / CSP</code> 拦截时会白屏，点「文本」让后端代抓。</div>
    <iframe id="brFrame" class="br-frame" style="display:none"></iframe>
    <pre id="brPre" class="br-pre" style="display:none"></pre>`;
  el.appendChild(box);
  const inp = $('#brUrl'), frame = $('#brFrame'), note = $('#brNote'), pre = $('#brPre');
  const saved = localStorage.getItem(key); if (saved) inp.value = saved;
  const norm = (u) => (/^https?:\/\//i.test(u) ? u : 'http://' + u);
  const go = () => {
    const raw = inp.value.trim(); if (!raw) return;
    const u = norm(raw); inp.value = u; localStorage.setItem(key, u);
    note.style.display = 'none'; pre.style.display = 'none';
    frame.style.display = 'block'; frame.src = u;
  };
  $('#brGo').onclick = go;
  inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  $('#brOpen').onclick = () => { const u = inp.value.trim(); if (u) window.open(norm(u), '_blank'); };
  // iframe 前进/后退/刷新：跨域 iframe 访问 history/location 会被浏览器
  // 抛 SecurityError，try/catch 静默跳过（同源地址才生效）。
  $('#brBack').onclick = () => { try { frame.contentWindow.history.back(); } catch { /* cross-origin */ } };
  $('#brFwd').onclick = () => { try { frame.contentWindow.history.forward(); } catch { /* cross-origin */ } };
  $('#brReload').onclick = () => { try { frame.contentWindow.location.reload(); } catch { /* cross-origin */ } };
  $('#brText').onclick = async () => {
    const raw = inp.value.trim(); if (!raw) return;
    const u = norm(raw); inp.value = u; localStorage.setItem(key, u);
    frame.style.display = 'none'; pre.style.display = 'block'; pre.textContent = '正在抓取…';
    note.style.display = 'block'; note.textContent = '正在由后端抓取…';
    const r = await fetch('/api/fetch?url=' + encodeURIComponent(u)).then((x) => x.json()).catch((e) => ({ error: e.message }));
    if (r.error) { note.innerHTML = '抓取失败：<code>' + esc(r.error) + '</code>'; pre.style.display = 'none'; return; }
    note.style.display = 'none';
    pre.textContent = r.body.length >= 300000 ? r.body + '\n\n…内容已截断（300KB 上限）' : r.body;
  };
}
// One tile per artefact: a real thumbnail for images, a big icon otherwise.
// The full path moves into the tooltip - printing it on every tile is what
// turned the pane into a wall of wrapped text you could not scan or click.
// Image-ness is decided by kind OR extension: legacy rows can carry a wrong
// kind, and the extension never lies.
export const IMG_NAME_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i;
export const isImageArt = (a) => a.kind === 'image' || IMG_NAME_RE.test(a.name || '');
export function appendArtGrid(el, list) {
  const grid = document.createElement('div');
  grid.className = 'space-grid';
  list.forEach((it) => grid.appendChild(spaceItem(it)));
  el.appendChild(grid);
}

export function spaceItem(it) {
  const owner = it.ownerId === 'user' ? USER : (findAgent(it.ownerId) || { name: it.ownerId, colorTag: it.colorTag });
  const icon = { image: ic('image', 13, 13), video: ic('video', 13, 13), audio: ic('audio', 13, 13), doc: ic('file', 13, 13), code: ic('cpu', 13, 13), file: ic('file', 13, 13) }[it.kind] || ic('file', 13, 13);
  const div = document.createElement('div');
  div.className = 'space-item';
  div.title = `${it.name}\n${it.src || '（无路径）'}\n来自 ${owner.name}`;
  const url = api.artifactFileUrl(curGroupId, it.id);
  div.innerHTML = `<div class="thumb">${isImageArt(it)
    ? `<img src="${url}" alt="${esc(it.name)}" loading="lazy" />`
    : `<span class="ticon">${icon}</span>`}</div>
    <div class="si-name">${esc(it.name)}</div>
    <div class="si-meta"><span class="dot" style="background:${it.colorTag || '#888'}"></span>${esc(owner.name)}</div>
    <button class="act" title="更多操作">⋯</button>`;
  // A dead path must fall back to the icon, not leave a broken-image box
  // that looks like the click failed.
  const img = div.querySelector('img');
  if (img) img.onerror = () => { img.replaceWith(Object.assign(document.createElement('span'), { className: 'ticon', textContent: icon })); };
  div.onclick = () => viewArtifact(it);
  div.querySelector('.act').onclick = (e) => { e.stopPropagation(); openArtMenu(it, e.currentTarget); };
  return div;
}
// Clicking a tile previews it inside the right pane. Opening a new tab for
// every file turns the pane into a file list; previewing in place is what
// makes it a workspace.
export const TEXT_EXT = /\.(md|txt|json|js|ts|jsx|tsx|py|css|html|yaml|yml|csv|log|ini|toml|xml|sh|bat|ps1|sql)$/i;

export function viewArtifact(it) { openPreview(it); }

export async function openPreview(it) {
  const view = $('#artView');
  const url = api.artifactFileUrl(curGroupId, it.id);
  view.classList.remove('hidden');
  $('#spaceBody').classList.add('hidden');
  view.innerHTML = `<div class="av-head">
      <button class="av-back" title="返回列表">${ic('arrowl', 12, 12)}</button>
      <span class="av-name" title="${esc(it.name)}">${esc(it.name)}</span>
      <button class="av-act" title="在系统里打开">${ic('ext', 12, 12)}</button>
    </div><div class="av-body"><div class="av-load">加载中…</div></div>`;
  view.querySelector('.av-back').onclick = closePreview;
  view.querySelector('.av-act').onclick = async () => {
    try {
      await api.revealArtifact(curGroupId, it.id);
      toast('已在文件管理器打开');
    } catch { toast('打开失败：文件可能已被移动或删除'); }
  };
  const body = view.querySelector('.av-body');
  const isText = TEXT_EXT.test(it.name || '') || it.kind === 'doc' || it.kind === 'code';
  try {
    if (isImageArt(it)) {
      body.innerHTML = `<img class="av-img" src="${url}" alt="${esc(it.name)}" />`;
    } else if (it.kind === 'video') {
      body.innerHTML = `<video class="av-media" src="${url}" controls muted autoplay></video>`;
    } else if (it.kind === 'audio') {
      body.innerHTML = `<audio class="av-audio" src="${url}" controls></audio>`;
    } else if (isText) {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      // Cap the render: a 50MB log rendered into <pre> would hang the pane.
      const full = await r.text();
      const CAP = 200 * 1024;
      const t = full.length > CAP ? full.slice(0, CAP) + '\n\n…（内容过长，仅显示前 200KB）' : full;
      body.innerHTML = `<pre class="av-text">${esc(t)}</pre>`;
    } else {
      throw new Error('unsupported');
    }
  } catch {
    // URL 类产物（agent 输出的外部链接）跨域拿不到正文，给明确提示，
    // 而不是一律说「无法预览该类型」。
    const isExt = /^https?:\/\//i.test(it.src || '');
    body.innerHTML = `<div class="av-fail">${isExt ? '该产物是外部链接，无法内嵌预览' : '无法在此预览该类型'}<br/><button class="av-open">在系统里打开</button></div>`;
    body.querySelector('.av-open').onclick = async () => { await api.revealArtifact(curGroupId, it.id); };
  }
}

export function closePreview() {
  $('#artView').classList.add('hidden');
  $('#spaceBody').classList.remove('hidden');
}
// 产物操作菜单（⋯）：查看/打开文件夹/重命名/分享/发送到群聊/删除
export let curArt = null;
// 内联重命名：产物菜单里不再弹系统 prompt，改在页面上弹一个小输入框，
// 与整体 UI 风格保持一致。
export function inlineRename(current, onOk) {
  const mask = document.createElement('div');
  mask.className = 'art-rename-mask';
  mask.innerHTML = `<div class="art-rename-box">
      <div class="art-rename-title">重命名产物</div>
      <input class="art-rename-in" value="${esc(current)}" spellcheck="false" />
      <div class="art-rename-btns"><button type="button" class="art-rename-ok">确定</button><button type="button" class="art-rename-cancel">取消</button></div>
    </div>`;
  document.body.appendChild(mask);
  const inp = mask.querySelector('.art-rename-in');
  inp.focus(); inp.select();
  const done = (val) => { mask.remove(); if (val !== null && val && val.trim() && val.trim() !== current) onOk(val.trim()); };
  mask.querySelector('.art-rename-ok').onclick = () => done(inp.value);
  mask.querySelector('.art-rename-cancel').onclick = () => done(null);
  mask.onmousedown = (e) => { if (e.target === mask) done(null); };
  inp.onkeydown = (e) => { if (e.key === 'Enter') done(inp.value); if (e.key === 'Escape') done(null); };
}
export function openArtMenu(it, anchor) {
  curArt = it;
  const menu = $('#artMenu');
  menu.classList.remove('hidden');           // 先显示才能量到尺寸
  const r = anchor.getBoundingClientRect();
  let top = r.top - menu.offsetHeight - 4;
  if (top < 8) top = r.bottom + 4;
  let left = r.right - menu.offsetWidth;
  if (left < 8) left = 8;
  menu.style.top = top + 'px';
  menu.style.left = left + 'px';
}
$$('#artMenu .ctx-item').forEach((mi) => {
  mi.onclick = async () => {
    $('#artMenu').classList.add('hidden');
    const it = curArt; if (!it) return;
    const act = mi.dataset.act;
    if (act === 'view') { viewArtifact(it); }
    else if (act === 'folder') {
      try { await api.revealArtifact(curGroupId, it.id); toast('已在文件管理器打开'); }
      catch { toast('打开失败：文件可能已被移动或删除'); }
    }
    else if (act === 'rename') {
      inlineRename(it.name, async (name) => {
        await api.renameArtifact(curGroupId, it.id, name);
        const g = await api.getGroup(curGroupId); renderSpace(g);
      });
    } else if (act === 'share') {
      const url = location.origin + api.artifactFileUrl(curGroupId, it.id);
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => toast('分享链接已复制'), () => toast(url));
      else toast(url);
    } else if (act === 'send') {
      const url = location.origin + api.artifactFileUrl(curGroupId, it.id);
      await api.sendMessage(curGroupId, '产物：' + it.name + '  ' + url);
      toast('已发送到群聊');
    } else if (act === 'delete') {
      if (confirm('确认删除产物「' + it.name + '」？')) {
        await api.deleteArtifact(curGroupId, it.id);
        const g = await api.getGroup(curGroupId); renderSpace(g);
      }
    }
  };
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#artMenu') && !e.target.closest('.space-item .act')) $('#artMenu').classList.add('hidden');
});

export function detectKind(f) {
  // 代码树只传文件名（没有 MIME），必须能纯靠扩展名判断，否则图片点开变成「无法预览」。
  const t = f.type || '';
  const n = (f.name || '').toLowerCase();
  if (t.startsWith('image') || /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/.test(n)) return 'image';
  if (t.startsWith('video') || /\.(mp4|webm|mov|mkv|avi)$/.test(n)) return 'video';
  if (t.startsWith('audio') || /\.(mp3|wav|m4a|ogg|flac|aac)$/.test(n)) return 'audio';
  if (/\.(md|txt|log|csv|json|ya?ml|toml|ini|xml|sql|html?|css)$/.test(n)) return 'doc';
  if (/\.(m?jsx?|cjs|tsx?|py|sh|bat|ps1|go|rs|java|c|cpp|h)$/.test(n)) return 'code';
  return 'file';
}
// 文件读成 base64（零依赖后端无需 multipart 解析）