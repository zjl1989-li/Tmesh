// split of public/app.js (original section comment preserved below)
import { renderMembers } from './center.js';
import { $ } from './core.js';
import { startConsensus } from './modals.js';
import { curGroupId } from './state.js';

// ---------------- api (backend: fetch + SSE) ----------------
export const API = '/api';
export async function req(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    ...opts,
  });
  if (!res.ok) {
    // Callers need to tell "file not found" apart from other 4xx, so carry the
    // backend's own reason instead of only the status code.
    let reason = '';
    try { reason = (await res.json()).error || ''; } catch { /* ignore */ }
    const err = new Error(reason || `${path} -> HTTP ${res.status}`);
    err.status = res.status; err.reason = reason;
    throw err;
  }
  return res.json();
}
export const post = (path, body) => req(path, { method: 'POST', body: JSON.stringify(body || {}) });
export const patch = (path, body) => req(path, { method: 'PATCH', body: JSON.stringify(body || {}) });
export const del = (path) => req(path, { method: 'DELETE' });

// event bus fed by SSE
export const listeners = {};
export let evtSource = null;
export let curConvId = null;
export function on(ev, cb) { (listeners[ev] || (listeners[ev] = [])).push(cb); }
export function emit(ev, data) { (listeners[ev] || []).forEach((cb) => cb(data)); }

// SSE dies silently when the backend restarts (connection error, no event).
// Without a reconnect the message feed and status lights stay frozen for
// good. Reconnect with exponential backoff: 1s -> 2s -> ... cap 30s.
export function watchSse(src, back, getNext) {
  src.addEventListener('open', () => { back(1000); });
  src.onerror = () => {
    src.close();
    const delay = back();
    setTimeout(() => { try { getNext(); } catch { /* retry on next error */ } }, delay);
  };
}
export const bump = () => {
  let v = 1000;
  return (set) => { if (set) { v = set; } else { v = Math.min(v * 2, 30000); } return v; };
};

export function subscribe(convId) {
  if (evtSource) evtSource.close();
  curConvId = convId;
  const back = bump();
  const open = () => {
    evtSource = new EventSource(`${API}/conversations/${convId}/stream`);
    for (const ev of ['message', 'typing', 'tool', 'negotiation', 'stage']) {
      evtSource.addEventListener(ev, (e) => {
        let data;
        try { data = JSON.parse(e.data); } catch { return; }
        emit(ev, { groupId: data.convId || convId, ...data });
      });
    }
    watchSse(evtSource, back, () => subscribe(curConvId));
  };
  open();
}

export const api = {
  listGroups: () => req('/conversations'),
  getUsage: () => req('/usage'),
  getGroup: (id) => req('/conversations/' + id),
  createGroup: (name, memberIds = []) => post('/groups', { name, memberIds }),
  renameGroup: (id, name) => patch('/conversations/' + id, { name }),
  setGroupMembers: (id, memberIds) => patch('/conversations/' + id, { memberIds }),
  patchGroup: (id, p) => patch('/conversations/' + id, p),
  createTask: (id, p) => post('/conversations/' + id + '/tasks', p),
  taskAction: (id, tid, act, p = {}) => post('/conversations/' + id + '/tasks/' + tid + '/' + act, p),
  deliberate: (id, p) => post('/conversations/' + id + '/deliberate', p),
  delibControl: (id, action, p = {}) => post('/conversations/' + id + '/deliberation/' + action, p),
  getHistory: (id) => req('/conversations/' + id + '/history'),
  openArchive: () => post('/archive/open', {}),
  async archiveGroup(id) {
    const g = await req('/conversations/' + id);
    return patch('/conversations/' + id, { status: g.status === 'archived' ? 'active' : 'archived' });
  },
  deleteGroup: (id) => del('/conversations/' + id),
  listAgents: () => req('/agents'),
  discoverAgents: () => req('/agents/discover'),
  updateAgent: (id, p) => patch('/agents/' + id, p),
  deleteAgent: (id) => del('/agents/' + id),
  getSettings: () => req('/settings'),
  setSettings: (p) => patch('/settings', p),
  getNotice: () => req('/notice'),
  setAgentStatus: (id, status) => patch('/agents/' + id, { status }),
  createAgent: (a) => post('/agents', a),
  probeAdapter: (config, deep) => post('/agents/probe', { config, deep: !!deep }),
  launchAgent: (id) => post('/agents/' + id + '/launch'),
  stopAgent: (id) => post('/agents/' + id + '/stop'),
  abortAgent: (id) => post('/agents/' + id + '/abort'),
  addArtifact: (groupId, art) => post('/conversations/' + groupId + '/space', art),
  artifactFileUrl: (groupId, aid) => '/api/conversations/' + groupId + '/artifacts/' + aid + '/file',
  deleteArtifact: (groupId, aid) => del('/conversations/' + groupId + '/artifacts/' + aid),
  renameArtifact: (groupId, aid, name) => post('/conversations/' + groupId + '/artifacts/' + aid + '/rename', { name }),
  revealArtifact: (groupId, aid) => post('/conversations/' + groupId + '/artifacts/' + aid + '/reveal'),
  revealFolder: (groupId) => post('/conversations/' + groupId + '/space/folder/reveal'),
  openDM: (agentId) => post('/dm', { agentId }),
  sendMessage: (groupId, text, opts = {}) =>
    post('/conversations/' + groupId + '/messages', { text, toAgentId: opts.toAgentId }),
  startConsensus: (groupId, opts = {}) =>
    post('/conversations/' + groupId + '/consensus', opts),
  // 三库 (memory layer REST)
  kbSearch: (q, limit = 10) => req('/kb/search?q=' + encodeURIComponent(q) + '&limit=' + limit),
  kbRecent: (n = 12) => req('/kb/recent?n=' + n),
  kbRead: (title) => req('/kb/note?title=' + encodeURIComponent(title)),
  kbRemove: (title) => del('/kb/note?title=' + encodeURIComponent(title)),
  skillUpsert: (s) => post('/skills', s),
  skillRemove: (id) => del('/skills?id=' + encodeURIComponent(id)),
  aclGrant: (g) => post('/acl/grant', g),
  aclRevoke: (g) => post('/acl/revoke', g),
  aclAudit: () => req('/acl/audit'),
  distill: (convId, messageId) => post('/memory/distill', messageId ? { convId, messageId } : { convId }),
  plugins: () => req('/adapters/plugins'),
  // self-update
  version: () => req('/version'),
  updateCheck: () => req('/update/check'),
  updateApply: () => post('/update/apply', {}),
  updateRestart: () => post('/update/restart', {}),
  subscribe,
  on,
};
export async function setAgentStatus(id, s) { await api.setAgentStatus(id, s); if (curGroupId) renderMembers((await api.getGroup(curGroupId))); }