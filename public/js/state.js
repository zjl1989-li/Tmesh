// split of public/app.js (original section comment preserved below)
import { api, del } from './api.js';
import { resetChatPane, selectGroup } from './center.js';
import { $, esc, ic } from './core.js';
import { openGroupModal, toast } from './modals.js';

// ---------------- UI state ----------------
export let curGroupId = null;
export let curGroupData = null;
export let curTab = localStorage.getItem('zjl_space_tab') || 'overview';

// ---------------- LEFT: group list ----------------
export let groupSearch = '';
export async function renderGroups() {
  // 归档群只留在归档文件夹里，主列表不显示。
  const list = (await api.listGroups()).filter((g) => g.status !== 'archived');
  const gc = $('#groupCount'); if (gc) gc.textContent = `(${list.length})`;
  const el = $('#groupList'); el.innerHTML = '';
  const kw = groupSearch.trim().toLowerCase();
  const shown = kw ? list.filter((g) => (g.name || '').toLowerCase().includes(kw)) : list;
  if (!shown.length) {
    el.innerHTML = `<div class="empty">${kw ? '没有匹配的群' : '还没有群，点「+ 新建群」'}</div>`;
    return;
  }
  shown.forEach((g) => {
    const div = document.createElement('div');
    div.className = 'group-item' + (g.id === curGroupId ? ' active' : '') + (g.status === 'archived' ? ' archived' : '');
    const arch = g.status === 'archived' ? `<span class="garch" title="已归档">${ic('archive', 10, 10)}</span>` : '';
    div.innerHTML = `<span class="gname">${esc(g.name)}</span>${arch}
      <span class="gacts">
        <button class="gmore" title="群操作">${ic('menu', 13, 13)}</button>
      </span>`;
    // whole row selects the group; hover actions stop propagation
    div.onclick = () => selectGroup(g.id);
    div.querySelector('.gmore').onclick = (e) => { e.stopPropagation(); openGroupMenu(g, e.currentTarget); };
    el.appendChild(div);
  });
}

// collapsible group list: click the "群聊 (N)" header to fold / expand
(function bindGroupFold() {
  const head = $('#groupListHead'); if (!head) return;
  head.onclick = () => {
    const folded = document.body.classList.toggle('groups-fold');
    head.classList.toggle('collapsed', folded);
    localStorage.setItem('zjl_groups_fold', folded ? '1' : '');
  };
  if (localStorage.getItem('zjl_groups_fold')) {
    document.body.classList.add('groups-fold');
    head.classList.add('collapsed');
  }
})();

// ⋯ menu on each group row: rename / archive / delete
export function openGroupMenu(g, anchor) {
  const menu = $('#groupMenu'); menu.innerHTML = '';
  const items = [
    { icon: 'pencil', label: '重命名', act: () => openGroupModal(g.id) },
    { icon: 'archive', label: '完结归档', act: async () => {
        await api.archiveGroup(g.id);
        if (curGroupId === g.id) { curGroupId = null; resetChatPane(); }
        await renderGroups();
        toast('已归档，可点群聊旁文件夹查看');
      } },
    { icon: 'trash', label: '删除', act: async () => {
        if (confirm('确认删除群「' + g.name + '」？此操作不可撤销')) {
          await api.deleteGroup(g.id);
          if (curGroupId === g.id) { curGroupId = null; resetChatPane(); }
          await renderGroups();
        }
      } },
  ];
  items.forEach((it) => {
    const d = document.createElement('div');
    d.className = 'ctx-item' + (it.label === '删除' ? ' del' : '');
    d.innerHTML = `${ic(it.icon, 13, 13)} ${it.label}`;
    d.onclick = () => { menu.classList.add('hidden'); it.act(); };
    menu.appendChild(d);
  });
  menu.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  const mh = items.length * 36 + 12;
  let x = r.right - 160, y = r.bottom + 6;
  if (x < 8) x = 8;
  if (y + mh > window.innerHeight) y = r.top - mh - 6;
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
}


// cross-module setters (an imported ESM binding is read-only outside its home module)
export function setCurGroupId(v) { curGroupId = v; }
export function setCurGroupData(v) { curGroupData = v; }
export function setCurTab(v) { curTab = v; }
export function setGroupSearch(v) { groupSearch = v; }
