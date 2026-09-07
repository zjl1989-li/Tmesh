// split of public/app.js (original section comment preserved below)
import { api } from './api.js';
import { selectGroup } from './center.js';
import { $, esc, ic } from './core.js';
import { renderGroups } from './state.js';
import { refreshAgents, subscribeStatus } from './status.js';
import { initAbout, initLibPanel } from './wire.js';

// ---------------- boot ----------------
boot();
export async function boot() {
  subscribeStatus();
  await refreshAgents();
  await renderGroups();
  // Land on an existing conversation instead of an empty pane - opening the
  // app used to show three blank columns until you clicked a group.
  const list = await api.listGroups();
  if (list.length) await selectGroup(list[0].id);
  initLibPanel();
  initAbout();
  await showRecoveryNotice();
}

// A recovered crash is indistinguishable from a working app: the conversation
// list is simply empty. Without this the user concludes the data was deleted
// and starts rebuilding, while the only real clue sits in a .corrupt file.
export async function showRecoveryNotice() {
  let notice;
  try { notice = await api.getNotice(); } catch { return; }
  const r = notice && notice.recovery;
  if (!r) return;
  const bar = $('#noticeBar');
  if (!bar) return;
  bar.innerHTML =
    `<b>${ic('warn', 12, 12)} 检测到数据文件损坏，本次以空数据启动</b>` +
    `<span>${esc(r.hint || '')}${r.path ? ` 路径：<code>${esc(r.path)}</code>` : ''}` +
    ` 发生时间：${esc(String(r.at || '').replace('T', ' ').slice(0, 19))}</span>` +
    `<button id="noticeDismiss" title="知道了">×</button>`;
  bar.classList.remove('hidden');
  $('#noticeDismiss').onclick = () => bar.classList.add('hidden');
}