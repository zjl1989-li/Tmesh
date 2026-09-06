// Task dispatch engine (batch C): explicit work orders with an exclusive
// execution lock per group.
//
// The boss's rule: a local-operation job must have exactly ONE executor.
// "帮我改图标" dispatched to both DSH and WorkBuddy means one overwrites the
// other - pure waste. So tasks are explicit (the user names the executor or
// the group's default one is used), gated by the group's approval switch,
// run under a per-conv lock, and queued FIFO while the lock is held.
//
// Feedback loop: when the executor finishes, the result is announced to the
// group and the commander role gets an automatic review turn so it can plan
// the next step. The user then accepts (done) or asks for rework (a new task).
//
// Pure ESM, zero dependencies, ASCII only (content may be CJK).
import { dispatch } from './bus.mjs';
import { isRunning, abort as abortAgent } from './runtime.mjs';
import { memberWithRole } from './roles.mjs';

// convId -> boolean: re-entrancy guard for the queue pump.
const pumping = new Map();

export const TASK_STATUS = {
  pending_approval: '待审批',
  queued: '排队中',
  running: '执行中',
  review: '待验收',
  done: '已完成',
  rejected: '已拒绝',
  cancelled: '已取消',
  aborted: '已中断',
};

function sysMsg(conv, emit, persist, text, meta = {}) {
  const msg = { id: mid(), sender: 'system', text, ts: Date.now(), meta: { task: true, ...meta } };
  conv.messages.push(msg);
  persist();
  emit('message', { convId: conv.id, message: msg });
  return msg;
}

const nameOf = (agents, id) => ((agents || []).find((a) => a.id === id) || { name: id }).name;

function findTask(conv, tid) {
  return (conv.tasks || []).find((t) => t.id === tid) || null;
}

// Hard gate (boss's P0): the discuss/await-confirm stages mean the plan is
// NOT user-approved yet, and a work order is an explicit local-operation
// intent. DSH/bridge tools run inside their own processes where tmesh cannot
// intercept them - the one door we fully control is order creation, so it is
// shut here regardless of who knocks (user or commander proposal).
const STAGE_LOCKED = new Set(['discuss', 'await_confirm']);

/** Create a work order. Returns { task, error }.
 *  opts.proposedBy: commander agent id - the order becomes a PROPOSAL that
 *  always lands in pending_approval (user final approval), even in groups
 *  whose approval switch is 'after'. */
export function createTask(conv, agents, { text, executorId, proposedBy }, { emit, persist }) {
  if (STAGE_LOCKED.has(conv.stage)) {
    return { error: `当前处于「${conv.stage === 'discuss' ? '探讨' : '待确认'}」阶段（硬闸）：方案须经用户确认后才可开单` };
  }
  if (!String(text || '').trim()) return { error: '任务内容不能为空' };
  // Resolve the executor: explicit pick wins, else the group's executor role,
  // else any executor-kind member (roles.mjs fallback).
  let exec = null;
  if (executorId) {
    if (!(conv.memberIds || []).includes(executorId)) return { error: '执行 agent 不在群里' };
    exec = agents.find((a) => a.id === executorId);
  } else {
    exec = memberWithRole(conv, agents, 'executor');
  }
  if (!exec) return { error: '群里没有可执行本地操作的 agent（先在群设置里把角色设为「执行」）' };

  conv.tasks = conv.tasks || [];
  const task = {
    id: mid(),
    text: String(text).trim(),
    executorId: exec.id,
    // Commander proposals always wait for the user (final approval is the
    // user's, no matter the group's approval switch). User-created orders
    // follow the group switch as before.
    status: (!proposedBy && conv.approval === 'after') ? 'queued' : 'pending_approval',
    proposedBy: proposedBy || undefined,
    createdAt: Date.now(),
    seq: conv.tasks.length + 1,
  };
  conv.tasks.push(task);
  persist();
  const srcLine = proposedBy
    ? `来源：指挥（${nameOf(agents, proposedBy)}）提案 · 须经用户审批`
    : conv.approval === 'after' ? '本群设置为执行后验收，已进入队列。' : '等待用户审批（本群设置为执行前审批）。';
  sysMsg(conv, emit, persist, [
    `派工单 #${task.seq}：${task.text}`,
    `执行：${exec.name} · 状态：${TASK_STATUS[task.status]}`,
    srcLine,
  ].join('\n'), { taskCard: task.id, taskStatus: task.status, proposedBy: proposedBy || undefined });
  return { task };
}

// --- commander dispatch channel ----------------------------------------------
// Format (told to the commander in its frames; explicit markers only, never
// guessed):
//   【派单】修复登录超时
//   执行：DSH
// or one line: 【派单】修复登录超时 → 执行：DSH
const PROPOSE_RE = /【\s*派单\s*】\s*(.+)/g;
const EXEC_NAME_RE = /执行(?:者)?\s*[:：]\s*([^\s，,。;；]+)/;

/** Parse 【派单】 proposals out of a commander reply. Returns
 *  [{ text, executorName }] - executorName may be '' (fall back to the
 *  group's executor resolution). */
export function parseDispatchProposals(text) {
  const out = [];
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    PROPOSE_RE.lastIndex = 0;
    const m = PROPOSE_RE.exec(lines[i]);
    if (!m) continue;
    let body = m[1];
    let executorName = '';
    const em = EXEC_NAME_RE.exec(body);
    if (em) {
      executorName = em[1];
      body = body.slice(0, em.index).trim();
    } else {
      // look at the next non-empty line for a standalone 执行：name
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const t = lines[j].trim();
        if (!t) continue;
        const em2 = /^\s*执行(?:者)?\s*[:：]\s*(.+)$/.exec(t);
        if (em2) { executorName = em2[1].trim(); i = j; }
        break;
      }
    }
    body = body.replace(/[→-]+\s*$/, '').trim();
    if (body) out.push({ text: body, executorName: executorName.replace(/^@/, '') });
  }
  return out;
}

// Resolve an executor by name/id among group members (null = not found).
function resolveExecutorByName(conv, agents, name) {
  if (!name) return null;
  const n = String(name).toLowerCase();
  return (conv.memberIds || [])
    .map((id) => agents.find((a) => a.id === id))
    .find((a) => a && (String(a.name).toLowerCase() === n || a.id === n))?.id || null;
}

const MAX_PROPOSALS_PER_REPLY = 3;

/** Turn a commander reply's 【派单】 proposals into pending-approval orders.
 *  Deduped against existing pending/queued orders with the same text; a named
 *  executor outside the group kills that proposal (never silently re-route). */
export function proposeFromReply(conv, agents, reply, proposerId, { emit, persist }) {
  const props = parseDispatchProposals(reply).slice(0, MAX_PROPOSALS_PER_REPLY);
  const existing = new Set((conv.tasks || [])
    .filter((t) => ['pending_approval', 'queued', 'running'].includes(t.status))
    .map((t) => t.text));
  const created = [];
  for (const p of props) {
    if (existing.has(p.text)) continue;
    const execId = resolveExecutorByName(conv, agents, p.executorName);
    if (p.executorName && !execId) {
      sysMsg(conv, emit, persist, `指挥提案的执行者「${p.executorName}」不在群里，该派单提案未创建。`, { proposedBy: proposerId });
      continue;
    }
    const r = createTask(conv, agents, { text: p.text, executorId: execId || undefined, proposedBy: proposerId }, { emit, persist });
    if (r.task) { created.push(r.task); existing.add(r.task.text); }
  }
  return created;
}

/** Approve a pending work order -> queued -> pump. */
export function approveTask(conv, agents, tid, { emit, persist }) {
  const t = findTask(conv, tid);
  if (!t) return { error: '派工单不存在' };
  if (t.status !== 'pending_approval') return { error: `当前状态（${TASK_STATUS[t.status]}）不可审批` };
  t.status = 'queued';
  t.approvedAt = Date.now();
  persist();
  sysMsg(conv, emit, persist, `派工单 #${t.seq} 已批准，进入执行队列。`, { taskCard: t.id, taskStatus: t.status });
  pump(conv, agents, depsOf(conv));
  return { task: t };
}

/** Reject a pending order. */
export function rejectTask(conv, agents, tid, { emit, persist }) {
  const t = findTask(conv, tid);
  if (!t) return { error: '派工单不存在' };
  if (t.status !== 'pending_approval') return { error: `当前状态（${TASK_STATUS[t.status]}）不可拒绝` };
  t.status = 'rejected';
  persist();
  sysMsg(conv, emit, persist, `派工单 #${t.seq} 已被用户拒绝。`, { taskCard: t.id, taskStatus: t.status });
  return { task: t };
}

/** Cancel a queued order (running ones must be aborted instead). */
export function cancelTask(conv, agents, tid, { emit, persist }) {
  const t = findTask(conv, tid);
  if (!t) return { error: '派工单不存在' };
  if (t.status !== 'queued' && t.status !== 'pending_approval') return { error: `当前状态（${TASK_STATUS[t.status]}）不可取消` };
  t.status = 'cancelled';
  persist();
  sysMsg(conv, emit, persist, `派工单 #${t.seq} 已取消。`, { taskCard: t.id, taskStatus: t.status });
  return { task: t };
}

/** User verdict after execution: done (with optional note) or rework note. */
export function reviewTask(conv, agents, tid, { ok, note }, { emit, persist }) {
  const t = findTask(conv, tid);
  if (!t) return { error: '派工单不存在' };
  if (t.status !== 'review') return { error: `当前状态（${TASK_STATUS[t.status]}）不可验收` };
  t.status = 'done';
  t.verdict = { ok: !!ok, note: String(note || '').slice(0, 2000), at: Date.now() };
  persist();
  sysMsg(conv, emit, persist, [
    `派工单 #${t.seq} 验收${ok ? '通过' : '未通过'}。`,
    note ? `用户意见：${note}` : '',
    ok ? '' : '需要重做的部分请重新派工（可引用用户意见）。',
  ].filter(Boolean).join('\n'), { taskCard: t.id, taskStatus: t.status });
  return { task: t };
}

/** User hard-interrupt: abort the executor's in-flight turn, release the lock. */
export function abortTask(conv, agents, tid, { emit, persist }) {
  const t = findTask(conv, tid);
  if (!t) return { error: '派工单不存在' };
  if (t.status !== 'running') return { error: `当前状态（${TASK_STATUS[t.status]}）不可中断` };
  try { abortAgent(t.executorId); } catch { /* not running */ }
  t.status = 'aborted';
  t.finishedAt = Date.now();
  persist();
  sysMsg(conv, emit, persist, `派工单 #${t.seq} 已被用户中断，执行锁已释放（已完成部分保留在群里）。`, { taskCard: t.id, taskStatus: t.status });
  pump(conv, agents, depsOf(conv));
  return { task: t };
}

// Deps cache: pump needs the same callbacks across calls; store per conv so
// callers only pass them once at create/approve time.
const deps = new Map();
function depsOf(conv) { return deps.get(conv.id) || {}; }
export function setDeps(convId, d) { deps.set(convId, d); }

/**
 * Queue pump: start the next queued task if the lock is free and the executor
 * is idle. Fire-and-forget by design - callers never await it.
 */
export function pump(conv, agents, depsIn = {}) {
  if (pumping.get(conv.id)) return;
  const lockHeld = (conv.tasks || []).some((t) => t.status === 'running');
  if (lockHeld) return;
  const next = (conv.tasks || []).find((t) => t.status === 'queued');
  if (!next) return;
  if (isRunning(next.executorId)) return; // executor busy with a chat turn: wait for the next pump
  pumping.set(conv.id, true);
  runTask(conv, agents, next, depsIn).finally(() => {
    pumping.delete(conv.id);
    // chain: start the next queued order, if any
    pump(conv, agents, depsIn);
  });
}

async function runTask(conv, agents, task, depsIn) {
  const { emit = () => {}, persist = () => {}, recordTool, settings = {}, recall } = depsIn;
  const exec = agents.find((a) => a.id === task.executorId);
  if (!exec) { task.status = 'aborted'; return; }
  task.status = 'running';
  task.startedAt = Date.now();
  persist();
  sysMsg(conv, emit, persist, `派工单 #${task.seq} 开始执行（执行锁已持有，后续派工自动排队）。`, { taskCard: task.id, taskStatus: 'running' });

  const started = Date.now();
  try {
    await dispatch({
      conv, agents, toAgentId: task.executorId, emit, persist, recordTool,
      settings: { ...settings, delegation: false }, recall,
    });
  } catch (e) {
    console.error('[tasks] dispatch failed:', e.message);
  }
  // The user may have aborted (or otherwise moved) the task mid-flight - an
  // interrupted order must NOT be forced into review.
  if (task.status !== 'running') return;
  const reply = lastReplyOf(conv, task.executorId, started);
  task.finishedAt = Date.now();
  task.status = 'review';
  task.result = (reply || '').slice(0, 4000);
  persist();
  sysMsg(conv, emit, persist, [
    `派工单 #${task.seq} 执行完成，等待用户验收。`,
    reply ? `执行结果摘要：${reply.replace(/\s+/g, ' ').slice(0, 300)}` : '（执行 agent 没有返回有效内容）',
  ].join('\n'), { taskCard: task.id, taskStatus: 'review' });

  // Feedback loop, two SEPARATE lanes (boss's rule: audit quality is not the
  // commander's job, scheduling is not the reviewer's):
  //   Lane 1 (reviewer): stage quality gate - code review, security review,
  //     bug hunting on the actual deliverable.
  //   Lane 2 (commander): process retro - reads the executor's result AND the
  //     reviewer's verdict if present, then plans the next move. Never asked
  //     to audit code itself.
  const reviewer = memberWithRole(conv, agents, 'reviewer');
  let verdict = '';
  if (reviewer && reviewer.id !== task.executorId) {
    sysMsg(conv, emit, persist, [
      `[阶段审核] 派工单 #${task.seq}（${task.text}）执行完成，请审核 agent ${nameOf(agents, task.executorId)} 的产出：`,
      '',
      (reply || '（无返回内容）').slice(0, 6000),
      '',
      [
        '审核范围（按优先级）：',
        '1. 代码审核：逻辑正确性、边界条件、异常处理、可维护性；',
        '2. 安全审核：注入/越权/敏感信息泄露/依赖风险等；',
        '3. Bug 排查：能否复现、根因、修复建议；',
        '4. 与派工单要求的符合度。',
      ].join('\n'),
      '输出格式：【通过】或【不通过】+ 问题清单（每条：位置/严重度/建议）。不评审流程与调度，那是指挥的职责。',
    ].join('\n'), { taskReview: task.id, taskStatus: 'review', reviewLane: 'audit' });
    try {
      await dispatch({
        conv, agents, toAgentId: reviewer.id, emit, persist, recordTool,
        settings: { ...settings, delegation: false }, recall,
      });
      // Pick up the reviewer's latest reply so the commander retro can quote it.
      verdict = lastReplyOf(conv, reviewer.id, task.finishedAt) || '';
    } catch (e) {
      console.error('[tasks] reviewer audit failed:', e.message);
    }
  }

  const commander = memberWithRole(conv, agents, 'commander');
  if (commander && commander.id !== task.executorId) {
    sysMsg(conv, emit, persist, [
      `[指挥复盘] 执行 agent ${nameOf(agents, task.executorId)} 已完成派工单 #${task.seq}（${task.text}）。`,
      verdict ? `审核结论（供参考，调度时请考虑是否需返工）：${verdict.replace(/\s+/g, ' ').slice(0, 800)}` : '',
      '',
      '请复盘流程与进度：目标是否达成、下一步安排建议（派新单 / 退回重做 / 交付用户验收）。用户拥有最终审批权；代码与安全质量以审核 lane 的结论为准，你不需要自行审查代码。',
      '如需派新单，用【派单】提案：每条以【派单】开头写明任务，可注明「执行：成员名」。提案只是提案——须经用户审批后才会执行，你不能直接开单。',
    ].filter(Boolean).join('\n'), { taskReview: task.id, taskStatus: 'review', reviewLane: 'retro' });
    const retroStarted = Date.now();
    try {
      await dispatch({
        conv, agents, toAgentId: commander.id, emit, persist, recordTool,
        settings: { ...settings, delegation: false }, recall,
      });
      // Commander dispatch channel: explicit 【派单】 markers in the retro
      // reply become pending-approval proposals. The user is still the only
      // one who can set an order loose - this channel widens access to
      // PROPOSING, not to execution.
      proposeFromReply(conv, agents, lastReplyOf(conv, commander.id, retroStarted), commander.id, { emit, persist });
    } catch (e) {
      console.error('[tasks] commander review failed:', e.message);
    }
  }
}

function lastReplyOf(conv, agentId, sinceTs) {
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const m = conv.messages[i];
    if (m.sender === 'agent' && m.agentId === agentId && !m.error && m.ts >= (sinceTs || 0)) {
      return String(m.text || '');
    }
  }
  return '';
}

function mid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
